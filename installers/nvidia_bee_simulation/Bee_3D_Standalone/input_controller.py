import ctypes
import os
import time

import numpy as np
from ursina import held_keys

from config import SPEED_LEVELS, TURN_SPEED_DEG


_WINDOWS_VIRTUAL_KEYS = {
    "w": 0x57, "a": 0x41, "s": 0x53, "d": 0x44,
    "q": 0x51, "e": 0x45, "f": 0x46, "space": 0x20, "shift": 0x10,
    "left shift": 0xA0, "right shift": 0xA1,
    "1": 0x31, "2": 0x32, "3": 0x33, "4": 0x34,
}

_previous_key_state: dict[str, bool] = {}
_tap_active_until: dict[str, float] = {}


def is_key_down(key: str) -> bool:
    """Read physical movement keys even when the Windows layout is non-Latin."""
    if bool(held_keys[key]):
        return True
    now = time.monotonic()
    if now < _tap_active_until.get(key, 0.0):
        return True
    virtual_key = _WINDOWS_VIRTUAL_KEYS.get(key)
    if virtual_key is None or os.name != "nt":
        return False
    try:
        state = int(ctypes.windll.user32.GetAsyncKeyState(virtual_key))
        if state & 0x0001:
            _tap_active_until[key] = now + 0.15
            return True
        return bool(state & 0x8000)
    except Exception:
        return False


def was_key_pressed(key: str) -> bool:
    """Return True once for both Ursina events and short native key taps."""
    held = bool(held_keys[key])
    native_down = False
    native_pressed = False
    virtual_key = _WINDOWS_VIRTUAL_KEYS.get(key)
    if virtual_key is not None and os.name == "nt":
        try:
            state = int(ctypes.windll.user32.GetAsyncKeyState(virtual_key))
            native_down = bool(state & 0x8000)
            native_pressed = bool(state & 0x0001)
        except Exception:
            pass

    down = held or native_down
    before = _previous_key_state.get(key, False)
    _previous_key_state[key] = down
    return native_pressed or (down and not before)


class InputController:
    def __init__(self) -> None:
        self.speed_levels = list(SPEED_LEVELS)
        self.speed_index = 1
        self.current_speed = self.speed_levels[self.speed_index]
        self.speed_locked = False

        self._prev_speed = {key: False for key in ("1", "2", "3", "4")}

    def lock_speed(self, speed: float) -> None:
        self.current_speed = float(speed)
        self.speed_locked = True

    def _pressed_once(self, key: str) -> bool:
        now = is_key_down(key)
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

        if is_key_down("q"):
            drone.yaw -= TURN_SPEED_DEG * dt
        if is_key_down("e"):
            drone.yaw += TURN_SPEED_DEG * dt

        forward = drone.get_forward_vector()
        right = drone.get_right_vector()

        direction = np.array([0.0, 0.0, 0.0], dtype=np.float32)

        if is_key_down("w"):
            direction += forward
        if is_key_down("s"):
            direction -= forward
        if is_key_down("d"):
            direction += right
        if is_key_down("a"):
            direction -= right

        if allow_vertical:
            if is_key_down("space"):
                direction[1] += 1.0
            if is_key_down("shift") or is_key_down("left shift") or is_key_down("right shift"):
                direction[1] -= 1.0

        length = np.linalg.norm(direction)
        if length > 0:
            direction /= length

        drone.target_velocity = direction * self.current_speed
