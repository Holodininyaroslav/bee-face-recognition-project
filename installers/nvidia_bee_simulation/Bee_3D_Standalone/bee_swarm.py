from __future__ import annotations

import json
import math
import random
from time import time as wall_time

from ursina import Entity, Vec3

from config import BASE_DIR, GROUND_SIZE, MIN_HEIGHT
from drone_model import DroneModel


BRIDGE_PATH = BASE_DIR.parent / "hive_bridge.json"
CONTROL_PATH = BASE_DIR.parent / "hive_control.json"


class BeeClone:
    def __init__(self, parent: Entity, index: int, position: Vec3) -> None:
        self.index = index
        self.base_y = float(position.y)
        self.phase = index * 0.73
        self.root = Entity(parent=parent, name=f"swarm_bee_{index}", position=position)
        self.model = DroneModel(self.root, load_extra_characters=False)
        self.model.play_animation_key("8")

    def update(self, dt: float) -> None:
        self.phase += dt * 5.5
        self.root.y = self.base_y + math.sin(self.phase) * 0.22
        self.model.update_animation(dt)

    def play(self, key: str) -> None:
        self.model.play_animation_key(key)

    def set_pose(self, position, yaw: float | None = None) -> None:
        self.root.position = Vec3(float(position[0]), float(position[1]), float(position[2]))
        self.base_y = float(self.root.y)
        if yaw is not None:
            self.root.rotation_y = float(yaw)

    def pose(self) -> tuple[Vec3, float]:
        return Vec3(self.root.position), float(self.root.rotation_y)


class BeeSwarm:
    def __init__(self, parent: Entity) -> None:
        self.parent = parent
        self.passive_bees: dict[int, BeeClone] = {}
        self.bee_count = 0
        self.bridge_mtime = 0.0
        self.control_mtime = 0.0
        self.bridge_poll_timer = 0.0
        self.pending_control_id: int | None = None
        self.controlled_id = 0
        self.last_control_request_time = 0.0
        self.ensure_total(1)

    @property
    def total_bees(self) -> int:
        return max(1, self.bee_count)

    @property
    def extra_bees(self) -> list[BeeClone]:
        return [self.passive_bees[index] for index in sorted(self.passive_bees) if index > 0]

    def iter_bees(self) -> list[BeeClone]:
        return [self.passive_bees[index] for index in sorted(self.passive_bees)]

    def add_bee(self, position: Vec3 | None = None) -> BeeClone:
        index = self.total_bees
        self.ensure_total(index + 1)
        bee = self.passive_bees[index]
        if position is not None:
            bee.set_pose(position)
        print(f"Added bee #{index}; total bees: {self.total_bees}")
        return bee

    def ensure_total(self, total_count: int, positions: dict | None = None) -> None:
        target_count = max(1, int(total_count))
        for index in range(self.bee_count, target_count):
            pose = self._pose_for_index(positions, index)
            bee = BeeClone(
                self.parent,
                index,
                pose[0] if pose is not None else self._random_position(index),
            )
            if pose is not None:
                bee.root.rotation_y = pose[1]
            self.passive_bees[index] = bee
        self.bee_count = max(self.bee_count, target_count)
        self._sync_visibility()

    def update(self, dt: float) -> None:
        for bee in self.iter_bees():
            if bee.root.enabled:
                bee.update(dt)

        self.bridge_poll_timer += dt
        if self.bridge_poll_timer < 0.25:
            return
        self.bridge_poll_timer = 0.0
        self._poll_bridge()
        self._poll_control()

    def _poll_bridge(self) -> None:
        if not BRIDGE_PATH.exists():
            return
        try:
            mtime = BRIDGE_PATH.stat().st_mtime
            if mtime <= self.bridge_mtime:
                return
            self.bridge_mtime = mtime
            data = json.loads(BRIDGE_PATH.read_text(encoding="utf-8-sig"))
            positions = data.get("positions", {})
            positions = positions if isinstance(positions, dict) else None
            self.ensure_total(
                int(data.get("bee_count", self.total_bees)),
                positions,
            )
            self.apply_positions(positions)
        except Exception as exc:
            print(f"Could not read bee bridge: {exc}")

    def _poll_control(self) -> None:
        if not CONTROL_PATH.exists():
            return
        try:
            mtime = CONTROL_PATH.stat().st_mtime
            if mtime <= self.control_mtime:
                return
            self.control_mtime = mtime
            data = json.loads(CONTROL_PATH.read_text(encoding="utf-8-sig"))
            request_time = float(data.get("request_time", mtime))
            if request_time <= self.last_control_request_time:
                return
            if self.last_control_request_time == 0.0 and wall_time() - request_time > 30.0:
                self.last_control_request_time = request_time
                return
            control_id = max(0, int(data["control_id"]))
            self.ensure_total(max(int(data.get("bee_count", self.total_bees)), control_id + 1))
            self.pending_control_id = control_id
            self.last_control_request_time = request_time
        except Exception as exc:
            print(f"Could not read bee control request: {exc}")

    def consume_control_request(self) -> int | None:
        node_id = self.pending_control_id
        self.pending_control_id = None
        return node_id

    def set_controlled_bee(self, node_id: int) -> tuple[Vec3, float]:
        self.ensure_total(node_id + 1)
        self.controlled_id = max(0, int(node_id))
        self._sync_visibility()
        return self.passive_bees[self.controlled_id].pose()

    def set_passive_pose(self, node_id: int, position, yaw: float) -> None:
        self.ensure_total(node_id + 1)
        self.passive_bees[max(0, int(node_id))].set_pose(position, yaw)

    def apply_positions(self, positions: dict | None) -> None:
        if not isinstance(positions, dict):
            return
        for index, bee in self.passive_bees.items():
            if index == self.controlled_id:
                continue
            pose = self._pose_for_index(positions, index)
            if pose is not None:
                bee.set_pose(pose[0], pose[1])

    def _sync_visibility(self) -> None:
        for index, bee in self.passive_bees.items():
            bee.root.enabled = index != self.controlled_id

    def _pose_for_index(self, positions: dict | None, index: int) -> tuple[Vec3, float] | None:
        if not isinstance(positions, dict):
            return None
        payload = positions.get(str(index))
        if not isinstance(payload, dict):
            return None
        try:
            position = Vec3(float(payload["x"]), float(payload["y"]), float(payload["z"]))
            yaw = float(payload.get("yaw", 0.0))
            return position, yaw
        except (TypeError, ValueError, KeyError):
            return None

    def _random_position(self, index: int) -> Vec3:
        if index == 0:
            return Vec3(0.0, MIN_HEIGHT + 1.2, 0.0)
        half_ground = max(8.0, GROUND_SIZE * 0.42)
        angle = index * 2.39996323 + random.uniform(-0.35, 0.35)
        radius = min(half_ground, 5.0 + index * 2.2)
        x = math.sin(angle) * radius
        z = math.cos(angle) * radius
        return Vec3(x, MIN_HEIGHT + random.uniform(0.4, 2.8), z)
