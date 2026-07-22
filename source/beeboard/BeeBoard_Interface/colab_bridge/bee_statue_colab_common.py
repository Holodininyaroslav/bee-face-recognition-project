from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


BRIDGE_DIR = Path(__file__).resolve().parent
INBOX_DIR = BRIDGE_DIR / "inbox"
STATUS_DIR = BRIDGE_DIR / "status"


def _load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _image_tensor(image_path: Path):
    import torch

    image = Image.open(image_path).convert("RGB").resize((224, 224))
    arr = np.asarray(image, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    return torch.from_numpy(arr).unsqueeze(0)


def _build_model(device):
    import torch
    from torch import nn

    torch.manual_seed(42)
    model = nn.Sequential(
        nn.Conv2d(3, 8, kernel_size=5, stride=2, padding=2),
        nn.ReLU(),
        nn.Conv2d(8, 16, kernel_size=3, stride=2, padding=1),
        nn.ReLU(),
        nn.AdaptiveAvgPool2d((1, 1)),
        nn.Flatten(),
        nn.Linear(16, 3),
    ).to(device)
    model.eval()
    return model


def run_colab_bridge(expected_backend: str) -> None:
    import torch

    expected_backend = expected_backend.lower()
    if expected_backend not in {"cpu", "gpu"}:
        raise ValueError("expected_backend must be cpu or gpu")

    if expected_backend == "gpu":
        if not torch.cuda.is_available():
            raise RuntimeError("GPU script requires a CUDA runtime. In Colab: Runtime -> Change runtime type -> GPU.")
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")

    inbox = INBOX_DIR / expected_backend
    status = STATUS_DIR / expected_backend
    inbox.mkdir(parents=True, exist_ok=True)
    status.mkdir(parents=True, exist_ok=True)

    manifests = sorted(inbox.glob("*.json"), key=lambda p: p.stat().st_mtime)
    if not manifests:
        print(f"No queued {expected_backend.upper()} captures in {inbox}")
        return

    model = _build_model(device)
    labels = ["bee_statue_candidate", "flight_scene", "background_or_ui"]

    for manifest_path in manifests:
        manifest = _load_manifest(manifest_path)
        backend = str(manifest.get("backend", "")).lower()
        if backend != expected_backend:
            raise RuntimeError(
                f"Backend mismatch: script={expected_backend}, manifest={backend}, file={manifest_path}"
            )

        image_path = inbox / manifest["image_file"]
        if not image_path.exists():
            raise FileNotFoundError(f"Missing image for manifest {manifest_path}: {image_path}")

        tensor = _image_tensor(image_path).to(device)
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1).detach().cpu().numpy()[0]

        best = int(np.argmax(probs))
        result = {
            "ok": True,
            "id": manifest["id"],
            "backend": expected_backend,
            "device": str(device),
            "image_file": manifest["image_file"],
            "source": manifest.get("source"),
            "channel": manifest.get("channel"),
            "prediction": labels[best],
            "confidence": float(probs[best]),
            "probabilities": {label: float(prob) for label, prob in zip(labels, probs)},
            "model": "BeeStatueNet demo classifier",
        }

        _save_json(status / f"{manifest['id']}_result.json", result)
        _save_json(status / "latest_result.json", result)

        manifest["status"] = f"processed_by_colab_{expected_backend}"
        manifest["result_path"] = str(status / f"{manifest['id']}_result.json")
        _save_json(manifest_path, manifest)

        print(f"{expected_backend.upper()} processed {manifest['id']}: {result['prediction']} ({result['confidence']:.3f})")
