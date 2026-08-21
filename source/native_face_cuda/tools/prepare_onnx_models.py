from __future__ import annotations

import argparse
from pathlib import Path

import onnx
from onnx import numpy_helper


def make_sface_dynamic(source: Path, target: Path) -> None:
    model = onnx.load(str(source))
    initializers = {item.name for item in model.graph.initializer}
    inputs = [item for item in model.graph.input if item.name not in initializers]
    del model.graph.input[:]
    model.graph.input.extend(inputs)
    for value in [*model.graph.input, *model.graph.output]:
        shape = value.type.tensor_type.shape
        if shape.dim:
            shape.dim[0].ClearField("dim_value")
            shape.dim[0].dim_param = "batch"
    onnx.save(model, str(target))


def make_yunet_dynamic(source: Path, target: Path) -> None:
    model = onnx.load(str(source))
    initializers = {item.name: item for item in model.graph.initializer}
    for name in ("290", "362", "395"):
        initializer = initializers.get(name)
        if initializer is None:
            raise RuntimeError(f"Unsupported YuNet graph: initializer {name} is missing")
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
    onnx.save(model, str(target))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-models", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    make_yunet_dynamic(
        args.source_models / "face_detection_yunet_2023mar.onnx",
        args.output / "yunet_dynamic.onnx",
    )
    make_sface_dynamic(
        args.source_models / "face_recognition_sface_2021dec.onnx",
        args.output / "sface_dynamic.onnx",
    )


if __name__ == "__main__":
    main()
