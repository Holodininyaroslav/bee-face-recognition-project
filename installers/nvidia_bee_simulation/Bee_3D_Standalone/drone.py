import math
from dataclasses import dataclass, field

import numpy as np

from config import MOVEMENT_RESPONSE, START_HEIGHT


@dataclass
class Drone:
    """
    Координаты:
    x — влево/вправо
    y — высота
    z — вперед/назад
    """
    position: np.ndarray = field(
        default_factory=lambda: np.array([0.0, START_HEIGHT, 0.0], dtype=np.float32)
    )
    velocity: np.ndarray = field(
        default_factory=lambda: np.array([0.0, 0.0, 0.0], dtype=np.float32)
    )
    target_velocity: np.ndarray = field(
        default_factory=lambda: np.array([0.0, 0.0, 0.0], dtype=np.float32)
    )
    yaw_deg: float = 0.0

    @property
    def yaw(self) -> float:
        return self.yaw_deg

    @yaw.setter
    def yaw(self, value: float) -> None:
        self.yaw_deg = value

    def update(self, dt: float) -> None:
        blend = min(1.0, max(0.0, MOVEMENT_RESPONSE * dt))
        self.velocity += (self.target_velocity - self.velocity) * blend
        self.position += self.velocity * dt

    def get_forward_vector(self) -> np.ndarray:
        yaw_rad = math.radians(self.yaw_deg)
        return np.array(
            [math.sin(yaw_rad), 0.0, math.cos(yaw_rad)],
            dtype=np.float32,
        )

    def get_right_vector(self) -> np.ndarray:
        yaw_rad = math.radians(self.yaw_deg)
        return np.array(
            [math.cos(yaw_rad), 0.0, -math.sin(yaw_rad)],
            dtype=np.float32,
        )
