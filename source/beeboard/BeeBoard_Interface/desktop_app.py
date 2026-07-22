from __future__ import annotations

import os
import subprocess
import sys
import tkinter as tk
from math import cos, radians, sin
from pathlib import Path
from tkinter import messagebox, ttk

from circuit_sim import BeeBoardInputs, simulate


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
KICAD_DIR = PROJECT_ROOT / "BeeBoard_v0_1_Micro_KiCad"
SOC_DIR = PROJECT_ROOT.parent / "MIPS" / "AI MIPS" / "BeeSoC_v0_1"
SOC_APP = SOC_DIR / "interactive_beesoc_diagram.py"

BOARD_FILES = {
    "KiCad PCB": KICAD_DIR / "BeeBoard_v0_1_Micro_KiCad.kicad_pcb",
    "3D GLB": KICAD_DIR / "BeeBoard_v0_1_Micro.glb",
    "Layer STEP": KICAD_DIR / "BeeBoard_v0_1_Micro_board_layers.step",
    "Floorplan PNG": KICAD_DIR / "BeeBoard_v0_1_Micro_Floorplan.png",
    "Explanation RU": KICAD_DIR / "BeeBoard_v0_1_Micro_Explanation_RU.md",
}

SOC_FILES = [
    "interactive_beesoc_diagram.py",
    "BeeSoC_Top.sv",
    "BeeSoC_Bus.sv",
    "MIPS.sv",
    "DataPath.sv",
    "ControlUnit.sv",
    "MatrixAccel.sv",
    "ReLU4.sv",
    "BeeSoC_LiFi.sv",
    "BeeSoC_Crypto.sv",
    "BeeSoC_PowerCtrl.sv",
    "BeeSoC_MotionCtrl.sv",
    "BeeSoC_SensorIf.sv",
    "prog_beesoc.txt",
]
SOC_PROCESS: subprocess.Popen | None = None


MODULE_INFO = {
    "fpga": {
        "title": "U1 FPGA package",
        "body": (
            "Физический чип FPGA на PCB. Внутри него сидят только логические IP-блоки: "
            "AI MIPS, Crypto, Motion, Power, LiFi Controller, Sensor Interface. "
            "Flash, IMU, PMIC, LiFi AFE и драйверы являются отдельными корпусами на плате."
        ),
        "inputs": "IMU, spring sensor, LiFi RX, camera/spectral, debug.",
        "outputs": "LiFi TX, actuator commands, power state limits.",
    },
    "power": {
        "title": "U4 PMIC / Power",
        "body": "Energy harvesting, supercap charge path and raw energy supervision.",
        "inputs": "Bio input, supercap connector, FPGA policy.",
        "outputs": "Raw managed power and energy telemetry.",
    },
    "flash": {
        "title": "U2 Flash",
        "body": "Configuration memory for the FPGA bitstream.",
        "inputs": "SPI control from FPGA.",
        "outputs": "Boot/configuration data to FPGA.",
    },
    "imu": {
        "title": "U3 IMU",
        "body": "Gyro/accelerometer feedback for stabilization.",
        "inputs": "Physical movement and 3V3 rail.",
        "outputs": "Motion samples to FPGA Sensor Interface.",
    },
    "lifi": {
        "title": "LiFi RX/TX",
        "body": "Optical communication path: photodiode receive and microLED transmit.",
        "inputs": "Incoming light packets and FPGA encrypted TX stream.",
        "outputs": "Authenticated RX packets and outgoing light pulses.",
    },
    "drivers": {
        "title": "U9-U12 Drivers",
        "body": "Low-voltage power switches for wings, dash spring release and drill/cutter placeholder.",
        "inputs": "Motion Control Unit commands from FPGA.",
        "outputs": "Actuator current outputs.",
    },
}


VIEW3D_MODULES = {
    "fpga": {
        "title": "U1 FPGA package",
        "subtitle": "violet chip on PCB",
        "body": (
            "Это физический корпус FPGA на плате. Внутри него только логические IP-блоки: "
            "AI MIPS, MatrixAccel, Crypto, Power Control, Motion Control, LiFi Controller. "
            "Остальные микросхемы расположены на PCB вокруг FPGA."
        ),
        "color": "#7d4dff",
    },
    "flash": {
        "title": "U2 Flash",
        "subtitle": "FPGA boot memory",
        "body": "Внешняя SPI Flash хранит bitstream, который загружает FPGA при старте.",
        "color": "#f28c28",
    },
    "imu": {
        "title": "U3 IMU",
        "subtitle": "gyro + accelerometer",
        "body": "Физический MEMS-сенсор движения. Даёт Motion Control Unit данные для стабилизации.",
        "color": "#32c878",
    },
    "power": {
        "title": "U4 PMIC",
        "subtitle": "bio + supercap manager",
        "body": "Узел питания: принимает bio input, управляет supercap и помогает FPGA выбирать режимы LOW_POWER/SURVIVAL.",
        "color": "#ff5a5a",
    },
    "lifi": {
        "title": "D1/D2 LiFi",
        "subtitle": "microLED + photodiode",
        "body": "Оптическая связь: D2 принимает световые пакеты, D1 отправляет зашифрованные пакеты наружу.",
        "color": "#28d084",
    },
    "drivers": {
        "title": "U9-U12 Drivers",
        "subtitle": "wings, dash, drill",
        "body": "Силовые драйверы вынесены из FPGA. FPGA отдаёт команды, драйверы коммутируют ток в актуаторы.",
        "color": "#9aa6b2",
    },
}


def open_path(path: Path) -> None:
    if not path.exists():
        messagebox.showerror("File not found", str(path))
        return
    os.startfile(str(path))


def launch_soc_app() -> None:
    global SOC_PROCESS
    if not SOC_APP.exists():
        messagebox.showerror("SoC project not found", str(SOC_APP))
        return
    if SOC_PROCESS is not None and SOC_PROCESS.poll() is None:
        return
    SOC_PROCESS = subprocess.Popen([sys.executable, str(SOC_APP)], cwd=str(SOC_DIR))


class BeeBoardDesktopApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("BeeBoard v0.1 Local Design Lab")
        self.geometry("1280x820")
        self.minsize(1040, 680)
        self.configure(bg="#11161c")

        self.style = ttk.Style(self)
        self.style.theme_use("clam")
        self.style.configure("TFrame", background="#11161c")
        self.style.configure("Panel.TFrame", background="#182029", relief="flat")
        self.style.configure("TLabel", background="#11161c", foreground="#eef3f8", font=("Segoe UI", 10))
        self.style.configure("Muted.TLabel", background="#11161c", foreground="#9aa6b2", font=("Segoe UI", 9))
        self.style.configure("Title.TLabel", background="#11161c", foreground="#ffffff", font=("Segoe UI", 18, "bold"))
        self.style.configure("TButton", font=("Segoe UI", 10), padding=8)
        self.style.configure("Treeview", background="#151c24", foreground="#eef3f8", fieldbackground="#151c24", rowheight=28)
        self.style.configure("Treeview.Heading", background="#202a34", foreground="#ffffff")

        header = ttk.Frame(self)
        header.pack(fill="x", padx=18, pady=(16, 8))
        ttk.Label(header, text="BeeBoard v0.1 Local Design Lab", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            header,
            text="Локальное Python-приложение: плата, питание, интерактивная схема и связь с SoC-проектом",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(4, 0))

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=18, pady=(0, 18))

        self._build_overview_tab()
        self._build_3d_modules_tab()
        self._build_measurements_tab()
        self._build_schematic_tab()
        self._build_files_tab()
        self.after(120, self._raise_to_front)

    def _raise_to_front(self) -> None:
        try:
            self.state("normal")
            self.lift()
            self.attributes("-topmost", True)
            self.focus_force()
            self.after(1500, lambda: self.attributes("-topmost", False))
        except tk.TclError:
            pass

    def _build_overview_tab(self) -> None:
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Overview")

        left = ttk.Frame(tab, style="Panel.TFrame")
        left.pack(side="left", fill="both", expand=True, padx=(0, 8), pady=12)
        right = ttk.Frame(tab, style="Panel.TFrame")
        right.pack(side="right", fill="both", expand=True, padx=(8, 0), pady=12)

        text = tk.Text(left, bg="#182029", fg="#eef3f8", insertbackground="#eef3f8", relief="flat", wrap="word")
        text.pack(fill="both", expand=True, padx=14, pady=14)
        text.insert(
            "end",
            "BeeBoard v0.1\n\n"
            "Размер прототипа: 20 x 12 мм.\n"
            "U1 FPGA - физический компактный чип на плате. Внутри U1 находятся только логические IP-блоки: "
            "AI MIPS, MatrixAccel, Crypto, Motion Control, Power Control, LiFi Controller.\n\n"
            "Внешние физические компоненты на PCB:\n"
            "- U2 Flash\n- U3 IMU\n- U4 PMIC\n- LiFi LED / photodiode / AFE\n"
            "- U9-U12 actuator drivers\n- camera/spectral/debug/flex connectors\n\n"
            "Клик по FPGA во вкладке Schematic открывает связанный проект BeeSoC.",
        )
        text.configure(state="disabled")

        ttk.Label(right, text="Quick Actions", background="#182029", foreground="#ffffff", font=("Segoe UI", 14, "bold")).pack(
            anchor="w", padx=14, pady=(14, 8)
        )
        for label, path in BOARD_FILES.items():
            ttk.Button(right, text=f"Open {label}", command=lambda p=path: open_path(p)).pack(fill="x", padx=14, pady=4)
        ttk.Separator(right).pack(fill="x", padx=14, pady=12)
        ttk.Button(right, text="Open SoC interactive project", command=launch_soc_app).pack(fill="x", padx=14, pady=4)

    def _build_3d_modules_tab(self) -> None:
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="3D Modules")

        canvas_frame = ttk.Frame(tab, style="Panel.TFrame")
        canvas_frame.pack(side="left", fill="both", expand=True, padx=(0, 8), pady=12)
        details = ttk.Frame(tab, style="Panel.TFrame", width=360)
        details.pack(side="right", fill="y", padx=(8, 0), pady=12)
        details.pack_propagate(False)

        toolbar = ttk.Frame(canvas_frame, style="Panel.TFrame")
        toolbar.pack(fill="x", padx=12, pady=(12, 0))
        self.view3d_angle = tk.DoubleVar(value=-18.0)
        self._view3d_drag_x: int | None = None
        ttk.Label(toolbar, text="Rotate", background="#182029", foreground="#eef3f8", font=("Segoe UI", 10, "bold")).pack(side="left", padx=(0, 10))
        ttk.Scale(toolbar, from_=-180, to=180, variable=self.view3d_angle, command=lambda _=None: self._draw_3d_modules()).pack(
            side="left", fill="x", expand=True
        )
        ttk.Button(toolbar, text="Left", command=lambda: self._nudge_3d_angle(-15)).pack(side="left", padx=(10, 4))
        ttk.Button(toolbar, text="Right", command=lambda: self._nudge_3d_angle(15)).pack(side="left", padx=4)
        ttk.Button(toolbar, text="Reset", command=self._reset_3d_angle).pack(side="left", padx=4)

        self.view3d_canvas = tk.Canvas(canvas_frame, bg="#070a0f", highlightthickness=0)
        self.view3d_canvas.pack(fill="both", expand=True, padx=12, pady=12)
        self.view3d_canvas.bind("<Configure>", lambda _event: self._draw_3d_modules())
        self.view3d_canvas.bind("<ButtonPress-1>", self._start_3d_drag)
        self.view3d_canvas.bind("<B1-Motion>", self._drag_3d_angle)

        self.view3d_title = ttk.Label(details, text="", background="#182029", foreground="#f4c95d", font=("Segoe UI", 15, "bold"), wraplength=320)
        self.view3d_title.pack(anchor="w", padx=14, pady=(14, 4))
        self.view3d_subtitle = ttk.Label(details, text="", background="#182029", foreground="#cbd5df", font=("Segoe UI", 10, "bold"), wraplength=320)
        self.view3d_subtitle.pack(anchor="w", padx=14, pady=(0, 10))
        self.view3d_body = tk.Text(details, height=12, bg="#182029", fg="#eef3f8", relief="flat", wrap="word")
        self.view3d_body.pack(fill="x", padx=14, pady=(0, 12))

        ttk.Button(details, text="Open real GLB 3D model", command=lambda: open_path(BOARD_FILES["3D GLB"])).pack(fill="x", padx=14, pady=4)
        ttk.Button(details, text="Open STEP layer model", command=lambda: open_path(BOARD_FILES["Layer STEP"])).pack(fill="x", padx=14, pady=4)
        ttk.Button(details, text="Open KiCad PCB", command=lambda: open_path(BOARD_FILES["KiCad PCB"])).pack(fill="x", padx=14, pady=4)

        note = tk.Text(details, height=7, bg="#182029", fg="#9aa6b2", relief="flat", wrap="word")
        note.pack(fill="both", expand=True, padx=14, pady=(12, 14))
        note.insert(
            "end",
            "Эта вкладка даёт локальные кликабельные сноски. "
            "Кнопка GLB открывает настоящую 3D-модель во внешнем просмотрщике Windows/KiCad.",
        )
        note.configure(state="disabled")
        self._select_3d_module("fpga")

    def _nudge_3d_angle(self, delta: float) -> None:
        self.view3d_angle.set(((self.view3d_angle.get() + delta + 180) % 360) - 180)
        self._draw_3d_modules()

    def _reset_3d_angle(self) -> None:
        self.view3d_angle.set(-18.0)
        self._draw_3d_modules()

    def _start_3d_drag(self, event: tk.Event) -> None:
        self._view3d_drag_x = int(event.x)

    def _drag_3d_angle(self, event: tk.Event) -> None:
        if self._view3d_drag_x is None:
            self._view3d_drag_x = int(event.x)
            return
        dx = int(event.x) - self._view3d_drag_x
        self._view3d_drag_x = int(event.x)
        self.view3d_angle.set(((self.view3d_angle.get() + dx * 0.45 + 180) % 360) - 180)
        self._draw_3d_modules()

    def _rotate_board_xy(self, x: float, y: float) -> tuple[float, float]:
        angle = radians(float(self.view3d_angle.get()))
        cx, cy = 10.0, 6.0
        dx, dy = x - cx, y - cy
        return (cx + dx * cos(angle) - dy * sin(angle), cy + dx * sin(angle) + dy * cos(angle))

    def _iso(self, x: float, y: float, z: float = 0.0) -> tuple[float, float]:
        x, y = self._rotate_board_xy(x, y)
        scale = self._view3d_scale
        cx = self._view3d_cx
        cy = self._view3d_cy
        return (cx + (x - y) * scale, cy + (x + y) * scale * 0.42 - z * scale)

    def _draw_prism(self, key: str, x: float, y: float, w: float, d: float, h: float, color: str) -> tuple[float, float]:
        c = self.view3d_canvas
        p1 = self._iso(x, y, h)
        p2 = self._iso(x + w, y, h)
        p3 = self._iso(x + w, y + d, h)
        p4 = self._iso(x, y + d, h)
        b1 = self._iso(x, y, 0)
        b2 = self._iso(x + w, y, 0)
        b3 = self._iso(x + w, y + d, 0)
        b4 = self._iso(x, y + d, 0)
        c.create_polygon(p1, p2, p3, p4, fill=color, outline="#ffffff", width=1.4, tags=("view3d", key))
        c.create_polygon(p2, b2, b3, p3, fill=self._shade(color, 0.72), outline="#17202a", width=1, tags=("view3d", key))
        c.create_polygon(p3, b3, b4, p4, fill=self._shade(color, 0.55), outline="#17202a", width=1, tags=("view3d", key))
        center = self._iso(x + w / 2, y + d / 2, h + 0.05)
        c.tag_bind(key, "<Button-1>", lambda _event, module=key: self._select_3d_module(module))
        return center

    def _shade(self, hex_color: str, factor: float) -> str:
        value = hex_color.lstrip("#")
        r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
        return f"#{int(r * factor):02x}{int(g * factor):02x}{int(b * factor):02x}"

    def _draw_callout(self, key: str, anchor: tuple[float, float], label_x: float, label_y: float) -> None:
        c = self.view3d_canvas
        info = VIEW3D_MODULES[key]
        color = info["color"]
        ax, ay = anchor
        c.create_oval(ax - 8, ay - 8, ax + 8, ay + 8, fill=color, outline="#ffffff", width=2, tags=("view3d", key))
        c.create_line(ax, ay, label_x, label_y, fill="#ffffff", width=2.5, tags=("view3d", key))
        box_w, box_h = 178, 48
        c.create_rectangle(label_x, label_y - box_h / 2, label_x + box_w, label_y + box_h / 2, fill="#0b0f14", outline=color, width=2, tags=("view3d", key))
        c.create_text(label_x + 10, label_y - 9, anchor="w", text=info["title"], fill="#ffffff", font=("Segoe UI", 10, "bold"), tags=("view3d", key))
        c.create_text(label_x + 10, label_y + 10, anchor="w", text=info["subtitle"], fill="#cbd5df", font=("Segoe UI", 8, "bold"), tags=("view3d", key))
        c.tag_bind(key, "<Button-1>", lambda _event, module=key: self._select_3d_module(module))

    def _draw_3d_modules(self) -> None:
        c = self.view3d_canvas
        c.delete("all")
        width = max(c.winfo_width(), 900)
        height = max(c.winfo_height(), 560)
        self._view3d_scale = min(width / 28, height / 18)
        self._view3d_cx = width * 0.48
        self._view3d_cy = height * 0.28

        c.create_text(24, 24, anchor="w", text="BeeBoard v0.1 3D Module Map", fill="#ffffff", font=("Segoe UI", 18, "bold"))
        c.create_text(24, 50, anchor="w", text="Drag the board or use Rotate. Callout anchors stay attached to each package.", fill="#9aa6b2", font=("Segoe UI", 10, "bold"))

        board_top = [self._iso(0, 0, 0.08), self._iso(20, 0, 0.08), self._iso(20, 12, 0.08), self._iso(0, 12, 0.08)]
        board_bot = [self._iso(0, 0, -0.35), self._iso(20, 0, -0.35), self._iso(20, 12, -0.35), self._iso(0, 12, -0.35)]
        c.create_polygon(*board_bot, fill="#0b3227", outline="#071f18", width=2)
        c.create_polygon(*board_top, fill="#123f32", outline="#5bd0a0", width=2)
        c.create_text(*self._iso(18.2, 11.2, 0.25), text="dark PCB carrier", fill="#9fe8ca", font=("Segoe UI", 9, "bold"))

        anchors = {
            "power": self._draw_prism("power", 2.2, 5.0, 3.2, 3.0, 0.75, VIEW3D_MODULES["power"]["color"]),
            "flash": self._draw_prism("flash", 4.0, 2.3, 2.4, 1.8, 0.55, VIEW3D_MODULES["flash"]["color"]),
            "fpga": self._draw_prism("fpga", 8.5, 4.7, 3.4, 2.9, 0.95, VIEW3D_MODULES["fpga"]["color"]),
            "imu": self._draw_prism("imu", 9.0, 1.0, 2.4, 1.7, 0.5, VIEW3D_MODULES["imu"]["color"]),
            "lifi": self._draw_prism("lifi", 16.2, 3.0, 2.9, 4.5, 0.58, VIEW3D_MODULES["lifi"]["color"]),
            "drivers": self._draw_prism("drivers", 12.7, 8.4, 4.2, 2.1, 0.46, VIEW3D_MODULES["drivers"]["color"]),
        }

        self._draw_callout("power", anchors["power"], 42, height * 0.40)
        self._draw_callout("flash", anchors["flash"], width * 0.58, 112)
        self._draw_callout("fpga", anchors["fpga"], width * 0.62, height * 0.40)
        self._draw_callout("imu", anchors["imu"], width * 0.55, height * 0.58)
        self._draw_callout("lifi", anchors["lifi"], width * 0.75, height * 0.48)
        self._draw_callout("drivers", anchors["drivers"], width * 0.68, height * 0.76)

    def _select_3d_module(self, key: str) -> None:
        info = VIEW3D_MODULES[key]
        self.view3d_title.configure(text=info["title"])
        self.view3d_subtitle.configure(text=info["subtitle"])
        self.view3d_body.configure(state="normal")
        self.view3d_body.delete("1.0", "end")
        self.view3d_body.insert("end", info["body"])
        self.view3d_body.configure(state="disabled")

    def _build_measurements_tab(self) -> None:
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Measurements")

        controls = ttk.Frame(tab, style="Panel.TFrame")
        controls.pack(side="left", fill="y", padx=(0, 8), pady=12)
        results = ttk.Frame(tab, style="Panel.TFrame")
        results.pack(side="right", fill="both", expand=True, padx=(8, 0), pady=12)

        self.vars: dict[str, tk.DoubleVar | tk.BooleanVar] = {
            "supercap_voltage": tk.DoubleVar(value=3.8),
            "supercap_esr_ohm": tk.DoubleVar(value=0.18),
            "bio_input_voltage": tk.DoubleVar(value=0.55),
            "bio_input_current_ma": tk.DoubleVar(value=8.0),
            "fpga_activity": tk.DoubleVar(value=0.45),
            "lifi_tx_duty": tk.DoubleVar(value=0.08),
            "imu_rate_hz": tk.DoubleVar(value=200.0),
            "wing_driver_current_ma": tk.DoubleVar(value=24.0),
            "spring_driver_current_ma": tk.DoubleVar(value=0.0),
            "drill_driver_current_ma": tk.DoubleVar(value=0.0),
            "camera_enabled": tk.BooleanVar(value=False),
            "dash_requested": tk.BooleanVar(value=False),
        }

        sliders = [
            ("Supercap V", "supercap_voltage", 2.0, 5.0),
            ("Supercap ESR", "supercap_esr_ohm", 0.02, 1.0),
            ("Bio input V", "bio_input_voltage", 0.0, 1.5),
            ("Bio current mA", "bio_input_current_ma", 0.0, 40.0),
            ("FPGA activity", "fpga_activity", 0.0, 1.0),
            ("LiFi TX duty", "lifi_tx_duty", 0.0, 1.0),
            ("IMU rate Hz", "imu_rate_hz", 50.0, 1600.0),
            ("Wing current mA", "wing_driver_current_ma", 0.0, 120.0),
            ("Spring current mA", "spring_driver_current_ma", 0.0, 180.0),
            ("Drill current mA", "drill_driver_current_ma", 0.0, 180.0),
        ]
        for row, (label, key, low, high) in enumerate(sliders):
            ttk.Label(controls, text=label, background="#182029").grid(row=row * 2, column=0, sticky="w", padx=12, pady=(10, 0))
            ttk.Scale(controls, from_=low, to=high, variable=self.vars[key], command=lambda _=None: self._update_measurements()).grid(
                row=row * 2 + 1, column=0, sticky="ew", padx=12
            )
        ttk.Checkbutton(controls, text="Camera/spectral", variable=self.vars["camera_enabled"], command=self._update_measurements).grid(
            row=22, column=0, sticky="w", padx=12, pady=(14, 0)
        )
        ttk.Checkbutton(controls, text="DASH request", variable=self.vars["dash_requested"], command=self._update_measurements).grid(
            row=23, column=0, sticky="w", padx=12, pady=4
        )
        controls.columnconfigure(0, weight=1)

        self.status_label = ttk.Label(results, text="", background="#182029", foreground="#f4c95d", font=("Segoe UI", 14, "bold"))
        self.status_label.pack(anchor="w", padx=14, pady=(14, 8))
        self.metrics_label = ttk.Label(results, text="", background="#182029", foreground="#d7dee7", justify="left")
        self.metrics_label.pack(anchor="w", padx=14, pady=(0, 12))
        self.rails_tree = ttk.Treeview(results, columns=("rail", "voltage", "current", "power"), show="headings")
        self.rails_tree.heading("rail", text="Rail / source")
        self.rails_tree.heading("voltage", text="Voltage")
        self.rails_tree.heading("current", text="Current")
        self.rails_tree.heading("power", text="Power")
        self.rails_tree.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        self._update_measurements()

    def _update_measurements(self) -> None:
        inputs = BeeBoardInputs(
            supercap_voltage=float(self.vars["supercap_voltage"].get()),
            supercap_esr_ohm=float(self.vars["supercap_esr_ohm"].get()),
            bio_input_voltage=float(self.vars["bio_input_voltage"].get()),
            bio_input_current_ma=float(self.vars["bio_input_current_ma"].get()),
            fpga_activity=float(self.vars["fpga_activity"].get()),
            lifi_tx_duty=float(self.vars["lifi_tx_duty"].get()),
            imu_rate_hz=float(self.vars["imu_rate_hz"].get()),
            wing_driver_current_ma=float(self.vars["wing_driver_current_ma"].get()),
            spring_driver_current_ma=float(self.vars["spring_driver_current_ma"].get()),
            drill_driver_current_ma=float(self.vars["drill_driver_current_ma"].get()),
            camera_enabled=bool(self.vars["camera_enabled"].get()),
            dash_requested=bool(self.vars["dash_requested"].get()),
        )
        data = simulate(inputs)
        self.status_label.configure(text=" / ".join(data["status"]))
        m = data["measurements"]
        self.metrics_label.configure(
            text=(
                f"Loaded supercap: {m['supercap_loaded_v']} V\n"
                f"Supercap current: {m['supercap_current_ma']} mA\n"
                f"System power: {m['system_power_mw']} mW\n"
                f"Bio power: {m['bio_power_mw']} mW\n"
                f"Net power: {m['net_power_mw']} mW\n"
                f"Estimated runtime: {m['estimated_runtime_s']} s"
            )
        )
        for item in self.rails_tree.get_children():
            self.rails_tree.delete(item)
        for rail in data["rails"]:
            self.rails_tree.insert(
                "",
                "end",
                values=(rail["name"], f"{rail['voltage_v']} V", f"{rail['current_ma']} mA", f"{rail['power_mw']} mW"),
            )

    def _build_schematic_tab(self) -> None:
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Schematic")

        canvas_frame = ttk.Frame(tab, style="Panel.TFrame")
        canvas_frame.pack(side="left", fill="both", expand=True, padx=(0, 8), pady=12)
        details = ttk.Frame(tab, style="Panel.TFrame", width=360)
        details.pack(side="right", fill="y", padx=(8, 0), pady=12)
        details.pack_propagate(False)

        self.schem_canvas = tk.Canvas(canvas_frame, bg="#f7f9fb", highlightthickness=0, scrollregion=(0, 0, 1120, 720))
        self.schem_canvas.pack(fill="both", expand=True, padx=12, pady=12)
        self.detail_title = ttk.Label(details, text="", background="#182029", foreground="#f4c95d", font=("Segoe UI", 15, "bold"), wraplength=320)
        self.detail_title.pack(anchor="w", padx=14, pady=(14, 8))
        self.detail_body = tk.Text(details, height=12, bg="#182029", fg="#eef3f8", relief="flat", wrap="word")
        self.detail_body.pack(fill="x", padx=14, pady=(0, 10))
        ttk.Button(details, text="Open SoC interactive project", command=launch_soc_app).pack(fill="x", padx=14, pady=(0, 10))
        self.soc_files = ttk.Treeview(details, columns=("size",), show="tree headings", height=12)
        self.soc_files.heading("#0", text="SoC file")
        self.soc_files.heading("size", text="Size")
        self.soc_files.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        self._draw_schematic()
        self._select_module("fpga", open_soc=False)

    def _draw_block(self, key: str, x: int, y: int, w: int, h: int, label: str, fill: str, outline: str) -> None:
        self.schem_canvas.create_rectangle(x + 4, y + 5, x + w + 4, y + h + 5, fill="#d8dde4", outline="", tags=("shadow",))
        rect = self.schem_canvas.create_rectangle(x, y, x + w, y + h, fill=fill, outline=outline, width=3, tags=("module", key))
        self.schem_canvas.create_text(x + w / 2, y + h / 2, text=label, fill="#17202a", font=("Segoe UI", 13, "bold"), tags=("module", key))
        self.schem_canvas.tag_bind(key, "<Button-1>", lambda _event, module=key: self._select_module(module, open_soc=True))

    def _draw_arrow(self, x1: int, y1: int, x2: int, y2: int, color: str) -> None:
        self.schem_canvas.create_line(x1, y1, x2, y2, fill=color, width=4, arrow="last", arrowshape=(14, 18, 7))

    def _draw_schematic(self) -> None:
        c = self.schem_canvas
        c.delete("all")
        c.create_text(34, 34, anchor="w", text="BeeBoard Electronic Schematic", fill="#17202a", font=("Segoe UI", 18, "bold"))
        c.create_text(34, 60, anchor="w", text="Click U1 FPGA to open the linked BeeSoC project", fill="#52616f", font=("Segoe UI", 10, "bold"))
        self._draw_block("bio", 52, 120, 160, 68, "J Bio Input", "#ffe3e3", "#9a2f2f")
        self._draw_block("supercap", 52, 228, 160, 68, "J Supercap", "#ffe3e3", "#9a2f2f")
        self._draw_block("power", 260, 174, 170, 96, "U4 PMIC", "#ffe3e3", "#9a2f2f")
        self._draw_block("reg1v2", 250, 342, 120, 58, "U5 1V2", "#ffe3e3", "#9a2f2f")
        self._draw_block("reg3v3", 250, 430, 120, 58, "U6 3V3", "#ffe3e3", "#9a2f2f")
        self._draw_block("fpga", 430, 180, 250, 260, "U1 FPGA\nlogic IP inside", "#efe5ff", "#6a39d8")
        self._draw_block("flash", 742, 94, 150, 64, "U2 Flash", "#ffffff", "#22303d")
        self._draw_block("imu", 742, 202, 150, 64, "U3 IMU", "#e2f7eb", "#236c43")
        self._draw_block("lifi", 742, 328, 320, 150, "LiFi RX/TX\nD2/U7 + U8/D1", "#e5edff", "#2855a8")
        self._draw_block("drivers", 742, 560, 300, 80, "U9-U12 Drivers", "#edf1f5", "#4d5a66")
        self._draw_arrow(212, 154, 260, 210, "#c73535")
        self._draw_arrow(212, 262, 260, 240, "#c73535")
        self._draw_arrow(345, 270, 310, 342, "#c73535")
        self._draw_arrow(370, 371, 430, 371, "#c73535")
        self._draw_arrow(370, 459, 430, 420, "#c73535")
        self._draw_arrow(680, 216, 742, 126, "#2855a8")
        self._draw_arrow(742, 234, 680, 260, "#1f7a46")
        self._draw_arrow(742, 390, 680, 360, "#2855a8")
        self._draw_arrow(680, 410, 742, 600, "#5b6570")
        c.create_line(122, 665, 1012, 665, fill="#111820", width=5)
        c.create_text(130, 690, anchor="w", text="Common GND reference: In1.GND shield plane", fill="#3e4b57", font=("Segoe UI", 10, "bold"))

    def _select_module(self, key: str, open_soc: bool = False) -> None:
        info = MODULE_INFO.get(key, MODULE_INFO["fpga"])
        self.detail_title.configure(text=info["title"])
        self.detail_body.configure(state="normal")
        self.detail_body.delete("1.0", "end")
        self.detail_body.insert("end", f"{info['body']}\n\nInputs: {info['inputs']}\n\nOutputs: {info['outputs']}")
        self.detail_body.configure(state="disabled")
        for item in self.soc_files.get_children():
            self.soc_files.delete(item)
        if key == "fpga":
            for name in SOC_FILES:
                path = SOC_DIR / name
                self.soc_files.insert("", "end", text=name, values=(path.stat().st_size if path.exists() else "missing",))
            if open_soc:
                launch_soc_app()

    def _build_files_tab(self) -> None:
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Board Files")
        tree = ttk.Treeview(tab, columns=("path", "exists"), show="tree headings")
        tree.heading("#0", text="File")
        tree.heading("path", text="Path")
        tree.heading("exists", text="Exists")
        tree.pack(fill="both", expand=True, padx=12, pady=12)
        for label, path in BOARD_FILES.items():
            tree.insert("", "end", text=label, values=(str(path), "yes" if path.exists() else "no"))
        tree.bind("<Double-1>", lambda _event: self._open_selected_file(tree))

    def _open_selected_file(self, tree: ttk.Treeview) -> None:
        item = tree.focus()
        if not item:
            return
        values = tree.item(item, "values")
        if values:
            open_path(Path(values[0]))


if __name__ == "__main__":
    app = BeeBoardDesktopApp()
    app.mainloop()
