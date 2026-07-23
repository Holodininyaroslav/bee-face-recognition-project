import json
import os
import ctypes
from ctypes import wintypes
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parent
DESKTOP = PACKAGE_ROOT
GAME_2D = DESKTOP / "bee_face_patrol.py"
URSINA_ROOT = PACKAGE_ROOT / "Bee_3D_Standalone"
URSINA_LAUNCHER = URSINA_ROOT / "Start Bee 3D Standalone.ps1"
URSINA_MAIN = URSINA_ROOT / "main.py"
KNOWN_URSINA_PYTHON = Path(r"C:\Users\79090\Desktop\Bee simulator  with AI MIPS\Nano-zionist\.venv\Scripts\python.exe")
CONTROL_PATH = URSINA_ROOT / "bee_space_control.json"
LOG_PATH = DESKTOP / "linked_bee_launcher.log"
GAME_2D_STDOUT = DESKTOP / "linked_bee_2d_stdout.log"
GAME_2D_STDERR = DESKTOP / "linked_bee_2d_stderr.log"
IDENTITY_RESULT_PATH = URSINA_ROOT / "local_face_ai" / "identity_output" / "latest_identity_result.json"
LINKED_2D_W = 1100
LINKED_2D_H = 720

DIFFICULTIES = {
    "easy": ("Easy", "#1f513d"),
    "normal": ("Normal", "#5a3b12"),
    "hard": ("Hard", "#651f32"),
}

user32 = ctypes.windll.user32
GWL_STYLE = -16
WS_CAPTION = 0x00C00000
WS_THICKFRAME = 0x00040000
WS_MINIMIZEBOX = 0x00020000
WS_MAXIMIZEBOX = 0x00010000
WS_SYSMENU = 0x00080000
SW_RESTORE = 9
HWND_TOP = 0
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_SHOWWINDOW = 0x0040


def log(message: str):
    try:
        LOG_PATH.write_text(
            (LOG_PATH.read_text(encoding="utf-8") if LOG_PATH.exists() else "")
            + f"{time.strftime('%H:%M:%S')} {message}\n",
            encoding="utf-8",
        )
    except OSError:
        pass

user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowW.restype = wintypes.HWND
user32.SetParent.argtypes = [wintypes.HWND, wintypes.HWND]
user32.SetParent.restype = wintypes.HWND
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.ShowWindow.restype = wintypes.BOOL
user32.MoveWindow.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.BOOL]
user32.MoveWindow.restype = wintypes.BOOL
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
user32.SetWindowLongW.restype = ctypes.c_long
user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
user32.EnumWindows.restype = wintypes.BOOL
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.BringWindowToTop.argtypes = [wintypes.HWND]
user32.BringWindowToTop.restype = wintypes.BOOL
user32.SetWindowPos.argtypes = [
    wintypes.HWND,
    wintypes.HWND,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_uint,
]
user32.SetWindowPos.restype = wintypes.BOOL


def stop_old_linked_processes():
    exclude_pid = os.getpid()
    patterns = ("bee_face_patrol.py", r"Bee_3D_Standalone\main.py")
    try:
        output = subprocess.check_output(
            ["wmic", "process", "get", "ProcessId,CommandLine", "/FORMAT:CSV"],
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=5,
        )
    except Exception as exc:
        log(f"process cleanup skipped: {exc}")
        return

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("Node,"):
            continue
        try:
            _, rest = line.split(",", 1)
            command_line, pid_text = rest.rsplit(",", 1)
            pid = int(pid_text)
        except ValueError:
            continue
        if pid == exclude_pid:
            continue
        if any(pattern in command_line for pattern in patterns):
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )


def seed_control_file(difficulty: str):
    payload = {
        "source": "linked_launcher",
        "active": False,
        "updated_at": time.time(),
        "ground_size": 240.0,
        "difficulty": difficulty,
        "bee": {"id": 0, "x": 0.0, "y": 4.6, "z": 0.0, "yaw": 0.0, "energy": 100.0},
        "statues": [],
        "spheres": [],
    }
    CONTROL_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    try:
        IDENTITY_RESULT_PATH.unlink(missing_ok=True)
    except OSError:
        pass


def resolve_ursina_python() -> str:
    for candidate in (URSINA_ROOT / ".venv" / "Scripts" / "python.exe", KNOWN_URSINA_PYTHON, Path(sys.executable)):
        if candidate.exists():
            pythonw = candidate.with_name("pythonw.exe")
            return str(pythonw if pythonw.exists() else candidate)
    return sys.executable


def ensure_pygame_runtime():
    check = subprocess.run(
        [sys.executable, "-c", "import pygame"],
        cwd=str(DESKTOP),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if check.returncode == 0:
        return

    log("pygame missing for 2D map; installing pygame into launcher Python")
    with GAME_2D_STDOUT.open("a", encoding="utf-8", errors="replace") as stdout, GAME_2D_STDERR.open(
        "a", encoding="utf-8", errors="replace"
    ) as stderr:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "pygame"],
            cwd=str(DESKTOP),
            stdout=stdout,
            stderr=stderr,
            check=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    log("pygame installed for 2D map")


def launch_processes(difficulty: str):
    log(f"launch_processes start difficulty={difficulty}")
    stop_old_linked_processes()
    seed_control_file(difficulty)
    return launch_3d_process(difficulty)


def launch_3d_process(difficulty: str):
    env3d = os.environ.copy()
    env3d["AI_MIPS_LINKED_2D_CONTROL"] = "1"
    env3d["AI_MIPS_LINKED_DIFFICULTY"] = difficulty
    env3d["AI_MIPS_WINDOW_W"] = "360"
    env3d["AI_MIPS_WINDOW_H"] = "250"
    process = subprocess.Popen(
        [resolve_ursina_python(), str(URSINA_MAIN)],
        cwd=str(URSINA_ROOT),
        env=env3d,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    log("3D launch requested")
    return process

def launch_2d(difficulty: str):
    ensure_pygame_runtime()
    env2d = os.environ.copy()
    env2d["BEE_FACE_PATROL_START_DIFFICULTY"] = difficulty
    env2d["BEE_FACE_PATROL_NO_URSINA_AUTOLAUNCH"] = "1"
    env2d["BEE_FACE_PATROL_LINKED_MODE"] = "1"
    env2d["SDL_VIDEO_WINDOW_POS"] = "480,90"
    stdout = GAME_2D_STDOUT.open("w", encoding="utf-8", errors="replace")
    stderr = GAME_2D_STDERR.open("w", encoding="utf-8", errors="replace")
    subprocess.Popen(
        [sys.executable, str(GAME_2D)],
        cwd=str(DESKTOP),
        env=env2d,
        stdout=stdout,
        stderr=stderr,
    )
    log("2D launch requested")


def find_window(title: str, timeout: float = 18.0) -> int:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = user32.FindWindowW(None, title)
        if hwnd:
            return int(hwnd)
        time.sleep(0.25)
    return 0


def find_window_for_pid(pid: int, timeout: float = 70.0) -> int:
    if not pid:
        return 0
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    deadline = time.time() + timeout
    while time.time() < deadline:
        found = []

        def enum_proc(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            window_pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
            if int(window_pid.value) == int(pid):
                found.append(int(hwnd))
                return False
            return True

        user32.EnumWindows(callback_type(enum_proc), 0)
        if found:
            return found[0]
        time.sleep(0.25)
    return 0


def embed_window(hwnd: int, parent_hwnd: int, width: int, height: int):
    if not hwnd or not parent_hwnd:
        return False
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetParent(hwnd, parent_hwnd)
    style = user32.GetWindowLongW(hwnd, GWL_STYLE)
    style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU)
    user32.SetWindowLongW(hwnd, GWL_STYLE, style)
    user32.MoveWindow(hwnd, 0, 0, width, height, True)
    return True


def place_window(hwnd: int, x: int, y: int, width: int, height: int):
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.MoveWindow(hwnd, x, y, width, height, True)
    return True


def raise_window(hwnd: int):
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.BringWindowToTop(hwnd)
    user32.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
    user32.SetForegroundWindow(hwnd)
    return True


def hex_points(cx, cy, r):
    import math

    return [
        (
            cx + math.cos(math.radians(60 * i + 30)) * r,
            cy + math.sin(math.radians(60 * i + 30)) * r,
        )
        for i in range(6)
    ]


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Bee Linked Simulation")
        self.geometry("760x430")
        self.configure(bg="#08111f")
        self.resizable(True, True)
        self.protocol("WM_DELETE_WINDOW", self.close_all)
        self.canvas = tk.Canvas(self, width=760, height=430, bg="#08111f", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.create_text(380, 70, text="Bee Linked Simulation", fill="#ffc424", font=("Arial", 30, "bold"))
        self.canvas.create_text(
            380,
            110,
            text="Choose difficulty. Then 2D map controls the 3D Ursina world.",
            fill="#b8c8dd",
            font=("Arial", 13),
        )
        self.buttons = []
        for idx, (key, (label, fill)) in enumerate(DIFFICULTIES.items()):
            cx = 180 + idx * 200
            cy = 235
            poly = hex_points(cx, cy, 82)
            item = self.canvas.create_polygon(poly, fill=fill, outline="#ffc424", width=4)
            text = self.canvas.create_text(cx, cy - 8, text=label, fill="#f5f8ff", font=("Arial", 20, "bold"))
            hint = self.canvas.create_text(cx, cy + 28, text=key, fill="#a8b7ca", font=("Arial", 11))
            self.buttons.append((item, text, hint, key))
            for obj in (item, text, hint):
                self.canvas.tag_bind(obj, "<Button-1>", lambda _event, name=key: self.start(name))
        self.status = self.canvas.create_text(380, 360, text="", fill="#89ffad", font=("Arial", 13, "bold"))
        self.left_host = None
        self.right_host = None
        self.ursina_hwnd = 0
        self.map_hwnd = 0
        self.preloaded_ursina_process = None
        self.preloaded_ursina_hwnd = 0
        self.preload_finished = False
        self.energy_var = tk.StringVar(value="Energy: waiting")
        self.cpu_result_var = tk.StringVar(value="NVIDIA CUDA: press C in 3D window")
        self.identity_vars = {
            "Adi": tk.StringVar(value="Adi: not detected"),
            "Faraj": tk.StringVar(value="Faraj: not detected"),
            "Slava": tk.StringVar(value="Slava: not detected"),
        }
        self.detected_names = set()
        self.last_identity_mtime = 0.0
        self.bind("1", lambda _event: self.start("easy"))
        self.bind("2", lambda _event: self.start("normal"))
        self.bind("3", lambda _event: self.start("hard"))
        self.bind_all("<KeyPress-c>", lambda _event: self.request_cpu_scan())
        self.bind_all("<KeyPress-C>", lambda _event: self.request_cpu_scan())
        self.canvas.itemconfigure(self.status, text="Preloading 3D engine...")
        threading.Thread(target=self.preload_3d, daemon=True).start()

    def set_start_status(self, text: str):
        try:
            if self.canvas.winfo_exists():
                self.canvas.itemconfigure(self.status, text=text)
        except tk.TclError:
            pass

    def preload_3d(self):
        try:
            stop_old_linked_processes()
            seed_control_file("easy")
            self.preloaded_ursina_process = launch_3d_process("easy")
            self.preloaded_ursina_hwnd = find_window_for_pid(self.preloaded_ursina_process.pid, timeout=18.0)
            if not self.preloaded_ursina_hwnd:
                self.preloaded_ursina_hwnd = find_window("Standalone 3D Bee Space", timeout=2.0)
            self.preload_finished = True
            log(f"preloaded 3D hwnd={self.preloaded_ursina_hwnd}")
            self.after(0, lambda: self.set_start_status("3D ready. Choose difficulty."))
            self.after(0, self.lift)
        except Exception as exc:
            log(f"PRELOAD ERROR {type(exc).__name__}: {exc}")
            self.after(0, lambda: self.set_start_status("Choose difficulty. 3D will start now."))

    def start(self, difficulty: str):
        self.set_start_status("Starting linked 2D game...")
        self.update()
        threading.Thread(target=self._start_background, args=(difficulty,), daemon=True).start()

    def _start_background(self, difficulty: str):
        try:
            self.after(0, self.show_hosts)
            if self.preloaded_ursina_process and self.preloaded_ursina_process.poll() is None:
                seed_control_file(difficulty)
                ursina_hwnd = self.preloaded_ursina_hwnd or find_window_for_pid(self.preloaded_ursina_process.pid, timeout=8.0)
                log(f"using preloaded 3D hwnd={ursina_hwnd}")
            else:
                ursina_process = launch_processes(difficulty)
                ursina_hwnd = find_window_for_pid(ursina_process.pid) or find_window("Standalone 3D Bee Space", timeout=6.0)
            self.after(0, lambda: self.place_3d(ursina_hwnd))
            time.sleep(0.6)
            launch_2d(difficulty)
            map_hwnd = find_window("Bee Face Patrol")
            log(f"found windows ursina={ursina_hwnd} map={map_hwnd}")
            self.after(0, lambda: self.embed_children(ursina_hwnd, map_hwnd))
        except Exception as exc:
            log(f"ERROR {type(exc).__name__}: {exc}")
            self.after(0, lambda: self.canvas.itemconfigure(self.status, text=f"Error: {exc}"))

    def show_hosts(self):
        self.canvas.destroy()
        self.title("Bee Linked Simulation - 3D and 2D synchronized")
        screen_w = max(1180, self.winfo_screenwidth())
        screen_h = max(760, self.winfo_screenheight() - 48)
        self.geometry(f"{screen_w}x{screen_h}+0+0")
        self.configure(bg="#050b16")

        header = tk.Frame(self, bg="#08111f", height=42)
        header.pack(side="top", fill="x")
        tk.Label(
            header,
            text="Linked mode: 2D map controls 3D bee, statues and coins",
            fg="#ffc424",
            bg="#08111f",
            font=("Arial", 14, "bold"),
        ).pack(side="left", padx=14)
        tk.Button(header, text="Close", command=self.close_all, bg="#17243a", fg="white").pack(side="right", padx=10, pady=7)

        body = tk.Frame(self, bg="#050b16")
        body.pack(fill="both", expand=True)
        left_wrap = tk.Frame(body, bg="#182941", bd=2, relief="solid")
        right_wrap = tk.Frame(body, bg="#182941", bd=2, relief="solid")
        left_wrap.pack(side="left", fill="y", padx=(8, 4), pady=8)
        left_wrap.pack_propagate(False)
        left_wrap.configure(width=390)
        right_wrap.pack(side="left", fill="both", expand=True, padx=(4, 8), pady=8)
        right_wrap.configure(width=LINKED_2D_W + 24)
        tk.Label(left_wrap, text="3D Ursina visualization", fg="#f5f8ff", bg="#182941", font=("Arial", 12, "bold")).pack(side="top", fill="x")
        tk.Label(right_wrap, text="2D control map", fg="#f5f8ff", bg="#182941", font=("Arial", 12, "bold")).pack(side="top", fill="x")
        self.left_host = tk.Frame(left_wrap, bg="black")
        self.right_host = tk.Frame(right_wrap, bg="black")
        self.left_host.pack(fill="x", padx=10, pady=(10, 8))
        self.left_host.configure(width=360, height=250)
        self.left_host.pack_propagate(False)
        tk.Label(
            left_wrap,
            text="3D camera is used for local NVIDIA CUDA face screenshots. Main control is the 2D map.",
            fg="#b8c8dd",
            bg="#182941",
            wraplength=350,
            justify="left",
            font=("Arial", 10),
        ).pack(side="top", fill="x", padx=12, pady=(6, 4))
        status_box = tk.Frame(left_wrap, bg="#0d1728", bd=1, relief="solid")
        status_box.pack(side="top", fill="x", padx=12, pady=(4, 8))
        tk.Label(
            status_box,
            textvariable=self.energy_var,
            fg="#ffc424",
            bg="#0d1728",
            anchor="w",
            font=("Arial", 11, "bold"),
        ).pack(fill="x", padx=10, pady=(8, 2))
        tk.Label(
            status_box,
            textvariable=self.cpu_result_var,
            fg="#f5f8ff",
            bg="#0d1728",
            anchor="w",
            wraplength=350,
            justify="left",
            font=("Arial", 10, "bold"),
        ).pack(fill="x", padx=10, pady=2)
        for name in ("Adi", "Faraj", "Slava"):
            tk.Label(
                status_box,
                textvariable=self.identity_vars[name],
                fg="#89ffad",
                bg="#0d1728",
                anchor="w",
                font=("Arial", 10),
            ).pack(fill="x", padx=10, pady=1)
        tk.Label(
            status_box,
            text="Press C on the 2D map or 3D view for NVIDIA CUDA recognition. G is disabled in linked 2D mode.",
            fg="#9fb2cc",
            bg="#0d1728",
            anchor="w",
            wraplength=410,
            justify="left",
            font=("Arial", 9),
        ).pack(fill="x", padx=10, pady=(4, 8))
        tk.Button(
            status_box,
            text="NVIDIA CUDA Scan (C)",
            command=self.request_cpu_scan,
            bg="#17243a",
            fg="white",
            activebackground="#20365a",
            activeforeground="white",
        ).pack(fill="x", padx=10, pady=(0, 10))
        self.right_host.pack(side="top", anchor="nw", padx=10, pady=(10, 8))
        self.right_host.configure(width=LINKED_2D_W, height=LINKED_2D_H)
        self.right_host.pack_propagate(False)
        self.bind("<Configure>", lambda _event: self.resize_children())
        self.update_idletasks()
        self.poll_status()
        self.track_windows()

    def request_cpu_scan(self):
        try:
            data = json.loads(CONTROL_PATH.read_text(encoding="utf-8-sig"))
            if not isinstance(data, dict):
                data = {}
        except Exception:
            data = {}
        data["source"] = data.get("source", "linked_launcher")
        data["active"] = True
        data["updated_at"] = time.time()
        data["cpu_scan_request_id"] = int(data.get("cpu_scan_request_id", 0) or 0) + 1
        temp_path = CONTROL_PATH.with_suffix(".tmp")
        temp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temp_path.replace(CONTROL_PATH)
        self.cpu_result_var.set("NVIDIA CUDA: scan requested...")

    def embed_children(self, ursina_hwnd: int, map_hwnd: int):
        self.ursina_hwnd = ursina_hwnd
        self.map_hwnd = map_hwnd
        self.place_3d(ursina_hwnd)
        if self.right_host and map_hwnd:
            embed_window(map_hwnd, self.right_host.winfo_id(), LINKED_2D_W, LINKED_2D_H)
        self.resize_children()
        self.lift()
        raise_window(ursina_hwnd)

    def place_3d(self, ursina_hwnd: int):
        if not self.left_host or not ursina_hwnd:
            return
        self.ursina_hwnd = ursina_hwnd
        self.update_idletasks()
        embed_window(
            ursina_hwnd,
            self.left_host.winfo_id(),
            max(100, self.left_host.winfo_width()),
            max(100, self.left_host.winfo_height()),
        )

    def resize_children(self):
        if self.left_host and self.ursina_hwnd:
            embed_window(
                self.ursina_hwnd,
                self.left_host.winfo_id(),
                max(100, self.left_host.winfo_width()),
                max(100, self.left_host.winfo_height()),
            )
        if self.right_host and self.map_hwnd:
            user32.MoveWindow(self.map_hwnd, 0, 0, LINKED_2D_W, LINKED_2D_H, True)

    def track_windows(self):
        if not self.ursina_hwnd:
            self.ursina_hwnd = find_window("Standalone 3D Bee Space", timeout=0.1)
        if not self.map_hwnd:
            self.map_hwnd = find_window("Bee Face Patrol", timeout=0.1)
            if self.right_host and self.map_hwnd:
                embed_window(self.map_hwnd, self.right_host.winfo_id(), LINKED_2D_W, LINKED_2D_H)
        if self.left_host and self.ursina_hwnd:
            self.place_3d(self.ursina_hwnd)
        if self.right_host and self.map_hwnd:
            user32.MoveWindow(
                self.map_hwnd,
                0,
                0,
                LINKED_2D_W,
                LINKED_2D_H,
                True,
            )
        if self.winfo_exists():
            self.after(600, self.track_windows)

    def poll_status(self):
        try:
            data = json.loads(CONTROL_PATH.read_text(encoding="utf-8-sig"))
            bee = data.get("bee", {}) if isinstance(data, dict) else {}
            energy = float(bee.get("energy", 0.0))
            difficulty = data.get("difficulty", "unknown")
            self.energy_var.set(f"Energy: {energy:5.1f}%   Difficulty: {difficulty}")
        except Exception:
            if self.energy_var.get() == "Energy: waiting":
                self.energy_var.set("Energy: waiting for 2D map")

        try:
            mtime = IDENTITY_RESULT_PATH.stat().st_mtime
            if mtime > self.last_identity_mtime:
                result = json.loads(IDENTITY_RESULT_PATH.read_text(encoding="utf-8-sig"))
                self.last_identity_mtime = mtime
                elapsed = float(result.get("elapsed_ms", 0.0))
                stamp = str(result.get("timestamp_iso", ""))
                best = str(result.get("best_label") or result.get("identity") or "unknown")
                if result.get("accepted") and result.get("identity"):
                    identity = str(result["identity"])
                    self.detected_names.add(identity)
                    self.cpu_result_var.set(f"NVIDIA CUDA: detected {identity} in {elapsed:.0f} ms at {stamp}")
                else:
                    self.cpu_result_var.set(f"NVIDIA CUDA: not detected; best {best} in {elapsed:.0f} ms at {stamp}")
                for name, var in self.identity_vars.items():
                    state = "detected" if name in self.detected_names else "not detected"
                    var.set(f"{name}: {state}")
                if {"Adi", "Faraj", "Slava"}.issubset(self.detected_names):
                    self.cpu_result_var.set("You win! All faces detected.")
        except FileNotFoundError:
            pass
        except Exception as exc:
            self.cpu_result_var.set(f"NVIDIA CUDA: result read error: {exc}")

        if self.winfo_exists():
            self.after(500, self.poll_status)

    def close_all(self):
        stop_old_linked_processes()
        self.destroy()


if __name__ == "__main__":
    Launcher().mainloop()
