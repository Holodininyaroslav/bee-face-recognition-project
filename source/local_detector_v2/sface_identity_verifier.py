"""Accurate cached identity verifier for the three rendered local characters.

YuNet detects five facial landmarks and SFace aligns the face before creating
the 128-value identity vector.  This avoids the old fixed crop, which included
HUD text and compared different head scales.  Models are loaded once and all
reference vectors are cached in memory for the lifetime of Hive.
"""

from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path

import cv2
import numpy as np


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
YUNET_OUTPUT_NAMES = [
    "cls_8", "cls_16", "cls_32",
    "obj_8", "obj_16", "obj_32",
    "bbox_8", "bbox_16", "bbox_32",
    "kps_8", "kps_16", "kps_32",
]
YUNET_STRIDES = (8, 16, 32)


class SFaceIdentityVerifier:
    def __init__(
        self,
        reference_root: Path,
        labels: tuple[str, ...] | list[str],
        model_root: Path | None = None,
        device: str = "cpu",
    ):
        self.reference_root = Path(reference_root).resolve()
        self.labels = tuple(labels)
        self.model_root = Path(model_root or Path(__file__).resolve().parent / "models").resolve()
        yunet = self.model_root / "face_detection_yunet_2023mar.onnx"
        sface = self.model_root / "face_recognition_sface_2021dec.onnx"
        if not yunet.exists() or not sface.exists():
            raise RuntimeError(f"SFace models are missing in {self.model_root}")

        requested_device = str(device).lower()
        self.device = "cuda" if requested_device == "cuda" else "opencl" if requested_device in {"gpu", "opencl"} else "cpu"
        backend_id = cv2.dnn.DNN_BACKEND_OPENCV
        target_id = cv2.dnn.DNN_TARGET_OPENCL if self.device == "opencl" else cv2.dnn.DNN_TARGET_CPU
        if self.device == "opencl":
            cv2.ocl.setUseOpenCL(True)

        self.detector = cv2.FaceDetectorYN.create(
            str(yunet), "", (320, 320), 0.55, 0.3, 5000, backend_id, target_id
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(sface), "", backend_id, target_id)
        self.reference_vectors, self.reference_paths = self._load_references()
        self.cuda_session = self._create_cuda_session(sface, use_fp16=False) if self.device == "cuda" else None
        self.cuda_large_session = self._create_cuda_session(sface, use_fp16=True) if self.device == "cuda" else None
        self.cuda_yunet_session = self._create_cuda_yunet_session(yunet, use_fp16=False) if self.device == "cuda" else None
        self.cuda_yunet_large_session = self._create_cuda_yunet_session(yunet, use_fp16=True) if self.device == "cuda" else None
        self._torch = None
        self._cuda_reference_vectors = None
        if self.device == "cuda":
            self._initialize_cuda_pipeline()

    def _initialize_cuda_pipeline(self) -> None:
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("PyTorch CUDA is unavailable")
        self._torch = torch
        self._cuda_reference_vectors = {
            label: torch.as_tensor(vectors, dtype=torch.float32, device="cuda")
            for label, vectors in self.reference_vectors.items()
        }

    def _run_ort_cuda(self, session, input_tensor, output_names: list[str] | None = None):
        """Run ONNX Runtime on CUDA while keeping every tensor on the device."""
        import onnxruntime as ort

        torch = self._torch
        if torch is None:
            raise RuntimeError("CUDA tensor runtime is not initialized")
        input_tensor = input_tensor.contiguous()
        binding = session.io_binding()
        input_value = ort.OrtValue.from_dlpack(input_tensor)
        binding.bind_ortvalue_input(session.get_inputs()[0].name, input_value)
        names = output_names or [item.name for item in session.get_outputs()]
        for name in names:
            binding.bind_output(name, "cuda", 0)
        session.run_with_iobinding(binding)
        return [torch.utils.dlpack.from_dlpack(value) for value in binding.get_outputs()]

    def _create_cuda_session(self, model_path: Path, *, use_fp16: bool):
        try:
            import torch

            torch_lib = Path(torch.__file__).resolve().parent / "lib"
            if os.name == "nt" and torch_lib.is_dir():
                self._cuda_dll_directory = os.add_dll_directory(str(torch_lib))
            import onnx
            import onnxruntime as ort
        except Exception as exc:
            raise RuntimeError(f"CUDA SFace dependencies are unavailable: {exc}") from exc

        model = onnx.load(str(model_path))
        initializers = {item.name for item in model.graph.initializer}
        real_inputs = [item for item in model.graph.input if item.name not in initializers]
        del model.graph.input[:]
        model.graph.input.extend(real_inputs)
        for value in [*model.graph.input, *model.graph.output]:
            shape = value.type.tensor_type.shape
            if not shape.dim:
                continue
            shape.dim[0].ClearField("dim_value")
            shape.dim[0].dim_param = "batch"
        if use_fp16:
            from onnxruntime.transformers.float16 import convert_float_to_float16

            model = convert_float_to_float16(model, keep_io_types=False, disable_shape_infer=True)

        options = ort.SessionOptions()
        options.log_severity_level = 3
        session = ort.InferenceSession(
            model.SerializeToString(),
            sess_options=options,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        if not session.get_providers() or session.get_providers()[0] != "CUDAExecutionProvider":
            raise RuntimeError(f"SFace did not start on CUDA: {session.get_providers()}")
        return session

    def _create_cuda_yunet_session(self, model_path: Path, *, use_fp16: bool):
        try:
            import onnx
            import onnxruntime as ort
            from onnx import numpy_helper
        except Exception as exc:
            raise RuntimeError(f"CUDA YuNet dependencies are unavailable: {exc}") from exc

        model = onnx.load(str(model_path))
        initializers = {item.name: item for item in model.graph.initializer}
        for name in ("290", "362", "395"):
            initializer = initializers.get(name)
            if initializer is None:
                raise RuntimeError(f"Unsupported YuNet graph: reshape initializer {name} is missing")
            values = numpy_helper.to_array(initializer).copy()
            values[0] = 0
            initializer.CopyFrom(numpy_helper.from_array(values, name=name))

        for value in model.graph.input:
            shape = value.type.tensor_type.shape
            for index, label in enumerate(("batch", "channels", "height", "width")):
                shape.dim[index].ClearField("dim_value")
                shape.dim[index].dim_param = label
        for value in model.graph.output:
            shape = value.type.tensor_type.shape
            shape.dim[0].ClearField("dim_value")
            shape.dim[0].dim_param = "batch"
            shape.dim[1].ClearField("dim_value")
            shape.dim[1].dim_param = "anchors"
        if use_fp16:
            from onnxruntime.transformers.float16 import convert_float_to_float16

            model = convert_float_to_float16(model, keep_io_types=False, disable_shape_infer=True)

        options = ort.SessionOptions()
        options.log_severity_level = 3
        options.enable_mem_pattern = False
        session = ort.InferenceSession(
            model.SerializeToString(),
            sess_options=options,
            providers=[
                (
                    "CUDAExecutionProvider",
                    {"arena_extend_strategy": "kSameAsRequested"},
                ),
                "CPUExecutionProvider",
            ],
        )
        if not session.get_providers() or session.get_providers()[0] != "CUDAExecutionProvider":
            raise RuntimeError(f"YuNet did not start on CUDA: {session.get_providers()}")
        return session

    def warmup_cuda_batches(self, batch_sizes: tuple[int, ...] = (1, 50, 500)) -> None:
        if self.cuda_session is None:
            return
        warmup_path = next(
            (Path(path) for label in self.labels for path in self.reference_paths.get(label, [])),
            None,
        )
        if warmup_path is None:
            raise RuntimeError("No reference image is available for CUDA warm-up")
        for batch_size in batch_sizes:
            self.verify_batch([warmup_path] * batch_size)

    def _prepare_cuda_detection_batch(
        self,
        images: list[np.ndarray],
        max_side: int,
        precision: str,
    ):
        torch = self._torch
        if torch is None:
            raise RuntimeError("CUDA tensor runtime is not initialized")
        import torch.nn.functional as functional

        prepared: list = []
        prepared_by_identity: dict[int, tuple[object, tuple[int, int]]] = {}
        content_sizes: list[tuple[int, int]] = []
        for image in images:
            cached = prepared_by_identity.get(id(image))
            if cached is not None:
                prepared.append(cached[0])
                content_sizes.append(cached[1])
                continue
            height, width = image.shape[:2]
            scale = min(1.0, float(max_side) / max(width, height))
            content_width = max(32, int(round(width * scale)))
            content_height = max(32, int(round(height * scale)))
            tensor = torch.from_numpy(np.ascontiguousarray(image)).to(device="cuda", non_blocking=False)
            tensor = tensor.permute(2, 0, 1).unsqueeze(0).float()
            if (content_width, content_height) != (width, height):
                tensor = functional.interpolate(
                    tensor,
                    size=(content_height, content_width),
                    mode="area",
                )
            prepared_tensor = tensor.squeeze(0)
            content_size = (content_width, content_height)
            prepared_by_identity[id(image)] = (prepared_tensor, content_size)
            prepared.append(prepared_tensor)
            content_sizes.append(content_size)

        batch_width = max(((item.shape[2] + 31) // 32) * 32 for item in prepared)
        batch_height = max(((item.shape[1] + 31) // 32) * 32 for item in prepared)
        padded = [
            functional.pad(item, (0, batch_width - item.shape[2], 0, batch_height - item.shape[1]))
            for item in prepared
        ]
        batch = torch.stack(padded, dim=0)
        if precision == "fp16":
            batch = batch.half()
        sizes = torch.tensor(content_sizes, dtype=torch.float32, device="cuda")
        return batch.contiguous(), sizes

    def _decode_yunet_faces_cuda(self, outputs, batch_width: int, batch_height: int, content_sizes, readable_mask):
        torch = self._torch
        if torch is None:
            raise RuntimeError("CUDA tensor runtime is not initialized")

        face_levels = []
        score_levels = []
        for level, stride in enumerate(YUNET_STRIDES):
            cols = batch_width // stride
            cls = outputs[level][..., 0].float().clamp_(0.0, 1.0)
            obj = outputs[level + 3][..., 0].float().clamp_(0.0, 1.0)
            scores = torch.sqrt(cls * obj)
            bbox = outputs[level + 6].float()
            keypoints = outputs[level + 9].float()
            anchor_count = bbox.shape[1]
            indices = torch.arange(anchor_count, dtype=torch.float32, device="cuda")
            grid_x = torch.remainder(indices, cols).view(1, -1)
            grid_y = torch.floor(indices / cols).view(1, -1)
            centre_x = (grid_x + bbox[..., 0]) * stride
            centre_y = (grid_y + bbox[..., 1]) * stride
            width = torch.exp(bbox[..., 2].clamp_(-20.0, 20.0)) * stride
            height = torch.exp(bbox[..., 3].clamp_(-20.0, 20.0)) * stride

            faces = torch.empty((bbox.shape[0], anchor_count, 15), dtype=torch.float32, device="cuda")
            faces[..., 0] = centre_x - width * 0.5
            faces[..., 1] = centre_y - height * 0.5
            faces[..., 2] = width
            faces[..., 3] = height
            for point in range(5):
                faces[..., 4 + point * 2] = (keypoints[..., point * 2] + grid_x) * stride
                faces[..., 5 + point * 2] = (keypoints[..., point * 2 + 1] + grid_y) * stride
            faces[..., 14] = scores
            face_levels.append(faces)
            score_levels.append(scores)

        faces = torch.cat(face_levels, dim=1)
        scores = torch.cat(score_levels, dim=1)
        content_width = content_sizes[:, 0:1]
        content_height = content_sizes[:, 1:2]
        centre_x = faces[..., 0] + faces[..., 2] * 0.5
        centre_y = faces[..., 1] + faces[..., 3] * 0.5
        centre_offset = (centre_x / content_width - 0.5).abs() + (centre_y / content_height - 0.43).abs()
        face_rank = faces[..., 2] * faces[..., 3] * (1.25 - centre_offset).clamp_min_(0.25)
        candidate_mask = scores >= 0.55
        face_rank = face_rank.masked_fill(~candidate_mask, -torch.inf)
        selected_indices = torch.argmax(face_rank, dim=1)
        batch_indices = torch.arange(faces.shape[0], device="cuda")
        selected_faces = faces[batch_indices, selected_indices]
        valid_mask = candidate_mask.any(dim=1) & readable_mask
        return selected_faces, valid_mask

    def _align_faces_cuda(self, images, faces, valid_mask):
        torch = self._torch
        if torch is None:
            raise RuntimeError("CUDA tensor runtime is not initialized")
        import torch.nn.functional as functional

        source = faces[:, 4:14].reshape(-1, 5, 2).float()
        destination = torch.tensor(
            [
                [38.2946, 51.6963],
                [73.5318, 51.5014],
                [56.0252, 71.7366],
                [41.5493, 92.3655],
                [70.7299, 92.2041],
            ],
            dtype=torch.float32,
            device="cuda",
        ).unsqueeze(0).expand(source.shape[0], -1, -1)
        source_mean = source.mean(dim=1, keepdim=True)
        destination_mean = torch.tensor(
            [56.0262, 71.9008], dtype=torch.float32, device="cuda"
        ).view(1, 1, 2)
        source_demean = source - source_mean
        destination_demean = destination - destination_mean
        covariance = destination_demean.transpose(1, 2) @ source_demean / 5.0
        u, singular, vh = torch.linalg.svd(covariance)
        signs = torch.ones((source.shape[0], 2), dtype=torch.float32, device="cuda")
        signs[:, 1] = torch.where(torch.linalg.det(covariance) < 0.0, -1.0, 1.0)
        rotation = u @ torch.diag_embed(signs) @ vh
        variance = source_demean.square().sum(dim=(1, 2)) / 5.0
        scale = (singular * signs).sum(dim=1) / variance.clamp_min_(1e-8)
        linear = rotation * scale.view(-1, 1, 1)
        translation = destination_mean.squeeze(1) - (linear @ source_mean.transpose(1, 2)).squeeze(2)

        inverse_linear = torch.linalg.inv(linear)
        inverse_translation = -(inverse_linear @ translation.unsqueeze(2)).squeeze(2)
        axis = torch.arange(112, dtype=torch.float32, device="cuda")
        y, x = torch.meshgrid(axis, axis, indexing="ij")
        target = torch.stack((x, y), dim=-1).reshape(1, -1, 2).expand(source.shape[0], -1, -1)
        source_coordinates = target @ inverse_linear.transpose(1, 2) + inverse_translation.unsqueeze(1)
        source_x = source_coordinates[..., 0]
        source_y = source_coordinates[..., 1]
        grid = torch.stack(
            (
                source_x * (2.0 / max(1, images.shape[3] - 1)) - 1.0,
                source_y * (2.0 / max(1, images.shape[2] - 1)) - 1.0,
            ),
            dim=-1,
        ).reshape(-1, 112, 112, 2)
        aligned = functional.grid_sample(
            images.float(),
            grid,
            mode="bilinear",
            padding_mode="zeros",
            align_corners=True,
        )
        aligned = aligned * valid_mask.view(-1, 1, 1, 1)
        return aligned[:, [2, 1, 0]].contiguous()

    def _score_vectors_cuda(self, vectors):
        torch = self._torch
        references = self._cuda_reference_vectors
        if torch is None or references is None:
            raise RuntimeError("CUDA reference vectors are not initialized")
        import torch.nn.functional as functional

        normalized = functional.normalize(vectors.float(), dim=1)
        label_scores = []
        label_matches = []
        for label in self.labels:
            similarities = normalized @ references[label].transpose(0, 1)
            scores, indices = similarities.max(dim=1)
            label_scores.append(scores)
            label_matches.append(indices)
        return torch.stack(label_scores, dim=1), torch.stack(label_matches, dim=1)

    @staticmethod
    def _pad_to_detection_batch(images: list[np.ndarray], max_side: int = 384) -> tuple[list[np.ndarray], list[tuple[int, int]]]:
        resized: list[np.ndarray] = []
        content_sizes: list[tuple[int, int]] = []
        for image in images:
            height, width = image.shape[:2]
            scale = min(1.0, float(max_side) / max(width, height))
            content_width = max(32, int(round(width * scale)))
            content_height = max(32, int(round(height * scale)))
            prepared = image
            if (content_width, content_height) != (width, height):
                prepared = cv2.resize(image, (content_width, content_height), interpolation=cv2.INTER_AREA)
            resized.append(prepared)
            content_sizes.append((content_width, content_height))

        batch_width = max(((image.shape[1] + 31) // 32) * 32 for image in resized)
        batch_height = max(((image.shape[0] + 31) // 32) * 32 for image in resized)
        padded = [
            cv2.copyMakeBorder(
                image,
                0,
                batch_height - image.shape[0],
                0,
                batch_width - image.shape[1],
                cv2.BORDER_CONSTANT,
                value=(0, 0, 0),
            )
            for image in resized
        ]
        return padded, content_sizes

    @staticmethod
    def _decode_yunet_face(
        outputs: list[np.ndarray],
        batch_index: int,
        batch_width: int,
        batch_height: int,
        content_width: int,
        content_height: int,
    ) -> np.ndarray:
        candidates: list[np.ndarray] = []
        for level, stride in enumerate(YUNET_STRIDES):
            cols = batch_width // stride
            rows = batch_height // stride
            cls = np.clip(outputs[level][batch_index, :, 0].astype(np.float32), 0.0, 1.0)
            obj = np.clip(outputs[level + 3][batch_index, :, 0].astype(np.float32), 0.0, 1.0)
            scores = np.sqrt(cls * obj)
            indices = np.flatnonzero(scores >= 0.55)
            if not len(indices):
                continue

            bbox = outputs[level + 6][batch_index, indices].astype(np.float32)
            keypoints = outputs[level + 9][batch_index, indices].astype(np.float32)
            grid_x = (indices % cols).astype(np.float32)
            grid_y = (indices // cols).astype(np.float32)
            centre_x = (grid_x + bbox[:, 0]) * stride
            centre_y = (grid_y + bbox[:, 1]) * stride
            width = np.exp(bbox[:, 2]) * stride
            height = np.exp(bbox[:, 3]) * stride

            faces = np.empty((len(indices), 15), dtype=np.float32)
            faces[:, 0] = centre_x - width * 0.5
            faces[:, 1] = centre_y - height * 0.5
            faces[:, 2] = width
            faces[:, 3] = height
            for point in range(5):
                faces[:, 4 + point * 2] = (keypoints[:, point * 2] + grid_x) * stride
                faces[:, 5 + point * 2] = (keypoints[:, point * 2 + 1] + grid_y) * stride
            faces[:, 14] = scores[indices]
            candidates.append(faces)

        if not candidates:
            raise RuntimeError("YuNet did not find a face")
        faces = np.concatenate(candidates, axis=0)
        keep = cv2.dnn.NMSBoxes(
            faces[:, :4].tolist(),
            faces[:, 14].tolist(),
            0.55,
            0.3,
            top_k=5000,
        )
        if keep is None or not len(keep):
            raise RuntimeError("YuNet did not find a face")
        faces = faces[np.asarray(keep).reshape(-1)]

        def face_score(row: np.ndarray) -> float:
            x, y, width, height = (float(value) for value in row[:4])
            centre_x = x + width * 0.5
            centre_y = y + height * 0.5
            centre_offset = abs(centre_x / content_width - 0.5) + abs(centre_y / content_height - 0.43)
            return width * height * max(0.25, 1.25 - centre_offset)

        return max(faces, key=face_score)

    def _paths(self) -> list[tuple[str, Path]]:
        rows: list[tuple[str, Path]] = []
        for label in self.labels:
            folder = self.reference_root / label
            rows.extend(
                (label, path)
                for path in sorted(folder.rglob("*"))
                if path.suffix.lower() in IMAGE_EXTENSIONS
            )
        return rows

    def _signature(self, rows: list[tuple[str, Path]]) -> str:
        digest = hashlib.sha256(b"sface-reference-cache-v1")
        for label, path in rows:
            stat = path.stat()
            digest.update(label.encode("utf-8"))
            digest.update(str(path.resolve()).encode("utf-8"))
            digest.update(str(stat.st_size).encode("ascii"))
            digest.update(str(stat.st_mtime_ns).encode("ascii"))
        return digest.hexdigest()

    def _aligned_face(self, image: np.ndarray) -> np.ndarray:
        height, width = image.shape[:2]
        # YuNet's work scales with the input area.  Game faces are large, so a
        # 384-pixel detection frame preserves landmarks while avoiding a slow
        # full-window pass.  SFace still receives YuNet's aligned 112x112 crop.
        scale = min(1.0, 384.0 / max(width, height))
        detection_image = image
        if scale < 1.0:
            detection_image = cv2.resize(
                image,
                (max(32, int(round(width * scale))), max(32, int(round(height * scale)))),
                interpolation=cv2.INTER_AREA,
            )
        detect_height, detect_width = detection_image.shape[:2]
        self.detector.setInputSize((detect_width, detect_height))
        _retval, faces = self.detector.detect(detection_image)
        if faces is None or not len(faces):
            raise RuntimeError("YuNet did not find a face")

        # The photographed statue is the large face nearest the image centre.
        def face_score(row: np.ndarray) -> float:
            x, y, w, h = (float(value) for value in row[:4])
            cx, cy = x + w * 0.5, y + h * 0.5
            centre = abs(cx / detect_width - 0.5) + abs(cy / detect_height - 0.43)
            return w * h * max(0.25, 1.25 - centre)

        face = max(faces, key=face_score)
        return self.recognizer.alignCrop(detection_image, face)

    def _feature(self, image: np.ndarray) -> np.ndarray:
        aligned = self._aligned_face(image)
        vector = self.recognizer.feature(aligned).reshape(-1).astype(np.float32)
        norm = float(np.linalg.norm(vector))
        if norm <= 1e-8:
            raise RuntimeError("SFace returned an empty identity vector")
        return vector / norm

    def _load_references(self) -> tuple[dict[str, np.ndarray], dict[str, list[str]]]:
        rows = self._paths()
        signature = self._signature(rows)
        cache_key = hashlib.sha256(str(self.reference_root).encode("utf-8")).hexdigest()[:12]
        cache_path = self.model_root / f"sface_reference_embeddings_{cache_key}.npz"
        vectors_by_label: dict[str, list[np.ndarray]] = {label: [] for label in self.labels}
        paths_by_label: dict[str, list[str]] = {label: [] for label in self.labels}

        if cache_path.exists():
            try:
                data = np.load(cache_path, allow_pickle=False)
                if str(data["signature"].item()) == signature:
                    labels = data["labels"].astype(str).tolist()
                    paths = data["paths"].astype(str).tolist()
                    vectors = data["vectors"].astype(np.float32)
                    for label, path, vector in zip(labels, paths, vectors):
                        vectors_by_label[label].append(vector)
                        paths_by_label[label].append(path)
                    return (
                        {label: np.stack(vectors_by_label[label]) for label in self.labels},
                        paths_by_label,
                    )
            except Exception:
                pass

        cache_labels: list[str] = []
        cache_paths: list[str] = []
        cache_vectors: list[np.ndarray] = []
        for label, path in rows:
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                continue
            try:
                vector = self._feature(image)
            except RuntimeError:
                # Extreme rear angles may legitimately have no visible face.
                continue
            vectors_by_label[label].append(vector)
            paths_by_label[label].append(str(path))
            cache_labels.append(label)
            cache_paths.append(str(path))
            cache_vectors.append(vector)

        missing = [label for label in self.labels if not vectors_by_label[label]]
        if missing:
            raise RuntimeError(f"No SFace references for: {', '.join(missing)}")
        try:
            np.savez_compressed(
                cache_path,
                signature=np.array(signature),
                labels=np.asarray(cache_labels, dtype="<U32"),
                paths=np.asarray(cache_paths, dtype="<U512"),
                vectors=np.stack(cache_vectors).astype(np.float32),
            )
        except OSError:
            pass
        return (
            {label: np.stack(vectors_by_label[label]) for label in self.labels},
            paths_by_label,
        )

    def _score_vector(self, vector: np.ndarray, elapsed_ms: float, backend: str) -> dict:
        vector = vector.reshape(-1).astype(np.float32)
        norm = float(np.linalg.norm(vector))
        if norm <= 1e-8:
            raise RuntimeError("SFace returned an empty identity vector")
        vector /= norm
        scores: dict[str, float] = {}
        matches: dict[str, str] = {}
        for label in self.labels:
            similarities = self.reference_vectors[label] @ vector
            index = int(np.argmax(similarities))
            scores[label] = float(similarities[index])
            matches[label] = self.reference_paths[label][index]

        ranked = sorted(scores, key=scores.get, reverse=True)
        best, runner_up = ranked[0], ranked[1]
        return {
            "label": best,
            "score": scores[best],
            "runner_up_label": runner_up,
            "runner_up_score": scores[runner_up],
            "margin": scores[best] - scores[runner_up],
            "elapsed_ms": elapsed_ms,
            "crop": "yunet-5-landmark-aligned-sface",
            "scores": scores,
            "matched_reference": matches[best],
            "backend": backend,
        }

    def verify(self, image_path: Path) -> dict:
        started = time.perf_counter()
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not read {image_path}")
        vector = self._feature(image)
        return self._score_vector(
            vector,
            (time.perf_counter() - started) * 1000.0,
            f"opencv-yunet+sface-{self.device}",
        )

    def verify_batch(self, image_paths: list[Path]) -> dict:
        if self.cuda_session is None or self.cuda_yunet_session is None:
            raise RuntimeError("CUDA YuNet/SFace batch sessions are not initialized")
        if not image_paths:
            return {
                "results": [],
                "attempt_count": 0,
                "gpu_detection_count": 0,
                "gpu_inference_count": 0,
                "valid_face_count": 0,
                "elapsed_ms": 0.0,
            }

        torch = self._torch
        if torch is None:
            raise RuntimeError("CUDA tensor runtime is not initialized")
        started = time.perf_counter()
        results: list[dict | None] = [None] * len(image_paths)
        source_images: list[np.ndarray] = []
        readable_flags: list[bool] = []
        decoded_images: dict[Path, np.ndarray | None] = {}
        fallback_shape = (256, 384, 3)
        for index, image_path in enumerate(image_paths):
            resolved_path = Path(image_path).resolve()
            if resolved_path not in decoded_images:
                decoded_images[resolved_path] = cv2.imread(str(resolved_path), cv2.IMREAD_COLOR)
            image = decoded_images[resolved_path]
            readable = image is not None
            readable_flags.append(readable)
            if not readable:
                results[index] = {"error": f"Could not read {image_path}", "detection_miss": False}
                image = np.zeros(fallback_shape, dtype=np.uint8)
            else:
                fallback_shape = image.shape
            source_images.append(image)
        read_ms = (time.perf_counter() - started) * 1000.0

        precision = "fp16" if len(image_paths) >= 100 else "fp32"
        prepare_started = time.perf_counter()
        detection_images, content_sizes = self._prepare_cuda_detection_batch(
            source_images,
            max_side=192,
            precision=precision,
        )
        readable_mask = torch.tensor(readable_flags, dtype=torch.bool, device="cuda")
        torch.cuda.synchronize()
        gpu_prepare_ms = (time.perf_counter() - prepare_started) * 1000.0
        batch_height, batch_width = detection_images.shape[2:]

        yunet_session = self.cuda_yunet_large_session if len(image_paths) >= 100 else self.cuda_yunet_session
        assert yunet_session is not None
        yunet_started = time.perf_counter()
        yunet_outputs = self._run_ort_cuda(yunet_session, detection_images, YUNET_OUTPUT_NAMES)
        torch.cuda.synchronize()
        yunet_inference_ms = (time.perf_counter() - yunet_started) * 1000.0

        decode_started = time.perf_counter()
        selected_faces, valid_mask = self._decode_yunet_faces_cuda(
            yunet_outputs,
            batch_width,
            batch_height,
            content_sizes,
            readable_mask,
        )
        torch.cuda.synchronize()
        yunet_postprocess_ms = (time.perf_counter() - decode_started) * 1000.0
        del yunet_outputs

        align_started = time.perf_counter()
        aligned_faces = self._align_faces_cuda(detection_images, selected_faces, valid_mask)
        if precision == "fp16":
            aligned_faces = aligned_faces.half()
        torch.cuda.synchronize()
        gpu_align_ms = (time.perf_counter() - align_started) * 1000.0
        del detection_images, selected_faces

        session = self.cuda_large_session if len(image_paths) >= 100 else self.cuda_session
        assert session is not None
        sface_started = time.perf_counter()
        vectors = self._run_ort_cuda(session, aligned_faces)[0]
        torch.cuda.synchronize()
        sface_inference_ms = (time.perf_counter() - sface_started) * 1000.0
        del aligned_faces

        score_started = time.perf_counter()
        score_matrix, match_matrix = self._score_vectors_cuda(vectors)
        torch.cuda.synchronize()
        gpu_score_ms = (time.perf_counter() - score_started) * 1000.0
        valid_flags = valid_mask.cpu().tolist()
        score_values = score_matrix.cpu().numpy()
        match_values = match_matrix.cpu().numpy()
        del vectors, score_matrix, match_matrix, valid_mask

        finalize_started = time.perf_counter()
        shared_elapsed = sface_inference_ms / max(1, len(image_paths))
        for index, valid in enumerate(valid_flags):
            if not valid:
                if results[index] is None:
                    results[index] = {"error": "YuNet did not find a face", "detection_miss": True}
                continue
            scores = {label: float(score_values[index, label_index]) for label_index, label in enumerate(self.labels)}
            ranked = sorted(scores, key=scores.get, reverse=True)
            best, runner_up = ranked[0], ranked[1]
            best_label_index = self.labels.index(best)
            reference_index = int(match_values[index, best_label_index])
            results[index] = {
                "label": best,
                "score": scores[best],
                "runner_up_label": runner_up,
                "runner_up_score": scores[runner_up],
                "margin": scores[best] - scores[runner_up],
                "elapsed_ms": shared_elapsed,
                "crop": "yunet-5-landmark-aligned-sface-cuda",
                "scores": scores,
                "matched_reference": self.reference_paths[best][reference_index],
                "backend": "onnxruntime-cuda-yunet+align+sface",
            }
        host_finalize_ms = (time.perf_counter() - finalize_started) * 1000.0
        gpu_total_ms = (
            gpu_prepare_ms
            + yunet_inference_ms
            + yunet_postprocess_ms
            + gpu_align_ms
            + sface_inference_ms
            + gpu_score_ms
        )

        return {
            "results": [item or {"error": "SFace produced no result", "detection_miss": False} for item in results],
            "attempt_count": len(image_paths),
            "gpu_detection_count": len(image_paths),
            "gpu_inference_count": len(image_paths),
            "valid_face_count": sum(valid_flags),
            "decoded_image_count": len(decoded_images),
            "image_read_ms": read_ms,
            "yunet_blob_ms": gpu_prepare_ms,
            "yunet_inference_ms": yunet_inference_ms,
            "yunet_postprocess_ms": yunet_postprocess_ms,
            "face_preprocess_ms": read_ms + gpu_prepare_ms + yunet_postprocess_ms + gpu_align_ms,
            "blob_preprocess_ms": gpu_align_ms,
            "sface_inference_ms": sface_inference_ms,
            "gpu_inference_ms": sface_inference_ms,
            "gpu_prepare_ms": gpu_prepare_ms,
            "gpu_decode_ms": yunet_postprocess_ms,
            "gpu_align_ms": gpu_align_ms,
            "gpu_score_ms": gpu_score_ms,
            "host_finalize_ms": host_finalize_ms,
            "gpu_total_ms": gpu_total_ms,
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
            "provider": session.get_providers()[0],
            "detector_provider": yunet_session.get_providers()[0],
            "precision": precision,
            "pipeline": "cuda-resize+yunet+decode+align+sface+score",
            "cpu_intermediate_count": 0,
        }
