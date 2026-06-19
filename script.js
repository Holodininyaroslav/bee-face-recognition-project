const LOCAL_HIVE_BASE = "http://127.0.0.1:8876";
const LOCAL_BEEBOARD_BASE = "http://127.0.0.1:8877";
const LOCAL_HIVE_URL = `${LOCAL_HIVE_BASE}/?fresh=github-pages-local`;
const LOCAL_BEEBOARD_VIEWER_URL = `${LOCAL_BEEBOARD_BASE}/?hive=${encodeURIComponent(LOCAL_HIVE_URL)}&processor=0#viewer`;
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

function requestLocalBridgeApproval(reason) {
  if (IS_LOCAL_PORTAL) return false;
  const allowed = window.confirm(
    `Approve connection from this public project page to local project tools on this computer?\n\nAction: ${reason}`
  );
  if (allowed) {
    const approval = new URL(`${LOCAL_HIVE_BASE}/local-bridge-approve`);
    approval.searchParams.set("return", publicReturnUrl());
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

function renderOnlineComplexFrame() {
  if (!complexFrame) return;
  complexFrame.removeAttribute("srcdoc");
  const frameUrl = new URL("complex.html", window.location.href);
  const cacheVersion = START_PARAMS.get("v") || "site-complex";
  frameUrl.searchParams.set("v", cacheVersion);
  complexFrame.src = frameUrl.toString();
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
    toolUrsina: "Ursina game installer",
    toolUrsinaText: "Download the local Ursina game package.",
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
    howIntro: "The demo sends the selected image to the connected Colab detector. The same recognition chain is used whether the request comes from this simple window or from the integrated Hive interface.",
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
    openUrsina: "Open Ursina 3D",
    downloadUrsina: "Ursina installer",
    downloadBeeBoard: "BeeBoard installer",
    downloadPhysical: "Physical installer",
    back: "Back"
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
  sourceKicker: "FULL DETECTOR SOURCE",
  sourceTitle: "Complete neural detector implementation",
  sourceIntro: "Open the full Colab detector module when you need to inspect the pieces that sit around the six computation stages: imports, weight loading, CUDA selection, the DeepID model, preprocessing, reference embeddings, batch recognition, decision rules, and JSON/API glue.",
  openDetectorSource: "Open full detector source",
  hideDetectorSource: "Hide full detector source",
  openRawDetectorSource: "Open raw source file",
  sourceClosed: "Closed. Use this when the stage snippets are not enough.",
  sourceLoading: "Loading detector source from the repository...",
  sourceLoaded: "Showing the exact neural detector source copied from the Colab module. The raw file link opens the full module.",
  sourceError: "Could not load the detector source file from this site."
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

let currentStageIndex = -1;
let stageCodeMode = "short";
let detectorSourceLoaded = false;
let detectorSourceVisible = false;
let detectorSourceText = "";


function setLanguage(lang) {
  const dict = translations[lang] || translations.en;
  const extra = detailUi[lang] || detailUi.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (dict[key] || extra[key]) node.textContent = dict[key] || extra[key];
  });
  document.querySelectorAll(".lang").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });
  if (currentStageIndex >= 0 && !stageDetail.classList.contains("hidden")) {
    renderStageDetail(currentStageIndex, false);
  }
  updateDetectorSourceUi();
  if (detectorSourceLoaded && detectorSourceVisible) {
    renderDetectorSource(detectorSourceText);
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
  if (!value || typeof value === "string") return value || "";
  const lang = document.documentElement.lang || "en";
  return value[lang] || value.en || "";
}

const codeAnnotationFallback = {
  en: "This line belongs to the CUDA/OpenCL detector pipeline for the selected stage.",
  ru: "Р­С‚Р° СЃС‚СЂРѕРєР° РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє CUDA/OpenCL-С†РµРїРѕС‡РєРµ РґРµС‚РµРєС‚РѕСЂР° РЅР° РІС‹Р±СЂР°РЅРЅРѕРј СЌС‚Р°РїРµ.",
  he: "Ч©Ч•ЧЁЧ” Ч–Ч• Ч©Ч™Ч™Ч›ЧЄ ЧњЧ©ЧЁЧ©ЧЁЧЄ CUDA/OpenCL Ч©Чњ Ч”Ч’ЧњЧђЧ™ Ч‘Ч©ЧњЧ‘ Ч”Ч Ч‘Ч—ЧЁ."
};

const codeBlankAnnotation = {
  en: "Visual separator between logical parts of the stage.",
  ru: "Р’РёР·СѓР°Р»СЊРЅС‹Р№ СЂР°Р·РґРµР»РёС‚РµР»СЊ РјРµР¶РґСѓ Р»РѕРіРёС‡РµСЃРєРёРјРё С‡Р°СЃС‚СЏРјРё СЌС‚Р°РїР°.",
  he: "ЧћЧ¤ЧЁЧ™Ч“ Ч—Ч–Ч•ЧЄЧ™ Ч‘Ч™Чџ Ч—ЧњЧ§Ч™Чќ ЧњЧ•Ч’Ч™Ч™Чќ Ч©Чњ Ч”Ч©ЧњЧ‘."
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

function patternCodeAnnotation(line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  const found = colabCodePatternAnnotations.find(([pattern]) => pattern.test(trimmed));
  return (found && (found[1][lang] || found[1].en)) || codeAnnotationFallback[lang] || codeAnnotationFallback.en;
}

function codeAnnotation(stage, line) {
  const lang = document.documentElement.lang || "en";
  const trimmed = line.trim();
  if (!trimmed) return codeBlankAnnotation[lang] || codeBlankAnnotation.en;
  const match = codeLineAnnotations[stage.level]?.[trimmed];
  return (match && (match[lang] || match.en)) || patternCodeAnnotation(line);
}

function uiText(key) {
  const lang = document.documentElement.lang || "en";
  return detailUi[lang]?.[key] || translations[lang]?.[key] || detailUi.en[key] || translations.en[key] || key;
}

function renderStageCode(stage) {
  stageCode.innerHTML = "";
  const lang = document.documentElement.lang || "en";
  const fullMode = stageCodeMode === "full" && stage.fullCode;
  const source = fullMode ? stage.fullCode : stage.code;
  stageCode.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
  stageCode.classList.toggle("full-code", Boolean(fullMode));
  if (stageCodeModeButton) {
    stageCodeModeButton.textContent = uiText(fullMode ? "showShortCode" : "openFullCode");
  }
  if (stageCodeSource) {
    stageCodeSource.textContent = uiText(fullMode ? "codeSourceFull" : "codeSourceShort");
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

function updateDetectorSourceUi() {
  if (!loadFullDetectorSource || !fullSourceMeta || !fullDetectorSource) return;
  loadFullDetectorSource.textContent = uiText(detectorSourceVisible ? "hideDetectorSource" : "openDetectorSource");
  if (!detectorSourceVisible) {
    fullSourceMeta.textContent = uiText("sourceClosed");
  } else if (detectorSourceLoaded) {
    fullSourceMeta.textContent = uiText("sourceLoaded");
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
  const lines = source.split(/\r?\n/);
  const importLines = lines
    .slice(0, 90)
    .filter((line) => /^(import|from)\s+/.test(line.trim()));
  const helperStart = lines.findIndex((line) => /^def _image_paths\b/.test(line));
  const helperEnd = findBlockEnd(lines, helperStart, (line) => /^def\s+/.test(line));
  const classStart = lines.findIndex((line) => /^class DeepIDIdentityDetector\b/.test(line));
  const classEnd = findBlockEnd(lines, classStart, (line) => /^def create_colab_ui\b/.test(line) || /^class\s+/.test(line));
  const helperBlock = helperStart >= 0 ? lines.slice(helperStart, helperEnd) : [];
  const classBlock = classStart >= 0 ? lines.slice(classStart, classEnd) : lines;
  return [
    "# Exact neural detector source excerpt from source/colab_ai_mips_bee_world.py",
    "# Raw link beside this panel opens the complete Colab module.",
    "",
    ...importLines,
    "",
    ...helperBlock,
    "",
    ...classBlock
  ].join("\n");
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
    note.textContent = line.trim() ? patternCodeAnnotation(line) : (codeBlankAnnotation[lang] || codeBlankAnnotation.en);
    row.append(code, note);
    fullDetectorSource.appendChild(row);
  });
}

async function toggleDetectorSource() {
  if (!loadFullDetectorSource || !fullSourceMeta || !fullDetectorSource) return;
  detectorSourceVisible = !detectorSourceVisible;
  fullDetectorSource.classList.toggle("hidden", !detectorSourceVisible);
  updateDetectorSourceUi();
  if (!detectorSourceVisible) return;
  if (!detectorSourceLoaded) {
    fullSourceMeta.textContent = uiText("sourceLoading");
    try {
      const response = await fetch("source/colab_ai_mips_bee_world.py", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      detectorSourceText = await response.text();
      detectorSourceLoaded = true;
      renderDetectorSource(detectorSourceText);
      fullSourceMeta.textContent = uiText("sourceLoaded");
    } catch (error) {
      fullSourceMeta.textContent = `${uiText("sourceError")} ${error.message || error}`;
      detectorSourceVisible = false;
      fullDetectorSource.classList.add("hidden");
    }
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

function renderStageDetail(index, shouldScroll = true) {
  const total = stageDetails.length;
  currentStageIndex = (index + total) % total;
  const data = stageDetails[currentStageIndex];
  stageDetailKicker.textContent = `LEVEL ${data.level}`;
  stageDetailTitle.textContent = localized(data.title);
  stageDetailSummary.textContent = localized(data.summary);
  stageLayers.textContent = localized(data.layers);
  stageConnections.textContent = localized(data.connections);
  stageTensor.textContent = data.tensor;
  stageCudaShort.textContent = localized(data.cudaShort);
  stageCudaText.textContent = localized(data.cuda);
  renderStageCode(data);
  buildStageDiagram(localized(data.diagram), localized(stageDiagramNotes[currentStageIndex]));
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
  return { markdown: payload.identity || payload.best_label || "Unknown", json: payload };
}

function renderResults(results) {
  resultList.innerHTML = "";
  const accepted = results.filter((item) => item.json?.accepted).length;
  summaryBox.textContent = `${results.length} image(s) processed. Accepted: ${accepted}.`;
  results.forEach((item) => {
    const row = document.createElement("article");
    row.className = `result-row ${item.json?.accepted ? "accepted" : "unknown"}`;
    const title = document.createElement("strong");
    title.textContent = `${item.file}: ${item.json?.identity || "Unknown"}`;
    const meta = document.createElement("span");
    const score = item.json?.best_score;
    const margin = item.json?.margin;
    meta.textContent = `${item.json?.mode || selectedMode()} | best ${item.json?.best_label || "-"} | score ${Number(score ?? 0).toFixed(6)} | margin ${Number(margin ?? 0).toFixed(6)}`;
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
  backendStatus.textContent = "Running...";
  summaryBox.textContent = `Processing ${files.length} image(s) on ${mode}...`;
  resultList.innerHTML = "";
  jsonBox.textContent = "{}";
  try {
    const results = [];
    for (const file of files) {
      summaryBox.textContent = `Processing ${file.name} on ${mode}...`;
      const result = await runRecognition(file, mode, score, margin);
      results.push({ file: file.name, ...result });
      renderResults(results);
    }
    backendStatus.textContent = "Local Hive ready";
  } catch (error) {
    backendStatus.textContent = "Local Hive error";
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
loadFullDetectorSource?.addEventListener("click", toggleDetectorSource);
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
    if (!detectorSourceVisible) toggleDetectorSource();
  }
}

setLanguage("en");
renderPreviews([]);
applyDeepLink();

complexFrame = document.getElementById("complexFrame");

function renderComplexFrame() {
  if (!complexFrame) return;
  renderOnlineComplexFrame();
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
    if (!LOCAL_BRIDGE_ALLOWED) {
      event.preventDefault();
      if (!(await requireLocalBridge(`open ${node.textContent.trim()} on 127.0.0.1`))) {
        return;
      }
    }
    const target = node.dataset.localOpen;
    if (target === "hive") {
      node.href = withLocalToken(LOCAL_HIVE_URL);
    } else if (target === "beeboard") {
      node.href = withLocalToken(LOCAL_BEEBOARD_VIEWER_URL);
    } else if (target === "physical") {
      node.href = withLocalToken(`${LOCAL_HIVE_BASE}/physical-simulator`);
    } else if (target === "ursina") {
      node.href = withLocalToken(`${LOCAL_HIVE_BASE}/local-ursina-simulator?api=${encodeURIComponent(LOCAL_HIVE_BASE)}&processor_id=0`);
    }
    if (event.defaultPrevented) {
      window.open(node.href, "_blank", "noopener,noreferrer");
    }
  });
});

