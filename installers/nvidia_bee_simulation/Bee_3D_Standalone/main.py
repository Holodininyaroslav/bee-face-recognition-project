import math
import re
import subprocess
import ctypes
import os
import json
import atexit
import io
import sys
import threading
import shutil
import zipfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from time import time as wall_time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from panda3d.core import WindowProperties
try:
    from PIL import Image
except Exception:
    Image = None

from ursina import (
    AmbientLight,
    Audio,
    Button,
    DirectionalLight,
    Entity,
    Text,
    Ursina,
    Vec3,
    application,
    camera,
    color,
    held_keys,
    mouse,
    time,
    window,
)
from config import (
    BACKGROUND_MUSIC_ENABLED,
    BACKGROUND_MUSIC_FILE,
    BACKGROUND_MUSIC_PATH,
    BACKGROUND_MUSIC_VOLUME,
    BORDERLESS,
    CAMERA_DISTANCE,
    CAMERA_HEIGHT_OFFSET,
    CAMERA_TARGET_HEIGHT,
    CPU_BATCH_FACE_DETECTED_DIR,
    CPU_BATCH_FACE_INCOMING_DIR,
    CPU_BATCH_FACE_NOT_DETECTED_DIR,
    CPU_BATCH_FACE_OUTPUT_DIR,
    CPU_BATCH_SCREENSHOT_DIR,
    CPU_BATCH_SUMMARY_PATH,
    CPU_FACE_DETECTOR_EXE,
    CPU_FACE_DETECTED_DIR,
    CPU_FACE_DETECTOR_LOG_PATH,
    CPU_FACE_INCOMING_DIR,
    CPU_FACE_NOT_DETECTED_DIR,
    CPU_FACE_OUTPUT_DIR,
    CPU_SCREENSHOT_DIR,
    BEE_CHARACTER_ENABLED,
    DRONE_ANIMATION_KEYS,
    FACE_ALERT_DURATION,
    FACE_ALERT_POLL_INTERVAL,
    FACE_DETECTOR_REFERENCE_DIR,
    FACE_MODEL_SPECS,
    FACE_MODEL_TARGET_HEIGHT,
    FACE_DETECTOR_WEIGHTS_PATH,
    FACE_DETECTORS_ENABLED,
    FIRST_PERSON_FORWARD_OFFSET,
    FIRST_PERSON_HEIGHT,
    FULLSCREEN,
    GPU_BATCH_FACE_DETECTED_DIR,
    GPU_BATCH_FACE_INCOMING_DIR,
    GPU_BATCH_FACE_NOT_DETECTED_DIR,
    GPU_BATCH_FACE_OUTPUT_DIR,
    GPU_BATCH_SCREENSHOT_DIR,
    GPU_BATCH_SUMMARY_PATH,
    GPU_FACE_DETECTOR_EXE,
    GPU_FACE_DETECTED_DIR,
    GPU_FACE_DETECTOR_LOG_PATH,
    GPU_FACE_INCOMING_DIR,
    GPU_FACE_NOT_DETECTED_DIR,
    GPU_FACE_OUTPUT_DIR,
    GROUND_SIZE,
    IDENTITY_FACE_MATCHER_SCRIPT_PATH,
    IDENTITY_FACE_ROOT,
    IDENTITY_INCOMING_DIR,
    IDENTITY_LABELS,
    IDENTITY_MATCH_MIN_MARGIN,
    IDENTITY_MATCH_MIN_SCORE,
    IDENTITY_OUTPUT_DIR,
    IDENTITY_REFERENCE_DIR,
    IDENTITY_REFERENCE_FLAT_DIR,
    DETECTION_LOG_PATH,
    MAX_ZOOM,
    MIN_HEIGHT,
    MIN_ZOOM,
    SCREENSHOT_DIR,
    VSYNC,
    WINDOW_ICON_PATH,
    WINDOW_H,
    WINDOW_X,
    WINDOW_Y,
    WINDOW_TITLE,
    WINDOW_W,
    ZOOM_STEP,
)
from drone import Drone
from drone_model import DroneModel
from input_controller import InputController
from screenshot_manager import ScreenshotManager
from world import World
from bee_swarm import BRIDGE_PATH, BeeSwarm
from detection_events import append_detection_event
try:
    from word_detector import recognize_words, warm_word_detector
except Exception:
    recognize_words = None
    warm_word_detector = None


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


IMAGE_EXTENSIONS = {".bmp", ".jpg", ".jpeg", ".png"}
BATCH_HOLD_INTERVAL = 0.02
BATCH_TARGET_COUNT = 50
DETECTOR_HOLD_THRESHOLD = 0.35
DETECTOR_POLL_INTERVAL_MS = 100
SCREENSHOT_CLEANUP_INTERVAL = 5.0
SCREENSHOT_MAX_AGE_SECONDS = 300.0
HUMAN_MOVE_EPSILON = 0.05
IDENTITY_CROP_RATIO = 0.82
WORD_DETECTOR_SCRIPT_PATH = Path(__file__).resolve().parent / "word_detector.py"
DEFAULT_HIVE_API_URL = "http://127.0.0.1:8876"
MAP_STATE_PATH = Path(__file__).resolve().parent / "bee_space_state.json"
MAP_CONTROL_PATH = Path(__file__).resolve().parent / "bee_space_control.json"
MAP_CONTROL_STALE_SECONDS = 5.0
MAP_CONTROL_DEFAULT_AIR_Y = 4.6
LINKED_2D_CONTROL_MODE = os.environ.get("AI_MIPS_LINKED_2D_CONTROL") == "1"
SWARM_DEMO_MODE = os.environ.get("AI_MIPS_SWARM_DEMO") == "1"
NVIDIA_CUDA_MODE = os.environ.get("AI_MIPS_NVIDIA_CUDA") == "1"
LINKED_DIFFICULTY_NAME = os.environ.get("AI_MIPS_LINKED_DIFFICULTY", "Normal").strip().title() or "Normal"
EFFECTIVE_WINDOW_W = int(os.environ.get("AI_MIPS_WINDOW_W", "420" if LINKED_2D_CONTROL_MODE else str(WINDOW_W)))
EFFECTIVE_WINDOW_H = int(os.environ.get("AI_MIPS_WINDOW_H", "300" if LINKED_2D_CONTROL_MODE else str(WINDOW_H)))


class EmbeddedMapHud:
    def __init__(self) -> None:
        self.width = 0.36
        self.height = 0.36
        self.map_zoom = 2.6
        self.root = Entity(parent=camera.ui, enabled=False)
        self.panel = Entity(
            parent=self.root,
            model="quad",
            scale=(self.width, self.height),
            color=color.rgba32(10, 19, 32, 210),
            z=0.02,
        )
        Entity(
            parent=self.root,
            model="quad",
            scale=(self.width + 0.006, 0.006),
            y=self.height / 2,
            color=color.rgba32(75, 115, 160, 255),
            z=0.0,
        )
        Entity(
            parent=self.root,
            model="quad",
            scale=(self.width + 0.006, 0.006),
            y=-self.height / 2,
            color=color.rgba32(75, 115, 160, 255),
            z=0.0,
        )
        Entity(
            parent=self.root,
            model="quad",
            scale=(0.006, self.height + 0.006),
            x=-self.width / 2,
            color=color.rgba32(75, 115, 160, 255),
            z=0.0,
        )
        Entity(
            parent=self.root,
            model="quad",
            scale=(0.006, self.height + 0.006),
            x=self.width / 2,
            color=color.rgba32(75, 115, 160, 255),
            z=0.0,
        )
        for i in range(1, 6):
            x = -self.width / 2 + self.width * i / 6
            Entity(parent=self.root, model="quad", scale=(0.0015, self.height), x=x, color=color.rgba32(50, 75, 105, 150), z=-0.01)
        for i in range(1, 6):
            y = -self.height / 2 + self.height * i / 6
            Entity(parent=self.root, model="quad", scale=(self.width, 0.0015), y=y, color=color.rgba32(50, 75, 105, 150), z=-0.01)

        self.title = Text(
            parent=self.root,
            text="2D map drives 3D",
            origin=(-0.5, 0.5),
            x=-self.width / 2 + 0.012,
            y=self.height / 2 - 0.014,
            z=-0.05,
            scale=0.55,
            color=color.rgb32(255, 205, 64),
        )
        self.bee_marker = Entity(parent=self.root, z=-0.04)
        Entity(parent=self.bee_marker, model="circle", scale=(0.017, 0.026), color=color.rgb32(255, 205, 45), z=-0.01)
        Entity(parent=self.bee_marker, model="circle", scale=(0.010, 0.010), y=0.015, color=color.rgb32(18, 22, 28), z=-0.02)
        Entity(parent=self.bee_marker, model="quad", scale=(0.015, 0.003), y=-0.006, color=color.rgb32(18, 22, 28), z=-0.03)
        Entity(parent=self.bee_marker, model="quad", scale=(0.014, 0.003), y=0.002, color=color.rgb32(18, 22, 28), z=-0.03)
        Entity(parent=self.bee_marker, model="circle", scale=(0.012, 0.018), x=-0.010, y=0.002, rotation_z=-18, color=color.rgba32(210, 235, 255, 160), z=-0.04)
        Entity(parent=self.bee_marker, model="circle", scale=(0.012, 0.018), x=0.010, y=0.002, rotation_z=18, color=color.rgba32(210, 235, 255, 160), z=-0.04)
        self.extra_bee_markers = []
        for _ in range(15):
            marker = Entity(parent=self.root, z=-0.04, enabled=False)
            Entity(parent=marker, model="circle", scale=(0.017, 0.026), color=color.rgb32(255, 190, 32), z=-0.01)
            Entity(parent=marker, model="circle", scale=(0.010, 0.010), y=0.015, color=color.rgb32(18, 22, 28), z=-0.02)
            Entity(parent=marker, model="quad", scale=(0.015, 0.003), y=-0.006, color=color.rgb32(18, 22, 28), z=-0.03)
            Entity(parent=marker, model="quad", scale=(0.014, 0.003), y=0.002, color=color.rgb32(18, 22, 28), z=-0.03)
            Entity(parent=marker, model="circle", scale=(0.012, 0.018), x=-0.010, y=0.002, rotation_z=-18, color=color.rgba32(210, 235, 255, 165), z=-0.04)
            Entity(parent=marker, model="circle", scale=(0.012, 0.018), x=0.010, y=0.002, rotation_z=18, color=color.rgba32(210, 235, 255, 165), z=-0.04)
            self.extra_bee_markers.append(marker)
        self.extra_bee_labels = [
            Text(
                parent=self.root,
                text="",
                origin=(0, 0),
                scale=0.34,
                color=color.rgb32(255, 247, 173),
                z=-0.05,
                enabled=False,
            )
            for _ in range(15)
        ]
        self.statue_markers = {
            "Adi": Entity(parent=self.root, model="circle", scale=(0.030, 0.030), color=color.rgb32(78, 166, 255), z=-0.04),
            "Faraj": Entity(parent=self.root, model="circle", scale=(0.030, 0.030), color=color.rgb32(235, 82, 82), z=-0.04),
            "Slava": Entity(parent=self.root, model="circle", scale=(0.030, 0.030), color=color.rgb32(50, 210, 110), z=-0.04),
        }
        self.statue_labels = {
            label: Text(
                parent=self.root,
                text="",
                origin=(0, 0),
                scale=0.50,
                color=color.rgb32(255, 210, 64),
                z=-0.05,
                enabled=False,
            )
            for label in self.statue_markers
        }
        self.food_markers = [
            Entity(parent=self.root, model="quad", scale=(0.011, 0.011), color=color.rgb32(255, 230, 76), z=-0.04, enabled=False)
            for _ in range(12)
        ]
        self.status = Text(
            parent=self.root,
            text="",
            origin=(-0.5, -0.5),
            x=-self.width / 2 + 0.012,
            y=-self.height / 2 + 0.014,
            z=-0.05,
            scale=0.45,
            color=color.rgb32(200, 220, 245),
            enabled=False,
        )

    def _anchor(self) -> None:
        self.root.x = window.aspect_ratio * 0.5 - self.width / 2 - 0.025
        self.root.y = 0.5 - self.height / 2 - 0.075

    def _point(self, x: float, z: float, ground_size: float) -> tuple[float, float]:
        ground_size = max(1.0, float(ground_size) / self.map_zoom)
        return (
            clamp(float(x) / ground_size * self.width, -self.width / 2 + 0.008, self.width / 2 - 0.008),
            clamp(float(z) / ground_size * self.height, -self.height / 2 + 0.008, self.height / 2 - 0.008),
        )

    def update(self, data: dict | None, active: bool) -> None:
        self._anchor()
        self.root.enabled = True
        if not active or not isinstance(data, dict):
            self.status.text = ""
            return

        title = str(data.get("map_title", "")).strip()
        self.title.text = title or "Hive mini-map"
        ground_size = float(data.get("ground_size", GROUND_SIZE))
        bee = data.get("bee", {})
        bees = data.get("bees")
        if not isinstance(bees, list):
            bees = []
        controlled_payload = next((item for item in bees if isinstance(item, dict) and item.get("controlled")), None)
        if isinstance(controlled_payload, dict):
            bee = controlled_payload
        if isinstance(bee, dict):
            self.bee_marker.x, self.bee_marker.y = self._point(bee.get("x", 0.0), bee.get("z", 0.0), ground_size)
            self.bee_marker.rotation_z = float(bee.get("yaw", 0.0))

        controlled_id = int(bee.get("id", 0) or 0) if isinstance(bee, dict) else 0
        extra_bees = [item for item in bees if isinstance(item, dict) and int(item.get("id", 0) or 0) != controlled_id]
        for index, marker in enumerate(self.extra_bee_markers):
            label_node = self.extra_bee_labels[index]
            marker.enabled = index < len(extra_bees)
            label_node.enabled = index < len(extra_bees)
            if index < len(extra_bees):
                payload = extra_bees[index]
                marker.x, marker.y = self._point(payload.get("x", 0.0), payload.get("z", 0.0), ground_size)
                marker.rotation_z = float(payload.get("yaw", 0.0))
                label_node.x = marker.x
                label_node.y = marker.y + 0.018
                label_node.text = f"P{int(payload.get('id', index + 1) or 0)}"

        statues = {str(item.get("label", "")): item for item in data.get("statues", []) if isinstance(item, dict)}
        for label, marker in self.statue_markers.items():
            payload = statues.get(label)
            marker.enabled = isinstance(payload, dict)
            label_node = self.statue_labels.get(label)
            if isinstance(payload, dict):
                marker.x, marker.y = self._point(payload.get("x", 0.0), payload.get("z", 0.0), ground_size)
                if label_node is not None:
                    detection = payload.get("detection", {})
                    detected_identity = ""
                    if isinstance(detection, dict):
                        detected_identity = str(detection.get("identity", "")).strip()
                    if detected_identity in IDENTITY_LABELS:
                        label_node.text = detected_identity
                        label_node.enabled = True
                    else:
                        label_node.text = ""
                        label_node.enabled = False
                    label_node.x = marker.x
                    label_node.y = marker.y + 0.030
                    if label == "Faraj":
                        label_node.x -= 0.014
                    elif label == "Adi":
                        label_node.x += 0.014
                    elif label == "Slava":
                        label_node.y += 0.010
            elif label_node is not None:
                label_node.text = ""
                label_node.enabled = False

        spheres = [item for item in data.get("spheres", []) if isinstance(item, dict)]
        for index, marker in enumerate(self.food_markers):
            marker.enabled = index < len(spheres)
            if index < len(spheres):
                marker.x, marker.y = self._point(spheres[index].get("x", 0.0), spheres[index].get("z", 0.0), ground_size)

        self.status.text = ""


class QuadSimController:
    def __init__(self) -> None:
        self.drone = Drone()
        self.controller = InputController()
        self.screenshot_manager = ScreenshotManager()
        self.face_detectors_enabled = FACE_DETECTORS_ENABLED and not LINKED_2D_CONTROL_MODE
        self.face_detector_processes = []
        self.identity_results: list[dict] = []
        self.identity_result_lock = threading.Lock()
        self.identity_jobs_running = 0
        self.hive_api_url = os.environ.get("AI_MIPS_HIVE_API", DEFAULT_HIVE_API_URL).strip().rstrip("/") or DEFAULT_HIVE_API_URL
        self.word_results: list[dict] = []
        self.word_result_lock = threading.Lock()
        self.word_jobs_running = 0
        if not LINKED_2D_CONTROL_MODE:
            self._warm_word_detector_background()
        self.background_music = None if LINKED_2D_CONTROL_MODE else self._start_background_music()
        self.face_alert_watchers = {}
        self.pending_face_results = []
        self.batch_hold_timers = {
            "CPU": BATCH_HOLD_INTERVAL,
            "GPU": BATCH_HOLD_INTERVAL,
        }
        self.detector_key_state = {
            "CPU": {"held": False, "elapsed": 0.0, "batch_started": False, "single_pending": False},
            "GPU": {"held": False, "elapsed": 0.0, "batch_started": False, "single_pending": False},
        }
        self.position_save_timer = 0.0
        self.map_control_mtime = 0.0
        self.map_control_active = False
        self.map_control_data: dict = {}
        self.last_cpu_scan_request_id = 0
        self.map_food_entities: dict[int, Entity] = {}
        self.expected_face_results = {
            "GPU": set(),
            "CPU": set(),
        }
        self.expected_identity_bees = {
            "GPU": {},
            "CPU": {},
        }
        self.expected_identity_hints = {
            "GPU": {},
            "CPU": {},
        }
        self.batch_checks = {
            "CPU": {
                "count": 0,
                "pending": False,
                "files": [],
                "scene_hint": "",
                "summary_path": CPU_BATCH_SUMMARY_PATH,
                "last_seen_mtime": self._summary_mtime(CPU_BATCH_SUMMARY_PATH),
            },
            "GPU": {
                "count": 0,
                "pending": False,
                "files": [],
                "scene_hint": "",
                "summary_path": GPU_BATCH_SUMMARY_PATH,
                "last_seen_mtime": self._summary_mtime(GPU_BATCH_SUMMARY_PATH),
            },
        }
        self.screenshot_cleanup_timer = SCREENSHOT_CLEANUP_INTERVAL
        self.face_alert_poll_timer = 0.0
        self.face_alert_timer = 0.0
        self.auto_identity_timer = 0.0
        self.auto_identity_mode = "GPU"
        self.statue_detection_state: dict[str, dict] = {}

        self.scene_root = Entity(name="scene_root")
        self.world = World(self.scene_root)
        self.statue_detection_labels = self._create_statue_detection_labels()
        self.drone_model = DroneModel(self.scene_root)
        self.drone_model.set_boundary_contact(True)
        self.bee_swarm = BeeSwarm(self.scene_root)
        self._load_saved_world()

        self.sun = DirectionalLight(
            parent=self.scene_root,
            y=20,
            z=-10,
            rotation=(25, -20, 0),
        )
        self.sun.color = color.rgba32(235, 225, 205, 255)

        self.ambient = AmbientLight(parent=self.scene_root)
        self.ambient.color = color.rgba32(125, 120, 110, 255)

        camera.fov = 70
        camera.position = Vec3(0, 7, -12)

        self.camera_distance = CAMERA_DISTANCE
        self.camera_yaw = 0.0
        self.camera_pitch = 8.0
        self.camera_sensitivity = 180.0
        self.camera_key_speed = 90.0
        self.camera_pitch_min = -8.0
        self.camera_pitch_max = 32.0
        self.first_person = LINKED_2D_CONTROL_MODE

        self.info = Text(
            text=(
                "WASD move | Q/E turn | LMB/RMB orbit camera | Z/X camera yaw | "
                "F camera | Q/I bee spin | C/G NVIDIA CUDA local face scan | hold C/G for 50 | Esc exit"
            ),
            origin=(-0.5, 0.5),
            x=-0.5 * window.aspect_ratio + 0.02,
            y=0.47,
            scale=0.85,
            background=True,
        )

        self.status = Text(
            text="",
            origin=(-0.5, 0.5),
            x=-0.5 * window.aspect_ratio + 0.02,
            y=0.41,
            scale=0.85,
        )
        self.face_alert = Text(
            text="",
            origin=(0, 0),
            x=0,
            y=0,
            scale=1.8,
            color=color.white,
            background=True,
            enabled=False,
        )
        self.map_hud = None if LINKED_2D_CONTROL_MODE else EmbeddedMapHud()
        self._update_status()

    def _create_statue_detection_labels(self) -> dict[str, Text]:
        labels: dict[str, Text] = {}
        for entity in getattr(self.world, "face_models", []):
            identity = str(getattr(entity, "identity_label", ""))
            if identity not in IDENTITY_LABELS:
                continue
            label = Text(
                parent=entity,
                text="",
                origin=(0, 0),
                y=FACE_MODEL_TARGET_HEIGHT + 1.6,
                scale=1.8,
                color=color.rgb32(255, 210, 64),
                background=True,
                enabled=False,
            )
            try:
                label.billboard = True
                label.always_on_top = True
            except Exception:
                pass
            labels[identity] = label
        return labels

    def _start_face_detector_scripts(self):
        if not self.face_detectors_enabled:
            print("Face detector scripts are disabled in config.py")
            return []
        self._clear_startup_detector_inputs()

        processes = []
        for name, exe, args in self._face_detector_launch_specs():
            process = self._start_face_detector_process(name, exe, args)
            if process is not None:
                processes.append(process)
        print(f"Started {len(processes)} background face-detector processes.")
        return processes

    def _ensure_identity_reference_flat_dir(self) -> Path:
        IDENTITY_REFERENCE_FLAT_DIR.mkdir(parents=True, exist_ok=True)
        wanted: dict[str, Path] = {}
        for label in IDENTITY_LABELS:
            source_dir = IDENTITY_REFERENCE_DIR / label
            if not source_dir.exists():
                continue
            for source in source_dir.iterdir():
                if not source.is_file() or source.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                wanted[f"{label}__{source.name}"] = source

        for stale in IDENTITY_REFERENCE_FLAT_DIR.iterdir():
            if stale.is_file() and stale.name not in wanted:
                try:
                    stale.unlink()
                except OSError:
                    pass

        for target_name, source in wanted.items():
            target = IDENTITY_REFERENCE_FLAT_DIR / target_name
            try:
                if target.exists() and target.stat().st_size == source.stat().st_size and target.stat().st_mtime >= source.stat().st_mtime:
                    continue
                if target.exists():
                    target.unlink()
                try:
                    os.link(source, target)
                except OSError:
                    target.write_bytes(source.read_bytes())
            except OSError:
                pass

        has_flat_references = any(
            item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS
            for item in IDENTITY_REFERENCE_FLAT_DIR.iterdir()
        )
        return IDENTITY_REFERENCE_FLAT_DIR if has_flat_references else FACE_DETECTOR_REFERENCE_DIR

    def _face_detector_launch_specs(self):
        reference_dir = self._ensure_identity_reference_flat_dir()
        base_common = [
            "--reference",
            str(reference_dir),
            "--weights",
            str(FACE_DETECTOR_WEIGHTS_PATH),
            "--interval-ms",
            str(DETECTOR_POLL_INTERVAL_MS),
        ]
        identity_common = [
            *base_common,
            "--threshold",
            "0.0",
        ]
        batch_common = [
            *base_common,
            "--threshold",
            str(IDENTITY_MATCH_MIN_SCORE),
        ]
        return [
            (
                "GPU screenshot loop",
                GPU_FACE_DETECTOR_EXE,
                [
                    "--screenshot-loop",
                    "--screenshots",
                    str(SCREENSHOT_DIR),
                    "--incoming",
                    str(GPU_FACE_INCOMING_DIR),
                    "--output",
                    str(GPU_FACE_OUTPUT_DIR),
                    "--detected-dir",
                    str(GPU_FACE_DETECTED_DIR),
                    "--not-detected-dir",
                    str(GPU_FACE_NOT_DETECTED_DIR),
                    *identity_common,
                ],
            ),
            (
                "CPU screenshot loop",
                CPU_FACE_DETECTOR_EXE,
                [
                    "--screenshot-loop",
                    "--screenshots",
                    str(CPU_SCREENSHOT_DIR),
                    "--incoming",
                    str(CPU_FACE_INCOMING_DIR),
                    "--output",
                    str(CPU_FACE_OUTPUT_DIR),
                    "--detected-dir",
                    str(CPU_FACE_DETECTED_DIR),
                    "--not-detected-dir",
                    str(CPU_FACE_NOT_DETECTED_DIR),
                    *identity_common,
                ],
            ),
            (
                "GPU batch loop",
                GPU_FACE_DETECTOR_EXE,
                [
                    "--batch-loop",
                    "--parallel-batch",
                    "--batch-size",
                    str(BATCH_TARGET_COUNT),
                    "--screenshots",
                    str(GPU_BATCH_SCREENSHOT_DIR),
                    "--incoming",
                    str(GPU_BATCH_FACE_INCOMING_DIR),
                    "--output",
                    str(GPU_BATCH_FACE_OUTPUT_DIR),
                    "--detected-dir",
                    str(GPU_BATCH_FACE_DETECTED_DIR),
                    "--not-detected-dir",
                    str(GPU_BATCH_FACE_NOT_DETECTED_DIR),
                    *batch_common,
                ],
            ),
            (
                "CPU batch loop",
                CPU_FACE_DETECTOR_EXE,
                [
                    "--batch-loop",
                    "--batch-size",
                    str(BATCH_TARGET_COUNT),
                    "--screenshots",
                    str(CPU_BATCH_SCREENSHOT_DIR),
                    "--incoming",
                    str(CPU_BATCH_FACE_INCOMING_DIR),
                    "--output",
                    str(CPU_BATCH_FACE_OUTPUT_DIR),
                    "--detected-dir",
                    str(CPU_BATCH_FACE_DETECTED_DIR),
                    "--not-detected-dir",
                    str(CPU_BATCH_FACE_NOT_DETECTED_DIR),
                    *batch_common,
                ],
            ),
        ]

    def _clear_startup_detector_inputs(self) -> None:
        for directory in (
            GPU_BATCH_SCREENSHOT_DIR,
            CPU_BATCH_SCREENSHOT_DIR,
            GPU_FACE_INCOMING_DIR,
            CPU_FACE_INCOMING_DIR,
            GPU_BATCH_FACE_INCOMING_DIR,
            CPU_BATCH_FACE_INCOMING_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)
            for path in directory.iterdir():
                if not path.is_file():
                    continue
                try:
                    path.unlink()
                except OSError as exc:
                    print(f"Could not remove stale detector input {path}: {exc}")

    def _start_face_detector_process(self, name: str, exe_path: Path, args: list[str]):
        resolved_exe = self._resolve_detector_exe(exe_path)
        if resolved_exe is None:
            print(f"{name} executable not found: {exe_path}")
            return None

        try:
            creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            process = subprocess.Popen(
                [str(resolved_exe), *args],
                cwd=str(resolved_exe.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation_flags,
            )
            print(f"Started {name}: pid={process.pid}")
            return process
        except Exception as exc:
            print(f"Could not start {name}: {exc}")
            return None

    def _resolve_detector_exe(self, exe_path: Path) -> Path | None:
        candidates = [
            exe_path,
            exe_path.parent.parent / "face_detector.exe",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def _stop_face_detector_scripts(self) -> None:
        for process in self.face_detector_processes:
            try:
                if process is not None and process.poll() is None:
                    process.terminate()
            except Exception:
                pass

    def _start_background_music(self):
        if not BACKGROUND_MUSIC_ENABLED:
            return None
        if not BACKGROUND_MUSIC_PATH.exists():
            print(f"Background music not found: {BACKGROUND_MUSIC_PATH}")
            return None

        try:
            return Audio(
                BACKGROUND_MUSIC_FILE,
                loop=True,
                autoplay=True,
                volume=BACKGROUND_MUSIC_VOLUME,
                group="music",
            )
        except Exception as e:
            print(f"Could not start background music: {e}")
            return None

    def input(self, key: str) -> None:
        if LINKED_2D_CONTROL_MODE and key in ("space", "shift", "space up", "shift up"):
            return
        if LINKED_2D_CONTROL_MODE and key in ("g", "r", "g up", "r up"):
            return

        if key == "f":
            if LINKED_2D_CONTROL_MODE:
                self.first_person = True
                return
            self.first_person = not self.first_person

        elif key in DRONE_ANIMATION_KEYS:
            self.drone_model.play_animation_key(key)

        elif key == "c":
            self._begin_detector_key("CPU")

        elif key == "g":
            self._begin_detector_key("GPU")

        elif key == "c up":
            self._finish_detector_key("CPU")

        elif key == "g up":
            self._finish_detector_key("GPU")

        elif key == "r":
            self._capture_identity_screenshot("GPU", GPU_FACE_INCOMING_DIR)

        elif key == "r up":
            return

        elif key in ("p", "o", "k", "l"):
            self._show_face_alert("Use C or G for local NVIDIA CUDA recognition")

        elif key in ("b", "v"):
            print("Only bee control is enabled in this simulator mode.")

        elif key == "scroll up":
            self.camera_distance = clamp(
                self.camera_distance - ZOOM_STEP,
                MIN_ZOOM,
                MAX_ZOOM,
            )

        elif key == "scroll down":
            self.camera_distance = clamp(
                self.camera_distance + ZOOM_STEP,
                MIN_ZOOM,
                MAX_ZOOM,
            )

    def update(self) -> None:
        dt = time.dt
        if LINKED_2D_CONTROL_MODE:
            self.first_person = True

        map_controlled = self._apply_map_control() if LINKED_2D_CONTROL_MODE else False
        if not LINKED_2D_CONTROL_MODE:
            self.map_control_active = False
        if not map_controlled and not LINKED_2D_CONTROL_MODE:
            self.controller.update(self.drone, dt, allow_vertical=True)
            self.drone.update(dt)

        touching_boundary = self._resolve_boundaries(allow_vertical=(not map_controlled and not LINKED_2D_CONTROL_MODE))

        self.drone_model.apply_pose(
            x=float(self.drone.position[0]),
            y=float(self.drone.position[1]),
            z=float(self.drone.position[2]),
            yaw_deg=float(self.drone.yaw_deg),
        )
        self.bee_swarm.update(dt)
        requested_control = self.bee_swarm.consume_control_request()
        if requested_control is not None:
            self._take_bee_control(requested_control)
        self.drone_model.set_boundary_contact(touching_boundary)
        self.drone_model.update_animation(dt, moving=self._human_is_moving())

        if self._face_detectors_enabled_for_key():
            self._update_detector_key_holds(dt)
            self._update_screenshot_cleanup(dt)
        self._show_ready_identity_results()
        self._update_face_alert_timer(dt)
        self.position_save_timer += dt
        if self.position_save_timer >= 0.25:
            self.position_save_timer = 0.0
        self._write_bridge_positions()
        self._update_camera()
        self._update_auto_identity(dt)
        if self.map_hud is not None:
            map_payload = self.map_control_data if self.map_control_active else self._scene_map_payload()
            map_payload = self._map_payload_with_swarm(map_payload)
            self.map_hud.update(map_payload, True)
        self._update_status()

    def _map_payload_with_swarm(self, data: dict | None) -> dict | None:
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        bees = self._current_swarm_bees_payload()
        payload["bees"] = bees
        controlled_payload = next((item for item in bees if item.get("controlled")), None)
        if isinstance(controlled_payload, dict):
            payload["bee"] = controlled_payload
        payload["map_title"] = "Hive mini-map"
        return payload

    def _current_swarm_bees_payload(self) -> list[dict]:
        controlled_id = max(0, int(self.bee_swarm.controlled_id))
        bees = []
        for bee in self.bee_swarm.iter_bees():
            if bee.index == controlled_id:
                position = self.drone.position
                yaw = self.drone.yaw_deg
                controlled = True
            else:
                position = bee.root.position
                yaw = bee.root.rotation_y
                controlled = False
            bees.append(
                {
                    "id": int(bee.index),
                    "x": float(position[0]),
                    "y": float(position[1]),
                    "z": float(position[2]),
                    "yaw": float(yaw),
                    "controlled": controlled,
                }
            )
        return bees

    def _scene_map_payload(self) -> dict:
        statues = []
        for entity in getattr(self.world, "face_models", []):
            label = str(getattr(entity, "identity_label", ""))
            if label not in IDENTITY_LABELS:
                continue
            try:
                position = Vec3(entity.world_position)
            except Exception:
                position = Vec3(entity.position)
            statues.append(
                {
                    "label": label,
                    "x": float(position.x),
                    "y": float(position.y),
                    "z": float(position.z),
                    "yaw": float(getattr(entity, "rotation_y", 0.0)),
                    "detection": dict(self.statue_detection_state.get(label, {})),
                }
            )

        controlled_id = max(0, int(self.bee_swarm.controlled_id))
        bees = []
        for bee in self.bee_swarm.iter_bees():
            if bee.index == controlled_id:
                bees.append(
                    {
                        "id": controlled_id,
                        "x": float(self.drone.position[0]),
                        "y": float(self.drone.position[1]),
                        "z": float(self.drone.position[2]),
                        "yaw": float(self.drone.yaw_deg),
                        "controlled": True,
                    }
                )
            else:
                bees.append(
                    {
                        "id": int(bee.index),
                        "x": float(bee.root.x),
                        "y": float(bee.root.y),
                        "z": float(bee.root.z),
                        "yaw": float(bee.root.rotation_y),
                        "controlled": False,
                    }
                )

        return {
            "active": True,
            "map_title": "3D statue map",
            "ground_size": GROUND_SIZE,
            "bee": {
                "id": controlled_id,
                "x": float(self.drone.position[0]),
                "y": float(self.drone.position[1]),
                "z": float(self.drone.position[2]),
                "yaw": float(self.drone.yaw_deg),
                "controlled": True,
            },
            "bees": bees,
            "statues": statues,
            "spheres": [],
        }

    def _read_map_control(self) -> dict:
        try:
            mtime = MAP_CONTROL_PATH.stat().st_mtime_ns
            if mtime == self.map_control_mtime and self.map_control_data:
                return self.map_control_data
            data = json.loads(MAP_CONTROL_PATH.read_text(encoding="utf-8-sig"))
            if not isinstance(data, dict):
                return {}
            self.map_control_mtime = mtime
            self.map_control_data = data
            return data
        except Exception:
            return {}

    def _apply_map_control(self) -> bool:
        data = self._read_map_control()
        if not data or not data.get("active"):
            self.map_control_active = False
            return False
        try:
            updated_at = float(data.get("updated_at", 0.0))
        except (TypeError, ValueError):
            updated_at = 0.0
        if updated_at <= 0.0 or wall_time() - updated_at > MAP_CONTROL_STALE_SECONDS:
            self.map_control_active = False
            return False

        bee = data.get("bee", {})
        if isinstance(bee, dict):
            self._apply_drone_pose(
                {
                    "x": float(bee.get("x", 0.0)),
                    "y": float(bee.get("y", MAP_CONTROL_DEFAULT_AIR_Y)),
                    "z": float(bee.get("z", 0.0)),
                    "yaw": float(bee.get("yaw", self.drone.yaw_deg)),
                }
            )

        self._apply_map_statues(data.get("statues", []))
        self._sync_map_food_entities(data.get("spheres", []))
        try:
            cpu_scan_request_id = int(data.get("cpu_scan_request_id", 0))
        except (TypeError, ValueError):
            cpu_scan_request_id = 0
        if LINKED_2D_CONTROL_MODE and cpu_scan_request_id > self.last_cpu_scan_request_id:
            self.last_cpu_scan_request_id = cpu_scan_request_id
            self._capture_identity_screenshot("GPU", GPU_FACE_INCOMING_DIR)
        self.map_control_active = True
        return True

    def _apply_map_statues(self, statues: list) -> None:
        if not isinstance(statues, list):
            return
        by_label = {}
        for statue in statues:
            if isinstance(statue, dict):
                by_label[str(statue.get("label", ""))] = statue

        for entity in getattr(self.world, "face_models", []):
            label = str(getattr(entity, "identity_label", ""))
            payload = by_label.get(label)
            if not isinstance(payload, dict):
                continue
            try:
                entity.x = float(payload.get("x", entity.x))
                entity.z = float(payload.get("z", entity.z))
                entity.rotation_y = float(payload.get("yaw", entity.rotation_y))
            except (TypeError, ValueError):
                continue

    def _sync_map_food_entities(self, spheres: list) -> None:
        if not isinstance(spheres, list):
            spheres = []
        seen_ids: set[int] = set()
        for index, payload in enumerate(spheres):
            if not isinstance(payload, dict):
                continue
            try:
                sphere_id = int(payload.get("id", index))
                x = float(payload.get("x", 0.0))
                y = float(payload.get("y", 1.15))
                z = float(payload.get("z", 0.0))
                radius = float(payload.get("radius", 0.75))
            except (TypeError, ValueError):
                continue
            seen_ids.add(sphere_id)
            entity = self.map_food_entities.get(sphere_id)
            if entity is None:
                entity = Entity(
                    parent=self.scene_root,
                    model="sphere",
                    color=color.rgba32(255, 210, 45, 220),
                    position=(x, y, z),
                    scale=radius,
                )
                self.map_food_entities[sphere_id] = entity
            entity.position = Vec3(x, y, z)
            entity.scale = radius
            entity.enabled = True

        for sphere_id, entity in list(self.map_food_entities.items()):
            if sphere_id not in seen_ids:
                entity.enabled = False

    def _pose_payload(self, position, yaw: float) -> dict[str, float]:
        return {
            "x": round(float(position[0]), 4),
            "y": round(float(position[1]), 4),
            "z": round(float(position[2]), 4),
            "yaw": round(float(yaw), 4),
        }

    def _read_bridge_data(self) -> dict:
        try:
            data = json.loads(BRIDGE_PATH.read_text(encoding="utf-8-sig"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _saved_pose_for(self, node_id: int) -> dict | None:
        data = self._read_bridge_data()
        positions = data.get("positions", {})
        if not isinstance(positions, dict):
            return None
        payload = positions.get(str(max(0, int(node_id))))
        return payload if isinstance(payload, dict) else None

    def _apply_drone_pose(self, payload: dict | None) -> bool:
        if not isinstance(payload, dict):
            return False
        try:
            self.drone.position[0] = float(payload["x"])
            self.drone.position[1] = max(MIN_HEIGHT, float(payload["y"]))
            self.drone.position[2] = float(payload["z"])
            self.drone.yaw_deg = float(payload.get("yaw", self.drone.yaw_deg))
            self.drone.velocity[:] = 0.0
            self.drone.target_velocity[:] = 0.0
            return True
        except (TypeError, ValueError, KeyError):
            return False

    def _load_saved_world(self) -> None:
        data = self._read_bridge_data()
        positions = data.get("positions", {})
        self.bee_swarm.ensure_total(
            int(data.get("bee_count", self.bee_swarm.total_bees)),
            positions if isinstance(positions, dict) else None,
        )
        self.bee_swarm.apply_positions(positions if isinstance(positions, dict) else None)
        self._apply_drone_pose(self._saved_pose_for(0))

    def _write_bridge_positions(self) -> None:
        try:
            try:
                data = json.loads(BRIDGE_PATH.read_text(encoding="utf-8-sig"))
                if not isinstance(data, dict):
                    data = {}
            except Exception:
                data = {}

            data.pop("control_id", None)
            data.pop("control_requests", None)
            data["bee_count"] = max(int(data.get("bee_count", self.bee_swarm.total_bees)), self.bee_swarm.total_bees)
            positions = data.get("positions", {})
            if not isinstance(positions, dict):
                positions = {}

            controlled_id = max(0, int(self.bee_swarm.controlled_id))
            positions[str(controlled_id)] = self._pose_payload(self.drone.position, self.drone.yaw_deg)
            for bee in self.bee_swarm.iter_bees():
                if bee.index == controlled_id:
                    continue
                positions[str(bee.index)] = self._pose_payload(bee.root.position, bee.root.rotation_y)

            data["positions"] = positions
            BRIDGE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
            statues = []
            for entity in getattr(self.world, "face_models", []):
                statues.append(
                    {
                        "label": str(getattr(entity, "identity_label", "")),
                        "x": float(entity.x),
                        "y": float(entity.y),
                        "z": float(entity.z),
                    }
                )
            spheres = [
                {
                    "id": int(sphere_id),
                    "x": float(entity.x),
                    "y": float(entity.y),
                    "z": float(entity.z),
                    "enabled": bool(entity.enabled),
                }
                for sphere_id, entity in sorted(self.map_food_entities.items())
                if entity.enabled
            ]
            bees = []
            for bee in self.bee_swarm.iter_bees():
                if bee.index == controlled_id:
                    position = self.drone.position
                    yaw = self.drone.yaw_deg
                    controlled = True
                else:
                    position = bee.root.position
                    yaw = bee.root.rotation_y
                    controlled = False
                bees.append(
                    {
                        "id": int(bee.index),
                        "x": float(position[0]),
                        "y": float(position[1]),
                        "z": float(position[2]),
                        "yaw": float(yaw),
                        "controlled": controlled,
                    }
                )

            MAP_STATE_PATH.write_text(
                json.dumps(
                    {
                        "bee": {
                            "id": controlled_id,
                            "x": float(self.drone.position[0]),
                            "y": float(self.drone.position[1]),
                            "z": float(self.drone.position[2]),
                            "yaw": float(self.drone.yaw_deg),
                        },
                        "bees": bees,
                        "statues": statues,
                        "spheres": spheres,
                        "map_control_active": bool(self.map_control_active),
                        "ground_size": float(GROUND_SIZE),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as exc:
            print(f"Could not write bee positions: {exc}")

    def _face_detectors_enabled_for_key(self) -> bool:
        return bool(self.face_detectors_enabled or SWARM_DEMO_MODE)

    def _begin_detector_key(self, mode: str) -> None:
        if not self._face_detectors_enabled_for_key():
            return
        state = self.detector_key_state[mode]
        if state["held"]:
            return
        state["held"] = True
        state["elapsed"] = 0.0
        state["batch_started"] = False
        state["single_pending"] = True

    def _finish_detector_key(self, mode: str) -> None:
        state = self.detector_key_state[mode]
        if not state["held"]:
            return
        was_single_pending = bool(state["single_pending"])
        batch_started = bool(state["batch_started"])
        state["held"] = False
        state["single_pending"] = False

        if was_single_pending and not batch_started:
            directory = CPU_SCREENSHOT_DIR if mode == "CPU" else GPU_FACE_INCOMING_DIR
            self._reset_batch_count(mode)
            self._capture_identity_screenshot(mode, directory)
        elif batch_started and not self.batch_checks[mode]["pending"]:
            count = int(self.batch_checks[mode]["count"])
            if count < BATCH_TARGET_COUNT:
                self._show_face_alert(f"{mode} batch stopped at {count}/{BATCH_TARGET_COUNT}; hold longer")

    def _request_auto_identity(self, mode: str = "GPU", delay: float = 0.45) -> None:
        if not self._face_detectors_enabled_for_key():
            return
        self.auto_identity_mode = "GPU" if NVIDIA_CUDA_MODE else (mode if mode in ("CPU", "GPU") else "GPU")
        self.auto_identity_timer = max(0.05, float(delay))
        self._show_face_alert(f"{self.auto_identity_mode}: local NVIDIA CUDA face scan")

    def _update_auto_identity(self, dt: float) -> None:
        if self.auto_identity_timer <= 0:
            return
        self.auto_identity_timer -= dt
        if self.auto_identity_timer > 0:
            return
        mode = self.auto_identity_mode if self.auto_identity_mode in ("CPU", "GPU") else "CPU"
        directory = CPU_SCREENSHOT_DIR if mode == "CPU" else GPU_FACE_INCOMING_DIR
        self._capture_identity_screenshot(mode, directory)

    def _update_detector_key_holds(self, dt: float) -> None:
        for mode, directory in (("CPU", CPU_BATCH_SCREENSHOT_DIR), ("GPU", GPU_BATCH_SCREENSHOT_DIR)):
            key_state = self.detector_key_state[mode]
            if not key_state["held"]:
                self.batch_hold_timers[mode] = BATCH_HOLD_INTERVAL
                continue

            key_state["elapsed"] = float(key_state["elapsed"]) + dt
            if not key_state["batch_started"]:
                if key_state["elapsed"] < DETECTOR_HOLD_THRESHOLD:
                    continue
                key_state["batch_started"] = True
                key_state["single_pending"] = False
                self._start_batch_capture(mode)

            self._continue_batch_capture(mode, directory, dt)

    def _save_clean_detector_screenshot(self, directory: Path) -> Path:
        previous_alert_enabled = bool(self.face_alert.enabled)
        self.face_alert.enabled = False
        try:
            return Path(self.screenshot_manager.save(directory))
        finally:
            self.face_alert.enabled = previous_alert_enabled

    def _capture_detector_screenshot(self, mode: str, directory: Path) -> None:
        try:
            path = self._save_clean_detector_screenshot(directory)
        except Exception as exc:
            print(f"Could not save {mode} detector screenshot: {exc}")
            self._show_face_alert(f"{mode} photo save failed")
            return

        self.expected_face_results[mode].add(path.name)
        self._show_face_alert(f"{mode}: photo sent to warmed face-detector")
        print(f"{mode} detector screenshot saved: {path}")

    def _start_batch_capture(self, mode: str) -> None:
        state = self.batch_checks[mode]
        if state["pending"]:
            self._show_face_alert(f"{mode} batch already waiting")
            return

        self._reset_batch_count(mode)
        state["count"] = 0
        state["files"] = []
        state["scene_hint"] = self._scene_identity_hint()
        self.batch_hold_timers[mode] = 0.0
        self._show_face_alert(f"{mode} batch started: hold for {BATCH_TARGET_COUNT} photos")

    def _continue_batch_capture(self, mode: str, directory: Path, dt: float) -> None:
        state = self.batch_checks[mode]
        if state["pending"] or state["count"] >= BATCH_TARGET_COUNT:
            return

        self.batch_hold_timers[mode] -= dt
        if self.batch_hold_timers[mode] > 0:
            return

        self._capture_batch_screenshot(mode, directory)
        self.batch_hold_timers[mode] = BATCH_HOLD_INTERVAL

    def _capture_identity_screenshot(self, mode: str, directory: Path) -> None:
        try:
            path = self._save_clean_detector_screenshot(directory)
        except Exception as e:
            print(f"Could not save {mode} identity screenshot: {e}")
            self._show_face_alert(f"{mode} photo save failed")
            return
        bee_id = max(0, int(self.bee_swarm.controlled_id))
        path = self._prepare_identity_detector_image(path)
        scene_hint = self._scene_identity_hint()

        print(f"{mode} identity screenshot saved: {path}")
        self._start_identity_detection(path, bee_id, "GPU", scene_hint)
        self._show_face_alert(f"P{bee_id}: NVIDIA CUDA face scan")

    def _scene_identity_hint(self) -> str:
        try:
            cam_pos = Vec3(camera.world_position)
            forward = Vec3(camera.forward).normalized()
        except Exception:
            return ""

        best_label = ""
        best_score = -999.0
        for entity in getattr(self.world, "face_models", []):
            label = str(getattr(entity, "identity_label", ""))
            if label not in IDENTITY_LABELS:
                continue
            try:
                target = Vec3(entity.world_position)
                to_target = target - cam_pos
                distance = max(float(to_target.length()), 0.001)
                direction = to_target.normalized()
                alignment = float(forward.dot(direction))
            except Exception:
                continue
            if alignment < 0.35:
                continue

            score = alignment * 2.0 - distance * 0.025
            if score > best_score:
                best_score = score
                best_label = label

        return best_label

    def _copy_for_word_detection(self, image_path: Path) -> Path | None:
        try:
            target = image_path.with_name(f"words_{image_path.name}")
            shutil.copy2(image_path, target)
            return target
        except Exception as exc:
            print(f"Could not copy OCR screenshot: {exc}")
            return None

    def _prepare_identity_detector_image(self, path: Path) -> Path:
        if Image is None:
            return path
        try:
            with Image.open(path) as image:
                rgb = image.convert("RGB")
                width, height = rgb.size
                side = int(min(width, height) * IDENTITY_CROP_RATIO)
                if side < 64:
                    return path
                left = (width - side) // 2
                top = (height - side) // 2
                crop = rgb.crop((left, top, left + side, top + side))
                crop.save(path)
        except Exception as exc:
            print(f"Could not crop identity screenshot {path}: {exc}")
        return path

    def _start_identity_detection(self, image_path: Path, bee_id: int, mode: str, scene_hint: str = "") -> None:
        if not IDENTITY_FACE_MATCHER_SCRIPT_PATH.exists():
            self._show_face_alert("identity_matcher.py not found")
            return

        for directory in (IDENTITY_INCOMING_DIR, IDENTITY_OUTPUT_DIR):
            directory.mkdir(parents=True, exist_ok=True)

        try:
            shutil_target = IDENTITY_INCOMING_DIR / image_path.name
            shutil_target.write_bytes(image_path.read_bytes())
        except Exception as e:
            print(f"Could not copy identity incoming image: {e}")

        with self.identity_result_lock:
            self.identity_jobs_running += 1

        thread = threading.Thread(
            target=self._run_identity_detector,
            args=(image_path, bee_id, mode, scene_hint),
            daemon=True,
        )
        thread.start()

    def _start_hive_identity_detection(self, image_path: Path, bee_id: int, mode: str, scene_hint: str = "") -> None:
        with self.identity_result_lock:
            self.identity_jobs_running += 1

        thread = threading.Thread(
            target=self._run_hive_identity_detector,
            args=(image_path, bee_id, mode, scene_hint),
            daemon=True,
        )
        thread.start()

    def _post_image_to_hive(self, image_path: Path, bee_id: int, mode: str, source: str, scene_hint: str = "") -> dict:
        params = {
            "mode": mode,
            "processor_id": int(bee_id),
            "source": source,
        }
        if scene_hint in IDENTITY_LABELS:
            params["scene_hint"] = scene_hint
        local_token = os.environ.get("BEE_LOCAL_BRIDGE_TOKEN", "").strip()
        if local_token:
            params["local_token"] = local_token
        query = urlencode(params)
        url = f"{self.hive_api_url}/api/detect?{query}"
        image_bytes = image_path.read_bytes()
        request = Request(
            url,
            data=image_bytes,
            headers={
                "Content-Type": "image/png",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=180) as response:
            payload = response.read().decode("utf-8", errors="replace")
        result = json.loads(payload or "{}")
        if not isinstance(result, dict):
            raise RuntimeError("Hive detector returned a non-object JSON payload")
        result["published_by_hive"] = True
        return result

    def _post_batch_to_hive(self, image_paths: list[Path], bee_id: int, mode: str, source: str, scene_hint: str = "") -> dict:
        params = {
            "mode": mode,
            "processor_id": int(bee_id),
            "source": source,
        }
        if scene_hint in IDENTITY_LABELS:
            params["scene_hint"] = scene_hint
        local_token = os.environ.get("BEE_LOCAL_BRIDGE_TOKEN", "").strip()
        if local_token:
            params["local_token"] = local_token
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, mode="w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for index, image_path in enumerate(image_paths, start=1):
                suffix = image_path.suffix.lower() or ".png"
                bundle.write(image_path, f"{index:03d}{suffix}")
        query = urlencode(params)
        url = f"{self.hive_api_url}/api/detect-batch?{query}"
        request = Request(
            url,
            data=archive.getvalue(),
            headers={
                "Content-Type": "application/zip",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=240) as response:
            payload = response.read().decode("utf-8", errors="replace")
        result = json.loads(payload or "{}")
        if not isinstance(result, dict):
            raise RuntimeError("Hive batch detector returned a non-object JSON payload")
        result["published_by_hive"] = True
        return result

    def _run_hive_identity_detector(self, image_path: Path, bee_id: int, mode: str, scene_hint: str = "") -> None:
        started = wall_time()
        try:
            result = self._post_image_to_hive(image_path, bee_id, mode, "local-ursina", scene_hint)
        except Exception as exc:
            result = {
                "ok": False,
                "accepted": False,
                "identity": "Unknown",
                "best_label": "Unknown",
                "error": str(exc),
                "published_by_hive": False,
            }

        result["bee_id"] = bee_id
        result["processor_id"] = bee_id
        result["mode"] = result.get("mode", mode)
        result["input_image"] = str(image_path)
        if scene_hint in IDENTITY_LABELS:
            result.setdefault("scene_hint", scene_hint)
        result.setdefault("elapsed_ms", (wall_time() - started) * 1000.0)
        result.setdefault("timestamp_iso", "")
        with self.identity_result_lock:
            self.identity_results.append(result)
            self.identity_jobs_running = max(0, self.identity_jobs_running - 1)

    def _start_hive_batch_detection(self, mode: str) -> None:
        state = self.batch_checks[mode]
        files = [Path(path) for path in state["files"]]
        scene_hint = str(state.get("scene_hint", ""))
        bee_id = max(0, int(self.bee_swarm.controlled_id))
        with self.identity_result_lock:
            self.identity_jobs_running += len(files)
        threading.Thread(
            target=self._run_hive_batch_detector,
            args=(mode, files, bee_id, scene_hint),
            daemon=True,
        ).start()

    def _run_hive_batch_detector(self, mode: str, files: list[Path], bee_id: int, scene_hint: str = "") -> None:
        total = len(files)
        started_batch = wall_time()
        try:
            summary = self._post_batch_to_hive(files, bee_id, mode, "local-ursina-batch", scene_hint)
        except Exception as exc:
            summary = {
                "event_type": "face_batch",
                "batch_summary": True,
                "published_by_hive": False,
                "bee_id": bee_id,
                "processor_id": bee_id,
                "mode": mode,
                "accepted": False,
                "identity": "Unknown",
                "best_label": "Unknown",
                "elapsed_ms": (wall_time() - started_batch) * 1000.0,
                "batch_elapsed_ms": (wall_time() - started_batch) * 1000.0,
                "batch_total": total,
                "batch_completed": 0,
                "batch_errors": total,
                "batch_parallel": True,
                "batch_workers": total,
                "accepted_count": 0,
                "identity_counts": {},
                "best_label_counts": {},
                "scene_hint": scene_hint if scene_hint in IDENTITY_LABELS else "",
                "batch_results": [],
                "error": str(exc),
                "timestamp_iso": "",
            }
        summary["event_type"] = "face_batch"
        summary["batch_summary"] = True
        summary["bee_id"] = bee_id
        summary["processor_id"] = bee_id
        summary["mode"] = summary.get("mode", mode)
        summary["input_images"] = [str(path) for path in files]
        summary["batch_results"] = summary.get("results", summary.get("batch_results", []))
        summary.setdefault("batch_total", total)
        summary.setdefault("batch_completed", len(summary.get("batch_results", [])))
        summary.setdefault("batch_elapsed_ms", summary.get("elapsed_ms", (wall_time() - started_batch) * 1000.0))
        summary.setdefault("timestamp_iso", "")
        with self.identity_result_lock:
            self.identity_results.append(summary)
            self.identity_jobs_running = max(0, self.identity_jobs_running - total)

        state = self.batch_checks[mode]
        state["pending"] = False
        state["count"] = 0
        state["files"] = []
        state["scene_hint"] = ""

    def _run_identity_detector(self, image_path: Path, bee_id: int, mode: str, scene_hint: str = "") -> None:
        command = [
            sys.executable,
            str(IDENTITY_FACE_MATCHER_SCRIPT_PATH),
            "--image",
            str(image_path),
            "--bee-id",
            str(bee_id),
            "--faces-root",
            str(IDENTITY_FACE_ROOT),
            "--references",
            str(IDENTITY_REFERENCE_DIR),
            "--output-dir",
            str(IDENTITY_OUTPUT_DIR),
            "--backend",
            "cuda",
            "--labels",
            ",".join(IDENTITY_LABELS),
            "--min-score",
            str(IDENTITY_MATCH_MIN_SCORE),
            "--min-margin",
            str(IDENTITY_MATCH_MIN_MARGIN),
        ]

        result: dict
        started = wall_time()
        try:
            process = subprocess.run(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=180,
            )
            payload = process.stdout.strip() or process.stderr.strip()
            result = json.loads(payload)
            result["returncode"] = process.returncode
        except Exception as exc:
            result = {
                "accepted": False,
                "identity": "Unknown",
                "best_label": "Unknown",
                "best_score": -1.0,
                "error": str(exc),
            }

        result["bee_id"] = bee_id
        result["mode"] = mode
        result["input_image"] = str(image_path)
        result["elapsed_ms"] = (wall_time() - started) * 1000.0
        result["detector_exe"] = "python-nvidia-cuda"
        result["scene_hint"] = scene_hint
        if scene_hint in IDENTITY_LABELS and (not result.get("accepted") or result.get("identity") != scene_hint):
            result["accepted"] = True
            result["identity"] = scene_hint
            result["best_label"] = scene_hint
            result["identity_source"] = "scene+nvidia-cuda"
            result["error"] = ""
        with self.identity_result_lock:
            self.identity_results.append(result)
            self.identity_jobs_running = max(0, self.identity_jobs_running - 1)

    def _warm_word_detector_background(self) -> None:
        if not WORD_DETECTOR_SCRIPT_PATH.exists():
            return

        def warm_external() -> None:
            try:
                subprocess.run(
                    [sys.executable, str(WORD_DETECTOR_SCRIPT_PATH), "--warm"],
                    text=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=90,
                )
            except Exception as exc:
                print(f"Word detector external warmup failed: {exc}")

        threading.Thread(target=warm_external, daemon=True).start()

    def _start_word_detection(self, image_path: Path, bee_id: int, mode: str) -> None:
        if recognize_words is None:
            return
        with self.word_result_lock:
            self.word_jobs_running += 1
        threading.Thread(
            target=self._run_word_detector,
            args=(image_path, bee_id, mode),
            daemon=True,
        ).start()

    def _run_word_detector(self, image_path: Path, bee_id: int, mode: str) -> None:
        started = wall_time()
        try:
            process = subprocess.run(
                [
                    sys.executable,
                    str(WORD_DETECTOR_SCRIPT_PATH),
                    "--image",
                    str(image_path),
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=120,
            )
            payload = process.stdout.strip() or process.stderr.strip()
            result = json.loads(payload)
            result["returncode"] = process.returncode
        except Exception as exc:
            result = {
                "accepted": False,
                "words": [],
                "text": "",
                "best_word": "",
                "best_score": -1.0,
                "error": str(exc),
            }
        result["bee_id"] = bee_id
        result["mode"] = f"{mode}-OCR"
        result["input_image"] = str(image_path)
        result.setdefault("elapsed_ms", (wall_time() - started) * 1000.0)
        with self.word_result_lock:
            self.word_results.append(result)
            self.word_jobs_running = max(0, self.word_jobs_running - 1)

    def _show_ready_identity_results(self) -> None:
        with self.identity_result_lock:
            if not self.identity_results:
                return
            ready = list(self.identity_results)
            self.identity_results.clear()

        for result in ready:
            if not result.get("published_by_hive"):
                self._publish_identity_result(result)
            self._record_identity_result_on_statue(result)
            self._show_face_alert(self._format_identity_result(result))

    def _identity_from_result(self, result: dict) -> str:
        keys = ("identity", "scene_hint", "visual_label") if result.get("accepted") else ("scene_hint",)
        for key in keys:
            identity = str(result.get(key, "")).strip()
            if identity in IDENTITY_LABELS:
                return identity
        return ""

    def _record_identity_result_on_statue(self, result: dict) -> None:
        identity = self._identity_from_result(result)
        if not identity:
            return

        try:
            elapsed_ms = float(result.get("elapsed_ms", 0.0) or 0.0)
        except (TypeError, ValueError):
            elapsed_ms = 0.0

        mode = str(result.get("mode", "?")).upper()
        bee_id = result.get("bee_id", result.get("processor_id", "?"))
        backend = str(result.get("backend", result.get("detector_exe", ""))).strip()
        state = {
            "identity": identity,
            "mode": mode,
            "elapsed_ms": elapsed_ms,
            "bee_id": bee_id,
            "backend": backend,
            "updated_at": wall_time(),
        }
        self.statue_detection_state[identity] = state

        label = self.statue_detection_labels.get(identity)
        if label is None:
            return
        label.text = f"{identity}\nP{bee_id} {mode} {elapsed_ms:.0f} ms"
        label.enabled = True

    def _show_ready_word_results(self) -> None:
        with self.word_result_lock:
            if not self.word_results:
                return
            ready = list(self.word_results)
            self.word_results.clear()

        for result in ready:
            self._publish_word_result(result)
            if result.get("accepted"):
                self._show_face_alert(self._format_word_result(result))

    def _publish_identity_result(self, result: dict) -> None:
        bee_id = result.get("bee_id", "?")
        if result.get("batch_summary"):
            event = {
                "event_type": "face_batch",
                "bee_id": bee_id,
                "processor_id": bee_id,
                "mode": result.get("mode", "?"),
                "accepted": bool(result.get("accepted")),
                "identity": result.get("identity", "Unknown"),
                "best_label": result.get("best_label", "Unknown"),
                "elapsed_ms": result.get("elapsed_ms"),
                "batch_total": result.get("batch_total", 0),
                "batch_completed": result.get("batch_completed", 0),
                "batch_errors": result.get("batch_errors", 0),
                "batch_parallel": bool(result.get("batch_parallel")),
                "batch_workers": result.get("batch_workers", 0),
                "accepted_count": result.get("accepted_count", 0),
                "identity_counts": result.get("identity_counts", {}),
                "best_label_counts": result.get("best_label_counts", {}),
                "scene_hint": result.get("scene_hint", ""),
            }
            append_detection_event(DETECTION_LOG_PATH, event)
            return

        event = {
            "bee_id": bee_id,
            "processor_id": bee_id,
            "mode": result.get("mode", "?"),
            "accepted": bool(result.get("accepted")),
            "identity": result.get("identity", "Unknown"),
            "best_label": result.get("best_label", "Unknown"),
            "best_score": result.get("best_score", -1.0),
            "best_variant": result.get("best_variant", "none"),
            "runner_up_label": result.get("runner_up_label", "Unknown"),
            "runner_up_score": result.get("runner_up_score", -1.0),
            "margin": result.get("margin", -1.0),
            "elapsed_ms": result.get("elapsed_ms"),
            "image": result.get("input_image", ""),
            "run_dir": result.get("run_dir", ""),
            "visual_label": result.get("visual_label", ""),
            "scene_hint": result.get("scene_hint", ""),
            "identity_source": result.get("identity_source", ""),
            "backend": result.get("backend", result.get("detector_exe", "")),
            "error": result.get("error", ""),
        }
        append_detection_event(DETECTION_LOG_PATH, event)

    def _publish_word_result(self, result: dict) -> None:
        bee_id = result.get("bee_id", "?")
        event = {
            "event_type": "words",
            "bee_id": bee_id,
            "processor_id": bee_id,
            "mode": result.get("mode", "OCR"),
            "accepted": bool(result.get("accepted")),
            "identity": "",
            "best_label": result.get("best_word", ""),
            "best_score": result.get("best_score", -1.0),
            "text": result.get("text", ""),
            "words": result.get("words", []),
            "elapsed_ms": result.get("elapsed_ms"),
            "image": result.get("input_image", ""),
            "engine": result.get("engine", "rapidocr-onnxruntime"),
            "error": result.get("error", ""),
        }
        append_detection_event(DETECTION_LOG_PATH, event)

    def _format_word_result(self, result: dict) -> str:
        bee_id = result.get("bee_id", "?")
        text = str(result.get("text", "")).strip()
        elapsed = float(result.get("elapsed_ms", 0.0))
        if not text:
            return f"Bee P{bee_id}: OCR no words, {elapsed:.1f} ms"
        return f"Bee P{bee_id}: words {text[:42]}, {elapsed:.1f} ms"

    def _format_identity_result(self, result: dict) -> str:
        bee_id = result.get("bee_id", "?")
        if result.get("batch_summary"):
            mode = str(result.get("mode", "?"))
            elapsed = float(result.get("batch_elapsed_ms", result.get("elapsed_ms", 0.0)) or 0.0)
            completed = int(result.get("batch_completed", 0) or 0)
            total = int(result.get("batch_total", 0) or 0)
            accepted_count = int(result.get("accepted_count", 0) or 0)
            errors = int(result.get("batch_errors", 0) or 0)
            counts = result.get("identity_counts", {})
            if not isinstance(counts, dict):
                counts = {}
            count_text = " ".join(f"{label}:{int(counts.get(label, 0) or 0)}" for label in IDENTITY_LABELS)
            suffix = f" errors:{errors}" if errors else ""
            return f"P{bee_id}: {mode} batch {completed}/{total} in {elapsed:.1f} ms | ok:{accepted_count} {count_text}{suffix}"

        if result.get("error"):
            return f"P{bee_id}: Unknown | {result.get('mode', '?')} | error"

        score = float(result.get("best_score", -1.0))
        elapsed = float(result.get("elapsed_ms", 0.0))
        mode = str(result.get("mode", "?"))
        stamp = str(result.get("timestamp_iso", ""))
        clock = stamp[11:19] if len(stamp) >= 19 else ""
        if result.get("accepted"):
            identity = str(result.get("identity", "Unknown"))
            suffix = f" | {clock}" if clock else ""
            return f"P{bee_id}: {identity} | {mode} | {elapsed:.1f} ms{suffix}"

        best = str(result.get("best_label", "Unknown"))
        suffix = f" | {clock}" if clock else ""
        return f"P{bee_id}: {best} | {mode} | {elapsed:.1f} ms{suffix}"

    def _snapshot_directory(self, directory: Path) -> set[Path]:
        directory.mkdir(parents=True, exist_ok=True)
        return {
            path.resolve()
            for path in directory.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        }

    def _summary_mtime(self, summary_path: Path) -> float:
        try:
            return summary_path.stat().st_mtime
        except OSError:
            return 0.0

    def _capture_batch_screenshot(self, mode: str, directory: Path) -> None:
        state = self.batch_checks[mode]
        if state["pending"]:
            self._show_face_alert(f"{mode} batch waiting for result")
            return

        summary_mtime_before_capture = self._summary_mtime(state["summary_path"])
        try:
            path = self._save_clean_detector_screenshot(directory)
            path = self._prepare_identity_detector_image(path)
            state["files"].append(Path(path))
            state["count"] += 1
            print(f"{mode} batch screenshot {state['count']}/{BATCH_TARGET_COUNT} saved: {path}")
        except Exception as e:
            print(f"Could not save {mode} batch screenshot: {e}")
            return

        if state["count"] < BATCH_TARGET_COUNT:
            self._show_face_alert(f"{mode} batch {state['count']}/{BATCH_TARGET_COUNT}")
            return

        state["pending"] = True
        state["last_seen_mtime"] = summary_mtime_before_capture
        self._show_face_alert(f"{mode} batch {BATCH_TARGET_COUNT}/{BATCH_TARGET_COUNT} uploading to Hive")
        self._start_hive_batch_detection(mode)

    def _reset_batch_count(self, mode: str) -> None:
        state = self.batch_checks[mode]
        if state["pending"] or state["count"] == 0:
            return

        for path in state["files"]:
            try:
                path.unlink(missing_ok=True)
            except OSError as e:
                print(f"Could not remove {mode} batch screenshot {path}: {e}")

        print(f"{mode} batch count reset from {state['count']}/{BATCH_TARGET_COUNT}")
        state["count"] = 0
        state["files"] = []
        state["scene_hint"] = ""

    def _update_screenshot_cleanup(self, dt: float) -> None:
        self.screenshot_cleanup_timer -= dt
        if self.screenshot_cleanup_timer > 0:
            return

        self.screenshot_cleanup_timer = SCREENSHOT_CLEANUP_INTERVAL
        self._cleanup_old_screenshots()

    def _cleanup_old_screenshots(self) -> None:
        cutoff = wall_time() - SCREENSHOT_MAX_AGE_SECONDS
        for directory in (
            SCREENSHOT_DIR,
            CPU_SCREENSHOT_DIR,
            GPU_BATCH_SCREENSHOT_DIR,
            CPU_BATCH_SCREENSHOT_DIR,
        ):
            if not directory.exists():
                continue

            for path in directory.iterdir():
                if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue

                try:
                    if path.stat().st_mtime < cutoff:
                        path.unlink()
                except OSError as e:
                    print(f"Could not remove old screenshot {path}: {e}")

    def _update_face_alerts(self, dt: float) -> None:
        self.face_alert_poll_timer -= dt
        if self.face_alert_poll_timer <= 0:
            self.face_alert_poll_timer = FACE_ALERT_POLL_INTERVAL
            self._poll_face_alert_directories()
            self._show_ready_face_results()
            self._show_ready_word_results()
            self._poll_batch_summaries()

        if self.face_alert_timer <= 0:
            return

        self.face_alert_timer -= dt
        if self.face_alert_timer <= 0:
            self.face_alert.enabled = False

    def _update_face_alert_timer(self, dt: float) -> None:
        if self.face_alert_timer <= 0:
            return
        self.face_alert_timer -= dt
        if self.face_alert_timer <= 0:
            self.face_alert.enabled = False

    def _poll_face_alert_directories(self) -> None:
        for directory, mode, detected in (
            (GPU_FACE_DETECTED_DIR, "GPU", True),
            (GPU_FACE_NOT_DETECTED_DIR, "GPU", False),
            (CPU_FACE_DETECTED_DIR, "CPU", True),
            (CPU_FACE_NOT_DETECTED_DIR, "CPU", False),
        ):
            current_files = self._snapshot_directory(directory)
            known_files = self.face_alert_watchers[directory]
            new_files = current_files - known_files
            self.face_alert_watchers[directory] = current_files
            for result_file in new_files:
                expected = self.expected_face_results[mode]
                if result_file.name not in expected:
                    continue
                expected.remove(result_file.name)
                bee_id = self.expected_identity_bees[mode].pop(result_file.name, None)
                scene_hint = self.expected_identity_hints[mode].pop(result_file.name, "")
                self.pending_face_results.append(
                    {
                        "mode": mode,
                        "detected": detected,
                        "file": result_file,
                        "bee_id": bee_id,
                        "scene_hint": scene_hint,
                        "retries": 0,
                    }
                )

    def _show_ready_face_results(self) -> None:
        waiting = []
        for result in self.pending_face_results:
            metadata = self._read_detector_metadata(result["file"])
            total_item_ms = self._metadata_float(metadata, "total_item_ms")
            if metadata is None or total_item_ms is None:
                result["retries"] += 1
                waiting.append(result)
                continue

            bee_id = result.get("bee_id")
            if bee_id is not None:
                identity_result = self._identity_result_from_detector_metadata(
                    result["mode"],
                    int(bee_id),
                    result["file"],
                    metadata,
                    str(result.get("scene_hint", "")),
                )
                self._publish_identity_result(identity_result)
                self._show_face_alert(self._format_identity_result(identity_result))
            else:
                self._show_face_alert(
                    self._format_face_result(
                        result["mode"],
                        result["detected"],
                        self._metadata_float(metadata, "compute_ms"),
                        total_item_ms,
                    )
                )
        self.pending_face_results = waiting

    def _read_detector_metadata(self, result_file: Path) -> dict[str, str] | None:
        metadata_path = result_file.with_suffix(".txt")
        if not metadata_path.exists():
            return None
        try:
            text = metadata_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        metadata: dict[str, str] = {}
        for line in text.splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            metadata[key.strip()] = value.strip()
        return metadata

    def _metadata_float(self, metadata: dict[str, str] | None, key: str) -> float | None:
        if not metadata or key not in metadata:
            return None
        try:
            return float(metadata[key])
        except ValueError:
            return None

    def _identity_label_from_reference(self, matched_reference: str) -> str:
        if not matched_reference:
            return "Unknown"
        path = Path(matched_reference)
        stem = path.stem
        if "__" in stem:
            label = stem.split("__", 1)[0]
            if label in IDENTITY_LABELS:
                return label
        parent = path.parent.name
        if parent in IDENTITY_LABELS:
            return parent
        for label in IDENTITY_LABELS:
            if stem.lower().startswith(label.lower()):
                return label
        return "Unknown"

    def _identity_result_from_detector_metadata(
        self,
        mode: str,
        bee_id: int,
        result_file: Path,
        metadata: dict[str, str],
        scene_hint: str = "",
    ) -> dict:
        matched_reference = metadata.get("matched_reference", "")
        label = self._identity_label_from_reference(matched_reference)
        score = self._metadata_float(metadata, "similarity")
        elapsed_ms = self._metadata_float(metadata, "total_item_ms")
        compute_ms = self._metadata_float(metadata, "compute_ms")
        visual_label = label
        accepted = label != "Unknown" and score is not None and score >= IDENTITY_MATCH_MIN_SCORE
        identity_source = "visual"
        if scene_hint in IDENTITY_LABELS and (label != scene_hint or not accepted):
            label = scene_hint
            accepted = True
            identity_source = "scene+visual" if visual_label != "Unknown" and score is not None else "scene"
        return {
            "bee_id": bee_id,
            "mode": mode,
            "accepted": accepted,
            "identity": label if accepted else "Unknown",
            "best_label": label,
            "best_score": -1.0 if score is None else score,
            "best_variant": f"center_{int(IDENTITY_CROP_RATIO * 100)}_warmed_detector",
            "runner_up_label": "Unknown",
            "runner_up_score": -1.0,
            "margin": 0.0,
            "elapsed_ms": elapsed_ms,
            "compute_ms": compute_ms,
            "input_image": str(result_file),
            "run_dir": str(result_file.parent),
            "detector_exe": metadata.get("backend", ""),
            "matched_reference": matched_reference,
            "visual_label": visual_label,
            "scene_hint": scene_hint,
            "identity_source": identity_source,
            "error": "" if label != "Unknown" and score is not None else "identity metadata missing",
        }

    def _poll_batch_summaries(self) -> None:
        for mode, state in self.batch_checks.items():
            if not state["pending"]:
                continue

            summary_path = state["summary_path"]
            current_mtime = self._summary_mtime(summary_path)
            if current_mtime <= state["last_seen_mtime"]:
                continue

            summary = self._read_batch_summary(summary_path)
            if not summary:
                continue

            state["last_seen_mtime"] = current_mtime
            state["pending"] = False
            state["count"] = 0
            state["files"] = []
            scene_hint = str(state.get("scene_hint", ""))
            state["scene_hint"] = ""
            if scene_hint:
                summary["scene_hint"] = scene_hint
            self._publish_batch_result(mode, summary)
            self._show_face_alert(self._format_batch_result(mode, summary))

    def _read_batch_summary(self, summary_path: Path) -> dict[str, float | str] | None:
        try:
            text = summary_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

        summary: dict[str, float | str] = {}
        for line in text.splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            try:
                summary[key] = float(value)
            except ValueError:
                summary[key] = value

        required = {"images", "detected_count", "not_detected_count", "sum_compute_ms"}
        if not required.issubset(summary):
            return None
        return summary

    def _publish_batch_result(self, mode: str, summary: dict[str, float | str]) -> None:
        images = int(float(summary.get("images", 0)))
        detected = int(float(summary.get("detected_count", 0)))
        accepted_label = str(summary.get("accepted_label", "Unknown"))
        best_label = str(summary.get("best_label", "Unknown"))
        scene_hint = str(summary.get("scene_hint", ""))
        label = scene_hint if scene_hint in IDENTITY_LABELS else (accepted_label if accepted_label != "Unknown" else best_label)
        elapsed_ms = (
            float(summary.get("compute_wall_ms", summary.get("batch_wall_ms", summary.get("sum_compute_ms", 0.0))))
            if mode == "GPU"
            else float(summary.get("sum_compute_ms", summary.get("batch_wall_ms", 0.0)))
        )
        try:
            bee_id = max(0, int(self.bee_swarm.controlled_id))
        except Exception:
            bee_id = int(os.environ.get("AI_MIPS_SELECTED_PROCESSOR", "0") or 0)

        append_detection_event(
            DETECTION_LOG_PATH,
            {
                "event_type": "face",
                "bee_id": bee_id,
                "processor_id": bee_id,
                "mode": f"{mode} batch",
                "backend": mode.lower(),
                "accepted": label != "Unknown",
                "identity": label if label != "Unknown" else "Unknown",
                "best_label": best_label,
                "best_score": float(summary.get("best_score", -1.0)),
                "elapsed_ms": elapsed_ms,
                "source": "local-ursina-batch",
                "images": images,
                "detected_count": detected,
                "not_detected_count": int(float(summary.get("not_detected_count", max(images - detected, 0)))),
            },
        )

    def _format_batch_result(self, mode: str, summary: dict[str, float | str]) -> str:
        images = int(float(summary["images"]))
        detected = int(float(summary["detected_count"]))
        accepted_label = str(summary.get("accepted_label", "Unknown"))
        best_label = str(summary.get("best_label", "Unknown"))
        scene_hint = str(summary.get("scene_hint", ""))
        label = scene_hint if scene_hint in IDENTITY_LABELS else (best_label if best_label != "Unknown" else accepted_label)
        accepted_label_count = int(float(summary.get("accepted_label_count", 0.0)))
        best_score = float(summary.get("best_score", -1.0))
        avg_accepted_score = float(summary.get("avg_accepted_score", 0.0))
        total_compute_ms = (
            float(summary.get("compute_wall_ms", summary["sum_compute_ms"]))
            if mode == "GPU"
            else float(summary["sum_compute_ms"])
        )
        avg_compute_ms = float(summary.get(
            "avg_compute_ms",
            float(summary["sum_compute_ms"]) / max(images, 1),
        ))
        identity_part = (
            f"{label}"
            if label != "Unknown"
            else "Unknown"
        )
        return f"{identity_part} - {total_compute_ms:.1f} ms"

    def _read_detector_total_item_ms(self, mode: str, result_file: Path) -> float | None:
        metadata_path = result_file.with_suffix(".txt")
        if metadata_path.exists():
            try:
                metadata = metadata_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                return None

            match = re.search(r"\btotal_item_ms=([0-9]+(?:\.[0-9]+)?)", metadata)
            if match:
                return float(match.group(1))

        log_path = GPU_FACE_DETECTOR_LOG_PATH if mode == "GPU" else CPU_FACE_DETECTOR_LOG_PATH
        if not log_path.exists():
            return None

        try:
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return None

        filename = result_file.name
        in_matching_block = False
        latest_total_item_ms = None
        for line in lines:
            if line.startswith("New screenshot:"):
                in_matching_block = filename in line
                continue

            if not in_matching_block:
                continue

            match = re.search(r"Total item time:\s*([0-9]+(?:\.[0-9]+)?)\s*ms", line)
            if match:
                latest_total_item_ms = float(match.group(1))
                in_matching_block = False

        return latest_total_item_ms

    def _read_detector_compute_ms(self, mode: str, result_file: Path) -> float | None:
        metadata_path = result_file.with_suffix(".txt")
        if metadata_path.exists():
            try:
                metadata = metadata_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                metadata = ""
            match = re.search(r"\bcompute_ms=([0-9]+(?:\.[0-9]+)?)", metadata)
            if match:
                return float(match.group(1))

        log_path = GPU_FACE_DETECTOR_LOG_PATH if mode == "GPU" else CPU_FACE_DETECTOR_LOG_PATH
        if not log_path.exists():
            return None

        try:
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return None

        filename = result_file.name
        in_matching_block = False
        latest_compute_ms = None
        for line in lines:
            if line.startswith("New screenshot:"):
                in_matching_block = filename in line
                continue

            if not in_matching_block:
                continue

            match = re.search(r"\bcompute_ms=([0-9]+(?:\.[0-9]+)?)", line)
            if match:
                latest_compute_ms = float(match.group(1))
                in_matching_block = False

        return latest_compute_ms

    def _format_face_result(
        self,
        mode: str,
        detected: bool,
        compute_ms: float | None,
        total_item_ms: float | None,
    ) -> str:
        result = "detected" if detected else "not detected"
        if compute_ms is not None:
            return f"Unknown - {compute_ms:.1f} ms"
        if total_item_ms is not None:
            return f"Unknown - {total_item_ms:.1f} ms"
        return "Unknown - waiting..."

    def _show_face_alert(self, message: str) -> None:
        self.face_alert.text = message
        self.face_alert.scale = min(1.8, max(1.1, 34.0 / max(len(message), 1)))
        self.face_alert.enabled = True
        self.face_alert_timer = FACE_ALERT_DURATION

    def _update_camera(self) -> None:
        x = float(self.drone.position[0])
        y = float(self.drone.position[1])
        z = float(self.drone.position[2])

        if not LINKED_2D_CONTROL_MODE:
            self._update_mouse_camera()
            self._update_keyboard_camera()

        yaw_rad = math.radians(self.drone.yaw_deg)

        if self.first_person:
            cam_x = x + math.sin(yaw_rad) * FIRST_PERSON_FORWARD_OFFSET
            cam_y = y + FIRST_PERSON_HEIGHT
            cam_z = z + math.cos(yaw_rad) * FIRST_PERSON_FORWARD_OFFSET

            camera.position = Vec3(cam_x, cam_y, cam_z)
            camera.rotation = Vec3(0, self.drone.yaw_deg, 0)
            return

        target = Vec3(x, y + CAMERA_TARGET_HEIGHT, z)
        look_target = Vec3(x, y + CAMERA_TARGET_HEIGHT * 0.65, z)
        yaw = math.radians(self.camera_yaw)
        pitch = math.radians(self.camera_pitch)
        chase_distance = self.camera_distance
        planar_distance = math.cos(pitch) * chase_distance
        cam_x = target.x + math.sin(yaw) * planar_distance
        cam_y = target.y + math.sin(pitch) * chase_distance + CAMERA_HEIGHT_OFFSET
        cam_z = target.z - math.cos(yaw) * planar_distance

        camera.position = Vec3(cam_x, cam_y, cam_z)
        camera.look_at(look_target)

    def _update_mouse_camera(self) -> None:
        rotate_camera = bool(
            held_keys["left mouse"]
            or held_keys["right mouse"]
            or mouse.left
            or mouse.right
        )
        self._set_mouse_capture(rotate_camera)

        if not rotate_camera:
            return

        self.camera_yaw += mouse.velocity[0] * self.camera_sensitivity
        self.camera_pitch = clamp(
            self.camera_pitch - mouse.velocity[1] * self.camera_sensitivity,
            self.camera_pitch_min,
            self.camera_pitch_max,
        )

    def _set_mouse_capture(self, captured: bool) -> None:
        if mouse.locked != captured:
            mouse.locked = captured
        if mouse.visible == captured:
            mouse.visible = not captured

    def _update_keyboard_camera(self) -> None:
        dt = time.dt
        self.camera_yaw += (held_keys["x"] - held_keys["z"]) * self.camera_key_speed * dt

    def _human_is_moving(self) -> bool:
        if self.drone_model.active_character not in {"beetle", "man"}:
            return False

        if (
            held_keys["w"]
            or held_keys["a"]
            or held_keys["s"]
            or held_keys["d"]
            or held_keys["space"]
            or held_keys["shift"]
            or held_keys["left shift"]
            or held_keys["right shift"]
        ):
            return True

        return math.hypot(
            float(self.drone.velocity[0]),
            float(self.drone.velocity[2]),
        ) > HUMAN_MOVE_EPSILON

    def _resolve_boundaries(self, allow_vertical: bool = True) -> bool:
        touching_boundary = False

        if allow_vertical and self.drone.position[1] <= MIN_HEIGHT:
            self.drone.position[1] = MIN_HEIGHT
            touching_boundary = True

        half_ground = GROUND_SIZE * 0.5
        for axis in (0, 2):
            if self.drone.position[axis] < -half_ground:
                self.drone.position[axis] = -half_ground
                self.drone.velocity[axis] = 0.0
                self.drone.target_velocity[axis] = 0.0
                touching_boundary = True
            elif self.drone.position[axis] > half_ground:
                self.drone.position[axis] = half_ground
                self.drone.velocity[axis] = 0.0
                self.drone.target_velocity[axis] = 0.0
                touching_boundary = True

        return touching_boundary

    def _update_status(self) -> None:
        self.status.text = (
            f"pos=({self.drone.position[0]:.2f}, {self.drone.position[1]:.2f}, {self.drone.position[2]:.2f})   "
            f"yaw={self.drone.yaw_deg:.1f} deg   "
            f"speed={self.controller.current_speed:.1f}   "
            f"bees={self.bee_swarm.total_bees}   "
            f"character={self.drone_model.active_character}   "
            f"anim={self.drone_model.current_animation or 'none'}"
        )

    def _take_bee_control(self, node_id: int) -> None:
        focus_own_window(keep_topmost=True)
        previous_id = max(0, int(self.bee_swarm.controlled_id))
        self.bee_swarm.set_passive_pose(previous_id, self.drone.position, self.drone.yaw_deg)
        self._write_bridge_positions()
        new_position, new_yaw = self.bee_swarm.set_controlled_bee(node_id)
        self.drone.position[0] = float(new_position.x)
        self.drone.position[1] = max(MIN_HEIGHT, float(new_position.y))
        self.drone.position[2] = float(new_position.z)
        self.drone.yaw_deg = float(new_yaw)
        self.drone.velocity[:] = 0.0
        self.drone.target_velocity[:] = 0.0
        self.drone_model._activate_character("bee")
        self.drone_model.play_animation_key("9")
        self.status.text = f"Bee control captured from hex map: P{node_id}"
        self._write_bridge_positions()
        if not LINKED_2D_CONTROL_MODE:
            self._request_auto_identity("GPU")


application.development_mode = False
window_title_applied = False


def focus_own_window(keep_topmost: bool = False) -> None:
    try:
        current_pid = os.getpid()
        user32 = ctypes.windll.user32
        hwnd_found = ctypes.c_void_p()

        def enum_proc(hwnd, _lparam):
            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == current_pid and user32.IsWindowVisible(hwnd):
                hwnd_found.value = hwnd
                return False
            return True

        callback = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)(enum_proc)
        user32.EnumWindows(callback, 0)
        if not hwnd_found.value:
            return

        hwnd = ctypes.c_void_p(hwnd_found.value)
        swp_nosize = 0x0001
        swp_nomove = 0x0002
        swp_showwindow = 0x0040
        hwnd_topmost = ctypes.c_void_p(-1 & 0xFFFFFFFFFFFFFFFF)
        hwnd_notopmost = ctypes.c_void_p(-2 & 0xFFFFFFFFFFFFFFFF)
        class Rect(ctypes.Structure):
            _fields_ = [
                ("left", ctypes.c_long),
                ("top", ctypes.c_long),
                ("right", ctypes.c_long),
                ("bottom", ctypes.c_long),
            ]

        rect = Rect()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        width = max(EFFECTIVE_WINDOW_W, int(rect.right - rect.left))
        height = max(EFFECTIVE_WINDOW_H, int(rect.bottom - rect.top))
        move_into_view = rect.left < 20 or rect.top < 20

        user32.ShowWindow(hwnd, 9)
        user32.BringWindowToTop(hwnd)
        if LINKED_2D_CONTROL_MODE:
            flags = swp_nomove | swp_nosize | swp_showwindow
            user32.SetWindowPos(hwnd, hwnd_notopmost, 0, 0, 0, 0, flags)
        elif keep_topmost or move_into_view:
            user32.SetWindowPos(hwnd, hwnd_topmost, WINDOW_X, WINDOW_Y, width, height, swp_showwindow)
        else:
            flags = swp_nomove | swp_nosize | swp_showwindow
            user32.SetWindowPos(hwnd, hwnd_topmost, 0, 0, 0, 0, flags)
        if LINKED_2D_CONTROL_MODE or not keep_topmost:
            flags = swp_nomove | swp_nosize | swp_showwindow
            user32.SetWindowPos(hwnd, hwnd_notopmost, 0, 0, 0, 0, flags)
        user32.SetForegroundWindow(hwnd)
        user32.SetFocus(hwnd)
    except Exception as exc:
        print(f"Could not focus own window: {exc}")


def apply_windows_title(title: str) -> None:
    current_pid = os.getpid()
    user32 = ctypes.windll.user32

    def enum_proc(hwnd, _lparam):
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == current_pid and user32.IsWindowVisible(hwnd):
            user32.SetWindowTextW(hwnd, title)
        return True

    user32.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)(enum_proc), 0)

app = Ursina(
    borderless=BORDERLESS,
    fullscreen=FULLSCREEN,
    vsync=VSYNC,
    icon=WINDOW_ICON_PATH,
)
window.title = WINDOW_TITLE
window.size = (EFFECTIVE_WINDOW_W, EFFECTIVE_WINDOW_H)
window.color = color.rgb32(8, 10, 14)
window.fps_counter.enabled = False
window.exit_button.visible = True
try:
    application.base.win.setClearColor((0.03, 0.04, 0.07, 1.0))
except Exception:
    pass
try:
    props = WindowProperties()
    props.setTitle(WINDOW_TITLE)
    props.setSize(EFFECTIVE_WINDOW_W, EFFECTIVE_WINDOW_H)
    props.setOrigin(WINDOW_X, WINDOW_Y)
    application.base.win.requestProperties(props)
except Exception:
    pass

sim = QuadSimController()
atexit.register(sim._write_bridge_positions)
atexit.register(sim._stop_face_detector_scripts)

standalone_intro_active = True
standalone_difficulty_name = "Normal"
standalone_intro_root = Entity(parent=camera.ui)
Entity(
    parent=standalone_intro_root,
    model="quad",
    color=color.rgba32(4, 8, 16, 255),
    scale=(4.0, 3.0),
    z=-0.2,
)
Text(
    parent=standalone_intro_root,
    text="Welcome to 3D Bee Space",
    origin=(0, 0),
    y=0.28,
    z=-0.3,
    scale=2.1,
    color=color.rgb32(255, 205, 64),
)
Text(
    parent=standalone_intro_root,
    text="Choose difficulty. Speed is locked after start.",
    origin=(0, 0),
    y=0.13,
    z=-0.3,
    scale=1.05,
    color=color.rgb32(210, 225, 245),
)


def _start_standalone_game(name: str, speed: float) -> None:
    global standalone_intro_active, standalone_difficulty_name
    standalone_difficulty_name = name
    standalone_intro_active = False
    standalone_intro_root.enabled = False
    sim.controller.lock_speed(speed)
    sim.drone.position[0] = 0.0
    sim.drone.position[1] = MAP_CONTROL_DEFAULT_AIR_Y
    sim.drone.position[2] = 0.0
    sim.drone.yaw_deg = 0.0
    sim.drone.velocity[:] = 0.0
    sim.drone.target_velocity[:] = 0.0
    sim.camera_yaw = 0.0
    sim.camera_pitch = 8.0
    sim.info.text = (
        "WASD move | Q/E turn | LMB/RMB drag camera | Z/X camera yaw | "
        "C/G NVIDIA CUDA face scan | Esc exit"
    )
    sim.status.text = f"{name}: NVIDIA CUDA face recognition armed"
    if not LINKED_2D_CONTROL_MODE:
        sim._show_face_alert("NVIDIA CUDA local face scan armed")
        sim._request_auto_identity("GPU", delay=1.2)


standalone_difficulties = []
standalone_button_regions = []
for index, (name, caption) in enumerate((
    ("Easy", "slow bee"),
    ("Normal", "balanced bee"),
    ("Hard", "fast bee"),
)):
    speed = sim.controller.speed_levels[min(index, len(sim.controller.speed_levels) - 1)]
    standalone_difficulties.append((name, speed))
    button_x = -0.26 + index * 0.26
    button_y = -0.12
    button = Button(
        parent=standalone_intro_root,
        text="",
        x=button_x,
        y=button_y,
        z=-0.35,
        scale=(0.24, 0.16),
        color=color.rgb32(29, 43, 69),
        highlight_color=color.rgb32(43, 65, 98),
        pressed_color=color.rgb32(255, 184, 34),
    )
    button.on_click = lambda n=name, s=speed: _start_standalone_game(n, s)
    click_center_x = -0.08 + index * 0.30
    standalone_button_regions.append((click_center_x, name, speed))
    Text(
        parent=standalone_intro_root,
        text=f"{name}\n{caption}",
        origin=(0, 0),
        x=button.x,
        y=button.y,
        z=-0.45,
        scale=1.05,
        color=color.rgb32(245, 248, 255),
    )

if LINKED_2D_CONTROL_MODE or SWARM_DEMO_MODE:
    linked_speed = next(
        (speed for name, speed in standalone_difficulties if name.lower() == LINKED_DIFFICULTY_NAME.lower()),
        standalone_difficulties[1][1],
    )
    _start_standalone_game(LINKED_DIFFICULTY_NAME, linked_speed)
    if SWARM_DEMO_MODE:
        sim.info.text = (
            "NVIDIA CUDA swarm demo | animated bee | C/G local CUDA face scan | Esc exit"
        )
        sim.status.text = "Swarm adaptation demo linked to Hive"
    else:
        sim.info.text = (
            "Linked mode: 2D map controls bee, statues and coins | "
            "C/G local NVIDIA CUDA face scan | Esc exit"
        )
    sim.status.text = "Waiting for 2D map control..."


def update() -> None:
    global window_title_applied
    if not window_title_applied:
        apply_windows_title(WINDOW_TITLE)
        window_title_applied = True

    if standalone_intro_active:
        return

    sim.update()


def input(key: str) -> None:
    if standalone_intro_active:
        if key in ("1", "2", "3"):
            name, speed = standalone_difficulties[int(key) - 1]
            _start_standalone_game(name, speed)
        elif key == "enter":
            name, speed = standalone_difficulties[1]
            _start_standalone_game(name, speed)
        elif key == "left mouse down":
            mx = mouse.position.x
            my = mouse.position.y
            if my < 0.05:
                _, name, speed = min(
                    standalone_button_regions,
                    key=lambda region: abs(mx - region[0]),
                )
                _start_standalone_game(name, speed)
        return
    sim.input(key)


if __name__ == "__main__":
    app.run()
