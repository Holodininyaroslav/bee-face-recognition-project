const LOCAL_HIVE_BASE = "http://127.0.0.1:8876";
const LOCAL_BEEBOARD_BASE = "http://127.0.0.1:8877";
const LOCAL_HIVE_URL = `${LOCAL_HIVE_BASE}/?fresh=github-pages-local`;
const LOCAL_BEEBOARD_VIEWER_URL = `${LOCAL_BEEBOARD_BASE}/?hive=${encodeURIComponent(LOCAL_HIVE_URL)}&processor=0#viewer`;
const INSTALLER_URLS = {
  suite: "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip",
  ursina: "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_ursina_game_installer.zip",
  beeboard: "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/beeboard_interface_installer.zip",
  physical: "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/physical_simulation_installer.zip",
  hive: "https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/ai_mips_hive_service_installer.zip",
  repository: "https://github.com/Holodininyaroslav/bee-face-recognition-project"
};
const START_PARAMS = new URLSearchParams(window.location.search);
const LOCAL_BRIDGE_SESSION_KEY = "beeFaceLocalBridgeToken";
const LOCAL_APPROVAL_SESSION_KEY = "beeFaceLocalApprovalSession";
const IS_LOCAL_PORTAL = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const LOCAL_BRIDGE_TEST_IDLE_MS = Number(START_PARAMS.get("bridge_idle_ms") || 0);
const LOCAL_BRIDGE_IDLE_MS = window.location.hostname === "127.0.0.1" && LOCAL_BRIDGE_TEST_IDLE_MS >= 500
  ? LOCAL_BRIDGE_TEST_IDLE_MS
  : 60 * 60 * 1000;
let memoryLocalBridgeToken = "";

function validLocalToken(token) {
  return /^[A-Za-z0-9._~-]{24,}$/.test(token || "");
}

function readStoredLocalBridgeToken() {
  try {
    return window.sessionStorage?.getItem(LOCAL_BRIDGE_SESSION_KEY) || memoryLocalBridgeToken || "";
  } catch (_) {
    return memoryLocalBridgeToken || "";
  }
}

function writeStoredLocalBridgeToken(token) {
  memoryLocalBridgeToken = token || "";
  try {
    if (token) window.sessionStorage?.setItem(LOCAL_BRIDGE_SESSION_KEY, token);
  } catch (_) {
    // Some locked-down browser contexts do not expose sessionStorage.
  }
}

let LOCAL_BRIDGE_TOKEN = START_PARAMS.get("local_token") || readStoredLocalBridgeToken();
let LOCAL_BRIDGE_SESSION = START_PARAMS.get("local_session") || readStoredLocalApprovalSession();
let LOCAL_BRIDGE_ALLOWED = START_PARAMS.get("local_bridge") === "1" && (
  IS_LOCAL_PORTAL ||
  validLocalToken(START_PARAMS.get("local_token") || "") ||
  validLocalToken(START_PARAMS.get("local_session") || readStoredLocalApprovalSession())
);
let localBridgeIdleTimer = null;
let localBridgeApprovalRequested = false;
let localBridgeUserConfirmed = LOCAL_BRIDGE_ALLOWED && (
  IS_LOCAL_PORTAL ||
  START_PARAMS.get("session") === "local-approved" ||
  validLocalToken(START_PARAMS.get("local_token") || "") ||
  validLocalToken(START_PARAMS.get("local_session") || "")
);
let complexFrame = null;

if (LOCAL_BRIDGE_ALLOWED && window.history && window.history.replaceState) {
  writeStoredLocalBridgeToken(LOCAL_BRIDGE_TOKEN);
  writeStoredLocalApprovalSession(LOCAL_BRIDGE_SESSION);
  const safeUrl = new URL(window.location.href);
  safeUrl.searchParams.delete("local_token");
  safeUrl.searchParams.delete("local_session");
  safeUrl.searchParams.set("local_bridge", "1");
  safeUrl.searchParams.set("session", "local-approved");
  window.history.replaceState(null, "", safeUrl.toString());
}

function withLocalToken(url) {
  if (!LOCAL_BRIDGE_ALLOWED) return url;
  const parsed = new URL(url, window.location.href);
  if (validLocalToken(LOCAL_BRIDGE_TOKEN)) {
    parsed.searchParams.set("local_token", LOCAL_BRIDGE_TOKEN);
  } else if (validLocalToken(LOCAL_BRIDGE_SESSION)) {
    parsed.searchParams.set("local_session", LOCAL_BRIDGE_SESSION);
  }
  return parsed.toString();
}

function bridgeHasSavedToken() {
  return IS_LOCAL_PORTAL || validLocalToken(LOCAL_BRIDGE_TOKEN) || validLocalToken(LOCAL_BRIDGE_SESSION);
}

function readStoredLocalApprovalSession() {
  try {
    return window.sessionStorage?.getItem(LOCAL_APPROVAL_SESSION_KEY) || "";
  } catch (_) {
    return "";
  }
}

function writeStoredLocalApprovalSession(session) {
  try {
    if (validLocalToken(session)) window.sessionStorage?.setItem(LOCAL_APPROVAL_SESSION_KEY, session);
  } catch (_) {
    // Some locked-down browser contexts do not expose sessionStorage.
  }
}

function publicReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "complex");
  url.searchParams.set("local_bridge", "1");
  url.searchParams.set("v", `bridge-approved-${Date.now()}`);
  url.searchParams.delete("local_token");
  url.searchParams.delete("local_session");
  return url.toString();
}

function localPortalReturnUrl() {
  const url = new URL("http://127.0.0.1:8890/");
  url.searchParams.set("view", "complex");
  url.searchParams.set("local_bridge", "1");
  url.searchParams.set("v", `local-approved-${Date.now()}`);
  url.searchParams.set("session", "local-approved");
  return url.toString();
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function probeLocalHive() {
  try {
    const response = await fetch(`${LOCAL_HIVE_BASE}/api/local-status?ts=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      mode: "cors"
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

function renderLocalInstallPrompt(message = "Local project tools are not running on this computer.") {
  if (!complexFrame) return;
  const retryUrl = publicReturnUrl();
  complexFrame.removeAttribute("src");
  complexFrame.srcdoc = `<!doctype html>
<meta charset="utf-8">
<base target="_blank">
<style>
  :root{color-scheme:dark}
  body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#07101f;color:#eef5ff}
  main{min-height:100vh;padding:38px;border:1px solid #31415f;background:linear-gradient(135deg,#0b1324,#101827)}
  h1{margin:0 0 14px;color:#ffd057;font-size:40px;line-height:1.05}
  p{max-width:980px;color:#c7d7f4;font-size:18px;line-height:1.55}
  .notice{border-left:5px solid #38d7ff;background:#0b1b31;padding:16px 18px;margin:22px 0}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(210px,1fr));gap:14px;margin-top:22px}
  a,.button{display:flex;align-items:center;justify-content:center;min-height:58px;padding:14px 18px;border:1px solid #31415f;background:#17243a;color:#eef5ff;text-decoration:none;font-weight:900;text-align:center}
  a.primary{background:#ffb000;color:#09111f;border-color:#ffb000}
  a:hover{border-color:#ffb000}
  .steps{display:grid;gap:10px;margin:22px 0 6px;padding:0;list-style:none;counter-reset:step}
  .steps li{counter-increment:step;border:1px solid #31415f;background:#0b1324;padding:14px;color:#d7e6ff}
  .steps li:before{content:counter(step,decimal-leading-zero);display:inline-block;margin-right:10px;color:#38d7ff;font-weight:900}
  code{background:#050912;border:1px solid #31415f;padding:2px 6px;color:#ffd057}
</style>
<main>
  <h1>Install local project tools</h1>
  <p>${htmlEscape(message)}</p>
  <div class="notice">
    The online GitHub Pages site is public, but local apps can run only after you install them on this computer and approve the browser connection. The site cannot silently install or run programs.
  </div>
  <ul class="steps">
    <li>Download the full local suite package.</li>
    <li>Extract the archive and run <code>Install_All_Local_Tools.cmd</code>.</li>
    <li>Return to this page and press “Launch after install”.</li>
  </ul>
  <div class="grid">
    <a class="primary" href="${INSTALLER_URLS.suite}">Download full local suite</a>
  </div>
  <div class="grid">
    <a class="primary" target="_top" href="${htmlEscape(retryUrl)}">Launch after install</a>
    <a href="${INSTALLER_URLS.repository}">Open project repository</a>
  </div>
</main>`;
}

function requestLocalBridgeApproval(reason, returnUrl = localPortalReturnUrl()) {
  if (IS_LOCAL_PORTAL) return false;
  const allowed = window.confirm(
    `Approve connection from this public project page to local project tools on this computer?\n\nAction: ${reason}`
  );
  if (allowed) {
    const approval = new URL(`${LOCAL_HIVE_BASE}/local-bridge-approve`);
    approval.searchParams.set("return", returnUrl);
    window.location.href = approval.toString();
  }
  return allowed;
}

function renderLocalBridgePlaceholder(mode = "locked") {
  if (!complexFrame) return;
  complexFrame.removeAttribute("src");
  complexFrame.srcdoc = `
    <!doctype html>
    <meta charset="utf-8">
    <body style="margin:0;background:#07101e"></body>
  `;
}

function resetLocalBridgeIdleTimer() {
  if (localBridgeIdleTimer) {
    window.clearTimeout(localBridgeIdleTimer);
    localBridgeIdleTimer = null;
  }
  if (IS_LOCAL_PORTAL || !LOCAL_BRIDGE_ALLOWED || !localBridgeUserConfirmed) return;
  const idleMs = LOCAL_BRIDGE_TEST_IDLE_MS > 0 ? LOCAL_BRIDGE_TEST_IDLE_MS : 2 * 60 * 60 * 1000;
  localBridgeIdleTimer = window.setTimeout(() => {
    localBridgeUserConfirmed = false;
    if (document.getElementById("complex")?.classList.contains("active")) {
      renderLocalInstallPrompt("The local bridge paused after inactivity. Use the browser approval prompt again to restore access to local apps.");
      localBridgeApprovalRequested = false;
      window.setTimeout(() => {
        requestLocalBridgeApproval("restore the local AI MIPS Hive Web interface");
      }, 100);
    }
  }, idleMs);
}

function approveLocalBridgeFromSavedToken(reason = "reconnect local project tools") {
  if (!bridgeHasSavedToken()) {
    if (requestLocalBridgeApproval(reason)) {
      return false;
    }
    LOCAL_BRIDGE_ALLOWED = false;
    localBridgeUserConfirmed = false;
    alert("Local bridge is not connected. Start an approved local session first.");
    renderLocalBridgePlaceholder("locked");
    return false;
  }
  if (!localBridgeUserConfirmed) {
    const allowed = window.confirm(`Allow this page to ${reason} on 127.0.0.1 for the current session?`);
    if (!allowed) {
      LOCAL_BRIDGE_ALLOWED = false;
      localBridgeUserConfirmed = false;
      renderLocalBridgePlaceholder("locked");
      return false;
    }
  }
  LOCAL_BRIDGE_ALLOWED = true;
  localBridgeUserConfirmed = true;
  if (validLocalToken(LOCAL_BRIDGE_TOKEN)) {
    writeStoredLocalBridgeToken(LOCAL_BRIDGE_TOKEN);
  }
  if (validLocalToken(LOCAL_BRIDGE_SESSION)) {
    writeStoredLocalApprovalSession(LOCAL_BRIDGE_SESSION);
  }
  resetLocalBridgeIdleTimer();
  renderComplexFrame();
  return true;
}

function requireLocalBridge(reason) {
  if (LOCAL_BRIDGE_ALLOWED && localBridgeUserConfirmed) {
    resetLocalBridgeIdleTimer();
    return true;
  }
  return approveLocalBridgeFromSavedToken(reason);
}

const translations = {
  en: {
    kicker: "COLAB GPU / FACE DETECTION / PROJECT INTERFACE",
    title: "Welcome to Bee Face Recognition Project",
    lead: "Upload screenshots, recognize faces through the connected Colab detector, and inspect the same result stream inside the integrated AI MIPS project view.",
    simple: "Simple demonstration",
    complex: "Complex demonstration integrated into the project",
    toolColab: "Colab project notebook",
    toolColabText: "Open the CUDA/Colab detector notebook from this repository.",
    toolFullSuite: "Full local suite installer",
    toolFullSuiteText: "Install the Hive service, local simulations, BeeBoard 3D review, Bgame, orbital mechanics, models, and launchers together.",
    toolHiveInstaller: "AI MIPS Hive Service installer",
    toolHiveInstallerText: "Download the local Hive menu and backend service package.",
    toolUrsina: "Bgame installer",
    toolUrsinaText: "Download the local bee gameplay package.",
    toolBeeBoard: "BeeBoard installer",
    toolBeeBoardText: "Download the local BeeBoard interface package.",
    toolPhysical: "Physical simulation installer",
    toolPhysicalText: "Download the local physical simulation package.",
    simpleKicker: "SIMPLE MODE",
    simpleTitle: "Simple face recognition demo",
    simpleNote: "Upload one image or a batch, choose GPU or CPU, and press Recognize.",
    imageTitle: "Image / screenshot",
    dropHint: "Choose one or more images for GPU/CPU analysis.",
    score: "Minimum score",
    margin: "Minimum margin",
    recognize: "Recognize",
    resultTitle: "Detector result",
    summary: "Upload an image and press Recognize.",
    json: "Detector JSON",
    howKicker: "HOW THE DETECTOR WORKS",
    howTitle: "What happens to the image inside the neural network",
    howIntro: "This inspector shows the detector-only CUDA module: one-time initialization, DeepID inference, reference comparison, and the final identity result. Hive and web-interface code are outside this source listing.",
    step1Title: "Image input",
    step1Text: "The uploaded screenshot is decoded as pixels. If a batch is selected, the same steps are repeated for each file one by one.",
    step2Title: "Face crop and normalization",
    step2Text: "The detector searches for the face area, crops the useful region, resizes it to the network input size, and normalizes color and brightness values.",
    step3Title: "Feature extraction",
    step3Text: "The neural network converts the face image into a numeric feature vector, also called an embedding. This vector describes the face pattern more compactly than raw pixels.",
    step4Title: "Reference comparison",
    step4Text: "The new embedding is compared with stored reference embeddings for known identities. The closest identity becomes the best label, and the second closest result is kept as the runner up.",
    step5Title: "Score and margin decision",
    step5Text: "The answer is accepted only if the best score is high enough and the margin from the runner up is large enough. Otherwise the result is returned as Unknown instead of forcing a wrong name.",
    step6Title: "Response JSON",
    step6Text: "The interface receives a readable summary and a JSON object with the identity, best score, runner up, margin, backend mode, elapsed time, and acceptance flag.",
    modeExplainTitle: "GPU and CPU mode",
    modeExplainText: "GPU mode runs the heavy vector and image operations through the accelerator path. CPU mode runs the same recognition logic on the processor. The expected identity result should stay the same; the difference is mainly where the computation runs and how long it takes.",
    openStage: "Open scheme",
    schemeTitle: "Scheme",
    stageStatsTitle: "Layers and neural connections",
    layersLabel: "Layers / operations",
    connectionsLabel: "Neuron connections / MACs",
    tensorLabel: "Tensor / vector size",
    cudaLabel: "CUDA mapping",
    cudaTitle: "CUDA implementation in this project",
    openFullCode: "Open full Colab/CUDA code for this stage",
    showShortCode: "Show short stage sketch",
    codeSourceShort: "Short CUDA-stage sketch",
    codeSourceFull: "Full code used by the Colab detector for this stage",
    nextLevel: "Next level",
    prevLevel: "Previous level",
    backToSimple: "Return to simple demonstration",
    complexKicker: "INTEGRATED MODE",
    complexTitle: "Integrated project interface",
    openHive: "Open local Hive",
    openBeeBoard: "Open BeeBoard 3D",
    openPhysical: "Open physical wings",
    openUrsina: "Open Bgame",
    downloadUrsina: "Bgame installer",
    downloadBeeBoard: "BeeBoard installer",
    downloadPhysical: "Physical installer",
    back: "Back",
    stageLabel: "STAGE",
    unknown: "Unknown",
    processedImages: "image(s) processed",
    acceptedImages: "Accepted",
    processing: "Processing",
    running: "Running...",
    ready: "Local Hive ready",
    error: "Local Hive error",
    bestLabel: "best match",
    scoreValue: "similarity",
    marginValue: "margin"
  },
  ru: {
    kicker: "COLAB GPU / Р РђРЎРџРћР—РќРђР’РђРќРР• Р›РР¦ / РРќРўР•Р Р¤Р•Р™РЎ РџР РћР•РљРўРђ",
    title: "Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ РІ Bee Face Recognition Project",
    lead: "Р—Р°РіСЂСѓР¶Р°Р№С‚Рµ СЃРєСЂРёРЅС€РѕС‚С‹, СЂР°СЃРїРѕР·РЅР°РІР°Р№С‚Рµ Р»РёС†Р° С‡РµСЂРµР· РїРѕРґРєР»СЋС‡РµРЅРЅС‹Р№ Colab-РґРµС‚РµРєС‚РѕСЂ Рё СЃРјРѕС‚СЂРёС‚Рµ С‚РѕС‚ Р¶Рµ РїРѕС‚РѕРє СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ РІ РёРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅРѕРј РёРЅС‚РµСЂС„РµР№СЃРµ AI MIPS.",
    simple: "РџСЂРѕСЃС‚Р°СЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ",
    complex: "РЎР»РѕР¶РЅР°СЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ, РёРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅР°СЏ РІ РїСЂРѕРµРєС‚",
    toolColab: "Colab notebook РїСЂРѕРµРєС‚Р°",
    toolColabText: "РћС‚РєСЂС‹С‚СЊ CUDA/Colab РІРµСЂСЃРёСЋ РґРµС‚РµРєС‚РѕСЂР° РёР· СЌС‚РѕРіРѕ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ.",
    toolUrsina: "РРЅСЃС‚Р°Р»Р»РµСЂ Ursina РёРіСЂС‹",
    toolUrsinaText: "РЎРєР°С‡Р°С‚СЊ Р»РѕРєР°Р»СЊРЅС‹Р№ РїР°РєРµС‚ Ursina РёРіСЂС‹.",
    toolBeeBoard: "BeeBoard РёРЅСЃС‚Р°Р»Р»РµСЂ",
    toolBeeBoardText: "РЎРєР°С‡Р°С‚СЊ Р»РѕРєР°Р»СЊРЅС‹Р№ РїР°РєРµС‚ BeeBoard РёРЅС‚РµСЂС„РµР№СЃР°.",
    toolPhysical: "РРЅСЃС‚Р°Р»Р»РµСЂ С„РёР·РёС‡РµСЃРєРѕР№ СЃРёРјСѓР»СЏС†РёРё",
    toolPhysicalText: "РЎРєР°С‡Р°С‚СЊ Р»РѕРєР°Р»СЊРЅС‹Р№ РїР°РєРµС‚ С„РёР·РёС‡РµСЃРєРѕР№ СЃРёРјСѓР»СЏС†РёРё.",
    simpleKicker: "РџР РћРЎРўРћР™ Р Р•Р–РРњ",
    simpleTitle: "РџСЂРѕСЃС‚Р°СЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ Р»РёС†",
    simpleNote: "Р—Р°РіСЂСѓР·РёС‚Рµ РѕРґРЅРѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РёР»Рё РїР°С‡РєСѓ, РІС‹Р±РµСЂРёС‚Рµ GPU РёР»Рё CPU Рё РЅР°Р¶РјРёС‚Рµ Recognize.",
    imageTitle: "РР·РѕР±СЂР°Р¶РµРЅРёРµ / СЃРєСЂРёРЅС€РѕС‚",
    dropHint: "Р’С‹Р±РµСЂРёС‚Рµ РѕРґРЅРѕ РёР»Рё РЅРµСЃРєРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёР№ РґР»СЏ GPU/CPU Р°РЅР°Р»РёР·Р°.",
    score: "РњРёРЅРёРјР°Р»СЊРЅС‹Р№ score",
    margin: "РњРёРЅРёРјР°Р»СЊРЅС‹Р№ margin",
    recognize: "Recognize",
    resultTitle: "Р РµР·СѓР»СЊС‚Р°С‚ РґРµС‚РµРєС‚РѕСЂР°",
    summary: "Р—Р°РіСЂСѓР·РёС‚Рµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ Рё РЅР°Р¶РјРёС‚Рµ Recognize.",
    json: "JSON РґРµС‚РµРєС‚РѕСЂР°",
    howKicker: "РљРђРљ Р РђР‘РћРўРђР•Рў Р”Р•РўР•РљРўРћР ",
    howTitle: "Р§С‚Рѕ РїСЂРѕРёСЃС…РѕРґРёС‚ СЃ РєР°СЂС‚РёРЅРєРѕР№ РІРЅСѓС‚СЂРё РЅРµР№СЂРѕСЃРµС‚Рё",
    howIntro: "РџСЂРѕСЃС‚Р°СЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ РѕС‚РїСЂР°РІР»СЏРµС‚ РІС‹Р±СЂР°РЅРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІ РїРѕРґРєР»СЋС‡РµРЅРЅС‹Р№ Colab-РґРµС‚РµРєС‚РѕСЂ. РўР° Р¶Рµ СЃР°РјР°СЏ С†РµРїРѕС‡РєР° СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ Рё Р·РґРµСЃСЊ, Рё РІ РёРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅРѕРј Hive-РёРЅС‚РµСЂС„РµР№СЃРµ РїСЂРѕРµРєС‚Р°.",
    step1Title: "Р’С…РѕРґРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ",
    step1Text: "Р—Р°РіСЂСѓР¶РµРЅРЅС‹Р№ СЃРєСЂРёРЅС€РѕС‚ С‡РёС‚Р°РµС‚СЃСЏ РєР°Рє РЅР°Р±РѕСЂ РїРёРєСЃРµР»РµР№. Р•СЃР»Рё РІС‹Р±СЂР°РЅР° РїР°С‡РєР° С„Р°Р№Р»РѕРІ, СЌС‚Рё Р¶Рµ С€Р°РіРё РІС‹РїРѕР»РЅСЏСЋС‚СЃСЏ РґР»СЏ РєР°Р¶РґРѕР№ РєР°СЂС‚РёРЅРєРё РїРѕ РѕС‡РµСЂРµРґРё.",
    step2Title: "РћР±СЂРµР·РєР° Р»РёС†Р° Рё РЅРѕСЂРјР°Р»РёР·Р°С†РёСЏ",
    step2Text: "Р”РµС‚РµРєС‚РѕСЂ РёС‰РµС‚ РѕР±Р»Р°СЃС‚СЊ Р»РёС†Р°, РІС‹СЂРµР·Р°РµС‚ РїРѕР»РµР·РЅС‹Р№ С„СЂР°РіРјРµРЅС‚, РїСЂРёРІРѕРґРёС‚ РµРіРѕ Рє РІС…РѕРґРЅРѕРјСѓ СЂР°Р·РјРµСЂСѓ СЃРµС‚Рё Рё РЅРѕСЂРјР°Р»РёР·СѓРµС‚ Р·РЅР°С‡РµРЅРёСЏ С†РІРµС‚Р° Рё СЏСЂРєРѕСЃС‚Рё.",
    step3Title: "РР·РІР»РµС‡РµРЅРёРµ РїСЂРёР·РЅР°РєРѕРІ",
    step3Text: "РќРµР№СЂРѕСЃРµС‚СЊ РїСЂРµРІСЂР°С‰Р°РµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ Р»РёС†Р° РІ С‡РёСЃР»РѕРІРѕР№ РІРµРєС‚РѕСЂ РїСЂРёР·РЅР°РєРѕРІ, РёР»Рё embedding. РўР°РєРѕР№ РІРµРєС‚РѕСЂ РѕРїРёСЃС‹РІР°РµС‚ Р»РёС†Рѕ РєРѕРјРїР°РєС‚РЅРµРµ Рё СѓСЃС‚РѕР№С‡РёРІРµРµ, С‡РµРј СЃС‹СЂС‹Рµ РїРёРєСЃРµР»Рё.",
    step4Title: "РЎСЂР°РІРЅРµРЅРёРµ СЃ СЌС‚Р°Р»РѕРЅР°РјРё",
    step4Text: "РќРѕРІС‹Р№ embedding СЃСЂР°РІРЅРёРІР°РµС‚СЃСЏ СЃ СЃРѕС…СЂР°РЅРµРЅРЅС‹РјРё СЌС‚Р°Р»РѕРЅРЅС‹РјРё embedding РёР·РІРµСЃС‚РЅС‹С… Р»СЋРґРµР№. Р‘Р»РёР¶Р°Р№С€РёР№ СЌС‚Р°Р»РѕРЅ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ best label, Р° РІС‚РѕСЂРѕР№ Р±Р»РёР¶Р°Р№С€РёР№ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РєР°Рє runner up.",
    step5Title: "Р РµС€РµРЅРёРµ РїРѕ score Рё margin",
    step5Text: "РћС‚РІРµС‚ РїСЂРёРЅРёРјР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РµСЃР»Рё Р»СѓС‡С€РёР№ score РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РІС‹СЃРѕРєРёР№ Рё РѕС‚СЂС‹РІ РѕС‚ РІС‚РѕСЂРѕРіРѕ СЂРµР·СѓР»СЊС‚Р°С‚Р° РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±РѕР»СЊС€РѕР№. РРЅР°С‡Рµ СЃРёСЃС‚РµРјР° РІРѕР·РІСЂР°С‰Р°РµС‚ Unknown, С‡С‚РѕР±С‹ РЅРµ РїРѕРґСЃС‚Р°РІР»СЏС‚СЊ РЅРµРїСЂР°РІРёР»СЊРЅРѕРµ РёРјСЏ.",
    step6Title: "JSON-РѕС‚РІРµС‚",
    step6Text: "РРЅС‚РµСЂС„РµР№СЃ РїРѕР»СѓС‡Р°РµС‚ РєРѕСЂРѕС‚РєРѕРµ С‚РµРєСЃС‚РѕРІРѕРµ СЂРµР·СЋРјРµ Рё JSON СЃ РёРјРµРЅРµРј, best score, runner up, margin, СЂРµР¶РёРјРѕРј backend, РІСЂРµРјРµРЅРµРј РІС‹РїРѕР»РЅРµРЅРёСЏ Рё С„Р»Р°РіРѕРј accepted.",
    modeExplainTitle: "Р РµР¶РёРј GPU Рё CPU",
    modeExplainText: "GPU-СЂРµР¶РёРј РІС‹РїРѕР»РЅСЏРµС‚ С‚СЏР¶РµР»С‹Рµ РѕРїРµСЂР°С†РёРё РЅР°Рґ РёР·РѕР±СЂР°Р¶РµРЅРёСЏРјРё Рё РІРµРєС‚РѕСЂР°РјРё С‡РµСЂРµР· СѓСЃРєРѕСЂРёС‚РµР»СЊ. CPU-СЂРµР¶РёРј РІС‹РїРѕР»РЅСЏРµС‚ С‚Сѓ Р¶Рµ Р»РѕРіРёРєСѓ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ РЅР° РїСЂРѕС†РµСЃСЃРѕСЂРµ. РћР¶РёРґР°РµРјС‹Р№ РѕС‚РІРµС‚ РїРѕ Р»РёС‡РЅРѕСЃС‚Рё РґРѕР»Р¶РµРЅ РѕСЃС‚Р°РІР°С‚СЊСЃСЏ С‚РµРј Р¶Рµ; СЂР°Р·РЅРёС†Р° РІ РѕСЃРЅРѕРІРЅРѕРј РІ С‚РѕРј, РіРґРµ РёРґСѓС‚ РІС‹С‡РёСЃР»РµРЅРёСЏ Рё СЃРєРѕР»СЊРєРѕ РІСЂРµРјРµРЅРё РѕРЅРё Р·Р°РЅРёРјР°СЋС‚.",
    complexKicker: "РРќРўР•Р“Р РР РћР’РђРќРќР«Р™ Р Р•Р–РРњ",
    complexTitle: "РРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅС‹Р№ РёРЅС‚РµСЂС„РµР№СЃ РїСЂРѕРµРєС‚Р°",
    openHive: "РћС‚РєСЂС‹С‚СЊ Р»РѕРєР°Р»СЊРЅС‹Р№ Hive",
    openBeeBoard: "РћС‚РєСЂС‹С‚СЊ BeeBoard 3D",
    openPhysical: "РћС‚РєСЂС‹С‚СЊ РєР°Р»РёР±СЂРѕРІРєСѓ РєСЂС‹Р»СЊРµРІ",
    openUrsina: "РћС‚РєСЂС‹С‚СЊ Ursina 3D",
    downloadUrsina: "Ursina РёРЅСЃС‚Р°Р»Р»РµСЂ",
    downloadBeeBoard: "BeeBoard РёРЅСЃС‚Р°Р»Р»РµСЂ",
    downloadPhysical: "Р¤РёР·РёС‡РµСЃРєРёР№ РёРЅСЃС‚Р°Р»Р»РµСЂ",
    back: "РќР°Р·Р°Рґ"
  },
  he: {
    kicker: "COLAB GPU / Ч–Ч™Ч”Ч•Ч™ Ч¤Ч Ч™Чќ / ЧћЧћЧ©Ч§ Ч¤ЧЁЧ•Ч™Ч§Ч",
    title: "Ч‘ЧЁЧ•Ч›Ч™Чќ Ч”Ч‘ЧђЧ™Чќ ЧђЧњ Bee Face Recognition Project",
    lead: "Ч”ЧўЧњЧ• Ч¦Ч™ЧњЧ•ЧћЧ™ ЧћЧЎЧљ, Ч”Ч¤ЧўЧ™ЧњЧ• Ч–Ч™Ч”Ч•Ч™ Ч¤Ч Ч™Чќ Ч“ЧЁЧљ Ч’ЧњЧђЧ™ Colab Ч”ЧћЧ—Ч•Ч‘ЧЁ, Ч•Ч¦Ч¤Ч• Ч‘ЧђЧ•ЧЄЧ• Ч–ЧЁЧќ ЧЄЧ•Ч¦ЧђЧ•ЧЄ Ч‘ЧћЧћЧ©Ч§ AI MIPS Ч”ЧћЧ©Ч•ЧњЧ‘.",
    simple: "Ч”Ч“Ч’ЧћЧ” Ч¤Ч©Ч•ЧЧ”",
    complex: "Ч”Ч“Ч’ЧћЧ” ЧћЧ•ЧЁЧ›Ч‘ЧЄ Ч”ЧћЧ©Ч•ЧњЧ‘ЧЄ Ч‘Ч¤ЧЁЧ•Ч™Ч§Ч",
    toolColab: "ЧћЧ—Ч‘ЧЁЧЄ Colab Ч©Чњ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч",
    toolColabText: "Ч¤ЧЄЧ™Ч—ЧЄ Ч’ЧЁЧЎЧЄ CUDA/Colab Ч©Чњ Ч”Ч’ЧњЧђЧ™ ЧћЧЄЧ•Чљ Ч”ЧћЧђЧ’ЧЁ.",
    toolUrsina: "ЧћЧЄЧ§Ч™Чџ ЧћЧ©Ч—Ч§ Ursina",
    toolUrsinaText: "Ч”Ч•ЧЁЧ“ЧЄ Ч—Ч‘Ч™ЧњЧЄ ЧћЧ©Ч—Ч§ Ursina ЧћЧ§Ч•ЧћЧ™ЧЄ.",
    toolBeeBoard: "ЧћЧЄЧ§Ч™Чџ BeeBoard",
    toolBeeBoardText: "Ч”Ч•ЧЁЧ“ЧЄ Ч—Ч‘Ч™ЧњЧЄ ЧћЧћЧ©Ч§ BeeBoard ЧћЧ§Ч•ЧћЧ™ЧЄ.",
    toolPhysical: "ЧћЧЄЧ§Ч™Чџ ЧЎЧ™ЧћЧ•ЧњЧ¦Ч™Ч” Ч¤Ч™Ч–Ч™ЧЄ",
    toolPhysicalText: "Ч”Ч•ЧЁЧ“ЧЄ Ч—Ч‘Ч™ЧњЧЄ Ч”ЧЎЧ™ЧћЧ•ЧњЧ¦Ч™Ч” Ч”Ч¤Ч™Ч–Ч™ЧЄ Ч”ЧћЧ§Ч•ЧћЧ™ЧЄ.",
    simpleKicker: "ЧћЧ¦Ч‘ Ч¤Ч©Ч•Ч",
    simpleTitle: "Ч”Ч“Ч’ЧћЧЄ Ч–Ч™Ч”Ч•Ч™ Ч¤Ч Ч™Чќ Ч¤Ч©Ч•ЧЧ”",
    simpleNote: "Ч”ЧўЧњЧ• ЧЄЧћЧ•Ч Ч” ЧђЧ—ЧЄ ЧђЧ• Ч§Ч‘Ч•Ч¦Ч”, Ч‘Ч—ЧЁЧ• GPU ЧђЧ• CPU Ч•ЧњЧ—Ч¦Ч• Recognize.",
    imageTitle: "ЧЄЧћЧ•Ч Ч” / Ч¦Ч™ЧњЧ•Чќ ЧћЧЎЧљ",
    dropHint: "Ч‘Ч—ЧЁЧ• ЧЄЧћЧ•Ч Ч” ЧђЧ—ЧЄ ЧђЧ• Ч™Ч•ЧЄЧЁ ЧњЧ Ч™ЧЄЧ•Ч— GPU/CPU.",
    score: "ЧЎЧЈ score ЧћЧ™Ч Ч™ЧћЧњЧ™",
    margin: "ЧЎЧЈ margin ЧћЧ™Ч Ч™ЧћЧњЧ™",
    recognize: "Recognize",
    resultTitle: "ЧЄЧ•Ч¦ЧђЧЄ Ч”Ч’ЧњЧђЧ™",
    summary: "Ч”ЧўЧњЧ• ЧЄЧћЧ•Ч Ч” Ч•ЧњЧ—Ч¦Ч• Recognize.",
    json: "JSON Ч©Чњ Ч”Ч’ЧњЧђЧ™",
    howKicker: "ЧђЧ™Чљ Ч”Ч’ЧњЧђЧ™ ЧўЧ•Ч‘Ч“",
    howTitle: "ЧћЧ” Ч§Ч•ЧЁЧ” ЧњЧЄЧћЧ•Ч Ч” Ч‘ЧЄЧ•Чљ Ч”ЧЁЧ©ЧЄ Ч”ЧўЧ¦Ч‘Ч™ЧЄ",
    howIntro: "Ч”Ч”Ч“Ч’ЧћЧ” Ч©Ч•ЧњЧ—ЧЄ ЧђЧЄ Ч”ЧЄЧћЧ•Ч Ч” Ч©Ч Ч‘Ч—ЧЁЧ” ЧђЧњ Ч’ЧњЧђЧ™ Colab Ч”ЧћЧ—Ч•Ч‘ЧЁ. ЧђЧ•ЧЄЧ” Ч©ЧЁЧ©ЧЁЧЄ Ч–Ч™Ч”Ч•Ч™ ЧћЧ©ЧћЧ©ЧЄ Ч’Чќ Ч‘Ч—ЧњЧ•Чџ Ч”Ч¤Ч©Ч•Ч Ч•Ч’Чќ Ч‘ЧћЧћЧ©Ч§ Hive Ч”ЧћЧ©Ч•ЧњЧ‘ Ч©Чњ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч.",
    step1Title: "Ч§ЧњЧ ЧЄЧћЧ•Ч Ч”",
    step1Text: "Ч¦Ч™ЧњЧ•Чќ Ч”ЧћЧЎЧљ Ч©Ч”Ч•ЧўЧњЧ” Ч Ч§ЧЁЧђ Ч›Ч¤Ч™Ч§ЧЎЧњЧ™Чќ. ЧђЧќ Ч Ч‘Ч—ЧЁЧЄ Ч§Ч‘Ч•Ч¦Ч” Ч©Чњ Ч§Ч‘Ч¦Ч™Чќ, ЧђЧ•ЧЄЧќ Ч©ЧњЧ‘Ч™Чќ ЧћЧЄЧ‘Ч¦ЧўЧ™Чќ ЧўЧ‘Ч•ЧЁ Ч›Чњ ЧЄЧћЧ•Ч Ч” Ч‘Ч Ч¤ЧЁЧ“.",
    step2Title: "Ч—Ч™ЧЄЧ•Чљ Ч¤Ч Ч™Чќ Ч•Ч ЧЁЧћЧ•Чњ",
    step2Text: "Ч”Ч’ЧњЧђЧ™ ЧћЧ—Ч¤Ч© ЧђЧЄ ЧђЧ–Ч•ЧЁ Ч”Ч¤Ч Ч™Чќ, Ч—Ч•ЧЄЧљ ЧђЧЄ Ч”Ч—ЧњЧ§ Ч”Ч—Ч©Ч•Ч‘, ЧћЧ©Ч Ч” ЧђЧ•ЧЄЧ• ЧњЧ’Ч•Ч“Чњ Ч”Ч§ЧњЧ Ч©Чњ Ч”ЧЁЧ©ЧЄ Ч•ЧћЧ ЧЁЧћЧњ ЧўЧЁЧ›Ч™ Ч¦Ч‘Чў Ч•Ч‘Ч”Ч™ЧЁЧ•ЧЄ.",
    step3Title: "Ч—Ч™ЧњЧ•ЧҐ ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ",
    step3Text: "Ч”ЧЁЧ©ЧЄ Ч”ЧўЧ¦Ч‘Ч™ЧЄ ЧћЧћЧ™ЧЁЧ” ЧђЧЄ ЧЄЧћЧ•Ч ЧЄ Ч”Ч¤Ч Ч™Чќ ЧњЧ•Ч•Ч§ЧЧ•ЧЁ ЧћЧЎЧ¤ЧЁЧ™ Ч©Чњ ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ, Ч”Ч Ч§ЧЁЧђ Ч’Чќ embedding. Ч”Ч•Ч•Ч§ЧЧ•ЧЁ ЧћЧЄЧђЧЁ ЧђЧЄ Ч“Ч¤Ч•ЧЎ Ч”Ч¤Ч Ч™Чќ Ч‘Ч¦Ч•ЧЁЧ” Ч§Ч•ЧћЧ¤Ч§ЧЧ™ЧЄ Ч™Ч•ЧЄЧЁ ЧћЧ¤Ч™Ч§ЧЎЧњЧ™Чќ Ч’Ч•ЧњЧћЧ™Ч™Чќ.",
    step4Title: "Ч”Ч©Ч•Ч•ЧђЧ” ЧњЧ“Ч•Ч’ЧћЧђЧ•ЧЄ Ч™Ч™Ч—Ч•ЧЎ",
    step4Text: "Ч”-embedding Ч”Ч—Ч“Ч© ЧћЧ•Ч©Ч•Ч•Ч” Чњ-embeddings Ч©ЧћЧ•ЧЁЧ™Чќ Ч©Чњ Ч–Ч”Ч•Ч™Ч•ЧЄ ЧћЧ•Ч›ЧЁЧ•ЧЄ. Ч”Ч–Ч”Ч•ЧЄ Ч”Ч§ЧЁЧ•Ч‘Ч” Ч‘Ч™Ч•ЧЄЧЁ Ч”Ч•Ч¤Ч›ЧЄ Чњ-best label, Ч•Ч”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч©Ч Ч™Ч™Ч” Ч Ч©ЧћЧЁЧЄ Ч›-runner up.",
    step5Title: "Ч”Ч—ЧњЧЧ” ЧњЧ¤Ч™ score Ч•-margin",
    step5Text: "Ч”ЧЄЧ©Ч•Ч‘Ч” ЧћЧЄЧ§Ч‘ЧњЧЄ ЧЁЧ§ ЧђЧќ Ч”-score Ч”ЧЧ•Ч‘ Ч‘Ч™Ч•ЧЄЧЁ Ч’Ч‘Ч•Ч” ЧћЧЎЧ¤Ч™Ч§ Ч•Ч”ЧћЧЁЧ—Ч§ ЧћЧ”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч©Ч Ч™Ч™Ч” Ч’Ч“Ч•Чњ ЧћЧЎЧ¤Ч™Ч§. ЧђЧ—ЧЁЧЄ ЧћЧ•Ч—Ч–ЧЁ Unknown Ч›Ч“Ч™ ЧњЧђ ЧњЧ›Ч¤Ч•ЧЄ Ч©Чќ Ч©Ч’Ч•Ч™.",
    step6Title: "ЧЄЧ’Ч•Ч‘ЧЄ JSON",
    step6Text: "Ч”ЧћЧћЧ©Ч§ ЧћЧ§Ч‘Чњ ЧЄЧ§Ч¦Ч™ЧЁ Ч§ЧЁЧ™Чђ Ч•ЧђЧ•Ч‘Ч™Ч™Ч§Ч JSON ЧўЧќ Ч”Ч–Ч”Ч•ЧЄ, best score, runner up, margin, ЧћЧ¦Ч‘ backend, Ч–ЧћЧџ ЧЁЧ™Ч¦Ч” Ч•Ч“Ч’Чњ accepted.",
    modeExplainTitle: "ЧћЧ¦Ч‘Ч™ GPU Ч•-CPU",
    modeExplainText: "ЧћЧ¦Ч‘ GPU ЧћЧЁЧ™ЧҐ ЧђЧЄ Ч¤ЧўЧ•ЧњЧ•ЧЄ Ч”ЧЄЧћЧ•Ч Ч” Ч•Ч”Ч•Ч•Ч§ЧЧ•ЧЁЧ™Чќ Ч”Ч›Ч‘Ч“Ч•ЧЄ Ч‘ЧћЧЎЧњЧ•Чњ Ч”ЧћЧђЧ™ЧҐ. ЧћЧ¦Ч‘ CPU ЧћЧЁЧ™ЧҐ ЧђЧЄ ЧђЧ•ЧЄЧ” ЧњЧ•Ч’Ч™Ч§ЧЄ Ч–Ч™Ч”Ч•Ч™ ЧўЧњ Ч”ЧћЧўЧ‘Ч“. ЧЄЧ•Ч¦ЧђЧЄ Ч”Ч–Ч”Ч•ЧЄ Ч”Ч¦Ч¤Ч•Ч™Ч” ЧђЧћЧ•ЧЁЧ” ЧњЧ”Ч™Ч©ЧђЧЁ Ч–Ч”Ч”; Ч”Ч”Ч‘Ч“Чњ Ч”Ч•Чђ Ч‘ЧўЧ™Ч§ЧЁ Ч”Ч™Ч›Чџ Ч”Ч—Ч™Ч©Ч•Ч‘ ЧћЧЄЧ‘Ч¦Чў Ч•Ч›ЧћЧ” Ч–ЧћЧџ Ч”Ч•Чђ ЧњЧ•Ч§Ч—.",
    complexKicker: "ЧћЧ¦Ч‘ ЧћЧ©Ч•ЧњЧ‘",
    complexTitle: "ЧћЧћЧ©Ч§ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч Ч”ЧћЧ©Ч•ЧњЧ‘",
    openHive: "Ч¤ЧЄЧ™Ч—ЧЄ Hive ЧћЧ§Ч•ЧћЧ™",
    openBeeBoard: "Ч¤ЧЄЧ™Ч—ЧЄ BeeBoard 3D",
    openPhysical: "Ч¤ЧЄЧ™Ч—ЧЄ Ч›Ч™Ч•Чњ Ч›Ч Ч¤Ч™Ч™Чќ",
    openUrsina: "Ч¤ЧЄЧ™Ч—ЧЄ Ursina 3D",
    downloadUrsina: "ЧћЧЄЧ§Ч™Чџ Ursina",
    downloadBeeBoard: "ЧћЧЄЧ§Ч™Чџ BeeBoard",
    downloadPhysical: "ЧћЧЄЧ§Ч™Чџ Ч¤Ч™Ч–Ч™",
    back: "Ч—Ч–ЧЁЧ”"
  }
};

Object.assign(translations.en, {
  sourceKicker: "COMPLETE RECOGNITION CODE",
  sourceTitle: "All six stages in one continuous code listing",
  sourceIntro: "The listing below is assembled only from the exact full code displayed in stages 1–6, in the same order. Its line count is checked automatically against the sum of the six stage line counts.",
  openDetectorSource: "Show the complete combined code",
  hideDetectorSource: "Hide the complete combined code",
  sourceClosed: "Closed. Open it to verify the total against stages 1–6.",
  sourceLoading: "Loading the exact code for all six stages...",
  sourceLoaded: "Verified: {total} lines in the complete code = {sum} lines across stages 1–6.",
  sourceCountError: "Line-count error: {total} lines in the complete code, but the six stages contain {sum}.",
  sourceError: "Could not assemble the complete code from stages 1–6.",
  fullStageLoading: "Loading this stage's exact blocks from the source files...",
  fullStageExact: "Exact blocks for this stage, extracted automatically from the source",
  fullStageNotebook: "Exact block from the Colab notebook — the same file can be opened below",
  fullStageDetector: "Exact block from the detector module — the same file can be opened below",
  fullStageError: "Could not load exact stage blocks; only the short sketch is shown."
});

Object.assign(translations.ru, {
  sourceKicker: "РџРћР›РќР«Р™ РРЎРҐРћР”РќРРљ Р”Р•РўР•РљРўРћР Рђ",
  sourceTitle: "РџРѕР»РЅР°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ РЅРµР№СЂРѕСЃРµС‚РµРІРѕРіРѕ СЂР°СЃРїРѕР·РЅР°РІР°С‚РµР»СЏ",
  sourceIntro: "РћС‚РєСЂРѕР№С‚Рµ РїРѕР»РЅС‹Р№ РјРѕРґСѓР»СЊ Colab-РґРµС‚РµРєС‚РѕСЂР°, РєРѕРіРґР° РЅСѓР¶РЅРѕ СѓРІРёРґРµС‚СЊ РІСЃРµ С‡Р°СЃС‚Рё РІРѕРєСЂСѓРі С€РµСЃС‚Рё СЌС‚Р°РїРѕРІ РІС‹С‡РёСЃР»РµРЅРёР№: РёРјРїРѕСЂС‚С‹, Р·Р°РіСЂСѓР·РєСѓ РІРµСЃРѕРІ, РІС‹Р±РѕСЂ CUDA, РјРѕРґРµР»СЊ DeepID, РїСЂРµРїСЂРѕС†РµСЃСЃРёРЅРі, СЌС‚Р°Р»РѕРЅРЅС‹Рµ embeddings, batch-СЂР°СЃРїРѕР·РЅР°РІР°РЅРёРµ, РїСЂР°РІРёР»Р° СЂРµС€РµРЅРёСЏ Рё JSON/API-СЃРІСЏР·РєСѓ.",
  openDetectorSource: "РћС‚РєСЂС‹С‚СЊ РїРѕР»РЅС‹Р№ РёСЃС…РѕРґРЅРёРє РґРµС‚РµРєС‚РѕСЂР°",
  hideDetectorSource: "РЎРєСЂС‹С‚СЊ РїРѕР»РЅС‹Р№ РёСЃС…РѕРґРЅРёРє РґРµС‚РµРєС‚РѕСЂР°",
  openRawDetectorSource: "РћС‚РєСЂС‹С‚СЊ raw-С„Р°Р№Р» РёСЃС…РѕРґРЅРёРєР°",
  sourceClosed: "Р—Р°РєСЂС‹С‚Рѕ. РСЃРїРѕР»СЊР·СѓР№С‚Рµ СЌС‚Рѕ, РєРѕРіРґР° С„СЂР°РіРјРµРЅС‚РѕРІ СЌС‚Р°РїРѕРІ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ.",
  sourceLoading: "Р—Р°РіСЂСѓР¶Р°СЋ РёСЃС…РѕРґРЅРёРє РґРµС‚РµРєС‚РѕСЂР° РёР· СЂРµРїРѕР·РёС‚РѕСЂРёСЏ...",
  sourceLoaded: "РџРѕРєР°Р·Р°РЅ С‚РѕС‡РЅС‹Р№ РёСЃС…РѕРґРЅРёРє РЅРµР№СЂРѕСЃРµС‚РµРІРѕРіРѕ РґРµС‚РµРєС‚РѕСЂР°, СЃРєРѕРїРёСЂРѕРІР°РЅРЅС‹Р№ РёР· Colab-РјРѕРґСѓР»СЏ. РЎСЃС‹Р»РєР° raw РѕС‚РєСЂС‹РІР°РµС‚ РїРѕР»РЅС‹Р№ РјРѕРґСѓР»СЊ.",
  sourceError: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» РёСЃС…РѕРґРЅРёРєР° РґРµС‚РµРєС‚РѕСЂР° СЃ СЌС‚РѕРіРѕ СЃР°Р№С‚Р°."
});

Object.assign(translations.he, {
  sourceKicker: "Ч§Ч•Ч“ ЧћЧ§Ч•ЧЁ ЧћЧњЧђ Ч©Чњ Ч”Ч’ЧњЧђЧ™",
  sourceTitle: "ЧћЧ™ЧћЧ•Ч© ЧћЧњЧђ Ч©Чњ ЧћЧ–Ч”Ч” Ч”Ч¤Ч Ч™Чќ Ч”Ч Ч•Ч™ЧЁЧ•Ч Ч™",
  sourceIntro: "Ч¤ЧЄЧ—Ч• ЧђЧЄ ЧћЧ•Ч“Ч•Чњ Ч’ЧњЧђЧ™ Ч”-Colab Ч”ЧћЧњЧђ Ч›ЧђЧ©ЧЁ Ч¦ЧЁЧ™Чљ ЧњЧ‘Ч“Ч•Ч§ ЧђЧЄ Ч›Чњ Ч”Ч—ЧњЧ§Ч™Чќ Ч©ЧћЧЎЧ‘Ч™Ч‘ ЧњЧ©Ч©ЧЄ Ч©ЧњЧ‘Ч™ Ч”Ч—Ч™Ч©Ч•Ч‘: Ч™Ч‘Ч•Чђ ЧЎЧ¤ЧЁЧ™Ч•ЧЄ, ЧЧўЧ™Ч ЧЄ ЧћЧ©Ч§ЧњЧ™Чќ, Ч‘Ч—Ч™ЧЁЧЄ CUDA, ЧћЧ•Ч“Чњ DeepID, ЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ, embeddings ЧњЧ™Ч™Ч—Ч•ЧЎ, Ч–Ч™Ч”Ч•Ч™ Ч‘ЧђЧ¦Ч•Ч•Ч”, Ч›ЧњЧњЧ™ Ч”Ч—ЧњЧЧ” Ч•Ч—Ч™Ч‘Ч•ЧЁ JSON/API.",
  openDetectorSource: "Ч¤ЧЄЧ— Ч§Ч•Ч“ ЧћЧ§Ч•ЧЁ ЧћЧњЧђ Ч©Чњ Ч”Ч’ЧњЧђЧ™",
  hideDetectorSource: "Ч”ЧЎЧЄЧЁ Ч§Ч•Ч“ ЧћЧ§Ч•ЧЁ ЧћЧњЧђ Ч©Чњ Ч”Ч’ЧњЧђЧ™",
  openRawDetectorSource: "Ч¤ЧЄЧ— Ч§Ч•Ч‘ЧҐ ЧћЧ§Ч•ЧЁ raw",
  sourceClosed: "ЧЎЧ’Ч•ЧЁ. Ч”Ч©ЧЄЧћЧ©Ч• Ч‘Ч–Ч” Ч›ЧђЧ©ЧЁ Ч§ЧЧўЧ™ Ч”Ч©ЧњЧ‘Ч™Чќ ЧђЧ™Ч Чќ ЧћЧЎЧ¤Ч™Ч§Ч™Чќ.",
  sourceLoading: "ЧЧ•ЧўЧџ ЧђЧЄ Ч§Ч•Ч“ Ч”ЧћЧ§Ч•ЧЁ Ч©Чњ Ч”Ч’ЧњЧђЧ™ ЧћЧ”ЧћЧђЧ’ЧЁ...",
  sourceLoaded: "ЧћЧ•Ч¦Ч’ Ч§Ч•Ч“ Ч”ЧћЧ§Ч•ЧЁ Ч”ЧћЧ“Ч•Ч™Ч§ Ч©Чњ Ч”Ч’ЧњЧђЧ™ Ч”Ч Ч•Ч™ЧЁЧ•Ч Ч™ Ч©Ч”Ч•ЧўЧЄЧ§ ЧћЧћЧ•Ч“Ч•Чњ Colab. Ч§Ч™Ч©Ч•ЧЁ raw Ч¤Ч•ЧЄЧ— ЧђЧЄ Ч”ЧћЧ•Ч“Ч•Чњ Ч”ЧћЧњЧђ.",
  sourceError: "ЧњЧђ Ч Ч™ЧЄЧџ ЧњЧЧўЧ•Чџ ЧђЧЄ Ч§Ч•Ч‘ЧҐ Ч”ЧћЧ§Ч•ЧЁ Ч©Чњ Ч”Ч’ЧњЧђЧ™ ЧћЧ”ЧђЧЄЧЁ."
});

const detailUi = {
  en: {
    openStage: "Open scheme",
    schemeTitle: "Scheme",
    stageStatsTitle: "Layers and neural connections",
    layersLabel: "Layers / operations",
    connectionsLabel: "Neuron connections / MACs",
    tensorLabel: "Tensor / vector size",
    cudaLabel: "CUDA mapping",
    cudaTitle: "CUDA implementation in this project",
    nextLevel: "Next level",
    prevLevel: "Previous level",
    backToSimple: "Return to simple demonstration"
  },
  ru: {
    openStage: "РћС‚РєСЂС‹С‚СЊ СЃС…РµРјСѓ",
    schemeTitle: "РЎС…РµРјР°",
    stageStatsTitle: "РЎР»РѕРё Рё СЃРІСЏР·Рё РЅРµР№СЂРѕРЅРѕРІ",
    layersLabel: "РЎР»РѕРё / РѕРїРµСЂР°С†РёРё",
    connectionsLabel: "РЎРІСЏР·Рё РЅРµР№СЂРѕРЅРѕРІ / MAC",
    tensorLabel: "Р Р°Р·РјРµСЂ С‚РµРЅР·РѕСЂР° / РІРµРєС‚РѕСЂР°",
    cudaLabel: "Р Р°СЃРєР»Р°РґРєР° CUDA",
    cudaTitle: "РљР°Рє СЌС‚Рѕ СЂРµР°Р»РёР·СѓРµС‚СЃСЏ РІ CUDA РІ РїСЂРѕРµРєС‚Рµ",
    nextLevel: "РЎР»РµРґСѓСЋС‰РёР№ СѓСЂРѕРІРµРЅСЊ",
    prevLevel: "РџСЂРµРґС‹РґСѓС‰РёР№ СѓСЂРѕРІРµРЅСЊ",
    backToSimple: "Р’РµСЂРЅСѓС‚СЊСЃСЏ РІ РїСЂРѕСЃС‚СѓСЋ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЋ"
  },
  he: {
    openStage: "Ч¤ЧЄЧ— ЧЄЧЁЧ©Ч™Чќ",
    schemeTitle: "ЧЄЧЁЧ©Ч™Чќ",
    stageStatsTitle: "Ч©Ч›Ч‘Ч•ЧЄ Ч•Ч§Ч©ЧЁЧ™ Ч Ч•Ч™ЧЁЧ•Ч Ч™Чќ",
    layersLabel: "Ч©Ч›Ч‘Ч•ЧЄ / Ч¤ЧўЧ•ЧњЧ•ЧЄ",
    connectionsLabel: "Ч§Ч©ЧЁЧ™ Ч Ч•Ч™ЧЁЧ•Ч Ч™Чќ / MAC",
    tensorLabel: "Ч’Ч•Ч“Чњ ЧЧ Ч–Ч•ЧЁ / Ч•Ч§ЧЧ•ЧЁ",
    cudaLabel: "ЧћЧ™Ч¤Ч•Ч™ CUDA",
    cudaTitle: "ЧђЧ™Чљ Ч–Ч” ЧћЧћЧ•ЧћЧ© Ч‘-CUDA Ч‘Ч¤ЧЁЧ•Ч™Ч§Ч",
    nextLevel: "Ч”Ч©ЧњЧ‘ Ч”Ч‘Чђ",
    prevLevel: "Ч”Ч©ЧњЧ‘ Ч”Ч§Ч•Ч“Чќ",
    backToSimple: "Ч—Ч–ЧЁЧ” ЧњЧ”Ч“Ч’ЧћЧ” Ч”Ч¤Ч©Ч•ЧЧ”"
  }
};

Object.assign(detailUi.ru, {
  openFullCode: "РћС‚РєСЂС‹С‚СЊ РїРѕР»РЅС‹Р№ Colab/CUDA РєРѕРґ СЌС‚РѕРіРѕ СЌС‚Р°РїР°",
  showShortCode: "РџРѕРєР°Р·Р°С‚СЊ РєРѕСЂРѕС‚РєСѓСЋ СЃС…РµРјСѓ СЌС‚Р°РїР°",
  codeSourceShort: "РљРѕСЂРѕС‚РєР°СЏ CUDA-СЃС…РµРјР° СЌС‚Р°РїР°",
  codeSourceFull: "РџРѕР»РЅС‹Р№ РєРѕРґ РёР· Colab-РґРµС‚РµРєС‚РѕСЂР° РґР»СЏ СЌС‚РѕРіРѕ СЌС‚Р°РїР°"
});

Object.assign(detailUi.he, {
  openFullCode: "Ч¤ЧЄЧ— ЧђЧЄ Ч§Ч•Ч“ Colab/CUDA Ч”ЧћЧњЧђ Ч©Чњ Ч”Ч©ЧњЧ‘",
  showShortCode: "Ч”Ч¦Ч’ ЧЄЧЁЧ©Ч™Чќ Ч§Ч•Ч“ Ч§Ч¦ЧЁ",
  codeSourceShort: "ЧЄЧЁЧ©Ч™Чќ CUDA Ч§Ч¦ЧЁ Ч©Чњ Ч”Ч©ЧњЧ‘",
  codeSourceFull: "Ч”Ч§Ч•Ч“ Ч”ЧћЧњЧђ Ч©Чњ Ч’ЧњЧђЧ™ Colab ЧњЧ©ЧњЧ‘ Ч”Ч–Ч”"
});

const imageInput = document.getElementById("imageInput");
const previewGrid = document.getElementById("previewGrid");
const scoreInput = document.getElementById("scoreInput");
const scoreValue = document.getElementById("scoreValue");
const marginInput = document.getElementById("marginInput");
const marginValue = document.getElementById("marginValue");
const recognizeButton = document.getElementById("recognizeButton");
const summaryBox = document.getElementById("summaryBox");
const resultList = document.getElementById("resultList");
const jsonBox = document.getElementById("jsonBox");
const backendStatus = document.getElementById("backendStatus");
const stageDetail = document.getElementById("stageDetail");
const stageDetailKicker = document.getElementById("stageDetailKicker");
const stageDetailTitle = document.getElementById("stageDetailTitle");
const stageDetailSummary = document.getElementById("stageDetailSummary");
const stageDiagram = document.getElementById("stageDiagram");
const stageLayers = document.getElementById("stageLayers");
const stageConnections = document.getElementById("stageConnections");
const stageTensor = document.getElementById("stageTensor");
const stageCudaShort = document.getElementById("stageCudaShort");
const stageCudaText = document.getElementById("stageCudaText");
const stageCode = document.getElementById("stageCode");
const stageCodeModeButton = document.getElementById("stageCodeMode");
const stageCodeSource = document.getElementById("stageCodeSource");
const stagePrev = document.getElementById("stagePrev");
const stageNext = document.getElementById("stageNext");
const stageReturnTop = document.getElementById("stageReturnTop");
const stageReturnBottom = document.getElementById("stageReturnBottom");
const loadFullDetectorSource = document.getElementById("loadFullDetectorSource");
const fullDetectorSource = document.getElementById("fullDetectorSource");
const fullSourceMeta = document.getElementById("fullSourceMeta");
const detectorVariantDescription = document.getElementById("detectorVariantDescription");
const detectorVariantSource = document.getElementById("detectorVariantSource");
const detectorVariantButtons = Array.from(document.querySelectorAll("[data-detector-variant]"));

const stageDetails = [
  {
    level: "01",
    title: { en: "Image input", ru: "Р’С…РѕРґРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ", he: "Ч§ЧњЧ ЧЄЧћЧ•Ч Ч”" },
    summary: {
      en: "The browser reads each selected file, keeps the original preview, and sends the image bytes to the connected Colab detector.",
      ru: "Р‘СЂР°СѓР·РµСЂ С‡РёС‚Р°РµС‚ РєР°Р¶РґС‹Р№ РІС‹Р±СЂР°РЅРЅС‹Р№ С„Р°Р№Р», РїРѕРєР°Р·С‹РІР°РµС‚ РїСЂРµРІСЊСЋ Рё РѕС‚РїСЂР°РІР»СЏРµС‚ Р±Р°Р№С‚С‹ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ РІ РїРѕРґРєР»СЋС‡РµРЅРЅС‹Р№ Colab-РґРµС‚РµРєС‚РѕСЂ.",
      he: "Ч”Ч“Ч¤Ч“Ч¤Чџ Ч§Ч•ЧЁЧђ Ч›Чњ Ч§Ч•Ч‘ЧҐ Ч©Ч Ч‘Ч—ЧЁ, ЧћЧ¦Ч™Ч’ ЧЄЧ¦Ч•Ч’Ч” ЧћЧ§Ч“Ч™ЧћЧ” Ч•Ч©Ч•ЧњЧ— ЧђЧЄ Ч‘ЧЄЧ™ Ч”ЧЄЧћЧ•Ч Ч” ЧђЧњ Ч’ЧњЧђЧ™ Colab Ч”ЧћЧ—Ч•Ч‘ЧЁ."
    },
    diagram: {
      en: ["File input", "Image bytes", "Decoded RGB pixels", "Network tensor"],
      ru: ["Р’С‹Р±РѕСЂ С„Р°Р№Р»Р°", "Р‘Р°Р№С‚С‹ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ", "RGB-РїРёРєСЃРµР»Рё", "РўРµРЅР·РѕСЂ СЃРµС‚Рё"],
      he: ["Ч‘Ч—Ч™ЧЁЧЄ Ч§Ч•Ч‘ЧҐ", "Ч‘ЧЄЧ™ ЧЄЧћЧ•Ч Ч”", "Ч¤Ч™Ч§ЧЎЧњЧ™ RGB", "ЧЧ Ч–Ч•ЧЁ ЧЁЧ©ЧЄ"]
    },
    layers: { en: "0 neural layers; host decode and resize step", ru: "0 РЅРµР№СЂРѕСЃР»РѕРµРІ; РґРµРєРѕРґРёСЂРѕРІР°РЅРёРµ Рё resize РЅР° host", he: "0 Ч©Ч›Ч‘Ч•ЧЄ ЧўЧ¦Ч‘Ч™Ч•ЧЄ; Ч¤ЧўЧ Ч•Ч— Ч•Ч©Ч™Ч Ч•Ч™ Ч’Ч•Ч“Чњ Ч‘-host" },
    connections: { en: "0 neural MACs; 7,755 input values", ru: "0 РЅРµР№СЂРѕРЅРЅС‹С… MAC; 7 755 РІС…РѕРґРЅС‹С… Р·РЅР°С‡РµРЅРёР№", he: "0 MAC ЧўЧ¦Ч‘Ч™Ч™Чќ; 7,755 ЧўЧЁЧ›Ч™ Ч§ЧњЧ" },
    tensor: "55 x 47 x 3 RGB floats = 7,755 values",
    cudaShort: { en: "Host upload to GPU buffer", ru: "Host Р·Р°РіСЂСѓР¶Р°РµС‚ Р±СѓС„РµСЂ РЅР° GPU", he: "Host ЧћЧўЧњЧ” Ч‘ЧђЧ¤ЧЁ Чњ-GPU" },
    cuda: {
      en: "In the Colab/CUDA path the decoded face tensor is copied into device memory before the DeepID forward pass. The local AMD build mirrors the same contract with OpenCL buffers.",
      ru: "Р’ Colab/CUDA-РїСѓС‚Рё РґРµРєРѕРґРёСЂРѕРІР°РЅРЅС‹Р№ С‚РµРЅР·РѕСЂ Р»РёС†Р° РєРѕРїРёСЂСѓРµС‚СЃСЏ РІ РїР°РјСЏС‚СЊ СѓСЃС‚СЂРѕР№СЃС‚РІР° РїРµСЂРµРґ РїСЂСЏРјС‹Рј РїСЂРѕС…РѕРґРѕРј DeepID. Р›РѕРєР°Р»СЊРЅР°СЏ AMD-РІРµСЂСЃРёСЏ РїРѕРІС‚РѕСЂСЏРµС‚ С‚РѕС‚ Р¶Рµ РєРѕРЅС‚СЂР°РєС‚ С‡РµСЂРµР· OpenCL-Р±СѓС„РµСЂС‹.",
      he: "Ч‘ЧћЧЎЧњЧ•Чњ Colab/CUDA ЧЧ Ч–Ч•ЧЁ Ч”Ч¤Ч Ч™Чќ Ч”ЧћЧ¤Ч•ЧўЧ Ч— ЧћЧ•ЧўЧЄЧ§ ЧњЧ–Ч™Ч›ЧЁЧ•Чџ Ч”Ч”ЧЄЧ§Чџ ЧњЧ¤Ч Ч™ Ч”ЧћЧўЧ‘ЧЁ Ч”Ч§Ч“ЧћЧ™ Ч©Чњ DeepID. Ч’ЧЁЧЎЧЄ AMD Ч”ЧћЧ§Ч•ЧћЧ™ЧЄ ЧћЧ©Ч§Ч¤ЧЄ ЧђЧ•ЧЄЧ• Ч—Ч•Ч–Ч” Ч“ЧЁЧљ Ч‘ЧђЧ¤ЧЁЧ™Чќ Ч©Чњ OpenCL."
    },
    code: `// CUDA commands used in this stage
float input[55 * 47 * 3];
cudaMalloc(&d_input, 55 * 47 * 3 * sizeof(float));
cudaMemcpy(d_input, input, bytes, cudaMemcpyHostToDevice);

// Project meaning:
// the image is only prepared here; the neural kernels start after this buffer exists.`
  },
  {
    level: "02",
    title: { en: "Face crop and normalization", ru: "РћР±СЂРµР·РєР° Р»РёС†Р° Рё РЅРѕСЂРјР°Р»РёР·Р°С†РёСЏ", he: "Ч—Ч™ЧЄЧ•Чљ Ч¤Ч Ч™Чќ Ч•Ч ЧЁЧћЧ•Чњ" },
    summary: {
      en: "The detector finds the useful face region, crops it, resizes it to the fixed DeepID input, and scales color values into a stable numeric range.",
      ru: "Р”РµС‚РµРєС‚РѕСЂ РЅР°С…РѕРґРёС‚ РїРѕР»РµР·РЅСѓСЋ РѕР±Р»Р°СЃС‚СЊ Р»РёС†Р°, РІС‹СЂРµР·Р°РµС‚ РµРµ, РїСЂРёРІРѕРґРёС‚ Рє С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕРјСѓ РІС…РѕРґСѓ DeepID Рё РЅРѕСЂРјР°Р»РёР·СѓРµС‚ Р·РЅР°С‡РµРЅРёСЏ С†РІРµС‚Р°.",
      he: "Ч”Ч’ЧњЧђЧ™ ЧћЧ•Ч¦Чђ ЧђЧЄ ЧђЧ–Ч•ЧЁ Ч”Ч¤Ч Ч™Чќ Ч”Ч—Ч©Ч•Ч‘, Ч—Ч•ЧЄЧљ ЧђЧ•ЧЄЧ•, ЧћЧЄЧђЧ™Чќ ЧђЧ•ЧЄЧ• ЧњЧ§ЧњЧ Ч”Ч§Ч‘Ч•Чў Ч©Чњ DeepID Ч•ЧћЧ ЧЁЧћЧњ ЧўЧЁЧ›Ч™ Ч¦Ч‘Чў."
    },
    diagram: {
      en: ["Raw screenshot", "Face region", "Crop", "55 x 47 normalized tensor"],
      ru: ["РЎС‹СЂРѕР№ СЃРєСЂРёРЅС€РѕС‚", "РћР±Р»Р°СЃС‚СЊ Р»РёС†Р°", "РћР±СЂРµР·РєР°", "55 x 47 РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Р№ С‚РµРЅР·РѕСЂ"],
      he: ["Ч¦Ч™ЧњЧ•Чќ ЧћЧЎЧљ Ч’Ч•ЧњЧћЧ™", "ЧђЧ–Ч•ЧЁ Ч¤Ч Ч™Чќ", "Ч—Ч™ЧЄЧ•Чљ", "ЧЧ Ч–Ч•ЧЁ ЧћЧ Ч•ЧЁЧћЧњ 55 x 47"]
    },
    layers: { en: "0 learned layers; detector scan + normalization", ru: "0 РѕР±СѓС‡Р°РµРјС‹С… СЃР»РѕРµРІ; РїРѕРёСЃРє РѕР±Р»Р°СЃС‚Рё + РЅРѕСЂРјР°Р»РёР·Р°С†РёСЏ", he: "0 Ч©Ч›Ч‘Ч•ЧЄ ЧњЧ•ЧћЧ“Ч•ЧЄ; ЧЎЧЁЧ™Ч§Ч” Ч•Ч ЧЁЧћЧ•Чњ" },
    connections: { en: "9,216 scan cells at 96 x 96; no trainable neural weights", ru: "9 216 СЏС‡РµРµРє СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ 96 x 96; РѕР±СѓС‡Р°РµРјС‹С… РІРµСЃРѕРІ РЅРµС‚", he: "9,216 ЧЄЧђЧ™ ЧЎЧЁЧ™Ч§Ч” 96 x 96; ЧђЧ™Чџ ЧћЧ©Ч§ЧњЧ™Чќ ЧњЧ•ЧћЧ“Ч™Чќ" },
    tensor: "96 x 96 scan -> 55 x 47 x 3 network input",
    cudaShort: { en: "Preprocess before GPU forward", ru: "Preprocess РїРµСЂРµРґ GPU forward", he: "ЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ ЧњЧ¤Ч Ч™ GPU forward" },
    cuda: {
      en: "This stage prepares the tensor for CUDA. It is lightweight compared with the neural forward pass, so the project keeps it as preprocessing and sends the final tensor to GPU kernels.",
      ru: "Р­С‚РѕС‚ СЌС‚Р°Рї РіРѕС‚РѕРІРёС‚ С‚РµРЅР·РѕСЂ РґР»СЏ CUDA. РћРЅ Р»РµРіРєРёР№ РїРѕ СЃСЂР°РІРЅРµРЅРёСЋ СЃ РїСЂСЏРјС‹Рј РїСЂРѕС…РѕРґРѕРј РЅРµР№СЂРѕСЃРµС‚Рё, РїРѕСЌС‚РѕРјСѓ РїСЂРѕРµРєС‚ РґРµСЂР¶РёС‚ РµРіРѕ РєР°Рє preprocessing Рё РѕС‚РїСЂР°РІР»СЏРµС‚ РёС‚РѕРіРѕРІС‹Р№ С‚РµРЅР·РѕСЂ РІ GPU kernels.",
      he: "Ч©ЧњЧ‘ Ч–Ч” ЧћЧ›Ч™Чџ ЧђЧЄ Ч”ЧЧ Ч–Ч•ЧЁ Чњ-CUDA. Ч”Ч•Чђ Ч§Чњ Ч™Ч—ЧЎЧ™ЧЄ ЧњЧћЧўЧ‘ЧЁ Ч”ЧЁЧ©ЧЄ, ЧњЧ›Чџ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч Ч©Ч•ЧћЧЁ ЧђЧ•ЧЄЧ• Ч›ЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ Ч•Ч©Ч•ЧњЧ— ЧђЧЄ Ч”ЧЧ Ч–Ч•ЧЁ Ч”ЧЎЧ•Ч¤Ч™ ЧњЧ§ЧЁЧ ЧњЧ™Чќ Ч©Чњ GPU."
    },
    code: `// CUDA commands used in this stage
normalize_rgb(face_crop, input_55x47x3);  // host preprocessing
cudaMemcpy(d_input, input_55x47x3, bytes, cudaMemcpyHostToDevice);

// Optional CUDA form for this same step:
normalize_resize_kernel<<<grid2d, block2d>>>(d_raw, d_input);
cudaDeviceSynchronize();`
  },
  {
    level: "03",
    title: { en: "Feature extraction", ru: "РР·РІР»РµС‡РµРЅРёРµ РїСЂРёР·РЅР°РєРѕРІ", he: "Ч—Ч™ЧњЧ•ЧҐ ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ" },
    summary: {
      en: "DeepID converts the normalized face into a 160-number embedding. This is the heavy neural stage and the main GPU/CUDA workload.",
      ru: "DeepID РїСЂРµРІСЂР°С‰Р°РµС‚ РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅРѕРµ Р»РёС†Рѕ РІ embedding РёР· 160 С‡РёСЃРµР». Р­С‚Рѕ С‚СЏР¶РµР»С‹Р№ РЅРµР№СЂРѕСЃРµС‚РµРІРѕР№ СЌС‚Р°Рї Рё РѕСЃРЅРѕРІРЅР°СЏ CUDA/GPU-РЅР°РіСЂСѓР·РєР°.",
      he: "DeepID ЧћЧћЧ™ЧЁ ЧђЧЄ Ч”Ч¤Ч Ч™Чќ Ч”ЧћЧ Ч•ЧЁЧћЧњЧ•ЧЄ Чњ-embedding Ч©Чњ 160 ЧћЧЎЧ¤ЧЁЧ™Чќ. Ч–Ч” Ч”Ч©ЧњЧ‘ Ч”ЧўЧ¦Ч‘Ч™ Ч”Ч›Ч‘Ч“ Ч•ЧўЧ™Ч§ЧЁ ЧўЧ•ЧћЧЎ CUDA/GPU."
    },
    diagram: {
      en: ["Input 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"],
      ru: ["Р’С…РѕРґ 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"],
      he: ["Ч§ЧњЧ 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"]
    },
    layers: { en: "6 learned layers + 3 pools + add/ReLU + L2 normalize", ru: "6 РѕР±СѓС‡Р°РµРјС‹С… СЃР»РѕРµРІ + 3 pooling + add/ReLU + L2 normalize", he: "6 Ч©Ч›Ч‘Ч•ЧЄ ЧњЧ•ЧћЧ“Ч•ЧЄ + 3 pooling + add/ReLU + Ч ЧЁЧћЧ•Чњ L2" },
    connections: { en: "395,080 parameters; about 7,956,480 MACs per face", ru: "395 080 РїР°СЂР°РјРµС‚СЂРѕРІ; РїСЂРёРјРµСЂРЅРѕ 7 956 480 MAC РЅР° РѕРґРЅРѕ Р»РёС†Рѕ", he: "395,080 Ч¤ЧЁЧћЧЧЁЧ™Чќ; Ч‘ЧўЧЁЧљ 7,956,480 MAC ЧњЧ›Чњ Ч¤Ч Ч™Чќ" },
    tensor: "55x47x3 -> 52x44x20 -> 24x20x40 -> 10x8x60 -> 160",
    cudaShort: { en: "One thread per output activation", ru: "РћРґРёРЅ РїРѕС‚РѕРє РЅР° output activation", he: "ЧЄЧ”ЧњЧ™Ч›Ч•Чџ ЧђЧ—Ч“ ЧњЧ›Чњ activation" },
    cuda: {
      en: "CUDA maps convolution, pooling, dense, add/ReLU and normalization to separate kernels. Each output activation is independent, so blocks of threads compute pixels/channels in parallel. The local OpenCL file uses the same kernel idea.",
      ru: "CUDA СЂР°СЃРєР»Р°РґС‹РІР°РµС‚ convolution, pooling, dense, add/ReLU Рё normalization РЅР° РѕС‚РґРµР»СЊРЅС‹Рµ kernels. РљР°Р¶РґС‹Р№ output activation РЅРµР·Р°РІРёСЃРёРј, РїРѕСЌС‚РѕРјСѓ Р±Р»РѕРєРё РїРѕС‚РѕРєРѕРІ РїР°СЂР°Р»Р»РµР»СЊРЅРѕ СЃС‡РёС‚Р°СЋС‚ РїРёРєСЃРµР»Рё Рё РєР°РЅР°Р»С‹. Р›РѕРєР°Р»СЊРЅС‹Р№ OpenCL-С„Р°Р№Р» РёСЃРїРѕР»СЊР·СѓРµС‚ С‚Сѓ Р¶Рµ РёРґРµСЋ kernels.",
      he: "CUDA ЧћЧћЧ¤Ч” convolution, pooling, dense, add/ReLU Ч•Ч ЧЁЧћЧ•Чњ ЧњЧ§ЧЁЧ ЧњЧ™Чќ Ч Ч¤ЧЁЧ“Ч™Чќ. Ч›Чњ activation Ч¤ЧњЧ Ч‘ЧњЧЄЧ™ ЧЄЧњЧ•Ч™, Ч•ЧњЧ›Чџ Ч‘ЧњЧ•Ч§Ч™Чќ Ч©Чњ ЧЄЧ”ЧњЧ™Ч›Ч•Ч Ч™Чќ ЧћЧ—Ч©Ч‘Ч™Чќ Ч¤Ч™Ч§ЧЎЧњЧ™Чќ Ч•ЧўЧЁЧ•Ч¦Ч™Чќ Ч‘ЧћЧ§Ч‘Ч™Чњ. Ч§Ч•Ч‘ЧҐ OpenCL Ч”ЧћЧ§Ч•ЧћЧ™ ЧћЧ©ЧЄЧћЧ© Ч‘ЧђЧ•ЧЄЧ• ЧЁЧўЧ™Ч•Чџ."
    },
    code: `// CUDA kernels used in the DeepID forward stage
conv_relu<<<gridConv1, block>>>(d_input, d_w1, d_b1, d_conv1);
max_pool_2x2<<<gridPool1, block>>>(d_conv1, d_pool1);
conv_relu<<<gridConv2, block>>>(d_pool1, d_w2, d_b2, d_conv2);
max_pool_2x2<<<gridPool2, block>>>(d_conv2, d_pool2);
conv_relu<<<gridConv3, block>>>(d_pool2, d_w3, d_b3, d_conv3);
max_pool_2x2<<<gridPool3, block>>>(d_conv3, d_pool3);
dense<<<gridDense, block>>>(d_pool3, d_fc11_w, d_fc11_b, d_fc11);
conv_relu<<<gridConv4, block>>>(d_conv3, d_w4, d_b4, d_conv4);
dense<<<gridDense, block>>>(d_conv4, d_fc12_w, d_fc12_b, d_fc12);
add_relu_l2<<<1, 256>>>(d_fc11, d_fc12, d_embedding160);
cudaDeviceSynchronize();

__global__ void conv_relu(...) {
  int out = blockIdx.x * blockDim.x + threadIdx.x;
  // one thread accumulates one output pixel/channel
}
__global__ void dense(...) { /* one thread per output neuron */ }`
  },
  {
    level: "04",
    title: { en: "Reference comparison", ru: "РЎСЂР°РІРЅРµРЅРёРµ СЃ СЌС‚Р°Р»РѕРЅР°РјРё", he: "Ч”Ч©Ч•Ч•ЧђЧ” ЧњЧ“Ч•Ч’ЧћЧђЧ•ЧЄ Ч™Ч™Ч—Ч•ЧЎ" },
    summary: {
      en: "The new 160D embedding is compared against saved identity embeddings. The highest cosine score becomes best label; the second result is kept for the margin check.",
      ru: "РќРѕРІС‹Р№ 160D embedding СЃСЂР°РІРЅРёРІР°РµС‚СЃСЏ СЃ СЃРѕС…СЂР°РЅРµРЅРЅС‹РјРё СЌС‚Р°Р»РѕРЅР°РјРё Р»СЋРґРµР№. РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ cosine score СЃС‚Р°РЅРѕРІРёС‚СЃСЏ best label, РІС‚РѕСЂРѕР№ СЂРµР·СѓР»СЊС‚Р°С‚ РЅСѓР¶РµРЅ РґР»СЏ РїСЂРѕРІРµСЂРєРё margin.",
      he: "Ч”-embedding Ч”Ч—Ч“Ч© Ч‘Ч’Ч•Ч“Чњ 160 ЧћЧ•Ч©Ч•Ч•Ч” ЧњЧ™Ч™Ч—Ч•ЧЎЧ™Чќ Ч©ЧћЧ•ЧЁЧ™Чќ. Ч¦Ч™Ч•Чџ cosine Ч”Ч’Ч‘Ч•Ч” Ч‘Ч™Ч•ЧЄЧЁ Ч”Ч•Ч¤Чљ Чњ-best label Ч•Ч”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч©Ч Ч™Ч™Ч” Ч Ч©ЧћЧЁЧЄ ЧњЧ‘Ч“Ч™Ч§ЧЄ margin."
    },
    diagram: {
      en: ["160D embedding", "216 reference vectors", "Parallel dot products", "Best + runner up"],
      ru: ["160D embedding", "216 СЌС‚Р°Р»РѕРЅРЅС‹С… РІРµРєС‚РѕСЂРѕРІ", "РџР°СЂР°Р»Р»РµР»СЊРЅС‹Рµ dot products", "Best + runner up"],
      he: ["embedding 160D", "216 Ч•Ч§ЧЧ•ЧЁЧ™ Ч™Ч™Ч—Ч•ЧЎ", "ЧћЧ›Ч¤ЧњЧ•ЧЄ Ч¤Ч Ч™ЧћЧ™Ч•ЧЄ ЧћЧ§Ч‘Ч™ЧњЧ•ЧЄ", "Best + runner up"]
    },
    layers: { en: "1 comparison layer over the reference bank", ru: "1 СЃР»РѕР№ СЃСЂР°РІРЅРµРЅРёСЏ РїРѕ Р±Р°РЅРєСѓ СЌС‚Р°Р»РѕРЅРѕРІ", he: "Ч©Ч›Ч‘ЧЄ Ч”Ч©Ч•Ч•ЧђЧ” ЧђЧ—ЧЄ ЧћЧ•Чњ ЧћЧђЧ’ЧЁ Ч”Ч™Ч™Ч—Ч•ЧЎ" },
    connections: { en: "216 x 160 = 34,560 similarity multiplications in the current reference set", ru: "216 x 160 = 34 560 СѓРјРЅРѕР¶РµРЅРёР№ similarity РІ С‚РµРєСѓС‰РµРј РЅР°Р±РѕСЂРµ СЌС‚Р°Р»РѕРЅРѕРІ", he: "216 x 160 = 34,560 Ч›Ч¤ЧњЧ•ЧЄ similarity Ч‘ЧћЧђЧ’ЧЁ Ч”Ч Ч•Ч›Ч—Ч™" },
    tensor: "160D query vector + 216 x 160D reference matrix",
    cudaShort: { en: "One block/group per reference", ru: "РћРґРёРЅ block/group РЅР° СЌС‚Р°Р»РѕРЅ", he: "Ч‘ЧњЧ•Ч§/Ч§Ч‘Ч•Ч¦Ч” ЧњЧ›Чњ Ч™Ч™Ч—Ч•ЧЎ" },
    cuda: {
      en: "The CUDA version can assign one block to each reference identity and reduce 160 products into one similarity score. CPU mode runs the same math serially or with ordinary vector loops.",
      ru: "CUDA-РІРµСЂСЃРёСЏ РјРѕР¶РµС‚ РЅР°Р·РЅР°С‡Р°С‚СЊ РѕРґРёРЅ block РЅР° РєР°Р¶РґС‹Р№ СЌС‚Р°Р»РѕРЅ Рё СЃРІРѕСЂР°С‡РёРІР°С‚СЊ 160 РїСЂРѕРёР·РІРµРґРµРЅРёР№ РІ РѕРґРёРЅ similarity score. CPU-СЂРµР¶РёРј РІС‹РїРѕР»РЅСЏРµС‚ С‚Сѓ Р¶Рµ РјР°С‚РµРјР°С‚РёРєСѓ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕ РёР»Рё РѕР±С‹С‡РЅС‹РјРё РІРµРєС‚РѕСЂРЅС‹РјРё С†РёРєР»Р°РјРё.",
      he: "Ч’ЧЁЧЎЧЄ CUDA Ч™Ч›Ч•ЧњЧ” ЧњЧ”Ч§Ч¦Ч•ЧЄ Ч‘ЧњЧ•Ч§ ЧњЧ›Чњ Ч–Ч”Ч•ЧЄ Ч™Ч™Ч—Ч•ЧЎ Ч•ЧњЧ¦ЧћЧ¦Чќ 160 ЧћЧ›Ч¤ЧњЧ•ЧЄ ЧњЧ¦Ч™Ч•Чџ similarity ЧђЧ—Ч“. ЧћЧ¦Ч‘ CPU ЧћЧЁЧ™ЧҐ ЧђЧЄ ЧђЧ•ЧЄЧ” ЧћЧЄЧћЧЧ™Ч§Ч” Ч‘ЧњЧ•ЧњЧђЧ•ЧЄ ЧЁЧ’Ч™ЧњЧ•ЧЄ."
    },
    code: `// CUDA commands used in the reference comparison stage
cosine_scores<<<referenceCount, 256>>>(d_embedding160, d_refs, d_scores);
top2_reduce<<<1, 256>>>(d_scores, d_best, d_runner_up);
cudaMemcpy(&best, d_best, sizeof(Result), cudaMemcpyDeviceToHost);

__global__ void cosine_scores(...) {
  int ref = blockIdx.x;
  float partial = query[threadIdx.x] * refs[ref][threadIdx.x];
  // reduce 160 products to one score
}`
  },
  {
    level: "05",
    title: { en: "Score and margin decision", ru: "Р РµС€РµРЅРёРµ РїРѕ score Рё margin", he: "Ч”Ч—ЧњЧЧ” ЧњЧ¤Ч™ score Ч•-margin" },
    summary: {
      en: "The detector accepts the label only when the best score passes the minimum score and is separated from the runner up by the minimum margin.",
      ru: "Р”РµС‚РµРєС‚РѕСЂ РїСЂРёРЅРёРјР°РµС‚ РёРјСЏ С‚РѕР»СЊРєРѕ РєРѕРіРґР° Р»СѓС‡С€РёР№ score РІС‹С€Рµ РїРѕСЂРѕРіР° Рё РѕС‚РґРµР»РµРЅ РѕС‚ РІС‚РѕСЂРѕРіРѕ СЂРµР·СѓР»СЊС‚Р°С‚Р° РјРёРЅРёРјР°Р»СЊРЅС‹Рј margin.",
      he: "Ч”Ч’ЧњЧђЧ™ ЧћЧ§Ч‘Чњ ЧђЧЄ Ч”Ч©Чќ ЧЁЧ§ Ч›ЧђЧ©ЧЁ Ч”Ч¦Ч™Ч•Чџ Ч”ЧЧ•Ч‘ ЧўЧ•Ч‘ЧЁ ЧђЧЄ Ч”ЧЎЧЈ Ч•ЧћЧ•Ч¤ЧЁЧ“ ЧћЧ”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч©Ч Ч™Ч™Ч” ЧњЧ¤Ч™ margin ЧћЧ™Ч Ч™ЧћЧњЧ™."
    },
    diagram: {
      en: ["Best score", "Runner up", "Score threshold", "Margin threshold", "Accept / Unknown"],
      ru: ["Best score", "Runner up", "РџРѕСЂРѕРі score", "РџРѕСЂРѕРі margin", "Accept / Unknown"],
      he: ["Best score", "Runner up", "ЧЎЧЈ score", "ЧЎЧЈ margin", "Accept / Unknown"]
    },
    layers: { en: "1 decision rule; no learned neural layer", ru: "1 РїСЂР°РІРёР»Рѕ СЂРµС€РµРЅРёСЏ; РѕР±СѓС‡Р°РµРјРѕРіРѕ СЃР»РѕСЏ РЅРµС‚", he: "Ч›ЧњЧњ Ч”Ч—ЧњЧЧ” ЧђЧ—Ч“; ЧђЧ™Чџ Ч©Ч›Ч‘Ч” ЧњЧ•ЧћЧ“ЧЄ" },
    connections: { en: "2 scalar checks: best_score >= threshold and margin >= threshold", ru: "2 СЃРєР°Р»СЏСЂРЅС‹Рµ РїСЂРѕРІРµСЂРєРё: best_score >= threshold Рё margin >= threshold", he: "2 Ч‘Ч“Ч™Ч§Ч•ЧЄ ЧЎЧ§ЧњЧЁЧ™Ч•ЧЄ: best_score >= threshold Ч•-margin >= threshold" },
    tensor: "best_score, runner_up_score, margin, accepted flag",
    cudaShort: { en: "Tiny final kernel or host rule", ru: "РњР°Р»РµРЅСЊРєРёР№ final kernel РёР»Рё host rule", he: "Ч§ЧЁЧ Чњ ЧЎЧ•Ч¤Ч™ Ч§ЧЧџ ЧђЧ• Ч›ЧњЧњ host" },
    cuda: {
      en: "This stage is intentionally simple. In CUDA it can be a tiny final kernel after score reduction, but keeping it on the host gives the same answer and makes thresholds easy to tune from the web UI.",
      ru: "Р­С‚РѕС‚ СЌС‚Р°Рї СЃРїРµС†РёР°Р»СЊРЅРѕ РїСЂРѕСЃС‚РѕР№. Р’ CUDA РѕРЅ РјРѕР¶РµС‚ Р±С‹С‚СЊ РјР°Р»РµРЅСЊРєРёРј final kernel РїРѕСЃР»Рµ reduction score, РЅРѕ РЅР° host РѕС‚РІРµС‚ С‚РѕС‚ Р¶Рµ, Р° РїРѕСЂРѕРіРё Р»РµРіС‡Рµ РЅР°СЃС‚СЂР°РёРІР°С‚СЊ РёР· РІРµР±-РёРЅС‚РµСЂС„РµР№СЃР°.",
      he: "Ч©ЧњЧ‘ Ч–Ч” Ч¤Ч©Ч•Ч Ч‘Ч›Ч•Ч•Ч Ч”. Ч‘-CUDA Ч”Ч•Чђ Ч™Ч›Ч•Чњ ЧњЧ”Ч™Ч•ЧЄ Ч§ЧЁЧ Чњ ЧЎЧ•Ч¤Ч™ Ч§ЧЧџ ЧђЧ—ЧЁЧ™ reduction, ЧђЧ‘Чњ Ч‘-host Ч”ЧЄЧ©Ч•Ч‘Ч” Ч–Ч”Ч” Ч•Ч§Чњ Ч™Ч•ЧЄЧЁ ЧњЧ›Ч•Ч•Чџ ЧЎЧ¤Ч™Чќ ЧћЧ”ЧћЧћЧ©Ч§."
    },
    code: `// CUDA command if the decision is kept on GPU
decision_kernel<<<1, 1>>>(d_best, min_score, min_margin, d_accepted);
cudaMemcpy(&accepted, d_accepted, sizeof(bool), cudaMemcpyDeviceToHost);

// Same project rule when executed on host:
accepted = best_score >= min_score &&
           (best_score - runner_up_score) >= min_margin;`
  },
  {
    level: "06",
    title: { en: "Response JSON", ru: "JSON-РѕС‚РІРµС‚", he: "ЧЄЧ’Ч•Ч‘ЧЄ JSON" },
    summary: {
      en: "The backend returns both a readable result and structured JSON, so the simple demo and the Hive interface can use exactly the same detector output.",
      ru: "Backend РІРѕР·РІСЂР°С‰Р°РµС‚ С‡РёС‚Р°РµРјС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ Рё СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Р№ JSON, РїРѕСЌС‚РѕРјСѓ РїСЂРѕСЃС‚Р°СЏ РґРµРјРѕРЅСЃС‚СЂР°С†РёСЏ Рё Hive-РёРЅС‚РµСЂС„РµР№СЃ РёСЃРїРѕР»СЊР·СѓСЋС‚ РѕРґРёРЅ Рё С‚РѕС‚ Р¶Рµ РІС‹С…РѕРґ РґРµС‚РµРєС‚РѕСЂР°.",
      he: "Ч”-backend ЧћЧ—Ч–Ч™ЧЁ Ч’Чќ ЧЄЧ•Ч¦ЧђЧ” Ч§ЧЁЧ™ЧђЧ” Ч•Ч’Чќ JSON ЧћЧ•Ч‘Ч Ч”, Ч›Чљ Ч©Ч”Ч”Ч“Ч’ЧћЧ” Ч”Ч¤Ч©Ч•ЧЧ” Ч•ЧћЧћЧ©Ч§ Hive ЧћЧ©ЧЄЧћЧ©Ч™Чќ Ч‘ЧђЧ•ЧЄЧ• Ч¤ЧњЧ Ч’ЧњЧђЧ™."
    },
    diagram: {
      en: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"],
      ru: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"],
      he: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"]
    },
    layers: { en: "1 serialization layer", ru: "1 СЃР»РѕР№ СЃРµСЂРёР°Р»РёР·Р°С†РёРё", he: "Ч©Ч›Ч‘ЧЄ serialization ЧђЧ—ЧЄ" },
    connections: { en: "0 neural MACs; fields are copied into JSON", ru: "0 РЅРµР№СЂРѕРЅРЅС‹С… MAC; РїРѕР»СЏ РєРѕРїРёСЂСѓСЋС‚СЃСЏ РІ JSON", he: "0 MAC ЧўЧ¦Ч‘Ч™Ч™Чќ; Ч©Ч“Ч•ЧЄ ЧћЧ•ЧўЧЄЧ§Ч™Чќ Чњ-JSON" },
    tensor: "identity, best_score, runner_up, margin, mode, elapsed_ms",
    cudaShort: { en: "GPU result copied back to host", ru: "GPU result РєРѕРїРёСЂСѓРµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ РЅР° host", he: "ЧЄЧ•Ч¦ЧђЧЄ GPU ЧћЧ•ЧўЧЄЧ§ЧЄ Ч—Ч–ЧЁЧ” Чњ-host" },
    cuda: {
      en: "After CUDA/OpenCL finishes the numeric work, the result is copied back to the host. The Colab service serializes it as JSON for GitHub Pages and for the integrated project interface.",
      ru: "РџРѕСЃР»Рµ Р·Р°РІРµСЂС€РµРЅРёСЏ CUDA/OpenCL-РІС‹С‡РёСЃР»РµРЅРёР№ СЂРµР·СѓР»СЊС‚Р°С‚ РєРѕРїРёСЂСѓРµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ РЅР° host. Colab-СЃРµСЂРІРёСЃ СЃРµСЂРёР°Р»РёР·СѓРµС‚ РµРіРѕ РІ JSON РґР»СЏ GitHub Pages Рё РёРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅРѕРіРѕ РёРЅС‚РµСЂС„РµР№СЃР° РїСЂРѕРµРєС‚Р°.",
      he: "ЧњЧђЧ—ЧЁ Ч©-CUDA/OpenCL ЧћЧЎЧ™Ч™Чќ ЧђЧЄ Ч”ЧўЧ‘Ч•Ч“Ч” Ч”ЧћЧЎЧ¤ЧЁЧ™ЧЄ, Ч”ЧЄЧ•Ч¦ЧђЧ” ЧћЧ•ЧўЧЄЧ§ЧЄ Ч—Ч–ЧЁЧ” Чњ-host. Ч©Ч™ЧЁЧ•ЧЄ Colab ЧћЧЎЧ“ЧЁ ЧђЧ•ЧЄЧ” Ч›-JSON ЧўЧ‘Ч•ЧЁ GitHub Pages Ч•Ч”ЧћЧћЧ©Ч§ Ч”ЧћЧ©Ч•ЧњЧ‘."
    },
    code: `// CUDA/OpenCL numeric result is already back on host here
cudaMemcpy(&host_result, d_result, sizeof(Result), cudaMemcpyDeviceToHost);

// Web/Colab response object used by the site
return {
  identity, best_score, runner_up, margin,
  backend: mode, elapsed_ms, accepted
};`
  }
];

const fullColabStageCode = {
  "01": `# Colab notebook: CUDA runtime and project payload setup
from pathlib import Path
import sys, zipfile
import torch

WORK = Path("/content/ai_mips_bee_identity")
WORK.mkdir(parents=True, exist_ok=True)

print("torch:", torch.__version__)
print("cuda:", torch.cuda.is_available())
if torch.cuda.is_available():
    print(torch.cuda.get_device_name(0))

from google.colab import files
payload_name = "colab_cuda_payload.zip"
payload_path = Path("/content") / payload_name

if not payload_path.exists() and not (WORK / "colab_ai_mips_bee_world.py").exists():
    uploaded = files.upload()
    for name, data in uploaded.items():
        if name.lower().endswith(".zip"):
            payload_path = Path("/content") / name
            payload_path.write_bytes(data)
            break

if payload_path.exists():
    with zipfile.ZipFile(payload_path) as z:
        z.extractall(WORK)

sys.path.insert(0, str(WORK))`,
  "02": `# colab_ai_mips_bee_world.py: image crop/resize/normalization path
def _preprocess_pil(self, img: Image.Image, device: str):
    torch, _, _ = self._ensure_torch()
    img = img.convert("RGB")
    src_w, src_h = img.size
    target_w, target_h = 47, 55
    scale = min(target_w / src_w, target_h / src_h)
    resized_w = max(1, int(src_w * scale))
    resized_h = max(1, int(src_h * scale))
    resized = img.resize((resized_w, resized_h), Image.BILINEAR)
    canvas = Image.new("RGB", (target_w, target_h), (0, 0, 0))
    pad_x = (target_w - resized_w) // 2
    pad_y = (target_h - resized_h) // 2
    canvas.paste(resized, (pad_x, pad_y))
    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    arr = arr[..., ::-1].copy()
    arr = np.transpose(arr, (2, 0, 1))
    return torch.from_numpy(arr).to(device, non_blocking=True)

def _variants(self, path: str | Path) -> list[tuple[str, Image.Image]]:
    img = Image.open(path).convert("RGB")
    variants = [("full", img)]
    w, h = img.size
    for ratio in (0.86, 0.74, 0.62, 0.50, 0.40):
        side = int(min(w, h) * ratio)
        if side < 60:
            continue
        left = (w - side) // 2
        top = (h - side) // 2
        variants.append((f"center_{int(ratio * 100)}", img.crop((left, top, left + side, top + side))))
    return variants`,
  "03": `# colab_ai_mips_bee_world.py: DeepID forward pass executed on CUDA when device == "cuda"
def _device_name(self, mode: str) -> str:
    torch, _, _ = self._ensure_torch()
    if mode.lower() in ("gpu", "cuda") and torch.cuda.is_available():
        return "cuda"
    if mode.lower() in ("cpu",):
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"

class DeepIDTorch(nn.Module):
    def forward(self, x):
        x = F.relu(F.conv2d(x, self.conv1_w, self.conv1_b))
        x = F.max_pool2d(x, 2, 2)
        x = F.relu(F.conv2d(x, self.conv2_w, self.conv2_b))
        x = F.max_pool2d(x, 2, 2)
        x = F.relu(F.conv2d(x, self.conv3_w, self.conv3_b))
        pool3 = F.max_pool2d(x, 2, 2)
        fc11 = pool3.flatten(1) @ self.fc11_w + self.fc11_b
        conv4 = F.relu(F.conv2d(pool3, self.conv4_w, self.conv4_b))
        fc12 = conv4.flatten(1) @ self.fc12_w + self.fc12_b
        emb = F.relu(fc11 + fc12)
        return F.normalize(emb, p=2, dim=1)

def _embed_variants(self, variants, mode: str):
    model, device = self._model(mode)
    tensors = [self._preprocess_pil(img, device) for _, img in variants]
    x = torch.stack(tensors, dim=0)
    with torch.inference_mode():
        emb = model(x).detach()
    return emb, device`,
  "04": `# colab_ai_mips_bee_world.py: reference bank and cosine comparison
def load_references(self, mode: str = "auto") -> None:
    torch, _, _ = self._ensure_torch()
    model, device = self._model(mode)
    if device in self.ref_emb:
        return
    if not self.ref_items:
        items = []
        for label in self.identities:
            folders = [
                self.work_dir / "identity_references" / label,
                self.work_dir / "Face_detector" / "references" / label,
            ]
            seen_paths = set()
            for folder in folders:
                for path in _image_paths(folder):
                    key = str(path.resolve())
                    if key in seen_paths:
                        continue
                    seen_paths.add(key)
                    items.append((label, path))
        if not items:
            raise FileNotFoundError("No identity references found")
        self.ref_items = items
    tensors = []
    for _label, path in self.ref_items:
        tensors.append(self._preprocess_pil(Image.open(path), device))
    x = torch.stack(tensors, dim=0)
    with torch.inference_mode():
        emb = model(x).detach()
    if device == "cuda":
        torch.cuda.synchronize()
    self.ref_emb[device] = emb

def detect_image(self, image_path: str | Path, mode: str = "gpu", scene_hint: str | None = None) -> dict[str, Any]:
    torch, _, _ = self._ensure_torch()
    variants = self._variants(image_path)
    start = time.perf_counter()
    emb, device = self._embed_variants(variants, mode)
    sims = emb @ self.ref_emb[device].T
    if device == "cuda":
        torch.cuda.synchronize()
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    return self._decide(variants, sims, device, image_path, elapsed_ms, scene_hint)`,
  "05": `# colab_ai_mips_bee_world.py: score, margin and identity decision
def _decide(self, variants, sims, device: str, image_path: str | Path, elapsed_ms: float, scene_hint: str | None):
    attempts = []
    row_np = sims.detach().cpu().numpy()
    for row_index, (variant_name, _img) in enumerate(variants):
        row = row_np[row_index]
        best_by_label: dict[str, dict[str, Any]] = {}
        for ref_index, score in enumerate(row):
            label, ref_path = self.ref_items[ref_index]
            score = float(score)
            if score > best_by_label.get(label, {}).get("score", -1.0):
                best_by_label[label] = {
                    "label": label,
                    "score": score,
                    "variant": variant_name,
                    "matched_reference": str(ref_path),
                }
        attempts.extend(best_by_label.values())
    best_by_label: dict[str, dict[str, Any]] = {}
    for attempt in attempts:
        label = attempt["label"]
        if attempt["score"] > best_by_label.get(label, {}).get("score", -1.0):
            best_by_label[label] = attempt
    ranked = sorted(best_by_label.values(), key=lambda item: item["score"], reverse=True)
    if not ranked:
        return {
            "accepted": False,
            "identity": "Unknown",
            "best_label": "Unknown",
            "elapsed_ms": elapsed_ms,
            "image": str(image_path),
            "device": device,
        }
    best = dict(ranked[0])
    runner = ranked[1] if len(ranked) > 1 else {"label": "Unknown", "score": -1.0}
    source = "deepid"
    if scene_hint in best_by_label:
        hint = best_by_label[str(scene_hint)]
        if hint["score"] >= self.min_score and (best["label"] == scene_hint or best["score"] - hint["score"] <= 0.06):
            best = dict(hint)
            source = "scene_hint_tiebreak"
            runner = next((r for r in ranked if r["label"] != best["label"]), runner)
    margin = float(best["score"]) - float(runner.get("score", -1.0))
    accepted = float(best["score"]) >= self.min_score and (margin >= self.min_margin or source == "scene_hint_tiebreak")
    return {
        "accepted": bool(accepted),
        "identity": best["label"] if accepted else "Unknown",
        "best_label": best["label"],
        "best_score": round(float(best["score"]), 6),
        "runner_up_label": runner.get("label", "Unknown"),
        "runner_up_score": round(float(runner.get("score", -1.0)), 6),
        "margin": round(margin, 6),
        "best_variant": best.get("variant", "none"),
        "matched_reference": best.get("matched_reference", ""),
        "elapsed_ms": float(elapsed_ms),
        "image": str(image_path),
        "device": device,
        "source": source,
    }`,
  "06": `# colab_public_one_image_site.ipynb / colab_http_detector_service.py: public detector API
def detect_file_ui(file_obj, mode, min_score, min_margin):
    mode = (mode or "GPU").lower()
    with _DETECTOR_UI_LOCK:
        old_min_score, old_min_margin = detector.min_score, detector.min_margin
        detector.min_score = float(min_score)
        detector.min_margin = float(min_margin)
        try:
            detector.load_references(mode)
            payload = detector.detect_image(file_obj.name, mode=mode, processor="P0")
        finally:
            detector.min_score, detector.min_margin = old_min_score, old_min_margin
    summary = f"{payload['identity']} | {payload['backend']} | {payload['elapsed_ms']} ms"
    return summary, payload

@app.post("/api/detect")
async def api_detect(file: UploadFile = File(...), mode: str = Form("gpu"), min_score: float = Form(0.89), min_margin: float = Form(0.02)):
    suffix = Path(file.filename or "image.png").suffix or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        detector.min_score = float(min_score)
        detector.min_margin = float(min_margin)
        detector.load_references(mode)
        payload = detector.detect_image(tmp_path, mode=mode, processor="P0")
        return JSONResponse(payload)
    finally:
        Path(tmp_path).unlink(missing_ok=True)`
};

stageDetails.forEach((stage) => {
  stage.fullCode = fullColabStageCode[stage.level] || stage.code;
});

const stageDiagramNotes = [
  {
    en: [
      "The user chooses one or more photos or screenshots in the browser.",
      "The file is transferred as raw image data, not as a final identity yet.",
      "The backend decodes the image into RGB pixel values that the detector can read.",
      "Pixels are arranged into the fixed input format expected by the neural network."
    ],
    ru: [
      "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІС‹Р±РёСЂР°РµС‚ РѕРґРЅСѓ РёР»Рё РЅРµСЃРєРѕР»СЊРєРѕ С„РѕС‚РѕРіСЂР°С„РёР№ РёР»Рё СЃРєСЂРёРЅС€РѕС‚РѕРІ РІ Р±СЂР°СѓР·РµСЂРµ.",
      "Р¤Р°Р№Р» РїРµСЂРµРґР°РµС‚СЃСЏ РєР°Рє РґР°РЅРЅС‹Рµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ, Р·РґРµСЃСЊ РёРјРµРЅРё С‡РµР»РѕРІРµРєР° РµС‰Рµ РЅРµС‚.",
      "Backend РґРµРєРѕРґРёСЂСѓРµС‚ РєР°СЂС‚РёРЅРєСѓ РІ RGB-РїРёРєСЃРµР»Рё, РєРѕС‚РѕСЂС‹Рµ РјРѕР¶РµС‚ С‡РёС‚Р°С‚СЊ РґРµС‚РµРєС‚РѕСЂ.",
      "РџРёРєСЃРµР»Рё СѓРєР»Р°РґС‹РІР°СЋС‚СЃСЏ РІ С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹Р№ РІС…РѕРґРЅРѕР№ С„РѕСЂРјР°С‚ РЅРµР№СЂРѕСЃРµС‚Рё."
    ],
    he: [
      "Ч”ЧћЧ©ЧЄЧћЧ© Ч‘Ч•Ч—ЧЁ ЧЄЧћЧ•Ч Ч” ЧђЧ—ЧЄ ЧђЧ• Ч›ЧћЧ” ЧЄЧћЧ•Ч Ч•ЧЄ Ч‘Ч“Ч¤Ч“Ч¤Чџ.",
      "Ч”Ч§Ч•Ч‘ЧҐ Ч Ч©ЧњЧ— Ч›Ч ЧЄЧ•Ч Ч™ ЧЄЧћЧ•Ч Ч”, ЧўЧ“Ч™Ч™Чџ Ч‘ЧњЧ™ Ч–Ч”Ч•ЧЄ Ч©Чњ ЧђЧ“Чќ.",
      "Ч”-backend ЧћЧ¤ЧўЧ Ч— ЧђЧЄ Ч”ЧЄЧћЧ•Ч Ч” ЧњЧўЧЁЧ›Ч™ RGB Ч©Ч”Ч’ЧњЧђЧ™ Ч™Ч›Ч•Чњ ЧњЧ§ЧЁЧ•Чђ.",
      "Ч”Ч¤Ч™Ч§ЧЎЧњЧ™Чќ ЧћЧЎЧ•Ч“ЧЁЧ™Чќ Ч‘Ч¤Ч•ЧЁЧћЧ Ч§ЧњЧ Ч§Ч‘Ч•Чў Ч©Чњ Ч”ЧЁЧ©ЧЄ Ч”ЧўЧ¦Ч‘Ч™ЧЄ."
    ]
  },
  {
    en: [
      "The full screenshot may contain background, UI, or several objects.",
      "The detector searches for the part that most likely contains the face.",
      "Only the useful face area is kept for recognition.",
      "The crop is resized and normalized so every face enters the network in the same format."
    ],
    ru: [
      "РџРѕР»РЅС‹Р№ СЃРєСЂРёРЅС€РѕС‚ РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ С„РѕРЅ, РёРЅС‚РµСЂС„РµР№СЃ РёР»Рё Р»РёС€РЅРёРµ РѕР±СЉРµРєС‚С‹.",
      "Р”РµС‚РµРєС‚РѕСЂ РёС‰РµС‚ СѓС‡Р°СЃС‚РѕРє, РіРґРµ РІРµСЂРѕСЏС‚РЅРµРµ РІСЃРµРіРѕ РЅР°С…РѕРґРёС‚СЃСЏ Р»РёС†Рѕ.",
      "Р”Р»СЏ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ РѕСЃС‚Р°РІР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїРѕР»РµР·РЅР°СЏ РѕР±Р»Р°СЃС‚СЊ Р»РёС†Р°.",
      "Р¤СЂР°РіРјРµРЅС‚ РїСЂРёРІРѕРґРёС‚СЃСЏ Рє РѕРґРЅРѕРјСѓ СЂР°Р·РјРµСЂСѓ Рё РЅРѕСЂРјР°Р»РёР·СѓРµС‚СЃСЏ, С‡С‚РѕР±С‹ РІСЃРµ Р»РёС†Р° РІС…РѕРґРёР»Рё РІ СЃРµС‚СЊ РѕРґРёРЅР°РєРѕРІРѕ."
    ],
    he: [
      "Ч¦Ч™ЧњЧ•Чќ Ч”ЧћЧЎЧљ Ч™Ч›Ч•Чњ ЧњЧ›ЧњЧ•Чњ ЧЁЧ§Чў, ЧћЧћЧ©Ч§ ЧђЧ• ЧђЧ•Ч‘Ч™Ч™Ч§ЧЧ™Чќ ЧћЧ™Ч•ЧЄЧЁЧ™Чќ.",
      "Ч”Ч’ЧњЧђЧ™ ЧћЧ—Ч¤Ч© ЧђЧЄ Ч”ЧђЧ–Ч•ЧЁ Ч©Ч‘Ч• ЧЎЧ‘Ч™ЧЁ Ч©Ч ЧћЧ¦ЧђЧ•ЧЄ Ч”Ч¤Ч Ч™Чќ.",
      "ЧЁЧ§ ЧђЧ–Ч•ЧЁ Ч”Ч¤Ч Ч™Чќ Ч”Ч—Ч©Ч•Ч‘ Ч Ч©ЧћЧЁ ЧњЧ–Ч™Ч”Ч•Ч™.",
      "Ч”Ч—Ч™ЧЄЧ•Чљ ЧћЧ©ЧЄЧ Ч” ЧњЧ’Ч•Ч“Чњ Ч§Ч‘Ч•Чў Ч•ЧћЧ Ч•ЧЁЧћЧњ Ч›Ч“Ч™ Ч©Ч›Чњ Ч¤Ч Ч™Чќ Ч™Ч™Ч›Ч ЧЎЧ• ЧњЧЁЧ©ЧЄ Ч‘ЧђЧ•ЧЄЧ• Ч¤Ч•ЧЁЧћЧ."
    ]
  },
  {
    en: [
      "The normalized face image enters the DeepID network.",
      "The first filters detect simple local patterns and reduce the map size.",
      "The next filters combine simple patterns into stronger face features.",
      "The last convolution keeps compact spatial information from the face.",
      "Dense layers mix all important features into one internal representation.",
      "The final 160-number embedding is the compact digital fingerprint of the face."
    ],
    ru: [
      "РќРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅРѕРµ Р»РёС†Рѕ РїРѕСЃС‚СѓРїР°РµС‚ РІ СЃРµС‚СЊ DeepID.",
      "РџРµСЂРІС‹Рµ С„РёР»СЊС‚СЂС‹ РЅР°С…РѕРґСЏС‚ РїСЂРѕСЃС‚С‹Рµ Р»РѕРєР°Р»СЊРЅС‹Рµ РїСЂРёР·РЅР°РєРё Рё СѓРјРµРЅСЊС€Р°СЋС‚ РєР°СЂС‚Сѓ.",
      "РЎР»РµРґСѓСЋС‰РёРµ С„РёР»СЊС‚СЂС‹ СЃРѕР±РёСЂР°СЋС‚ РїСЂРѕСЃС‚С‹Рµ РїСЂРёР·РЅР°РєРё РІ Р±РѕР»РµРµ СЃРёР»СЊРЅС‹Рµ РїСЂРёР·РЅР°РєРё Р»РёС†Р°.",
      "РџРѕСЃР»РµРґРЅСЏСЏ СЃРІРµСЂС‚РєР° СЃРѕС…СЂР°РЅСЏРµС‚ РєРѕРјРїР°РєС‚РЅСѓСЋ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРµРЅРЅСѓСЋ РёРЅС„РѕСЂРјР°С†РёСЋ Р»РёС†Р°.",
      "РџРѕР»РЅРѕСЃРІСЏР·РЅС‹Рµ СЃР»РѕРё СЃРјРµС€РёРІР°СЋС‚ РІР°Р¶РЅС‹Рµ РїСЂРёР·РЅР°РєРё РІ РѕРґРЅРѕ РІРЅСѓС‚СЂРµРЅРЅРµРµ РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµ.",
      "РС‚РѕРіРѕРІС‹Р№ embedding РёР· 160 С‡РёСЃРµР» СЏРІР»СЏРµС‚СЃСЏ РєРѕРјРїР°РєС‚РЅС‹Рј С†РёС„СЂРѕРІС‹Рј РѕС‚РїРµС‡Р°С‚РєРѕРј Р»РёС†Р°."
    ],
    he: [
      "ЧЄЧћЧ•Ч ЧЄ Ч”Ч¤Ч Ч™Чќ Ч”ЧћЧ Ч•ЧЁЧћЧњЧЄ Ч Ч›Ч ЧЎЧЄ ЧњЧЁЧ©ЧЄ DeepID.",
      "Ч”Ч¤Ч™ЧњЧЧЁЧ™Чќ Ч”ЧЁЧђЧ©Ч•Ч Ч™Чќ ЧћЧ•Ч¦ЧђЧ™Чќ ЧЄЧ‘Ч Ч™Ч•ЧЄ ЧћЧ§Ч•ЧћЧ™Ч•ЧЄ Ч¤Ч©Ч•ЧЧ•ЧЄ Ч•ЧћЧ§ЧЧ™Ч Ч™Чќ ЧђЧЄ Ч”ЧћЧ¤Ч”.",
      "Ч”Ч¤Ч™ЧњЧЧЁЧ™Чќ Ч”Ч‘ЧђЧ™Чќ ЧћЧ—Ч‘ЧЁЧ™Чќ ЧЄЧ‘Ч Ч™Ч•ЧЄ Ч¤Ч©Ч•ЧЧ•ЧЄ ЧњЧћЧђЧ¤Ч™Ч™Ч Ч™ Ч¤Ч Ч™Чќ Ч—Ч–Ч§Ч™Чќ Ч™Ч•ЧЄЧЁ.",
      "Ч”-convolution Ч”ЧђЧ—ЧЁЧ•Чџ Ч©Ч•ЧћЧЁ ЧћЧ™Ч“Чў ЧћЧЁЧ—Ч‘Ч™ Ч§Ч•ЧћЧ¤Ч§ЧЧ™ Ч©Чњ Ч”Ч¤Ч Ч™Чќ.",
      "Ч”Ч©Ч›Ч‘Ч•ЧЄ Ч”Ч¦Ч¤Ч•Ч¤Ч•ЧЄ ЧћЧўЧЁЧ‘Ч‘Ч•ЧЄ ЧђЧЄ Ч”ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ Ч”Ч—Ч©Ч•Ч‘Ч™Чќ ЧњЧ™Ч™Ч¦Ч•Ч’ Ч¤Ч Ч™ЧћЧ™ ЧђЧ—Ч“.",
      "Ч”-embedding Ч”ЧЎЧ•Ч¤Ч™ Ч‘Чџ 160 ЧћЧЎЧ¤ЧЁЧ™Чќ Ч”Ч•Чђ ЧЧ‘Ч™ЧўЧЄ Ч”ЧђЧ¦Ч‘Чў Ч”Ч“Ч™Ч’Ч™ЧЧњЧ™ЧЄ Ч©Чњ Ч”Ч¤Ч Ч™Чќ."
    ]
  },
  {
    en: [
      "This is the new face vector produced by the network.",
      "These are saved vectors of known people from the project reference set.",
      "Each reference is compared with the new vector by cosine similarity.",
      "The system keeps the closest person and the second closest person for confidence checking."
    ],
    ru: [
      "Р­С‚Рѕ РЅРѕРІС‹Р№ РІРµРєС‚РѕСЂ Р»РёС†Р°, РєРѕС‚РѕСЂС‹Р№ РІС‹РґР°Р»Р° РЅРµР№СЂРѕСЃРµС‚СЊ.",
      "Р­С‚Рѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рµ РІРµРєС‚РѕСЂС‹ РёР·РІРµСЃС‚РЅС‹С… Р»СЋРґРµР№ РёР· СЌС‚Р°Р»РѕРЅРЅРѕРіРѕ РЅР°Р±РѕСЂР° РїСЂРѕРµРєС‚Р°.",
      "РљР°Р¶РґС‹Р№ СЌС‚Р°Р»РѕРЅ СЃСЂР°РІРЅРёРІР°РµС‚СЃСЏ СЃ РЅРѕРІС‹Рј РІРµРєС‚РѕСЂРѕРј С‡РµСЂРµР· cosine similarity.",
      "РЎРёСЃС‚РµРјР° СЃРѕС…СЂР°РЅСЏРµС‚ Р±Р»РёР¶Р°Р№С€РµРіРѕ С‡РµР»РѕРІРµРєР° Рё РІС‚РѕСЂРѕРіРѕ Р±Р»РёР¶Р°Р№С€РµРіРѕ РґР»СЏ РїСЂРѕРІРµСЂРєРё СѓРІРµСЂРµРЅРЅРѕСЃС‚Рё."
    ],
    he: [
      "Ч–Ч” Ч•Ч§ЧЧ•ЧЁ Ч”Ч¤Ч Ч™Чќ Ч”Ч—Ч“Ч© Ч©Ч”ЧЁЧ©ЧЄ Ч™Ч¦ЧЁЧ”.",
      "ЧђЧњЧ• Ч•Ч§ЧЧ•ЧЁЧ™Чќ Ч©ЧћЧ•ЧЁЧ™Чќ Ч©Чњ ЧђЧ Ч©Ч™Чќ ЧћЧ•Ч›ЧЁЧ™Чќ ЧћЧћЧђЧ’ЧЁ Ч”Ч™Ч™Ч—Ч•ЧЎ Ч©Чњ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч.",
      "Ч›Чњ Ч™Ч™Ч—Ч•ЧЎ ЧћЧ•Ч©Ч•Ч•Ч” ЧњЧ•Ч•Ч§ЧЧ•ЧЁ Ч”Ч—Ч“Ч© Ч‘ЧўЧ–ЧЁЧЄ cosine similarity.",
      "Ч”ЧћЧўЧЁЧ›ЧЄ Ч©Ч•ЧћЧЁЧЄ ЧђЧЄ Ч”ЧђЧ“Чќ Ч”Ч§ЧЁЧ•Ч‘ Ч‘Ч™Ч•ЧЄЧЁ Ч•ЧђЧЄ Ч”Ч©Ч Ч™ Ч”Ч§ЧЁЧ•Ч‘ Ч‘Ч™Ч•ЧЄЧЁ ЧњЧ‘Ч“Ч™Ч§ЧЄ Ч‘Ч™ЧЧ—Ч•Чџ."
    ]
  },
  {
    en: [
      "The best score shows how close the strongest match is.",
      "The runner up shows which identity was the nearest competitor.",
      "This threshold blocks weak matches that are not similar enough.",
      "This threshold requires the winner to be clearly better than the second result.",
      "Only a confident match is accepted; otherwise the result is Unknown."
    ],
    ru: [
      "Best score РїРѕРєР°Р·С‹РІР°РµС‚, РЅР°СЃРєРѕР»СЊРєРѕ Р±Р»РёР·РєРѕ СЃР°РјРѕРµ СЃРёР»СЊРЅРѕРµ СЃРѕРІРїР°РґРµРЅРёРµ.",
      "Runner up РїРѕРєР°Р·С‹РІР°РµС‚ Р±Р»РёР¶Р°Р№С€РµРіРѕ РєРѕРЅРєСѓСЂРµРЅС‚Р° СЃСЂРµРґРё РґСЂСѓРіРёС… Р»СЋРґРµР№.",
      "Р­С‚РѕС‚ РїРѕСЂРѕРі РѕС‚СЃРµРєР°РµС‚ СЃР»Р°Р±С‹Рµ СЃРѕРІРїР°РґРµРЅРёСЏ, РєРѕС‚РѕСЂС‹Рµ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїРѕС…РѕР¶Рё.",
      "Р­С‚РѕС‚ РїРѕСЂРѕРі С‚СЂРµР±СѓРµС‚, С‡С‚РѕР±С‹ РїРѕР±РµРґРёС‚РµР»СЊ Р±С‹Р» Р·Р°РјРµС‚РЅРѕ Р»СѓС‡С€Рµ РІС‚РѕСЂРѕРіРѕ СЂРµР·СѓР»СЊС‚Р°С‚Р°.",
      "РџСЂРёРЅРёРјР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ СѓРІРµСЂРµРЅРЅРѕРµ СЃРѕРІРїР°РґРµРЅРёРµ; РёРЅР°С‡Рµ СЂРµР·СѓР»СЊС‚Р°С‚ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ Unknown."
    ],
    he: [
      "Best score ЧћЧЁЧђЧ” Ч›ЧћЧ” Ч”Ч”ЧЄЧђЧћЧ” Ч”Ч—Ч–Ч§Ч” Ч‘Ч™Ч•ЧЄЧЁ Ч§ЧЁЧ•Ч‘Ч”.",
      "Runner up ЧћЧЁЧђЧ” ЧћЧ™ Ч”ЧћЧЄЧ—ЧЁЧ” Ч”Ч§ЧЁЧ•Ч‘ Ч‘Ч™Ч•ЧЄЧЁ ЧћЧ‘Ч™Чџ Ч”Ч–Ч”Ч•Ч™Ч•ЧЄ.",
      "Ч”ЧЎЧЈ Ч”Ч–Ч” Ч—Ч•ЧЎЧќ Ч”ЧЄЧђЧћЧ•ЧЄ Ч—ЧњЧ©Ч•ЧЄ Ч©ЧђЧ™Ч Чџ Ч“Ч•ЧћЧ•ЧЄ ЧћЧЎЧ¤Ч™Ч§.",
      "Ч”ЧЎЧЈ Ч”Ч–Ч” Ч“Ч•ЧЁЧ© Ч©Ч”ЧћЧ Ч¦Ч— Ч™Ч”Ч™Ч” ЧЧ•Ч‘ Ч‘Ч‘Ч™ЧЁЧ•ЧЁ ЧћЧ”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч©Ч Ч™Ч™Ч”.",
      "ЧЁЧ§ Ч”ЧЄЧђЧћЧ” Ч‘ЧЧ•Ч—Ч” ЧћЧЄЧ§Ч‘ЧњЧЄ; ЧђЧ—ЧЁЧЄ Ч”ЧЄЧ•Ч¦ЧђЧ” Ч”Ч™Чђ Unknown."
    ]
  },
  {
    en: [
      "A true/false value tells the UI whether the recognition was accepted.",
      "The chosen name is returned only when the confidence checks pass.",
      "Scores are included so the result can be inspected and tuned.",
      "The response records whether the GPU/Colab or CPU path was used.",
      "Elapsed time shows how long the recognition request took.",
      "The web interface reads this JSON and shows the same answer in the simple and integrated views."
    ],
    ru: [
      "Р—РЅР°С‡РµРЅРёРµ true/false РіРѕРІРѕСЂРёС‚ РёРЅС‚РµСЂС„РµР№СЃСѓ, РїСЂРёРЅСЏС‚Рѕ Р»Рё СЂР°СЃРїРѕР·РЅР°РІР°РЅРёРµ.",
      "Р’С‹Р±СЂР°РЅРЅРѕРµ РёРјСЏ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РµСЃР»Рё РїСЂРѕРІРµСЂРєРё СѓРІРµСЂРµРЅРЅРѕСЃС‚Рё РїСЂРѕС€Р»Рё.",
      "Scores РґРѕР±Р°РІР»РµРЅС‹, С‡С‚РѕР±С‹ СЂРµР·СѓР»СЊС‚Р°С‚ РјРѕР¶РЅРѕ Р±С‹Р»Рѕ РїСЂРѕРІРµСЂРёС‚СЊ Рё РЅР°СЃС‚СЂРѕРёС‚СЊ.",
      "РћС‚РІРµС‚ Р·Р°РїРёСЃС‹РІР°РµС‚, РёСЃРїРѕР»СЊР·РѕРІР°Р»СЃСЏ Р»Рё GPU/Colab РёР»Рё CPU-РїСѓС‚СЊ.",
      "Elapsed time РїРѕРєР°Р·С‹РІР°РµС‚, СЃРєРѕР»СЊРєРѕ Р·Р°РЅСЏР» Р·Р°РїСЂРѕСЃ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ.",
      "Р’РµР±-РёРЅС‚РµСЂС„РµР№СЃ С‡РёС‚Р°РµС‚ СЌС‚РѕС‚ JSON Рё РїРѕРєР°Р·С‹РІР°РµС‚ РѕРґРёРЅ Рё С‚РѕС‚ Р¶Рµ РѕС‚РІРµС‚ РІ РїСЂРѕСЃС‚РѕР№ Рё РёРЅС‚РµРіСЂРёСЂРѕРІР°РЅРЅРѕР№ РґРµРјРѕРЅСЃС‚СЂР°С†РёРё."
    ],
    he: [
      "ЧўЧЁЧљ true/false ЧђЧ•ЧћЧЁ ЧњЧћЧћЧ©Ч§ ЧђЧќ Ч”Ч–Ч™Ч”Ч•Ч™ Ч”ЧЄЧ§Ч‘Чњ.",
      "Ч”Ч©Чќ Ч©Ч Ч‘Ч—ЧЁ ЧћЧ•Ч—Ч–ЧЁ ЧЁЧ§ ЧђЧќ Ч‘Ч“Ч™Ч§Ч•ЧЄ Ч”Ч‘Ч™ЧЧ—Ч•Чџ ЧўЧ‘ЧЁЧ•.",
      "Ч”Ч¦Ч™Ч•Ч Ч™Чќ Ч Ч›ЧњЧњЧ™Чќ Ч›Ч“Ч™ Ч©ЧђЧ¤Ч©ЧЁ Ч™Ч”Ч™Ч” ЧњЧ‘Ч“Ч•Ч§ Ч•ЧњЧ›Ч•Ч•Чџ ЧђЧЄ Ч”ЧЄЧ•Ч¦ЧђЧ”.",
      "Ч”ЧЄЧ©Ч•Ч‘Ч” ЧћЧ¦Ч™Ч™Ч ЧЄ ЧђЧќ Ч ЧўЧ©Ч” Ч©Ч™ЧћЧ•Ч© Ч‘ЧћЧЎЧњЧ•Чњ GPU/Colab ЧђЧ• CPU.",
      "Elapsed time ЧћЧЁЧђЧ” Ч›ЧћЧ” Ч–ЧћЧџ ЧњЧ§Ч—Ч” Ч‘Ч§Ч©ЧЄ Ч”Ч–Ч™Ч”Ч•Ч™.",
      "ЧћЧћЧ©Ч§ Ч”Ч•Ч•Ч‘ Ч§Ч•ЧЁЧђ ЧђЧЄ Ч”-JSON Ч•ЧћЧ¦Ч™Ч’ ЧђЧЄ ЧђЧ•ЧЄЧ” ЧЄЧ©Ч•Ч‘Ч” Ч‘Ч”Ч“Ч’ЧћЧ” Ч”Ч¤Ч©Ч•ЧЧ” Ч•Ч”ЧћЧ©Ч•ЧњЧ‘ЧЄ."
    ]
  }
];

const cleanRussianStageDiagramNotes = [
  [
    "Пользователь выбирает одну или несколько фотографий или скриншотов в браузере.",
    "Файл передается как данные изображения, без готового имени человека.",
    "Сервер декодирует картинку в RGB-пиксели, которые может прочитать детектор.",
    "Пиксели укладываются в фиксированный формат входа нейросети."
  ],
  [
    "Полный скриншот может содержать фон, интерфейс и другие объекты.",
    "Детектор ищет участок, где вероятнее всего находится лицо.",
    "Для распознавания сохраняется только полезная область лица.",
    "Фрагмент приводится к одному размеру и нормализуется."
  ],
  [
    "Нормализованное лицо поступает в сеть DeepID.",
    "Первые фильтры находят простые локальные признаки и уменьшают размер карты.",
    "Следующие фильтры объединяют простые признаки в более сильные признаки лица.",
    "Последняя свертка сохраняет компактную пространственную информацию о лице.",
    "Полносвязные слои объединяют важные признаки во внутреннее представление.",
    "Итоговый вектор из 160 чисел является компактным цифровым отпечатком лица."
  ],
  [
    "Это новый вектор признаков лица, который создала нейросеть.",
    "Это сохраненные векторы известных людей из эталонного набора проекта.",
    "Каждый эталон сравнивается с новым вектором по косинусному сходству.",
    "Система сохраняет самого близкого и второго по близости человека для проверки уверенности."
  ],
  [
    "Лучшее значение сходства показывает, насколько близко самое сильное совпадение.",
    "Второе совпадение показывает ближайшего конкурента среди остальных людей.",
    "Этот порог отсекает слишком слабые совпадения.",
    "Этот порог требует, чтобы победитель заметно опережал второй результат.",
    "Принимается только уверенное совпадение; иначе результат считается неизвестным."
  ],
  [
    "Логическое значение сообщает интерфейсу, принято ли распознавание.",
    "Имя возвращается только после успешной проверки уверенности.",
    "Показатели добавлены, чтобы результат можно было проверить и настроить.",
    "Ответ записывает, использовался ли путь GPU/Colab или CPU.",
    "Время выполнения показывает длительность запроса распознавания.",
    "Веб-интерфейс читает этот JSON и показывает одинаковый ответ в простой и интегрированной демонстрации."
  ]
];

const cleanHebrewStageDiagramNotes = [
  [
    "המשתמש בוחר תמונה אחת או יותר או צילומי מסך בדפדפן.",
    "הקובץ מועבר כנתוני תמונה, בלי זהות מוכנה של אדם.",
    "השרת מפענח את התמונה לפיקסלי RGB שהגלאי יכול לקרוא.",
    "הפיקסלים מסודרים בפורמט הקלט הקבוע שהרשת העצבית מצפה לו."
  ],
  [
    "צילום המסך המלא עשוי להכיל רקע, ממשק ואובייקטים נוספים.",
    "הגלאי מחפש את האזור שבו סביר ביותר שנמצא פרצוף.",
    "לזיהוי נשמר רק אזור הפנים הרלוונטי.",
    "האזור מותאם לגודל אחיד ועובר נרמול."
  ],
  [
    "הפנים המנורמלים נכנסים לרשת DeepID.",
    "המסננים הראשונים מזהים מאפיינים מקומיים פשוטים ומקטינים את גודל המפה.",
    "המסננים הבאים משלבים מאפיינים פשוטים למאפייני פנים חזקים יותר.",
    "הקונבולוציה האחרונה שומרת מידע מרחבי קומפקטי על הפנים.",
    "השכבות המחוברות במלואן מאחדות מאפיינים חשובים לייצוג פנימי.",
    "הווקטור הסופי, בן 160 מספרים, הוא טביעת האצבע הדיגיטלית של הפנים."
  ],
  [
    "זהו וקטור הפנים החדש שנוצר על ידי הרשת.",
    "אלה וקטורים שמורים של אנשים מוכרים מתוך קבוצת הייחוס של הפרויקט.",
    "כל דוגמת ייחוס מושווית לווקטור החדש לפי דמיון קוסינוסי.",
    "המערכת שומרת את האדם הקרוב ביותר ואת השני בקרבתו לצורך בדיקת הביטחון."
  ],
  [
    "ציון הדמיון הטוב ביותר מראה עד כמה ההתאמה החזקה קרובה.",
    "ההתאמה השנייה מראה מי המתחרה הקרוב ביותר.",
    "הסף הזה מסנן התאמות חלשות שאינן דומות מספיק.",
    "הסף הזה דורש שהמנצח יהיה טוב יותר באופן ברור מהתוצאה השנייה.",
    "רק התאמה בטוחה מתקבלת; אחרת התוצאה היא לא ידוע."
  ],
  [
    "ערך לוגי מודיע לממשק אם הזיהוי התקבל.",
    "השם שנבחר מוחזר רק לאחר שמבדקי הביטחון עברו בהצלחה.",
    "המדדים נכללים כדי שאפשר יהיה לבדוק ולכוונן את התוצאה.",
    "התשובה מתעדת אם נעשה שימוש במסלול GPU/Colab או CPU.",
    "זמן הביצוע מציג כמה זמן ארכה בקשת הזיהוי.",
    "ממשק האינטרנט קורא את ה-JSON ומציג את אותה תשובה בהדגמה הפשוטה והמשולבת."
  ]
];

stageDiagramNotes.forEach((stage, index) => {
  stage.ru = cleanRussianStageDiagramNotes[index];
  stage.he = cleanHebrewStageDiagramNotes[index];
});

let currentStageIndex = -1;
let stageCodeMode = "short";
let detectorSourceLoaded = false;
let detectorSourceVisible = false;
let detectorSourceText = "";
let colabNotebookLoaded = false;
let colabNotebookText = "";
let combinedRecognitionCode = "";
let combinedRecognitionLineCount = 0;
let stageRecognitionLineCount = 0;
let exactStageCodeState = "idle";
let activeDetectorVariant = "single";

const cleanRuTranslations = {
  kicker: "COLAB GPU / РАСПОЗНАВАНИЕ ЛИЦ / ИНТЕРФЕЙС ПРОЕКТА",
  title: "Добро пожаловать в Bee Face Recognition Project",
  lead: "Загружайте скриншоты, распознавайте лица через подключенный Colab-детектор и смотрите тот же поток результатов в интегрированном интерфейсе AI MIPS.",
  simple: "Простая демонстрация",
  complex: "Сложная демонстрация, интегрированная в проект",
  toolColab: "Блокнот проекта в Colab",
  toolColabText: "Открыть CUDA/Colab-версию детектора из этого репозитория.",
  toolFullSuite: "Полный локальный установщик",
  toolFullSuiteText: "Устанавливает Hive-сервис, локальные симуляции, BeeBoard 3D, Bgame, орбитальную механику, модели и ярлыки одним пакетом.",
  toolHiveInstaller: "Установщик AI MIPS Hive Service",
  toolHiveInstallerText: "Скачать локальное меню Hive и backend-сервис.",
  toolUrsina: "Установщик Bgame",
  toolUrsinaText: "Скачать локальный игровой пакет с пчелой.",
  toolBeeBoard: "Установщик BeeBoard",
  toolBeeBoardText: "Скачать локальный пакет интерфейса BeeBoard.",
  toolPhysical: "Установщик физической симуляции",
  toolPhysicalText: "Скачать локальный пакет физической симуляции.",
  simpleKicker: "ПРОСТОЙ РЕЖИМ",
  simpleTitle: "Простая демонстрация распознавания лиц",
  simpleNote: "Загрузите одно или несколько изображений, выберите режим GPU или CPU и нажмите «Распознать».",
  imageTitle: "Изображение / скриншот",
  dropHint: "Выберите одно или несколько изображений для анализа на GPU/CPU.",
  mode: "Режим вычислений",
  gpu: "GPU",
  cpu: "CPU",
  score: "Минимальный порог сходства",
  margin: "Минимальный отрыв между совпадениями",
  recognize: "Распознать",
  builtIn: "Встроенные проверки на статуях",
  tableImage: "Изображение / скриншот",
  tableMode: "Режим вычислений",
  tableScore: "Минимальный порог сходства",
  tableMargin: "Минимальный отрыв между совпадениями",
  tableRun: "Запуск",
  resultTitle: "Результат детектора",
  summary: "Загрузите изображение и нажмите «Распознать».",
  json: "JSON детектора",
  howKicker: "КАК РАБОТАЕТ ДЕТЕКТОР",
  howTitle: "Что происходит с изображением внутри нейросети",
  howIntro: "Этот просмотр показывает только CUDA-модуль детектора: одноразовую инициализацию, инференс DeepID, сравнение с эталонами и итоговую личность. Код Hive и веб-интерфейса в этот исходник не входит.",
  step1Title: "Входное изображение",
  step1Text: "Загруженный скриншот читается как набор пикселей. Если выбрана пачка файлов, эти же шаги выполняются для каждой картинки по очереди.",
  step2Title: "Обрезка лица и нормализация",
  step2Text: "Детектор ищет область лица, вырезает полезный фрагмент, приводит его к входному размеру сети и нормализует значения цвета и яркости.",
  step3Title: "Извлечение признаков",
  step3Text: "Нейросеть превращает изображение лица в числовой вектор признаков. Такой вектор описывает лицо компактнее и устойчивее, чем сырые пиксели.",
  step4Title: "Сравнение с эталонами",
  step4Text: "Новый вектор сравнивается с сохраненными эталонами известных людей. Ближайшее совпадение становится основным результатом, а второе по близости используется для проверки уверенности.",
  step5Title: "Решение по сходству и отрыву",
  step5Text: "Результат принимается только при достаточно высоком сходстве и заметном отрыве от второго совпадения. Иначе система показывает «Неизвестно», чтобы не подставлять неправильное имя.",
  step6Title: "JSON-ответ",
  step6Text: "Интерфейс получает короткое резюме и JSON с именем, лучшим сходством, вторым совпадением, отрывом, режимом обработки, временем выполнения и признаком принятия.",
  modeExplainTitle: "Режимы GPU и CPU",
  modeExplainText: "Режим GPU выполняет тяжелые операции над изображениями и векторами на ускорителе. Режим CPU выполняет ту же логику на процессоре. Результат распознавания должен оставаться одинаковым; меняются главным образом место и время вычислений.",
  openStage: "Открыть схему",
  complexKicker: "ИНТЕГРИРОВАННЫЙ РЕЖИМ",
  complexTitle: "Интегрированный интерфейс проекта",
  openHive: "Открыть локальный Hive",
  openBeeBoard: "Открыть BeeBoard 3D",
  openPhysical: "Открыть физику крыльев",
  openUrsina: "Открыть Bgame",
  downloadUrsina: "Установщик Bgame",
  downloadBeeBoard: "Установщик BeeBoard",
  downloadPhysical: "Установщик физической симуляции",
  back: "Назад",
  sourceKicker: "ПОЛНЫЙ ОБЩИЙ КОД РАСПОЗНАВАНИЯ",
  sourceTitle: "Все шесть этапов в одном непрерывном коде",
  sourceIntro: "Код ниже собирается только из точного полного кода этапов 1–6 в том же порядке. Количество строк автоматически сверяется с суммой строк всех шести этапов.",
  openDetectorSource: "Показать полный общий код",
  hideDetectorSource: "Скрыть полный общий код",
  sourceClosed: "Код закрыт. Откройте его, чтобы увидеть сверку с этапами 1–6.",
  sourceLoading: "Загружается точный код всех шести этапов…",
  sourceLoaded: "Проверено: количество строк общего кода — {total}; сумма по этапам 1–6 — {sum}. Значения совпадают.",
  sourceCountError: "Ошибка проверки: количество строк общего кода — {total}; сумма по этапам 1–6 — {sum}.",
  sourceError: "Не удалось собрать общий код из этапов 1–6.",
  fullStageLoading: "Загружаются точные блоки этапа из исходных файлов…",
  fullStageExact: "Точные блоки этого этапа, автоматически извлечённые из исходника",
  fullStageNotebook: "Точный блок из ноутбука Colab — этот же файл можно открыть ниже",
  fullStageDetector: "Точный блок из модуля детектора — этот же файл можно открыть ниже",
  fullStageError: "Не удалось загрузить точные блоки этапа; показана только краткая схема.",
  stageLabel: "ЭТАП",
  unknown: "Неизвестно",
  processedImages: "изображений обработано",
  acceptedImages: "Принято",
  processing: "Обработка",
  running: "Выполняется…",
  ready: "Локальный Hive готов",
  error: "Ошибка локального Hive",
  bestLabel: "лучшее совпадение",
  scoreValue: "сходство",
  marginValue: "отрыв"
};

const cleanHeTranslations = {
  kicker: "COLAB GPU / זיהוי פנים / ממשק הפרויקט",
  title: "ברוכים הבאים ל-Bee Face Recognition Project",
  lead: "העלו צילומי מסך, זהו פנים דרך גלאי Colab המחובר, וצפו באותו זרם תוצאות בתוך ממשק AI MIPS המשולב.",
  simple: "הדגמה פשוטה",
  complex: "הדגמה מורכבת המשולבת בפרויקט",
  toolColab: "מחברת Colab של הפרויקט",
  toolColabText: "פתיחת גרסת CUDA/Colab של הגלאי מתוך המאגר.",
  toolFullSuite: "מתקין מקומי מלא",
  toolFullSuiteText: "מתקין יחד את שירות Hive, הסימולציות המקומיות, BeeBoard 3D, Bgame, מכניקה מסלולית, מודלים וקיצורי הפעלה.",
  toolHiveInstaller: "מתקין AI MIPS Hive Service",
  toolHiveInstallerText: "הורדת תפריט Hive המקומי וחבילת ה-backend.",
  toolUrsina: "מתקין Bgame",
  toolUrsinaText: "הורדת חבילת המשחק המקומית עם הדבורה.",
  toolBeeBoard: "מתקין BeeBoard",
  toolBeeBoardText: "הורדת חבילת הממשק המקומית של BeeBoard.",
  toolPhysical: "מתקין הסימולציה הפיזיקלית",
  toolPhysicalText: "הורדת חבילת הסימולציה הפיזיקלית המקומית.",
  simpleKicker: "מצב פשוט",
  simpleTitle: "הדגמה פשוטה לזיהוי פנים",
  simpleNote: "העלו תמונה אחת או אצווה, בחרו GPU או CPU ולחצו על זיהוי.",
  imageTitle: "תמונה / צילום מסך",
  dropHint: "בחרו תמונה אחת או יותר לניתוח GPU/CPU.",
  mode: "מצב חישוב",
  gpu: "GPU",
  cpu: "CPU",
  score: "ציון מינימלי",
  margin: "מרווח מינימלי",
  recognize: "זהה",
  builtIn: "בדיקות מובנות על פסלים",
  tableImage: "תמונה / צילום מסך",
  tableMode: "מצב חישוב",
  tableScore: "ציון מינימלי",
  tableMargin: "מרווח מינימלי",
  tableRun: "הרצה",
  resultTitle: "תוצאת הגלאי",
  summary: "העלו תמונה ולחצו על זיהוי.",
  json: "JSON של הגלאי",
  howKicker: "איך הגלאי עובד",
  howTitle: "מה קורה לתמונה בתוך הרשת העצבית",
  howIntro: "התצוגה הזו מציגה רק את מודול גלאי CUDA: אתחול חד-פעמי, הסקת DeepID, השוואה לייחוסים ותוצאת הזהות הסופית. קוד Hive וממשק האינטרנט אינם כלולים בקוד מקור זה.",
  step1Title: "תמונת קלט",
  step1Text: "התמונה שהועלתה נקראת כאוסף פיקסלים. אם נבחרה אצווה, אותם שלבים מתבצעים עבור כל תמונה בנפרד.",
  step2Title: "חיתוך פנים ונרמול",
  step2Text: "הגלאי מחפש את אזור הפנים, חותך את החלק הרלוונטי, מתאים אותו לגודל הקלט של הרשת ומנרמל צבע ובהירות.",
  step3Title: "חילוץ מאפיינים",
  step3Text: "הרשת העצבית ממירה את תמונת הפנים לווקטור מספרי של מאפיינים, הנקרא embedding. הווקטור מתאר את הפנים בצורה יציבה וקומפקטית יותר מפיקסלים גולמיים.",
  step4Title: "השוואה מול דוגמאות ייחוס",
  step4Text: "ה-embedding החדש מושווה ל-embeddings שמורים של אנשים מוכרים. ההתאמה הקרובה ביותר הופכת לתווית הראשית, והשנייה נשמרת כ-runner up.",
  step5Title: "החלטה לפי score ו-margin",
  step5Text: "התוצאה מתקבלת רק אם הציון הטוב ביותר גבוה מספיק והמרווח מהתוצאה השנייה גדול מספיק. אחרת המערכת מחזירה Unknown כדי לא להציג שם שגוי.",
  step6Title: "תשובת JSON",
  step6Text: "הממשק מקבל תקציר קריא ו-JSON עם השם, הציון הטוב ביותר, runner up, margin, מצב backend, זמן ריצה ודגל accepted.",
  modeExplainTitle: "מצבי GPU ו-CPU",
  modeExplainText: "מצב GPU מריץ את הפעולות הכבדות על המאיץ. מצב CPU מריץ את אותה לוגיקת זיהוי על המעבד. התוצאה צפויה להישאר זהה; ההבדל הוא בעיקר מקום החישוב וזמן הריצה.",
  openStage: "פתח תרשים",
  complexKicker: "מצב משולב",
  complexTitle: "הממשק המשולב של הפרויקט",
  openHive: "פתח Hive מקומי",
  openBeeBoard: "פתח BeeBoard 3D",
  openPhysical: "פתח פיזיקת כנפיים",
  openUrsina: "פתח Bgame",
  downloadUrsina: "מתקין Bgame",
  downloadBeeBoard: "מתקין BeeBoard",
  downloadPhysical: "מתקין סימולציה פיזיקלית",
  back: "חזרה",
  sourceKicker: "הקוד המלא והמאוחד של הזיהוי",
  sourceTitle: "כל ששת השלבים ברשימת קוד רציפה אחת",
  sourceIntro: "הקוד למטה מורכב רק מהקוד המלא והמדויק שמוצג בשלבים 1–6, באותו סדר. מספר השורות נבדק אוטומטית מול סכום השורות של כל ששת השלבים.",
  openDetectorSource: "הצג את הקוד המלא והמאוחד",
  hideDetectorSource: "הסתר את הקוד המלא והמאוחד",
  sourceClosed: "הקוד סגור. פתחו אותו כדי לראות את הבדיקה מול שלבים 1–6.",
  sourceLoading: "טוען את הקוד המדויק של כל ששת השלבים...",
  sourceLoaded: "נבדק: {total} שורות בקוד המלא = {sum} שורות בשלבים 1–6.",
  sourceCountError: "שגיאת ספירת שורות: {total} בקוד המלא, אך {sum} בששת השלבים.",
  sourceError: "לא ניתן להרכיב את הקוד המלא משלבים 1–6.",
  fullStageLoading: "טוען את בלוקי השלב המדויקים מקובצי המקור…",
  fullStageExact: "בלוקים מדויקים של שלב זה, שחולצו אוטומטית מקוד המקור",
  fullStageNotebook: "בלוק מדויק ממחברת Colab — אפשר לפתוח את אותו קובץ למטה",
  fullStageDetector: "בלוק מדויק ממודול הגלאי — אפשר לפתוח את אותו קובץ למטה",
  fullStageError: "לא ניתן לטעון את בלוקי השלב המדויקים; מוצגת רק הסקיצה הקצרה."
};

const cleanDetailUi = {
  ru: {
    schemeTitle: "Схема",
    stageStatsTitle: "Слои и нейронные связи",
    layersLabel: "Слои и операции",
    connectionsLabel: "Связи нейронов и операции MAC",
    tensorLabel: "Размер тензора или вектора",
    cudaLabel: "Распределение по CUDA",
    cudaTitle: "Как CUDA реализует этот этап в проекте",
    nextLevel: "Следующий этап",
    prevLevel: "Предыдущий этап",
    backToSimple: "Вернуться в простую демонстрацию",
    openFullCode: "Открыть полный Colab/CUDA-код этого этапа",
    showShortCode: "Показать короткую схему этапа",
    codeSourceShort: "Короткая CUDA-схема этапа",
    codeSourceFull: "Полный код Colab-детектора для этого этапа"
  },
  he: {
    schemeTitle: "תרשים",
    stageStatsTitle: "שכבות וקשרים עצביים",
    layersLabel: "שכבות / פעולות",
    connectionsLabel: "קשרים עצביים / MAC",
    tensorLabel: "גודל טנזור / וקטור",
    cudaLabel: "מיפוי CUDA",
    cudaTitle: "איך זה ממומש ב-CUDA בפרויקט",
    nextLevel: "השלב הבא",
    prevLevel: "השלב הקודם",
    backToSimple: "חזרה להדגמה הפשוטה",
    openFullCode: "פתח קוד Colab/CUDA מלא לשלב הזה",
    showShortCode: "הצג קטע קצר של השלב",
    codeSourceShort: "סקיצה קצרה של שלב CUDA",
    codeSourceFull: "הקוד המלא מגלאי Colab לשלב הזה"
  }
};

const cleanStageLocalization = [
  {
    title: { ru: "Входное изображение", he: "תמונת קלט" },
    summary: {
      ru: "Изображение загружается как RGB-массив и подготавливается к передаче в детектор.",
      he: "התמונה נטענת כמערך RGB ומוכנה להעברה אל הגלאי."
    },
    diagram: {
      ru: ["Файл", "RGB-пиксели", "Область лица", "55 x 47 x 3"],
      he: ["קובץ", "פיקסלי RGB", "חיתוך פנים", "55 x 47 x 3"]
    },
    layers: { ru: "0 нейронных слоев, это этап подготовки входа", he: "0 שכבות עצביות; זה שלב הכנת הקלט" },
    connections: { ru: "55 x 47 x 3 = 7 755 входных значений", he: "55 x 47 x 3 = 7,755 ערכי קלט" },
    cudaShort: { ru: "cudaMalloc + cudaMemcpy для входного тензора", he: "cudaMalloc ו-cudaMemcpy עבור טנזור הקלט" },
    cuda: {
      ru: "На этом этапе CUDA выделяет буфер для нормализованного лица и копирует данные с центрального процессора на видеокарту. Нейросеть запускается после подготовки этого буфера.",
      he: "בשלב הזה CUDA מקצה באפר לתמונת הפנים המנורמלת ומעתיקה נתונים מה-host אל ה-device. הרשת עצמה מתחילה לרוץ רק לאחר שהבאפר מוכן."
    }
  },
  {
    title: { ru: "Обрезка лица и нормализация", he: "חיתוך פנים ונרמול" },
    summary: {
      ru: "Детектор выбирает область лица, приводит ее к фиксированному размеру и нормализует каналы.",
      he: "הגלאי בוחר את אזור הפנים, מתאים אותו לגודל קבוע ומנרמל את הערוצים."
    },
    diagram: {
      ru: ["Скриншот", "Область лица", "Изменение размера", "Нормализованный тензор"],
      he: ["צילום מסך", "אזור פנים", "שינוי גודל", "טנזור מנורמל"]
    },
    layers: { ru: "Предварительная обработка перед сверточными слоями", he: "עיבוד מקדים לפני שכבות הקונבולוציה" },
    connections: { ru: "Те же 7 755 значений после изменения размера и нормализации", he: "אותם 7,755 ערכים לאחר שינוי גודל ונרמול" },
    cudaShort: { ru: "Нормализованный тензор копируется в GPU-память", he: "הטנזור המנורמל מועתק לזיכרון GPU" },
    cuda: {
      ru: "В проекте обрезка и изменение размера выполняются перед запуском ядер CUDA, затем результат отправляется в буфер видеокарты. Поэтому вход для режимов CPU и GPU остается одинаковым.",
      he: "בפרויקט crop/resize מתבצעים לפני הרצת kernels של CUDA, ואז התוצאה נשלחת לבאפר ב-device. כך נשמר קלט זהה למצבי CPU ו-GPU."
    }
  },
  {
    title: { ru: "Извлечение признаков", he: "חילוץ מאפיינים" },
    summary: {
      ru: "Сеть, построенная по принципу DeepID, превращает лицо в компактный вектор признаков размером 160D.",
      he: "רשת בסגנון DeepID ממירה את הפנים ל-embedding קומפקטי בגודל 160D."
    },
    diagram: {
      ru: ["55 x 47 x 3", "Свертка + ReLU", "Пулинг", "Полносвязный слой", "Вектор 160D"],
      he: ["55 x 47 x 3", "Conv + ReLU", "Pool", "Dense", "160D embedding"]
    },
    layers: { ru: "4 сверточных блока, пулинг, полносвязные слои и нормализация", he: "4 בלוקים של convolution, pooling, שכבות dense ונרמול" },
    connections: { ru: "Основная часть операций MAC выполняется в сверточных и полносвязных слоях", he: "רוב פעולות ה-MAC מתבצעות בשכבות conv ו-dense" },
    cudaShort: { ru: "conv_relu, max_pool_2x2, dense, add_relu_12", he: "conv_relu, max_pool_2x2, dense, add_relu_12" },
    cuda: {
      ru: "CUDA распределяет свертку, пулинг, полносвязные слои, ReLU и нормализацию по отдельным ядрам. Независимые выходные значения вычисляются параллельно.",
      he: "CUDA מפרקת convolution, pooling, dense, add/ReLU ו-normalization ל-kernels נפרדים. כל output activation עצמאי, ולכן בלוקי threads מחשבים במקביל פיקסלים, ערוצים ונוירונים."
    }
  },
  {
    title: { ru: "Сравнение с эталонами", he: "השוואה מול דוגמאות ייחוס" },
    summary: {
      ru: "Новый вектор признаков 160D сравнивается с сохраненными эталонами известных людей.",
      he: "ה-embedding החדש בגודל 160D מושווה לדוגמאות ייחוס שמורות של אנשים מוכרים."
    },
    diagram: {
      ru: ["Вектор 160D", "Матрица эталонов", "Скалярные произведения", "Лучший + второй"],
      he: ["160D embedding", "מטריצת ייחוס", "Dot products", "הטוב ביותר + השני"]
    },
    layers: { ru: "1 слой сравнения по банку эталонов", he: "שכבת השוואה אחת מול בנק הייחוס" },
    connections: { ru: "N x 160 умножений сходства для текущего набора эталонов", he: "N x 160 הכפלות דמיון עבור סט הייחוס הנוכחי" },
    cudaShort: { ru: "Один блок/группа на эталон", he: "בלוק/קבוצה אחת לכל דוגמת ייחוס" },
    cuda: {
      ru: "CUDA может назначить отдельный блок для каждого кандидата и свести 160 произведений в один показатель сходства. CPU выполняет ту же математику последовательно или обычными векторными циклами.",
      he: "גרסת CUDA יכולה להקצות בלוק אחד לכל מועמד ולצמצם 160 מכפלות לציון similarity אחד. מצב CPU מבצע את אותה מתמטיקה באופן סדרתי או בלולאות וקטור רגילות."
    }
  },
  {
    title: { ru: "Решение по сходству и отрыву", he: "החלטה לפי score ו-margin" },
    summary: {
      ru: "Лучший результат проходит пороги сходства и отрыва; иначе возвращается «Неизвестно».",
      he: "התוצאה הטובה ביותר עוברת ספי confidence ו-margin; אחרת מוחזר Unknown."
    },
    diagram: {
      ru: ["Лучшее сходство", "Второе сходство", "Отрыв", "Принято / Неизвестно"],
      he: ["הציון הטוב ביותר", "הציון השני", "Margin", "Accepted / Unknown"]
    },
    layers: { ru: "Логический слой принятия решения", he: "שכבה לוגית לקבלת החלטה" },
    connections: { ru: "Сравнение двух показателей сходства и двух порогов", he: "השוואה של שני ציונים ושני ספים" },
    cudaShort: { ru: "Пороговая проверка после GPU/CPU вычислений", he: "בדיקת ספים לאחר חישובי GPU/CPU" },
    cuda: {
      ru: "После вычисления сходства проект проверяет минимальный порог и минимальный отрыв. Это защищает интерфейс от уверенного, но неверного имени.",
      he: "לאחר חישוב similarity הפרויקט בודק minimum score ו-minimum margin. זה לא משנה את הרשת, אלא מגן על הממשק מפני הצגת שם שגוי בביטחון גבוה."
    }
  },
  {
    title: { ru: "JSON-ответ", he: "תשובת JSON" },
    summary: {
      ru: "Результат упаковывается в JSON, который читают простая демонстрация и Hive-интерфейс.",
      he: "התוצאה נארזת כ-JSON שנקרא על ידי ההדגמה הפשוטה וממשק Hive."
    },
    diagram: {
      ru: ["Имя", "Показатели", "Режим обработки", "Время выполнения", "Обновление экрана"],
      he: ["Label", "Scores", "Backend", "Elapsed time", "עדכון UI"]
    },
    layers: { ru: "API-слой ответа", he: "שכבת API לתגובה" },
    connections: { ru: "Поля JSON связывают детектор, Colab и интерфейс", he: "שדות JSON מחברים בין הגלאי, Colab והממשק" },
    cudaShort: { ru: "Результат CUDA преобразуется в JSON после синхронизации", he: "תוצאת CUDA עוברת serialization לאחר סנכרון" },
    cuda: {
      ru: "После cudaDeviceSynchronize сервер собирает имя, показатели, режим обработки и время выполнения в JSON. Интерфейс показывает один и тот же ответ в простой и интегрированной демонстрации.",
      he: "לאחר cudaDeviceSynchronize ה-backend אוסף label, scores, backend mode ו-elapsed time לתוך JSON. הממשק מציג אותה תשובה בהדגמה הפשוטה והמשולבת."
    }
  }
];

Object.assign(translations.ru, cleanRuTranslations);
Object.assign(translations.he, cleanHeTranslations);
Object.assign(detailUi.ru, cleanDetailUi.ru);
Object.assign(detailUi.he, cleanDetailUi.he);
cleanStageLocalization.forEach((localizedStage, index) => {
  const stage = stageDetails[index];
  if (!stage) return;
  ["title", "summary", "diagram", "layers", "connections", "cudaShort", "cuda"].forEach((key) => {
    if (stage[key] && localizedStage[key]) Object.assign(stage[key], localizedStage[key]);
  });
});

Object.assign(translations.en, {
  variantKicker: "CUDA SOURCE VARIANT",
  variantTitle: "Choose the recognition path to inspect",
  variantSingle: "Single-image recognition",
  variantBatch: "Batch recognition",
  sourceTitle: "Complete detector code for the selected CUDA path",
  sourceIntro: "The code below is the exact concatenation of the six full stages for the selected variant. The page verifies both the line count and exact text order.",
  sourceClosed: "Closed. Open the complete code for the selected variant.",
  sourceLoading: "Loading the dedicated CUDA detector module…",
  sourceLoaded: "Verified: {total} lines in the complete {variant} code = {sum} lines across stages 1–6; the text is identical.",
  sourceCountError: "Verification failed for {variant}: complete code {total} lines; stages 1–6 total {sum} lines.",
  sourceError: "Could not load or verify the dedicated CUDA detector module.",
  openRawDetectorSource: "Open detector-only raw source",
  fullStageExact: "Exact block from source/cuda_deepid_detector.py",
  fullStageDetector: "Exact block from source/cuda_deepid_detector.py",
  fullStageNotebook: "Exact block from source/cuda_deepid_detector.py",
  codeSourceFull: "Exact full source for this detector stage",
  codeSourceShort: "Short executable-path sketch",
  lineCount: "{count} lines"
});

Object.assign(translations.ru, {
  variantKicker: "ВАРИАНТ CUDA-ИСХОДНИКА",
  variantTitle: "Выберите путь распознавания для изучения",
  variantSingle: "Одиночное распознавание",
  variantBatch: "Пакетное распознавание",
  sourceTitle: "Полный код детектора для выбранного CUDA-пути",
  sourceIntro: "Код ниже — точное объединение полных кодов шести этапов выбранного варианта. Страница проверяет количество строк и точный порядок текста.",
  sourceClosed: "Код закрыт. Откройте полный код выбранного варианта.",
  sourceLoading: "Загружается отдельный модуль CUDA-детектора…",
  sourceLoaded: "Проверено: {total} строк в полном коде варианта «{variant}» = {sum} строк на этапах 1–6; текст полностью совпадает.",
  sourceCountError: "Ошибка проверки варианта «{variant}»: полный код — {total} строк, этапы 1–6 — {sum} строк.",
  sourceError: "Не удалось загрузить или проверить отдельный модуль CUDA-детектора.",
  openRawDetectorSource: "Открыть чистый исходник только детектора",
  fullStageExact: "Точный блок из source/cuda_deepid_detector.py",
  fullStageDetector: "Точный блок из source/cuda_deepid_detector.py",
  fullStageNotebook: "Точный блок из source/cuda_deepid_detector.py",
  codeSourceFull: "Точный полный исходник этого этапа детектора",
  codeSourceShort: "Короткая схема исполняемого пути",
  lineCount: "{count} строк"
});

Object.assign(translations.he, {
  variantKicker: "גרסת קוד המקור של CUDA",
  variantTitle: "בחרו את מסלול הזיהוי לעיון",
  variantSingle: "זיהוי תמונה בודדת",
  variantBatch: "זיהוי אצווה",
  sourceTitle: "קוד הגלאי המלא למסלול CUDA שנבחר",
  sourceIntro: "הקוד למטה הוא חיבור מדויק של הקוד המלא בששת השלבים של הגרסה שנבחרה. הדף בודק גם את מספר השורות וגם את סדר הטקסט המדויק.",
  sourceClosed: "הקוד סגור. פתחו את הקוד המלא של הגרסה שנבחרה.",
  sourceLoading: "טוען את מודול גלאי CUDA הייעודי…",
  sourceLoaded: "נבדק: {total} שורות בקוד המלא של «{variant}» = {sum} שורות בשלבים 1–6; הטקסט זהה.",
  sourceCountError: "בדיקת «{variant}» נכשלה: {total} שורות בקוד המלא לעומת {sum} בשלבים 1–6.",
  sourceError: "לא ניתן לטעון או לאמת את מודול גלאי CUDA הייעודי.",
  openRawDetectorSource: "פתיחת קוד המקור הגולמי של הגלאי בלבד",
  fullStageExact: "מקטע מדויק מתוך source/cuda_deepid_detector.py",
  fullStageDetector: "מקטע מדויק מתוך source/cuda_deepid_detector.py",
  fullStageNotebook: "מקטע מדויק מתוך source/cuda_deepid_detector.py",
  codeSourceFull: "קוד המקור המלא והמדויק של שלב הגלאי",
  codeSourceShort: "תרשים קצר של מסלול הביצוע",
  lineCount: "{count} שורות"
});

const commonDetectorStages = [
  {
    level: "01",
    title: {
      en: "Initialization and CUDA device selection",
      ru: "Инициализация и выбор устройства CUDA",
      he: "אתחול ובחירת התקן CUDA"
    },
    summary: {
      en: "Defines the detector-only dependencies and thresholds, creates the detector object, lazily imports PyTorch, and selects CUDA only when the requested GPU mode is actually available.",
      ru: "Определяет зависимости и пороги самого детектора, создаёт объект, лениво импортирует PyTorch и выбирает CUDA только тогда, когда запрошен GPU-режим и CUDA действительно доступна.",
      he: "מגדיר את תלויות הגלאי ואת הספים, יוצר את אובייקט הגלאי, מייבא את PyTorch בעת הצורך ובוחר CUDA רק כאשר התבקש מצב GPU ו-CUDA זמינה בפועל."
    },
    diagram: {
      en: ["Imports and constants", "Detector object", "Lazy PyTorch import", "CPU or CUDA"],
      ru: ["Импорты и константы", "Объект детектора", "Ленивый импорт PyTorch", "CPU или CUDA"],
      he: ["ייבואים וקבועים", "אובייקט הגלאי", "ייבוא PyTorch בעת הצורך", "CPU או CUDA"]
    },
    layers: { en: "No neural layer; runtime initialization", ru: "Нейрослоя нет; инициализация среды", he: "אין שכבה עצבית; אתחול סביבת הריצה" },
    connections: { en: "No MACs; device and cache state only", ru: "MAC нет; только выбор устройства и состояние кэша", he: "אין MAC; רק בחירת התקן ומצב מטמון" },
    tensor: "No input tensor yet",
    cudaShort: { en: "torch.cuda.is_available() decides whether GPU mode is real", ru: "torch.cuda.is_available() определяет, является ли GPU-режим реальным", he: "torch.cuda.is_available() קובע אם מצב GPU אמיתי" },
    cuda: {
      en: "This stage does not perform inference. It creates empty caches and returns the literal device name \"cuda\" only when PyTorch reports a usable CUDA runtime; an explicit CPU request always remains on CPU.",
      ru: "Этот этап ещё не выполняет инференс. Он создаёт пустые кэши и возвращает имя устройства «cuda» только когда PyTorch сообщает о рабочей CUDA-среде; явный запрос CPU всегда остаётся на CPU.",
      he: "שלב זה עדיין אינו מבצע הסקה. הוא יוצר מטמונים ריקים ומחזיר את שם ההתקן \"cuda\" רק כאשר PyTorch מדווח על סביבת CUDA פעילה; בקשת CPU מפורשת נשארת תמיד ב-CPU."
    },
    code: `detector = DeepIDIdentityDetector(work_dir)
device = detector._device_name("gpu")
# device is "cuda" only when torch.cuda.is_available() is True`
  },
  {
    level: "02",
    title: {
      en: "DeepID weights and neural model",
      ru: "Веса DeepID и нейросетевая модель",
      he: "משקלי DeepID והמודל העצבי"
    },
    summary: {
      en: "Reads the trained binary tensors, validates their file signature, builds the exact DeepID convolution and dense layers, moves the model to the selected device, and caches it.",
      ru: "Читает обученные бинарные тензоры, проверяет сигнатуру файла, строит точные свёрточные и полносвязные слои DeepID, переносит модель на выбранное устройство и кэширует её.",
      he: "קורא את הטנזורים המאומנים מהקובץ הבינרי, מאמת את חתימת הקובץ, בונה את שכבות הקונבולוציה והשכבות הצפופות של DeepID, מעביר את המודל להתקן שנבחר ושומר אותו במטמון."
    },
    diagram: {
      en: ["deepid_weights.bin", "Validate and reshape", "Build DeepIDTorch", "model.to(device).eval()"],
      ru: ["deepid_weights.bin", "Проверка и изменение формы", "Создание DeepIDTorch", "model.to(device).eval()"],
      he: ["deepid_weights.bin", "אימות ושינוי צורה", "בניית DeepIDTorch", "model.to(device).eval()"]
    },
    layers: { en: "4 convolution layers, 2 dense branches, 3 max pools", ru: "4 свёрточных слоя, 2 полносвязные ветви, 3 max-pooling", he: "4 שכבות קונבולוציה, 2 ענפים צפופים ו-3 max-pooling" },
    connections: { en: "Learned Conv1–Conv4 and FC11–FC12 parameters", ru: "Обученные параметры Conv1–Conv4 и FC11–FC12", he: "פרמטרים מאומנים של Conv1–Conv4 ושל FC11–FC12" },
    tensor: "55×47×3 → normalized 160D embedding",
    cudaShort: { en: "model.to(\"cuda\") moves registered weight buffers to the NVIDIA GPU", ru: "model.to(\"cuda\") переносит зарегистрированные буферы весов на GPU NVIDIA", he: "model.to(\"cuda\") מעביר את מאגרי המשקלים הרשומים ל-GPU של NVIDIA" },
    cuda: {
      en: "PyTorch executes the convolution, pooling, matrix multiplication, ReLU, and L2 normalization on CUDA because both the registered model buffers and later input tensors reside on the CUDA device.",
      ru: "PyTorch выполняет свёртки, pooling, матричные умножения, ReLU и L2-нормализацию через CUDA, потому что зарегистрированные буферы модели и последующие входные тензоры находятся на устройстве CUDA.",
      he: "PyTorch מבצע את הקונבולוציות, ה-pooling, כפל המטריצות, ReLU ונרמול L2 דרך CUDA, מפני שגם מאגרי המודל הרשומים וגם טנזורי הקלט נמצאים בהתקן CUDA."
    },
    code: `weights = detector._load_weights()
model, device = detector._model("gpu")
# DeepIDTorch(weights).to(device).eval()`
  },
  {
    level: "03",
    title: {
      en: "Screenshot variants and input tensors",
      ru: "Варианты скриншота и входные тензоры",
      he: "גרסאות צילום המסך וטנזורי הקלט"
    },
    summary: {
      en: "Opens the existing screenshot, creates centered crops, letterboxes each image to 47×55, converts RGB bytes to normalized float values, changes channel order, and transfers each tensor to the selected device.",
      ru: "Открывает существующий скриншот, создаёт центральные обрезки, вписывает каждое изображение в 47×55, переводит RGB-байты в нормализованные числа float, меняет порядок каналов и переносит каждый тензор на выбранное устройство.",
      he: "פותח את צילום המסך הקיים, יוצר חיתוכים מרכזיים, מתאים כל תמונה למסגרת 47×55, ממיר בייטי RGB לערכי float מנורמלים, משנה את סדר הערוצים ומעביר כל טנזור להתקן שנבחר."
    },
    diagram: {
      en: ["Screenshot path", "Full frame + center crops", "47×55 letterbox", "CHW float tensor on device"],
      ru: ["Путь к скриншоту", "Полный кадр и центральные обрезки", "Вписывание в 47×55", "CHW float-тензор на устройстве"],
      he: ["נתיב צילום המסך", "פריים מלא וחיתוכים מרכזיים", "התאמה ל-47×55", "טנזור float בסדר CHW על ההתקן"]
    },
    layers: { en: "Image preprocessing; no learned layer", ru: "Предобработка изображения; обучаемого слоя нет", he: "עיבוד מקדים של התמונה; אין שכבה נלמדת" },
    connections: { en: "7,755 float values per prepared variant", ru: "7 755 значений float на каждый подготовленный вариант", he: "7,755 ערכי float לכל גרסה מוכנה" },
    tensor: "Pillow RGB → NumPy 55×47×3 → PyTorch 3×55×47",
    cudaShort: { en: "tensor.to(device, non_blocking=True) performs the host-to-device transfer", ru: "tensor.to(device, non_blocking=True) выполняет перенос host→device", he: "tensor.to(device, non_blocking=True) מבצע העברה מן המארח להתקן" },
    cuda: {
      en: "Cropping and Pillow resizing happen on the host. The final channel-first float tensor is created from NumPy and moved to CUDA before it enters the neural model.",
      ru: "Обрезка и изменение размера средствами Pillow происходят на CPU. Итоговый float-тензор с каналом в первом измерении создаётся из NumPy и переносится в CUDA перед подачей в нейросеть.",
      he: "החיתוך ושינוי הגודל באמצעות Pillow מתבצעים במארח. טנזור ה-float הסופי, שבו הערוץ הוא הממד הראשון, נוצר מתוך NumPy ומועבר ל-CUDA לפני הכניסה לרשת."
    },
    code: `variants = detector._variants(screenshot_path)
tensors = [detector._preprocess_pil(image, device) for _, image in variants]
x = torch.stack(tensors, dim=0)`
  },
  {
    level: "04",
    title: {
      en: "One-time reference initialization",
      ru: "Одноразовая инициализация эталонов",
      he: "אתחול חד-פעמי של דוגמאות הייחוס"
    },
    summary: {
      en: "Finds reference photographs for Adi, Faraj, and Slava, preprocesses them, embeds all references in one model call, synchronizes CUDA for a complete initialization, and caches the resulting matrix by device.",
      ru: "Находит эталонные фотографии Ади, Фараджа и Славы, подготавливает их, получает векторы всех эталонов одним вызовом модели, синхронизирует CUDA до завершения и кэширует итоговую матрицу отдельно для каждого устройства.",
      he: "מאתר תמונות ייחוס של Adi, Faraj ו-Slava, מעבד אותן, מחשב את כל וקטורי הייחוס בקריאת מודל אחת, מסנכרן את CUDA עד להשלמת האתחול ושומר את המטריצה במטמון לפי התקן."
    },
    diagram: {
      en: ["Reference folders", "Prepared tensors", "One model batch", "Cached reference matrix"],
      ru: ["Папки эталонов", "Подготовленные тензоры", "Один пакет модели", "Кэшированная матрица эталонов"],
      he: ["תיקיות ייחוס", "טנזורים מוכנים", "אצוות מודל אחת", "מטריצת ייחוס במטמון"]
    },
    layers: { en: "Same DeepID forward pass, executed once per device", ru: "Тот же прямой проход DeepID, один раз для каждого устройства", he: "אותו מעבר קדמי של DeepID, פעם אחת לכל התקן" },
    connections: { en: "All reference images are embedded in one stacked tensor", ru: "Все эталонные изображения объединяются в один тензор", he: "כל תמונות הייחוס נערמות לטנזור אחד" },
    tensor: "N references × 3×55×47 → N×160 reference matrix",
    cudaShort: { en: "Reference embeddings stay cached on CUDA for later comparisons", ru: "Векторы эталонов остаются в CUDA-кэше для последующих сравнений", he: "וקטורי הייחוס נשארים במטמון CUDA להשוואות הבאות" },
    cuda: {
      en: "This is the one-time detector warm-up requested in the count. A second call on the same device returns immediately because self.ref_emb already contains that device's reference matrix.",
      ru: "Это одноразовый прогрев детектора, который включается в подсчёт. Повторный вызов на том же устройстве сразу завершается, потому что self.ref_emb уже содержит матрицу эталонов этого устройства.",
      he: "זהו חימום הגלאי החד-פעמי שנכלל בספירה. קריאה נוספת באותו התקן חוזרת מיד, מפני ש-self.ref_emb כבר מכיל את מטריצת הייחוס של אותו התקן."
    },
    code: `detector.load_references("gpu")
# self.ref_emb["cuda"] now stores all normalized reference embeddings`
  }
];

const detectorVariantCatalog = {
  single: {
    label: {
      en: "single-image recognition",
      ru: "одиночное распознавание",
      he: "זיהוי תמונה בודדת"
    },
    description: {
      en: "One existing screenshot is expanded into several centered variants, processed as one tensor batch, compared with the cached references, and reduced to one identity result.",
      ru: "Один существующий скриншот превращается в несколько центральных вариантов, обрабатывается одним пакетом тензоров, сравнивается с кэшированными эталонами и сводится к одному результату.",
      he: "צילום מסך קיים אחד הופך לכמה גרסאות מרכזיות, מעובד כאצוות טנזורים אחת, מושווה לדוגמאות הייחוס שבמטמון ומצטמצם לתוצאת זהות אחת."
    },
    source: {
      en: "Source boundary: module start through DeepIDIdentityDetector.detect_image; detect_batch is excluded.",
      ru: "Граница исходника: от начала модуля до DeepIDIdentityDetector.detect_image; detect_batch исключён.",
      he: "גבול קוד המקור: מתחילת המודול עד DeepIDIdentityDetector.detect_image; ‏detect_batch אינו נכלל."
    },
    stages: [
      ...commonDetectorStages,
      {
        level: "05",
        title: { en: "Embedding comparison and identity decision", ru: "Сравнение векторов и решение о личности", he: "השוואת וקטורים והחלטת זהות" },
        summary: {
          en: "Runs all variants through DeepID, multiplies their normalized embeddings by the cached reference matrix, keeps the best score for each person, checks score and margin thresholds, and returns Unknown when confidence is insufficient.",
          ru: "Пропускает все варианты через DeepID, умножает нормализованные векторы на кэшированную матрицу эталонов, сохраняет лучший результат каждого человека, проверяет пороги сходства и отрыва и возвращает Unknown при недостаточной уверенности.",
          he: "מעביר את כל הגרסאות דרך DeepID, מכפיל את הווקטורים המנורמלים במטריצת הייחוס שבמטמון, שומר את הציון הטוב ביותר לכל אדם, בודק ספי ציון ופער ומחזיר Unknown כאשר הביטחון אינו מספיק."
        },
        diagram: {
          en: ["Variant batch", "160D embeddings", "Cosine-score matrix", "Best and runner-up", "Identity or Unknown"],
          ru: ["Пакет вариантов", "Векторы 160D", "Матрица сходства", "Лучший и второй результат", "Имя или Unknown"],
          he: ["אצוות גרסאות", "וקטורי 160D", "מטריצת דמיון", "הטוב ביותר והשני", "זהות או Unknown"]
        },
        layers: { en: "One batched DeepID forward plus score reduction", ru: "Один пакетный проход DeepID и свёртка результатов", he: "מעבר DeepID אחד באצווה וצמצום ציונים" },
        connections: { en: "variant embeddings @ reference_embeddings.T", ru: "variant_embeddings @ reference_embeddings.T", he: "variant_embeddings @ reference_embeddings.T" },
        tensor: "V×160 @ 160×N → V×N similarity matrix",
        cudaShort: { en: "One CUDA model call for every crop of the screenshot", ru: "Один вызов CUDA-модели для всех обрезок скриншота", he: "קריאת מודל CUDA אחת לכל חיתוכי צילום המסך" },
        cuda: {
          en: "The variants are stacked before the model call, so CUDA processes them together. The similarity matrix is then copied to CPU only when _decide converts it to NumPy for label selection.",
          ru: "Варианты объединяются до вызова модели, поэтому CUDA обрабатывает их вместе. Матрица сходства копируется на CPU только внутри _decide, когда преобразуется в NumPy для выбора имени.",
          he: "הגרסאות נערמות לפני קריאת המודל ולכן CUDA מעבדת אותן יחד. מטריצת הדמיון מועתקת ל-CPU רק בתוך _decide, כאשר היא מומרת ל-NumPy לצורך בחירת השם."
        },
        code: `emb, device = detector._embed_variants(variants, "gpu")
sims = emb @ detector.ref_emb[device].T
result = detector._decide(variants, sims, device, screenshot_path, elapsed_ms, None)`
      },
      {
        level: "06",
        title: { en: "Single-image execution and result", ru: "Запуск одного изображения и результат", he: "הרצת תמונה בודדת והתוצאה" },
        summary: {
          en: "detect_image connects the complete path: load screenshot variants, time the model and comparison, synchronize CUDA before stopping the timer, and return the final result dictionary.",
          ru: "detect_image соединяет полный путь: загружает варианты скриншота, измеряет работу модели и сравнение, синхронизирует CUDA перед остановкой таймера и возвращает итоговый словарь.",
          he: "detect_image מחבר את המסלול המלא: טוען את גרסאות צילום המסך, מודד את פעולת המודל וההשוואה, מסנכרן את CUDA לפני עצירת השעון ומחזיר את מילון התוצאה הסופי."
        },
        diagram: {
          en: ["detect_image(path)", "Variants", "CUDA embeddings", "Similarity", "_decide result"],
          ru: ["detect_image(path)", "Варианты", "CUDA-векторы", "Сходство", "Результат _decide"],
          he: ["detect_image(path)", "גרסאות", "וקטורי CUDA", "דמיון", "תוצאת _decide"]
        },
        layers: { en: "Orchestration of the preceding detector stages", ru: "Оркестрация предыдущих этапов детектора", he: "תזמור של שלבי הגלאי הקודמים" },
        connections: { en: "One screenshot result dictionary", ru: "Один словарь результата скриншота", he: "מילון תוצאה אחד לצילום המסך" },
        tensor: "Path → V×N scores → one result dictionary",
        cudaShort: { en: "CUDA synchronization makes elapsed_ms measure completed GPU work", ru: "Синхронизация CUDA гарантирует, что elapsed_ms учитывает завершённую работу GPU", he: "סנכרון CUDA מבטיח ש-elapsed_ms מודד עבודת GPU שהושלמה" },
        cuda: {
          en: "CUDA launches are asynchronous. torch.cuda.synchronize() waits for the queued kernels before elapsed_ms is calculated, preventing the program from reporting only launch overhead as GPU time.",
          ru: "Запуски CUDA асинхронны. torch.cuda.synchronize() ждёт завершения поставленных в очередь ядер до вычисления elapsed_ms, поэтому программа не выдаёт только накладные расходы запуска вместо времени GPU.",
          he: "הפעלות CUDA הן אסינכרוניות. torch.cuda.synchronize() ממתין לסיום הקרנלים שבתור לפני חישוב elapsed_ms, וכך התוכנית אינה מדווחת רק על זמן השיגור במקום על זמן עבודת ה-GPU."
        },
        code: `result = detector.detect_image(screenshot_path, mode="gpu")
print(result["identity"], result["best_score"], result["elapsed_ms"])`
      }
    ]
  },
  batch: {
    label: {
      en: "batch recognition",
      ru: "пакетное распознавание",
      he: "זיהוי אצווה"
    },
    description: {
      en: "All variants from all screenshots are stacked into one large CUDA tensor and processed in one model call. Results are then split back by source image and summarized without pretending that sequential CPU work is a GPU batch.",
      ru: "Все варианты всех скриншотов объединяются в один большой CUDA-тензор и обрабатываются одним вызовом модели. Затем результаты разделяются по исходным изображениям и сводятся в итог без подмены последовательной CPU-обработки GPU-пакетом.",
      he: "כל הגרסאות מכל צילומי המסך נערמות לטנזור CUDA גדול אחד ומעובדות בקריאת מודל אחת. לאחר מכן התוצאות מפוצלות לפי תמונת המקור ומסוכמות, בלי להציג עיבוד CPU סדרתי כאצוות GPU."
    },
    source: {
      en: "Source boundary: the complete dedicated module, including detect_batch and short_text.",
      ru: "Граница исходника: весь отдельный модуль, включая detect_batch и short_text.",
      he: "גבול קוד המקור: כל המודול הייעודי, כולל detect_batch ו-short_text."
    },
    stages: [
      ...commonDetectorStages,
      {
        level: "05",
        title: { en: "Shared decision helpers", ru: "Общие функции принятия решения", he: "פונקציות החלטה משותפות" },
        summary: {
          en: "Defines the shared embedding and decision functions used by the detector. The batch CPU branch calls detect_image for each file; the real GPU batch branch reuses _decide after its single combined model call.",
          ru: "Определяет общие функции получения векторов и выбора имени. CPU-ветвь пакета вызывает detect_image для каждого файла; настоящая GPU-ветвь повторно использует _decide после одного общего вызова модели.",
          he: "מגדיר את פונקציות חישוב הווקטורים וההחלטה המשותפות. ענף ה-CPU של האצווה קורא ל-detect_image עבור כל קובץ; ענף ה-GPU האמיתי משתמש שוב ב-_decide לאחר קריאת מודל משולבת אחת."
        },
        diagram: {
          en: ["Shared preprocessing", "Shared score matrix", "_decide per image", "CPU fallback via detect_image"],
          ru: ["Общая подготовка", "Общая матрица сходства", "_decide для каждого файла", "CPU fallback через detect_image"],
          he: ["עיבוד מקדים משותף", "מטריצת דמיון משותפת", "_decide לכל תמונה", "מסלול CPU דרך detect_image"]
        },
        layers: { en: "Shared DeepID and decision code", ru: "Общий код DeepID и принятия решения", he: "קוד DeepID והחלטה משותף" },
        connections: { en: "Normalized embeddings and per-identity score reduction", ru: "Нормализованные векторы и свёртка результатов по людям", he: "וקטורים מנורמלים וצמצום ציונים לפי זהות" },
        tensor: "Per-image variant score matrices",
        cudaShort: { en: "Shared helpers do not disguise the sequential CPU branch as GPU", ru: "Общие функции не выдают последовательную CPU-ветвь за GPU", he: "הפונקציות המשותפות אינן מציגות את ענף ה-CPU הסדרתי כ-GPU" },
        cuda: {
          en: "This stage contains both the reusable decision logic and the one-image function required by the explicit CPU fallback. The following stage contains the distinct, genuinely batched GPU implementation.",
          ru: "На этом этапе находятся повторно используемая логика решения и функция одного изображения, необходимая явной CPU-ветви. Отдельная настоящая пакетная GPU-реализация находится на следующем этапе.",
          he: "שלב זה מכיל את לוגיקת ההחלטה לשימוש חוזר ואת פונקציית התמונה הבודדת שנדרשת לענף ה-CPU המפורש. מימוש ה-GPU האצוותי האמיתי והנפרד נמצא בשלב הבא."
        },
        code: `# Shared by CPU and GPU batch branches:
result = detector._decide(local_variants, local_scores, device, path, per_image_ms, hint)`
      },
      {
        level: "06",
        title: { en: "Parallel CUDA batch and summary", ru: "Параллельный CUDA-пакет и итог", he: "אצוות CUDA מקבילית וסיכום" },
        summary: {
          en: "Flattens variants from every screenshot into one list, stacks one CUDA input tensor, executes one DeepID forward pass and one matrix comparison, slices scores back per image, decides each identity, and returns aggregate timing and results.",
          ru: "Объединяет варианты всех скриншотов в один список, создаёт один входной CUDA-тензор, выполняет один проход DeepID и одно матричное сравнение, разделяет результаты обратно по изображениям, определяет каждое имя и возвращает общий итог со временем.",
          he: "מאחד את הגרסאות מכל צילומי המסך לרשימה אחת, יוצר טנזור קלט CUDA אחד, מבצע מעבר DeepID אחד והשוואת מטריצה אחת, מפצל את הציונים בחזרה לפי תמונה, קובע כל זהות ומחזיר סיכום כולל עם זמנים."
        },
        diagram: {
          en: ["Many image paths", "All variants flattened", "One CUDA tensor", "One model call", "Split scores", "Batch result"],
          ru: ["Много путей", "Все варианты объединены", "Один CUDA-тензор", "Один вызов модели", "Разделение результатов", "Пакетный итог"],
          he: ["נתיבי תמונות רבים", "כל הגרסאות אוחדו", "טנזור CUDA אחד", "קריאת מודל אחת", "פיצול ציונים", "תוצאת אצווה"]
        },
        layers: { en: "One neural forward pass for the complete GPU batch", ru: "Один проход нейросети для всего GPU-пакета", he: "מעבר עצבי אחד לכל אצוות ה-GPU" },
        connections: { en: "Batched embedding matrix @ cached reference matrix", ru: "Матрица пакетных векторов @ кэшированная матрица эталонов", he: "מטריצת וקטורי האצווה @ מטריצת הייחוס שבמטמון" },
        tensor: "Σ variants × 3×55×47 → Σ variants × N scores",
        cudaShort: { en: "One model(x) call processes all screenshots in parallel on CUDA", ru: "Один вызов model(x) параллельно обрабатывает все скриншоты через CUDA", he: "קריאת model(x) אחת מעבדת את כל צילומי המסך במקביל ב-CUDA" },
        cuda: {
          en: "The GPU path is structurally different from the CPU path: it stacks every prepared variant before inference, invokes model(x) once, computes all similarities at once, and synchronizes once. Only afterward are score slices assigned back to individual screenshots.",
          ru: "GPU-путь структурно отличается от CPU-пути: он объединяет все подготовленные варианты до инференса, один раз вызывает model(x), сразу вычисляет все сходства и один раз синхронизирует CUDA. Только после этого части матрицы результатов сопоставляются отдельным скриншотам.",
          he: "מסלול ה-GPU שונה מבנית ממסלול ה-CPU: הוא מערים את כל הגרסאות המוכנות לפני ההסקה, קורא ל-model(x) פעם אחת, מחשב את כל הדמיונות יחד ומסנכרן CUDA פעם אחת. רק לאחר מכן פרוסות הציונים משויכות בחזרה לצילומי המסך."
        },
        code: `batch = detector.detect_batch(image_paths, mode="gpu")
# GPU branch performs one model(x) call for every prepared variant
print(batch["results"], batch["total_ms"], batch["avg_ms_per_photo"])`
      }
    ]
  }
};

function activeVariantDefinition() {
  return detectorVariantCatalog[activeDetectorVariant] || detectorVariantCatalog.single;
}

function renderDetectorVariantUi() {
  const variant = activeVariantDefinition();
  if (stageDetails[0]?.variantKey !== activeDetectorVariant) {
    const stages = variant.stages.map((stage) => ({ ...stage, variantKey: activeDetectorVariant }));
    stageDetails.splice(0, stageDetails.length, ...stages);
  }
  if (detectorVariantDescription) detectorVariantDescription.textContent = localized(variant.description);
  if (detectorVariantSource) detectorVariantSource.textContent = localized(variant.source);
  detectorVariantButtons.forEach((button) => {
    const selected = button.dataset.detectorVariant === activeDetectorVariant;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  document.querySelectorAll(".pipeline-step").forEach((step, index) => {
    const stage = stageDetails[index];
    if (!stage) return;
    const title = step.querySelector("h4");
    const paragraph = step.querySelector("p");
    if (title) title.textContent = localized(stage.title);
    if (paragraph) paragraph.textContent = localized(stage.summary);
  });
}

function selectDetectorVariant(name) {
  if (!detectorVariantCatalog[name]) return;
  activeDetectorVariant = name;
  hideStageDetail();
  stageCodeMode = "short";
  exactStageCodeState = detectorSourceLoaded ? "idle" : "idle";
  combinedRecognitionCode = "";
  combinedRecognitionLineCount = 0;
  stageRecognitionLineCount = 0;
  renderDetectorVariantUi();
  if (detectorSourceVisible) {
    fullDetectorSource.innerHTML = "";
    fullSourceMeta.textContent = uiText("sourceLoading");
    ensureExactStageCode().then((ready) => {
      if (ready && detectorSourceVisible) {
        renderDetectorSource(combinedRecognitionCode);
        updateDetectorSourceUi();
      }
    });
  } else {
    updateDetectorSourceUi();
  }
}


function setLanguage(lang) {
  const dict = translations[lang] || translations.en;
  const extra = detailUi[lang] || detailUi.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (dict[key] || extra[key]) node.textContent = repairLocalizedText(dict[key] || extra[key]);
  });
  document.querySelectorAll(".lang").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });
  renderDetectorVariantUi();
  if (currentStageIndex >= 0 && !stageDetail.classList.contains("hidden")) {
    renderStageDetail(currentStageIndex, false);
  }
  updateDetectorSourceUi();
  if (detectorSourceVisible) {
    if (combinedRecognitionCode) renderDetectorSource(combinedRecognitionCode);
  }
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === id);
  });
  if (id === "complex") {
    renderComplexFrame();
  }
  if (id !== "simple") hideStageDetail();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function localized(value) {
  if (!value) return "";
  if (typeof value === "string") return repairLocalizedText(value);
  if (Array.isArray(value)) return value.map((item) => repairLocalizedText(item));
  const lang = document.documentElement.lang || "en";
  const selected = value[lang] || value.en || "";
  return Array.isArray(selected) ? selected.map((item) => repairLocalizedText(item)) : repairLocalizedText(selected);
}

const codeAnnotationFallback = {
  en: "This line belongs to the CUDA/OpenCL detector pipeline for the selected stage.",
  ru: "Эта строка относится к CUDA/OpenCL-цепочке детектора на выбранном этапе.",
  he: "השורה הזו שייכת לשרשרת CUDA/OpenCL של הגלאי בשלב הנבחר."
};

const codeBlankAnnotation = {
  en: "Visual separator between logical parts of the stage.",
  ru: "Визуальный разделитель между логическими частями этапа.",
  he: "מפריד חזותי בין חלקים לוגיים של השלב."
};

const detailedCodeLineAnnotations = {
  "print(\"torch:\", torch.__version__)": {
    en: "Prints the installed PyTorch version. This is a diagnostic check only; it does not select a device or run the neural network.",
    ru: "Выводит установленную версию PyTorch. Это только диагностическая проверка: она не выбирает устройство и не запускает нейросеть.",
    he: "מדפיסה את גרסת PyTorch המותקנת. זו בדיקת אבחון בלבד; היא אינה בוחרת התקן ואינה מריצה את הרשת העצבית."
  },
  "print(\"cuda:\", torch.cuda.is_available())": {
    en: "Prints whether PyTorch can use CUDA in this process. The result is True or False; this line only reports availability and does not start GPU computation.",
    ru: "Выводит, может ли PyTorch использовать CUDA в этом процессе. Результат — True или False; строка только сообщает доступность и не запускает вычисление на GPU.",
    he: "מדפיסה האם PyTorch יכול להשתמש ב-CUDA בתהליך הזה. התוצאה היא True או False; השורה רק מדווחת על זמינות ואינה מתחילה חישוב ב-GPU."
  },
  "if torch.cuda.is_available():": {
    en: "Checks the availability result. The indented lines below run only when CUDA is available, preventing GPU-only calls on a CPU-only machine.",
    ru: "Проверяет результат доступности CUDA. Вложенные ниже строки выполнятся только при наличии CUDA — это защищает от вызова GPU-функций на компьютере без GPU.",
    he: "בודקת את תוצאת הזמינות של CUDA. השורות המוזחות למטה ירוצו רק כאשר CUDA זמינה, וכך נמנעת קריאה לפונקציות GPU במחשב ללא GPU."
  },
  "print(torch.cuda.get_device_name(0))": {
    en: "Asks the CUDA driver for the name of device 0, the first available NVIDIA GPU, and prints it. It identifies the accelerator but does not run the model.",
    ru: "Запрашивает у CUDA-драйвера имя устройства 0 — первой доступной видеокарты NVIDIA — и выводит его. Строка определяет ускоритель, но не запускает модель.",
    he: "מבקשת ממנהל ההתקן של CUDA את שם התקן 0 — כרטיס ה-NVIDIA הזמין הראשון — ומדפיסה אותו. השורה מזהה את המאיץ אך אינה מריצה את המודל."
  },
  "if mode.lower() in (\"gpu\", \"cuda\") and torch.cuda.is_available():": {
    en: "Selects the CUDA path only when the user requested GPU/CUDA mode and PyTorch confirmed that CUDA is available.",
    ru: "Выбирает путь CUDA только если пользователь запросил режим GPU/CUDA и PyTorch подтвердил доступность CUDA.",
    he: "בוחרת בנתיב CUDA רק כאשר המשתמש ביקש מצב GPU/CUDA ו-PyTorch אישר ש-CUDA זמינה."
  },
  "return \"cuda\" if torch.cuda.is_available() else \"cpu\"": {
    en: "Chooses the automatic backend label: CUDA when available, otherwise CPU. The line chooses a mode; it does not perform recognition itself.",
    ru: "Выбирает метку автоматического backend: CUDA при доступности, иначе CPU. Строка выбирает режим, но сама не выполняет распознавание.",
    he: "בוחרת תווית backend אוטומטית: CUDA כאשר היא זמינה, אחרת CPU. השורה בוחרת מצב ואינה מבצעת זיהוי בעצמה."
  },
  "if device == \"cuda\":": {
    en: "Checks whether the selected backend is CUDA before performing an operation that is meaningful only for GPU execution.",
    ru: "Проверяет, выбран ли backend CUDA, перед операцией, которая имеет смысл только при выполнении на GPU.",
    he: "בודקת האם ה-backend שנבחר הוא CUDA לפני פעולה שמשמעותית רק בהרצה על GPU."
  },
  "torch.cuda.synchronize()": {
    en: "Waits for queued GPU kernels to finish. It is used before timing or reading results so the reported duration includes the real CUDA work.",
    ru: "Ждёт завершения поставленных в очередь GPU-kernel. Это нужно перед измерением времени или чтением результата, чтобы длительность включала реальную работу CUDA.",
    he: "ממתינה לסיום קרנלי ה-GPU שנמצאים בתור. הפעולה נדרשת לפני מדידת זמן או קריאת תוצאה, כדי שהמשך המדווח יכלול את עבודת CUDA האמיתית."
  },
  "# colab_ai_mips_bee_world.py: image crop/resize/normalization path": {
    en: "Names the exact project module and the preprocessing path shown below: crop, aspect-ratio-preserving resize, padding, and tensor normalization.",
    ru: "Указывает точный модуль проекта и путь предварительной обработки ниже: обрезка, масштабирование с сохранением пропорций, поля и нормализация тензора.",
    he: "מציינת את מודול הפרויקט המדויק ואת מסלול העיבוד המקדים שמוצג בהמשך: חיתוך, שינוי גודל עם שמירת יחס, שוליים ונרמול טנזור."
  },
  "def _preprocess_pil(self, img: Image.Image, device: str)": {
    en: "Defines the preprocessing function. It receives one Pillow image and the target device name, then returns a model-ready tensor.",
    ru: "Объявляет функцию предварительной обработки. Она принимает одно изображение Pillow и имя целевого устройства, затем возвращает тензор, готовый для модели.",
    he: "מגדירה את פונקציית העיבוד המקדים. היא מקבלת תמונת Pillow אחת ואת שם התקן היעד, ומחזירה טנזור מוכן למודל."
  },
  "torch, _, _ = self._ensure_torch()": {
    en: "Obtains the PyTorch runtime from the detector. The two underscore variables are returned helper values that this function does not need.",
    ru: "Получает среду PyTorch из детектора. Две переменные с подчёркиванием получают служебные возвращаемые значения, которые этой функции не нужны.",
    he: "מקבלת את סביבת PyTorch מהגלאי. שני המשתנים עם קו תחתון מקבלים ערכי עזר מוחזרים שהפונקציה הזו אינה צריכה."
  },
  "img = img.convert(\"RGB\")": {
    en: "Converts the input to three RGB color channels. This removes grayscale or alpha-channel differences before building the tensor.",
    ru: "Приводит вход к трём цветовым каналам RGB. Это убирает различия между серыми изображениями и изображениями с альфа-каналом до построения тензора.",
    he: "ממירה את הקלט לשלושה ערוצי צבע RGB. כך מוסרים הבדלים בין תמונות אפורות או תמונות עם ערוץ אלפא לפני בניית הטנזור."
  },
  "src_w, src_h = img.size": {
    en: "Reads the original image width and height in pixels: src_w is width and src_h is height.",
    ru: "Считывает исходные ширину и высоту изображения в пикселях: `src_w` — ширина, `src_h` — высота.",
    he: "קוראת את רוחב וגובה התמונה המקורית בפיקסלים: `src_w` הוא הרוחב ו-`src_h` הוא הגובה."
  },
  "target_w, target_h = 47, 55": {
    en: "Sets the network input frame to 47 pixels wide by 55 pixels high. After channels are moved first, one image tensor has shape [3, 55, 47].",
    ru: "Задаёт кадр входа нейросети: 47 пикселей по ширине и 55 по высоте. После переноса каналов вперёд один тензор изображения имеет размерность `[3, 55, 47]`.",
    he: "מגדירה את מסגרת הקלט של הרשת: רוחב 47 פיקסלים וגובה 55 פיקסלים. לאחר העברת הערוצים להתחלה, טנזור תמונה אחד הוא בגודל `[3, 55, 47]`."
  },
  "scale = min(target_w / src_w, target_h / src_h)": {
    en: "Computes one scale factor that makes the image fit inside 47 x 55 without stretching it. The smaller ratio preserves the original aspect ratio.",
    ru: "Вычисляет единый коэффициент масштаба, чтобы изображение поместилось в 47 x 55 без растяжения. Меньшее из двух отношений сохраняет исходные пропорции.",
    he: "מחשבת גורם קנה מידה יחיד כדי שהתמונה תיכנס ל-47 x 55 בלי למתוח אותה. היחס הקטן מבין השניים שומר על יחס הממדים המקורי."
  },
  "resized_w = max(1, int(src_w * scale))": {
    en: "Calculates the scaled width in whole pixels and guarantees that it is at least one pixel wide.",
    ru: "Вычисляет масштабированную ширину в целых пикселях и гарантирует, что она будет не меньше одного пикселя.",
    he: "מחשבת את הרוחב לאחר שינוי הגודל בפיקסלים שלמים ומבטיחה שהוא יהיה לפחות פיקסל אחד."
  },
  "resized_h = max(1, int(src_h * scale))": {
    en: "Calculates the scaled height in whole pixels and guarantees that it is at least one pixel high.",
    ru: "Вычисляет масштабированную высоту в целых пикселях и гарантирует, что она будет не меньше одного пикселя.",
    he: "מחשבת את הגובה לאחר שינוי הגודל בפיקסלים שלמים ומבטיחה שהוא יהיה לפחות פיקסל אחד."
  },
  "resized = img.resize((resized_w, resized_h), Image.BILINEAR)": {
    en: "Resizes the image to the calculated dimensions with bilinear interpolation, which blends neighboring pixels for a smoother result.",
    ru: "Масштабирует изображение до вычисленных размеров билинейной интерполяцией: новый пиксель получается смешиванием соседних пикселей.",
    he: "משנה את גודל התמונה למידות המחושבות באמצעות אינטרפולציה ביליניארית: כל פיקסל חדש מחושב משילוב של פיקסלים שכנים."
  },
  "canvas = Image.new(\"RGB\", (target_w, target_h), (0, 0, 0))": {
    en: "Creates a black RGB canvas exactly 47 x 55 pixels. It is the fixed frame that receives the resized image.",
    ru: "Создаёт чёрный RGB-кадр ровно 47 x 55 пикселей. Это фиксированная рамка, в которую будет помещено масштабированное изображение.",
    he: "יוצרת קנבס RGB שחור בגודל מדויק של 47 x 55 פיקסלים. זו המסגרת הקבועה שאליה מוכנסת התמונה ששונתה בגודלה."
  },
  "pad_x = (target_w - resized_w) // 2": {
    en: "Finds the left horizontal padding in pixels. Integer division centers the resized image inside the 47-pixel-wide canvas.",
    ru: "Находит левое горизонтальное поле в пикселях. Целочисленное деление центрирует масштабированное изображение внутри кадра шириной 47 пикселей.",
    he: "מחשבת את השוליים השמאליים בפיקסלים. חלוקה שלמה ממקמת את התמונה ששונתה בגודלה במרכז הקנבס שרוחבו 47 פיקסלים."
  },
  "pad_y = (target_h - resized_h) // 2": {
    en: "Finds the top vertical padding in pixels so the resized image is centered inside the 55-pixel-high canvas.",
    ru: "Находит верхнее вертикальное поле в пикселях, чтобы масштабированное изображение было по центру кадра высотой 55 пикселей.",
    he: "מחשבת את השוליים העליונים בפיקסלים כדי שהתמונה ששונתה בגודלה תמורכז בתוך קנבס בגובה 55 פיקסלים."
  },
  "canvas.paste(resized, (pad_x, pad_y))": {
    en: "Places the resized image onto the black canvas at the calculated left and top offsets. Any remaining area stays black padding.",
    ru: "Помещает масштабированное изображение на чёрный кадр по вычисленным смещениям слева и сверху. Оставшаяся область остаётся чёрным полем.",
    he: "מדביקה את התמונה ששונתה בגודלה על הקנבס השחור לפי ההיסטים המחושבים משמאל ומלמעלה. השטח הנותר נשאר שוליים שחורים."
  },
  "arr = np.asarray(canvas, dtype=np.float32) / 255.0": {
    en: "Converts the 47 x 55 RGB canvas into a float32 array with shape [55, 47, 3] and changes pixel values from 0..255 to 0.0..1.0.",
    ru: "Преобразует RGB-кадр 47 x 55 в массив `float32` размерности `[55, 47, 3]` и переводит значения пикселей из диапазона 0..255 в 0.0..1.0.",
    he: "ממירה את קנבס ה-RGB בגודל 47 x 55 למערך `float32` בגודל `[55, 47, 3]` ומעבירה את ערכי הפיקסלים מהטווח 0..255 לטווח 0.0..1.0."
  },
  "arr = arr[..., ::-1].copy()": {
    en: "Reverses the last axis of the array, changing channel order from RGB to BGR. copy() makes the reversed data contiguous for PyTorch.",
    ru: "Разворачивает последнюю ось массива, меняя порядок каналов с RGB на BGR. `copy()` создаёт непрерывный участок памяти, удобный для PyTorch.",
    he: "הופכת את הציר האחרון של המערך ומשנה את סדר הערוצים מ-RGB ל-BGR. ‏`copy()` יוצרת אזור זיכרון רציף שמתאים ל-PyTorch."
  },
  "arr = np.transpose(arr, (2, 0, 1))": {
    en: "Reorders the array axes from [height, width, channels] = [55, 47, 3] to PyTorch channel-first [channels, height, width] = [3, 55, 47].",
    ru: "Переставляет оси из `[высота, ширина, каналы] = [55, 47, 3]` в порядок PyTorch `[каналы, высота, ширина] = [3, 55, 47]`.",
    he: "מסדרת מחדש את צירי המערך מ-`[גובה, רוחב, ערוצים] = [55, 47, 3]` לסדר של PyTorch: `[ערוצים, גובה, רוחב] = [3, 55, 47]`."
  },
  "return torch.from_numpy(arr).to(device, non_blocking=True)": {
    en: "Wraps the NumPy array as a PyTorch tensor and moves it to the selected CPU or CUDA device. non_blocking=True allows an asynchronous copy when the memory setup permits it.",
    ru: "Оборачивает массив NumPy в тензор PyTorch и переносит его на выбранный CPU или CUDA-устройство. `non_blocking=True` разрешает асинхронное копирование, когда это допускает конфигурация памяти.",
    he: "עוטפת את מערך NumPy כטנזור PyTorch ומעבירה אותו ל-CPU או להתקן CUDA שנבחר. ‏`non_blocking=True` מאפשר העתקה אסינכרונית כאשר תצורת הזיכרון תומכת בכך."
  },
  "def _variants(self, path: str | Path) -> list[tuple[str, Image.Image]]": {
    en: "Defines a helper that creates several image variants from one file. Each variant gets a name and a Pillow image for a separate recognition attempt.",
    ru: "Объявляет вспомогательную функцию, создающую несколько вариантов из одного файла. Каждый вариант получает имя и изображение Pillow для отдельной попытки распознавания.",
    he: "מגדירה פונקציית עזר שיוצרת כמה גרסאות מתמונה אחת. כל גרסה מקבלת שם ותמונת Pillow לניסיון זיהוי נפרד."
  },
  "img = Image.open(path).convert(\"RGB\")": {
    en: "Opens the file from path and immediately converts it to three RGB channels, just as the main preprocessing function does.",
    ru: "Открывает файл по `path` и сразу приводит его к трём каналам RGB, как и основная функция предварительной обработки.",
    he: "פותחת את הקובץ לפי `path` ומיד ממירה אותו לשלושה ערוצי RGB, כמו פונקציית העיבוד המקדים הראשית."
  },
  "variants = [(\"full\", img)]": {
    en: "Starts the variant list with the complete original image, labeled full.",
    ru: "Начинает список вариантов с полного исходного изображения, помеченного как `full`.",
    he: "מתחילה את רשימת הגרסאות עם התמונה המקורית המלאה, המסומנת `full`."
  },
  "w, h = img.size": {
    en: "Reads the width w and height h of the complete image so later crop coordinates can be calculated.",
    ru: "Считывает ширину `w` и высоту `h` полного изображения, чтобы затем вычислить координаты обрезки.",
    he: "קוראת את הרוחב `w` ואת הגובה `h` של התמונה המלאה כדי לחשב בהמשך את קואורדינטות החיתוך."
  },
  "for ratio in (0.86, 0.74, 0.62, 0.50, 0.40)": {
    en: "Repeats the crop operation for five center-crop scales: 86%, 74%, 62%, 50%, and 40% of the shorter image side.",
    ru: "Повторяет обрезку для пяти масштабов центрального квадрата: 86%, 74%, 62%, 50% и 40% от меньшей стороны изображения.",
    he: "חוזרת על החיתוך עבור חמישה גדלים של חיתוך מרכזי: 86%, 74%, 62%, 50% ו-40% מהצלע הקצרה של התמונה."
  },
  "side = int(min(w, h) * ratio)": {
    en: "Calculates the side length of the square center crop from the shorter original side and the current ratio.",
    ru: "Вычисляет длину стороны квадратной центральной обрезки из меньшей исходной стороны и текущего коэффициента.",
    he: "מחשבת את אורך הצלע של החיתוך הריבועי המרכזי לפי הצלע המקורית הקצרה והיחס הנוכחי."
  },
  "if side < 60": {
    en: "Rejects a crop that would be smaller than 60 x 60 pixels, because such a small crop has too little facial detail.",
    ru: "Отбрасывает обрезку меньше 60 x 60 пикселей, потому что в таком маленьком фрагменте слишком мало деталей лица.",
    he: "דוחה חיתוך שקטן מ-60 x 60 פיקסלים, כי בחיתוך קטן כזה יש מעט מדי פרטי פנים."
  },
  "continue": {
    en: "Skips the current crop size and continues with the next ratio when the crop is too small.",
    ru: "Пропускает текущий размер обрезки и переходит к следующему коэффициенту, если фрагмент слишком мал.",
    he: "מדלגת על גודל החיתוך הנוכחי וממשיכה ליחס הבא כאשר החיתוך קטן מדי."
  },
  "left = (w - side) // 2": {
    en: "Calculates the x-coordinate of the crop's left edge so the square is centered horizontally.",
    ru: "Вычисляет x-координату левого края обрезки, чтобы квадрат был выровнен по центру горизонтально.",
    he: "מחשבת את קואורדינטת x של הקצה השמאלי של החיתוך כדי שהריבוע יהיה ממורכז אופקית."
  },
  "top = (h - side) // 2": {
    en: "Calculates the y-coordinate of the crop's top edge so the square is centered vertically.",
    ru: "Вычисляет y-координату верхнего края обрезки, чтобы квадрат был выровнен по центру вертикально.",
    he: "מחשבת את קואורדינטת y של הקצה העליון של החיתוך כדי שהריבוע יהיה ממורכז אנכית."
  },
  "variants.append((f\"center_{int(ratio * 100)}\", img.crop((left, top, left + side, top + side))))": {
    en: "Cuts the centered square, labels it with its percentage such as center_86, and adds it to the recognition attempts.",
    ru: "Вырезает центральный квадрат, даёт ему метку с процентом, например `center_86`, и добавляет его к попыткам распознавания.",
    he: "חותכת את הריבוע המרכזי, נותנת לו תווית עם האחוז, למשל `center_86`, ומוסיפה אותו לניסיונות הזיהוי."
  },
  "return variants": {
    en: "Returns the complete list: the full image plus every valid centered crop.",
    ru: "Возвращает полный список: исходное изображение и все допустимые центральные обрезки.",
    he: "מחזירה את הרשימה המלאה: התמונה המקורית וכל החיתוכים המרכזיים התקינים."
  }
};

const codeLineAnnotations = {
  "01": {
    "// CUDA commands used in this stage": {
      en: "Introduces the CUDA memory commands used to prepare the image tensor for this first stage.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ CUDA-РєРѕРјР°РЅРґС‹ РїР°РјСЏС‚Рё, РєРѕС‚РѕСЂС‹Рµ РїРѕРґРіРѕС‚Р°РІР»РёРІР°СЋС‚ С‚РµРЅР·РѕСЂ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ РЅР° РїРµСЂРІРѕРј СЌС‚Р°РїРµ.",
      he: "ЧћЧ¦Ч™Ч™Чџ ЧђЧЄ Ч¤Ч§Ч•Ч“Ч•ЧЄ Ч”Ч–Ч™Ч›ЧЁЧ•Чџ Ч©Чњ CUDA Ч©ЧћЧ›Ч™Ч Ч•ЧЄ ЧђЧЄ ЧЧ Ч–Ч•ЧЁ Ч”ЧЄЧћЧ•Ч Ч” Ч‘Ч©ЧњЧ‘ Ч”ЧЁЧђЧ©Ч•Чџ."
    },
    "float input[55 * 47 * 3];": {
      en: "Creates the host-side float tensor for one normalized face: 55 by 47 pixels and 3 RGB channels.",
      ru: "РЎРѕР·РґР°РµС‚ С‚РµРЅР·РѕСЂ float РЅР° СЃС‚РѕСЂРѕРЅРµ host РґР»СЏ РѕРґРЅРѕРіРѕ РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅРѕРіРѕ Р»РёС†Р°: 55 РЅР° 47 РїРёРєСЃРµР»РµР№ Рё 3 RGB-РєР°РЅР°Р»Р°.",
      he: "Ч™Ч•Ч¦ЧЁ ЧЧ Ч–Ч•ЧЁ float Ч‘Ч¦Ч“ Ч”-host ЧўЧ‘Ч•ЧЁ Ч¤Ч Ч™Чќ ЧћЧ Ч•ЧЁЧћЧњЧ•ЧЄ ЧђЧ—ЧЄ: 55 ЧўЧњ 47 Ч¤Ч™Ч§ЧЎЧњЧ™Чќ Ч•-3 ЧўЧЁЧ•Ч¦Ч™ RGB."
    },
    "cudaMalloc(&d_input, 55 * 47 * 3 * sizeof(float));": {
      en: "Allocates GPU memory for exactly the same input tensor before the neural forward pass starts.",
      ru: "Р’С‹РґРµР»СЏРµС‚ РїР°РјСЏС‚СЊ GPU РїРѕРґ С‚Р°РєРѕР№ Р¶Рµ РІС…РѕРґРЅРѕР№ С‚РµРЅР·РѕСЂ РїРµСЂРµРґ РЅР°С‡Р°Р»РѕРј РїСЂСЏРјРѕРіРѕ РїСЂРѕС…РѕРґР° РЅРµР№СЂРѕСЃРµС‚Рё.",
      he: "ЧћЧ§Ч¦Ч” Ч–Ч™Ч›ЧЁЧ•Чџ GPU ЧњЧђЧ•ЧЄЧ• ЧЧ Ч–Ч•ЧЁ Ч§ЧњЧ ЧњЧ¤Ч Ч™ ЧЄЧ—Ч™ЧњЧЄ Ч”ЧћЧўЧ‘ЧЁ Ч”Ч§Ч“ЧћЧ™ Ч©Чњ Ч”ЧЁЧ©ЧЄ."
    },
    "cudaMemcpy(d_input, input, bytes, cudaMemcpyHostToDevice);": {
      en: "Copies the prepared face tensor from CPU/host memory into the CUDA device buffer.",
      ru: "РљРѕРїРёСЂСѓРµС‚ РїРѕРґРіРѕС‚РѕРІР»РµРЅРЅС‹Р№ С‚РµРЅР·РѕСЂ Р»РёС†Р° РёР· РїР°РјСЏС‚Рё CPU/host РІ Р±СѓС„РµСЂ CUDA-СѓСЃС‚СЂРѕР№СЃС‚РІР°.",
      he: "ЧћЧўЧЄЧ™Ч§ ЧђЧЄ ЧЧ Ч–Ч•ЧЁ Ч”Ч¤Ч Ч™Чќ Ч”ЧћЧ•Ч›Чџ ЧћЧ–Ч™Ч›ЧЁЧ•Чџ CPU/host ЧђЧњ Ч‘ЧђЧ¤ЧЁ Ч”ЧЄЧ§Чџ CUDA."
    },
    "// Project meaning:": {
      en: "Starts a short project-specific note, not an executable CUDA command.",
      ru: "РќР°С‡РёРЅР°РµС‚ РєРѕСЂРѕС‚РєРѕРµ РїРѕСЏСЃРЅРµРЅРёРµ РїРѕ РїСЂРѕРµРєС‚Сѓ; СЌС‚Рѕ РЅРµ РёСЃРїРѕР»РЅСЏРµРјР°СЏ CUDA-РєРѕРјР°РЅРґР°.",
      he: "Ч¤Ч•ЧЄЧ— Ч”ЧўЧЁЧ” Ч§Ч¦ЧЁЧ” ЧўЧњ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч; Ч–Ч• ЧђЧ™Ч Ч” Ч¤Ч§Ч•Ч“ЧЄ CUDA Ч©ЧћЧ•ЧЁЧ¦ЧЄ."
    },
    "// the image is only prepared here; the neural kernels start after this buffer exists.": {
      en: "Explains that this stage only prepares input; convolution and dense kernels run after the buffer is ready.",
      ru: "РћР±СЉСЏСЃРЅСЏРµС‚, С‡С‚Рѕ СЌС‚РѕС‚ СЌС‚Р°Рї С‚РѕР»СЊРєРѕ РіРѕС‚РѕРІРёС‚ РІС…РѕРґ; convolution Рё dense kernels Р·Р°РїСѓСЃРєР°СЋС‚СЃСЏ РїРѕСЃР»Рµ РіРѕС‚РѕРІРЅРѕСЃС‚Рё Р±СѓС„РµСЂР°.",
      he: "ЧћЧЎЧ‘Ч™ЧЁ Ч©Ч”Ч©ЧњЧ‘ ЧЁЧ§ ЧћЧ›Ч™Чџ Ч§ЧњЧ; Ч§ЧЁЧ ЧњЧ™ convolution Ч•-dense ЧЁЧ¦Ч™Чќ ЧњЧђЧ—ЧЁ Ч©Ч”Ч‘ЧђЧ¤ЧЁ ЧћЧ•Ч›Чџ."
    }
  },
  "02": {
    "// CUDA commands used in this stage": {
      en: "Introduces the CUDA-side commands related to crop, resize and normalization.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ CUDA-РєРѕРјР°РЅРґС‹, СЃРІСЏР·Р°РЅРЅС‹Рµ СЃ РѕР±СЂРµР·РєРѕР№, resize Рё РЅРѕСЂРјР°Р»РёР·Р°С†РёРµР№.",
      he: "ЧћЧ¦Ч™Ч™Чџ ЧђЧЄ Ч¤Ч§Ч•Ч“Ч•ЧЄ CUDA Ч”Ч§Ч©Ч•ЧЁЧ•ЧЄ ЧњЧ—Ч™ЧЄЧ•Чљ, Ч©Ч™Ч Ч•Ч™ Ч’Ч•Ч“Чњ Ч•Ч ЧЁЧћЧ•Чњ."
    },
    "normalize_rgb(face_crop, input_55x47x3);  // host preprocessing": {
      en: "Normalizes the cropped face on the host so all pixels enter the network in the expected numeric range.",
      ru: "РќРѕСЂРјР°Р»РёР·СѓРµС‚ РІС‹СЂРµР·Р°РЅРЅРѕРµ Р»РёС†Рѕ РЅР° host, С‡С‚РѕР±С‹ РїРёРєСЃРµР»Рё РїРѕРїР°Р»Рё РІ СЃРµС‚СЊ РІ РѕР¶РёРґР°РµРјРѕРј С‡РёСЃР»РѕРІРѕРј РґРёР°РїР°Р·РѕРЅРµ.",
      he: "ЧћЧ ЧЁЧћЧњ ЧђЧЄ Ч—Ч™ЧЄЧ•Чљ Ч”Ч¤Ч Ч™Чќ Ч‘Ч¦Ч“ host Ч›Чљ Ч©Ч›Чњ Ч”Ч¤Ч™Ч§ЧЎЧњЧ™Чќ Ч™Ч™Ч›Ч ЧЎЧ• ЧњЧЁЧ©ЧЄ Ч‘ЧЧ•Ч•Ч— Ч”ЧћЧЎЧ¤ЧЁЧ™ Ч”Ч¦Ч¤Ч•Ч™."
    },
    "cudaMemcpy(d_input, input_55x47x3, bytes, cudaMemcpyHostToDevice);": {
      en: "Uploads the final 55x47x3 tensor to GPU memory after crop, resize and normalization.",
      ru: "Р—Р°РіСЂСѓР¶Р°РµС‚ РёС‚РѕРіРѕРІС‹Р№ С‚РµРЅР·РѕСЂ 55x47x3 РІ РїР°РјСЏС‚СЊ GPU РїРѕСЃР»Рµ РѕР±СЂРµР·РєРё, resize Рё РЅРѕСЂРјР°Р»РёР·Р°С†РёРё.",
      he: "ЧћЧўЧњЧ” ЧђЧЄ Ч”ЧЧ Ч–Ч•ЧЁ Ч”ЧЎЧ•Ч¤Ч™ 55x47x3 ЧњЧ–Ч™Ч›ЧЁЧ•Чџ GPU ЧђЧ—ЧЁЧ™ Ч—Ч™ЧЄЧ•Чљ, Ч©Ч™Ч Ч•Ч™ Ч’Ч•Ч“Чњ Ч•Ч ЧЁЧћЧ•Чњ."
    },
    "// Optional CUDA form for this same step:": {
      en: "Shows how the same preprocessing could be moved from host code into a CUDA kernel.",
      ru: "РџРѕРєР°Р·С‹РІР°РµС‚, РєР°Рє С‚РѕС‚ Р¶Рµ preprocessing РјРѕР¶РЅРѕ РїРµСЂРµРЅРµСЃС‚Рё РёР· host-РєРѕРґР° РІ CUDA kernel.",
      he: "ЧћЧ¦Ч™Ч’ ЧђЧ™Чљ ЧђЧ¤Ч©ЧЁ ЧњЧ”ЧўЧ‘Ч™ЧЁ ЧђЧ•ЧЄЧ• ЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ ЧћЧ§Ч•Ч“ host ЧђЧњ Ч§ЧЁЧ Чњ CUDA."
    },
    "normalize_resize_kernel<<<grid2d, block2d>>>(d_raw, d_input);": {
      en: "Runs one CUDA preprocessing kernel over the image grid to resize and normalize pixels in parallel.",
      ru: "Р—Р°РїСѓСЃРєР°РµС‚ CUDA-kernel preprocessing РїРѕ СЃРµС‚РєРµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ, С‡С‚РѕР±С‹ РїР°СЂР°Р»Р»РµР»СЊРЅРѕ resize Рё РЅРѕСЂРјР°Р»РёР·РѕРІР°С‚СЊ РїРёРєСЃРµР»Рё.",
      he: "ЧћЧЁЧ™ЧҐ Ч§ЧЁЧ Чњ CUDA ЧњЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ ЧўЧњ Ч’ЧЁЧ™Ч“ Ч”ЧЄЧћЧ•Ч Ч” Ч›Ч“Ч™ ЧњЧ©Ч Ч•ЧЄ Ч’Ч•Ч“Чњ Ч•ЧњЧ ЧЁЧћЧњ Ч¤Ч™Ч§ЧЎЧњЧ™Чќ Ч‘ЧћЧ§Ч‘Ч™Чњ."
    },
    "cudaDeviceSynchronize();": {
      en: "Waits until all GPU work in this stage is complete before the next detector stage reads the buffer.",
      ru: "Р–РґРµС‚ Р·Р°РІРµСЂС€РµРЅРёСЏ РІСЃРµР№ GPU-СЂР°Р±РѕС‚С‹ СЌС‚РѕРіРѕ СЌС‚Р°РїР° РїРµСЂРµРґ С‚РµРј, РєР°Рє СЃР»РµРґСѓСЋС‰РёР№ СЌС‚Р°Рї РґРµС‚РµРєС‚РѕСЂР° С‡РёС‚Р°РµС‚ Р±СѓС„РµСЂ.",
      he: "ЧћЧћЧЄЧ™Чџ ЧўЧ“ Ч©Ч›Чњ ЧўЧ‘Ч•Ч“ЧЄ Ч”-GPU Ч‘Ч©ЧњЧ‘ Ч”Ч–Ч” Ч”ЧЎЧЄЧ™Ч™ЧћЧ” ЧњЧ¤Ч Ч™ Ч©Ч”Ч©ЧњЧ‘ Ч”Ч‘Чђ Ч§Ч•ЧЁЧђ ЧђЧЄ Ч”Ч‘ЧђЧ¤ЧЁ."
    }
  },
  "03": {
    "// CUDA kernels used in the DeepID forward stage": {
      en: "Introduces the CUDA kernel sequence that performs the DeepID neural forward pass.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕСЃС‚СЊ CUDA kernels РґР»СЏ РїСЂСЏРјРѕРіРѕ РїСЂРѕС…РѕРґР° РЅРµР№СЂРѕСЃРµС‚Рё DeepID.",
      he: "ЧћЧ¦Ч™Ч™Чџ ЧђЧЄ ЧЁЧ¦ЧЈ Ч§ЧЁЧ ЧњЧ™ CUDA Ч©ЧћЧ‘Ч¦Чў ЧђЧЄ Ч”ЧћЧўЧ‘ЧЁ Ч”Ч§Ч“ЧћЧ™ Ч©Чњ ЧЁЧ©ЧЄ DeepID."
    },
    "conv_relu<<<gridConv1, block>>>(d_input, d_w1, d_b1, d_conv1);": {
      en: "Launches the first convolution plus ReLU kernel: threads scan the input face and produce Conv1 feature maps.",
      ru: "Р—Р°РїСѓСЃРєР°РµС‚ РїРµСЂРІС‹Р№ convolution + ReLU kernel: РїРѕС‚РѕРєРё СЃРєР°РЅРёСЂСѓСЋС‚ РІС…РѕРґ Р»РёС†Р° Рё СЃРѕР·РґР°СЋС‚ РєР°СЂС‚С‹ РїСЂРёР·РЅР°РєРѕРІ Conv1.",
      he: "ЧћЧЁЧ™ЧҐ ЧђЧЄ Ч§ЧЁЧ Чњ convolution+ReLU Ч”ЧЁЧђЧ©Ч•Чџ: ЧЄЧ”ЧњЧ™Ч›Ч•Ч Ч™Чќ ЧЎЧ•ЧЁЧ§Ч™Чќ ЧђЧЄ Ч§ЧњЧ Ч”Ч¤Ч Ч™Чќ Ч•ЧћЧ¤Ч™Ч§Ч™Чќ ЧћЧ¤Ч•ЧЄ Conv1."
    },
    "max_pool_2x2<<<gridPool1, block>>>(d_conv1, d_pool1);": {
      en: "Downsamples Conv1 features with 2x2 max pooling so the next layer works on a smaller tensor.",
      ru: "РЈРјРµРЅСЊС€Р°РµС‚ РєР°СЂС‚С‹ Conv1 С‡РµСЂРµР· 2x2 max pooling, С‡С‚РѕР±С‹ СЃР»РµРґСѓСЋС‰РёР№ СЃР»РѕР№ СЂР°Р±РѕС‚Р°Р» СЃ РјРµРЅСЊС€РёРј С‚РµРЅР·РѕСЂРѕРј.",
      he: "ЧћЧ§ЧЧ™Чџ ЧђЧЄ ЧЄЧ›Ч•Ч Ч•ЧЄ Conv1 Ч‘ЧўЧ–ЧЁЧЄ 2x2 max pooling Ч›Ч“Ч™ Ч©Ч”Ч©Ч›Ч‘Ч” Ч”Ч‘ЧђЧ” ЧЄЧўЧ‘Ч•Ч“ ЧўЧњ ЧЧ Ч–Ч•ЧЁ Ч§ЧЧџ Ч™Ч•ЧЄЧЁ."
    },
    "conv_relu<<<gridConv2, block>>>(d_pool1, d_w2, d_b2, d_conv2);": {
      en: "Runs the second convolution/ReLU layer over pooled Conv1 features to build stronger face patterns.",
      ru: "Р’С‹РїРѕР»РЅСЏРµС‚ РІС‚РѕСЂРѕР№ convolution/ReLU СЃР»РѕР№ РїРѕ pooled Conv1, С‡С‚РѕР±С‹ СЃРѕР±СЂР°С‚СЊ Р±РѕР»РµРµ СЃРёР»СЊРЅС‹Рµ РїСЂРёР·РЅР°РєРё Р»РёС†Р°.",
      he: "ЧћЧЁЧ™ЧҐ Ч©Ч›Ч‘ЧЄ convolution/ReLU Ч©Ч Ч™Ч™Ч” ЧћЧўЧњ Conv1 ЧђЧ—ЧЁЧ™ pooling Ч›Ч“Ч™ ЧњЧ‘Ч Ч•ЧЄ Ч“Ч¤Ч•ЧЎЧ™ Ч¤Ч Ч™Чќ Ч—Ч–Ч§Ч™Чќ Ч™Ч•ЧЄЧЁ."
    },
    "max_pool_2x2<<<gridPool2, block>>>(d_conv2, d_pool2);": {
      en: "Compresses Conv2 feature maps while keeping the strongest local activations.",
      ru: "РЎР¶РёРјР°РµС‚ РєР°СЂС‚С‹ РїСЂРёР·РЅР°РєРѕРІ Conv2, СЃРѕС…СЂР°РЅСЏСЏ СЃР°РјС‹Рµ СЃРёР»СЊРЅС‹Рµ Р»РѕРєР°Р»СЊРЅС‹Рµ Р°РєС‚РёРІР°С†РёРё.",
      he: "Ч“Ч•Ч—ЧЎ ЧђЧЄ ЧћЧ¤Ч•ЧЄ Conv2 ЧЄЧ•Чљ Ч©ЧћЧ™ЧЁЧ” ЧўЧњ Ч”ЧђЧ§ЧЧ™Ч‘Ч¦Ч™Ч•ЧЄ Ч”ЧћЧ§Ч•ЧћЧ™Ч•ЧЄ Ч”Ч—Ч–Ч§Ч•ЧЄ Ч‘Ч™Ч•ЧЄЧЁ."
    },
    "conv_relu<<<gridConv3, block>>>(d_pool2, d_w3, d_b3, d_conv3);": {
      en: "Runs the third convolution/ReLU layer, producing higher-level facial features.",
      ru: "Р—Р°РїСѓСЃРєР°РµС‚ С‚СЂРµС‚РёР№ convolution/ReLU СЃР»РѕР№, РєРѕС‚РѕСЂС‹Р№ С„РѕСЂРјРёСЂСѓРµС‚ РїСЂРёР·РЅР°РєРё Р»РёС†Р° Р±РѕР»РµРµ РІС‹СЃРѕРєРѕРіРѕ СѓСЂРѕРІРЅСЏ.",
      he: "ЧћЧЁЧ™ЧҐ Ч©Ч›Ч‘ЧЄ convolution/ReLU Ч©ЧњЧ™Ч©Ч™ЧЄ Ч©ЧћЧ¤Ч™Ч§Ч” ЧћЧђЧ¤Ч™Ч™Ч Ч™ Ч¤Ч Ч™Чќ Ч‘ЧЁЧћЧ” Ч’Ч‘Ч•Ч”Ч” Ч™Ч•ЧЄЧЁ."
    },
    "max_pool_2x2<<<gridPool3, block>>>(d_conv3, d_pool3);": {
      en: "Reduces Conv3 spatial size before dense layers, lowering the number of following operations.",
      ru: "РЈРјРµРЅСЊС€Р°РµС‚ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРµРЅРЅС‹Р№ СЂР°Р·РјРµСЂ Conv3 РїРµСЂРµРґ dense layers, СЃРЅРёР¶Р°СЏ С‡РёСЃР»Рѕ СЃР»РµРґСѓСЋС‰РёС… РѕРїРµСЂР°С†РёР№.",
      he: "ЧћЧ§ЧЧ™Чџ ЧђЧЄ Ч”Ч’Ч•Ч“Чњ Ч”ЧћЧЁЧ—Ч‘Ч™ Ч©Чњ Conv3 ЧњЧ¤Ч Ч™ Ч©Ч›Ч‘Ч•ЧЄ dense Ч•ЧћЧ¤Ч—Ч™ЧЄ ЧђЧЄ Ч›ЧћЧ•ЧЄ Ч”Ч¤ЧўЧ•ЧњЧ•ЧЄ Ч”Ч‘ЧђЧ•ЧЄ."
    },
    "dense<<<gridDense, block>>>(d_pool3, d_fc11_w, d_fc11_b, d_fc11);": {
      en: "Computes the FC11 dense projection from pooled features; each output neuron can be parallelized.",
      ru: "РЎС‡РёС‚Р°РµС‚ dense-РїСЂРѕРµРєС†РёСЋ FC11 РёР· pooled-РїСЂРёР·РЅР°РєРѕРІ; РєР°Р¶РґС‹Р№ РІС‹С…РѕРґРЅРѕР№ РЅРµР№СЂРѕРЅ РјРѕР¶РЅРѕ РїР°СЂР°Р»Р»РµР»РёС‚СЊ.",
      he: "ЧћЧ—Ч©Ч‘ ЧђЧЄ Ч”Ч”ЧЧњЧ” Ч”Ч¦Ч¤Ч•Ч¤Ч” FC11 ЧћЧ”ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ ЧђЧ—ЧЁЧ™ pooling; Ч›Чњ Ч Ч•Ч™ЧЁЧ•Чџ Ч¤ЧњЧ Ч Ч™ЧЄЧџ ЧњЧћЧ§Ч‘Ч•Чњ."
    },
    "conv_relu<<<gridConv4, block>>>(d_conv3, d_w4, d_b4, d_conv4);": {
      en: "Runs the side Conv4 branch from Conv3, matching the DeepID-style two-branch feature path.",
      ru: "Р—Р°РїСѓСЃРєР°РµС‚ Р±РѕРєРѕРІСѓСЋ РІРµС‚РєСѓ Conv4 РѕС‚ Conv3, РєР°Рє РІ DeepID-РїРѕРґРѕР±РЅРѕРј РґРІСѓС…РІРµС‚РѕС‡РЅРѕРј РїСѓС‚Рё РїСЂРёР·РЅР°РєРѕРІ.",
      he: "ЧћЧЁЧ™ЧҐ ЧўЧ ЧЈ Ч¦Ч“Ч“Ч™ Conv4 ЧћЧЄЧ•Чљ Conv3, Ч‘Ч”ЧЄЧђЧќ ЧњЧћЧЎЧњЧ•Чњ ЧћЧђЧ¤Ч™Ч™Ч Ч™Чќ Ч“Ч•-ЧўЧ Ч¤Ч™ Ч‘ЧЎЧ’Ч Ч•Чџ DeepID."
    },
    "dense<<<gridDense, block>>>(d_conv4, d_fc12_w, d_fc12_b, d_fc12);": {
      en: "Projects the Conv4 branch through FC12 so it can be combined with FC11.",
      ru: "РџСЂРѕРµС†РёСЂСѓРµС‚ РІРµС‚РєСѓ Conv4 С‡РµСЂРµР· FC12, С‡С‚РѕР±С‹ Р·Р°С‚РµРј РѕР±СЉРµРґРёРЅРёС‚СЊ РµРµ СЃ FC11.",
      he: "ЧћЧ§ЧЁЧ™Чџ ЧђЧЄ ЧўЧ ЧЈ Conv4 Ч“ЧЁЧљ FC12 Ч›Ч“Ч™ Ч©ЧђЧ¤Ч©ЧЁ Ч™Ч”Ч™Ч” ЧњЧ©ЧњЧ‘ ЧђЧ•ЧЄЧ• ЧўЧќ FC11."
    },
    "add_relu_l2<<<1, 256>>>(d_fc11, d_fc12, d_embedding160);": {
      en: "Adds FC11 and FC12, applies ReLU, then L2-normalizes the final 160D face embedding.",
      ru: "РЎРєР»Р°РґС‹РІР°РµС‚ FC11 Рё FC12, РїСЂРёРјРµРЅСЏРµС‚ ReLU Рё L2-РЅРѕСЂРјР°Р»РёР·СѓРµС‚ С„РёРЅР°Р»СЊРЅС‹Р№ 160D embedding Р»РёС†Р°.",
      he: "ЧћЧ—Ч‘ЧЁ FC11 Ч•-FC12, ЧћЧ¤ЧўЧ™Чњ ReLU Ч•ЧђЧ– ЧћЧ ЧЁЧћЧњ L2 ЧђЧЄ embedding Ч”Ч¤Ч Ч™Чќ Ч”ЧЎЧ•Ч¤Ч™ Ч‘Ч’Ч•Ч“Чњ 160D."
    },
    "cudaDeviceSynchronize();": {
      en: "Stops the host from reading the embedding until all neural CUDA kernels finish.",
      ru: "РќРµ РґР°РµС‚ host С‡РёС‚Р°С‚СЊ embedding, РїРѕРєР° РІСЃРµ РЅРµР№СЂРѕСЃРµС‚РµРІС‹Рµ CUDA kernels РЅРµ Р·Р°РІРµСЂС€РёР»РёСЃСЊ.",
      he: "ЧћЧ•Ч Чў ЧћЧ”-host ЧњЧ§ЧЁЧ•Чђ ЧђЧЄ Ч”-embedding ЧўЧ“ Ч©Ч›Чњ Ч§ЧЁЧ ЧњЧ™ CUDA Ч©Чњ Ч”ЧЁЧ©ЧЄ Ч”ЧЎЧЄЧ™Ч™ЧћЧ•."
    },
    "__global__ void conv_relu(...) {": {
      en: "Sketches the CUDA kernel body used for convolution plus activation.",
      ru: "РџРѕРєР°Р·С‹РІР°РµС‚ РЅР°Р±СЂРѕСЃРѕРє С‚РµР»Р° CUDA-kernel РґР»СЏ convolution РїР»СЋСЃ activation.",
      he: "ЧћЧ¦Ч™Ч’ Ч©ЧњЧ“ Ч©Чњ Ч’Ч•ЧЈ Ч§ЧЁЧ Чњ CUDA ЧўЧ‘Ч•ЧЁ convolution Ч•ЧђЧ§ЧЧ™Ч‘Ч¦Ч™Ч”."
    },
    "int out = blockIdx.x * blockDim.x + threadIdx.x;": {
      en: "Computes the global output index handled by the current CUDA thread.",
      ru: "Р’С‹С‡РёСЃР»СЏРµС‚ РіР»РѕР±Р°Р»СЊРЅС‹Р№ РёРЅРґРµРєСЃ РІС‹С…РѕРґР°, РєРѕС‚РѕСЂС‹Р№ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚ С‚РµРєСѓС‰РёР№ CUDA-РїРѕС‚РѕРє.",
      he: "ЧћЧ—Ч©Ч‘ ЧђЧЄ ЧђЧ™Ч Ч“Ч§ЧЎ Ч”Ч¤ЧњЧ Ч”Ч’ЧњЧ•Ч‘ЧњЧ™ Ч©Ч‘Ч• ЧћЧЧ¤Чњ ЧЄЧ”ЧњЧ™Ч›Ч•Чџ CUDA Ч”Ч Ч•Ч›Ч—Ч™."
    },
    "// one thread accumulates one output pixel/channel": {
      en: "Explains the parallel mapping: one thread accumulates one output activation for a pixel/channel.",
      ru: "РћР±СЉСЏСЃРЅСЏРµС‚ РїР°СЂР°Р»Р»РµР»СЊРЅСѓСЋ СЂР°СЃРєР»Р°РґРєСѓ: РѕРґРёРЅ РїРѕС‚РѕРє РЅР°РєР°РїР»РёРІР°РµС‚ РѕРґРЅСѓ РІС‹С…РѕРґРЅСѓСЋ Р°РєС‚РёРІР°С†РёСЋ РїРёРєСЃРµР»СЏ/РєР°РЅР°Р»Р°.",
      he: "ЧћЧЎЧ‘Ч™ЧЁ ЧђЧЄ Ч”ЧћЧ™Ч¤Ч•Ч™ Ч”ЧћЧ§Ч‘Ч™ЧњЧ™: ЧЄЧ”ЧњЧ™Ч›Ч•Чџ ЧђЧ—Ч“ Ч¦Ч•Ч‘ЧЁ ЧђЧ§ЧЧ™Ч‘Ч¦Ч™Ч™ЧЄ Ч¤ЧњЧ ЧђЧ—ЧЄ ЧњЧ¤Ч™Ч§ЧЎЧњ/ЧўЧЁЧ•ЧҐ."
    },
    "}": {
      en: "Closes the CUDA kernel sketch.",
      ru: "Р—Р°РєСЂС‹РІР°РµС‚ РЅР°Р±СЂРѕСЃРѕРє CUDA-kernel.",
      he: "ЧЎЧ•Ч’ЧЁ ЧђЧЄ Ч©ЧњЧ“ Ч§ЧЁЧ Чњ CUDA."
    },
    "__global__ void dense(...) { /* one thread per output neuron */ }": {
      en: "Sketches the dense-layer kernel where each CUDA thread computes one output neuron.",
      ru: "РџРѕРєР°Р·С‹РІР°РµС‚ dense-layer kernel, РіРґРµ РєР°Р¶РґС‹Р№ CUDA-РїРѕС‚РѕРє СЃС‡РёС‚Р°РµС‚ РѕРґРёРЅ РІС‹С…РѕРґРЅРѕР№ РЅРµР№СЂРѕРЅ.",
      he: "ЧћЧ¦Ч™Ч’ Ч§ЧЁЧ Чњ Ч©Ч›Ч‘Ч” Ч¦Ч¤Ч•Ч¤Ч” Ч©Ч‘Ч• Ч›Чњ ЧЄЧ”ЧњЧ™Ч›Ч•Чџ CUDA ЧћЧ—Ч©Ч‘ Ч Ч•Ч™ЧЁЧ•Чџ Ч¤ЧњЧ ЧђЧ—Ч“."
    }
  },
  "04": {
    "// CUDA commands used in the reference comparison stage": {
      en: "Introduces the CUDA commands that compare the new embedding against the reference bank.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ CUDA-РєРѕРјР°РЅРґС‹, РєРѕС‚РѕСЂС‹Рµ СЃСЂР°РІРЅРёРІР°СЋС‚ РЅРѕРІС‹Р№ embedding СЃ Р±Р°РЅРєРѕРј СЌС‚Р°Р»РѕРЅРѕРІ.",
      he: "ЧћЧ¦Ч™Ч™Чџ ЧђЧЄ Ч¤Ч§Ч•Ч“Ч•ЧЄ CUDA Ч©ЧћЧ©Ч•Ч•ЧЄ ЧђЧЄ Ч”-embedding Ч”Ч—Ч“Ч© ЧћЧ•Чњ ЧћЧђЧ’ЧЁ Ч”Ч™Ч™Ч—Ч•ЧЎ."
    },
    "cosine_scores<<<referenceCount, 256>>>(d_embedding160, d_refs, d_scores);": {
      en: "Launches one block per saved reference identity to compute cosine similarity against the new embedding.",
      ru: "Р—Р°РїСѓСЃРєР°РµС‚ РѕРґРёРЅ block РЅР° РєР°Р¶РґС‹Р№ СЃРѕС…СЂР°РЅРµРЅРЅС‹Р№ СЌС‚Р°Р»РѕРЅ, С‡С‚РѕР±С‹ РїРѕСЃС‡РёС‚Р°С‚СЊ cosine similarity СЃ РЅРѕРІС‹Рј embedding.",
      he: "ЧћЧЁЧ™ЧҐ Ч‘ЧњЧ•Ч§ ЧђЧ—Ч“ ЧњЧ›Чњ Ч–Ч”Ч•ЧЄ Ч™Ч™Ч—Ч•ЧЎ Ч©ЧћЧ•ЧЁЧ” Ч›Ч“Ч™ ЧњЧ—Ч©Ч‘ cosine similarity ЧћЧ•Чњ Ч”-embedding Ч”Ч—Ч“Ч©."
    },
    "top2_reduce<<<1, 256>>>(d_scores, d_best, d_runner_up);": {
      en: "Reduces all similarity scores to the best match and the runner-up match for margin checking.",
      ru: "РЎРІРѕСЂР°С‡РёРІР°РµС‚ РІСЃРµ similarity scores РІ Р»СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚ Рё РІС‚РѕСЂРѕР№ СЂРµР·СѓР»СЊС‚Р°С‚ РґР»СЏ РїСЂРѕРІРµСЂРєРё margin.",
      he: "ЧћЧ¦ЧћЧ¦Чќ ЧђЧЄ Ч›Чњ Ч¦Ч™Ч•Ч Ч™ similarity ЧњЧЄЧ•Ч¦ЧђЧ” Ч”ЧЧ•Ч‘Ч” Ч‘Ч™Ч•ЧЄЧЁ Ч•ЧњЧћЧ§Ч•Чќ Ч”Ч©Ч Ч™ ЧњЧ¦Ч•ЧЁЧљ Ч‘Ч“Ч™Ч§ЧЄ margin."
    },
    "cudaMemcpy(&best, d_best, sizeof(Result), cudaMemcpyDeviceToHost);": {
      en: "Copies the best identity result from GPU memory back to host code.",
      ru: "РљРѕРїРёСЂСѓРµС‚ Р»СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚ РёРґРµРЅС‚РёС‡РЅРѕСЃС‚Рё РёР· РїР°РјСЏС‚Рё GPU РѕР±СЂР°С‚РЅРѕ РІ host-РєРѕРґ.",
      he: "ЧћЧўЧЄЧ™Ч§ ЧђЧЄ ЧЄЧ•Ч¦ЧђЧЄ Ч”Ч–Ч”Ч•ЧЄ Ч”ЧЧ•Ч‘Ч” Ч‘Ч™Ч•ЧЄЧЁ ЧћЧ–Ч™Ч›ЧЁЧ•Чџ GPU Ч—Ч–ЧЁЧ” ЧњЧ§Ч•Ч“ host."
    },
    "__global__ void cosine_scores(...) {": {
      en: "Begins the CUDA kernel that scores one reference vector per block.",
      ru: "РќР°С‡РёРЅР°РµС‚ CUDA-kernel, РєРѕС‚РѕСЂС‹Р№ СЃС‡РёС‚Р°РµС‚ РѕС†РµРЅРєСѓ РѕРґРЅРѕРіРѕ СЌС‚Р°Р»РѕРЅРЅРѕРіРѕ РІРµРєС‚РѕСЂР° РЅР° block.",
      he: "Ч¤Ч•ЧЄЧ— Ч§ЧЁЧ Чњ CUDA Ч©ЧћЧ—Ч©Ч‘ Ч¦Ч™Ч•Чџ Ч©Чњ Ч•Ч§ЧЧ•ЧЁ Ч™Ч™Ч—Ч•ЧЎ ЧђЧ—Ч“ ЧњЧ›Чњ Ч‘ЧњЧ•Ч§."
    },
    "int ref = blockIdx.x;": {
      en: "Maps the current CUDA block to one reference identity in the reference bank.",
      ru: "РЎРІСЏР·С‹РІР°РµС‚ С‚РµРєСѓС‰РёР№ CUDA-block СЃ РѕРґРЅРёРј СЌС‚Р°Р»РѕРЅРѕРј РёР· Р±Р°РЅРєР° reference.",
      he: "ЧћЧћЧ¤Ч” ЧђЧЄ Ч‘ЧњЧ•Ч§ CUDA Ч”Ч Ч•Ч›Ч—Ч™ ЧњЧ–Ч”Ч•ЧЄ Ч™Ч™Ч—Ч•ЧЎ ЧђЧ—ЧЄ Ч‘ЧћЧђЧ’ЧЁ."
    },
    "float partial = query[threadIdx.x] * refs[ref][threadIdx.x];": {
      en: "Each thread multiplies one embedding component by the matching component of the selected reference.",
      ru: "РљР°Р¶РґС‹Р№ РїРѕС‚РѕРє СѓРјРЅРѕР¶Р°РµС‚ РѕРґРЅСѓ РєРѕРјРїРѕРЅРµРЅС‚Сѓ embedding РЅР° СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰СѓСЋ РєРѕРјРїРѕРЅРµРЅС‚Сѓ РІС‹Р±СЂР°РЅРЅРѕРіРѕ СЌС‚Р°Р»РѕРЅР°.",
      he: "Ч›Чњ ЧЄЧ”ЧњЧ™Ч›Ч•Чџ ЧћЧ›Ч¤Ч™Чњ ЧЁЧ›Ч™Ч‘ embedding ЧђЧ—Ч“ Ч‘ЧЁЧ›Ч™Ч‘ Ч”ЧћЧЄЧђЧ™Чќ Ч©Чњ Ч”Ч™Ч™Ч—Ч•ЧЎ Ч©Ч Ч‘Ч—ЧЁ."
    },
    "// reduce 160 products to one score": {
      en: "The block reduction sums 160 partial products into one cosine similarity score.",
      ru: "Block reduction СЃСѓРјРјРёСЂСѓРµС‚ 160 С‡Р°СЃС‚РёС‡РЅС‹С… РїСЂРѕРёР·РІРµРґРµРЅРёР№ РІ РѕРґРёРЅ cosine similarity score.",
      he: "Ч¦ЧћЧ¦Ч•Чќ Ч”Ч‘ЧњЧ•Ч§ ЧћЧЎЧ›Чќ 160 ЧћЧ›Ч¤ЧњЧ•ЧЄ Ч—ЧњЧ§Ч™Ч•ЧЄ ЧњЧ¦Ч™Ч•Чџ cosine similarity ЧђЧ—Ч“."
    },
    "}": {
      en: "Closes the reference-comparison CUDA kernel sketch.",
      ru: "Р—Р°РєСЂС‹РІР°РµС‚ РЅР°Р±СЂРѕСЃРѕРє CUDA-kernel СЃСЂР°РІРЅРµРЅРёСЏ СЃ СЌС‚Р°Р»РѕРЅР°РјРё.",
      he: "ЧЎЧ•Ч’ЧЁ ЧђЧЄ Ч©ЧњЧ“ Ч§ЧЁЧ Чњ CUDA ЧњЧ”Ч©Ч•Ч•ЧђЧ” ЧћЧ•Чњ Ч™Ч™Ч—Ч•ЧЎЧ™Чќ."
    }
  },
  "05": {
    "// CUDA command if the decision is kept on GPU": {
      en: "Introduces the optional CUDA version of the final threshold decision.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ РѕРїС†РёРѕРЅР°Р»СЊРЅСѓСЋ CUDA-РІРµСЂСЃРёСЋ С„РёРЅР°Р»СЊРЅРѕРіРѕ СЂРµС€РµРЅРёСЏ РїРѕ РїРѕСЂРѕРіР°Рј.",
      he: "ЧћЧ¦Ч™Ч™Чџ ЧђЧЄ Ч’ЧЁЧЎЧЄ CUDA Ч”ЧђЧ•Ч¤Ч¦Ч™Ч•Ч ЧњЧ™ЧЄ Ч©Чњ Ч”Ч—ЧњЧЧЄ Ч”ЧЎЧ¤Ч™Чќ Ч”ЧЎЧ•Ч¤Ч™ЧЄ."
    },
    "decision_kernel<<<1, 1>>>(d_best, min_score, min_margin, d_accepted);": {
      en: "Optionally runs the final accept/reject rule on GPU using the best score and margin thresholds.",
      ru: "РћРїС†РёРѕРЅР°Р»СЊРЅРѕ Р·Р°РїСѓСЃРєР°РµС‚ С„РёРЅР°Р»СЊРЅРѕРµ РїСЂР°РІРёР»Рѕ accept/reject РЅР° GPU РїРѕ best score Рё margin thresholds.",
      he: "ЧђЧ•Ч¤Ч¦Ч™Ч•Ч ЧњЧ™ЧЄ ЧћЧЁЧ™ЧҐ ЧђЧЄ Ч›ЧњЧњ Ч”Ч§Ч‘ЧњЧ”/Ч“Ч—Ч™Ч™Ч” Ч”ЧЎЧ•Ч¤Ч™ ЧўЧњ GPU ЧњЧ¤Ч™ best score Ч•ЧЎЧ¤Ч™ margin."
    },
    "cudaMemcpy(&accepted, d_accepted, sizeof(bool), cudaMemcpyDeviceToHost);": {
      en: "Copies the boolean decision flag from GPU memory back to the host response builder.",
      ru: "РљРѕРїРёСЂСѓРµС‚ Р±СѓР»РµРІС‹Р№ С„Р»Р°Рі СЂРµС€РµРЅРёСЏ РёР· РїР°РјСЏС‚Рё GPU РѕР±СЂР°С‚РЅРѕ РІ СЃР±РѕСЂС‰РёРє РѕС‚РІРµС‚Р° РЅР° host.",
      he: "ЧћЧўЧЄЧ™Ч§ ЧђЧЄ Ч“Ч’Чњ Ч”Ч”Ч—ЧњЧЧ” Ч”Ч‘Ч•ЧњЧ™ЧђЧ Ч™ ЧћЧ–Ч™Ч›ЧЁЧ•Чџ GPU ЧђЧњ Ч‘Ч Ч™Ч™ЧЄ Ч”ЧЄЧ©Ч•Ч‘Ч” Ч‘-host."
    },
    "// Same project rule when executed on host:": {
      en: "Shows the exact same project rule when the threshold decision is performed on CPU/host.",
      ru: "РџРѕРєР°Р·С‹РІР°РµС‚ С‚Рѕ Р¶Рµ СЃР°РјРѕРµ РїСЂР°РІРёР»Рѕ РїСЂРѕРµРєС‚Р°, РєРѕРіРґР° СЂРµС€РµРЅРёРµ РїРѕ РїРѕСЂРѕРіР°Рј РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ РЅР° CPU/host.",
      he: "ЧћЧ¦Ч™Ч’ ЧђЧЄ ЧђЧ•ЧЄЧ• Ч›ЧњЧњ Ч¤ЧЁЧ•Ч™Ч§Ч Ч›ЧђЧ©ЧЁ Ч”Ч—ЧњЧЧЄ Ч”ЧЎЧ¤Ч™Чќ ЧћЧЄЧ‘Ч¦ЧўЧЄ ЧўЧњ CPU/host."
    },
    "accepted = best_score >= min_score &&": {
      en: "The identity is accepted only if the best similarity score reaches the configured minimum.",
      ru: "РРјСЏ РїСЂРёРЅРёРјР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РµСЃР»Рё Р»СѓС‡С€РёР№ similarity score РґРѕСЃС‚РёРіР°РµС‚ РЅР°СЃС‚СЂРѕРµРЅРЅРѕРіРѕ РјРёРЅРёРјСѓРјР°.",
      he: "Ч”Ч–Ч”Ч•ЧЄ ЧћЧЄЧ§Ч‘ЧњЧЄ ЧЁЧ§ ЧђЧќ Ч¦Ч™Ч•Чџ similarity Ч”ЧЧ•Ч‘ Ч‘Ч™Ч•ЧЄЧЁ ЧћЧ’Ч™Чў ЧњЧћЧ™Ч Ч™ЧћЧ•Чќ Ч©Ч”Ч•Ч’Ч“ЧЁ."
    },
    "(best_score - runner_up_score) >= min_margin;": {
      en: "The best match must also be separated from the second match by the required margin.",
      ru: "Р›СѓС‡С€РµРµ СЃРѕРІРїР°РґРµРЅРёРµ С‚Р°РєР¶Рµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚РґРµР»РµРЅРѕ РѕС‚ РІС‚РѕСЂРѕРіРѕ СЂРµР·СѓР»СЊС‚Р°С‚Р° РЅСѓР¶РЅС‹Рј margin.",
      he: "Ч”Ч”ЧЄЧђЧћЧ” Ч”ЧЧ•Ч‘Ч” Ч‘Ч™Ч•ЧЄЧЁ Ч—Ч™Ч™Ч‘ЧЄ ЧњЧ”Ч™Ч•ЧЄ ЧћЧ•Ч¤ЧЁЧ“ЧЄ ЧћЧ”ЧћЧ§Ч•Чќ Ч”Ч©Ч Ч™ ЧњЧ¤Ч™ Ч”-margin Ч”Ч Ч“ЧЁЧ©."
    }
  },
  "06": {
    "// CUDA/OpenCL numeric result is already back on host here": {
      en: "Marks the point where GPU numeric work is finished and the host can package the result.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ РјРѕРјРµРЅС‚, РіРґРµ С‡РёСЃР»РѕРІР°СЏ СЂР°Р±РѕС‚Р° GPU Р·Р°РІРµСЂС€РµРЅР° Рё host РјРѕР¶РµС‚ СѓРїР°РєРѕРІР°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚.",
      he: "ЧћЧЎЧћЧџ ЧђЧЄ Ч”Ч Ч§Ч•Ч“Ч” Ч©Ч‘Ч” Ч”ЧўЧ‘Ч•Ч“Ч” Ч”ЧћЧЎЧ¤ЧЁЧ™ЧЄ Ч©Чњ GPU Ч”ЧЎЧЄЧ™Ч™ЧћЧ” Ч•Ч”-host Ч™Ч›Ч•Чњ ЧњЧђЧЁЧ•Ч– ЧђЧЄ Ч”ЧЄЧ•Ч¦ЧђЧ”."
    },
    "cudaMemcpy(&host_result, d_result, sizeof(Result), cudaMemcpyDeviceToHost);": {
      en: "Copies the final numeric detector result from GPU memory to host memory.",
      ru: "РљРѕРїРёСЂСѓРµС‚ С„РёРЅР°Р»СЊРЅС‹Р№ С‡РёСЃР»РѕРІРѕР№ СЂРµР·СѓР»СЊС‚Р°С‚ РґРµС‚РµРєС‚РѕСЂР° РёР· РїР°РјСЏС‚Рё GPU РІ РїР°РјСЏС‚СЊ host.",
      he: "ЧћЧўЧЄЧ™Ч§ ЧђЧЄ Ч”ЧЄЧ•Ч¦ЧђЧ” Ч”ЧћЧЎЧ¤ЧЁЧ™ЧЄ Ч”ЧЎЧ•Ч¤Ч™ЧЄ Ч©Чњ Ч”Ч’ЧњЧђЧ™ ЧћЧ–Ч™Ч›ЧЁЧ•Чџ GPU ЧњЧ–Ч™Ч›ЧЁЧ•Чџ host."
    },
    "// Web/Colab response object used by the site": {
      en: "Marks the object that the Colab service or local bridge returns to the web interface.",
      ru: "РћР±РѕР·РЅР°С‡Р°РµС‚ РѕР±СЉРµРєС‚, РєРѕС‚РѕСЂС‹Р№ Colab-СЃРµСЂРІРёСЃ РёР»Рё Р»РѕРєР°Р»СЊРЅС‹Р№ bridge РІРѕР·РІСЂР°С‰Р°РµС‚ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃСѓ.",
      he: "ЧћЧЎЧћЧџ ЧђЧЄ Ч”ЧђЧ•Ч‘Ч™Ч™Ч§Ч Ч©Ч©Ч™ЧЁЧ•ЧЄ Colab ЧђЧ• Ч”Ч’Ч©ЧЁ Ч”ЧћЧ§Ч•ЧћЧ™ ЧћЧ—Ч–Ч™ЧЁ ЧњЧћЧћЧ©Ч§ web."
    },
    "return {": {
      en: "Starts the structured JSON-style response used by the simple demo and Hive interface.",
      ru: "РќР°С‡РёРЅР°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Р№ JSON-РїРѕРґРѕР±РЅС‹Р№ РѕС‚РІРµС‚ РґР»СЏ РїСЂРѕСЃС‚РѕР№ РґРµРјРѕРЅСЃС‚СЂР°С†РёРё Рё Hive-РёРЅС‚РµСЂС„РµР№СЃР°.",
      he: "Ч¤Ч•ЧЄЧ— ЧЄЧ©Ч•Ч‘Ч” ЧћЧ•Ч‘Ч Ч™ЧЄ Ч‘ЧЎЧ’Ч Ч•Чџ JSON ЧўЧ‘Ч•ЧЁ Ч”Ч”Ч“Ч’ЧћЧ” Ч”Ч¤Ч©Ч•ЧЧ” Ч•ЧћЧћЧ©Ч§ Hive."
    },
    "identity, best_score, runner_up, margin,": {
      en: "Returns the recognized name and the scores needed to explain why it was accepted or rejected.",
      ru: "Р’РѕР·РІСЂР°С‰Р°РµС‚ СЂР°СЃРїРѕР·РЅР°РЅРЅРѕРµ РёРјСЏ Рё scores, РЅСѓР¶РЅС‹Рµ РґР»СЏ РѕР±СЉСЏСЃРЅРµРЅРёСЏ РїСЂРёРЅСЏС‚РёСЏ РёР»Рё РѕС‚РєР»РѕРЅРµРЅРёСЏ.",
      he: "ЧћЧ—Ч–Ч™ЧЁ ЧђЧЄ Ч”Ч©Чќ Ч©Ч–Ч•Ч”Ч” Ч•ЧђЧЄ Ч”Ч¦Ч™Ч•Ч Ч™Чќ Ч”Ч“ЧЁЧ•Ч©Ч™Чќ Ч›Ч“Ч™ ЧњЧ”ЧЎЧ‘Ч™ЧЁ Ч§Ч‘ЧњЧ” ЧђЧ• Ч“Ч—Ч™Ч™Ч”."
    },
    "backend: mode, elapsed_ms, accepted": {
      en: "Returns which backend ran, how long it took, and whether the result passed thresholds.",
      ru: "Р’РѕР·РІСЂР°С‰Р°РµС‚ backend, РІСЂРµРјСЏ РІС‹РїРѕР»РЅРµРЅРёСЏ Рё С„Р»Р°Рі РїСЂРѕС…РѕР¶РґРµРЅРёСЏ РїРѕСЂРѕРіРѕРІ.",
      he: "ЧћЧ—Ч–Ч™ЧЁ ЧђЧ™Ч–Ч” backend ЧЁЧҐ, Ч›ЧћЧ” Ч–ЧћЧџ Ч–Ч” ЧњЧ§Ч— Ч•Ч”ЧђЧќ Ч”ЧЄЧ•Ч¦ЧђЧ” ЧўЧ‘ЧЁЧ” ЧђЧЄ Ч”ЧЎЧ¤Ч™Чќ."
    },
    "};": {
      en: "Closes the response object that the browser displays as detector JSON.",
      ru: "Р—Р°РєСЂС‹РІР°РµС‚ РѕР±СЉРµРєС‚ РѕС‚РІРµС‚Р°, РєРѕС‚РѕСЂС‹Р№ Р±СЂР°СѓР·РµСЂ РїРѕРєР°Р·С‹РІР°РµС‚ РєР°Рє Detector JSON.",
      he: "ЧЎЧ•Ч’ЧЁ ЧђЧЄ ЧђЧ•Ч‘Ч™Ч™Ч§Ч Ч”ЧЄЧ©Ч•Ч‘Ч” Ч©Ч”Ч“Ч¤Ч“Ч¤Чџ ЧћЧ¦Ч™Ч’ Ч›-Detector JSON."
    }
  }
};

const colabCodePatternAnnotations = [
  [/^# /, {
    en: "Comment from the real Colab detector code block: it names the stage or source file.",
    ru: "РљРѕРјРјРµРЅС‚Р°СЂРёР№ РёР· СЂРµР°Р»СЊРЅРѕРіРѕ Р±Р»РѕРєР° Colab-РґРµС‚РµРєС‚РѕСЂР°: РѕРЅ РЅР°Р·С‹РІР°РµС‚ СЌС‚Р°Рї РёР»Рё РёСЃС…РѕРґРЅС‹Р№ С„Р°Р№Р».",
    he: "Ч”ЧўЧЁЧ” ЧћЧЄЧ•Чљ Ч§Ч•Ч“ Ч’ЧњЧђЧ™ Colab Ч”ЧђЧћЧ™ЧЄЧ™: Ч”Ч™Чђ ЧћЧ¦Ч™Ч™Ч ЧЄ ЧђЧЄ Ч”Ч©ЧњЧ‘ ЧђЧ• Ч§Ч•Ч‘ЧҐ Ч”ЧћЧ§Ч•ЧЁ."
  }],
  [/^from pathlib import Path/, {
    en: "Imports Path so Colab can build reliable file paths for the detector payload.",
    ru: "РџРѕРґРєР»СЋС‡Р°РµС‚ Path, С‡С‚РѕР±С‹ Colab РЅР°РґС‘Р¶РЅРѕ СЃРѕР±РёСЂР°Р» РїСѓС‚Рё Рє С„Р°Р№Р»Р°Рј РґРµС‚РµРєС‚РѕСЂР°.",
    he: "ЧћЧ™Ч™Ч‘Чђ Path Ч›Ч“Ч™ Ч©-Colab Ч™Ч‘Ч Ч” Ч ЧЄЧ™Ч‘Ч™ Ч§Ч‘Ч¦Ч™Чќ ЧђЧћЧ™Ч Ч™Чќ ЧўЧ‘Ч•ЧЁ Ч—Ч‘Ч™ЧњЧЄ Ч”Ч’ЧњЧђЧ™."
  }],
  [/^import sys, zipfile|^import torch|^from google\.colab import files/, {
    en: "Imports the library used on this line: Python system tools, ZIP extraction, CUDA tensor runtime, or Colab upload.",
    ru: "РџРѕРґРєР»СЋС‡Р°РµС‚ Р±РёР±Р»РёРѕС‚РµРєСѓ СЌС‚РѕР№ СЃС‚СЂРѕРєРё: СЃРёСЃС‚РµРјРЅС‹Рµ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹ Python, СЂР°СЃРїР°РєРѕРІРєСѓ ZIP, CUDA-С‚РµРЅР·РѕСЂС‹ РёР»Рё Р·Р°РіСЂСѓР·РєСѓ Colab.",
    he: "ЧћЧ™Ч™Ч‘Чђ ЧђЧЄ Ч”ЧЎЧ¤ЧЁЧ™Ч™Ч” Ч©Чњ Ч”Ч©Ч•ЧЁЧ”: Ч›ЧњЧ™ ЧћЧўЧЁЧ›ЧЄ Ч©Чњ Python, Ч—Ч™ЧњЧ•ЧҐ ZIP, Ч–ЧћЧџ ЧЁЧ™Ч¦Ч” Ч©Чњ CUDA tensors ЧђЧ• Ч”ЧўЧњЧђЧ” Ч‘-Colab."
  }],
  [/^WORK = |^WORK\.mkdir|^payload_name|^payload_path|^sys\.path\.insert/, {
    en: "Sets the working folder or Python import path used by the Colab detector.",
    ru: "Р—Р°РґР°С‘С‚ СЂР°Р±РѕС‡СѓСЋ РїР°РїРєСѓ РёР»Рё РїСѓС‚СЊ РёРјРїРѕСЂС‚Р° Python, РєРѕС‚РѕСЂС‹Р№ РёСЃРїРѕР»СЊР·СѓРµС‚ Colab-РґРµС‚РµРєС‚РѕСЂ.",
    he: "Ч§Ч•Ч‘Чў ЧђЧЄ ЧЄЧ™Ч§Ч™Ч™ЧЄ Ч”ЧўЧ‘Ч•Ч“Ч” ЧђЧ• Ч ЧЄЧ™Ч‘ Ч”Ч™Ч™Ч‘Ч•Чђ Ч©Чњ Python Ч©Ч‘Ч• ЧћЧ©ЧЄЧћЧ© Ч’ЧњЧђЧ™ Colab."
  }],
  [/torch\.cuda\.is_available|torch\.cuda\.get_device_name|return "cuda"|device == "cuda"|torch\.cuda\.synchronize/, {
    en: "This is the CUDA control point: it checks, selects, or synchronizes GPU execution.",
    ru: "Р­С‚Рѕ С‚РѕС‡РєР° СѓРїСЂР°РІР»РµРЅРёСЏ CUDA: РїСЂРѕРІРµСЂРєР°, РІС‹Р±РѕСЂ РёР»Рё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РІС‹РїРѕР»РЅРµРЅРёСЏ РЅР° GPU.",
    he: "Ч–Ч• Ч Ч§Ч•Ч“ЧЄ Ч”Ч‘Ч§ЧЁЧ” Ч©Чњ CUDA: Ч‘Ч“Ч™Ч§Ч”, Ч‘Ч—Ч™ЧЁЧ” ЧђЧ• ЧЎЧ Ч›ЧЁЧ•Чџ Ч©Чњ Ч”ЧЁЧ¦Ч” ЧўЧњ GPU."
  }],
  [/files\.upload|zipfile\.ZipFile|extractall|write_bytes/, {
    en: "Loads or extracts the project payload that contains the same detector code and reference data.",
    ru: "Р—Р°РіСЂСѓР¶Р°РµС‚ РёР»Рё СЂР°СЃРїР°РєРѕРІС‹РІР°РµС‚ payload РїСЂРѕРµРєС‚Р° СЃ С‚РµРј Р¶Рµ РєРѕРґРѕРј РґРµС‚РµРєС‚РѕСЂР° Рё СЌС‚Р°Р»РѕРЅРЅС‹РјРё РґР°РЅРЅС‹РјРё.",
    he: "ЧЧ•ЧўЧџ ЧђЧ• ЧћЧ—ЧњЧҐ ЧђЧЄ Ч—Ч‘Ч™ЧњЧЄ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч Ч©ЧћЧ›Ч™ЧњЧ” ЧђЧЄ ЧђЧ•ЧЄЧ• Ч§Ч•Ч“ Ч’ЧњЧђЧ™ Ч•Ч ЧЄЧ•Ч Ч™ Ч™Ч™Ч—Ч•ЧЎ."
  }],
  [/def _preprocess_pil|img\.convert|img\.resize|Image\.new|canvas\.paste|np\.asarray|np\.transpose|torch\.from_numpy/, {
    en: "Preprocessing line: it converts the image into the fixed tensor format passed to CUDA/PyTorch.",
    ru: "РЎС‚СЂРѕРєР° preprocessing: РїСЂРµРІСЂР°С‰Р°РµС‚ РєР°СЂС‚РёРЅРєСѓ РІ С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹Р№ С‚РµРЅР·РѕСЂ, РєРѕС‚РѕСЂС‹Р№ РїРµСЂРµРґР°С‘С‚СЃСЏ РІ CUDA/PyTorch.",
    he: "Ч©Ч•ЧЁЧЄ ЧўЧ™Ч‘Ч•Ч“ ЧћЧ§Ч“Ч™Чќ: ЧћЧћЧ™ЧЁЧ” ЧђЧЄ Ч”ЧЄЧћЧ•Ч Ч” ЧњЧЧ Ч–Ч•ЧЁ Ч§Ч‘Ч•Чў Ч©Ч Ч©ЧњЧ— ЧђЧњ CUDA/PyTorch."
  }],
  [/def _variants|Image\.open|variants =|for ratio|img\.crop|variants\.append/, {
    en: "Creates recognition variants so the detector can try the full image and several center crops.",
    ru: "РЎРѕР·РґР°С‘С‚ РІР°СЂРёР°РЅС‚С‹ СЂР°СЃРїРѕР·РЅР°РІР°РЅРёСЏ: РїРѕР»РЅСѓСЋ РєР°СЂС‚РёРЅРєСѓ Рё РЅРµСЃРєРѕР»СЊРєРѕ С†РµРЅС‚СЂР°Р»СЊРЅС‹С… РѕР±СЂРµР·РѕРє.",
    he: "Ч™Ч•Ч¦ЧЁ Ч•ЧЁЧ™ЧђЧ¦Ч™Ч•ЧЄ Ч–Ч™Ч”Ч•Ч™: ЧЄЧћЧ•Ч Ч” ЧћЧњЧђЧ” Ч•Ч›ЧћЧ” Ч—Ч™ЧЄЧ•Ч›Ч™Чќ ЧћЧЁЧ›Ч–Ч™Ч™Чќ."
  }],
  [/class DeepIDTorch|def forward|F\.conv2d|F\.max_pool2d|flatten\(1\) @|F\.normalize|F\.relu/, {
    en: "Neural-network forward line: PyTorch dispatches this operation to CUDA when tensors are on the GPU.",
    ru: "РЎС‚СЂРѕРєР° РїСЂСЏРјРѕРіРѕ РїСЂРѕС…РѕРґР° РЅРµР№СЂРѕСЃРµС‚Рё: PyTorch РѕС‚РїСЂР°РІР»СЏРµС‚ СЌС‚Сѓ РѕРїРµСЂР°С†РёСЋ РІ CUDA, РµСЃР»Рё С‚РµРЅР·РѕСЂС‹ РЅР° GPU.",
    he: "Ч©Ч•ЧЁЧЄ ЧћЧўЧ‘ЧЁ Ч§Ч“ЧћЧ™ Ч©Чњ Ч”ЧЁЧ©ЧЄ: PyTorch Ч©Ч•ЧњЧ— ЧђЧЄ Ч”Ч¤ЧўЧ•ЧњЧ” Чњ-CUDA Ч›ЧђЧ©ЧЁ Ч”ЧЧ Ч–Ч•ЧЁЧ™Чќ ЧўЧњ Ч”-GPU."
  }],
  [/def _embed_variants|torch\.stack|with torch\.inference_mode|model\(x\)\.detach/, {
    en: "Builds a batch tensor and runs inference without training gradients.",
    ru: "РЎРѕР±РёСЂР°РµС‚ batch-С‚РµРЅР·РѕСЂ Рё Р·Р°РїСѓСЃРєР°РµС‚ inference Р±РµР· РѕР±СѓС‡Р°СЋС‰РёС… РіСЂР°РґРёРµРЅС‚РѕРІ.",
    he: "Ч‘Ч•Ч Ч” ЧЧ Ч–Ч•ЧЁ ЧђЧ¦Ч•Ч•Ч” Ч•ЧћЧЁЧ™ЧҐ inference ЧњЧњЧђ Ч’ЧЁЧ“Ч™ЧђЧ ЧЧ™Чќ Ч©Чњ ЧђЧ™ЧћЧ•Чџ."
  }],
  [/def load_references|self\.ref_emb|self\.ref_labels|for label|for path|items\.append|labels\.append/, {
    en: "Reference-bank line: it loads known people and stores their embeddings for comparison.",
    ru: "РЎС‚СЂРѕРєР° Р±Р°РЅРєР° СЌС‚Р°Р»РѕРЅРѕРІ: Р·Р°РіСЂСѓР¶Р°РµС‚ РёР·РІРµСЃС‚РЅС‹С… Р»СЋРґРµР№ Рё С…СЂР°РЅРёС‚ РёС… embeddings РґР»СЏ СЃСЂР°РІРЅРµРЅРёСЏ.",
    he: "Ч©Ч•ЧЁЧЄ ЧћЧђЧ’ЧЁ Ч™Ч™Ч—Ч•ЧЎ: ЧЧ•ЧўЧ ЧЄ ЧђЧ Ч©Ч™Чќ ЧћЧ•Ч›ЧЁЧ™Чќ Ч•Ч©Ч•ЧћЧЁЧЄ embeddings ЧњЧ”Ч©Ч•Ч•ЧђЧ”."
  }],
  [/def detect_image|self\._variants|time\.perf_counter|self\._embed_variants|sims = emb @|self\._decide/, {
    en: "Main detection flow: variants become embeddings, then matrix multiplication produces similarity scores.",
    ru: "РћСЃРЅРѕРІРЅРѕР№ РїРѕС‚РѕРє РґРµС‚РµРєС‚РѕСЂР°: РІР°СЂРёР°РЅС‚С‹ СЃС‚Р°РЅРѕРІСЏС‚СЃСЏ embeddings, Р·Р°С‚РµРј РјР°С‚СЂРёС‡РЅРѕРµ СѓРјРЅРѕР¶РµРЅРёРµ РґР°С‘С‚ similarity scores.",
    he: "Ч–ЧЁЧ™ЧћЧЄ Ч”Ч–Ч™Ч”Ч•Ч™ Ч”ЧЁЧђЧ©Ч™ЧЄ: Ч•ЧЁЧ™ЧђЧ¦Ч™Ч•ЧЄ Ч”Ч•Ч¤Ч›Ч•ЧЄ Чњ-embeddings Ч•ЧђЧ– Ч›Ч¤Чњ ЧћЧЧЁЧ™Ч¦Ч•ЧЄ Ч™Ч•Ч¦ЧЁ Ч¦Ч™Ч•Ч Ч™ Ч“ЧћЧ™Ч•Чџ."
  }],
  [/def _decide|row_np|best_by_label|ranked|runner|margin|accepted|identity =|return \{/, {
    en: "Decision line: it ranks labels, computes margin, and decides whether the identity is accepted.",
    ru: "РЎС‚СЂРѕРєР° СЂРµС€РµРЅРёСЏ: СЂР°РЅР¶РёСЂСѓРµС‚ РёРјРµРЅР°, СЃС‡РёС‚Р°РµС‚ margin Рё СЂРµС€Р°РµС‚, РїСЂРёРЅРёРјР°С‚СЊ Р»Рё identity.",
    he: "Ч©Ч•ЧЁЧЄ Ч”Ч—ЧњЧЧ”: ЧћЧ“ЧЁЧ’ЧЄ Ч©ЧћЧ•ЧЄ, ЧћЧ—Ч©Ч‘ЧЄ margin Ч•ЧћЧ—ЧњЧ™ЧЧ” ЧђЧќ ЧњЧ§Ч‘Чњ ЧђЧЄ Ч”Ч–Ч”Ч•ЧЄ."
  }],
  [/def detect_file_ui|_DETECTOR_UI_LOCK|detector\.min_score|detector\.detect_image|JSONResponse|@app\.post|UploadFile|NamedTemporaryFile|unlink/, {
    en: "Web API line: it receives an uploaded file, runs the detector, and returns JSON to the site.",
    ru: "РЎС‚СЂРѕРєР° Web API: РїСЂРёРЅРёРјР°РµС‚ Р·Р°РіСЂСѓР¶РµРЅРЅС‹Р№ С„Р°Р№Р», Р·Р°РїСѓСЃРєР°РµС‚ РґРµС‚РµРєС‚РѕСЂ Рё РІРѕР·РІСЂР°С‰Р°РµС‚ JSON СЃР°Р№С‚Сѓ.",
    he: "Ч©Ч•ЧЁЧЄ Web API: ЧћЧ§Ч‘ЧњЧЄ Ч§Ч•Ч‘ЧҐ Ч©Ч”Ч•ЧўЧњЧ”, ЧћЧЁЧ™Ч¦Ч” ЧђЧЄ Ч”Ч’ЧњЧђЧ™ Ч•ЧћЧ—Ч–Ч™ЧЁЧ” JSON ЧњЧђЧЄЧЁ."
  }],
  [/^\s*(if|for|with|try|finally|break|continue|return|else|elif)\b/, {
    en: "Python control-flow line that chooses a branch, repeats work, protects cleanup, or returns a value.",
    ru: "РЎС‚СЂРѕРєР° СѓРїСЂР°РІР»РµРЅРёСЏ Python: РІС‹Р±РёСЂР°РµС‚ РІРµС‚РєСѓ, РїРѕРІС‚РѕСЂСЏРµС‚ СЂР°Р±РѕС‚Сѓ, Р·Р°С‰РёС‰Р°РµС‚ РѕС‡РёСЃС‚РєСѓ РёР»Рё РІРѕР·РІСЂР°С‰Р°РµС‚ Р·РЅР°С‡РµРЅРёРµ.",
    he: "Ч©Ч•ЧЁЧЄ Ч‘Ч§ЧЁЧЄ Ч–ЧЁЧ™ЧћЧ” Ч‘-Python: Ч‘Ч•Ч—ЧЁЧЄ ЧўЧ ЧЈ, Ч—Ч•Ч–ЧЁЧЄ ЧўЧњ ЧўЧ‘Ч•Ч“Ч”, ЧћЧ’Ч Ч” ЧўЧњ Ч Ч™Ч§Ч•Ч™ ЧђЧ• ЧћЧ—Ч–Ч™ЧЁЧ” ЧўЧЁЧљ."
  }],
  [/./, {
    en: "Project code line used by the connected Colab detector for this computation stage.",
    ru: "РЎС‚СЂРѕРєР° РєРѕРґР° РїСЂРѕРµРєС‚Р°, РєРѕС‚РѕСЂСѓСЋ РёСЃРїРѕР»СЊР·СѓРµС‚ РїРѕРґРєР»СЋС‡С‘РЅРЅС‹Р№ Colab-РґРµС‚РµРєС‚РѕСЂ РЅР° СЌС‚РѕРј СЌС‚Р°РїРµ РІС‹С‡РёСЃР»РµРЅРёР№.",
    he: "Ч©Ч•ЧЁЧЄ Ч§Ч•Ч“ Ч©Чњ Ч”Ч¤ЧЁЧ•Ч™Ч§Ч Ч©Ч‘Ч” ЧћЧ©ЧЄЧћЧ© Ч’ЧњЧђЧ™ Colab Ч”ЧћЧ—Ч•Ч‘ЧЁ Ч‘Ч©ЧњЧ‘ Ч”Ч—Ч™Ч©Ч•Ч‘ Ч”Ч–Ч”."
  }]
];

const sourceImportMeaning = {
  json: { ru: "для чтения и формирования JSON-ответов", he: "לקריאה וליצירה של תשובות JSON" },
  math: { ru: "для математических вычислений", he: "לחישובים מתמטיים" },
  struct: { ru: "для работы с двоичным представлением данных", he: "לעבודה עם ייצוג בינארי של נתונים" },
  time: { ru: "для измерения времени выполнения", he: "למדידת זמן הביצוע" },
  numpy: { ru: "для операций над числовыми массивами", he: "לפעולות על מערכים מספריים" },
  PIL: { ru: "для загрузки, обработки и рисования изображений", he: "לטעינה, עיבוד וציור של תמונות" },
  dataclasses: { ru: "для описания структурированного состояния объектов", he: "להגדרת מצב מובנה של אובייקטים" },
  datetime: { ru: "для фиксации времени событий", he: "לרישום זמן של אירועים" },
  pathlib: { ru: "для безопасной работы с путями и файлами", he: "לעבודה בטוחה עם נתיבים וקבצים" },
  typing: { ru: "для аннотаций типов Python", he: "להערות טיפוסים של Python" },
  torch: { ru: "для тензорных вычислений и запуска на CUDA", he: "לחישובי טנזורים והרצה ב-CUDA" },
  fastapi: { ru: "для HTTP-API детектора", he: "ל-HTTP API של הגלאי" }
};

const sourceFunctionMeaning = {
  _resample: { ru: "выбирает качественный алгоритм изменения размера изображения", he: "בוחרת אלגוריתם איכותי לשינוי גודל התמונה" },
  _font: { ru: "подбирает шрифт для подписей в интерфейсе", he: "בוחרת גופן לכיתובים בממשק" },
  _text: { ru: "рисует текстовую подпись на изображении", he: "מציירת כיתוב על תמונה" },
  _text_center: { ru: "выравнивает подпись по центру перед рисованием", he: "ממרכזת כיתוב לפני הציור" },
  _hex_points: { ru: "вычисляет вершины шестиугольника", he: "מחשבת את קודקודי המשושה" },
  _draw_hex: { ru: "рисует шестиугольный элемент интерфейса", he: "מציירת רכיב ממשק משושה" },
  _paste_fit: { ru: "масштабирует изображение и размещает его в заданной области", he: "משנה את גודל התמונה וממקמת אותה באזור נתון" },
  _image_paths: { ru: "собирает список файлов изображений из папки", he: "אוספת רשימת קובצי תמונה מתיקייה" },
  _ensure_torch: { ru: "загружает PyTorch и кэширует его модули, чтобы не импортировать их при каждом распознавании", he: "טוענת את PyTorch ושומרת את המודולים שלו במטמון, כדי לא לייבא אותם מחדש בכל זיהוי" },
  _device_name: { ru: "выбирает точное имя вычислительного устройства: CUDA для доступной видеокарты или CPU в остальных случаях", he: "בוחרת את שם התקן החישוב המדויק: CUDA לכרטיס מסך זמין או CPU בכל מקרה אחר" },
  _load_weights: { ru: "загружает обученные веса DeepID и кэширует их, чтобы повторно не читать файлы весов", he: "טוענת את משקלי DeepID המאומנים ושומרת אותם במטמון, כדי לא לקרוא שוב את קובצי המשקלים" },
  _model: { ru: "создаёт или получает модель нейросети DeepID для выбранного устройства вычислений", he: "יוצרת או מחזירה את מודל רשת DeepID עבור התקן החישוב שנבחר" },
  conv_weight: { ru: "преобразует сохранённый массив весов свёртки в порядок измерений, который ожидает PyTorch", he: "ממירה מערך משקלי קונבולוציה שמור לסדר הממדים ש-PyTorch מצפה לו" },
  bias: { ru: "преобразует сохранённый массив смещений слоя в тензор PyTorch", he: "ממירה מערך היסטים שמור של שכבה לטנזור PyTorch" },
  dense_weight: { ru: "преобразует сохранённый массив весов полносвязного слоя в порядок измерений PyTorch", he: "ממירה מערך משקלים שמור של שכבה צפופה לסדר הממדים של PyTorch" },
  forward: { ru: "задаёт прямой проход сети: получает тензор лица и возвращает его вектор признаков", he: "מגדירה את המעבר הישיר ברשת: מקבלת טנזור פנים ומחזירה את וקטור התכונות שלו" },
  _angle_delta: { ru: "вычисляет кратчайшую разницу между углами", he: "מחשבת את ההפרש הקצר ביותר בין זוויות" },
  _now: { ru: "формирует текущее время для журнала", he: "יוצרת את הזמן הנוכחי ליומן" },
  _preprocess_pil: { ru: "приводит изображение к формату входного тензора", he: "ממירה תמונה לפורמט טנזור הקלט" },
  _variants: { ru: "создаёт варианты кадра для более устойчивого распознавания", he: "יוצרת וריאציות של הפריים לזיהוי יציב יותר" },
  _embed_variants: { ru: "собирает пакет вариантов и вычисляет их векторы признаков", he: "בונה אצווה של וריאציות ומחשבת את וקטורי התכונות שלהן" },
  load_references: { ru: "загружает эталонные лица и их векторы", he: "טוענת פנים לדוגמה ואת הווקטורים שלהן" },
  detect_image: { ru: "запускает полный цикл распознавания одного изображения", he: "מריצה את כל מחזור הזיהוי של תמונה אחת" },
  detect_batch: { ru: "распознаёт каждое изображение из переданного пакета и возвращает список результатов", he: "מזהה כל תמונה באצווה שהתקבלה ומחזירה רשימת תוצאות" },
  _decide: { ru: "принимает решение по лучшему совпадению и запасу уверенности", he: "מקבלת החלטה לפי ההתאמה הטובה ביותר ופער הביטחון" },
  short_text: { ru: "формирует короткую понятную строку по результату распознавания", he: "מייצרת שורת טקסט קצרה וברורה מתוצאת הזיהוי" },
  detect_file_ui: { ru: "обрабатывает файл, загруженный из веб-интерфейса", he: "מעבדת קובץ שהועלה מממשק האינטרנט" }
};

const sourceCommentMeaning = {
  "# Exact neural detector source excerpt from source/colab_ai_mips_bee_world.py": {
    ru: "Заголовок панели: ниже показан точный фрагмент исходного кода нейросетевого детектора.",
    he: "כותרת הלוח: בהמשך מוצג קטע מדויק מקוד המקור של הגלאי הנוירוני."
  },
  "# Raw link beside this panel opens the complete Colab module.": {
    ru: "Поясняет, что соседняя ссылка открывает полный исходный модуль Colab без сокращений.",
    he: "מסביר שהקישור שליד הלוח פותח את מודול Colab המלא ללא קיצורים."
  }
};

function operationAnnotation(text, lang) {
  const say = (en, ru, he) => repairLocalizedText(lang === "ru" ? ru : lang === "he" ? he : en);
  const value = text.replace(/^print\(/, "").replace(/\)\s*$/, "");
  if (/^print\(/.test(text)) return say(
    "Prints the value of " + value + " in Colab output. This is a diagnostic display; it does not start face recognition.",
    "Выводит значение " + value + " в результатах Colab. Это диагностический вывод; распознавание лиц он не запускает.",
    "מדפיסה את הערך של " + value + " בפלט Colab. זהו פלט אבחון; הוא אינו מפעיל זיהוי פנים."
  );
  if (/^WORK\s*=\s*Path\(/.test(text)) return say(
    "Creates the Path variable WORK, which points to the project working folder used by later file commands.",
    "Создаёт переменную пути WORK, указывающую на рабочую папку проекта, которую используют последующие файловые команды.",
    "יוצרת את משתנה הנתיב WORK, שמצביע לתיקיית העבודה של הפרויקט שבה משתמשות פקודות הקבצים הבאות."
  );
  if (/^WORK\.mkdir\(/.test(text)) return say(
    "Creates the working folder when it is absent; parents=True creates missing parent folders and exist_ok=True allows an existing folder.",
    "Создаёт рабочую папку, если её нет; parents=True создаёт недостающие родительские папки, а exist_ok=True допускает уже существующую папку.",
    "יוצרת את תיקיית העבודה אם היא חסרה; parents=True יוצר תיקיות־אב חסרות ו-exist_ok=True מאפשר תיקייה שכבר קיימת."
  );
  const registeredBuffer = text.match(/^self\.register_buffer\("([^"]+)",\s*(.+)\)$/);
  if (registeredBuffer) return say(
    `Registers the tensor produced by ${registeredBuffer[2]} as non-trainable model buffer “${registeredBuffer[1]}”. It will move with model.to(device) but will not be optimized.`,
    `Регистрирует тензор, полученный из ${registeredBuffer[2]}, как необучаемый буфер модели «${registeredBuffer[1]}». Он переносится через model.to(device), но не оптимизируется.`,
    `רושמת את הטנזור שמופק על ידי ${registeredBuffer[2]} כמאגר מודל לא-נלמד בשם „${registeredBuffer[1]}”. הוא יעבור עם model.to(device), אך לא יעבור אופטימיזציה.`
  );
  const convolution = text.match(/^([A-Za-z_]\w*)\s*=\s*F\.relu\(F\.conv2d\(([^,]+),\s*self\.([A-Za-z_]\w*),\s*self\.([A-Za-z_]\w*)\)\)$/);
  if (convolution) return say(
    `Convolves ${convolution[2]} with trained weights self.${convolution[3]} and bias self.${convolution[4]}, applies ReLU to remove negative responses, and stores the resulting feature map in ${convolution[1]}.`,
    `Свёртывает ${convolution[2]} обученными весами self.${convolution[3]} и смещением self.${convolution[4]}, применяет ReLU для обнуления отрицательных откликов и сохраняет карту признаков в ${convolution[1]}.`,
    `מבצעת קונבולוציה של ${convolution[2]} עם המשקלים המאומנים self.${convolution[3]} וההטיה self.${convolution[4]}, מפעילה ReLU לאיפוס תגובות שליליות ושומרת את מפת התכונות ב-${convolution[1]}.`
  );
  if (/^start\s*=\s*time\.perf_counter\(\)$/.test(text)) return say(
    "Reads the high-resolution clock immediately before inference and stores that start timestamp for the later elapsed-time calculation.",
    "Считывает высокоточный таймер непосредственно перед инференсом и сохраняет начальную отметку для последующего расчёта длительности.",
    "קוראת את השעון ברזולוציה גבוהה מיד לפני ההסקה ושומרת את חותמת זמן ההתחלה לחישוב משך הזמן בהמשך."
  );
  const elapsedTimer = text.match(/^(elapsed_ms|total_ms)\s*=\s*\(time\.perf_counter\(\)\s*-\s*start\)\s*\*\s*1000\.0$/);
  if (elapsedTimer) return say(
    `Subtracts the saved start timestamp from the current high-resolution time, converts seconds to milliseconds, and stores the measured duration in ${elapsedTimer[1]}.`,
    `Вычитает сохранённую начальную отметку из текущего значения высокоточного таймера, переводит секунды в миллисекунды и сохраняет длительность в ${elapsedTimer[1]}.`,
    `מחסרת את חותמת זמן ההתחלה השמורה מן הזמן הנוכחי ברזולוציה גבוהה, ממירה שניות למילישניות ושומרת את משך הזמן ב-${elapsedTimer[1]}.`
  );
  const actions = [
    [/\.read_bytes\(\)/, "Reads the complete binary weights file into memory as bytes so its header and numeric records can be decoded.", "Читает весь бинарный файл весов в память как байты, чтобы затем разобрать его заголовок и числовые записи.", "קוראת את כל קובץ המשקלים הבינרי לזיכרון כבייטים, כדי לפענח את הכותרת ואת הרשומות המספריות."],
    [/struct\.unpack_from\(/, "Decodes the requested fixed-width integer directly from the binary weights buffer at the current byte offset.", "Декодирует целое число фиксированного размера непосредственно из бинарного буфера весов по текущему смещению.", "מפענחת מספר שלם ברוחב קבוע ישירות ממאגר המשקלים הבינרי בהיסט הבייטים הנוכחי."],
    [/np\.frombuffer\(/, "Views the next weight record as little-endian 32-bit floats, then copies it so the array no longer depends on the original byte buffer.", "Интерпретирует следующую запись весов как little-endian float32 и копирует её, чтобы массив больше не зависел от исходного буфера байтов.", "מפרשת את רשומת המשקלים הבאה כ-float32 בסדר little-endian ומעתיקה אותה, כדי שהמערך לא יהיה תלוי עוד במאגר הבייטים המקורי."],
    [/\.reshape\(shapes\[/, "Reshapes the flat float record to the exact trained tensor shape registered for this layer name.", "Преобразует плоскую запись float в точную форму обученного тензора, указанную для имени этого слоя.", "משנה את צורת רשומת ה-float השטוחה לצורת הטנזור המאומן המדויקת הרשומה עבור שם השכבה."],
    [/torch\.tensor\(/, "Creates a PyTorch tensor from the stored NumPy weights so the values can be registered in the neural model.", "Создаёт тензор PyTorch из сохранённых весов NumPy, чтобы зарегистрировать значения внутри нейросетевой модели.", "יוצרת טנזור PyTorch ממשקלי NumPy השמורים, כדי לרשום את הערכים בתוך המודל העצבי."],
    [/\.permute\(3,\s*2,\s*0,\s*1\)/, "Reorders convolution weights from stored height-width-input-output layout to PyTorch output-input-height-width layout.", "Меняет порядок осей свёрточных весов из сохранённого H-W-In-Out в требуемый PyTorch Out-In-H-W.", "מסדרת מחדש את צירי משקלי הקונבולוציה מ-H-W-In-Out השמור אל Out-In-H-W הנדרש ב-PyTorch."],
    [/self\.register_buffer\(/, "Registers this trained tensor as non-trainable model state, so model.to(device) moves it with the network without treating it as an optimizer parameter.", "Регистрирует обученный тензор как необучаемое состояние модели: model.to(device) перенесёт его вместе с сетью, но оптимизатор не будет считать его параметром.", "רושמת את הטנזור המאומן כמצב לא-נלמד של המודל; model.to(device) יעביר אותו עם הרשת בלי להתייחס אליו כפרמטר לאופטימיזציה."],
    [/DeepIDTorch\(weights\)\.to\(device\)\.eval\(\)/, "Builds the DeepID model from decoded weights, moves every registered buffer to the selected CPU or CUDA device, and switches the model to inference mode.", "Создаёт DeepID из декодированных весов, переносит все зарегистрированные буферы на выбранное устройство CPU/CUDA и переводит модель в режим инференса.", "בונה את מודל DeepID מן המשקלים שפוענחו, מעביר את כל המאגרים הרשומים להתקן CPU או CUDA שנבחר ומעביר את המודל למצב הסקה."],
    [/\.crop\(/, "Extracts the centered square pixel region described by the four crop coordinates and appends it as another recognition variant.", "Вырезает центральную квадратную область по четырём координатам и добавляет её как ещё один вариант распознавания.", "חותכת את אזור הפיקסלים הריבועי המרכזי לפי ארבע הקואורדינטות ומוסיפה אותו כגרסת זיהוי נוספת."],
    [/_image_paths\(/, "Calls the detector helper that returns supported image files from this reference folder in a stable order.", "Вызывает вспомогательную функцию детектора, возвращающую поддерживаемые изображения из этой папки эталонов в стабильном порядке.", "קוראת לפונקציית העזר של הגלאי שמחזירה בסדר יציב קובצי תמונה נתמכים מתיקיית הייחוס הזו."],
    [/\.resolve\(\)/, "Converts the reference path to an absolute normalized path so the same file is not added twice through different folder spellings.", "Преобразует путь эталона в абсолютный нормализованный путь, чтобы один файл не добавился дважды под разными вариантами пути.", "ממירה את נתיב קובץ הייחוס לנתיב מוחלט ומנורמל, כדי שאותו קובץ לא יתווסף פעמיים דרך כתיבי נתיב שונים."],
    [/\.detach\(\)\.cpu\(\)\.numpy\(\)/, "Detaches the similarity tensor from autograd, transfers it from CUDA to CPU, and exposes it as a NumPy array for Python-side label selection.", "Отсоединяет матрицу сходства от autograd, переносит её из CUDA на CPU и представляет как NumPy-массив для выбора имени в Python.", "מנתקת את טנזור הדמיון מ-autograd, מעבירה אותו מ-CUDA ל-CPU וחושפת אותו כמערך NumPy לבחירת השם בצד Python."],
    [/torch\.cuda\.synchronize\(\)/, "Blocks the CPU until all queued CUDA kernels finish, making cached data and measured elapsed time correspond to completed GPU work.", "Блокирует CPU до завершения всех поставленных в очередь CUDA-ядер, чтобы кэш и измеренное время соответствовали законченной работе GPU.", "חוסמת את ה-CPU עד שכל קרנלי CUDA שבתור מסתיימים, כך שהמטמון והזמן הנמדד מייצגים עבודת GPU שהושלמה."],
    [/np\.mean\(/, "Computes the arithmetic mean of the accepted scores for the selected batch identity; the fallback list prevents an empty mean.", "Вычисляет среднее арифметическое принятых оценок выбранной личности в пакете; запасной список не допускает среднего по пустому набору.", "מחשבת את הממוצע החשבוני של הציונים שהתקבלו עבור זהות האצווה שנבחרה; רשימת ברירת המחדל מונעת ממוצע של קבוצה ריקה."],
    [/self\._decide\(/, "Passes this image's variants and similarity-score slice to the shared threshold logic that returns its final identity dictionary.", "Передаёт варианты изображения и соответствующую часть матрицы сходства в общую пороговую логику, возвращающую итоговый словарь личности.", "מעבירה את גרסאות התמונה ואת פרוסת ציוני הדמיון שלה ללוגיקת הספים המשותפת שמחזירה את מילון הזהות הסופי."],
    [/^files\.upload\(/, "Opens Colab's file picker and returns the selected files as in-memory bytes for the next save command.", "Открывает выбор файла Colab и возвращает выбранные файлы как байты в памяти для следующей команды сохранения.", "פותחת את בורר הקבצים של Colab ומחזירה את הקבצים שנבחרו כבייטים בזיכרון לפקודת השמירה הבאה."],
    [/zipfile\.ZipFile\(/, "Opens the ZIP archive for reading; the surrounding context block closes it automatically.", "Открывает ZIP-архив для чтения; окружающий контекстный блок закроет его автоматически.", "פותחת את ארכיון ה-ZIP לקריאה; בלוק ההקשר שסביבו יסגור אותו אוטומטית."],
    [/\.extractall\(/, "Extracts every file from the opened ZIP archive into the folder passed in the parentheses.", "Извлекает все файлы из открытого ZIP-архива в папку, переданную в скобках.", "מחלצת כל קובץ מארכיון ה-ZIP הפתוח אל התיקייה שמועברת בסוגריים."],
    [/\.write_bytes\(/, "Writes the byte sequence in parentheses to the file path on the left, creating or replacing that local file.", "Записывает последовательность байтов в скобках в файл по пути слева, создавая или заменяя этот локальный файл.", "כותבת את רצף הבייטים שבסוגריים לקובץ בנתיב שמשמאל, ויוצרת או מחליפה את הקובץ המקומי."],
    [/Image\.open\(/, "Loads the image file named in the parentheses into a Pillow image object so its pixels can be prepared for the detector.", "Загружает файл изображения из скобок в объект Pillow, чтобы подготовить его пиксели для детектора.", "טוענת את קובץ התמונה שבסוגריים לאובייקט Pillow כדי להכין את הפיקסלים שלו לגלאי."],
    [/\.convert\(["']RGB["']\)/, "Converts the image to exactly three RGB channels, removing grayscale or alpha formats that would change the model input shape.", "Преобразует изображение ровно в три канала RGB, убирая серый формат или прозрачность, которые изменили бы форму входа модели.", "ממירה את התמונה לשלושה ערוצי RGB בדיוק, ומסירה גווני אפור או שקיפות שהיו משנים את צורת קלט המודל."],
    [/\.resize\(/, "Resizes the image to the dimensions passed in the parentheses, producing the fixed pixel size needed by the next step.", "Меняет размер изображения до размеров из скобок, формируя фиксированное число пикселей для следующего шага.", "משנה את גודל התמונה לממדים שבסוגריים וכך יוצרת גודל פיקסלים קבוע הנדרש לשלב הבא."],
    [/Image\.new\(/, "Creates a new blank Pillow image canvas with the requested color mode, size, and background.", "Создаёт новый пустой холст Pillow с указанными цветовым режимом, размером и фоном.", "יוצרת קנבס Pillow חדש וריק עם מצב הצבע, הגודל והרקע המבוקשים."],
    [/\.paste\(/, "Pastes the source image into the destination canvas at the coordinates given in the parentheses.", "Вставляет исходное изображение в холст назначения по координатам из скобок.", "מדביקה את תמונת המקור לקנבס היעד בקואורדינטות שמועברות בסוגריים."],
    [/np\.asarray\(/, "Converts image pixels into a NumPy array so the RGB values can be normalized and rearranged numerically.", "Преобразует пиксели изображения в массив NumPy, чтобы численно нормализовать и переставить значения RGB.", "ממירה את פיקסלי התמונה למערך NumPy כדי שאפשר יהיה לנרמל ולסדר מחדש את ערכי ה-RGB באופן מספרי."],
    [/np\.transpose\(/, "Reorders array axes, normally from height-width-channels to PyTorch's channel-first image order.", "Меняет порядок осей массива: обычно из высота-ширина-каналы в требуемый PyTorch порядок канал первым.", "מסדרת מחדש את צירי המערך, בדרך כלל מגובה-רוחב-ערוצים לסדר התמונה של PyTorch שבו הערוץ ראשון."],
    [/torch\.from_numpy\(/, "Wraps the NumPy array as a PyTorch tensor so it can be fed to the neural network; this command alone does not move it to GPU.", "Оборачивает массив NumPy в тензор PyTorch для передачи нейросети; сама эта команда не переносит его на GPU.", "עוטפת את מערך ה-NumPy כטנזור PyTorch כדי להזין אותו לרשת העצבית; הפקודה עצמה אינה מעבירה אותו ל-GPU."],
    [/F\.conv2d\(/, "Applies learned 2D filters across the input feature maps, creating features that respond to local face patterns.", "Применяет обученные 2D-фильтры к картам признаков входа, создавая признаки, реагирующие на локальные черты лица.", "מפעילה מסננים דו־ממדיים מאומנים על מפות התכונות בקלט, ויוצרת תכונות שמגיבות לדפוסים מקומיים בפנים."],
    [/F\.max_pool2d\(/, "Keeps the strongest value in each local window, reducing feature-map size while retaining the strongest response.", "Оставляет наибольшее значение в каждом локальном окне, уменьшая карту признаков и сохраняя самый сильный сигнал.", "שומרת את הערך החזק ביותר בכל חלון מקומי, מקטינה את מפת התכונות ושומרת את התגובה החזקה ביותר."],
    [/F\.relu\(/, "Applies ReLU: negative feature values become zero, adding the non-linearity needed by the network.", "Применяет ReLU: отрицательные значения признаков становятся нулём, добавляя нелинейность, нужную сети.", "מפעילה ReLU: ערכי תכונות שליליים הופכים לאפס, וכך מתווספת אי־ליניאריות הנדרשת לרשת."],
    [/\.flatten\(1\)/, "Flattens each image's feature map into one vector while preserving dimension 0 as the batch dimension.", "Разворачивает карту признаков каждого изображения в один вектор, сохраняя измерение 0 как размер пакета.", "משטחת את מפת התכונות של כל תמונה לווקטור אחד, תוך שמירת ממד 0 כממד האצווה."],
    [/F\.normalize\(/, "Normalizes every embedding to length 1, so later dot products measure cosine similarity instead of raw vector size.", "Нормализует каждый вектор признаков до длины 1, чтобы последующие скалярные произведения измеряли косинусное сходство, а не размер вектора.", "מנרמלת כל וקטור הטמעה לאורך 1, כך שמכפלות סקלריות בהמשך מודדות דמיון קוסינוס ולא את גודל הווקטור."],
    [/torch\.stack\(/, "Combines the listed tensors into one batch so several prepared face variants are processed in one model call.", "Объединяет перечисленные тензоры в один пакет, чтобы несколько подготовленных вариантов лица обработались одним вызовом модели.", "מאחדת את הטנזורים שברשימה לאצווה אחת, כך שכמה גרסאות פנים מוכנות יעובדו בקריאה אחת למודל."],
    [/torch\.inference_mode\(/, "Enters inference mode: PyTorch skips gradient tracking because this code predicts an identity and does not train the model.", "Включает режим инференса: PyTorch не отслеживает градиенты, потому что код предсказывает личность, а не обучает модель.", "נכנסת למצב הסקה: PyTorch מדלג על מעקב גרדיאנטים כי הקוד מנבא זהות ואינו מאמן את המודל."],
    [/model\(x\)\.detach\(/, "Runs batch tensor x through the model and detaches the resulting embeddings because they are only compared, not used for training.", "Пропускает пакетный тензор x через модель и отсоединяет полученные векторы, потому что их только сравнивают, а не используют для обучения.", "מעבירה את טנזור האצווה x דרך המודל ומנתקת את וקטורי ההטמעה שהתקבלו, כי רק משווים אותם ולא מאמנים באמצעותם."],
    [/^sims\s*=.*@/, "Calculates dot products between query and reference embeddings. After normalization, each number is a cosine-similarity score.", "Вычисляет скалярные произведения между векторами запроса и эталонами. После нормализации каждое число — оценка косинусного сходства.", "מחשבת מכפלות סקלריות בין וקטורי השאילתה לווקטורי הייחוס. לאחר נרמול, כל מספר הוא ציון דמיון קוסינוס."],
    [/time\.perf_counter\(/, "Reads a high-resolution timer; subtracting two such readings measures how long the detection operation took.", "Считывает высокоточный таймер; вычитание двух таких значений измеряет длительность операции распознавания.", "קוראת שעון ברזולוציה גבוהה; חיסור של שתי קריאות כאלה מודד כמה זמן נמשכה פעולת הזיהוי."],
    [/^@app\.(get|post)\(/, "Registers the following function as an HTTP route; the path in parentheses is the URL that a client can call.", "Регистрирует следующую функцию как HTTP-маршрут; путь в скобках — URL, по которому может обратиться клиент.", "רושמת את הפונקציה הבאה כנתיב HTTP; הנתיב שבסוגריים הוא ה-URL שלקוח יכול לקרוא לו."],
    [/JSONResponse\(/, "Builds an HTTP response whose body is JSON, returning the detection result in a form the web interface can read.", "Создаёт HTTP-ответ с телом JSON, возвращая результат распознавания в форме, которую читает веб-интерфейс.", "יוצרת תגובת HTTP שגופה JSON ומחזירה את תוצאת הזיהוי בצורה שממשק האינטרנט יכול לקרוא."],
    [/NamedTemporaryFile\(/, "Creates a temporary local file for an uploaded image so the detector can receive a filename, then cleanup can remove it.", "Создаёт временный локальный файл для загруженного изображения, чтобы детектор получил имя файла, а очистка затем удалила его.", "יוצרת קובץ מקומי זמני לתמונה שהועלתה, כדי שהגלאי יקבל שם קובץ ולאחר מכן הניקוי יוכל למחוק אותו."],
    [/\.unlink\(/, "Deletes this temporary file after it is no longer needed, preventing request files from accumulating on disk.", "Удаляет этот временный файл после того, как он больше не нужен, чтобы файлы запросов не накапливались на диске.", "מוחקת את הקובץ הזמני הזה לאחר שכבר אינו נחוץ, כדי שקבצי בקשות לא יצטברו בדיסק."]
  ];
  const found = actions.find(([pattern]) => pattern.test(text));
  if (found) return say(found[1], found[2], found[3]);
  if (/^\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*:/.test(text)) {
    const key = text.match(/^\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*:/)?.[1] || "field";
    return say(
      "Adds the " + key + " field to the result dictionary. The expression after the colon is the value returned under that field name.",
      "Добавляет поле " + key + " в словарь результата. Выражение после двоеточия — значение, возвращаемое под этим именем поля.",
      "מוסיפה את השדה " + key + " למילון התוצאה. הביטוי שאחרי הנקודתיים הוא הערך שמוחזר תחת שם השדה הזה."
    );
  }
  if (/^#/.test(text)) {
    const runOrderComment = {
      "# === 1. COLAB NOTEBOOK STARTUP CELL: THIS IS THE SAME CODE AS STAGE 01 ===": [
        "Marks the first part of the execution path: this is exactly the Stage 1 Colab notebook cell, run before the detector module.",
        "Обозначает первую часть пути выполнения: это в точности стартовая ячейка ноутбука Colab из этапа 1, которую запускают до модуля детектора.",
        "מסמנת את החלק הראשון של סדר ההרצה: זהו בדיוק תא מחברת Colab של שלב 1, שמריצים לפני מודול הגלאי."
      ],
      "# === 2. HANDOFF: THE SEPARATE DETECTOR MODULE IS LOADED AFTER THE CELL ABOVE ===": [
        "Marks the handoff: after the startup cell has prepared files and the runtime, Colab loads the separate detector-module file.",
        "Обозначает переход: после того как стартовая ячейка подготовила файлы и среду, Colab загружает отдельный файл модуля детектора.",
        "מסמנת את המעבר: לאחר שתא ההפעלה הכין קבצים וסביבה, Colab טוען את קובץ מודול הגלאי הנפרד."
      ],
      "# === 3. EXACT SELECTED EXCERPTS FROM source/colab_ai_mips_bee_world.py ===": [
        "Marks the start of exact selected fragments from the detector-module file; its imports follow because this is a separate Python file.",
        "Обозначает начало точных выбранных фрагментов из файла модуля детектора; далее идут его импорты, потому что это отдельный Python-файл.",
        "מסמנת את תחילת הקטעים המדויקים שנבחרו מקובץ מודול הגלאי; ה-imports שלו מופיעים כעת מפני שזהו קובץ Python נפרד."
      ],
      "# The Raw link beside this panel opens the complete detector-module file.": [
        "Explains that the Raw link opens the complete exact detector-module file, rather than only the excerpts shown in this panel.",
        "Поясняет, что ссылка Raw открывает весь точный файл модуля детектора, а не только фрагменты, показанные в этой панели.",
        "מסבירה שקישור Raw פותח את קובץ מודול הגלאי המדויק המלא, ולא רק את הקטעים שמוצגים בלוח הזה."
      ],
      "# Colab notebook: CUDA runtime and project payload setup": [
        "Labels the Stage 1 notebook cell: it prepares the Colab runtime and the project archive before detector code is imported.",
        "Озаглавливает ячейку ноутбука этапа 1: она подготавливает среду Colab и архив проекта до импорта кода детектора.",
        "מכותרת את תא המחברת של שלב 1: הוא מכין את סביבת Colab ואת ארכיון הפרויקט לפני ייבוא קוד הגלאי."
      ]
    }[text];
    if (runOrderComment) return say(runOrderComment[0], runOrderComment[1], runOrderComment[2]);
    const comment = text.replace(/^#\s*/, "");
    return say(
      "Non-executable comment: " + comment + ". It explains or labels the following code and does not change a value.",
      "Неисполняемый комментарий: " + comment + ". Он поясняет или озаглавливает следующий код и не изменяет значения.",
      "הערה שאינה מבוצעת: " + comment + ". היא מסבירה או מתייגת את הקוד שאחריה ואינה משנה ערך."
    );
  }
  const parameter = text.match(/^([A-Za-z_]\w*)\s*:\s*([^,=]+)(?:\s*=\s*(.+))?,?$/);
  if (parameter) return say(
    "Declares the function parameter " + parameter[1] + " with type " + parameter[2].trim() + (parameter[3] ? " and default value " + parameter[3].trim() : "") + ". The caller supplies this input when calling the function.",
    "Объявляет параметр функции " + parameter[1] + " с типом " + parameter[2].trim() + (parameter[3] ? " и значением по умолчанию " + parameter[3].trim() : "") + ". Вызывающий код передаёт этот вход при вызове функции.",
    "מכריזה על פרמטר הפונקציה " + parameter[1] + " עם טיפוס " + parameter[2].trim() + (parameter[3] ? " וערך ברירת מחדל " + parameter[3].trim() : "") + ". הקוד שקורא לפונקציה מעביר קלט זה בזמן הקריאה."
  );
  if (text === "self,") return say(
    "Declares self, the current detector object. The following parameters and assignments belong to this particular object instance.",
    "Объявляет self — текущий объект детектора. Следующие параметры и присваивания относятся к этому конкретному экземпляру объекта.",
    "מכריזה על self, אובייקט הגלאי הנוכחי. הפרמטרים וההשמות הבאים שייכים למופע המסוים הזה של האובייקט."
  );
  if (/^\[.+\s+for\s+\w+\s+in\s+.+/.test(text)) return say(
    "Builds a list by visiting every candidate path and keeping only items that satisfy the conditions written after if.",
    "Строит список: проходит по каждому пути-кандидату и оставляет только элементы, удовлетворяющие условиям после if.",
    "בונה רשימה: עוברת על כל נתיב מועמד ושומרת רק פריטים שמקיימים את התנאים שאחרי if."
  );
  if (/^key\s*=\s*lambda\b/.test(text)) return say(
    "Defines the sorting key function. For each file it returns the tuple after the colon, so files are ordered first by modification time and then by name.",
    "Задаёт функцию ключа сортировки. Для каждого файла она возвращает кортеж после двоеточия, поэтому файлы упорядочиваются сначала по времени изменения, затем по имени.",
    "מגדירה את פונקציית מפתח המיון. עבור כל קובץ היא מחזירה את הטופל שאחרי הנקודתיים, ולכן הקבצים ממוינים תחילה לפי זמן שינוי ואז לפי שם."
  );
  if (/^return\s+sorted\($/.test(text)) return say(
    "Starts returning a new sorted list. The following lines provide the list to sort and the key used to order it.",
    "Начинает возврат нового отсортированного списка. Следующие строки задают список для сортировки и ключ порядка.",
    "מתחילה להחזיר רשימה ממוינת חדשה. השורות הבאות מספקות את הרשימה למיון ואת המפתח הקובע את הסדר."
  );
  const shape = text.match(/^["']([^"']+)["']\s*:\s*(.+),?$/);
  if (shape) return say(
    "Adds the model-weight entry " + shape[1] + " to the shapes dictionary. The tuple on the right specifies that weight tensor's dimensions.",
    "Добавляет запись весов модели " + shape[1] + " в словарь shapes. Кортеж справа задаёт размеры этого тензора весов.",
    "מוסיפה את רשומת משקלי המודל " + shape[1] + " למילון shapes. הטופל מימין מציין את ממדי טנזור המשקלים הזה."
  );
  const typedMember = text.match(/^(self\.[A-Za-z_]\w*)\s*:\s*([^=]+)\s*=\s*(.+)$/);
  if (typedMember) return say(
    "Creates or resets the detector property " + typedMember[1] + " with declared type " + typedMember[2].trim() + " and initial value " + typedMember[3].trim() + ".",
    "Создаёт или сбрасывает свойство детектора " + typedMember[1] + " с объявленным типом " + typedMember[2].trim() + " и начальным значением " + typedMember[3].trim() + ".",
    "יוצרת או מאפסת את מאפיין הגלאי " + typedMember[1] + " עם טיפוס מוצהר " + typedMember[2].trim() + " וערך התחלתי " + typedMember[3].trim() + "."
  );
  const memberAssignment = text.match(/^(self\.[A-Za-z_]\w*)\s*=\s*(.+)$/);
  if (memberAssignment) return say(
    "Stores the result of " + memberAssignment[2] + " in the detector property " + memberAssignment[1] + ", so this object can use the value in later method calls.",
    "Сохраняет результат " + memberAssignment[2] + " в свойство детектора " + memberAssignment[1] + ", чтобы объект мог использовать значение в следующих вызовах методов.",
    "שומרת את תוצאת " + memberAssignment[2] + " במאפיין הגלאי " + memberAssignment[1] + ", כדי שהאובייקט יוכל להשתמש בערך בקריאות מתודה בהמשך."
  );
  const objectMemberAssignment = text.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*=\s*(.+)$/);
  if (objectMemberAssignment) return say(
    "Writes the value produced by " + objectMemberAssignment[2] + " into the property " + objectMemberAssignment[1] + ". This updates that existing object's setting before the following detector call.",
    "Записывает значение, полученное из " + objectMemberAssignment[2] + ", в свойство " + objectMemberAssignment[1] + ". Так обновляется настройка уже существующего объекта перед следующим вызовом детектора.",
    "כותבת את הערך שמתקבל מ-" + objectMemberAssignment[2] + " אל המאפיין " + objectMemberAssignment[1] + ". כך מתעדכנת הגדרה של אובייקט קיים לפני קריאת הגלאי הבאה."
  );
  const assignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
  if (assignment) return say(
    "Assigns the result of " + assignment[2] + " to " + assignment[1] + ". Later lines read this named value instead of repeating the expression.",
    "Присваивает результат " + assignment[2] + " переменной " + assignment[1] + ". Следующие строки читают это именованное значение, а не повторяют выражение.",
    "מקצה את תוצאת " + assignment[2] + " ל-" + assignment[1] + ". השורות הבאות קוראות ערך בעל שם זה במקום לחזור על הביטוי."
  );
  if (text === ")") return say(
    "Closes the function call or grouped expression that began above; it performs no separate computation by itself.",
    "Закрывает вызов функции или сгруппированное выражение, начатое выше; отдельного вычисления эта строка не выполняет.",
    "סוגרת את קריאת הפונקציה או את הביטוי המקובץ שהתחיל למעלה; היא אינה מבצעת חישוב נפרד בעצמה."
  );
  if (text === "}") return say(
    "Closes the dictionary literal begun above. The collected key-value entries now form one dictionary value.",
    "Закрывает литерал словаря, начатый выше. Собранные пары «ключ–значение» теперь образуют одно значение-словарь.",
    "סוגרת את מילון הערכים שהתחיל למעלה. צמדי המפתח-ערך שנאספו כעת יוצרים ערך מילון אחד."
  );
  if (text === "):") return say(
    "Closes the multi-line function parameter list and begins that function's executable body.",
    "Закрывает многострочный список параметров функции и начинает исполняемое тело этой функции.",
    "סוגרת את רשימת הפרמטרים הרב־שורתית של הפונקציה ומתחילה את גוף הפונקציה שמבוצע."
  );
  if (text === "]") return say(
    "Closes the two-entry list of candidate reference folders for the current known identity.",
    "Закрывает список из двух возможных папок с эталонными изображениями текущего известного человека.",
    "סוגרת את הרשימה בת שתי תיקיות הייחוס האפשריות עבור הזהות הידועה הנוכחית."
  );
  if (/^[\]\),]$/.test(text)) return say(
    "Closes the list, tuple, or argument group that began on earlier lines; it only completes the surrounding expression.",
    "Закрывает список, кортеж или группу аргументов, начатую в предыдущих строках; она только завершает окружающее выражение.",
    "סוגרת רשימה, טופל או קבוצת ארגומנטים שהחלו בשורות קודמות; היא רק משלימה את הביטוי שסביבה."
  );
  return "";
}

function structuralSourceAnnotation(text, lang) {
  const say = (en, ru, he) => repairLocalizedText(lang === "ru" ? ru : lang === "he" ? he : en);
  const exactStructuralLines = {
    "self._torch, self._nn, self._F = torch, nn, F": [
      "Caches the imported torch, torch.nn, and torch.nn.functional modules on this detector object, so later calls reuse them without importing PyTorch again.",
      "Сохраняет импортированные модули torch, torch.nn и torch.nn.functional в объекте детектора, чтобы следующие вызовы использовали их без повторного импорта PyTorch.",
      "שומרת באובייקט הגלאי את המודולים torch,‏ torch.nn ו-torch.nn.functional שיובאו, כדי שהקריאות הבאות ישתמשו בהם בלי לייבא שוב את PyTorch."
    ],
    "torch, _, _ = self._ensure_torch()": [
      "Calls the lazy PyTorch initializer and keeps only the torch module; the two underscore targets deliberately discard the returned nn and functional modules.",
      "Вызывает ленивую инициализацию PyTorch и сохраняет только модуль torch; две переменные «_» намеренно отбрасывают возвращённые модули nn и functional.",
      "קוראת לאתחול העצל של PyTorch ושומרת רק את המודול torch; שני יעדי הקו התחתון משליכים במכוון את המודולים nn ו-functional שהוחזרו."
    ],
    "torch, nn, F = self._ensure_torch()": [
      "Calls the lazy PyTorch initializer and unpacks its three returned modules into torch, nn, and F for model construction.",
      "Вызывает ленивую инициализацию PyTorch и распаковывает три возвращённых модуля в torch, nn и F для построения модели.",
      "קוראת לאתחול העצל של PyTorch ומפרקת את שלושת המודולים שהוחזרו אל torch,‏ nn ו-F לצורך בניית המודל."
    ],
    "src_w, src_h = img.size": [
      "Reads the source image dimensions from Pillow and stores its width in src_w and height in src_h.",
      "Читает размеры исходного изображения Pillow: ширину сохраняет в src_w, а высоту — в src_h.",
      "קוראת את ממדי תמונת המקור מ-Pillow ושומרת את הרוחב ב-src_w ואת הגובה ב-src_h."
    ],
    "target_w, target_h = 47, 55": [
      "Sets the exact DeepID input dimensions: target_w is 47 pixels and target_h is 55 pixels.",
      "Задаёт точный размер входа DeepID: target_w равен 47 пикселям, target_h — 55 пикселям.",
      "קובעת את ממדי הקלט המדויקים של DeepID:‏ target_w הוא 47 פיקסלים ו-target_h הוא 55 פיקסלים."
    ],
    "w, h = img.size": [
      "Reads the current image width into w and height into h so the following crop coordinates can be calculated.",
      "Читает текущую ширину изображения в w и высоту в h, чтобы далее вычислить координаты обрезки.",
      "קוראת את רוחב התמונה הנוכחי אל w ואת הגובה אל h, כדי לחשב בהמשך את קואורדינטות החיתוך."
    ],
    "model, device = self._model(mode)": [
      "Gets the cached or newly built DeepID model for the requested mode and unpacks the actual execution device selected by that method.",
      "Получает кэшированную либо только что созданную модель DeepID для запрошенного режима и отдельно сохраняет фактически выбранное устройство выполнения.",
      "מקבלת את מודל DeepID השמור במטמון או החדש עבור המצב המבוקש, ומפרקת בנפרד את התקן הביצוע שנבחר בפועל."
    ],
    "model, device = self._model(\"gpu\")": [
      "Requests the CUDA DeepID model explicitly and stores both that model and its verified CUDA device for the shared batch forward pass.",
      "Явно запрашивает CUDA-модель DeepID и сохраняет модель вместе с проверенным CUDA-устройством для общего пакетного прохода.",
      "מבקשת במפורש את מודל DeepID של CUDA ושומרת גם את המודל וגם את התקן CUDA המאומת לצורך מעבר האצווה המשותף."
    ],
    "label, ref_path = self.ref_items[ref_index]": [
      "Looks up the reference record at ref_index and unpacks its known person's label and source image path.",
      "Берёт эталонную запись с индексом ref_index и распаковывает имя известного человека и путь к его изображению.",
      "קוראת את רשומת הייחוס באינדקס ref_index ומפרקת ממנה את תווית האדם הידוע ואת נתיב תמונת המקור."
    ],
    "emb, device = self._embed_variants(variants, mode)": [
      "Embeds every prepared variant in one model batch and stores both the resulting embedding matrix and the actual CPU/CUDA device used.",
      "Вычисляет признаки всех подготовленных вариантов одним пакетом модели и сохраняет матрицу эмбеддингов вместе с фактически использованным устройством CPU/CUDA.",
      "מחשבת הטמעות לכל הגרסאות המוכנות באצוות מודל אחת ושומרת גם את מטריצת ההטמעות וגם את התקן ה-CPU/CUDA שבו נעשה שימוש בפועל."
    ],
    "counts[label] = counts.get(label, 0) + 1": [
      "Increments the number of batch images accepted as this label, starting from zero when the label has not appeared before.",
      "Увеличивает число изображений пакета, принятых как label; если это имя ещё не встречалось, отсчёт начинается с нуля.",
      "מגדילה את מספר תמונות האצווה שהתקבלו כתווית זו; אם התווית טרם הופיעה, הספירה מתחילה מאפס."
    ],
    "counts[label],": [
      "Supplies this label's accepted-image count as the first element of its sorting key, so labels recognized in more images rank higher.",
      "Передаёт число принятых изображений этого имени как первый элемент ключа сортировки, поэтому имя с большим числом распознаваний получает приоритет.",
      "מספקת את מספר התמונות שהתקבלו עבור התווית כרכיב הראשון במפתח המיון, ולכן תווית שזוהתה ביותר תמונות מדורגת גבוה יותר."
    ],
    "sum(scores.get(label, [0.0])) / len(scores.get(label, [1.0])),": [
      "Calculates this label's mean accepted score as the second sorting key; fallback lists keep the expression defined if no scores exist.",
      "Вычисляет среднюю принятую оценку этого имени как второй ключ сортировки; запасные списки не допускают деления на ноль при отсутствии оценок.",
      "מחשבת את ממוצע הציונים שהתקבלו עבור התווית כמפתח המיון השני; רשימות ברירת המחדל מונעות חלוקה באפס אם אין ציונים."
    ],
    "),": [
      "Closes the two-value sorting-key tuple returned by the lambda; the trailing comma separates this keyword argument from the next one.",
      "Закрывает кортеж из двух значений, возвращаемый lambda как ключ сортировки; запятая отделяет этот именованный аргумент от следующего.",
      "סוגרת את טופל שני הערכים שה-lambda מחזירה כמפתח מיון; הפסיק מפריד את ארגומנט מילת-המפתח הזה מן הבא."
    ],
    ")[0]": [
      "Closes the sorted call and selects element 0, the highest-ranked label after reverse sorting by count and mean score.",
      "Закрывает вызов sorted и выбирает элемент 0 — имя с наивысшим рейтингом после обратной сортировки по числу распознаваний и средней оценке.",
      "סוגרת את קריאת sorted ובוחרת את איבר 0 — התווית המדורגת ראשונה לאחר מיון יורד לפי מספר הזיהויים וממוצע הציון."
    ],
    "]": [
      "Closes the two-entry list of candidate reference folders for the current known identity.",
      "Закрывает список из двух возможных папок с эталонными изображениями текущего известного человека.",
      "סוגרת את הרשימה בת שתי תיקיות הייחוס האפשריות עבור הזהות הידועה הנוכחית."
    ],
    ") -> dict[str, Any]:": [
      "Closes the multi-line detect_batch parameter list, declares that the method returns a string-keyed dictionary, and begins its executable body.",
      "Закрывает многострочный список параметров detect_batch, объявляет возврат словаря со строковыми ключами и начинает исполняемое тело метода.",
      "סוגרת את רשימת הפרמטרים הרב-שורתית של detect_batch, מצהירה שהמתודה מחזירה מילון בעל מפתחות מחרוזת ומתחילה את הגוף שמבוצע."
    ]
  };
  const exactStructural = exactStructuralLines[text];
  if (exactStructural) return repairLocalizedText(exactStructural[lang === "ru" ? 1 : lang === "he" ? 2 : 0]);
  if (text === "@staticmethod") return say(
    "Marks short_text as a utility method that receives no detector instance; callers invoke it on the class or object using only the result argument.",
    "Помечает short_text как служебный метод без экземпляра детектора: он использует только переданный result и может вызываться через класс или объект.",
    "מסמן את short_text כמתודת עזר שאינה מקבלת מופע גלאי; היא משתמשת רק בארגומנט result וניתן לקרוא לה דרך המחלקה או האובייקט."
  );
  const simpleParameter = text.match(/^([A-Za-z_]\w*),$/);
  if (simpleParameter) return say(
    `Adds positional parameter ${simpleParameter[1]} to the multi-line function signature being declared.`,
    `Добавляет позиционный параметр ${simpleParameter[1]} в многострочную сигнатуру объявляемой функции.`,
    `מוסיף את הפרמטר המיקומי ${simpleParameter[1]} לחתימת הפונקציה הרב-שורתית שמוגדרת.`
  );
  const parameter = text.match(/^([A-Za-z_]\w*)\s*:\s*([^=,]+)(?:\s*=\s*(.+))?,?$/);
  if (parameter) {
    const defaultText = parameter[3]
      ? ` The default value is ${parameter[3].replace(/,$/, "")}.`
      : "";
    const defaultRu = parameter[3]
      ? ` Значение по умолчанию: ${parameter[3].replace(/,$/, "")}.`
      : "";
    const defaultHe = parameter[3]
      ? ` ערך ברירת המחדל הוא ${parameter[3].replace(/,$/, "")}.`
      : "";
    return say(
      `Declares parameter ${parameter[1]} with type ${parameter[2].trim()}.${defaultText}`,
      `Объявляет параметр ${parameter[1]} с типом ${parameter[2].trim()}.${defaultRu}`,
      `מגדיר את הפרמטר ${parameter[1]} עם הטיפוס ${parameter[2].trim()}.${defaultHe}`
    );
  }
  const typedLocal = text.match(/^([A-Za-z_]\w*)\s*:\s*(.+?)\s*=\s*(.+)$/);
  if (typedLocal) return say(
    `Creates local variable ${typedLocal[1]} with declared type ${typedLocal[2]} and initializes it with ${typedLocal[3]}.`,
    `Создаёт локальную переменную ${typedLocal[1]} с объявленным типом ${typedLocal[2]} и начальным значением ${typedLocal[3]}.`,
    `יוצרת את המשתנה המקומי ${typedLocal[1]} עם הטיפוס המוצהר ${typedLocal[2]} ומאתחלת אותו בערך ${typedLocal[3]}.`
  );
  const dictEntry = text.match(/^["']([^"']+)["']\s*:\s*(.+?)(?:,)?$/);
  if (dictEntry) return say(
    `Adds dictionary field “${dictEntry[1]}” with value ${dictEntry[2].replace(/,$/, "")}.`,
    `Добавляет в словарь поле «${dictEntry[1]}» со значением ${dictEntry[2].replace(/,$/, "")}.`,
    `מוסיף למילון את השדה „${dictEntry[1]}” עם הערך ${dictEntry[2].replace(/,$/, "")}.`
  );
  const augmented = text.match(/^(.+?)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
  if (augmented) return say(
    `Updates ${augmented[1]} in place by applying ${augmented[2].slice(0, -1)} to its current value and ${augmented[3]}.`,
    `Обновляет ${augmented[1]} на месте: применяет операцию ${augmented[2].slice(0, -1)} к текущему значению и ${augmented[3]}.`,
    `מעדכן את ${augmented[1]} במקום באמצעות הפעולה ${augmented[2].slice(0, -1)} על הערך הנוכחי ועל ${augmented[3]}.`
  );
  const raiseMatch = text.match(/^raise\s+([A-Za-z_]\w*)\((.*)\)$/);
  if (raiseMatch) return say(
    `Stops this detection path by raising ${raiseMatch[1]} with the diagnostic message or value ${raiseMatch[2]}.`,
    `Останавливает этот путь распознавания исключением ${raiseMatch[1]} с диагностическим сообщением или значением ${raiseMatch[2]}.`,
    `עוצר את מסלול הזיהוי הזה באמצעות החריג ${raiseMatch[1]} עם הודעת האבחון או הערך ${raiseMatch[2]}.`
  );
  const openRaise = text.match(/^raise\s+([A-Za-z_]\w*)\($/);
  if (openRaise) return say(
    `Begins raising ${openRaise[1]}; the following string lines provide the complete diagnostic message before the call is closed.`,
    `Начинает создание исключения ${openRaise[1]}; следующие строки задают полное диагностическое сообщение до закрывающей скобки.`,
    `מתחילה להעלות את החריג ${openRaise[1]}; שורות המחרוזת הבאות מספקות את הודעת האבחון המלאה עד לסוגר הסיום.`
  );
  const keywordArgument = text.match(/^([A-Za-z_]\w*)\s*=\s*(.+),$/);
  if (keywordArgument) return say(
    `Passes keyword argument ${keywordArgument[1]} with value ${keywordArgument[2]} to the multi-line call that began above.`,
    `Передаёт именованный аргумент ${keywordArgument[1]} со значением ${keywordArgument[2]} в многострочный вызов, начатый выше.`,
    `מעביר את ארגומנט מילת-המפתח ${keywordArgument[1]} עם הערך ${keywordArgument[2]} לקריאה הרב-שורתית שהחלה למעלה.`
  );
  const stringContinuation = text.match(/^([rubf]*)["'](.+)["'],?$/i);
  if (stringContinuation) return say(
    `Provides the string text “${stringContinuation[2]}” as part of the surrounding expression; adjacent string literals are concatenated by Python.`,
    `Добавляет строковый текст «${stringContinuation[2]}» в окружающее выражение; соседние строковые литералы Python объединяет автоматически.`,
    `מספק את הטקסט „${stringContinuation[2]}” כחלק מן הביטוי שמסביב; Python מחבר מחרוזות סמוכות אוטומטית.`
  );
  if (/^self\.work_dir\s*\/.+,$/.test(text)) return say(
    "Builds one candidate reference-folder path relative to the detector working directory and adds it to the surrounding folder list.",
    "Формирует один путь к папке эталонов относительно рабочей папки детектора и добавляет его в окружающий список папок.",
    "בונה נתיב מועמד אחד לתיקיית ייחוס ביחס לתיקיית העבודה של הגלאי ומוסיף אותו לרשימת התיקיות שמסביב."
  );
  if (/^super\(\)\.__init__\(\)$/.test(text)) return say(
    "Initializes the inherited torch.nn.Module state before DeepID registers its weight buffers.",
    "Инициализирует унаследованное состояние torch.nn.Module до регистрации буферов весов DeepID.",
    "מאתחל את מצב torch.nn.Module שעבר בירושה לפני ש-DeepID רושם את מאגרי המשקלים שלו."
  );
  const methodCall = text.match(/^([A-Za-z_][\w.]*)\((.*)\)$/);
  if (methodCall) return say(
    `Calls ${methodCall[1]} with arguments ${methodCall[2] || "none"}; the call performs that named operation immediately and its return value is not stored on this line.`,
    `Вызывает ${methodCall[1]} с аргументами ${methodCall[2] || "без аргументов"}; операция выполняется сразу, а возвращаемое значение на этой строке не сохраняется.`,
    `קורא ל-${methodCall[1]} עם הארגומנטים ${methodCall[2] || "ללא ארגומנטים"}; הפעולה מתבצעת מיד וערך ההחזרה אינו נשמר בשורה זו.`
  );
  const subscriptAssignment = text.match(/^([A-Za-z_][\w.]*)\[([^\]]+)\]\s*=\s*(.+)$/);
  if (subscriptAssignment) return say(
    `Stores ${subscriptAssignment[3]} under key or index ${subscriptAssignment[2]} in ${subscriptAssignment[1]}, updating that cache or result table for later lookup.`,
    `Сохраняет ${subscriptAssignment[3]} по ключу или индексу ${subscriptAssignment[2]} в ${subscriptAssignment[1]}, обновляя кэш либо таблицу результатов для последующего поиска.`,
    `שומרת את ${subscriptAssignment[3]} תחת המפתח או האינדקס ${subscriptAssignment[2]} בתוך ${subscriptAssignment[1]}, ומעדכנת את המטמון או טבלת התוצאות לחיפוש בהמשך.`
  );
  if (/^\[.*\bfor\b.*\bin\b.*\]$/.test(text)) return say(
    "Builds a list comprehension: evaluates the expression before “for” once for every item produced by the iterator after “in”.",
    "Создаёт список включением: вычисляет выражение перед «for» для каждого элемента последовательности после «in».",
    "בונה list comprehension: מחשב את הביטוי שלפני “for” עבור כל איבר שמופק מן האיטרטור שאחרי “in”."
  );
  if (/^#/.test(text)) {
    const body = text.replace(/^#+\s*/, "");
    return say(
      `Non-executable source comment: “${body}”. It documents the following or adjacent detector logic without changing runtime state.`,
      `Неисполняемый комментарий исходника: «${body}». Он поясняет соседнюю логику детектора и не изменяет состояние программы.`,
      `הערת קוד מקור שאינה מבוצעת: „${body}”. היא מתעדת את לוגיקת הגלאי הסמוכה ואינה משנה את מצב התוכנית.`
    );
  }
  return "";
}

function englishSourceLineAnnotation(text) {
  const importFrom = text.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
  const importModule = text.match(/^import\s+(.+)$/);
  const functionMatch = text.match(/^def\s+([\w]+)\s*\(/);
  const classMatch = text.match(/^class\s+([\w]+)(?:\(|:)/);
  const assignment = text.match(/^([A-Z][A-Z0-9_]*|[a-z_][\w.]*)\s*=/);
  if (text === "from __future__ import annotations") return "Enables postponed Python type annotations so type references remain valid throughout the module.";
  if (importFrom) return `Imports ${importFrom[2]} from ${importFrom[1]} for this detector module.`;
  if (importModule) return `Imports the ${importModule[1]} module used by the detector runtime.`;
 if (/^@dataclass\b/.test(text)) return "Marks the following class as a data container with generated fields and constructor.";
  if (functionMatch && functionMatch[1] === "__init__") {
    return "Defines the constructor. Python runs this method when a detector object is created, and its body initializes that object\'s state.";
  }
 if (classMatch) return `Defines the ${classMatch[1]} class that groups related detector state and behavior.`;
  if (functionMatch) {
    const functionPurpose = {
      _image_paths: "collects usable image files from a folder",
      _ensure_torch: "loads and caches the PyTorch modules used by the detector",
      _device_name: "chooses the CPU or CUDA backend name for the requested mode",
      _load_weights: "loads and caches the trained DeepID weight tensors",
      _model: "creates or retrieves the DeepID neural-network model for the selected backend",
      conv_weight: "converts one stored convolution weight array into the layout required by PyTorch",
      bias: "converts one stored bias array into a PyTorch tensor",
      dense_weight: "converts one stored dense-layer weight array into the layout required by PyTorch",
      forward: "defines the network forward pass from an input face tensor to its embedding",
      _preprocess_pil: "converts a Pillow face image into the normalized tensor expected by DeepID",
      _variants: "creates face-image variants used to make recognition more stable",
      load_references: "loads the known people and computes their reference embeddings",
      _embed_variants: "batches image variants and computes their embedding vectors",
      _decide: "selects the best identity and verifies score and margin thresholds",
      detect_image: "runs complete recognition for one image",
      detect_batch: "runs recognition for every image in a batch",
      short_text: "formats a detector result as a short human-readable label",
      detect_file_ui: "handles one image uploaded through the web interface"
    }[functionMatch[1]];
    return functionPurpose
      ? "Defines " + functionMatch[1] + ": it " + functionPurpose + "."
      : "Defines " + functionMatch[1] + ". Its indented body performs the operation named by this function.";
  }
  if (/^#/.test(text)) return "Documentation comment for the following source fragment; Python does not execute it.";
  if (/^if\s+/.test(text)) return `Checks the condition \`${text.replace(/^if\s+/, "").replace(/:$/, "")}\` and selects the appropriate execution branch.`;
  if (/^(else|elif)\b/.test(text)) return "Defines the alternative branch for the preceding condition.";
  if (/^for\s+/.test(text)) return `Iterates over \`${text.replace(/^for\s+/, "").replace(/:$/, "")}\` to process each item.`;
  if (/^with\s+/.test(text)) return "Opens a managed context that releases its resource automatically when the block ends.";
  if (/^try:/.test(text)) return "Starts a protected block so an error can be handled without stopping the detector.";
  if (/^except\b/.test(text)) return "Handles an error raised inside the protected block.";
  if (/^finally:/.test(text)) return "Defines cleanup that runs whether the protected block succeeds or fails.";
  if (/^return\b/.test(text)) {
    const result = text.replace(/^return\s*/, "") || "None";
    return result === "[]" ? "Returns an empty list because no matching files were found." : `Returns \`${result}\` to the caller.`;
  }
  if (assignment) return `Stores this expression in ${assignment[1]} for a later detector step.`;
 if (/^pass\b/.test(text)) return "Leaves this branch intentionally empty; no action is required here.";
 if (/^(break|continue)\b/.test(text)) return "Changes the current loop by ending it or moving to the next iteration.";
  if (text) return "Completes the surrounding multi-line Python expression with this exact fragment: " + text + ".";
 return "Executes the Python operation shown on the left as part of detector computation or data preparation.";
}

function sourceLineAnnotation(line, lang) {
  const text = line.trim();
  if (!text) {
    return lang === "ru"
      ? "Пустая строка визуально отделяет соседние логические части исходника; Python не выполняет на ней команду."
      : lang === "he"
        ? "שורה ריקה מפרידה חזותית בין חלקים לוגיים סמוכים בקוד המקור; Python אינה מבצעת בה פקודה."
        : "Blank line separating adjacent logical source sections; Python executes no command on this line.";
  }
  const operation = operationAnnotation(text, lang);
  if (operation) return operation;
  const structural = structuralSourceAnnotation(text, lang);
  if (structural) return structural;
  if (lang === "en") return englishSourceLineAnnotation(text);
  const hebrew = lang === "he";
  const importFrom = text.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
  const importModule = text.match(/^import\s+(.+)$/);
  const functionMatch = text.match(/^def\s+([\w]+)\s*\(/);
  const classMatch = text.match(/^class\s+([\w]+)(?:\(|:)/);
  const assignment = text.match(/^([A-Z][A-Z0-9_]*|[a-z_][\w.]*)\s*=/);
  if (/^from __future__ import annotations$/.test(text)) {
    return hebrew ? "מפעילה הערות טיפוסים דחויות של Python, כדי שטיפוסים ייבדקו רק לאחר הגדרת הקוד." : "Включает отложенные аннотации типов Python, чтобы ссылки на типы могли использоваться после определения кода.";
  }
  if (importFrom) {
    const meaning = sourceImportMeaning[importFrom[1]];
    return hebrew
      ? `מייבאת ${importFrom[2]} מתוך ${importFrom[1]} ${meaning?.he || "לשימוש בקוד הגלאי"}.`
      : `Импортирует ${importFrom[2]} из ${importFrom[1]} ${meaning?.ru || "для использования в коде детектора"}.`;
  }
  if (importModule) {
    const moduleName = importModule[1].split(/\s+as\s+/)[0];
    const meaning = sourceImportMeaning[moduleName];
    return hebrew
      ? `מייבאת את המודול ${importModule[1]} ${meaning?.he || "לשימוש בקוד הגלאי"}.`
      : `Импортирует модуль ${importModule[1]} ${meaning?.ru || "для использования в коде детектора"}.`;
  }
  if (/^@dataclass\b/.test(text)) return hebrew ? "מסמנת שהמחלקה הבאה היא מבנה נתונים עם בנאי ושדות שנוצרים אוטומטית." : "Помечает следующий класс как структуру данных с автоматически создаваемыми полями и конструктором.";
  if (classMatch) return hebrew ? `מגדירה את המחלקה ${classMatch[1]}, שמאגדת מצב או לוגיקה של רכיב במערכת.` : `Объявляет класс ${classMatch[1]}, объединяющий состояние или логику компонента системы.`;
 if (functionMatch) {
    if (functionMatch[1] === "__init__") {
      return hebrew
        ? "מגדירה את בנאי המחלקה. Python מפעיל אותו כאשר נוצר אובייקט גלאי, וגופו מאתחל את מצב האובייקט."
        : "Объявляет конструктор класса. Python вызывает его при создании объекта детектора, а его тело инициализирует состояние объекта.";
    }
   const meaning = sourceFunctionMeaning[functionMatch[1]];
    return hebrew ? `מגדירה את הפונקציה ${functionMatch[1]}: ${meaning?.he || "הגוף שלה מבצע פעולה מוגדרת של הגלאי או הממשק"}.` : `Объявляет функцию ${functionMatch[1]}: ${meaning?.ru || "её тело выполняет определённую операцию детектора или интерфейса"}.`;
  }
  if (/^#/.test(text)) {
    const note = sourceCommentMeaning[text];
    return note ? note[hebrew ? "he" : "ru"] : (hebrew ? "הערת תיעוד למקטע הקוד הבא; היא אינה מבוצעת על ידי Python." : "Комментарий документации к следующему фрагменту кода; Python его не выполняет.");
  }
  if (/^if\s+/.test(text)) {
    const condition = text.replace(/^if\s+/, "").replace(/:$/, "");
    return hebrew ? `בודקת את התנאי \`${condition}\` ובוחרת את ענף הביצוע המתאים.` : `Проверяет условие \`${condition}\` и выбирает подходящую ветку выполнения.`;
  }
  if (/^(else|elif)\b/.test(text)) return hebrew ? "מגדירה את החלופה לתנאי שנבדק לפני כן." : "Задаёт альтернативную ветку к ранее проверенному условию.";
  if (/^for\s+/.test(text)) {
    const loop = text.replace(/^for\s+/, "").replace(/:$/, "");
    return hebrew ? `עוברת בלולאה על \`${loop}\`, כדי לעבד כל רכיב בתורו.` : `Перебирает в цикле \`${loop}\`, чтобы обработать каждый элемент по очереди.`;
  }
  if (/^with\s+/.test(text)) return hebrew ? "פותחת הקשר עבודה שמנקה את המשאב אוטומטית בסיום." : "Открывает контекст работы, который автоматически освободит ресурс после завершения.";
  if (/^try:/.test(text)) return hebrew ? "מתחילה אזור מוגן: שגיאה תטופל במקום להפיל את התהליך." : "Начинает защищённый блок: ошибка будет обработана, а не остановит процесс.";
  if (/^except\b/.test(text)) return hebrew ? "מטפלת בשגיאה שהתרחשה בבלוק המוגן." : "Обрабатывает ошибку, возникшую в защищённом блоке.";
  if (/^finally:/.test(text)) return hebrew ? "מגדירה ניקוי חובה, שמתבצע גם כאשר אירעה שגיאה." : "Задаёт обязательную очистку, которая выполняется даже при ошибке.";
  if (/^return\b/.test(text)) {
    const result = text.replace(/^return\s*/, "") || "None";
    if (result === "[]") return hebrew ? "מחזירה רשימה ריקה, כי לא נמצאו קבצים מתאימים." : "Возвращает пустой список: подходящих файлов не найдено.";
    return hebrew ? `מחזירה את הערך \`${result}\` לקוד שקרא לפונקציה.` : `Возвращает значение \`${result}\` в код, вызвавший функцию.`;
  }
  if (assignment) {
    const name = assignment[1];
    const special = {
      IDENTITIES: hebrew ? "קובעת את רשימת הזהויות שהמערכת יודעת לזהות." : "Задаёт список людей, которых система умеет распознавать.",
      IMG_EXTS: hebrew ? "מגדירה את סיומות קובצי התמונה המותרות." : "Определяет допустимые расширения файлов изображений.",
      MIN_SCORE: hebrew ? "מגדירה את סף הדמיון המינימלי לקבלת זהות." : "Задаёт минимальный порог сходства для принятия личности.",
      MIN_MARGIN: hebrew ? "מגדירה את הפער המינימלי בין המקום הראשון לשני." : "Задаёт минимальный отрыв между первым и вторым совпадением."
    }[name];
    return special || (hebrew ? `שומרת את תוצאת הביטוי במשתנה ${name}, להמשך החישוב.` : `Сохраняет результат выражения в переменной ${name} для следующего шага вычислений.`);
  }
 if (/^pass\b/.test(text)) return hebrew ? "משאירה ענף ריק במכוון; אין כאן פעולה לביצוע." : "Оставляет ветку намеренно пустой: действие на этом месте не требуется.";
 if (/^(break|continue)\b/.test(text)) return hebrew ? "משנה את מהלך הלולאה: מפסיקה אותה או עוברת לאיטרציה הבאה." : "Изменяет ход цикла: прерывает его либо переходит к следующей итерации.";
  if (text) {
    return hebrew
      ? "משלימה את הביטוי הרב־שורי שסביבו באמצעות קטע הקוד המדויק: " + text + "."
      : "Завершает окружающее многострочное выражение точным фрагментом кода: " + text + ".";
  }
 return hebrew ? "מבצעת את פעולת Python המוצגת משמאל כחלק מהחישוב או מהכנת נתוני הגלאי." : "Выполняет показанную слева операцию Python как часть вычисления или подготовки данных детектора.";
}

function patternCodeAnnotation(line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  const exact = detailedCodeLineAnnotations[trimmed];
  if (exact) return repairLocalizedText(exact[lang] || exact.en);
  return sourceLineAnnotation(trimmed, lang);
}

function looksLikeMojibake(text) {
  return typeof text === "string" && /[РСЧ][\u0080-\u00bf\u0402-\u040f\u0450-\u045f]/.test(text);
}

function repairLocalizedText(value) {
  if (!looksLikeMojibake(value)) return value || "";
  const cp1251Special = {
    0x0402: 0x80, 0x0403: 0x81, 0x201a: 0x82, 0x0453: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x20ac: 0x88, 0x2030: 0x89, 0x0409: 0x8a, 0x2039: 0x8b, 0x040a: 0x8c, 0x040c: 0x8d, 0x040b: 0x8e, 0x040f: 0x8f,
    0x0452: 0x90, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x2122: 0x99, 0x0459: 0x9a, 0x203a: 0x9b, 0x045a: 0x9c, 0x045c: 0x9d, 0x045b: 0x9e, 0x045f: 0x9f, 0x0401: 0xa8,
    0x040e: 0xa1, 0x045e: 0xa2, 0x0408: 0xa3, 0x0490: 0xa5, 0x0491: 0xb4, 0x0404: 0xaa, 0x0407: 0xaf, 0x0406: 0xb2,
    0x0456: 0xb3, 0x0451: 0xb8, 0x2116: 0xb9, 0x0454: 0xba, 0x0458: 0xbc, 0x0405: 0xbd, 0x0455: 0xbe, 0x0457: 0xbf
  };
  const bytes = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point <= 0x7f) bytes.push(point);
    else if (point >= 0x0080 && point <= 0x009f) bytes.push(point);
    else if (point >= 0x00a0 && point <= 0x00ff) bytes.push(point);
    else if (point >= 0x0410 && point <= 0x044f) bytes.push(point - 0x350);
    else if (cp1251Special[point] !== undefined) bytes.push(cp1251Special[point]);
    else return value;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

function cleanLocalizedCodeAnnotation(match, lang) {
  return repairLocalizedText(match && (match[lang] || match.en));
}

function codeAnnotation(stage, line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  if (!trimmed) return repairLocalizedText(codeBlankAnnotation[lang] || codeBlankAnnotation.en);
  const exact = detailedCodeLineAnnotations[trimmed];
  if (exact) return repairLocalizedText(exact[lang] || exact.en);
  return patternCodeAnnotation(line);
}

function uiText(key) {
  const lang = document.documentElement.lang || "en";
  return repairLocalizedText(detailUi[lang]?.[key] || translations[lang]?.[key] || detailUi.en[key] || translations.en[key] || key);
}

function renderStageCode(stage) {
  stageCode.innerHTML = "";
  const lang = document.documentElement.lang || "en";
  const requestedFullMode = stageCodeMode === "full";
  const fullMode = requestedFullMode && Boolean(stage.exactCode);
  const source = fullMode ? stage.exactCode : stage.code;
  stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  stageCode.classList.toggle("full-code", Boolean(fullMode));
  if (stageCodeModeButton) {
    stageCodeModeButton.textContent = uiText(requestedFullMode ? "showShortCode" : "openFullCode");
  }
  if (stageCodeSource) {
    stageCodeSource.textContent = fullMode
      ? `${uiText("fullStageExact")} · ${uiText("lineCount").replace("{count}", String(stage.exactLineCount || codeLineCount(stage.exactCode)))}`
      : requestedFullMode
        ? uiText(exactStageCodeState === "error" ? "fullStageError" : "fullStageLoading")
        : uiText("codeSourceShort");
  }
  source.split("\n").forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    note.textContent = codeAnnotation(stage, line);
    row.append(code, note);
    stageCode.appendChild(row);
  });
}

function notebookCodeCells(rawNotebook) {
  const notebook = JSON.parse(rawNotebook);
  return (notebook.cells || [])
    .filter((cell) => cell.cell_type === "code")
    .map((cell) => Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || ""))
    .join("\n\n");
}

function exactCodeBlock(source, startPattern, endPattern) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";
  const endOffset = lines.slice(start + 1).findIndex((line) => endPattern.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join("\n").trim();
}

function detectorStageLineBlocks(detectorModule, variantName) {
  const lines = detectorModule.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const find = (pattern) => {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) throw new Error(`missing detector boundary ${pattern}`);
    return index;
  };
  const boundaries = variantName === "batch"
    ? [
        0,
        find(/^    def _load_weights\b/),
        find(/^    def _preprocess_pil\b/),
        find(/^    def load_references\b/),
        find(/^    def _embed_variants\b/),
        find(/^    def detect_batch\b/),
        lines.length
      ]
    : [
        0,
        find(/^    def _load_weights\b/),
        find(/^    def _preprocess_pil\b/),
        find(/^    def load_references\b/),
        find(/^    def _embed_variants\b/),
        find(/^    def detect_image\b/),
        find(/^    def detect_batch\b/)
      ];
  return boundaries.slice(0, -1).map((start, index) => lines.slice(start, boundaries[index + 1]));
}

function codeLineCount(source) {
  return source ? source.split("\n").length : 0;
}

async function ensureExactStageCode() {
  if (exactStageCodeState === "ready") return true;
  if (exactStageCodeState === "loading") return false;
  exactStageCodeState = "loading";
  try {
    const detectorResponse = await fetch("source/cuda_deepid_detector.py", { cache: "no-store" });
    if (!detectorResponse.ok) throw new Error("detector source HTTP " + detectorResponse.status);
    detectorSourceText = await detectorResponse.text();
    detectorSourceLoaded = true;
    const lineBlocks = detectorStageLineBlocks(detectorSourceText, activeDetectorVariant);
    if (lineBlocks.length !== stageDetails.length) {
      throw new Error(`expected ${stageDetails.length} stage blocks, found ${lineBlocks.length}`);
    }
    lineBlocks.forEach((lines, index) => {
      stageDetails[index].exactCode = lines.join("\n");
      stageDetails[index].exactLineCount = lines.length;
    });
    const combinedLines = lineBlocks.flat();
    stageRecognitionLineCount = lineBlocks.reduce((total, lines) => total + lines.length, 0);
    combinedRecognitionCode = combinedLines.join("\n");
    combinedRecognitionLineCount = codeLineCount(combinedRecognitionCode);
    if (combinedRecognitionLineCount !== stageRecognitionLineCount) {
      throw new Error(
        `combined recognition line count ${combinedRecognitionLineCount} does not equal stage sum ${stageRecognitionLineCount}`
      );
    }
    const expectedLines = detectorSourceText.replace(/\r\n/g, "\n").split("\n");
    if (expectedLines[expectedLines.length - 1] === "") expectedLines.pop();
    const expected = activeDetectorVariant === "batch"
      ? expectedLines
      : expectedLines.slice(0, expectedLines.findIndex((line) => /^    def detect_batch\b/.test(line)));
    if (combinedLines.join("\n") !== expected.join("\n")) {
      throw new Error("the combined stage text is not identical to the selected detector source boundary");
    }
    exactStageCodeState = "ready";
    return true;
  } catch (error) {
    console.error("Could not load exact stage code", error);
    exactStageCodeState = "error";
    return false;
  }
}

function updateDetectorSourceUi() {
  if (!fullSourceMeta || !fullDetectorSource) return;
  if (loadFullDetectorSource) {
    loadFullDetectorSource.textContent = uiText(detectorSourceVisible ? "hideDetectorSource" : "openDetectorSource");
  }
  if (!detectorSourceVisible) {
    fullSourceMeta.textContent = uiText("sourceClosed");
  } else if (exactStageCodeState === "ready") {
    const countKey = combinedRecognitionLineCount === stageRecognitionLineCount ? "sourceLoaded" : "sourceCountError";
    fullSourceMeta.textContent = uiText(countKey)
      .replace("{total}", String(combinedRecognitionLineCount))
      .replace("{sum}", String(stageRecognitionLineCount))
      .replace("{variant}", localized(activeVariantDefinition().label));
  }
}

function findBlockEnd(lines, startIndex, matcher) {
  if (startIndex < 0) return -1;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (matcher(lines[index])) return index;
  }
  return lines.length;
}

function extractDetectorSource(source) {
  return source.replace(/\r\n/g, "\n");
}

function renderDetectorSource(source) {
  if (!fullDetectorSource) return;
  fullDetectorSource.innerHTML = "";
  const lang = document.documentElement.lang || "en";
  fullDetectorSource.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  extractDetectorSource(source).split("\n").forEach((line) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    note.textContent = line.trim() ? patternCodeAnnotation(line) : repairLocalizedText(codeBlankAnnotation[lang] || codeBlankAnnotation.en);
    row.append(code, note);
    fullDetectorSource.appendChild(row);
  });
}

async function toggleCombinedRecognitionSource() {
  if (!fullSourceMeta || !fullDetectorSource) return;
  detectorSourceVisible = !detectorSourceVisible;
  fullDetectorSource.classList.toggle("hidden", !detectorSourceVisible);
  updateDetectorSourceUi();
  if (!detectorSourceVisible) return;
  fullSourceMeta.textContent = uiText("sourceLoading");
  try {
    const ready = await ensureExactStageCode();
    if (!ready || !combinedRecognitionCode) throw new Error("exact stage code is unavailable");
    renderDetectorSource(combinedRecognitionCode);
    updateDetectorSourceUi();
  } catch (error) {
    fullSourceMeta.textContent = `${uiText("sourceError")} ${error.message || error}`;
    detectorSourceVisible = false;
    fullDetectorSource.classList.add("hidden");
  }
}

function buildStageDiagram(labels, notes) {
  stageDiagram.innerHTML = "";
  labels.forEach((label, index) => {
    const node = document.createElement("div");
    node.className = "diagram-node";
    const title = document.createElement("strong");
    title.textContent = label;
    const note = document.createElement("p");
    note.textContent = notes[index] || "";
    node.append(title, note);
    stageDiagram.appendChild(node);
    if (index < labels.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "diagram-arrow";
      arrow.textContent = ">";
      stageDiagram.appendChild(arrow);
    }
  });
}

function detectorDiagramNotes(labels) {
  const lang = document.documentElement.lang || "en";
  return labels.map((label, index) => {
    if (lang === "ru") return `Шаг ${index + 1}: «${label}» — следующий конкретный объект или операция в этом этапе исходного кода.`;
    if (lang === "he") return `צעד ${index + 1}: „${label}” הוא האובייקט או הפעולה הממשיים הבאים בשלב זה של קוד המקור.`;
    return `Step ${index + 1}: “${label}” is the next concrete object or operation in this source-code stage.`;
  });
}

function renderStageDetail(index, shouldScroll = true) {
  const total = stageDetails.length;
  currentStageIndex = (index + total) % total;
  const data = stageDetails[currentStageIndex];
  stageDetailKicker.textContent = `${uiText("stageLabel")} ${data.level}`;
  stageDetailTitle.textContent = localized(data.title);
  stageDetailSummary.textContent = localized(data.summary);
  stageLayers.textContent = localized(data.layers);
  stageConnections.textContent = localized(data.connections);
  stageTensor.textContent = data.tensor;
  stageCudaShort.textContent = localized(data.cudaShort);
  stageCudaText.textContent = localized(data.cuda);
  renderStageCode(data);
  if (stageCodeMode === "full" && exactStageCodeState === "idle") {
    ensureExactStageCode().then(() => {
      if (currentStageIndex === index && stageCodeMode === "full") renderStageDetail(index, false);
    });
  }
  const diagramLabels = localized(data.diagram);
  buildStageDiagram(diagramLabels, detectorDiagramNotes(diagramLabels));
  stageDetail.classList.remove("hidden");
  document.querySelectorAll(".pipeline-step").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.stage) === currentStageIndex);
  });
  if (shouldScroll) stageDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideStageDetail() {
  if (!stageDetail) return;
  currentStageIndex = -1;
  stageDetail.classList.add("hidden");
  document.querySelectorAll(".pipeline-step").forEach((step) => step.classList.remove("active"));
}

function selectedMode() {
  return document.querySelector("input[name='computeMode']:checked")?.value || "GPU";
}

function renderPreviews(files) {
  previewGrid.innerHTML = "";
  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-preview";
    empty.textContent = translations[document.documentElement.lang]?.dropHint || translations.en.dropHint;
    previewGrid.appendChild(empty);
    return;
  }
  files.forEach((file) => {
    const card = document.createElement("article");
    card.className = "preview-card";
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    const name = document.createElement("span");
    name.textContent = file.name;
    card.append(img, name);
    previewGrid.appendChild(card);
  });
}

function parseSseData(text) {
  const lines = text.split(/\r?\n/);
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error("Detector did not return data.");
  return JSON.parse(dataLine.slice(6));
}

async function runRecognition(file, mode, score, margin) {
  if (!(await requireLocalBridge("send selected image(s) to the local face detector"))) {
    throw new Error("Local bridge was not approved for this recognition request.");
  }
  const endpoint = withLocalToken(`${LOCAL_HIVE_BASE}/api/detect?mode=${encodeURIComponent(mode)}&processor_id=0&source=github-pages-simple`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": file.type || "image/png", "Accept": "application/json", "X-Bee-Local-Token": LOCAL_BRIDGE_TOKEN },
    body: file
  });
  if (!response.ok) {
    throw new Error(`Local Hive detector failed: HTTP ${response.status}. Start the approved local Hive service on 127.0.0.1:8876.`);
  }
  const payload = await response.json();
  payload.requested_min_score = score;
  payload.requested_min_margin = margin;
  return { markdown: payload.identity || payload.best_label || uiText("unknown"), json: payload };
}

function renderResults(results) {
  resultList.innerHTML = "";
  const accepted = results.filter((item) => item.json?.accepted).length;
  summaryBox.textContent = `${results.length} ${uiText("processedImages")}. ${uiText("acceptedImages")}: ${accepted}.`;
  results.forEach((item) => {
    const row = document.createElement("article");
    row.className = `result-row ${item.json?.accepted ? "accepted" : "unknown"}`;
    const title = document.createElement("strong");
    title.textContent = `${item.file}: ${item.json?.identity || uiText("unknown")}`;
    const meta = document.createElement("span");
    const score = item.json?.best_score;
    const margin = item.json?.margin;
    meta.textContent = `${item.json?.mode || selectedMode()} | ${uiText("bestLabel")}: ${item.json?.best_label || "-"} | ${uiText("scoreValue")}: ${Number(score ?? 0).toFixed(6)} | ${uiText("marginValue")}: ${Number(margin ?? 0).toFixed(6)}`;
    row.append(title, meta);
    resultList.appendChild(row);
  });
  jsonBox.textContent = JSON.stringify(results.map((item) => item.json), null, 2);
}

function renderError(error) {
  summaryBox.textContent = error.message || String(error);
  resultList.innerHTML = "";
  jsonBox.textContent = JSON.stringify({ ok: false, error: error.message || String(error), backend: LOCAL_HIVE_BASE }, null, 2);
}

async function recognizeSelectedFiles() {
  const files = Array.from(imageInput.files || []);
  if (!files.length) {
    summaryBox.textContent = translations[document.documentElement.lang]?.dropHint || translations.en.dropHint;
    return;
  }
  const mode = selectedMode();
  const score = Number(scoreInput.value);
  const margin = Number(marginInput.value);
  recognizeButton.disabled = true;
  backendStatus.textContent = uiText("running");
  summaryBox.textContent = `${uiText("processing")} ${files.length} ${uiText("processedImages")} (${mode})…`;
  resultList.innerHTML = "";
  jsonBox.textContent = "{}";
  try {
    const results = [];
    for (const file of files) {
      summaryBox.textContent = `${uiText("processing")}: ${file.name} (${mode})…`;
      const result = await runRecognition(file, mode, score, margin);
      results.push({ file: file.name, ...result });
      renderResults(results);
    }
    backendStatus.textContent = uiText("ready");
  } catch (error) {
    backendStatus.textContent = uiText("error");
    renderError(error);
  } finally {
    recognizeButton.disabled = false;
  }
}

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.target));
});

document.querySelectorAll(".lang").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

detectorVariantButtons.forEach((button) => {
  button.addEventListener("click", () => selectDetectorVariant(button.dataset.detectorVariant));
});

document.querySelectorAll(".pipeline-step").forEach((step) => {
  const open = () => renderStageDetail(Number(step.dataset.stage || 0));
  step.addEventListener("click", open);
  step.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
});

stagePrev.addEventListener("click", () => renderStageDetail(currentStageIndex - 1));
stageNext.addEventListener("click", () => renderStageDetail(currentStageIndex + 1));
stageCodeModeButton?.addEventListener("click", () => {
  stageCodeMode = stageCodeMode === "full" ? "short" : "full";
  if (currentStageIndex >= 0) renderStageDetail(currentStageIndex, false);
});
loadFullDetectorSource?.addEventListener("click", toggleCombinedRecognitionSource);
stageReturnTop.addEventListener("click", () => {
  hideStageDetail();
  document.getElementById("howItWorksTitle").scrollIntoView({ behavior: "smooth", block: "start" });
});
stageReturnBottom.addEventListener("click", () => {
  hideStageDetail();
  document.getElementById("howItWorksTitle").scrollIntoView({ behavior: "smooth", block: "start" });
});

imageInput.addEventListener("change", () => renderPreviews(Array.from(imageInput.files || [])));
scoreInput.addEventListener("input", () => { scoreValue.textContent = Number(scoreInput.value).toFixed(2); });
marginInput.addEventListener("input", () => { marginValue.textContent = Number(marginInput.value).toFixed(3).replace(/0$/, ""); });
recognizeButton.addEventListener("click", recognizeSelectedFiles);

function applyDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace("#", "");
  const requestedVariant = params.get("detector_variant") || params.get("variant");
  if (requestedVariant && detectorVariantCatalog[requestedVariant]) {
    selectDetectorVariant(requestedVariant);
  }
  const requestedLang = params.get("lang");
  if (requestedLang && translations[requestedLang]) {
    setLanguage(requestedLang);
  }
  if (hash === "simple" || hash === "simple-demo" || params.get("view") === "simple") {
    showView("simple");
  }
  if (hash === "complex" || params.get("view") === "complex") {
    showView("complex");
  }
  const stage = params.get("stage");
  if (stage !== null) {
    const index = Math.max(0, Math.min(stageDetails.length - 1, Number(stage) || 0));
    showView("simple");
    stageCodeMode = params.get("code") === "full" ? "full" : "short";
    renderStageDetail(index, false);
  }
  if (params.get("source") === "detector") {
    showView("simple");
    toggleCombinedRecognitionSource();
  }
  if (params.get("source") === "notebook") {
    showView("simple");
    toggleCombinedRecognitionSource();
  }
}

setLanguage("en");
renderPreviews([]);
complexFrame = document.getElementById("complexFrame");
applyDeepLink();

async function renderComplexFrame() {
  if (!complexFrame) return;
  if (!document.getElementById("complex")?.classList.contains("active")) {
    renderLocalBridgePlaceholder("idle");
    return;
  }
  if (LOCAL_BRIDGE_ALLOWED && localBridgeUserConfirmed) {
    if (!IS_LOCAL_PORTAL) {
      window.location.href = localPortalReturnUrl();
      return;
    }
    complexFrame.removeAttribute("srcdoc");
    complexFrame.src = withLocalToken(LOCAL_HIVE_URL);
    return;
  }
  if (!IS_LOCAL_PORTAL) {
    renderLocalInstallPrompt("If the local project tools are already installed, approve the browser prompt to connect this public page to them. If they are not installed on this computer yet, download the needed package first.");
    if (!localBridgeApprovalRequested) {
      localBridgeApprovalRequested = true;
      window.setTimeout(() => {
        requestLocalBridgeApproval("open the original AI MIPS Hive Web interface");
      }, 100);
    }
    return;
  }
  const localStatus = await probeLocalHive();
  if (!localStatus?.ok) {
    renderLocalInstallPrompt("The local Hive bridge on 127.0.0.1:8876 is not running or this computer does not have the local project tools installed yet.");
    return;
  }
  renderLocalInstallPrompt("The local project tools are installed, but this browser session still needs approval before the page can connect to 127.0.0.1.");
  if (!localBridgeApprovalRequested) {
    localBridgeApprovalRequested = true;
    window.setTimeout(() => {
      requestLocalBridgeApproval("open the original AI MIPS Hive Web interface");
    }, 100);
  }
}

renderComplexFrame();
resetLocalBridgeIdleTimer();

["pointerdown", "keydown", "wheel", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, resetLocalBridgeIdleTimer, { passive: true });
});

window.addEventListener("message", (event) => {
  if (event.source !== complexFrame?.contentWindow) return;
  if (event.data?.type === "bee-local-bridge-restore") {
    requireLocalBridge("restore the local Hive iframe");
  }
});

document.querySelectorAll("[data-local-open]").forEach((node) => {
  node.addEventListener("click", async (event) => {
    event.preventDefault();
    const target = node.dataset.localOpen;
    if (IS_LOCAL_PORTAL) {
      const localStatus = await probeLocalHive();
      if (!localStatus?.ok) {
        showView("complex");
        renderLocalInstallPrompt("Local project tools are not running on this computer. Install the package first, then launch again from this page.");
        return;
      }
      if (target === "beeboard" && localStatus.beeboard && !localStatus.beeboard.installed) {
        renderLocalInstallPrompt("BeeBoard is not installed on this computer yet.");
        return;
      }
      if (target === "ursina" && localStatus.ursina && !localStatus.ursina.installed) {
        renderLocalInstallPrompt("Bgame is not installed on this computer yet.");
        return;
      }
    }
    if (!LOCAL_BRIDGE_ALLOWED) {
      if (!(await requireLocalBridge(`open ${node.textContent.trim()} on 127.0.0.1`))) {
        return;
      }
    }
    if (target === "hive") {
      node.href = withLocalToken(LOCAL_HIVE_URL);
    } else if (target === "beeboard") {
      node.href = withLocalToken(LOCAL_BEEBOARD_VIEWER_URL);
    } else if (target === "physical") {
      node.href = withLocalToken(`${LOCAL_HIVE_BASE}/physical-simulator`);
    } else if (target === "ursina") {
      node.href = withLocalToken(`${LOCAL_HIVE_BASE}/local-bgame?api=${encodeURIComponent(LOCAL_HIVE_BASE)}&processor_id=0`);
    }
    if (node.href && node.href !== "#") {
      window.open(node.href, "_blank", "noopener,noreferrer");
    }
  });
});
