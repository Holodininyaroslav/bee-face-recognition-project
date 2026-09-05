import json
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from local_security import SecureLocalMixin, BoundedHTTPServer

import gym
import numpy as np

import flappy  # noqa: F401 - registers gym environments
from flappy.envs.fwmav.controllers.pid_controller import PIDController


HOST = "127.0.0.1"
PORT = int(os.environ.get("FLAPPY_INSPECTOR_PORT", "8099"))


def _vec(value):
    return np.asarray(value, dtype=float).reshape(-1).tolist()


def _mat(value):
    return np.asarray(value, dtype=float).reshape(4, 4).tolist()


class FlappyRuntime:
    def __init__(self):
        self.lock = threading.RLock()
        self.speed = 0.04
        self.paused = False
        self.step_requests = 0
        self.reset_requested = False
        self.running = True
        self.reward = 0.0
        self.done = False
        self.action = np.zeros(4)
        self.normalized_action = np.zeros(4)
        self.control_mode = "pid"
        self.manual = {
            "thrust": 10.0,
            "roll": 0.0,
            "pitch": 0.0,
            "yaw": 0.0,
        }
        self.frame = 0
        self.last_state = {"status": "starting"}

        self.env = gym.make("fwmav_hover-v0")
        self.env.config(random_init=False, randomize_sim=False, phantom_sensor=False)
        self.obs = self.env.reset()
        self.controller = PIDController(self.env.sim.dt_c)
        self._capture_state()

    def set_control(self, payload):
        with self.lock:
            if "speed" in payload:
                self.speed = max(0.005, min(2.0, float(payload["speed"])))
            if "paused" in payload:
                self.paused = bool(payload["paused"])
            if "mode" in payload:
                mode = str(payload["mode"]).lower()
                if mode in ["pid", "manual"]:
                    self.control_mode = mode
            if "manual" in payload and isinstance(payload["manual"], dict):
                manual = payload["manual"]
                if "thrust" in manual:
                    self.manual["thrust"] = max(0.0, min(18.0, float(manual["thrust"])))
                if "roll" in manual:
                    self.manual["roll"] = max(-3.0, min(3.0, float(manual["roll"])))
                if "pitch" in manual:
                    self.manual["pitch"] = max(-3.5, min(3.5, float(manual["pitch"])))
                if "yaw" in manual:
                    self.manual["yaw"] = max(-0.15, min(0.15, float(manual["yaw"])))
            if payload.get("step"):
                self.step_requests += int(payload.get("steps", 1))
            if payload.get("reset"):
                self.reset_requested = True
            if isinstance(self.last_state, dict):
                self.last_state["speed"] = float(self.speed)
                self.last_state["paused"] = bool(self.paused)
                self.last_state["control_mode"] = self.control_mode
                self.last_state["manual"] = dict(self.manual)
            return {
                "speed": self.speed,
                "paused": self.paused,
                "mode": self.control_mode,
                "manual": self.manual,
                "step_requests": self.step_requests,
            }

    def _step_once(self):
        if self.control_mode == "manual":
            self.action = np.asarray(
                [
                    self.manual["thrust"],
                    self.manual["roll"],
                    self.manual["pitch"],
                    self.manual["yaw"],
                ],
                dtype=float,
            )
        else:
            self.action = self.controller.get_action(self.obs * self.env.observation_bound)
        self.normalized_action = (
            (self.action - self.env.action_lb) / (self.env.action_ub - self.env.action_lb) * 2 - 1
        )
        self.normalized_action = np.clip(self.normalized_action, -1.0, 1.0)
        self.obs, self.reward, self.done, _ = self.env.step(self.normalized_action)
        self.frame += 1
        if self.done:
            self.obs = self.env.reset()
        self._capture_state()

    def _wing_payload(self, flapper, side):
        wing = flapper.left_wing if side == "left" else flapper.right_wing
        motor = flapper.left_motor if side == "left" else flapper.right_motor
        prefix = "left" if side == "left" else "right"
        return {
            "normal_force": float(wing.GetNormalForce()),
            "span_cop": float(wing.GetSpanCoP()),
            "chord_cop": float(wing.GetChordCoP()),
            "aoa": float(wing.GetAoA()),
            "stroke": float(wing.GetStroke()),
            "m_aero": float(wing.GetM_aero()),
            "m_rd": float(wing.GetM_rd()),
            "stroke_angle": float(flapper.states[f"{prefix}_stroke_angle"]),
            "stroke_velocity": float(flapper.states[f"{prefix}_stroke_velocity"]),
            "stroke_acceleration": float(flapper.states[f"{prefix}_stroke_acceleration"]),
            "rotate_angle": float(flapper.states[f"{prefix}_rotate_angle"]),
            "rotate_velocity": float(flapper.states[f"{prefix}_rotate_velocity"]),
            "voltage": float(motor.voltage),
            "current": float(motor.current),
            "torque": float(motor.output_torque),
        }

    def _capture_state(self):
        flapper = self.env.sim.flapper1
        states = flapper.get_states()
        body = np.asarray(states["body_positions"], dtype=float).reshape(-1)
        vel = np.asarray(states["body_velocities"], dtype=float).reshape(-1)
        spatial_vel = np.asarray(states["body_spatial_velocities"], dtype=float).reshape(-1)
        spatial_acc = np.asarray(states["body_spatial_accelerations"], dtype=float).reshape(-1)

        links = {}
        for name in ["torso", "left_wing", "right_wing", "left_leading_edge", "right_leading_edge"]:
            node = flapper.flapper_skel.bodynode(name)
            links[name] = {
                "com": _vec(node.com()),
                "transform": _mat(node.world_transform()),
            }

        left = self._wing_payload(flapper, "left")
        right = self._wing_payload(flapper, "right")
        airflow_intensity = min(
            1.0,
            (
                abs(left["normal_force"])
                + abs(right["normal_force"])
                + 0.0004 * (abs(left["stroke_velocity"]) + abs(right["stroke_velocity"]))
            )
            / 0.08,
        )

        self.last_state = {
            "status": "running",
            "time": float(self.env.sim.world.time()),
            "frame": int(self.frame),
            "speed": float(self.speed),
            "paused": bool(self.paused),
            "control_mode": self.control_mode,
            "manual": dict(self.manual),
            "reward": float(self.reward),
            "done": bool(self.done),
            "body": {
                "rpy": body[0:3].tolist(),
                "xyz": body[3:6].tolist(),
                "angular_velocity": vel[0:3].tolist(),
                "linear_velocity": spatial_vel.tolist(),
                "linear_acceleration": spatial_acc.tolist(),
            },
            "links": links,
            "left": left,
            "right": right,
            "action": self.action.tolist(),
            "normalized_action": self.normalized_action.tolist(),
            "airflow_intensity": airflow_intensity,
        }

    def get_state(self):
        with self.lock:
            return json.loads(json.dumps(self.last_state))

    def loop(self):
        while self.running:
            start = time.perf_counter()
            with self.lock:
                if self.reset_requested:
                    self.obs = self.env.reset()
                    self.frame = 0
                    self.reward = 0.0
                    self.done = False
                    self.reset_requested = False
                    self._capture_state()

                should_step = (not self.paused) or self.step_requests > 0
                if should_step:
                    if self.step_requests > 0:
                        self.step_requests -= 1
                    self._step_once()
                    speed = self.speed
                else:
                    speed = self.speed

            if should_step:
                elapsed = time.perf_counter() - start
                target = self.env.sim.dt_c / max(speed, 0.01)
                time.sleep(max(0.0, target - elapsed))
            else:
                time.sleep(0.03)


HTML = r"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flappy Hummingbird Inspector</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #081018;
      --panel: #111923;
      --panel2: #172231;
      --text: #eef5ff;
      --muted: #8fa3b7;
      --line: #26394b;
      --cyan: #50c8ff;
      --blue: #5a7dff;
      --red: #ff6b6b;
      --green: #70e08a;
      --amber: #f4c45d;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: "Segoe UI", Arial, sans-serif; }
    #app { position: relative; height: 100%; max-width: 100vw; overflow: hidden; }
    #stage { position: absolute; inset: 0; min-width: 0; background: radial-gradient(circle at 45% 35%, #152334 0, #081018 55%, #05080c 100%); }
    canvas { display: block; width: 100%; height: 100%; }
    #hud {
      position: absolute; left: 16px; top: 16px; display: flex; gap: 8px; align-items: center;
      background: rgba(6, 12, 19, 0.78); border: 1px solid rgba(92, 130, 160, 0.28); padding: 8px 10px; border-radius: 8px;
      backdrop-filter: blur(8px);
    }
    button, select {
      background: #1b2b3b; color: var(--text); border: 1px solid #34516c; border-radius: 7px; padding: 8px 10px; cursor: pointer;
    }
    button:hover { border-color: var(--cyan); }
    button.icon { min-width: 38px; font-weight: 700; }
    #side { position: absolute; left: 16px; top: 92px; bottom: 16px; width: min(340px, calc(100vw - 32px)); min-width: 0; background: linear-gradient(180deg, rgba(17, 25, 35, 0.96), rgba(12, 20, 29, 0.96)); border: 1px solid var(--line); border-radius: 8px; padding: 16px; overflow: auto; backdrop-filter: blur(8px); }
    h1 { margin: 0 0 4px; font-size: 17px; letter-spacing: 0; line-height: 1.25; overflow-wrap: anywhere; }
    .sub { color: var(--muted); font-size: 12px; margin-bottom: 14px; }
    .group { border-top: 1px solid var(--line); padding-top: 14px; margin-top: 14px; }
    .label { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    input[type="range"] { width: 100%; accent-color: var(--cyan); }
    .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    label.check { display: flex; align-items: center; gap: 8px; background: var(--panel2); border: 1px solid var(--line); padding: 9px; border-radius: 7px; font-size: 13px; }
    .metric { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 8px; padding: 7px 0; border-bottom: 1px solid rgba(38, 57, 75, 0.55); font-size: 13px; }
    .metric span:first-child { color: var(--muted); }
    .metric b { font-weight: 600; color: var(--text); text-align: right; overflow-wrap: anywhere; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
    .sw { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .control-row { display: grid; grid-template-columns: 74px minmax(0, 1fr) 52px; gap: 8px; align-items: center; margin: 9px 0; color: var(--muted); font-size: 12px; }
    .control-row b { color: var(--text); text-align: right; }
    .pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 10px; }
    .pad button { padding: 8px 6px; min-height: 36px; font-size: 12px; }
    .pad .wide { grid-column: span 3; }
    .help { color: var(--muted); font-size: 11px; line-height: 1.35; margin-top: 8px; }
    #hint { position: absolute; left: 16px; bottom: 14px; color: #9fb3c6; font-size: 12px; background: rgba(6, 12, 19, 0.62); padding: 7px 9px; border-radius: 7px; }
  </style>
</head>
<body>
<div id="app">
  <main id="stage">
    <canvas id="canvas"></canvas>
    <div id="hud">
      <button id="play" class="icon">Pause</button>
      <button id="step" class="icon">Step</button>
      <button id="reset" class="icon">Reset</button>
      <select id="viewMode">
        <option value="inspect">Inspect</option>
        <option value="air">Airflow</option>
        <option value="mechanics">Mechanics</option>
      </select>
    </div>
    <div id="hint">Drag: rotate camera · Wheel: zoom · Shift+drag: pan</div>
  </main>
  <aside id="side">
    <h1>Flappy Hummingbird Inspector</h1>
    <div class="sub">DART physics + wing aero telemetry</div>

    <div class="group">
      <div class="label"><span>Control mode</span></div>
      <select id="controlMode" style="width: 100%">
        <option value="pid">PID hover</option>
        <option value="manual">Manual input</option>
      </select>
    </div>

    <div class="group">
      <div class="control-row"><span>thrust</span><input id="thrust" type="range" min="0" max="18" step="0.1" value="10" /><b id="thrustText">10.0</b></div>
      <div class="control-row"><span>roll</span><input id="rollCmd" type="range" min="-3" max="3" step="0.05" value="0" /><b id="rollText">0.00</b></div>
      <div class="control-row"><span>pitch</span><input id="pitchCmd" type="range" min="-3.5" max="3.5" step="0.05" value="0" /><b id="pitchText">0.00</b></div>
      <div class="control-row"><span>yaw</span><input id="yawCmd" type="range" min="-0.15" max="0.15" step="0.005" value="0" /><b id="yawText">0.000</b></div>
      <div class="pad">
        <button data-axis="pitch" data-value="1">Forward</button>
        <button data-axis="thrust" data-value="1">Up</button>
        <button data-axis="yaw" data-value="1">Yaw R</button>
        <button data-axis="roll" data-value="-1">Left</button>
        <button data-zero="1">Center</button>
        <button data-axis="roll" data-value="1">Right</button>
        <button data-axis="pitch" data-value="-1">Back</button>
        <button data-axis="thrust" data-value="-1">Down</button>
        <button data-axis="yaw" data-value="-1">Yaw L</button>
      </div>
      <div class="help">Keys: W/S pitch, A/D roll, Q/E yaw, R/F thrust. Manual mode changes real wing drive inputs.</div>
    </div>

    <div class="group">
      <div class="label"><span>Simulation speed</span><b id="speedText">0.04x</b></div>
      <input id="speed" type="range" min="0.005" max="0.5" step="0.005" value="0.04" />
      <div class="label" style="margin-top: 12px"><span>Zoom</span><b id="zoomText">2600 px/m</b></div>
      <input id="zoom" type="range" min="700" max="18000" step="100" value="2600" />
      <div class="label" style="margin-top: 12px"><span>Bee shell opacity</span><b id="shellOpacityText">55%</b></div>
      <input id="shellOpacity" type="range" min="0" max="1" step="0.05" value="0.55" />
    </div>

    <div class="group toggles">
      <label class="check"><input id="airflow" type="checkbox" checked /> Airflow</label>
      <label class="check"><input id="forces" type="checkbox" checked /> Forces</label>
      <label class="check"><input id="mechanics" type="checkbox" checked /> Mechanics</label>
      <label class="check"><input id="motion" type="checkbox" checked /> Wing motion</label>
      <label class="check"><input id="cadMechanism" type="checkbox" checked /> CAD mechanism</label>
      <label class="check"><input id="follow" type="checkbox" checked disabled /> Smooth follow</label>
    </div>

    <div class="group">
      <div class="metric"><span>time</span><b id="mTime">0.000 s</b></div>
      <div class="metric"><span>frame</span><b id="mFrame">0</b></div>
      <div class="metric"><span>position xyz</span><b id="mPos">-</b></div>
      <div class="metric"><span>roll / pitch / yaw</span><b id="mRpy">-</b></div>
      <div class="metric"><span>linear velocity</span><b id="mVel">-</b></div>
    </div>

    <div class="group">
      <div class="metric"><span>left stroke / rotate</span><b id="mLeftAngles">-</b></div>
      <div class="metric"><span>right stroke / rotate</span><b id="mRightAngles">-</b></div>
      <div class="metric"><span>normal force L/R</span><b id="mForces">-</b></div>
      <div class="metric"><span>AoA L/R</span><b id="mAoa">-</b></div>
      <div class="metric"><span>motor current L/R</span><b id="mCurrent">-</b></div>
      <div class="metric"><span>motor torque L/R</span><b id="mTorque">-</b></div>
      <div class="metric"><span>control input</span><b id="mControl">PID</b></div>
    </div>

    <div class="group">
      <div class="legend">
        <span class="chip"><span class="sw" style="background: var(--blue)"></span>left wing</span>
        <span class="chip"><span class="sw" style="background: var(--red)"></span>right wing</span>
        <span class="chip"><span class="sw" style="background: var(--cyan)"></span>air stream</span>
        <span class="chip"><span class="sw" style="background: var(--amber)"></span>aero force</span>
        <span class="chip"><span class="sw" style="background: var(--green)"></span>wing direction</span>
      </div>
    </div>
  </aside>
</div>

<script>
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let state = null;
let particles = [];
let trail = [];
let yaw = -0.65, pitch = 0.72, panX = 0, panY = 0;
let dragging = false, lastX = 0, lastY = 0, panning = false;
let cameraTarget = [0, 0, 0];
let cameraTargetReady = false;
let mechPhase = {left: null, right: null};

const ui = {
  play: document.getElementById("play"),
  step: document.getElementById("step"),
  reset: document.getElementById("reset"),
  speed: document.getElementById("speed"),
  speedText: document.getElementById("speedText"),
  zoom: document.getElementById("zoom"),
  zoomText: document.getElementById("zoomText"),
  shellOpacity: document.getElementById("shellOpacity"),
  shellOpacityText: document.getElementById("shellOpacityText"),
  airflow: document.getElementById("airflow"),
  forces: document.getElementById("forces"),
  mechanics: document.getElementById("mechanics"),
  motion: document.getElementById("motion"),
  cadMechanism: document.getElementById("cadMechanism"),
  follow: document.getElementById("follow"),
  viewMode: document.getElementById("viewMode"),
  controlMode: document.getElementById("controlMode"),
  thrust: document.getElementById("thrust"),
  rollCmd: document.getElementById("rollCmd"),
  pitchCmd: document.getElementById("pitchCmd"),
  yawCmd: document.getElementById("yawCmd"),
  thrustText: document.getElementById("thrustText"),
  rollText: document.getElementById("rollText"),
  pitchText: document.getElementById("pitchText"),
  yawText: document.getElementById("yawText"),
};

let baseManual = {thrust: 10, roll: 0, pitch: 0, yaw: 0};
let momentary = {thrust: 0, roll: 0, pitch: 0, yaw: 0};
let keys = {};

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function control(payload) {
  return fetch("/api/control", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
}

ui.play.onclick = () => {
  const paused = !(state && state.paused);
  control({paused});
  ui.play.textContent = paused ? "Play" : "Pause";
};
ui.step.onclick = () => control({paused: true, step: true});
ui.reset.onclick = () => control({reset: true});
ui.speed.oninput = () => {
  const value = Number(ui.speed.value);
  ui.speedText.textContent = value.toFixed(2) + "x";
  control({speed: value});
};
ui.zoom.oninput = () => ui.zoomText.textContent = ui.zoom.value + " px/m";
ui.shellOpacity.oninput = () => {
  ui.shellOpacityText.textContent = Math.round(Number(ui.shellOpacity.value) * 100) + "%";
};
ui.viewMode.onchange = () => {
  if (ui.viewMode.value === "air") { ui.airflow.checked = true; ui.forces.checked = true; }
  if (ui.viewMode.value === "mechanics") { ui.mechanics.checked = true; ui.forces.checked = false; }
};
ui.controlMode.onchange = () => sendManual();

function updateControlLabels() {
  ui.thrustText.textContent = Number(ui.thrust.value).toFixed(1);
  ui.rollText.textContent = Number(ui.rollCmd.value).toFixed(2);
  ui.pitchText.textContent = Number(ui.pitchCmd.value).toFixed(2);
  ui.yawText.textContent = Number(ui.yawCmd.value).toFixed(3);
}

function readBaseManual() {
  baseManual = {
    thrust: Number(ui.thrust.value),
    roll: Number(ui.rollCmd.value),
    pitch: Number(ui.pitchCmd.value),
    yaw: Number(ui.yawCmd.value),
  };
}

function composedManual() {
  readBaseManual();
  return {
    thrust: Math.max(0, Math.min(18, baseManual.thrust + momentary.thrust * 2.2)),
    roll: Math.max(-3, Math.min(3, baseManual.roll + momentary.roll * 1.25)),
    pitch: Math.max(-3.5, Math.min(3.5, baseManual.pitch + momentary.pitch * 1.45)),
    yaw: Math.max(-0.15, Math.min(0.15, baseManual.yaw + momentary.yaw * 0.055)),
  };
}

function sendManual(forceManual=false) {
  updateControlLabels();
  const mode = forceManual ? "manual" : ui.controlMode.value;
  if (forceManual) ui.controlMode.value = "manual";
  control({mode, manual: composedManual()});
}

[ui.thrust, ui.rollCmd, ui.pitchCmd, ui.yawCmd].forEach(input => {
  input.addEventListener("input", () => sendManual(true));
});
updateControlLabels();

function zeroManual() {
  ui.rollCmd.value = 0;
  ui.pitchCmd.value = 0;
  ui.yawCmd.value = 0;
  momentary = {thrust: 0, roll: 0, pitch: 0, yaw: 0};
  sendManual(true);
}

document.querySelectorAll("[data-axis]").forEach(btn => {
  const axis = btn.dataset.axis;
  const value = Number(btn.dataset.value);
  const down = () => { momentary[axis] = value; sendManual(true); };
  const up = () => { momentary[axis] = 0; sendManual(true); };
  btn.addEventListener("mousedown", down);
  btn.addEventListener("touchstart", e => { e.preventDefault(); down(); }, {passive: false});
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
});
document.querySelector("[data-zero]").onclick = zeroManual;

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if ("wasdqerf".includes(k)) {
    keys[k] = true;
    ui.controlMode.value = "manual";
    e.preventDefault();
  }
});
window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if ("wasdqerf".includes(k)) {
    keys[k] = false;
    e.preventDefault();
  }
});

setInterval(() => {
  const next = {
    pitch: (keys.w ? 1 : 0) + (keys.s ? -1 : 0),
    roll: (keys.d ? 1 : 0) + (keys.a ? -1 : 0),
    yaw: (keys.e ? 1 : 0) + (keys.q ? -1 : 0),
    thrust: (keys.r ? 1 : 0) + (keys.f ? -1 : 0),
  };
  const active = next.pitch || next.roll || next.yaw || next.thrust;
  if (active || momentary.pitch || momentary.roll || momentary.yaw || momentary.thrust) {
    momentary = next;
    sendManual(true);
  }
}, 90);

canvas.addEventListener("mousedown", e => { dragging = true; panning = e.shiftKey; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => dragging = false);
window.addEventListener("mousemove", e => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (panning) { panX += dx; panY += dy; }
  else { yaw += dx * 0.006; pitch = Math.max(0.22, Math.min(1.25, pitch + dy * 0.006)); }
});
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const next = Math.max(700, Math.min(18000, Number(ui.zoom.value) * (e.deltaY > 0 ? 0.9 : 1.1)));
  ui.zoom.value = Math.round(next / 100) * 100;
  ui.zoomText.textContent = ui.zoom.value + " px/m";
});

function fmt(v, n=3) { return Number(v).toFixed(n); }
function deg(v) { return (v * 180 / Math.PI).toFixed(1) + "deg"; }
function v3(a, n=3) { return a.map(x => fmt(x, n)).join(", "); }

function updateMetrics(s) {
  if (!cameraTargetReady) {
    cameraTarget = cameraFocusPoint(s);
    cameraTargetReady = true;
  }
  if (!trail.length || s.frame < trail[trail.length - 1].frame) trail = [];
  const lastTrail = trail[trail.length - 1];
  if (!lastTrail || s.frame - lastTrail.frame > 6 || Math.hypot(
    s.body.xyz[0] - lastTrail.xyz[0],
    s.body.xyz[1] - lastTrail.xyz[1],
    s.body.xyz[2] - lastTrail.xyz[2]
  ) > 0.008) {
    trail.push({frame: s.frame, xyz: s.body.xyz.slice()});
    if (trail.length > 520) trail.shift();
  }
  document.getElementById("mTime").textContent = fmt(s.time, 3) + " s";
  document.getElementById("mFrame").textContent = s.frame;
  document.getElementById("mPos").textContent = v3(s.body.xyz, 4);
  document.getElementById("mRpy").textContent = s.body.rpy.map(deg).join(" / ");
  document.getElementById("mVel").textContent = v3(s.body.linear_velocity, 3);
  document.getElementById("mLeftAngles").textContent = deg(s.left.stroke_angle) + " / " + deg(s.left.rotate_angle);
  document.getElementById("mRightAngles").textContent = deg(s.right.stroke_angle) + " / " + deg(s.right.rotate_angle);
  document.getElementById("mForces").textContent = fmt(s.left.normal_force, 4) + " / " + fmt(s.right.normal_force, 4) + " N";
  document.getElementById("mAoa").textContent = deg(s.left.aoa) + " / " + deg(s.right.aoa);
  document.getElementById("mCurrent").textContent = fmt(s.left.current, 3) + " / " + fmt(s.right.current, 3) + " A";
  document.getElementById("mTorque").textContent = fmt(s.left.torque, 5) + " / " + fmt(s.right.torque, 5) + " Nm";
  document.getElementById("mControl").textContent = s.control_mode === "manual"
    ? `T ${fmt(s.action[0],1)} R ${fmt(s.action[1],2)} P ${fmt(s.action[2],2)} Y ${fmt(s.action[3],3)}`
    : "PID hover";
  ui.controlMode.value = s.control_mode || ui.controlMode.value;
  ui.play.textContent = s.paused ? "Play" : "Pause";
}

function rotate(p) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  let x = p[0], y = p[1], z = p[2];
  let x1 = cy*x - sy*y, y1 = sy*x + cy*y;
  let y2 = cp*y1 - sp*z, z2 = sp*y1 + cp*z;
  return [x1, y2, z2];
}

function cameraFocusPoint(s=state) {
  if (!s) return cameraTarget;
  const links = s.links || {};
  const torso = (links.torso && links.torso.com) || (s.body && s.body.xyz);
  const roots = [
    links.left_leading_edge && links.left_leading_edge.com,
    links.right_leading_edge && links.right_leading_edge.com,
  ].filter(Boolean);
  if (!torso && !roots.length) return cameraTarget;
  if (!roots.length) return torso.slice();
  const rootSum = roots.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  const rootCenter = [rootSum[0] / roots.length, rootSum[1] / roots.length, rootSum[2] / roots.length];
  if (!torso) return rootCenter;
  return [
    torso[0] * 0.65 + rootCenter[0] * 0.35,
    torso[1] * 0.65 + rootCenter[1] * 0.35,
    torso[2] * 0.65 + rootCenter[2] * 0.35,
  ];
}

function updateCameraTarget() {
  if (!state || state.status !== "running") return;
  const target = cameraFocusPoint(state);
  if (!cameraTargetReady) {
    cameraTarget = target.slice();
  } else {
    const dist = Math.hypot(
      target[0] - cameraTarget[0],
      target[1] - cameraTarget[1],
      target[2] - cameraTarget[2]
    );
    const k = dist > 0.08 ? 0.14 : 0.045;
    cameraTarget = [
      cameraTarget[0] + (target[0] - cameraTarget[0]) * k,
      cameraTarget[1] + (target[1] - cameraTarget[1]) * k,
      cameraTarget[2] + (target[2] - cameraTarget[2]) * k,
    ];
  }
  cameraTargetReady = true;
}

function project(p) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const center = state ? cameraTarget : [0,0,0];
  const q = rotate([p[0]-center[0], p[1]-center[1], p[2]-center[2]]);
  const zPerspective = 1 + q[2] * 1.8;
  const scale = Number(ui.zoom.value) / Math.max(0.35, zPerspective);
  return [w * 0.5 + panX + q[0] * scale, h * 0.56 + panY - q[1] * scale, q[2]];
}

function label3(p, text, color="rgba(205,224,240,0.72)") {
  const pp = project(p);
  ctx.fillStyle = color;
  ctx.font = "11px Segoe UI, Arial";
  ctx.fillText(text, pp[0] + 5, pp[1] - 5);
}

function linkPoint(name) { return state.links[name].com; }
function add(a,b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a,b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mul(a,k) { return [a[0]*k, a[1]*k, a[2]*k]; }
function norm(a) { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l,a[1]/l,a[2]/l]; }

function line3(a, b, color, width=2, alpha=1) {
  const pa = project(a), pb = project(b);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
  ctx.globalAlpha = 1;
}
function circle3(p, r, color, alpha=1) {
  const pp = project(p);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(pp[0], pp[1], r, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}
function poly3(points, fill, stroke) {
  const pp = points.map(project);
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
  ctx.beginPath();
  pp.forEach((p,i) => i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1]));
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function plane3(points, fill, stroke, width=2) {
  const pp = points.map(project);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  pp.forEach((p,i) => i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1]));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function arrowHead2D(a, b, color, size=9) {
  const ang = Math.atan2(b[1]-a[1], b[0]-a[0]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - Math.cos(ang - 0.55) * size, b[1] - Math.sin(ang - 0.55) * size);
  ctx.lineTo(b[0] - Math.cos(ang + 0.55) * size, b[1] - Math.sin(ang + 0.55) * size);
  ctx.closePath();
  ctx.fill();
}

function arrow3(a, b, color, width=2.5, alpha=1) {
  const pa = project(a), pb = project(b);
  line3(a, b, color, width, alpha);
  ctx.globalAlpha = alpha;
  arrowHead2D(pa, pb, color, 9);
  ctx.globalAlpha = 1;
}

function curvedArrow3(center, radius, side, angle, velocity, color) {
  const dir = velocity >= 0 ? 1 : -1;
  const span = 1.25;
  const start = angle - dir * span * 0.5;
  const points = [];
  for (let i = 0; i <= 18; i++) {
    const a = start + dir * span * (i / 18);
    points.push(add(center, [
      Math.sin(a) * radius * 0.55,
      side * Math.cos(a) * radius,
      Math.sin(a * 0.6) * radius * 0.22
    ]));
  }
  for (let i = 0; i < points.length - 1; i++) {
    line3(points[i], points[i+1], color, 2.2, 0.85);
  }
  arrow3(points[points.length-2], points[points.length-1], color, 2.2, 0.9);
}

function drawWingMotion() {
  const leftLE = linkPoint("left_leading_edge");
  const rightLE = linkPoint("right_leading_edge");
  curvedArrow3(leftLE, 0.050, 1, state.left.stroke_angle, state.left.stroke_velocity, "rgba(112,224,138,0.95)");
  curvedArrow3(rightLE, 0.050, -1, state.right.stroke_angle, state.right.stroke_velocity, "rgba(112,224,138,0.95)");

  const lTip = add(leftLE, [Math.sin(state.left.stroke_angle)*0.030, 0.050*Math.cos(state.left.stroke_angle), Math.sin(state.left.rotate_angle)*0.020]);
  const rTip = add(rightLE, [Math.sin(state.right.stroke_angle)*0.030, -0.050*Math.cos(state.right.stroke_angle), Math.sin(state.right.rotate_angle)*0.020]);
  const lVel = norm([Math.cos(state.left.stroke_angle)*state.left.stroke_velocity*0.025, -Math.sin(state.left.stroke_angle)*state.left.stroke_velocity*0.035, state.left.rotate_velocity*0.006]);
  const rVel = norm([Math.cos(state.right.stroke_angle)*state.right.stroke_velocity*0.025, Math.sin(state.right.stroke_angle)*state.right.stroke_velocity*0.035, state.right.rotate_velocity*0.006]);
  arrow3(lTip, add(lTip, mul(lVel, 0.032)), "rgba(120,245,160,0.95)", 3);
  arrow3(rTip, add(rTip, mul(rVel, 0.032)), "rgba(120,245,160,0.95)", 3);
}

function wingPoly(center, side, strokeAngle, rotateAngle) {
  const sign = side === "left" ? 1 : -1;
  const span = 0.075, chord = 0.020;
  const root = add(center, [0, sign*0.010, 0]);
  const tipDir = [Math.sin(strokeAngle)*0.55, sign*Math.cos(strokeAngle), Math.sin(rotateAngle)*0.34];
  const chordDir = [Math.cos(strokeAngle)*0.70, -sign*Math.sin(strokeAngle)*0.20, -Math.cos(rotateAngle)*0.55];
  const tip = add(root, mul(norm(tipDir), span));
  const c = mul(norm(chordDir), chord);
  return [add(root, c), sub(root, c), sub(tip, mul(c, 0.75)), add(tip, mul(c, 0.75))];
}

function box3(center, size, fill, stroke, alpha=1) {
  const [sx, sy, sz] = size;
  const points = [
    add(center, [-sx, -sy, -sz]), add(center, [sx, -sy, -sz]),
    add(center, [sx, sy, -sz]), add(center, [-sx, sy, -sz]),
    add(center, [-sx, -sy, sz]), add(center, [sx, -sy, sz]),
    add(center, [sx, sy, sz]), add(center, [-sx, sy, sz]),
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  ctx.globalAlpha = alpha;
  poly3([points[0], points[1], points[2], points[3]], fill, stroke);
  poly3([points[4], points[5], points[6], points[7]], fill, stroke);
  for (const [a,b] of edges) line3(points[a], points[b], stroke, 1.2, alpha);
  ctx.globalAlpha = 1;
}

function drawRotatingJoint(center, radius, angle, colorMain, colorArm) {
  circle3(center, 3.2, colorMain, 0.95);
  const pin = add(center, [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.35, Math.sin(angle) * radius * 0.25]);
  line3(center, pin, colorArm, 1.8, 0.95);
  circle3(pin, 2.4, colorArm, 0.95);
  return pin;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function unwrapPhase(sideName, raw) {
  const prev = mechPhase[sideName];
  if (prev === null || !Number.isFinite(prev)) {
    mechPhase[sideName] = raw;
    return raw;
  }
  while (raw - prev > Math.PI) raw -= Math.PI * 2;
  while (raw - prev < -Math.PI) raw += Math.PI * 2;
  const next = prev + (raw - prev) * 0.55;
  mechPhase[sideName] = next;
  return next;
}

function mechanismPhase(sideName, wing) {
  const velocityTerm = wing.stroke_velocity * 0.018;
  const raw = Math.atan2(wing.stroke_angle, velocityTerm);
  return unwrapPhase(sideName, raw);
}

function gear3(center, radius, teeth, angle, fill, stroke, alpha=0.9) {
  const points = [];
  const count = teeth * 2;
  for (let i = 0; i < count; i++) {
    const a = angle + Math.PI * 2 * i / count;
    const r = radius * (i % 2 ? 0.86 : 1.0);
    points.push(add(center, [Math.cos(a) * r, 0, Math.sin(a) * r]));
  }
  ctx.globalAlpha = alpha;
  poly3(points, fill, stroke);
  const hub = add(center, [0, 0, 0]);
  circle3(hub, 2.8, stroke, alpha);
  ctx.globalAlpha = 1;
}

function loadBar3(start, dir, amount, color, backColor) {
  const len = 0.018;
  const end = add(start, mul(dir, len));
  const fillEnd = add(start, mul(dir, len * clamp(amount, 0, 1)));
  line3(start, end, backColor, 3.8, 0.55);
  line3(start, fillEnd, color, 3.8, 0.95);
}

function drawCadSide(sideName, root, wingCenter, wing) {
  const sign = sideName === "left" ? 1 : -1;
  const strokeAngle = wing.stroke_angle;
  const rotateAngle = wing.rotate_angle;
  const phase = mechanismPhase(sideName, wing);
  const rootBack = add(root, [-0.014, -sign * 0.004, -0.004]);
  const gearbox = add(root, [-0.026, -sign * 0.008, -0.006]);
  const motor = add(gearbox, [-0.011, 0, 0.001]);
  const idlerGear = add(gearbox, [0.0055, 0, 0.000]);
  const outputGear = add(gearbox, [0.013, 0, 0.001]);
  const output = add(root, [-0.011, -sign * 0.004, -0.001]);
  const servo = add(root, [-0.019, sign * 0.014, -0.007]);
  const motorPhase = phase * 3.0;
  const crankAngle = phase + (sideName === "left" ? 0 : Math.PI);
  const load = clamp(Math.abs(wing.current) / 2.2 + Math.abs(wing.torque) * 420, 0, 1);

  box3(gearbox, [0.0075, 0.0055, 0.0045], "rgba(68, 83, 105, 0.76)", "rgba(210,225,245,0.62)", 0.88);
  box3(motor, [0.0065, 0.0038, 0.0038], "rgba(28, 34, 48, 0.84)", "rgba(120,145,180,0.66)", 0.9);
  gear3(add(motor, [0.0058, 0, 0]), 0.0044, 10, motorPhase, "rgba(33,48,64,0.92)", "rgba(135,185,225,0.78)", 0.86);
  gear3(idlerGear, 0.0058, 12, -motorPhase * 0.72, "rgba(39,54,72,0.9)", "rgba(170,205,235,0.72)", 0.86);
  gear3(outputGear, 0.0066, 14, phase, "rgba(62,63,58,0.92)", "rgba(255,210,90,0.84)", 0.9);
  loadBar3(add(motor, [-0.005, 0, 0.006]), [1, 0, 0], load, "rgba(255,196,93,0.95)", "rgba(80,94,112,0.72)");

  const crankPin = drawRotatingJoint(outputGear, 0.0075, crankAngle, "rgba(255,210,90,0.9)", "rgba(255,176,0,0.9)");
  const outputPin = add(output, [Math.sin(strokeAngle) * 0.006, sign * Math.cos(strokeAngle) * 0.007, Math.sin(rotateAngle) * 0.0035]);
  circle3(output, 2.8, "rgba(105,160,255,0.9)", 0.9);
  line3(output, outputPin, "rgba(105,160,255,0.9)", 1.7, 0.9);
  line3(crankPin, outputPin, "rgba(245,245,255,0.76)", 1.45, 0.88);
  arrow3(crankPin, add(crankPin, [Math.cos(crankAngle + Math.PI * 0.5) * 0.008, 0, Math.sin(crankAngle + Math.PI * 0.5) * 0.008]), "rgba(255,210,90,0.84)", 1.5, 0.82);

  line3(outputPin, root, "rgba(150,210,255,0.82)", 1.45, 0.86);
  circle3(root, 3.0, "rgba(120,245,160,0.88)", 0.88);

  box3(servo, [0.006, 0.0045, 0.0045], "rgba(28,42,76,0.78)", "rgba(150,190,255,0.62)", 0.88);
  const horn = add(servo, [Math.cos(rotateAngle) * 0.0065, sign * 0.004, Math.sin(rotateAngle) * 0.0065]);
  line3(servo, horn, "rgba(125,170,255,0.86)", 1.6, 0.88);
  line3(horn, rootBack, "rgba(125,170,255,0.58)", 1.2, 0.78);
  arrow3(servo, horn, "rgba(125,170,255,0.76)", 1.5, 0.76);

  line3(root, wingCenter, "rgba(255,255,255,0.42)", 1.0, 0.72);
}

function midpoint3(a, b) {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

function drawCadMechanism() {
  const torso = linkPoint("torso");
  const leftLE = linkPoint("left_leading_edge");
  const rightLE = linkPoint("right_leading_edge");
  const leftWing = linkPoint("left_wing");
  const rightWing = linkPoint("right_wing");
  box3(add(torso, [-0.018, 0, -0.006]), [0.014, 0.011, 0.005], "rgba(26,42,58,0.74)", "rgba(210,235,255,0.56)", 0.84);
  line3(add(torso, [-0.036, 0, -0.006]), add(torso, [0.020, 0, -0.006]), "rgba(210,235,255,0.42)", 1.4, 0.75);
  drawCadSide("left", leftLE, leftWing, state.left);
  drawCadSide("right", rightLE, rightWing, state.right);
}

function ellipse3(center, axisA, axisB, steps=34) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const a = Math.PI * 2 * i / steps;
    points.push(add(center, add(mul(axisA, Math.cos(a)), mul(axisB, Math.sin(a)))));
  }
  return points;
}

function drawShellDisc(center, axisA, axisB, fill, stroke, width=1.2) {
  const points = ellipse3(center, axisA, axisB);
  poly3(points, fill, stroke);
  for (let i = 0; i < points.length; i++) {
    line3(points[i], points[(i + 1) % points.length], stroke, width, 1);
  }
}

function drawShellPart(center, rx, ry, rz, fillAlpha, edgeAlpha, tint="amber") {
  const fill = tint === "head"
    ? `rgba(55, 42, 26, ${fillAlpha})`
    : `rgba(212, 151, 42, ${fillAlpha})`;
  const stroke = `rgba(255, 224, 145, ${edgeAlpha})`;
  drawShellDisc(center, [rx, 0, 0], [0, ry, 0], fill, stroke, 1.05);
  drawShellDisc(center, [rx, 0, 0], [0, 0, rz], fill, stroke, 0.95);
  drawShellDisc(center, [0, ry, 0], [0, 0, rz], `rgba(245, 190, 72, ${fillAlpha * 0.72})`, stroke, 0.9);
}

function drawBeeShell(torso, leftLE, rightLE) {
  const opacity = Number(ui.shellOpacity.value || 0);
  if (opacity <= 0.01) return;
  const fillAlpha = Math.min(0.96, opacity * 0.92);
  const edgeAlpha = Math.min(0.9, 0.18 + opacity * 0.62);
  const lateral = Math.max(0.028, Math.abs(leftLE[1] - rightLE[1]) * 0.48);

  const thorax = add(torso, [0.004, 0, -0.002]);
  const abdomen = add(torso, [0.046, 0, -0.006]);
  const head = add(torso, [-0.036, 0, 0.000]);

  drawShellPart(abdomen, 0.044, lateral * 0.78, 0.026, fillAlpha * 0.88, edgeAlpha);
  drawShellPart(thorax, 0.036, Math.max(0.034, lateral * 1.18), 0.032, fillAlpha, edgeAlpha);
  drawShellPart(head, 0.021, 0.020, 0.019, fillAlpha * 0.82, edgeAlpha, "head");

  const stripeAlpha = Math.min(0.72, 0.12 + opacity * 0.46);
  for (const offset of [0.032, 0.046, 0.060]) {
    const c = add(torso, [offset, 0, -0.003]);
    const ring = ellipse3(c, [0, lateral * 0.64, 0], [0, 0, 0.022], 26);
    for (let i = 0; i < ring.length; i++) {
      line3(ring[i], ring[(i + 1) % ring.length], `rgba(42, 30, 20, ${stripeAlpha})`, 1.2, 1);
    }
  }

  line3(leftLE, add(thorax, [0.002, lateral * 0.92, 0]), `rgba(255,224,145,${edgeAlpha})`, 1.2, 0.9);
  line3(rightLE, add(thorax, [0.002, -lateral * 0.92, 0]), `rgba(255,224,145,${edgeAlpha})`, 1.2, 0.9);
}

function resetParticle(p, fresh=false) {
  const side = Math.random() < 0.5 ? 1 : -1;
  const torso = state ? state.body.xyz : [0,0,0];
  p.x = torso[0] - 0.24 + Math.random()*0.18;
  p.y = torso[1] + side*(0.020 + Math.random()*0.150);
  p.z = torso[2] - 0.080 + Math.random()*0.160;
  p.life = fresh ? Math.random() : 1;
  p.side = side;
}

function seedParticles() {
  while (particles.length < 560) {
    const p = {};
    resetParticle(p, true);
    particles.push(p);
  }
}

function drawAirflow(dt) {
  seedParticles();
  const intensity = state.airflow_intensity || 0.2;
  const left = linkPoint("left_wing"), right = linkPoint("right_wing");
  const cmd = state.action || [10,0,0,0];
  const rollBias = (cmd[1] || 0) / 3;
  const pitchBias = (cmd[2] || 0) / 3.5;
  const yawBias = (cmd[3] || 0) / 0.15;
  const thrustBias = Math.max(0, Math.min(1, (cmd[0] || 0) / 18));
  for (const p of particles) {
    const wing = p.side > 0 ? left : right;
    const force = p.side > 0 ? state.left.normal_force : state.right.normal_force;
    const wingVel = p.side > 0 ? state.left.stroke_velocity : state.right.stroke_velocity;
    const phase = (state.time*18) + p.x*80 + p.y*60;
    p.x += (0.00045 + 0.0028*intensity + 0.0012*Math.abs(pitchBias)) * dt * 60;
    p.z += Math.sin(phase) * 0.00022 * dt * 60;
    p.y += (p.side * Math.sin(phase*0.75) * 0.00018 + rollBias*0.00038 + yawBias*p.side*0.00022) * dt * 60;
    const near = Math.hypot(p.x-wing[0], p.y-wing[1], p.z-wing[2]);
    if (near < 0.06) {
      const lift = Math.sign(force || 1);
      const downwash = -lift * (0.0012 + Math.min(0.003, Math.abs(force)*0.028) + thrustBias*0.0007) * intensity;
      p.z += downwash * dt * 60;
      p.x += (0.0009 + Math.abs(wingVel)*0.000015) * intensity * dt * 60;
      p.y += p.side * Math.sin(phase + wingVel*0.02) * 0.00065 * intensity * dt * 60;
    }
    p.life -= 0.004 * dt * 60;
    const torso = state.body.xyz;
    if (Math.hypot(p.x - torso[0], p.y - torso[1], p.z - torso[2]) > 0.48 || p.life <= 0) {
      resetParticle(p);
    }
    const color = near < 0.06
      ? (force >= 0 ? "rgba(80,220,255,0.82)" : "rgba(245,196,93,0.72)")
      : (p.side > 0 ? "rgba(80,200,255,0.56)" : "rgba(100,235,210,0.50)");
    circle3([p.x,p.y,p.z], 1.8 + intensity*1.6, color, Math.max(0.12, p.life));
  }
}

function drawControlVector() {
  if (!state || state.control_mode !== "manual") return;
  const torso = linkPoint("torso");
  const a = state.action || [0,0,0,0];
  const thrust = (a[0] || 0) / 18;
  const roll = (a[1] || 0) / 3;
  const pitchCmd = (a[2] || 0) / 3.5;
  const yawCmd = (a[3] || 0) / 0.15;
  arrow3(torso, add(torso, [pitchCmd*0.055, roll*0.055, thrust*0.050]), "rgba(80,200,255,0.96)", 3.2, 0.95);
  if (Math.abs(yawCmd) > 0.02) {
    curvedArrow3(add(torso, [0,0,0.018]), 0.035, yawCmd >= 0 ? 1 : -1, state.body.rpy[2], yawCmd, "rgba(245,196,93,0.9)");
  }
}

function drawGrid() {
  const z = -0.075;
  const extent = 1.35;
  plane3(
    [[-extent, -extent, z], [extent, -extent, z], [extent, extent, z], [-extent, extent, z]],
    "rgb(24, 74, 84)",
    "rgb(230, 248, 255)",
    4.2
  );
}

function drawHeightCue() {
  const z = -0.075;
  const torso = linkPoint("torso");
  const base = [torso[0], torso[1], z + 0.003];
  line3(base, torso, "rgba(210,235,255,0.72)", 2.2);
  circle3(base, 7, "rgba(95,220,255,0.85)", 0.85);
}

function drawOrientationHud() {
  const x = canvas.clientWidth - 138;
  const y = 32;
  ctx.save();
  ctx.fillStyle = "rgba(4, 12, 18, 0.92)";
  ctx.strokeStyle = "rgba(190, 236, 255, 0.78)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, 112, 96, 8);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#f4c45d";
  ctx.fillStyle = "#f4c45d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 34, y + 72);
  ctx.lineTo(x + 34, y + 25);
  ctx.stroke();
  arrowHead2D([x + 34, y + 72], [x + 34, y + 25], "#f4c45d", 12);
  ctx.fillStyle = "#eef5ff";
  ctx.font = "700 13px Segoe UI, Arial";
  ctx.fillText("UP", x + 52, y + 34);
  ctx.fillStyle = "#a9c6d8";
  ctx.font = "12px Segoe UI, Arial";
  ctx.fillText("solid floor", x + 18, y + 83);
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const alpha = Math.max(0.05, i / trail.length * 0.55);
    line3(trail[i-1].xyz, trail[i].xyz, `rgba(80,200,255,${alpha})`, 2.2);
  }
}

function drawScene(dt) {
  ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  if (!state || state.status !== "running") return;
  pitch = Math.max(0.22, Math.min(1.25, pitch));
  updateCameraTarget();

  if (ui.airflow.checked) drawAirflow(dt);
  drawGrid();
  drawTrail();

  const torso = linkPoint("torso");
  const leftLE = linkPoint("left_leading_edge"), rightLE = linkPoint("right_leading_edge");
  const leftWing = wingPoly(leftLE, "left", state.left.stroke_angle, state.left.rotate_angle);
  const rightWing = wingPoly(rightLE, "right", state.right.stroke_angle, state.right.rotate_angle);

  if (ui.cadMechanism.checked) {
    drawCadMechanism();
  }
  drawBeeShell(torso, leftLE, rightLE);

  poly3(leftWing, "rgba(90,125,255,0.35)", "rgba(110,150,255,0.95)");
  poly3(rightWing, "rgba(255,100,100,0.32)", "rgba(255,125,125,0.95)");
  line3(torso, leftLE, "#6c8cff", 3);
  line3(torso, rightLE, "#ff7979", 3);
  circle3(torso, 9, "#eaf4ff", 0.96);
  circle3(leftLE, 5, "#7b96ff", 0.95);
  circle3(rightLE, 5, "#ff7777", 0.95);

  if (ui.mechanics.checked) {
    const lTip = leftWing[2], rTip = rightWing[2];
    line3(leftLE, lTip, "rgba(150,170,255,0.9)", 1.5);
    line3(rightLE, rTip, "rgba(255,160,160,0.9)", 1.5);
    line3(torso, add(torso, mul(norm(state.body.linear_velocity), 0.04)), "rgba(112,224,138,0.9)", 2);
  }

  if (ui.motion.checked) {
    drawWingMotion();
  }

  drawControlVector();
  drawHeightCue();

  if (ui.forces.checked) {
    const lf = state.left.normal_force, rf = state.right.normal_force;
    const lCenter = linkPoint("left_wing"), rCenter = linkPoint("right_wing");
    arrow3(lCenter, add(lCenter, [0, 0, Math.max(-0.075, Math.min(0.075, lf*1.6))]), "#f4c45d", 4, 0.95);
    arrow3(rCenter, add(rCenter, [0, 0, Math.max(-0.075, Math.min(0.075, rf*1.6))]), "#f4c45d", 4, 0.95);
    circle3(lCenter, 4, "#f4c45d", 0.9);
    circle3(rCenter, 4, "#f4c45d", 0.9);
  }

  ctx.fillStyle = "rgba(238,245,255,0.82)";
  ctx.font = "12px Segoe UI, Arial";
  ctx.fillText("t=" + fmt(state.time,3) + "s  speed=" + fmt(state.speed,2) + "x  zoom=" + ui.zoom.value, 18, canvas.clientHeight - 18);
  drawOrientationHud();
}

let last = performance.now();
function animate(now) {
  const dt = Math.min(0.05, (now-last)/1000); last = now;
  drawScene(dt);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

async function poll() {
  try {
    const r = await fetch("/api/state");
    state = await r.json();
    updateMetrics(state);
  } catch (e) {}
  setTimeout(poll, 80);
}
poll();
</script>
</body>
</html>"""


runtime = None


class Handler(SecureLocalMixin, BaseHTTPRequestHandler):
    def _send(self, status, content_type, body):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.security_get():
            return
        path = urlparse(self.path).path
        if path in ["/", "/index.html"]:
            self._send(200, "text/html; charset=utf-8", HTML.replace('<head>', '<head><script src="/local-api-security.js"></script>', 1))
            return
        if path == "/api/state":
            self._send(200, "application/json", json.dumps(runtime.get_state()))
            return
        self._send(404, "text/plain; charset=utf-8", "not found")

    def handle_post(self):
        if urlparse(self.path).path != "/api/control":
            self._send(404, "text/plain; charset=utf-8", "not found")
            return
        raw = self.rfile.read(int(self.headers.get("Content-Length", "0") or "0"))
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
            result = runtime.set_control(payload)
            self._send(200, "application/json", json.dumps(result))
        except Exception as exc:
            self._send(400, "application/json", json.dumps({"error": str(exc)}))

    def log_message(self, fmt, *args):
        return


def main():
    global runtime
    runtime = FlappyRuntime()
    thread = threading.Thread(target=runtime.loop, daemon=True)
    thread.start()
    server = BoundedHTTPServer((HOST, PORT), Handler)
    shown_host = "127.0.0.1" if HOST in ("0.0.0.0", "::") else HOST
    print(f"FLAPPY_INSPECTOR_READY http://{shown_host}:{PORT}/", flush=True)
    try:
        server.serve_forever()
    finally:
        runtime.running = False


if __name__ == "__main__":
    main()
