"""Accurate cached identity verifier for the three rendered local characters.

YuNet detects five facial landmarks and SFace aligns the face before creating
the 128-value identity vector.  This avoids the old fixed crop, which included
HUD text and compared different head scales.  Models are loaded once and all
reference vectors are cached in memory for the lifetime of Hive.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import cv2
import numpy as np


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


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

        self.device = "opencl" if str(device).lower() in {"gpu", "opencl"} else "cpu"
        backend_id = cv2.dnn.DNN_BACKEND_OPENCV
        target_id = cv2.dnn.DNN_TARGET_OPENCL if self.device == "opencl" else cv2.dnn.DNN_TARGET_CPU
        if self.device == "opencl":
            cv2.ocl.setUseOpenCL(True)

        self.detector = cv2.FaceDetectorYN.create(
            str(yunet), "", (320, 320), 0.55, 0.3, 5000, backend_id, target_id
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(sface), "", backend_id, target_id)
        self.reference_vectors, self.reference_paths = self._load_references()

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

    def _feature(self, image: np.ndarray) -> np.ndarray:
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
        aligned = self.recognizer.alignCrop(detection_image, face)
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

    def verify(self, image_path: Path) -> dict:
        started = time.perf_counter()
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not read {image_path}")
        vector = self._feature(image)
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
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
            "crop": "yunet-5-landmark-aligned-sface",
            "scores": scores,
            "matched_reference": matches[best],
            "backend": f"opencv-yunet+sface-{self.device}",
        }
