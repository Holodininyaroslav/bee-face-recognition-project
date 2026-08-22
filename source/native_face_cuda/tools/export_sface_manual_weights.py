#!/usr/bin/env python3
"""Export the trained SFace ONNX initializers for the manual CUDA runtime."""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper


MAGIC = b"SFCUDA1\0"
VERSION = 1


def export_weights(model_path: Path, output_path: Path) -> None:
    model = onnx.load(model_path)
    tensors: list[tuple[str, np.ndarray]] = []
    for initializer in model.graph.initializer:
        values = np.asarray(numpy_helper.to_array(initializer), dtype=np.float32)
        tensors.append((initializer.name, np.ascontiguousarray(values)))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as stream:
        stream.write(MAGIC)
        stream.write(struct.pack("<II", VERSION, len(tensors)))
        for name, values in tensors:
            encoded_name = name.encode("utf-8")
            stream.write(struct.pack("<I", len(encoded_name)))
            stream.write(encoded_name)
            stream.write(struct.pack("<I", values.ndim))
            for dimension in values.shape:
                stream.write(struct.pack("<Q", int(dimension)))
            stream.write(struct.pack("<Q", int(values.size)))
            stream.write(values.astype("<f4", copy=False).tobytes(order="C"))

    print(f"Exported {len(tensors)} tensors to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    export_weights(args.model, args.output)


if __name__ == "__main__":
    main()
