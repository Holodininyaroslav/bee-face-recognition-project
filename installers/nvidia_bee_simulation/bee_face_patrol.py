import math
import os
import random
import json
import time
import subprocess
import ctypes
import threading
from array import array
from dataclasses import dataclass
from pathlib import Path

import pygame


LINKED_LAYOUT = os.environ.get("BEE_FACE_PATROL_LINKED_MODE") == "1"

WIDTH = 1100 if LINKED_LAYOUT else 1480
HEIGHT = 720 if LINKED_LAYOUT else 860
MAP_LEFT = 24
MAP_TOP = 74
MAP_WIDTH = 1050 if LINKED_LAYOUT else 1060
MAP_HEIGHT = 610 if LINKED_LAYOUT else 740
SIDEBAR_LEFT = 1130 if LINKED_LAYOUT else 1120

FPS = 60
BEE_SPEED = 4.4
BEE_TURN_SPEED_DEG = 3.4
SCAN_RADIUS = 230 if LINKED_LAYOUT else 125
SCAN_COOLDOWN_MS = 800
FACE_SIZE = 42 if LINKED_LAYOUT else 66
FACE_HEX_RADIUS = 30 if LINKED_LAYOUT else 48
FOOD_RADIUS = 6 if LINKED_LAYOUT else 9
BEE_DRAW_SCALE = 0.55 if LINKED_LAYOUT else 1.0
ENERGY_MAX = 100.0
FOOD_ENERGY = 28.0
URSINA_CONTROL_PATH = Path(__file__).resolve().parent / "Bee_3D_Standalone" / "bee_space_control.json"
URSINA_STANDALONE_ROOT = URSINA_CONTROL_PATH.parent
URSINA_STANDALONE_LAUNCHER = URSINA_STANDALONE_ROOT / "Start Bee 3D Standalone.ps1"
BACKGROUND_MUSIC_ENABLED = False
BACKGROUND_MUSIC_PATH = URSINA_STANDALONE_ROOT / "music" / "music1.mp3"
BRIDGE_GROUND_SIZE = 240.0
BRIDGE_BEE_Y = 4.6
BRIDGE_YAW_OFFSET_DEG = 90.0

STATE_MENU = "menu"
STATE_PLAYING = "playing"
STATE_GAME_OVER = "game_over"
STATE_WIN = "win"

BG = (12, 20, 34)
MAP_BG = (20, 33, 48)
GRID = (38, 58, 80)
WHITE = (240, 246, 255)
MUTED = (155, 178, 205)
YELLOW = (255, 196, 36)
YELLOW_DARK = (204, 126, 15)
HONEY = (255, 165, 32)
GREEN = (50, 210, 110)
RED = (235, 82, 82)
BLUE = (78, 166, 255)
PANEL = (18, 29, 45)
LINE = (62, 87, 120)
DANGER = (255, 72, 84)

FACE_ROOT = Path(__file__).resolve().parent / "Bee_3D_Standalone" / "local_face_ai" / "references"
FACE_FILES = {
    "Adi": FACE_ROOT / "Adi" / "Adi_yaw_000_pitch_p00.jpg",
    "Faraj": FACE_ROOT / "Faraj" / "Faraj_yaw_000_pitch_p00.jpg",
    "Slava": FACE_ROOT / "Slava" / "Slava_yaw_000_pitch_p00.jpg",
}
IDENTITY_RESULT_PATH = (
    URSINA_STANDALONE_ROOT / "local_face_ai" / "identity_output" / "latest_identity_result.json"
)


@dataclass(frozen=True)
class Difficulty:
    name: str
    label: str
    face_speed: float
    vision_range: float
    vision_angle_deg: float
    energy_drain: float
    food_spawn_ms: int
    max_food: int


DIFFICULTIES = [
    Difficulty("easy", "Easy", 0.04, 36, 20, 0.12, 350, 16),
    Difficulty("normal", "Normal", 1.0, 160, 48, 10.5, 1350, 6),
    Difficulty("hard", "Hard", 1.38, 205, 58, 14.5, 1900, 4),
]


def clamp(value, low, high):
    return max(low, min(high, value))


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angle_delta(a, b):
    return (a - b + math.pi) % (math.tau) - math.pi


def load_face_image(path):
    if not path.exists():
        return None
    try:
        image = pygame.image.load(str(path)).convert_alpha()
        return pygame.transform.smoothscale(image, (FACE_SIZE, FACE_SIZE))
    except pygame.error:
        return None


def hex_points(center, radius):
    cx, cy = center
    return [
        (
            cx + math.cos(math.radians(60 * i + 30)) * radius,
            cy + math.sin(math.radians(60 * i + 30)) * radius,
        )
        for i in range(6)
    ]


def point_in_poly(point, poly):
    x, y = point
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        crosses = (yi > y) != (yj > y)
        if crosses:
            x_at_y = (xj - xi) * (y - yi) / (yj - yi + 0.000001) + xi
            if x < x_at_y:
                inside = not inside
        j = i
    return inside


def launch_ursina_standalone():
    if os.environ.get("BEE_FACE_PATROL_SMOKE") == "1":
        return
    if os.environ.get("BEE_FACE_PATROL_AUTOLAUNCH_URSINA") != "1":
        return
    if not URSINA_STANDALONE_LAUNCHER.exists():
        return
    try:
        subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(URSINA_STANDALONE_LAUNCHER),
            ],
            cwd=str(URSINA_STANDALONE_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except OSError:
        pass


def keep_game_window_in_front(window_handle):
    if not window_handle or os.name != "nt":
        return

    def worker():
        user32 = ctypes.windll.user32
        for delay in (2.5, 5.0, 8.0):
            time.sleep(delay)
            try:
                user32.SetForegroundWindow(window_handle)
            except OSError:
                return

    threading.Thread(target=worker, daemon=True).start()


def draw_centered_text(surface, font, text, color, center):
    img = font.render(text, True, color)
    surface.blit(img, img.get_rect(center=center))


def draw_glow_circle(screen, center, radius, color, alpha):
    glow = pygame.Surface((radius * 2 + 8, radius * 2 + 8), pygame.SRCALPHA)
    pygame.draw.circle(glow, (*color, alpha), (radius + 4, radius + 4), radius)
    screen.blit(glow, glow.get_rect(center=center))


@dataclass
class Food:
    x: float
    y: float
    phase: float

    @property
    def pos(self):
        return (self.x, self.y)

    def draw(self, screen, now):
        pulse = math.sin(now / 180 + self.phase) * 2.5
        center = (round(self.x), round(self.y))
        draw_glow_circle(screen, center, 24, YELLOW, 42)
        pygame.draw.circle(screen, (255, 230, 76), center, round(FOOD_RADIUS + pulse))
        pygame.draw.circle(screen, HONEY, center, FOOD_RADIUS, 2)
        pygame.draw.circle(screen, WHITE, (center[0] - 3, center[1] - 4), 2)


@dataclass
class MovingFace:
    name: str
    color: tuple[int, int, int]
    x: float
    y: float
    vx: float
    vy: float
    image: pygame.Surface | None = None
    recognized: bool = False
    last_seen_ms: int = 0

    @property
    def pos(self):
        return (self.x, self.y)

    @property
    def angle(self):
        return math.atan2(self.vy, self.vx)

    def update(self, difficulty=None):
        self.x += self.vx
        self.y += self.vy

        if self.x < MAP_LEFT + 45 or self.x > MAP_LEFT + MAP_WIDTH - 45:
            self.vx *= -1
            self.x = clamp(self.x, MAP_LEFT + 45, MAP_LEFT + MAP_WIDTH - 45)

        if self.y < MAP_TOP + 45 or self.y > MAP_TOP + MAP_HEIGHT - 45:
            self.vy *= -1
            self.y = clamp(self.y, MAP_TOP + 45, MAP_TOP + MAP_HEIGHT - 45)

        if random.random() < 0.012:
            self.vx += random.uniform(-0.22, 0.22)
            self.vy += random.uniform(-0.22, 0.22)
            if difficulty is None:
                min_speed, max_speed = 0.8, 2.7
            else:
                min_speed = max(0.04, 0.4 * difficulty.face_speed)
                max_speed = max(0.14, 2.0 * difficulty.face_speed)
            speed = clamp(math.hypot(self.vx, self.vy), min_speed, max_speed)
            angle = math.atan2(self.vy, self.vx)
            self.vx = math.cos(angle) * speed
            self.vy = math.sin(angle) * speed

    def sees(self, bee, difficulty):
        dist = distance(self.pos, bee.pos)
        if dist > difficulty.vision_range:
            return False
        target_angle = math.atan2(bee.y - self.y, bee.x - self.x)
        return abs(angle_delta(target_angle, self.angle)) <= math.radians(difficulty.vision_angle_deg / 2)

    def draw_vision(self, screen, difficulty):
        left = self.angle - math.radians(difficulty.vision_angle_deg / 2)
        right = self.angle + math.radians(difficulty.vision_angle_deg / 2)
        p1 = self.pos
        p2 = (
            self.x + math.cos(left) * difficulty.vision_range,
            self.y + math.sin(left) * difficulty.vision_range,
        )
        p3 = (
            self.x + math.cos(right) * difficulty.vision_range,
            self.y + math.sin(right) * difficulty.vision_range,
        )
        cone = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        pygame.draw.polygon(cone, (*DANGER, 34), [p1, p2, p3])
        pygame.draw.line(cone, (*DANGER, 120), p1, p2, 2)
        pygame.draw.line(cone, (*DANGER, 120), p1, p3, 2)
        screen.blit(cone, (0, 0))

    def draw(self, screen, font):
        rect = pygame.Rect(0, 0, FACE_SIZE, FACE_SIZE)
        rect.center = (round(self.x), round(self.y))
        border = GREEN if self.recognized else self.color
        outer = hex_points(rect.center, FACE_HEX_RADIUS)
        inner_radius = FACE_HEX_RADIUS - 9
        inner = hex_points(rect.center, inner_radius)

        pygame.draw.polygon(screen, border, outer)
        pygame.draw.polygon(screen, (22, 32, 49), inner)

        if self.image is not None:
            clip_size = inner_radius * 2
            local_center = (clip_size // 2, clip_size // 2)
            image = pygame.transform.smoothscale(self.image, (clip_size, clip_size))
            clipped = pygame.Surface((clip_size, clip_size), pygame.SRCALPHA)
            clipped.blit(image, (0, 0))
            mask = pygame.Surface((clip_size, clip_size), pygame.SRCALPHA)
            local_hex = hex_points(local_center, inner_radius)
            pygame.draw.polygon(mask, (255, 255, 255, 255), local_hex)
            clipped.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
            screen.blit(clipped, clipped.get_rect(center=rect.center))
        else:
            pygame.draw.circle(screen, self.color, rect.center, 25)

        pygame.draw.polygon(screen, WHITE, outer, 2)

        label = font.render(self.name if self.recognized else "unknown", True, WHITE)
        label_rect = label.get_rect(center=(self.x, self.y + FACE_HEX_RADIUS + 12))
        screen.blit(label, label_rect)


@dataclass
class Bee:
    x: float
    y: float
    angle: float = -math.pi / 2
    energy: float = ENERGY_MAX

    @property
    def pos(self):
        return (self.x, self.y)

    def update(self, keys, dt):
        turn = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            turn -= 1
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            turn += 1
        self.angle += math.radians(BEE_TURN_SPEED_DEG) * turn

        direction = 0
        if keys[pygame.K_UP] or keys[pygame.K_w]:
            direction += 1
        if keys[pygame.K_DOWN] or keys[pygame.K_s]:
            direction -= 1

        if direction:
            self.x += math.cos(self.angle) * BEE_SPEED * direction
            self.y += math.sin(self.angle) * BEE_SPEED * direction

        self.x = clamp(self.x, MAP_LEFT + 28, MAP_LEFT + MAP_WIDTH - 28)
        self.y = clamp(self.y, MAP_TOP + 28, MAP_TOP + MAP_HEIGHT - 28)

    def drain_energy(self, difficulty, dt):
        self.energy = max(0.0, self.energy - difficulty.energy_drain * dt)

    def add_energy(self):
        self.energy = min(ENERGY_MAX, self.energy + FOOD_ENERGY)

    def draw(self, screen):
        bee_surface = pygame.Surface((116, 96), pygame.SRCALPHA)
        wing = (220, 246, 255, 145)
        wing_edge = (169, 213, 230, 170)
        body_dark = (29, 23, 15)
        body_shadow = (168, 104, 12, 120)

        pygame.draw.ellipse(bee_surface, wing, (18, 14, 44, 30))
        pygame.draw.ellipse(bee_surface, wing_edge, (18, 14, 44, 30), 2)
        pygame.draw.ellipse(bee_surface, wing, (18, 52, 44, 30))
        pygame.draw.ellipse(bee_surface, wing_edge, (18, 52, 44, 30), 2)
        pygame.draw.ellipse(bee_surface, wing, (44, 8, 42, 28))
        pygame.draw.ellipse(bee_surface, wing_edge, (44, 8, 42, 28), 2)
        pygame.draw.ellipse(bee_surface, wing, (44, 60, 42, 28))
        pygame.draw.ellipse(bee_surface, wing_edge, (44, 60, 42, 28), 2)

        pygame.draw.ellipse(bee_surface, body_shadow, (36, 28, 58, 42))
        pygame.draw.ellipse(bee_surface, (255, 205, 42), (32, 26, 62, 44))
        pygame.draw.ellipse(bee_surface, (255, 224, 88), (42, 30, 38, 20))
        for x in (45, 58, 71):
            pygame.draw.line(bee_surface, body_dark, (x, 29), (x - 2, 68), 6)

        pygame.draw.circle(bee_surface, body_dark, (94, 48), 15)
        pygame.draw.polygon(bee_surface, (255, 201, 52), [(109, 48), (95, 38), (95, 58)])
        pygame.draw.circle(bee_surface, WHITE, (98, 43), 4)
        pygame.draw.circle(bee_surface, WHITE, (98, 53), 4)
        pygame.draw.circle(bee_surface, (5, 9, 13), (100, 43), 2)
        pygame.draw.circle(bee_surface, (5, 9, 13), (100, 53), 2)
        pygame.draw.line(bee_surface, body_dark, (94, 38), (106, 25), 2)
        pygame.draw.line(bee_surface, body_dark, (94, 58), (106, 71), 2)
        pygame.draw.circle(bee_surface, body_dark, (107, 24), 3)
        pygame.draw.circle(bee_surface, body_dark, (107, 72), 3)

        if BEE_DRAW_SCALE != 1.0:
            bee_surface = pygame.transform.smoothscale(
                bee_surface,
                (round(bee_surface.get_width() * BEE_DRAW_SCALE), round(bee_surface.get_height() * BEE_DRAW_SCALE)),
            )
        rotated = pygame.transform.rotate(bee_surface, -math.degrees(self.angle))
        screen.blit(rotated, rotated.get_rect(center=(round(self.x), round(self.y))))


def random_map_point(margin=40):
    return (
        random.randint(MAP_LEFT + margin, MAP_LEFT + MAP_WIDTH - margin),
        random.randint(MAP_TOP + margin, MAP_TOP + MAP_HEIGHT - margin),
    )


def screen_to_world(x, y):
    norm_x = (float(x) - MAP_LEFT) / MAP_WIDTH
    norm_y = (float(y) - MAP_TOP) / MAP_HEIGHT
    world_x = (norm_x - 0.5) * BRIDGE_GROUND_SIZE
    world_z = (0.5 - norm_y) * BRIDGE_GROUND_SIZE
    return world_x, world_z


def screen_angle_to_world_yaw(angle):
    return (math.degrees(angle) + BRIDGE_YAW_OFFSET_DEG) % 360.0


def write_ursina_control(bee, faces, foods, difficulty, state, cpu_scan_request_id=0):
    try:
        external_cpu_scan_request_id = 0
        try:
            existing = json.loads(URSINA_CONTROL_PATH.read_text(encoding="utf-8-sig"))
            if isinstance(existing, dict):
                external_cpu_scan_request_id = int(existing.get("cpu_scan_request_id", 0) or 0)
        except Exception:
            external_cpu_scan_request_id = 0
        cpu_scan_request_id = max(int(cpu_scan_request_id), external_cpu_scan_request_id)

        bx, bz = screen_to_world(bee.x, bee.y)
        statues = []
        for face in faces:
            sx, sz = screen_to_world(face.x, face.y)
            statues.append(
                {
                    "label": face.name,
                    "x": round(sx, 4),
                    "y": 0.0,
                    "z": round(sz, 4),
                    "yaw": round(screen_angle_to_world_yaw(face.angle), 4),
                    "recognized": bool(face.recognized),
                }
            )

        spheres = []
        for index, food in enumerate(foods):
            fx, fz = screen_to_world(food.x, food.y)
            spheres.append(
                {
                    "id": index,
                    "x": round(fx, 4),
                    "y": BRIDGE_BEE_Y,
                    "z": round(fz, 4),
                    "radius": 0.75,
                }
            )

        linked_mode = os.environ.get("BEE_FACE_PATROL_LINKED_MODE") == "1"
        payload = {
            "source": "bee_face_patrol_2d",
            "linked_mode": linked_mode,
            "active": (state == STATE_PLAYING) or (linked_mode and state != STATE_MENU),
            "updated_at": time.time(),
            "ground_size": BRIDGE_GROUND_SIZE,
            "difficulty": difficulty.name,
            "cpu_scan_request_id": int(cpu_scan_request_id),
            "bee": {
                "id": 0,
                "x": round(bx, 4),
                "y": BRIDGE_BEE_Y,
                "z": round(bz, 4),
                "yaw": round(screen_angle_to_world_yaw(bee.angle), 4),
                "energy": round(float(bee.energy), 2),
            },
            "statues": statues,
            "spheres": spheres,
        }
        temp_path = URSINA_CONTROL_PATH.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temp_path.replace(URSINA_CONTROL_PATH)
    except Exception:
        pass


def make_faces(difficulty):
    def px(fraction):
        return MAP_LEFT + MAP_WIDTH * fraction

    def py(fraction):
        return MAP_TOP + MAP_HEIGHT * fraction

    base = [
        ("Adi", BLUE, px(0.82), py(0.18), -1.5, 1.0),
        ("Faraj", RED, px(0.76), py(0.70), -1.3, -1.0),
        ("Slava", GREEN, px(0.50), py(0.30), 1.2, 1.0),
    ]
    faces = []
    for name, color, x, y, vx, vy in base:
        faces.append(
            MovingFace(
                name,
                color,
                x,
                y,
                vx * difficulty.face_speed,
                vy * difficulty.face_speed,
                load_face_image(FACE_FILES[name]),
            )
        )
    return faces


def make_food(count):
    return [Food(*random_map_point(36), random.random() * 10) for _ in range(count)]


def reset_game(difficulty):
    bee = Bee(MAP_LEFT + MAP_WIDTH * 0.12, MAP_TOP + MAP_HEIGHT * 0.78)
    faces = make_faces(difficulty)
    food = make_food(max(2, difficulty.max_food // 2))
    message = "Collect pollen, avoid vision cones, scan faces."
    return bee, faces, food, message, 0, 0


def scan_nearest_face(bee, faces, now, linked_mode=False):
    scan_radius = SCAN_RADIUS if not linked_mode else max(SCAN_RADIUS, 250)
    if not faces:
        return "No face targets loaded."
    nearest = min(faces, key=lambda face: distance(bee.pos, face.pos))
    nearest_distance = distance(bee.pos, nearest.pos)
    if nearest_distance > scan_radius:
        return f"Nearest face is {int(nearest_distance)} px away. Fly closer."
    nearest.recognized = True
    nearest.last_seen_ms = now
    return f"Recognized {nearest.name}."


def draw_map(screen):
    pygame.draw.rect(screen, MAP_BG, (MAP_LEFT, MAP_TOP, MAP_WIDTH, MAP_HEIGHT), border_radius=10)
    pygame.draw.rect(screen, LINE, (MAP_LEFT, MAP_TOP, MAP_WIDTH, MAP_HEIGHT), 2, border_radius=10)

    for x in range(MAP_LEFT + 40, MAP_LEFT + MAP_WIDTH, 40):
        pygame.draw.line(screen, GRID, (x, MAP_TOP), (x, MAP_TOP + MAP_HEIGHT), 1)
    for y in range(MAP_TOP + 40, MAP_TOP + MAP_HEIGHT, 40):
        pygame.draw.line(screen, GRID, (MAP_LEFT, y), (MAP_LEFT + MAP_WIDTH, y), 1)


def draw_energy_bar(screen, x, y, width, height, energy):
    pygame.draw.rect(screen, (8, 15, 25), (x, y, width, height), border_radius=7)
    fill = int(width * clamp(energy / ENERGY_MAX, 0, 1))
    color = GREEN if energy > 55 else YELLOW if energy > 25 else DANGER
    pygame.draw.rect(screen, color, (x, y, fill, height), border_radius=7)
    pygame.draw.rect(screen, LINE, (x, y, width, height), 2, border_radius=7)


def draw_sidebar(screen, title_font, font, small_font, faces, message, score, bee, difficulty):
    pygame.draw.rect(screen, PANEL, (SIDEBAR_LEFT, 74, 260, 660), border_radius=10)
    pygame.draw.rect(screen, LINE, (SIDEBAR_LEFT, 74, 260, 660), 2, border_radius=10)

    screen.blit(title_font.render("Bee Face Patrol", True, YELLOW), (SIDEBAR_LEFT + 18, 96))
    screen.blit(small_font.render(f"Difficulty: {difficulty.label}", True, MUTED), (SIDEBAR_LEFT + 18, 132))

    lines = [
        "Turn: A/D or left/right",
        "Move: W/S or up/down",
        "Scan: Space or click face",
        "Restart same: R",
        "Choose level: M",
    ]
    y = 162
    for line in lines:
        screen.blit(small_font.render(line, True, MUTED), (SIDEBAR_LEFT + 18, y))
        y += 23

    pygame.draw.line(screen, LINE, (SIDEBAR_LEFT + 18, 284), (SIDEBAR_LEFT + 236, 284), 1)
    screen.blit(font.render(f"Recognized: {score}/3", True, WHITE), (SIDEBAR_LEFT + 18, 306))
    draw_energy_bar(screen, SIDEBAR_LEFT + 18, 342, 218, 17, bee.energy)
    screen.blit(small_font.render(f"Energy: {int(bee.energy)}%", True, MUTED), (SIDEBAR_LEFT + 18, 364))
    angle_degrees = int((math.degrees(bee.angle) + 360) % 360)
    screen.blit(small_font.render(f"Bee angle: {angle_degrees} deg", True, MUTED), (SIDEBAR_LEFT + 18, 386))

    y = 430
    for face in faces:
        status = "OK" if face.recognized else "searching"
        color = GREEN if face.recognized else MUTED
        pygame.draw.circle(screen, face.color, (SIDEBAR_LEFT + 30, y + 8), 8)
        screen.blit(font.render(face.name, True, WHITE), (SIDEBAR_LEFT + 48, y))
        screen.blit(small_font.render(status, True, color), (SIDEBAR_LEFT + 48, y + 24))
        y += 56

    pygame.draw.line(screen, LINE, (SIDEBAR_LEFT + 18, 610), (SIDEBAR_LEFT + 236, 610), 1)
    for i, line in enumerate(wrap_text(message, small_font, 220)[:4]):
        screen.blit(small_font.render(line, True, YELLOW), (SIDEBAR_LEFT + 18, 630 + i * 22))


def wrap_text(text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if font.size(candidate)[0] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def draw_menu(screen, title_font, font, small_font):
    screen.fill(BG)
    draw_centered_text(screen, title_font, "Bee Face Patrol", YELLOW, (WIDTH // 2, 95))
    draw_centered_text(screen, font, "Choose difficulty", WHITE, (WIDTH // 2, 135))
    draw_centered_text(screen, small_font, "Collect pollen, avoid vision fields, recognize all three faces.", MUTED, (WIDTH // 2, 166))

    centers = [(WIDTH // 2 - 230, 390), (WIDTH // 2, 390), (WIDTH // 2 + 230, 390)]
    for i, difficulty in enumerate(DIFFICULTIES):
        center = centers[i]
        points = hex_points(center, 88)
        fill = (36, 65, 55) if i == 0 else (70, 51, 25) if i == 1 else (70, 33, 42)
        pygame.draw.polygon(screen, fill, points)
        pygame.draw.polygon(screen, YELLOW, points, 4)
        draw_centered_text(screen, font, difficulty.label, WHITE, (center[0], center[1] - 18))
        draw_centered_text(screen, small_font, f"{i + 1} key", MUTED, (center[0], center[1] + 16))

    draw_centered_text(screen, small_font, "Click a hexagon or press 1 / 2 / 3", MUTED, (WIDTH // 2, 560))
    return centers


def draw_end_screen(screen, title_font, font, small_font, state, message):
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 150))
    screen.blit(overlay, (0, 0))
    box = pygame.Rect((WIDTH - 510) // 2, 190, 510, 240)
    pygame.draw.rect(screen, PANEL, box, border_radius=14)
    pygame.draw.rect(screen, YELLOW if state == STATE_WIN else DANGER, box, 4, border_radius=14)
    title = "Mission Complete" if state == STATE_WIN else "Game Over"
    draw_centered_text(screen, title_font, title, YELLOW if state == STATE_WIN else DANGER, (WIDTH // 2, 250))
    draw_centered_text(screen, font, message, WHITE, (WIDTH // 2, 305))
    draw_centered_text(screen, small_font, "Press R to restart same level or M to choose difficulty", MUTED, (WIDTH // 2, 365))


@dataclass
class GameButton:
    label: str
    rect: pygame.Rect
    role: str

    def contains(self, position):
        return self.rect.collidepoint(position)

    def draw(self, screen, font, active=True):
        fill = (32, 51, 79) if active else (40, 37, 45)
        pygame.draw.rect(screen, fill, self.rect, border_radius=7)
        pygame.draw.rect(screen, YELLOW if active else LINE, self.rect, 2, border_radius=7)
        draw_centered_text(screen, font, self.label, WHITE if active else MUTED, self.rect.center)


class SoundSystem:
    def __init__(self):
        self.enabled = True
        self.sounds = {}
        self.available = False
        self.music_started = False
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
            self.sounds = {
                "start": [self._tone(660, 0.10), self._tone(880, 0.12)],
                "scan": [self._tone(980, 0.08)],
                "collect": [self._tone(740, 0.07), self._tone(1120, 0.08)],
                "win": [self._tone(660, 0.08), self._tone(880, 0.08), self._tone(1180, 0.18)],
                "lose": [self._tone(260, 0.18)],
            }
            self.available = True
        except pygame.error:
            self.available = False

    def start_background_music(self):
        if not BACKGROUND_MUSIC_ENABLED:
            return
        if not self.available or self.music_started or not BACKGROUND_MUSIC_PATH.exists():
            return
        try:
            pygame.mixer.music.load(str(BACKGROUND_MUSIC_PATH))
            pygame.mixer.music.set_volume(0.35)
            pygame.mixer.music.play(-1)
            self.music_started = True
        except pygame.error:
            self.music_started = False

    def _tone(self, frequency, seconds, volume=0.35):
        sample_rate = 22050
        sample_count = max(1, int(sample_rate * seconds))
        samples = array("h")
        for index in range(sample_count):
            envelope = 1.0 - index / sample_count
            value = int(32767 * volume * envelope * math.sin(math.tau * frequency * index / sample_rate))
            samples.append(value)
        return pygame.mixer.Sound(buffer=samples.tobytes())

    def play(self, name):
        if self.enabled and self.available and name in self.sounds:
            for sound in self.sounds[name]:
                sound.play()

    def toggle(self):
        self.enabled = not self.enabled
        if not self.enabled and self.available:
            pygame.mixer.stop()
            if self.music_started:
                pygame.mixer.music.pause()
        elif self.enabled and self.music_started:
            pygame.mixer.music.unpause()
        return self.enabled


class BeeFacePatrolGame:
    def __init__(self):
        pygame.mixer.pre_init(22050, -16, 1, 512)
        pygame.init()
        pygame.display.set_caption("Bee Face Patrol")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.title_font = pygame.font.SysFont("arial", 32, bold=True)
        self.font = pygame.font.SysFont("arial", 22, bold=True)
        self.small_font = pygame.font.SysFont("arial", 16)
        self.button_font = pygame.font.SysFont("arial", 14, bold=True)
        self.sound = SoundSystem()
        self.sound.start_background_music()
        self.linked_mode = os.environ.get("BEE_FACE_PATROL_LINKED_MODE") == "1"
        self.start_difficulty_name = os.environ.get("BEE_FACE_PATROL_START_DIFFICULTY", "").strip().lower()
        self.difficulty = next((item for item in DIFFICULTIES if item.name == self.start_difficulty_name), DIFFICULTIES[1])
        self.state = STATE_PLAYING if self.start_difficulty_name else STATE_MENU
        if os.environ.get("BEE_FACE_PATROL_SMOKE") == "1":
            self.state = STATE_PLAYING
        self.end_message = ""
        self.running = True
        self.paused = False
        self.frame_count = 0
        self.cpu_scan_request_id = 0
        self.last_identity_mtime = 0.0
        self.round_started_ms = 0
        self.buttons = self._create_buttons()
        self.reset_round(play_sound=bool(self.start_difficulty_name))
        launch_ursina_standalone()
        keep_game_window_in_front(pygame.display.get_wm_info().get("window"))

    def _create_buttons(self):
        y = 24
        width = 70 if LINKED_LAYOUT else 104
        gap = 8
        labels = [("Pause", "pause"), ("CUDA", "cpu"), ("Sound", "sound"), ("Reset", "reset"), ("Stop", "stop")]
        buttons = []
        x = WIDTH - (width * len(labels) + gap * (len(labels) - 1)) - 18
        for label, role in labels:
            buttons.append(GameButton(label, pygame.Rect(x, y, width, 30), role))
            x += width + gap
        return buttons

    def reset_round(self, play_sound=True):
        self.bee, self.faces, self.foods, self.message, self.last_scan, self.last_food_spawn = reset_game(self.difficulty)
        self.end_message = ""
        self.paused = False
        if self.state != STATE_MENU:
            self.state = STATE_PLAYING
        self.round_started_ms = pygame.time.get_ticks()
        if play_sound:
            self.sound.play("start")

    def choose_difficulty(self, index):
        self.difficulty = DIFFICULTIES[index]
        self.state = STATE_PLAYING
        self.reset_round(play_sound=True)

    def set_end_state(self, state, message, sound_name):
        if self.state == STATE_PLAYING:
            self.state = state
            self.end_message = message
            self.sound.play(sound_name)

    def handle_button_click(self, position):
        for button in self.buttons:
            if button.contains(position):
                if button.role == "sound":
                    enabled = self.sound.toggle()
                    button.label = "Sound" if enabled else "Mute"
                elif button.role == "pause":
                    if self.state == STATE_PLAYING:
                        self.paused = not self.paused
                        button.label = "Resume" if self.paused else "Pause"
                        self.message = "Game paused." if self.paused else "Game resumed."
                elif button.role == "cpu":
                    if self.state == STATE_PLAYING:
                        self.cpu_scan_request_id += 1
                        self.message = "NVIDIA CUDA face scan requested in 3D view."
                        self.sound.play("scan")
                elif button.role == "reset":
                    self.reset_round(play_sound=True)
                elif button.role == "stop":
                    self.set_end_state(STATE_GAME_OVER, "Game stopped.", "lose")
                return True
        return False

    def handle_keydown(self, key, now):
        if key == pygame.K_ESCAPE:
            self.running = False
        elif self.state == STATE_MENU and key in (pygame.K_1, pygame.K_2, pygame.K_3):
            self.choose_difficulty(key - pygame.K_1)
        elif key == pygame.K_m:
            self.state = STATE_MENU
        elif key == pygame.K_r:
            self.reset_round(play_sound=True)
        elif key == pygame.K_p and self.state == STATE_PLAYING:
            self.paused = not self.paused
            for button in self.buttons:
                if button.role == "pause":
                    button.label = "Resume" if self.paused else "Pause"
        elif self.state == STATE_PLAYING and key == pygame.K_SPACE:
            if now - self.last_scan < SCAN_COOLDOWN_MS:
                self.message = "Scanner cooling down."
            else:
                self.last_scan = now
                self.message = scan_nearest_face(self.bee, self.faces, now, self.linked_mode)
                self.sound.play("scan")
        elif self.state == STATE_PLAYING and key == pygame.K_c:
            self.cpu_scan_request_id += 1
            self.message = "NVIDIA CUDA face scan requested in 3D view."
            self.sound.play("scan")

    def poll_identity_result(self):
        if not self.linked_mode:
            return
        try:
            mtime = IDENTITY_RESULT_PATH.stat().st_mtime
            if mtime <= self.last_identity_mtime:
                return
            result = json.loads(IDENTITY_RESULT_PATH.read_text(encoding="utf-8-sig"))
            self.last_identity_mtime = mtime
        except (OSError, json.JSONDecodeError):
            return

        accepted = bool(result.get("accepted")) and str(result.get("identity", "")) in FACE_FILES
        identity = str(result.get("identity") if accepted else result.get("best_label", "Unknown"))
        elapsed = float(result.get("elapsed_ms", 0.0) or 0.0)
        stamp = str(result.get("timestamp_iso", ""))

        if accepted:
            for face in self.faces:
                if face.name == identity:
                    face.recognized = True
                    face.last_seen_ms = pygame.time.get_ticks()
                    break
            self.message = f"NVIDIA CUDA detected {identity} in {elapsed:.0f} ms at {stamp}."
            self.sound.play("scan")
        else:
            self.message = f"NVIDIA CUDA not detected; best {identity} in {elapsed:.0f} ms."

    def handle_mouse_click(self, position):
        if self.handle_button_click(position):
            return
        if self.state == STATE_MENU:
            menu_centers = [(WIDTH // 2 - 230, 390), (WIDTH // 2, 390), (WIDTH // 2 + 230, 390)]
            for index, center in enumerate(menu_centers):
                if point_in_poly(position, hex_points(center, 88)):
                    self.choose_difficulty(index)
                    return
        if self.state == STATE_PLAYING:
            clicked_face = next(
                (face for face in self.faces if point_in_poly(position, hex_points((face.x, face.y), FACE_HEX_RADIUS))),
                None,
            )
            if clicked_face is not None:
                clicked_face.recognized = True
                clicked_face.last_seen_ms = pygame.time.get_ticks()
                self.message = f"Recognized {clicked_face.name}."
                self.sound.play("scan")

    def handle_events(self, now):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                self.handle_keydown(event.key, now)
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                self.handle_mouse_click(event.pos)

    def update_playing(self, dt, now):
        self.poll_identity_result()
        if self.paused:
            return
        keys = pygame.key.get_pressed()
        self.bee.update(keys, dt)
        self.bee.drain_energy(self.difficulty, dt)

        for face in self.faces:
            face.update(self.difficulty)

        if len(self.foods) < self.difficulty.max_food and now - self.last_food_spawn >= self.difficulty.food_spawn_ms:
            self.foods.append(Food(*random_map_point(36), random.random() * 10))
            self.last_food_spawn = now

        remaining_food = []
        for food in self.foods:
            if distance(self.bee.pos, food.pos) <= 31:
                self.bee.add_energy()
                self.message = "Pollen collected. Energy restored."
                self.sound.play("collect")
            else:
                remaining_food.append(food)
        self.foods = remaining_food

        spotted_by = None
        if now - self.round_started_ms > 3000:
            spotted_by = next((face for face in self.faces if face.sees(self.bee, self.difficulty)), None)
        if spotted_by is not None:
            self.set_end_state(STATE_GAME_OVER, f"{spotted_by.name} saw the bee.", "lose")
        if self.bee.energy <= 0:
            self.set_end_state(STATE_GAME_OVER, "Energy is empty.", "lose")
        if sum(1 for face in self.faces if face.recognized) == 3:
            self.set_end_state(STATE_WIN, "You win! All faces detected.", "win")

    def draw_buttons(self):
        for button in self.buttons:
            button.draw(self.screen, self.button_font, active=True)

    def draw(self, now):
        if self.state == STATE_MENU:
            draw_menu(self.screen, self.title_font, self.font, self.small_font)
            self.draw_buttons()
            return

        self.screen.fill(BG)
        title_font_to_use = self.font if LINKED_LAYOUT else self.title_font
        self.screen.blit(title_font_to_use.render("2D Bee Game: stealth face recognition", True, WHITE), (MAP_LEFT, 24))
        self.screen.blit(
            self.small_font.render("Collect pollen dots, avoid red vision cones, scan faces from safety.", True, MUTED),
            (MAP_LEFT, 54),
        )
        self.draw_buttons()
        draw_map(self.screen)
        for face in self.faces:
            face.draw_vision(self.screen, self.difficulty)
        for food in self.foods:
            food.draw(self.screen, now)
        for face in self.faces:
            face.draw(self.screen, self.small_font)
        self.bee.draw(self.screen)
        if self.paused:
            draw_centered_text(self.screen, self.font, "Paused", YELLOW, (MAP_LEFT + MAP_WIDTH // 2, MAP_TOP + 36))

        score = sum(1 for face in self.faces if face.recognized)
        if not LINKED_LAYOUT:
            draw_sidebar(self.screen, self.title_font, self.font, self.small_font, self.faces, self.message, score, self.bee, self.difficulty)
        if self.state in (STATE_GAME_OVER, STATE_WIN):
            draw_end_screen(self.screen, self.title_font, self.font, self.small_font, self.state, self.end_message)

    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            now = pygame.time.get_ticks()
            self.handle_events(now)
            if self.state == STATE_PLAYING:
                self.update_playing(dt, now)
            write_ursina_control(self.bee, self.faces, self.foods, self.difficulty, self.state, self.cpu_scan_request_id)
            self.draw(now)
            pygame.display.flip()
            self.frame_count += 1
            if os.environ.get("BEE_FACE_PATROL_SMOKE") == "1" and self.frame_count > 25:
                self.running = False
        pygame.quit()
        return 0


def run_game():
    return BeeFacePatrolGame().run()


if __name__ == "__main__":
    raise SystemExit(run_game())
