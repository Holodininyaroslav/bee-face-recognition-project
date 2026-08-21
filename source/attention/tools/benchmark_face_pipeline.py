#!/usr/bin/env python3
"""Controlled CPU/CUDA benchmark for the supplementary face-recognition demo."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import statistics
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def collect_images(root: Path, limit: int) -> list[Path]:
    label_groups = []
    for directory in sorted(path for path in root.iterdir() if path.is_dir()):
        images = sorted(
            path for path in directory.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        )
        if images:
            label_groups.append(images)

    selected: list[Path] = []
    if label_groups:
        offset = 0
        while len(selected) < limit:
            added = False
            for group in label_groups:
                if offset < len(group):
                    selected.append(group[offset])
                    added = True
                    if len(selected) == limit:
                        break
            if not added:
                break
            offset += 1
    else:
        selected = sorted(
            path for path in root.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        )[:limit]

    if len(selected) < limit:
        raise RuntimeError(f"Requested {limit} images, but only {len(selected)} were found in {root}")
    return selected


def percentile_95(values: list[float]) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1)))))
    return ordered[index]


def labels_from_response(response: dict) -> list[str]:
    raw_results = response.get("results", response.get("batch_results", []))
    labels = []
    for result in raw_results if isinstance(raw_results, list) else []:
        if not isinstance(result, dict):
            labels.append("Invalid")
            continue
        labels.append(str(
            result.get("identity")
            or result.get("best_label")
            or result.get("label")
            or "Unknown"
        ))
    return labels


def post_batch(
    hive_url: str,
    mode: str,
    encoded_images: list[str],
    repeat_each: int,
    timeout: int,
) -> tuple[dict, float]:
    params = urlencode({
        "mode": mode,
        "processor_id": 0,
        "source": "submission-controlled-benchmark",
        "repeat_each": repeat_each,
        "parallel_group_size": 0,
    })
    body = json.dumps({
        "images": encoded_images,
        "scene_hints": [""] * len(encoded_images),
        "repeat_each": repeat_each,
        "parallel_group_size": 0,
    }).encode("utf-8")
    request = Request(
        f"{hive_url.rstrip('/')}/api/detect-batch?{params}",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace") or "{}")
    wall_ms = (time.perf_counter() - started) * 1000.0
    if not isinstance(payload, dict):
        raise RuntimeError("Hive returned a non-object response")
    if payload.get("error"):
        raise RuntimeError(f"Hive {mode} error: {payload['error']}")
    return payload, wall_ms


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", type=Path, required=True, help="Directory containing fixed test images")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--repeat-each", type=int, default=1)
    parser.add_argument("--hive-url", default="http://127.0.0.1:8890")
    parser.add_argument("--output-dir", type=Path, default=Path("results/face-pipeline"))
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if args.count <= 0 or args.runs <= 0 or args.repeat_each <= 0 or args.warmup < 0:
        parser.error("count, runs and repeat-each must be positive; warmup cannot be negative")

    image_paths = collect_images(args.images.resolve(), args.count)
    encoded_images = [base64.b64encode(path.read_bytes()).decode("ascii") for path in image_paths]
    manifest = [
        {
            "index": index,
            "file": str(path.relative_to(args.images.resolve())),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        for index, path in enumerate(image_paths)
    ]
    manifest_hash = hashlib.sha256(
        "".join(item["sha256"] for item in manifest).encode("ascii")
    ).hexdigest()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "face-benchmark-manifest.json").write_text(
        json.dumps({"manifest_sha256": manifest_hash, "images": manifest}, indent=2),
        encoding="utf-8",
    )

    physical_attempts = len(image_paths) * args.repeat_each
    print(
        f"Fixed dataset: {len(image_paths)} images x {args.repeat_each} "
        f"= {physical_attempts} physical attempts, manifest={manifest_hash}"
    )
    for _ in range(args.warmup):
        for mode in ("CPU", "CUDA"):
            post_batch(args.hive_url, mode, encoded_images, args.repeat_each, args.timeout)

    rows: list[dict] = []
    labels_by_run: dict[tuple[int, str], list[str]] = {}
    for run_index in range(1, args.runs + 1):
        modes = ("CPU", "CUDA") if run_index % 2 else ("CUDA", "CPU")
        for mode in modes:
            payload, wall_ms = post_batch(
                args.hive_url, mode, encoded_images, args.repeat_each, args.timeout
            )
            labels = labels_from_response(payload)
            labels_by_run[(run_index, mode)] = labels
            signature = hashlib.sha256(json.dumps(labels).encode("utf-8")).hexdigest()
            completed_attempts = int(
                payload.get("physical_attempt_count", payload.get("processing_passes", len(labels))) or 0
            )
            if completed_attempts != physical_attempts:
                raise RuntimeError(
                    f"Hive {mode} completed {completed_attempts} attempts; expected {physical_attempts}"
                )
            row = {
                "run": run_index,
                "mode": mode,
                "images": len(image_paths),
                "repeat_each": args.repeat_each,
                "requested_physical_attempts": physical_attempts,
                "manifest_sha256": manifest_hash,
                "wall_ms": wall_ms,
                "pipeline_ms": float(payload.get("batch_elapsed_ms", payload.get("elapsed_ms", 0.0)) or 0.0),
                "completed": int(payload.get("batch_completed", len(labels)) or 0),
                "attempts": completed_attempts,
                "accepted": int(payload.get("accepted_count", 0) or 0),
                "missed": int(payload.get("missed_count", 0) or 0),
                "errors": int(payload.get("batch_errors", 0) or 0),
                "result_signature": signature,
                "cuda_microbatch_size": int(payload.get("cuda_microbatch_size", 0) or 0),
                "cuda_microbatch_count": int(payload.get("cuda_microbatch_count", 0) or 0),
                "effective_parallel_images": float(payload.get("effective_parallel_images", 0.0) or 0.0),
            }
            rows.append(row)
            print(
                f"run={run_index:02d} mode={mode:4s} wall={wall_ms:.1f} ms "
                f"completed={row['completed']} errors={row['errors']}"
            )

    for row in rows:
        other_mode = "CUDA" if row["mode"] == "CPU" else "CPU"
        peer = labels_by_run.get((row["run"], other_mode), [])
        current = labels_by_run.get((row["run"], row["mode"]), [])
        matches = sum(left == right for left, right in zip(current, peer))
        row["cpu_cuda_label_agreement"] = matches / max(1, len(image_paths))

    csv_path = args.output_dir / "face-pipeline-runs.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    summary: dict[str, dict] = {}
    for mode in ("CPU", "CUDA"):
        selected = [row for row in rows if row["mode"] == mode]
        times = [float(row["wall_ms"]) for row in selected]
        summary[mode] = {
            "runs": len(selected),
            "mean_wall_ms": statistics.fmean(times),
            "median_wall_ms": statistics.median(times),
            "p95_wall_ms": percentile_95(times),
            "min_wall_ms": min(times),
            "max_wall_ms": max(times),
            "mean_throughput_attempts_per_second": physical_attempts * 1000.0 / statistics.fmean(times),
            "mean_label_agreement": statistics.fmean(
                float(row["cpu_cuda_label_agreement"]) for row in selected
            ),
        }
    summary["comparison"] = {
        "speedup_mean_wall": summary["CPU"]["mean_wall_ms"] / summary["CUDA"]["mean_wall_ms"],
        "speedup_median_wall": summary["CPU"]["median_wall_ms"] / summary["CUDA"]["median_wall_ms"],
        "same_fixed_manifest": True,
        "source_images": len(image_paths),
        "repeat_each": args.repeat_each,
        "requested_physical_attempts": physical_attempts,
        "manifest_sha256": manifest_hash,
    }
    summary_path = args.output_dir / "face-pipeline-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"CSV: {csv_path.resolve()}")
    print(f"Summary: {summary_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
