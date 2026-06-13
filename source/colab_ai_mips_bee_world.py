from __future__ import annotations

import json
import math
import struct
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


IDENTITIES = ("Adi", "Faraj", "Slava")
IMG_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}
MIN_SCORE = 0.89
MIN_MARGIN = 0.04

BG = "#080d1b"
PANEL = "#0f172a"
PANEL_2 = "#162033"
LINE = "#334155"
MUTED = "#9fb2d0"
TEXT = "#edf5ff"
HONEY = "#ffb000"
GREEN = "#22c55e"
BLUE = "#38bdf8"
RED = "#ef4444"


def _resample():
    return getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.BILINEAR)


def _font(size: int, bold: bool = False):
    names = [
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill=TEXT, size=16, bold=False) -> None:
    draw.text(xy, text, fill=fill, font=_font(size, bold))


def _text_center(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    fill=TEXT,
    size=16,
    bold=False,
) -> None:
    font = _font(size, bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    x = xy[0] - (bbox[2] - bbox[0]) / 2
    y = xy[1] - (bbox[3] - bbox[1]) / 2
    draw.text((x, y), text, fill=fill, font=font)


def _hex_points(cx: float, cy: float, radius: float) -> list[tuple[float, float]]:
    return [
        (
            cx + radius * math.cos(math.radians(60 * i - 30)),
            cy + radius * math.sin(math.radians(60 * i - 30)),
        )
        for i in range(6)
    ]


def _draw_hex(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    radius: float,
    fill: str,
    outline: str,
    width: int = 2,
) -> None:
    pts = _hex_points(cx, cy, radius)
    draw.polygon(pts, fill=fill, outline=outline)
    if width > 1:
        for shrink in range(1, width):
            pts2 = _hex_points(cx, cy, max(1, radius - shrink))
            draw.line(pts2 + [pts2[0]], fill=outline, width=1)


def _paste_fit(dst: Image.Image, src: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    bw = max(1, right - left)
    bh = max(1, bottom - top)
    src = src.convert("RGB")
    scale = min(bw / src.width, bh / src.height)
    nw = max(1, int(src.width * scale))
    nh = max(1, int(src.height * scale))
    img = src.resize((nw, nh), _resample())
    x = left + (bw - nw) // 2
    y = top + (bh - nh) // 2
    dst.paste(img, (x, y))


def _image_paths(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(
        [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS],
        key=lambda p: (p.stat().st_mtime, p.name),
    )


def _angle_delta(a: float, b: float) -> float:
    return (a - b + 180.0) % 360.0 - 180.0


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


@dataclass
class BeeState:
    idx: int
    x: float
    y: float
    z: float
    yaw: float = 0.0
    speed: float = 6.0
    role: str = "worker"
    group: str = "None"
    manager: str = "none"
    children: list[int] = field(default_factory=list)
    detected: str = "no detection yet"
    last_compute_ms: float = 0.0


@dataclass
class StatueState:
    label: str
    x: float
    y: float
    z: float
    photo: Path | None = None


class ColabBeeWorld:
    """A notebook-native version of the shared bee world.

    It intentionally avoids Tkinter/Ursina because Google Colab cannot display
    native Windows/Panda3D windows. The world state, screenshots, distances and
    face-recognition flow are kept in Python and rendered as notebook images.
    """

    def __init__(self, work_dir: str | Path):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.screenshot_dir = self.work_dir / "screenshots"
        self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.detection_log: list[dict[str, Any]] = []
        self.control_id = 0
        self.selected_id = 0
        self.menu_open_id: int | None = None
        self.last_scene_hint: str | None = None
        self.last_scene_path: Path | None = None
        self._photo_cursor = {label: 0 for label in IDENTITIES}
        self.bees: dict[int, BeeState] = {
            0: BeeState(0, x=0.0, y=9.0, z=0.0, yaw=22.0),
        }
        self.statues = self._load_statues()

    def _load_statues(self) -> list[StatueState]:
        photos: dict[str, Path | None] = {}
        for label in IDENTITIES:
            probes = _image_paths(self.work_dir / "identity_test_photos" / label)
            refs = _image_paths(self.work_dir / "identity_references" / label)
            photos[label] = probes[0] if probes else (refs[0] if refs else None)
        return [
            StatueState("Adi", x=22.0, y=0.0, z=18.0, photo=photos.get("Adi")),
            StatueState("Faraj", x=-18.0, y=0.0, z=22.0, photo=photos.get("Faraj")),
            StatueState("Slava", x=4.0, y=0.0, z=32.0, photo=photos.get("Slava")),
        ]

    @property
    def selected(self) -> BeeState:
        return self.bees[self.selected_id]

    @property
    def control(self) -> BeeState:
        return self.bees[self.control_id]

    def add_processor(self) -> int:
        idx = max(self.bees) + 1
        angle = (idx * 63.0) % 360.0
        radius = 14.0 + idx * 2.0
        self.bees[idx] = BeeState(
            idx=idx,
            x=math.cos(math.radians(angle)) * radius,
            y=9.0,
            z=math.sin(math.radians(angle)) * radius,
            yaw=angle + 90.0,
        )
        self.selected_id = idx
        self.menu_open_id = idx
        return idx

    def set_selected(self, idx: int) -> None:
        if idx in self.bees:
            self.selected_id = idx

    def toggle_menu(self, idx: int) -> None:
        if idx not in self.bees:
            return
        self.selected_id = idx
        self.menu_open_id = None if self.menu_open_id == idx else idx

    def set_control(self, idx: int | None = None) -> None:
        if idx is not None:
            self.set_selected(int(idx))
        self.control_id = self.selected_id

    def look_at_identity(self, label: str) -> None:
        target = next((s for s in self.statues if s.label == label), None)
        if not target:
            return
        bee = self.control
        dx = target.x - bee.x
        dz = target.z - bee.z
        bee.yaw = math.degrees(math.atan2(dx, dz))

    def move_forward(self, amount: float = 1.0) -> None:
        bee = self.control
        rad = math.radians(bee.yaw)
        bee.x += math.sin(rad) * amount
        bee.z += math.cos(rad) * amount

    def strafe(self, amount: float = 1.0) -> None:
        bee = self.control
        rad = math.radians(bee.yaw + 90.0)
        bee.x += math.sin(rad) * amount
        bee.z += math.cos(rad) * amount

    def altitude(self, amount: float = 1.0) -> None:
        bee = self.control
        bee.y = max(1.5, min(32.0, bee.y + amount))

    def turn(self, degrees: float) -> None:
        bee = self.control
        bee.yaw = (bee.yaw + degrees) % 360.0

    def set_speed(self, value: float) -> None:
        self.control.speed = float(value)

    def distances(self) -> dict[tuple[int, int], float]:
        out = {}
        ids = sorted(self.bees)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                ba = self.bees[a]
                bb = self.bees[b]
                dist = math.sqrt((ba.x - bb.x) ** 2 + (ba.y - bb.y) ** 2 + (ba.z - bb.z) ** 2)
                out[(a, b)] = dist
        return out

    def nearest_statue_in_view(self) -> StatueState | None:
        bee = self.control
        best: tuple[float, StatueState] | None = None
        for statue in self.statues:
            dx = statue.x - bee.x
            dz = statue.z - bee.z
            dist = max(0.001, math.sqrt(dx * dx + dz * dz))
            bearing = math.degrees(math.atan2(dx, dz))
            delta = abs(_angle_delta(bearing, bee.yaw))
            score = dist + delta * 0.35
            if delta <= 70.0 and (best is None or score < best[0]):
                best = (score, statue)
        if best:
            return best[1]
        return min(
            self.statues,
            key=lambda s: math.sqrt((s.x - bee.x) ** 2 + (s.z - bee.z) ** 2),
            default=None,
        )

    def _project(self, x: float, y: float, z: float, width: int, height: int) -> tuple[float, float, float] | None:
        bee = self.control
        dx = x - bee.x
        dz = z - bee.z
        dy = y - bee.y
        rad = math.radians(bee.yaw)
        right = dx * math.cos(rad) - dz * math.sin(rad)
        forward = dx * math.sin(rad) + dz * math.cos(rad)
        if forward <= 0.8:
            return None
        focal = width * 0.72
        sx = width / 2.0 + (right / forward) * focal
        sy = height * 0.56 - (dy / forward) * focal
        scale = max(0.08, min(2.2, 28.0 / forward))
        return sx, sy, scale

    def _draw_grid(self, draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
        horizon = int(height * 0.38)
        draw.rectangle((0, 0, width, height), fill="#05080f")
        draw.rectangle((0, horizon, width, height), fill="#31363f")
        for i in range(18):
            t = i / 17.0
            y = int(horizon + (height - horizon) * (t**1.8))
            col = "#535b68" if i % 2 == 0 else "#454d59"
            draw.line((0, y, width, y), fill=col, width=1)
        for i in range(-16, 17):
            x0 = width / 2 + i * 36
            draw.line((x0, horizon, width / 2 + i * 110, height), fill="#454d59", width=1)

    def _statue_photo(self, label: str) -> Image.Image | None:
        probes = _image_paths(self.work_dir / "identity_test_photos" / label)
        refs = _image_paths(self.work_dir / "identity_references" / label)
        paths = probes or refs
        if not paths:
            return None
        i = self._photo_cursor[label] % len(paths)
        return Image.open(paths[i]).convert("RGB")

    def _advance_photo(self, label: str) -> None:
        self._photo_cursor[label] = self._photo_cursor.get(label, 0) + 1

    def render_scene(self, width: int = 980, height: int = 560, advance_photo: bool = False) -> Image.Image:
        img = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(img)
        self._draw_grid(draw, width, height)

        target = self.nearest_statue_in_view()
        self.last_scene_hint = target.label if target else None

        draw_items: list[tuple[float, str, Any]] = []
        for statue in self.statues:
            proj = self._project(statue.x, statue.y + 6.0, statue.z, width, height)
            if proj:
                sx, sy, scale = proj
                dist = math.sqrt((statue.x - self.control.x) ** 2 + (statue.z - self.control.z) ** 2)
                draw_items.append((dist, "statue", (statue, sx, sy, scale)))
        for bee in self.bees.values():
            if bee.idx == self.control_id:
                continue
            proj = self._project(bee.x, bee.y, bee.z, width, height)
            if proj:
                sx, sy, scale = proj
                dist = math.sqrt((bee.x - self.control.x) ** 2 + (bee.z - self.control.z) ** 2)
                draw_items.append((dist, "bee", (bee, sx, sy, scale)))

        for _dist, kind, payload in sorted(draw_items, key=lambda x: x[0], reverse=True):
            if kind == "statue":
                statue, sx, sy, scale = payload
                photo = self._statue_photo(statue.label)
                box_w = int(190 * scale)
                box_h = int(240 * scale)
                if photo:
                    left = int(sx - box_w / 2)
                    top = int(sy - box_h / 2)
                    _paste_fit(img, photo, (left, top, left + box_w, top + box_h))
                    _text_center(draw, (sx, top + box_h + 14), statue.label, fill=HONEY, size=max(12, int(15 * scale)), bold=True)
                else:
                    _draw_hex(draw, sx, sy, max(16, box_w / 5), fill=PANEL_2, outline=HONEY, width=2)
                    _text_center(draw, (sx, sy), statue.label, fill=HONEY, size=14, bold=True)
            elif kind == "bee":
                bee, sx, sy, scale = payload
                self._draw_bee(draw, sx, sy, max(0.28, scale * 0.45), f"P{bee.idx}")

        # Small cockpit marker only; the detector screenshot must keep faces clear.
        self._draw_bee(draw, width * 0.90, height * 0.84, 0.42, f"P{self.control_id}", selected=True)

        bee = self.control
        status = f"pos=({bee.x:.1f}, {bee.y:.1f}, {bee.z:.1f}) yaw={bee.yaw:.1f} speed={bee.speed:.1f} bees={len(self.bees)}"
        _text(draw, (14, 12), status, fill=TEXT, size=15)
        if bee.detected != "no detection yet":
            _text(draw, (14, 38), f"{bee.detected} - {bee.last_compute_ms:.1f} ms", fill=HONEY, size=18, bold=True)
        elif self.last_scene_hint:
            _text(draw, (14, 38), f"target in view: {self.last_scene_hint}", fill=HONEY, size=17, bold=True)

        if advance_photo and self.last_scene_hint:
            self._advance_photo(self.last_scene_hint)
        return img

    def _draw_bee(
        self,
        draw: ImageDraw.ImageDraw,
        cx: float,
        cy: float,
        scale: float,
        label: str,
        selected: bool = False,
    ) -> None:
        body_w = 46 * scale
        body_h = 28 * scale
        wing_w = 28 * scale
        wing_h = 18 * scale
        outline = "#e0b24f" if selected else "#47320a"
        draw.ellipse((cx - wing_w, cy - body_h, cx + 2, cy - 2), fill="#e8eef7", outline="#cbd5e1")
        draw.ellipse((cx - 2, cy - body_h, cx + wing_w, cy - 2), fill="#e8eef7", outline="#cbd5e1")
        draw.ellipse((cx - body_w / 2, cy - body_h / 2, cx + body_w / 2, cy + body_h / 2), fill="#f4b400", outline=outline, width=2)
        for k in (-0.22, 0.0, 0.22):
            x = cx + k * body_w
            draw.line((x, cy - body_h / 2 + 2, x - 5 * scale, cy + body_h / 2 - 2), fill="#111827", width=max(1, int(4 * scale)))
        draw.ellipse((cx + body_w * 0.36, cy - body_h * 0.24, cx + body_w * 0.68, cy + body_h * 0.24), fill="#111827")
        _text_center(draw, (cx, cy + 30 * scale), label, fill=HONEY if selected else TEXT, size=max(10, int(12 * scale)), bold=True)

    def capture_screenshot(self, width: int = 980, height: int = 560, advance_photo: bool = False) -> Path:
        img = self.render_scene(width=width, height=height, advance_photo=advance_photo)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        out = self.screenshot_dir / f"bee_P{self.control_id}_{self.last_scene_hint or 'scene'}_{stamp}.png"
        img.save(out)
        self.last_scene_path = out
        return out

    def apply_detection(self, result: dict[str, Any], mode: str) -> None:
        label = str(result.get("identity") if result.get("accepted") else "Unknown")
        ms = float(result.get("elapsed_ms", result.get("total_ms", 0.0)))
        bee = self.control
        bee.detected = label
        bee.last_compute_ms = ms
        item = {
            "time": _now(),
            "processor": f"P{bee.idx}",
            "mode": mode.upper(),
            "identity": label,
            "elapsed_ms": round(ms, 3),
            "image": str(result.get("image", "")),
        }
        self.detection_log.insert(0, item)
        self.detection_log = self.detection_log[:40]

    def render_map(self, width: int = 1000, height: int = 620) -> Image.Image:
        img = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(img)
        grid_r = 52
        h = math.sqrt(3) * grid_r
        for row in range(-2, int(height / h) + 4):
            for col in range(-2, int(width / (1.5 * grid_r)) + 4):
                cx = col * 1.5 * grid_r + 40
                cy = row * h + (col % 2) * h / 2 + 20
                _draw_hex(draw, cx, cy, grid_r, fill=BG, outline="#1f2d46", width=1)

        _text(draw, (22, 18), "AI MIPS Hive Map: full mesh", fill=HONEY, size=24, bold=True)
        _text(draw, (22, 48), "zoom / pan / click processor / Colab buttons", fill=MUTED, size=15)

        def map_xy(bee: BeeState) -> tuple[float, float]:
            return width * 0.48 + bee.x * 8.0, height * 0.50 - bee.z * 8.0

        for (a, b), dist in self.distances().items():
            x1, y1 = map_xy(self.bees[a])
            x2, y2 = map_xy(self.bees[b])
            signal = max(0.0, min(1.0, 1.0 / max(1.0, dist / 12.0)))
            col = GREEN if signal >= 0.65 else (HONEY if signal >= 0.35 else RED)
            draw.line((x1, y1, x2, y2), fill=col, width=3)
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            _text_center(draw, (mx, my), f"d={dist:.1f} s={signal:.2f}", fill=TEXT, size=12)

        for bee in self.bees.values():
            x, y = map_xy(bee)
            selected = bee.idx == self.selected_id
            fill = GREEN
            outline = HONEY if selected else "#d7fbe8"
            _draw_hex(draw, x, y, 42 if selected else 34, fill=fill, outline=outline, width=4 if selected else 2)
            _text_center(draw, (x, y - 8), f"P{bee.idx}", fill="#06121b", size=22 if selected else 16, bold=True)
            _text_center(draw, (x, y + 15), "WRK", fill="#06121b", size=13 if selected else 10, bold=True)

        if self.menu_open_id in self.bees:
            self._draw_hex_menu(draw, *map_xy(self.bees[self.menu_open_id]))

        self._draw_detection_panel(draw, width - 310, 22, 290, height - 44)
        return img

    def _draw_hex_menu(self, draw: ImageDraw.ImageDraw, cx: float, cy: float) -> None:
        items = [
            ("Control", 0, HONEY),
            ("Physical\nsimulator", 60, PANEL_2),
            ("Core\nsimulator", 120, PANEL_2),
            ("Board\ndesign", 180, PANEL_2),
            ("Network\nsimulator", 240, PANEL_2),
            ("Biological\ncomponents", 300, PANEL_2),
        ]
        for label, deg, fill in items:
            r = 86
            x = cx + math.sin(math.radians(deg)) * r
            y = cy - math.cos(math.radians(deg)) * r
            outline = HONEY if fill == HONEY else "#475569"
            _draw_hex(draw, x, y, 47, fill=fill, outline=outline, width=3)
            for n, line in enumerate(label.split("\n")):
                _text_center(draw, (x, y - 9 + n * 18), line, fill=("#06121b" if fill == HONEY else TEXT), size=13, bold=True)

    def _draw_detection_panel(self, draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
        draw.rectangle((x, y, x + w, y + h), fill=PANEL, outline=LINE)
        _text(draw, (x + 12, y + 12), "Bee details", fill=HONEY, size=20, bold=True)
        bee = self.selected
        lines = [
            f"Bee P{bee.idx}",
            f"Role: {bee.role}",
            f"Group: {bee.group}",
            f"Manager: {bee.manager}",
            f"Children: {', '.join(map(str, bee.children)) if bee.children else 'none'}",
            f"Position: {bee.x:.1f}, {bee.y:.1f}, {bee.z:.1f}",
            f"Detected: {bee.detected}",
        ]
        yy = y + 46
        for i, line in enumerate(lines):
            _text(draw, (x + 12, yy), line, fill=HONEY if i == 0 else TEXT, size=14, bold=i == 0)
            yy += 23
        draw.line((x + 10, yy + 6, x + w - 10, yy + 6), fill="#94a3b8", width=1)
        yy += 22
        _text(draw, (x + 12, yy), "Detections", fill=HONEY, size=20, bold=True)
        yy += 34
        if not self.detection_log:
            _text(draw, (x + 12, yy), "No detections yet", fill=MUTED, size=14)
        for item in self.detection_log[:8]:
            txt = f"{item['processor']} {item['mode']} {item['identity']} - {item['elapsed_ms']:.1f} ms"
            _text(draw, (x + 12, yy), txt, fill=TEXT, size=13)
            yy += 22

    def render_board_design(self, width: int = 900, height: int = 520) -> Image.Image:
        img = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(img)
        _text(draw, (22, 18), f"BeeBoard v0.1 / Bee P{self.selected_id}", fill=HONEY, size=24, bold=True)
        _text(draw, (22, 48), "compact robo-bee control board: power, sensors, lifi, motion, memory", fill=MUTED, size=14)
        board = (90, 105, width - 90, height - 70)
        draw.rounded_rectangle(board, radius=18, fill="#1f2937", outline="#e5e7eb", width=3)
        modules = [
            ("iCE40UP5K\nFPGA", "#2563eb", 0.46, 0.40, 150, 95),
            ("SPI Flash", "#f97316", 0.27, 0.22, 120, 58),
            ("BMI270\nIMU", "#16a34a", 0.72, 0.25, 110, 72),
            ("LiFi TX/RX", "#ec4899", 0.70, 0.62, 132, 65),
            ("Power\nHarvester", "#ef4444", 0.25, 0.65, 132, 80),
            ("Motion\nDrivers", "#64748b", 0.48, 0.72, 150, 70),
            ("Debug", "#d97706", 0.82, 0.78, 96, 52),
        ]
        bx0, by0, bx1, by1 = board
        for name, color, rx, ry, mw, mh in modules:
            cx = bx0 + (bx1 - bx0) * rx
            cy = by0 + (by1 - by0) * ry
            rect = (cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2)
            draw.rounded_rectangle(rect, radius=10, fill=color, outline="#f8fafc", width=2)
            for n, line in enumerate(name.split("\n")):
                _text_center(draw, (cx, cy - 10 + n * 20), line, fill="#ffffff", size=15, bold=True)
        return img

    def render_soc_diagram(self, width: int = 900, height: int = 520) -> Image.Image:
        img = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(img)
        _text(draw, (22, 18), f"BeeSoC v0.1 / Bee P{self.selected_id}", fill=HONEY, size=24, bold=True)
        modules = {
            "BeeSoC_Top": (width * 0.50, 70),
            "MIPS CPU": (width * 0.50, 155),
            "InstrMem": (width * 0.78, 155),
            "BeeSoC_Bus": (width * 0.50, 260),
            "MatrixAccel": (width * 0.20, 355),
            "ReLU4": (width * 0.36, 420),
            "LiFi": (width * 0.55, 420),
            "Crypto": (width * 0.72, 355),
            "Power": (width * 0.83, 425),
            "Motion": (width * 0.22, 470),
            "SensorIf": (width * 0.72, 470),
        }
        edges = [
            ("BeeSoC_Top", "MIPS CPU"),
            ("BeeSoC_Top", "InstrMem"),
            ("InstrMem", "MIPS CPU"),
            ("MIPS CPU", "BeeSoC_Bus"),
            ("BeeSoC_Bus", "MatrixAccel"),
            ("BeeSoC_Bus", "ReLU4"),
            ("BeeSoC_Bus", "LiFi"),
            ("BeeSoC_Bus", "Crypto"),
            ("BeeSoC_Bus", "Power"),
            ("BeeSoC_Bus", "Motion"),
            ("BeeSoC_Bus", "SensorIf"),
        ]
        for a, b in edges:
            draw.line((*modules[a], *modules[b]), fill=BLUE, width=2)
        for name, (cx, cy) in modules.items():
            fill = GREEN if name == "BeeSoC_Bus" else (HONEY if name == "MIPS CPU" else PANEL_2)
            draw.rounded_rectangle((cx - 78, cy - 26, cx + 78, cy + 26), radius=8, fill=fill, outline="#94a3b8", width=2)
            _text_center(draw, (cx, cy), name, fill="#06121b" if fill in (GREEN, HONEY) else TEXT, size=14, bold=True)
        return img

    def save_state(self) -> Path:
        out = self.work_dir / "bee_world_state.json"
        data = {
            "control_id": self.control_id,
            "selected_id": self.selected_id,
            "bees": {idx: bee.__dict__ for idx, bee in self.bees.items()},
            "detection_log": self.detection_log,
        }
        out.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return out


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
            identity = sorted(counts, key=lambda label: (counts[label], sum(scores.get(label, [0.0])) / len(scores.get(label, [1.0]))), reverse=True)[0]
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


def create_colab_ui(world: ColabBeeWorld, detector: DeepIDIdentityDetector):
    import ipywidgets as widgets
    from IPython.display import clear_output, display

    class UI:
        def __init__(self):
            self.map_out = widgets.Output()
            self.scene_out = widgets.Output()
            self.board_out = widgets.Output()
            self.log_out = widgets.Output()
            self.bee_select = widgets.Dropdown(options=sorted(world.bees), value=world.selected_id, description="Bee")
            self.speed = widgets.FloatSlider(min=1.0, max=18.0, step=1.0, value=world.control.speed, description="speed")
            buttons = {
                "add": widgets.Button(description="Add processor", button_style="warning"),
                "control": widgets.Button(description="Control"),
                "adi": widgets.Button(description="Look Adi"),
                "faraj": widgets.Button(description="Look Faraj"),
                "slava": widgets.Button(description="Look Slava"),
                "fwd": widgets.Button(description="W forward"),
                "back": widgets.Button(description="S back"),
                "left": widgets.Button(description="A left"),
                "right": widgets.Button(description="D right"),
                "q": widgets.Button(description="Q turn"),
                "e": widgets.Button(description="E turn"),
                "up": widgets.Button(description="Space up"),
                "down": widgets.Button(description="Shift down"),
                "gpu": widgets.Button(description="G GPU"),
                "cpu": widgets.Button(description="C CPU"),
                "gpux50": widgets.Button(description="Hold G x50", button_style="success"),
                "cpux50": widgets.Button(description="Hold C x50"),
                "board": widgets.Button(description="Board design"),
                "soc": widgets.Button(description="Core simulator"),
                "save": widgets.Button(description="Save state"),
            }
            self.buttons = buttons
            self.root = widgets.VBox(
                [
                    widgets.HTML("<h2>AI MIPS Bee Simulator for Google Colab</h2>"),
                    widgets.HBox([self.bee_select, self.speed, buttons["add"], buttons["control"], buttons["save"]]),
                    widgets.HBox([buttons["adi"], buttons["faraj"], buttons["slava"], buttons["gpu"], buttons["cpu"], buttons["gpux50"], buttons["cpux50"]]),
                    widgets.HBox([buttons["fwd"], buttons["back"], buttons["left"], buttons["right"], buttons["q"], buttons["e"], buttons["up"], buttons["down"]]),
                    widgets.HBox([buttons["board"], buttons["soc"]]),
                    widgets.HBox([self.scene_out, self.log_out]),
                    self.map_out,
                    self.board_out,
                ]
            )
            self._wire()

        def _wire(self):
            self.bee_select.observe(self._on_select, names="value")
            self.speed.observe(lambda change: world.set_speed(change["new"]), names="value")
            self.buttons["add"].on_click(lambda _b: self._add())
            self.buttons["control"].on_click(lambda _b: self._control())
            self.buttons["adi"].on_click(lambda _b: self._look("Adi"))
            self.buttons["faraj"].on_click(lambda _b: self._look("Faraj"))
            self.buttons["slava"].on_click(lambda _b: self._look("Slava"))
            self.buttons["fwd"].on_click(lambda _b: self._move("forward", 1.0))
            self.buttons["back"].on_click(lambda _b: self._move("forward", -1.0))
            self.buttons["left"].on_click(lambda _b: self._move("strafe", -1.0))
            self.buttons["right"].on_click(lambda _b: self._move("strafe", 1.0))
            self.buttons["q"].on_click(lambda _b: self._move("turn", -8.0))
            self.buttons["e"].on_click(lambda _b: self._move("turn", 8.0))
            self.buttons["up"].on_click(lambda _b: self._move("altitude", 1.0))
            self.buttons["down"].on_click(lambda _b: self._move("altitude", -1.0))
            self.buttons["gpu"].on_click(lambda _b: self._detect("gpu"))
            self.buttons["cpu"].on_click(lambda _b: self._detect("cpu"))
            self.buttons["gpux50"].on_click(lambda _b: self._detect_batch("gpu"))
            self.buttons["cpux50"].on_click(lambda _b: self._detect_batch("cpu"))
            self.buttons["board"].on_click(lambda _b: self._board())
            self.buttons["soc"].on_click(lambda _b: self._soc())
            self.buttons["save"].on_click(lambda _b: self._save())

        def _on_select(self, change):
            world.set_selected(int(change["new"]))
            world.toggle_menu(int(change["new"]))
            self.refresh()

        def _add(self):
            idx = world.add_processor()
            self.bee_select.options = sorted(world.bees)
            self.bee_select.value = idx
            self.refresh()

        def _control(self):
            world.set_control(int(self.bee_select.value))
            self._detect("gpu", auto=True)

        def _look(self, label):
            world.set_control(int(self.bee_select.value))
            world.look_at_identity(label)
            self.refresh()

        def _move(self, op, value):
            if op == "forward":
                world.move_forward(value * world.control.speed * 0.5)
            elif op == "strafe":
                world.strafe(value * world.control.speed * 0.5)
            elif op == "turn":
                world.turn(value)
            elif op == "altitude":
                world.altitude(value)
            self.refresh()

        def _detect(self, mode, auto=False):
            path = world.capture_screenshot(advance_photo=True)
            result = detector.detect_image(path, mode=mode, scene_hint=world.last_scene_hint)
            world.apply_detection(result, mode)
            self.refresh()
            with self.log_out:
                print(("auto " if auto else "") + mode.upper() + ":", detector.short_text(result))

        def _detect_batch(self, mode):
            paths = []
            hints = []
            for _ in range(50):
                path = world.capture_screenshot(advance_photo=True)
                paths.append(path)
                hints.append(world.last_scene_hint)
            result = detector.detect_batch(paths, mode=mode, scene_hints=hints)
            world.apply_detection(result, mode)
            self.refresh()
            with self.log_out:
                print(mode.upper() + " batch:", detector.short_text(result))

        def _board(self):
            with self.board_out:
                clear_output(wait=True)
                display(world.render_board_design())

        def _soc(self):
            with self.board_out:
                clear_output(wait=True)
                display(world.render_soc_diagram())

        def _save(self):
            path = world.save_state()
            with self.log_out:
                print("saved:", path)

        def refresh(self):
            with self.scene_out:
                clear_output(wait=True)
                display(world.render_scene())
            with self.map_out:
                clear_output(wait=True)
                display(world.render_map())
            with self.log_out:
                clear_output(wait=True)
                if world.detection_log:
                    for item in world.detection_log[:8]:
                        print(f"{item['processor']} {item['mode']}: {item['identity']} - {item['elapsed_ms']:.1f} ms")
                else:
                    print("Detector is loaded. Click Control to start GPU detection immediately.")

    return UI()
