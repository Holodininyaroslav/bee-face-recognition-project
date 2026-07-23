from __future__ import annotations

import json
import time
import tkinter as tk
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
STATE_PATH = BASE_DIR / "bee_space_state.json"
BRIDGE_PATH = BASE_DIR.parent / "hive_bridge.json"
GROUND_SIZE = 240.0
STATUE_COLORS = {
    "Faraj": "#ff4d4d",
    "Slava": "#35d07f",
    "Adi": "#4aa3ff",
}
STATUE_LABEL_OFFSETS = {
    "Faraj": (-30, 24),
    "Slava": (0, 40),
    "Adi": (30, 24),
}
BEE_COLOR = "#ffd43b"


class BeeSpaceMap:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Bee Space 2D Map")
        self.root.geometry("620x680")
        self.root.configure(bg="#0a0f1a")

        self.canvas = tk.Canvas(self.root, width=580, height=580, bg="#111827", highlightthickness=1, highlightbackground="#31415f")
        self.canvas.pack(padx=20, pady=(20, 10))

        self.status = tk.Label(self.root, text="Waiting for bee_space_state.json", fg="#dbeafe", bg="#0a0f1a", font=("Segoe UI", 11))
        self.status.pack(fill="x", padx=20)

        self.legend = tk.Label(
            self.root,
            text="Bees: yellow | controlled bee: bright | Faraj: red | Slava: green | Adi: blue",
            fg="#9fb6d8",
            bg="#0a0f1a",
            font=("Segoe UI", 10),
        )
        self.legend.pack(fill="x", padx=20, pady=(4, 0))

        self._last_mtime = 0.0
        self._last_state: dict | None = None
        self._last_bridge_mtime = 0.0
        self._last_bridge_bees: list[dict] = []

    def run(self) -> None:
        self._tick()
        self.root.mainloop()

    def _read_state(self) -> dict | None:
        if not STATE_PATH.exists():
            return self._last_state
        try:
            mtime = STATE_PATH.stat().st_mtime
            if self._last_state is not None and mtime == self._last_mtime:
                return self._last_state
            self._last_mtime = mtime
            self._last_state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return self._last_state
        return self._last_state

    def _read_bridge_bees(self) -> list[dict]:
        if not BRIDGE_PATH.exists():
            return self._last_bridge_bees
        try:
            mtime = BRIDGE_PATH.stat().st_mtime
            if mtime == self._last_bridge_mtime:
                return self._last_bridge_bees
            self._last_bridge_mtime = mtime
            data = json.loads(BRIDGE_PATH.read_text(encoding="utf-8-sig"))
            positions = data.get("positions", {}) if isinstance(data, dict) else {}
            if not isinstance(positions, dict):
                positions = {}
            try:
                bee_count = int(data.get("bee_count", 0) or 0)
            except (TypeError, ValueError):
                bee_count = 0
            indexes = []
            for key in positions:
                try:
                    indexes.append(int(key))
                except (TypeError, ValueError):
                    continue
            if indexes:
                bee_count = max(bee_count, max(indexes) + 1)
            bees = []
            for index in range(max(0, bee_count)):
                payload = positions.get(str(index), {})
                if isinstance(payload, dict):
                    bees.append({"id": index, **payload})
            self._last_bridge_bees = bees
        except Exception:
            return self._last_bridge_bees
        return self._last_bridge_bees

    def _project(self, x: float, z: float, size: float) -> tuple[float, float]:
        margin = 34
        canvas_size = 580 - margin * 2
        half = max(size * 0.5, 1.0)
        px = margin + ((x + half) / (half * 2.0)) * canvas_size
        py = margin + ((half - z) / (half * 2.0)) * canvas_size
        return px, py

    def _draw_grid(self, size: float) -> None:
        margin = 34
        right = 580 - margin
        step = (right - margin) / 12
        for i in range(13):
            p = margin + i * step
            color = "#22314b" if i != 6 else "#4d6389"
            self.canvas.create_line(margin, p, right, p, fill=color)
            self.canvas.create_line(p, margin, p, right, fill=color)
        self.canvas.create_rectangle(margin, margin, right, right, outline="#6b7fa6", width=2)
        self.canvas.create_text(292, 18, text="Top map: X / Z space", fill="#dbeafe", font=("Segoe UI", 12, "bold"))

    def _draw_statue(self, label: str, x: float, z: float, size: float) -> None:
        px, py = self._project(x, z, size)
        color = STATUE_COLORS.get(label, "#a78bfa")
        r = 11
        self.canvas.create_oval(px - r, py - r, px + r, py + r, fill=color, outline="#f8fafc", width=2)
        dx, dy = STATUE_LABEL_OFFSETS.get(label, (0, 25))
        self.canvas.create_text(px + dx, py + dy, text=label, fill="#e5e7eb", font=("Segoe UI", 9, "bold"))

    def _draw_bee(self, bee: dict, size: float, controlled_id: int = 0) -> None:
        x = float(bee.get("x", 0.0))
        z = float(bee.get("z", 0.0))
        yaw = float(bee.get("yaw", 0.0))
        bee_id = int(bee.get("id", 0) or 0)
        px, py = self._project(x, z, size)
        controlled = bee_id == controlled_id
        r = 12 if controlled else 9
        fill = BEE_COLOR if controlled else "#eab308"
        outline = "#fff7ad" if controlled else "#111827"
        self.canvas.create_oval(px - r, py - r, px + r, py + r, fill=fill, outline=outline, width=2)
        angle = yaw * 3.14159265 / 180.0
        tip_x = px + (22 if controlled else 17) * __import__("math").sin(angle)
        tip_y = py - (22 if controlled else 17) * __import__("math").cos(angle)
        self.canvas.create_line(px, py, tip_x, tip_y, fill="#fff7ad", width=3 if controlled else 2, arrow=tk.LAST)
        self.canvas.create_text(px, py - (31 if controlled else 24), text=f"P{bee_id}", fill="#fff7ad", font=("Segoe UI", 10, "bold"))

    def _tick(self) -> None:
        state = self._read_state()
        self.canvas.delete("all")
        size = float((state or {}).get("ground_size", GROUND_SIZE))
        self._draw_grid(size)
        if state:
            for statue in state.get("statues", []):
                self._draw_statue(str(statue.get("label", "?")), float(statue.get("x", 0.0)), float(statue.get("z", 0.0)), size)
            controlled_id = int((state.get("bee") or {}).get("id", 0) or 0)
            bees = state.get("bees")
            if not isinstance(bees, list) or not bees:
                bees = self._read_bridge_bees() or [state.get("bee", {})]
            for bee_payload in bees:
                if isinstance(bee_payload, dict):
                    self._draw_bee(bee_payload, size, controlled_id)
            bee = state.get("bee", {})
            self.status.config(text=f"Bees={len(bees)} | active P{controlled_id} x={float(bee.get('x', 0.0)):.2f}, z={float(bee.get('z', 0.0)):.2f}, yaw={float(bee.get('yaw', 0.0)):.1f}")
        else:
            self.status.config(text=f"Waiting for {STATE_PATH.name}. Start the 3D simulation first.")
        self.root.after(250, self._tick)


if __name__ == "__main__":
    BeeSpaceMap().run()
