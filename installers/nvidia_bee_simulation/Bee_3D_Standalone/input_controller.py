import numpy as np
from ursina import held_keys

from config import SPEED_LEVELS, TURN_SPEED_DEG


class InputController:
    def __init__(self) -> None:
        self.speed_levels = list(SPEED_LEVELS)
        self.speed_index = 1
        self.current_speed = self.speed_levels[self.speed_index]
        self.speed_locked = False

        self._prev_speed = {
            "1": False,
            "2": False,
            "3": False,
            "4": False,
        }

    def lock_speed(self, speed: float) -> None:
        self.current_speed = float(speed)
        self.speed_locked = True

    def _pressed_once(self, key: str) -> bool:
        now = bool(held_keys[key])
        before = self._prev_speed[key]
        self._prev_speed[key] = now
        return now and not before

    def update(self, drone, dt: float, allow_vertical: bool = True) -> None:
        if not self.speed_locked:
            if self._pressed_once("1"):
                self.speed_index = 0
            if self._pressed_once("2"):
                self.speed_index = 1
            if self._pressed_once("3"):
                self.speed_index = 2
            if self._pressed_once("4"):
                self.speed_index = 3

            self.current_speed = self.speed_levels[self.speed_index]

        if held_keys["q"]:
            drone.yaw -= TURN_SPEED_DEG * dt
        if held_keys["e"] or held_keys["i"]:
            drone.yaw += TURN_SPEED_DEG * dt

        forward = drone.get_forward_vector()
        right = drone.get_right_vector()

        direction = np.array([0.0, 0.0, 0.0], dtype=np.float32)

        if held_keys["w"]:
            direction += forward
        if held_keys["s"]:
            direction -= forward
        if held_keys["d"]:
            direction += right
        if held_keys["a"]:
            direction -= right

        if allow_vertical:
            if held_keys["space"]:
                direction[1] += 1.0
            if held_keys["shift"] or held_keys["left shift"] or held_keys["right shift"]:
                direction[1] -= 1.0

        length = np.linalg.norm(direction)
        if length > 0:
            direction = direction / length

        drone.target_velocity = direction * self.current_speed
