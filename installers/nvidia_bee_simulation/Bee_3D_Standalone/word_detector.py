from __future__ import annotations

import re
import time
import argparse
import json
from pathlib import Path
from threading import Lock
from typing import Any


_ENGINE: Any | None = None
_ENGINE_LOCK = Lock()


def _engine() -> Any:
    global _ENGINE
    if _ENGINE is None:
        with _ENGINE_LOCK:
            if _ENGINE is None:
                from rapidocr_onnxruntime import RapidOCR

                _ENGINE = RapidOCR()
    return _ENGINE


def _clean_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


def warm_word_detector() -> bool:
    try:
        _engine()
        return True
    except Exception as exc:
        print(f"Word detector warmup failed: {exc}")
        return False


def recognize_words(image_path: Path, min_score: float = 0.55, max_words: int = 32) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        result, engine_elapsed = _engine()(str(image_path))
    except Exception as exc:
        return {
            "accepted": False,
            "words": [],
            "text": "",
            "best_word": "",
            "best_score": -1.0,
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
            "engine_elapsed": [],
            "engine": "rapidocr-onnxruntime",
            "error": str(exc),
        }

    words: list[dict[str, Any]] = []
    if result:
        for item in result:
            if len(item) < 3:
                continue
            box, text, score = item[0], _clean_text(str(item[1])), float(item[2])
            if not text or score < min_score:
                continue
            words.append({"text": text, "score": score, "box": box})

    words.sort(key=lambda item: float(item["score"]), reverse=True)
    words = words[:max_words]
    best = words[0] if words else {"text": "", "score": -1.0}
    text_line = " | ".join(str(item["text"]) for item in words)
    return {
        "accepted": bool(words),
        "words": words,
        "text": text_line,
        "best_word": str(best["text"]),
        "best_score": float(best["score"]),
        "elapsed_ms": (time.perf_counter() - started) * 1000.0,
        "engine_elapsed": engine_elapsed,
        "engine": "rapidocr-onnxruntime",
        "error": "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Recognize words in a screenshot with RapidOCR.")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--warm", action="store_true")
    parser.add_argument("--min-score", type=float, default=0.55)
    parser.add_argument("--max-words", type=int, default=32)
    args = parser.parse_args()

    if args.warm:
        payload = {"accepted": warm_word_detector(), "mode": "warm", "error": ""}
    elif args.image is None:
        payload = {"accepted": False, "words": [], "text": "", "error": "--image is required"}
    else:
        payload = recognize_words(args.image, min_score=args.min_score, max_words=args.max_words)
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
