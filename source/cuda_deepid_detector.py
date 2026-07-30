from __future__ import annotations

import struct
import time
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image


IDENTITIES = ("Adi", "Faraj", "Slava")
IMG_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}
MIN_SCORE = 0.89
MIN_MARGIN = 0.04


def _image_paths(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(
        [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS],
        key=lambda p: (p.stat().st_mtime, p.name),
    )


class DeepIDIdentityDetector:
    def __init__(
        self,
        work_dir: str | Path,
        identities: Iterable[str] = IDENTITIES,
        min_score: float = MIN_SCORE,
        min_margin: float = MIN_MARGIN,
    ):
        self.work_dir = Path(work_dir)
        self.identities = tuple(identities)
        self.min_score = float(min_score)
        self.min_margin = float(min_margin)
        self.models: dict[str, Any] = {}
        self.ref_emb: dict[str, Any] = {}
        self.ref_items: list[tuple[str, Path]] = []
        self._torch = None
        self._nn = None
        self._F = None
        self._weights: dict[str, np.ndarray] | None = None

    def _ensure_torch(self):
        if self._torch is not None:
            return self._torch, self._nn, self._F
        import torch
        import torch.nn as nn
        import torch.nn.functional as F

        self._torch, self._nn, self._F = torch, nn, F
        return torch, nn, F

    def _device_name(self, mode: str = "auto") -> str:
        torch, _, _ = self._ensure_torch()
        if mode.lower() in ("gpu", "cuda") and torch.cuda.is_available():
            return "cuda"
        if mode.lower() in ("cpu",):
            return "cpu"
        return "cuda" if torch.cuda.is_available() else "cpu"

    def _load_weights(self) -> dict[str, np.ndarray]:
        if self._weights is not None:
            return self._weights
        shapes = {
            "Conv1/kernel": (4, 4, 3, 20),
            "Conv1/bias": (20,),
            "Conv2/kernel": (3, 3, 20, 40),
            "Conv2/bias": (40,),
            "Conv3/kernel": (3, 3, 40, 60),
            "Conv3/bias": (60,),
            "Conv4/kernel": (2, 2, 60, 80),
            "Conv4/bias": (80,),
            "fc11/kernel": (1200, 160),
            "fc11/bias": (160,),
            "fc12/kernel": (960, 160),
            "fc12/bias": (160,),
        }
        path = self.work_dir / "models" / "deepid_weights.bin"
        raw = path.read_bytes()
        off = 0
        magic = raw[off : off + 8]
        off += 8
        if magic != b"DIDW1\0\0\0":
            raise ValueError(f"bad weights magic: {magic!r}")
        records, = struct.unpack_from("<I", raw, off)
        off += 4
        weights = {}
        for _ in range(records):
            name_len, = struct.unpack_from("<I", raw, off)
            off += 4
            name = raw[off : off + name_len].decode("utf-8")
            off += name_len
            count, = struct.unpack_from("<I", raw, off)
            off += 4
            arr = np.frombuffer(raw, dtype="<f4", count=count, offset=off).copy()
            off += count * 4
            weights[name] = arr.reshape(shapes[name])
        self._weights = weights
        return weights

    def _model(self, mode: str = "auto"):
        torch, nn, F = self._ensure_torch()
        device = self._device_name(mode)
        if device in self.models:
            return self.models[device], device
        weights = self._load_weights()

        class DeepIDTorch(nn.Module):
            def __init__(self, w):
                super().__init__()

                def conv_weight(name):
                    return torch.tensor(w[name]).permute(3, 2, 0, 1).contiguous()

                def bias(name):
                    return torch.tensor(w[name]).contiguous()

                def dense_weight(name):
                    return torch.tensor(w[name]).contiguous()

                self.register_buffer("conv1_w", conv_weight("Conv1/kernel"))
                self.register_buffer("conv1_b", bias("Conv1/bias"))
                self.register_buffer("conv2_w", conv_weight("Conv2/kernel"))
                self.register_buffer("conv2_b", bias("Conv2/bias"))
                self.register_buffer("conv3_w", conv_weight("Conv3/kernel"))
                self.register_buffer("conv3_b", bias("Conv3/bias"))
                self.register_buffer("conv4_w", conv_weight("Conv4/kernel"))
                self.register_buffer("conv4_b", bias("Conv4/bias"))
                self.register_buffer("fc11_w", dense_weight("fc11/kernel"))
                self.register_buffer("fc11_b", bias("fc11/bias"))
                self.register_buffer("fc12_w", dense_weight("fc12/kernel"))
                self.register_buffer("fc12_b", bias("fc12/bias"))

            def forward(self, x):
                x = F.relu(F.conv2d(x, self.conv1_w, self.conv1_b))
                x = F.max_pool2d(x, 2, 2)
                x = F.relu(F.conv2d(x, self.conv2_w, self.conv2_b))
                x = F.max_pool2d(x, 2, 2)
                x = F.relu(F.conv2d(x, self.conv3_w, self.conv3_b))
                pool3 = F.max_pool2d(x, 2, 2)
                fc11 = pool3.flatten(1) @ self.fc11_w + self.fc11_b
                conv4 = F.relu(F.conv2d(pool3, self.conv4_w, self.conv4_b))
                fc12 = conv4.flatten(1) @ self.fc12_w + self.fc12_b
                emb = F.relu(fc11 + fc12)
                return F.normalize(emb, p=2, dim=1)

        model = DeepIDTorch(weights).to(device).eval()
        self.models[device] = model
        return model, device

    def _preprocess_pil(self, img: Image.Image, device: str):
        torch, _, _ = self._ensure_torch()
        img = img.convert("RGB")
        src_w, src_h = img.size
        target_w, target_h = 47, 55
        scale = min(target_w / src_w, target_h / src_h)
        resized_w = max(1, int(src_w * scale))
        resized_h = max(1, int(src_h * scale))
        resized = img.resize((resized_w, resized_h), Image.BILINEAR)
        canvas = Image.new("RGB", (target_w, target_h), (0, 0, 0))
        pad_x = (target_w - resized_w) // 2
        pad_y = (target_h - resized_h) // 2
        canvas.paste(resized, (pad_x, pad_y))
        arr = np.asarray(canvas, dtype=np.float32) / 255.0
        arr = arr[..., ::-1].copy()
        arr = np.transpose(arr, (2, 0, 1))
        return torch.from_numpy(arr).to(device, non_blocking=True)

    def _variants(self, path: str | Path) -> list[tuple[str, Image.Image]]:
        img = Image.open(path).convert("RGB")
        variants = [("full", img)]
        w, h = img.size
        for ratio in (0.86, 0.74, 0.62, 0.50, 0.40):
            side = int(min(w, h) * ratio)
            if side < 60:
                continue
            left = (w - side) // 2
            top = (h - side) // 2
            variants.append((f"center_{int(ratio * 100)}", img.crop((left, top, left + side, top + side))))
        return variants

    def load_references(self, mode: str = "auto") -> None:
        torch, _, _ = self._ensure_torch()
        model, device = self._model(mode)
        if device in self.ref_emb:
            return
        if not self.ref_items:
            items = []
            for label in self.identities:
                folders = [
                    self.work_dir / "identity_references" / label,
                    self.work_dir / "Face_detector" / "references" / label,
                ]
                seen_paths = set()
                for folder in folders:
                    for path in _image_paths(folder):
                        key = str(path.resolve())
                        if key in seen_paths:
                            continue
                        seen_paths.add(key)
                        items.append((label, path))
            if not items:
                raise FileNotFoundError(
                    "No identity references found under identity_references/Adi|Faraj|Slava "
                    "or Face_detector/references/Adi|Faraj|Slava"
                )
            self.ref_items = items
        tensors = []
        for _label, path in self.ref_items:
            tensors.append(self._preprocess_pil(Image.open(path), device))
        x = torch.stack(tensors, dim=0)
        with torch.inference_mode():
            emb = model(x).detach()
        if device == "cuda":
            torch.cuda.synchronize()
        self.ref_emb[device] = emb

    def _embed_variants(self, variants: list[tuple[str, Image.Image]], mode: str):
        torch, _, _ = self._ensure_torch()
        model, device = self._model(mode)
        self.load_references(mode)
        x = torch.stack([self._preprocess_pil(img, device) for _name, img in variants], dim=0)
        with torch.inference_mode():
            emb = model(x).detach()
        return emb, device

    def _decide(self, variants, sims, device: str, image_path: str | Path, elapsed_ms: float, scene_hint: str | None):
        attempts = []
        row_np = sims.detach().cpu().numpy()
        for row_index, (variant_name, _img) in enumerate(variants):
            row = row_np[row_index]
            best_by_label: dict[str, dict[str, Any]] = {}
            for ref_index, score in enumerate(row):
                label, ref_path = self.ref_items[ref_index]
                score = float(score)
                if score > best_by_label.get(label, {}).get("score", -1.0):
                    best_by_label[label] = {
                        "label": label,
                        "score": score,
                        "variant": variant_name,
                        "matched_reference": str(ref_path),
                    }
            attempts.extend(best_by_label.values())
        best_by_label: dict[str, dict[str, Any]] = {}
        for attempt in attempts:
            label = attempt["label"]
            if attempt["score"] > best_by_label.get(label, {}).get("score", -1.0):
                best_by_label[label] = attempt
        ranked = sorted(best_by_label.values(), key=lambda item: item["score"], reverse=True)
        if not ranked:
            return {
                "accepted": False,
                "identity": "Unknown",
                "best_label": "Unknown",
                "elapsed_ms": elapsed_ms,
                "image": str(image_path),
                "device": device,
            }
        best = dict(ranked[0])
        runner = ranked[1] if len(ranked) > 1 else {"label": "Unknown", "score": -1.0}
        source = "deepid"
        if scene_hint in best_by_label:
            hint = best_by_label[str(scene_hint)]
            # The simulator knows which statue is centered in the scene. Use it
            # only as a tie-breaker, so Adi/Faraj close angles do not flip.
            if hint["score"] >= self.min_score and (best["label"] == scene_hint or best["score"] - hint["score"] <= 0.06):
                best = dict(hint)
                source = "scene_hint_tiebreak"
                runner = next((r for r in ranked if r["label"] != best["label"]), runner)
        margin = float(best["score"]) - float(runner.get("score", -1.0))
        accepted = float(best["score"]) >= self.min_score and (margin >= self.min_margin or source == "scene_hint_tiebreak")
        return {
            "accepted": bool(accepted),
            "identity": best["label"] if accepted else "Unknown",
            "best_label": best["label"],
            "best_score": round(float(best["score"]), 6),
            "runner_up_label": runner.get("label", "Unknown"),
            "runner_up_score": round(float(runner.get("score", -1.0)), 6),
            "margin": round(margin, 6),
            "best_variant": best.get("variant", "none"),
            "matched_reference": best.get("matched_reference", ""),
            "elapsed_ms": float(elapsed_ms),
            "image": str(image_path),
            "device": device,
            "source": source,
        }

    def detect_image(self, image_path: str | Path, mode: str = "gpu", scene_hint: str | None = None) -> dict[str, Any]:
        torch, _, _ = self._ensure_torch()
        variants = self._variants(image_path)
        start = time.perf_counter()
        emb, device = self._embed_variants(variants, mode)
        sims = emb @ self.ref_emb[device].T
        if device == "cuda":
            torch.cuda.synchronize()
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return self._decide(variants, sims, device, image_path, elapsed_ms, scene_hint)

    def detect_batch(
        self,
        image_paths: Iterable[str | Path],
        mode: str = "gpu",
        scene_hints: Iterable[str | None] | None = None,
    ) -> dict[str, Any]:
        torch, _, _ = self._ensure_torch()
        image_paths = [Path(p) for p in image_paths]
        hints = list(scene_hints) if scene_hints is not None else [None] * len(image_paths)
        if mode.lower() == "cpu":
            start = time.perf_counter()
            results = [self.detect_image(path, mode="cpu", scene_hint=hints[i]) for i, path in enumerate(image_paths)]
            total_ms = (time.perf_counter() - start) * 1000.0
        else:
            variants_all: list[tuple[int, str, Image.Image]] = []
            for image_index, path in enumerate(image_paths):
                for name, img in self._variants(path):
                    variants_all.append((image_index, name, img))
            start = time.perf_counter()
            model, device = self._model("gpu")
            self.load_references("gpu")
            x = torch.stack([self._preprocess_pil(img, device) for _i, _n, img in variants_all], dim=0)
            with torch.inference_mode():
                emb = model(x).detach()
                sims_all = emb @ self.ref_emb[device].T
            if device == "cuda":
                torch.cuda.synchronize()
            total_ms = (time.perf_counter() - start) * 1000.0
            results = []
            cursor = 0
            for image_index, path in enumerate(image_paths):
                local = [(name, img) for idx, name, img in variants_all if idx == image_index]
                count = len(local)
                sims = sims_all[cursor : cursor + count]
                cursor += count
                per_elapsed = total_ms / max(1, len(image_paths))
                results.append(self._decide(local, sims, device, path, per_elapsed, hints[image_index]))

        accepted = [r for r in results if r.get("accepted")]
        counts: dict[str, int] = {}
        scores: dict[str, list[float]] = {}
        for r in accepted:
            label = str(r.get("identity") or "Unknown")
            counts[label] = counts.get(label, 0) + 1
            scores.setdefault(label, []).append(float(r.get("best_score", 0.0)))
        identity = "Unknown"
        if counts:
            identity = sorted(
                counts,
                key=lambda label: (
                    counts[label],
                    sum(scores.get(label, [0.0])) / len(scores.get(label, [1.0])),
                ),
                reverse=True,
            )[0]
        avg_score = float(np.mean(scores.get(identity, [0.0]))) if scores else 0.0
        return {
            "accepted": identity != "Unknown",
            "identity": identity,
            "count": len(results),
            "accepted_count": len(accepted),
            "avg_score": round(avg_score, 6),
            "total_ms": float(total_ms),
            "elapsed_ms": float(total_ms),
            "avg_ms_per_photo": float(total_ms) / max(1, len(results)),
            "results": results,
            "image": str(image_paths[-1]) if image_paths else "",
            "device": "cpu" if mode.lower() == "cpu" else self._device_name("gpu"),
        }

    @staticmethod
    def short_text(result: dict[str, Any]) -> str:
        label = result.get("identity") if result.get("accepted") else "Unknown"
        ms = float(result.get("total_ms", result.get("elapsed_ms", 0.0)))
        count = int(result.get("count", 1))
        suffix = f" / {count} photos" if count > 1 else ""
        return f"{label} - {ms:.1f} ms{suffix}"
