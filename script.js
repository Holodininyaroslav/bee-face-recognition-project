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
    toolAttention: "CPU / OpenCL / CUDA course project",
    toolAttentionText: "Inspect the exact Scaled Dot-Product Attention source in six stages with line-specific English, Russian, and Hebrew explanations.",
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
  fullStageError: "Could not load the exact stage source."
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
const stageOnnxPanel = document.getElementById("stageOnnxPanel");
const stageOnnxTitle = document.getElementById("stageOnnxTitle");
const stageOnnxMeta = document.getElementById("stageOnnxMeta");
const stageOnnxLayers = document.getElementById("stageOnnxLayers");
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
const courseRequirementButtons = document.getElementById("courseRequirementButtons");
const courseRequirementsKicker = document.getElementById("courseRequirementsKicker");
const courseRequirementsTitle = document.getElementById("courseRequirementsTitle");
const courseRequirementsIntro = document.getElementById("courseRequirementsIntro");
const courseRequirementsSource = document.getElementById("courseRequirementsSource");
const attentionStageButtons = document.getElementById("attentionStageButtons");
const attentionStagesLabel = document.getElementById("attentionStagesLabel");
const courseRequirementListLabel = document.getElementById("courseRequirementListLabel");
const requirementProof = document.getElementById("requirementProof");
const requirementProofKicker = document.getElementById("requirementProofKicker");
const requirementProofTitle = document.getElementById("requirementProofTitle");
const requirementProofText = document.getElementById("requirementProofText");
const requirementProofStage = document.getElementById("requirementProofStage");
const requirementCode = document.getElementById("requirementCode");

const courseRequirements = [
  { key: "attention", stage: 2, step: 0, start: /__global__ void qk_matmul_basic/, end: /__global__ void attention_v_basic/, label: { en: "Scaled Dot-Product Attention", ru: "Scaled Dot-Product Attention", he: "Scaled Dot-Product Attention" }, text: { en: "The required formula is implemented as QK transpose, scaling, stable Softmax, then P times V.", ru: "Требуемая формула реализована как QK transpose, масштабирование, стабильный Softmax и затем P умножить на V.", he: "הנוסחה הנדרשת ממומשת כ-QK transpose, קנה מידה, Softmax יציב ולאחר מכן P כפול V." } },
  { key: "qk", stage: 2, step: 0, start: /__global__ void qk_matmul_basic/, wholeBlock: true, label: { en: "Q x K transpose", ru: "Q x K transpose", he: "Q x K transpose" }, text: { en: "One CUDA thread computes one score matrix element by accumulating d features.", ru: "Один CUDA-поток вычисляет один элемент матрицы оценок, суммируя d признаков.", he: "כל thread של CUDA מחשב איבר אחד במטריצת הציונים על ידי צבירת d מאפיינים." } },
  { key: "scale", stage: 2, step: 0, start: /__global__ void scale_scores/, wholeBlock: true, label: { en: "Scale 1 / sqrt(d)", ru: "Масштаб 1 / sqrt(d)", he: "קנה מידה 1 / sqrt(d)" }, text: { en: "The basic kernel scales scores separately; the optimized tiled QK kernel fuses the same scale.", ru: "Базовый вариант масштабирует оценки отдельным kernel; оптимизированный tiled QK объединяет ту же операцию.", he: "הגרסה הבסיסית מבצעת קנה מידה ב-kernel נפרד; QK המרוצף הממוטב ממזג את אותה הפעולה." } },
  { key: "softmax", stage: 2, step: 1, start: /__global__ void row_softmax/, end: /__global__ void attention_v_basic/, label: { en: "Stable Softmax", ru: "Численно стабильный Softmax", he: "Softmax יציב נומרית" }, text: { en: "Each row subtracts its maximum before exponentiation, then normalizes by the reduced sum.", ru: "Из каждой строки вычитается максимум до экспоненты, затем строка нормализуется по сумме.", he: "מכל שורה מחסרים את המקסימום לפני האקספוננטה, ולאחר מכן מנרמלים לפי הסכום." } },
  { key: "pv", stage: 2, step: 3, start: /__global__ void attention_v_basic/, end: /__global__ void qk_matmul_tiled_scaled/, label: { en: "P x V", ru: "P x V", he: "P x V" }, text: { en: "The probability matrix is multiplied by V to produce the attention output.", ru: "Матрица вероятностей умножается на V и формирует выход Attention.", he: "מטריצת ההסתברויות מוכפלת ב-V ומפיקה את פלט ה-Attention." } },
  { key: "shape", stage: 1, step: 3, start: /int n = 512;/, end: /int d = 64;/, label: { en: "N = 512, d = 64", ru: "Размеры N = 512, d = 64", he: "ממדים N = 512, d = 64" }, text: { en: "The CUDA executable defaults to the exact required sequence length and embedding dimension.", ru: "CUDA executable по умолчанию использует требуемую длину последовательности и размер embedding.", he: "קובץ ה-CUDA משתמש כברירת מחדל באורך הרצף ובממד embedding הנדרשים." } },
  { key: "cpu", stage: 5, step: 0, start: /std::vector<float> run_cpu_average\(/, wholeBlock: true, label: { en: "CPU reference", ru: "CPU-версия для сравнения", he: "גרסת CPU להשוואה" }, text: { en: "The sequential CPU implementation is executed as the correctness baseline for the CUDA results.", ru: "Последовательная CPU-реализация запускается как эталон корректности для CUDA-результатов.", he: "מימוש ה-CPU הסדרתי מופעל כקו בסיס לנכונות תוצאות ה-CUDA." } },
  { key: "variants", stage: 4, step: 8, start: /void launch_pipeline\(/, end: /struct CudaRunResult/, label: { en: "CUDA basic and optimized", ru: "CUDA basic и optimized", he: "CUDA basic ו-optimized" }, text: { en: "The dispatcher launches either basic kernels or tiled shared-memory optimized kernels.", ru: "Диспетчер запускает либо basic kernels, либо оптимизированные tiled kernels с shared memory.", he: "ה-dispatcher מפעיל kernels בסיסיים או kernels ממוטבים ומרוצפים עם shared memory." } },
  { key: "validate", stage: 5, step: 2, start: /const attention::ErrorStats error =/, end: /passed = passed && correct;/, label: { en: "CPU/GPU validation", ru: "Проверка CPU/GPU результатов", he: "אימות תוצאות CPU/GPU" }, text: { en: "The program compares CUDA output to the CPU reference and reports absolute and relative errors.", ru: "Программа сравнивает выход CUDA с CPU-эталоном и сообщает абсолютную и относительную ошибки.", he: "התוכנית משווה את פלט ה-CUDA לייחוס ה-CPU ומדווחת שגיאות מוחלטות ויחסיות." } },
  { key: "timing", stage: 5, step: 3, start: /cudaEvent_t start/, end: /result.end_to_end_milliseconds/, label: { en: "Timing and speedup", ru: "Замер времени и ускорение", he: "מדידת זמן והאצה" }, text: { en: "CUDA events measure kernel time, while end-to-end timing includes transfers; both are reported for comparison.", ru: "CUDA events измеряют время kernels, а end-to-end учитывает переносы; оба значения выводятся для сравнения.", he: "אירועי CUDA מודדים זמן kernels, ומדידת end-to-end כוללת העברות; שני הערכים מוצגים להשוואה." } },
  { key: "memory", stage: 4, step: 7, start: /CudaRunResult run_cuda\(/, end: /std::vector<float> run_cpu_average\(/, label: { en: "GPU memory transfers", ru: "Память GPU и Host-Device копии", he: "זיכרון GPU והעתקות Host-Device" }, text: { en: "Q, K, V, scores, and output have explicit device allocation, H2D copies, D2H readback, and cleanup.", ru: "Для Q, K, V, scores и output есть явное выделение device-памяти, H2D-копии, D2H-чтение и очистка.", he: "ל-Q, K, V, scores ול-output יש הקצאת זיכרון התקן מפורשת, העתקות H2D, קריאת D2H וניקוי." } },
  { key: "threads", stage: 4, step: 2, start: /__global__ void qk_matmul_basic/, end: /__global__ void scale_scores/, label: { en: "Thread mapping and bounds", ru: "Распараллеливание и boundary checks", he: "מיפוי threads ובדיקות גבול" }, text: { en: "2D blocks map rows and columns to score elements, with explicit bounds checks for partial tiles.", ru: "Двумерные блоки сопоставляют строки и столбцы элементам оценок, а boundary checks обрабатывают неполные tiles.", he: "בלוקים דו-ממדיים ממפים שורות ועמודות לאיברי ציונים, עם בדיקות גבול מפורשות עבור tiles חלקיים." } }
];
let activeCourseRequirement = "";
let activeAttentionStage = "";
let attentionCourseSource = "";
const finalAttentionSourceUrl = "https://raw.githubusercontent.com/Holodininyaroslav/bee-face-recognition-project/77c0dc8/source/attention/attention_cuda.cu";

const attentionStages = [
  { key: "shape", number: "01", label: { en: "Input dimensions", ru: "Размеры входа", he: "ממדי קלט" }, note: { en: "Required N = 512 and d = 64", ru: "Требуемые N = 512 и d = 64", he: "N = 512 ו-d = 64 הנדרשים" } },
  { key: "qk", number: "02", label: { en: "Q x K transpose", ru: "Q x K transpose", he: "Q x K transpose" }, note: { en: "One CUDA thread produces one score", ru: "Один CUDA-поток создаёт одну оценку", he: "כל thread CUDA מפיק ציון אחד" } },
  { key: "scale", number: "03", label: { en: "Scale scores", ru: "Масштабирование оценок", he: "קנה מידה לציונים" }, note: { en: "Multiply by 1 / sqrt(d)", ru: "Умножение на 1 / sqrt(d)", he: "כפל ב-1 / sqrt(d)" } },
  { key: "softmax", number: "04", label: { en: "Stable Softmax", ru: "Стабильный Softmax", he: "Softmax יציב" }, note: { en: "Max reduction, exp, normalization", ru: "Максимум, exp, нормализация", he: "הפחתת מקסימום, exp, נרמול" } },
  { key: "pv", number: "05", label: { en: "P x V output", ru: "Выход P x V", he: "פלט P x V" }, note: { en: "Probabilities form the output embedding", ru: "Вероятности формируют выходной embedding", he: "ההסתברויות יוצרות את embedding הפלט" } },
  { key: "variants", number: "06", label: { en: "CUDA pipeline launch", ru: "Запуск CUDA-конвейера", he: "הפעלת צינור CUDA" }, note: { en: "Basic or tiled optimized kernels", ru: "Basic или tiled optimized kernels", he: "kernels בסיסיים או מרוצפים ממוטבים" } }
];

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
let stageCodeMode = "full";
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
let activeStageFiveCodeStep = -1;

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
  toolAttention: "Курсовой проект CPU / OpenCL / CUDA",
  toolAttentionText: "Изучить точный исходник Scaled Dot-Product Attention по шести этапам с отдельными пояснениями каждой строки на английском, русском и иврите.",
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
  fullStageError: "Не удалось загрузить точный исходник этапа.",
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
  toolAttention: "פרויקט קורס CPU / OpenCL / CUDA",
  toolAttentionText: "עיון בקוד המקור המדויק של Scaled Dot-Product Attention בשישה שלבים, עם הסבר ייעודי לכל שורה באנגלית, ברוסית ובעברית.",
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
  fullStageError: "לא ניתן לטעון את קוד המקור המדויק של השלב."
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
    diagramNotes: {
      en: [
        "Loads Path, typing, NumPy and Pillow, then defines the three known identities, supported image extensions, and acceptance thresholds.",
        "Stores the working directory, identities and thresholds, and creates empty model, reference, PyTorch-module, and weight caches.",
        "_ensure_torch imports torch, nn and F only on first use; later calls return the three cached modules immediately.",
        "_device_name returns cuda only for an available CUDA runtime; an explicit CPU request returns cpu, and auto mode chooses the available backend."
      ],
      ru: [
        "Загружает Path, типы, NumPy и Pillow, затем задаёт трёх известных людей, допустимые расширения изображений и пороги принятия ответа.",
        "Сохраняет рабочую папку, список людей и пороги, а также создаёт пустые кэши моделей, эталонов, модулей PyTorch и весов.",
        "_ensure_torch импортирует torch, nn и F только при первом обращении; следующие вызовы сразу возвращают три сохранённых модуля.",
        "_device_name возвращает cuda только при рабочей CUDA; явный запрос CPU даёт cpu, а режим auto выбирает доступное устройство."
      ],
      he: [
        "טוען את Path, טיפוסים, NumPy ו-Pillow, ואז מגדיר את שלוש הזהויות הידועות, סיומות התמונה המותרות וספי קבלת התשובה.",
        "שומר את תיקיית העבודה, הזהויות והספים, ויוצר מטמונים ריקים למודלים, לייחוסים, למודולי PyTorch ולמשקלים.",
        "_ensure_torch מייבאת את torch,‏ nn ו-F רק בשימוש הראשון; הקריאות הבאות מחזירות מיד את שלושת המודולים השמורים.",
        "_device_name מחזירה cuda רק כאשר סביבת CUDA פעילה; בקשת CPU מפורשת מחזירה cpu ומצב auto בוחר את ההתקן הזמין."
      ]
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
    diagramNotes: {
      en: [
        "Reads models/deepid_weights.bin as raw bytes; a cached weight dictionary is returned instead when it was already decoded.",
        "Checks the DIDW1 file signature, reads every named float32 record, and reshapes it to the exact Conv1–Conv4 or FC11–FC12 tensor dimensions.",
        "Registers all decoded tensors as model buffers and defines the real convolution, pooling, two dense branches, ReLU, and 160D L2-normalized forward pass.",
        "Moves every registered buffer to the selected CPU/CUDA device, enables inference mode, and caches one ready model per device."
      ],
      ru: [
        "Читает models/deepid_weights.bin как байты; если веса уже разобраны, вместо повторного чтения возвращается сохранённый словарь.",
        "Проверяет сигнатуру DIDW1, читает каждую именованную запись float32 и придаёт ей точную форму тензора Conv1–Conv4 либо FC11–FC12.",
        "Регистрирует все тензоры как буферы модели и задаёт реальные свёртки, pooling, две полносвязные ветви, ReLU и нормализованный вектор 160D.",
        "Переносит все буферы на выбранное устройство CPU/CUDA, включает режим инференса и сохраняет отдельную готовую модель для каждого устройства."
      ],
      he: [
        "קורא את models/deepid_weights.bin כבייטים; אם המשקלים כבר פוענחו, מוחזר מילון המשקלים השמור במקום לקרוא שוב.",
        "מאמת את חתימת DIDW1, קורא כל רשומת float32 בעלת שם ומשנה אותה לממדי הטנזור המדויקים של Conv1–Conv4 או FC11–FC12.",
        "רושם את כל הטנזורים כמאגרי המודל ומגדיר את הקונבולוציות, ה-pooling, שני הענפים הצפופים, ReLU והפלט המנורמל בגודל 160D.",
        "מעביר את כל המאגרים להתקן CPU/CUDA שנבחר, מפעיל מצב הסקה ושומר במטמון מודל מוכן נפרד לכל התקן."
      ]
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
    diagramNotes: {
      en: [
        "Image.open reads the existing file and convert(\"RGB\") guarantees exactly three color channels.",
        "Keeps the full frame and adds centered square crops at 86%, 74%, 62%, 50%, and 40% of the shorter side when each crop is at least 60 pixels.",
        "Preserves aspect ratio while fitting the image inside 47×55 pixels, then centers it on a black 47×55 canvas.",
        "Divides pixel values by 255, changes RGB to BGR, transposes HWC to CHW, creates a PyTorch tensor, and transfers it to the selected device."
      ],
      ru: [
        "Image.open читает существующий файл, а convert(\"RGB\") гарантирует ровно три цветовых канала.",
        "Сохраняет полный кадр и добавляет центральные квадратные обрезки 86%, 74%, 62%, 50% и 40% короткой стороны, если размер не меньше 60 пикселей.",
        "Сохраняет пропорции при вписывании изображения в 47×55 и размещает его по центру чёрного холста размером 47×55.",
        "Делит значения пикселей на 255, меняет RGB на BGR, переставляет HWC в CHW, создаёт тензор PyTorch и переносит его на выбранное устройство."
      ],
      he: [
        "Image.open קוראת את הקובץ הקיים ו-convert(\"RGB\") מבטיחה בדיוק שלושה ערוצי צבע.",
        "שומרת את הפריים המלא ומוסיפה חיתוכים ריבועיים מרכזיים בגודל 86%,‏ 74%,‏ 62%,‏ 50% ו-40% מן הצלע הקצרה, אם החיתוך הוא לפחות 60 פיקסלים.",
        "שומרת על יחס הממדים בעת התאמת התמונה לתוך 47×55 פיקסלים וממרכזת אותה על קנבס שחור בגודל 47×55.",
        "מחלקת את ערכי הפיקסלים ב-255, משנה RGB ל-BGR, מסדרת HWC כ-CHW, יוצרת טנזור PyTorch ומעבירה אותו להתקן שנבחר."
      ]
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
      en: ["Reference folders", "Prepared tensors", "One stacked model call", "Cached reference matrix"],
      ru: ["Папки эталонов", "Подготовленные тензоры", "Один вызов со сложенным тензором", "Кэшированная матрица эталонов"],
      he: ["תיקיות ייחוס", "טנזורים מוכנים", "קריאת מודל אחת עם טנזור מוערם", "מטריצת ייחוס במטמון"]
    },
    diagramNotes: {
      en: [
        "For each known identity, searches both identity_references/<name> and Face_detector/references/<name>, filters supported images, and removes duplicate paths.",
        "Opens every reference image and applies the same 47×55 BGR/CHW preprocessing used for incoming screenshots.",
        "Stacks all one-time reference tensors into one N×3×55×47 tensor and runs one DeepID inference call without gradient tracking.",
        "Waits for CUDA completion when needed and stores the normalized N×160 reference matrix in self.ref_emb under the actual device name."
      ],
      ru: [
        "Для каждого известного человека проверяет identity_references/<имя> и Face_detector/references/<имя>, оставляет допустимые изображения и удаляет повторяющиеся пути.",
        "Открывает каждую эталонную фотографию и применяет ту же подготовку 47×55, BGR и CHW, что используется для входящих скриншотов.",
        "Складывает все одноразовые эталонные тензоры в один тензор N×3×55×47 и выполняет один вызов DeepID без расчёта градиентов.",
        "При необходимости ждёт завершения CUDA и сохраняет нормализованную матрицу эталонов N×160 в self.ref_emb под именем фактического устройства."
      ],
      he: [
        "לכל זהות ידועה בודק את identity_references/<name> ואת Face_detector/references/<name>, משאיר תמונות נתמכות ומסיר נתיבים כפולים.",
        "פותח כל תמונת ייחוס ומפעיל עליה את אותו עיבוד 47×55,‏ BGR ו-CHW שמשמש לצילומי המסך הנכנסים.",
        "מערים את כל טנזורי הייחוס החד־פעמיים לטנזור אחד בגודל N×3×55×47 ומבצע קריאת DeepID אחת ללא חישוב גרדיאנטים.",
        "ממתין להשלמת CUDA בעת הצורך ושומר את מטריצת הייחוס המנורמלת N×160 בתוך self.ref_emb תחת שם ההתקן בפועל."
      ]
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
          en: [
            "Screenshot variants: V×3×55×47",
            "Conv1 4×4 + ReLU",
            "MaxPool1 2×2",
            "Conv2 3×3 + ReLU",
            "MaxPool2 2×2",
            "Conv3 3×3 + ReLU",
            "MaxPool3 2×2",
            "Two DeepID branches",
            "Merge branches + ReLU",
            "L2 normalization: V×160",
            "Cosine-score matrix: V×N",
            "Best and runner-up",
            "Identity or Unknown"
          ],
          ru: [
            "Варианты скриншота: V×3×55×47",
            "Conv1 4×4 + ReLU",
            "MaxPool1 2×2",
            "Conv2 3×3 + ReLU",
            "MaxPool2 2×2",
            "Conv3 3×3 + ReLU",
            "MaxPool3 2×2",
            "Две ветви DeepID",
            "Сложение ветвей + ReLU",
            "L2-нормализация: V×160",
            "Матрица сходства: V×N",
            "Лучший и второй результат",
            "Имя или Unknown"
          ],
          he: [
            "גרסאות צילום המסך: V×3×55×47",
            "Conv1 4×4 + ReLU",
            "MaxPool1 2×2",
            "Conv2 3×3 + ReLU",
            "MaxPool2 2×2",
            "Conv3 3×3 + ReLU",
            "MaxPool3 2×2",
            "שני ענפי DeepID",
            "חיבור הענפים + ReLU",
            "נרמול L2: V×160",
            "מטריצת דמיון: V×N",
            "המקום הראשון והשני",
            "זהות או Unknown"
          ]
        },
        diagramNotes: {
          en: [
            "Stacks the full frame and centered crops from this one screenshot into a single tensor. V is the number of variants; each variant has 3 BGR channels, height 55 and width 47.",
            "Twenty learned 4×4 filters convolve the three input channels. Every negative convolution result becomes zero through ReLU, producing V×20×52×44 feature maps.",
            "For every channel, each non-overlapping 2×2 region is replaced by its maximum. The spatial size is halved to V×20×26×22; the 20 channels remain separate.",
            "Forty learned 3×3 filters combine all 20 incoming channels. ReLU removes negative responses, producing V×40×24×20 feature maps.",
            "A second 2×2 maximum pooling halves the spatial dimensions to V×40×12×10 without combining the 40 channels.",
            "Sixty learned 3×3 filters combine the 40 incoming channels. ReLU produces V×60×10×8 higher-level face-feature maps.",
            "The third 2×2 maximum pooling produces pool3 with shape V×60×5×4. This same tensor feeds two parallel DeepID branches.",
            "Branch A flattens pool3 to 1200 values and applies fc11: 1200→160. In parallel, branch B applies Conv4 with 80 learned 2×2 filters, yielding V×80×4×3, flattens 960 values and applies fc12: 960→160.",
            "Adds the two 160-value branch outputs element by element, then applies ReLU. Each screenshot variant now has one non-negative 160-value feature vector.",
            "Divides every 160-value vector by its Euclidean length. The resulting V×160 rows have L2 norm 1, so their dot products with normalized references are cosine similarities.",
            "Multiplies the V×160 variant matrix by the transposed N×160 reference matrix, producing one V×N cosine-similarity score for every variant/reference pair.",
            "Keeps each identity's highest score across all variants and its reference images, sorts the identities, and calculates the margin between first and second place.",
            "Returns the winning name only when its score and margin pass the thresholds; otherwise identity is Unknown. A valid scene hint is used only as a close-score tie-breaker."
          ],
          ru: [
            "Объединяет полный кадр и центральные обрезки одного скриншота в единый тензор. V — число вариантов; каждый вариант содержит 3 канала BGR, высоту 55 и ширину 47.",
            "Двадцать обученных фильтров 4×4 выполняют свёртку по трём входным каналам. ReLU заменяет каждый отрицательный результат свёртки нулём; получаются карты признаков V×20×52×44.",
            "В каждом канале каждый неперекрывающийся участок 2×2 заменяется своим максимальным значением. Пространственный размер уменьшается до V×20×26×22; 20 каналов остаются раздельными.",
            "Сорок обученных фильтров 3×3 объединяют информацию из всех 20 входных каналов. ReLU удаляет отрицательные отклики; получаются карты признаков V×40×24×20.",
            "Второй MaxPool 2×2 вдвое уменьшает пространственные размеры до V×40×12×10, не объединяя 40 каналов между собой.",
            "Шестьдесят обученных фильтров 3×3 объединяют 40 входных каналов. После ReLU получаются карты более сложных признаков лица V×60×10×8.",
            "Третий MaxPool 2×2 создаёт тензор pool3 размером V×60×5×4. Один и тот же pool3 поступает одновременно в две ветви DeepID.",
            "Ветвь A разворачивает pool3 в 1200 значений и применяет fc11: 1200→160. Параллельно ветвь B применяет Conv4 с 80 обученными фильтрами 2×2, получает V×80×4×3, разворачивает 960 значений и применяет fc12: 960→160.",
            "Два выхода по 160 значений складываются поэлементно, после чего применяется ReLU. Для каждого варианта скриншота получается один неотрицательный вектор из 160 признаков.",
            "Каждый вектор из 160 значений делится на свою евклидову длину. Строки итоговой матрицы V×160 имеют L2-норму 1, поэтому их скалярные произведения с нормализованными эталонами равны косинусному сходству.",
            "Матрица вариантов V×160 умножается на транспонированную матрицу N эталонов; получается V×N оценок косинусного сходства для каждой пары «вариант–эталон».",
            "Для каждого человека сохраняется максимальная оценка среди всех вариантов и его эталонных фотографий, затем личности сортируются и вычисляется отрыв первого места от второго.",
            "Имя победителя возвращается только при прохождении порогов оценки и отрыва; иначе identity равен Unknown. Допустимая подсказка сцены используется лишь при близких оценках."
          ],
          he: [
            "מערים את התמונה המלאה ואת החיתוכים המרכזיים של צילום מסך יחיד לטנזור אחד. V הוא מספר הגרסאות; בכל גרסה 3 ערוצי BGR, גובה 55 ורוחב 47.",
            "עשרים מסננים נלמדים בגודל 4×4 מבצעים קונבולוציה על שלושת ערוצי הקלט. ReLU מחליף כל תוצאה שלילית באפס ומפיק מפות תכונות בגודל V×20×52×44.",
            "בכל ערוץ, כל אזור 2×2 שאינו חופף מוחלף בערך המרבי שלו. הממדים המרחביים קטנים ל-V×20×26×22, בעוד 20 הערוצים נשארים נפרדים.",
            "ארבעים מסננים נלמדים בגודל 3×3 משלבים את כל 20 ערוצי הקלט. ReLU מאפס תגובות שליליות ומפיק מפות תכונות בגודל V×40×24×20.",
            "פעולת MaxPool שנייה בגודל 2×2 מחלקת את הממדים המרחביים בשניים ל-V×40×12×10, בלי לשלב בין 40 הערוצים.",
            "שישים מסננים נלמדים בגודל 3×3 משלבים את 40 ערוצי הקלט. לאחר ReLU מתקבלות מפות תווי פנים מורכבות יותר בגודל V×60×10×8.",
            "פעולת MaxPool שלישית בגודל 2×2 מפיקה את pool3 בגודל V×60×5×4. אותו טנזור מוזן במקביל לשני ענפי DeepID.",
            "ענף A משטח את pool3 ל-1200 ערכים ומפעיל fc11:‏ 1200→160. במקביל, ענף B מפעיל Conv4 עם 80 מסננים נלמדים בגודל 2×2, מפיק V×80×4×3, משטח 960 ערכים ומפעיל fc12:‏ 960→160.",
            "שני הפלטים בני 160 הערכים מחוברים איבר-איבר, ולאחר מכן מופעל ReLU. לכל גרסת צילום מסך מתקבל וקטור לא-שלילי אחד בן 160 תכונות.",
            "כל וקטור בן 160 ערכים מחולק באורך האוקלידי שלו. לשורות מטריצת V×160 המתקבלת יש נורמת L2 השווה ל-1, ולכן המכפלה הסקלרית שלהן בייחוסים מנורמלים היא דמיון קוסינוס.",
            "מטריצת הגרסאות V×160 מוכפלת במטריצת N הייחוסים המשוחלפת ומפיקה V×N ציוני דמיון קוסינוס, אחד לכל זוג של גרסה וייחוס.",
            "לכל זהות נשמר הציון הגבוה ביותר מכל הגרסאות ומתמונות הייחוס שלה; לאחר מכן הזהויות ממוינות ומחושב הפער בין המקום הראשון לשני.",
            "שם המנצח מוחזר רק אם הציון והפער עוברים את הספים; אחרת identity הוא Unknown. רמז סצנה תקף משמש רק לשבירת שוויון בין ציונים קרובים."
          ]
        },
        layers: { en: "Conv1–Conv3 with pooling; parallel fc11 and Conv4→fc12 branches; merge, ReLU and L2", ru: "Conv1–Conv3 с pooling; параллельные ветви fc11 и Conv4→fc12; сложение, ReLU и L2", he: "Conv1–Conv3 עם pooling; ענפי fc11 ו-Conv4→fc12 במקביל; חיבור, ReLU ו-L2" },
        connections: { en: "pool3 feeds fc11 and Conv4→fc12 in parallel; their 160D outputs are added", ru: "pool3 параллельно поступает в fc11 и Conv4→fc12; их выходы 160D складываются", he: "pool3 מוזן במקביל אל fc11 ואל Conv4→fc12; פלטי 160D שלהם מחוברים" },
        tensor: "V×3×55×47 → DeepID → V×160; V×160 @ 160×N → V×N",
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
        diagramNotes: {
          en: [
            "Receives one existing image path, the requested backend mode, and an optional scene hint.",
            "Creates the full-frame and centered crop variants before starting the measured recognition section.",
            "Starts the timer, prepares the crops from this one screenshot, ensures references are initialized, and computes every normalized embedding in one model call.",
            "Multiplies the embeddings by cached references and waits for queued CUDA work before calculating elapsed milliseconds.",
            "Passes variants, scores, device, timing, path, and hint to _decide, which returns the complete result dictionary."
          ],
          ru: [
            "Получает путь к одному существующему изображению, запрошенный режим устройства и необязательную подсказку сцены.",
            "Создаёт вариант полного кадра и центральные обрезки до начала измеряемой части распознавания.",
            "Запускает таймер, готовит обрезки одного скриншота, проверяет инициализацию эталонов и получает все нормализованные векторы одним вызовом модели.",
            "Умножает векторы на кэшированные эталоны и ждёт завершения очереди CUDA перед вычислением времени в миллисекундах.",
            "Передаёт варианты, оценки, устройство, время, путь и подсказку в _decide, который возвращает полный словарь результата."
          ],
          he: [
            "מקבלת נתיב לתמונה קיימת אחת, את מצב ההתקן המבוקש ורמז סצנה אופציונלי.",
            "יוצרת את גרסת הפריים המלא ואת החיתוכים המרכזיים לפני תחילת קטע הזיהוי הנמדד.",
            "מפעילה את השעון, מכינה את חיתוכי צילום המסך היחיד, מוודאת שהייחוסים אותחלו ומחשבת את כל הווקטורים המנורמלים בקריאת מודל אחת.",
            "מכפילה את הווקטורים בייחוסים שבמטמון וממתינה לעבודת CUDA שבתור לפני חישוב הזמן במילישניות.",
            "מעבירה את הגרסאות, הציונים, ההתקן, הזמן, הנתיב והרמז אל _decide, שמחזירה את מילון התוצאה המלא."
          ]
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
        diagramNotes: {
          en: [
            "The batch path reuses the same crop creation and 47×55 BGR/CHW tensor preparation as single-image recognition.",
            "Normalized embeddings are compared with the same cached N×160 reference matrix; the GPU branch computes one combined matrix for all variants.",
            "Each image receives only its own consecutive score rows, and _decide independently applies identity, score, margin, and hint rules to that slice.",
            "When mode is cpu, detect_batch explicitly calls detect_image once per path in sequence; this branch is not presented as parallel GPU work."
          ],
          ru: [
            "Пакетный путь повторно использует создание обрезок и подготовку тензора 47×55, BGR и CHW из одиночного распознавания.",
            "Нормализованные векторы сравниваются с той же кэшированной матрицей эталонов N×160; GPU-ветвь сразу вычисляет одну общую матрицу для всех вариантов.",
            "Каждое изображение получает только собственные последовательные строки оценок, а _decide независимо применяет к этому срезу правила имени, порогов, отрыва и подсказки.",
            "При mode=cpu detect_batch последовательно вызывает detect_image для каждого пути; эта ветвь не выдаётся за параллельную работу GPU."
          ],
          he: [
            "מסלול האצווה משתמש שוב ביצירת החיתוכים ובהכנת טנזור 47×55,‏ BGR ו-CHW של זיהוי תמונה בודדת.",
            "הווקטורים המנורמלים מושווים לאותה מטריצת ייחוס N×160 שבמטמון; ענף ה-GPU מחשב מטריצה משולבת אחת לכל הגרסאות.",
            "כל תמונה מקבלת רק את שורות הציונים הרציפות שלה, ו-_decide מפעילה בנפרד על הפרוסה את כללי הזהות, הציון, הפער והרמז.",
            "כאשר mode=cpu,‏ detect_batch קוראת ל-detect_image ברצף פעם אחת לכל נתיב; ענף זה אינו מוצג כעבודת GPU מקבילית."
          ]
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
        diagramNotes: {
          en: [
            "Converts every supplied path to Path and aligns one optional scene hint with each image.",
            "Creates all variants for every image and stores image_index with each variant so results can later return to the correct source file.",
            "Preprocesses every flattened variant and stacks them into one ΣV×3×55×47 tensor on the selected CUDA device.",
            "Runs model(x) once for the entire tensor and multiplies all ΣV embeddings by the cached reference matrix in one operation.",
            "Uses each image's variant count to slice its consecutive rows from sims_all, then calls _decide separately for that image.",
            "Aggregates accepted identities, counts and mean scores, chooses the batch identity, and returns per-image results plus total and average timing."
          ],
          ru: [
            "Преобразует каждый переданный путь в Path и сопоставляет каждому изображению одну необязательную подсказку сцены.",
            "Создаёт все варианты всех изображений и сохраняет image_index возле каждого варианта, чтобы позднее вернуть результат нужному исходному файлу.",
            "Подготавливает все объединённые варианты и складывает их в один тензор ΣV×3×55×47 на выбранном устройстве CUDA.",
            "Один раз вызывает model(x) для всего тензора и одной операцией умножает все ΣV векторов на кэшированную матрицу эталонов.",
            "По числу вариантов каждого изображения вырезает его последовательные строки из sims_all и отдельно вызывает _decide для этого изображения.",
            "Объединяет принятые имена, количества и средние оценки, выбирает итоговое имя пакета и возвращает результаты каждого файла с общим и средним временем."
          ],
          he: [
            "ממירה כל נתיב שהתקבל ל-Path ומתאימה לכל תמונה רמז סצנה אופציונלי אחד.",
            "יוצרת את כל הגרסאות של כל התמונות ושומרת image_index ליד כל גרסה, כדי להחזיר אחר כך את התוצאה לקובץ המקור הנכון.",
            "מעבדת את כל הגרסאות המאוחדות ומערימה אותן לטנזור אחד ΣV×3×55×47 על התקן CUDA שנבחר.",
            "קוראת ל-model(x) פעם אחת עבור הטנזור כולו ומכפילה בפעולה אחת את כל וקטורי ΣV במטריצת הייחוס שבמטמון.",
            "משתמשת במספר הגרסאות של כל תמונה כדי לחתוך את השורות הרציפות שלה מתוך sims_all, ואז קוראת ל-_decide בנפרד עבור אותה תמונה.",
            "מאחדת זהויות שהתקבלו, ספירות וציונים ממוצעים, בוחרת את זהות האצווה ומחזירה תוצאות לכל תמונה יחד עם זמן כולל וממוצע."
          ]
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

// The simple demonstration sends exactly one screenshot through the current
// NVIDIA path. Each stage below is an exact block from the compiled native
// worker that the local Hive invokes for that one-image CUDA request.
const currentRuntimeStageSources = [
  { path: "source/native_face_cuda/src/sface_engine.cpp", fromMatch: "^struct NativeSFaceEngine::Impl", toMatch: "^    EmbeddingBatch embed_images" },
  { path: "source/native_face_cuda/src/sface_engine.cpp", fromMatch: "^PreparedBatch prepare_detection_batch", toMatch: "^std::vector<float> align_faces" },
  { path: "source/native_face_cuda/src/sface_engine.cpp", fromMatch: "^    EmbeddingBatch embed_images", toMatch: "^        auto aligned = align_faces" },
  { path: "source/native_face_cuda/src/sface_engine.cpp", fromMatch: "^std::vector<float> align_faces", toMatch: "^struct NativeSFaceEngine::Impl" },
  { path: "source/native_face_cuda/src/sface_manual_cuda.cu", fromMatch: "^#include \"sface_manual_cuda\\.hpp\"", to: null },
  { path: "source/native_face_cuda/src/sface_cuda.cu", fromMatch: "^#include <cuda_runtime.h>", to: null },
  { path: "source/native_face_cuda/src/sface_engine.cpp", fromMatch: "^    std::vector<SFaceResult> recognize", toMatch: "^NativeSFaceEngine::NativeSFaceEngine" }
];

const currentRuntimeStages = [
  {
    level: "01",
    title: { en: "Runtime contract and one-time initialization", ru: "Контракт среды и одноразовая инициализация", he: "חוזה סביבת הריצה ואתחול חד־פעמי" },
    summary: {
      en: "Defines the image, embedding, match-result, DeepID model, and reference-matcher interfaces shared by the real CPU and OpenCL implementations.",
      ru: "Определяет структуры изображения, вектора признаков и результата, а также интерфейсы DeepID и сопоставления с эталонами, общие для реальных реализаций CPU и OpenCL.",
      he: "מגדיר את מבני התמונה, וקטור המאפיינים ותוצאת ההתאמה, וכן את ממשקי DeepID והייחוסים המשותפים למימושי CPU ו‑OpenCL האמיתיים."
    },
    diagram: { en: ["Image contract", "DeepID model", "Reference bank", "Match result"], ru: ["Контракт изображения", "Модель DeepID", "Банк эталонов", "Результат"], he: ["חוזה תמונה", "מודל DeepID", "מאגר ייחוסים", "תוצאה"] },
    diagramNotes: {
      en: ["Image stores width, height and RGBA bytes.", "DeepIDModel exposes one-image and batch embedding methods and reports its actual backend.", "FaceMatcher owns the trained model and cached reference embeddings.", "MatchResult carries accepted identity, best score, runner-up, margin and timing."],
      ru: ["Image хранит ширину, высоту и RGBA-байты.", "DeepIDModel предоставляет одиночное и пакетное получение векторов и сообщает фактический backend.", "FaceMatcher владеет обученной моделью и кэшированными векторами эталонов.", "MatchResult содержит принятое имя, лучший результат, второе место, отрыв и время."],
      he: ["Image שומר רוחב, גובה ובתי RGBA.", "DeepIDModel מספק הפקת embedding יחידה ובאצווה ומדווח על ה‑backend בפועל.", "FaceMatcher מחזיק את המודל המאומן ואת embeddings הייחוס שבמטמון.", "MatchResult מכיל זהות שאושרה, ציון מיטבי, מקום שני, פער וזמן."]
    },
    layers: { en: "Interfaces only; no inference yet", ru: "Только интерфейсы; инференса ещё нет", he: "ממשקים בלבד; עדיין אין הסקה" },
    connections: { en: "No MAC operations", ru: "Операций MAC нет", he: "אין פעולות MAC" },
    tensor: "Image RGBA → embedding 160D → MatchResult",
    cudaShort: { en: "Declares CPU/OpenCL backend-neutral interfaces", ru: "Объявляет общий интерфейс для CPU/OpenCL", he: "מגדיר ממשק משותף ל‑CPU/OpenCL" },
    cuda: { en: "This header does not pretend to run GPU work. It defines the contract implemented by the CPU engine and the separate native OpenCL engine.", ru: "Этот заголовок не выдаёт CPU за GPU: он только задаёт контракт, который отдельно реализуют CPU-движок и нативный OpenCL-движок.", he: "קובץ הכותרת אינו מציג עבודת CPU כ‑GPU; הוא מגדיר חוזה שממומש בנפרד במנוע CPU ובמנוע OpenCL מקורי." },
    code: "DeepIDModel model(weights);\nFaceMatcher matcher(weights, references, threshold);\nMatchResult result = matcher.match(image);"
  },
  {
    level: "02",
    title: { en: "Weights, image variants, and CPU DeepID primitives", ru: "Веса, варианты изображения и CPU-примитивы DeepID", he: "משקלים, וריאציות תמונה ופעולות DeepID ב‑CPU" },
    summary: { en: "Loads the trained DIDW1 tensors, validates their shapes, prepares resized/cropped inputs, and defines the exact convolution, pooling, dense, ReLU, and normalization operations for the CPU path.", ru: "Загружает обученные тензоры DIDW1, проверяет их формы, готовит масштабированные и обрезанные входы и задаёт точные операции свёртки, pooling, dense, ReLU и нормализации для CPU-пути.", he: "טוען את טנזורי DIDW1 המאומנים, מאמת את הממדים, מכין קלטים חתוכים ומותאמים ומגדיר convolution, pooling, dense, ReLU ונרמול מדויקים למסלול CPU." },
    diagram: { en: ["DIDW1 weights", "Crop / resize", "Conv + pool", "Dense + L2"], ru: ["Веса DIDW1", "Обрезка / размер", "Свёртка + pooling", "Dense + L2"], he: ["משקלי DIDW1", "חיתוך / שינוי גודל", "Conv + pooling", "Dense + L2"] },
    diagramNotes: {
      en: ["Reads every named float32 tensor only after checking the binary signature and dimensions.", "Converts RGBA input to the 55×47×3 layout expected by the trained network.", "Implements the four convolutional blocks and max-pooling used by DeepID.", "Combines the dense branches and L2-normalizes the final 160-value embedding."],
      ru: ["Читает каждый именованный float32-тензор только после проверки сигнатуры и размеров бинарного файла.", "Преобразует RGBA-вход к компоновке 55×47×3, ожидаемой обученной сетью.", "Реализует четыре свёрточных блока и max-pooling сети DeepID.", "Объединяет полносвязные ветви и L2-нормализует итоговый вектор из 160 значений."],
      he: ["קורא כל טנזור float32 בעל שם רק אחרי אימות חתימת הקובץ והממדים.", "ממיר קלט RGBA למבנה 55×47×3 שהרשת המאומנת מצפה לו.", "מממש ארבעה בלוקי convolution ו‑max-pooling של DeepID.", "משלב את הענפים הצפופים ומבצע נרמול L2 ל‑embedding בן 160 ערכים."]
    },
    layers: { en: "Conv1–Conv4, three max pools, FC11/FC12, ReLU, L2", ru: "Conv1–Conv4, три max-pooling, FC11/FC12, ReLU, L2", he: "Conv1–Conv4, שלושה max-pool, ‏FC11/FC12, ‏ReLU, ‏L2" },
    connections: { en: "Exact trained DIDW1 convolution and dense parameters", ru: "Точные обученные параметры DIDW1 для conv и dense", he: "פרמטרי convolution ו‑dense מאומנים ומדויקים של DIDW1" },
    tensor: "RGBA → 55×47×3 float → intermediate feature maps",
    cudaShort: { en: "CPU implementation and shared preprocessing", ru: "CPU-реализация и общая предобработка", he: "מימוש CPU ועיבוד מקדים משותף" },
    cuda: { en: "In CPU mode these loops perform the neural arithmetic on the processor. GPU mode uses the same weights and input layout but dispatches the corresponding operations through the OpenCL kernels in stage 4.", ru: "В режиме CPU эти циклы выполняют нейросетевую арифметику на процессоре. Режим GPU использует те же веса и формат входа, но запускает соответствующие операции через OpenCL-ядра этапа 4.", he: "במצב CPU הלולאות מבצעות את החשבון העצבי במעבד. מצב GPU משתמש באותם משקלים ובאותו מבנה קלט, אך משגר את הפעולות המקבילות דרך kernels של OpenCL בשלב 4." },
    code: "auto weights = load_weights(weights_path);\nauto input = preprocess(image);\n// CPU primitives define the reference arithmetic."
  },
  {
    level: "03",
    title: { en: "Embeddings, cached references, and identity decision", ru: "Векторы, кэш эталонов и решение о личности", he: "Embeddings, מטמון ייחוסים והחלטת זהות" },
    summary: { en: "Runs single or batched embedding, initializes reference vectors once, compares cosine scores per person, and applies the best-score and margin decision rules.", ru: "Выполняет одиночное или пакетное извлечение векторов, один раз инициализирует эталоны, сравнивает косинусные оценки по людям и применяет пороги лучшего результата и отрыва.", he: "מריץ embedding יחיד או באצווה, מאתחל פעם אחת את וקטורי הייחוס, משווה ציוני cosine לכל אדם ומחיל את ספי הציון והפער." },
    diagram: { en: ["Input batch", "160D embeddings", "Cached references", "Score + margin"], ru: ["Пакет входов", "Векторы 160D", "Кэш эталонов", "Оценка + отрыв"], he: ["אצוות קלט", "Embeddings 160D", "ייחוסים במטמון", "ציון + פער"] },
    diagramNotes: {
      en: ["embed_batch keeps all requested images together when the backend supports a native batch.", "Each image becomes one normalized 160D DeepID vector.", "Reference photos are embedded at warm-up and reused instead of recomputed for every request.", "Cosine similarities are reduced per identity; acceptance requires both the configured score and margin."],
      ru: ["embed_batch сохраняет все запрошенные изображения одним пакетом, если backend поддерживает нативную пачку.", "Каждое изображение превращается в один нормализованный вектор DeepID размером 160D.", "Эталонные фотографии векторизуются при прогреве и повторно используются без пересчёта на каждом запросе.", "Косинусные сходства сводятся по каждому человеку; для принятия нужны и заданная оценка, и отрыв."],
      he: ["embed_batch שומר את כל התמונות המבוקשות באצווה אחת כאשר ה‑backend תומך באצווה מקורית.", "כל תמונה הופכת לוקטור DeepID מנורמל בגודל 160D.", "תמונות הייחוס עוברות embedding בחימום ונעשה בהן שימוש חוזר ללא חישוב מחדש בכל בקשה.", "ציוני cosine מצטמצמים לכל זהות; אישור דורש גם ציון וגם פער מעל הספים."]
    },
    layers: { en: "DeepID forward plus cosine reduction and decision logic", ru: "Проход DeepID, косинусная свёртка и логика решения", he: "מעבר DeepID, צמצום cosine ולוגיקת החלטה" },
    connections: { en: "V×160 embeddings compared with N×160 references", ru: "Векторы V×160 сравниваются с эталонами N×160", he: "Embeddings ‏V×160 מושווים לייחוסים N×160" },
    tensor: "B×55×47×3 → B×160 → B×N scores",
    cudaShort: { en: "Shared decision logic; backend reports CPU or OpenCL", ru: "Общая логика решения; backend сообщает CPU или OpenCL", he: "לוגיקת החלטה משותפת; ה‑backend מדווח CPU או OpenCL" },
    cuda: { en: "The selected backend returns embeddings; this stage performs identical identity scoring rules so CPU and OpenCL results are comparable. It does not relabel CPU work as GPU work.", ru: "Выбранный backend возвращает векторы; этап применяет одинаковые правила оценки личности, поэтому результаты CPU и OpenCL сопоставимы. CPU-работа здесь не выдаётся за GPU.", he: "ה‑backend שנבחר מחזיר embeddings; השלב מחיל כללי זיהוי זהים כדי שתוצאות CPU ו‑OpenCL יהיו בנות השוואה. עבודת CPU אינה מסומנת כ‑GPU." },
    code: "auto embeddings = model_.embed_batch(images);\nreload_references();\nreturn best_score >= min_score && margin >= min_margin;"
  },
  {
    level: "04",
    title: { en: "Native OpenCL GPU kernels and true tensor batch", ru: "Нативные OpenCL-ядра GPU и настоящая тензорная пачка", he: "Kernels מקוריים של OpenCL ואצוות טנזורים אמיתית" },
    summary: { en: "Selects a real GPU OpenCL device, creates device buffers, compiles custom kernels for convolution, pooling, dense, add/ReLU, and normalization, and processes the entire requested tensor batch in one OpenCL execution path.", ru: "Выбирает реальное GPU-устройство OpenCL, создаёт буферы видеокарты, компилирует собственные ядра свёртки, pooling, dense, add/ReLU и нормализации и обрабатывает всю запрошенную пачку тензоров одним OpenCL-путём.", he: "בוחר התקן GPU אמיתי של OpenCL, יוצר מאגרי התקן, מהדר kernels מותאמים ל‑convolution, pooling, dense, add/ReLU ונרמול ומעבד את כל אצוות הטנזורים במסלול OpenCL אחד." },
    diagram: { en: ["Select GPU device", "Upload batch + weights", "Kernel chain", "Read B×160"], ru: ["Выбор GPU", "Загрузка пачки и весов", "Цепочка ядер", "Чтение B×160"], he: ["בחירת GPU", "העלאת אצווה ומשקלים", "שרשרת kernels", "קריאת B×160"] },
    diagramNotes: {
      en: ["Enumerates OpenCL platforms and accepts a GPU device; failure is reported instead of silently using CPU.", "Creates OpenCL buffers for all batch inputs and trained tensors.", "Dispatches the custom conv_relu, max_pool, dense, add_relu and normalization kernels over batch-aware global ranges.", "Waits for the command queue and copies the complete B×160 result back once."],
      ru: ["Перебирает OpenCL-платформы и принимает GPU-устройство; при его отсутствии сообщает ошибку вместо скрытого CPU.", "Создаёт OpenCL-буферы для всей пачки входов и обученных тензоров.", "Запускает собственные ядра conv_relu, max_pool, dense, add_relu и нормализации с глобальными диапазонами, учитывающими размер пачки.", "Дожидается очереди команд и один раз копирует полный результат B×160 обратно."],
      he: ["סורק פלטפורמות OpenCL ומקבל התקן GPU; בהיעדרו מדווחת שגיאה במקום מעבר נסתר ל‑CPU.", "יוצר מאגרי OpenCL לכל קלטי האצווה ולטנזורים המאומנים.", "משגר kernels מותאמים של conv_relu, max_pool, dense, add_relu ונרמול בטווחים הכוללים את ממד האצווה.", "ממתין לתור הפקודות ומעתיק פעם אחת את כל תוצאת B×160 חזרה."]
    },
    layers: { en: "Custom OpenCL conv, pool, dense, add/ReLU and L2 kernels", ru: "Собственные OpenCL-ядра conv, pool, dense, add/ReLU и L2", he: "Kernels מותאמים של OpenCL ל‑conv, pool, dense, add/ReLU ו‑L2" },
    connections: { en: "Parallel work-items cover batch, channels, pixels and neurons", ru: "Параллельные work-item охватывают пачку, каналы, пиксели и нейроны", he: "Work-items מקבילים מכסים אצווה, ערוצים, פיקסלים ונוירונים" },
    tensor: "B×3×55×47 on host → OpenCL buffers → B×160",
    cudaShort: { en: "Actual GPU backend: OpenCL, not CUDA and not CPU", ru: "Фактический GPU-backend: OpenCL, не CUDA и не CPU", he: "ה‑backend בפועל של GPU הוא OpenCL, לא CUDA ולא CPU" },
    cuda: { en: "On this AMD computer GPU means native OpenCL. The code explicitly requests CL_DEVICE_TYPE_GPU and reports the selected platform/device. CUDA is a separate NVIDIA build and is not claimed here.", ru: "На этом компьютере AMD режим GPU означает нативный OpenCL. Код явно запрашивает CL_DEVICE_TYPE_GPU и сообщает выбранную платформу и устройство. CUDA — отдельная сборка для NVIDIA и здесь не заявляется.", he: "במחשב AMD הזה מצב GPU פירושו OpenCL מקורי. הקוד מבקש במפורש CL_DEVICE_TYPE_GPU ומדווח את הפלטפורמה וההתקן. CUDA היא בנייה נפרדת ל‑NVIDIA ואינה נטענת כאן." },
    code: "clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, ...);\nrun_deepid_opencl_forward_batch(inputs, batch_size, weights, ...);"
  },
  {
    level: "05",
    title: { en: "Persistent worker, references, single and batch requests", ru: "Постоянный worker, эталоны, одиночные и пакетные запросы", he: "Worker קבוע, ייחוסים, בקשות יחידות ואצווה" },
    summary: { en: "Warms the model and all reference embeddings once, keeps the detector process alive, accepts distinct single or batch commands, and returns honest backend/timing fields as JSON.", ru: "Один раз прогревает модель и все векторы эталонов, сохраняет процесс детектора живым, принимает разные команды single и batch и возвращает честные поля backend и времени в JSON.", he: "מחמם פעם אחת את המודל ואת כל embeddings הייחוס, משאיר את תהליך הגלאי חי, מקבל פקודות נפרדות single ו‑batch ומחזיר שדות backend וזמן אמינים ב‑JSON." },
    diagram: { en: ["Start worker", "Warm references", "single | batch", "JSON results"], ru: ["Запуск worker", "Прогрев эталонов", "single | batch", "JSON-результаты"], he: ["הפעלת worker", "חימום ייחוסים", "single | batch", "תוצאות JSON"] },
    diagramNotes: {
      en: ["Constructs IdentityDetector once instead of launching a new neural runtime per photo.", "Embeds every Adi, Faraj and Slava reference during initialization and caches the vectors.", "The line protocol preserves a single image as one request and a list as one real batch request.", "Returns each decision plus backend, initialization, recognition and per-photo timing."],
      ru: ["Один раз создаёт IdentityDetector вместо запуска новой нейросетевой среды для каждой фотографии.", "При инициализации получает векторы всех эталонов Ади, Фараджа и Славы и сохраняет их в кэше.", "Строчный протокол оставляет одно изображение одиночным запросом, а список передаёт как один настоящий пакетный запрос.", "Возвращает каждое решение вместе с backend, временем инициализации, распознавания и временем на фото."],
      he: ["יוצר IdentityDetector פעם אחת במקום להפעיל סביבת רשת חדשה לכל תמונה.", "באתחול מפיק embeddings לכל ייחוסי עדי, פראג' וסלאבה ושומר אותם במטמון.", "הפרוטוקול שומר תמונה יחידה כבקשה אחת ורשימה כבקשת אצווה אמיתית אחת.", "מחזיר כל החלטה יחד עם backend וזמני אתחול, זיהוי ותמונה."]
    },
    layers: { en: "Persistent orchestration around the DeepID model", ru: "Постоянная оркестрация вокруг модели DeepID", he: "תזמור קבוע סביב מודל DeepID" },
    connections: { en: "One model batch for all images in a GPU batch request", ru: "Один пакетный проход модели для всех изображений GPU-запроса", he: "מעבר אצווה אחד של המודל לכל תמונות בקשת GPU" },
    tensor: "single: V×input; batch: ΣV×input → per-image results",
    cudaShort: { en: "Separate single and batch protocol paths", ru: "Раздельные протокольные пути single и batch", he: "מסלולי פרוטוקול נפרדים ל‑single ול‑batch" },
    cuda: { en: "The batch command calls embed_batch once for the accumulated images. It is not a browser loop that merely labels serial CPU calls as a GPU batch.", ru: "Команда batch один раз вызывает embed_batch для накопленных изображений. Это не браузерный цикл, который выдаёт последовательные CPU-вызовы за GPU-пачку.", he: "פקודת batch קוראת ל‑embed_batch פעם אחת עבור התמונות שנאספו. זו אינה לולאת דפדפן שמסמנת קריאות CPU סדרתיות כאצוות GPU." },
    code: "single<TAB>image<TAB>hint\nbatch<TAB>image1|image2|...<TAB>hint1|hint2|..."
  },
  {
    level: "06",
    title: { en: "YuNet/SFace accuracy verification and final Hive answer", ru: "Проверка точности YuNet/SFace и итоговый ответ Hive", he: "אימות דיוק YuNet/SFace ותשובת Hive סופית" },
    summary: { en: "Detects and aligns a real face with YuNet landmarks, compares an SFace embedding with cached references, and supplies the accuracy decision used by Hive; the simple demo requests a separate verified identity for every file in a batch.", ru: "Находит и выравнивает реальное лицо по ориентирам YuNet, сравнивает SFace-вектор с кэшированными эталонами и выдаёт точное решение для Hive; простая демонстрация запрашивает отдельно проверенное имя для каждого файла пачки.", he: "מזהה ומיישר פנים אמיתיות לפי נקודות YuNet, משווה embedding של SFace לייחוסים שבמטמון ומספק את החלטת הדיוק ל‑Hive; ההדגמה הפשוטה מבקשת זהות מאומתת נפרדת לכל קובץ באצווה." },
    diagram: { en: ["YuNet face + landmarks", "SFace alignment", "Cached references", "Hive accepted/Unknown"], ru: ["Лицо и ориентиры YuNet", "Выравнивание SFace", "Кэш эталонов", "Hive: имя/Unknown"], he: ["פנים ונקודות YuNet", "יישור SFace", "ייחוסים במטמון", "Hive: זהות/Unknown"] },
    diagramNotes: {
      en: ["YuNet returns the face box and five landmarks instead of relying on a center crop alone.", "SFace aligns the crop from those landmarks and produces a stable identity embedding.", "Reference embeddings are cached by file signature and reused across requests.", "Hive combines the real OpenCL DeepID batch with explicit per-image CPU verification for the simple demo and reports both parts in the backend string."],
      ru: ["YuNet возвращает рамку лица и пять ориентиров вместо одной центральной обрезки.", "SFace выравнивает обрезку по этим ориентирам и создаёт устойчивый вектор личности.", "Векторы эталонов кэшируются по сигнатуре файлов и повторно используются между запросами.", "Для простой демонстрации Hive объединяет настоящую OpenCL-пачку DeepID с явной CPU-проверкой каждого изображения и указывает обе части в строке backend."],
      he: ["YuNet מחזיר תיבת פנים וחמש נקודות ציון במקום להסתמך רק על חיתוך מרכזי.", "SFace מיישר את החיתוך לפי הנקודות ומפיק embedding יציב לזהות.", "Embeddings הייחוס נשמרים לפי חתימת הקבצים ונעשה בהם שימוש חוזר בין בקשות.", "בהדגמה הפשוטה Hive משלב את אצוות OpenCL DeepID האמיתית עם אימות CPU מפורש לכל תמונה ומדווח את שני החלקים במחרוזת ה‑backend."]
    },
    layers: { en: "YuNet detector + SFace embedding + threshold/consensus", ru: "Детектор YuNet + SFace-вектор + пороги/консенсус", he: "גלאי YuNet + ‏embedding של SFace + ספים/קונצנזוס" },
    connections: { en: "CPU verifier is explicit; OpenCL DeepID remains a separate GPU result", ru: "CPU-проверка указана явно; OpenCL DeepID остаётся отдельным GPU-результатом", he: "מאמת ה‑CPU מפורש; OpenCL DeepID נשאר תוצאת GPU נפרדת" },
    tensor: "face landmarks → aligned SFace embedding → score/margin → JSON",
    cudaShort: { en: "GPU backend string names OpenCL + CPU verifier honestly", ru: "Строка GPU-backend честно указывает OpenCL и CPU-проверку", he: "מחרוזת ה‑backend מציינת ביושר OpenCL ומאמת CPU" },
    cuda: { en: "The current AMD result is intentionally hybrid: OpenCL executes DeepID on the GPU, while the accuracy guard runs YuNet/SFace on CPU. CPU mode runs YuNet/SFace only. The JSON backend states this explicitly.", ru: "Текущий результат на AMD намеренно гибридный: OpenCL выполняет DeepID на GPU, а проверка точности YuNet/SFace работает на CPU. Режим CPU запускает только YuNet/SFace. Поле backend в JSON указывает это прямо.", he: "התוצאה הנוכחית ב‑AMD היברידית בכוונה: OpenCL מריץ DeepID ב‑GPU, בעוד בדיקת הדיוק YuNet/SFace רצה ב‑CPU. מצב CPU מריץ רק YuNet/SFace. שדה backend ב‑JSON מציין זאת במפורש." },
    code: "face = yunet.detect(image)\naligned = sface.alignCrop(image, face)\nidentity = verifier.recognize(image_path)"
  }
];

const singleCudaStages = [
  {
    level: "01",
    title: { en: "Loading YuNet/SFace models, weights, and CUDA sessions", ru: "Загрузка моделей и весов YuNet/SFace и создание CUDA-сессий", he: "טעינת מודלי ומשקלי YuNet/SFace ויצירת סשני CUDA" },
    summary: {
      en: "Reads the YuNet and SFace ONNX files, loads their graphs and trained weights, creates and validates CUDAExecutionProvider sessions, then places the cached reference vectors in GPU memory.",
      ru: "Читает ONNX-файлы YuNet и SFace, загружает их графы и обученные веса, создаёт и проверяет сессии CUDAExecutionProvider, а затем размещает кэшированные эталонные векторы в памяти GPU.",
      he: "קורא את קובצי ה-ONNX של YuNet ו-SFace, טוען את הגרפים והמשקלים המאומנים, יוצר ומאמת סשנים של CUDAExecutionProvider ולאחר מכן מציב את וקטורי הייחוס השמורים בזיכרון ה-GPU."
    },
    diagram: {
      en: ["Locate both ONNX files", "Load SFace graph and weights", "Create SFace CUDA session", "Load YuNet graph and weights", "Create YuNet CUDA session", "Copy references to CUDA"],
      ru: ["Найти оба ONNX-файла", "Загрузить граф и веса SFace", "Создать CUDA-сессию SFace", "Загрузить граф и веса YuNet", "Создать CUDA-сессию YuNet", "Перенести эталоны в CUDA"],
      he: ["איתור שני קובצי ה-ONNX", "טעינת גרף ומשקלי SFace", "יצירת סשן CUDA ל-SFace", "טעינת גרף ומשקלי YuNet", "יצירת סשן CUDA ל-YuNet", "העברת הייחוסים ל-CUDA"]
    },
    diagramNotes: {
      en: ["Builds the exact YuNet and SFace paths and stops immediately if either trained .onnx file is missing.", "onnx.load reads the SFace graph and its trained initializer tensors; the code removes initializer-only graph inputs and prepares a dynamic batch dimension.", "InferenceSession consumes the serialized SFace model, initializes CUDAExecutionProvider resources, and rejects a silent CPU fallback.", "onnx.load reads the YuNet graph and trained initializers; the code adjusts reshape constants and dynamic input/output dimensions required by this CUDA path.", "InferenceSession consumes the serialized YuNet model, initializes its CUDA provider and memory arena, and verifies that CUDA is first.", "After the reference photos have been embedded, torch.as_tensor places each identity's normalized reference matrix in CUDA memory for later comparisons."],
      ru: ["Формирует точные пути к YuNet и SFace и сразу останавливается, если отсутствует хотя бы один обученный файл .onnx.", "onnx.load читает граф SFace и тензоры его обученных параметров; затем код удаляет initializer-only входы графа и задаёт динамический размер пачки.", "InferenceSession принимает сериализованную модель SFace, инициализирует ресурсы CUDAExecutionProvider и запрещает незаметный переход на CPU.", "onnx.load читает граф YuNet и обученные параметры; затем код исправляет константы reshape и динамические размеры входов/выходов для этого CUDA-пути.", "InferenceSession принимает сериализованную модель YuNet, инициализирует CUDA-provider и его арену памяти и проверяет, что CUDA стоит первой.", "После получения векторов эталонных фотографий torch.as_tensor размещает нормализованную матрицу эталонов каждой личности в памяти CUDA для последующих сравнений."],
      he: ["בונה את הנתיבים המדויקים של YuNet ושל SFace ועוצר מיד אם חסר אחד מקובצי ה-.onnx המאומנים.", "onnx.load קורא את גרף SFace ואת טנזורי הפרמטרים המאומנים שלו; לאחר מכן הקוד מסיר קלטי גרף שהם initializer בלבד ומגדיר ממד אצווה דינמי.", "InferenceSession מקבל את מודל SFace המסוריאל, מאתחל משאבים של CUDAExecutionProvider ומונע מעבר שקט ל-CPU.", "onnx.load קורא את גרף YuNet ואת הפרמטרים המאומנים; לאחר מכן הקוד מתאים קבועי reshape וממדים דינמיים של קלט ופלט למסלול CUDA זה.", "InferenceSession מקבל את מודל YuNet המסוריאל, מאתחל את ספק CUDA ואת זירת הזיכרון שלו ומוודא ש-CUDA ראשון.", "לאחר הפקת embeddings מתמונות הייחוס, torch.as_tensor מציב בזיכרון CUDA את מטריצת הייחוס המנורמלת של כל זהות לצורך ההשוואות הבאות."]
    },
    layers: { en: "YuNet ONNX + SFace ONNX initialization", ru: "Инициализация YuNet ONNX + SFace ONNX", he: "אתחול YuNet ONNX ו-SFace ONNX" },
    connections: { en: "No screenshot inference yet", ru: "Инференс снимка ещё не выполняется", he: "עדיין אין הסקה של צילום המסך" },
    tensor: "cached reference vectors → CUDA memory",
    cudaShort: { en: "CUDA provider is mandatory; no silent CPU fallback", ru: "CUDA обязательна; скрытого перехода на CPU нет", he: "CUDA נדרשת; אין מעבר שקט ל-CPU" },
    cuda: { en: "CPU may build or read the reference cache at service startup, but the request-time reference matrix is copied to CUDA once. Both model sessions must report CUDAExecutionProvider before recognition is accepted.", ru: "CPU может создать или прочитать кэш эталонов при запуске сервиса, но рабочая матрица эталонов один раз переносится в CUDA. До распознавания обе сессии обязаны сообщить CUDAExecutionProvider.", he: "ה-CPU עשוי ליצור או לקרוא את מטמון הייחוס בעת הפעלת השירות, אך מטריצת הייחוס הפעילה מועברת פעם אחת ל-CUDA. לפני הזיהוי שני הסשנים חייבים לדווח על CUDAExecutionProvider." },
    code: `verifier = SFaceIdentityVerifier(reference_root, labels, model_root, device="cuda")
assert verifier.cuda_yunet_session.get_providers()[0] == "CUDAExecutionProvider"
assert verifier.cuda_session.get_providers()[0] == "CUDAExecutionProvider"`
  },
  {
    level: "02",
    title: { en: "One screenshot: decode, upload, resize", ru: "Один снимок: декодирование, загрузка, размер", he: "צילום מסך אחד: פענוח, העלאה ושינוי גודל" },
    summary: {
      en: "Decodes exactly one PNG/JPEG on the CPU, uploads it once, and performs color conversion, scaling, normalization, resize, and padding as CUDA tensor operations.",
      ru: "Декодирует ровно один PNG/JPEG на CPU, один раз загружает его на GPU, а преобразование цвета, масштабирование, нормализацию, resize и padding выполняет CUDA-тензорами.",
      he: "מפענח PNG/JPEG יחיד ב-CPU, מעלה אותו פעם אחת ל-GPU ומבצע המרת צבע, נרמול, שינוי גודל וריפוד כפעולות טנזור CUDA."
    },
    diagram: { en: ["Decoded image input", "Calculate target size", "One CUDA upload", "GPU resize + pad"], ru: ["Входное декодированное изображение", "Расчёт целевого размера", "Одна загрузка CUDA", "GPU resize + padding"], he: ["קלט תמונה מפוענחת", "חישוב גודל היעד", "העלאה אחת ל-CUDA", "שינוי גודל וריפוד ב-GPU"] },
    diagramNotes: {
      en: ["Receives the already decoded NumPy image from verify_batch; compressed-file decoding occurs immediately before this exact function.", "Reads height and width and calculates a maximum-side-192 target without enlarging small images.", "torch.from_numpy(...).to(device='cuda') performs the only full-image host-to-device transfer.", "CUDA reorders the tensor, resizes when needed, pads to multiples of 32, stacks it, and returns a contiguous batch."],
      ru: ["Получает уже декодированное NumPy-изображение от verify_batch; декодирование сжатого файла выполняется непосредственно перед этой точной функцией.", "Читает высоту и ширину и вычисляет целевой размер с максимальной стороной 192 без увеличения маленьких изображений.", "torch.from_numpy(...).to(device='cuda') выполняет единственный полный перенос изображения из RAM в видеопамять.", "CUDA переставляет оси тензора, при необходимости меняет размер, дополняет стороны до кратных 32, собирает пачку и возвращает contiguous-тензор."],
      he: ["מקבל מ-verify_batch תמונת NumPy שכבר פוענחה; פענוח הקובץ הדחוס מתבצע מיד לפני הפונקציה המדויקת הזאת.", "קורא גובה ורוחב ומחשב גודל יעד עם צלע מרבית 192 בלי להגדיל תמונות קטנות.", "torch.from_numpy(...).to(device='cuda') מבצע את ההעברה המלאה היחידה מ-RAM לזיכרון הכרטיס.", "CUDA מסדר מחדש את צירי הטנזור, משנה גודל בעת הצורך, מרפד לכפולות של 32, עורם ומחזיר טנזור רציף."]
    },
    layers: { en: "CUDA interpolation, normalization, and padding", ru: "CUDA-интерполяция, нормализация и padding", he: "אינטרפולציה, נרמול וריפוד ב-CUDA" },
    connections: { en: "One screenshot; no batch expansion", ru: "Один снимок; без размножения в пачку", he: "צילום מסך אחד; ללא הרחבה לאצווה" },
    tensor: "H×W×3 uint8 → CUDA 1×3×H'×W' float32",
    cudaShort: { en: "Only compressed-file decoding remains on CPU", ru: "На CPU остаётся только декодирование сжатого файла", he: "רק פענוח הקובץ הדחוס נשאר ב-CPU" },
    cuda: { en: "The claim 'full CUDA pipeline' begins after cv2.imread. The screenshot is uploaded once; all image preparation after that point stays on the GPU.", ru: "Формулировка «полный CUDA-конвейер» начинается после cv2.imread. Снимок загружается один раз, и вся дальнейшая подготовка изображения остаётся на GPU.", he: "המונח 'צינור CUDA מלא' מתחיל לאחר cv2.imread. צילום המסך מועלה פעם אחת וכל הכנת התמונה לאחר מכן נשארת ב-GPU." },
    code: `image = cv2.imread(str(screenshot_path), cv2.IMREAD_COLOR)
detection_tensor, content_size = verifier._prepare_cuda_detection_batch([image], max_side=192, precision="fp32")`
  },
  {
    level: "03",
    title: { en: "YuNet face and landmarks on CUDA", ru: "Лицо и ориентиры YuNet на CUDA", he: "פנים ונקודות ציון של YuNet ב-CUDA" },
    summary: {
      en: "Runs YuNet through ONNX Runtime CUDA and decodes its bounding box and five landmarks directly from GPU tensors for the single screenshot.",
      ru: "Запускает YuNet через ONNX Runtime CUDA и прямо в GPU-тензорах декодирует рамку лица и пять ориентиров единственного снимка.",
      he: "מריץ את YuNet דרך ONNX Runtime CUDA ומפענח ישירות בטנזורי GPU את תיבת הפנים ואת חמש נקודות הציון של צילום המסך היחיד."
    },
    diagram: { en: ["CUDA image", "YuNet CUDA", "GPU decode", "Best face + 5 points"], ru: ["CUDA-изображение", "YuNet CUDA", "GPU-декодирование", "Лучшее лицо + 5 точек"], he: ["תמונת CUDA", "YuNet CUDA", "פענוח ב-GPU", "הפנים הטובות + 5 נקודות"] },
    diagramNotes: {
      en: ["The prepared float32 tensor remains in CUDA memory.", "ONNX Runtime receives the tensor through I/O binding and writes every YuNet output to CUDA memory.", "Torch CUDA operations decode confidence, boxes, and landmarks without converting the intermediate arrays to NumPy.", "For the one screenshot, the largest face nearest the expected center is selected and marked valid only above the confidence threshold."],
      ru: ["Подготовленный float32-тензор остаётся в памяти CUDA.", "ONNX Runtime получает его через I/O binding и записывает все выходы YuNet в память CUDA.", "Операции Torch CUDA декодируют confidence, рамки и ориентиры без преобразования промежуточных массивов в NumPy.", "Для единственного снимка выбирается крупное лицо возле ожидаемого центра; оно считается допустимым только после прохождения порога confidence."],
      he: ["טנזור float32 המוכן נשאר בזיכרון CUDA.", "ONNX Runtime מקבל אותו באמצעות I/O binding וכותב את כל פלטי YuNet לזיכרון CUDA.", "פעולות Torch CUDA מפענחות confidence, תיבות ונקודות ציון ללא המרת מערכי הביניים ל-NumPy.", "עבור צילום המסך היחיד נבחרות הפנים הגדולות ליד המרכז הצפוי, ורק ציון מעל הסף מסמן אותן כתקפות."]
    },
    layers: { en: "YuNet detector plus CUDA post-processing", ru: "Детектор YuNet и CUDA-постобработка", he: "גלאי YuNet ועיבוד המשך ב-CUDA" },
    connections: { en: "One detector inference for one screenshot", ru: "Один инференс детектора для одного снимка", he: "הסקת גלאי אחת לצילום מסך אחד" },
    tensor: "1×3×H'×W' → boxes + confidence + 5 landmarks",
    cudaShort: { en: "Detection and landmark decoding never return to CPU", ru: "Детекция и декодирование ориентиров не возвращаются на CPU", he: "הזיהוי ופענוח נקודות הציון אינם חוזרים ל-CPU" },
    cuda: { en: "I/O binding avoids a device-to-host copy between YuNet and post-processing. The decoded face row and validity mask remain CUDA tensors for alignment.", ru: "I/O binding исключает копирование GPU→CPU между YuNet и постобработкой. Декодированная строка лица и маска допустимости остаются CUDA-тензорами для выравнивания.", he: "I/O binding מונע העתקה מן ה-GPU למארח בין YuNet לעיבוד ההמשך. שורת הפנים המפוענחת ומסכת התקפות נשארות טנזורי CUDA לצורך היישור." },
    code: `yunet_outputs = verifier._run_ort_cuda(verifier.cuda_yunet_session, detection_tensor, YUNET_OUTPUT_NAMES)
face, valid = verifier._decode_yunet_faces_cuda(yunet_outputs, width, height, content_size, readable)`
  },
  {
    level: "04",
    title: { en: "Five-landmark alignment on CUDA", ru: "Выравнивание по пяти точкам на CUDA", he: "יישור לפי חמש נקודות ב-CUDA" },
    summary: {
      en: "Builds the facial similarity transform from the five YuNet landmarks and creates the aligned 112×112 SFace crop with CUDA grid_sample.",
      ru: "Строит similarity-преобразование по пяти ориентирам YuNet и создаёт выровненную область SFace 112×112 через CUDA grid_sample.",
      he: "בונה טרנספורמציית דמיון מחמש נקודות YuNet ויוצר חיתוך SFace מיושר בגודל 112×112 באמצעות CUDA grid_sample."
    },
    diagram: { en: ["5 landmarks", "Similarity transform", "CUDA sampling grid", "112×112 face"], ru: ["5 ориентиров", "Similarity transform", "CUDA-сетка выборки", "Лицо 112×112"], he: ["5 נקודות ציון", "טרנספורמציית דמיון", "רשת דגימה ב-CUDA", "פנים 112×112"] },
    diagramNotes: {
      en: ["Reads the ten landmark coordinates from the selected YuNet face tensor.", "Solves scale, rotation, and translation against the canonical SFace landmark template entirely with torch operations on CUDA.", "Converts the inverse transform into normalized grid coordinates.", "grid_sample crops and aligns the face without copying the source screenshot back to the CPU."],
      ru: ["Берёт десять координат ориентиров из выбранного GPU-тензора лица YuNet.", "Полностью операциями torch на CUDA вычисляет масштаб, поворот и перенос к эталонному шаблону SFace.", "Преобразует обратную матрицу в нормализованные координаты сетки.", "grid_sample вырезает и выравнивает лицо без возврата исходного снимка на CPU."],
      he: ["קורא את עשר הקואורדינטות של נקודות הציון מטנזור הפנים שנבחר על ידי YuNet.", "מחשב קנה מידה, סיבוב והזזה אל תבנית SFace הקנונית באמצעות פעולות torch ב-CUDA בלבד.", "ממיר את הטרנספורמציה ההפוכה לקואורדינטות רשת מנורמלות.", "grid_sample חותך ומיישר את הפנים ללא העתקת צילום המסך בחזרה ל-CPU."]
    },
    layers: { en: "CUDA linear algebra + grid_sample", ru: "Линейная алгебра CUDA + grid_sample", he: "אלגברה ליניארית ב-CUDA ו-grid_sample" },
    connections: { en: "One face transform, one aligned crop", ru: "Одно преобразование лица, одна выровненная область", he: "טרנספורמציית פנים אחת וחיתוך מיושר אחד" },
    tensor: "landmarks 1×5×2 + image → CUDA 1×3×112×112",
    cudaShort: { en: "No cv2.alignCrop and no CPU crop", ru: "Без cv2.alignCrop и без CPU-обрезки", he: "ללא cv2.alignCrop וללא חיתוך ב-CPU" },
    cuda: { en: "This is the important change from the old demo: alignment and crop are now GPU tensor operations, so the detector output flows directly into SFace.", ru: "Это ключевое отличие от старой демонстрации: выравнивание и обрезка теперь являются GPU-тензорными операциями, поэтому выход детектора сразу поступает в SFace.", he: "זהו השינוי החשוב לעומת ההדגמה הישנה: היישור והחיתוך הם כעת פעולות טנזור GPU, ולכן פלט הגלאי עובר ישירות ל-SFace." },
    code: `aligned_face = verifier._align_faces_cuda(detection_tensor, face, valid)
assert aligned_face.shape == (1, 3, 112, 112)`
  },
  {
    level: "05",
    title: { en: "Inside SFace: 92 ONNX layers to the 128D face vector", ru: "Внутри SFace: 92 слоя ONNX до вектора лица 128D", he: "בתוך SFace: ‏92 שכבות ONNX עד לווקטור פנים 128D" },
    summary: {
      en: "Shows only the neural-network part: the real 92-node SFace ONNX inference from the aligned 112×112 face to one 128D embedding. Reference comparison is now entirely stage 06.",
      ru: "Показывает только нейросетевую часть: реальный проход по 92 узлам SFace ONNX от выровненного лица 112×112 до одного вектора 128D. Сравнение с эталонами полностью перенесено в этап 06.",
      he: "מציג רק את חלק הרשת: מעבר אמיתי דרך 92 צומתי SFace ONNX, מפנים מיושרות 112×112 ועד embedding יחיד בגודל 128. ההשוואה לייחוסים הועברה במלואה לשלב 06."
    },
    diagram: {
      en: ["Input normalization", "Conv1 stem", "Conv2 depthwise + pointwise", "Conv3 downsample", "Conv4 feature block", "Conv5 downsample", "Conv6 feature block", "Conv7 downsample", "Conv8 feature block", "Conv9 feature block", "Conv10 feature block", "Conv11 feature block", "Conv12 feature block", "Conv13 downsample", "Conv14 final convolution", "128D embedding head"],
      ru: ["Нормализация входа", "Начальный Conv1", "Conv2: depthwise + pointwise", "Conv3: уменьшение", "Conv4: блок признаков", "Conv5: уменьшение", "Conv6: блок признаков", "Conv7: уменьшение", "Conv8: блок признаков", "Conv9: блок признаков", "Conv10: блок признаков", "Conv11: блок признаков", "Conv12: блок признаков", "Conv13: уменьшение", "Conv14: финальная свёртка", "Голова вектора 128D"],
      he: ["נרמול הקלט", "שכבת הפתיחה Conv1", "Conv2: עומק ונקודה", "Conv3: הקטנת רזולוציה", "Conv4: בלוק מאפיינים", "Conv5: הקטנת רזולוציה", "Conv6: בלוק מאפיינים", "Conv7: הקטנת רזולוציה", "Conv8: בלוק מאפיינים", "Conv9: בלוק מאפיינים", "Conv10: בלוק מאפיינים", "Conv11: בלוק מאפיינים", "Conv12: בלוק מאפיינים", "Conv13: הקטנת רזולוציה", "Conv14: קונבולוציה סופית", "ראש embedding בגודל 128"]
    },
    diagramNotes: {
      en: ["ONNX layers 1–4 subtract and multiply constants to scale the 112×112 RGB tensor.", "Layers 5–7 apply a 3→32 convolution, batch normalization, and PReLU without changing spatial size.", "Layers 8–13 apply 32-channel depthwise convolution and a 32→64 pointwise convolution, each followed by BN and PReLU.", "Layers 14–19 use a strided depthwise convolution to change 64×112×112 into 128×56×56.", "Layers 20–25 refine 128 channels at 56×56 with depthwise and pointwise convolutions.", "Layers 26–31 reduce 128×56×56 to 256×28×28.", "Layers 32–37 refine 256 channels at 28×28.", "Layers 38–43 reduce 256×28×28 to 512×14×14.", "Layers 44–49 refine 512 channels at 14×14.", "Layers 50–55 perform the next depthwise/pointwise feature transformation at 14×14.", "Layers 56–61 perform another 512-channel feature transformation at 14×14.", "Layers 62–67 perform another 512-channel feature transformation at 14×14.", "Layers 68–73 perform the last 512-channel block before the final reduction.", "Layers 74–79 reduce 512×14×14 to 1024×7×7.", "Layers 80–85 refine the final 1024 feature maps at 7×7.", "Layers 86–92 apply BN, Dropout, Flatten, a 50176→128 Gemm, final BN, and Identity to produce the face vector."],
      ru: ["Слои ONNX 1–4 вычитают и умножают константы, масштабируя RGB-тензор 112×112.", "Слои 5–7 выполняют свёртку 3→32, batch normalization и PReLU без изменения пространственного размера.", "Слои 8–13 выполняют depthwise-свёртку 32 каналов и pointwise-свёртку 32→64; после каждой идут BN и PReLU.", "Слои 14–19 уменьшают тензор 64×112×112 до 128×56×56 с помощью depthwise-свёртки с шагом.", "Слои 20–25 обрабатывают 128 каналов при размере 56×56 с помощью depthwise- и pointwise-свёрток.", "Слои 26–31 уменьшают 128×56×56 до 256×28×28.", "Слои 32–37 обрабатывают 256 каналов при размере 28×28.", "Слои 38–43 уменьшают 256×28×28 до 512×14×14.", "Слои 44–49 обрабатывают 512 каналов при размере 14×14.", "Слои 50–55 выполняют следующее depthwise/pointwise-преобразование признаков 14×14.", "Слои 56–61 выполняют ещё одно преобразование 512 каналов при размере 14×14.", "Слои 62–67 выполняют ещё одно преобразование 512 каналов при размере 14×14.", "Слои 68–73 выполняют последний 512-канальный блок перед финальным уменьшением.", "Слои 74–79 уменьшают 512×14×14 до 1024×7×7.", "Слои 80–85 обрабатывают финальные 1024 карты признаков при размере 7×7.", "Слои 86–92 выполняют BN, Dropout, Flatten, Gemm 50176→128, финальный BN и Identity, создавая вектор лица."],
      he: ["שכבות ONNX ‏1–4 מחסרות ומכפילות קבועים כדי לנרמל את טנזור ה-RGB בגודל 112×112.", "שכבות 5–7 מבצעות קונבולוציה 3→32, נרמול אצווה ו-PReLU ללא שינוי הגודל המרחבי.", "שכבות 8–13 מבצעות קונבולוציית depthwise ב-32 ערוצים וקונבולוציית pointwise ‏32→64, ולאחר כל אחת BN ו-PReLU.", "שכבות 14–19 מקטינות 64×112×112 ל-128×56×56 באמצעות קונבולוציית depthwise עם stride.", "שכבות 20–25 מעבדות 128 ערוצים בגודל 56×56 באמצעות קונבולוציות depthwise ו-pointwise.", "שכבות 26–31 מקטינות 128×56×56 ל-256×28×28.", "שכבות 32–37 מעבדות 256 ערוצים בגודל 28×28.", "שכבות 38–43 מקטינות 256×28×28 ל-512×14×14.", "שכבות 44–49 מעבדות 512 ערוצים בגודל 14×14.", "שכבות 50–55 מבצעות טרנספורמציית depthwise/pointwise נוספת בגודל 14×14.", "שכבות 56–61 מבצעות טרנספורמציה נוספת של 512 ערוצים בגודל 14×14.", "שכבות 62–67 מבצעות טרנספורמציה נוספת של 512 ערוצים בגודל 14×14.", "שכבות 68–73 מבצעות את בלוק 512 הערוצים האחרון לפני ההקטנה הסופית.", "שכבות 74–79 מקטינות 512×14×14 ל-1024×7×7.", "שכבות 80–85 מעבדות את 1024 מפות המאפיינים הסופיות בגודל 7×7.", "שכבות 86–92 מבצעות BN, ‏Dropout, ‏Flatten, ‏Gemm ‏50176→128, ‏BN סופי ו-Identity ליצירת וקטור הפנים."]
    },
    layers: { en: "92 ONNX layers: 27 Conv, 29 BatchNorm, 27 PReLU, and a 128D head", ru: "92 слоя ONNX: 27 Conv, 29 BatchNorm, 27 PReLU и голова 128D", he: "92 שכבות ONNX: ‏27 Conv, ‏29 BatchNorm, ‏27 PReLU וראש 128D" },
    connections: { en: "Sequential depthwise/pointwise convolution chain ending at 1×128", ru: "Последовательная цепочка depthwise/pointwise-свёрток, заканчивающаяся формой 1×128", he: "שרשרת קונבולוציות depthwise/pointwise שמסתיימת בצורה 1×128" },
    tensor: "1×3×112×112 → 32×112×112 → 128×56×56 → 256×28×28 → 512×14×14 → 1024×7×7 → 50176 → 128",
    cudaShort: { en: "All 92 SFace layers execute through CUDAExecutionProvider", ru: "Все 92 слоя SFace выполняются через CUDAExecutionProvider", he: "כל 92 שכבות SFace רצות דרך CUDAExecutionProvider" },
    cuda: { en: "Open the complete stage to see all 92 deserialized ONNX nodes. Clicking a block highlights its ONNX range; clicking an individual Conv, PReLU, BatchNorm, Flatten, or Gemm row highlights that exact node. No reference-scoring Python is included in stage 05.", ru: "Откройте полный этап, чтобы увидеть все 92 десериализованных узла ONNX. Нажатие на блок выделяет диапазон ONNX, а на отдельную строку Conv, PReLU, BatchNorm, Flatten или Gemm — конкретный узел. Python-код сравнения с эталонами в этап 05 больше не входит.", he: "פתחו את השלב המלא כדי לראות את כל 92 צומתי ONNX שעברו deserialization. לחיצה על בלוק מדגישה את טווח ONNX, ולחיצה על שורת Conv, PReLU, BatchNorm, Flatten או Gemm מדגישה צומת יחיד. קוד Python להשוואה לייחוסים אינו חלק עוד משלב 05." },
    code: `embedding = verifier._run_ort_cuda(verifier.cuda_session, aligned_face)[0]
assert embedding.shape == (1, 128)`
  },
  {
    level: "06",
    title: { en: "Reference-vector comparison and one identity result", ru: "Сравнение с векторами эталонов и результат личности", he: "השוואה לווקטורי ייחוס ותוצאת זהות" },
    summary: {
      en: "L2-normalizes the 128D SFace vector, compares it with every cached reference matrix on CUDA, selects the best reference per identity, ranks the identities, and returns the best label, runner-up, margin, matched reference, and timings.",
      ru: "L2-нормализует 128D-вектор SFace, сравнивает его со всеми кэшированными матрицами эталонов на CUDA, выбирает лучший эталон каждой личности, ранжирует личности и возвращает лучшее имя, второе место, отрыв, совпавший эталон и время.",
      he: "מבצע נרמול L2 לווקטור SFace בגודל 128, משווה אותו לכל מטריצות הייחוס השמורות ב-CUDA, בוחר את הייחוס הטוב לכל זהות, מדרג את הזהויות ומחזיר תווית מובילה, מקום שני, פער, ייחוס תואם וזמנים."
    },
    diagram: {
      en: ["Receive SFace vectors", "L2-normalize 128D", "Loop through identities", "Matrix multiply with references", "Best reference per identity", "Stack score/index matrices", "Call scorer after SFace", "Copy final small matrices to CPU", "Rank identities", "Build identity result", "Return JSON and timings"],
      ru: ["Получить векторы SFace", "L2-нормализация 128D", "Перебор личностей", "Умножение на матрицы эталонов", "Лучший эталон каждой личности", "Сборка матриц оценок/индексов", "Вызов сравнения после SFace", "Перенос малых итоговых матриц на CPU", "Ранжирование личностей", "Сборка результата личности", "Возврат JSON и времени"],
      he: ["קבלת וקטורי SFace", "נרמול L2 של 128D", "מעבר על הזהויות", "כפל במטריצות הייחוס", "הייחוס הטוב לכל זהות", "הרכבת מטריצות ציונים ואינדקסים", "קריאת ההשוואה לאחר SFace", "העברת המטריצות הסופיות הקטנות ל-CPU", "דירוג הזהויות", "בניית תוצאת הזהות", "החזרת JSON וזמנים"]
    },
    diagramNotes: {
      en: ["Receives the 1×128 vector produced by stage 05 and accesses the cached reference matrices.", "Converts the vector to float and makes its L2 length equal to one, so dot products become cosine similarities.", "Processes Adi, Faraj and Slava independently using the corresponding N×128 reference matrix.", "Computes 1×128 @ 128×N, producing one similarity value for every reference image of the current identity.", "max(dim=1) keeps the highest score and its reference index for each identity.", "Stacks the three identities into compact score and matching-index matrices returned to the caller.", "verify_batch invokes the scoring function immediately after the SFace CUDA session produces vectors.", "Only the final compact scores, indices and valid flags are copied to host memory; convolution intermediates stay on CUDA.", "Builds the score dictionary, sorts it, and names the best and runner-up identities.", "Records the best label, score, runner-up, margin and exact matched-reference path. This verifier reports these values; acceptance thresholds are applied by the outer detector/Hive layer, not inside this function.", "Returns the per-image record together with CUDA stage timings and provider metadata."],
      ru: ["Получает вектор 1×128, созданный этапом 05, и обращается к кэшированным матрицам эталонов.", "Переводит вектор во float и делает его L2-длину равной единице, поэтому скалярные произведения становятся cosine similarity.", "Отдельно обрабатывает Ади, Фараджа и Славу, используя соответствующую матрицу эталонов N×128.", "Вычисляет 1×128 @ 128×N и получает по одной оценке сходства для каждой эталонной фотографии текущей личности.", "max(dim=1) сохраняет максимальную оценку и индекс соответствующего эталона каждой личности.", "Объединяет три личности в компактные матрицы оценок и индексов, возвращаемые вызывающему коду.", "verify_batch вызывает функцию сравнения сразу после получения векторов от CUDA-сессии SFace.", "На CPU копируются только малые итоговые оценки, индексы и флаги валидности; промежуточные данные свёрток остаются в CUDA.", "Создаёт словарь оценок, сортирует его и определяет лучшую личность и второе место.", "Записывает лучшее имя, оценку, второе место, отрыв и точный путь совпавшего эталона. Этот verifier сообщает значения; пороги принятия применяет внешняя оболочка детектора/Hive, а не эта функция.", "Возвращает записи изображений вместе с временем этапов CUDA и сведениями о provider."],
      he: ["מקבל את הווקטור 1×128 שנוצר בשלב 05 וניגש למטריצות הייחוס השמורות.", "ממיר את הווקטור ל-float ומנרמל את אורכו לפי L2 לאחד, כך שמכפלות סקלריות הן דמיון קוסינוס.", "מעבד בנפרד את עדי, פראג' וסלאבה באמצעות מטריצת הייחוס N×128 המתאימה.", "מחשב 1×128 @ 128×N ומפיק ציון דמיון אחד לכל תמונת ייחוס של הזהות הנוכחית.", "max(dim=1) שומר את הציון הגבוה ואת אינדקס הייחוס המתאים לכל זהות.", "עורם את שלוש הזהויות למטריצות קומפקטיות של ציונים ואינדקסים שמוחזרות לקוד הקורא.", "verify_batch קורא לפונקציית ההשוואה מיד לאחר שסשן SFace ב-CUDA יוצר את הווקטורים.", "רק הציונים, האינדקסים ודגלי התקינות הסופיים והקטנים מועברים ל-CPU; נתוני הביניים של הקונבולוציות נשארים ב-CUDA.", "בונה מילון ציונים, ממיין אותו וקובע את הזהות המובילה ואת המקום השני.", "שומר תווית מובילה, ציון, מקום שני, פער ונתיב מדויק לייחוס התואם. המאמת הזה מדווח את הערכים; ספי הקבלה מוחלים בשכבת הגלאי/Hive החיצונית ולא בפונקציה זו.", "מחזיר רשומות לכל תמונה יחד עם זמני שלבי CUDA ופרטי provider."]
    },
    layers: { en: "L2 normalization + CUDA matrix multiplication + host result assembly", ru: "L2-нормализация + матричное умножение CUDA + сборка ответа на host", he: "נרמול L2 + כפל מטריצות ב-CUDA + הרכבת תשובה במארח" },
    connections: { en: "1×128 compared with every cached reference vector", ru: "1×128 сравнивается с каждым кэшированным вектором эталона", he: "1×128 מושווה לכל וקטור ייחוס שמור" },
    tensor: "1×128 @ 128×N → 1×N per identity → best/runner-up → JSON",
    cudaShort: { en: "Single image is FP32; no 50/500 batch behavior", ru: "Одиночное изображение использует FP32; логики 50/500 здесь нет", he: "תמונה יחידה משתמשת ב-FP32; אין כאן התנהגות של 50/500" },
    cuda: { en: "The vector normalization, all reference matrix multiplications and max reductions run on CUDA. After synchronization, only the small final matrices are copied to CPU for labels, paths, timing fields and JSON assembly.", ru: "Нормализация вектора, все умножения на матрицы эталонов и редукции max выполняются на CUDA. После синхронизации на CPU копируются только малые итоговые матрицы для выбора имён, путей, полей времени и сборки JSON.", he: "נרמול הווקטור, כל הכפל במטריצות הייחוס ופעולות max רצים ב-CUDA. לאחר הסנכרון מועברות ל-CPU רק המטריצות הסופיות הקטנות לצורך תוויות, נתיבים, זמני ביצוע והרכבת JSON." },
    code: `payload = verifier.verify_batch([screenshot_path])
result = payload["results"][0]
print(result["label"], result["score"], payload["gpu_total_ms"])`
  }
];

const nativeCudaStages = [
  {
    level: "01",
    title: { en: "Prepare the program and known faces", ru: "Подготовка программы и известных лиц", he: "הכנת התוכנית והפנים המוכרות" },
    summary: {
      en: "The compiled identity_cuda.exe process attaches ONNX Runtime CUDAExecutionProvider, loads YuNet and SFace once, and prepares the three-person reference bank before serving requests.",
      ru: "Скомпилированный процесс identity_cuda.exe подключает CUDAExecutionProvider ONNX Runtime, один раз загружает YuNet и SFace и готовит базу эталонов трёх людей до обработки запросов.",
      he: "התהליך המהודר identity_cuda.exe מחבר את CUDAExecutionProvider של ONNX Runtime, טוען פעם אחת את YuNet ואת SFace ומכין את מאגר הייחוס של שלושת האנשים לפני טיפול בבקשות."
    },
    diagram: { en: ["identity_cuda.exe", "CUDA provider", "YuNet + SFace", "Reference embeddings"], ru: ["identity_cuda.exe", "Provider CUDA", "YuNet + SFace", "Эталонные embeddings"], he: ["identity_cuda.exe", "CUDA provider", "YuNet + SFace", "embeddings לייחוס"] },
    diagramNotes: {
      en: ["The worker is a native executable compiled from C++ and CUDA sources.", "AppendExecutionProvider_CUDA selects NVIDIA device 0 without a Python inference session.", "YuNet and SFace ONNX graphs are loaded into persistent sessions.", "Reference embeddings are computed once and reused by later requests."],
      ru: ["Worker является native executable, собранным из C++ и CUDA исходников.", "AppendExecutionProvider_CUDA выбирает NVIDIA device 0 без Python-сессии инференса.", "ONNX-графы YuNet и SFace загружаются в постоянные сессии.", "Эталонные embeddings вычисляются один раз и повторно используются в запросах."],
      he: ["ה-worker הוא קובץ native executable שנבנה ממקורות C++ ו-CUDA.", "AppendExecutionProvider_CUDA בוחר את התקן NVIDIA מספר 0 ללא סשן הסקה של Python.", "גרפי ONNX של YuNet ושל SFace נטענים לסשנים קבועים.", "וקטורי הייחוס מחושבים פעם אחת ומשמשים שוב בבקשות הבאות."]
    },
    layers: { en: "Persistent YuNet and SFace ONNX sessions", ru: "Постоянные ONNX-сессии YuNet и SFace", he: "סשנים קבועים של YuNet ו-SFace ב-ONNX" },
    connections: { en: "Reference inference runs once at worker startup", ru: "Эталонный инференс выполняется один раз при запуске worker", he: "הסקת הייחוס מתבצעת פעם אחת בעת הפעלת ה-worker" },
    tensor: "reference images -> normalized 128D SFace vectors",
    cudaShort: { en: "C++ directly appends CUDAExecutionProvider", ru: "C++ напрямую подключает CUDAExecutionProvider", he: "C++ מחבר ישירות את CUDAExecutionProvider" },
    cuda: { en: "CUDA ownership belongs to identity_cuda.exe. Python only transports HTTP requests; it does not create the neural-network sessions shown here.", ru: "CUDA принадлежит процессу identity_cuda.exe. Python только передаёт HTTP-запросы и не создаёт показанные здесь нейросетевые сессии.", he: "הבעלות על CUDA נמצאת ב-identity_cuda.exe. ‏Python רק מעביר בקשות HTTP ואינו יוצר את סשני הרשת המוצגים כאן." },
    code: `OrtCUDAProviderOptions cuda_options{};
cuda_options.device_id = 0;
options.AppendExecutionProvider_CUDA(cuda_options);
yunet = Ort::Session(env, yunet_model, options);
sface = Ort::Session(env, sface_model, options);`
  },
  {
    level: "02",
    title: { en: "Prepare the photo", ru: "Подготовка фотографии", he: "הכנת התמונה" },
    summary: {
      en: "Native C++ decodes the screenshot, resizes it, pads it to YuNet dimensions, converts pixels to float NCHW BGR, and creates the input tensor used by the CUDA session.",
      ru: "Native C++ декодирует снимок, изменяет размер, дополняет его до размеров YuNet, преобразует пиксели в float NCHW BGR и создаёт входной тензор CUDA-сессии.",
      he: "Native C++ מפענח את צילום המסך, משנה גודל, מרפד לממדי YuNet, ממיר את הפיקסלים ל-float NCHW BGR ויוצר את טנזור הקלט של סשן CUDA."
    },
    diagram: { en: ["PNG/JPEG", "Native decode", "Resize + pad", "NCHW float tensor"], ru: ["PNG/JPEG", "Native decode", "Resize + padding", "Float-тензор NCHW"], he: ["PNG/JPEG", "פענוח native", "שינוי גודל וריפוד", "טנזור float NCHW"] },
    diagramNotes: {
      en: ["Compressed image decoding is a host operation.", "The largest image dimension is limited for YuNet and rounded to a multiple of 32.", "Bilinear sampling writes three planar BGR channels.", "A single screenshot produces a batch dimension of one."],
      ru: ["Декодирование сжатого изображения выполняется на host.", "Максимальная сторона ограничивается для YuNet, а размеры округляются до кратных 32.", "Билинейная выборка записывает три планарных BGR-канала.", "Один снимок создаёт пакет с размером batch=1."],
      he: ["פענוח התמונה הדחוסה מתבצע במארח.", "הצלע המרבית מוגבלת עבור YuNet והממדים מעוגלים לכפולה של 32.", "דגימה בילינארית כותבת שלושה ערוצי BGR מישוריים.", "צילום מסך יחיד יוצר אצווה בגודל 1."]
    },
    layers: { en: "No neural layers; native C++ preprocessing", ru: "Нейрослоёв нет; предобработка native C++", he: "ללא שכבות עצביות; עיבוד מקדים ב-native C++" },
    connections: { en: "One prepared tensor per request", ru: "Один подготовленный тензор на запрос", he: "טנזור מוכן אחד לכל בקשה" },
    tensor: "RGBA bytes -> 1x3xH'xW' float32 NCHW",
    cudaShort: { en: "Host tensor handed to ONNX Runtime CUDA", ru: "Host-тензор передаётся ONNX Runtime CUDA", he: "טנזור המארח נמסר ל-ONNX Runtime CUDA" },
    cuda: { en: "This stage is deliberately reported as host work. ONNX Runtime performs the device transfer when the following CUDA graph begins.", ru: "Этот этап честно отмечен как host-работа. ONNX Runtime выполняет перенос на устройство при запуске следующего CUDA-графа.", he: "שלב זה מסומן במפורש כעבודת מארח. ONNX Runtime מבצע את ההעברה להתקן כאשר גרף CUDA הבא מתחיל." },
    code: `auto prepared = prepare_detection_batch(images);
auto memory = Ort::MemoryInfo::CreateCpu(...);
auto input = Ort::Value::CreateTensor<float>(
    memory, prepared.nchw_bgr.data(), prepared.nchw_bgr.size(), ...);`
  },
  {
    level: "03",
    title: { en: "Find the face and landmarks", ru: "Поиск лица и ориентиров", he: "איתור הפנים ונקודות הציון" },
    summary: {
      en: "ONNX Runtime runs the YuNet detector through CUDAExecutionProvider. Native C++ decodes its outputs, retains one valid face, and records five landmarks for the next alignment step.",
      ru: "ONNX Runtime запускает детектор YuNet через CUDAExecutionProvider. Native C++ декодирует его выходы, сохраняет одно допустимое лицо и фиксирует пять ориентиров для следующего этапа выравнивания.",
      he: "ONNX Runtime מריץ את גלאי YuNet דרך CUDAExecutionProvider. ‏C++ מקורי מפענח את הפלט, שומר פנים תקינות אחת ורושם חמש נקודות ציון לשלב היישור הבא."
    },
    diagram: { en: ["NCHW input", "YuNet CUDA", "Face candidate", "5 landmarks"], ru: ["Вход NCHW", "YuNet CUDA", "Кандидат лица", "5 ориентиров"], he: ["קלט NCHW", "YuNet CUDA", "מועמד פנים", "5 נקודות ציון"] },
    diagramNotes: {
      en: ["The prepared image tensor enters YuNet once for this request.", "CUDA executes the complete YuNet ONNX graph.", "C++ keeps the strongest centered valid face.", "YuNet supplies five points used to align that face in the following stage."],
      ru: ["Подготовленный тензор изображения один раз входит в YuNet для этого запроса.", "CUDA выполняет полный ONNX-граф YuNet.", "C++ сохраняет наиболее сильное центральное допустимое лицо.", "YuNet выдаёт пять точек, которые выравнивают лицо на следующем этапе."],
      he: ["טנזור התמונה המוכן נכנס ל-YuNet פעם אחת עבור בקשה זו.", "CUDA מריץ את כל גרף ONNX של YuNet.", "C++ שומר את הפנים התקינות והמרכזיות החזקות ביותר.", "YuNet מספק חמש נקודות שמשמשות ליישור הפנים בשלב הבא."]
    },
    layers: { en: "YuNet ONNX detector graph", ru: "ONNX-граф детектора YuNet", he: "גרף ONNX של גלאי YuNet" },
    connections: { en: "One YuNet CUDA execution for the image", ru: "Одно выполнение YuNet CUDA для изображения", he: "הרצת YuNet CUDA אחת עבור התמונה" },
    tensor: "1 x 3 x H x W -> face box + 5 landmarks",
    cudaShort: { en: "YuNet neural graph executes on NVIDIA CUDA", ru: "Нейросетевой граф YuNet выполняется на NVIDIA CUDA", he: "גרף YuNet העצבי רץ ב-NVIDIA CUDA" },
    cuda: { en: "Only YuNet runs in this stage. Its CUDA graph returns detector tensors to C++, which decodes the chosen face and landmarks before alignment.", ru: "На этом этапе запускается только YuNet. Его CUDA-граф возвращает тензоры детектора в C++, который декодирует выбранное лицо и ориентиры до выравнивания.", he: "בשלב זה רץ רק YuNet. גרף ה-CUDA שלו מחזיר טנזורי גלאי ל-C++, שמפענח את הפנים ונקודות הציון שנבחרו לפני היישור." },
    code: `auto yunet_outputs = yunet.Run(...);
auto faces = decode_yunet_outputs(yunet_outputs);`
  },
  {
    level: "04",
    title: { en: "Align the face", ru: "Выравнивание лица", he: "יישור הפנים" },
    summary: {
      en: "The host computes a similarity transform from YuNet landmarks to the canonical SFace template and bilinearly samples one aligned 112x112 face.",
      ru: "Host вычисляет similarity transform от ориентиров YuNet к каноническому шаблону SFace и билинейно формирует выровненное лицо 112x112.",
      he: "המארח מחשב similarity transform מנקודות YuNet אל תבנית SFace הקנונית ודוגם בילינארית פנים מיושרות בגודל 112x112."
    },
    diagram: { en: ["5 landmarks", "Scale + rotation", "Inverse transform", "112x112 crop"], ru: ["5 ориентиров", "Масштаб + поворот", "Обратное преобразование", "Область 112x112"], he: ["5 נקודות ציון", "קנה מידה וסיבוב", "טרנספורמציה הפוכה", "חיתוך 112x112"] },
    diagramNotes: {
      en: ["Five source and target landmark means are calculated.", "Scale, rotation, and translation parameters are solved in float32.", "Each output pixel is mapped back to the detector image.", "Bilinear interpolation creates the canonical SFace crop."],
      ru: ["Вычисляются средние пяти исходных и целевых ориентиров.", "Параметры масштаба, поворота и переноса решаются в float32.", "Каждый выходной пиксель отображается обратно на изображение детектора.", "Билинейная интерполяция создаёт каноническую область SFace."],
      he: ["מחושבים הממוצעים של חמש נקודות המקור והיעד.", "פרמטרי קנה המידה, הסיבוב וההזזה נפתרים ב-float32.", "כל פיקסל פלט ממופה חזרה לתמונת הגלאי.", "אינטרפולציה בילינארית יוצרת את חיתוך SFace הקנוני."]
    },
    layers: { en: "Native similarity transform and bilinear sampler", ru: "Native similarity transform и билинейная выборка", he: "similarity transform ודגימה בילינארית ב-native" },
    connections: { en: "112 x 112 x 3 aligned output values", ru: "112 x 112 x 3 значений выровненного выхода", he: "112 x 112 x 3 ערכי פלט מיושרים" },
    tensor: "5x2 landmarks + detector tensor -> 3x112x112 float32",
    cudaShort: { en: "Host bridge between the two CUDA graphs", ru: "Host-мост между двумя CUDA-графами", he: "גשר מארח בין שני גרפי CUDA" },
    cuda: { en: "This installed native version does not claim that alignment is a CUDA kernel. It is C++ host work between CUDA YuNet and CUDA SFace.", ru: "Установленная native-версия не выдаёт выравнивание за CUDA kernel. Это C++ host-этап между CUDA YuNet и CUDA SFace.", he: "גרסת ה-native המותקנת אינה מציגה את היישור כ-CUDA kernel. זו עבודת מארח ב-C++ בין CUDA YuNet ל-CUDA SFace." },
    code: `auto aligned = align_faces(prepared, faces);
// Five landmarks define scale, rotation and translation.
// Bilinear sampling writes a 3x112x112 SFace tensor.`
  },
  {
    level: "05",
    title: { en: "Manual SFace forward pass in CUDA", ru: "Ручной forward pass SFace на CUDA", he: "מעבר קדמי ידני של SFace ב-CUDA" },
    summary: {
      en: "The project executes the trained SFace network with its own NVCC-compiled CUDA kernels. It explicitly performs preprocessing, 27 convolutions, fused BatchNorm/PReLU, tiled 1x1 matrix multiplications, the Bx50176 by 50176x128 fully connected multiplication, final BatchNorm and L2 normalization. The CUDA route never calls sface.Run(...).",
      ru: "Проект выполняет обученную сеть SFace собственными CUDA kernels, собранными NVCC. Код явно выполняет предобработку, 27 свёрток, объединённые BatchNorm/PReLU, плиточные матричные умножения 1x1, финальное умножение Bx50176 на 50176x128, последний BatchNorm и L2-нормализацию. CUDA-маршрут не вызывает sface.Run(...).",
      he: "הפרויקט מריץ את רשת SFace המאומנת באמצעות CUDA kernels עצמאיים שנבנים ב-NVCC. הקוד מבצע במפורש קדם-עיבוד, 27 קונבולוציות, BatchNorm/PReLU מאוחדים, כפל מטריצות מרוצף עבור 1x1, כפל מלא Bx50176 ב-50176x128, ‏BatchNorm סופי ונרמול L2. מסלול CUDA אינו קורא ל-sface.Run(...)."
    },
    diagram: {
      en: ["01 Load trained weights", "02 Copy aligned faces to GPU", "03 Normalize input pixels", "04 First 3x3 convolution", "05 Repeat 13 depthwise + pointwise blocks", "06 Final feature BatchNorm", "07 Fully connected 50176 -> 128 + BatchNorm", "08 L2 normalize the 128D embedding", "09 Copy embeddings back to RAM"],
      ru: ["01 Загрузка обученных весов", "02 Копирование выровненных лиц на GPU", "03 Нормализация входных пикселей", "04 Первая свёртка 3x3", "05 Повтор 13 блоков depthwise + pointwise", "06 Финальный BatchNorm карты признаков", "07 Полносвязный слой 50176 -> 128 + BatchNorm", "08 L2-нормализация embedding 128D", "09 Копирование embeddings обратно в RAM"],
      he: ["01 טעינת משקלי SFace", "02 העתקת פנים מיושרות ל-GPU", "03 נרמול פיקסלי הקלט", "04 קונבולוציית 3x3 ראשונה", "05 חזרה על 13 בלוקי depthwise + pointwise", "06 BatchNorm סופי של מפת המאפיינים", "07 שכבה מלאה 50176 -> 128 + BatchNorm", "08 נרמול L2 של embedding בגודל 128D", "09 העתקת embeddings חזרה ל-RAM"]
    },
    diagramNotes: {
      en: ["Reads sface_manual_weights.bin, creates device buffers with cudaMalloc, and uploads immutable learned weights once with cudaMemcpy HostToDevice.", "Copies the complete Bx3x112x112 aligned NCHW RGB tensor to the first device buffer with cudaMemcpy HostToDevice.", "The complete preprocess_kernel is selected together with its launch: every thread applies (pixel - 127.5) / 128 to one tensor element.", "The complete standard_conv3x3_kernel is selected together with its launch. Each thread accumulates a 3x3 window over all input channels, then applies fused BatchNorm/PReLU.", "The selected code shows the native loop that creates 13 pairs, plus the complete depthwise_conv3x3_kernel and pointwise_gemm_kernel. Pointwise includes fused BatchNorm/PReLU in activate().", "The complete affine_in_place_kernel and its launch apply the trained BatchNorm scale and shift to the final 1024x7x7 feature map.", "The complete fully_connected_kernel and its launch manually perform Bx50176 by 50176x128 tiled GEMM, add bias, and immediately apply the final BatchNorm.", "The complete normalize_embeddings_kernel and its launch use one 256-thread block per face to reduce the norm and turn 128 values into a unit vector.", "The selected cudaMemcpy DeviceToHost copies only the completed Bx128 embedding matrix to CPU RAM."],
      ru: ["Читает sface_manual_weights.bin, создаёт device-буферы через cudaMalloc и один раз загружает неизменяемые обученные веса через cudaMemcpy HostToDevice.", "Копирует полный выровненный NCHW RGB-тензор Bx3x112x112 в первый device-буфер через cudaMemcpy HostToDevice.", "Выделяется весь preprocess_kernel вместе с запуском: каждый thread применяет (pixel - 127.5) / 128 к одному элементу тензора.", "Выделяется весь standard_conv3x3_kernel вместе с запуском. Каждый thread суммирует окно 3x3 по всем входным каналам, затем применяется объединённый BatchNorm/PReLU.", "Выделяется native-цикл, создающий 13 пар, а также весь depthwise_conv3x3_kernel и pointwise_gemm_kernel. В pointwise BatchNorm/PReLU уже объединены внутри activate().", "Выделяются весь affine_in_place_kernel и его запуск: они применяют обученные scale и shift BatchNorm к финальной карте признаков 1024x7x7.", "Выделяются весь fully_connected_kernel и его запуск: они вручную выполняют плиточный GEMM Bx50176 на 50176x128, добавляют bias и сразу применяют финальный BatchNorm.", "Выделяются весь normalize_embeddings_kernel и его запуск: один block из 256 threads на лицо вычисляет норму и превращает 128 значений в единичный вектор.", "Выделяется cudaMemcpy DeviceToHost, копирующий в RAM только готовую матрицу embeddings Bx128."],
      he: ["קורא את sface_manual_weights.bin, יוצר מאגרי התקן בעזרת cudaMalloc ומעלה פעם אחת את המשקלים המאומנים הקבועים בעזרת cudaMemcpy HostToDevice.", "מעתיק את טנזור ה-RGB המיושר בפורמט NCHW בגודל Bx3x112x112 למאגר ההתקן הראשון בעזרת cudaMemcpy HostToDevice.", "נבחר ה-preprocess_kernel המלא יחד עם השיגור שלו: כל thread מחיל (pixel - 127.5) / 128 על איבר טנזור אחד.", "נבחר ה-standard_conv3x3_kernel המלא יחד עם השיגור שלו. כל thread צובר חלון 3x3 על פני כל ערוצי הקלט ואז מפעיל BatchNorm/PReLU מאוחדים.", "נבחרים לולאת ה-native שיוצרת 13 זוגות, וכן ה-depthwise_conv3x3_kernel וה-pointwise_gemm_kernel המלאים. ב-pointwise ה-BatchNorm/PReLU כבר מאוחדים בתוך activate().", "נבחרים ה-affine_in_place_kernel המלא והשיגור שלו, שמחילים את scale ו-shift המאומנים של BatchNorm על מפת המאפיינים הסופית 1024x7x7.", "נבחרים ה-fully_connected_kernel המלא והשיגור שלו: הם מבצעים ידנית GEMM מרוצף של Bx50176 כפול 50176x128, מוסיפים bias ומחילים מיד BatchNorm סופי.", "נבחרים ה-normalize_embeddings_kernel המלא והשיגור שלו: בלוק אחד של 256 threads לכל פנים מחשב את הנורמה והופך 128 ערכים לווקטור יחידה.", "נבחרת פעולת cudaMemcpy DeviceToHost שמעתיקה ל-RAM רק את מטריצת ה-embeddings המוגמרת בגודל Bx128."]
    },
    layers: { en: "1 standard conv + 13 depthwise conv + 13 tiled pointwise GEMM + tiled FC + CUDA L2 reduction", ru: "1 обычная conv + 13 depthwise conv + 13 плиточных pointwise GEMM + плиточный FC + CUDA L2 reduction", he: "קונבולוציה רגילה אחת + 13 depthwise + 13 פעולות pointwise GEMM מרוצפות + FC מרוצף + CUDA L2 reduction" },
    connections: { en: "Trained SFace weights are preserved; only the inference executor changed from a library call to explicit project kernels", ru: "Обученные веса SFace сохранены; заменён только исполнитель inference: библиотечный вызов заменён явными kernels проекта", he: "המשקלים המאומנים של SFace נשמרו; רק מנגנון ההרצה הוחלף מקריאת ספרייה ל-kernels מפורשים של הפרויקט" },
    tensor: "Bx3x112x112 -> 27 manual CUDA convolutions -> Bx50176 x 50176x128 -> Bx128",
    cudaShort: { en: "Explicit NVCC kernels and shared-memory matrix multiplication; no SFace inference library", ru: "Явные NVCC kernels и матричное умножение через shared memory; без библиотеки SFace inference", he: "NVCC kernels מפורשים וכפל מטריצות ב-shared memory; ללא ספריית inference של SFace" },
    cuda: { en: "Stage 05 is implemented in sface_manual_cuda.cu. The CUDA worker calls manual_sface_cuda_forward(), which launches every neural operation explicitly. ONNX Runtime remains in the CPU baseline and in CUDA YuNet detection, but it is not used for the CUDA SFace forward pass.", ru: "Этап 05 реализован в sface_manual_cuda.cu. CUDA-worker вызывает manual_sface_cuda_forward(), который явно запускает каждую нейросетевую операцию. ONNX Runtime остаётся в CPU baseline и в CUDA-детекторе YuNet, но не используется для CUDA forward pass SFace.", he: "שלב 05 ממומש בקובץ sface_manual_cuda.cu. ה-CUDA worker קורא ל-manual_sface_cuda_forward(), שמשגר במפורש כל פעולה ברשת. ONNX Runtime נשאר בקו הבסיס של CPU ובזיהוי YuNet על CUDA, אך אינו משמש למעבר הקדמי של SFace ב-CUDA." },
    code: `const int rows = batch_size * spatial;
const int row_tiles = (rows + kTile - 1) / kTile;
const int output_tiles = (layer.output_channels + kTile - 1) / kTile;
pointwise_gemm_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(
    input, layer.weights, layer.scale, layer.shift, layer.slope, output,
    rows, layer.input_channels, layer.output_channels, spatial);

fully_connected_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(
    input, context->fc_weights, context->fc_bias,
    context->embedding_scale, context->embedding_shift,
    embeddings, batch_size, context->final_dimensions);
normalize_embeddings_kernel<<<batch_size, 256>>>(embeddings, batch_size);`
  },
  {
    level: "06",
    title: { en: "Compare with known faces", ru: "Сравнение с известными лицами", he: "השוואה לפנים מוכרות" },
    summary: {
      en: "The complete sface_cuda.cu path is shown as thirteen concrete operations: validation, device allocation, H2D copies, launch geometry, thread indexing, the 128D dot product, error checking, D2H readback, and cleanup.",
      ru: "Полный путь sface_cuda.cu показан как тринадцать конкретных операций: проверка, выделение device-памяти, H2D-копирование, геометрия запуска, индексация thread, скалярное произведение 128D, проверка ошибок, D2H-чтение и очистка.",
      he: "המסלול המלא של sface_cuda.cu מוצג כשלוש-עשרה פעולות ממשיות: אימות, הקצאת זיכרון התקן, העתקות H2D, גאומטריית שיגור, אינדוקס thread, מכפלה פנימית 128D, בדיקת שגיאות, קריאת D2H וניקוי."
    },
    diagram: {
      en: ["01 CUDA error guard", "02 __global__ kernel contract", "03 Thread indices + boundary guard", "04 128D dot-product loop", "05 Host scoring entry point", "06 Validate sizes + byte counts", "07 Three cudaMalloc allocations", "08 Two H2D cudaMemcpy operations", "09 block(256) + 2D grid", "10 Explicit <<<grid, block>>> launch", "11 Launch check + D2H result", "12 Success cleanup + return", "13 Exception-safe cleanup"],
      ru: ["01 Проверка CUDA-ошибок", "02 Контракт __global__ kernel", "03 Индексы thread + boundary guard", "04 Цикл скалярного произведения 128D", "05 Host-точка входа оценки", "06 Проверка размеров и числа байт", "07 Три выделения cudaMalloc", "08 Два H2D-копирования cudaMemcpy", "09 block(256) и двумерный grid", "10 Явный запуск <<<grid, block>>>", "11 Проверка запуска + D2H-результат", "12 Очистка и возврат при успехе", "13 Очистка при исключении"],
      he: ["01 מגן שגיאות CUDA", "02 חוזה __global__ kernel", "03 אינדקסי thread ו-boundary guard", "04 לולאת מכפלה פנימית 128D", "05 נקודת כניסת scoring במארח", "06 אימות גדלים ומספרי בתים", "07 שלוש הקצאות cudaMalloc", "08 שתי העתקות H2D עם cudaMemcpy", "09 block(256) ו-grid דו-ממדי", "10 שיגור מפורש <<<grid, block>>>", "11 בדיקת שיגור ותוצאת D2H", "12 ניקוי והחזרה בהצלחה", "13 ניקוי בטוח בחריגה"]
    },
    diagramNotes: {
      en: ["check_cuda converts every CUDA runtime failure into a C++ exception with the operation name.", "The kernel receives query, reference, and score pointers plus B, N, and embedding dimensions.", "blockIdx.y selects the query; blockIdx.x and threadIdx.x select the reference; excess threads return.", "Each surviving thread performs all 128 multiply-add operations for exactly one query/reference pair.", "sface_cuda_scores owns the host-side lifetime of one complete score-matrix request.", "Empty shapes return immediately; byte counts are calculated for Bx128, Nx128, and BxN buffers.", "Separate device buffers are allocated for queries, references, and output scores.", "All query and reference embeddings are copied from host RAM to RTX device memory.", "A block contains 256 threads; grid X covers ceil(N/256) blocks and grid Y covers B queries.", "The project-owned kernel is dispatched once for the complete BxN score matrix.", "cudaGetLastError validates dispatch; the completed BxN matrix is copied back to host memory.", "All three device buffers are freed before the result vector is returned.", "The catch path frees every allocated buffer and rethrows the original failure."],
      ru: ["check_cuda превращает любую ошибку CUDA runtime в C++ exception с названием операции.", "Kernel получает указатели queries, references и scores, а также B, N и размер embedding.", "blockIdx.y выбирает query; blockIdx.x и threadIdx.x выбирают эталон; лишние threads завершаются.", "Каждый оставшийся thread выполняет все 128 multiply-add для одной пары query/reference.", "sface_cuda_scores управляет host-жизненным циклом одного полного запроса матрицы оценок.", "Пустые размеры сразу возвращаются; вычисляется число байт для буферов Bx128, Nx128 и BxN.", "Отдельные device-буферы выделяются для queries, references и выходных scores.", "Все query- и reference-embeddings копируются из RAM в device-память RTX.", "Block содержит 256 threads; grid X покрывает ceil(N/256) блоков, а grid Y — B запросов.", "Собственный kernel проекта один раз запускается для полной матрицы оценок BxN.", "cudaGetLastError проверяет запуск; готовая матрица BxN копируется обратно в host-память.", "Все три device-буфера освобождаются до возврата вектора результата.", "Ветка catch освобождает каждый выделенный буфер и повторно выбрасывает исходную ошибку."],
      he: ["check_cuda ממיר כל כשל של CUDA runtime לחריגת C++ עם שם הפעולה.", "ה-kernel מקבל מצביעים ל-queries, references ו-scores וכן B, ‏N וממד embedding.", "blockIdx.y בוחר query;‏ blockIdx.x ו-threadIdx.x בוחרים ייחוס; threads עודפים חוזרים.", "כל thread שנשאר מבצע את כל 128 פעולות multiply-add עבור זוג query/reference יחיד.", "sface_cuda_scores מנהלת בצד המארח את מחזור החיים של בקשת מטריצת ציונים מלאה.", "גדלים ריקים חוזרים מיד; מחושבים מספרי הבתים למאגרים Bx128, ‏Nx128 ו-BxN.", "מוקצים מאגרי התקן נפרדים ל-queries, ל-references ולציוני הפלט.", "כל embeddings של query ושל reference מועתקים מ-RAM לזיכרון התקן RTX.", "כל block מכיל 256 threads;‏ grid X מכסה ceil(N/256) בלוקים ו-grid Y מכסה B שאילתות.", "ה-kernel של הפרויקט משוגר פעם אחת עבור כל מטריצת הציונים BxN.", "cudaGetLastError מאמת את השיגור; מטריצת BxN המלאה מועתקת חזרה לזיכרון המארח.", "שלושת מאגרי ההתקן משוחררים לפני החזרת וקטור התוצאה.", "מסלול catch משחרר כל מאגר שהוקצה וזורק מחדש את השגיאה המקורית."]
    },
    layers: { en: "13 concrete CUDA/runtime operations around one __global__ kernel", ru: "13 конкретных CUDA/runtime-операций вокруг одного __global__ kernel", he: "13 פעולות CUDA/runtime ממשיות סביב __global__ kernel אחד" },
    connections: { en: "B x N CUDA threads; every valid thread executes 128 multiply-adds", ru: "B x N CUDA threads; каждый допустимый thread выполняет 128 multiply-add", he: "B x N CUDA threads; כל thread תקין מבצע 128 פעולות multiply-add" },
    tensor: "host Bx128 + Nx128 -> device Bx128 + Nx128 -> device/host BxN",
    cudaShort: { en: "256-thread blocks, 2D grid, one score per valid thread", ru: "Блоки по 256 threads, двумерный grid, одна оценка на допустимый thread", he: "בלוקים של 256 threads, ‏grid דו-ממדי וציון אחד לכל thread תקין" },
    cuda: { en: "This project-owned CUDA C++ path is compiled by NVCC. Click any of the thirteen operations to open the exact corresponding lines from sface_cuda.cu; no synthetic ONNX layer list is substituted here.", ru: "Этот собственный путь CUDA C++ собирается NVCC. Нажмите любую из тринадцати операций, чтобы открыть точные соответствующие строки sface_cuda.cu; синтетический список ONNX-слоёв здесь не подставляется.", he: "מסלול CUDA C++ של הפרויקט נבנה באמצעות NVCC. לחצו על כל אחת משלוש-עשרה הפעולות כדי לפתוח את השורות המדויקות ב-sface_cuda.cu; לא מוצגת כאן רשימת שכבות ONNX מלאכותית." },
    code: `const dim3 block(256);
const dim3 grid((reference_count + 255) / 256, query_count);
cosine_scores_kernel<<<grid, block>>>(
    device_queries, device_references, device_scores,
    query_count, reference_count, dimensions);`
  },
  {
    level: "07",
    title: { en: "Show the recognition result", ru: "Показ результата распознавания", he: "הצגת תוצאת הזיהוי" },
    summary: {
      en: "For CUDA, all requested images enter one dynamic YuNet/SFace batch; the complete score matrix is reduced per identity, and score plus margin thresholds produce the final result.",
      ru: "В CUDA все запрошенные изображения входят в один динамический пакет YuNet/SFace; полная матрица оценок сводится по людям, а пороги score и margin формируют итоговый результат.",
      he: "ב-CUDA כל התמונות המבוקשות נכנסות לאצווה דינמית אחת של YuNet/SFace; מטריצת הציונים המלאה מצטמצמת לכל זהות וספי score ו-margin יוצרים את התוצאה הסופית."
    },
    diagram: { en: ["One screenshot", "CUDA batch size 1", "Per-person best", "Score + margin", "Native result"], ru: ["Один снимок", "CUDA batch=1", "Лучшее по человеку", "Score + margin", "Native-результат"], he: ["צילום מסך אחד", "CUDA batch=1", "הטוב ביותר לכל אדם", "Score ו-margin", "תוצאת native"] },
    diagramNotes: {
      en: ["The same method handles one, 50, or 500 physical inference attempts.", "CUDA calls embed_images once for the complete request; CPU calls it once per image sequentially.", "Scores are grouped by Adi, Faraj, and Slava before ranking.", "The label is accepted only when both minimum score and minimum margin pass.", "The native result reports the accepted identity, scores, matched reference, backend, and timing."],
      ru: ["Один метод обрабатывает одну, 50 или 500 физических попыток инференса.", "CUDA вызывает embed_images один раз для всего запроса; CPU вызывает его отдельно для каждого изображения последовательно.", "Оценки группируются по Adi, Faraj и Slava до ранжирования.", "Имя принимается только после прохождения минимального score и минимального margin.", "Native-результат сообщает принятое имя, оценки, совпавший эталон, backend и время."],
      he: ["אותה שיטה מטפלת בניסיון הסקה אחד, ב-50 או ב-500 ניסיונות פיזיים.", "CUDA קורא ל-embed_images פעם אחת לכל הבקשה; CPU קורא לה בנפרד לכל תמונה באופן סדרתי.", "הציונים מקובצים לפי Adi, ‏Faraj ו-Slava לפני הדירוג.", "התווית מתקבלת רק אם גם ציון המינימום וגם פער המינימום עברו.", "תוצאת ה-native מדווחת על הזהות שהתקבלה, הציונים, הייחוס התואם, ה-backend וזמן הביצוע."]
    },
    layers: { en: "Per-identity reduction, ranking, score and margin rules", ru: "Сведение по людям, ранжирование и правила score/margin", he: "צמצום לכל זהות, דירוג וכללי score/margin" },
    connections: { en: "One physical recognition in this simple demo", ru: "Одно физическое распознавание в простой демонстрации", he: "זיהוי פיזי אחד בהדגמה הפשוטה" },
    tensor: "1 screenshot -> 1x128 embedding -> 1xN scores -> 1 identity",
    cudaShort: { en: "CUDA batch path is active even when B=1", ru: "CUDA batch-путь активен даже при B=1", he: "מסלול אצוות CUDA פעיל גם כאשר B=1" },
    cuda: { en: "The simple page sends one image, so the dynamic CUDA batch has B=1. The same compiled code is used by Hive for larger parallel batches without skipping duplicate inputs.", ru: "Простая страница отправляет одно изображение, поэтому динамический CUDA-пакет имеет B=1. Тот же скомпилированный код Hive использует для больших параллельных пакетов без пропуска повторяющихся входов.", he: "העמוד הפשוט שולח תמונה אחת ולכן אצוות CUDA הדינמית היא B=1. אותו קוד מהודר משמש את Hive לאצוות מקבילות גדולות יותר ללא דילוג על קלטים כפולים." },
    code: `if (use_cuda) {
    embedded = embed_images(images); // one dynamic CUDA batch
}
scores = sface_cuda_scores(embedded.vectors, references, ...);
accepted = best_score >= min_score && margin >= min_margin;`
  }
];

Object.assign(detectorVariantCatalog.single, {
  label: { en: "native single-image request", ru: "native-запрос одного изображения", he: "בקשת native לתמונה יחידה" },
  description: { en: "The page sends one screenshot to /api/detect in CUDA mode. Hive invokes identity_cuda.exe: native C++ prepares and aligns the image, ONNX Runtime executes YuNet and SFace on NVIDIA CUDA, and sface_cuda.cu computes reference scores.", ru: "Страница отправляет один снимок в /api/detect в режиме CUDA. Hive вызывает identity_cuda.exe: native C++ подготавливает и выравнивает изображение, ONNX Runtime выполняет YuNet и SFace на NVIDIA CUDA, а sface_cuda.cu вычисляет оценки эталонов.", he: "הדף שולח צילום מסך אחד אל ‎/api/detect במצב CUDA. ‏Hive מפעיל את identity_cuda.exe: ‏native C++ מכין ומיישר את התמונה, ONNX Runtime מריץ את YuNet ואת SFace ב-NVIDIA CUDA ו-sface_cuda.cu מחשב את ציוני הייחוס." },
  source: { en: "Exact blocks from the active native C++/CUDA worker. The simple demo uses B=1; the same executable handles the 50/500 batch paths in Hive.", ru: "Точные блоки активного native C++/CUDA worker. Простая демонстрация использует B=1; тот же executable обрабатывает пакеты 50/500 в Hive.", he: "בלוקים מדויקים מתוך ה-native C++/CUDA worker הפעיל. ההדגמה הפשוטה משתמשת ב-B=1; אותו executable מטפל באצוות 50/500 ב-Hive." },
  stages: nativeCudaStages
});
delete detectorVariantCatalog.batch;

Object.assign(translations.en, {
  simpleNote: "Upload one screenshot, choose CUDA GPU or CPU, and press Recognize.",
  dropHint: "Choose one screenshot for CUDA GPU/CPU analysis.",
  score: "Minimum similarity score",
  margin: "Minimum lead over second place",
  howIntro: "This inspector follows the exact single-image CUDA DeepID module, including one-time model/reference initialization and the complete path from one screenshot to one identity.",
  variantKicker: "CUDA SINGLE-IMAGE SOURCE",
  variantTitle: "Architecture being inspected",
  variantSingle: "Single-image CUDA recognition",
  modeExplainText: "GPU mode is real PyTorch CUDA when torch.cuda.is_available() is true; CPU mode executes the same DeepID operations on the processor. This explanation covers only the single-image CUDA detector source.",
  sourceTitle: "Complete single-image CUDA detector source shown by six stages",
  sourceIntro: "The listing is the exact source/cuda_deepid_detector.py text from its first import through the end of detect_image. It equals the six stage blocks in the same order, without gaps or rewritten lines.",
  sourceLoading: "Loading source/cuda_deepid_detector.py…",
  sourceError: "Could not load or verify the single-image CUDA detector source.",
  openRawDetectorSource: "Open raw CUDA detector source",
  fullStageExact: "Exact block from source/cuda_deepid_detector.py",
  fullStageDetector: "Exact block from source/cuda_deepid_detector.py",
  fullStageNotebook: "Exact block from source/cuda_deepid_detector.py",
  sourceLoaded: "Verified: {total} lines in the complete {variant} listing = {sum} lines across stages 1–6; the text is identical."
});
Object.assign(translations.ru, {
  simpleNote: "Загрузите один скриншот, выберите CUDA GPU или CPU и нажмите «Распознать».",
  dropHint: "Выберите один скриншот для анализа на CUDA GPU/CPU.",
  score: "Минимальная оценка сходства",
  margin: "Минимальный отрыв от второго места",
  howIntro: "Этот просмотр следует точному одиночному CUDA-модулю DeepID: включая одноразовую инициализацию модели и эталонов и полный путь от одного скриншота до одного имени.",
  variantKicker: "ИСХОДНИК CUDA ДЛЯ ОДНОГО ИЗОБРАЖЕНИЯ",
  variantTitle: "Разбираемая архитектура",
  variantSingle: "Одиночное распознавание CUDA",
  modeExplainText: "GPU-режим действительно использует PyTorch CUDA, когда torch.cuda.is_available() возвращает true; CPU-режим выполняет те же операции DeepID на процессоре. Здесь разобран только одиночный CUDA-детектор.",
  sourceTitle: "Полный исходник одиночного CUDA-детектора по шести этапам",
  sourceIntro: "Листинг — точный текст source/cuda_deepid_detector.py от первого импорта до конца detect_image. Он равен шести этапам в том же порядке, без пропусков и переписанных строк.",
  sourceLoading: "Загружается source/cuda_deepid_detector.py…",
  sourceError: "Не удалось загрузить или проверить исходник одиночного CUDA-детектора.",
  openRawDetectorSource: "Открыть исходник CUDA-детектора",
  fullStageExact: "Точный блок из source/cuda_deepid_detector.py",
  fullStageDetector: "Точный блок из source/cuda_deepid_detector.py",
  fullStageNotebook: "Точный блок из source/cuda_deepid_detector.py",
  sourceLoaded: "Проверено: {total} строк в полном листинге «{variant}» = {sum} строк на этапах 1–6; текст полностью совпадает."
});
Object.assign(translations.he, {
  simpleNote: "העלו צילום מסך אחד, בחרו CUDA GPU או CPU ולחצו על זיהוי.",
  dropHint: "בחרו צילום מסך אחד לניתוח CUDA GPU/CPU.",
  score: "ציון הדמיון המזערי",
  margin: "הפער המזערי מן המקום השני",
  howIntro: "תצוגה זו עוקבת אחר מודול DeepID המדויק של CUDA לתמונה יחידה, כולל אתחול חד־פעמי של המודל והייחוסים והמסלול המלא מצילום מסך אחד לזהות אחת.",
  variantKicker: "קוד CUDA לתמונה יחידה",
  variantTitle: "הארכיטקטורה הנבדקת",
  variantSingle: "זיהוי CUDA של תמונה יחידה",
  modeExplainText: "מצב GPU משתמש באמת ב‑PyTorch CUDA כאשר torch.cuda.is_available() מחזירה true; מצב CPU מבצע אותן פעולות DeepID במעבד. כאן מוסבר רק גלאי CUDA לתמונה יחידה.",
  sourceTitle: "קוד המקור המלא של גלאי CUDA לתמונה יחידה בשישה שלבים",
  sourceIntro: "הרשימה היא הטקסט המדויק של source/cuda_deepid_detector.py מן הייבוא הראשון עד סוף detect_image. היא שווה לששת השלבים באותו סדר, ללא דילוגים או שורות שנכתבו מחדש.",
  sourceLoading: "טוען את source/cuda_deepid_detector.py…",
  sourceError: "לא ניתן לטעון או לאמת את מקור גלאי CUDA לתמונה יחידה.",
  openRawDetectorSource: "פתיחת מקור גלאי CUDA",
  fullStageExact: "בלוק מדויק מתוך source/cuda_deepid_detector.py",
  fullStageDetector: "בלוק מדויק מתוך source/cuda_deepid_detector.py",
  fullStageNotebook: "בלוק מדויק מתוך source/cuda_deepid_detector.py",
  sourceLoaded: "אומת: {total} שורות ברשימת «{variant}» המלאה = {sum} שורות בשלבים 1–6; הטקסט זהה."
});
Object.assign(detailUi.en, {
  cudaLabel: "CUDA role",
  cudaTitle: "How the active native C++/CUDA worker implements this stage",
  openFullCode: "Open exact native source for this stage",
  codeSourceShort: "Short native CUDA sketch",
  codeSourceFull: "Exact native C++/CUDA source",
  focusedCodeSource: "Exact detector source · selected operation · lines {start}–{end}",
  focusCodeAction: "Show the exact source lines for this operation",
  focusOnnxAction: "Show the exact ONNX layers in this neural-network block",
  focusOnnxLayerAction: "Open the complete stage and highlight this exact ONNX node",
  onnxGraphTitle: "Actual SFace ONNX layers",
  onnxGraphMeta: "layers {start}–{end} of 92",
  stageFiveFullSource: "Complete stage 05 · exact 92-node SFace ONNX graph",
  stageSixFullSource: "Complete stage 06 · exact CUDA comparison and result code",
  stageFiveOpenFull: "Open complete stage 05 code and ONNX graph"
});
Object.assign(detailUi.ru, {
  cudaLabel: "Роль CUDA",
  cudaTitle: "Как этот этап реализован в активном native C++/CUDA worker",
  openFullCode: "Открыть точный native-исходник этапа",
  codeSourceShort: "Короткая схема native CUDA-пути",
  codeSourceFull: "Точный native C++/CUDA исходник",
  focusedCodeSource: "Точный исходник детектора · выбранная операция · строки {start}–{end}",
  focusCodeAction: "Показать точные строки этой операции",
  focusOnnxAction: "Показать точные слои ONNX этого блока нейросети",
  focusOnnxLayerAction: "Открыть весь пятый этап и выделить именно этот узел ONNX",
  onnxGraphTitle: "Фактические слои SFace ONNX",
  onnxGraphMeta: "слои {start}–{end} из 92",
  stageFiveFullSource: "Полный этап 05 · точный граф SFace из 92 узлов ONNX",
  stageSixFullSource: "Полный этап 06 · точный CUDA-код сравнения и результата",
  stageFiveOpenFull: "Открыть полный код и граф ONNX этапа 05"
});
Object.assign(detailUi.he, {
  cudaLabel: "תפקיד CUDA",
  cudaTitle: "כיצד שלב זה ממומש ב-native C++/CUDA worker הפעיל",
  openFullCode: "פתיחת מקור native מדויק של השלב",
  codeSourceShort: "תרשים קצר של מסלול native CUDA",
  codeSourceFull: "מקור native C++/CUDA מדויק",
  focusedCodeSource: "מקור הגלאי המדויק · הפעולה שנבחרה · שורות {start}–{end}",
  focusCodeAction: "הצגת שורות המקור המדויקות של פעולה זו",
  focusOnnxAction: "הצגת שכבות ONNX המדויקות בבלוק הרשת הזה",
  focusOnnxLayerAction: "פתיחת שלב 05 המלא והדגשת צומת ONNX המדויק הזה",
  onnxGraphTitle: "שכבות SFace ONNX בפועל",
  onnxGraphMeta: "שכבות {start}–{end} מתוך 92",
  stageFiveFullSource: "שלב 05 המלא · גרף SFace מדויק של 92 צומתי ONNX",
  stageSixFullSource: "שלב 06 המלא · קוד CUDA מדויק להשוואה ולתוצאה",
  stageFiveOpenFull: "פתיחת הקוד המלא וגרף ONNX של שלב 05"
});

const sfaceOnnxFeatureBlocks = [
  { start: 8, input: "1×32×112×112", depthwise: "1×32×112×112", output: "1×64×112×112" },
  { start: 14, input: "1×64×112×112", depthwise: "1×64×56×56", output: "1×128×56×56" },
  { start: 20, input: "1×128×56×56", depthwise: "1×128×56×56", output: "1×128×56×56" },
  { start: 26, input: "1×128×56×56", depthwise: "1×128×28×28", output: "1×256×28×28" },
  { start: 32, input: "1×256×28×28", depthwise: "1×256×28×28", output: "1×256×28×28" },
  { start: 38, input: "1×256×28×28", depthwise: "1×256×14×14", output: "1×512×14×14" },
  { start: 44, input: "1×512×14×14", depthwise: "1×512×14×14", output: "1×512×14×14" },
  { start: 50, input: "1×512×14×14", depthwise: "1×512×14×14", output: "1×512×14×14" },
  { start: 56, input: "1×512×14×14", depthwise: "1×512×14×14", output: "1×512×14×14" },
  { start: 62, input: "1×512×14×14", depthwise: "1×512×14×14", output: "1×512×14×14" },
  { start: 68, input: "1×512×14×14", depthwise: "1×512×14×14", output: "1×512×14×14" },
  { start: 74, input: "1×512×14×14", depthwise: "1×512×7×7", output: "1×1024×7×7" },
  { start: 80, input: "1×1024×7×7", depthwise: "1×1024×7×7", output: "1×1024×7×7" }
];

function sfaceOnnxRows(stepIndex) {
  if (stepIndex === 0) return [
    { layer: 1, name: "scalar_op1", op: "Const", input: "constant", output: "1×1" },
    { layer: 2, name: "onnx_node!_minusscalar0", op: "NaryEltwise (subtract)", input: "1×3×112×112 + 1×1", output: "1×3×112×112" },
    { layer: 3, name: "scalar_op2", op: "Const", input: "constant", output: "1×1" },
    { layer: 4, name: "onnx_node!_mulscalar0", op: "NaryEltwise (multiply)", input: "1×3×112×112 + 1×1", output: "1×3×112×112" }
  ];
  if (stepIndex === 1) return [
    { layer: 5, name: "onnx_node!conv_1_conv2d", op: "Convolution", input: "1×3×112×112", output: "1×32×112×112" },
    { layer: 6, name: "onnx_node!conv_1_batchnorm", op: "BatchNorm", input: "1×32×112×112", output: "1×32×112×112" },
    { layer: 7, name: "onnx_node!conv_1_relu", op: "PReLU", input: "1×32×112×112", output: "1×32×112×112" }
  ];
  if (stepIndex >= 2 && stepIndex <= 14) {
    const block = sfaceOnnxFeatureBlocks[stepIndex - 2];
    const number = stepIndex;
    return [
      { layer: block.start, name: `onnx_node!conv_${number}_dw_conv2d`, op: "Convolution (depthwise)", input: block.input, output: block.depthwise },
      { layer: block.start + 1, name: `onnx_node!conv_${number}_dw_batchnorm`, op: "BatchNorm", input: block.depthwise, output: block.depthwise },
      { layer: block.start + 2, name: `onnx_node!conv_${number}_dw_relu`, op: "PReLU", input: block.depthwise, output: block.depthwise },
      { layer: block.start + 3, name: `onnx_node!conv_${number}_conv2d`, op: "Convolution (pointwise 1×1)", input: block.depthwise, output: block.output },
      { layer: block.start + 4, name: `onnx_node!conv_${number}_batchnorm`, op: "BatchNorm", input: block.output, output: block.output },
      { layer: block.start + 5, name: `onnx_node!conv_${number}_relu`, op: "PReLU", input: block.output, output: block.output }
    ];
  }
  return [
    { layer: 86, name: "onnx_node!bn1", op: "BatchNorm", input: "1×1024×7×7", output: "1×1024×7×7" },
    { layer: 87, name: "onnx_node!dropout5", op: "Dropout", input: "1×1024×7×7", output: "1×1024×7×7" },
    { layer: 88, name: "onnx_node!flatten_254/flatten", op: "Flatten", input: "1×1024×7×7", output: "1×1024×7×7" },
    { layer: 89, name: "onnx_node!flatten_254", op: "Flatten", input: "1×1024×7×7", output: "1×50176" },
    { layer: 90, name: "onnx_node!pre_fc1", op: "Gemm", input: "1×50176", output: "1×128" },
    { layer: 91, name: "onnx_node!fc1", op: "BatchNorm", input: "1×128", output: "1×128" },
    { layer: 92, name: "fc1", op: "Identity", input: "1×128", output: "1×128" }
  ];
}

const sfaceOnnxAllRows = Array.from({ length: 16 }, (_, index) => sfaceOnnxRows(index)).flat();

function sfaceOnnxListingLine(item) {
  return `ONNX[${String(item.layer).padStart(3, "0")}] ${item.op.padEnd(28)} ${item.name} : ${item.input} -> ${item.output}`;
}

function sfaceOnnxLineAnnotation(item) {
  const lang = document.documentElement.lang || "en";
  const say = (en, ru, he) => lang === "ru" ? ru : lang === "he" ? he : en;
  const dimensions = `${item.input} → ${item.output}`;
  if (item.op === "Const") return say(
    `Loads the learned scalar constant ${item.name} used by the following input-normalization arithmetic; output shape: ${item.output}.`,
    `Загружает обученную скалярную константу ${item.name}, которую использует следующая операция нормализации входа; форма выхода: ${item.output}.`,
    `טוענת את הקבוע הסקלרי המאומן ${item.name}, שבו משתמשת פעולת נרמול הקלט הבאה; צורת הפלט: ${item.output}.`
  );
  if (item.op.startsWith("NaryEltwise")) return say(
    `Applies the stated element-wise normalization operation with broadcasting. Tensor shapes: ${dimensions}.`,
    `Выполняет указанную поэлементную операцию нормализации с broadcasting. Формы тензоров: ${dimensions}.`,
    `מבצעת את פעולת הנרמול האיברית המצוינת עם broadcasting. צורות הטנזורים: ${dimensions}.`
  );
  if (item.op.startsWith("Convolution")) return say(
    `${item.op} applies the learned convolution kernel in node ${item.name}. Every output value is a weighted sum of an input neighbourhood plus bias; tensor shapes: ${dimensions}.`,
    `${item.op} применяет обученное ядро свёртки узла ${item.name}. Каждое выходное значение является взвешенной суммой входной окрестности со смещением; формы: ${dimensions}.`,
    `${item.op} מפעילה את kernel הקונבולוציה המאומן בצומת ${item.name}. כל ערך פלט הוא סכום משוקלל של סביבת קלט בתוספת bias; הצורות: ${dimensions}.`
  );
  if (item.op === "BatchNorm") return say(
    `Applies the learned BatchNorm scale and offset of ${item.name} channel by channel; the tensor shape remains ${item.output}.`,
    `Поканально применяет обученные масштаб и смещение BatchNorm узла ${item.name}; форма тензора остаётся ${item.output}.`,
    `מפעילה לכל ערוץ את מקדם הקנה וההיסט המאומנים של BatchNorm בצומת ${item.name}; צורת הטנזור נשארת ${item.output}.`
  );
  if (item.op === "PReLU") return say(
    `Applies PReLU in ${item.name}: positive values pass unchanged, while every negative value is multiplied by the learned channel slope. Shape: ${item.output}.`,
    `Применяет PReLU в ${item.name}: положительные значения проходят без изменения, а каждое отрицательное умножается на обученный коэффициент своего канала. Форма: ${item.output}.`,
    `מפעילה PReLU בצומת ${item.name}: ערכים חיוביים עוברים ללא שינוי, וכל ערך שלילי מוכפל בשיפוע המאומן של הערוץ. הצורה: ${item.output}.`
  );
  if (item.op === "Dropout") return say(
    `Passes the activation through the exported inference-mode Dropout node ${item.name}; during inference no random units are removed. Shape: ${item.output}.`,
    `Проводит активации через экспортированный узел Dropout ${item.name} в режиме инференса; при распознавании случайное отключение нейронов не выполняется. Форма: ${item.output}.`,
    `מעבירה את האקטיבציה דרך צומת Dropout המיוצא ${item.name} במצב הסקה; בזמן הסקה אין השמטה אקראית של יחידות. הצורה: ${item.output}.`
  );
  if (item.op === "Flatten") return say(
    `Executes the exact exported Flatten node ${item.name}. Its recorded tensor transformation is ${dimensions}.`,
    `Выполняет точный экспортированный узел Flatten ${item.name}. Зафиксированное преобразование тензора: ${dimensions}.`,
    `מבצעת את צומת Flatten המיוצא המדויק ${item.name}. שינוי צורת הטנזור הרשום הוא ${dimensions}.`
  );
  if (item.op === "Gemm") return say(
    `Performs the learned matrix multiplication in ${item.name}: a 1×50176 flattened feature row is multiplied by the 50176×128 weight matrix and bias is added, producing the 1×128 face embedding.`,
    `Выполняет обученное матричное умножение в ${item.name}: строка признаков 1×50176 умножается на матрицу весов 50176×128, затем прибавляется bias и получается вектор лица 1×128.`,
    `מבצעת את כפל המטריצות המאומן בצומת ${item.name}: שורת מאפיינים 1×50176 מוכפלת במטריצת משקלים 50176×128, מתווסף bias ומתקבל embedding פנים 1×128.`
  );
  return say(
    `Returns the final 1×128 embedding through the Identity output node ${item.name} without changing its values.`,
    `Передаёт итоговый вектор 1×128 через выходной узел Identity ${item.name}, не изменяя его значения.`,
    `מעבירה את ה-embedding הסופי 1×128 דרך צומת הפלט Identity ‏${item.name} ללא שינוי הערכים.`
  );
}

Object.assign(translations.en, {
  kicker: "NATIVE C++ / CUDA FACE RECOGNITION / AI MIPS HIVE",
  lead: "Run the native YuNet and SFace pipeline through CUDA or the sequential CPU baseline, inspect the exact C++/CUDA source, and open the integrated AI MIPS Hive view.",
  toolColab: "Native CUDA recognition engine",
  toolColabText: "Open the active C++ YuNet/SFace engine used by identity_cuda.exe.",
  toolAttention: "CUDA Attention course implementation",
  toolAttentionText: "Open the required Scaled Dot-Product Attention implementation: basic kernels, optimized tiled kernels, memory transfers, validation, and timing.",
  simpleNote: "Upload one screenshot, choose CUDA or CPU, and press Recognize.",
  dropHint: "Choose one screenshot for CUDA/CPU analysis.",
  howIntro: "This inspector documents the active native path: C++ image preparation and alignment, CUDA YuNet/SFace inference, the explicit sface_cuda.cu score kernel, and one Hive result.",
  variantKicker: "NATIVE C++ / CUDA RUNTIME",
  variantTitle: "Active recognition path",
  variantSingle: "Native CUDA recognition",
  modeExplainTitle: "CUDA and CPU mode",
  modeExplainText: "CUDA mode runs the YuNet and SFace ONNX graphs through CUDAExecutionProvider and uses a project-owned CUDA score kernel. Decode, NCHW preparation, YuNet output decoding, landmark alignment, thresholding, and JSON remain native C++ host work. CPU mode runs the same models sequentially for comparison.",
  sourceTitle: "Exact native C++/CUDA code in seven stages",
  sourceIntro: "The seven stages load exact blocks from sface_engine.cpp and sface_cuda.cu used by identity_cuda.exe. YuNet, alignment, SFace, CUDA comparison, and the final decision are separate so no inference step is hidden. The simple request has B=1; the same compiled code accepts larger Hive batches.",
  sourceLoading: "Loading the native C++/CUDA worker blocks…",
  sourceError: "Could not load or verify the native C++/CUDA worker blocks.",
  openRawDetectorSource: "Open active native CUDA engine source",
  fullStageExact: "Exact block from the active native worker",
  fullStageDetector: "Exact block from the active native worker",
  fullStageNotebook: "Exact block from the active native worker",
  sourceLoaded: "Verified: {total} exact source lines for the {variant} path = {sum} lines across stages 1–7."
});
Object.assign(translations.ru, {
  kicker: "NATIVE C++ / CUDA РАСПОЗНАВАНИЕ ЛИЦ / AI MIPS HIVE",
  lead: "Запустите native-конвейер YuNet и SFace через CUDA либо последовательный CPU baseline, изучите точный исходник C++/CUDA и откройте интегрированный AI MIPS Hive.",
  toolColab: "Native CUDA-движок распознавания",
  toolColabText: "Открыть активный C++-движок YuNet/SFace, используемый identity_cuda.exe.",
  toolAttention: "Курсовая реализация CUDA Attention",
  toolAttentionText: "Открыть обязательную реализацию Scaled Dot-Product Attention: базовые kernels, оптимизированные tiled kernels, переносы памяти, проверку и измерение времени.",
  simpleNote: "Загрузите один снимок, выберите CUDA или CPU и нажмите «Распознать».",
  dropHint: "Выберите один снимок для анализа через CUDA/CPU.",
  howIntro: "Инспектор описывает активный native-путь: подготовку и выравнивание в C++, инференс YuNet/SFace на CUDA, явный kernel оценок из sface_cuda.cu и один результат Hive.",
  variantKicker: "NATIVE C++ / CUDA RUNTIME",
  variantTitle: "Активный путь распознавания",
  variantSingle: "Native CUDA распознавание",
  modeExplainTitle: "Режимы CUDA и CPU",
  modeExplainText: "CUDA-режим выполняет ONNX-графы YuNet и SFace через CUDAExecutionProvider и использует собственный CUDA kernel оценок. Декодирование, подготовка NCHW, разбор выхода YuNet, landmark alignment, пороги и JSON остаются native C++ host-работой. CPU последовательно запускает те же модели для сравнения.",
  sourceTitle: "Точный native C++/CUDA код по семи этапам",
  sourceIntro: "Семь этапов загружают точные блоки sface_engine.cpp и sface_cuda.cu, используемые identity_cuda.exe. YuNet, выравнивание, SFace, CUDA-сравнение и итоговое решение показаны отдельно, поэтому ни один шаг инференса не скрыт. В простой демонстрации B=1; тот же скомпилированный код принимает большие пакеты Hive.",
  sourceLoading: "Загружаются блоки native C++/CUDA worker…",
  sourceError: "Не удалось загрузить или проверить блоки native C++/CUDA worker.",
  openRawDetectorSource: "Открыть активный native CUDA engine",
  fullStageExact: "Точный блок активного native worker",
  fullStageDetector: "Точный блок активного native worker",
  fullStageNotebook: "Точный блок активного native worker",
  sourceLoaded: "Проверено: {total} точных строк пути «{variant}» = {sum} строк на этапах 1–7."
});
Object.assign(translations.he, {
  kicker: "זיהוי פנים NATIVE C++ / CUDA / ‏AI MIPS HIVE",
  lead: "הריצו את צינור YuNet ו-SFace המקורי דרך CUDA או דרך קו הבסיס הסדרתי של CPU, בדקו את מקור C++/CUDA המדויק ופתחו את תצוגת AI MIPS Hive המשולבת.",
  toolColab: "מנוע זיהוי native CUDA",
  toolColabText: "פתיחת מנוע C++ הפעיל של YuNet/SFace שבו משתמש identity_cuda.exe.",
  toolAttention: "מימוש הקורס CUDA Attention",
  toolAttentionText: "פתיחת המימוש הנדרש של Scaled Dot-Product Attention: kernels בסיסיים, kernels מרוצפים וממוטבים, העברות זיכרון, אימות ומדידת זמן.",
  simpleNote: "העלו צילום מסך אחד, בחרו CUDA או CPU ולחצו על זיהוי.",
  dropHint: "בחרו צילום מסך אחד לניתוח באמצעות CUDA/CPU.",
  howIntro: "הבודק מתאר את מסלול ה-native הפעיל: הכנה ויישור ב-C++, הסקת YuNet/SFace ב-CUDA, ה-kernel המפורש מתוך sface_cuda.cu ותוצאת Hive אחת.",
  variantKicker: "NATIVE C++ / CUDA RUNTIME",
  variantTitle: "מסלול הזיהוי הפעיל",
  variantSingle: "זיהוי native CUDA",
  modeExplainTitle: "מצבי CUDA ו-CPU",
  modeExplainText: "מצב CUDA מריץ את גרפי ONNX של YuNet ושל SFace דרך CUDAExecutionProvider ומשתמש ב-CUDA kernel של הפרויקט לחישוב ציונים. פענוח, הכנת NCHW, פענוח פלט YuNet, יישור landmarks, ספים ו-JSON נשארים עבודת מארח ב-native C++. מצב CPU מריץ את אותם מודלים באופן סדרתי להשוואה.",
  sourceTitle: "קוד native C++/CUDA מדויק בשבעה שלבים",
  sourceIntro: "שבעת השלבים טוענים בלוקים מדויקים מתוך sface_engine.cpp ו-sface_cuda.cu שבהם משתמש identity_cuda.exe. ‏YuNet, יישור, SFace, השוואת CUDA וההחלטה הסופית מוצגים בנפרד, כך שאף שלב הסקה אינו מוסתר. בהדגמה הפשוטה B=1; אותו קוד מהודר מקבל אצוות Hive גדולות יותר.",
  sourceLoading: "טוען את בלוקי native C++/CUDA worker…",
  sourceError: "לא ניתן לטעון או לאמת את בלוקי native C++/CUDA worker.",
  openRawDetectorSource: "פתיחת מנוע native CUDA הפעיל",
  fullStageExact: "בלוק מדויק מתוך ה-native worker הפעיל",
  fullStageDetector: "בלוק מדויק מתוך ה-native worker הפעיל",
  fullStageNotebook: "בלוק מדויק מתוך ה-native worker הפעיל",
  sourceLoaded: "אומת: {total} שורות מקור מדויקות במסלול «{variant}» = {sum} שורות בשלבים 1–7."
});

Object.assign(translations.en, {
  kicker: "CUDA COURSE PROJECT / SCALED DOT-PRODUCT ATTENTION",
  title: "Scaled Dot-Product Attention on CUDA",
  lead: "Start with the required CUDA C/C++ Attention implementation: QK transpose, scaling, stable Softmax, P times V, validation, and timing. Face recognition is an additional CUDA demonstration below.",
  simpleKicker: "CUDA COURSE REQUIREMENT",
  simple: "Open CUDA Attention",
  simpleTitle: "Scaled Dot-Product Attention on CUDA",
  simpleNote: "The required CUDA Attention implementation is shown first. The native face-recognition demonstration appears below as an additional CUDA capability.",
  howKicker: "ADDITIONAL CUDA DEMONSTRATION",
  howTitle: "Face recognition with native C++ and CUDA",
  howIntro: "This separate, expanded demonstration follows one image through native C++ preparation, CUDA YuNet/SFace inference, an explicit CUDA score kernel, and one identity result. It supplements, but does not replace, the required Attention assignment."
});
Object.assign(translations.ru, {
  kicker: "КУРСОВОЙ CUDA-ПРОЕКТ / SCALED DOT-PRODUCT ATTENTION",
  title: "Scaled Dot-Product Attention на CUDA",
  lead: "Сначала показана обязательная реализация Attention на CUDA C/C++: QK transpose, масштабирование, стабильный Softmax, P умножить на V, проверка и измерение времени. Распознавание лиц ниже — дополнительная CUDA-демонстрация.",
  simpleKicker: "ОБЯЗАТЕЛЬНОЕ ЗАДАНИЕ CUDA-КУРСА",
  simple: "Открыть CUDA Attention",
  simpleTitle: "Scaled Dot-Product Attention на CUDA",
  simpleNote: "Сначала расположена обязательная реализация CUDA Attention. Native-демонстрация распознавания лиц ниже показывает дополнительные возможности CUDA.",
  howKicker: "ДОПОЛНИТЕЛЬНАЯ CUDA-ДЕМОНСТРАЦИЯ",
  howTitle: "Распознавание лиц на native C++ и CUDA",
  howIntro: "Это отдельная расширенная демонстрация: одно изображение проходит подготовку native C++, инференс YuNet/SFace на CUDA, явный CUDA kernel оценок и выдачу одной личности. Она дополняет, но не заменяет обязательное Attention-задание."
});
Object.assign(translations.he, {
  kicker: "פרויקט קורס CUDA / ‏SCALED DOT-PRODUCT ATTENTION",
  title: "Scaled Dot-Product Attention ב-CUDA",
  lead: "תחילה מוצג מימוש ה-Attention הנדרש ב-CUDA C/C++: ‏QK transpose, קנה מידה, Softmax יציב, P כפול V, אימות ומדידת זמן. זיהוי הפנים למטה הוא הדגמת CUDA נוספת.",
  simpleKicker: "דרישת קורס CUDA",
  simple: "פתיחת CUDA Attention",
  simpleTitle: "Scaled Dot-Product Attention ב-CUDA",
  simpleNote: "תחילה מוצג מימוש CUDA Attention הנדרש. הדגמת זיהוי הפנים ב-native למטה מציגה יכולות CUDA נוספות.",
  howKicker: "הדגמת CUDA נוספת",
  howTitle: "זיהוי פנים ב-native C++ וב-CUDA",
  howIntro: "זוהי הדגמה מורחבת ונפרדת: תמונה אחת עוברת הכנת native C++, הסקת YuNet/SFace ב-CUDA, kernel CUDA מפורש לציונים ותוצאת זהות אחת. היא משלימה את מטלת Attention אך אינה מחליפה אותה."
});

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
  stageCodeMode = "full";
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
  renderCourseRequirements();
  if (activeCourseRequirement) {
    const activeRequirement = courseRequirements.find((item) => item.key === activeCourseRequirement);
    if (activeRequirement) renderCourseProof(activeRequirement);
  }
  if (!imageInput.files?.length) renderPreviews([]);
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

function courseRequirementsText() {
  const lang = document.documentElement.lang || "en";
  return {
    en: {
      kicker: "CUDA COURSE REQUIREMENTS",
      title: "Walk through the exact CUDA Attention source",
      intro: "Choose an Attention execution stage or a course requirement. The complete final CUDA source stays open and scrolls to the exact implementation.",
      source: "Open final attention_cuda.cu",
      stages: "ATTENTION EXECUTION STAGES",
      checks: "COURSE REQUIREMENT CHECKS",
      proof: "SELECTED CUDA CODE STEP",
      stage: "Final course source",
      loading: "Loading the exact CUDA Attention source...",
      error: "The source could not be loaded. Use the source link above.",
      codeNote: "The full final source is shown; highlighted lines implement the selected item."
    },
    ru: {
      kicker: "ТРЕБОВАНИЯ CUDA-КУРСА",
      title: "Поэтапный разбор точного CUDA-исходника Attention",
      intro: "Выберите этап выполнения Attention или требование курса. Полный финальный CUDA-исходник остаётся открытым и прокручивается к точной реализации.",
      source: "Открыть финальный attention_cuda.cu",
      stages: "ЭТАПЫ ВЫПОЛНЕНИЯ ATTENTION",
      checks: "ПРОВЕРКИ ТРЕБОВАНИЙ КУРСА",
      proof: "ВЫБРАННЫЙ ШАГ CUDA-КОДА",
      stage: "Финальный исходник курса",
      loading: "Загружается точный CUDA Attention исходник...",
      error: "Не удалось загрузить исходник. Используйте ссылку выше.",
      codeNote: "Показан полный финальный исходник; подсвеченные строки реализуют выбранный пункт."
    },
    he: {
      kicker: "דרישות קורס CUDA",
      title: "מעבר שלבי על קוד ה-CUDA המדויק של Attention",
      intro: "בחרו שלב ביצוע של Attention או דרישת קורס. קוד ה-CUDA הסופי המלא נשאר פתוח וגולל אל המימוש המדויק.",
      source: "פתיחת attention_cuda.cu הסופי",
      stages: "שלבי ביצוע ATTENTION",
      checks: "בדיקות דרישות הקורס",
      proof: "שלב קוד CUDA שנבחר",
      stage: "קוד מקור סופי של הקורס",
      loading: "טוען את מקור CUDA Attention המדויק...",
      error: "לא ניתן לטעון את קוד המקור. השתמשו בקישור שמעל.",
      codeNote: "קוד המקור הסופי המלא מוצג; השורות המודגשות מממשות את הפריט שנבחר."
    }
  }[lang] || courseRequirementsText.en;
}

function attentionRequirementRange(lines, requirement) {
  const start = lines.findIndex((line) => requirement.start.test(line));
  if (start < 0) return { start: -1, end: -1 };
  if (requirement.wholeBlock) {
    let depth = 0;
    let opened = false;
    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index];
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      if (opens > 0) opened = true;
      depth += opens - closes;
      if (opened && depth === 0) return { start, end: index };
    }
  }
  const end = requirement.end
    ? lines.findIndex((line, index) => index >= start && requirement.end.test(line))
    : start;
  return { start, end: end >= start ? end : start };
}

function attentionSourceAnnotation(line, lineIndex = -1, lines = []) {
  const source = line.trim();
  const lang = document.documentElement.lang || "en";
  const say = (en, ru, he) => ({ en, ru, he }[lang] || en);
  const enclosingKernel = lineIndex >= 0
    ? [...lines.slice(0, lineIndex + 1)].reverse().find((item) => /__global__ void|void launch_pipeline|CudaRunResult run_cuda|std::vector<float> run_cpu_average/.test(item))?.trim() || ""
    : "";
  const isIn = (name) => enclosingKernel.includes(name);
  const ordinal = (pattern) => lineIndex >= 0
    ? lines.slice(0, lineIndex + 1).filter((item) => pattern.test(item)).length
    : 1;
  if (!source || source === "{" || source === "}") return "";
  if (source === "int main(int argc, char** argv) {") return say("Program entry point: it reads options, prepares data, runs CPU and CUDA variants, then reports the comparison.", "Точка входа программы: здесь читаются параметры, готовятся данные, запускаются CPU- и CUDA-варианты и выводится сравнение.", "נקודת הכניסה: קוראת אפשרויות, מכינה נתונים, מריצה גרסאות CPU ו-CUDA ומדפיסה השוואה.");
  if (source === "int n = 512;") return say("Sets the required sequence length N to 512 by default.", "Задаёт обязательную длину последовательности N = 512 по умолчанию.", "מגדירה את אורך הרצף הנדרש N = 512 כברירת מחדל.");
  if (source === "int d = 64;") return say("Sets the required vector dimension d to 64 by default.", "Задаёт обязательную размерность вектора d = 64 по умолчанию.", "מגדירה את ממד הווקטור הנדרש d = 64 כברירת מחדל.");
  if (/int warmup_iterations = 3/.test(source)) return say("Runs three warm-up passes that are not included in the timing result.", "Задаёт три прогревочных запуска, которые не входят в замер времени.", "מגדירה שלוש הרצות חימום שאינן נכללות במדידת הזמן.");
  if (/int iterations = 30/.test(source)) return say("Measures thirty runs and averages their time to reduce random variation.", "Задаёт 30 измеряемых запусков и усредняет их время, чтобы уменьшить случайные колебания.", "מגדירה 30 הרצות נמדדות וממוצע לזמן כדי לצמצם תנודות אקראיות.");
  if (/unsigned seed = 2026/.test(source)) return say("Fixes the random seed so the input data and benchmark can be reproduced.", "Фиксирует seed случайных чисел, чтобы входные данные и замер можно было повторить.", "מקבעת seed אקראי כדי שניתן יהיה לשחזר את נתוני הקלט ואת המדידה.");
  if (/float tolerance = 2\.0e-4f/.test(source)) return say("Sets the maximum allowed CPU/GPU output difference for a passing validation.", "Задаёт максимальное допустимое расхождение выходов CPU и GPU для успешной проверки.", "מגדירה את ההפרש המרבי המותר בין פלטי CPU ו-GPU לאימות מוצלח.");
  if (/std::string variant = "all"/.test(source)) return say("Selects both the basic and optimized CUDA implementations unless the user chooses one.", "По умолчанию выбирает и basic-, и optimized-вариант CUDA, если пользователь не указал один из них.", "בוחרת כברירת מחדל גם את גרסת CUDA הבסיסית וגם הממוטבת, אלא אם המשתמש בחר אחת מהן.");
  if (/std::filesystem::path csv_path/.test(source)) return say("Reserves an optional path for exporting reproducible benchmark results to CSV.", "Резервирует необязательный путь для выгрузки воспроизводимых результатов замера в CSV.", "שומרת נתיב אופציונלי לייצוא תוצאות benchmark שחזוריות ל-CSV.");
  if (/for \(int i = 1; i < argc; \+\+i\)/.test(source)) return say("Walks through the command-line options supplied to the executable.", "Перебирает параметры командной строки, переданные программе.", "עוברת על אפשרויות שורת הפקודה שנמסרו לתוכנית.");
  if (/const std::string argument = argv\[i\]/.test(source)) return say("Reads the current command-line option as text.", "Считывает текущий параметр командной строки как текст.", "קוראת את האפשרות הנוכחית משורת הפקודה כטקסט.");
  if (/auto value = \[&\]\(\)/.test(source)) return say("Creates a helper that safely obtains the value following an option such as --n.", "Создаёт помощник, который безопасно получает значение после параметра, например --n.", "יוצרת עזר שמקבל בבטחה את הערך שאחרי אפשרות כמו --n.");
  if (/\+\+i >= argc/.test(source)) return say("Stops with a clear error when an option is missing its required value.", "Останавливает программу с понятной ошибкой, если после параметра нет обязательного значения.", "עוצרת עם שגיאה ברורה כאשר לאפשרות חסר הערך הנדרש.");
  if (/return argv\[i\]/.test(source)) return say("Returns the value belonging to the current command-line option.", "Возвращает значение, принадлежащее текущему параметру командной строки.", "מחזירה את הערך ששייך לאפשרות הנוכחית.");
  if (/argument == "--n"/.test(source)) return say("Lets the user override the sequence length N for another test size.", "Позволяет пользователю изменить длину последовательности N для другого размера теста.", "מאפשרת למשתמש לשנות את אורך הרצף N לגודל בדיקה אחר.");
  if (/argument == "--d"/.test(source)) return say("Lets the user override the vector dimension d.", "Позволяет пользователю изменить размерность вектора d.", "מאפשרת למשתמש לשנות את ממד הווקטור d.");
  if (/argument == "--warmup"/.test(source)) return say("Lets the user choose how many unmeasured warm-up runs to perform.", "Позволяет пользователю выбрать число прогревочных запусков без замера.", "מאפשרת למשתמש לבחור את מספר הרצות החימום שאינן נמדדות.");
  if (/argument == "--iterations"/.test(source)) return say("Lets the user choose the number of timed repetitions.", "Позволяет пользователю выбрать число измеряемых повторов.", "מאפשרת למשתמש לבחור את מספר החזרות הנמדדות.");
  if (/argument == "--seed"/.test(source)) return say("Lets the user choose a different reproducible random input.", "Позволяет пользователю задать другой воспроизводимый случайный вход.", "מאפשרת למשתמש לבחור קלט אקראי אחר שניתן לשחזור.");
  if (/argument == "--tolerance"/.test(source)) return say("Lets the user adjust the validation tolerance.", "Позволяет пользователю изменить допуск проверки.", "מאפשרת למשתמש לשנות את טולרנס האימות.");
  if (/argument == "--variant"/.test(source)) return say("Lets the user run only the basic or only the optimized CUDA path.", "Позволяет запустить только basic- или только optimized-путь CUDA.", "מאפשרת להריץ רק את מסלול ה-CUDA הבסיסי או רק את הממוטב.");
  if (/argument == "--csv"/.test(source)) return say("Lets the user save the measured results in a CSV file.", "Позволяет сохранить результаты замера в CSV-файл.", "מאפשרת לשמור את תוצאות המדידה בקובץ CSV.");
  if (/CudaRunResult run_cuda/.test(source)) return say("Starts the host-side CUDA run: it allocates GPU buffers, transfers data, times kernels and reads the output back.", "Начинает CUDA-запуск на стороне host: выделяет GPU-буферы, передаёт данные, измеряет kernels и читает результат обратно.", "מתחילה הרצת CUDA בצד המארח: מקצה מאגרי GPU, מעבירה נתונים, מודדת kernels וקוראת את הפלט חזרה.");
  if (/qkv_bytes =/.test(source)) return say("Computes the byte size needed for one Q, K or V matrix on the GPU.", "Вычисляет размер в байтах для одной матрицы Q, K или V на GPU.", "מחשבת את מספר הבתים הדרוש למטריצת Q, K או V אחת ב-GPU.");
  if (/scores_bytes =/.test(source)) return say("Computes the larger byte size of the N by N score matrix.", "Вычисляет больший размер в байтах матрицы оценок N на N.", "מחשבת את מספר הבתים הגדול יותר של מטריצת הציונים N על N.");
  if (/cudaMalloc\(&memory\.q/.test(source)) return say("Allocates GPU memory for the query matrix Q.", "Выделяет GPU-память для матрицы запросов Q.", "מקצה זיכרון GPU למטריצת השאילתות Q.");
  if (/cudaMalloc\(&memory\.k/.test(source)) return say("Allocates GPU memory for the key matrix K.", "Выделяет GPU-память для матрицы ключей K.", "מקצה זיכרון GPU למטריצת המפתחות K.");
  if (/cudaMalloc\(&memory\.v/.test(source)) return say("Allocates GPU memory for the value matrix V.", "Выделяет GPU-память для матрицы значений V.", "מקצה זיכרון GPU למטריצת הערכים V.");
  if (/cudaMalloc\(&memory\.scores/.test(source)) return say("Allocates GPU memory for all QK Attention scores.", "Выделяет GPU-память для всех оценок QK Attention.", "מקצה זיכרון GPU לכל ציוני QK של Attention.");
  if (/cudaMalloc\(&memory\.output/.test(source)) return say("Allocates GPU memory for the final Attention output.", "Выделяет GPU-память для итогового выхода Attention.", "מקצה זיכרון GPU לפלט Attention הסופי.");
  if (/cudaMemcpy\(memory\.q/.test(source)) return say("Copies the Q input matrix from host RAM to its GPU buffer.", "Копирует входную матрицу Q из RAM host в её GPU-буфер.", "מעתיקה את מטריצת הקלט Q מזיכרון המארח למאגר ה-GPU שלה.");
  if (/cudaMemcpy\(memory\.k/.test(source)) return say("Copies the K input matrix from host RAM to its GPU buffer.", "Копирует входную матрицу K из RAM host в её GPU-буфер.", "מעתיקה את מטריצת הקלט K מזיכרון המארח למאגר ה-GPU שלה.");
  if (/cudaMemcpy\(memory\.v/.test(source)) return say("Copies the V input matrix from host RAM to its GPU buffer.", "Копирует входную матрицу V из RAM host в её GPU-буфер.", "מעתיקה את מטריצת הקלט V מזיכרון המארח למאגר ה-GPU שלה.");
  if (/cudaMemcpy\(result\.output/.test(source)) return say("Copies the completed Attention vectors from GPU memory back to the host result.", "Копирует готовые векторы Attention из GPU-памяти обратно в результат host.", "מעתיקה את וקטורי Attention המלאים מזיכרון ה-GPU חזרה לתוצאת המארח.");
  if (source === "const float* q,") return say("Receives the query matrix Q: one vector for every sequence position.", "Получает матрицу запросов Q: по одному вектору на каждую позицию последовательности.", "מקבלת את מטריצת השאילתות Q: וקטור אחד לכל מיקום ברצף.");
  if (source === "const float* k,") return say("Receives the key matrix K used to compare every query with every position.", "Получает матрицу ключей K для сравнения каждого запроса со всеми позициями.", "מקבלת את מטריצת המפתחות K להשוואת כל שאילתה עם כל מיקום.");
  if (source === "const float* probabilities,") return say("Receives the normalized attention probabilities produced by Softmax.", "Получает нормализованные вероятности Attention, созданные Softmax.", "מקבלת את הסתברויות Attention המנורמלות שנוצרו על ידי Softmax.");
  if (source === "const float* v,") return say("Receives the value matrix V whose information is combined by the attention weights.", "Получает матрицу значений V, информация из которой объединяется весами Attention.", "מקבלת את מטריצת הערכים V שהמידע ממנה משולב בעזרת משקלי Attention.");
  if (source === "float* scores,") return say("Provides writable GPU memory for the N by N similarity-score matrix.", "Передаёт доступную для записи GPU-память для матрицы оценок похожести N на N.", "מספקת זיכרון GPU לכתיבה עבור מטריצת ציוני הדמיון N על N.");
  if (source === "float* output,") return say("Provides writable GPU memory for the final Attention output vectors.", "Передаёт доступную для записи GPU-память для итоговых выходных векторов Attention.", "מספקת זיכרון GPU לכתיבה עבור וקטורי פלט Attention הסופיים.");
  if (source === "int n," && isIn("qk_matmul_basic")) return say("Passes the sequence length used to size both axes of the QK score matrix.", "Передаёт длину последовательности, которая задаёт обе оси матрицы оценок QK.", "מעבירה את אורך הרצף שקובע את שני צירי מטריצת ציוני QK.");
  if (source === "int d" && isIn("qk_matmul_basic")) return say("Passes the number of features multiplied inside each QK dot product.", "Передаёт число признаков, умножаемых внутри каждого скалярного произведения QK.", "מעבירה את מספר המאפיינים שמוכפלים בכל מכפלה פנימית של QK.");
  if (source === "int n" && isIn("row_softmax")) return say("Passes the number of scores in every Softmax row.", "Передаёт число оценок в каждой строке Softmax.", "מעבירה את מספר הציונים בכל שורת Softmax.");
  if (source === "int n," && isIn("attention_v_basic")) return say("Passes the number of probability columns summed for each output vector.", "Передаёт число столбцов вероятностей, суммируемых для каждого выходного вектора.", "מעבירה את מספר עמודות ההסתברות שמסוכמות לכל וקטור פלט.");
  if (source === "int d" && isIn("attention_v_basic")) return say("Passes the number of features written into every output vector.", "Передаёт число признаков, записываемых в каждый выходной вектор.", "מעבירה את מספר המאפיינים שנכתבים לכל וקטור פלט.");
  if (/const int column = blockIdx\.x/.test(source)) return say("Chooses the K-column handled by this thread in the score matrix.", "Выбирает столбец K матрицы оценок, который обрабатывает этот поток.", "בוחרת את עמודת K במטריצת הציונים שמטופלת על ידי thread זה.");
  if (/const int row = blockIdx\.y/.test(source) && isIn("qk_matmul_basic")) return say("Chooses the Q-row handled by this thread in the score matrix.", "Выбирает строку Q матрицы оценок, которую обрабатывает этот поток.", "בוחרת את שורת Q במטריצת הציונים שמטופלת על ידי thread זה.");
  if (/const int index = blockIdx\.x/.test(source)) return say("Assigns one linear score-array position to this scaling thread.", "Назначает этому потоку одну линейную позицию массива оценок для масштабирования.", "מקצה ל-thread זה מיקום ליניארי אחד במערך הציונים לקנה מידה.");
  if (/const int row = blockIdx\.x/.test(source) && isIn("row_softmax")) return say("Assigns one full score row to the current Softmax CUDA block.", "Назначает одну полную строку оценок текущему CUDA-блоку Softmax.", "מקצה שורת ציונים שלמה לבלוק ה-CUDA הנוכחי של Softmax.");
  if (/const int lane = threadIdx\.x/.test(source)) return say("Identifies this thread's lane inside the row-level Softmax block.", "Определяет номер текущего потока внутри блочного Softmax для одной строки.", "מזהה את ה-lane של thread זה בתוך בלוק Softmax של שורה אחת.");
  if (/float local_maximum = -CUDART_INF_F/.test(source)) return say("Starts this thread's local maximum at negative infinity before scanning its score columns.", "Начинает локальный максимум потока с минус бесконечности перед просмотром его столбцов оценок.", "מאתחלת את המקסימום המקומי של ה-thread למינוס אינסוף לפני סריקת עמודות הציונים שלו.");
  if (/for \(int column = lane; column < n; column \+= blockDim\.x\)/.test(source) && ordinal(/for \(int column = lane;/) === 1) return say("Distributes the row's columns across the threads while searching for the maximum.", "Распределяет столбцы строки между потоками при поиске максимума.", "מחלקת את עמודות השורה בין ה-threads בעת חיפוש המקסימום.");
  if (/local_maximum = fmaxf/.test(source)) return say("Updates this thread's local maximum with the next score it owns.", "Обновляет локальный максимум потока следующей принадлежащей ему оценкой.", "מעדכנת את המקסימום המקומי של ה-thread עם הציון הבא ששייך לו.");
  if (/scratch\[lane\] = local_maximum/.test(source)) return say("Stores each thread's local maximum in shared memory for the block reduction.", "Сохраняет локальный максимум каждого потока в shared memory для редукции блока.", "שומרת את המקסימום המקומי של כל thread בזיכרון משותף עבור רדוקציית הבלוק.");
  if (/for \(int stride = blockDim\.x \/ 2/.test(source) && ordinal(/for \(int stride = blockDim\.x \/ 2/) === 1) return say("Begins the tree reduction that combines all local maxima into one row maximum.", "Начинает древовидную редукцию, объединяющую локальные максимумы в максимум строки.", "מתחילה רדוקציית עץ שמאחדת את המקסימומים המקומיים למקסימום שורה אחד.");
  if (/scratch\[lane\] = fmaxf/.test(source)) return say("Combines two shared-memory maxima during this reduction step.", "Объединяет два максимума из shared memory на текущем шаге редукции.", "מאחדת שני מקסימומים מהזיכרון המשותף בצעד רדוקציה זה.");
  if (/const float row_maximum = scratch\[0\]/.test(source)) return say("Reads the completed maximum score for this row before exponentiation.", "Считывает готовый максимум оценок строки перед вычислением экспоненты.", "קוראת את הציון המרבי המלא של השורה לפני חישוב האקספוננטה.");
  if (/float local_sum = 0\.0f/.test(source)) return say("Starts this thread's partial sum of exponentiated scores at zero.", "Начинает частичную сумму экспонент оценок для потока с нуля.", "מאתחלת את הסכום החלקי של ציונים שעברו אקספוננטה לאפס.");
  if (/const float value = expf/.test(source)) return say("Subtracts the row maximum before exp, preventing numerical overflow.", "Вычитает максимум строки перед exp, предотвращая численное переполнение.", "מחסירה את מקסימום השורה לפני exp וכך מונעת גלישה נומרית.");
  if (/scores\[row \* n \+ column\] = value/.test(source)) return say("Replaces the raw score with its exponentiated unnormalized probability.", "Заменяет исходную оценку её экспонентой, то есть ненормализованной вероятностью.", "מחליפה את הציון הגולמי בהסתברות הלא מנורמלת שלו לאחר אקספוננטה.");
  if (/local_sum \+= value/.test(source)) return say("Adds this probability contribution to the thread's partial row sum.", "Добавляет этот вклад вероятности к частичной сумме строки потока.", "מוסיפה את תרומת ההסתברות לסכום השורה החלקי של ה-thread.");
  if (/scratch\[lane\] = local_sum/.test(source)) return say("Moves each partial probability sum into shared memory for a second reduction.", "Переносит частичную сумму вероятностей каждого потока в shared memory для второй редукции.", "מעבירה את סכום ההסתברויות החלקי של כל thread לזיכרון משותף עבור רדוקציה שנייה.");
  if (/scratch\[lane\] \+= scratch\[lane \+ stride\]/.test(source)) return say("Combines partial sums until the block has the total Softmax denominator.", "Объединяет частичные суммы, пока блок не получит полный знаменатель Softmax.", "מאחדת סכומים חלקיים עד שלבלוק יש את המכנה המלא של Softmax.");
  if (/const float inverse_sum = 1\.0f \/ scratch\[0\]/.test(source)) return say("Builds the reciprocal of the full row sum used for normalization.", "Получает обратную величину полной суммы строки для нормализации.", "יוצרת את ההופכי של סכום השורה המלא לנרמול.");
  if (/scores\[row \* n \+ column\] \*= inverse_sum/.test(source)) return say("Normalizes every exponentiated score so the row probabilities sum to one.", "Нормализует каждую экспоненту оценки, чтобы вероятности строки давали сумму один.", "מנרמלת כל ציון שעבר אקספוננטה כך שהסתברויות השורה יסתכמו לאחת.");
  if (/const int feature = blockIdx\.x/.test(source)) return say("Chooses one output-feature position for this P times V calculation.", "Выбирает одну позицию выходного признака для текущего вычисления P на V.", "בוחרת מיקום של מאפיין פלט אחד לחישוב P כפול V זה.");
  if (/const int row = blockIdx\.y/.test(source) && isIn("attention_v_basic")) return say("Chooses the sequence row whose Attention output is being built.", "Выбирает строку последовательности, для которой строится выход Attention.", "בוחרת את שורת הרצף שעבורה נבנה פלט Attention.");
  if (/float sum = 0\.0f/.test(source) && isIn("attention_v_basic")) return say("Starts the weighted value sum for this output feature at zero.", "Начинает взвешенную сумму значений для этого выходного признака с нуля.", "מאתחלת את סכום הערכים המשוקלל עבור מאפיין פלט זה לאפס.");
  if (/for \(int column = 0; column < n; \+\+column\)/.test(source)) return say("Visits every value row that can contribute to this Attention output.", "Проходит по всем строкам значений, которые могут внести вклад в выход Attention.", "עוברת על כל שורות הערכים שיכולות לתרום לפלט Attention זה.");
  if (/sum \+= probabilities/.test(source)) return say("Multiplies one attention probability by its V feature and accumulates the result.", "Умножает одну вероятность Attention на соответствующий признак V и накапливает результат.", "מכפילה הסתברות Attention אחת במאפיין V המתאים וצוברת את התוצאה.");
  if (/output\[row \* d \+ feature\] = sum/.test(source)) return say("Writes the completed Attention feature for this sequence row.", "Записывает готовый признак Attention для этой строки последовательности.", "כותבת את מאפיין Attention המלא עבור שורת רצף זו.");
  if (source.startsWith("__global__")) return say("Declares a CUDA kernel executed by many GPU threads.", "Объявляет CUDA kernel, выполняемый множеством потоков GPU.", "מכריזה על CUDA kernel שמבוצע על ידי threads רבים של GPU.");
  if (/blockIdx|threadIdx/.test(source)) return say("Maps this thread to one logical output coordinate.", "Сопоставляет текущий поток с координатой логического выходного элемента.", "ממפה את ה-thread הנוכחי לקואורדינטטה לוגית של פלט.");
  if (/row >= n|column >= n|feature >= d|index < count/.test(source)) return say("Boundary check: extra threads leave without accessing invalid memory.", "Boundary check: лишние потоки завершаются без доступа к недопустимой памяти.", "בדיקת גבול: threads עודפים מסיימים ללא גישה לזיכרון לא תקין.");
  if (/sum \+= q\[/.test(source)) return say("Accumulates one Q row against one K row: one QK transpose score.", "Накапливает одну строку Q по одной строке K: один элемент QK transpose.", "צובר שורת Q מול שורת K אחת: ציון אחד של QK transpose.");
  if (/scores\[.*\] = sum/.test(source)) return say("Writes the completed score into the QK score matrix.", "Записывает готовую оценку в матрицу QK.", "כותבת את הציון המלא למטריצת QK.");
  if (/sqrt\(static_cast<float>\(d\)\)/.test(source)) return say("Computes the required 1 divided by sqrt(d) scale factor.", "Вычисляет обязательный коэффициент 1 / sqrt(d).", "מחשבת את מקדם הקנה הנדרש 1 / sqrt(d).");
  if (/scores\[index\] \*= scale/.test(source)) return say("Applies the scale factor to every QK score in the basic CUDA path.", "Применяет масштабирование к каждой QK-оценке в basic CUDA-пути.", "מחילה את מקדם הקנה על כל ציון QK במסלול CUDA הבסיסי.");
  if (/local_maximum|row_maximum/.test(source)) return say("Finds the maximum of this row before exponentiation for numerical stability.", "Находит максимум строки до экспоненты для численной стабильности.", "מוצאת את מקסימום השורה לפני האקספוננטה ליציבות נומרית.");
  if (/__syncthreads/.test(source)) return say("Synchronizes the block before shared memory is read or reused.", "Синхронизирует block перед чтением или повторным использованием shared memory.", "מסנכרנת את ה-block לפני קריאה או שימוש חוזר ב-shared memory.");
  if (/expf\(/.test(source)) return say("Exponentiates the score after subtracting the row maximum.", "Вычисляет экспоненту оценки после вычитания максимума строки.", "מחשבת אקספוננטה של הציון לאחר חיסור מקסימום השורה.");
  if (/inverse_sum|\*= inverse_sum/.test(source)) return say("Normalizes the row so its Softmax probabilities sum to one.", "Нормализует строку, чтобы вероятности Softmax давали сумму один.", "מנרמלת את השורה כך שהסתברויות Softmax יסתכמו לאחת.");
  if (/sum \+= probabilities/.test(source)) return say("Accumulates one P row times one V column for the Attention output.", "Накапливает одну строку P на один столбец V для выхода Attention.", "צוברת שורת P אחת כפול עמודת V אחת עבור פלט Attention.");
  if (/cudaMalloc/.test(source)) return say("Allocates an explicit device-memory buffer on the GPU.", "Выделяет явный буфер device-памяти на GPU.", "מקצה מאגר זיכרון מפורש על ה-GPU.");
  if (/cudaMemcpy/.test(source)) return say("Copies data between host RAM and GPU device memory.", "Копирует данные между host RAM и device-памятью GPU.", "מעתיקה נתונים בין RAM של המארח לזיכרון ההתקן של GPU.");
  if (/cudaEvent/.test(source)) return say("Uses CUDA events to measure completed GPU kernel time.", "Использует CUDA events для измерения завершённого времени GPU kernels.", "משתמשת באירועי CUDA למדידת זמן kernels שהושלמו ב-GPU.");
  if (/compare_outputs|maximum_absolute|verification/.test(source)) return say("Compares the CUDA output with the CPU reference within the allowed tolerance.", "Сравнивает CUDA-выход с CPU-эталоном в пределах заданного допуска.", "משווה את פלט ה-CUDA לייחוס ה-CPU בתוך הטולרנס המותר.");
  if (/run_cpu_average\(/.test(source)) return say("Runs the CPU implementation used as the correctness reference for CUDA.", "Запускает CPU-реализацию, которая служит эталоном корректности для CUDA.", "מריצה את מימוש ה-CPU שמשמש כייחוס נכונות ל-CUDA.");
  if (/scaled_dot_product_attention_cpu_into/.test(source)) return say("Calls the sequential CPU Attention calculation for the same Q, K and V values.", "Вызывает последовательный расчёт Attention на CPU для тех же Q, K и V.", "קוראת לחישוב Attention סדרתי ב-CPU עבור אותם Q, K ו-V.");
  if (/total_milliseconds \+= timing\.milliseconds/.test(source)) return say("Adds this CPU run to the total time used for the average.", "Добавляет время текущего запуска CPU к сумме для среднего значения.", "מוסיפה את זמן הרצת ה-CPU הנוכחית לסכום עבור הממוצע.");
  if (/average_milliseconds =/.test(source)) return say("Computes the average CPU reference time across the measured runs.", "Вычисляет среднее время CPU-эталона по измеренным запускам.", "מחשבת את זמן ייחוס ה-CPU הממוצע על פני ההרצות הנמדדות.");
  if (/void launch_pipeline/.test(source)) return say("Coordinates the four Attention operations in their execution order.", "Координирует четыре операции Attention в порядке их выполнения.", "מתאמת את ארבע פעולות Attention בסדר הביצוע שלהן.");
  if (/const dim3 block/.test(source)) return say("Defines a 16 by 16 CUDA thread block for the matrix operations.", "Задаёт CUDA-блок 16 на 16 потоков для матричных операций.", "מגדירה בלוק CUDA של 16 על 16 threads עבור פעולות מטריצה.");
  if (/score_grid|output_grid/.test(source)) return say("Calculates enough CUDA blocks to cover every output element, including partial edges.", "Вычисляет число CUDA-блоков, достаточное для покрытия каждого элемента выхода, включая неполные края.", "מחשבת מספיק בלוקי CUDA לכיסוי כל איבר פלט, כולל קצוות חלקיים.");
  if (/qk_matmul_tiled_scaled/.test(source)) return say("Launches the optimized tiled QK kernel, which applies scaling in the same pass.", "Запускает оптимизированный tiled QK-kernel, который применяет масштабирование за тот же проход.", "מפעילה kernel QK ממוטב ומרוצף שמחיל קנה מידה באותו מעבר.");
  if (/qk_matmul_basic/.test(source)) return say("Launches the basic QK kernel before the separate scaling kernel.", "Запускает базовый QK-kernel перед отдельным kernel масштабирования.", "מפעילה kernel QK בסיסי לפני kernel קנה המידה הנפרד.");
  if (/row_softmax<</.test(source)) return say("Launches one CUDA block per score row to compute stable Softmax.", "Запускает один CUDA-блок на строку оценок для стабильного Softmax.", "מפעילה בלוק CUDA אחד לכל שורת ציונים לחישוב Softmax יציב.");
  if (/attention_v_tiled/.test(source)) return say("Launches the optimized tiled multiplication of probabilities by V.", "Запускает оптимизированное tiled-умножение вероятностей на V.", "מפעילה כפל ממוטב ומרוצף של ההסתברויות ב-V.");
  if (/attention_v_basic/.test(source)) return say("Launches the basic multiplication of probabilities by V.", "Запускает базовое умножение вероятностей на V.", "מפעילה את הכפל הבסיסי של ההסתברויות ב-V.");
  if (/cudaGetLastError/.test(source)) return say("Checks immediately whether a CUDA kernel launch failed.", "Сразу проверяет, не завершился ли запуск CUDA-kernel ошибкой.", "בודקת מיד אם שיגור kernel CUDA נכשל.");
  return "";
}

function renderCourseRequirements() {
  if (!courseRequirementButtons) return;
  const text = courseRequirementsText();
  courseRequirementsKicker.textContent = text.kicker;
  courseRequirementsTitle.textContent = text.title;
  courseRequirementsIntro.textContent = text.intro;
  courseRequirementsSource.textContent = text.source;
  requirementProofKicker.textContent = text.proof;
  if (attentionStagesLabel) attentionStagesLabel.textContent = text.stages;
  if (courseRequirementListLabel) courseRequirementListLabel.textContent = text.checks;
  if (attentionStageButtons) {
    attentionStageButtons.innerHTML = "";
    attentionStages.forEach((stage) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attention-stage-button";
      const active = activeAttentionStage === stage.key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-label", `${stage.number}. ${localized(stage.label)}`);
      const number = document.createElement("span");
      number.className = "attention-stage-number";
      number.textContent = stage.number;
      const details = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = localized(stage.label);
      const note = document.createElement("small");
      note.textContent = localized(stage.note);
      details.append(title, note);
      button.append(number, details);
      button.addEventListener("click", () => openAttentionStage(stage));
      attentionStageButtons.appendChild(button);
    });
  }
  courseRequirementButtons.innerHTML = "";
  courseRequirements.forEach((requirement) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "requirement-button";
    button.textContent = localized(requirement.label);
    const active = activeCourseRequirement === requirement.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.addEventListener("click", () => openCourseRequirement(requirement));
    courseRequirementButtons.appendChild(button);
  });
}

async function renderCourseProof(requirement) {
  if (!requirementProof || !requirementCode) return;
  const text = courseRequirementsText();
  requirementProof.classList.remove("hidden");
  requirementProofTitle.textContent = localized(requirement.label);
  requirementProofText.textContent = `${localized(requirement.text)} ${text.codeNote}`;
  requirementProofStage.textContent = "final attention_cuda.cu";
  if (!attentionCourseSource) {
    requirementCode.textContent = text.loading;
    try {
      const response = await fetch(finalAttentionSourceUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      attentionCourseSource = await response.text();
    } catch (error) {
      console.error("Could not load CUDA Attention source", error);
      requirementCode.textContent = text.error;
      return;
    }
  }
  const lines = attentionCourseSource.replace(/\r\n/g, "\n").split("\n");
  const range = attentionRequirementRange(lines, requirement);
  if (range.start < 0) {
    requirementCode.textContent = text.error;
    return;
  }
  requirementCode.innerHTML = "";
  let firstFocused = null;
  const usedAnnotations = new Set();
  lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    const code = document.createElement("code");
    code.textContent = `${String(index + 1).padStart(3, " ")}  ${line || " "}`;
    const note = document.createElement("span");
    note.className = "code-note";
    const selected = index >= range.start && index <= range.end;
    const annotation = selected ? attentionSourceAnnotation(line, index, lines) : "";
    note.textContent = annotation && !usedAnnotations.has(annotation) ? annotation : "";
    if (note.textContent) usedAnnotations.add(note.textContent);
    row.append(code, note);
    if (selected) {
      row.classList.add("code-focus");
      if (!firstFocused) firstFocused = row;
    }
    if (index === range.start) row.classList.add("code-focus-start");
    if (index === range.end) row.classList.add("code-focus-end");
    requirementCode.appendChild(row);
  });
  if (firstFocused) {
    requestAnimationFrame(() => {
      requirementCode.scrollTop = Math.max(0, firstFocused.offsetTop - requirementCode.offsetTop - 18);
    });
  }
}

function focusCourseStageSubstep(requirement) {
  const stage = stageDetails[currentStageIndex];
  if (!stage) return;
  activeStageFiveCodeStep = requirement.step;
  renderStageCode(stage);
  const labels = localized(stage.diagram);
  buildStageDiagram(labels, detectorDiagramNotes(stage, labels), stage);
}

function openCourseRequirement(requirement) {
  activeCourseRequirement = requirement.key;
  activeAttentionStage = attentionStages.some((stage) => stage.key === requirement.key) ? requirement.key : "";
  renderCourseRequirements();
  renderCourseProof(requirement);
  requirementProof.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openAttentionStage(stage) {
  const requirement = courseRequirements.find((item) => item.key === stage.key);
  if (!requirement) return;
  activeAttentionStage = stage.key;
  activeCourseRequirement = requirement.key;
  renderCourseRequirements();
  renderCourseProof(requirement);
  requirementProof.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const codeAnnotationFallback = {
  en: "This line belongs to the one-screenshot CUDA detector pipeline for the selected stage.",
  ru: "Эта строка относится к CUDA-конвейеру одного снимка на выбранном этапе.",
  he: "השורה הזו שייכת לצינור גלאי CUDA של צילום מסך אחד בשלב הנבחר."
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

Object.assign(detailedCodeLineAnnotations, {
  "continue": {
    en: "Skips the remaining statements for the current item and continues with the next item in the surrounding loop.",
    ru: "Пропускает оставшиеся команды для текущего элемента и переходит к следующему элементу окружающего цикла.",
    he: "מדלגת על שאר הפקודות עבור האיבר הנוכחי וממשיכה לאיבר הבא בלולאה שמסביב."
  },
  "return {": {
    en: "Starts the Python dictionary returned to the caller; Hive later serializes these fields as JSON.",
    ru: "Начинает Python-словарь, возвращаемый вызывающему коду; затем Hive сериализует эти поля в JSON.",
    he: "פותחת מילון Python שמוחזר לקוד הקורא; לאחר מכן Hive מסדרת את השדות האלה כ-JSON."
  },
  "}": {
    en: "Closes the current Python dictionary or grouped expression; it performs no separate computation.",
    ru: "Закрывает текущий Python-словарь либо сгруппированное выражение; отдельного вычисления строка не выполняет.",
    he: "סוגרת את מילון Python או את הביטוי המקובץ הנוכחי; השורה אינה מבצעת חישוב נפרד."
  }
});

const sourceImportMeaning = {
  cv2: { ru: "для декодирования файла изображения перед единственной загрузкой в CUDA", he: "לפענוח קובץ התמונה לפני ההעלאה היחידה ל-CUDA" },
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
  onnxruntime: { ru: "для запуска YuNet и SFace через CUDAExecutionProvider", he: "להרצת YuNet ו-SFace באמצעות CUDAExecutionProvider" },
  fastapi: { ru: "для HTTP-API детектора", he: "ל-HTTP API של הגלאי" }
};

const sourceFunctionMeaning = {
  _initialize_cuda_pipeline: { ru: "проверяет CUDA и размещает кэшированные эталонные векторы в видеопамяти", he: "בודקת את CUDA ומציבה את embeddings הייחוס השמורים בזיכרון הכרטיס" },
  _run_ort_cuda: { ru: "запускает ONNX Runtime через I/O binding, сохраняя входы и выходы на CUDA", he: "מריצה ONNX Runtime באמצעות I/O binding תוך שמירת הקלט והפלט ב-CUDA" },
  _create_cuda_session: { ru: "создаёт и проверяет CUDA-сессию модели SFace", he: "יוצרת ומאמתת סשן CUDA של מודל SFace" },
  _create_cuda_yunet_session: { ru: "создаёт и проверяет CUDA-сессию детектора YuNet", he: "יוצרת ומאמתת סשן CUDA של גלאי YuNet" },
  _prepare_cuda_detection_batch: { ru: "загружает единственный снимок и выполняет resize, нормализацию и padding на CUDA", he: "מעלה את צילום המסך היחיד ומבצעת שינוי גודל, נרמול וריפוד ב-CUDA" },
  _decode_yunet_faces_cuda: { ru: "декодирует рамку лица и пять ориентиров прямо в CUDA-тензорах", he: "מפענחת את תיבת הפנים ואת חמש נקודות הציון ישירות בטנזורי CUDA" },
  _align_faces_cuda: { ru: "выравнивает лицо по пяти ориентирам через CUDA grid_sample", he: "מיישרת את הפנים לפי חמש נקודות באמצעות CUDA grid_sample" },
  _score_vectors_cuda: { ru: "сравнивает SFace-вектор со всеми кэшированными эталонами на GPU", he: "משווה את embedding של SFace לכל הייחוסים השמורים ב-GPU" },
  verify_batch: { ru: "в этой демонстрации выполняет полный CUDA-путь для списка ровно из одного снимка", he: "בהדגמה הזו מריצה את מסלול CUDA המלא עבור רשימה ובה צילום מסך אחד בדיוק" },
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
  if (/cv2\.imread\s*\(/.test(text)) return say(
    "Decodes the one compressed PNG/JPEG screenshot in host memory. This codec step is the only full-image CPU stage before one CUDA upload.",
    "Декодирует единственный сжатый PNG/JPEG-снимок в RAM. Этот этап кодека — единственная полноразмерная CPU-операция до одной загрузки в CUDA.",
    "מפענחת את צילום המסך הדחוס היחיד מסוג PNG/JPEG בזיכרון המארח. שלב הקודק הזה הוא פעולת ה-CPU היחידה על התמונה המלאה לפני העלאה אחת ל-CUDA."
  );
  if (/CUDAExecutionProvider/.test(text)) return say(
    "Names or verifies ONNX Runtime's NVIDIA CUDA provider. The session is rejected when this provider is not first and active.",
    "Задаёт или проверяет NVIDIA CUDA provider среды ONNX Runtime. Сессия отклоняется, если этот provider не является первым и активным.",
    "מציינת או מאמתת את ספק CUDA של NVIDIA ב-ONNX Runtime. הסשן נדחה אם provider זה אינו הראשון והפעיל."
  );
  if (/io_binding\(\)|bind_ortvalue_input|bind_output|run_with_iobinding|from_dlpack/.test(text)) return say(
    "Uses zero-copy-style CUDA I/O binding so the ONNX model consumes and produces device tensors without an intermediate NumPy/CPU round trip.",
    "Использует CUDA I/O binding, чтобы ONNX-модель принимала и возвращала GPU-тензоры без промежуточного прохода через NumPy/CPU.",
    "משתמשת ב-CUDA I/O binding כדי שמודל ONNX יקבל ויחזיר טנזורי התקן ללא מעבר ביניים דרך NumPy/CPU."
  );
  if (/\.to\(device="cuda"|device="cuda"/.test(text)) return say(
    "Places this tensor directly in NVIDIA CUDA memory. For the screenshot tensor, this is the single host-to-device image transfer.",
    "Размещает тензор непосредственно в памяти NVIDIA CUDA. Для тензора снимка это единственный перенос изображения host→device.",
    "מציבה את הטנזור ישירות בזיכרון NVIDIA CUDA. עבור טנזור צילום המסך זו העברת התמונה היחידה מן המארח להתקן."
  );
  if (/functional\.(interpolate|pad)|torch\.stack\(/.test(text)) return say(
    "Performs resize, padding, or tensor assembly on CUDA after the screenshot has been uploaded; no prepared image is copied back to the CPU.",
    "Выполняет resize, padding либо сборку тензора на CUDA после загрузки снимка; подготовленное изображение не копируется обратно на CPU.",
    "מבצעת שינוי גודל, ריפוד או הרכבת טנזור ב-CUDA לאחר העלאת צילום המסך; התמונה המוכנה אינה מועתקת בחזרה ל-CPU."
  );
  if (/YUNET_OUTPUT_NAMES|yunet_outputs|_decode_yunet_faces_cuda/.test(text)) return say(
    "Handles YuNet detector outputs for the one screenshot: confidence, face box, and five landmarks remain CUDA tensors.",
    "Обрабатывает выходы YuNet для одного снимка: confidence, рамка лица и пять ориентиров остаются CUDA-тензорами.",
    "מטפלת בפלטי YuNet עבור צילום המסך היחיד: confidence, תיבת הפנים וחמש נקודות הציון נשארים טנזורי CUDA."
  );
  if (/grid_sample|affine_grid|torch\.linalg\.(lstsq|inv)/.test(text)) return say(
    "Computes or applies the five-landmark similarity transform on CUDA to produce the aligned 112x112 SFace input.",
    "Вычисляет или применяет similarity-преобразование по пяти ориентирам на CUDA, создавая выровненный вход SFace 112x112.",
    "מחשבת או מחילה ב-CUDA את טרנספורמציית הדמיון לפי חמש נקודות כדי ליצור קלט SFace מיושר בגודל 112x112."
  );
  if (!/\.cpu\(\)/.test(text) && /functional\.normalize|reference_vectors|score_matrix|match_matrix|torch\.max\(/.test(text)) return say(
    "Normalizes or compares SFace embeddings against the cached reference matrix on CUDA and keeps the best score/index per identity.",
    "Нормализует либо сравнивает SFace-векторы с кэшированной матрицей эталонов на CUDA и сохраняет лучшую оценку/индекс каждой личности.",
    "מנרמלת או משווה embeddings של SFace למטריצת הייחוס השמורה ב-CUDA ושומרת את הציון והאינדקס הטובים לכל זהות."
  );
  if (/\.cpu\(\)\.(tolist|numpy)|\.cpu\(\)/.test(text)) return say(
    "Copies only the final small validity, score, or reference-index result to host memory after GPU inference and scoring have finished.",
    "Копирует в RAM только итоговую маленькую маску, оценки либо индексы эталонов после завершения инференса и сравнения на GPU.",
    "מעתיקה לזיכרון המארח רק את מסכת התקפות, הציונים או אינדקסי הייחוס הקטנים לאחר שההסקה וההשוואה ב-GPU הסתיימו."
  );
  if (/precision\s*=\s*"fp16" if len\(image_paths\) >= 100 else "fp32"/.test(text)) return say(
    "Selects FP32 for this one-screenshot request. FP16 is used only by large batch requests and is not active in the simple demo.",
    "Выбирает FP32 для запроса одного снимка. FP16 используется только большими пачками и в простой демонстрации не активен.",
    "בוחרת FP32 עבור בקשת צילום המסך היחיד. FP16 משמש רק אצוות גדולות ואינו פעיל בהדגמה הפשוטה."
  );
  if (/cpu_intermediate_count/.test(text)) return say(
    "Reports zero CPU intermediates: detection, landmark decoding, alignment, SFace, and reference scoring all remained on CUDA.",
    "Сообщает ноль CPU-intermediate: детекция, декодирование ориентиров, выравнивание, SFace и сравнение с эталонами оставались на CUDA.",
    "מדווחת על אפס נתוני ביניים ב-CPU: הזיהוי, פענוח נקודות הציון, היישור, SFace והשוואת הייחוסים נשארו כולם ב-CUDA."
  );
  if (/^[A-Za-z_]\w*\[[^\]]+\]\s*=\s*\{$/.test(text)) return say(
    "Starts the structured result dictionary for this screenshot position; the following fields describe its identity and measured scores.",
    "Начинает структурированный словарь результата для этой позиции снимка; следующие поля описывают личность и измеренные оценки.",
    "פותחת מילון תוצאה מובנה עבור מיקום צילום המסך הזה; השדות הבאים מתארים את הזהות ואת הציונים שנמדדו."
  );
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
      "Embeds every crop derived from this one screenshot in one model call and stores both the [V,160] matrix and the actual CPU/CUDA device used.",
      "Одним вызовом модели получает признаки всех обрезок одного скриншота и сохраняет матрицу [V,160] вместе с фактически использованным CPU/CUDA-устройством.",
      "מחשבת בקריאת מודל אחת embeddings לכל החיתוכים של צילום המסך היחיד ושומרת את מטריצת [V,160] ואת התקן CPU/CUDA שבו נעשה שימוש בפועל."
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
      _initialize_cuda_pipeline: "validates CUDA and places cached reference embeddings in GPU memory",
      _run_ort_cuda: "executes ONNX Runtime with CUDA I/O binding so inputs and outputs stay on the device",
      _create_cuda_session: "creates and validates the CUDA SFace session",
      _create_cuda_yunet_session: "creates and validates the CUDA YuNet session",
      _prepare_cuda_detection_batch: "uploads the screenshot and performs CUDA resize, normalization, and padding",
      _decode_yunet_faces_cuda: "decodes the face box and five landmarks directly in CUDA tensors",
      _align_faces_cuda: "aligns the detected face from five landmarks with CUDA grid sampling",
      _score_vectors_cuda: "compares the SFace embedding with every cached reference on the GPU",
      verify_batch: "runs the full CUDA verifier; this page calls it with exactly one screenshot",
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

function cudaSingleSourceAnnotation(text, lang) {
  const say = (en, ru, he) => lang === "ru" ? ru : lang === "he" ? he : en;
  const exact = {
    "x = F.relu(F.conv2d(x, self.conv1_w, self.conv1_b))": [
      "Conv1 slides 20 learned 4×4×3 filters over [V,3,55,47]. Each output value is 48 multiply-adds plus one bias; ReLU replaces negative values with zero. Result: [V,20,52,44]. V means crops of this one screenshot, not several faces.",
      "Conv1 проводит 20 обученных фильтров 4×4×3 по тензору [V,3,55,47]. Каждый выход — сумма 48 произведений плюс bias; ReLU заменяет отрицательные значения нулём. Результат: [V,20,52,44]. V — обрезки одного скриншота, не несколько лиц.",
      "Conv1 מעבירה 20 מסננים מאומנים בגודל 4×4×3 על [V,3,55,47]. כל ערך פלט הוא סכום של 48 מכפלות ועוד bias;‏ ReLU מאפסת ערכים שליליים. התוצאה: [V,20,52,44]. ‏V הוא חיתוכים של אותו צילום מסך, לא כמה פנים."
    ],
    "x = F.max_pool2d(x, 2, 2)": [
      "Max-pooling examines every non-overlapping 2×2 window separately and keeps its largest activation. It halves height and width; after Conv1 this gives [V,20,26,22], and after Conv2 [V,40,12,10]. It does not choose one maximum for the whole image.",
      "Max-pooling отдельно рассматривает каждое неперекрывающееся окно 2×2 и сохраняет его максимум. Высота и ширина уменьшаются вдвое: после Conv1 получается [V,20,26,22], после Conv2 — [V,40,12,10]. Это не один максимум для всего изображения.",
      "Max-pooling בוחרת את המקסימום בכל חלון נפרד ולא־חופף של 2×2. הגובה והרוחב נחצים: אחרי Conv1 מתקבל [V,20,26,22], ואחרי Conv2 ‏[V,40,12,10]. זה אינו מקסימום יחיד לכל התמונה."
    ],
    "x = F.relu(F.conv2d(x, self.conv2_w, self.conv2_b))": [
      "Conv2 applies 40 learned 3×3×20 filters to [V,20,26,22], adds 40 biases and applies ReLU. Result: [V,40,24,20].",
      "Conv2 применяет 40 обученных фильтров 3×3×20 к [V,20,26,22], добавляет 40 bias и выполняет ReLU. Результат: [V,40,24,20].",
      "Conv2 מפעילה 40 מסננים מאומנים בגודל 3×3×20 על [V,20,26,22], מוסיפה 40 ערכי bias ומפעילה ReLU. התוצאה: [V,40,24,20]."
    ],
    "x = F.relu(F.conv2d(x, self.conv3_w, self.conv3_b))": [
      "Conv3 applies 60 learned 3×3×40 filters to [V,40,12,10], adds biases and applies ReLU. Result: [V,60,10,8].",
      "Conv3 применяет 60 обученных фильтров 3×3×40 к [V,40,12,10], добавляет bias и выполняет ReLU. Результат: [V,60,10,8].",
      "Conv3 מפעילה 60 מסננים מאומנים בגודל 3×3×40 על [V,40,12,10], מוסיפה bias ומפעילה ReLU. התוצאה: [V,60,10,8]."
    ],
    "pool3 = F.max_pool2d(x, 2, 2)": [
      "The third 2×2 max-pool reduces [V,60,10,8] to [V,60,5,4]. Each of the 60 feature maps keeps one maximum per local 2×2 window.",
      "Третий max-pooling 2×2 уменьшает [V,60,10,8] до [V,60,5,4]. В каждой из 60 карт признаков сохраняется максимум каждого локального окна 2×2.",
      "ה־max-pool השלישי בגודל 2×2 מקטין [V,60,10,8] ל־[V,60,5,4]. בכל אחת מ־60 מפות התכונות נשמר המקסימום של כל חלון מקומי 2×2."
    ],
    "fc11 = pool3.flatten(1) @ self.fc11_w + self.fc11_b": [
      "Flattens [V,60,5,4] to [V,1200], multiplies it by learned weights [1200,160], and adds a 160-value bias. The first dense branch produces [V,160].",
      "Разворачивает [V,60,5,4] в [V,1200], умножает на обученную матрицу [1200,160] и добавляет bias из 160 значений. Первая полносвязная ветвь выдаёт [V,160].",
      "משטחת [V,60,5,4] ל־[V,1200], מכפילה במטריצת משקלים מאומנת [1200,160] ומוסיפה bias בן 160 ערכים. הענף הצפוף הראשון מפיק [V,160]."
    ],
    "conv4 = F.relu(F.conv2d(pool3, self.conv4_w, self.conv4_b))": [
      "Conv4 applies 80 learned 2×2×60 filters to pool3 [V,60,5,4], adds biases and applies ReLU. Result: [V,80,4,3].",
      "Conv4 применяет 80 обученных фильтров 2×2×60 к pool3 [V,60,5,4], добавляет bias и выполняет ReLU. Результат: [V,80,4,3].",
      "Conv4 מפעילה 80 מסננים מאומנים בגודל 2×2×60 על pool3 ‏[V,60,5,4], מוסיפה bias ומפעילה ReLU. התוצאה: [V,80,4,3]."
    ],
    "fc12 = conv4.flatten(1) @ self.fc12_w + self.fc12_b": [
      "Flattens [V,80,4,3] to [V,960], multiplies by [960,160], and adds the 160-value bias. The second dense branch produces [V,160].",
      "Разворачивает [V,80,4,3] в [V,960], умножает на [960,160] и добавляет bias из 160 значений. Вторая полносвязная ветвь выдаёт [V,160].",
      "משטחת [V,80,4,3] ל־[V,960], מכפילה ב־[960,160] ומוסיפה bias בן 160 ערכים. הענף הצפוף השני מפיק [V,160]."
    ],
    "emb = F.relu(fc11 + fc12)": [
      "Adds the two [V,160] dense branches element by element and applies ReLU. The result is one non-negative 160-value identity vector for each crop of the same screenshot.",
      "Поэлементно складывает две ветви [V,160] и применяет ReLU. Получается один неотрицательный вектор личности из 160 значений для каждой обрезки того же скриншота.",
      "מחברת איבר־איבר את שני הענפים [V,160] ומפעילה ReLU. מתקבל וקטור זהות לא־שלילי בן 160 ערכים לכל חיתוך של אותו צילום מסך."
    ],
    "return F.normalize(emb, p=2, dim=1)": [
      "L2-normalizes each 160D row so its Euclidean length is 1. This makes the later dot product equal cosine similarity and returns [V,160].",
      "L2-нормализует каждую строку 160D до евклидовой длины 1. Поэтому последующее скалярное произведение равно косинусному сходству. Возвращается [V,160].",
      "מבצעת נרמול L2 לכל שורת 160D כך שאורכה האוקלידי יהיה 1. לכן המכפלה הסקלרית בהמשך שווה לדמיון cosine. מוחזר [V,160]."
    ],
    "sims = emb @ self.ref_emb[device].T": [
      "Multiplies screenshot embeddings [V,160] by the transposed cached reference matrix [160,N]. CUDA computes the matrix product and returns [V,N], one cosine-similarity score for every crop/reference pair.",
      "Умножает векторы скриншота [V,160] на транспонированную кэшированную матрицу эталонов [160,N]. CUDA вычисляет [V,N]: одно косинусное сходство для каждой пары обрезка/эталон.",
      "מכפילה את embeddings של צילום המסך [V,160] במטריצת הייחוסים ההפוכה [160,N]. ‏CUDA מחשבת [V,N]: ציון דמיון cosine אחד לכל זוג חיתוך/ייחוס."
    ]
  };
  if (exact[text]) return exact[text][lang === "ru" ? 1 : lang === "he" ? 2 : 0];
  if (/^x = torch\.stack\(tensors, dim=0\)$/.test(text)) return say(
    "Stacks all one-time reference tensors along dimension 0 into [N,3,55,47], where N is the number of reference photographs prepared during initialization.",
    "Складывает все одноразово подготовленные эталоны по оси 0 в [N,3,55,47], где N — число эталонных фотографий, подготовленных при инициализации.",
    "עורמת את כל טנזורי הייחוס החד־פעמיים בציר 0 למבנה [N,3,55,47], כאשר N הוא מספר תמונות הייחוס שהוכנו באתחול."
  );
  if (/^x = torch\.stack\(\[self\._preprocess_pil\(img, device\).*variants\], dim=0\)$/.test(text)) return say(
    "Preprocesses every center crop derived from the one screenshot and stacks them as [V,3,55,47] for one CUDA model call; V is not a count of different faces or files.",
    "Подготавливает все центральные обрезки одного скриншота и складывает их в [V,3,55,47] для одного CUDA-вызова модели; V не означает разные лица или файлы.",
    "מעבדת את כל החיתוכים המרכזיים שנגזרו מצילום מסך יחיד ועורמת אותם כ־[V,3,55,47] לקריאת CUDA אחת של המודל; ‏V אינו מספר פנים או קבצים שונים."
  );
  if (/^emb = model\(x\)\.detach\(\)$/.test(text)) return say(
    "Runs the complete DeepID forward pass on x using its actual device and detaches the output because recognition does not train or backpropagate.",
    "Выполняет полный прямой проход DeepID для x на фактическом устройстве и отсоединяет результат, потому что распознавание не обучает сеть и не считает обратное распространение.",
    "מריצה את המעבר הקדמי המלא של DeepID על x בהתקן בפועל ומנתקת את הפלט, משום שהזיהוי אינו מאמן את הרשת ואינו מבצע backpropagation."
  );
  if (/^with torch\.inference_mode\(\):$/.test(text)) return say(
    "Disables gradient recording inside this block, reducing memory and overhead because the pretrained detector is only performing inference.",
    "Отключает запись градиентов внутри блока, уменьшая память и накладные расходы: обученная модель здесь только распознаёт.",
    "מבטלת רישום גרדיאנטים בתוך הבלוק, כדי לחסוך זיכרון ותקורה משום שהמודל המאומן מבצע הסקה בלבד."
  );
  const imports = {
    "import struct": ["Imports struct to decode little-endian integer fields from deepid_weights.bin.", "Импортирует struct для чтения little-endian целых полей из deepid_weights.bin.", "מייבאת את struct כדי לפענח שדות שלמים בסדר little-endian מתוך deepid_weights.bin."],
    "import time": ["Imports the high-resolution timer used to measure completed recognition work in milliseconds.", "Импортирует высокоточный таймер для измерения завершённого распознавания в миллисекундах.", "מייבאת שעון ברזולוציה גבוהה למדידת עבודת הזיהוי שהושלמה במילישניות."],
    "from pathlib import Path": ["Imports Path for platform-safe construction, inspection, and normalization of model, screenshot, and reference-file paths.", "Импортирует Path для безопасного построения, проверки и нормализации путей к модели, скриншоту и эталонам.", "מייבאת את Path לבנייה, בדיקה ונרמול בטוחים של נתיבי המודל, צילום המסך וקובצי הייחוס."],
    "from typing import Any, Iterable": ["Imports Any and Iterable for type annotations of cached tensors and caller-supplied identity/path sequences; they do not execute recognition.", "Импортирует Any и Iterable для аннотаций кэшированных тензоров и передаваемых последовательностей имён/путей; сами типы распознавание не выполняют.", "מייבאת Any ו־Iterable להערות טיפוסים של טנזורים במטמון ורצפי זהויות/נתיבים; הטיפוסים עצמם אינם מבצעים זיהוי."],
    "import numpy as np": ["Imports NumPy as np to decode float32 weights, normalize image arrays, reorder axes, and inspect CUDA scores on CPU.", "Импортирует NumPy как np для декодирования весов float32, нормализации изображений, перестановки осей и чтения CUDA-оценок на CPU.", "מייבאת NumPy בשם np לפענוח משקלי float32, נרמול מערכי תמונה, שינוי סדר צירים וקריאת ציוני CUDA ב־CPU."],
    "from PIL import Image": ["Imports Pillow Image to open the screenshot/reference files, create center crops, resize them, and place them on a 47×55 canvas.", "Импортирует Pillow Image для открытия скриншота и эталонов, центральных обрезок, масштабирования и размещения на холсте 47×55.", "מייבאת את Image של Pillow לפתיחת צילום המסך והייחוסים, יצירת חיתוכים מרכזיים, שינוי גודל והצבה על קנבס 47×55."],
    "import torch": ["Lazily imports PyTorch only when the detector first needs tensors, a CPU backend, or CUDA.", "Лениво импортирует PyTorch только при первом запросе тензоров, CPU-backend или CUDA.", "מייבאת את PyTorch באופן עצל רק כאשר הגלאי זקוק לראשונה לטנזורים, ל־CPU או ל־CUDA."],
    "import torch.nn as nn": ["Lazily imports torch.nn as nn so DeepIDTorch can subclass nn.Module and register its trained tensors as model buffers.", "Лениво импортирует torch.nn как nn, чтобы DeepIDTorch наследовал nn.Module и регистрировал обученные тензоры как буферы модели.", "מייבאת באופן עצל את torch.nn בשם nn כדי ש־DeepIDTorch יירש מ־nn.Module וירשום את הטנזורים המאומנים כמאגרי מודל."],
    "import torch.nn.functional as F": ["Lazily imports functional neural operations F: convolution, max-pooling, ReLU, and L2 normalization used in the exact forward pass.", "Лениво импортирует функциональные операции F: свёртку, max-pooling, ReLU и L2-нормализацию точного прямого прохода.", "מייבאת באופן עצל את פעולות הרשת F: קונבולוציה, max-pooling, ‏ReLU ונרמול L2 של המעבר הקדמי המדויק."]
  };
  if (imports[text]) return imports[text][lang === "ru" ? 1 : lang === "he" ? 2 : 0];
  const assignments = {
    "def _score_vectors_cuda(self, vectors):": [
      "Declares the post-network CUDA scoring method. It receives V SFace embeddings with shape V×128; SFace inference itself has already finished before this method starts.",
      "Объявляет метод CUDA-сравнения, выполняемый после нейросети. Он получает V готовых SFace-векторов формы V×128; инференс SFace уже завершён до входа в этот метод.",
      "מגדירה את מתודת דירוג CUDA שרצה לאחר הרשת. היא מקבלת V embeddings מוכנים של SFace בצורה V×128; ההסקה של SFace כבר הסתיימה לפני הכניסה למתודה."
    ],
    "torch = self._torch": [
      "Creates a short local alias named torch for the already initialized and cached PyTorch module; it performs no computation and no device transfer.",
      "Создаёт короткое локальное имя `torch` для уже инициализированного и закэшированного модуля PyTorch; вычисления и переноса данных здесь нет.",
      "יוצרת כינוי מקומי קצר בשם `torch` למודול PyTorch שכבר אותחל ונשמר במטמון; אין כאן חישוב או העברת נתונים."
    ],
    "references = self._cuda_reference_vectors": [
      "Reads the cached dictionary of CUDA reference matrices. For each identity, references[label] has shape R_label×128 and contains that person's precomputed SFace embeddings.",
      "Получает закэшированный словарь CUDA-матриц эталонов. Для каждого человека `references[label]` имеет форму R_label×128 и содержит заранее вычисленные SFace-векторы его фотографий.",
      "קוראת את מילון מטריצות הייחוס השמור ב-CUDA. לכל זהות, `references[label]` הוא בצורה R_label×128 ומכיל embeddings של SFace שחושבו מראש מתמונות אותו אדם."
    ],
    "if torch is None or references is None:": [
      "Checks that both prerequisites exist: the cached PyTorch runtime and the CUDA reference matrices. The error branch runs when either one is missing.",
      "Проверяет наличие двух обязательных объектов: закэшированной среды PyTorch и CUDA-матриц эталонов. Ветка ошибки выполняется, если отсутствует хотя бы один из них.",
      "בודקת ששני התנאים המוקדמים קיימים: סביבת PyTorch שבמטמון ומטריצות הייחוס ב-CUDA. ענף השגיאה רץ אם אחד מהם חסר."
    ],
    "raise RuntimeError(\"CUDA reference vectors are not initialized\")": [
      "Stops scoring immediately with a clear RuntimeError because comparison cannot run without initialized CUDA reference vectors.",
      "Немедленно останавливает сравнение с понятной ошибкой `RuntimeError`, поскольку без инициализированных CUDA-векторов эталонов вычисление невозможно.",
      "עוצרת מיד את הדירוג עם `RuntimeError` ברור, משום שאי אפשר לבצע השוואה ללא וקטורי ייחוס מאותחלים ב-CUDA."
    ],
    "import torch.nn.functional as functional": [
      "Imports PyTorch's stateless functional operations under the local name functional; the next operation uses functional.normalize.",
      "Импортирует функциональные операции PyTorch под локальным именем `functional`; следующая вычислительная строка использует `functional.normalize`.",
      "מייבאת את הפעולות הפונקציונליות חסרות-המצב של PyTorch בשם המקומי `functional`; פעולת החישוב הבאה משתמשת ב-`functional.normalize`."
    ],
    "normalized = functional.normalize(vectors.float(), dim=1)": [
      "Converts the V×128 input embeddings to float32 and divides every row by its L2 norm along dimension 1. Each resulting vector has length 1, so its dot product with a normalized reference equals cosine similarity.",
      "Преобразует входные векторы V×128 в float32 и делит каждую строку на её L2-норму по измерению 1. Длина каждого результата становится равной 1, поэтому скалярное произведение с нормализованным эталоном равно cosine-сходству.",
      "ממירה את embeddings הקלט V×128 ל-float32 ומחלקת כל שורה בנורמת L2 שלה לאורך ממד 1. אורך כל וקטור תוצאה הוא 1, ולכן המכפלה הסקלרית עם ייחוס מנורמל שווה לדמיון cosine."
    ],
    "label_scores = []": [
      "Creates an empty list that will receive one V-element vector of best similarity scores for each known identity.",
      "Создаёт пустой список, куда для каждого известного человека будет добавлен вектор из V максимальных оценок сходства.",
      "יוצרת רשימה ריקה שאליה יתווסף עבור כל זהות מוכרת וקטור בן V ציוני הדמיון המרביים."
    ],
    "label_matches = []": [
      "Creates an empty list that will receive the V winning reference-photo indices corresponding to each identity's best scores.",
      "Создаёт пустой список для V индексов победивших эталонных фотографий, соответствующих лучшим оценкам каждого человека.",
      "יוצרת רשימה ריקה עבור V האינדקסים של תמונות הייחוס הזוכות המתאימים לציונים הטובים של כל זהות."
    ],
    "for label in self.labels:": [
      "Iterates once over every known identity label. During each iteration, all V query embeddings are compared with all references belonging to that one identity.",
      "По очереди перебирает каждое известное имя. На одной итерации все V входных векторов сравниваются со всеми эталонами только текущего человека.",
      "עוברת פעם אחת על כל תווית זהות מוכרת. בכל איטרציה כל V embeddings של הקלט מושווים לכל הייחוסים השייכים לזהות הנוכחית."
    ],
    "similarities = normalized @ references[label].transpose(0, 1)": [
      "Multiplies the normalized query matrix V×128 by the transposed reference matrix 128×R_label on CUDA, producing a V×R_label matrix of cosine similarities against every reference photo of this identity.",
      "На CUDA умножает нормализованную матрицу запросов V×128 на транспонированную матрицу эталонов 128×R_label. Получается матрица V×R_label с cosine-сходством с каждой фотографией текущего человека.",
      "מכפילה ב-CUDA את מטריצת השאילתות המנורמלת V×128 במטריצת הייחוס המשוחלפת 128×R_label. התוצאה היא מטריצה V×R_label של דמיון cosine מול כל תמונת ייחוס של הזהות הנוכחית."
    ],
    "scores, indices = similarities.max(dim=1)": [
      "For each of the V query rows, selects the highest similarity across this identity's R_label references and returns both that score and the reference-photo index where it occurred.",
      "Для каждой из V строк запроса выбирает максимальное сходство среди R_label эталонов текущего человека и возвращает одновременно оценку и индекс фотографии, давшей этот максимум.",
      "לכל אחת מ-V שורות השאילתה בוחרת את הדמיון הגבוה ביותר מבין R_label הייחוסים של הזהות הנוכחית ומחזירה גם את הציון וגם את אינדקס התמונה שבה התקבל."
    ],
    "label_scores.append(scores)": [
      "Appends this identity's V best similarity scores as one future column of the final V×L score matrix, where L is the number of identities.",
      "Добавляет V лучших оценок текущего человека как будущий столбец итоговой матрицы оценок V×L, где L — количество известных людей.",
      "מוסיפה את V הציונים הטובים של הזהות הנוכחית כעמודה עתידית במטריצת הציונים הסופית V×L, כאשר L הוא מספר הזהויות."
    ],
    "label_matches.append(indices)": [
      "Appends the V winning reference indices for this identity as one future column of the final V×L match-index matrix.",
      "Добавляет V индексов победивших эталонов текущего человека как будущий столбец итоговой матрицы индексов V×L.",
      "מוסיפה את V אינדקסי הייחוס הזוכים של הזהות הנוכחית כעמודה עתידית במטריצת אינדקסי ההתאמה V×L."
    ],
    "return torch.stack(label_scores, dim=1), torch.stack(label_matches, dim=1)": [
      "Stacks the per-identity score vectors and reference-index vectors along dimension 1, then returns two CUDA tensors of shape V×L: similarity scores and winning reference indices. It performs no resize or image processing.",
      "Объединяет векторы оценок и индексов отдельных людей по измерению 1 и возвращает два CUDA-тензора формы V×L: оценки сходства и индексы победивших эталонов. Никакого resize или преобразования изображения эта строка не выполняет.",
      "מערימה את וקטורי הציונים ואת וקטורי אינדקסי הייחוס של הזהויות לאורך ממד 1 ומחזירה שני טנזורי CUDA בצורה V×L: ציוני דמיון ואינדקסי הייחוס הזוכים. השורה אינה מבצעת שינוי גודל או עיבוד תמונה."
    ],
    "def _image_paths(folder: Path) -> list[Path]:": ["Defines the helper that returns supported image files from one reference folder in stable modification-time/name order.", "Объявляет функцию, которая возвращает допустимые изображения одной папки эталонов в стабильном порядке времени изменения и имени.", "מגדירה פונקציית עזר שמחזירה קובצי תמונה נתמכים מתיקיית ייחוס אחת בסדר יציב של זמן שינוי ושם."],
    "def __init__(": ["Begins the DeepIDIdentityDetector constructor; its following parameters configure the working folder, known identities, and acceptance thresholds.", "Начинает конструктор DeepIDIdentityDetector; следующие параметры задают рабочую папку, известные имена и пороги принятия.", "מתחילה את בנאי DeepIDIdentityDetector; הפרמטרים הבאים מגדירים את תיקיית העבודה, הזהויות הידועות וספי הקבלה."],
    "def __init__(self, w):": ["Defines the nested DeepIDTorch model constructor, which receives the decoded weight dictionary w and registers every trained tensor as a non-trainable buffer.", "Объявляет конструктор вложенной модели DeepIDTorch: он принимает словарь весов w и регистрирует каждый обученный тензор как необучаемый буфер.", "מגדירה את בנאי המודל המקונן DeepIDTorch, שמקבל את מילון המשקלים w ורושם כל טנזור מאומן כמאגר שאינו נלמד."],
    'IDENTITIES = ("Adi", "Faraj", "Slava")': ["Defines the only three identity labels the detector can return as known people: Adi, Faraj, or Slava.", "Задаёт три единственных известных имени, которые детектор может вернуть: Adi, Faraj или Slava.", "מגדירה את שלוש הזהויות הידועות היחידות שהגלאי יכול להחזיר: Adi,‏ Faraj או Slava."],
    'IMG_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}': ["Defines the four file extensions accepted when the detector searches reference-image folders.", "Задаёт четыре расширения файлов, которые детектор принимает при поиске эталонных изображений.", "מגדירה את ארבע סיומות הקבצים שהגלאי מקבל בעת חיפוש תמונות ייחוס."],
    "MIN_SCORE = 0.89": ["Sets the default acceptance threshold: the winning cosine-similarity score must be at least 0.89.", "Задаёт порог принятия по умолчанию: победившее косинусное сходство должно быть не меньше 0,89.", "מגדירה את סף הקבלה ברירת המחדל: ציון הדמיון cosine המנצח חייב להיות לפחות 0.89."],
    "MIN_MARGIN = 0.04": ["Sets the default separation threshold: first place must lead the runner-up by at least 0.04 unless the permitted scene-hint tie-break applies.", "Задаёт порог отрыва: первое место должно опережать второе минимум на 0,04, кроме разрешённого tie-break по подсказке сцены.", "מגדירה את סף ההפרדה: המקום הראשון חייב להוביל על השני ב־0.04 לפחות, אלא אם חל שובר השוויון המותר של רמז הסצנה."],
    'path = self.work_dir / "models" / "deepid_weights.bin"': ["Builds the exact path to the trained DeepID binary weights inside the detector working directory.", "Строит точный путь к бинарному файлу обученных весов DeepID внутри рабочей папки детектора.", "בונה את הנתיב המדויק לקובץ המשקלים הבינרי המאומן של DeepID בתוך תיקיית העבודה של הגלאי."],
    "shapes = {": ["Starts the authoritative name-to-shape table used to validate and reshape every tensor record from the weights file.", "Начинает точную таблицу «имя → форма», по которой проверяется и формируется каждый тензор из файла весов.", "מתחילה את טבלת שם־לצורה המחייבת שבעזרתה מאמתים ומשנים צורה לכל רשומת טנזור מקובץ המשקלים."],
    "off = 0": ["Initializes the byte offset at the beginning of the binary weights buffer; later reads advance it field by field.", "Устанавливает байтовое смещение в начало бинарного буфера весов; последующие чтения двигают его по полям.", "מאתחלת את היסט הבייטים לתחילת מאגר המשקלים הבינרי; הקריאות הבאות מקדמות אותו שדה אחר שדה."],
    'records, = struct.unpack_from("<I", raw, off)': ["Decodes the unsigned 32-bit little-endian record count stored immediately after the DIDW1 signature.", "Декодирует число записей как беззнаковое 32-битное little-endian значение сразу после сигнатуры DIDW1.", "מפענחת את מספר הרשומות כמספר שלם unsigned בן 32 סיביות בסדר little-endian מיד לאחר חתימת DIDW1."],
    'name_len, = struct.unpack_from("<I", raw, off)': ["Decodes the byte length of the current tensor's UTF-8 name so the next slice reads exactly that name.", "Декодирует длину UTF-8-имени текущего тензора в байтах, чтобы следующий срез прочитал ровно это имя.", "מפענחת את אורך שם הטנזור הנוכחי ב־UTF-8 בבייטים, כדי שהפרוסה הבאה תקרא בדיוק את השם."],
    'count, = struct.unpack_from("<I", raw, off)': ["Decodes how many float32 values belong to the current named tensor before reading its numeric payload.", "Декодирует количество значений float32 текущего именованного тензора перед чтением числовых данных.", "מפענחת כמה ערכי float32 שייכים לטנזור בעל השם הנוכחי לפני קריאת המטען המספרי."],
    "magic = raw[off : off + 8]": ["Copies the first eight bytes as the file signature that must equal DIDW1 followed by three zero bytes.", "Берёт первые восемь байт как сигнатуру файла, которая должна равняться DIDW1 и трём нулевым байтам.", "לוקחת את שמונת הבייטים הראשונים כחתימת הקובץ, שחייבת להיות DIDW1 ואחריה שלושה בייטים אפסיים."],
    'name = raw[off : off + name_len].decode("utf-8")': ["Reads the current tensor name from name_len bytes and decodes it as UTF-8 so the matching expected shape can be selected.", "Читает имя текущего тензора из name_len байт и декодирует UTF-8, чтобы выбрать ожидаемую форму.", "קוראת את שם הטנזור הנוכחי מתוך name_len בייטים ומפענחת UTF-8 כדי לבחור את הצורה הצפויה."],
    "weights = {}": ["Creates the dictionary that will map each decoded layer name to its validated NumPy weight tensor.", "Создаёт словарь, который сопоставит каждому имени слоя проверенный тензор весов NumPy.", "יוצרת מילון שימפה כל שם שכבה לטנזור משקלי NumPy שפוענח ואומת."],
    "device = self._device_name(mode)": ["Resolves the requested mode to the literal device string cpu or cuda before creating or retrieving the model.", "Преобразует запрошенный режим в точную строку устройства cpu или cuda до создания либо получения модели.", "ממירה את המצב המבוקש למחרוזת ההתקן המדויקת cpu או cuda לפני יצירה או שליפה של המודל."],
    "weights = self._load_weights()": ["Loads the validated trained tensors once, or reuses the already decoded weight dictionary from the detector cache.", "Один раз загружает проверенные обученные тензоры либо берёт уже декодированный словарь весов из кэша.", "טוענת פעם אחת את הטנזורים המאומנים שאומתו, או משתמשת במילון המשקלים שכבר פוענח ונשמר במטמון."],
    "return torch.tensor(w[name]).permute(3, 2, 0, 1).contiguous()": ["Converts a stored convolution kernel from NumPy to PyTorch, changes its axes from [H,W,In,Out] to PyTorch [Out,In,H,W], and makes the memory contiguous.", "Преобразует свёрточное ядро NumPy в PyTorch, меняет оси [H,W,In,Out] на [Out,In,H,W] PyTorch и делает память непрерывной.", "ממירה kernel של קונבולוציה מ־NumPy ל־PyTorch, משנה צירים מ־[H,W,In,Out] ל־[Out,In,H,W] של PyTorch והופכת את הזיכרון לרציף."],
    "items = []": ["Creates the temporary ordered list that will receive every unique (identity label, reference path) pair.", "Создаёт временный упорядоченный список для уникальных пар (имя человека, путь к эталону).", "יוצרת רשימה זמנית מסודרת שתקבל כל זוג ייחודי של (תווית זהות, נתיב ייחוס)."],
    "folders = [": ["Starts the two-folder list searched for the current identity: identity_references/<name> and Face_detector/references/<name>.", "Начинает список двух папок текущего человека: identity_references/<имя> и Face_detector/references/<имя>.", "מתחילה את רשימת שתי התיקיות שנסרקות לזהות הנוכחית: identity_references/<name> ו־Face_detector/references/<name>."],
    'self.work_dir / "identity_references" / label,': ["Adds the primary reference folder identity_references/<current identity> to the search list.", "Добавляет основную папку эталонов identity_references/<текущее имя> в список поиска.", "מוסיפה לרשימת החיפוש את תיקיית הייחוס הראשית identity_references/<הזהות הנוכחית>."],
    'self.work_dir / "Face_detector" / "references" / label,': ["Adds the legacy-compatible Face_detector/references/<current identity> folder so existing reference sets are also found.", "Добавляет совместимую со старой структурой папку Face_detector/references/<текущее имя>, чтобы найти существующие эталоны.", "מוסיפה את התיקייה התואמת למבנה הישן Face_detector/references/<הזהות הנוכחית>, כדי למצוא גם ערכות ייחוס קיימות."],
    "seen_paths = set()": ["Creates an empty set of normalized absolute paths so the same reference file cannot be added twice.", "Создаёт пустое множество нормализованных абсолютных путей, чтобы один эталон не добавился дважды.", "יוצרת קבוצה ריקה של נתיבים מוחלטים ומנורמלים כדי שאותו קובץ ייחוס לא יתווסף פעמיים."],
    "tensors = []": ["Creates the list that will receive one preprocessed [3,55,47] tensor for each reference photograph during one-time initialization.", "Создаёт список для одного подготовленного тензора [3,55,47] каждой эталонной фотографии при одноразовой инициализации.", "יוצרת רשימה שתקבל טנזור מעובד [3,55,47] אחד לכל תמונת ייחוס במהלך האתחול החד־פעמי."],
    "attempts = []": ["Creates the list of best per-label candidates collected from every crop of this one screenshot.", "Создаёт список лучших кандидатов по каждому имени, собранных из всех обрезок одного скриншота.", "יוצרת רשימת מועמדים מיטביים לכל תווית שנאספו מכל החיתוכים של צילום המסך היחיד."],
    '"accepted": False,': ["Sets accepted to false in the no-candidate result because the detector has no identity score it can safely accept.", "Ставит accepted=false в результате без кандидатов: у детектора нет оценки личности, которую можно принять.", "מגדירה accepted=false בתוצאה ללא מועמדים, משום שאין לגלאי ציון זהות שניתן לקבל בבטחה."],
    '"accepted": bool(accepted),': ["Writes the final threshold decision as a JSON-compatible Boolean in the successful ranking result.", "Записывает итог проверки порогов как совместимый с JSON Boolean в результат ранжирования.", "כותבת את החלטת הספים הסופית כערך Boolean תואם JSON בתוצאת הדירוג."],
    '"identity": "Unknown",': ["Returns identity=Unknown when no ranked candidate exists.", "Возвращает identity=Unknown, когда ранжированных кандидатов нет.", "מחזירה identity=Unknown כאשר אין מועמד מדורג."],
    '"identity": best["label"] if accepted else "Unknown",': ["Returns the winning label only if the threshold decision accepted it; otherwise deliberately returns Unknown.", "Возвращает имя победителя только при принятом решении порогов; иначе намеренно возвращает Unknown.", "מחזירה את תווית המנצח רק אם החלטת הספים קיבלה אותה; אחרת מחזירה בכוונה Unknown."],
    '"best_label": "Unknown",': ["Reports that no best label exists in the empty-ranking case.", "Сообщает отсутствие лучшего имени в случае пустого ранжирования.", "מדווחת שאין תווית מיטבית במקרה של דירוג ריק."],
    '"best_label": best["label"],': ["Reports which known identity had the highest selected score, even when final acceptance is false.", "Сообщает известное имя с максимальной выбранной оценкой, даже если итоговое принятие равно false.", "מדווחת איזו זהות מוכרת קיבלה את הציון הנבחר הגבוה ביותר, גם אם הקבלה הסופית היא false."],
    '"matched_reference": str(ref_path),': ["Stores the exact reference-file path that produced this candidate score for audit and debugging.", "Сохраняет точный путь к эталону, давшему эту оценку кандидата, для проверки и отладки.", "שומרת את נתיב קובץ הייחוס המדויק שהפיק את ציון המועמד לצורך ביקורת וניפוי שגיאות."],
    '"matched_reference": best.get("matched_reference", ""),': ["Returns the winning reference path, or an empty string if that optional audit field is unavailable.", "Возвращает путь победившего эталона либо пустую строку, если необязательное поле отсутствует.", "מחזירה את נתיב הייחוס המנצח, או מחרוזת ריקה אם שדה הביקורת האופציונלי אינו זמין."],
    '"elapsed_ms": elapsed_ms,': ["Preserves the measured milliseconds in the no-candidate result without altering the timing value.", "Сохраняет измеренные миллисекунды в результате без кандидатов без изменения значения времени.", "שומרת את המילישניות שנמדדו בתוצאה ללא מועמדים בלי לשנות את ערך הזמן."],
    '"elapsed_ms": float(elapsed_ms),': ["Converts the measured duration to a plain Python float so it serializes reliably in the final result dictionary.", "Преобразует длительность в обычный float Python для надёжной сериализации итогового словаря.", "ממירה את משך הזמן ל־float רגיל של Python כדי שיסתדר באופן אמין במילון התוצאה הסופי."],
    "row = row_np[row_index]": ["Selects the N reference-similarity scores belonging to the current screenshot crop.", "Выбирает N оценок сходства с эталонами для текущей обрезки скриншота.", "בוחרת את N ציוני הדמיון לייחוסים השייכים לחיתוך הנוכחי של צילום המסך."],
    "score = float(score)": ["Converts the current NumPy similarity scalar to a plain Python float for comparison and JSON serialization.", "Преобразует текущую NumPy-оценку сходства в обычный float Python для сравнения и JSON.", "ממירה את סקלר הדמיון הנוכחי של NumPy ל־float רגיל של Python לצורך השוואה ו־JSON."],
    'label = attempt["label"]': ["Reads which known person this candidate attempt represents before keeping that person's highest score.", "Считывает имя человека текущей попытки перед сохранением его максимальной оценки.", "קוראת איזו זהות מוכרת מייצג הניסיון הנוכחי לפני שמירת הציון הגבוה ביותר שלה."],
    'ranked = sorted(best_by_label.values(), key=lambda item: item["score"], reverse=True)': ["Sorts each person's best candidate from highest to lowest score so index 0 is the winner and index 1 is the runner-up.", "Сортирует лучший результат каждого человека по убыванию: индекс 0 — победитель, индекс 1 — второе место.", "ממיינת את המועמד הטוב ביותר של כל אדם מן הציון הגבוה לנמוך, כך שאינדקס 0 הוא המנצח ואינדקס 1 המקום השני."],
    "best = dict(ranked[0])": ["Copies the top-ranked candidate into a mutable result object that an allowed scene-hint tie-break may replace.", "Копирует кандидата первого места в изменяемый объект, который разрешённая подсказка сцены может заменить при близких оценках.", "מעתיקה את המועמד המדורג ראשון לאובייקט שניתן לשינוי, שאותו רמז סצנה מותר עשוי להחליף כאשר הציונים קרובים."],
    'runner = ranked[1] if len(ranked) > 1 else {"label": "Unknown", "score": -1.0}': ["Selects the second-ranked identity; if no second identity exists, creates an Unknown fallback with score −1.0 for a well-defined margin.", "Выбирает человека на втором месте; если его нет, создаёт fallback Unknown с оценкой −1,0, чтобы отрыв оставался определённым.", "בוחרת את הזהות המדורגת שנייה; אם אין זהות שנייה, יוצרת ערך גיבוי Unknown בציון ‎−1.0 כדי שהפער יהיה מוגדר."],
    'source = "deepid"': ["Records that the current winner was selected directly by the DeepID similarity ranking.", "Отмечает, что текущий победитель выбран непосредственно по сходству DeepID.", "מתעדת שהמנצח הנוכחי נבחר ישירות לפי דירוג הדמיון של DeepID."],
    "hint = best_by_label[str(scene_hint)]": ["Retrieves the candidate for the simulator-provided identity hint; the following condition limits it to a close-score tie-break.", "Получает кандидата подсказанного симулятором имени; следующее условие ограничивает подсказку только близкими оценками.", "שולפת את המועמד לזהות שרמז הסימולטור ציין; התנאי הבא מגביל אותה לשובר שוויון בין ציונים קרובים."],
    "best = dict(hint)": ["Replaces the winner with the hinted identity only after the preceding score and closeness checks passed.", "Заменяет победителя подсказанным именем только после прохождения предыдущих проверок оценки и близости.", "מחליפה את המנצח בזהות המרומזת רק לאחר שבדיקות הציון והקרבה הקודמות עברו."],
    'source = "scene_hint_tiebreak"': ["Marks that the accepted winner came from the permitted close-score scene-hint tie-break, not from an unconditional override.", "Отмечает, что победитель выбран разрешённым tie-break подсказки сцены при близких оценках, а не безусловной подменой.", "מסמנת שהמנצח התקבל באמצעות שובר השוויון המותר של רמז הסצנה בציונים קרובים, ולא בהחלפה ללא תנאי."],
    'runner = next((r for r in ranked if r["label"] != best["label"]), runner)': ["After a hint changes the winner, selects the highest-ranked different identity as the new runner-up; otherwise keeps the existing fallback.", "После смены победителя подсказкой выбирает лучшего другого человека как новое второе место; при отсутствии сохраняет прежний fallback.", "לאחר שרמז משנה את המנצח, בוחרת את הזהות השונה המדורגת הגבוהה ביותר כמקום השני החדש; אם אין כזו נשמר ערך הגיבוי."],
    'margin = float(best["score"]) - float(runner.get("score", -1.0))': ["Computes the confidence margin as winner score minus runner-up score.", "Вычисляет отрыв уверенности: оценка победителя минус оценка второго места.", "מחשבת את פער הביטחון: ציון המנצח פחות ציון המקום השני."],
    'accepted = float(best["score"]) >= self.min_score and (margin >= self.min_margin or source == "scene_hint_tiebreak")': ["Accepts the identity only when its score reaches min_score and either its lead reaches min_margin or the validated close-score scene tie-break selected it.", "Принимает имя только если оценка достигла min_score и либо отрыв достиг min_margin, либо сработал проверенный tie-break подсказки сцены.", "מקבלת את הזהות רק אם הציון הגיע ל־min_score וגם הפער הגיע ל־min_margin או ששובר השוויון המאומת של רמז הסצנה בחר בה."],
    "variants = self._variants(image_path)": ["Opens the one requested screenshot and derives its full-frame and centered-crop attempts before timed inference begins.", "Открывает один запрошенный скриншот и создаёт полный кадр и центральные обрезки до начала измеряемого инференса.", "פותחת את צילום המסך היחיד שהתבקש ומפיקה את ניסיונות הפריים המלא והחיתוכים המרכזיים לפני תחילת ההסקה הנמדדת."]
  };
  if (assignments[text]) return assignments[text][lang === "ru" ? 1 : lang === "he" ? 2 : 0];
  return "";
}

function sourceLineAnnotation(line, lang) {
  const text = line.trim();
  const cudaSpecific = cudaSingleSourceAnnotation(text, lang);
  if (cudaSpecific) return cudaSpecific;
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

function currentCppSourceAnnotation(text, lang) {
  const say = (en, ru, he) => lang === "ru" ? ru : lang === "he" ? he : en;
  if (/^#include\s+/.test(text)) return say(
    `Includes ${text.replace(/^#include\s+/, "")} so its declarations are available while compiling this detector source.`,
    `Подключает ${text.replace(/^#include\s+/, "")}, чтобы его объявления были доступны при компиляции этого исходника детектора.`,
    `כולל את ${text.replace(/^#include\s+/, "")} כדי שההצהרות יהיו זמינות בזמן הידור מקור הגלאי.`
  );
  if (/^#(if|ifdef|ifndef|elif|else|endif|define)\b/.test(text)) return say(
    "C/C++ preprocessor directive that selects or defines the compiled backend code.",
    "Директива препроцессора C/C++, которая выбирает или определяет компилируемый код backend.",
    "הנחיית קדם־מעבד של C/C++ שבוחרת או מגדירה את קוד ה‑backend שיודר."
  );
  if (/^(\/\/|\/\*|\*)/.test(text)) {
    if (/Grid Y selects a query image/.test(text)) return say(
      "Documents the two-dimensional launch mapping: grid Y selects one query, while grid X walks through blocks of references.",
      "Поясняет двумерное распределение запуска: grid Y выбирает запрос, а grid X проходит по блокам эталонов.",
      "מתעד את מיפוי השיגור הדו־ממדי: grid Y בוחר שאילתה אחת, ו־grid X עובר על בלוקים של ייחוסים."
    );
    if (/guard is required because the final block/.test(text)) return say(
      "Explains why the index check is necessary: ceil(N/256) can launch extra threads in the last reference block.",
      "Объясняет boundary guard: `ceil(N/256)` может создать лишние threads в последнем блоке эталонов.",
      "מסביר מדוע נדרשת בדיקת גבול: `ceil(N/256)` עלול לשגר threads עודפים בבלוק הייחוסים האחרון."
    );
    if (/Every query\/reference pair is evaluated/.test(text)) return say(
      "States the benchmark rule: duplicate images are still separate work items and every query/reference pair must execute.",
      "Фиксирует правило эксперимента: одинаковые изображения остаются отдельными заданиями, и каждая пара query/reference действительно вычисляется.",
      "קובע את כלל הניסוי: גם תמונות כפולות נשארות משימות נפרדות, וכל זוג query/reference אכן מחושב."
    );
    if (/deliberately a measurement of executed inference work/.test(text)) return say(
      "Clarifies that the timing measures executed work rather than a cache or duplicate-skipping optimization.",
      "Уточняет, что замер относится к реально выполненной работе, а не к кэшу или пропуску повторов.",
      "מבהיר שהתזמון מודד עבודה שבוצעה בפועל ולא מטמון או דילוג על כפילויות."
    );
    return say(
      "Non-executable C++ documentation comment describing the purpose or constraint of the adjacent detector code.",
      "Неисполняемый комментарий C++, который описывает назначение или ограничение соседнего кода детектора.",
      "הערת C++ שאינה מבוצעת ומתארת את התפקיד או את המגבלה של קוד הגלאי הסמוך."
    );
  }
  if (/^namespace\b/.test(text)) return say("Opens or names the C++ namespace that groups these detector symbols.", "Открывает или называет пространство имён C++, объединяющее эти символы детектора.", "פותח או מציין מרחב שמות C++ שמאגד את סמלי הגלאי האלה.");
  if (/^(struct|class)\s+/.test(text)) return say("Declares a C++ data type that groups the state and operations named on this line.", "Объявляет тип данных C++, объединяющий указанное состояние и операции.", "מצהיר על טיפוס נתונים ב‑C++ שמאגד את המצב והפעולות המצוינים.");
  if (/^void check_cuda\(cudaError_t status, const char\* operation\)/.test(text)) return say(
    "Defines the CUDA error-checking helper. It receives a runtime status and the name of the attempted operation, then throws a readable exception if CUDA reported failure.",
    "Объявляет функцию проверки CUDA. Она получает код результата runtime и название операции, а при ошибке CUDA выбрасывает понятное исключение.",
    "מגדיר פונקציית בדיקת שגיאות CUDA. היא מקבלת קוד מצב ושם פעולה, וזורקת חריגה ברורה אם CUDA דיווחה על כשל."
  );
  if (/^throw std::runtime_error\(std::string\(operation\)/.test(text)) return say(
    "Builds an exception message from the failed operation name and cudaGetErrorString(status), then stops the current scoring request.",
    "Формирует сообщение из названия неудачной операции и `cudaGetErrorString(status)`, после чего останавливает текущий запрос сравнения.",
    "בונה הודעת חריגה משם הפעולה שנכשלה ומ־`cudaGetErrorString(status)`, ואז עוצרת את בקשת הדירוג הנוכחית."
  );
  if (/^__global__ void cosine_scores_kernel\(/.test(text)) return say(
    "Declares the project-owned CUDA kernel. NVIDIA launches many copies of this function; each valid thread computes one query/reference cosine score.",
    "Объявляет собственный CUDA kernel проекта. NVIDIA запускает множество копий этой функции; каждый допустимый thread вычисляет одно cosine-сходство query/reference.",
    "מצהיר על CUDA kernel של הפרויקט. NVIDIA משגרת עותקים רבים של הפונקציה; כל thread תקין מחשב ציון cosine אחד לזוג query/reference."
  );
  if (/^const float\* queries,?$/.test(text)) return say(
    "Receives a read-only pointer to the flat device matrix of query embeddings with logical shape B x D.",
    "Получает read-only указатель на плоскую device-матрицу входных embeddings логической формы B x D.",
    "מקבל מצביע לקריאה בלבד אל מטריצת embeddings שטוחה בזיכרון ההתקן, בצורה לוגית B x D."
  );
  if (/^const float\* references,?$/.test(text)) return say(
    "Receives a read-only pointer to the flat device matrix of reference embeddings with logical shape N x D.",
    "Получает read-only указатель на плоскую device-матрицу эталонных embeddings логической формы N x D.",
    "מקבל מצביע לקריאה בלבד אל מטריצת embeddings של הייחוסים בזיכרון ההתקן, בצורה לוגית N x D."
  );
  if (/^float\* scores,?$/.test(text)) return say(
    "Receives the writable device buffer where the kernel stores the complete B x N similarity matrix.",
    "Получает доступный для записи device-буфер, куда kernel сохраняет полную матрицу сходства B x N.",
    "מקבל מאגר התקן לכתיבה שבו ה־kernel שומר את מטריצת הדמיון המלאה B x N."
  );
  if (/^int query_count,?$/.test(text)) return say(
    "Supplies B, the number of query face embeddings processed by this launch.",
    "Передаёт B: количество входных embeddings лиц, обрабатываемых этим запуском.",
    "מספק את B, מספר embeddings של פני הקלט שמעובדים בשיגור הזה."
  );
  if (/^int reference_count,?$/.test(text)) return say(
    "Supplies N, the number of cached reference embeddings compared with every query.",
    "Передаёт N: количество закэшированных эталонных embeddings, с которыми сравнивается каждый запрос.",
    "מספק את N, מספר embeddings של הייחוס שבמטמון אשר מושווים לכל שאילתה."
  );
  if (/^int dimensions,?$/.test(text)) return say(
    "Supplies D, the number of float components in one embedding; SFace uses D = 128.",
    "Передаёт D: число float-компонентов одного embedding; для SFace D = 128.",
    "מספק את D, מספר רכיבי float ב־embedding יחיד; ב־SFace הערך הוא D = 128."
  );
  if (/^\)\s*\{$/.test(text)) return say(
    "Closes the preceding multi-line parameter list and opens the function body in which those parameters are used.",
    "Закрывает многострочный список параметров и открывает тело функции, где эти параметры будут использоваться.",
    "סוגר את רשימת הפרמטרים הרב־שורתית ופותח את גוף הפונקציה שבו ייעשה שימוש בפרמטרים."
  );
  if (/^\);$/.test(text)) return say(
    "Closes the preceding multi-line C++ call; execution uses all arguments listed immediately above.",
    "Закрывает предыдущий многострочный вызов C++; при выполнении используются все аргументы, перечисленные выше.",
    "סוגר את קריאת ה־C++ הרב־שורתית הקודמת; הביצוע משתמש בכל הארגומנטים הרשומים מעל."
  );
  if (/Grid Y selects a query image/.test(text)) return say(
    "Documents the two-dimensional launch mapping: grid Y selects one query, while grid X walks through blocks of references.",
    "Поясняет двумерное распределение запуска: grid Y выбирает запрос, а grid X проходит по блокам эталонов.",
    "מתעד את מיפוי השיגור הדו־ממדי: grid Y בוחר שאילתה אחת, ו־grid X עובר על בלוקים של ייחוסים."
  );
  if (/guard is required because the final block/.test(text)) return say(
    "Explains why the index check is necessary: ceil(N/256) can launch extra threads in the last reference block.",
    "Объясняет boundary guard: `ceil(N/256)` может создать лишние threads в последнем блоке эталонов.",
    "מסביר מדוע נדרשת בדיקת גבול: `ceil(N/256)` עלול לשגר threads עודפים בבלוק הייחוסים האחרון."
  );
  if (/^const int reference_index = blockIdx\.x \* blockDim\.x \+ threadIdx\.x;/.test(text)) return say(
    "Converts the X block number and the thread's local X position into one global reference index from 0 to N-1.",
    "Преобразует номер блока X и локальную позицию thread в глобальный индекс эталона от 0 до N-1.",
    "ממיר את מספר הבלוק בציר X ואת מיקום ה־thread המקומי לאינדקס ייחוס גלובלי בין 0 ל־N-1."
  );
  if (/^const int query_index = blockIdx\.y;/.test(text)) return say(
    "Uses the Y block number as the query index, so every grid row handles one input embedding.",
    "Использует номер блока Y как индекс запроса, поэтому каждая строка grid обрабатывает один входной embedding.",
    "משתמש במספר הבלוק בציר Y כאינדקס השאילתה, כך שכל שורת grid מטפלת ב־embedding קלט אחד."
  );
  if (/^if \(query_index >= query_count \|\| reference_index >= reference_count\) return;/.test(text)) return say(
    "Stops only out-of-range threads before they read or write memory; valid query/reference pairs continue to the dot product.",
    "Останавливает только threads с индексами вне диапазона до обращения к памяти; допустимые пары query/reference продолжают вычисление.",
    "עוצר רק threads שהאינדקסים שלהם מחוץ לטווח לפני גישה לזיכרון; זוגות query/reference תקינים ממשיכים לחישוב."
  );
  if (/^float dot = 0\.0f;/.test(text)) return say(
    "Initializes this thread's dot-product accumulator to zero before processing the 128 embedding components.",
    "Обнуляет аккумулятор скалярного произведения текущего thread перед обработкой 128 компонентов embedding.",
    "מאתחל לאפס את צובר המכפלה הסקלרית של ה־thread לפני עיבוד 128 רכיבי ה־embedding."
  );
  if (/^for \(int index = 0; index < dimensions; \+\+index\)/.test(text)) return say(
    "Iterates over all D embedding components; for SFace the loop performs exactly 128 multiply-add steps per score.",
    "Перебирает все D компонентов embedding; для SFace цикл выполняет ровно 128 операций multiply-add на одну оценку.",
    "עובר על כל D רכיבי ה־embedding; ב־SFace הלולאה מבצעת בדיוק 128 צעדי multiply-add לכל ציון."
  );
  if (/^dot \+= queries\[query_index \* dimensions \+ index\] \* references\[reference_index \* dimensions \+ index\];/.test(text)) return say(
    "Multiplies matching components from the selected query and reference vectors and accumulates the product into this thread's score.",
    "Умножает соответствующие компоненты выбранных query- и reference-векторов и добавляет произведение к оценке текущего thread.",
    "מכפיל רכיבים תואמים מווקטור השאילתה ומווקטור הייחוס שנבחרו, ומוסיף את המכפלה לציון של ה־thread."
  );
  if (/^scores\[query_index \* reference_count \+ reference_index\] = dot;/.test(text)) return say(
    "Writes the finished cosine score into row query_index and column reference_index of the flat B x N output matrix.",
    "Записывает готовое cosine-сходство в строку `query_index` и столбец `reference_index` плоской матрицы B x N.",
    "כותב את ציון ה־cosine שהושלם לשורה `query_index` ולעמודה `reference_index` במטריצת הפלט השטוחה B x N."
  );
  if (/^std::vector<float> sface_cuda_scores\(/.test(text)) return say(
    "Defines the host-side C++ entry point that allocates GPU buffers, launches the kernel, copies the B x N scores back, and returns them as a vector.",
    "Объявляет host-функцию C++, которая выделяет GPU-буферы, запускает kernel, копирует оценки B x N обратно и возвращает их в `std::vector`.",
    "מגדיר את נקודת הכניסה בצד המארח שמקצה מאגרי GPU, משגרת את ה־kernel, מעתיקה חזרה ציוני B x N ומחזירה אותם כ־`std::vector`."
  );
  if (/^const std::vector<float>& queries,?$/.test(text)) return say(
    "Accepts the host-resident flat B x D query matrix by constant reference, avoiding an extra C++ vector copy.",
    "Принимает плоскую host-матрицу запросов B x D по константной ссылке, не создавая лишнюю копию C++-вектора.",
    "מקבל את מטריצת השאילתות השטוחה B x D שבזיכרון המארח לפי הפניה קבועה, ללא העתקת vector נוספת."
  );
  if (/^const std::vector<float>& references,?$/.test(text)) return say(
    "Accepts the host-resident flat N x D reference matrix by constant reference, avoiding an extra C++ vector copy.",
    "Принимает плоскую host-матрицу эталонов N x D по константной ссылке, не создавая лишнюю копию C++-вектора.",
    "מקבל את מטריצת הייחוסים השטוחה N x D שבזיכרון המארח לפי הפניה קבועה, ללא העתקת vector נוספת."
  );
  if (/^if \(query_count <= 0 \|\| reference_count <= 0 \|\| dimensions <= 0\) return \{\};/.test(text)) return say(
    "Rejects empty or invalid matrix dimensions early and returns an empty score vector without allocating GPU memory.",
    "Сразу отклоняет пустые или некорректные размеры матриц и возвращает пустой результат без выделения GPU-памяти.",
    "דוחה מיד ממדי מטריצה ריקים או לא תקינים ומחזיר תוצאה ריקה בלי להקצות זיכרון GPU."
  );
  if (/^float\* device_(queries|references|scores) = nullptr;/.test(text)) {
    const buffer = text.match(/^float\* (device_\w+)/)?.[1] || "device buffer";
    return say(
      `Declares the ${buffer} GPU pointer as null so cleanup can safely test or free it even if a later allocation fails.`,
      `Объявляет GPU-указатель ${buffer} равным null, чтобы очистка оставалась безопасной даже при ошибке последующего выделения памяти.`,
      `מצהיר על מצביע ה־GPU ‏${buffer} כ־null, כדי שהניקוי יישאר בטוח גם אם הקצאה מאוחרת תיכשל.`
    );
  }
  if (/^const std::size_t query_bytes = queries\.size\(\) \* sizeof\(float\);/.test(text)) return say(
    "Calculates the exact byte count needed to upload all B x D query floats.",
    "Вычисляет точное число байт для загрузки всех B x D float-значений запросов.",
    "מחשב את מספר הבייטים המדויק להעלאת כל ערכי ה־float של שאילתות B x D."
  );
  if (/^const std::size_t reference_bytes = references\.size\(\) \* sizeof\(float\);/.test(text)) return say(
    "Calculates the exact byte count needed to upload all N x D reference floats.",
    "Вычисляет точное число байт для загрузки всех N x D float-значений эталонов.",
    "מחשב את מספר הבייטים המדויק להעלאת כל ערכי ה־float של ייחוסים N x D."
  );
  if (/^const std::size_t score_bytes =/.test(text)) return say(
    "Calculates storage for B x N float scores, converting B to size_t before multiplication to avoid signed integer overflow rules.",
    "Вычисляет память для B x N оценок float, заранее преобразуя B в `size_t`, чтобы умножение выполнялось в беззнаковом размере.",
    "מחשב מקום עבור B x N ציוני float, תוך המרת B ל־`size_t` לפני הכפל כדי להשתמש בחישוב גודל ללא סימן."
  );
  if (/cudaMalloc\(&device_(queries|references|scores),/.test(text)) {
    const kind = text.match(/device_(queries|references|scores)/)?.[1] || "data";
    const terms = {
      queries: ["query embeddings", "входных embeddings", "embeddings של השאילתות"],
      references: ["reference embeddings", "эталонных embeddings", "embeddings של הייחוסים"],
      scores: ["B x N output scores", "выходных оценок B x N", "ציוני הפלט B x N"]
    }[kind];
    return say(
      `Allocates device memory for ${terms[0]}; check_cuda turns allocation failure into a named exception.`,
      `Выделяет device-память для ${terms[1]}; ` + "`check_cuda` превращает ошибку выделения в именованное исключение.",
      `מקצה זיכרון התקן עבור ${terms[2]}; ` + "`check_cuda` ממירה כשל הקצאה לחריגה עם שם הפעולה."
    );
  }
  if (/Every query\/reference pair is evaluated/.test(text)) return say(
    "States the benchmark rule: duplicate images are still separate work items and every query/reference pair must execute.",
    "Фиксирует правило эксперимента: одинаковые изображения остаются отдельными заданиями, и каждая пара query/reference действительно вычисляется.",
    "קובע את כלל הניסוי: גם תמונות כפולות נשארות משימות נפרדות, וכל זוג query/reference אכן מחושב."
  );
  if (/deliberately a measurement of executed inference work/.test(text)) return say(
    "Clarifies that the timing measures executed work rather than a cache or duplicate-skipping optimization.",
    "Уточняет, что замер относится к реально выполненной работе, а не к кэшу или пропуску повторов.",
    "מבהיר שהתזמון מודד עבודה שבוצעה בפועל ולא מטמון או דילוג על כפילויות."
  );
  if (/cudaMemcpy\(device_queries, queries\.data\(\), query_bytes, cudaMemcpyHostToDevice\)/.test(text)) return say(
    "Copies the complete B x D query matrix from host RAM to device_queries in GPU memory before the kernel launch.",
    "Копирует полную матрицу запросов B x D из RAM в `device_queries` в GPU-памяти до запуска kernel.",
    "מעתיק את מטריצת השאילתות המלאה B x D מ־RAM אל `device_queries` בזיכרון ה־GPU לפני שיגור ה־kernel."
  );
  if (/cudaMemcpy\(device_references, references\.data\(\), reference_bytes, cudaMemcpyHostToDevice\)/.test(text)) return say(
    "Copies the complete N x D reference matrix from host RAM to device_references in GPU memory before the kernel launch.",
    "Копирует полную матрицу эталонов N x D из RAM в `device_references` в GPU-памяти до запуска kernel.",
    "מעתיק את מטריצת הייחוסים המלאה N x D מ־RAM אל `device_references` בזיכרון ה־GPU לפני שיגור ה־kernel."
  );
  if (/^const dim3 block\(256\);/.test(text)) return say(
    "Configures each CUDA block with 256 threads along X; each thread is responsible for one reference score.",
    "Задаёт 256 CUDA threads по оси X в каждом block; один thread отвечает за одну оценку с эталоном.",
    "מגדיר 256 CUDA threads בציר X בכל block; כל thread אחראי לציון מול ייחוס אחד."
  );
  if (/^const dim3 grid\(\(reference_count \+ block\.x - 1\) \/ block\.x, query_count\);/.test(text)) return say(
    "Creates a 2D grid with ceil(N/256) blocks along X and B blocks along Y, covering every query/reference pair.",
    "Создаёт двумерный grid: `ceil(N/256)` блоков по X и B блоков по Y, покрывая все пары query/reference.",
    "יוצר grid דו־ממדי עם `ceil(N/256)` בלוקים בציר X ו־B בלוקים בציר Y, המכסים כל זוג query/reference."
  );
  if (/^cosine_scores_kernel<<<grid, block>>>\(/.test(text)) return say(
    "Launches the custom CUDA kernel asynchronously with the previously defined grid and 256-thread block geometry.",
    "Асинхронно запускает собственный CUDA kernel с заданными ранее grid и block по 256 threads.",
    "משגר באופן אסינכרוני את CUDA kernel המותאם עם ה־grid ועם block בן 256 threads שהוגדרו קודם."
  );
  if (/^device_queries, device_references, device_scores, query_count, reference_count, dimensions$/.test(text)) return say(
    "Passes the three device buffers and the B, N, D dimensions into every launched kernel instance.",
    "Передаёт каждому экземпляру kernel три device-буфера и размеры B, N, D.",
    "מעביר לכל מופע kernel ששוגר את שלושת מאגרי ההתקן ואת הממדים B, N, D."
  );
  if (/cudaGetLastError\(\)/.test(text)) return say(
    "Checks whether kernel dispatch itself failed, for example because of invalid launch geometry or missing CUDA resources.",
    "Проверяет ошибку самого запуска kernel, например некорректную геометрию или нехватку CUDA-ресурсов.",
    "בודק אם שיגור ה־kernel עצמו נכשל, למשל עקב גאומטריית שיגור לא תקינה או מחסור במשאבי CUDA."
  );
  if (/^std::vector<float> result\(static_cast<std::size_t>\(query_count\) \* reference_count\);/.test(text)) return say(
    "Allocates a host vector with exactly B x N float elements to receive the completed score matrix.",
    "Выделяет host-вектор ровно из B x N элементов float для приёма готовой матрицы оценок.",
    "מקצה vector בזיכרון המארח עם בדיוק B x N איברי float לקבלת מטריצת הציונים שהושלמה."
  );
  if (/cudaMemcpy\(result\.data\(\), device_scores, score_bytes, cudaMemcpyDeviceToHost\)/.test(text)) return say(
    "Copies the complete B x N score matrix from GPU memory into result on the host; this synchronous copy also waits for the kernel output it needs.",
    "Копирует полную матрицу B x N из GPU-памяти в host-вектор `result`; синхронное копирование также ожидает нужный результат kernel.",
    "מעתיק את מטריצת B x N המלאה מזיכרון ה־GPU אל `result` במארח; ההעתקה הסינכרונית גם ממתינה לפלט ה־kernel הדרוש."
  );
  if (/^cudaFree\(device_(queries|references|scores)\);/.test(text)) {
    const buffer = text.match(/device_(queries|references|scores)/)?.[1] || "buffer";
    return say(
      `Releases the GPU allocation for ${buffer} so this scoring request does not leak device memory.`,
      `Освобождает GPU-память буфера ${buffer}, чтобы запрос сравнения не создавал утечку device-памяти.`,
      `משחרר את הקצאת ה־GPU של ${buffer}, כדי שבקשת הדירוג לא תדליף זיכרון התקן.`
    );
  }
  if (/^return result;/.test(text)) return say(
    "Returns the host B x N score vector to sface_engine.cpp after all three GPU buffers have been released.",
    "Возвращает host-вектор оценок B x N в `sface_engine.cpp` после освобождения всех трёх GPU-буферов.",
    "מחזיר את וקטור ציוני B x N שבמארח אל `sface_engine.cpp` לאחר שחרור כל שלושת מאגרי ה־GPU."
  );
  if (/^catch \(\.\.\.\)/.test(text)) return say(
    "Catches any exception from copying, launch checking, or result transfer so device buffers can be released before the same error is rethrown.",
    "Перехватывает любую ошибку копирования, запуска или возврата результата, чтобы освободить device-буферы перед повторной передачей ошибки.",
    "לוכד כל חריגה מהעתקה, מבדיקת השיגור או מהחזרת התוצאה, כדי לשחרר את מאגרי ההתקן לפני זריקת אותה שגיאה מחדש."
  );
  if (/^throw;$/.test(text)) return say(
    "Rethrows the original exception after cleanup, preserving its CUDA operation name and error text for the caller.",
    "Повторно выбрасывает исходное исключение после очистки, сохраняя название CUDA-операции и текст ошибки.",
    "זורק מחדש את החריגה המקורית לאחר הניקוי, תוך שמירת שם פעולת CUDA וטקסט השגיאה עבור הקוד הקורא."
  );
  if (/clGetDeviceIDs\s*\(/.test(text)) return say("Queries OpenCL for a real device of the requested type; this project requests a GPU and does not silently substitute CPU.", "Запрашивает у OpenCL реальное устройство требуемого типа; проект просит GPU и не подставляет CPU скрытно.", "מבקש מ‑OpenCL התקן אמיתי מהסוג הנדרש; הפרויקט מבקש GPU ואינו מחליף אותו ב‑CPU בסתר.");
  if (/clCreate(Buffer|Context|CommandQueue|Program|Kernel)/.test(text)) return say("Creates the named OpenCL resource used to hold data, compile kernels, or queue GPU work.", "Создаёт указанный ресурс OpenCL для хранения данных, компиляции ядер или постановки GPU-работы в очередь.", "יוצר את משאב OpenCL המצוין לאחסון נתונים, הידור kernels או תזמון עבודת GPU.");
  if (/clEnqueueNDRangeKernel\s*\(/.test(text)) return say("Enqueues this OpenCL kernel over its global work range so independent outputs run in parallel on the GPU.", "Ставит это OpenCL-ядро в очередь с глобальным рабочим диапазоном, чтобы независимые выходы вычислялись параллельно на GPU.", "מכניס את kernel של OpenCL לתור על פני טווח העבודה הגלובלי כדי שפלטים בלתי תלויים ירוצו במקביל ב‑GPU.");
  if (/clEnqueue(Read|Write)Buffer\s*\(/.test(text)) return say("Transfers the specified tensor buffer between host memory and OpenCL device memory.", "Переносит указанный тензорный буфер между памятью CPU и памятью устройства OpenCL.", "מעביר את מאגר הטנזור המצוין בין זיכרון המארח לזיכרון התקן OpenCL.");
  if (/clFinish\s*\(/.test(text)) return say("Waits until all previously queued OpenCL commands have completed before timing or reading results.", "Ждёт завершения всех ранее поставленных команд OpenCL перед замером времени или чтением результата.", "ממתין לסיום כל פקודות OpenCL שבתור לפני מדידת זמן או קריאת תוצאות.");
  if (/run_deepid_opencl_forward_batch\s*\(/.test(text)) return say("Calls the native OpenCL DeepID forward pass once for the complete tensor batch.", "Один раз вызывает нативный пакетный проход DeepID через OpenCL для всей тензорной пачки.", "קורא פעם אחת למעבר DeepID המקורי ב‑OpenCL עבור כל אצוות הטנזורים.");
  if (/embed_batch\s*\(/.test(text)) return say("Computes embeddings for the supplied images as one batch through the selected backend.", "Получает векторы переданных изображений одним пакетом через выбранный backend.", "מחשב embeddings לתמונות שסופקו כאצווה אחת דרך ה‑backend שנבחר.");
  if (/cosine|similarity/.test(text)) return say("Computes or stores cosine similarity used to rank the current face against known references.", "Вычисляет или сохраняет косинусное сходство для ранжирования текущего лица относительно известных эталонов.", "מחשב או שומר דמיון cosine לדירוג הפנים הנוכחיות מול הייחוסים המוכרים.");
  if (/^if\s*\(/.test(text)) return say(`Evaluates the C++ condition ${text} and enters this branch only when it is true.`, `Проверяет условие C++ ${text} и входит в эту ветку только при истинном результате.`, `בודק את תנאי C++ ‏${text} ונכנס לענף רק כאשר הוא אמת.`);
  if (/^(for|while)\s*\(/.test(text)) return say(`Starts the C++ loop ${text} to process the indicated elements or indices.`, `Запускает цикл C++ ${text} для обработки указанных элементов или индексов.`, `מתחיל את לולאת C++ ‏${text} לעיבוד האיברים או האינדקסים המצוינים.`);
  if (/^return\b/.test(text)) return say(`Returns ${text.replace(/^return\s*/, "").replace(/;$/, "")} to the C++ caller.`, `Возвращает ${text.replace(/^return\s*/, "").replace(/;$/, "")} вызвавшему C++-коду.`, `מחזיר ${text.replace(/^return\s*/, "").replace(/;$/, "")} לקוד C++ שקרא לפונקציה.`);
  if (/^[{}];?$/.test(text)) return say("Opens or closes the current C++ scope; it groups the statements controlled by the surrounding declaration or condition.", "Открывает или закрывает текущую область C++; она объединяет команды окружающего объявления или условия.", "פותח או סוגר את תחום C++ הנוכחי שמאגד את הפקודות של ההצהרה או התנאי הסובבים.");
  if (/^[A-Za-z_][\w:<>,*&\s]+\([^;]*\)\s*\{?$/.test(text)) return say(
    "Declares or calls the named C++ operation; its arguments define the data and dimensions used by the surrounding detector step.",
    "Объявляет или вызывает указанную C++-операцию; её аргументы задают данные и размеры текущего шага детектора.",
    "מצהיר או קורא לפעולת C++ בשם המוצג; הארגומנטים שלה מגדירים את הנתונים והממדים של שלב הגלאי הנוכחי."
  );
  if (/^[A-Za-z_][\w:<>,*&\s]+\s+[A-Za-z_]\w*\s*=/.test(text)) return say(
    "Creates a typed C++ value from the expression on this line so the following detector operation can reuse the computed result.",
    "Создаёт типизированное значение C++ из выражения этой строки, чтобы следующий шаг детектора использовал вычисленный результат.",
    "יוצר ערך C++ מטיפוס מוגדר מתוך הביטוי בשורה, כדי ששלב הגלאי הבא יוכל להשתמש בתוצאה שחושבה."
  );
  return say(
    "Supplies part of the surrounding C++ declaration or call; the neighboring lines determine the complete operation and its data flow.",
    "Передаёт часть окружающего объявления или вызова C++; соседние строки задают полную операцию и движение её данных.",
    "מספק חלק מהצהרת או מקריאת C++ הסובבת; השורות הסמוכות מגדירות את הפעולה המלאה ואת זרימת הנתונים שלה."
  );
}

const nativeStageContexts = [
  {
    end: 60,
    en: "the one-time NativeSFaceEngine initialization",
    ru: "одноразовой инициализации NativeSFaceEngine",
    he: "האתחול החד-פעמי של NativeSFaceEngine"
  },
  {
    end: 95,
    en: "host preparation of the shared YuNet NCHW batch",
    ru: "host-подготовки общего NCHW-пакета YuNet",
    he: "הכנת אצוות NCHW המשותפת של YuNet במארח"
  },
  {
    end: 187,
    en: "batched YuNet detection and SFace embedding",
    ru: "пакетного детектирования YuNet и получения SFace-векторов",
    he: "זיהוי YuNet והפקת embeddings של SFace באצווה"
  },
  {
    end: 270,
    en: "five-landmark alignment and L2 normalization",
    ru: "выравнивания по пяти ориентирам и L2-нормализации",
    he: "יישור לפי חמש נקודות ציון ונרמול L2"
  },
  {
    end: 345,
    en: "the explicit CUDA cosine-score implementation",
    ru: "явной CUDA-реализации cosine-оценок",
    he: "מימוש CUDA המפורש של ציוני cosine"
  },
  {
    end: Number.POSITIVE_INFINITY,
    en: "batch dispatch, ranking, and the final identity decision",
    ru: "диспетчеризации пакета, ранжирования и итогового решения о личности",
    he: "שיגור האצווה, הדירוג והחלטת הזהות הסופית"
  }
];

const nativeValueMeanings = {
  label: ["the identity name stored with one reference", "имя человека, сохранённое вместе с одним эталоном", "שם הזהות הנשמר עם ייחוס אחד"],
  path: ["the filesystem path of an input or matched reference image", "путь к входному снимку или совпавшему эталону", "נתיב הקובץ של תמונת קלט או ייחוס תואם"],
  vector: ["one normalized 128-value SFace embedding", "один нормализованный SFace-вектор из 128 значений", "embedding מנורמל של SFace בן 128 ערכים"],
  use_cuda: ["whether this worker must use CUDA instead of the sequential CPU baseline", "должен ли worker использовать CUDA вместо последовательного CPU baseline", "האם ה-worker חייב להשתמש ב-CUDA במקום קו הבסיס הסדרתי של CPU"],
  min_score: ["the minimum cosine similarity required to accept a name", "минимальное cosine-сходство для принятия имени", "דמיון cosine מינימלי הנדרש לקבלת שם"],
  min_margin: ["the minimum lead over the runner-up identity", "минимальный отрыв от личности на втором месте", "הפער המינימלי מעל הזהות שבמקום השני"],
  env: ["the persistent ONNX Runtime environment and its diagnostic name", "постоянную среду ONNX Runtime и её диагностическое имя", "סביבת ONNX Runtime הקבועה ושמה לצורכי אבחון"],
  options: ["the session configuration shared by YuNet and SFace", "настройки сессии, общие для YuNet и SFace", "הגדרות הסשן המשותפות ל-YuNet ול-SFace"],
  yunet: ["the persistent YuNet face-detector ONNX session", "постоянную ONNX-сессию детектора лиц YuNet", "סשן ONNX קבוע של גלאי הפנים YuNet"],
  sface: ["the persistent SFace embedding ONNX session", "постоянную ONNX-сессию получения SFace-векторов", "סשן ONNX קבוע להפקת embeddings של SFace"],
  references: ["the in-memory bank of labelled reference embeddings", "банк размеченных эталонных векторов в памяти", "מאגר embeddings מסומנים לייחוס בזיכרון"],
  images: ["the decoded RGBA images belonging to the current request", "декодированные RGBA-изображения текущего запроса", "תמונות RGBA המפוענחות של הבקשה הנוכחית"],
  metadata: ["the label and source path paired with every startup reference image", "имя и исходный путь каждой эталонной фотографии при запуске", "השם ונתיב המקור המוצמדים לכל תמונת ייחוס בעת ההפעלה"],
  embedded: ["the batch of 128D embeddings and face-validity flags", "пакет 128D-векторов и флагов найденного лица", "אצוות embeddings בגודל 128D ודגלי תקינות פנים"],
  batch: ["the padded NCHW BGR tensor and per-image content dimensions", "дополненный NCHW BGR-тензор и размеры содержимого каждого снимка", "טנזור BGR מרופד בסידור NCHW וממדי התוכן של כל תמונה"],
  scale: ["the resize ratio capped at 1.0 so small images are not enlarged", "коэффициент resize не выше 1, поэтому маленькие снимки не увеличиваются", "יחס שינוי הגודל המוגבל ל-1.0 כדי שתמונות קטנות לא יוגדלו"],
  width: ["the resized image width with a 32-pixel minimum", "ширину изображения после resize с минимумом 32 пикселя", "רוחב התמונה לאחר שינוי גודל עם מינימום 32 פיקסלים"],
  height: ["the resized image height with a 32-pixel minimum", "высоту изображения после resize с минимумом 32 пикселя", "גובה התמונה לאחר שינוי גודל עם מינימום 32 פיקסלים"],
  plane: ["the number of float elements in one padded color plane", "число float-элементов в одной дополненной цветовой плоскости", "מספר איברי float במישור צבע מרופד אחד"],
  target_width: ["this image's unpadded resized width", "ширину текущего снимка после resize до padding", "הרוחב של התמונה הנוכחית לאחר שינוי גודל ולפני ריפוד"],
  target_height: ["this image's unpadded resized height", "высоту текущего снимка после resize до padding", "הגובה של התמונה הנוכחית לאחר שינוי גודל ולפני ריפוד"],
  scale_x: ["the horizontal mapping from output pixels back to source coordinates", "горизонтальный коэффициент обратного перехода к координатам исходника", "מקדם המיפוי האופקי מפיקסלי הפלט חזרה לקואורדינטות המקור"],
  scale_y: ["the vertical mapping from output pixels back to source coordinates", "вертикальный коэффициент обратного перехода к координатам исходника", "מקדם המיפוי האנכי מפיקסלי הפלט חזרה לקואורדינטות המקור"],
  input_shape: ["the B x 3 x H x W shape supplied to YuNet", "форму B x 3 x H x W, передаваемую YuNet", "הצורה B x 3 x H x W הנמסרת ל-YuNet"],
  memory: ["CPU tensor memory whose data ONNX Runtime transfers to the selected execution provider", "CPU-память тензора, данные которой ONNX Runtime переносит выбранному provider", "זיכרון טנזור ב-CPU שאת נתוניו ONNX Runtime מעביר ל-provider שנבחר"],
  input: ["the ONNX tensor view over the prepared NCHW batch", "ONNX-представление подготовленного NCHW-пакета", "תצוגת טנזור ONNX מעל אצוות NCHW המוכנה"],
  outputs: ["the twelve YuNet output tensors for three feature-map strides", "двенадцать выходных тензоров YuNet для трёх шагов feature map", "שנים-עשר טנזורי הפלט של YuNet עבור שלושה stride-ים"],
  faces: ["one strongest detected-face record per input image", "одну запись сильнейшего найденного лица на каждый снимок", "רשומת הפנים החזקה ביותר לכל תמונת קלט"],
  confidence: ["the geometric mean of YuNet class and object probabilities", "геометрическое среднее вероятностей class и object из YuNet", "הממוצע הגאומטרי של הסתברויות class ו-object מ-YuNet"],
  rank: ["the area-and-centering score used to choose one face", "оценку площади и близости к центру для выбора одного лица", "ציון שטח ומרכוז המשמש לבחירת פנים אחת"],
  aligned: ["the B x 3 x 112 x 112 aligned-face tensor for SFace", "выровненный тензор лиц B x 3 x 112 x 112 для SFace", "טנזור הפנים המיושרות B x 3 x 112 x 112 עבור SFace"],
  result: ["the native result object returned to the worker caller", "native-результат, возвращаемый вызывающему worker-коду", "אובייקט תוצאת native המוחזר לקוד שקרא ל-worker"],
  scores: ["the complete query-by-reference cosine-score matrix", "полную матрицу cosine-оценок query x reference", "מטריצת ציוני cosine מלאה בגודל query כפול reference"],
  flat_references: ["all cached 128D reference vectors packed contiguously", "все кэшированные 128D-векторы эталонов в непрерывной памяти", "כל וקטורי הייחוס השמורים בגודל 128D באריזה רציפה"],
  shared_ms: ["total request time divided by the number of requested images", "общее время запроса, делённое на число изображений", "זמן הבקשה הכולל מחולק במספר התמונות"],
  label_scores: ["the best reference score retained separately for each identity", "лучшую оценку эталона, сохранённую отдельно для каждой личности", "ציון הייחוס הטוב ביותר הנשמר בנפרד לכל זהות"],
  ranked: ["the identities sorted from highest to lowest similarity", "личности, отсортированные от наибольшего сходства к меньшему", "הזהויות הממוינות מדמיון גבוה לנמוך"]
  ,image: ["the current decoded RGBA image selected from the request batch", "текущее декодированное RGBA-изображение из пакета запроса", "תמונת ה-RGBA המפוענחת הנוכחית שנבחרה מאצוות הבקשה"]
  ,source_y: ["the source-image y coordinate sampled for the current output pixel", "координату y исходного изображения для текущего выходного пикселя", "קואורדינטת y בתמונת המקור הנדגמת עבור פיקסל הפלט הנוכחי"]
  ,source_x: ["the source-image x coordinate sampled for the current output pixel", "координату x исходного изображения для текущего выходного пикселя", "קואורדינטת x בתמונת המקור הנדגמת עבור פיקסל הפלט הנוכחי"]
  ,offset: ["the flat NCHW index of the current image, channel, row, and column", "плоский NCHW-индекс текущих image, channel, row и column", "אינדקס NCHW השטוח של התמונה, הערוץ, השורה והעמודה הנוכחיים"]
  ,input_name: ["YuNet's first ONNX input name", "имя первого ONNX-входа YuNet", "שם קלט ONNX הראשון של YuNet"]
  ,best_rank: ["the strongest face-candidate rank found so far for the current image", "лучшую оценку кандидата лица, найденную для текущего снимка", "ציון מועמד הפנים החזק ביותר שנמצא עד כה עבור התמונה הנוכחית"]
  ,shape: ["the dimensions of the selected YuNet output tensor", "размерности выбранного выходного тензора YuNet", "ממדי טנזור הפלט הנבחר של YuNet"]
  ,box: ["the four encoded YuNet box values for the current anchor", "четыре закодированных значения YuNet box текущего anchor", "ארבעת ערכי תיבת YuNet המקודדים עבור ה-anchor הנוכחי"]
  ,points: ["the ten YuNet landmark coordinates for the current anchor", "десять координат ориентиров YuNet текущего anchor", "עשר קואורדינטות נקודות הציון של YuNet עבור ה-anchor הנוכחי"]
  ,sface_input: ["the ONNX tensor view over all aligned 112 x 112 faces", "ONNX-тензор всех выровненных лиц 112 x 112", "תצוגת טנזור ONNX מעל כל הפנים המיושרות בגודל 112 x 112"]
  ,sface_input_name: ["SFace's ONNX input name", "имя ONNX-входа SFace", "שם קלט ONNX של SFace"]
  ,sface_output_name: ["SFace's ONNX embedding-output name", "имя ONNX-выхода embeddings SFace", "שם פלט ה-embedding של SFace ב-ONNX"]
  ,input_plane: ["the number of floats in one channel of the padded detector input", "число float-значений в одном канале дополненного входа детектора", "מספר ערכי float בערוץ אחד של קלט הגלאי המרופד"]
  ,output_plane: ["the number of floats in one 112 x 112 aligned-face channel", "число float-значений в одном канале выровненного лица 112 x 112", "מספר ערכי float בערוץ אחד של פנים מיושרות בגודל 112 x 112"]
  ,source_mean_x: ["the mean x coordinate of the five detected landmarks", "среднюю координату x пяти найденных ориентиров", "ממוצע קואורדינטות x של חמש נקודות הציון שזוהו"]
  ,source_mean_y: ["the mean y coordinate of the five detected landmarks", "среднюю координату y пяти найденных ориентиров", "ממוצע קואורדינטות y של חמש נקודות הציון שזוהו"]
  ,target_mean_x: ["the mean x coordinate of the canonical SFace landmark template", "среднюю координату x канонического шаблона ориентиров SFace", "ממוצע קואורדינטות x של תבנית נקודות הציון הקנונית של SFace"]
  ,target_mean_y: ["the mean y coordinate of the canonical SFace landmark template", "среднюю координату y канонического шаблона ориентиров SFace", "ממוצע קואורדינטות y של תבנית נקודות הציון הקנונית של SFace"]
  ,numerator_a: ["the accumulated scale-cosine numerator of the similarity transform", "накопленный числитель scale-cosine similarity-преобразования", "המונה המצטבר של scale-cosine בהתמרת similarity"]
  ,numerator_b: ["the accumulated scale-sine numerator of the similarity transform", "накопленный числитель scale-sine similarity-преобразования", "המונה המצטבר של scale-sine בהתמרת similarity"]
  ,denominator: ["the summed squared distance of source landmarks from their centroid", "сумму квадратов расстояний исходных ориентиров от их центра", "סכום ריבועי המרחקים של נקודות המקור מן המרכז שלהן"]
  ,sx: ["the current source landmark's x offset from the source centroid", "смещение x текущего исходного ориентира от центра", "היסט x של נקודת המקור הנוכחית ממרכז נקודות המקור"]
  ,sy: ["the current source landmark's y offset from the source centroid", "смещение y текущего исходного ориентира от центра", "היסט y של נקודת המקור הנוכחית ממרכז נקודות המקור"]
  ,dx: ["the current coordinate's horizontal offset used by the similarity transform", "горизонтальное смещение текущей координаты для similarity-преобразования", "ההיסט האופקי של הקואורדינטה הנוכחית בהתמרת similarity"]
  ,dy: ["the current coordinate's vertical offset used by the similarity transform", "вертикальное смещение текущей координаты для similarity-преобразования", "ההיסט האנכי של הקואורדינטה הנוכחית בהתמרת similarity"]
  ,sum: ["the accumulated sum of squared embedding components", "накопленную сумму квадратов компонент embedding", "הסכום המצטבר של ריבועי רכיבי ה-embedding"]
  ,results: ["one final recognition result for every requested image", "по одному итоговому результату распознавания на каждый снимок", "תוצאת זיהוי סופית אחת לכל תמונה מבוקשת"]
};

function nativeStageContext(index, lang) {
  const stage = nativeStageContexts.find((item) => index <= item.end) || nativeStageContexts[5];
  return stage[lang] || stage.en;
}

function nativeValueMeaning(name, lang) {
  const value = nativeValueMeanings[name];
  if (!value) return "";
  return value[lang === "ru" ? 1 : lang === "he" ? 2 : 0];
}

function nativeCommentAnnotation(text, lang) {
  const say = (en, ru, he) => lang === "ru" ? ru : lang === "he" ? he : en;
  const comment = text.replace(/^\/\/\s?/, "");
  const known = [
    [/compiled into identity_cuda/, "Records that CUDA provider ownership is inside identity_cuda.exe, not Python.", "Фиксирует, что CUDA provider создаётся внутри identity_cuda.exe, а не в Python.", "מתעד שהבעלות על CUDA provider נמצאת בתוך identity_cuda.exe ולא ב-Python."],
    [/creates or owns the CUDA/, "Completes the ownership note: Python transports requests but never creates this CUDA session.", "Завершает пояснение: Python передаёт запросы, но не создаёт эту CUDA-сессию.", "משלים את ההבהרה: Python מעביר בקשות אך אינו יוצר את סשן CUDA הזה."],
    [/Reference embeddings are computed once/, "Explains that reference inference is startup work, not repeated request work.", "Объясняет, что инференс эталонов выполняется при запуске, а не для каждого запроса.", "מסביר שהסקת הייחוסים היא עבודת אתחול ואינה חוזרת בכל בקשה."],
    [/reused for every request/, "Confirms that the persistent worker reuses the already computed reference vectors.", "Подтверждает повторное использование готовых эталонных векторов постоянным worker-процессом.", "מאשר שה-worker הקבוע משתמש מחדש בווקטורי הייחוס שכבר חושבו."],
    [/Build one dynamic NCHW tensor/, "States that all request images are packed into one dynamic NCHW tensor.", "Указывает, что все изображения запроса упаковываются в один динамический NCHW-тензор.", "מציין שכל תמונות הבקשה נארזות בטנזור NCHW דינמי אחד."],
    [/entire request as one CUDA batch/, "Explains why every image is padded to the same shape: ONNX Runtime can dispatch one CUDA batch.", "Объясняет общий padding: ONNX Runtime получает возможность отправить весь запрос одним CUDA-пакетом.", "מסביר את הריפוד המשותף: ONNX Runtime יכול לשגר את כל הבקשה כאצוות CUDA אחת."],
    [/Decode YuNet's three/, "Introduces decoding of YuNet outputs at strides 8, 16, and 32.", "Вводит разбор выходов YuNet с шагами 8, 16 и 32.", "מציג את פענוח פלטי YuNet ב-stride-ים 8, 16 ו-32."],
    [/centered face candidate/, "States the selection rule: keep one strong, centered face and its five landmarks.", "Фиксирует правило выбора: сохранить одно сильное центральное лицо и пять ориентиров.", "קובע את כלל הבחירה: לשמור פנים חזקות וממורכזות ואת חמש נקודות הציון שלהן."],
    [/Estimate a 2D similarity transform/, "Introduces the least-squares similarity transform from detected landmarks to the canonical SFace template.", "Вводит similarity-преобразование от найденных ориентиров к каноническому шаблону SFace.", "מציג התמרת similarity מנקודות הציון שזוהו אל תבנית SFace הקנונית."],
    [/canonical SFace template/, "States that the transform resamples every valid face to the fixed 112 x 112 SFace input.", "Указывает, что преобразование пересэмплирует каждое лицо во вход SFace 112 x 112.", "מציין שההתמרה דוגמת כל פנים תקינות מחדש לקלט SFace קבוע בגודל 112 x 112."],
    [/Grid Y selects/, "Documents the kernel mapping: blockIdx.y selects a query and the X grid covers references.", "Документирует раскладку kernel: blockIdx.y выбирает query, а grid X покрывает эталоны.", "מתעד את מיפוי ה-kernel: ‏blockIdx.y בוחר query ו-grid X מכסה את הייחוסים."],
    [/final block may be only partly full/, "Explains why the next boundary check is mandatory when N is not divisible by 256.", "Объясняет обязательность следующей проверки границ, когда N не делится на 256.", "מסביר מדוע בדיקת הגבולות הבאה הכרחית כאשר N אינו מתחלק ב-256."],
    [/Every query\/reference pair/, "States that duplicate inputs remain independent work and every query/reference score is computed.", "Указывает, что повторы остаются отдельной работой и вычисляется каждая пара query/reference.", "מציין שקלטים כפולים נשארים עבודה נפרדת וכל ציון query/reference מחושב."],
    [/measurement of executed inference work/, "Clarifies that timing measures executed computations rather than cache hits or duplicate skipping.", "Уточняет, что время измеряет выполненные вычисления, а не кэш или пропуск повторов.", "מבהיר שהתזמון מודד חישובים שבוצעו ולא פגיעות מטמון או דילוג על כפילויות."],
    [/One dynamic batch enters/, "States that the CUDA branch submits the complete image list to YuNet and SFace together.", "Указывает, что CUDA-ветка совместно передаёт весь список изображений в YuNet и SFace.", "מציין שענף CUDA שולח יחד את כל רשימת התמונות אל YuNet ו-SFace."],
    [/graph kernels across the CUDA device/, "Explains that ONNX Runtime schedules the neural graph kernels over the NVIDIA GPU.", "Объясняет, что ONNX Runtime распределяет kernels нейросетевых графов по NVIDIA GPU.", "מסביר ש-ONNX Runtime מתזמן את kernels של הגרפים העצביים על פני ה-GPU של NVIDIA."],
    [/grading baseline intentionally/, "Defines the required baseline as the same networks invoked one image at a time on CPU.", "Определяет требуемый baseline: те же сети запускаются на CPU по одному изображению.", "מגדיר את קו הבסיס הנדרש: אותן רשתות מופעלות ב-CPU תמונה אחר תמונה."],
    [/CPU execution strictly sequential/, "Confirms that the CPU comparison does not batch multiple images.", "Подтверждает, что CPU-сравнение не объединяет несколько снимков в пакет.", "מאשר שהשוואת CPU אינה מאגדת כמה תמונות באצווה."],
    [/Query\/reference cosine products/, "Introduces the project-owned CUDA kernel used for the final score matrix.", "Вводит собственный CUDA kernel проекта для итоговой матрицы оценок.", "מציג את CUDA kernel של הפרויקט עבור מטריצת הציונים הסופית."],
    [/not by Python or a cached result/, "Confirms that these scores are freshly computed by sface_cuda.cu rather than fabricated by Python or a cache.", "Подтверждает, что sface_cuda.cu заново вычисляет оценки, а Python или кэш их не подменяют.", "מאשר ש-sface_cuda.cu מחשב את הציונים מחדש ו-Python או מטמון אינם מחליפים אותם."]
  ];
  const match = known.find((item) => item[0].test(comment));
  if (match) return say(match[1], match[2], match[3]);
  return say(
    `Documents this implementation rule in context: ${comment}`,
    `Документирует правило текущей реализации: ${comment}`,
    `מתעד את כלל המימוש הנוכחי: ${comment}`
  );
}

function nativeContextFallback(lines, index, lang) {
  const text = lines[index].trim();
  const say = (en, ru, he) => repairLocalizedText(lang === "ru" ? ru : lang === "he" ? he : en);
  const context = nativeStageContext(index, lang);
  const exact = (pattern, en, ru, he) => pattern.test(text) ? say(en, ru, he) : null;
  const exactRules = [
    exact(/^struct NativeSFaceEngine::Impl/, "Defines the private persistent state behind NativeSFaceEngine: sessions, thresholds, references, and recognition methods.", "Определяет закрытое постоянное состояние NativeSFaceEngine: сессии, пороги, эталоны и методы распознавания.", "מגדירה את המצב הפרטי והקבוע מאחורי NativeSFaceEngine: סשנים, ספים, ייחוסים ומתודות זיהוי."),
    exact(/^struct Reference/, "Defines one reference-bank record containing an identity label, source path, and normalized SFace vector.", "Определяет одну запись банка эталонов: имя человека, путь к файлу и нормализованный SFace-вектор.", "מגדירה רשומה אחת במאגר הייחוס הכוללת תווית זהות, נתיב מקור ווקטור SFace מנורמל."),
    exact(/^std::string label;/, "Declares the identity label field that is filled from the reference directory name.", "Объявляет поле имени личности, которое заполняется названием папки эталонов.", "מצהירה על שדה תווית הזהות שמתמלא משם תיקיית הייחוס."),
    exact(/^fs::path path;/, "Declares the source-image path field used to report which reference produced the winning score.", "Объявляет поле пути к исходному снимку, чтобы затем сообщить, какой эталон дал победившую оценку.", "מצהירה על שדה נתיב תמונת המקור כדי לדווח איזה ייחוס הפיק את הציון המנצח."),
    exact(/^bool use_cuda;/, "Stores the constructor's backend choice for every later inference and scoring request.", "Хранит выбранный constructor-ом backend для последующего инференса и вычисления оценок.", "שומרת את בחירת ה-backend של ה-constructor עבור כל בקשת הסקה ודירוג בהמשך."),
    exact(/^float min_score;/, "Stores the minimum cosine score that a winning identity must reach.", "Хранит минимальную cosine-оценку, которую должна набрать победившая личность.", "שומרת את ציון ה-cosine המינימלי שהזהות המנצחת חייבת להשיג."),
    exact(/^float min_margin;/, "Stores the minimum score gap required between first and second place.", "Хранит минимальный разрыв оценок между первым и вторым местом.", "שומרת את פער הציונים המינימלי הנדרש בין המקום הראשון לשני."),
    exact(/^if \(use_cuda\)/, "Selects the CUDA-only branch: provider setup during construction, batched inference during recognition, or GPU cosine scoring after embeddings are ready.", "Выбирает CUDA-ветку: подключение provider при создании, пакетный инференс при распознавании или GPU-оценки после получения embeddings.", "בוחרת בענף CUDA: חיבור provider בעת הבנייה, הסקה באצווה בזמן הזיהוי או חישוב ציוני GPU לאחר הפקת embeddings."),
    exact(/^if \(!entry\.is_regular_file\(\)\) continue;/, "Skips directory entries because only regular image files can become face references.", "Пропускает записи папок, поскольку эталоном лица может быть только обычный файл изображения.", "מדלגת על רשומות תיקייה משום שרק קובץ תמונה רגיל יכול לשמש כייחוס פנים."),
    exact(/^if \(extension != ".jpg"/, "Skips files whose extension is not JPG, JPEG, PNG, or BMP.", "Пропускает файлы с расширением, отличным от JPG, JPEG, PNG или BMP.", "מדלגת על קבצים שהסיומת שלהם אינה JPG, JPEG, PNG או BMP."),
    exact(/^if \(!embedded\.valid\[index\]\) continue;/, "Skips a reference image when YuNet did not find a valid face, preventing an invalid vector from entering the reference bank.", "Пропускает эталон, если YuNet не нашёл валидное лицо, чтобы ошибочный vector не попал в банк эталонов.", "מדלגת על תמונת ייחוס כאשר YuNet לא מצא פנים תקינות, כדי למנוע הכנסת וקטור שגוי למאגר."),
    exact(/^if \(confidence < 0\.55f\) continue;/, "Rejects this YuNet anchor because its combined class/object confidence is below 0.55.", "Отбрасывает текущий YuNet anchor, поскольку его общая class/object confidence ниже 0.55.", "דוחה את ה-anchor הנוכחי של YuNet משום שביטחון class/object המשולב נמוך מ-0.55."),
    exact(/^if \(rank <= best_rank\) continue;/, "Keeps the previously selected face because this candidate is smaller or farther from the image centre.", "Сохраняет ранее выбранное лицо, поскольку текущий кандидат меньше или дальше от центра снимка.", "משאירה את הפנים שנבחרו קודם משום שהמועמד הנוכחי קטן יותר או רחוק יותר ממרכז התמונה."),
    exact(/^if \(x < 0\.0f \|\| y < 0\.0f/, "Returns a zero pixel when inverse alignment maps outside the padded detector image.", "Возвращает нулевой пиксель, если обратное alignment-преобразование вышло за границы дополненного изображения.", "מחזירה פיקסל אפס כאשר מיפוי היישור ההפוך יוצא מגבולות תמונת הגלאי המרופדת."),
    exact(/^if \(!faces\[image\]\.valid\) continue;/, "Leaves this aligned-face slot zero-filled because YuNet found no usable face for the image.", "Оставляет место выровненного лица заполненным нулями, поскольку YuNet не нашёл пригодное лицо.", "משאירה את תא הפנים המיושרות מלא באפסים משום ש-YuNet לא מצא פנים שמישות בתמונה."),
    exact(/^if \(!result\.face_found\) continue;/, "Skips identity ranking for this image because there is no valid SFace embedding to compare.", "Не выполняет ранжирование личности для этого снимка, поскольку нет валидного SFace embedding.", "מדלגת על דירוג הזהות לתמונה זו משום שאין embedding תקין של SFace להשוואה."),
    exact(/^if \(score > best\.score\) best =/, "Replaces the identity's retained reference only when the current reference has a higher cosine score.", "Заменяет сохранённый эталон личности только тогда, когда текущий эталон дал более высокую cosine-оценку.", "מחליפה את הייחוס השמור של הזהות רק כאשר הייחוס הנוכחי קיבל ציון cosine גבוה יותר."),
    exact(/^struct LabelBest/, "Defines the per-identity accumulator: its best score starts at -1 and stores the winning reference index.", "Определяет accumulator одной личности: лучшая оценка начинается с -1 и хранит индекс победившего эталона.", "מגדירה צובר לכל זהות: הציון הטוב ביותר מתחיל ב-1- ושומר את אינדקס הייחוס המנצח."),
    exact(/^Impl\(const fs::path& model_root/, "Declares the constructor that receives model and reference roots, backend choice, and both acceptance thresholds.", "Объявляет constructor, получающий папки моделей и эталонов, выбор backend и оба порога принятия.", "מצהירה על ה-constructor שמקבל תיקיות מודלים וייחוסים, בחירת backend ושני ספי הקבלה."),
    exact(/^: use_cuda\(cuda\)/, "Copies the constructor arguments into persistent backend and threshold fields before session initialization starts.", "Копирует аргументы constructor в постоянные поля backend и порогов до создания сессий.", "מעתיקה את ארגומנטי ה-constructor לשדות הקבועים של backend ושל הספים לפני אתחול הסשנים."),
    exact(/SetGraphOptimizationLevel/, "Enables every ONNX Runtime graph optimization, including node fusion and provider-specific execution planning.", "Включает все оптимизации графа ONNX Runtime, включая fusion узлов и планирование для выбранного provider.", "מפעילה את כל אופטימיזציות גרף ONNX Runtime, כולל fusion של צמתים ותכנון ביצוע ל-provider שנבחר."),
    exact(/SetLogSeverityLevel\(3\)/, "Restricts ONNX Runtime output to error-level diagnostics so normal inference does not flood the worker log.", "Оставляет в журнале ONNX Runtime сообщения уровня error, чтобы обычный инференс не засорял лог worker.", "מגבילה את פלט ONNX Runtime לרמת שגיאה כדי שהסקה רגילה לא תציף את יומן ה-worker."),
    exact(/^OrtCUDAProviderOptions cuda_options/, "Creates zero-initialized CUDA provider options used only by identity_cuda.exe.", "Создаёт обнулённые настройки CUDA provider, используемые только identity_cuda.exe.", "יוצרת אפשרויות CUDA provider מאותחלות לאפס המשמשות רק את identity_cuda.exe."),
    exact(/cuda_options\.device_id = 0/, "Selects NVIDIA device 0 as the execution device for both neural-network sessions.", "Выбирает NVIDIA device 0 для выполнения обеих нейросетевых сессий.", "בוחרת את התקן NVIDIA מספר 0 לביצוע שני הסשנים העצביים."),
    exact(/arena_extend_strategy = 1/, "Configures the CUDA memory arena to extend by the amount requested instead of doubling aggressively.", "Настраивает CUDA memory arena на увеличение по требуемому объёму вместо агрессивного удвоения.", "מגדירה את זירת זיכרון CUDA להתרחב לפי הגודל הנדרש במקום להכפיל באגרסיביות."),
    exact(/AppendExecutionProvider_CUDA/, "Attaches CUDAExecutionProvider to the session options; failure here prevents a silent CPU fallback.", "Подключает CUDAExecutionProvider к настройкам сессии; ошибка здесь не позволяет незаметно перейти на CPU.", "מחברת CUDAExecutionProvider להגדרות הסשן; כשל כאן מונע מעבר שקט ל-CPU."),
    exact(/^yunet = Ort::Session/, "Loads yunet_dynamic.onnx into a persistent session using the configured CPU or CUDA provider.", "Загружает yunet_dynamic.onnx в постоянную сессию с настроенным CPU или CUDA provider.", "טוענת את yunet_dynamic.onnx לסשן קבוע באמצעות CPU או CUDA provider שהוגדר."),
    exact(/^sface = Ort::Session/, "Loads sface_dynamic.onnx into the second persistent session with the same provider contract.", "Загружает sface_dynamic.onnx во вторую постоянную сессию с тем же provider.", "טוענת את sface_dynamic.onnx לסשן הקבוע השני עם אותו provider."),
    exact(/^const fs::path folder = reference_root \/ label/, "Builds the reference directory for the current identity label.", "Формирует папку эталонов текущей личности.", "בונה את תיקיית הייחוס עבור תווית הזהות הנוכחית."),
    exact(/is_directory\(folder\).*Reference folder/, "Stops startup with the missing folder name because recognition cannot rank an identity without references.", "Останавливает запуск с именем отсутствующей папки, поскольку без эталонов личность нельзя ранжировать.", "עוצרת את ההפעלה עם שם התיקייה החסרה, משום שאי אפשר לדרג זהות ללא ייחוסים."),
    exact(/^const auto extension =/, "Reads the file extension so non-image files can be excluded from the reference bank.", "Читает расширение файла, чтобы исключить не-изображения из банка эталонов.", "קוראת את סיומת הקובץ כדי להוציא קבצים שאינם תמונות ממאגר הייחוס."),
    exact(/^images\.push_back\(load_image_rgba/, "Decodes this accepted reference file into RGBA pixels and appends it to the startup inference batch.", "Декодирует подходящий эталонный файл в RGBA и добавляет его в стартовый пакет инференса.", "מפענחת את קובץ הייחוס התקין לפיקסלי RGBA ומוסיפה אותו לאצוות ההסקה בעת ההפעלה."),
    exact(/^metadata\.emplace_back/, "Stores the identity label and exact file path at the same index as the decoded reference image.", "Сохраняет имя личности и точный путь под тем же индексом, что и декодированное эталонное изображение.", "שומרת את תווית הזהות ואת הנתיב המדויק באותו אינדקס של תמונת הייחוס המפוענחת."),
    exact(/^auto embedded = embed_images\(images\)/, "Runs one startup YuNet/SFace batch for all decoded reference images and returns their 128D vectors.", "Запускает один стартовый пакет YuNet/SFace для всех эталонных снимков и получает их 128D-векторы.", "מריצה אצוות YuNet/SFace אחת בעת ההפעלה עבור כל תמונות הייחוס ומחזירה את וקטורי 128D שלהן."),
    exact(/^references\.push_back/, "Begins appending one valid labelled reference record to the persistent in-memory bank.", "Начинает добавление одного валидного размеченного эталона в постоянный банк в памяти.", "מתחילה להוסיף רשומת ייחוס תקינה ומסומנת למאגר הקבוע בזיכרון."),
    exact(/metadata\[index\]\.first/, "Supplies the identity label paired with this reference image.", "Передаёт имя личности, связанное с текущим эталонным снимком.", "מעבירה את תווית הזהות המוצמדת לתמונת הייחוס הנוכחית."),
    exact(/metadata\[index\]\.second/, "Supplies the exact source-file path paired with this reference image.", "Передаёт точный путь к файлу текущего эталонного снимка.", "מעבירה את נתיב קובץ המקור המדויק של תמונת הייחוס הנוכחית."),
    exact(/embedded\.vectors\.begin\(\).*index \* kEmbeddingSize/, "Points to the first float of this image's 128-value embedding in the flat batch output.", "Указывает на первый float 128-мерного вектора текущего снимка в плоском выходе пакета.", "מצביעה על ערך ה-float הראשון ב-embedding בן 128 הערכים של התמונה בפלט האצווה השטוח."),
    exact(/embedded\.vectors\.begin\(\).*\(index \+ 1\)/, "Points one element past this image's 128-value embedding, completing the vector-copy range.", "Указывает сразу после 128-мерного вектора текущего снимка и завершает диапазон копирования.", "מצביעה לאיבר שאחרי ה-embedding בן 128 הערכים ומשלימה את טווח ההעתקה."),
    exact(/references\.empty\(\)/, "Rejects startup when no reference image produced a valid face embedding.", "Останавливает запуск, если ни один эталон не дал валидный вектор лица.", "דוחה את ההפעלה אם אף תמונת ייחוס לא הפיקה embedding תקין של פנים."),
    exact(/^PreparedBatch prepare_detection_batch/, "Defines host preprocessing that packs all request images into one padded float32 NCHW BGR batch.", "Определяет host-предобработку, упаковывающую все снимки запроса в один дополненный float32 NCHW BGR-пакет.", "מגדירה עיבוד מקדים במארח האורז את כל תמונות הבקשה באצוות float32 NCHW BGR מרופדת אחת."),
    exact(/^batch\.content_widths\.push_back/, "Records this image's resized content width so YuNet coordinates can later be checked against real content rather than padding.", "Сохраняет ширину содержимого после resize, чтобы координаты YuNet проверялись по изображению, а не по padding.", "שומרת את רוחב התוכן לאחר שינוי גודל כדי לבדוק קואורדינטות YuNet מול התמונה ולא מול הריפוד."),
    exact(/^batch\.content_heights\.push_back/, "Records this image's resized content height for later face-coordinate decoding.", "Сохраняет высоту содержимого после resize для последующего разбора координат лица.", "שומרת את גובה התוכן לאחר שינוי גודל לפענוח קואורדינטות הפנים בהמשך."),
    exact(/^batch\.width =/, "Raises the common batch width to the largest image width rounded up to a multiple of 32.", "Увеличивает общую ширину пакета до максимальной ширины снимка, округлённой вверх до 32.", "מעדכנת את רוחב האצווה המשותף לרוחב התמונה הגדול ביותר המעוגל כלפי מעלה לכפולה של 32."),
    exact(/^batch\.height =/, "Raises the common batch height to the largest image height rounded up to a multiple of 32.", "Увеличивает общую высоту пакета до максимальной высоты снимка, округлённой вверх до 32.", "מעדכנת את גובה האצווה המשותף לגובה התמונה הגדול ביותר המעוגל כלפי מעלה לכפולה של 32."),
    exact(/^batch\.nchw_bgr\.assign/, "Allocates B x 3 x H x W floats and initializes padding pixels to zero.", "Выделяет B x 3 x H x W значений float и заполняет padding нулями.", "מקצה B x 3 x H x W ערכי float ומאתחלת את פיקסלי הריפוד לאפס."),
    exact(/^batch\.nchw_bgr\[offset\] = pixel_bgr/, "Bilinearly samples one source pixel and writes it into the selected image, channel, y, x position of the NCHW batch.", "Билинейно выбирает один пиксель исходника и записывает его в позицию image, channel, y, x NCHW-пакета.", "דוגמת פיקסל מקור אחד בבילינאריות וכותבת אותו למיקום image, channel, y, x באצוות NCHW."),
    exact(/^EmbeddingBatch embed_images/, "Defines the shared neural path: one YuNet batch, landmark decoding, alignment, one SFace batch, and normalized embeddings.", "Определяет общий нейросетевой путь: один пакет YuNet, разбор ориентиров, alignment, один пакет SFace и нормализованные векторы.", "מגדירה את המסלול העצבי המשותף: אצוות YuNet אחת, פענוח נקודות ציון, יישור, אצוות SFace אחת ו-embeddings מנורמלים."),
    exact(/images\.empty\(\).*return/, "Returns an empty batch immediately because there is no image tensor to infer.", "Сразу возвращает пустой пакет, поскольку нет изображений для инференса.", "מחזירה מיד אצווה ריקה משום שאין תמונות להסקה."),
    exact(/^auto prepared = prepare_detection_batch/, "Runs the host packer and obtains one padded NCHW batch plus each image's real content dimensions.", "Запускает host-упаковку и получает один дополненный NCHW-пакет вместе с реальными размерами каждого снимка.", "מריצה את אורז המארח ומקבלת אצוות NCHW מרופדת אחת יחד עם ממדי התוכן האמיתיים של כל תמונה."),
    exact(/^auto memory = Ort::MemoryInfo::CreateCpu/, "Describes the prepared vector as CPU arena memory; CUDAExecutionProvider uploads it when the graph starts.", "Описывает подготовленный vector как CPU arena memory; CUDAExecutionProvider загружает его при запуске графа.", "מתארת את ה-vector המוכן כזיכרון CPU arena; ‏CUDAExecutionProvider מעלה אותו עם תחילת הגרף."),
    exact(/^auto input = Ort::Value::CreateTensor/, "Begins creating YuNet's float tensor view over the prepared batch without copying the C++ vector.", "Начинает создание float-тензора YuNet поверх подготовленного C++ vector без дополнительной копии.", "מתחילה ליצור תצוגת טנזור float של YuNet מעל ה-vector המוכן בלי העתקה נוספת."),
    exact(/^auto outputs = yunet\.Run/, "Executes the YuNet ONNX graph once for the complete batch through the configured provider and requests all twelve output tensors.", "Один раз выполняет ONNX-граф YuNet для всего пакета через настроенный provider и запрашивает 12 выходных тензоров.", "מריצה את גרף ONNX של YuNet פעם אחת עבור כל האצווה דרך ה-provider שהוגדר ומבקשת את כל 12 טנזורי הפלט."),
    exact(/^const int stride = kStrides/, "Selects the current YuNet feature-map stride: 8, 16, or 32 pixels.", "Выбирает текущий шаг feature map YuNet: 8, 16 или 32 пикселя.", "בוחרת את stride מפת התכונות הנוכחי של YuNet: ‏8, 16 או 32 פיקסלים."),
    exact(/^const int columns = prepared\.width \/ stride/, "Computes the number of anchor columns at this stride so a flat anchor index can be converted to grid x/y.", "Вычисляет число столбцов anchors на этом шаге, чтобы перевести плоский индекс anchor в grid x/y.", "מחשבת את מספר עמודות ה-anchors ב-stride הזה כדי להמיר אינדקס anchor שטוח ל-grid x/y."),
    exact(/^const int anchors =/, "Reads the anchor count from the selected YuNet bbox output shape.", "Читает число anchors из формы выбранного bbox-выхода YuNet.", "קוראת את מספר ה-anchors מצורת פלט ה-bbox הנבחר של YuNet."),
    exact(/^const float\* cls =/, "Gets the class-probability array for the current YuNet stride.", "Получает массив class probability текущего шага YuNet.", "מקבלת את מערך הסתברויות ה-class עבור stride הנוכחי של YuNet."),
    exact(/^const float\* obj =/, "Gets the objectness-probability array for the current YuNet stride.", "Получает массив objectness probability текущего шага YuNet.", "מקבלת את מערך הסתברויות ה-objectness עבור stride הנוכחי של YuNet."),
    exact(/^const float\* bbox =/, "Gets the encoded center and size values for every anchor at this stride.", "Получает закодированные центр и размер каждого anchor на этом шаге.", "מקבלת את ערכי המרכז והגודל המקודדים לכל anchor ב-stride הזה."),
    exact(/^const float\* keypoints =/, "Gets the ten coordinates representing five facial landmarks for every anchor.", "Получает десять координат пяти ориентиров лица для каждого anchor.", "מקבלת עשר קואורדינטות המייצגות חמש נקודות ציון של הפנים לכל anchor."),
    exact(/^const std::size_t scalar =/, "Maps the current image and anchor to one class/object score element in the flat batch output.", "Преобразует текущие image и anchor в один индекс class/object score плоского выхода пакета.", "ממפה את התמונה ואת ה-anchor הנוכחיים לאיבר score אחד של class/object בפלט האצווה השטוח."),
    exact(/^const float grid_x =/, "Converts the anchor index remainder into its feature-map x coordinate.", "Преобразует остаток индекса anchor в координату x feature map.", "ממירה את שארית אינדקס ה-anchor לקואורדינטת x במפת התכונות."),
    exact(/^const float grid_y =/, "Converts the anchor index quotient into its feature-map y coordinate.", "Преобразует частное индекса anchor в координату y feature map.", "ממירה את מנת אינדקס ה-anchor לקואורדינטת y במפת התכונות."),
    exact(/^const float centre_x =/, "Decodes the face-center x coordinate by adding the predicted offset to grid x and multiplying by stride.", "Декодирует x центра лица: прибавляет предсказанное смещение к grid x и умножает на stride.", "מפענחת את קואורדינטת x של מרכז הפנים על ידי הוספת ההיסט החזוי ל-grid x וכפל ב-stride."),
    exact(/^const float centre_y =/, "Decodes the face-center y coordinate by adding the predicted offset to grid y and multiplying by stride.", "Декодирует y центра лица: прибавляет предсказанное смещение к grid y и умножает на stride.", "מפענחת את קואורדינטת y של מרכז הפנים על ידי הוספת ההיסט החזוי ל-grid y וכפל ב-stride."),
    exact(/^const float width = std::exp/, "Exponentiates the clamped width logit and scales it by stride to obtain face width in pixels.", "Экспоненцирует ограниченный width logit и умножает на stride, получая ширину лица в пикселях.", "מעלה באקספוננט את logit הרוחב המוגבל וכופלת ב-stride לקבלת רוחב פנים בפיקסלים."),
    exact(/^const float height = std::exp/, "Exponentiates the clamped height logit and scales it by stride to obtain face height in pixels.", "Экспоненцирует ограниченный height logit и умножает на stride, получая высоту лица в пикселях.", "מעלה באקספוננט את logit הגובה המוגבל וכופלת ב-stride לקבלת גובה פנים בפיקסלים."),
    exact(/^best_rank = rank/, "Stores this candidate's rank so only a better candidate can replace it.", "Сохраняет rank кандидата, чтобы заменить его мог только лучший кандидат.", "שומרת את דירוג המועמד כך שרק מועמד טוב יותר יוכל להחליפו."),
    exact(/faces\[image\]\.valid = true/, "Marks that this image has a usable face and may proceed to alignment and SFace.", "Отмечает наличие подходящего лица, которое можно передать в alignment и SFace.", "מסמנת שבתמונה קיימות פנים שמישות שיכולות לעבור ליישור ול-SFace."),
    exact(/faces\[image\]\.score = confidence/, "Stores YuNet confidence for the selected face candidate.", "Сохраняет confidence YuNet выбранного кандидата лица.", "שומרת את confidence של YuNet עבור מועמד הפנים שנבחר."),
    exact(/landmarks\[point \* 2\] =/, "Decodes one landmark x coordinate from its anchor-relative offset into input pixels.", "Декодирует x одного ориентира из смещения относительно anchor в пиксели входа.", "מפענחת קואורדינטת x של נקודת ציון אחת מהיסט יחסי ל-anchor לפיקסלי הקלט."),
    exact(/landmarks\[point \* 2 \+ 1\] =/, "Decodes the matching landmark y coordinate into input pixels.", "Декодирует соответствующую y-координату ориентира в пиксели входа.", "מפענחת את קואורדינטת y המתאימה של נקודת הציון לפיקסלי הקלט."),
    exact(/^auto aligned = align_faces/, "Uses the five decoded landmarks to create one canonical 112 x 112 face tensor per valid image.", "По пяти ориентирам создаёт канонический тензор лица 112 x 112 для каждого валидного снимка.", "משתמשת בחמש נקודות הציון ליצירת טנזור פנים קנוני בגודל 112 x 112 לכל תמונה תקינה."),
    exact(/^result\.valid\.push_back/, "Copies the face-validity flag corresponding to this embedding into the result batch.", "Копирует флаг валидного лица, соответствующий текущему вектору, в пакет результата.", "מעתיקה לאצוות התוצאה את דגל תקינות הפנים המתאים ל-embedding הזה."),
    exact(/^normalize\(result\.vectors/, "L2-normalizes this 128D vector so its dot product with a normalized reference is cosine similarity.", "L2-нормализует текущий 128D-вектор, чтобы dot product с нормализованным эталоном стал cosine similarity.", "מנרמלת ב-L2 את וקטור 128D הזה כדי שהמכפלה הסקלרית שלו עם ייחוס מנורמל תהיה דמיון cosine."),
    exact(/^std::vector<float> align_faces/, "Defines landmark alignment that maps detected faces to the canonical SFace geometry.", "Определяет alignment по ориентирам, переводящий найденные лица в каноническую геометрию SFace.", "מגדירה יישור לפי נקודות ציון הממפה פנים שזוהו לגאומטריית SFace הקנונית."),
    exact(/^std::vector<float> aligned/, "Allocates B x 3 x 112 x 112 floats initialized to zero; invalid faces remain zero-filled.", "Выделяет B x 3 x 112 x 112 float со значением 0; невалидные лица остаются нулевыми.", "מקצה B x 3 x 112 x 112 ערכי float מאותחלים לאפס; פנים לא תקינות נשארות מאופסות."),
    exact(/^auto sample =/, "Defines a bilinear sampler that reads one channel from the padded NCHW detection batch at fractional coordinates.", "Определяет bilinear sampler, читающий один канал дополненного NCHW-пакета по дробным координатам.", "מגדירה דוגם בילינארי הקורא ערוץ אחד מאצוות NCHW המרופדת בקואורדינטות שבריות."),
    exact(/^const int x0 =/, "Rounds the sample x coordinate down to the left source pixel.", "Округляет x выборки вниз до левого пикселя исходника.", "מעגלת את קואורדינטת x של הדגימה מטה לפיקסל המקור השמאלי."),
    exact(/^const int y0 =/, "Rounds the sample y coordinate down to the upper source pixel.", "Округляет y выборки вниз до верхнего пикселя исходника.", "מעגלת את קואורדינטת y של הדגימה מטה לפיקסל המקור העליון."),
    exact(/^const int x1 =/, "Selects the right neighbour and clamps it to the image boundary.", "Выбирает правого соседа и ограничивает его границей изображения.", "בוחרת את השכן הימני ומגבילה אותו לגבול התמונה."),
    exact(/^const int y1 =/, "Selects the lower neighbour and clamps it to the image boundary.", "Выбирает нижнего соседа и ограничивает его границей изображения.", "בוחרת את השכן התחתון ומגבילה אותו לגבול התמונה."),
    exact(/^const float tx = x - x0/, "Keeps the fractional horizontal distance used to interpolate left and right pixels.", "Сохраняет дробную горизонтальную долю для интерполяции левого и правого пикселей.", "שומרת את המרחק האופקי השברי לאינטרפולציה בין הפיקסל השמאלי לימני."),
    exact(/^const float ty = y - y0/, "Keeps the fractional vertical distance used to interpolate top and bottom rows.", "Сохраняет дробную вертикальную долю для интерполяции верхней и нижней строк.", "שומרת את המרחק האנכי השברי לאינטרפולציה בין השורה העליונה לתחתונה."),
    exact(/^const float top =/, "Starts horizontal interpolation between the two source pixels on the upper row.", "Начинает горизонтальную интерполяцию двух пикселей верхней строки.", "מתחילה אינטרפולציה אופקית בין שני פיקסלי המקור בשורה העליונה."),
    exact(/^const float bottom =/, "Starts horizontal interpolation between the two source pixels on the lower row.", "Начинает горизонтальную интерполяцию двух пикселей нижней строки.", "מתחילה אינטרפולציה אופקית בין שני פיקסלי המקור בשורה התחתונה."),
    exact(/^return top \*/, "Interpolates vertically between the two row values and returns the final bilinear sample.", "Интерполирует между значениями двух строк по вертикали и возвращает итоговую bilinear-выборку.", "מבצעת אינטרפולציה אנכית בין ערכי שתי השורות ומחזירה את הדגימה הבילינארית הסופית."),
    exact(/^source_mean_x \+=/, "Adds this landmark's detected x coordinate to the source centroid accumulator.", "Добавляет x текущего найденного ориентира к сумме координат исходного центра.", "מוסיפה את קואורדינטת x של נקודת הציון שזוהתה לצובר מרכז המקור."),
    exact(/^source_mean_y \+=/, "Adds this landmark's detected y coordinate to the source centroid accumulator.", "Добавляет y текущего найденного ориентира к сумме координат исходного центра.", "מוסיפה את קואורדינטת y של נקודת הציון שזוהתה לצובר מרכז המקור."),
    exact(/^target_mean_x \+=/, "Adds the canonical template x coordinate to the target centroid accumulator.", "Добавляет x канонического шаблона к сумме координат целевого центра.", "מוסיפה את קואורדינטת x של התבנית הקנונית לצובר מרכז היעד."),
    exact(/^target_mean_y \+=/, "Adds the canonical template y coordinate to the target centroid accumulator.", "Добавляет y канонического шаблона к сумме координат целевого центра.", "מוסיפה את קואורדינטת y של התבנית הקנונית לצובר מרכז היעד."),
    exact(/^(source|target)_mean_[xy] \/= 5/, "Divides the accumulated coordinate by five to obtain the landmark centroid component.", "Делит сумму координат на пять и получает компонент центра пяти ориентиров.", "מחלקת את סכום הקואורדינטות בחמש לקבלת רכיב מרכז חמש נקודות הציון."),
    exact(/^numerator_a \+=/, "Accumulates the dot-product term that estimates scale times cosine of the alignment rotation.", "Накапливает dot-product для оценки scale, умноженного на cosine угла alignment.", "צוברת את איבר המכפלה הסקלרית המעריך scale כפול cosine של סיבוב היישור."),
    exact(/^numerator_b \+=/, "Accumulates the cross-product term that estimates scale times sine of the alignment rotation.", "Накапливает cross-product для оценки scale, умноженного на sine угла alignment.", "צוברת את איבר המכפלה הווקטורית המעריך scale כפול sine של סיבוב היישור."),
    exact(/^denominator \+=/, "Accumulates squared source-landmark distance used to normalize the similarity-transform coefficients.", "Накапливает квадрат расстояния исходных ориентиров для нормализации коэффициентов similarity transform.", "צוברת מרחק ריבועי של נקודות המקור לנרמול מקדמי התמרת similarity."),
    exact(/^const float a = numerator_a/, "Computes the scale-cosine coefficient and clamps the denominator away from zero.", "Вычисляет коэффициент scale-cosine и защищает denominator от нуля.", "מחשבת את מקדם scale-cosine ומגינה על המכנה מאפס."),
    exact(/^const float b = numerator_b/, "Computes the scale-sine coefficient of the two-dimensional similarity transform.", "Вычисляет коэффициент scale-sine двумерного similarity transform.", "מחשבת את מקדם scale-sine של התמרת similarity דו-ממדית."),
    exact(/^const float tx = target_mean_x/, "Computes the horizontal translation that maps the source landmark centroid onto the SFace template centroid.", "Вычисляет горизонтальный перенос от центра исходных ориентиров к центру шаблона SFace.", "מחשבת את ההזזה האופקית הממפה את מרכז נקודות המקור למרכז תבנית SFace."),
    exact(/^const float ty = target_mean_y/, "Computes the vertical translation of the landmark similarity transform.", "Вычисляет вертикальный перенос similarity transform по ориентирам.", "מחשבת את ההזזה האנכית של התמרת similarity לפי נקודות הציון."),
    exact(/^const float determinant =/, "Computes squared transform scale and clamps it before applying the inverse mapping.", "Вычисляет квадрат масштаба transform и ограничивает его перед обратным отображением.", "מחשבת את ריבוע קנה המידה של ההתמרה ומגבילה אותו לפני המיפוי ההפוך."),
    exact(/^const float source_x = \(a \* dx/, "Applies the inverse similarity transform to obtain the source x coordinate for this output pixel.", "Применяет обратный similarity transform и получает x исходника для текущего выходного пикселя.", "מפעילה את התמרת similarity ההפוכה לקבלת קואורדינטת x במקור עבור פיקסל הפלט."),
    exact(/^const float source_y = \(-b \* dx/, "Applies the inverse similarity transform to obtain the source y coordinate for this output pixel.", "Применяет обратный similarity transform и получает y исходника для текущего выходного пикселя.", "מפעילה את התמרת similarity ההפוכה לקבלת קואורדינטת y במקור עבור פיקסל הפלט."),
    exact(/^const int bgr_channel = 2 - rgb_channel/, "Reverses channel order so the aligned tensor expected by SFace is written as RGB from the BGR detection batch.", "Разворачивает порядок каналов: aligned-тензор SFace получает RGB из BGR-пакета детектора.", "הופכת את סדר הערוצים כך שטנזור היישור של SFace ייכתב כ-RGB מתוך אצוות BGR של הגלאי."),
    exact(/^= sample\(image, bgr_channel/, "Stores the bilinearly sampled source value in the selected aligned-face output pixel.", "Записывает билинейно выбранное значение исходника в текущий пиксель выровненного лица.", "שומרת את ערך המקור שנדגם בילינאריות בפיקסל הפלט הנוכחי של הפנים המיושרות."),
    exact(/^void normalize\(float\* vector/, "Defines in-place L2 normalization for one embedding of the supplied length.", "Определяет L2-нормализацию на месте для одного вектора заданной длины.", "מגדירה נרמול L2 במקום עבור embedding אחד באורך שסופק."),
    exact(/^const float norm =/, "Computes vector length as sqrt(sum of squares) and protects division from zero.", "Вычисляет длину vector как sqrt суммы квадратов и защищает деление от нуля.", "מחשבת את אורך ה-vector כשורש סכום הריבועים ומגינה על החלוקה מאפס."),
    exact(/^std::vector<SFaceResult> recognize/, "Defines the request-level method that chooses CUDA batching or sequential CPU inference and returns one decision per path.", "Определяет метод запроса, выбирающий CUDA batching или последовательный CPU-инференс и возвращающий решение для каждого пути.", "מגדירה את מתודת הבקשה הבוחרת אצוות CUDA או הסקת CPU סדרתית ומחזירה החלטה לכל נתיב."),
    exact(/^const auto started =/, "Captures the request start timestamp before image decoding and inference.", "Запоминает время начала запроса до декодирования и инференса.", "שומרת את חותמת זמן תחילת הבקשה לפני פענוח התמונות וההסקה."),
    exact(/^images\.reserve/, "Reserves exactly one decoded-image slot per requested path to avoid vector reallocations.", "Резервирует по одному месту декодированного изображения на каждый путь без reallocations.", "שומרת מראש מקום לתמונה מפוענחת אחת לכל נתיב כדי למנוע הקצאות מחדש."),
    exact(/^embedded = embed_images\(images\)/, "CUDA branch: submits every decoded request image together in one dynamic YuNet/SFace batch.", "CUDA-ветка: совместно передаёт все снимки запроса одним динамическим пакетом YuNet/SFace.", "ענף CUDA: שולח יחד את כל תמונות הבקשה המפוענחות באצוות YuNet/SFace דינמית אחת."),
    exact(/^embedded\.vectors\.resize/, "CPU branch: allocates the flat B x 128 destination where sequential one-image embeddings will be copied.", "CPU-ветка: выделяет плоский B x 128 буфер для последовательного копирования одиночных embeddings.", "ענף CPU: מקצה יעד שטוח B x 128 שאליו יועתקו embeddings של תמונה יחידה ברצף."),
    exact(/^embedded\.valid\.resize/, "CPU branch: allocates one face-validity flag per requested image.", "CPU-ветка: выделяет один флаг валидного лица на каждый снимок.", "ענף CPU: מקצה דגל תקינות פנים אחד לכל תמונה מבוקשת."),
    exact(/^auto one = embed_images/, "Runs YuNet and SFace for only the current image, preserving a strictly sequential CPU baseline.", "Запускает YuNet и SFace только для текущего снимка, сохраняя строго последовательный CPU baseline.", "מריצה YuNet ו-SFace רק עבור התמונה הנוכחית ושומרת על קו בסיס CPU סדרתי לחלוטין."),
    exact(/^std::copy_n\(one\.vectors/, "Copies exactly 128 values from the one-image result into this image's row of the flat batch vector.", "Копирует ровно 128 значений одиночного результата в строку текущего снимка плоского batch-vector.", "מעתיקה בדיוק 128 ערכים מתוצאת התמונה היחידה לשורת התמונה הנוכחית ב-vector האצווה השטוח."),
    exact(/^embedded\.valid\[index\] =/, "Copies the current one-image face-validity flag into its batch position.", "Копирует флаг валидности текущего одиночного снимка в его позицию пакета.", "מעתיקה את דגל תקינות הפנים של התמונה היחידה למיקומה באצווה."),
    exact(/^flat_references\.reserve/, "Reserves N x 128 floats before concatenating all cached reference vectors.", "Резервирует N x 128 float перед объединением всех эталонных векторов.", "שומרת מראש N x 128 ערכי float לפני שרשור כל וקטורי הייחוס השמורים."),
    exact(/^flat_references\.insert/, "Appends this reference's complete 128D vector to the contiguous matrix passed to CUDA or CPU scoring.", "Добавляет полный 128D-вектор текущего эталона в непрерывную матрицу CUDA/CPU scoring.", "מוסיפה את וקטור 128D המלא של הייחוס למטריצה הרציפה הנמסרת לחישוב CUDA או CPU."),
    exact(/^scores = sface_cuda_scores/, "Invokes the explicit sface_cuda.cu path to compute every query/reference dot product on the GPU.", "Вызывает явный путь sface_cuda.cu для вычисления всех query/reference dot products на GPU.", "קוראת למסלול המפורש sface_cuda.cu לחישוב כל המכפלות הסקלריות query/reference ב-GPU."),
    exact(/^scores\[query .*std::inner_product/, "CPU baseline: begins one sequential 128D dot product for the selected query/reference pair.", "CPU baseline: начинает один последовательный 128D dot product выбранной пары query/reference.", "קו בסיס CPU: מתחילה מכפלה סקלרית סדרתית אחת בגודל 128D לזוג query/reference שנבחר."),
    exact(/^const auto finished =/, "Captures the end timestamp after inference and all score calculations have completed.", "Запоминает конечное время после завершения инференса и всех оценок.", "שומרת את חותמת זמן הסיום לאחר השלמת ההסקה וכל חישובי הציונים."),
    exact(/^result\.face_found =/, "Copies YuNet validity for this query into its public result record.", "Записывает флаг найденного YuNet-лица текущего query в публичный результат.", "מעתיקה את תקינות YuNet עבור query זה לרשומת התוצאה הציבורית."),
    exact(/^result\.recognition_ms =/, "Assigns the request's average per-image elapsed time to this result.", "Записывает в результат среднее время запроса на одно изображение.", "מקצה לתוצאה את הזמן הממוצע לתמונה של הבקשה."),
    exact(/^const float score = scores/, "Reads this query's cosine score against the current reference from the flat score matrix.", "Читает cosine-оценку текущего query с текущим эталоном из плоской матрицы scores.", "קוראת ממטריצת הציונים השטוחה את ציון ה-cosine של query זה מול הייחוס הנוכחי."),
    exact(/^auto& best = label_scores/, "Selects the retained best-score record for the current reference's identity label.", "Выбирает запись лучшей оценки для имени текущего эталона.", "בוחרת את רשומת הציון הטוב ביותר עבור תווית הזהות של הייחוס הנוכחי."),
    exact(/^std::vector<std::pair<std::string, LabelBest>> ranked/, "Copies the per-identity best scores into a vector that can be sorted.", "Копирует лучшие оценки каждой личности в vector для сортировки.", "מעתיקה את הציונים הטובים ביותר לכל זהות ל-vector שניתן למיין."),
    exact(/^std::sort\(ranked/, "Sorts identities by descending best cosine score using the following comparator.", "Сортирует личности по убыванию лучшей cosine-оценки с помощью следующего comparator.", "ממיינת זהויות לפי ציון cosine מיטבי בסדר יורד באמצעות ה-comparator הבא."),
    exact(/^return left\.second\.score/, "Comparator returns true when the left identity has a higher score, producing descending order.", "Comparator возвращает true, когда оценка слева выше, формируя убывающий порядок.", "ה-comparator מחזיר true כאשר הציון השמאלי גבוה יותר וכך יוצר סדר יורד."),
    exact(/^result\.best_label =/, "Stores the identity name ranked first.", "Сохраняет имя личности на первом месте.", "שומרת את שם הזהות שדורגה ראשונה."),
    exact(/^result\.best_score =/, "Stores the highest per-identity cosine score.", "Сохраняет максимальную cosine-оценку по личностям.", "שומרת את ציון ה-cosine הגבוה ביותר בין הזהויות."),
    exact(/^result\.runner_label =/, "Stores the identity name ranked second.", "Сохраняет имя личности на втором месте.", "שומרת את שם הזהות שדורגה שנייה."),
    exact(/^result\.runner_score =/, "Stores the runner-up cosine score used for the margin test.", "Сохраняет cosine-оценку второго места для проверки margin.", "שומרת את ציון ה-cosine של המקום השני לצורך בדיקת margin."),
    exact(/^result\.margin =/, "Computes the confidence margin as best score minus runner-up score.", "Вычисляет margin уверенности: best score минус runner-up score.", "מחשבת את פער הביטחון: הציון הטוב ביותר פחות ציון המקום השני."),
    exact(/^result\.matched_reference =/, "Stores the exact reference-image path that produced the winning identity score.", "Сохраняет точный путь эталонного снимка, давшего победившую оценку.", "שומרת את נתיב תמונת הייחוס המדויק שהפיק את הציון המנצח."),
    exact(/^result\.accepted =/, "Accepts the label only when both minimum similarity and minimum margin conditions are true.", "Принимает имя только при одновременном прохождении minimum similarity и minimum margin.", "מקבלת את התווית רק כאשר גם תנאי הדמיון המינימלי וגם תנאי הפער המינימלי מתקיימים."),
    exact(/^result\.identity =/, "Returns the winning name for an accepted result; otherwise records the literal identity Unknown.", "Записывает имя победителя при принятом результате, иначе literal identity Unknown.", "מחזירה את שם המנצח עבור תוצאה שהתקבלה; אחרת רושמת את הזהות המילולית Unknown.")
  ].find(Boolean);
  if (exactRules) return exactRules;
  const indexedRules = [
    [[4], "Declares storage for one reference's normalized 128D SFace vector.", "Объявляет память для нормализованного 128D SFace-вектора одного эталона.", "מצהירה על אחסון לוקטור SFace מנורמל בגודל 128D של ייחוס אחד."],
    [[10], "Creates the persistent ONNX Runtime environment with warning-level logging and the name native-sface.", "Создаёт постоянную среду ONNX Runtime с уровнем warning и именем native-sface.", "יוצרת סביבת ONNX Runtime קבועה עם רמת רישום warning והשם native-sface."],
    [[11], "Declares the session-options object later configured for graph optimization and CPU/CUDA provider selection.", "Объявляет настройки сессии для последующей оптимизации графа и выбора CPU/CUDA provider.", "מצהירה על אובייקט אפשרויות הסשן שיוגדר בהמשך לאופטימיזציית גרף ולבחירת CPU/CUDA provider."],
    [[12], "Creates an initially empty YuNet session handle that the constructor fills after provider configuration.", "Создаёт первоначально пустой handle сессии YuNet, который constructor заполнит после настройки provider.", "יוצרת handle ריק בתחילה לסשן YuNet שה-constructor ימלא לאחר הגדרת ה-provider."],
    [[13], "Creates an initially empty SFace session handle for the persistent embedding graph.", "Создаёт первоначально пустой handle сессии SFace для постоянного embedding-графа.", "יוצרת handle ריק בתחילה לסשן SFace עבור גרף ה-embedding הקבוע."],
    [[14], "Declares the persistent vector of labelled reference records reused by every request.", "Объявляет постоянный vector размеченных эталонов, повторно используемый всеми запросами.", "מצהירה על vector קבוע של רשומות ייחוס מסומנות המשמש מחדש בכל בקשה."],
    [[31], "Declares the startup batch of decoded reference images.", "Объявляет стартовый пакет декодированных эталонных изображений.", "מצהירה על אצוות ההפעלה של תמונות הייחוס המפוענחות."],
    [[32], "Declares the parallel metadata vector that preserves each reference image's label and source path.", "Объявляет параллельный vector metadata, сохраняющий имя и путь каждого эталонного снимка.", "מצהירה על vector metadata מקביל השומר את התווית ואת נתיב המקור של כל תמונת ייחוס."],
    [[52], "Starts constructing the 128-float vector copied from this image's row of the batch embedding output.", "Начинает создание vector из 128 float, копируемых из строки текущего снимка в batch-выходе embeddings.", "מתחילה ליצור vector בן 128 ערכי float המועתקים משורת התמונה בפלט אצוות ה-embeddings."],
    [[55], "Closes the 128D vector constructor after its begin/end iterator range.", "Закрывает constructor 128D-vector после диапазона begin/end iterators.", "סוגרת את constructor של וקטור 128D לאחר טווח ה-iterators מסוג begin/end."],
    [[56], "Completes insertion of the label, path, and copied 128D vector as one Reference record.", "Завершает добавление имени, пути и скопированного 128D-вектора как одной записи Reference.", "משלימה את הכנסת התווית, הנתיב והווקטור 128D שהועתק כרשומת Reference אחת."],
    [[64], "Creates an empty PreparedBatch whose dimensions and NCHW storage are filled by the following loops.", "Создаёт пустой PreparedBatch, размеры и NCHW-память которого заполняют следующие циклы.", "יוצרת PreparedBatch ריק שממדיו ואחסון NCHW שלו ימולאו בלולאות הבאות."],
    [[99], "Begins the four-dimensional YuNet input-shape declaration.", "Начинает объявление четырёхмерной формы входа YuNet.", "מתחילה את הצהרת צורת הקלט הארבע-ממדית של YuNet."],
    [[100], "Sets YuNet input shape to batch-size x 3 BGR channels x padded height x padded width.", "Задаёт форму YuNet: batch-size x 3 BGR-канала x дополненная высота x дополненная ширина.", "מגדירה את צורת YuNet כגודל אצווה x ‏3 ערוצי BGR x גובה מרופד x רוחב מרופד."],
    [[105], "Passes the address of the first prepared NCHW float to the YuNet tensor view.", "Передаёт адрес первого подготовленного NCHW float в представление тензора YuNet.", "מעבירה לתצוגת טנזור YuNet את הכתובת של ערך ה-float הראשון ב-NCHW המוכן."],
    [[106], "Passes the total float-element count of the prepared YuNet batch.", "Передаёт общее число float-элементов подготовленного пакета YuNet.", "מעבירה את המספר הכולל של איברי float באצוות YuNet המוכנה."],
    [[107], "Passes the address of the four input dimensions to ONNX Runtime.", "Передаёт ONNX Runtime адрес четырёх размеров входа.", "מעבירה ל-ONNX Runtime את כתובת ארבעת ממדי הקלט."],
    [[108], "States that the YuNet input shape contains four dimensions.", "Указывает, что форма входа YuNet содержит четыре размерности.", "מציינת שצורת הקלט של YuNet מכילה ארבעה ממדים."],
    [[109], "Completes construction of the YuNet tensor view from memory, data, element count, and shape.", "Завершает создание тензора YuNet из memory, data, числа элементов и формы.", "משלימה את יצירת טנזור YuNet מתוך memory, data, מספר האיברים והצורה."],
    [[110], "Creates ONNX Runtime's default allocator for retrieving graph input and output names.", "Создаёт стандартный allocator ONNX Runtime для получения имён входов и выходов графа.", "יוצרת את allocator ברירת המחדל של ONNX Runtime לקבלת שמות קלט ופלט של הגרף."],
    [[112], "Builds the one-element input-name array required by Ort::Session::Run.", "Создаёт массив из одного имени входа, требуемый Ort::Session::Run.", "בונה מערך בן שם קלט אחד הנדרש על ידי Ort::Session::Run."],
    [[113], "Begins the exact list of twelve YuNet output-node names requested from the graph.", "Начинает точный список 12 имён выходных узлов YuNet, запрашиваемых у графа.", "מתחילה את הרשימה המדויקת של 12 שמות צמתי הפלט של YuNet המבוקשים מן הגרף."],
    [[114], "Requests class-probability outputs for strides 8, 16, and 32.", "Запрашивает class probability для шагов 8, 16 и 32.", "מבקשת פלטי הסתברות class עבור stride-ים 8, 16 ו-32."],
    [[115], "Requests objectness-probability outputs for strides 8, 16, and 32.", "Запрашивает objectness probability для шагов 8, 16 и 32.", "מבקשת פלטי הסתברות objectness עבור stride-ים 8, 16 ו-32."],
    [[116], "Requests encoded bounding-box outputs for all three YuNet strides.", "Запрашивает закодированные bounding boxes для трёх шагов YuNet.", "מבקשת פלטי bounding box מקודדים עבור שלושת ה-stride-ים של YuNet."],
    [[117], "Requests five-landmark keypoint outputs for all three YuNet strides.", "Запрашивает выходы пяти landmarks для трёх шагов YuNet.", "מבקשת פלטי חמש נקודות ציון עבור שלושת ה-stride-ים של YuNet."],
    [[120], "Allocates one DetectedFace slot per input image, initially invalid until a candidate passes selection.", "Выделяет по одной записи DetectedFace на снимок; до прохождения кандидата записи невалидны.", "מקצה רשומת DetectedFace אחת לכל תמונה, בתחילה לא תקינה עד שמועמד עובר את הבחירה."],
    [[137], "Clamps class and object probabilities to [0,1] and multiplies them before the square root forms confidence.", "Ограничивает class и object probability диапазоном [0,1] и перемножает их перед вычислением sqrt confidence.", "מגבילה את הסתברויות class ו-object לטווח [0,1] וכופלת אותן לפני שהשורש יוצר confidence."],
    [[138], "Closes the multi-line square-root expression that computes YuNet confidence.", "Закрывает многострочное выражение sqrt, вычисляющее confidence YuNet.", "סוגרת את ביטוי השורש הרב-שורי המחשב את confidence של YuNet."],
    [[148], "Adds vertical distance from the preferred 43% image height, completing the face-centering penalty.", "Добавляет вертикальное расстояние от предпочтительных 43% высоты и завершает штраф за смещение лица.", "מוסיפה מרחק אנכי מגובה מועדף של 43% ומשלימה את קנס מרכוז הפנים."],
    [[164], "Begins the four-dimensional SFace input-shape declaration.", "Начинает объявление четырёхмерной формы входа SFace.", "מתחילה את הצהרת צורת הקלט הארבע-ממדית של SFace."],
    [[165], "Sets SFace input shape to batch-size x 3 channels x 112 x 112 pixels.", "Задаёт форму входа SFace: batch-size x 3 канала x 112 x 112 пикселей.", "מגדירה את צורת קלט SFace כגודל אצווה x ‏3 ערוצים x ‏112 x ‏112 פיקסלים."],
    [[168], "Passes CPU memory, aligned-face data, element count, and the four SFace dimensions to CreateTensor.", "Передаёт CreateTensor CPU memory, данные aligned-face, число элементов и четыре размера SFace.", "מעבירה ל-CreateTensor זיכרון CPU, נתוני פנים מיושרות, מספר איברים וארבעת ממדי SFace."],
    [[169], "Completes construction of the SFace input tensor view.", "Завершает создание представления входного тензора SFace.", "משלימה את יצירת תצוגת טנזור הקלט של SFace."],
    [[172], "Builds the one-element SFace input-name array required by Session::Run.", "Создаёт массив из одного имени входа SFace для Session::Run.", "בונה מערך בן שם קלט אחד של SFace הנדרש ל-Session::Run."],
    [[173], "Builds the one-element SFace output-name array for the embedding tensor.", "Создаёт массив из одного имени выхода SFace для embedding-тензора.", "בונה מערך בן שם פלט אחד של SFace עבור טנזור ה-embedding."],
    [[175], "Supplies default run options, one SFace input tensor, and one requested embedding output.", "Передаёт default run options, один входной тензор SFace и один запрашиваемый embedding-выход.", "מעבירה אפשרויות ריצה ברירת מחדל, טנזור קלט אחד של SFace ופלט embedding מבוקש אחד."],
    [[176], "Completes the single batched SFace Session::Run call.", "Завершает единый пакетный вызов SFace Session::Run.", "משלימה את קריאת SFace Session::Run האצוותית היחידה."],
    [[178], "Creates the native embedding result that will hold B x 128 vectors and B validity flags.", "Создаёт native-результат для B x 128 векторов и B флагов валидности.", "יוצרת תוצאת embedding ב-native שתכיל וקטורי B x 128 ו-B דגלי תקינות."],
    [[180], "Reserves one validity flag for every detected-face slot.", "Резервирует по одному флагу валидности для каждой записи DetectedFace.", "שומרת מראש דגל תקינות אחד לכל רשומת DetectedFace."],
    [[189], "Receives the prepared padded NCHW batch containing source pixels for alignment.", "Получает подготовленный дополненный NCHW-пакет исходных пикселей для alignment.", "מקבלת את אצוות NCHW המרופדת והמוכנה המכילה פיקסלי מקור ליישור."],
    [[190], "Receives one validity flag and five landmark pairs for every batch image.", "Получает флаг валидности и пять пар координат landmarks для каждого снимка.", "מקבלת דגל תקינות וחמישה זוגות קואורדינטות של נקודות ציון לכל תמונת אצווה."],
    [[191], "Closes the alignment parameter list and opens its function body.", "Закрывает список параметров alignment и открывает тело функции.", "סוגרת את רשימת פרמטרי היישור ופותחת את גוף הפונקציה."],
    [[207], "Adds the upper-right pixel weighted by the horizontal fraction, completing interpolation of the upper row.", "Добавляет верхний правый пиксель с горизонтальным весом и завершает интерполяцию верхней строки.", "מוסיפה את הפיקסל הימני העליון במשקל האופקי ומשלימה את אינטרפולציית השורה העליונה."],
    [[209], "Adds the lower-right pixel weighted by the horizontal fraction, completing interpolation of the lower row.", "Добавляет нижний правый пиксель с горизонтальным весом и завершает интерполяцию нижней строки.", "מוסיפה את הפיקסל הימני התחתון במשקל האופקי ומשלימה את אינטרפולציית השורה התחתונה."],
    [[254], "Selects the exact image, RGB channel, y, and x element in the flat B x 3 x 112 x 112 output tensor.", "Выбирает точный элемент image, RGB-channel, y, x в плоском выходном тензоре B x 3 x 112 x 112.", "בוחרת את איבר image, RGB-channel, y, x המדויק בטנזור הפלט השטוח B x 3 x 112 x 112."],
    [[277], "Opens an anonymous namespace so CUDA helper symbols remain private to this translation unit.", "Открывает anonymous namespace, оставляя CUDA helpers закрытыми внутри этого translation unit.", "פותחת namespace אנונימי כדי שסמלי העזר של CUDA יישארו פרטיים ליחידת תרגום זו."],
    [[322], "Begins the protected allocation-copy-launch-readback section whose failures require device-memory cleanup.", "Начинает защищённый блок allocation-copy-launch-readback, где при ошибке нужно освободить device memory.", "מתחילה את מקטע allocation-copy-launch-readback המוגן שבו כשל מחייב ניקוי זיכרון התקן."],
    [[339], "Catches any CUDA exception so all three device buffers are freed before the same error is rethrown.", "Перехватывает CUDA-ошибку, чтобы освободить три device-буфера перед повторным throw.", "לוכדת כל חריגת CUDA כדי לשחרר את שלושת מאגרי ההתקן לפני זריקה מחדש של אותה שגיאה."],
    [[348], "Declares the request's decoded RGBA image vector.", "Объявляет vector декодированных RGBA-изображений запроса.", "מצהירה על vector תמונות RGBA המפוענחות של הבקשה."],
    [[352], "Declares the combined embeddings and validity flags produced by either backend branch.", "Объявляет общие embeddings и флаги валидности, формируемые любой backend-веткой.", "מצהירה על embeddings ועל דגלי תקינות משותפים המופקים על ידי כל אחד מענפי ה-backend."],
    [[357], "Opens the sequential CPU branch used when CUDA mode is not selected.", "Открывает последовательную CPU-ветку, когда CUDA-режим не выбран.", "פותחת את ענף ה-CPU הסדרתי כאשר מצב CUDA אינו נבחר."],
    [[369], "Declares the contiguous N x 128 reference matrix assembled for score calculation.", "Объявляет непрерывную матрицу эталонов N x 128 для вычисления оценок.", "מצהירה על מטריצת ייחוס רציפה N x 128 לצורך חישוב ציונים."],
    [[374], "Allocates the complete B x N score matrix, one slot for every query/reference pair.", "Выделяет полную матрицу scores B x N: по одному элементу на каждую пару query/reference.", "מקצה מטריצת ציונים מלאה B x N, תא אחד לכל זוג query/reference."],
    [[380], "Passes the contiguous B x 128 query-embedding matrix to the CUDA scoring function.", "Передаёт непрерывную B x 128 матрицу query-embeddings в CUDA scoring.", "מעבירה לפונקציית הדירוג ב-CUDA את מטריצת ה-query embeddings הרציפה B x 128."],
    [[382], "Passes B, the exact number of requested image paths, as a 32-bit kernel dimension.", "Передаёт B, точное число запрошенных путей, как 32-bit размер kernel.", "מעבירה את B, מספר נתיבי התמונות המדויק, כממד kernel של 32 ביט."],
    [[383], "Passes N, the exact number of cached reference vectors, as a 32-bit kernel dimension.", "Передаёт N, точное число кэшированных эталонов, как 32-bit размер kernel.", "מעבירה את N, מספר וקטורי הייחוס השמורים המדויק, כממד kernel של 32 ביט."],
    [[384], "Passes D=128, the number of float components multiplied by every CUDA scoring thread.", "Передаёт D=128: число float-компонентов, перемножаемых каждым CUDA thread.", "מעבירה D=128, מספר רכיבי ה-float שכל CUDA thread מכפיל."],
    [[385], "Completes the sface_cuda_scores call with query, reference, and B/N/D dimensions.", "Завершает вызов sface_cuda_scores с query/reference и размерами B/N/D.", "משלימה את קריאת sface_cuda_scores עם query, reference והממדים B/N/D."],
    [[386], "Selects the CPU scoring block when runtime CUDA is false in the CUDA-compiled executable.", "Выбирает CPU scoring block, когда runtime use_cuda=false в CUDA executable.", "בוחרת את בלוק הדירוג של CPU כאשר use_cuda=false בזמן ריצה בקובץ CUDA."],
    [[392], "Supplies the first element of the selected query's 128D embedding to std::inner_product.", "Передаёт std::inner_product первый элемент 128D-вектора выбранного query.", "מעבירה ל-std::inner_product את האיבר הראשון ב-embedding 128D של query שנבחר."],
    [[393], "Supplies the one-past-end iterator of that 128D query embedding.", "Передаёт iterator сразу после 128D-вектора query.", "מעבירה את ה-iterator שאחרי סוף ה-embedding 128D של query."],
    [[394], "Supplies the first element of the selected reference's normalized 128D vector.", "Передаёт первый элемент нормализованного 128D-вектора выбранного эталона.", "מעבירה את האיבר הראשון בווקטור 128D המנורמל של הייחוס שנבחר."],
    [[395], "Uses zero as the initial accumulator for the sequential CPU dot product.", "Использует 0 как начальный accumulator последовательного CPU dot product.", "משתמשת באפס כצובר ההתחלתי של המכפלה הסקלרית הסדרתית ב-CPU."],
    [[396], "Completes the sequential 128D inner product and stores its cosine score in the B x N matrix.", "Завершает последовательный 128D inner product и записывает cosine score в матрицу B x N.", "משלימה את המכפלה הסקלרית הסדרתית 128D ושומרת את ציון ה-cosine במטריצת B x N."],
    [[403], "Divides total elapsed time by max(1,B), preventing division by zero and producing average milliseconds per image.", "Делит общее время на max(1,B), защищаясь от нуля и получая среднее ms на изображение.", "מחלקת את הזמן הכולל ב-max(1,B), מונעת חלוקה באפס ומפיקה מילישניות ממוצעות לתמונה."],
    [[404], "Allocates one public SFaceResult record for every requested image path.", "Выделяет одну публичную запись SFaceResult на каждый путь изображения.", "מקצה רשומת SFaceResult ציבורית אחת לכל נתיב תמונה מבוקש."],
    [[411], "Creates a map from identity label to that identity's current best score and reference index.", "Создаёт map: имя личности -> её текущие best score и reference index.", "יוצרת map מתווית זהות אל הציון הטוב ביותר הנוכחי ואינדקס הייחוס שלה."],
    [[420], "Closes the descending-score comparator and completes sorting of the identity ranking.", "Закрывает comparator убывающих оценок и завершает сортировку личностей.", "סוגרת את comparator של ציונים יורדים ומשלימה את מיון דירוג הזהויות."]
  ].find((rule) => rule[0].includes(index));
  if (indexedRules) return say(indexedRules[1], indexedRules[2], indexedRules[3]);
  if (/^\/\//.test(text)) return nativeCommentAnnotation(text, lang);
  if (/^[{}];?$/.test(text)) return say(
    `Marks the ${text.startsWith("{") ? "start" : "end"} of the current scope inside ${context}; it changes control lifetime but performs no numerical operation.`,
    `${text.startsWith("{") ? "Открывает" : "Закрывает"} текущую область внутри ${context}; строка задаёт время жизни и управление, но не выполняет численную операцию.`,
    `${text.startsWith("{") ? "פותחת" : "סוגרת"} את התחום הנוכחי בתוך ${context}; השורה מגדירה זרימת בקרה ואורך חיים אך אינה מבצעת פעולה מספרית.`
  );
  if (/^(?:const\s+)?(?:float|double|int|bool|std::size_t|std::string|fs::path|auto(?:&)?|const auto&|const float\*|float\*)\s+([A-Za-z_]\w*)/.test(text)) {
    const name = text.match(/^(?:const\s+)?(?:float|double|int|bool|std::size_t|std::string|fs::path|auto(?:&)?|const auto&|const float\*|float\*)\s+([A-Za-z_]\w*)/)?.[1] || "value";
    const meaning = nativeValueMeaning(name, lang);
    if (meaning) {
      const initializer = text.match(/=\s*(.+?);?$/)?.[1];
      if (initializer) return say(
        `Computes ${meaning} as ${initializer}; this value is consumed by ${context}.`,
        `Вычисляет ${meaning} по формуле ${initializer}; это значение используется на этапе ${context}.`,
        `מחשבת את ${meaning} לפי ${initializer}; הערך משמש בתוך ${context}.`
      );
      return say(
        `Declares storage for ${meaning}; ${context} fills it before the value is read.`,
        `Объявляет память для значения «${meaning}»; этап ${context} заполняет её до чтения.`,
        `מצהירה על אחסון עבור ${meaning}; ‏${context} ממלא אותו לפני קריאת הערך.`
      );
    }
  }
  const identifier = text.match(/^([A-Za-z_]\w*)[,;]?$/)?.[1];
  if (identifier) {
    const meaning = nativeValueMeaning(identifier, lang);
    if (meaning) return say(
      `Passes ${meaning} as this exact argument of the surrounding function or CUDA launch.`,
      `Передаёт ${meaning} как данный аргумент окружающего вызова функции или CUDA kernel.`,
      `מעבירה את ${meaning} כארגומנט המדויק הזה של קריאת הפונקציה או שיגור CUDA הסובבים.`
    );
  }
  if (/^(for|while)\s*\(/.test(text)) {
    const loop = text.match(/(?:const auto&|std::size_t|int)\s+([A-Za-z_]\w*)/)?.[1] || "index";
    const loops = {
      label: ["the three known identities Adi, Faraj, and Slava", "три известные личности Adi, Faraj и Slava", "שלוש הזהויות הידועות Adi, Faraj ו-Slava"],
      entry: ["every directory entry in the current identity's reference folder", "каждую запись папки эталонов текущей личности", "כל רשומה בתיקיית הייחוס של הזהות הנוכחית"],
      image: ["every input image in the current batch", "каждое входное изображение текущего пакета", "כל תמונת קלט באצווה הנוכחית"],
      level: ["YuNet feature-map levels with strides 8, 16, and 32", "уровни feature map YuNet с шагами 8, 16 и 32", "רמות מפת התכונות של YuNet עם stride-ים 8, 16 ו-32"],
      anchor: ["every YuNet anchor candidate at the current stride", "каждый anchor-кандидат YuNet на текущем шаге", "כל מועמד anchor של YuNet ב-stride הנוכחי"],
      point: ["the five facial landmarks", "пять ориентиров лица", "חמש נקודות הציון של הפנים"],
      y: ["all output rows", "все строки выхода", "כל שורות הפלט"],
      x: ["all output columns", "все столбцы выхода", "כל עמודות הפלט"],
      channel: ["the three BGR channels", "три канала BGR", "שלושת ערוצי BGR"],
      rgb_channel: ["the three RGB channels of the aligned SFace tensor", "три RGB-канала выровненного тензора SFace", "שלושת ערוצי RGB של טנזור SFace המיושר"],
      query: ["every requested image result", "результат каждого запрошенного снимка", "תוצאת כל תמונה מבוקשת"],
      reference: ["every cached reference embedding", "каждый кэшированный эталонный вектор", "כל embedding שמור לייחוס"],
      index: ["each element in the current vector or batch", "каждый элемент текущего vector или пакета", "כל איבר ב-vector או באצווה הנוכחיים"]
    }[loop] || ["the explicitly bounded data items", "явно ограниченные элементы данных", "פריטי הנתונים בעלי הגבול המפורש"];
    return say(`Iterates over ${loops[0]}.`, `Перебирает ${loops[1]}.`, `עוברת על ${loops[2]}.`);
  }
  if (/^if\s*\(/.test(text)) {
    const condition = text.match(/^if\s*\((.*?)\)/)?.[1] || text;
    return say(
      `Evaluates ${condition} to decide whether the current item is valid for ${context}; the body applies the displayed accept, skip, or error action.`,
      `Проверяет условие ${condition}, чтобы решить, пригоден ли текущий элемент для этапа ${context}; тело выполняет показанное принятие, пропуск или ошибку.`,
      `בודקת את התנאי ${condition} כדי להחליט אם הפריט הנוכחי תקין עבור ${context}; גוף התנאי מבצע את פעולת הקבלה, הדילוג או השגיאה המוצגת.`
    );
  }
  if (/^return\b/.test(text)) {
    const returnedName = text.match(/^return\s+([A-Za-z_]\w*)/)?.[1] || "";
    const returnedMeaning = nativeValueMeaning(returnedName, lang);
    if (returnedMeaning) return say(
      `Returns ${returnedMeaning} to the native C++ caller after ${context} completes.`,
      `Возвращает ${returnedMeaning} вызвавшему native C++-коду после завершения этапа ${context}.`,
      `מחזירה ${returnedMeaning} אל קוד ה-native C++ שקרא לפונקציה לאחר השלמת ${context}.`
    );
    return say(
      `Returns the displayed computed value to the native C++ caller and ends ${context}.`,
      `Возвращает показанное вычисленное значение вызвавшему native C++-коду и завершает этап ${context}.`,
      `מחזירה את הערך המחושב המוצג אל קוד ה-native C++ שקרא לפונקציה ומסיימת את ${context}.`
    );
  }
  if (/^(#if|#endif|#include)/.test(text)) return say(
    `Controls compilation of ${context}: ${text}. CUDA-only declarations are present in identity_cuda.exe and absent from the CPU executable.`,
    `Управляет компиляцией ${context}: ${text}. CUDA-объявления входят в identity_cuda.exe и отсутствуют в CPU executable.`,
    `שולטת בהידור של ${context}: ${text}. הצהרות CUDA נכללות ב-identity_cuda.exe ואינן נכללות בקובץ ה-CPU.`
  );
  const assignment = text.match(/^(.+?)\s*(\+=|-=|\*=|\/=|=)\s*(.+?);?$/);
  if (assignment) {
    const [, target, operator, expression] = assignment;
    const targetName = target.trim().match(/([A-Za-z_]\w*)(?:\[[^\]]+\])?$/)?.[1] || "";
    const targetMeaning = nativeValueMeaning(targetName, lang);
    const verbs = operator === "="
      ? ["Stores", "Записывает", "שומרת"]
      : operator === "+="
        ? ["Adds to", "Добавляет к", "מוסיפה אל"]
        : operator === "/="
          ? ["Divides", "Делит", "מחלקת את"]
          : ["Updates", "Обновляет", "מעדכנת את"];
    if (targetMeaning) return say(
      `${verbs[0]} ${targetMeaning} from ${expression.trim()}; the result is used by ${context}.`,
      `${verbs[1]} ${targetMeaning} из ${expression.trim()}; результат используется на этапе ${context}.`,
      `${verbs[2]} ${targetMeaning} מתוך ${expression.trim()}; התוצאה משמשת בתוך ${context}.`
    );
    return say(
      `${verbs[0]} ${target.trim()} from ${expression.trim()}, updating the exact state consumed by ${context}.`,
      `${verbs[1]} ${target.trim()} из ${expression.trim()}, обновляя точное состояние, используемое на этапе ${context}.`,
      `${verbs[2]} ${target.trim()} מתוך ${expression.trim()}, ומעדכנת את המצב המדויק המשמש בתוך ${context}.`
    );
  }
  return say(
    `Provides the concrete value ${text} to the immediately surrounding ${context} operation; its name and indexing identify the exact tensor slice or dimension being used.`,
    `Передаёт конкретное значение ${text} соседней операции ${context}; имя и индексы точно указывают используемый срез тензора или размерность.`,
    `מעבירה את הערך המפורש ${text} לפעולה הסמוכה של ${context}; השם והאינדקסים מזהים במדויק את פרוסת הטנזור או הממד שבשימוש.`
  );
}

function contextualNativeSourceAnnotation(lines, index) {
  const lang = document.documentElement.lang || "en";
  const text = lines[index].trim();
  if (!text) {
    return lang === "ru"
      ? "Пустая строка отделяет соседние логические части C++/CUDA-исходника и не создаёт исполняемую команду."
      : lang === "he"
        ? "שורה ריקה מפרידה בין חלקים לוגיים סמוכים במקור C++/CUDA ואינה יוצרת פקודה לביצוע."
        : "Blank line separating adjacent C++/CUDA source sections; it creates no executable instruction.";
  }
  if (index < 271 || index > 345) return nativeContextFallback(lines, index, lang);
  const detailed = currentCppSourceAnnotation(text, lang);
  const genericMarkers = [
    "Declares or calls the named C++ operation",
    "Объявляет или вызывает указанную C++-операцию",
    "מצהיר או קורא לפעולת C++",
    "Creates a typed C++ value",
    "Создаёт типизированное значение C++",
    "יוצר ערך C++ מטיפוס מוגדר",
    "Supplies part of the surrounding C++ declaration or call",
    "Передаёт часть окружающего объявления или вызова C++",
    "מספק חלק מהצהרת או מקריאת C++",
    "Non-executable C++ documentation comment",
    "Неисполняемый комментарий C++",
    "הערת C++ שאינה מבוצעת",
    "Declares a C++ data type that groups",
    "Объявляет тип данных C++",
    "מצהיר על טיפוס נתונים ב‑C++",
    "Opens or names the C++ namespace",
    "Открывает или называет пространство имён C++",
    "פותח או מציין מרחב שמות C++",
    "Opens or closes the current C++ scope",
    "Открывает или закрывает текущую область C++",
    "פותח או סוגר את תחום C++ הנוכחי"
  ];
  return genericMarkers.some((marker) => detailed.includes(marker))
    ? nativeContextFallback(lines, index, lang)
    : detailed;
}

function patternCodeAnnotation(line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  const exact = detailedCodeLineAnnotations[trimmed];
  if (exact) return repairLocalizedText(exact[lang] || exact.en);
  const looksCpp = /^(#include|#if|#ifdef|#ifndef|#elif|#else|#endif|#define|namespace\b|struct\b|class\b|using\b|template\b|\/\/|\/\*|\*)/.test(trimmed)
    || /;$/.test(trimmed)
    || /\b(?:std::|cl[A-Z]\w*|CL_[A-Z_]+|DeepIDModel|FaceMatcher|MatchResult)\b/.test(trimmed);
  if (looksCpp) return currentCppSourceAnnotation(trimmed, lang);
  return sourceLineAnnotation(trimmed, lang);
}

function contextualSingleSourceAnnotation(lines, index) {
  const lang = document.documentElement.lang || "en";
  const text = lines[index].trim();
  const say = (en, ru, he) => repairLocalizedText(lang === "ru" ? ru : lang === "he" ? he : en);
  const occurrence = lines.slice(0, index + 1).filter((line) => line.trim() === text).length;
  const previous = [...lines.slice(0, index)].reverse().find((line) => line.trim())?.trim() || "module start";
  const next = lines.slice(index + 1).find((line) => line.trim())?.trim() || "module end";

  if (!text) {
    const previousIsBlank = index > 0 && !lines[index - 1].trim();
    const nextIsBlank = index + 1 < lines.length && !lines[index + 1].trim();
    if (nextIsBlank) {
      return say(
        `First of the two blank lines separating the completed top-level section ending with \`${previous}\` from the next definition \`${next}\`; it improves source structure and executes no Python instruction.`,
        `Первая из двух пустых строк, отделяющих завершённый верхнеуровневый раздел после \`${previous}\` от следующего определения \`${next}\`; она структурирует исходник и не выполняет команду Python.`,
        `השורה הראשונה מתוך שתי שורות ריקות שמפרידות בין המקטע העליון שהסתיים ב־\`${previous}\` לבין ההגדרה הבאה \`${next}\`; היא מסדרת את קוד המקור ואינה מבצעת פקודת Python.`
      );
    }
    if (previousIsBlank) {
      return say(
        `Second of the two blank lines before the top-level definition \`${next}\`; together they mark a top-level boundary and execute no Python instruction.`,
        `Вторая из двух пустых строк перед верхнеуровневым определением \`${next}\`; вместе они обозначают границу раздела и не выполняют команду Python.`,
        `השורה השנייה מתוך שתי שורות ריקות לפני ההגדרה העליונה \`${next}\`; יחד הן מסמנות גבול בין מקטעים ואינן מבצעות פקודת Python.`
      );
    }
    return say(
      `Separates the completed statement \`${previous}\` from the next source section beginning with \`${next}\`; Python executes no instruction on this blank line.`,
      `Отделяет завершённую команду \`${previous}\` от следующего фрагмента, начинающегося с \`${next}\`; на пустой строке Python ничего не выполняет.`,
      `מפרידה בין הפקודה שהושלמה \`${previous}\` לבין המקטע הבא שמתחיל ב־\`${next}\`; Python אינה מבצעת הוראה בשורה הריקה.`
    );
  }

  const key = `${text}#${occurrence}`;
  const exact = {
    "torch, _, _ = self._ensure_torch()#1": [
      "Loads the cached PyTorch runtime for _device_name; this method needs torch.cuda availability checks but not the returned nn or functional helpers.",
      "Получает кэшированную среду PyTorch для `_device_name`: здесь нужен `torch` для проверки CUDA, а возвращённые `nn` и `F` не используются.",
      "מקבלת את סביבת PyTorch מהמטמון עבור `_device_name`; המתודה צריכה את `torch` לבדיקת CUDA ואינה משתמשת ב־`nn` וב־`F` שהוחזרו."
    ],
    "torch, _, _ = self._ensure_torch()#2": [
      "Loads PyTorch for _preprocess_pil so the normalized NumPy array can be wrapped as a tensor and moved to the requested CPU or CUDA device.",
      "Получает PyTorch для `_preprocess_pil`, чтобы обернуть нормализованный массив NumPy в тензор и перенести его на выбранный CPU или CUDA.",
      "מקבלת את PyTorch עבור `_preprocess_pil`, כדי לעטוף את מערך NumPy המנורמל כטנזור ולהעבירו ל־CPU או ל־CUDA שנבחרו."
    ],
    "torch, _, _ = self._ensure_torch()#3": [
      "Loads PyTorch for load_references, where reference tensors are stacked, embedded and—on CUDA—synchronized before being cached.",
      "Получает PyTorch для `load_references`, где тензоры эталонов объединяются, проходят модель и при CUDA синхронизируются перед кэшированием.",
      "מקבלת את PyTorch עבור `load_references`, שבה טנזורי הייחוס נערמים, עוברים במודל וב־CUDA מסונכרנים לפני השמירה במטמון."
    ],
    "torch, _, _ = self._ensure_torch()#4": [
      "Loads PyTorch for _embed_variants so all crops of this one screenshot can be stacked into one V×3×55×47 tensor.",
      "Получает PyTorch для `_embed_variants`, чтобы объединить все обрезки одного скриншота в тензор `V×3×55×47`.",
      "מקבלת את PyTorch עבור `_embed_variants`, כדי לערום את כל החיתוכים של צילום מסך יחיד לטנזור `V×3×55×47`."
    ],
    "torch, _, _ = self._ensure_torch()#5": [
      "Loads PyTorch for detect_image so it can synchronize asynchronous CUDA work before the single-image timer is stopped.",
      "Получает PyTorch для `detect_image`, чтобы синхронизировать асинхронную работу CUDA до остановки таймера одного изображения.",
      "מקבלת את PyTorch עבור `detect_image`, כדי לסנכרן עבודת CUDA אסינכרונית לפני עצירת מדידת הזמן של התמונה היחידה."
    ],
    "off += 4#1": [
      "Advances the binary-file cursor by four bytes after reading the uint32 record count from the weight-file header.",
      "Сдвигает позицию в бинарном файле на 4 байта после чтения `uint32` — количества записей весов в заголовке.",
      "מקדמת את הסמן בקובץ הבינרי בארבעה בתים לאחר קריאת מספר רשומות המשקלים מסוג `uint32` מן הכותרת."
    ],
    "off += 4#2": [
      "Advances the binary-file cursor by four bytes after reading this record's uint32 tensor-name length.",
      "Сдвигает позицию на 4 байта после чтения `uint32` — длины имени тензора текущей записи.",
      "מקדמת את הסמן בארבעה בתים לאחר קריאת אורך שם הטנזור של הרשומה הנוכחית מסוג `uint32`."
    ],
    "off += 4#3": [
      "Advances the binary-file cursor by four bytes after reading this record's uint32 number of float32 tensor elements.",
      "Сдвигает позицию на 4 байта после чтения `uint32` — количества элементов `float32` в текущем тензоре.",
      "מקדמת את הסמן בארבעה בתים לאחר קריאת מספר איברי `float32` בטנזור הנוכחי מסוג `uint32`."
    ],
    "return torch.tensor(w[name]).contiguous()#1": [
      "The nested bias helper converts the selected one-dimensional bias array to a contiguous PyTorch tensor without changing its order.",
      "Вложенная функция `bias` превращает выбранный одномерный массив смещений в непрерывный тензор PyTorch, не меняя порядок элементов.",
      "פונקציית העזר `bias` ממירה את מערך ההטיות החד־ממדי שנבחר לטנזור PyTorch רציף בלי לשנות את סדר האיברים."
    ],
    "return torch.tensor(w[name]).contiguous()#2": [
      "The nested dense_weight helper converts the selected fully-connected weight matrix to contiguous PyTorch storage; unlike convolution weights, no axis permutation is required.",
      "Вложенная функция `dense_weight` преобразует матрицу весов полносвязного слоя в непрерывный тензор PyTorch; в отличие от свёрточных весов перестановка осей не нужна.",
      "פונקציית העזר `dense_weight` ממירה את מטריצת משקלי השכבה המלאה לאחסון PyTorch רציף; בניגוד למשקלי convolution אין צורך בשינוי סדר הצירים."
    ],
    "x = F.max_pool2d(x, 2, 2)#1": [
      "Applies the first non-overlapping 2×2 max-pool: each Conv1 channel shrinks from 52×44 to 26×22, producing [V,20,26,22].",
      "Выполняет первый `max-pool 2×2` без перекрытия: каждый канал Conv1 уменьшается с `52×44` до `26×22`, результат — `[V,20,26,22]`.",
      "מבצעת max-pool ראשון של `2×2` ללא חפיפה: כל ערוץ Conv1 קטן מ־`52×44` ל־`26×22`, והתוצאה היא `[V,20,26,22]`."
    ],
    "x = F.max_pool2d(x, 2, 2)#2": [
      "Applies the second non-overlapping 2×2 max-pool: each Conv2 channel shrinks from 24×20 to 12×10, producing [V,40,12,10].",
      "Выполняет второй `max-pool 2×2` без перекрытия: каждый канал Conv2 уменьшается с `24×20` до `12×10`, результат — `[V,40,12,10]`.",
      "מבצעת max-pool שני של `2×2` ללא חפיפה: כל ערוץ Conv2 קטן מ־`24×20` ל־`12×10`, והתוצאה היא `[V,40,12,10]`."
    ],
    "model, device = self._model(mode)#1": [
      "Obtains the DeepID model and actual device for one-time reference initialization; cached reference embeddings are stored under that device name.",
      "Получает модель DeepID и фактическое устройство для одноразовой инициализации эталонов; готовые эталонные векторы кэшируются под именем этого устройства.",
      "מקבלת את מודל DeepID ואת ההתקן בפועל לאתחול החד־פעמי של הייחוסים; embeddings הייחוס נשמרים במטמון תחת שם התקן זה."
    ],
    "model, device = self._model(mode)#2": [
      "Obtains the DeepID model and actual device for embedding the V crops derived from the current single screenshot.",
      "Получает модель DeepID и фактическое устройство для вычисления векторов `V` обрезок текущего единственного скриншота.",
      "מקבלת את מודל DeepID ואת ההתקן בפועל לחישוב embeddings של `V` החיתוכים שנגזרו מצילום המסך היחיד הנוכחי."
    ],
    "with torch.inference_mode():#1": [
      "Disables gradient tracking while the one-time reference-photo tensor is passed through DeepID; no training occurs.",
      "Отключает вычисление градиентов на время одноразового прохода тензора эталонных фотографий через DeepID; обучение не выполняется.",
      "מכבה מעקב אחר גרדיאנטים בזמן המעבר החד־פעמי של טנזור תמונות הייחוס דרך DeepID; לא מתבצע אימון."
    ],
    "with torch.inference_mode():#2": [
      "Disables gradient tracking while DeepID embeds the V crops of the current screenshot; this is inference only.",
      "Отключает вычисление градиентов, пока DeepID получает векторы `V` обрезок текущего скриншота; это только инференс.",
      "מכבה מעקב אחר גרדיאנטים בזמן ש־DeepID מפיק embeddings עבור `V` חיתוכי צילום המסך הנוכחי; זו הסקה בלבד."
    ],
    "emb = model(x).detach()#1": [
      "Runs all reference-photo tensors through DeepID once and detaches the resulting N×160 reference matrix before caching it.",
      "Один раз пропускает все тензоры эталонных фотографий через DeepID и отделяет полученную матрицу `N×160` перед кэшированием.",
      "מעבירה פעם אחת את כל טנזורי תמונות הייחוס דרך DeepID ומנתקת את מטריצת הייחוס `N×160` שהתקבלה לפני שמירתה במטמון."
    ],
    "emb = model(x).detach()#2": [
      "Runs the V crops of the current screenshot through DeepID in one tensor call and detaches the resulting V×160 embedding matrix.",
      "Одним тензорным вызовом пропускает `V` обрезок текущего скриншота через DeepID и отделяет полученную матрицу векторов `V×160`.",
      "מעבירה את `V` חיתוכי צילום המסך הנוכחי דרך DeepID בקריאת טנזור אחת ומנתקת את מטריצת ה־embedding בגודל `V×160`."
    ],
    "if device == \"cuda\":#1": [
      "Checks whether reference initialization ran on CUDA; only then must the queued GPU work be synchronized before its embeddings are cached.",
      "Проверяет, выполнялась ли инициализация эталонов на CUDA; только тогда нужно дождаться GPU перед кэшированием векторов.",
      "בודקת האם אתחול הייחוסים רץ ב־CUDA; רק אז יש לסנכרן את עבודת ה־GPU שבתור לפני שמירת ה־embeddings במטמון."
    ],
    "if device == \"cuda\":#2": [
      "Checks whether this single-image recognition used CUDA; only that asynchronous path needs synchronization before the elapsed time is calculated.",
      "Проверяет, использовало ли распознавание одного изображения CUDA; только этот асинхронный путь нужно синхронизировать перед вычислением времени.",
      "בודקת האם זיהוי התמונה היחידה השתמש ב־CUDA; רק מסלול אסינכרוני זה דורש סנכרון לפני חישוב הזמן שחלף."
    ],
    "torch.cuda.synchronize()#1": [
      "Waits for the CUDA kernels that embedded all reference photos to finish before the N×160 matrix is cached.",
      "Ждёт завершения CUDA-ядер, вычисляющих векторы всех эталонных фотографий, прежде чем кэшировать матрицу `N×160`.",
      "ממתינה לסיום קרנלי CUDA שחישבו embeddings לכל תמונות הייחוס לפני שמירת מטריצת `N×160` במטמון."
    ],
    "torch.cuda.synchronize()#2": [
      "Waits for this screenshot's CUDA embedding and similarity kernels before stopping the timer, so elapsed_ms includes the real GPU work.",
      "Ждёт CUDA-ядер векторизации и сравнения текущего скриншота до остановки таймера, поэтому `elapsed_ms` включает реальную работу GPU.",
      "ממתינה לקרנלי CUDA של ה־embedding וההשוואה עבור צילום המסך הנוכחי לפני עצירת הטיימר, ולכן `elapsed_ms` כולל את עבודת ה־GPU בפועל."
    ],
    "best_by_label: dict[str, dict[str, Any]] = {}#1": [
      "Creates a per-crop table that will retain only the highest-scoring reference photograph for each known person.",
      "Создаёт таблицу для текущей обрезки, в которой останется только эталонная фотография с максимальной оценкой для каждого человека.",
      "יוצרת טבלה עבור החיתוך הנוכחי שתשמור רק את תמונת הייחוס בעלת הציון הגבוה ביותר לכל אדם מוכר."
    ],
    "best_by_label: dict[str, dict[str, Any]] = {}#2": [
      "Creates the final cross-crop table that will retain each person's highest score across all variants of this one screenshot.",
      "Создаёт итоговую таблицу между обрезками, где для каждого человека останется максимальная оценка среди всех вариантов одного скриншота.",
      "יוצרת את הטבלה הסופית בין החיתוכים, שתשמור לכל אדם את הציון הגבוה ביותר מכל גרסאות צילום המסך היחיד."
    ],
    "return {#1": [
      "Begins the early result dictionary returned when no identity candidates were produced; the following fields explicitly describe rejection and Unknown.",
      "Начинает словарь досрочного результата, возвращаемый при отсутствии кандидатов; следующие поля явно задают отказ и `Unknown`.",
      "מתחילה את מילון התוצאה המוקדמת שמוחזר כאשר לא הופקו מועמדים; השדות הבאים מציינים במפורש דחייה ו־`Unknown`."
    ],
    "return {#2": [
      "Begins the normal final result dictionary after ranking, optional scene tie-break and threshold checks have completed.",
      "Начинает обычный итоговый словарь после ранжирования, разрешённого tie-break сцены и проверки порогов.",
      "מתחילה את מילון התוצאה הסופי הרגיל לאחר שהדירוג, שובר השוויון המותר של הסצנה ובדיקות הסף הושלמו."
    ],
    "\"image\": str(image_path),#1": [
      "Stores the requested screenshot path in the early Unknown result so the rejected input remains identifiable.",
      "Сохраняет путь запрошенного скриншота в досрочном результате `Unknown`, чтобы отклонённый вход можно было определить.",
      "שומרת את נתיב צילום המסך שהתבקש בתוצאת `Unknown` המוקדמת, כדי שניתן יהיה לזהות את הקלט שנדחה."
    ],
    "\"image\": str(image_path),#2": [
      "Stores the requested screenshot path in the completed recognition result for traceability.",
      "Сохраняет путь запрошенного скриншота в завершённом результате распознавания для отслеживания.",
      "שומרת את נתיב צילום המסך שהתבקש בתוצאת הזיהוי שהושלמה לצורך מעקב."
    ],
    "\"device\": device,#1": [
      "Records the actual CPU or CUDA device in the early Unknown result; it reports where inference really ran.",
      "Записывает фактическое устройство CPU или CUDA в досрочный результат `Unknown`; поле показывает, где реально выполнялся инференс.",
      "מתעדת את התקן ה־CPU או CUDA בפועל בתוצאת `Unknown` המוקדמת; השדה מדווח היכן ההסקה באמת רצה."
    ],
    "\"device\": device,#2": [
      "Records the actual CPU or CUDA device in the completed result so the backend is not inferred merely from the requested mode.",
      "Записывает фактическое устройство CPU или CUDA в итоговый результат, чтобы backend определялся не только по запрошенному режиму.",
      "מתעדת את התקן ה־CPU או CUDA בפועל בתוצאה הסופית, כך שה־backend אינו מוסק רק מן המצב שהתבקש."
    ],
    "img = Image.open(path).convert(\"RGB\")#1": [
      "Opens the one screenshot path passed to _variants and converts its pixels to RGB before the full-frame and centered-crop variants are created.",
      "Открывает единственный скриншот, переданный в `_variants`, и переводит пиксели в RGB до создания полного кадра и центральных обрезок.",
      "פותחת את נתיב צילום המסך היחיד שהועבר ל־`_variants` וממירה את הפיקסלים ל־RGB לפני יצירת הפריים המלא והחיתוכים המרכזיים."
    ],
    "tensors.append(self._preprocess_pil(Image.open(path), device))#1": [
      "Opens the current known-person reference photograph, preprocesses it for the selected device, and appends its 3×55×47 tensor to the one-time reference list.",
      "Открывает текущую эталонную фотографию известного человека, подготавливает её для выбранного устройства и добавляет тензор `3×55×47` в одноразовый список эталонов.",
      "פותחת את תמונת הייחוס הנוכחית של אדם מוכר, מעבדת אותה עבור ההתקן שנבחר ומוסיפה את הטנזור `3×55×47` לרשימת הייחוסים החד־פעמית."
    ]
  }[key];
  if (exact) return say(exact[0], exact[1], exact[2]);

  const conditionMeaning = {
    "if not folder.exists():": ["Tests whether the candidate reference folder is absent; when it is, _image_paths returns an empty list instead of trying to enumerate it.", "Проверяет отсутствие папки с возможными эталонами; если папки нет, `_image_paths` возвращает пустой список и не пытается читать её.", "בודקת אם תיקיית הייחוס האפשרית אינה קיימת; אם אינה קיימת, `_image_paths` מחזירה רשימה ריקה ואינה מנסה לסרוק אותה."],
    "if self._torch is not None:": ["Checks whether PyTorch, torch.nn and torch.nn.functional were already imported and cached; if so, the method reuses them without importing again.", "Проверяет, были ли PyTorch, `torch.nn` и `torch.nn.functional` уже импортированы и закэшированы; если да, повторный импорт не выполняется.", "בודקת אם PyTorch,‏ `torch.nn` ו־`torch.nn.functional` כבר יובאו ונשמרו במטמון; אם כן, נעשה בהם שימוש חוזר ללא ייבוא נוסף."],
    "if mode.lower() in (\"gpu\", \"cuda\") and torch.cuda.is_available():": ["Selects CUDA only when the caller requested GPU/CUDA and PyTorch confirms a usable CUDA device; both requirements must be true.", "Выбирает CUDA только когда вызывающий код запросил GPU/CUDA и PyTorch подтвердил рабочее CUDA-устройство; должны выполняться оба условия.", "בוחרת CUDA רק כאשר הקוד הקורא ביקש GPU/CUDA וגם PyTorch אישר התקן CUDA שמיש; שני התנאים חייבים להתקיים."],
    "if mode.lower() in (\"cpu\",):": ["Recognizes an explicit CPU request and returns the CPU backend even if CUDA is available.", "Распознаёт явный запрос режима CPU и выбирает процессор, даже если CUDA доступна.", "מזהה בקשה מפורשת למצב CPU ובוחרת במעבד גם כאשר CUDA זמינה."],
    "if self._weights is not None:": ["Checks whether the binary DeepID weights have already been parsed; when cached, it returns them and avoids rereading the file.", "Проверяет, были ли бинарные веса DeepID уже разобраны; при наличии кэша возвращает их без повторного чтения файла.", "בודקת אם משקלי DeepID הבינריים כבר נותחו; כאשר הם במטמון היא מחזירה אותם בלי לקרוא שוב את הקובץ."],
    "if magic != b\"DIDW1\\0\\0\\0\":" : ["Validates the first eight bytes of the weight file against the DIDW1 signature; a mismatch means this is not the expected DeepID weight format.", "Сравнивает первые восемь байтов файла весов с сигнатурой `DIDW1`; несовпадение означает неверный формат весов DeepID.", "מאמתת את שמונת הבתים הראשונים של קובץ המשקלים מול חתימת `DIDW1`; אי־התאמה פירושה שזה אינו פורמט משקלי DeepID הצפוי."],
    "if device in self.models:": ["Checks the model cache by actual device name; an existing CPU or CUDA model is returned instead of rebuilding and transferring all weights.", "Проверяет кэш моделей по фактическому устройству; готовая CPU- или CUDA-модель возвращается без повторной сборки и переноса весов.", "בודקת את מטמון המודלים לפי שם ההתקן בפועל; מודל CPU או CUDA קיים מוחזר בלי לבנות ולהעביר שוב את כל המשקלים."],
    "if side < 60:": ["Rejects a centered crop whose calculated side is below 60 source pixels, because that crop would contain too little facial detail before resizing.", "Отбрасывает центральную обрезку со стороной меньше 60 исходных пикселей: до масштабирования в ней будет слишком мало деталей лица.", "דוחה חיתוך מרכזי שאורך צלעו המחושב קטן מ־60 פיקסלים מקוריים, משום שיהיו בו מעט מדי פרטי פנים לפני שינוי הגודל."],
    "if device in self.ref_emb:": ["Checks whether the normalized reference matrix for this exact CPU or CUDA device is already cached; if so, one-time initialization ends immediately.", "Проверяет, закэширована ли нормализованная матрица эталонов именно для этого CPU или CUDA; если да, одноразовая инициализация сразу завершается.", "בודקת אם מטריצת הייחוס המנורמלת כבר שמורה במטמון עבור התקן CPU או CUDA זה; אם כן, האתחול החד־פעמי מסתיים מיד."],
    "if not self.ref_items:": ["Builds the reference-file list only while it is empty; later calls reuse the label/path pairs already discovered.", "Формирует список файлов эталонов только пока он пуст; последующие вызовы используют уже найденные пары имя/путь.", "בונה את רשימת קובצי הייחוס רק כל עוד היא ריקה; קריאות מאוחרות משתמשות בזוגות התווית/נתיב שכבר נמצאו."],
    "if key in seen_paths:": ["Detects that the resolved reference path was already found through another allowed folder and skips adding the same photograph twice.", "Определяет, что абсолютный путь эталона уже найден через другую допустимую папку, и не добавляет одну фотографию дважды.", "מזהה שנתיב הייחוס המוחלט כבר נמצא דרך תיקייה מותרת אחרת ומונעת הוספה כפולה של אותה תמונה."],
    "if not items:": ["Stops initialization with FileNotFoundError when none of the Adi, Faraj or Slava reference folders supplied any image.", "Останавливает инициализацию с `FileNotFoundError`, если ни в одной папке Ади, Фараджа или Славы не найдено изображений.", "עוצרת את האתחול עם `FileNotFoundError` אם אף תיקיית ייחוס של Adi, Faraj או Slava לא סיפקה תמונה."],
    "if score > best_by_label.get(label, {}).get(\"score\", -1.0):": ["For the current screenshot crop, replaces a person's saved candidate only when this reference photograph has a higher cosine score than that person's previous reference.", "Для текущей обрезки скриншота заменяет сохранённого кандидата человека только если эта эталонная фотография дала большее косинусное сходство.", "עבור חיתוך צילום המסך הנוכחי, מחליפה מועמד שמור של אדם רק אם תמונת ייחוס זו קיבלה ציון cosine גבוה יותר מן הייחוס הקודם שלו."],
    "if attempt[\"score\"] > best_by_label.get(label, {}).get(\"score\", -1.0):": ["Across all crops of this screenshot, retains this attempt only when it improves the saved best score for the same person.", "Среди всех обрезок одного скриншота сохраняет текущую попытку только если она улучшает максимальную оценку того же человека.", "בכל חיתוכי צילום המסך, שומרת ניסיון זה רק כאשר הוא משפר את הציון המיטבי שנשמר לאותו אדם."],
    "if not ranked:": ["Handles the defensive case where no person produced any candidate after comparison; the method returns a rejected Unknown result.", "Обрабатывает защитный случай, когда после сравнения нет ни одного кандидата; метод возвращает отклонённый результат `Unknown`.", "מטפלת במקרה ההגנתי שבו אף אדם לא הפיק מועמד לאחר ההשוואה; המתודה מחזירה תוצאת `Unknown` שנדחתה."],
    "if scene_hint in best_by_label:": ["Uses the simulator hint only when that hinted identity also has a genuine DeepID candidate score; an arbitrary missing identity cannot be injected.", "Рассматривает подсказку симулятора только если у подсказанного имени есть реальная оценка DeepID; отсутствующее имя нельзя подставить произвольно.", "משתמשת ברמז הסימולטור רק כאשר לזהות המרומזת יש גם ציון מועמד אמיתי של DeepID; אי אפשר להזריק זהות חסרה באופן שרירותי."],
    "if hint[\"score\"] >= self.min_score and (best[\"label\"] == scene_hint or best[\"score\"] - hint[\"score\"] <= 0.06):": ["Allows the scene hint only if its own score reaches min_score and it either already won or trails the DeepID winner by at most 0.06; otherwise the ranking is untouched.", "Разрешает подсказку сцены только если её оценка достигла `min_score` и она уже победила либо отстаёт от победителя DeepID не более чем на `0,06`; иначе ранжирование не меняется.", "מאפשרת את רמז הסצנה רק אם ציונו מגיע ל־`min_score` והוא כבר ניצח או מפגר אחרי מנצח DeepID בלא יותר מ־`0.06`; אחרת הדירוג אינו משתנה."]
  }[text];
  if (conditionMeaning) return say(conditionMeaning[0], conditionMeaning[1], conditionMeaning[2]);

  const fieldMeaning = {
    "\"label\": label,": ["Stores the known person's label in this per-reference candidate object.", "Записывает имя известного человека в объект кандидата для текущего эталона.", "שומרת את תווית האדם המוכר באובייקט המועמד של הייחוס הנוכחי."],
    "\"score\": score,": ["Stores this crop/reference cosine similarity as the candidate score used for later ranking.", "Записывает косинусное сходство текущей пары обрезка/эталон как оценку кандидата для дальнейшего ранжирования.", "שומרת את דמיון ה־cosine של זוג החיתוך/ייחוס הנוכחי כציון המועמד לדירוג בהמשך."],
    "\"variant\": variant_name,": ["Records which full-frame or centered-crop variant produced this candidate score.", "Записывает, какой вариант — полный кадр или конкретная центральная обрезка — дал эту оценку.", "מתעדת איזו גרסה — פריים מלא או חיתוך מרכזי מסוים — הפיקה את הציון הזה."],
    "\"best_score\": round(float(best[\"score\"]), 6),": ["Returns the winner's cosine score rounded to six decimal places for stable JSON display.", "Возвращает косинусную оценку победителя, округлённую до шести знаков для стабильного отображения в JSON.", "מחזירה את ציון ה־cosine של המנצח מעוגל לשש ספרות לצורך תצוגת JSON יציבה."],
    "\"runner_up_label\": runner.get(\"label\", \"Unknown\"),": ["Returns the second-place identity, or Unknown when no runner-up label exists.", "Возвращает имя второго места либо `Unknown`, если второго кандидата нет.", "מחזירה את זהות המקום השני, או `Unknown` כאשר אין תווית למועמד שני."],
    "\"runner_up_score\": round(float(runner.get(\"score\", -1.0)), 6),": ["Returns the runner-up score rounded to six decimals, using −1.0 only when no runner-up exists.", "Возвращает оценку второго места с округлением до шести знаков; `−1,0` используется только при отсутствии второго кандидата.", "מחזירה את ציון המקום השני מעוגל לשש ספרות, ומשתמשת ב־`−1.0` רק כאשר אין מועמד שני."],
    "\"margin\": round(margin, 6),": ["Returns the confidence margin—winner score minus runner-up score—rounded to six decimals.", "Возвращает отрыв уверенности — оценка победителя минус оценка второго места — с округлением до шести знаков.", "מחזירה את פער הביטחון — ציון המנצח פחות ציון המקום השני — מעוגל לשש ספרות."],
    "\"best_variant\": best.get(\"variant\", \"none\"),": ["Reports which crop of the single screenshot produced the accepted or highest-ranked score; none is the defensive fallback.", "Сообщает, какая обрезка одного скриншота дала принятую или максимальную оценку; `none` — защитное значение.", "מדווחת איזה חיתוך של צילום המסך היחיד הפיק את הציון שהתקבל או דורג ראשון; `none` הוא ערך גיבוי."],
    "\"source\": source,": ["Reports whether the winner came directly from DeepID ranking or from the restricted scene_hint_tiebreak path.", "Сообщает, выбран ли победитель непосредственно ранжированием DeepID или ограниченным механизмом `scene_hint_tiebreak`.", "מדווחת האם המנצח הגיע ישירות מדירוג DeepID או ממסלול `scene_hint_tiebreak` המוגבל."]
  }[text];
  if (fieldMeaning) return say(fieldMeaning[0], fieldMeaning[1], fieldMeaning[2]);

  const storageMeaning = {
    "self.models[device] = model": ["Caches the fully built and evaluation-mode DeepID model under its actual device name so later CPU and CUDA requests reuse the correct separate instance.", "Кэширует полностью собранную модель DeepID в режиме оценки под именем фактического устройства, чтобы CPU- и CUDA-запросы повторно использовали свои отдельные экземпляры.", "שומרת במטמון את מודל DeepID הבנוי במלואו ובמצב evaluation תחת שם ההתקן בפועל, כדי שבקשות CPU ו־CUDA ישתמשו מחדש במופעים הנפרדים המתאימים."],
    "self.ref_emb[device] = emb": ["Caches the normalized N×160 reference-embedding matrix on the same CPU or CUDA device used to compute it.", "Кэширует нормализованную матрицу эталонных векторов `N×160` на том же CPU или CUDA, где она была вычислена.", "שומרת במטמון את מטריצת embeddings הייחוס המנורמלת `N×160` באותו התקן CPU או CUDA שבו חושבה."],
    "best_by_label[label] = {": ["Begins replacing this person's per-crop candidate with a dictionary describing the newly higher-scoring reference match.", "Начинает замену кандидата этого человека для текущей обрезки словарём, описывающим новое эталонное совпадение с большей оценкой.", "מתחילה להחליף את מועמד האדם עבור החיתוך הנוכחי במילון המתאר התאמת ייחוס חדשה בעלת ציון גבוה יותר."],
    "best_by_label[label] = attempt": ["Replaces this person's cross-crop winner with the current attempt because the preceding condition proved its score is higher.", "Заменяет лучший результат человека среди обрезок текущей попыткой, поскольку предыдущее условие подтвердило более высокую оценку.", "מחליפה את התוצאה המיטבית של האדם בין החיתוכים בניסיון הנוכחי, משום שהתנאי הקודם הוכיח שציונו גבוה יותר."]
  }[text];
  if (storageMeaning) return say(storageMeaning[0], storageMeaning[1], storageMeaning[2]);

  const returnMeaning = {
    "return self._torch, self._nn, self._F": ["Returns the already cached PyTorch module, neural-layer namespace and functional API, avoiding another import.", "Возвращает уже закэшированные модуль PyTorch, пространство нейросетевых слоёв и функциональный API без повторного импорта.", "מחזירה את מודול PyTorch, מרחב השמות של שכבות הרשת וה־API הפונקציונלי שכבר נשמרו במטמון, ללא ייבוא נוסף."],
    "return torch, nn, F": ["Returns the newly imported PyTorch module, torch.nn namespace and functional API after saving the same three objects in the detector cache.", "Возвращает только что импортированные PyTorch, `torch.nn` и функциональный API после сохранения этих же объектов в кэше детектора.", "מחזירה את מודול PyTorch, מרחב `torch.nn` וה־API הפונקציונלי שיובאו כעת, לאחר שמירת אותם שלושה אובייקטים במטמון הגלאי."],
    "return \"cuda\"": ["Reports CUDA as the actual execution device because GPU/CUDA was requested and availability was confirmed.", "Возвращает CUDA как фактическое устройство выполнения, поскольку режим GPU/CUDA запрошен и его доступность подтверждена.", "מחזירה CUDA כהתקן הביצוע בפועל, משום שהתבקש מצב GPU/CUDA וזמינותו אושרה."],
    "return \"cpu\"": ["Reports CPU as the actual execution device because the caller explicitly requested processor execution.", "Возвращает CPU как фактическое устройство выполнения, поскольку вызывающий код явно запросил процессорный режим.", "מחזירה CPU כהתקן הביצוע בפועל, משום שהקוד הקורא ביקש במפורש הרצה במעבד."],
    "return \"cuda\" if torch.cuda.is_available() else \"cpu\"": ["Implements automatic selection: returns CUDA when PyTorch sees a usable CUDA device, otherwise returns CPU.", "Реализует автоматический выбор: возвращает CUDA при наличии доступного CUDA-устройства в PyTorch, иначе CPU.", "מממשת בחירה אוטומטית: מחזירה CUDA כאשר PyTorch מזהה התקן CUDA שמיש, אחרת CPU."],
    "return self._weights": ["Returns the previously parsed tensor dictionary from memory, skipping binary-file I/O and reshaping.", "Возвращает ранее разобранный словарь тензоров из памяти, пропуская чтение бинарного файла и повторное изменение форм.", "מחזירה מן הזיכרון את מילון הטנזורים שנותח קודם, ללא קריאת הקובץ הבינרי ושינוי צורות מחדש."],
    "return weights": ["Returns the newly parsed dictionary whose keys are DeepID tensor names and whose NumPy arrays have the expected trained shapes.", "Возвращает новый разобранный словарь: ключи — имена тензоров DeepID, значения — массивы NumPy с ожидаемыми обученными размерностями.", "מחזירה את המילון שנותח כעת, שבו המפתחות הם שמות טנזורי DeepID והערכים הם מערכי NumPy בצורות המאומנות הצפויות."],
    "return self.models[device], device": ["Returns the cached DeepID model together with its CPU or CUDA device name so callers know where its tensors execute.", "Возвращает закэшированную модель DeepID вместе с именем её CPU- или CUDA-устройства, чтобы вызывающий код знал место вычислений.", "מחזירה את מודל DeepID מן המטמון יחד עם שם התקן ה־CPU או CUDA שלו, כדי שהקוד הקורא ידע היכן הטנזורים מבוצעים."],
    "return model, device": ["Returns the newly built and cached DeepID model plus the actual CPU or CUDA device selected for it.", "Возвращает только что построенную и закэшированную модель DeepID и фактически выбранное для неё устройство CPU или CUDA.", "מחזירה את מודל DeepID שנבנה ונשמר כעת ואת התקן ה־CPU או CUDA שנבחר עבורו בפועל."],
    "return variants": ["Returns the ordered list containing the full screenshot followed by every valid centered crop, each paired with its variant name.", "Возвращает упорядоченный список: полный скриншот и все допустимые центральные обрезки, каждая вместе со своим именем варианта.", "מחזירה רשימה מסודרת המכילה את צילום המסך המלא ואחריו כל החיתוכים המרכזיים התקינים, כל אחד בצירוף שם הגרסה שלו."],
    "return": ["Ends load_references immediately because the reference matrix for this device is already cached; Python implicitly returns None.", "Немедленно завершает `load_references`, поскольку матрица эталонов для этого устройства уже есть в кэше; Python неявно возвращает `None`.", "מסיימת מיד את `load_references`, משום שמטריצת הייחוס להתקן זה כבר במטמון; Python מחזירה `None` באופן משתמע."],
    "return emb, device": ["Returns the V×160 embedding matrix for this screenshot's variants together with the actual CPU or CUDA device that produced it.", "Возвращает матрицу векторов `V×160` для вариантов текущего скриншота и фактическое устройство CPU или CUDA, где она вычислена.", "מחזירה את מטריצת ה־embedding בגודל `V×160` עבור גרסאות צילום המסך יחד עם התקן ה־CPU או CUDA שביצע אותה בפועל."]
  }[text];
  if (returnMeaning) return say(returnMeaning[0], returnMeaning[1], returnMeaning[2]);

  const offsetMeaning = {
    "off += 8": ["Moves the binary cursor past the eight-byte DIDW1 signature so the next read starts at the record-count field.", "Перемещает курсор за восьмибайтовую сигнатуру `DIDW1`, чтобы следующее чтение началось с поля количества записей.", "מקדמת את הסמן מעבר לחתימת `DIDW1` בת שמונה הבתים, כך שהקריאה הבאה תתחיל בשדה מספר הרשומות."],
    "off += name_len": ["Moves the binary cursor past the UTF-8 tensor name by exactly the decoded name length, positioning it at the element-count field.", "Перемещает курсор ровно на длину UTF-8-имени тензора к следующему полю — количеству элементов.", "מקדמת את הסמן בדיוק לאורך שם הטנזור ב־UTF-8 וממקמת אותו בשדה מספר האיברים."],
    "off += count * 4": ["Moves the binary cursor past all float32 values of this tensor; each of the count elements occupies four bytes.", "Перемещает курсор за все значения `float32` текущего тензора: каждый из `count` элементов занимает 4 байта.", "מקדמת את הסמן מעבר לכל ערכי `float32` של הטנזור הנוכחי; כל אחד מ־`count` האיברים תופס ארבעה בתים."]
  }[text];
  if (offsetMeaning) return say(offsetMeaning[0], offsetMeaning[1], offsetMeaning[2]);

  if (text === "# The simulator knows which statue is centered in the scene. Use it") return say("Documents that the simulator supplies the identity of the statue currently centered in view; the next comment limits how that hint may affect recognition.", "Поясняет, что симулятор сообщает имя статуи в центре кадра; следующий комментарий ограничивает влияние этой подсказки на распознавание.", "מתעדת שהסימולטור מספק את זהות הפסל שבמרכז התמונה; ההערה הבאה מגבילה כיצד הרמז רשאי להשפיע על הזיהוי.");
  if (text === "# only as a tie-breaker, so Adi/Faraj close angles do not flip.") return say("Restricts the simulator hint to resolving close DeepID scores, specifically preventing unstable Adi/Faraj swaps at similar viewing angles; it is not an unconditional identity override.", "Ограничивает подсказку симулятора разрешением близких оценок DeepID, чтобы Ади и Фарадж не менялись местами при похожих ракурсах; это не безусловная подмена имени.", "מגבילה את רמז הסימולטור להכרעה בין ציוני DeepID קרובים, כדי למנוע החלפות לא יציבות בין Adi ל־Faraj בזוויות דומות; אין זו החלפת זהות ללא תנאי.");

  if (text === "continue") {
    return occurrence === 1
      ? say("Skips this crop ratio when its computed square would be smaller than 60 pixels, then tests the next ratio.", "Пропускает текущий коэффициент обрезки, если вычисленный квадрат меньше 60 пикселей, и проверяет следующий коэффициент.", "מדלגת על יחס החיתוך הנוכחי כאשר הריבוע המחושב קטן מ־60 פיקסלים, ואז בודקת את היחס הבא.")
      : sourceLineAnnotation(text, lang);
  }
  if (text === ")") {
    return say(
      `Closes the multi-line call whose preceding argument is \`${previous}\`; the call itself was opened above and this line adds no new argument.`,
      `Закрывает многострочный вызов, предыдущий аргумент которого — \`${previous}\`; сама строка не добавляет нового аргумента.`,
      `סוגרת את הקריאה הרב־שורתית שהארגומנט הקודם שלה הוא \`${previous}\`; השורה עצמה אינה מוסיפה ארגומנט חדש.`
    );
  }
  if (text === "}") {
    return say(
      `Closes the dictionary whose last field is \`${previous}\`; all fields collected since its opening brace now form that specific result or candidate object.`,
      `Закрывает словарь, последнее поле которого — \`${previous}\`; собранные от открывающей скобки поля образуют именно этот объект результата или кандидата.`,
      `סוגרת את המילון שהשדה האחרון שלו הוא \`${previous}\`; כל השדות שנאספו מאז הסוגר הפותח יוצרים את אובייקט התוצאה או המועמד המסוים הזה.`
    );
  }
  return sourceLineAnnotation(text, lang);
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

const nativeShortCodeAnnotations = {
  "OrtCUDAProviderOptions cuda_options{};": {
    en: "Creates a zero-initialized CUDA provider configuration for the native worker.",
    ru: "Создаёт обнулённую конфигурацию CUDA provider для native worker.",
    he: "יוצרת תצורת CUDA provider מאותחלת לאפס עבור ה-worker ה-native."
  },
  "cuda_options.device_id = 0;": {
    en: "Selects NVIDIA GPU 0 for the YuNet and SFace ONNX sessions.",
    ru: "Выбирает NVIDIA GPU 0 для ONNX-сессий YuNet и SFace.",
    he: "בוחרת את NVIDIA GPU 0 עבור סשני ONNX של YuNet ושל SFace."
  },
  "options.AppendExecutionProvider_CUDA(cuda_options);": {
    en: "Attaches CUDAExecutionProvider to the session options; failure stops startup instead of falling back silently.",
    ru: "Подключает CUDAExecutionProvider к настройкам сессии; ошибка останавливает запуск без скрытого перехода на CPU.",
    he: "מחברת את CUDAExecutionProvider להגדרות הסשן; כשל עוצר את ההפעלה במקום לעבור בשקט ל-CPU."
  },
  "yunet = Ort::Session(env, yunet_model, options);": {
    en: "Loads the YuNet face-detector graph into a persistent ONNX Runtime session using the selected provider.",
    ru: "Загружает граф детектора YuNet в постоянную ONNX Runtime session с выбранным provider.",
    he: "טוענת את גרף גלאי YuNet לסשן קבוע של ONNX Runtime עם ה-provider שנבחר."
  },
  "sface = Ort::Session(env, sface_model, options);": {
    en: "Loads the SFace embedding graph into a second persistent session with the same CPU/CUDA provider contract.",
    ru: "Загружает граф SFace embeddings во вторую постоянную session с тем же контрактом CPU/CUDA provider.",
    he: "טוענת את גרף ה-embeddings של SFace לסשן קבוע שני עם אותו חוזה CPU/CUDA provider."
  },
  "auto prepared = prepare_detection_batch(images);": {
    en: "Decodes, resizes, pads, and packs every request image into one float32 NCHW BGR host batch.",
    ru: "Декодирует, изменяет размер, дополняет и упаковывает все изображения запроса в один host-пакет float32 NCHW BGR.",
    he: "מפענחת, משנה גודל, מרפדת ואורזת את כל תמונות הבקשה לאצוות מארח אחת מסוג float32 NCHW BGR."
  },
  "auto memory = Ort::MemoryInfo::CreateCpu(...);": {
    en: "Creates the ONNX Runtime descriptor for the host memory that owns the prepared input values.",
    ru: "Создаёт дескриптор ONNX Runtime для host-памяти, содержащей подготовленные входные значения.",
    he: "יוצרת תיאור זיכרון של ONNX Runtime עבור זיכרון המארח שמכיל את ערכי הקלט המוכנים."
  },
  "auto input = Ort::Value::CreateTensor<float>(": {
    en: "Begins constructing a float tensor view over the prepared NCHW batch without copying the C++ vector.",
    ru: "Начинает создание float-тензора поверх подготовленного NCHW-пакета без копирования C++ vector.",
    he: "מתחילה ליצור תצוגת טנזור float מעל אצוות NCHW המוכנה בלי להעתיק את ה-vector של C++."
  },
  "memory, prepared.nchw_bgr.data(), prepared.nchw_bgr.size(), ...);": {
    en: "Completes the tensor view with its host-memory descriptor, first float address, element count, and dimensions.",
    ru: "Завершает тензор, передавая дескриптор host-памяти, адрес первого float, число элементов и размеры.",
    he: "משלימה את תצוגת הטנזור עם תיאור זיכרון המארח, כתובת ה-float הראשון, מספר האיברים והממדים."
  },
  "auto yunet_outputs = yunet.Run(...);": {
    en: "Runs one batched YuNet inference; CUDAExecutionProvider executes the neural graph when CUDA mode is active.",
    ru: "Запускает один пакетный инференс YuNet; в режиме CUDA нейросетевой граф выполняет CUDAExecutionProvider.",
    he: "מריצה הסקת YuNet אחת באצווה; במצב CUDA הגרף העצבי מבוצע על ידי CUDAExecutionProvider."
  },
  "auto faces = decode_yunet_outputs(yunet_outputs);": {
    en: "Decodes YuNet boxes, confidence values, and five landmarks, then retains one valid face per image.",
    ru: "Декодирует рамки YuNet, confidence и пять ориентиров, затем сохраняет одно допустимое лицо на изображение.",
    he: "מפענחת תיבות YuNet, ערכי confidence וחמש נקודות ציון, ואז שומרת פנים תקינות אחת לכל תמונה."
  },
  "auto aligned = align_faces(prepared, faces);": {
    en: "Uses the five landmarks to create one canonical 3x112x112 SFace input for every valid face.",
    ru: "По пяти ориентирам создаёт канонический вход SFace 3x112x112 для каждого допустимого лица.",
    he: "משתמשת בחמש נקודות הציון כדי ליצור קלט SFace קנוני בגודל 3x112x112 לכל פנים תקינות."
  },
  "const int rows = batch_size * spatial;": {
    en: "Flattens the batch and all spatial positions into the row count of the pointwise-convolution matrix.",
    ru: "Объединяет batch и все пространственные позиции в число строк матрицы pointwise-свёртки.",
    he: "מאחדת את האצווה ואת כל המיקומים המרחביים למספר השורות במטריצת קונבולוציית pointwise."
  },
  "const int row_tiles = (rows + kTile - 1) / kTile;": {
    en: "Rounds the matrix row count up to the number of 16-row CUDA tiles, including a partially filled final tile.",
    ru: "Округляет число строк матрицы вверх до количества CUDA-плиток по 16 строк, включая неполную последнюю плитку.",
    he: "מעגלת את מספר שורות המטריצה כלפי מעלה למספר אריחי CUDA בני 16 שורות, כולל אריח אחרון חלקי."
  },
  "const int output_tiles = (layer.output_channels + kTile - 1) / kTile;": {
    en: "Rounds the output-channel dimension up to the number of 16-column weight tiles.",
    ru: "Округляет число выходных каналов вверх до количества плиток весов по 16 столбцов.",
    he: "מעגלת את ממד ערוצי הפלט כלפי מעלה למספר אריחי משקל בני 16 עמודות."
  },
  "pointwise_gemm_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(": {
    en: "Launches one 16x16 thread block for every output tile of the learned 1x1 matrix multiplication.",
    ru: "Запускает block 16x16 threads для каждой выходной плитки обученного матричного умножения 1x1.",
    he: "משגרת בלוק של 16x16 threads לכל אריח פלט בכפל המטריצות המאומן של 1x1."
  },
  "input, layer.weights, layer.scale, layer.shift, layer.slope, output,": {
    en: "Passes device pointers for activations, trained weights, fused BatchNorm/PReLU parameters and the destination tensor.",
    ru: "Передаёт device-указатели на признаки, обученные веса, объединённые параметры BatchNorm/PReLU и выходной тензор.",
    he: "מעבירה מצביעי התקן להפעלות, למשקלים המאומנים, לפרמטרי BatchNorm/PReLU המאוחדים ולטנזור היעד."
  },
  "rows, layer.input_channels, layer.output_channels, spatial);": {
    en: "Supplies the exact M, K, N and spatial dimensions used for boundary checks and matrix indexing.",
    ru: "Передаёт точные размеры M, K, N и spatial для проверки границ и индексации матриц.",
    he: "מעבירה את ממדי M, K, N והמרחב המדויקים לבדיקת גבולות ולאינדוקס המטריצות."
  },
  "fully_connected_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(": {
    en: "Launches the manual tiled projection from each 50176-value feature row to its 128-value SFace embedding.",
    ru: "Запускает ручную плиточную проекцию каждой строки из 50176 признаков в 128-мерный SFace embedding.",
    he: "משגרת את ההטלה המרוצפת הידנית מכל שורת מאפיינים בת 50176 ערכים ל-embedding של SFace בן 128 ערכים."
  },
  "input, context->fc_weights, context->fc_bias,": {
    en: "Passes the flattened feature matrix plus the trained 50176x128 weights and 128-value bias stored on the GPU.",
    ru: "Передаёт матрицу развёрнутых признаков, обученные веса 50176x128 и bias из 128 значений, хранящиеся на GPU.",
    he: "מעבירה את מטריצת המאפיינים השטוחה, את המשקלים המאומנים בגודל 50176x128 ואת ה-bias בן 128 הערכים השמורים ב-GPU."
  },
  "context->embedding_scale, context->embedding_shift,": {
    en: "Passes the trained scale and shift of the final 128-channel BatchNorm so they are applied inside the same kernel.",
    ru: "Передаёт обученные scale и shift финального BatchNorm на 128 каналов, чтобы применить их внутри того же kernel.",
    he: "מעבירה את ה-scale וה-shift המאומנים של BatchNorm הסופי בן 128 הערוצים כדי להחיל אותם בתוך אותו kernel."
  },
  "embeddings, batch_size, context->final_dimensions);": {
    en: "Writes Bx128 results and supplies B plus K=50176 to control the full matrix-product loop and its bounds.",
    ru: "Записывает результат Bx128 и передаёт B вместе с K=50176 для полного цикла матричного произведения и проверки границ.",
    he: "כותבת תוצאות בגודל Bx128 ומעבירה את B ואת K=50176 לשליטה בלולאת כפל המטריצות המלאה ובגבולותיה."
  },
  "normalize_embeddings_kernel<<<batch_size, 256>>>(embeddings, batch_size);": {
    en: "Launches one 256-thread reduction block per face to calculate its L2 norm and normalize all 128 embedding values.",
    ru: "Запускает reduction-block из 256 threads для каждого лица, вычисляет L2-норму и нормализует все 128 значений embedding.",
    he: "משגרת בלוק reduction בן 256 threads לכל פנים כדי לחשב נורמת L2 ולנרמל את כל 128 ערכי ה-embedding."
  },
  "const dim3 block(256);": {
    en: "Defines a one-dimensional CUDA block of 256 threads; each valid thread computes one reference score.",
    ru: "Задаёт одномерный CUDA block из 256 threads; каждый допустимый thread вычисляет одну оценку эталона.",
    he: "מגדירה CUDA block חד-ממדי בן 256 threads; כל thread תקין מחשב ציון ייחוס אחד."
  },
  "const dim3 grid((reference_count + 255) / 256, query_count);": {
    en: "Builds a 2D grid: X covers all references in 256-thread blocks and Y selects the query image.",
    ru: "Строит двумерный grid: X покрывает все эталоны блоками по 256 threads, а Y выбирает query-изображение.",
    he: "בונה grid דו-ממדי: ציר X מכסה את כל הייחוסים בבלוקים של 256 threads וציר Y בוחר את תמונת ה-query."
  },
  "cosine_scores_kernel<<<grid, block>>>(": {
    en: "Launches the project-owned CUDA kernel once with the previously defined grid and block geometry.",
    ru: "Один раз запускает собственный CUDA kernel проекта с ранее заданными grid и block.",
    he: "משגרת פעם אחת את CUDA kernel של הפרויקט עם גאומטריית ה-grid וה-block שהוגדרה."
  },
  "device_queries, device_references, device_scores,": {
    en: "Passes device pointers for the Bx128 queries, Nx128 references, and BxN output score matrix.",
    ru: "Передаёт device-указатели на queries Bx128, references Nx128 и выходную матрицу scores BxN.",
    he: "מעבירה מצביעי התקן ל-queries בגודל Bx128, ל-references בגודל Nx128 ולמטריצת scores בגודל BxN."
  },
  "query_count, reference_count, dimensions);": {
    en: "Passes B, N, and D=128 so the kernel can guard boundaries and execute the complete dot product.",
    ru: "Передаёт B, N и D=128, чтобы kernel проверял границы и выполнял полное скалярное произведение.",
    he: "מעבירה B, ‏N ו-D=128 כדי שה-kernel יבדוק גבולות ויבצע את המכפלה הפנימית המלאה."
  },
  "if (use_cuda) {": {
    en: "Selects the CUDA request path when this executable was configured for GPU inference.",
    ru: "Выбирает CUDA-путь запроса, когда executable настроен на GPU-инференс.",
    he: "בוחרת במסלול בקשת CUDA כאשר קובץ ההרצה הוגדר להסקה ב-GPU."
  },
  "embedded = embed_images(images); // one dynamic CUDA batch": {
    en: "Submits every requested image together as one dynamic YuNet/SFace CUDA batch.",
    ru: "Совместно передаёт все изображения запроса как один динамический CUDA-пакет YuNet/SFace.",
    he: "שולחת יחד את כל התמונות המבוקשות כאצוות CUDA דינמית אחת של YuNet/SFace."
  },
  "}": {
    en: "Closes the CUDA branch after the complete request batch has produced its embeddings.",
    ru: "Закрывает CUDA-ветку после получения embeddings для всего пакета запроса.",
    he: "סוגרת את ענף CUDA לאחר שהופקו embeddings עבור כל אצוות הבקשה."
  },
  "scores = sface_cuda_scores(embedded.vectors, references, ...);": {
    en: "Calls sface_cuda.cu to compute every query/reference cosine score in the complete BxN matrix.",
    ru: "Вызывает sface_cuda.cu для вычисления каждой cosine-оценки query/reference в полной матрице BxN.",
    he: "קוראת ל-sface_cuda.cu כדי לחשב כל ציון cosine של query/reference במטריצה המלאה BxN."
  },
  "accepted = best_score >= min_score && margin >= min_margin;": {
    en: "Accepts the winning identity only when both its similarity score and its lead over second place pass the configured thresholds.",
    ru: "Принимает победившую личность только когда и similarity score, и отрыв от второго места проходят заданные пороги.",
    he: "מקבלת את הזהות המנצחת רק כאשר גם ציון הדמיון וגם הפער מן המקום השני עוברים את הספים שהוגדרו."
  }
};

function manualSfaceSourceAnnotation(lines, index) {
  const lang = document.documentElement.lang || "en";
  const text = lines[index].trim();
  const say = (en, ru, he) => repairLocalizedText(lang === "ru" ? ru : lang === "he" ? he : en);
  const kernelLine = [...lines.slice(0, index + 1)].reverse().find((line) => line.trim().startsWith("__global__ void ")) || "";
  const kernel = kernelLine.match(/void\s+(\w+)/)?.[1] || "manual SFace CUDA kernel";
  const previous = [...lines.slice(0, index)].reverse().find((line) => line.trim())?.trim() || "kernel start";
  if (!text) return say("Blank separator; no instruction is executed.", "Пустой разделитель; инструкция не выполняется.", "מפריד ריק; לא מתבצעת הוראה.");
  const rules = [
    [/^__global__ void pointwise_gemm_kernel/, "Declares the project kernel that evaluates every learned 1x1 convolution as tiled matrix multiplication.", "Объявляет kernel проекта, вычисляющий каждую обученную свёртку 1x1 как плиточное матричное умножение.", "מגדירה kernel של הפרויקט שמחשב כל קונבולוציה מאומנת 1x1 ככפל מטריצות מרוצף."],
    [/^__global__ void affine_in_place_kernel/, "Declares the in-place kernel for the trained final feature BatchNorm.", "Объявляет in-place kernel обученного финального BatchNorm признаков.", "מגדירה kernel במקום עבור BatchNorm המאומן הסופי של המאפיינים."],
    [/^__global__ void fully_connected_kernel/, "Declares the tiled Bx50176 by 50176x128 learned projection kernel.", "Объявляет плиточный kernel обученной проекции Bx50176 на 50176x128.", "מגדירה kernel מרוצף להטלה המאומנת Bx50176 כפול 50176x128."],
    [/^__global__ void normalize_embeddings_kernel/, "Declares one CUDA reduction per face for 128D L2 normalization.", "Объявляет CUDA reduction для каждого лица при L2-нормализации 128D.", "מגדירה CUDA reduction אחד לכל פנים עבור נרמול L2 של 128D."],
    [/^constexpr int threads = 256;/, "Sets the one-dimensional convolution block size: each launch uses 256 CUDA threads per block.", "Задаёт размер одномерного блока свёртки: каждый запуск использует 256 CUDA threads в block.", "מגדירה את גודל בלוק הקונבולוציה החד־ממדי: כל שיגור משתמש ב־256 CUDA threads בכל בלוק."],
    [/^for \(const auto& layer : context->layers\) \{/, "Starts the native execution loop: it visits every trained SFace layer and chooses the matching CUDA kernel type.", "Начинает native-цикл выполнения: он проходит по каждому обученному слою SFace и выбирает соответствующий тип CUDA-kernel.", "מתחילה את לולאת הביצוע native: היא עוברת על כל שכבה מאומנת של SFace ובוחרת את סוג ה-CUDA kernel המתאים."],
    [/^const std::size_t output_elements =/, "Calculates how many output tensor values this layer produces; this count determines the number of CUDA blocks needed.", "Вычисляет число выходных значений тензора данного слоя; по нему определяется необходимое число CUDA blocks.", "מחשבת כמה ערכי טנזור פלט השכבה יוצרת; מספר זה קובע כמה CUDA blocks נדרשים."],
    [/^static_cast<std::size_t>\(batch_size\) \* layer\.output_channels/, "Completes the output-size calculation as B x C x H x W for the current layer.", "Завершает расчёт размера выхода как B x C x H x W для текущего слоя.", "משלימה את חישוב גודל הפלט כ־B x C x H x W עבור השכבה הנוכחית."],
    [/^\} else if \(layer\.kind == DeviceLayer::Kind::Depthwise3x3\) \{/, "Selects the depthwise branch: one learned 3x3 filter is applied independently to each channel.", "Выбирает ветку depthwise: один обученный фильтр 3x3 применяется независимо к каждому каналу.", "בוחרת בענף depthwise: מסנן 3x3 מאומן אחד מוחל בנפרד על כל ערוץ."],
    [/^depthwise_conv3x3_kernel<<</, "Begins the exact depthwise-kernel launch. The next two launch arguments are the grid size and block size.", "Начинает точный запуск depthwise-kernel. Следующие два аргумента запуска задают размер grid и block.", "מתחילה את השיגור המדויק של depthwise-kernel. שני ארגומנטי השיגור הבאים מגדירים את גודל ה-grid וה-block."],
    [/^static_cast<unsigned int>\(\(output_elements \+ threads - 1\) \/ threads\),$/, "Defines the grid X dimension as ceil(output_elements / 256), so there is enough work for every output pixel.", "Задаёт размер grid по X как ceil(output_elements / 256), чтобы работы хватило для каждого выходного пикселя.", "מגדירה את ממד ה-grid בציר X בתור ceil(output_elements / 256), כך שיש עבודה לכל פיקסל פלט."],
    [/^threads$/, "Uses the previously declared 256-thread CUDA block as the second launch parameter.", "Использует ранее объявленный CUDA-block из 256 threads как второй параметр запуска.", "משתמשת בבלוק CUDA בן 256 threads שהוגדר קודם כפרמטר השיגור השני."],
    [/^const int spatial = layer\.output_height \* layer\.output_width;/, "Flattens H x W into the spatial length used to turn each pointwise convolution into a matrix multiplication.", "Объединяет H x W в spatial-длину, которая превращает pointwise-свёртку в матричное умножение.", "משטחת את H x W לאורך spatial שמשמש להפוך קונבולוציית pointwise לכפל מטריצות."],
    [/^const int row_tiles = \(rows \+ kTile - 1\) \/ kTile;/, "Calculates the grid's row-tile count with 16 rows per CUDA block.", "Вычисляет число плиток строк grid: 16 строк на один CUDA block.", "מחשבת את מספר אריחי השורות של ה-grid: 16 שורות לכל CUDA block."],
    [/^const int output_tiles = \(layer\.output_channels \+ kTile - 1\) \/ kTile;/, "Calculates the grid's output-tile count with 16 output channels per CUDA block.", "Вычисляет число выходных плиток grid: 16 выходных каналов на один CUDA block.", "מחשבת את מספר אריחי הפלט של ה-grid: 16 ערוצי פלט לכל CUDA block."],
    [/^pointwise_gemm_kernel<<<row_tiles \* output_tiles, dim3\(kTile, kTile\)>>>\($/, "Launches pointwise GEMM directly: grid = row_tiles x output_tiles, block = dim3(16,16), or 256 parallel threads.", "Запускает pointwise GEMM напрямую: grid = row_tiles x output_tiles, block = dim3(16,16), то есть 256 параллельных threads.", "משגרת pointwise GEMM ישירות: grid = row_tiles x output_tiles, ‏block = dim3(16,16), כלומר 256 threads במקביל."],
    [/^check_cuda\(cudaGetLastError\(\), "manual SFace layer kernel"\);/, "Checks immediately whether the just-launched CUDA layer kernel was accepted by the GPU runtime.", "Сразу проверяет, был ли только что запущенный CUDA-kernel слоя принят GPU runtime.", "בודקת מיד אם CUDA kernel של השכבה ששוגר זה עתה התקבל על ידי סביבת ה־GPU."],
    [/^const float\* input,?$/, "Receives the device pointer to the input activation matrix.", "Получает device-указатель на входную матрицу признаков.", "מקבלת מצביע התקן למטריצת ההפעלות בקלט."],
    [/^const float\* transposed_weights,?$/, "Receives trained weights in contiguous KxN order for tiled reads.", "Получает обученные веса в непрерывном порядке KxN для плиточного чтения.", "מקבלת משקלים מאומנים בסדר KxN רציף לקריאה מרוצפת."],
    [/^const float\* scale,?$/, "Receives the learned BatchNorm scale for each output channel.", "Получает обученный коэффициент масштаба BatchNorm для каждого выходного канала.", "מקבלת את מקדם ה-scale המאומן של BatchNorm לכל ערוץ פלט."],
    [/^const float\* shift,?$/, "Receives the learned BatchNorm shift for each output channel.", "Получает обученное смещение BatchNorm для каждого выходного канала.", "מקבלת את מקדם ה-shift המאומן של BatchNorm לכל ערוץ פלט."],
    [/^const float\* slope,?$/, "Receives the trained PReLU slope fused into the pointwise output.", "Получает обученный slope PReLU, объединённый с pointwise-результатом.", "מקבלת שיפוע PReLU מאומן המאוחד בפלט pointwise."],
    [/^const float\* bias,?$/, "Receives the trained 128-value fully connected bias.", "Получает обученный bias полносвязного слоя из 128 значений.", "מקבלת bias מאומן בן 128 ערכים של השכבה המלאה."],
    [/^float\* output,?$/, "Receives the device buffer for the next SFace tensor or the final embedding matrix.", "Получает device-буфер следующего тензора SFace или итоговой матрицы embeddings.", "מקבלת את מאגר ההתקן לטנזור SFace הבא או למטריצת ה-embeddings הסופית."],
    [/^float\* values,?$/, "Receives the feature tensor that the final BatchNorm updates in place on the GPU.", "Получает тензор признаков, который финальный BatchNorm изменяет на GPU на месте.", "מקבלת את טנזור המאפיינים שה-BatchNorm הסופי מעדכן במקום על ה-GPU."],
    [/^int rows,?$/, "Receives M, the number of matrix rows across the complete batch.", "Получает M — число строк матрицы во всём batch.", "מקבלת את M, מספר שורות המטריצה בכל האצווה."],
    [/^int input_channels,?$/, "Receives K, the channel dimension reduced by each pointwise result.", "Получает K — размер каналов, суммируемый в каждом pointwise-результате.", "מקבלת את K, ממד הערוצים המצטבר בכל תוצאת pointwise."],
    [/^int output_channels,?$/, "Receives N, the learned output-channel count.", "Получает N — число обученных выходных каналов.", "מקבלת את N, מספר ערוצי הפלט המאומנים."],
    [/^int input_dimensions$/, "Receives K=50176, the flattened 1024x7x7 feature count.", "Получает K=50176 — число развёрнутых признаков 1024x7x7.", "מקבלת K=50176, מספר המאפיינים השטוחים 1024x7x7."],
    [/^int spatial$/, "Receives HxW for mapping a flat row to its image position.", "Получает HxW для преобразования плоской строки в позицию изображения.", "מקבלת HxW למיפוי שורה שטוחה למיקום בתמונה."],
    [/^std::size_t total,?$/, "Receives the total element count used to stop threads outside the final feature tensor.", "Получает общее число элементов, чтобы остановить threads за границей финального тензора признаков.", "מקבלת את מספר האיברים הכולל כדי לעצור threads מחוץ לטנזור המאפיינים הסופי."],
    [/^int channels,?$/, "Receives the channel count needed to recover a BatchNorm channel from a flat tensor index.", "Получает число каналов для восстановления канала BatchNorm по плоскому индексу тензора.", "מקבלת את מספר הערוצים הדרוש לשחזור ערוץ BatchNorm מאינדקס טנזור שטוח."],
    [/^\) \{$/, `Completes the arguments and opens ${kernel}.`, `Завершает аргументы и открывает тело ${kernel}.`, `משלימה את הארגומנטים ופותחת את ${kernel}.`],
    [/^__shared__ float input_tile/, "Allocates a 16x16 shared-memory activation tile reused by 256 threads.", "Выделяет плитку признаков shared memory 16x16 для совместного использования 256 threads.", "מקצה אריח הפעלות ב-shared memory בגודל 16x16 לשימוש 256 threads."],
    [/^__shared__ float weight_tile/, "Allocates a 16x16 shared-memory weight tile to reduce global-memory reads.", "Выделяет плитку весов shared memory 16x16 для сокращения чтений global memory.", "מקצה אריח משקלים ב-shared memory בגודל 16x16 להפחתת קריאות מהזיכרון הגלובלי."],
    [/^const int output_tiles =/, "Rounds the output dimension to 16-column tiles with a guarded final partial tile.", "Разбивает выходную размерность на плитки по 16 столбцов с проверкой неполной последней плитки.", "מחלקת את ממד הפלט לאריחים בני 16 עמודות עם הגנה על האריח האחרון החלקי."],
    [/^const int row_tile =/, "Uses blockIdx.x to choose which 16-row tile of the matrix this CUDA block computes.", "Использует blockIdx.x, чтобы выбрать 16-строчную плитку матрицы, которую считает этот CUDA block.", "משתמשת ב-blockIdx.x כדי לבחור את אריח 16 השורות של המטריצה שבלוק CUDA זה מחשב."],
    [/^const int output_tile =/, "Uses the remainder of blockIdx.x to choose this block's 16-column output tile.", "Использует остаток blockIdx.x, чтобы выбрать 16-столбцовую выходную плитку данного block.", "משתמשת בשארית של blockIdx.x כדי לבחור את אריח הפלט בן 16 העמודות של הבלוק."],
    [/^const int local_row =/, "Takes threadIdx.x as this thread's row position inside the 16-row tile.", "Берёт threadIdx.x как позицию текущего thread внутри 16-строчной плитки.", "לוקחת את threadIdx.x כמיקום השורה של ה-thread בתוך אריח בן 16 שורות."],
    [/^const int local_output =/, "Takes threadIdx.y as this thread's output-column position inside the 16-column tile.", "Берёт threadIdx.y как позицию выходного столбца текущего thread внутри 16-столбцовой плитки.", "לוקחת את threadIdx.y כמיקום עמודת הפלט של ה-thread בתוך אריח בן 16 עמודות."],
    [/^const int row = row_tile/, "Combines the selected tile and local thread row into one global matrix row.", "Объединяет выбранную плитку и локальную строку thread в одну глобальную строку матрицы.", "מאחדת את האריח שנבחר ואת השורה המקומית של ה-thread לשורת מטריצה גלובלית אחת."],
    [/^const int output_channel =/, "Converts the output tile and local column into the global SFace output-channel index.", "Преобразует выходную плитку и локальный столбец в глобальный индекс выходного канала SFace.", "ממירה את אריח הפלט ואת העמודה המקומית לאינדקס ערוץ הפלט הגלובלי של SFace."],
    [/^const int output_dimension =/, "Converts the output tile and local column into one of the 128 embedding dimensions.", "Преобразует выходную плитку и локальный столбец в одно из 128 измерений embedding.", "ממירה את אריח הפלט ואת העמודה המקומית לאחד מ-128 ממדי ה-embedding."],
    [/^float sum = 0\.0f/, "Initializes this thread's dot-product accumulator.", "Обнуляет аккумулятор dot product текущего thread.", "מאתחלת את צובר המכפלה הפנימית של ה-thread."],
    [/^for \(int input_channel = 0;/, "Iterates over every input channel, so this output value combines all channels of the incoming feature map.", "Перебирает все входные каналы, поэтому это значение выхода объединяет все каналы входной карты признаков.", "עוברת על כל ערוצי הקלט, כך שערך הפלט הזה מאחד את כל ערוצי מפת המאפיינים הנכנסת."],
    [/^for \(int ky = 0; ky < 3;/, "Moves through the three rows of the 3x3 convolution window centered on this output pixel.", "Проходит по трём строкам окна свёртки 3x3, центрированного на этом выходном пикселе.", "עוברת על שלוש השורות של חלון הקונבולוציה 3x3 שממורכז בפיקסל הפלט הזה."],
    [/^const int source_y = y \+ ky - 1;/, "Converts the local kernel row into the matching input-image Y coordinate, including one-pixel padding.", "Преобразует локальную строку ядра в соответствующую координату Y входного изображения с отступом в один пиксель.", "ממירה את שורת הגרעין המקומית לקואורדינטת Y המתאימה בתמונת הקלט, כולל ריפוד של פיקסל אחד."],
    [/^const int source_y = y \* stride \+ ky - 1;/, "Calculates the depthwise input Y coordinate; stride selects the sampled position before the 3x3 offset is added.", "Вычисляет координату Y входа depthwise-свёртки: stride выбирает выборку, затем добавляется смещение окна 3x3.", "מחשבת את קואורדינטת Y של קלט depthwise: ה-stride בוחר את המיקום הנדגם ואז מתווסף היסט חלון 3x3."],
    [/^if \(source_y < 0 \|\| source_y >= (height|input_height)\) continue;/, "Skips this kernel row when it would read above or below the image instead of accessing invalid GPU memory.", "Пропускает строку ядра, если она вышла бы выше или ниже изображения, чтобы не читать недопустимую память GPU.", "מדלגת על שורת הגרעין כאשר היא הייתה קוראת מעל או מתחת לתמונה, במקום לגשת לזיכרון GPU לא תקין."],
    [/^for \(int kx = 0; kx < 3;/, "Moves through the three columns of the same 3x3 convolution window.", "Проходит по трём столбцам того же окна свёртки 3x3.", "עוברת על שלוש העמודות של אותו חלון קונבולוציה 3x3."],
    [/^const int source_x = x \+ kx - 1;/, "Converts the local kernel column into the matching input-image X coordinate, including one-pixel padding.", "Преобразует локальный столбец ядра в соответствующую координату X входного изображения с отступом в один пиксель.", "ממירה את עמודת הגרעין המקומית לקואורדינטת X המתאימה בתמונת הקלט, כולל ריפוד של פיקסל אחד."],
    [/^const int source_x = x \* stride \+ kx - 1;/, "Calculates the depthwise input X coordinate from the stride position and the 3x3 kernel offset.", "Вычисляет координату X входа depthwise-свёртки из позиции stride и смещения ядра 3x3.", "מחשבת את קואורדינטת X של קלט depthwise ממיקום ה-stride ומהיסט גרעין 3x3."],
    [/^if \(source_x < 0 \|\| source_x >= (width|input_width)\) continue;/, "Skips this kernel column at the left or right image edge, keeping every device-memory read in bounds.", "Пропускает столбец ядра на левом или правом краю изображения, оставляя каждое чтение device memory в пределах границ.", "מדלגת על עמודת גרעין בקצה השמאלי או הימני של התמונה, כך שכל קריאה מזיכרון ההתקן נשארת בגבולות."],
    [/^const std::size_t input_index =$/, "Begins building the flat NCHW address of the selected input activation.", "Начинает строить плоский NCHW-адрес выбранного входного признака.", "מתחילה לבנות את כתובת ה-NCHW השטוחה של ההפעלה שנבחרה בקלט."],
    [/^\(\(static_cast<std::size_t>\(image\) \* (input_channels|channels)/, "Continues the NCHW address: selects the batch image and feature channel before choosing its Y and X coordinates.", "Продолжает NCHW-адрес: выбирает изображение batch и канал признаков перед выбором координат Y и X.", "ממשיכה את כתובת ה-NCHW: בוחרת את תמונת האצווה ואת ערוץ המאפיין לפני בחירת קואורדינטות Y ו-X."],
    [/^const std::size_t weight_index =$/, "Begins building the address of the learned 3x3 filter weight for this output channel and input channel.", "Начинает строить адрес обученного веса фильтра 3x3 для этого выходного и входного канала.", "מתחילה לבנות את כתובת המשקל המאומן של מסנן 3x3 עבור ערוץ הפלט וערוץ הקלט האלה."],
    [/^\(\(static_cast<std::size_t>\(channel\) \* input_channels/, "Completes the convolution-weight address by selecting the channel pair and the current 3x3 window coefficient.", "Завершает адрес веса свёртки, выбирая пару каналов и текущий коэффициент окна 3x3.", "משלימה את כתובת משקל הקונבולוציה בבחירת צמד הערוצים ומקדם חלון 3x3 הנוכחי."],
    [/^sum \+= input\[input_index\] \* weights\[weight_index\];$/, "Multiplies one image value by its learned 3x3 weight and accumulates it into this output activation.", "Умножает одно значение изображения на соответствующий обученный вес 3x3 и добавляет результат в этот выходной признак.", "מכפילה ערך תמונה אחד במשקל 3x3 המאומן המתאים וצוברת את התוצאה בהפעלה הזאת בפלט."],
    [/^output\[index\] = activate\(sum, scale, shift, slope, channel\);$/, "Writes the completed convolution result after its learned BatchNorm and PReLU activation are applied.", "Записывает готовый результат свёртки после применения обученных BatchNorm и PReLU.", "כותבת את תוצאת הקונבולוציה המלאה לאחר החלת BatchNorm ו-PReLU המאומנים."],
    [/^for \(int start = 0;/, "Traverses the full K dimension in 16-value tiles; no trained weight is skipped.", "Проходит полную размерность K плитками по 16 значений; обученные веса не пропускаются.", "עוברת על כל ממד K באריחים בני 16 ערכים; אף משקל מאומן אינו מדולג."],
    [/^const int input_channel_for_a =|^const int input_for_a =/, "Selects the activation component loaded by this thread into the shared input tile.", "Выбирает компоненту признаков, которую этот thread загрузит в shared-плитку входа.", "בוחרת את רכיב ההפעלה שה-thread הזה יטען לאריח הקלט המשותף."],
    [/^const int input_channel_for_b =|^const int input_for_b =/, "Selects the learned-weight row loaded by this thread into the shared weight tile.", "Выбирает строку обученных весов, которую этот thread загрузит в shared-плитку весов.", "בוחרת את שורת המשקלים המאומנים שה-thread הזה יטען לאריח המשקלים המשותף."],
    [/^if \(row < rows|^if \(input_channel_for_b|^row < rows &&|^input_for_b </, "Guards a partial boundary tile before reading or writing device memory.", "Проверяет границу неполной плитки до чтения или записи device memory.", "בודקת את גבול האריח החלקי לפני קריאה או כתיבה בזיכרון ההתקן."],
    [/^const int image = row \/ spatial/, "Finds which image in the batch owns this flattened matrix row.", "Определяет, какому изображению batch принадлежит эта плоская строка матрицы.", "מוצאת לאיזו תמונה באצווה שייכת שורת המטריצה השטוחה הזאת."],
    [/^const int position = row % spatial/, "Finds the HxW position inside that image for this flattened matrix row.", "Определяет позицию HxW внутри этого изображения для плоской строки матрицы.", "מוצאת את מיקום HxW בתוך אותה תמונה עבור שורת המטריצה השטוחה."],
    [/^input_tile\[/, "Stores one guarded activation value in shared memory for reuse by the whole 16x16 block.", "Сохраняет одно проверенное значение признака в shared memory для повторного использования всем block 16x16.", "שומרת ערך הפעלה מוגן אחד ב-shared memory לשימוש חוזר של כל בלוק 16x16."],
    [/^weight_tile\[/, "Stores one guarded trained weight in shared memory for the tiled multiply-add loop.", "Сохраняет один проверенный обученный вес в shared memory для плиточного цикла multiply-add.", "שומרת משקל מאומן מוגן אחד ב-shared memory עבור לולאת ה-multiply-add המרוצפת."],
    [/^input\[|^transposed_weights\[/, "Reads the exact indexed activation or trained coefficient from device memory.", "Читает точно индексированный признак или обученный коэффициент из device memory.", "קוראת את ההפעלה או המקדם המאומן לפי האינדקס המדויק מזיכרון ההתקן."],
    [/^: 0\.0f|^.*= 0\.0f;$/, "Writes zero for an out-of-range element of the final partial tile.", "Записывает 0 для элемента за границей последней неполной плитки.", "כותבת אפס עבור איבר מחוץ לגבולות באריח האחרון החלקי."],
    [/^__syncthreads/, "Synchronizes all 256 threads before shared memory is consumed or reused.", "Синхронизирует 256 threads перед использованием или повторной записью shared memory.", "מסנכרנת את כל 256 ה-threads לפני שימוש או כתיבה מחדש ב-shared memory."],
    [/^#pragma unroll/, "Asks NVCC to unroll the fixed 16-step inner loop.", "Просит NVCC развернуть фиксированный внутренний цикл из 16 шагов.", "מבקשת מ-NVCC לפרוס את הלולאה הפנימית הקבועה בת 16 הצעדים."],
    [/^for \(int k = 0;/, "Runs 16 multiply-add operations for the current shared-memory tile.", "Выполняет 16 операций multiply-add для текущей плитки shared memory.", "מבצעת 16 פעולות multiply-add עבור אריח ה-shared memory הנוכחי."],
    [/^sum \+= input_tile/, "Performs the actual matrix multiply-add for one K element.", "Выполняет реальную операцию matrix multiply-add для одного элемента K.", "מבצעת בפועל פעולת matrix multiply-add עבור איבר K אחד."],
    [/^const std::size_t output_index|^\(static_cast<std::size_t>\(image\)/, "Calculates the contiguous NCHW address of this output element.", "Вычисляет непрерывный NCHW-адрес текущего элемента результата.", "מחשבת את כתובת NCHW הרציפה של איבר הפלט הנוכחי."],
    [/^output\[output_index\] = activate/, "Writes the dot product after fused trained BatchNorm and PReLU.", "Записывает dot product после объединённых обученных BatchNorm и PReLU.", "כותבת את המכפלה הפנימית לאחר BatchNorm ו-PReLU מאומנים ומאוחדים."],
    [/^const std::size_t index =/, "Builds the flat feature-tensor index assigned to this CUDA thread.", "Строит плоский индекс тензора признаков, назначенный этому CUDA thread.", "בונה את אינדקס טנזור המאפיינים השטוח שהוקצה ל-thread CUDA זה."],
    [/^if \(index >= total\) return/, "Stops threads whose flat index lies outside the final feature tensor.", "Останавливает threads, чей плоский индекс лежит за границей финального тензора признаков.", "עוצרת threads שהאינדקס השטוח שלהם נמצא מחוץ לטנזור המאפיינים הסופי."],
    [/^const int channel =/, "Recovers the feature channel that selects the matching BatchNorm scale and shift.", "Восстанавливает канал признаков, который выбирает соответствующие scale и shift BatchNorm.", "משחזרת את ערוץ המאפיינים שבוחר את ה-scale וה-shift המתאימים של BatchNorm."],
    [/^values\[index\] =/, "Applies the learned BatchNorm affine transform directly to this feature value.", "Применяет обученное affine-преобразование BatchNorm прямо к этому значению признака.", "מחילה את התמרת ה-affine המאומנת של BatchNorm ישירות על ערך המאפיין הזה."],
    [/^const float value = sum \+ bias|^output\[static_cast<std::size_t>\(row\)|^value \* scale\[output_dimension\]/, "Adds the trained bias and final BatchNorm, then writes one value of the Bx128 embedding matrix.", "Добавляет обученный bias и финальный BatchNorm, затем записывает одно значение матрицы embeddings Bx128.", "מוסיפה bias מאומן ו-BatchNorm סופי ואז כותבת ערך אחד במטריצת embeddings בגודל Bx128."],
    [/^__shared__ float sums/, "Allocates 256 shared partial sums for the L2-norm reduction of one face embedding.", "Выделяет 256 частичных сумм в shared memory для reduction L2-нормы одного embedding лица.", "מקצה 256 סכומים חלקיים ב-shared memory עבור reduction של נורמת L2 ל-embedding של פנים אחת."],
    [/^const int row = blockIdx.x/, "Assigns this CUDA block to one embedding row, therefore to one face in the batch.", "Назначает этот CUDA block одной строке embeddings, то есть одному лицу batch.", "מקצה את בלוק CUDA הזה לשורת embedding אחת, כלומר לפנים אחת באצווה."],
    [/^const int lane = threadIdx.x/, "Uses the thread lane as the worker index within this face's 256-thread norm reduction.", "Использует thread lane как индекс worker внутри 256-thread reduction нормы этого лица.", "משתמשת ב-thread lane כאינדקס worker בתוך reduction הנורמה בן 256 ה-threads של פנים אלה."],
    [/^for \(int dimension = lane|^const float value = embeddings|^sum \+= value \* value|^sums\[lane\] = sum/, "Distributes all 128 components across threads and accumulates their squared values.", "Распределяет 128 компонент между threads и накапливает их квадраты.", "מחלקת את 128 הרכיבים בין threads וצוברת את הערכים הריבועיים שלהם."],
    [/^for \(int width = blockDim.x \/ 2|^if \(lane < width\)/, "Reduces the shared partial sums until lane 0 contains the complete squared norm.", "Выполняет reduction частичных сумм, пока lane 0 не получит полную сумму квадратов.", "מבצעת reduction של הסכומים החלקיים עד ש-lane 0 מחזיק את סכום הריבועים המלא."],
    [/^const float inverse_norm =/, "Calculates 1/sqrt(sum of squares) on the GPU with zero protection.", "Вычисляет на GPU 1/sqrt(sum of squares) с защитой от нуля.", "מחשבת ב-GPU את 1/sqrt(sum of squares) עם הגנה מאפס."],
    [/^embeddings\[/, "Multiplies one component by the shared inverse norm, producing a unit-length vector.", "Умножает компоненту на общую обратную норму и получает единичный вектор.", "כופלת רכיב אחד בנורמה ההפוכה המשותפת ויוצרת וקטור באורך יחידה."],
    [/^\} else \{$/, "Selects the boundary branch that substitutes zero instead of reading outside the matrix.", "Выбирает граничную ветку, подставляющую 0 вместо чтения за пределами матрицы.", "בוחרת בענף הגבול שמציב אפס במקום לקרוא מחוץ למטריצה."],
    [/^\}$/, `Closes the scope that follows \`${previous}\` in ${kernel}.`, `Закрывает область после \`${previous}\` в ${kernel}.`, `סוגרת את התחום שאחרי \`${previous}\` בתוך ${kernel}.`]
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  if (match) return say(match[1], match[2], match[3]);
  return say(
    `Completes the adjacent indexed CUDA expression in ${kernel}; the visible operands define the exact memory address or arithmetic term and no library inference is hidden here.`,
    `Завершает соседнее индексированное CUDA-выражение в ${kernel}; видимые операнды задают точный адрес памяти или арифметический член, библиотечный inference здесь не скрыт.`,
    `משלימה את ביטוי CUDA המאונדקס הסמוך ב-${kernel}; האופרנדים הגלויים מגדירים כתובת זיכרון או איבר אריתמטי מדויק ואין כאן inference מוסתר של ספרייה.`
  );
}

function uniqueManualSfaceSourceAnnotation(lines, index) {
  const annotation = manualSfaceSourceAnnotation(lines, index);
  if (!annotation) return "";
  for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
    if (manualSfaceSourceAnnotation(lines, previousIndex) === annotation) return "";
  }
  return annotation;
}

function codeAnnotation(stage, line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  if (stage?.variantKey === "single") {
    const nativeExact = nativeShortCodeAnnotations[trimmed];
    if (nativeExact) return repairLocalizedText(nativeExact[lang] || nativeExact.en);
    return contextualNativeSourceAnnotation([line], 0);
  }
  if (!trimmed) return repairLocalizedText(codeBlankAnnotation[lang] || codeBlankAnnotation.en);
  const exact = detailedCodeLineAnnotations[trimmed];
  if (exact) return repairLocalizedText(exact[lang] || exact.en);
  return patternCodeAnnotation(line);
}

function uiText(key) {
  const lang = document.documentElement.lang || "en";
  return repairLocalizedText(detailUi[lang]?.[key] || translations[lang]?.[key] || detailUi.en[key] || translations.en[key] || key);
}

function usesLegacyStageInspector(stage) {
  return stage?.variantKey !== "single";
}

function nativeStageFiveCodeRange(lines, stepIndex) {
  if (lines.length < 75) return { start: -1, end: -1 };
  const ranges = [
    { start: 7, end: 11 },
    { start: 13, end: 20 },
    { start: 21, end: 25 },
    { start: 26, end: 31 },
    { start: 34, end: 40 },
    { start: 41, end: 47 },
    { start: 48, end: 50 },
    { start: 52, end: 55 },
    { start: 56, end: 57 },
    { start: 58, end: 60 },
    { start: 61, end: 63 },
    { start: 64, end: 67 },
    { start: 68, end: 73 }
  ];
  return ranges[stepIndex] || { start: -1, end: -1 };
}

function manualSfaceStageCodeRanges(lines, stepIndex) {
  const find = (pattern, from = 0) => lines.findIndex((line, index) => index >= from && pattern.test(line.trim()));
  const single = (pattern, from = 0) => {
    const index = find(pattern, from);
    return { start: index, end: index };
  };
  const before = (pattern, from = 0) => {
    const index = find(pattern, from);
    return index < 0 ? -1 : index - 1;
  };
  const span = (startPattern, endPattern) => {
    const start = find(startPattern);
    const end = before(endPattern, Math.max(0, start + 1));
    return { start, end };
  };
  const inclusive = (startPattern, endPattern) => {
    const start = find(startPattern);
    const end = find(endPattern, Math.max(0, start));
    return { start, end };
  };
  const ranges = [
    () => [
      span(/^std::unordered_map<std::string, HostTensor> load_weight_file/, /^const HostTensor& tensor/),
      span(/^float\* upload\(/, /^std::vector<float> transpose_weights/),
      span(/^DeviceLayer make_layer\(/, /^ManualSFaceCudaContext\* create_manual_sface_cuda/),
      span(/^ManualSFaceCudaContext\* create_manual_sface_cuda/, /^void destroy_manual_sface_cuda/)
    ],
    () => [span(/^std::vector<float> manual_sface_cuda_forward\(/, /^constexpr int threads/)],
    () => [
      span(/^__global__ void preprocess_kernel/, /^__global__ void standard_conv3x3_kernel/),
      inclusive(/^preprocess_kernel<</, /^check_cuda\(cudaGetLastError\(\), "manual SFace preprocess kernel"\);/)
    ],
    () => [
      span(/^__global__ void standard_conv3x3_kernel/, /^__global__ void depthwise_conv3x3_kernel/),
      span(/^standard_conv3x3_kernel<</, /^\} else if \(layer\.kind == DeviceLayer::Kind::Depthwise3x3\)/)
    ],
    () => [
      single(/^constexpr int threads = 256;/),
      (() => {
        const start = find(/^for \(const auto& layer : context->layers\)/, find(/^float\* output = second;/) + 1);
        const end = find(/^check_cuda\(cudaGetLastError\(\), "manual SFace layer kernel"\);/, Math.max(0, start));
        return { start, end };
      })(),
      span(/^__global__ void depthwise_conv3x3_kernel/, /^__global__ void pointwise_gemm_kernel/),
      span(/^__global__ void pointwise_gemm_kernel/, /^__global__ void affine_in_place_kernel/)
    ],
    () => [
      span(/^__global__ void affine_in_place_kernel/, /^__global__ void fully_connected_kernel/),
      inclusive(/^affine_in_place_kernel<</, /^check_cuda\(cudaGetLastError\(\), "manual SFace final feature BatchNorm kernel"\);/)
    ],
    () => [
      span(/^__global__ void fully_connected_kernel/, /^__global__ void normalize_embeddings_kernel/),
      inclusive(/^fully_connected_kernel<</, /^check_cuda\(cudaGetLastError\(\), "manual SFace fully connected kernel"\);/)
    ],
    () => [
      span(/^__global__ void normalize_embeddings_kernel/, /^struct ManualSFaceCudaContext/),
      inclusive(/^normalize_embeddings_kernel<</, /^check_cuda\(cudaGetLastError\(\), "manual SFace normalization kernel"\);/)
    ],
    () => [span(/^std::vector<float> result\(/, /^cudaFree\(embeddings\);/)]
  ];
  const selected = ranges[stepIndex]?.() || [];
  return selected.filter((range) => range.start >= 0 && range.end >= range.start);
}

async function focusManualSfaceStageCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  const stage = stageDetails[currentStageIndex];
  if (!ready || stage?.level !== "05" || usesLegacyStageInspector(stage)) return;
  const lines = stage.exactCode.split("\n");
  const ranges = manualSfaceStageCodeRanges(lines, stepIndex);
  const executionRange = ranges.find((range) => /^for \(const auto& layer : context->layers\)/.test(lines[range.start]?.trim() || ""));
  if (!renderFocusedStageSource(stage, ranges, stepIndex, shouldScroll, executionRange?.start)) {
    console.error(`Could not resolve manual SFace stage 05 code ranges for step ${stepIndex + 1}`);
    stageCodeSource.textContent = uiText("fullStageError");
  }
}

async function focusNativeStageFiveCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  const stage = stageDetails[currentStageIndex];
  if (!ready || stage?.level !== "06" || usesLegacyStageInspector(stage)) return;
  const range = nativeStageFiveCodeRange(stage.exactCode.split("\n"), stepIndex);
  if (!renderFocusedStageSource(stage, range, stepIndex, shouldScroll)) {
    console.error(`Could not resolve native stage 06 code range for step ${stepIndex + 1}`);
    stageCodeSource.textContent = uiText("fullStageError");
  }
}

function renderStageFiveFullCode(stage, focusStart = -1, focusEnd = -1, shouldScroll = false) {
  const lang = document.documentElement.lang || "en";
  stageCode.innerHTML = "";
  stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  stageCode.classList.add("full-code", "stage-five-complete");
  stageCodeModeButton.textContent = uiText("showShortCode");
  stageCodeSource.textContent = `${uiText("stageFiveFullSource")} · 92`;

  const renderedRows = new Map();
  sfaceOnnxAllRows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "code-line-note onnx-source-line";
    row.dataset.onnxLayer = String(item.layer);
    const code = document.createElement("code");
    code.textContent = sfaceOnnxListingLine(item);
    const note = document.createElement("span");
    note.className = "code-note";
    note.textContent = sfaceOnnxLineAnnotation(item);
    row.append(code, note);
    if (item.layer >= focusStart && item.layer <= focusEnd) row.classList.add("code-focus");
    if (item.layer === focusStart) row.classList.add("code-focus-start");
    if (item.layer === focusEnd) row.classList.add("code-focus-end");
    renderedRows.set(item.layer, row);
    stageCode.appendChild(row);
  });

  const firstFocused = renderedRows.get(focusStart);
  if (firstFocused) {
    requestAnimationFrame(() => {
      stageCode.scrollTop = Math.max(0, firstFocused.offsetTop - stageCode.offsetTop - 18);
      if (shouldScroll) stageCode.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

function stageSixSources() {
  return [
    { key: "score", stage: stageDetails[4], lines: (stageDetails[4].exactCode || "").split("\n") },
    { key: "verify", stage: stageDetails[5], lines: (stageDetails[5].exactCode || "").split("\n") }
  ];
}

function renderStageSixFullCode(focus = null, shouldScroll = false) {
  const lang = document.documentElement.lang || "en";
  stageCode.innerHTML = "";
  stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  stageCode.classList.add("full-code", "stage-six-complete");
  stageCodeModeButton.textContent = uiText("showShortCode");
  const sources = stageSixSources();
  const count = sources.reduce((sum, source) => sum + source.lines.length, 0);
  stageCodeSource.textContent = `${uiText("stageSixFullSource")} · ${uiText("lineCount").replace("{count}", String(count))}`;
  let firstFocused = null;
  sources.forEach((source, sourceIndex) => {
    const boundary = document.createElement("div");
    boundary.className = "code-line-note code-boundary";
    const boundaryCode = document.createElement("code");
    boundaryCode.textContent = source.key === "score"
      ? "# --- CUDA reference scoring: 128D vectors -> score/index matrices ---"
      : "# --- verifier orchestration: call scorer -> choose identity -> return result ---";
    const boundaryNote = document.createElement("span");
    boundaryNote.className = "code-note";
    boundaryNote.textContent = source.key === "score"
      ? (lang === "ru" ? "Точный вспомогательный блок CUDA-сравнения векторов с эталонами." : lang === "he" ? "בלוק העזר המדויק להשוואת וקטורים לייחוסים ב-CUDA." : "Exact CUDA helper that compares embeddings with reference vectors.")
      : (lang === "ru" ? "Точный вызывающий код: получает оценки, выбирает личность и собирает ответ." : lang === "he" ? "הקוד הקורא המדויק: מקבל ציונים, בוחר זהות ובונה את התוצאה." : "Exact caller: receives scores, selects the identity, and builds the result.");
    boundary.append(boundaryCode, boundaryNote);
    stageCode.appendChild(boundary);
    source.lines.forEach((line, index) => {
      const row = document.createElement("div");
      row.className = `code-line-note${line.trim() ? "" : " blank"}`;
      row.dataset.sourceSection = source.key;
      row.dataset.sourceLine = String(index + 1);
      const code = document.createElement("code");
      code.textContent = line || " ";
      const note = document.createElement("span");
      note.className = "code-note";
      const annotationLines = combinedRecognitionCode ? combinedRecognitionCode.split("\n") : source.lines;
      const annotationIndex = combinedRecognitionCode ? (source.stage.exactStartLine || 0) + index : index;
      note.textContent = source.stage?.variantKey === "single"
        ? contextualNativeSourceAnnotation(annotationLines, annotationIndex)
        : contextualSingleSourceAnnotation(annotationLines, annotationIndex);
      row.append(code, note);
      if (focus?.section === source.key && index >= focus.start && index <= focus.end) {
        row.classList.add("code-focus");
        if (!firstFocused) firstFocused = row;
      }
      if (focus?.section === source.key && index === focus.start) row.classList.add("code-focus-start");
      if (focus?.section === source.key && index === focus.end) row.classList.add("code-focus-end");
      stageCode.appendChild(row);
    });
    if (sourceIndex < sources.length - 1) boundary.classList.add("section-start");
  });
  if (firstFocused) requestAnimationFrame(() => {
    stageCode.scrollTop = Math.max(0, firstFocused.offsetTop - stageCode.offsetTop - 18);
    if (shouldScroll) stageCode.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderStageCode(stage) {
  stageCode.innerHTML = "";
  const lang = document.documentElement.lang || "en";
  const requestedFullMode = stageCodeMode === "full";
  if (stage.level === "05" && requestedFullMode && usesLegacyStageInspector(stage)) {
    renderStageFiveFullCode(stage);
    return;
  }
  if (stage.level === "06" && requestedFullMode && usesLegacyStageInspector(stage) && stageDetails[4]?.exactCode && stage.exactCode) {
    renderStageSixFullCode();
    return;
  }
  const fullMode = requestedFullMode && Boolean(stage.exactCode);
  if (requestedFullMode && !stage.exactCode) {
    stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
    stageCode.classList.add("full-code");
    if (stageCodeSource) {
      stageCodeSource.textContent = uiText(exactStageCodeState === "error" ? "fullStageError" : "fullStageLoading");
    }
    const row = document.createElement("div");
    row.className = "code-line-note";
    const code = document.createElement("code");
    code.textContent = uiText(exactStageCodeState === "error" ? "fullStageError" : "fullStageLoading");
    const note = document.createElement("span");
    note.className = "code-note";
    note.textContent = "";
    row.append(code, note);
    stageCode.appendChild(row);
    return;
  }
  const source = fullMode ? stage.exactCode : stage.code;
  const diagramLabels = localized(stage.diagram);
  const selectedStep = Array.isArray(diagramLabels) && activeStageFiveCodeStep >= 0
    ? Math.max(0, Math.min(diagramLabels.length - 1, activeStageFiveCodeStep))
    : -1;
  stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  stageCode.classList.toggle("full-code", Boolean(fullMode));
  if (stageCodeModeButton) {
    stageCodeModeButton.textContent = uiText(requestedFullMode ? "showShortCode" : stage.level === "05" && usesLegacyStageInspector(stage) ? "stageFiveOpenFull" : "openFullCode");
  }
  if (stageCodeSource) {
    const selectedLabel = selectedStep >= 0 ? ` · ${selectedStep + 1}. ${diagramLabels[selectedStep]}` : "";
    stageCodeSource.textContent = fullMode
      ? `${uiText("fullStageExact")} · ${uiText("lineCount").replace("{count}", String(stage.exactLineCount || codeLineCount(stage.exactCode)))}${selectedLabel}`
      : requestedFullMode
        ? uiText(exactStageCodeState === "error" ? "fullStageError" : "fullStageLoading")
        : `${uiText("codeSourceShort")}${selectedLabel}`;
  }
  const sourceLines = source.split("\n");
  const focusStart = selectedStep >= 0 && diagramLabels.length
    ? Math.min(sourceLines.length - 1, Math.floor((selectedStep * sourceLines.length) / diagramLabels.length))
    : -1;
  const focusEnd = selectedStep >= 0 && diagramLabels.length
    ? Math.max(focusStart, Math.min(sourceLines.length - 1, Math.floor(((selectedStep + 1) * sourceLines.length) / diagramLabels.length) - 1))
    : -1;
  sourceLines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    if (index >= focusStart && index <= focusEnd) row.classList.add("code-focus");
    if (index === focusStart) row.classList.add("code-focus-start");
    if (index === focusEnd) row.classList.add("code-focus-end");
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    const annotationLines = fullMode && combinedRecognitionCode ? combinedRecognitionCode.split("\n") : sourceLines;
    const annotationIndex = fullMode ? (stage.exactStartLine || 0) + index : index;
    const manualAnnotation = stage?.level === "05" && !usesLegacyStageInspector(stage)
      ? manualSfaceSourceAnnotation(sourceLines, index)
      : "";
    note.textContent = manualAnnotation
      ? manualAnnotation
      : fullMode
        ? stage?.variantKey === "single"
          ? contextualNativeSourceAnnotation(annotationLines, annotationIndex)
          : contextualSingleSourceAnnotation(annotationLines, annotationIndex)
        : codeAnnotation(stage, line);
    row.append(code, note);
    stageCode.appendChild(row);
  });
}

function scrollStageCodeToFocused(shouldScroll = true) {
  const firstFocused = stageCode.querySelector(".code-focus");
  if (!firstFocused) return false;
  requestAnimationFrame(() => {
    stageCode.scrollTop = Math.max(0, firstFocused.offsetTop - stageCode.offsetTop - 18);
    if (shouldScroll) stageCode.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return true;
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
    const sourceTexts = await Promise.all(currentRuntimeStageSources.map(async (source) => {
      const paths = source.paths || [source.path];
      return Promise.all(paths.map(async (path) => {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
        return response.text();
      }));
    }));
    detectorSourceLoaded = true;
    const normalizedFiles = sourceTexts.map((sources) => sources.flatMap((source) => {
      const lines = source.replace(/\r\n/g, "\n").split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      return lines;
    }));
    const lineBlocks = currentRuntimeStageSources.map((source, index) => {
      const lines = normalizedFiles[index];
      const findBoundary = (pattern, fallback, label) => {
        if (!pattern) return fallback;
        const expression = new RegExp(pattern);
        const found = lines.findIndex((line) => expression.test(line));
        if (found < 0) throw new Error(`missing ${label} boundary ${pattern} in ${source.path}`);
        return found;
      };
      const from = findBoundary(source.fromMatch, source.from || 0, "start");
      const to = findBoundary(source.toMatch, source.to == null ? lines.length : source.to, "end");
      if (to <= from) throw new Error(`invalid source boundaries in ${source.path}: ${from}..${to}`);
      return lines.slice(from, to);
    });
    if (lineBlocks.length !== stageDetails.length) {
      throw new Error(`expected ${stageDetails.length} stage blocks, found ${lineBlocks.length}`);
    }
    let exactStartLine = 0;
    lineBlocks.forEach((lines, index) => {
      stageDetails[index].exactCode = lines.join("\n");
      stageDetails[index].exactLineCount = lines.length;
      stageDetails[index].exactStartLine = exactStartLine;
      exactStartLine += lines.length;
    });
    const combinedLines = lineBlocks.flat();
    stageRecognitionLineCount = lineBlocks.reduce((total, lines) => total + lines.length, 0);
    combinedRecognitionCode = combinedLines.join("\n");
    detectorSourceText = combinedRecognitionCode;
    combinedRecognitionLineCount = codeLineCount(combinedRecognitionCode);
    if (combinedRecognitionLineCount !== stageRecognitionLineCount) {
      throw new Error(
        `combined recognition line count ${combinedRecognitionLineCount} does not equal stage sum ${stageRecognitionLineCount}`
      );
    }
    if (combinedLines.join("\n") !== detectorSourceText) {
      throw new Error("the combined stage text is not identical to the loaded CUDA source blocks");
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
  const sourceLines = extractDetectorSource(source).split("\n");
  sourceLines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    note.textContent = activeDetectorVariant === "single"
      ? contextualNativeSourceAnnotation(sourceLines, index)
      : contextualSingleSourceAnnotation(sourceLines, index);
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

function matchingLineIndex(lines, text, occurrence = 0) {
  let found = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== text) continue;
    if (found === occurrence) return index;
    found += 1;
  }
  return -1;
}

function stageFiveCodeRange(lines, stepIndex) {
  const single = (text, occurrence = 0) => {
    const index = matchingLineIndex(lines, text, occurrence);
    return { start: index, end: index };
  };
  const span = (startText, endText, endOccurrence = 0) => ({
    start: matchingLineIndex(lines, startText),
    end: matchingLineIndex(lines, endText, endOccurrence)
  });
  const ranges = [
    () => single("def _score_vectors_cuda(self, vectors):"),
    () => single("torch = self._torch"),
    () => single("references = self._cuda_reference_vectors"),
    () => span("if torch is None or references is None:", 'raise RuntimeError("CUDA reference vectors are not initialized")'),
    () => single("import torch.nn.functional as functional"),
    () => single("normalized = functional.normalize(vectors.float(), dim=1)"),
    () => span("label_scores = []", "label_matches = []"),
    () => single("for label in self.labels:"),
    () => single("similarities = normalized @ references[label].transpose(0, 1)"),
    () => single("scores, indices = similarities.max(dim=1)"),
    () => single("label_scores.append(scores)"),
    () => single("label_matches.append(indices)"),
    () => single("return torch.stack(label_scores, dim=1), torch.stack(label_matches, dim=1)")
  ];
  return ranges[stepIndex]?.() || { start: -1, end: -1 };
}

function renderFocusedStageFiveSource(stepIndex, shouldScroll = true) {
  const stage = stageDetails[currentStageIndex];
  if (!stage?.exactCode) return false;
  const sourceLines = stage.exactCode.split("\n");
  const range = stageFiveCodeRange(sourceLines, stepIndex);
  if (range.start < 0 || range.end < range.start) {
    console.error(`Could not resolve stage 05 code range for step ${stepIndex + 1}`);
    return false;
  }

  stageCodeMode = "full";
  stageCode.innerHTML = "";
  stageCode.setAttribute("dir", (document.documentElement.lang || "en") === "he" ? "rtl" : "ltr");
  stageCode.classList.add("full-code", "focused-source");
  stageCodeModeButton.textContent = uiText("showShortCode");
  stageCodeSource.textContent = uiText("focusedCodeSource")
    .replace("{start}", String(range.start + 1))
    .replace("{end}", String(range.end + 1));

  const rows = [];
  sourceLines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    row.dataset.sourceLine = String(index + 1);
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    const annotationLines = combinedRecognitionCode ? combinedRecognitionCode.split("\n") : sourceLines;
    const annotationIndex = combinedRecognitionCode ? (stage.exactStartLine || 0) + index : index;
    note.textContent = stage?.variantKey === "single"
      ? contextualNativeSourceAnnotation(annotationLines, annotationIndex)
      : contextualSingleSourceAnnotation(annotationLines, annotationIndex);
    row.append(code, note);
    if (index >= range.start && index <= range.end) row.classList.add("code-focus");
    if (index === range.start) row.classList.add("code-focus-start");
    if (index === range.end) row.classList.add("code-focus-end");
    rows.push(row);
    stageCode.appendChild(row);
  });

  activeStageFiveCodeStep = stepIndex;
  document.querySelectorAll(".diagram-node.code-linked").forEach((node) => {
    const selected = Number(node.dataset.codeStep) === stepIndex;
    node.classList.toggle("code-active", selected);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
  });

  const firstRow = rows[range.start];
  if (firstRow) {
    requestAnimationFrame(() => {
      stageCode.scrollTop = Math.max(0, firstRow.offsetTop - stageCode.offsetTop - 18);
      if (shouldScroll) stageCode.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  return true;
}

async function focusStageFiveCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  if (currentStageIndex < 0 || stageDetails[currentStageIndex]?.level !== "05") return;
  if (!ready || !renderFocusedStageFiveSource(stepIndex, shouldScroll)) {
    stageCodeSource.textContent = uiText("fullStageError");
  }
}

function stageOneCodeRange(lines, stepIndex) {
  const find = (text, from = 0) => lines.findIndex((line, index) => index >= from && line.trim() === text);
  const before = (text, from = 0) => {
    const index = find(text, from);
    return index < 0 ? -1 : index - 1;
  };
  const ranges = [
    () => ({
      start: find('yunet = self.model_root / "face_detection_yunet_2023mar.onnx"'),
      end: find('raise RuntimeError(f"SFace models are missing in {self.model_root}")')
    }),
    () => {
      const start = find("model = onnx.load(str(model_path))", find("def _create_cuda_session(self, model_path: Path, *, use_fp16: bool):"));
      return { start, end: before("options = ort.SessionOptions()", start) };
    },
    () => {
      const method = find("def _create_cuda_session(self, model_path: Path, *, use_fp16: bool):");
      return { start: find("options = ort.SessionOptions()", method), end: find("return session", method) };
    },
    () => {
      const method = find("def _create_cuda_yunet_session(self, model_path: Path, *, use_fp16: bool):");
      const start = find("model = onnx.load(str(model_path))", method);
      return { start, end: before("options = ort.SessionOptions()", start) };
    },
    () => {
      const method = find("def _create_cuda_yunet_session(self, model_path: Path, *, use_fp16: bool):");
      return { start: find("options = ort.SessionOptions()", method), end: find("return session", method) };
    },
    () => ({
      start: find("def _initialize_cuda_pipeline(self) -> None:"),
      end: before("def _run_ort_cuda(self, session, input_tensor, output_names: list[str] | None = None):")
    })
  ];
  return ranges[stepIndex]?.() || { start: -1, end: -1 };
}

function genericStageCodeRange(stageLevel, lines, stepIndex) {
  const findIncludes = (text, from = 0) => lines.findIndex((line, index) => index >= from && line.includes(text));
  const findTrimmed = (text, from = 0) => lines.findIndex((line, index) => index >= from && line.trim() === text);
  if (stageLevel === "02") {
    const starts = [
      findTrimmed("prepared: list = []"),
      findTrimmed("height, width = image.shape[:2]"),
      findIncludes("tensor = torch.from_numpy("),
      findTrimmed("tensor = tensor.permute(2, 0, 1).unsqueeze(0).float()")
    ];
    const ends = [
      findTrimmed("for image in images:"),
      findTrimmed("content_height = max(32, int(round(height * scale)))"),
      findIncludes('non_blocking=False)'),
      findTrimmed("return batch.contiguous(), sizes")
    ];
    return { start: starts[stepIndex], end: ends[stepIndex] };
  }
  if (stageLevel === "03") {
    const starts = [findTrimmed("face_levels = []"), findTrimmed("for level, stride in enumerate(YUNET_STRIDES):"), findTrimmed("faces = torch.cat(face_levels, dim=1)"), findTrimmed("candidate_mask = scores >= 0.55")];
    const ends = [findTrimmed("score_levels = []"), findTrimmed("score_levels.append(scores)"), findTrimmed("face_rank = faces[..., 2] * faces[..., 3] * (1.25 - centre_offset).clamp_min_(0.25)"), findTrimmed("return selected_faces, valid_mask")];
    return { start: starts[stepIndex], end: ends[stepIndex] };
  }
  if (stageLevel === "04") {
    const starts = [findIncludes("source = faces[:, 4:14]"), findTrimmed("source_mean = source.mean(dim=1, keepdim=True)"), findTrimmed("inverse_linear = torch.linalg.inv(linear)"), findTrimmed("aligned = functional.grid_sample(")];
    const ends = [findIncludes(".unsqueeze(0).expand(source.shape[0], -1, -1)"), findTrimmed("translation = destination_mean.squeeze(1) - (linear @ source_mean.transpose(1, 2)).squeeze(2)"), findTrimmed(").reshape(-1, 112, 112, 2)"), findTrimmed("return aligned[:, [2, 1, 0]].contiguous()")];
    return { start: starts[stepIndex], end: ends[stepIndex] };
  }
  return { start: -1, end: -1 };
}

function renderFocusedStageSource(stage, range, stepIndex, shouldScroll = true, scrollTargetIndex = null) {
  const ranges = (Array.isArray(range) ? range : [range]).filter((item) => item && item.start >= 0 && item.end >= item.start);
  if (!stage?.exactCode || ranges.length === 0) return false;
  const sourceLines = stage.exactCode.split("\n");
  const firstFocusedIndex = Math.min(...ranges.map((item) => item.start));
  const lastFocusedIndex = Math.max(...ranges.map((item) => item.end));
  const isFocused = (index) => ranges.some((item) => index >= item.start && index <= item.end);
  const isFocusStart = (index) => ranges.some((item) => index === item.start);
  const isFocusEnd = (index) => ranges.some((item) => index === item.end);
  const scrollIndex = Number.isInteger(scrollTargetIndex) && isFocused(scrollTargetIndex)
    ? scrollTargetIndex
    : firstFocusedIndex;
  const firstConvStart = sourceLines.findIndex((line) => /^__global__ void standard_conv3x3_kernel/.test(line.trim()));
  const firstConvEnd = sourceLines.findIndex((line, index) => index > firstConvStart && /^__global__ void depthwise_conv3x3_kernel/.test(line.trim()));
  const firstConvLaunchStart = sourceLines.findIndex((line) => /^standard_conv3x3_kernel<</.test(line.trim()));
  const firstConvLaunchEnd = sourceLines.findIndex((line, index) => index >= firstConvLaunchStart && /^\} else if \(layer\.kind == DeviceLayer::Kind::Depthwise3x3\)/.test(line.trim()));
  const isFirstConvExecutionLine = (line, index) => {
    if (stage.level !== "05" || stepIndex !== 3) return false;
    if (index >= firstConvLaunchStart && index < firstConvLaunchEnd) return true;
    if (index <= firstConvStart || index >= firstConvEnd) return false;
    return /^for \(int input_channel = 0;|^for \(int ky = 0;|^for \(int kx = 0;|^sum \+= input\[input_index\] \* weights\[weight_index\];$/.test(line.trim());
  };
  stageCodeMode = "full";
  stageCode.innerHTML = "";
  stageCode.setAttribute("dir", (document.documentElement.lang || "en") === "he" ? "rtl" : "ltr");
  stageCode.classList.add("full-code", "focused-source");
  stageCodeModeButton.textContent = uiText("showShortCode");
  stageCodeSource.textContent = uiText("focusedCodeSource")
    .replace("{start}", String(firstFocusedIndex + 1))
    .replace("{end}", String(lastFocusedIndex + 1));
  const rows = [];
  sourceLines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `code-line-note${line.trim() ? "" : " blank"}`;
    row.dataset.sourceLine = String(index + 1);
    const code = document.createElement("code");
    code.textContent = line || " ";
    const note = document.createElement("span");
    note.className = "code-note";
    const annotationLines = combinedRecognitionCode ? combinedRecognitionCode.split("\n") : sourceLines;
    const annotationIndex = combinedRecognitionCode ? (stage.exactStartLine || 0) + index : index;
    const manualAnnotation = stage?.level === "05" && !usesLegacyStageInspector(stage)
      ? manualSfaceSourceAnnotation(sourceLines, index)
      : "";
    note.textContent = manualAnnotation
      ? manualAnnotation
      : stage?.variantKey === "single"
        ? contextualNativeSourceAnnotation(annotationLines, annotationIndex)
        : contextualSingleSourceAnnotation(annotationLines, annotationIndex);
    row.append(code, note);
    if (isFocused(index)) row.classList.add("code-focus");
    if (isFirstConvExecutionLine(line, index)) row.classList.add("code-focus-primary");
    if (isFocusStart(index)) row.classList.add("code-focus-start");
    if (isFocusEnd(index)) row.classList.add("code-focus-end");
    rows.push(row);
    stageCode.appendChild(row);
  });
  activeStageFiveCodeStep = stepIndex;
  document.querySelectorAll(".diagram-node.code-linked").forEach((node) => {
    const selected = Number(node.dataset.codeStep) === stepIndex;
    node.classList.toggle("code-active", selected);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  const firstRow = rows[scrollIndex];
  if (firstRow) requestAnimationFrame(() => {
    stageCode.scrollTop = Math.max(0, firstRow.offsetTop - stageCode.offsetTop - 18);
    if (shouldScroll) stageCode.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return true;
}

async function focusStageOneCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  const stage = stageDetails[currentStageIndex];
  if (!ready || stage?.level !== "01") return;
  const range = stageOneCodeRange(stage.exactCode.split("\n"), stepIndex);
  if (!renderFocusedStageSource(stage, range, stepIndex, shouldScroll)) {
    console.error(`Could not resolve stage 01 code range for step ${stepIndex + 1}`);
    stageCodeSource.textContent = uiText("fullStageError");
  }
}

async function focusGenericStageCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  const stage = stageDetails[currentStageIndex];
  if (!ready || !["02", "03", "04"].includes(stage?.level)) return;
  const range = genericStageCodeRange(stage.level, stage.exactCode.split("\n"), stepIndex);
  if (!renderFocusedStageSource(stage, range, stepIndex, shouldScroll)) {
    console.error(`Could not resolve stage ${stage.level} code range for step ${stepIndex + 1}`);
    stageCodeSource.textContent = uiText("fullStageError");
  }
}

function stageSixCodeRange(stepIndex) {
  const sources = stageSixSources();
  const score = sources[0].lines;
  const verify = sources[1].lines;
  const find = (lines, text, from = 0) => lines.findIndex((line, index) => index >= from && line.trim() === text);
  const scoreRange = (startText, endText = startText) => ({
    section: "score",
    start: find(score, startText),
    end: find(score, endText, Math.max(0, find(score, startText)))
  });
  const verifyRange = (startText, endText = startText) => ({
    section: "verify",
    start: find(verify, startText),
    end: find(verify, endText, Math.max(0, find(verify, startText)))
  });
  const resultStart = find(verify, "results[index] = {");
  const resultEnd = resultStart < 0 ? -1 : find(verify, "}", resultStart);
  const finalReturn = find(verify, "return {", resultEnd + 1);
  const finalEnd = finalReturn < 0 ? -1 : find(verify, "}", finalReturn);
  const ranges = [
    () => scoreRange("def _score_vectors_cuda(self, vectors):", 'raise RuntimeError("CUDA reference vectors are not initialized")'),
    () => scoreRange("import torch.nn.functional as functional", "normalized = functional.normalize(vectors.float(), dim=1)"),
    () => scoreRange("label_scores = []", "for label in self.labels:"),
    () => scoreRange("similarities = normalized @ references[label].transpose(0, 1)"),
    () => scoreRange("scores, indices = similarities.max(dim=1)", "label_matches.append(indices)"),
    () => scoreRange("return torch.stack(label_scores, dim=1), torch.stack(label_matches, dim=1)"),
    () => verifyRange("score_started = time.perf_counter()", "gpu_score_ms = (time.perf_counter() - score_started) * 1000.0"),
    () => verifyRange("valid_flags = valid_mask.cpu().tolist()", "del vectors, score_matrix, match_matrix, valid_mask"),
    () => verifyRange("scores = {label: float(score_values[index, label_index]) for label_index, label in enumerate(self.labels)}", "best_label_index = self.labels.index(best)"),
    () => ({ section: "verify", start: find(verify, "reference_index = int(match_values[index, best_label_index])"), end: resultEnd }),
    () => ({ section: "verify", start: finalReturn, end: finalEnd })
  ];
  return ranges[stepIndex]?.() || { section: "score", start: -1, end: -1 };
}

async function focusStageSixCode(stepIndex, shouldScroll = true) {
  const ready = await ensureExactStageCode();
  if (!ready || stageDetails[currentStageIndex]?.level !== "06") return;
  const range = stageSixCodeRange(stepIndex);
  if (range.start < 0 || range.end < range.start) {
    console.error(`Could not resolve stage 06 code range for step ${stepIndex + 1}`);
    stageCodeSource.textContent = uiText("fullStageError");
    return;
  }
  stageCodeMode = "full";
  activeStageFiveCodeStep = stepIndex;
  renderStageSixFullCode(range, shouldScroll);
  document.querySelectorAll(".diagram-node.code-linked").forEach((node) => {
    const selected = Number(node.dataset.codeStep) === stepIndex;
    node.classList.toggle("code-active", selected);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

async function focusStageFiveOnnx(stepIndex, shouldScroll = true, exactLayer = null) {
  if (stageDetails[currentStageIndex]?.level !== "05" || !stageOnnxPanel || !stageOnnxLayers) return;
  const rows = sfaceOnnxRows(stepIndex);
  const labels = localized(stageDetails[currentStageIndex].diagram);
  const start = rows[0].layer;
  const end = rows[rows.length - 1].layer;
  activeStageFiveCodeStep = stepIndex;
  stageOnnxTitle.textContent = `${uiText("onnxGraphTitle")} · ${labels[stepIndex]}`;
  stageOnnxMeta.textContent = uiText("onnxGraphMeta")
    .replace("{start}", String(start))
    .replace("{end}", String(end));
  stageOnnxLayers.innerHTML = "";
  rows.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "stage-onnx-layer";
    row.title = uiText("focusOnnxLayerAction");
    row.setAttribute("aria-label", `${item.op} ${item.name}. ${uiText("focusOnnxLayerAction")}`);
    row.addEventListener("click", () => focusStageFiveOnnx(stepIndex, true, item.layer));
    const range = document.createElement("span");
    range.className = "onnx-range";
    range.textContent = `#${item.layer}`;
    const operation = document.createElement("span");
    operation.className = "onnx-op";
    operation.textContent = `${item.op} · ${item.name}`;
    const shape = document.createElement("span");
    shape.className = "onnx-shape";
    shape.textContent = `${item.input} → ${item.output}`;
    row.append(range, operation, shape);
    stageOnnxLayers.appendChild(row);
  });
  stageOnnxPanel.classList.remove("hidden");
  document.querySelectorAll(".diagram-node.code-linked").forEach((node) => {
    const selected = Number(node.dataset.codeStep) === stepIndex;
    node.classList.toggle("code-active", selected);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  stageCodeMode = "full";
  await ensureExactStageCode();
  if (stageDetails[currentStageIndex]?.level !== "05") return;
  const focusStart = exactLayer == null ? start : exactLayer;
  const focusEnd = exactLayer == null ? end : exactLayer;
  renderStageFiveFullCode(stageDetails[currentStageIndex], focusStart, focusEnd, shouldScroll);
}

function buildStageDiagram(labels, notes, data) {
  stageDiagram.innerHTML = "";
  labels.forEach((label, index) => {
    const codeLinked = ["01", "02", "03", "04", "05", "06"].includes(data?.level)
      && activeDetectorVariant === "single";
    const node = document.createElement(codeLinked ? "button" : "div");
    node.className = "diagram-node";
    if (codeLinked) {
      node.type = "button";
      node.classList.add("code-linked");
      node.dataset.codeStep = String(index);
      const selected = activeStageFiveCodeStep === index;
      node.classList.toggle("code-active", selected);
      node.setAttribute("aria-pressed", selected ? "true" : "false");
      const action = data.level === "05" && usesLegacyStageInspector(data)
        ? uiText("focusOnnxAction")
        : uiText("focusCodeAction");
      node.setAttribute("aria-label", `${label}. ${action}`);
      node.title = action;
      node.addEventListener("click", () => {
        activeStageFiveCodeStep = index;
        renderStageCode(data);
        document.querySelectorAll(".diagram-node.code-linked").forEach((item) => {
          const selected = Number(item.dataset.codeStep) === index;
          item.classList.toggle("code-active", selected);
          item.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        if (data.level === "05" && !usesLegacyStageInspector(data)) {
          focusManualSfaceStageCode(index);
        } else if (data.level === "06" && !usesLegacyStageInspector(data)) {
          focusNativeStageFiveCode(index);
        } else {
          scrollStageCodeToFocused();
        }
      });
    }
    const title = document.createElement("strong");
    title.textContent = label;
    const note = document.createElement("p");
    note.textContent = notes[index] || "";
    node.append(title, note);
    stageDiagram.appendChild(node);
    if (index < labels.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "diagram-arrow";
      arrow.textContent = "↓";
      stageDiagram.appendChild(arrow);
    }
  });
}

function detectorDiagramNotes(data, labels) {
  const notes = localized(data.diagramNotes);
  if (Array.isArray(notes) && notes.length === labels.length) return notes;
  console.error(`Diagram notes mismatch for detector section ${data.level}`);
  return labels.map((label) => label);
}

function renderStageDetail(index, shouldScroll = true) {
  const total = stageDetails.length;
  const previousStageIndex = currentStageIndex;
  currentStageIndex = (index + total) % total;
  if (previousStageIndex !== currentStageIndex) activeStageFiveCodeStep = -1;
  const data = stageDetails[currentStageIndex];
  if (stageOnnxPanel) stageOnnxPanel.classList.toggle("hidden", data.level !== "05" || !usesLegacyStageInspector(data) || activeStageFiveCodeStep < 0);
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
      if (currentStageIndex === index && stageCodeMode === "full") {
        renderStageDetail(index, false);
        if (!(["05", "06"].includes(data.level)) && activeStageFiveCodeStep >= 0) scrollStageCodeToFocused(false);
      }
    });
  }
  const diagramLabels = localized(data.diagram);
  buildStageDiagram(diagramLabels, detectorDiagramNotes(data, diagramLabels), data);
  stageDetail.classList.remove("hidden");
  document.querySelectorAll(".pipeline-step").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.stage) === currentStageIndex);
  });
  if (data.level === "05" && activeStageFiveCodeStep >= 0 && !usesLegacyStageInspector(data)) {
    focusManualSfaceStageCode(activeStageFiveCodeStep, false);
  } else if (data.level === "06" && activeStageFiveCodeStep >= 0 && !usesLegacyStageInspector(data)) {
    focusNativeStageFiveCode(activeStageFiveCodeStep, false);
  }
  if (shouldScroll) stageDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideStageDetail() {
  if (!stageDetail) return;
  currentStageIndex = -1;
  activeStageFiveCodeStep = -1;
  stageOnnxPanel?.classList.add("hidden");
  stageDetail.classList.add("hidden");
  document.querySelectorAll(".pipeline-step").forEach((step) => step.classList.remove("active"));
}

function selectedMode() {
  return document.querySelector("input[name='computeMode']:checked")?.value || "CUDA";
}

function renderPreviews(files) {
  previewGrid.innerHTML = "";
  files = Array.from(files || []).slice(0, 1);
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
  if (!(await requireLocalBridge("send the selected screenshot to the local face detector"))) {
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
  const item = results[0];
  summaryBox.textContent = item?.json?.accepted
    ? `${item.file}: ${item.json.identity}`
    : `${item?.file || ""}: ${uiText("unknown")}`;
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
  const file = imageInput.files?.[0];
  if (!file) {
    summaryBox.textContent = translations[document.documentElement.lang]?.dropHint || translations.en.dropHint;
    return;
  }
  const mode = selectedMode();
  const score = Number(scoreInput.value);
  const margin = Number(marginInput.value);
  recognizeButton.disabled = true;
  backendStatus.textContent = uiText("running");
  summaryBox.textContent = `${uiText("processing")} (${mode})…`;
  resultList.innerHTML = "";
  jsonBox.textContent = "{}";
  try {
    selectDetectorVariant("single");
    const result = await runRecognition(file, mode, score, margin);
    const results = [{ file: file.name, ...result }];
    renderResults(results);
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
  stageCodeMode = "full";
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

imageInput.addEventListener("change", () => renderPreviews(imageInput.files?.[0] ? [imageInput.files[0]] : []));
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
    stageCodeMode = "full";
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
