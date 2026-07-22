from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from starlette.routing import Route

from circuit_sim import from_query, simulate


ROOT = Path(__file__).resolve().parent
BOARD_DIR = ROOT.parent / "BeeBoard_v0_1_Micro_KiCad"
GLB_PATH = BOARD_DIR / "BeeBoard_v0_1_Micro.glb"
SOC_PROJECT_DIR = Path(os.environ.get("BEEBOARD_SOC_PROJECT_DIR", str(ROOT / "beesoc_v0_1_sim_codex")))
SOC_INTERACTIVE_APP = SOC_PROJECT_DIR / "interactive_beesoc_diagram.py"
FLAPPY_DIR = Path(os.environ.get("BEEBOARD_FLAPPY_DIR", str(ROOT / "Flappy_Hummingbird")))
HONEYBIRD_LAUNCHER = FLAPPY_DIR / "Start_Flappy_Inspector.bat"
HONEYBIRD_SIM_LAUNCHER = FLAPPY_DIR / "Start_Flappy_Simulation.bat"
HONEYBIRD_VIEWER_URL = "http://127.0.0.1:8099/"
HONEYBIRD_PROXY_BASE = "http://127.0.0.1:8099"
HONEYBIRD_CHANNEL_IMAGES = {
    "control": FLAPPY_DIR / "flappy_manual_control_screen.png",
    "motion": FLAPPY_DIR / "flappy_large_scene.png",
}
AI_MIPS_DIR = Path(os.environ.get("BEEBOARD_AI_MIPS_DIR", str(ROOT / "python_ai_mips_sim")))
AI_MIPS_PROXY_BASE = "http://127.0.0.1:8775"
COLAB_BRIDGE_DIR = ROOT / "colab_bridge"
COLAB_INBOX_DIR = COLAB_BRIDGE_DIR / "inbox"
COLAB_STATUS_DIR = COLAB_BRIDGE_DIR / "status"
COLAB_BACKENDS = {"cpu", "gpu"}


SOC_KEY_FILES = [
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
HONEYBIRD_PROCESS: subprocess.Popen | None = None
AI_MIPS_PROCESS: subprocess.Popen | None = None


def ensure_colab_bridge_dirs() -> None:
    for backend in COLAB_BACKENDS:
        (COLAB_INBOX_DIR / backend).mkdir(parents=True, exist_ok=True)
        (COLAB_STATUS_DIR / backend).mkdir(parents=True, exist_ok=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


async def health(_request):
    return JSONResponse(
        {
            "ok": True,
            "viewer_mode": "3D Board Review",
            "model_exists": GLB_PATH.exists(),
            "model_path": str(GLB_PATH),
            "honeybird_exists": FLAPPY_DIR.exists(),
            "honeybird_path": str(FLAPPY_DIR),
            "processors_exists": AI_MIPS_DIR.exists(),
            "processors_path": str(AI_MIPS_DIR),
        }
    )


async def api_simulate(request):
    inputs = from_query(dict(request.query_params))
    return JSONResponse(simulate(inputs))


async def api_soc_project(_request):
    files = []
    for name in SOC_KEY_FILES:
        path = SOC_PROJECT_DIR / name
        files.append({"name": name, "exists": path.exists(), "size": path.stat().st_size if path.exists() else None})
    return JSONResponse(
        {
            "ok": SOC_PROJECT_DIR.exists(),
            "project_path": str(SOC_PROJECT_DIR),
            "interactive_app": str(SOC_INTERACTIVE_APP),
            "interactive_exists": SOC_INTERACTIVE_APP.exists(),
            "files": files,
        }
    )


async def api_open_soc_project(_request):
    global SOC_PROCESS
    if not SOC_INTERACTIVE_APP.exists():
        return JSONResponse({"ok": False, "error": "SoC interactive app not found", "path": str(SOC_INTERACTIVE_APP)}, status_code=404)

    if SOC_PROCESS is not None and SOC_PROCESS.poll() is None:
        return JSONResponse({"ok": True, "already_open": True, "pid": SOC_PROCESS.pid, "project_path": str(SOC_PROJECT_DIR)})

    SOC_PROCESS = subprocess.Popen(
        [sys.executable, str(SOC_INTERACTIVE_APP)],
        cwd=str(SOC_PROJECT_DIR),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return JSONResponse({"ok": True, "already_open": False, "pid": SOC_PROCESS.pid, "opened": str(SOC_INTERACTIVE_APP), "project_path": str(SOC_PROJECT_DIR)})


async def api_honeybird(_request):
    channels = []
    for name, path in HONEYBIRD_CHANNEL_IMAGES.items():
        channels.append(
            {
                "name": name,
                "exists": path.exists(),
                "url": f"/honeybird/image/{name}",
                "path": str(path),
                "size": path.stat().st_size if path.exists() else None,
            }
        )
    return JSONResponse(
        {
            "ok": FLAPPY_DIR.exists(),
            "project_path": str(FLAPPY_DIR),
            "launcher": str(HONEYBIRD_LAUNCHER),
            "launcher_exists": HONEYBIRD_LAUNCHER.exists(),
            "simulation_launcher": str(HONEYBIRD_SIM_LAUNCHER),
            "simulation_launcher_exists": HONEYBIRD_SIM_LAUNCHER.exists(),
            "viewer_url": HONEYBIRD_VIEWER_URL,
            "process_running": HONEYBIRD_PROCESS is not None and HONEYBIRD_PROCESS.poll() is None,
            "pid": HONEYBIRD_PROCESS.pid if HONEYBIRD_PROCESS is not None and HONEYBIRD_PROCESS.poll() is None else None,
            "channels": channels,
        }
    )


async def api_open_honeybird(_request):
    global HONEYBIRD_PROCESS
    if not FLAPPY_DIR.exists():
        return JSONResponse({"ok": False, "error": "Honeybird project not found", "path": str(FLAPPY_DIR)}, status_code=404)

    if HONEYBIRD_PROCESS is not None and HONEYBIRD_PROCESS.poll() is None:
        return JSONResponse({"ok": True, "already_open": True, "pid": HONEYBIRD_PROCESS.pid, "project_path": str(FLAPPY_DIR), "viewer_url": HONEYBIRD_VIEWER_URL})

    HONEYBIRD_PROCESS = subprocess.Popen(
        ["wsl.exe", "-d", "Ubuntu", "--", "bash", "-lc", "~/codex_flappy/flappy/start_flappy_inspector.sh"],
        cwd=str(FLAPPY_DIR),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return JSONResponse({"ok": True, "already_open": False, "pid": HONEYBIRD_PROCESS.pid, "opened": "WSL Honeybird inspector", "project_path": str(FLAPPY_DIR), "viewer_url": HONEYBIRD_VIEWER_URL})


async def api_processors(_request):
    running = AI_MIPS_PROCESS is not None and AI_MIPS_PROCESS.poll() is None
    return JSONResponse(
        {
            "ok": AI_MIPS_DIR.exists(),
            "project_path": str(AI_MIPS_DIR),
            "process_running": running,
            "pid": AI_MIPS_PROCESS.pid if running else None,
            "viewer_url": "/processors/live/",
            "internal_url": AI_MIPS_PROXY_BASE,
        }
    )


async def api_open_processors(_request):
    global AI_MIPS_PROCESS
    if not AI_MIPS_DIR.exists():
        return JSONResponse({"ok": False, "error": "AI MIPS simulator project not found", "path": str(AI_MIPS_DIR)}, status_code=404)

    if AI_MIPS_PROCESS is not None and AI_MIPS_PROCESS.poll() is None:
        return JSONResponse({"ok": True, "already_open": True, "pid": AI_MIPS_PROCESS.pid, "viewer_url": "/processors/live/"})

    code = (
        "from http.server import ThreadingHTTPServer; "
        "from ai_mips_sim.server import Handler; "
        "ThreadingHTTPServer(('127.0.0.1', 8775), Handler).serve_forever()"
    )
    AI_MIPS_PROCESS = subprocess.Popen(
        [sys.executable, "-c", code],
        cwd=str(AI_MIPS_DIR),
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return JSONResponse({"ok": True, "already_open": False, "pid": AI_MIPS_PROCESS.pid, "viewer_url": "/processors/live/"})


async def honeybird_live_proxy(request):
    target_path = request.path_params.get("path") or ""
    query = request.url.query
    target_url = f"{HONEYBIRD_PROXY_BASE}/{target_path}"
    if query:
        target_url += f"?{query}"

    body = await request.body()
    proxy_request = urllib.request.Request(
        target_url,
        data=body if request.method != "GET" else None,
        method=request.method,
        headers={
            "Content-Type": request.headers.get("content-type", "application/octet-stream"),
            "Accept": request.headers.get("accept", "*/*"),
        },
    )

    try:
        with urllib.request.urlopen(proxy_request, timeout=6) as upstream:
            content = upstream.read()
            content_type = upstream.headers.get("Content-Type", "application/octet-stream")
    except urllib.error.URLError as error:
        return PlainTextResponse(f"Honeybird live proxy is not available: {error}", status_code=502)

    if "text/html" in content_type:
        text = content.decode("utf-8", errors="replace")
        text = text.replace('fetch("/api/', 'fetch("/honeybird/live/api/')
        text = text.replace("fetch('/api/", "fetch('/honeybird/live/api/")
        text = text.replace('fetch(`/api/', 'fetch(`/honeybird/live/api/')
        return HTMLResponse(text)

    return Response(content, media_type=content_type)


async def processors_live_proxy(request):
    target_path = request.path_params.get("path") or ""
    if target_path == "physical-simulator":
        return PlainTextResponse("Physical simulation is not part of the BeeBoard AI MIPS interface.", status_code=404)

    query = request.url.query
    target_url = f"{AI_MIPS_PROXY_BASE}/{target_path}"
    if query:
        target_url += f"?{query}"

    body = await request.body()
    proxy_request = urllib.request.Request(
        target_url,
        data=body if request.method != "GET" else None,
        method=request.method,
        headers={
            "Content-Type": request.headers.get("content-type", "application/octet-stream"),
            "Accept": request.headers.get("accept", "*/*"),
        },
    )

    try:
        with urllib.request.urlopen(proxy_request, timeout=6) as upstream:
            content = upstream.read()
            content_type = upstream.headers.get("Content-Type", "application/octet-stream")
    except urllib.error.URLError as error:
        return PlainTextResponse(f"AI MIPS simulator proxy is not available: {error}", status_code=502)

    if "text/html" in content_type:
        text = content.decode("utf-8", errors="replace")
        text = text.replace('fetch("/api/', 'fetch("/processors/live/api/')
        text = text.replace("fetch('/api/", "fetch('/processors/live/api/")
        text = text.replace('fetch(`/api/', 'fetch(`/processors/live/api/')
        return HTMLResponse(text)

    return Response(content, media_type=content_type)


async def ai_mips_api_proxy(request):
    await api_open_processors(request)
    target_path = request.path_params.get("path") or ""
    query = request.url.query
    target_url = f"{AI_MIPS_PROXY_BASE}/api/{target_path}"
    if query:
        target_url += f"?{query}"

    body = await request.body()
    proxy_request = urllib.request.Request(
        target_url,
        data=body if request.method != "GET" else None,
        method=request.method,
        headers={
            "Content-Type": request.headers.get("content-type", "application/json"),
            "Accept": request.headers.get("accept", "application/json"),
        },
    )

    try:
        with urllib.request.urlopen(proxy_request, timeout=10) as upstream:
            content = upstream.read()
            content_type = upstream.headers.get("Content-Type", "application/json")
            status = upstream.status
    except urllib.error.HTTPError as error:
        content = error.read() or str(error).encode("utf-8")
        content_type = error.headers.get("Content-Type", "text/plain") if error.headers else "text/plain"
        status = error.code
    except urllib.error.URLError as error:
        return JSONResponse({"ok": False, "error": f"AI MIPS API is not available: {error}"}, status_code=502)

    return Response(content, status_code=status, media_type=content_type)


async def api_colab_capture(request):
    ensure_colab_bridge_dirs()
    backend = request.path_params["backend"].lower()
    if backend not in COLAB_BACKENDS:
        return JSONResponse({"ok": False, "error": "backend must be cpu or gpu"}, status_code=400)

    started = time.perf_counter()
    payload = await request.json()
    image_data = str(payload.get("image_data", ""))
    if "," in image_data:
        _prefix, image_data = image_data.split(",", 1)
    if not image_data:
        return JSONResponse({"ok": False, "error": "missing image_data"}, status_code=400)

    try:
        image_bytes = base64.b64decode(image_data, validate=True)
    except ValueError:
        return JSONResponse({"ok": False, "error": "invalid base64 image_data"}, status_code=400)

    if len(image_bytes) < 128:
        return JSONResponse({"ok": False, "error": "image payload is too small"}, status_code=400)

    capture_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{backend}_{uuid.uuid4().hex[:8]}"
    backend_dir = COLAB_INBOX_DIR / backend
    image_path = backend_dir / f"{capture_id}.png"
    manifest_path = backend_dir / f"{capture_id}.json"
    image_path.write_bytes(image_bytes)

    manifest = {
        "id": capture_id,
        "backend": backend,
        "status": "queued_for_colab",
        "created_at": utc_now_iso(),
        "source": payload.get("source", "honeybird_live_canvas"),
        "channel": payload.get("channel", "live"),
        "image_file": image_path.name,
        "image_path": str(image_path),
        "script": str(COLAB_BRIDGE_DIR / ("colab_cpu_bee_statue.py" if backend == "cpu" else "colab_gpu_bee_statue.py")),
        "note": "Backend is locked by folder and manifest. CPU and GPU queues are separate.",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (COLAB_STATUS_DIR / backend / "latest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    elapsed_s = round(time.perf_counter() - started, 3)
    return JSONResponse(
        {
            "ok": True,
            "backend": backend,
            "capture_id": capture_id,
            "image_path": str(image_path),
            "manifest_path": str(manifest_path),
            "elapsed_s": elapsed_s,
            "message": f"{backend.upper()} Colab queue received screenshot in {elapsed_s:.3f}s",
        }
    )


async def api_colab_status(_request):
    ensure_colab_bridge_dirs()
    result = {"ok": True, "bridge_path": str(COLAB_BRIDGE_DIR), "backends": {}}
    for backend in sorted(COLAB_BACKENDS):
        inbox = COLAB_INBOX_DIR / backend
        manifests = sorted(inbox.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        latest = None
        if manifests:
            latest = json.loads(manifests[0].read_text(encoding="utf-8"))
        latest_result_path = COLAB_STATUS_DIR / backend / "latest_result.json"
        latest_result = None
        if latest_result_path.exists():
            latest_result = json.loads(latest_result_path.read_text(encoding="utf-8"))
        result["backends"][backend] = {
            "queue_path": str(inbox),
            "queued": len(manifests),
            "latest": latest,
            "latest_result": latest_result,
        }
    return JSONResponse(result)


async def board_model(_request):
    if not GLB_PATH.exists():
        return PlainTextResponse("BeeBoard GLB model was not found.", status_code=404)
    return FileResponse(GLB_PATH, media_type="model/gltf-binary", filename=GLB_PATH.name)


async def honeybird_image(request):
    channel = request.path_params["channel"]
    path = HONEYBIRD_CHANNEL_IMAGES.get(channel)
    if path is None or not path.exists():
        return PlainTextResponse("Honeybird channel image was not found.", status_code=404)
    return FileResponse(path, media_type="image/png", filename=path.name)


async def index(_request):
    return HTMLResponse(
        """<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BeeBoard v0.1 Lab</title>
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0B1020;
      --panel: #111827;
      --panel2: #151B2E;
      --ink: #E8EEF7;
      --muted: #9BA7B7;
      --line: #293241;
      --gold: #FBBF24;
      --green: #22C55E;
      --blue: #38BDF8;
      --red: #EF4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
      background: #0B1020;
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .sub { color: var(--muted); font-size: 13px; }
    .tabs {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--line);
      background: #0B1020;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      padding: 9px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button.active { border-color: var(--gold); color: var(--gold); background: #3B2F12; }
    main { padding: 18px 20px 24px; }
    .view { display: none; }
    .view.active { display: block; }
    .grid {
      display: grid;
      grid-template-columns: minmax(260px, 360px) 1fr;
      gap: 16px;
      align-items: start;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    input[type="range"] { width: 100%; }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .value { color: var(--ink); font-variant-numeric: tabular-nums; }
    .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .checks label { display: flex; align-items: center; gap: 8px; }
    .status { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .chip {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 12px;
      color: var(--ink);
      background: var(--panel2);
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-weight: 600; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .metric { background: var(--panel2); border-radius: 6px; padding: 10px; }
    .metric b { display: block; font-size: 18px; margin-top: 4px; }
    .viewer-wrap {
      display: grid;
      grid-template-columns: minmax(640px, 1fr) minmax(240px, 320px);
      gap: 16px;
      min-height: calc(100vh - 160px);
    }
    .viewer-stage {
      position: relative;
      min-height: 620px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #101418;
    }
    model-viewer {
      width: 100%;
      height: calc(100vh - 165px);
      min-height: 620px;
      background: #101418;
      filter: contrast(1.18) saturate(0.86) brightness(1.12);
    }
    .model-title {
      position: absolute;
      left: 18px;
      top: 16px;
      z-index: 4;
      padding: 8px 10px;
      border: 1px solid rgba(244, 201, 93, 0.65);
      border-radius: 6px;
      background: rgba(10, 12, 15, 0.88);
      color: #fff4c7;
      font-weight: 800;
      letter-spacing: 0;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
    }
    button.hotspot {
      display: block;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: var(--hotspot, var(--gold));
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.85), 0 0 18px rgba(244, 201, 93, 0.32);
      transform: translate(-8px, -8px);
      cursor: default;
    }
    button.hotspot::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: var(--leader-width, 62px);
      height: 2px;
      background: rgba(255, 255, 255, 0.88);
      transform: translate(5px, -1px) rotate(var(--leader-angle, 0deg));
      transform-origin: left center;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.8);
    }
    .hotspot-label {
      position: absolute;
      left: var(--label-x, 54px);
      top: var(--label-y, -18px);
      min-width: 96px;
      padding: 5px 8px;
      border: 1px solid rgba(255, 255, 255, 0.78);
      border-left: 4px solid var(--hotspot, var(--gold));
      border-radius: 5px;
      background: rgba(7, 9, 12, 0.94);
      color: #ffffff;
      font-size: 12px;
      font-weight: 850;
      line-height: 1.12;
      text-align: left;
      text-shadow: 0 1px 1px #000;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.62);
      white-space: nowrap;
      pointer-events: none;
    }
    .hotspot-label small {
      display: block;
      margin-top: 2px;
      color: #d5dee8;
      font-size: 10px;
      font-weight: 750;
    }
    .hotspot[slot="hotspot-fpga"] {
      --hotspot: #9b5cff;
      --leader-width: 98px;
      --leader-angle: -12deg;
      --label-x: 104px;
      --label-y: -40px;
      width: 22px;
      height: 22px;
      transform: translate(-11px, -11px);
    }
    .hotspot[slot="hotspot-fpga"]::before {
      content: "U1";
      position: absolute;
      inset: -18px auto auto -9px;
      min-width: 36px;
      padding: 2px 4px;
      border-radius: 4px;
      background: #9b5cff;
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.85);
    }
    .hotspot[slot="hotspot-flash"] { --hotspot: #f28c28; --leader-width: 82px; --leader-angle: -36deg; --label-x: 72px; --label-y: -88px; }
    .hotspot[slot="hotspot-imu"] { --hotspot: #41d884; --leader-width: 70px; --leader-angle: 30deg; --label-x: 62px; --label-y: 28px; }
    .hotspot[slot="hotspot-power"] { --hotspot: #ff7d7d; --leader-width: 88px; --leader-angle: 166deg; --label-x: -180px; --label-y: -24px; }
    .hotspot[slot="hotspot-lifi-tx"] { --hotspot: #ff4a4a; --leader-width: 92px; --leader-angle: -14deg; --label-x: 86px; --label-y: -54px; }
    .hotspot[slot="hotspot-lifi-rx"] { --hotspot: #41d884; --leader-width: 88px; --leader-angle: 12deg; --label-x: 82px; --label-y: 20px; }
    .hotspot[slot="hotspot-drivers"] { --hotspot: #a4b4c5; --leader-width: 88px; --leader-angle: 28deg; --label-x: 78px; --label-y: 34px; }
    .layer-strip {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 16px;
      z-index: 5;
      display: grid;
      grid-template-columns: repeat(4, minmax(90px, 1fr));
      gap: 8px;
    }
    .layer-strip span {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 5px;
      padding: 6px 8px;
      background: rgba(9, 11, 14, 0.86);
      color: #e9eef4;
      font-size: 11px;
      font-weight: 750;
      text-align: center;
    }
    .legend { display: grid; gap: 8px; }
    .legend div {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
      color: var(--muted);
    }
    .legend b { color: var(--ink); }
    .schematic-wrap {
      display: grid;
      grid-template-columns: minmax(720px, 1fr) minmax(240px, 320px);
      gap: 16px;
      align-items: start;
    }
    .schematic-canvas {
      min-height: calc(100vh - 165px);
      overflow: auto;
      background: #0f1419;
      border: 1px solid #2f3b46;
      border-radius: 8px;
      padding: 12px;
    }
    .schematic-svg {
      display: block;
      min-width: 980px;
      width: 100%;
      height: auto;
      background: #f9fbfc;
      border: 1px solid #d1d8df;
      border-radius: 6px;
      box-shadow: 0 18px 42px rgba(0,0,0,0.28);
    }
    .schematic-svg text {
      font-family: Segoe UI, Arial, sans-serif;
      letter-spacing: 0;
      fill: #17202a;
    }
    .schematic-svg .node { fill: #ffffff; stroke: #22303d; stroke-width: 2; }
    .schematic-svg .fpga { fill: #fff4c7; stroke: #6c5200; stroke-width: 3; }
    .schematic-svg .power { fill: #ffe4e4; stroke: #8c2c2c; stroke-width: 2.5; }
    .schematic-svg .sensor { fill: #e2f7eb; stroke: #236c43; stroke-width: 2.2; }
    .schematic-svg .comm { fill: #e5edff; stroke: #2855a8; stroke-width: 2.2; }
    .schematic-svg .act { fill: #edf1f5; stroke: #4d5a66; stroke-width: 2.2; }
    .schematic-svg .rail { stroke: #c73535; stroke-width: 4; fill: none; marker-end: url(#arrow-red); }
    .schematic-svg .signal { stroke: #2855a8; stroke-width: 3; fill: none; marker-end: url(#arrow-blue); }
    .schematic-svg .sense { stroke: #1f7a46; stroke-width: 3; fill: none; marker-end: url(#arrow-green); }
    .schematic-svg .actline { stroke: #5b6570; stroke-width: 3.5; fill: none; marker-end: url(#arrow-gray); }
    .schematic-svg .bus { stroke: #111820; stroke-width: 5; fill: none; }
    .schematic-svg .small { font-size: 13px; font-weight: 650; }
    .schematic-svg .label { font-size: 16px; font-weight: 850; }
    .schematic-svg .tiny { font-size: 11px; font-weight: 650; fill: #3e4b57; }
    .schematic-svg .schem-hit {
      fill: rgba(244, 201, 93, 0.01);
      stroke: transparent;
      stroke-width: 5;
      cursor: pointer;
      pointer-events: all;
    }
    .schematic-svg .schem-hit:hover,
    .schematic-svg .schem-hit.active {
      fill: rgba(244, 201, 93, 0.12);
      stroke: #f4c95d;
    }
    .schematic-svg .schem-hint {
      fill: #5d6b78;
      font-size: 12px;
      font-weight: 750;
    }
    .schematic-notes {
      display: grid;
      gap: 10px;
    }
    .schematic-notes .note {
      border-left: 4px solid var(--gold);
      background: var(--panel2);
      border-radius: 6px;
      padding: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .schematic-notes b {
      display: block;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .schematic-detail {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #151a20;
    }
    .schematic-detail h3 {
      margin: 0 0 6px;
      color: var(--gold);
      font-size: 18px;
    }
    .schematic-detail p {
      margin: 0 0 10px;
      color: #d7dee7;
      font-size: 13px;
      line-height: 1.42;
    }
    .detail-grid {
      display: grid;
      gap: 8px;
    }
    .detail-row {
      border-top: 1px solid var(--line);
      padding-top: 8px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
    }
    .detail-row b {
      display: inline;
      margin: 0 6px 0 0;
      color: var(--ink);
    }
    .detail-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 10px;
    }
    .detail-badges span {
      border: 1px solid #465360;
      border-radius: 999px;
      padding: 4px 7px;
      background: #202832;
      color: #eef3f8;
      font-size: 11px;
      font-weight: 750;
    }
    .soc-project-card {
      margin-top: 10px;
      border: 1px solid #3f5061;
      border-radius: 8px;
      background: #10151b;
      padding: 10px;
    }
    .soc-project-card h4 {
      margin: 0 0 6px;
      color: #c9b7ff;
      font-size: 14px;
    }
    .soc-path {
      word-break: break-all;
      color: #aeb8c4;
      font-family: Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      margin-bottom: 8px;
    }
    .soc-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .soc-actions button {
      padding: 7px 9px;
      font-size: 12px;
      border-color: #5a4db5;
      background: #211a3a;
      color: #eee8ff;
    }
    .soc-files {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      max-height: 160px;
      overflow: auto;
      color: #d7dee7;
      font-family: Consolas, monospace;
      font-size: 11px;
    }
    .soc-files span {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid #27313b;
      padding-bottom: 3px;
    }
    .soc-status {
      color: #9aa6b2;
      font-size: 12px;
      margin-top: 4px;
    }
    .honeybird-grid {
      display: grid;
      grid-template-columns: minmax(260px, 340px) 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .honeybird-hub {
      display: grid;
      place-items: center;
      min-height: 420px;
      background: radial-gradient(circle at 50% 35%, rgba(251, 191, 36, 0.18), transparent 38%), var(--panel);
    }
    .system-hub {
      min-height: calc(100vh - 160px);
      display: grid;
      grid-template-columns: minmax(260px, 360px) 1fr;
      gap: 18px;
      align-items: stretch;
    }
    .system-title {
      display: grid;
      align-content: center;
      gap: 10px;
      min-height: 420px;
    }
    .system-title h2 {
      margin: 0;
      font-size: 30px;
      line-height: 1.08;
    }
    .system-title p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .hex-menu {
      display: grid;
      grid-template-columns: repeat(3, minmax(140px, 1fr));
      gap: 14px;
      align-content: center;
    }
    .hex-tile {
      min-height: 168px;
      clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%);
      border: 0;
      padding: 26px 22px;
      display: grid;
      place-items: center;
      gap: 7px;
      text-align: center;
      background: linear-gradient(145deg, #172033, #101827);
      color: var(--ink);
      box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.26);
    }
    .hex-tile:hover {
      background: linear-gradient(145deg, #2a210d, #172033);
      box-shadow: inset 0 0 0 2px rgba(251, 191, 36, 0.68), 0 18px 42px rgba(251, 191, 36, 0.12);
    }
    .hex-tile b {
      font-size: 17px;
      line-height: 1.15;
    }
    .hex-tile span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.3;
      max-width: 130px;
    }
    .hex-tile.primary {
      background: linear-gradient(145deg, #fbbf24, #f97316);
      color: #111827;
      box-shadow: 0 16px 48px rgba(251, 191, 36, 0.22);
    }
    .hex-tile.primary span {
      color: #412307;
    }
    .hex-launch {
      width: 210px;
      aspect-ratio: 1;
      clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%);
      border: 0;
      background: linear-gradient(145deg, #fbbf24, #f97316);
      color: #111827;
      display: grid;
      place-items: center;
      text-align: center;
      font-weight: 800;
      box-shadow: 0 16px 48px rgba(251, 191, 36, 0.22);
    }
    .hex-launch span {
      display: block;
      font-size: 18px;
      max-width: 128px;
      line-height: 1.15;
    }
    .honeybird-stack {
      display: grid;
      gap: 12px;
    }
    .channel-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .channel-card {
      overflow: hidden;
    }
    .channel-card img {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      display: block;
      border-bottom: 1px solid var(--line);
      background: #070a12;
    }
    .channel-card .channel-body {
      padding: 12px;
      display: grid;
      gap: 5px;
    }
    .channel-card h3 {
      margin: 0;
      font-size: 15px;
    }
    .honeybird-status {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .honeybird-frame {
      width: 100%;
      min-height: 360px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #070a12;
      display: none;
    }
    .honeybird-frame.active {
      display: block;
    }
    .processor-frame {
      width: 100%;
      min-height: calc(100vh - 230px);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101214;
      display: block;
    }
    .processor-lab {
      display: grid;
      grid-template-columns: minmax(300px, 420px) 1fr;
      gap: 16px;
      align-items: start;
    }
    .processor-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .processor-actions .wide { grid-column: 1 / -1; }
    .processor-editor, .matrix-input {
      width: 100%;
      min-height: 220px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #050B16;
      color: var(--ink);
      padding: 10px;
      font: 13px/1.45 Consolas, "Cascadia Mono", monospace;
    }
    .matrix-input { min-height: 120px; }
    .processor-readout {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 10px;
    }
    .register-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(90px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .register-cell {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      background: #0A1322;
      font: 12px/1.35 Consolas, "Cascadia Mono", monospace;
    }
    .code-block {
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #050B16;
      padding: 10px;
      font: 12px/1.45 Consolas, "Cascadia Mono", monospace;
      color: #D8E6FF;
      min-height: 120px;
    }
    .capture-panel {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
    }
    .capture-panel select {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0f1726;
      color: var(--ink);
      padding: 0 10px;
    }
    .capture-panel button[data-backend="cpu"] { border-color: #38bdf8; color: #b9ecff; }
    .capture-panel button[data-backend="gpu"] { border-color: #22c55e; color: #c6ffd8; }
    .capture-preview {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 12px;
      align-items: center;
    }
    .capture-preview img {
      width: 180px;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #070a12;
    }
    .capture-log {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .toast-center {
      position: fixed;
      inset: 0;
      display: none;
      place-items: center;
      z-index: 20;
      background: rgba(5, 8, 14, 0.42);
      backdrop-filter: blur(4px);
    }
    .toast-center.active {
      display: grid;
    }
    .toast-box {
      min-width: min(420px, calc(100vw - 32px));
      border: 1px solid rgba(251, 191, 36, 0.5);
      border-radius: 8px;
      background: #111827;
      color: var(--ink);
      padding: 20px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.38);
      text-align: center;
    }
    .toast-box b {
      display: block;
      font-size: 22px;
      margin-bottom: 6px;
    }
    .toast-box span {
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 900px) {
      .grid, .viewer-wrap, .schematic-wrap, .honeybird-grid, .channel-grid, .system-hub, .processor-lab, .processor-readout { grid-template-columns: 1fr; }
      .register-grid { grid-template-columns: 1fr 1fr; }
      .hex-menu { grid-template-columns: 1fr 1fr; }
      .capture-panel, .capture-preview { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: 1fr 1fr; }
      model-viewer { height: 520px; }
      .viewer-stage { min-height: 520px; }
      .hotspot-label { font-size: 10px; min-width: 74px; }
      .hotspot-label small { font-size: 9px; }
      .layer-strip { grid-template-columns: 1fr 1fr; }
      .schematic-canvas { min-height: 560px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>BeeBoard v0.1 Lab</h1>
      <div class="sub">FPGA robo-bee compact board: power budget, actuator loads, LiFi and 3D board review</div>
    </div>
    <div class="sub" id="health">checking...</div>
  </header>
  <nav class="tabs">
    <button id="mainMenuButton" type="button">Main Menu</button>
    <button class="active" data-tab="measure">Measurements</button>
    <button data-tab="processors">AI MIPS</button>
    <button data-tab="viewer">3D Board Review</button>
    <button data-tab="schematic">Electronic Schematic</button>
  </nav>
  <main>
    <section id="processors" class="view">
      <div class="processor-lab">
        <div class="panel controls">
          <h2 style="margin:0;font-size:18px;">AI MIPS Processor</h2>
          <div class="honeybird-status" id="processorsStatus">processor simulator is not open yet</div>
          <label>Processor ID
            <input id="processorIdInput" type="number" min="0" step="1" value="0">
          </label>
          <label>Run cycles
            <input id="processorCyclesInput" type="number" min="1" step="1" value="16">
          </label>
          <div class="processor-actions">
            <button id="loadProcessorButton" type="button">Load state</button>
            <button id="stepProcessorButton" type="button">Single step</button>
            <button id="runProcessorButton" type="button">Run cycles</button>
            <button id="resetProcessorButton" type="button">Reset P</button>
            <button id="controllerProgramButton" type="button">Controller demo</button>
            <button id="workerProgramButton" type="button">Worker demo</button>
            <button class="wide" id="saveProcessorCodeButton" type="button">Save code to this processor</button>
          </div>
          <label>Machine / assembler words
            <textarea class="processor-editor" id="processorCodeInput" spellcheck="false">addi $t0, $zero, 5
addi $t1, $zero, 7
add $t2, $t0, $t1
sw $t2, 0($zero)
nop</textarea>
          </label>
          <div class="processor-actions">
            <button class="wide" id="loadProcessorCodeButton" type="button">Reload code from processor</button>
          </div>
        </div>
        <div class="panel">
          <div class="processor-readout" id="processorReadout"></div>
          <div class="register-grid" id="processorRegisters"></div>
          <h3 style="margin:16px 0 8px;font-size:15px;">Trace</h3>
          <div class="code-block" id="processorTrace">No trace yet.</div>
          <h3 style="margin:16px 0 8px;font-size:15px;">Matrix multiply on AI MIPS cluster</h3>
          <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">
            <label>Matrix A
              <textarea class="matrix-input" id="matrixAInput" spellcheck="false">1 2
3 4</textarea>
            </label>
            <label>Matrix B
              <textarea class="matrix-input" id="matrixBInput" spellcheck="false">5 6
7 8</textarea>
            </label>
          </div>
          <div class="processor-actions" style="max-width:420px;">
            <button id="planMatrixButton" type="button">Plan matrix tasks</button>
            <button id="runMatrixCpuButton" type="button">Run CPU batch</button>
          </div>
          <div class="code-block" id="matrixResult">Matrix result will appear here.</div>
        </div>
      </div>
    </section>
    <section id="measure" class="view active">
      <div class="grid">
        <div class="panel controls">
          <label>Supercap voltage <span class="row"><input id="supercap_voltage" type="range" min="2.0" max="5.0" step="0.05" value="3.8"><span class="value" data-value="supercap_voltage"></span></span></label>
          <label>Supercap ESR <span class="row"><input id="supercap_esr_ohm" type="range" min="0.02" max="1.0" step="0.01" value="0.18"><span class="value" data-value="supercap_esr_ohm"></span></span></label>
          <label>Bio input voltage <span class="row"><input id="bio_input_voltage" type="range" min="0" max="1.5" step="0.01" value="0.55"><span class="value" data-value="bio_input_voltage"></span></span></label>
          <label>Bio input current mA <span class="row"><input id="bio_input_current_ma" type="range" min="0" max="40" step="0.5" value="8"><span class="value" data-value="bio_input_current_ma"></span></span></label>
          <label>FPGA activity <span class="row"><input id="fpga_activity" type="range" min="0" max="1" step="0.01" value="0.45"><span class="value" data-value="fpga_activity"></span></span></label>
          <label>LiFi TX duty <span class="row"><input id="lifi_tx_duty" type="range" min="0" max="1" step="0.01" value="0.08"><span class="value" data-value="lifi_tx_duty"></span></span></label>
          <label>IMU rate Hz <span class="row"><input id="imu_rate_hz" type="range" min="50" max="1600" step="50" value="200"><span class="value" data-value="imu_rate_hz"></span></span></label>
          <label>Wing driver current mA <span class="row"><input id="wing_driver_current_ma" type="range" min="0" max="120" step="1" value="24"><span class="value" data-value="wing_driver_current_ma"></span></span></label>
          <label>Spring driver current mA <span class="row"><input id="spring_driver_current_ma" type="range" min="0" max="180" step="1" value="0"><span class="value" data-value="spring_driver_current_ma"></span></span></label>
          <label>Drill/cutter current mA <span class="row"><input id="drill_driver_current_ma" type="range" min="0" max="180" step="1" value="0"><span class="value" data-value="drill_driver_current_ma"></span></span></label>
          <div class="checks">
            <label><input id="camera_enabled" type="checkbox"> Camera/spectral</label>
            <label><input id="dash_requested" type="checkbox"> DASH request</label>
          </div>
        </div>
        <div class="panel">
          <div class="status" id="status"></div>
          <div class="metrics" id="metrics"></div>
          <table>
            <thead><tr><th>Rail / source</th><th>Voltage</th><th>Current</th><th>Power</th></tr></thead>
            <tbody id="rails"></tbody>
          </table>
        </div>
      </div>
    </section>
    <section id="viewer" class="view">
      <div class="viewer-wrap">
        <div class="viewer-stage">
          <div class="model-title">BeeBoard v0.1 - 20 x 12 mm</div>
          <model-viewer
            src="/board/BeeBoard_v0_1_Micro.glb?v=u1-compact-v4"
            camera-controls
            camera-orbit="-34deg 63deg 118%"
            field-of-view="24deg"
            min-camera-orbit="auto auto 85%"
            max-camera-orbit="auto auto 220%"
            shadow-intensity="0.28"
            shadow-softness="0.9"
            exposure="1.12"
            environment-image="neutral"
            interaction-prompt="none">
            <button class="hotspot" slot="hotspot-fpga" data-position="0.0102m 0.0025m 0.0062m" data-normal="0m 1m 0m">
              <span class="hotspot-label">U1 FPGA chip<small>logic IP inside, package on PCB</small></span>
            </button>
            <button class="hotspot" slot="hotspot-flash" data-position="0.0054m 0.0020m 0.0036m" data-normal="0m 1m 0m">
              <span class="hotspot-label">U2 Flash<small>FPGA boot memory</small></span>
            </button>
            <button class="hotspot" slot="hotspot-imu" data-position="0.0098m 0.0019m 0.0016m" data-normal="0m 1m 0m">
              <span class="hotspot-label">U3 IMU<small>gyro + accel center</small></span>
            </button>
            <button class="hotspot" slot="hotspot-power" data-position="0.0028m 0.0020m 0.0062m" data-normal="0m 1m 0m">
              <span class="hotspot-label">U4 Power<small>bio + supercap manager</small></span>
            </button>
            <button class="hotspot" slot="hotspot-lifi-tx" data-position="0.01915m 0.0018m 0.0068m" data-normal="0m 1m 0m">
              <span class="hotspot-label">D1 LiFi TX<small>microLED output</small></span>
            </button>
            <button class="hotspot" slot="hotspot-lifi-rx" data-position="0.01915m 0.0018m 0.0037m" data-normal="0m 1m 0m">
              <span class="hotspot-label">D2 LiFi RX<small>photodiode input</small></span>
            </button>
            <button class="hotspot" slot="hotspot-drivers" data-position="0.0148m -0.0011m 0.0089m" data-normal="0m -1m 0m">
              <span class="hotspot-label">U9-U12 Drivers<small>wings, dash, drill</small></span>
            </button>
          </model-viewer>
          <div class="layer-strip">
            <span>F.Cu components</span>
            <span>In1 GND shield</span>
            <span>In2 PWR islands</span>
            <span>B.Cu actuators</span>
          </div>
        </div>
        <div class="panel">
          <h2 style="margin:0 0 12px;font-size:18px;">Layer / block map</h2>
          <div class="legend">
            <div><span>U1 FPGA package</span><b>violet chip on PCB</b></div>
            <div><span>LiFi LED + photodiode</span><b>optical comms</b></div>
            <div><span>Supercap connector</span><b>electric buffer</b></div>
            <div><span>Bio input</span><b>slow harvester</b></div>
            <div><span>Spring sensor/driver</span><b>burst energy</b></div>
            <div><span>IMU + wing sensors</span><b>stabilization</b></div>
            <div><span>Drivers</span><b>wings, drill, dash</b></div>
            <div><span>Debug connector</span><b>bring-up</b></div>
          </div>
          <p class="sub">Physical parts like U2 Flash, U3 IMU and U4 PMIC are separate packages on the PCB. Only logic IP blocks such as AI/Crypto/Motion live inside U1 FPGA.</p>
        </div>
      </div>
    </section>
    <div class="toast-center" id="centerToast">
      <div class="toast-box">
        <b id="toastTitle">Sending...</b>
        <span id="toastDetail">0.0 s</span>
      </div>
    </div>
    <section id="schematic" class="view">
      <div class="schematic-wrap">
        <div class="schematic-canvas">
          <svg class="schematic-svg" viewBox="0 0 1120 720" role="img" aria-label="BeeBoard v0.1 electronic schematic">
            <defs>
              <marker id="arrow-red" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#c73535"/></marker>
              <marker id="arrow-blue" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#2855a8"/></marker>
              <marker id="arrow-green" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#1f7a46"/></marker>
              <marker id="arrow-gray" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#5b6570"/></marker>
            </defs>

            <text x="34" y="38" class="label">BeeBoard v0.1 Electronic Schematic</text>
            <text x="34" y="60" class="tiny">Click any block to inspect its function, inputs and outputs</text>

            <rect x="430" y="180" width="250" height="260" rx="10" class="fpga"/>
            <text x="555" y="212" text-anchor="middle" class="label">U1 FPGA package</text>
            <text x="555" y="232" text-anchor="middle" class="tiny">internal logic IP only</text>
            <text x="555" y="254" text-anchor="middle" class="small">AI MIPS Core</text>
            <text x="555" y="278" text-anchor="middle" class="small">MatrixAccel + ReLU</text>
            <text x="555" y="302" text-anchor="middle" class="small">Crypto Communication</text>
            <text x="555" y="326" text-anchor="middle" class="small">Power Control Unit</text>
            <text x="555" y="350" text-anchor="middle" class="small">Motion Control Unit</text>
            <text x="555" y="374" text-anchor="middle" class="small">LiFi Controller</text>
            <text x="555" y="398" text-anchor="middle" class="small">Sensor + Memory IF</text>
            <circle cx="555" cy="310" r="9" fill="#f4c95d" stroke="#111820" stroke-width="2"/>
            <text x="578" y="315" class="tiny">FPGA anchor point</text>

            <rect x="52" y="120" width="160" height="68" rx="8" class="power"/>
            <text x="132" y="148" text-anchor="middle" class="label">J Bio Input</text>
            <text x="132" y="170" text-anchor="middle" class="tiny">0.2-1.5V harvester</text>
            <rect x="52" y="228" width="160" height="68" rx="8" class="power"/>
            <text x="132" y="256" text-anchor="middle" class="label">J Supercap</text>
            <text x="132" y="278" text-anchor="middle" class="tiny">main energy buffer</text>
            <rect x="260" y="174" width="170" height="96" rx="8" class="power"/>
            <text x="345" y="208" text-anchor="middle" class="label">U4 PMIC</text>
            <text x="345" y="232" text-anchor="middle" class="small">harvest + charge</text>
            <text x="345" y="254" text-anchor="middle" class="tiny">supercap manager</text>

            <rect x="250" y="342" width="120" height="58" rx="8" class="power"/>
            <text x="310" y="366" text-anchor="middle" class="label">U5 1V2</text>
            <text x="310" y="386" text-anchor="middle" class="tiny">FPGA core</text>
            <rect x="250" y="430" width="120" height="58" rx="8" class="power"/>
            <text x="310" y="454" text-anchor="middle" class="label">U6 3V3</text>
            <text x="310" y="474" text-anchor="middle" class="tiny">IO + sensors</text>

            <path d="M212 154 H260" class="rail"/>
            <path d="M212 262 H238 V240 H260" class="rail"/>
            <path d="M345 270 V342" class="rail"/>
            <path d="M370 371 H430" class="rail"/>
            <path d="M370 459 H430" class="rail"/>
            <text x="385" y="354" class="tiny">1.2V rail</text>
            <text x="385" y="444" class="tiny">3.3V rail</text>

            <rect x="742" y="94" width="150" height="64" rx="8" class="node"/>
            <text x="817" y="120" text-anchor="middle" class="label">U2 Flash</text>
            <text x="817" y="141" text-anchor="middle" class="tiny">SPI config</text>
            <path d="M680 216 C720 170 730 130 742 126" class="signal"/>

            <rect x="742" y="202" width="150" height="64" rx="8" class="sensor"/>
            <text x="817" y="228" text-anchor="middle" class="label">U3 IMU</text>
            <text x="817" y="249" text-anchor="middle" class="tiny">gyro + accel</text>
            <path d="M742 234 H680" class="sense"/>

            <rect x="742" y="312" width="156" height="70" rx="8" class="comm"/>
            <text x="820" y="338" text-anchor="middle" class="label">U7 LiFi RX</text>
            <text x="820" y="360" text-anchor="middle" class="tiny">photodiode AFE</text>
            <rect x="944" y="312" width="118" height="70" rx="8" class="comm"/>
            <text x="1003" y="338" text-anchor="middle" class="label">D2 RX</text>
            <text x="1003" y="360" text-anchor="middle" class="tiny">photodiode</text>
            <path d="M944 347 H898" class="sense"/>
            <path d="M742 347 H680" class="signal"/>

            <rect x="742" y="428" width="156" height="70" rx="8" class="comm"/>
            <text x="820" y="454" text-anchor="middle" class="label">U8 LiFi TX</text>
            <text x="820" y="476" text-anchor="middle" class="tiny">LED current switch</text>
            <rect x="944" y="428" width="118" height="70" rx="8" class="comm"/>
            <text x="1003" y="454" text-anchor="middle" class="label">D1 TX</text>
            <text x="1003" y="476" text-anchor="middle" class="tiny">microLED</text>
            <path d="M680 392 C720 420 730 462 742 463" class="signal"/>
            <path d="M898 463 H944" class="rail"/>

            <rect x="742" y="560" width="190" height="80" rx="8" class="act"/>
            <text x="837" y="592" text-anchor="middle" class="label">U9-U12 Drivers</text>
            <text x="837" y="616" text-anchor="middle" class="tiny">wing, spring, drill/cutter</text>
            <path d="M680 410 C720 500 720 590 742 600" class="actline"/>
            <rect x="972" y="552" width="70" height="38" rx="6" class="act"/>
            <text x="1007" y="576" text-anchor="middle" class="tiny">Wings</text>
            <rect x="972" y="604" width="70" height="38" rx="6" class="act"/>
            <text x="1007" y="628" text-anchor="middle" class="tiny">Dash</text>
            <path d="M932 584 H972" class="actline"/>
            <path d="M932 616 H972" class="actline"/>

            <rect x="60" y="548" width="168" height="70" rx="8" class="sensor"/>
            <text x="144" y="574" text-anchor="middle" class="label">J Spring Sensor</text>
            <text x="144" y="596" text-anchor="middle" class="tiny">spring charge level</text>
            <path d="M228 583 C300 548 390 420 430 374" class="sense"/>

            <rect x="262" y="560" width="150" height="70" rx="8" class="sensor"/>
            <text x="337" y="586" text-anchor="middle" class="label">J Camera</text>
            <text x="337" y="608" text-anchor="middle" class="tiny">spectral sensor flex</text>
            <path d="M412 595 C430 540 450 470 474 440" class="signal"/>

            <rect x="456" y="552" width="150" height="58" rx="8" class="node"/>
            <text x="531" y="576" text-anchor="middle" class="label">J Debug</text>
            <text x="531" y="596" text-anchor="middle" class="tiny">SWD/JTAG/UART</text>
            <path d="M531 552 V440" class="signal"/>

            <path d="M122 665 H1012" class="bus"/>
            <text x="130" y="690" class="tiny">Common GND reference: In1.GND shield plane</text>
            <text x="750" y="62" class="schem-hint">outside U1 = physical packages on PCB; inside U1 = FPGA logic</text>

            <rect class="schem-hit active" data-key="fpga" x="430" y="180" width="250" height="260" rx="10"/>
            <rect class="schem-hit" data-key="bio" x="52" y="120" width="160" height="68" rx="8"/>
            <rect class="schem-hit" data-key="supercap" x="52" y="228" width="160" height="68" rx="8"/>
            <rect class="schem-hit" data-key="pmic" x="260" y="174" width="170" height="96" rx="8"/>
            <rect class="schem-hit" data-key="reg1v2" x="250" y="342" width="120" height="58" rx="8"/>
            <rect class="schem-hit" data-key="reg3v3" x="250" y="430" width="120" height="58" rx="8"/>
            <rect class="schem-hit" data-key="flash" x="742" y="94" width="150" height="64" rx="8"/>
            <rect class="schem-hit" data-key="imu" x="742" y="202" width="150" height="64" rx="8"/>
            <rect class="schem-hit" data-key="lifi-rx" x="742" y="312" width="320" height="70" rx="8"/>
            <rect class="schem-hit" data-key="lifi-tx" x="742" y="428" width="320" height="70" rx="8"/>
            <rect class="schem-hit" data-key="drivers" x="742" y="552" width="300" height="90" rx="8"/>
            <rect class="schem-hit" data-key="spring" x="60" y="548" width="168" height="70" rx="8"/>
            <rect class="schem-hit" data-key="camera" x="262" y="560" width="150" height="70" rx="8"/>
            <rect class="schem-hit" data-key="debug" x="456" y="552" width="150" height="58" rx="8"/>
          </svg>
        </div>
        <div class="panel schematic-notes">
          <h2 style="margin:0;font-size:18px;">Schematic map</h2>
          <div class="schematic-detail" id="schematicDetail">
            <h3>U1 FPGA package</h3>
            <p>Physical FPGA chip on the PCB. Only internal logic IP lives inside it; Flash, IMU, PMIC, LiFi and drivers are separate packages around it.</p>
            <div class="detail-badges"><span>AI MIPS</span><span>Crypto</span><span>Motion</span><span>Power</span></div>
            <div class="detail-grid">
              <div class="detail-row"><b>Inputs</b>IMU, spring sensor, LiFi RX, camera/spectral connector, debug.</div>
              <div class="detail-row"><b>Outputs</b>LiFi TX control, actuator commands, power-state limits.</div>
              <div class="detail-row"><b>Why</b>Keeps high-speed decisions and reflex loops on-chip for the future ASIC migration.</div>
            </div>
          </div>
          <div class="note"><b>Power path</b>Bio input and supercap feed U4 PMIC, then 1V2/3V3 regulators feed U1 and peripherals.</div>
          <div class="note"><b>FPGA boundary</b>AI, crypto, LiFi protocol, motion and power controllers stay inside U1 for ASIC migration.</div>
          <div class="note"><b>Optical path</b>D2/U7 feed LiFi RX into FPGA crypto; FPGA drives U8/D1 for LiFi TX.</div>
          <div class="note"><b>Motion path</b>U3 IMU and spring sensor enter FPGA; FPGA commands U9-U12 drivers.</div>
        </div>
      </div>
    </section>
  </main>
  <script>
    const fields = ["supercap_voltage","supercap_esr_ohm","bio_input_voltage","bio_input_current_ma","fpga_activity","lifi_tx_duty","imu_rate_hz","wing_driver_current_ma","spring_driver_current_ma","drill_driver_current_ma"];
    const checks = ["camera_enabled","dash_requested"];
    const $ = (id) => document.getElementById(id);

    function activateTab(tabId) {
      const button = document.querySelector(`.tabs button[data-tab="${tabId}"]`);
      if (!button || !$(tabId)) return;
        document.querySelectorAll(".tabs button[data-tab]").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
        button.classList.add("active");
      $(tabId).classList.add("active");
    }

    function hiveReturnUrl() {
      const params = new URLSearchParams(window.location.search);
      return params.get("hive") || "http://127.0.0.1:8876/?fresh=hive-main";
    }

    function openMainMenu() {
      const win = window.open(hiveReturnUrl(), "ai-mips-hive-main");
      if (win) win.focus();
      setTimeout(() => window.close(), 250);
    }

    $("mainMenuButton")?.addEventListener("click", openMainMenu);

    document.querySelectorAll(".tabs button[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab);
        history.replaceState(null, "", `#${button.dataset.tab}`);
      });
    });

    document.querySelectorAll(".hex-tile").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = button.dataset.go;
        if (target === "processors") {
          activateTab("processors");
          history.replaceState(null, "", "#processors");
          await openProcessors();
          return;
        }
        if (target === "honeybird" || target === "honeybird-colab" || target === "physical" || target === "control") {
          activateTab("measure");
          history.replaceState(null, "", "#measure");
          return;
        }
        if (target === "beesoc") {
          activateTab("schematic");
          history.replaceState(null, "", "#schematic");
          renderSchematicDetail("fpga");
          await openSocProject();
          return;
        }
        activateTab(target);
        history.replaceState(null, "", `#${target}`);
      });
    });

    async function routeSystemTarget(target) {
      if (target === "processors" || target === "network" || target === "core") {
        activateTab("processors");
        history.replaceState(null, "", "#processors");
        await openProcessors();
        return;
      }
      if (target === "honeybird" || target === "physical" || target === "control" || target === "honeybird-colab") {
        activateTab("measure");
        history.replaceState(null, "", "#measure");
        return;
      }
      if (target === "viewer" || target === "board") {
        activateTab("viewer");
        history.replaceState(null, "", "#viewer");
        return;
      }
      if (target === "schematic" || target === "electronics" || target === "bio") {
        activateTab("schematic");
        history.replaceState(null, "", "#schematic");
        renderSchematicDetail(target === "bio" ? "bio" : "fpga");
        return;
      }
      activateTab("measure");
      history.replaceState(null, "", "#measure");
    }

    window.addEventListener("message", (event) => {
      const target = event.data?.beeBoardGo;
      if (typeof target === "string") {
        routeSystemTarget(target);
      }
    });

    function processorId() {
      return Math.max(0, Number.parseInt($("processorIdInput")?.value || "0", 10) || 0);
    }

    function processorCycles() {
      return Math.max(1, Number.parseInt($("processorCyclesInput")?.value || "16", 10) || 16);
    }

    async function aiMips(path, options = {}) {
      const response = await fetch(`/api/ai-mips/${path}`, options);
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || `AI MIPS request failed (${response.status})`);
      return data;
    }

    const REG = Object.fromEntries([
      ["zero",0],["0",0],["at",1],["v0",2],["v1",3],["a0",4],["a1",5],["a2",6],["a3",7],
      ["t0",8],["t1",9],["t2",10],["t3",11],["t4",12],["t5",13],["t6",14],["t7",15],
      ["s0",16],["s1",17],["s2",18],["s3",19],["s4",20],["s5",21],["s6",22],["s7",23],
      ["t8",24],["t9",25],["k0",26],["k1",27],["gp",28],["sp",29],["fp",30],["s8",30],["ra",31]
    ]);

    function regId(token) {
      const key = String(token || "").trim().replace(/^[$]/, "").toLowerCase();
      if (!(key in REG)) throw new Error(`Unknown register: ${token}`);
      return REG[key];
    }

    function immValue(token) {
      const text = String(token || "").trim();
      return Number(text.startsWith("0x") || text.startsWith("-0x") ? BigInt(text) : Number.parseInt(text, 10));
    }

    function wordHex(value) {
      return (value >>> 0).toString(16).toUpperCase().padStart(8, "0");
    }

    function assembleLine(line) {
      const clean = line.replace(/[#;].*$/, "").replace(/[/][/].*$/, "").trim();
      if (!clean) return "";
      if (/^(0x)?[0-9a-fA-F]{8}$/.test(clean)) return clean.replace(/^0x/i, "").toUpperCase();
      const parts = clean.replace(/[(),]/g, " ").replace(/  +/g, " ").split(" ").filter(Boolean);
      const op = parts.shift().toLowerCase();
      const r = (rs, rt, rd, funct) => wordHex((regId(rs) << 21) | (regId(rt) << 16) | (regId(rd) << 11) | funct);
      const i = (opcode, rs, rt, imm) => wordHex((opcode << 26) | (regId(rs) << 21) | (regId(rt) << 16) | (immValue(imm) & 0xFFFF));
      if (op === "nop") return "00000000";
      if (op === "add") return r(parts[1], parts[2], parts[0], 0x20);
      if (op === "sub") return r(parts[1], parts[2], parts[0], 0x22);
      if (op === "and") return r(parts[1], parts[2], parts[0], 0x24);
      if (op === "or") return r(parts[1], parts[2], parts[0], 0x25);
      if (op === "slt") return r(parts[1], parts[2], parts[0], 0x2A);
      if (op === "mul") return r(parts[1], parts[2], parts[0], 0x1C);
      if (op === "addi") return i(0x08, parts[1], parts[0], parts[2]);
      if (op === "ori") return i(0x0D, parts[1], parts[0], parts[2]);
      if (op === "lui") return wordHex((0x0F << 26) | (regId(parts[0]) << 16) | (immValue(parts[1]) & 0xFFFF));
      if (op === "lw") return i(0x23, parts[2], parts[0], parts[1]);
      if (op === "sw") return i(0x2B, parts[2], parts[0], parts[1]);
      if (op === "beq") return i(0x04, parts[0], parts[1], parts[2]);
      if (op === "j") return wordHex((0x02 << 26) | ((immValue(parts[0]) >>> 2) & 0x03FFFFFF));
      throw new Error(`Unsupported instruction: ${line}`);
    }

    function normalizeProcessorSource(source) {
      return String(source || "").replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10)).map(assembleLine).filter(Boolean).join(String.fromCharCode(10));
    }

    function renderProcessorState(data) {
      const summary = data.summary || data.state || {};
      $("processorReadout").innerHTML = [
        ["Processor", `P${data.index ?? processorId()}`],
        ["PC", summary.pc || "0x00000000"],
        ["Cycle", summary.cycle ?? 0],
        ["Halted", summary.halted ? "yes" : "no"],
      ].map(([label, value]) => `<div class="metric"><span>${label}</span><b>${value}</b></div>`).join("");
      const regs = summary.regs || {};
      $("processorRegisters").innerHTML = Object.keys(regs).length
        ? Object.entries(regs).map(([name, value]) => `<div class="register-cell"><b>${name}</b><br>${value}</div>`).join("")
        : `<div class="register-cell">registers are zero</div>`;
      const trace = data.trace || (data.entry ? [data.entry] : []);
      $("processorTrace").textContent = trace.length ? JSON.stringify(trace, null, 2) : "No trace yet.";
      $("processorsStatus").textContent = `P${data.index ?? processorId()} ready.`;
    }

    async function loadProcessorState() {
      const data = await aiMips(`sim?id=${processorId()}`);
      renderProcessorState(data);
    }

    async function loadProcessorCode() {
      const data = await aiMips(`code?id=${processorId()}`);
      $("processorCodeInput").value = data.code || "";
      $("processorsStatus").textContent = `Loaded code from P${data.index}.`;
    }

    async function saveProcessorCode() {
      const code = normalizeProcessorSource($("processorCodeInput").value);
      $("processorCodeInput").value = code;
      const data = await aiMips(`code?id=${processorId()}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({code}),
      });
      $("processorsStatus").textContent = `Saved code to P${data.index}.`;
      await loadProcessorState();
    }

    async function openProcessors() {
      const statusEl = $("processorsStatus");
      if (statusEl) statusEl.textContent = "Opening AI MIPS processor API...";
      try {
        const data = await fetch("/api/open-processors").then((r) => r.json());
        if (!data.ok) throw new Error(data.error || "failed to launch AI MIPS");
        if (statusEl) statusEl.textContent = data.already_open ? `AI MIPS API already open. PID ${data.pid}` : `AI MIPS API launched. PID ${data.pid}`;
        await loadProcessorState();
        await loadProcessorCode();
      } catch (error) {
        if (statusEl) statusEl.textContent = `Failed: ${error.message || error}`;
      }
    }

    async function loadProcessors() {
      await openProcessors();
    }

    async function runProcessorAction(action) {
      if (action === "step") {
        renderProcessorState(await aiMips(`step-selected?id=${processorId()}`, {method: "POST"}));
        return;
      }
      if (action === "run") {
        renderProcessorState(await aiMips(`run-selected?id=${processorId()}&cycles=${processorCycles()}`, {method: "POST"}));
        return;
      }
      if (action === "reset") {
        renderProcessorState(await aiMips(`reset-selected?id=${processorId()}`, {method: "POST"}));
      }
    }

    async function loadDemoProgram(kind) {
      const data = await aiMips(`demo-program?id=${processorId()}&kind=${encodeURIComponent(kind)}`, {method: "POST"});
      $("processorCodeInput").value = data.code || "";
      $("processorsStatus").textContent = `${kind} program loaded into P${data.index}.`;
      await loadProcessorState();
    }

    async function planMatrix() {
      const data = await aiMips("plan-matrix", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({a: $("matrixAInput").value, b: $("matrixBInput").value}),
      });
      $("matrixResult").textContent = JSON.stringify(data.plan, null, 2);
    }

    async function runMatrixCpu() {
      await planMatrix();
      const data = await aiMips(`run-cluster-cpu?cycles=${processorCycles()}`, {method: "POST"});
      $("matrixResult").textContent += `\n\nCPU batch summaries:\n${JSON.stringify(data.summaries, null, 2)}`;
      await loadProcessorState();
    }

    const schematicInfo = {
      fpga: {
        title: "U1 FPGA package",
        text: "Physical FPGA chip on the PCB. Only internal logic IP lives inside it; Flash, IMU, PMIC, LiFi and drivers are separate packages around it.",
        tags: ["AI MIPS", "Crypto", "Motion", "Power"],
        inputs: "IMU, spring sensor, LiFi RX, camera/spectral connector, debug.",
        outputs: "LiFi TX control, actuator commands, power-state limits.",
        why: "Keeps high-speed decisions and reflex loops on-chip for the future ASIC migration."
      },
      bio: {
        title: "J Bio Input",
        text: "Slow energy source from bio/plastic/organic harvester experiments.",
        tags: ["harvester", "low current", "energy input"],
        inputs: "Bio reactor or plastic-fuel harvesting module.",
        outputs: "Raw low-voltage power into U4 PMIC.",
        why: "Provides trickle energy when the supercapacitor needs to recharge."
      },
      supercap: {
        title: "J Supercap",
        text: "Main electrical buffer for flight electronics and short actuator bursts.",
        tags: ["energy buffer", "burst current", "raw bus"],
        inputs: "Charge path from U4 PMIC.",
        outputs: "Raw supply for regulators and actuator bus.",
        why: "Keeps the board alive when the bio source cannot provide instant power."
      },
      pmic: {
        title: "U4 PMIC",
        text: "Energy harvesting and supercapacitor management block.",
        tags: ["charge", "protect", "measure"],
        inputs: "Bio input, supercap voltage sense, FPGA power-control policy.",
        outputs: "Managed raw supply and energy telemetry.",
        why: "Prevents brownout and lets the FPGA enter LOW_POWER or SURVIVAL_MODE."
      },
      reg1v2: {
        title: "U5 1.2V regulator",
        text: "Low-voltage core rail for the FPGA fabric.",
        tags: ["1.2V", "FPGA core", "buck/LDO"],
        inputs: "Managed raw power from supercap/PMIC.",
        outputs: "Stable 1.2V FPGA core rail.",
        why: "FPGA internal logic needs a clean low-voltage rail."
      },
      reg3v3: {
        title: "U6 3.3V regulator",
        text: "Peripheral and IO rail for sensors, Flash and LiFi analog blocks.",
        tags: ["3.3V", "IO", "sensors"],
        inputs: "Managed raw power from supercap/PMIC.",
        outputs: "3.3V rail for Flash, IMU, LiFi and debug IO.",
        why: "Separates noisy actuator/raw power from sensitive IO and sensors."
      },
      flash: {
        title: "U2 Flash",
        text: "Configuration memory that loads the FPGA image on boot.",
        tags: ["SPI", "boot", "bitstream"],
        inputs: "SPI clock/control from FPGA.",
        outputs: "FPGA configuration bitstream.",
        why: "The FPGA needs nonvolatile memory before it can behave like BeeSoC."
      },
      imu: {
        title: "U3 IMU",
        text: "Gyroscope and accelerometer for stabilization and body motion.",
        tags: ["gyro", "accel", "flight"],
        inputs: "3.3V rail and physical motion.",
        outputs: "Motion data into the FPGA Sensor Interface.",
        why: "Motion Control Unit needs fast feedback; AI MIPS should not directly drive wings."
      },
      "lifi-rx": {
        title: "D2 + U7 LiFi RX",
        text: "Optical receive chain: photodiode and analog front-end.",
        tags: ["photodiode", "AFE", "Crypto RX"],
        inputs: "Incoming optical pulses from swarm neighbors.",
        outputs: "Recovered packet stream into FPGA crypto module.",
        why: "Lets the board receive authenticated swarm commands without RF hardware."
      },
      "lifi-tx": {
        title: "U8 + D1 LiFi TX",
        text: "Optical transmit chain: LED current switch and microLED.",
        tags: ["microLED", "packet TX", "optical"],
        inputs: "Encrypted outgoing packets from FPGA LiFi Controller.",
        outputs: "Light pulses to nearby agents.",
        why: "Keeps communication small, directional and ASIC-portable."
      },
      drivers: {
        title: "U9-U12 actuator drivers",
        text: "Low-voltage output stages for wings, spring release and drill/cutter placeholder.",
        tags: ["wings", "dash", "drill"],
        inputs: "Motion-control commands from FPGA.",
        outputs: "Current to actuators and release mechanisms.",
        why: "Power switching stays outside the FPGA while control logic stays inside it."
      },
      spring: {
        title: "J Spring Sensor",
        text: "Connector for mechanical burst-energy state sensing.",
        tags: ["spring", "dash", "sense"],
        inputs: "Mechanical spring charge sensor.",
        outputs: "spring_charge_level into Power/Motion Control.",
        why: "Prevents DASH/DRILL actions when mechanical energy is not ready."
      },
      camera: {
        title: "J Camera / Spectral",
        text: "Optional flex connector for camera or spectral sensor.",
        tags: ["vision", "scan", "sensor"],
        inputs: "Image/spectral module data.",
        outputs: "Sensor stream into FPGA interface.",
        why: "Supports SCAN and FIND_PLASTIC behaviors during prototyping."
      },
      debug: {
        title: "J Debug",
        text: "Bring-up connector for programming, logs and emergency recovery.",
        tags: ["JTAG/SWD", "UART", "bring-up"],
        inputs: "External programmer/debugger.",
        outputs: "Programming and diagnostics access.",
        why: "Necessary while the design is FPGA-based and still being validated."
      }
    };

    function renderSchematicDetail(key) {
      const info = schematicInfo[key] || schematicInfo.fpga;
      const socProjectHtml = key === "fpga" ? `
        <div class="soc-project-card">
          <h4>Linked SoC Project</h4>
          <div class="soc-path" id="socProjectPath">loading project...</div>
          <div class="soc-actions">
            <button id="openSocProjectButton" type="button">Open SoC interactive map</button>
            <button id="refreshSocProjectButton" type="button">Refresh file list</button>
          </div>
          <div class="soc-files" id="socProjectFiles"></div>
          <div class="soc-status" id="socOpenStatus">Click FPGA to open the SoC project window.</div>
        </div>
      ` : "";
      $("schematicDetail").innerHTML = `
        <h3>${info.title}</h3>
        <p>${info.text}</p>
        <div class="detail-badges">${info.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <div class="detail-grid">
          <div class="detail-row"><b>Inputs</b>${info.inputs}</div>
          <div class="detail-row"><b>Outputs</b>${info.outputs}</div>
          <div class="detail-row"><b>Why</b>${info.why}</div>
        </div>
        ${socProjectHtml}
      `;
      document.querySelectorAll(".schem-hit").forEach((hit) => hit.classList.toggle("active", hit.dataset.key === key));
      if (key === "fpga") {
        loadSocProject();
        $("openSocProjectButton")?.addEventListener("click", openSocProject);
        $("refreshSocProjectButton")?.addEventListener("click", loadSocProject);
      }
    }

    async function loadSocProject() {
      const pathEl = $("socProjectPath");
      const filesEl = $("socProjectFiles");
      if (!pathEl || !filesEl) return;
      try {
        const data = await fetch("/api/soc-project").then((r) => r.json());
        pathEl.textContent = data.project_path;
        filesEl.innerHTML = data.files.map((file) => `
          <span><b>${file.name}</b><em>${file.exists ? `${file.size} B` : "missing"}</em></span>
        `).join("");
      } catch (error) {
        pathEl.textContent = "Failed to load SoC project metadata.";
        filesEl.innerHTML = "";
      }
    }

    async function openSocProject() {
      const statusEl = $("socOpenStatus");
      if (statusEl) statusEl.textContent = "Opening SoC interactive map...";
      try {
        const data = await fetch("/api/open-soc-project").then((r) => r.json());
        if (statusEl) {
          statusEl.textContent = data.ok
            ? (data.already_open ? `SoC interactive map already open. PID ${data.pid}` : `SoC interactive map launched. PID ${data.pid}`)
            : `Failed: ${data.error}`;
        }
      } catch (error) {
        if (statusEl) statusEl.textContent = "Failed to launch SoC project.";
      }
    }

    document.querySelectorAll(".schem-hit").forEach((hit) => {
      hit.addEventListener("click", () => {
        renderSchematicDetail(hit.dataset.key);
        if (hit.dataset.key === "fpga") openSocProject();
      });
    });
    renderSchematicDetail("fpga");

    function query() {
      const params = new URLSearchParams();
      fields.forEach((id) => params.set(id, $(id).value));
      checks.forEach((id) => params.set(id, $(id).checked ? "1" : "0"));
      return params.toString();
    }

    function paintValues() {
      fields.forEach((id) => {
        const value = Number($(id).value);
        document.querySelector(`[data-value="${id}"]`).textContent = Number.isInteger(value) ? value.toString() : value.toFixed(2);
      });
    }

    async function update() {
      paintValues();
      const data = await fetch(`/api/simulate?${query()}`).then((r) => r.json());
      $("status").innerHTML = data.status.map((s) => `<span class="chip">${s}</span>`).join("");
      const m = data.measurements;
      $("metrics").innerHTML = [
        ["Loaded cap", `${m.supercap_loaded_v} V`],
        ["Cap current", `${m.supercap_current_ma} mA`],
        ["Net power", `${m.net_power_mw} mW`],
        ["Runtime", `${m.estimated_runtime_s} s`],
      ].map(([a,b]) => `<div class="metric"><span class="sub">${a}</span><b>${b}</b></div>`).join("");
      $("rails").innerHTML = data.rails.map((r) => `
        <tr><td>${r.name}</td><td>${r.voltage_v} V</td><td>${r.current_ma} mA</td><td>${r.power_mw} mW</td></tr>
      `).join("");
    }

    async function loadHoneybird() {
      const statusEl = $("honeybirdStatus");
      if (!statusEl) return;
      try {
        const data = await fetch("/api/honeybird").then((r) => r.json());
        const channels = data.channels || [];
        const missing = channels.filter((channel) => !channel.exists).map((channel) => channel.name);
        statusEl.innerHTML = [
          `Project: ${data.ok ? data.project_path : "missing"}`,
          `Launcher: ${data.launcher_exists ? "ready" : "missing"}`,
          `Process: ${data.process_running ? `running, PID ${data.pid}` : "not running"}`,
          `Channels: ${missing.length ? `missing ${missing.join(", ")}` : "control + motion ready"}`,
        ].map((line) => `<div>${line}</div>`).join("");
        const frame = $("honeybirdFrame");
        if (frame && data.process_running) {
          frame.src = `/honeybird/live/?v=${Date.now()}`;
          frame.classList.add("active");
        }
        const stamp = Date.now();
        if (channels.some((channel) => channel.name === "control" && channel.exists)) {
          $("honeybirdControlImage").src = `/honeybird/image/control?v=${stamp}`;
        }
        if (channels.some((channel) => channel.name === "motion" && channel.exists)) {
          $("honeybirdMotionImage").src = `/honeybird/image/motion?v=${stamp}`;
        }
      } catch (error) {
        statusEl.textContent = "Honeybird bridge is not responding.";
      }
    }

    async function openHoneybird() {
      const statusEl = $("honeybirdStatus");
      if (statusEl) statusEl.textContent = "Opening Honeybird physical simulation...";
      try {
        const data = await fetch("/api/open-honeybird").then((r) => r.json());
        if (statusEl) {
          statusEl.textContent = data.ok
            ? (data.already_open ? `Honeybird already open. PID ${data.pid}` : `Honeybird launched. PID ${data.pid}`)
            : `Failed: ${data.error}`;
        }
        const frame = $("honeybirdFrame");
        if (data.ok && frame) {
          frame.src = `/honeybird/live/?v=${Date.now()}`;
          frame.classList.add("active");
        }
      } catch (error) {
        if (statusEl) statusEl.textContent = "Failed to launch Honeybird.";
      }
      await loadHoneybird();
    }

    let toastInterval = null;
    let toastStart = 0;

    function showCenterToast(title) {
      toastStart = performance.now();
      $("toastTitle").textContent = title;
      $("toastDetail").textContent = "0.0 s";
      $("centerToast").classList.add("active");
      clearInterval(toastInterval);
      toastInterval = setInterval(() => {
        $("toastDetail").textContent = `${((performance.now() - toastStart) / 1000).toFixed(1)} s`;
      }, 100);
    }

    function finishCenterToast(title, detail) {
      clearInterval(toastInterval);
      $("toastTitle").textContent = title;
      $("toastDetail").textContent = detail;
      setTimeout(() => $("centerToast").classList.remove("active"), 1400);
    }

    function imageToDataUrl(image) {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    }

    async function waitForImage(image) {
      if (image.complete && image.naturalWidth > 0) return;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    }

    async function captureHoneybirdFrame() {
      const source = $("captureSource").value;
      if (source === "live") {
        const frame = $("honeybirdFrame");
        const doc = frame?.contentDocument;
        const canvas = doc?.querySelector("canvas");
        if (canvas && canvas.width >= 4 && canvas.height >= 4) {
          return {
            image_data: canvas.toDataURL("image/png"),
            source: "honeybird_live_canvas",
            channel: "live",
          };
        }
        const fallback = $("honeybirdMotionImage");
        await waitForImage(fallback);
        return {
          image_data: imageToDataUrl(fallback),
          source: "honeybird_live_canvas_fallback_channel_b",
          channel: "motion",
        };
      }

      const image = source === "control" ? $("honeybirdControlImage") : $("honeybirdMotionImage");
      await waitForImage(image);
      return {
        image_data: imageToDataUrl(image),
        source: "honeybird_channel_image",
        channel: source,
      };
    }

    async function refreshColabStatus() {
      try {
        const data = await fetch("/api/colab/status").then((r) => r.json());
        const cpu = data.backends?.cpu?.queued ?? 0;
        const gpu = data.backends?.gpu?.queued ?? 0;
        const cpuResult = data.backends?.cpu?.latest_result;
        const gpuResult = data.backends?.gpu?.latest_result;
        const lines = [`CPU queue: ${cpu}`, `GPU queue: ${gpu}`];
        if (cpuResult) lines.push(`CPU result: ${cpuResult.prediction} (${Number(cpuResult.confidence).toFixed(3)})`);
        if (gpuResult) lines.push(`GPU result: ${gpuResult.prediction} (${Number(gpuResult.confidence).toFixed(3)})`);
        $("captureLog").innerHTML = lines.join("<br>");
      } catch (error) {
        $("captureLog").textContent = "Colab bridge status is not available.";
      }
    }

    async function sendHoneybirdCapture(backend) {
      const label = backend.toUpperCase();
      showCenterToast(`Sending to ${label}`);
      try {
        const capture = await captureHoneybirdFrame();
        $("lastCapturePreview").src = capture.image_data;
        const response = await fetch(`/api/colab/capture/${backend}`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(capture),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || "capture failed");
        $("captureLog").innerHTML = `${data.message}<br>${data.capture_id}<br>${data.manifest_path}`;
        finishCenterToast(`${label} queued`, `${Number(data.elapsed_s).toFixed(3)} s`);
        await refreshColabStatus();
      } catch (error) {
        finishCenterToast(`${label} failed`, String(error.message || error));
        $("captureLog").textContent = String(error.message || error);
      }
    }

    [...fields, ...checks].forEach((id) => $(id).addEventListener("input", update));
    $("openHoneybirdButton")?.addEventListener("click", openHoneybird);
    $("sendCpuCapture")?.addEventListener("click", () => sendHoneybirdCapture("cpu"));
    $("sendGpuCapture")?.addEventListener("click", () => sendHoneybirdCapture("gpu"));
    $("loadProcessorButton")?.addEventListener("click", loadProcessorState);
    $("loadProcessorCodeButton")?.addEventListener("click", loadProcessorCode);
    $("saveProcessorCodeButton")?.addEventListener("click", saveProcessorCode);
    $("stepProcessorButton")?.addEventListener("click", () => runProcessorAction("step"));
    $("runProcessorButton")?.addEventListener("click", () => runProcessorAction("run"));
    $("resetProcessorButton")?.addEventListener("click", () => runProcessorAction("reset"));
    $("controllerProgramButton")?.addEventListener("click", () => loadDemoProgram("controller"));
    $("workerProgramButton")?.addEventListener("click", () => loadDemoProgram("worker"));
    $("planMatrixButton")?.addEventListener("click", planMatrix);
    $("runMatrixCpuButton")?.addEventListener("click", runMatrixCpu);
    const requestedProcessor = new URLSearchParams(window.location.search).get("processor");
    if (requestedProcessor !== null && $("processorIdInput")) $("processorIdInput").value = requestedProcessor;
    $("processorIdInput")?.addEventListener("change", () => {
      loadProcessorState();
      loadProcessorCode();
    });
    fetch("/api/health").then((r) => r.json()).then((h) => {
      const board = h.model_exists ? "3D model linked" : "3D model missing";
      const processors = h.processors_exists ? "AI MIPS linked" : "AI MIPS missing";
      $("health").textContent = `${board} | ${processors}`;
    }).catch(() => $("health").textContent = "server check failed");
    if (location.hash.startsWith("#system") || location.hash.startsWith("#measure") || !location.hash) {
      activateTab("measure");
      if (location.hash.startsWith("#system")) history.replaceState(null, "", "#measure");
    }
    if (location.hash.startsWith("#viewer")) activateTab("viewer");
    if (location.hash.startsWith("#schematic")) activateTab("schematic");
    if (location.hash.startsWith("#honeybird")) {
      activateTab("measure");
      history.replaceState(null, "", "#measure");
    }
    if (location.hash.startsWith("#processors")) {
      activateTab("processors");
      openProcessors();
    }
    update();
  </script>
</body>
</html>"""
    )


app = Starlette(
    debug=True,
    routes=[
        Route("/", index),
        Route("/api/health", health),
        Route("/api/simulate", api_simulate),
        Route("/api/soc-project", api_soc_project),
        Route("/api/open-soc-project", api_open_soc_project),
        Route("/api/processors", api_processors),
        Route("/api/open-processors", api_open_processors),
        Route("/api/ai-mips/{path:path}", ai_mips_api_proxy, methods=["GET", "POST"]),
        Route("/api/honeybird", api_honeybird),
        Route("/api/open-honeybird", api_open_honeybird),
        Route("/api/colab/status", api_colab_status),
        Route("/api/colab/capture/{backend}", api_colab_capture, methods=["POST"]),
        Route("/board/BeeBoard_v0_1_Micro.glb", board_model),
        Route("/honeybird/image/{channel}", honeybird_image),
        Route("/honeybird/live/", honeybird_live_proxy, methods=["GET", "POST"]),
        Route("/honeybird/live/{path:path}", honeybird_live_proxy, methods=["GET", "POST"]),
        Route("/processors/live/", processors_live_proxy, methods=["GET", "POST"]),
        Route("/processors/live/{path:path}", processors_live_proxy, methods=["GET", "POST"]),
    ],
)
