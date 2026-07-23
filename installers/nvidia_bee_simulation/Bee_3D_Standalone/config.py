from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
FACE_DETECTORS_ENABLED = True
START_CHARACTER = "bee"
BEE_CHARACTER_ENABLED = True
FACE_DETECTOR_ROOT = BASE_DIR / "local_face_ai"
FACE_DETECTOR_REFERENCE_DIR = FACE_DETECTOR_ROOT / "references"
FACE_DETECTOR_WEIGHTS_PATH = FACE_DETECTOR_ROOT / "models" / "deepid_weights.bin"
GPU_FACE_DETECTOR_EXE = FACE_DETECTOR_ROOT / "build_opencl" / "Release" / "face_detector.exe"
CPU_FACE_DETECTOR_EXE = FACE_DETECTOR_ROOT / "build_cpu" / "Release" / "face_detector.exe"
GPU_FACE_INCOMING_DIR = FACE_DETECTOR_ROOT / "incoming_opencl"
CPU_FACE_INCOMING_DIR = FACE_DETECTOR_ROOT / "incoming_cpu"
GPU_BATCH_FACE_INCOMING_DIR = FACE_DETECTOR_ROOT / "incoming_opencl_batch"
CPU_BATCH_FACE_INCOMING_DIR = FACE_DETECTOR_ROOT / "incoming_cpu_batch"
GPU_FACE_DETECTOR_LOG_PATH = FACE_DETECTOR_ROOT / "output_opencl" / "last_run.log"
CPU_FACE_DETECTOR_LOG_PATH = FACE_DETECTOR_ROOT / "output_cpu" / "last_run.log"
GPU_BATCH_SUMMARY_PATH = FACE_DETECTOR_ROOT / "output_opencl_batch" / "last_batch_summary.txt"
CPU_BATCH_SUMMARY_PATH = FACE_DETECTOR_ROOT / "output_cpu_batch" / "last_batch_summary.txt"
GPU_FACE_OUTPUT_DIR = FACE_DETECTOR_ROOT / "output_opencl"
CPU_FACE_OUTPUT_DIR = FACE_DETECTOR_ROOT / "output_cpu"
GPU_BATCH_FACE_OUTPUT_DIR = FACE_DETECTOR_ROOT / "output_opencl_batch"
CPU_BATCH_FACE_OUTPUT_DIR = FACE_DETECTOR_ROOT / "output_cpu_batch"
IDENTITY_FACE_MATCHER_SCRIPT_PATH = BASE_DIR / "identity_matcher.py"
IDENTITY_FACE_ROOT = FACE_DETECTOR_ROOT
IDENTITY_REFERENCE_DIR = FACE_DETECTOR_REFERENCE_DIR
IDENTITY_REFERENCE_FLAT_DIR = FACE_DETECTOR_ROOT / "references_flat"
IDENTITY_INCOMING_DIR = FACE_DETECTOR_ROOT / "identity_incoming"
IDENTITY_OUTPUT_DIR = FACE_DETECTOR_ROOT / "identity_output"
IDENTITY_LABELS = ("Adi", "Faraj", "Slava")
IDENTITY_MATCH_MIN_SCORE = 0.40
IDENTITY_MATCH_MIN_MARGIN = 0.0
DETECTION_LOG_PATH = PROJECT_ROOT / "hive_detections.json"

WINDOW_TITLE = "Standalone 3D Bee Space - NVIDIA CUDA"
WINDOW_W = 960
WINDOW_H = 620
WINDOW_X = 80
WINDOW_Y = 60
BORDERLESS = False
FULLSCREEN = False
VSYNC = True
WINDOW_ICON_PATH = ""

BACKGROUND_MUSIC_FILE = "music/music1.mp3"
BACKGROUND_MUSIC_PATH = BASE_DIR / "music" / "music1.mp3"
BACKGROUND_MUSIC_VOLUME = 0.55
BACKGROUND_MUSIC_ENABLED = False

FACE_DETECTED_DIR = BASE_DIR / "Face_detected"
FACE_NOT_DETECTED_DIR = BASE_DIR / "Face__not_detected"
GPU_FACE_DETECTED_DIR = BASE_DIR / "Face_detected_gpu"
GPU_FACE_NOT_DETECTED_DIR = BASE_DIR / "Face__not_detected_gpu"
CPU_FACE_DETECTED_DIR = BASE_DIR / "Face_detected_cpu"
CPU_FACE_NOT_DETECTED_DIR = BASE_DIR / "Face__not_detected_cpu"
GPU_BATCH_FACE_DETECTED_DIR = BASE_DIR / "Face_detected_gpu_batch"
GPU_BATCH_FACE_NOT_DETECTED_DIR = BASE_DIR / "Face__not_detected_gpu_batch"
CPU_BATCH_FACE_DETECTED_DIR = BASE_DIR / "Face_detected_cpu_batch"
CPU_BATCH_FACE_NOT_DETECTED_DIR = BASE_DIR / "Face__not_detected_cpu_batch"
FACE_ALERT_DURATION = 8.0
FACE_ALERT_POLL_INTERVAL = 0.25

MIN_HEIGHT = 0.2
START_HEIGHT = MIN_HEIGHT

GROUND_SIZE = 240
GROUND_COLOR = (48, 50, 56, 255)
GRID_COLOR = (95, 102, 112, 120)
GRID_CELLS = 60

FACE_MODEL_TARGET_HEIGHT = 14.0
FACE_MODEL_COLOR = None
FACE_MODEL_SPECS = [
    {
        "path": "drone model/faces/Faraj.glb",
        "position": (-16.0, 0.0, 30.0),
        "rotation": (0.0, 0.0, 0.0),
    },
    {
        "path": "drone model/faces/Slava.glb",
        "position": (0.0, 0.0, 31.0),
        "rotation": (0.0, 0.0, 0.0),
    },
    {
        "path": "drone model/faces/Adi.glb",
        "position": (16.0, 0.0, 30.0),
        "rotation": (0.0, 0.0, 0.0),
    },
]

CAMERA_DISTANCE = 8.0
CAMERA_HEIGHT_OFFSET = 1.2
CAMERA_TARGET_HEIGHT = 0.6
CAMERA_LOOK_OFFSET = 2.0
MIN_ZOOM = 3.0
MAX_ZOOM = 40.0
ZOOM_STEP = 1.0

FIRST_PERSON_HEIGHT = 0.85
FIRST_PERSON_FORWARD_OFFSET = 0.25

SPEED_LEVELS = [3.0, 6.0, 10.0, 20.0]
TURN_SPEED_DEG = 90.0
MOVEMENT_RESPONSE = 8.0

DRONE_MODEL_RELATIVE = "drone model/model.glb"
DRONE_MODEL_PATH = BASE_DIR / "drone model" / "model.glb"
DRONE_MODEL_TARGET_SIZE = 1.8
DRONE_MODEL_TINT = (255, 255, 255, 255)
DRONE_MODEL_ROTATION = (0, 180, 0)
DRONE_ANIMATION_KEYS = {
    "7": "_bee_idle",
    "8": "_bee_hover",
    "9": "_bee_take_off_and_land",
}

HUMAN_MODEL_PATH = BASE_DIR / "drone model" / "Beetle_animated_walk_monolithic.glb"
HUMAN_ANIMATION_FRAME_ENABLED = False
HUMAN_ANIMATION_FRAME_DIR = BASE_DIR / "drone model" / "beetle_monolithic_frames"
HUMAN_ANIMATION_FRAME_PATTERN = "beetle_walk_*.glb"
HUMAN_ANIMATION_FRAME_RATE = 16.0
HUMAN_MODEL_TARGET_SIZE = 2.0
HUMAN_MODEL_ROTATION = (0, 180, 0)
HUMAN_MODEL_COLOR_SCALE = (0.05, 0.28, 0.12, 1.0)
HUMAN_IDLE_ANIMATION_NAME = "Animation 1 - Stand"
HUMAN_ANIMATION_NAME = "Animation 2 - Walk"

MAN_MODEL_PATH = BASE_DIR / "drone model" / "MAN_ursina_monolithic.glb"
MAN_ANIMATION_FRAME_ENABLED = True
MAN_ANIMATION_FRAME_DIR = BASE_DIR / "drone model" / "man_monolithic_frames"
MAN_ANIMATION_FRAME_PATTERN = "man_walk_*.glb"
MAN_ANIMATION_FRAME_RATE = 3.0
MAN_MODEL_TARGET_SIZE = 2.2
MAN_MODEL_ROTATION = (90, 0, 0)
MAN_MODEL_COLOR_SCALE = (1.0, 1.0, 1.0, 1.0)

SCREENSHOT_DIR = BASE_DIR / "screenshots"
CPU_SCREENSHOT_DIR = BASE_DIR / "Screenshots for CPU"
GPU_BATCH_SCREENSHOT_DIR = BASE_DIR / "screenshots_gpu_batch"
CPU_BATCH_SCREENSHOT_DIR = BASE_DIR / "Screenshots for CPU batch"
