from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any


MAX_EVENTS = 120


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _lock_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".lock")


class _FileLock:
    def __init__(self, path: Path, timeout: float = 2.0) -> None:
        self.path = _lock_path(path)
        self.timeout = timeout
        self.fd: int | None = None

    def __enter__(self) -> "_FileLock":
        deadline = time.time() + self.timeout
        while True:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self.fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self.fd, str(os.getpid()).encode("ascii", errors="ignore"))
                return self
            except FileExistsError:
                if time.time() >= deadline:
                    stale_age = time.time() - self.path.stat().st_mtime if self.path.exists() else 0.0
                    if stale_age > self.timeout:
                        try:
                            self.path.unlink(missing_ok=True)
                            continue
                        except OSError:
                            pass
                    raise
                time.sleep(0.05)

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        if self.fd is not None:
            os.close(self.fd)
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            pass


def read_detection_events(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    events = payload.get("events", []) if isinstance(payload, dict) else []
    return [event for event in events if isinstance(event, dict)]


def append_detection_event(path: Path, event: dict[str, Any]) -> None:
    event = dict(event)
    event.setdefault("timestamp_iso", _now_iso())
    event.setdefault("event_id", f"{event['timestamp_iso']}_{os.getpid()}_{event.get('bee_id', 'x')}")

    try:
        with _FileLock(path):
            events = read_detection_events(path)
            events.insert(0, event)
            payload = {"events": events[:MAX_EVENTS]}
            tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            os.replace(tmp, path)
    except Exception as exc:
        print(f"Could not append detection event: {exc}")
