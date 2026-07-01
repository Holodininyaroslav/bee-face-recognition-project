# Codex Install Guide for Another Computer

This guide is written for a fresh Windows computer. It tells another Codex session exactly what can be installed from the public repository and what still requires a live Colab session or the full local backend source.

## Public Links

- Project site: https://holodininyaroslav.github.io/bee-face-recognition-project/
- Repository: https://github.com/Holodininyaroslav/bee-face-recognition-project
- Colab notebook: https://colab.research.google.com/github/Holodininyaroslav/bee-face-recognition-project/blob/main/colab/colab_public_one_image_site.ipynb
- Full local suite installer: https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip
- Colab detector payload: https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/colab_ai_mips_bee_identity_payload_compact.zip
- Module database: https://github.com/Holodininyaroslav/bee-face-recognition-project/blob/main/database/project_modules.json

## What Is Included Publicly

The public repository contains the static GitHub Pages interface, the Colab notebook, the published detector source excerpt, documentation, security notes, and installer links.

The repository also contains `database/project_modules.json`, a machine-readable inventory of the expected modules, local URLs, concept status, and release assets. Use it as the checklist if a fresh machine appears to be missing a simulator or model package.

The public repository does not keep the full expanded local Hive backend directory directly in the static Pages checkout. Install it from the full local suite package listed above. The suite contains the Hive backend, BeeBoard, Bgame, physical/mechanic/satellite tools, model assets, and component ZIP files in the exact locations expected by the local server.

## Recommended Local Layout

```powershell
mkdir C:\BeeFaceProject
cd C:\BeeFaceProject
git clone https://github.com/Holodininyaroslav/bee-face-recognition-project.git site
```

## Run the Static Site Locally

The public GitHub Pages site works online without local installation. For local testing of the static files:

```powershell
cd C:\BeeFaceProject\site
py -m http.server 8890 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8890/
```

## Install and Run the Full Local Suite

Download and extract the full suite package:

```powershell
cd C:\BeeFaceProject
Invoke-WebRequest -Uri "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip" -OutFile ".\bee_face_full_local_suite_installer.zip"
Expand-Archive ".\bee_face_full_local_suite_installer.zip" -DestinationPath ".\FullSuite" -Force
cd ".\FullSuite\Bee_Face_Local_Suite"
.\Install_All_Local_Tools.cmd
cd "$env:USERPROFILE\BeeFaceLocalSuite\AI_MIPS_Hive_Service"
```

Verify the required files:

```powershell
Test-Path ".\Start AI MIPS Hive Web.bat"
Test-Path ".\Start AI MIPS Hive Web.ps1"
Test-Path ".\README_HIVE_SERVICE.md"
Test-Path ".\python_ai_mips_sim\web\index.html"
Test-Path ".\python_ai_mips_sim\web\app.js"
Test-Path ".\python_ai_mips_sim\web\app.css"
Test-Path ".\python_ai_mips_sim\web\mechanic-simulator.html"
Test-Path ".\python_ai_mips_sim\web\cad-mechanics\app.js"
Test-Path ".\python_ai_mips_sim\web\cad-mechanics\bee-shell.obj"
Test-Path ".\python_ai_mips_sim\web\vendor\three-addons\controls\OrbitControls.js"
Test-Path ".\python_ai_mips_sim\web\vendor\three-addons\loaders\OBJLoader.js"
Test-Path ".\python_ai_mips_sim\web\blockchain-simulation.html"
Test-Path ".\python_ai_mips_sim\web\lifi-communication.html"
Test-Path ".\python_ai_mips_sim\web\neutrino-communication.html"
Test-Path ".\python_ai_mips_sim\web\neutrino-basic-concept.html"
Test-Path ".\python_ai_mips_sim\web\neutrino-satellite-communication.html"
Test-Path ".\python_ai_mips_sim\ai_mips_sim\server.py"
Test-Path ".\python_ai_mips_sim\web\StreamingAssets\Models\BeeOriginal_model_pbr.glb"
Test-Path ".\bgame_installer.zip"
Test-Path ".\beeboard_interface_installer.zip"
Test-Path ".\physical_simulation_installer.zip"
Test-Path ".\mechanic_simulation_installer.zip"
Test-Path ".\blockchain_simulation_installer.zip"
Test-Path ".\lifi_communication_concept_installer.zip"
Test-Path ".\neutrino_communication_concept_installer.zip"
Test-Path ".\satellite_communication_installer.zip"
```

Run:

```powershell
.\Start AI MIPS Hive Web.bat
```

Expected local URL:

```text
http://127.0.0.1:8876/?fresh=hive-main
```

Expected behavior:

- the AI MIPS Hive Service menu opens;
- the page shows processors, detector controls, hex map, detections, and recent events;
- `/api/hive` returns JSON state;
- expanding the `Physical simulator` hex shows `Mechanic Simulation`;
- `http://127.0.0.1:8876/mechanic-simulator` opens the browser CAD/mechanic animation;
- `http://127.0.0.1:8876/cad-mechanics/bee-shell.obj` returns the packaged CAD shell OBJ;
- expanding the blue `Network simulator` hex shows `Blockchain Simulation`;
- `http://127.0.0.1:8876/blockchain-simulation` opens the EOS smart-contract sandbox;
- the service listens on `127.0.0.1` only.

## Optional Legacy Component: Bgame

The full local suite already installs this package. Use these manual steps only for recovery or component testing:

```powershell
cd C:\BeeFaceProject
Invoke-WebRequest -Uri "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_ursina_game_installer.zip" -OutFile ".\bee_ursina_game_installer.zip"
Expand-Archive ".\bee_ursina_game_installer.zip" -DestinationPath ".\Bgame" -Force
cd .\Bgame
```

Verify the required files:

```powershell
Test-Path ".\bee_face_patrol.py"
Test-Path ".\Start Bee Linked Game.bat"
Test-Path ".\Start Linked Bee Experience.py"
Test-Path ".\Bee_3D_Standalone\main.py"
Test-Path ".\Bee_3D_Standalone\drone_model.py"
Test-Path ".\Bee_3D_Standalone\drone model\model.glb"
Test-Path ".\Bee_3D_Standalone\drone model\model_pbr.glb"
Test-Path ".\Bee_3D_Standalone\drone model\model_diffuse.generated.png"
Test-Path ".\Bee_3D_Standalone\drone model\faces\Adi.glb"
Test-Path ".\Bee_3D_Standalone\drone model\faces\Faraj.glb"
Test-Path ".\Bee_3D_Standalone\drone model\faces\Slava.glb"
```

Install Python dependencies if needed:

```powershell
py -m pip install -r ".\Bee_3D_Standalone\requirements.txt"
```

Start the linked 2D plus 3D game:

```powershell
.\Start Bee Linked Game.bat
```

Expected behavior:

- a linked game window opens;
- the left side shows the 3D Ursina view;
- the right side shows the 2D control map;
- the 2D game controls the 3D bee/statue scene;
- background music should not play in the published package.

## Optional Legacy Component: BeeBoard

The full local suite already installs this package. Use these manual steps only for recovery or component testing:

```powershell
cd C:\BeeFaceProject
Invoke-WebRequest -Uri "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/beeboard_interface_installer.zip" -OutFile ".\beeboard_interface_installer.zip"
Expand-Archive ".\beeboard_interface_installer.zip" -DestinationPath ".\BeeBoard" -Force
cd ".\BeeBoard\BeeBoard_Interface"
```

Verify the required files:

```powershell
Test-Path ".\install_and_run.bat"
Test-Path ".\run_beeboard.bat"
Test-Path ".\app.py"
Test-Path ".\desktop_app.py"
Test-Path ".\circuit_sim.py"
Test-Path ".\requirements.txt"
Test-Path ".\BeeBoard_lab_3d_review.png"
Test-Path "..\BeeBoard_v0_1_Micro_KiCad\BeeBoard_v0_1_Micro.glb"
Test-Path "..\BeeBoard_v0_1_Micro_KiCad\BeeBoard_v0_1_Micro_board_layers.step"
Test-Path "..\BeeBoard_v0_1_Micro_KiCad\BeeBoard_v0_1_Micro_KiCad.kicad_pcb"
```

Run:

```powershell
.\install_and_run.bat
```

Expected behavior:

- the BeeBoard local interface starts;
- the 3D board review page is available from the BeeBoard UI;
- the 3D Board Review model loads from `..\BeeBoard_v0_1_Micro_KiCad\BeeBoard_v0_1_Micro.glb`;
- the installer does not need the GitHub Pages page to run by itself.

Optional local API check after the app starts:

```powershell
Invoke-RestMethod "http://127.0.0.1:8877/api/health" | Select-Object model_exists, model_path
Invoke-WebRequest "http://127.0.0.1:8877/board/BeeBoard_v0_1_Micro.glb" | Select-Object StatusCode, RawContentLength
```

Expected: `model_exists` is `True`, and the GLB request returns HTTP `200`.

## Optional Legacy Component: Physical Wings

The physical wings simulator uses WSL Ubuntu because the current simulator runtime is Linux-based.

Install WSL Ubuntu first, then download and extract the physical package:

```powershell
cd C:\BeeFaceProject
Invoke-WebRequest -Uri "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/physical_simulation_installer.zip" -OutFile ".\physical_simulation_installer.zip"
Expand-Archive ".\physical_simulation_installer.zip" -DestinationPath ".\PhysicalWings" -Force
cd ".\PhysicalWings"
```

Verify the required files:

```powershell
Test-Path ".\Install and Start Physical Wings.bat"
Test-Path ".\flappy\flappy_inspector.py"
Test-Path ".\flappy\fwmav_sim_env.py"
Test-Path ".\flappy\simulation.py"
Test-Path ".\flappy\start_flappy_inspector.sh"
Test-Path ".\flappy\_Wing.cpython-38-x86_64-linux-gnu.so"
```

Run:

```powershell
.\Install and Start Physical Wings.bat
```

Expected local URL:

```text
http://127.0.0.1:8099/?fresh=bee-shell-rotated
```

Expected behavior:

- WSL receives a copy of the `flappy` simulator folder;
- the FWMAV / physical wings inspector starts;
- the physical simulation is the bee-shell / wing mechanics simulator, not the Bgame package.

## Colab Detector Setup

The Colab detector URL is not permanent. Google Colab and Gradio generate a new public URL for each live session.

Setup steps:

1. Open the Colab notebook link from this repository.
2. Select a GPU runtime in Colab.
3. Run the notebook cells that start the detector service.
4. Copy the live Gradio URL printed by the notebook.
5. Use the detector endpoint from that live session in the project interface.

Expected behavior:

- the simple demo can upload one image or a batch;
- GPU and CPU modes return the same response format;
- the JSON response includes label, score, margin, backend, elapsed time, and accepted/rejected status.

## Full Local Hive Bridge

The full local Hive bridge is included in the AI MIPS Hive Service package. Use this section after extracting that package.

Expected backend folder after extracting the package:

```text
C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim
```

Start the bridge bound to localhost only:

```powershell
cd C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim
$env:BEE_LOCAL_ALLOWED_ACTIONS="local_bridge_approval,detect_face,control_hive,configure_detector,open_beeboard,open_physical,start_ursina,start_bgame"
py -m ai_mips_sim.server --host 127.0.0.1 --port 8876
```

Never run the bridge on `0.0.0.0` for public access.

When the bridge is running, the GitHub Pages interface can be opened with an approved local session. A local token must stay private and must never be committed, pasted into public documentation, or shared in screenshots.

## Security Rules

- Use Google Chrome for project testing.
- Keep local bridge services on `127.0.0.1`.
- Do not publish local bridge tokens.
- Approve local bridge access only when local apps were intentionally started.
- Do not expose WSL, Hive, BeeBoard, Bgame, or physical simulator ports to the public internet.
- If anything opens a local application unexpectedly, stop the local server and inspect `BEE_LOCAL_ALLOWED_ACTIONS`.

## Fresh Computer Checklist

After installation, another Codex session should verify:

```powershell
Test-Path "C:\BeeFaceProject\site\index.html"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\Start AI MIPS Hive Web.bat"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\web\index.html"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\web\mechanic-simulator.html"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\web\cad-mechanics\app.js"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\web\cad-mechanics\bee-shell.obj"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\web\blockchain-simulation.html"
Test-Path "C:\BeeFaceProject\HiveService\AI_MIPS_Hive_Service\python_ai_mips_sim\ai_mips_sim\server.py"
Test-Path "C:\BeeFaceProject\Bgame\Start Bee Linked Game.bat"
Test-Path "C:\BeeFaceProject\Bgame\Bee_3D_Standalone\drone model\model_diffuse.generated.png"
Test-Path "C:\BeeFaceProject\BeeBoard\BeeBoard_Interface\install_and_run.bat"
Test-Path "C:\BeeFaceProject\PhysicalWings\Install and Start Physical Wings.bat"
Test-Path "C:\BeeFaceProject\PhysicalWings\flappy\flappy_inspector.py"
```

All checks should return `True`. If a check returns `False`, the relevant ZIP was not downloaded, was extracted into the wrong folder, or the package is incomplete.
