from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
try:
    import torch
    import torch.nn.functional as torch_functional
except Exception as exc:  # Keep the CLI error JSON-readable when PyTorch is absent.
    torch = None
    torch_functional = None
    TORCH_IMPORT_ERROR = exc
from PIL import Image


DEFAULT_LABELS = ("Adi", "Faraj", "Slava")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
EMBED_SIZE = 96
REFERENCE_CACHE_VERSION = 3
SCENE_CROP_LABELS = {
    "scene_left_face": "Faraj",
    "scene_center_face": "Slava",
    "scene_right_face": "Adi",
}


def _load_gray(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    arr = np.asarray(image)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    return gray


def _face_cascade() -> cv2.CascadeClassifier:
    local_cascade = Path(__file__).resolve().parent / "local_face_ai" / "haarcascade_frontalface_default.xml"
    cascade_path = local_cascade if local_cascade.exists() else Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(str(cascade_path))
    if cascade.empty():
        raise RuntimeError(f"OpenCV Haar cascade was not loaded: {cascade_path}")
    return cascade


def _largest_face(gray: np.ndarray, cascade: cv2.CascadeClassifier) -> tuple[int, int, int, int] | None:
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(36, 36))
    if len(faces) == 0:
        return None
    return max((tuple(map(int, face)) for face in faces), key=lambda item: item[2] * item[3])


def _all_faces(gray: np.ndarray, cascade: cv2.CascadeClassifier) -> list[tuple[int, int, int, int]]:
    faces = cascade.detectMultiScale(gray, scaleFactor=1.06, minNeighbors=3, minSize=(24, 24))
    return sorted((tuple(map(int, face)) for face in faces), key=lambda item: item[2] * item[3], reverse=True)


def _center_crop(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape[:2]
    side = max(32, int(min(h, w) * 0.82))
    x = max(0, (w - side) // 2)
    y = max(0, (h - side) // 2)
    return gray[y : y + side, x : x + side]


def _crop_face(gray: np.ndarray, cascade: cv2.CascadeClassifier) -> np.ndarray:
    face = _largest_face(gray, cascade)
    if face is None:
        return _center_crop(gray)
    x, y, w, h = face
    pad = int(max(w, h) * 0.22)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(gray.shape[1], x + w + pad)
    y1 = min(gray.shape[0], y + h + pad)
    return gray[y0:y1, x0:x1]


def _crop_rect(gray: np.ndarray, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
    h, w = gray.shape[:2]
    ix0 = max(0, min(w - 1, int(w * x0)))
    iy0 = max(0, min(h - 1, int(h * y0)))
    ix1 = max(ix0 + 32, min(w, int(w * x1)))
    iy1 = max(iy0 + 32, min(h, int(h * y1)))
    return gray[iy0:iy1, ix0:ix1]


def _query_crops(gray: np.ndarray, cascade: cv2.CascadeClassifier) -> list[tuple[str, np.ndarray]]:
    crops: list[tuple[str, np.ndarray]] = []
    for index, (x, y, w, h) in enumerate(_all_faces(gray, cascade)[:4]):
        pad = int(max(w, h) * 0.35)
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(gray.shape[1], x + w + pad)
        y1 = min(gray.shape[0], y + h + pad)
        crops.append((f"haar_face_{index}", gray[y0:y1, x0:x1]))

    # Game screenshots often contain rendered busts that Haar does not catch. These fixed
    # scene crops cover the three statue lanes in the third-person camera.
    scene_regions = (
        ("scene_left_face", 0.08, 0.10, 0.39, 0.48),
        ("scene_center_face", 0.30, 0.08, 0.70, 0.46),
        ("scene_right_face", 0.55, 0.10, 0.92, 0.48),
        ("scene_upper", 0.05, 0.05, 0.95, 0.55),
        ("scene_center", 0.20, 0.20, 0.80, 0.80),
    )
    for name, x0, y0, x1, y1 in scene_regions:
        crops.append((name, _crop_rect(gray, x0, y0, x1, y1)))

    crops.append(("largest_or_center", _crop_face(gray, cascade)))
    return crops


def _cuda_device():
    if torch is None:
        raise RuntimeError(f"PyTorch could not be imported: {TORCH_IMPORT_ERROR}")
    if not torch.cuda.is_available():
        raise RuntimeError("NVIDIA CUDA is unavailable. Install an NVIDIA driver and a CUDA-enabled PyTorch build.")
    return torch.device("cuda:0")


def _embed(gray_crop: np.ndarray, device) -> np.ndarray:
    """Build the compact embedding on CUDA; OpenCV is used only for image decoding/cropping."""
    resized = cv2.resize(gray_crop, (EMBED_SIZE, EMBED_SIZE), interpolation=cv2.INTER_AREA)
    pixels = torch.from_numpy(resized).to(device=device, dtype=torch.float32) / 255.0
    pixels = torch_functional.interpolate(
        pixels[None, None], size=(EMBED_SIZE, EMBED_SIZE), mode="bilinear", align_corners=False
    )[0, 0]

    sobel_x = torch.tensor(((-1.0, 0.0, 1.0), (-2.0, 0.0, 2.0), (-1.0, 0.0, 1.0)), device=device).view(1, 1, 3, 3)
    sobel_y = torch.tensor(((-1.0, -2.0, -1.0), (0.0, 0.0, 0.0), (1.0, 2.0, 1.0)), device=device).view(1, 1, 3, 3)
    image4d = pixels[None, None]
    gx = torch_functional.conv2d(image4d, sobel_x, padding=1)[0, 0]
    gy = torch_functional.conv2d(image4d, sobel_y, padding=1)[0, 0]
    magnitude = torch.sqrt(gx.square() + gy.square() + 1e-8)

    small = torch_functional.interpolate(pixels[None, None], size=(24, 24), mode="area").reshape(-1)
    mag_small = torch_functional.interpolate(magnitude[None, None], size=(16, 16), mode="area").reshape(-1)

    center = pixels[1:-1, 1:-1]
    lbp = torch.zeros_like(center, dtype=torch.int64)
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]
    for bit, (dy, dx) in enumerate(offsets):
        neighbor = pixels[1 + dy : 1 + dy + center.shape[0], 1 + dx : 1 + dx + center.shape[1]]
        lbp |= (neighbor >= center).to(torch.int64) << bit
    hist = torch.histc(lbp.float(), bins=64, min=0, max=256)
    hist /= hist.sum().clamp_min(1.0)

    vector = torch.cat((small, mag_small, hist))
    vector = vector - vector.mean()
    vector = vector / vector.norm().clamp_min(1e-8)
    return vector.detach().cpu().numpy().astype(np.float32)


def _cosine(a: np.ndarray, b: np.ndarray, device) -> float:
    left = torch.as_tensor(a, device=device)
    right = torch.as_tensor(b, device=device)
    return float(torch_functional.cosine_similarity(left, right, dim=0).item())


def _reference_images(reference_root: Path, labels: list[str]) -> dict[str, list[Path]]:
    refs: dict[str, list[Path]] = {}
    for label in labels:
        directory = reference_root / label
        if directory.exists():
            refs[label] = sorted(path for path in directory.rglob("*") if path.suffix.lower() in IMAGE_EXTENSIONS)
        else:
            refs[label] = []
    return refs


def _reference_signature(refs: dict[str, list[Path]]) -> str:
    rows = []
    for label in sorted(refs):
        for path in refs[label]:
            stat = path.stat()
            rows.append([label, str(path.resolve()), stat.st_size, stat.st_mtime_ns])
    payload = {"version": REFERENCE_CACHE_VERSION, "rows": rows}
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"))


def _load_reference_cache(cache_path: Path, signature: str) -> list[dict] | None:
    if not cache_path.exists():
        return None
    try:
        data = np.load(cache_path, allow_pickle=False)
        if str(data["signature"].item()) != signature:
            return None
        labels = data["labels"].astype(str).tolist()
        paths = data["paths"].astype(str).tolist()
        embeddings = data["embeddings"].astype(np.float32)
    except Exception:
        return None
    return [
        {"label": label, "path": path, "embedding": embeddings[index]}
        for index, (label, path) in enumerate(zip(labels, paths))
    ]


def _build_reference_cache(reference_root: Path, refs: dict[str, list[Path]], cascade: cv2.CascadeClassifier, signature: str, device) -> list[dict]:
    records = []
    for label, paths in refs.items():
        for ref_path in paths:
            try:
                embedding = _embed(_crop_face(_load_gray(ref_path), cascade), device)
            except Exception:
                continue
            records.append({"label": label, "path": str(ref_path), "embedding": embedding})

    cache_path = reference_root.parent / "reference_embeddings.npz"
    if records:
        labels = np.array([record["label"] for record in records], dtype="<U64")
        paths = np.array([record["path"] for record in records], dtype="<U512")
        embeddings = np.stack([record["embedding"] for record in records]).astype(np.float32)
        try:
            np.savez_compressed(
                cache_path,
                signature=np.array(signature),
                labels=labels,
                paths=paths,
                embeddings=embeddings,
            )
        except Exception:
            pass
    return records


def _reference_records(reference_root: Path, labels: list[str], cascade: cv2.CascadeClassifier, device) -> tuple[list[dict], bool]:
    refs = _reference_images(reference_root, labels)
    signature = _reference_signature(refs)
    cache_path = reference_root.parent / "reference_embeddings.npz"
    cached = _load_reference_cache(cache_path, signature)
    if cached is not None:
        return cached, True
    return _build_reference_cache(reference_root, refs, cascade, signature, device), False


def recognize(args: argparse.Namespace) -> dict:
    started = time.perf_counter()
    device = _cuda_device()
    image_path = Path(args.image).resolve()
    reference_root = Path(args.references).resolve()
    output_root = Path(args.output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    labels = [label.strip() for label in args.labels.split(",") if label.strip()]
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    run_dir = output_root / "runs" / f"{run_id}_bee_{args.bee_id if args.bee_id is not None else 'unknown'}"
    run_dir.mkdir(parents=True, exist_ok=True)

    cascade = _face_cascade()
    query_gray = _load_gray(image_path)
    query_embeddings = []
    for crop_name, crop in _query_crops(query_gray, cascade):
        try:
            query_embeddings.append((crop_name, _embed(crop, device)))
        except Exception:
            continue
    if not query_embeddings:
        query_embeddings.append(("center", _embed(_center_crop(query_gray), device)))

    attempts = []
    best_by_label: dict[str, dict] = {}
    reference_records, cache_hit = _reference_records(reference_root, labels, cascade, device)
    for label in labels:
        records = [record for record in reference_records if record["label"] == label]
        best_score = -1.0
        best_path = ""
        best_crop = ""
        for record in records:
            for crop_name, query_embedding in query_embeddings:
                expected_label = SCENE_CROP_LABELS.get(crop_name)
                if expected_label is not None and label != expected_label:
                    continue
                score = _cosine(query_embedding, record["embedding"], device)
                if score > best_score:
                    best_score = score
                    best_path = str(record["path"])
                    best_crop = crop_name
        best_by_label[label] = {"label": label, "similarity": best_score, "matched_reference": best_path, "query_crop": best_crop}
        attempts.append({"label": label, "reference": best_path, "similarity": best_score, "query_crop": best_crop})

    ranked = sorted(best_by_label.values(), key=lambda item: float(item.get("similarity", -1.0)), reverse=True)
    best = ranked[0] if ranked else {"label": "Unknown", "similarity": -1.0, "matched_reference": ""}
    second = ranked[1] if len(ranked) > 1 else {"label": "Unknown", "similarity": -1.0}
    margin = float(best["similarity"]) - float(second["similarity"])
    accepted = float(best["similarity"]) >= float(args.min_score) and margin >= float(args.min_margin)
    torch.cuda.synchronize(device)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    timestamp_iso = datetime.now().isoformat(timespec="seconds")

    result = {
        "timestamp": run_id,
        "timestamp_iso": timestamp_iso,
        "bee_id": args.bee_id,
        "input_image": str(image_path),
        "backend": "nvidia-cuda-pytorch",
        "device": str(device),
        "cuda_name": torch.cuda.get_device_name(device),
        "accepted": accepted,
        "identity": str(best["label"]) if accepted else "Unknown",
        "best_label": str(best["label"]),
        "best_score": round(float(best["similarity"]), 6),
        "runner_up_label": str(second.get("label", "Unknown")),
        "runner_up_score": round(float(second.get("similarity", -1.0)), 6),
        "margin": round(margin, 6),
        "matched_reference": best.get("matched_reference", ""),
        "query_crop": best.get("query_crop", ""),
        "elapsed_ms": elapsed_ms,
        "reference_count": len(reference_records),
        "reference_cache": "hit" if cache_hit else "rebuilt",
        "attempts": attempts,
        "run_dir": str(run_dir),
    }

    (run_dir / "identity_result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (output_root / "latest_identity_result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="NVIDIA CUDA face recognizer for the standalone bee simulation.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--bee-id", type=int, default=None)
    parser.add_argument("--faces-root", default="")
    parser.add_argument("--references", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--backend", choices=("cuda", "gpu"), default="cuda")
    parser.add_argument("--labels", default=",".join(DEFAULT_LABELS))
    parser.add_argument("--min-score", type=float, default=0.62)
    parser.add_argument("--min-margin", type=float, default=0.01)
    args, _unknown = parser.parse_known_args()

    try:
        result = recognize(args)
    except Exception as exc:
        print(json.dumps({"accepted": False, "identity": "Unknown", "best_label": "Unknown", "backend": "nvidia-cuda-pytorch", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
