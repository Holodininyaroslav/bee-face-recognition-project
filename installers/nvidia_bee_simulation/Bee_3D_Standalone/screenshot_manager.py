from __future__ import annotations

from datetime import datetime
from pathlib import Path

from panda3d.core import Filename

from config import (
    CPU_SCREENSHOT_DIR,
)


class ScreenshotManager:
    def __init__(self) -> None:
        CPU_SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

    def save(self, directory: Path = CPU_SCREENSHOT_DIR) -> str:
        from ursina import application

        directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
        path = directory / f"{timestamp}.png"
        application.base.win.saveScreenshot(Filename.fromOsSpecific(str(path)))
        return str(path)
