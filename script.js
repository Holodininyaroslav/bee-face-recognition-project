const LOCAL_HIVE_BASE = "http://127.0.0.1:8876";
const LOCAL_BEEBOARD_BASE = "http://127.0.0.1:8877";
const LOCAL_PORTAL_BASE = "http://127.0.0.1:8890";
const LOCAL_HIVE_URL = `${LOCAL_HIVE_BASE}/?fresh=github-pages-local`;
const LOCAL_BEEBOARD_VIEWER_URL = `${LOCAL_BEEBOARD_BASE}/?hive=${encodeURIComponent(LOCAL_HIVE_URL)}&processor=0#viewer`;
const START_PARAMS = new URLSearchParams(window.location.search);
const LOCAL_BRIDGE_SESSION_KEY = "beeFaceLocalBridgeToken";
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
let LOCAL_BRIDGE_ALLOWED = START_PARAMS.get("local_bridge") === "1" && (IS_LOCAL_PORTAL || validLocalToken(START_PARAMS.get("local_token") || ""));
let localBridgeIdleTimer = null;
let localBridgeUserConfirmed = false;
let complexFrame = null;

if (LOCAL_BRIDGE_ALLOWED && window.history && window.history.replaceState) {
  writeStoredLocalBridgeToken(LOCAL_BRIDGE_TOKEN);
  const safeUrl = new URL(window.location.href);
  safeUrl.searchParams.delete("local_token");
  safeUrl.searchParams.set("local_bridge", "1");
  safeUrl.searchParams.set("session", "local-approved");
  window.history.replaceState(null, "", safeUrl.toString());
}

function withLocalToken(url) {
  if (!LOCAL_BRIDGE_ALLOWED) return url;
  const parsed = new URL(url, window.location.href);
  if (validLocalToken(LOCAL_BRIDGE_TOKEN)) {
    parsed.searchParams.set("local_token", LOCAL_BRIDGE_TOKEN);
  }
  return parsed.toString();
}

function bridgeHasSavedToken() {
  return IS_LOCAL_PORTAL || validLocalToken(LOCAL_BRIDGE_TOKEN);
}

function localPortalComplexUrl() {
  const url = new URL(LOCAL_PORTAL_BASE);
  url.searchParams.set("view", "complex");
  url.searchParams.set("local_bridge", "1");
  url.searchParams.set("v", `chrome-local-${Date.now()}`);
  return url.toString();
}

function offerLocalPortal(reason) {
  if (IS_LOCAL_PORTAL) return false;
  const allowed = window.confirm(
    `Open the approved local project portal on 127.0.0.1 for this computer?\n\nAction: ${reason}`
  );
  if (allowed) {
    window.location.href = localPortalComplexUrl();
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
  if (!LOCAL_BRIDGE_ALLOWED) return;
  window.clearTimeout(localBridgeIdleTimer);
  localBridgeIdleTimer = window.setTimeout(() => {
    LOCAL_BRIDGE_ALLOWED = false;
    localBridgeUserConfirmed = false;
    renderLocalBridgePlaceholder("expired");
  }, LOCAL_BRIDGE_IDLE_MS);
}

function approveLocalBridgeFromSavedToken(reason = "reconnect local project tools") {
  if (!bridgeHasSavedToken()) {
    if (offerLocalPortal(reason)) {
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
    kicker: "COLAB GPU / РАСПОЗНАВАНИЕ ЛИЦ / ИНТЕРФЕЙС ПРОЕКТА",
    title: "Добро пожаловать в Bee Face Recognition Project",
    lead: "Загружайте скриншоты, распознавайте лица через подключенный Colab-детектор и смотрите тот же поток результатов в интегрированном интерфейсе AI MIPS.",
    simple: "Простая демонстрация",
    complex: "Сложная демонстрация, интегрированная в проект",
    toolColab: "Colab notebook проекта",
    toolColabText: "Открыть CUDA/Colab версию детектора из этого репозитория.",
    toolUrsina: "Инсталлер Ursina игры",
    toolUrsinaText: "Скачать локальный пакет Ursina игры.",
    toolBeeBoard: "BeeBoard инсталлер",
    toolBeeBoardText: "Скачать локальный пакет BeeBoard интерфейса.",
    toolPhysical: "Инсталлер физической симуляции",
    toolPhysicalText: "Скачать локальный пакет физической симуляции.",
    simpleKicker: "ПРОСТОЙ РЕЖИМ",
    simpleTitle: "Простая демонстрация распознавания лиц",
    simpleNote: "Загрузите одно изображение или пачку, выберите GPU или CPU и нажмите Recognize.",
    imageTitle: "Изображение / скриншот",
    dropHint: "Выберите одно или несколько изображений для GPU/CPU анализа.",
    score: "Минимальный score",
    margin: "Минимальный margin",
    recognize: "Recognize",
    resultTitle: "Результат детектора",
    summary: "Загрузите изображение и нажмите Recognize.",
    json: "JSON детектора",
    howKicker: "КАК РАБОТАЕТ ДЕТЕКТОР",
    howTitle: "Что происходит с картинкой внутри нейросети",
    howIntro: "Простая демонстрация отправляет выбранное изображение в подключенный Colab-детектор. Та же самая цепочка распознавания используется и здесь, и в интегрированном Hive-интерфейсе проекта.",
    step1Title: "Входное изображение",
    step1Text: "Загруженный скриншот читается как набор пикселей. Если выбрана пачка файлов, эти же шаги выполняются для каждой картинки по очереди.",
    step2Title: "Обрезка лица и нормализация",
    step2Text: "Детектор ищет область лица, вырезает полезный фрагмент, приводит его к входному размеру сети и нормализует значения цвета и яркости.",
    step3Title: "Извлечение признаков",
    step3Text: "Нейросеть превращает изображение лица в числовой вектор признаков, или embedding. Такой вектор описывает лицо компактнее и устойчивее, чем сырые пиксели.",
    step4Title: "Сравнение с эталонами",
    step4Text: "Новый embedding сравнивается с сохраненными эталонными embedding известных людей. Ближайший эталон становится best label, а второй ближайший сохраняется как runner up.",
    step5Title: "Решение по score и margin",
    step5Text: "Ответ принимается только если лучший score достаточно высокий и отрыв от второго результата достаточно большой. Иначе система возвращает Unknown, чтобы не подставлять неправильное имя.",
    step6Title: "JSON-ответ",
    step6Text: "Интерфейс получает короткое текстовое резюме и JSON с именем, best score, runner up, margin, режимом backend, временем выполнения и флагом accepted.",
    modeExplainTitle: "Режим GPU и CPU",
    modeExplainText: "GPU-режим выполняет тяжелые операции над изображениями и векторами через ускоритель. CPU-режим выполняет ту же логику распознавания на процессоре. Ожидаемый ответ по личности должен оставаться тем же; разница в основном в том, где идут вычисления и сколько времени они занимают.",
    complexKicker: "ИНТЕГРИРОВАННЫЙ РЕЖИМ",
    complexTitle: "Интегрированный интерфейс проекта",
    openHive: "Открыть локальный Hive",
    openBeeBoard: "Открыть BeeBoard 3D",
    openPhysical: "Открыть калибровку крыльев",
    openUrsina: "Открыть Ursina 3D",
    downloadUrsina: "Ursina инсталлер",
    downloadBeeBoard: "BeeBoard инсталлер",
    downloadPhysical: "Физический инсталлер",
    back: "Назад"
  },
  he: {
    kicker: "COLAB GPU / זיהוי פנים / ממשק פרויקט",
    title: "ברוכים הבאים אל Bee Face Recognition Project",
    lead: "העלו צילומי מסך, הפעילו זיהוי פנים דרך גלאי Colab המחובר, וצפו באותו זרם תוצאות בממשק AI MIPS המשולב.",
    simple: "הדגמה פשוטה",
    complex: "הדגמה מורכבת המשולבת בפרויקט",
    toolColab: "מחברת Colab של הפרויקט",
    toolColabText: "פתיחת גרסת CUDA/Colab של הגלאי מתוך המאגר.",
    toolUrsina: "מתקין משחק Ursina",
    toolUrsinaText: "הורדת חבילת משחק Ursina מקומית.",
    toolBeeBoard: "מתקין BeeBoard",
    toolBeeBoardText: "הורדת חבילת ממשק BeeBoard מקומית.",
    toolPhysical: "מתקין סימולציה פיזית",
    toolPhysicalText: "הורדת חבילת הסימולציה הפיזית המקומית.",
    simpleKicker: "מצב פשוט",
    simpleTitle: "הדגמת זיהוי פנים פשוטה",
    simpleNote: "העלו תמונה אחת או קבוצה, בחרו GPU או CPU ולחצו Recognize.",
    imageTitle: "תמונה / צילום מסך",
    dropHint: "בחרו תמונה אחת או יותר לניתוח GPU/CPU.",
    score: "סף score מינימלי",
    margin: "סף margin מינימלי",
    recognize: "Recognize",
    resultTitle: "תוצאת הגלאי",
    summary: "העלו תמונה ולחצו Recognize.",
    json: "JSON של הגלאי",
    howKicker: "איך הגלאי עובד",
    howTitle: "מה קורה לתמונה בתוך הרשת העצבית",
    howIntro: "ההדגמה שולחת את התמונה שנבחרה אל גלאי Colab המחובר. אותה שרשרת זיהוי משמשת גם בחלון הפשוט וגם בממשק Hive המשולב של הפרויקט.",
    step1Title: "קלט תמונה",
    step1Text: "צילום המסך שהועלה נקרא כפיקסלים. אם נבחרת קבוצה של קבצים, אותם שלבים מתבצעים עבור כל תמונה בנפרד.",
    step2Title: "חיתוך פנים ונרמול",
    step2Text: "הגלאי מחפש את אזור הפנים, חותך את החלק החשוב, משנה אותו לגודל הקלט של הרשת ומנרמל ערכי צבע ובהירות.",
    step3Title: "חילוץ מאפיינים",
    step3Text: "הרשת העצבית ממירה את תמונת הפנים לווקטור מספרי של מאפיינים, הנקרא גם embedding. הווקטור מתאר את דפוס הפנים בצורה קומפקטית יותר מפיקסלים גולמיים.",
    step4Title: "השוואה לדוגמאות ייחוס",
    step4Text: "ה-embedding החדש מושווה ל-embeddings שמורים של זהויות מוכרות. הזהות הקרובה ביותר הופכת ל-best label, והתוצאה השנייה נשמרת כ-runner up.",
    step5Title: "החלטה לפי score ו-margin",
    step5Text: "התשובה מתקבלת רק אם ה-score הטוב ביותר גבוה מספיק והמרחק מהתוצאה השנייה גדול מספיק. אחרת מוחזר Unknown כדי לא לכפות שם שגוי.",
    step6Title: "תגובת JSON",
    step6Text: "הממשק מקבל תקציר קריא ואובייקט JSON עם הזהות, best score, runner up, margin, מצב backend, זמן ריצה ודגל accepted.",
    modeExplainTitle: "מצבי GPU ו-CPU",
    modeExplainText: "מצב GPU מריץ את פעולות התמונה והווקטורים הכבדות במסלול המאיץ. מצב CPU מריץ את אותה לוגיקת זיהוי על המעבד. תוצאת הזהות הצפויה אמורה להישאר זהה; ההבדל הוא בעיקר היכן החישוב מתבצע וכמה זמן הוא לוקח.",
    complexKicker: "מצב משולב",
    complexTitle: "ממשק הפרויקט המשולב",
    openHive: "פתיחת Hive מקומי",
    openBeeBoard: "פתיחת BeeBoard 3D",
    openPhysical: "פתיחת כיול כנפיים",
    openUrsina: "פתיחת Ursina 3D",
    downloadUrsina: "מתקין Ursina",
    downloadBeeBoard: "מתקין BeeBoard",
    downloadPhysical: "מתקין פיזי",
    back: "חזרה"
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
  sourceKicker: "ПОЛНЫЙ ИСХОДНИК ДЕТЕКТОРА",
  sourceTitle: "Полная реализация нейросетевого распознавателя",
  sourceIntro: "Откройте полный модуль Colab-детектора, когда нужно увидеть все части вокруг шести этапов вычислений: импорты, загрузку весов, выбор CUDA, модель DeepID, препроцессинг, эталонные embeddings, batch-распознавание, правила решения и JSON/API-связку.",
  openDetectorSource: "Открыть полный исходник детектора",
  hideDetectorSource: "Скрыть полный исходник детектора",
  openRawDetectorSource: "Открыть raw-файл исходника",
  sourceClosed: "Закрыто. Используйте это, когда фрагментов этапов недостаточно.",
  sourceLoading: "Загружаю исходник детектора из репозитория...",
  sourceLoaded: "Показан точный исходник нейросетевого детектора, скопированный из Colab-модуля. Ссылка raw открывает полный модуль.",
  sourceError: "Не удалось загрузить файл исходника детектора с этого сайта."
});

Object.assign(translations.he, {
  sourceKicker: "קוד מקור מלא של הגלאי",
  sourceTitle: "מימוש מלא של מזהה הפנים הנוירוני",
  sourceIntro: "פתחו את מודול גלאי ה-Colab המלא כאשר צריך לבדוק את כל החלקים שמסביב לששת שלבי החישוב: יבוא ספריות, טעינת משקלים, בחירת CUDA, מודל DeepID, עיבוד מקדים, embeddings לייחוס, זיהוי באצווה, כללי החלטה וחיבור JSON/API.",
  openDetectorSource: "פתח קוד מקור מלא של הגלאי",
  hideDetectorSource: "הסתר קוד מקור מלא של הגלאי",
  openRawDetectorSource: "פתח קובץ מקור raw",
  sourceClosed: "סגור. השתמשו בזה כאשר קטעי השלבים אינם מספיקים.",
  sourceLoading: "טוען את קוד המקור של הגלאי מהמאגר...",
  sourceLoaded: "מוצג קוד המקור המדויק של הגלאי הנוירוני שהועתק ממודול Colab. קישור raw פותח את המודול המלא.",
  sourceError: "לא ניתן לטעון את קובץ המקור של הגלאי מהאתר."
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
    openStage: "Открыть схему",
    schemeTitle: "Схема",
    stageStatsTitle: "Слои и связи нейронов",
    layersLabel: "Слои / операции",
    connectionsLabel: "Связи нейронов / MAC",
    tensorLabel: "Размер тензора / вектора",
    cudaLabel: "Раскладка CUDA",
    cudaTitle: "Как это реализуется в CUDA в проекте",
    nextLevel: "Следующий уровень",
    prevLevel: "Предыдущий уровень",
    backToSimple: "Вернуться в простую демонстрацию"
  },
  he: {
    openStage: "פתח תרשים",
    schemeTitle: "תרשים",
    stageStatsTitle: "שכבות וקשרי נוירונים",
    layersLabel: "שכבות / פעולות",
    connectionsLabel: "קשרי נוירונים / MAC",
    tensorLabel: "גודל טנזור / וקטור",
    cudaLabel: "מיפוי CUDA",
    cudaTitle: "איך זה ממומש ב-CUDA בפרויקט",
    nextLevel: "השלב הבא",
    prevLevel: "השלב הקודם",
    backToSimple: "חזרה להדגמה הפשוטה"
  }
};

Object.assign(detailUi.ru, {
  openFullCode: "Открыть полный Colab/CUDA код этого этапа",
  showShortCode: "Показать короткую схему этапа",
  codeSourceShort: "Короткая CUDA-схема этапа",
  codeSourceFull: "Полный код из Colab-детектора для этого этапа"
});

Object.assign(detailUi.he, {
  openFullCode: "פתח את קוד Colab/CUDA המלא של השלב",
  showShortCode: "הצג תרשים קוד קצר",
  codeSourceShort: "תרשים CUDA קצר של השלב",
  codeSourceFull: "הקוד המלא של גלאי Colab לשלב הזה"
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
    title: { en: "Image input", ru: "Входное изображение", he: "קלט תמונה" },
    summary: {
      en: "The browser reads each selected file, keeps the original preview, and sends the image bytes to the connected Colab detector.",
      ru: "Браузер читает каждый выбранный файл, показывает превью и отправляет байты изображения в подключенный Colab-детектор.",
      he: "הדפדפן קורא כל קובץ שנבחר, מציג תצוגה מקדימה ושולח את בתי התמונה אל גלאי Colab המחובר."
    },
    diagram: {
      en: ["File input", "Image bytes", "Decoded RGB pixels", "Network tensor"],
      ru: ["Выбор файла", "Байты изображения", "RGB-пиксели", "Тензор сети"],
      he: ["בחירת קובץ", "בתי תמונה", "פיקסלי RGB", "טנזור רשת"]
    },
    layers: { en: "0 neural layers; host decode and resize step", ru: "0 нейрослоев; декодирование и resize на host", he: "0 שכבות עצביות; פענוח ושינוי גודל ב-host" },
    connections: { en: "0 neural MACs; 7,755 input values", ru: "0 нейронных MAC; 7 755 входных значений", he: "0 MAC עצביים; 7,755 ערכי קלט" },
    tensor: "55 x 47 x 3 RGB floats = 7,755 values",
    cudaShort: { en: "Host upload to GPU buffer", ru: "Host загружает буфер на GPU", he: "Host מעלה באפר ל-GPU" },
    cuda: {
      en: "In the Colab/CUDA path the decoded face tensor is copied into device memory before the DeepID forward pass. The local AMD build mirrors the same contract with OpenCL buffers.",
      ru: "В Colab/CUDA-пути декодированный тензор лица копируется в память устройства перед прямым проходом DeepID. Локальная AMD-версия повторяет тот же контракт через OpenCL-буферы.",
      he: "במסלול Colab/CUDA טנזור הפנים המפוענח מועתק לזיכרון ההתקן לפני המעבר הקדמי של DeepID. גרסת AMD המקומית משקפת אותו חוזה דרך באפרים של OpenCL."
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
    title: { en: "Face crop and normalization", ru: "Обрезка лица и нормализация", he: "חיתוך פנים ונרמול" },
    summary: {
      en: "The detector finds the useful face region, crops it, resizes it to the fixed DeepID input, and scales color values into a stable numeric range.",
      ru: "Детектор находит полезную область лица, вырезает ее, приводит к фиксированному входу DeepID и нормализует значения цвета.",
      he: "הגלאי מוצא את אזור הפנים החשוב, חותך אותו, מתאים אותו לקלט הקבוע של DeepID ומנרמל ערכי צבע."
    },
    diagram: {
      en: ["Raw screenshot", "Face region", "Crop", "55 x 47 normalized tensor"],
      ru: ["Сырой скриншот", "Область лица", "Обрезка", "55 x 47 нормализованный тензор"],
      he: ["צילום מסך גולמי", "אזור פנים", "חיתוך", "טנזור מנורמל 55 x 47"]
    },
    layers: { en: "0 learned layers; detector scan + normalization", ru: "0 обучаемых слоев; поиск области + нормализация", he: "0 שכבות לומדות; סריקה ונרמול" },
    connections: { en: "9,216 scan cells at 96 x 96; no trainable neural weights", ru: "9 216 ячеек сканирования 96 x 96; обучаемых весов нет", he: "9,216 תאי סריקה 96 x 96; אין משקלים לומדים" },
    tensor: "96 x 96 scan -> 55 x 47 x 3 network input",
    cudaShort: { en: "Preprocess before GPU forward", ru: "Preprocess перед GPU forward", he: "עיבוד מקדים לפני GPU forward" },
    cuda: {
      en: "This stage prepares the tensor for CUDA. It is lightweight compared with the neural forward pass, so the project keeps it as preprocessing and sends the final tensor to GPU kernels.",
      ru: "Этот этап готовит тензор для CUDA. Он легкий по сравнению с прямым проходом нейросети, поэтому проект держит его как preprocessing и отправляет итоговый тензор в GPU kernels.",
      he: "שלב זה מכין את הטנזור ל-CUDA. הוא קל יחסית למעבר הרשת, לכן הפרויקט שומר אותו כעיבוד מקדים ושולח את הטנזור הסופי לקרנלים של GPU."
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
    title: { en: "Feature extraction", ru: "Извлечение признаков", he: "חילוץ מאפיינים" },
    summary: {
      en: "DeepID converts the normalized face into a 160-number embedding. This is the heavy neural stage and the main GPU/CUDA workload.",
      ru: "DeepID превращает нормализованное лицо в embedding из 160 чисел. Это тяжелый нейросетевой этап и основная CUDA/GPU-нагрузка.",
      he: "DeepID ממיר את הפנים המנורמלות ל-embedding של 160 מספרים. זה השלב העצבי הכבד ועיקר עומס CUDA/GPU."
    },
    diagram: {
      en: ["Input 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"],
      ru: ["Вход 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"],
      he: ["קלט 55x47x3", "Conv1 + Pool", "Conv2 + Pool", "Conv3 + Pool", "FC11 + Conv4 + FC12", "160D embedding"]
    },
    layers: { en: "6 learned layers + 3 pools + add/ReLU + L2 normalize", ru: "6 обучаемых слоев + 3 pooling + add/ReLU + L2 normalize", he: "6 שכבות לומדות + 3 pooling + add/ReLU + נרמול L2" },
    connections: { en: "395,080 parameters; about 7,956,480 MACs per face", ru: "395 080 параметров; примерно 7 956 480 MAC на одно лицо", he: "395,080 פרמטרים; בערך 7,956,480 MAC לכל פנים" },
    tensor: "55x47x3 -> 52x44x20 -> 24x20x40 -> 10x8x60 -> 160",
    cudaShort: { en: "One thread per output activation", ru: "Один поток на output activation", he: "תהליכון אחד לכל activation" },
    cuda: {
      en: "CUDA maps convolution, pooling, dense, add/ReLU and normalization to separate kernels. Each output activation is independent, so blocks of threads compute pixels/channels in parallel. The local OpenCL file uses the same kernel idea.",
      ru: "CUDA раскладывает convolution, pooling, dense, add/ReLU и normalization на отдельные kernels. Каждый output activation независим, поэтому блоки потоков параллельно считают пиксели и каналы. Локальный OpenCL-файл использует ту же идею kernels.",
      he: "CUDA ממפה convolution, pooling, dense, add/ReLU ונרמול לקרנלים נפרדים. כל activation פלט בלתי תלוי, ולכן בלוקים של תהליכונים מחשבים פיקסלים וערוצים במקביל. קובץ OpenCL המקומי משתמש באותו רעיון."
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
    title: { en: "Reference comparison", ru: "Сравнение с эталонами", he: "השוואה לדוגמאות ייחוס" },
    summary: {
      en: "The new 160D embedding is compared against saved identity embeddings. The highest cosine score becomes best label; the second result is kept for the margin check.",
      ru: "Новый 160D embedding сравнивается с сохраненными эталонами людей. Максимальный cosine score становится best label, второй результат нужен для проверки margin.",
      he: "ה-embedding החדש בגודל 160 מושווה לייחוסים שמורים. ציון cosine הגבוה ביותר הופך ל-best label והתוצאה השנייה נשמרת לבדיקת margin."
    },
    diagram: {
      en: ["160D embedding", "216 reference vectors", "Parallel dot products", "Best + runner up"],
      ru: ["160D embedding", "216 эталонных векторов", "Параллельные dot products", "Best + runner up"],
      he: ["embedding 160D", "216 וקטורי ייחוס", "מכפלות פנימיות מקבילות", "Best + runner up"]
    },
    layers: { en: "1 comparison layer over the reference bank", ru: "1 слой сравнения по банку эталонов", he: "שכבת השוואה אחת מול מאגר הייחוס" },
    connections: { en: "216 x 160 = 34,560 similarity multiplications in the current reference set", ru: "216 x 160 = 34 560 умножений similarity в текущем наборе эталонов", he: "216 x 160 = 34,560 כפלות similarity במאגר הנוכחי" },
    tensor: "160D query vector + 216 x 160D reference matrix",
    cudaShort: { en: "One block/group per reference", ru: "Один block/group на эталон", he: "בלוק/קבוצה לכל ייחוס" },
    cuda: {
      en: "The CUDA version can assign one block to each reference identity and reduce 160 products into one similarity score. CPU mode runs the same math serially or with ordinary vector loops.",
      ru: "CUDA-версия может назначать один block на каждый эталон и сворачивать 160 произведений в один similarity score. CPU-режим выполняет ту же математику последовательно или обычными векторными циклами.",
      he: "גרסת CUDA יכולה להקצות בלוק לכל זהות ייחוס ולצמצם 160 מכפלות לציון similarity אחד. מצב CPU מריץ את אותה מתמטיקה בלולאות רגילות."
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
    title: { en: "Score and margin decision", ru: "Решение по score и margin", he: "החלטה לפי score ו-margin" },
    summary: {
      en: "The detector accepts the label only when the best score passes the minimum score and is separated from the runner up by the minimum margin.",
      ru: "Детектор принимает имя только когда лучший score выше порога и отделен от второго результата минимальным margin.",
      he: "הגלאי מקבל את השם רק כאשר הציון הטוב עובר את הסף ומופרד מהתוצאה השנייה לפי margin מינימלי."
    },
    diagram: {
      en: ["Best score", "Runner up", "Score threshold", "Margin threshold", "Accept / Unknown"],
      ru: ["Best score", "Runner up", "Порог score", "Порог margin", "Accept / Unknown"],
      he: ["Best score", "Runner up", "סף score", "סף margin", "Accept / Unknown"]
    },
    layers: { en: "1 decision rule; no learned neural layer", ru: "1 правило решения; обучаемого слоя нет", he: "כלל החלטה אחד; אין שכבה לומדת" },
    connections: { en: "2 scalar checks: best_score >= threshold and margin >= threshold", ru: "2 скалярные проверки: best_score >= threshold и margin >= threshold", he: "2 בדיקות סקלריות: best_score >= threshold ו-margin >= threshold" },
    tensor: "best_score, runner_up_score, margin, accepted flag",
    cudaShort: { en: "Tiny final kernel or host rule", ru: "Маленький final kernel или host rule", he: "קרנל סופי קטן או כלל host" },
    cuda: {
      en: "This stage is intentionally simple. In CUDA it can be a tiny final kernel after score reduction, but keeping it on the host gives the same answer and makes thresholds easy to tune from the web UI.",
      ru: "Этот этап специально простой. В CUDA он может быть маленьким final kernel после reduction score, но на host ответ тот же, а пороги легче настраивать из веб-интерфейса.",
      he: "שלב זה פשוט בכוונה. ב-CUDA הוא יכול להיות קרנל סופי קטן אחרי reduction, אבל ב-host התשובה זהה וקל יותר לכוון ספים מהממשק."
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
    title: { en: "Response JSON", ru: "JSON-ответ", he: "תגובת JSON" },
    summary: {
      en: "The backend returns both a readable result and structured JSON, so the simple demo and the Hive interface can use exactly the same detector output.",
      ru: "Backend возвращает читаемый результат и структурированный JSON, поэтому простая демонстрация и Hive-интерфейс используют один и тот же выход детектора.",
      he: "ה-backend מחזיר גם תוצאה קריאה וגם JSON מובנה, כך שההדגמה הפשוטה וממשק Hive משתמשים באותו פלט גלאי."
    },
    diagram: {
      en: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"],
      ru: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"],
      he: ["Accepted flag", "Identity", "Scores", "Backend mode", "Elapsed time", "Web UI JSON"]
    },
    layers: { en: "1 serialization layer", ru: "1 слой сериализации", he: "שכבת serialization אחת" },
    connections: { en: "0 neural MACs; fields are copied into JSON", ru: "0 нейронных MAC; поля копируются в JSON", he: "0 MAC עצביים; שדות מועתקים ל-JSON" },
    tensor: "identity, best_score, runner_up, margin, mode, elapsed_ms",
    cudaShort: { en: "GPU result copied back to host", ru: "GPU result копируется обратно на host", he: "תוצאת GPU מועתקת חזרה ל-host" },
    cuda: {
      en: "After CUDA/OpenCL finishes the numeric work, the result is copied back to the host. The Colab service serializes it as JSON for GitHub Pages and for the integrated project interface.",
      ru: "После завершения CUDA/OpenCL-вычислений результат копируется обратно на host. Colab-сервис сериализует его в JSON для GitHub Pages и интегрированного интерфейса проекта.",
      he: "לאחר ש-CUDA/OpenCL מסיים את העבודה המספרית, התוצאה מועתקת חזרה ל-host. שירות Colab מסדר אותה כ-JSON עבור GitHub Pages והממשק המשולב."
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
      "Пользователь выбирает одну или несколько фотографий или скриншотов в браузере.",
      "Файл передается как данные изображения, здесь имени человека еще нет.",
      "Backend декодирует картинку в RGB-пиксели, которые может читать детектор.",
      "Пиксели укладываются в фиксированный входной формат нейросети."
    ],
    he: [
      "המשתמש בוחר תמונה אחת או כמה תמונות בדפדפן.",
      "הקובץ נשלח כנתוני תמונה, עדיין בלי זהות של אדם.",
      "ה-backend מפענח את התמונה לערכי RGB שהגלאי יכול לקרוא.",
      "הפיקסלים מסודרים בפורמט קלט קבוע של הרשת העצבית."
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
      "Полный скриншот может содержать фон, интерфейс или лишние объекты.",
      "Детектор ищет участок, где вероятнее всего находится лицо.",
      "Для распознавания оставляется только полезная область лица.",
      "Фрагмент приводится к одному размеру и нормализуется, чтобы все лица входили в сеть одинаково."
    ],
    he: [
      "צילום המסך יכול לכלול רקע, ממשק או אובייקטים מיותרים.",
      "הגלאי מחפש את האזור שבו סביר שנמצאות הפנים.",
      "רק אזור הפנים החשוב נשמר לזיהוי.",
      "החיתוך משתנה לגודל קבוע ומנורמל כדי שכל פנים ייכנסו לרשת באותו פורמט."
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
      "Нормализованное лицо поступает в сеть DeepID.",
      "Первые фильтры находят простые локальные признаки и уменьшают карту.",
      "Следующие фильтры собирают простые признаки в более сильные признаки лица.",
      "Последняя свертка сохраняет компактную пространственную информацию лица.",
      "Полносвязные слои смешивают важные признаки в одно внутреннее представление.",
      "Итоговый embedding из 160 чисел является компактным цифровым отпечатком лица."
    ],
    he: [
      "תמונת הפנים המנורמלת נכנסת לרשת DeepID.",
      "הפילטרים הראשונים מוצאים תבניות מקומיות פשוטות ומקטינים את המפה.",
      "הפילטרים הבאים מחברים תבניות פשוטות למאפייני פנים חזקים יותר.",
      "ה-convolution האחרון שומר מידע מרחבי קומפקטי של הפנים.",
      "השכבות הצפופות מערבבות את המאפיינים החשובים לייצוג פנימי אחד.",
      "ה-embedding הסופי בן 160 מספרים הוא טביעת האצבע הדיגיטלית של הפנים."
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
      "Это новый вектор лица, который выдала нейросеть.",
      "Это сохраненные векторы известных людей из эталонного набора проекта.",
      "Каждый эталон сравнивается с новым вектором через cosine similarity.",
      "Система сохраняет ближайшего человека и второго ближайшего для проверки уверенности."
    ],
    he: [
      "זה וקטור הפנים החדש שהרשת יצרה.",
      "אלו וקטורים שמורים של אנשים מוכרים ממאגר הייחוס של הפרויקט.",
      "כל ייחוס מושווה לווקטור החדש בעזרת cosine similarity.",
      "המערכת שומרת את האדם הקרוב ביותר ואת השני הקרוב ביותר לבדיקת ביטחון."
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
      "Best score показывает, насколько близко самое сильное совпадение.",
      "Runner up показывает ближайшего конкурента среди других людей.",
      "Этот порог отсекает слабые совпадения, которые недостаточно похожи.",
      "Этот порог требует, чтобы победитель был заметно лучше второго результата.",
      "Принимается только уверенное совпадение; иначе результат становится Unknown."
    ],
    he: [
      "Best score מראה כמה ההתאמה החזקה ביותר קרובה.",
      "Runner up מראה מי המתחרה הקרוב ביותר מבין הזהויות.",
      "הסף הזה חוסם התאמות חלשות שאינן דומות מספיק.",
      "הסף הזה דורש שהמנצח יהיה טוב בבירור מהתוצאה השנייה.",
      "רק התאמה בטוחה מתקבלת; אחרת התוצאה היא Unknown."
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
      "Значение true/false говорит интерфейсу, принято ли распознавание.",
      "Выбранное имя возвращается только если проверки уверенности прошли.",
      "Scores добавлены, чтобы результат можно было проверить и настроить.",
      "Ответ записывает, использовался ли GPU/Colab или CPU-путь.",
      "Elapsed time показывает, сколько занял запрос распознавания.",
      "Веб-интерфейс читает этот JSON и показывает один и тот же ответ в простой и интегрированной демонстрации."
    ],
    he: [
      "ערך true/false אומר לממשק אם הזיהוי התקבל.",
      "השם שנבחר מוחזר רק אם בדיקות הביטחון עברו.",
      "הציונים נכללים כדי שאפשר יהיה לבדוק ולכוון את התוצאה.",
      "התשובה מציינת אם נעשה שימוש במסלול GPU/Colab או CPU.",
      "Elapsed time מראה כמה זמן לקחה בקשת הזיהוי.",
      "ממשק הווב קורא את ה-JSON ומציג את אותה תשובה בהדגמה הפשוטה והמשולבת."
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
  if (id === "complex" && !requireLocalBridge("open the integrated local Hive interface")) {
    id = "home";
  }
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
  ru: "Эта строка относится к CUDA/OpenCL-цепочке детектора на выбранном этапе.",
  he: "שורה זו שייכת לשרשרת CUDA/OpenCL של הגלאי בשלב הנבחר."
};

const codeBlankAnnotation = {
  en: "Visual separator between logical parts of the stage.",
  ru: "Визуальный разделитель между логическими частями этапа.",
  he: "מפריד חזותי בין חלקים לוגיים של השלב."
};

const codeLineAnnotations = {
  "01": {
    "// CUDA commands used in this stage": {
      en: "Introduces the CUDA memory commands used to prepare the image tensor for this first stage.",
      ru: "Обозначает CUDA-команды памяти, которые подготавливают тензор изображения на первом этапе.",
      he: "מציין את פקודות הזיכרון של CUDA שמכינות את טנזור התמונה בשלב הראשון."
    },
    "float input[55 * 47 * 3];": {
      en: "Creates the host-side float tensor for one normalized face: 55 by 47 pixels and 3 RGB channels.",
      ru: "Создает тензор float на стороне host для одного нормализованного лица: 55 на 47 пикселей и 3 RGB-канала.",
      he: "יוצר טנזור float בצד ה-host עבור פנים מנורמלות אחת: 55 על 47 פיקסלים ו-3 ערוצי RGB."
    },
    "cudaMalloc(&d_input, 55 * 47 * 3 * sizeof(float));": {
      en: "Allocates GPU memory for exactly the same input tensor before the neural forward pass starts.",
      ru: "Выделяет память GPU под такой же входной тензор перед началом прямого прохода нейросети.",
      he: "מקצה זיכרון GPU לאותו טנזור קלט לפני תחילת המעבר הקדמי של הרשת."
    },
    "cudaMemcpy(d_input, input, bytes, cudaMemcpyHostToDevice);": {
      en: "Copies the prepared face tensor from CPU/host memory into the CUDA device buffer.",
      ru: "Копирует подготовленный тензор лица из памяти CPU/host в буфер CUDA-устройства.",
      he: "מעתיק את טנזור הפנים המוכן מזיכרון CPU/host אל באפר התקן CUDA."
    },
    "// Project meaning:": {
      en: "Starts a short project-specific note, not an executable CUDA command.",
      ru: "Начинает короткое пояснение по проекту; это не исполняемая CUDA-команда.",
      he: "פותח הערה קצרה על הפרויקט; זו אינה פקודת CUDA שמורצת."
    },
    "// the image is only prepared here; the neural kernels start after this buffer exists.": {
      en: "Explains that this stage only prepares input; convolution and dense kernels run after the buffer is ready.",
      ru: "Объясняет, что этот этап только готовит вход; convolution и dense kernels запускаются после готовности буфера.",
      he: "מסביר שהשלב רק מכין קלט; קרנלי convolution ו-dense רצים לאחר שהבאפר מוכן."
    }
  },
  "02": {
    "// CUDA commands used in this stage": {
      en: "Introduces the CUDA-side commands related to crop, resize and normalization.",
      ru: "Обозначает CUDA-команды, связанные с обрезкой, resize и нормализацией.",
      he: "מציין את פקודות CUDA הקשורות לחיתוך, שינוי גודל ונרמול."
    },
    "normalize_rgb(face_crop, input_55x47x3);  // host preprocessing": {
      en: "Normalizes the cropped face on the host so all pixels enter the network in the expected numeric range.",
      ru: "Нормализует вырезанное лицо на host, чтобы пиксели попали в сеть в ожидаемом числовом диапазоне.",
      he: "מנרמל את חיתוך הפנים בצד host כך שכל הפיקסלים ייכנסו לרשת בטווח המספרי הצפוי."
    },
    "cudaMemcpy(d_input, input_55x47x3, bytes, cudaMemcpyHostToDevice);": {
      en: "Uploads the final 55x47x3 tensor to GPU memory after crop, resize and normalization.",
      ru: "Загружает итоговый тензор 55x47x3 в память GPU после обрезки, resize и нормализации.",
      he: "מעלה את הטנזור הסופי 55x47x3 לזיכרון GPU אחרי חיתוך, שינוי גודל ונרמול."
    },
    "// Optional CUDA form for this same step:": {
      en: "Shows how the same preprocessing could be moved from host code into a CUDA kernel.",
      ru: "Показывает, как тот же preprocessing можно перенести из host-кода в CUDA kernel.",
      he: "מציג איך אפשר להעביר אותו עיבוד מקדים מקוד host אל קרנל CUDA."
    },
    "normalize_resize_kernel<<<grid2d, block2d>>>(d_raw, d_input);": {
      en: "Runs one CUDA preprocessing kernel over the image grid to resize and normalize pixels in parallel.",
      ru: "Запускает CUDA-kernel preprocessing по сетке изображения, чтобы параллельно resize и нормализовать пиксели.",
      he: "מריץ קרנל CUDA לעיבוד מקדים על גריד התמונה כדי לשנות גודל ולנרמל פיקסלים במקביל."
    },
    "cudaDeviceSynchronize();": {
      en: "Waits until all GPU work in this stage is complete before the next detector stage reads the buffer.",
      ru: "Ждет завершения всей GPU-работы этого этапа перед тем, как следующий этап детектора читает буфер.",
      he: "ממתין עד שכל עבודת ה-GPU בשלב הזה הסתיימה לפני שהשלב הבא קורא את הבאפר."
    }
  },
  "03": {
    "// CUDA kernels used in the DeepID forward stage": {
      en: "Introduces the CUDA kernel sequence that performs the DeepID neural forward pass.",
      ru: "Обозначает последовательность CUDA kernels для прямого прохода нейросети DeepID.",
      he: "מציין את רצף קרנלי CUDA שמבצע את המעבר הקדמי של רשת DeepID."
    },
    "conv_relu<<<gridConv1, block>>>(d_input, d_w1, d_b1, d_conv1);": {
      en: "Launches the first convolution plus ReLU kernel: threads scan the input face and produce Conv1 feature maps.",
      ru: "Запускает первый convolution + ReLU kernel: потоки сканируют вход лица и создают карты признаков Conv1.",
      he: "מריץ את קרנל convolution+ReLU הראשון: תהליכונים סורקים את קלט הפנים ומפיקים מפות Conv1."
    },
    "max_pool_2x2<<<gridPool1, block>>>(d_conv1, d_pool1);": {
      en: "Downsamples Conv1 features with 2x2 max pooling so the next layer works on a smaller tensor.",
      ru: "Уменьшает карты Conv1 через 2x2 max pooling, чтобы следующий слой работал с меньшим тензором.",
      he: "מקטין את תכונות Conv1 בעזרת 2x2 max pooling כדי שהשכבה הבאה תעבוד על טנזור קטן יותר."
    },
    "conv_relu<<<gridConv2, block>>>(d_pool1, d_w2, d_b2, d_conv2);": {
      en: "Runs the second convolution/ReLU layer over pooled Conv1 features to build stronger face patterns.",
      ru: "Выполняет второй convolution/ReLU слой по pooled Conv1, чтобы собрать более сильные признаки лица.",
      he: "מריץ שכבת convolution/ReLU שנייה מעל Conv1 אחרי pooling כדי לבנות דפוסי פנים חזקים יותר."
    },
    "max_pool_2x2<<<gridPool2, block>>>(d_conv2, d_pool2);": {
      en: "Compresses Conv2 feature maps while keeping the strongest local activations.",
      ru: "Сжимает карты признаков Conv2, сохраняя самые сильные локальные активации.",
      he: "דוחס את מפות Conv2 תוך שמירה על האקטיבציות המקומיות החזקות ביותר."
    },
    "conv_relu<<<gridConv3, block>>>(d_pool2, d_w3, d_b3, d_conv3);": {
      en: "Runs the third convolution/ReLU layer, producing higher-level facial features.",
      ru: "Запускает третий convolution/ReLU слой, который формирует признаки лица более высокого уровня.",
      he: "מריץ שכבת convolution/ReLU שלישית שמפיקה מאפייני פנים ברמה גבוהה יותר."
    },
    "max_pool_2x2<<<gridPool3, block>>>(d_conv3, d_pool3);": {
      en: "Reduces Conv3 spatial size before dense layers, lowering the number of following operations.",
      ru: "Уменьшает пространственный размер Conv3 перед dense layers, снижая число следующих операций.",
      he: "מקטין את הגודל המרחבי של Conv3 לפני שכבות dense ומפחית את כמות הפעולות הבאות."
    },
    "dense<<<gridDense, block>>>(d_pool3, d_fc11_w, d_fc11_b, d_fc11);": {
      en: "Computes the FC11 dense projection from pooled features; each output neuron can be parallelized.",
      ru: "Считает dense-проекцию FC11 из pooled-признаков; каждый выходной нейрон можно параллелить.",
      he: "מחשב את ההטלה הצפופה FC11 מהמאפיינים אחרי pooling; כל נוירון פלט ניתן למקבול."
    },
    "conv_relu<<<gridConv4, block>>>(d_conv3, d_w4, d_b4, d_conv4);": {
      en: "Runs the side Conv4 branch from Conv3, matching the DeepID-style two-branch feature path.",
      ru: "Запускает боковую ветку Conv4 от Conv3, как в DeepID-подобном двухветочном пути признаков.",
      he: "מריץ ענף צדדי Conv4 מתוך Conv3, בהתאם למסלול מאפיינים דו-ענפי בסגנון DeepID."
    },
    "dense<<<gridDense, block>>>(d_conv4, d_fc12_w, d_fc12_b, d_fc12);": {
      en: "Projects the Conv4 branch through FC12 so it can be combined with FC11.",
      ru: "Проецирует ветку Conv4 через FC12, чтобы затем объединить ее с FC11.",
      he: "מקרין את ענף Conv4 דרך FC12 כדי שאפשר יהיה לשלב אותו עם FC11."
    },
    "add_relu_l2<<<1, 256>>>(d_fc11, d_fc12, d_embedding160);": {
      en: "Adds FC11 and FC12, applies ReLU, then L2-normalizes the final 160D face embedding.",
      ru: "Складывает FC11 и FC12, применяет ReLU и L2-нормализует финальный 160D embedding лица.",
      he: "מחבר FC11 ו-FC12, מפעיל ReLU ואז מנרמל L2 את embedding הפנים הסופי בגודל 160D."
    },
    "cudaDeviceSynchronize();": {
      en: "Stops the host from reading the embedding until all neural CUDA kernels finish.",
      ru: "Не дает host читать embedding, пока все нейросетевые CUDA kernels не завершились.",
      he: "מונע מה-host לקרוא את ה-embedding עד שכל קרנלי CUDA של הרשת הסתיימו."
    },
    "__global__ void conv_relu(...) {": {
      en: "Sketches the CUDA kernel body used for convolution plus activation.",
      ru: "Показывает набросок тела CUDA-kernel для convolution плюс activation.",
      he: "מציג שלד של גוף קרנל CUDA עבור convolution ואקטיבציה."
    },
    "int out = blockIdx.x * blockDim.x + threadIdx.x;": {
      en: "Computes the global output index handled by the current CUDA thread.",
      ru: "Вычисляет глобальный индекс выхода, который обрабатывает текущий CUDA-поток.",
      he: "מחשב את אינדקס הפלט הגלובלי שבו מטפל תהליכון CUDA הנוכחי."
    },
    "// one thread accumulates one output pixel/channel": {
      en: "Explains the parallel mapping: one thread accumulates one output activation for a pixel/channel.",
      ru: "Объясняет параллельную раскладку: один поток накапливает одну выходную активацию пикселя/канала.",
      he: "מסביר את המיפוי המקבילי: תהליכון אחד צובר אקטיבציית פלט אחת לפיקסל/ערוץ."
    },
    "}": {
      en: "Closes the CUDA kernel sketch.",
      ru: "Закрывает набросок CUDA-kernel.",
      he: "סוגר את שלד קרנל CUDA."
    },
    "__global__ void dense(...) { /* one thread per output neuron */ }": {
      en: "Sketches the dense-layer kernel where each CUDA thread computes one output neuron.",
      ru: "Показывает dense-layer kernel, где каждый CUDA-поток считает один выходной нейрон.",
      he: "מציג קרנל שכבה צפופה שבו כל תהליכון CUDA מחשב נוירון פלט אחד."
    }
  },
  "04": {
    "// CUDA commands used in the reference comparison stage": {
      en: "Introduces the CUDA commands that compare the new embedding against the reference bank.",
      ru: "Обозначает CUDA-команды, которые сравнивают новый embedding с банком эталонов.",
      he: "מציין את פקודות CUDA שמשוות את ה-embedding החדש מול מאגר הייחוס."
    },
    "cosine_scores<<<referenceCount, 256>>>(d_embedding160, d_refs, d_scores);": {
      en: "Launches one block per saved reference identity to compute cosine similarity against the new embedding.",
      ru: "Запускает один block на каждый сохраненный эталон, чтобы посчитать cosine similarity с новым embedding.",
      he: "מריץ בלוק אחד לכל זהות ייחוס שמורה כדי לחשב cosine similarity מול ה-embedding החדש."
    },
    "top2_reduce<<<1, 256>>>(d_scores, d_best, d_runner_up);": {
      en: "Reduces all similarity scores to the best match and the runner-up match for margin checking.",
      ru: "Сворачивает все similarity scores в лучший результат и второй результат для проверки margin.",
      he: "מצמצם את כל ציוני similarity לתוצאה הטובה ביותר ולמקום השני לצורך בדיקת margin."
    },
    "cudaMemcpy(&best, d_best, sizeof(Result), cudaMemcpyDeviceToHost);": {
      en: "Copies the best identity result from GPU memory back to host code.",
      ru: "Копирует лучший результат идентичности из памяти GPU обратно в host-код.",
      he: "מעתיק את תוצאת הזהות הטובה ביותר מזיכרון GPU חזרה לקוד host."
    },
    "__global__ void cosine_scores(...) {": {
      en: "Begins the CUDA kernel that scores one reference vector per block.",
      ru: "Начинает CUDA-kernel, который считает оценку одного эталонного вектора на block.",
      he: "פותח קרנל CUDA שמחשב ציון של וקטור ייחוס אחד לכל בלוק."
    },
    "int ref = blockIdx.x;": {
      en: "Maps the current CUDA block to one reference identity in the reference bank.",
      ru: "Связывает текущий CUDA-block с одним эталоном из банка reference.",
      he: "ממפה את בלוק CUDA הנוכחי לזהות ייחוס אחת במאגר."
    },
    "float partial = query[threadIdx.x] * refs[ref][threadIdx.x];": {
      en: "Each thread multiplies one embedding component by the matching component of the selected reference.",
      ru: "Каждый поток умножает одну компоненту embedding на соответствующую компоненту выбранного эталона.",
      he: "כל תהליכון מכפיל רכיב embedding אחד ברכיב המתאים של הייחוס שנבחר."
    },
    "// reduce 160 products to one score": {
      en: "The block reduction sums 160 partial products into one cosine similarity score.",
      ru: "Block reduction суммирует 160 частичных произведений в один cosine similarity score.",
      he: "צמצום הבלוק מסכם 160 מכפלות חלקיות לציון cosine similarity אחד."
    },
    "}": {
      en: "Closes the reference-comparison CUDA kernel sketch.",
      ru: "Закрывает набросок CUDA-kernel сравнения с эталонами.",
      he: "סוגר את שלד קרנל CUDA להשוואה מול ייחוסים."
    }
  },
  "05": {
    "// CUDA command if the decision is kept on GPU": {
      en: "Introduces the optional CUDA version of the final threshold decision.",
      ru: "Обозначает опциональную CUDA-версию финального решения по порогам.",
      he: "מציין את גרסת CUDA האופציונלית של החלטת הספים הסופית."
    },
    "decision_kernel<<<1, 1>>>(d_best, min_score, min_margin, d_accepted);": {
      en: "Optionally runs the final accept/reject rule on GPU using the best score and margin thresholds.",
      ru: "Опционально запускает финальное правило accept/reject на GPU по best score и margin thresholds.",
      he: "אופציונלית מריץ את כלל הקבלה/דחייה הסופי על GPU לפי best score וספי margin."
    },
    "cudaMemcpy(&accepted, d_accepted, sizeof(bool), cudaMemcpyDeviceToHost);": {
      en: "Copies the boolean decision flag from GPU memory back to the host response builder.",
      ru: "Копирует булевый флаг решения из памяти GPU обратно в сборщик ответа на host.",
      he: "מעתיק את דגל ההחלטה הבוליאני מזיכרון GPU אל בניית התשובה ב-host."
    },
    "// Same project rule when executed on host:": {
      en: "Shows the exact same project rule when the threshold decision is performed on CPU/host.",
      ru: "Показывает то же самое правило проекта, когда решение по порогам выполняется на CPU/host.",
      he: "מציג את אותו כלל פרויקט כאשר החלטת הספים מתבצעת על CPU/host."
    },
    "accepted = best_score >= min_score &&": {
      en: "The identity is accepted only if the best similarity score reaches the configured minimum.",
      ru: "Имя принимается только если лучший similarity score достигает настроенного минимума.",
      he: "הזהות מתקבלת רק אם ציון similarity הטוב ביותר מגיע למינימום שהוגדר."
    },
    "(best_score - runner_up_score) >= min_margin;": {
      en: "The best match must also be separated from the second match by the required margin.",
      ru: "Лучшее совпадение также должно быть отделено от второго результата нужным margin.",
      he: "ההתאמה הטובה ביותר חייבת להיות מופרדת מהמקום השני לפי ה-margin הנדרש."
    }
  },
  "06": {
    "// CUDA/OpenCL numeric result is already back on host here": {
      en: "Marks the point where GPU numeric work is finished and the host can package the result.",
      ru: "Обозначает момент, где числовая работа GPU завершена и host может упаковать результат.",
      he: "מסמן את הנקודה שבה העבודה המספרית של GPU הסתיימה וה-host יכול לארוז את התוצאה."
    },
    "cudaMemcpy(&host_result, d_result, sizeof(Result), cudaMemcpyDeviceToHost);": {
      en: "Copies the final numeric detector result from GPU memory to host memory.",
      ru: "Копирует финальный числовой результат детектора из памяти GPU в память host.",
      he: "מעתיק את התוצאה המספרית הסופית של הגלאי מזיכרון GPU לזיכרון host."
    },
    "// Web/Colab response object used by the site": {
      en: "Marks the object that the Colab service or local bridge returns to the web interface.",
      ru: "Обозначает объект, который Colab-сервис или локальный bridge возвращает веб-интерфейсу.",
      he: "מסמן את האובייקט ששירות Colab או הגשר המקומי מחזיר לממשק web."
    },
    "return {": {
      en: "Starts the structured JSON-style response used by the simple demo and Hive interface.",
      ru: "Начинает структурированный JSON-подобный ответ для простой демонстрации и Hive-интерфейса.",
      he: "פותח תשובה מובנית בסגנון JSON עבור ההדגמה הפשוטה וממשק Hive."
    },
    "identity, best_score, runner_up, margin,": {
      en: "Returns the recognized name and the scores needed to explain why it was accepted or rejected.",
      ru: "Возвращает распознанное имя и scores, нужные для объяснения принятия или отклонения.",
      he: "מחזיר את השם שזוהה ואת הציונים הדרושים כדי להסביר קבלה או דחייה."
    },
    "backend: mode, elapsed_ms, accepted": {
      en: "Returns which backend ran, how long it took, and whether the result passed thresholds.",
      ru: "Возвращает backend, время выполнения и флаг прохождения порогов.",
      he: "מחזיר איזה backend רץ, כמה זמן זה לקח והאם התוצאה עברה את הספים."
    },
    "};": {
      en: "Closes the response object that the browser displays as detector JSON.",
      ru: "Закрывает объект ответа, который браузер показывает как Detector JSON.",
      he: "סוגר את אובייקט התשובה שהדפדפן מציג כ-Detector JSON."
    }
  }
};

const colabCodePatternAnnotations = [
  [/^# /, {
    en: "Comment from the real Colab detector code block: it names the stage or source file.",
    ru: "Комментарий из реального блока Colab-детектора: он называет этап или исходный файл.",
    he: "הערה מתוך קוד גלאי Colab האמיתי: היא מציינת את השלב או קובץ המקור."
  }],
  [/^from pathlib import Path/, {
    en: "Imports Path so Colab can build reliable file paths for the detector payload.",
    ru: "Подключает Path, чтобы Colab надёжно собирал пути к файлам детектора.",
    he: "מייבא Path כדי ש-Colab יבנה נתיבי קבצים אמינים עבור חבילת הגלאי."
  }],
  [/^import sys, zipfile|^import torch|^from google\.colab import files/, {
    en: "Imports the library used on this line: Python system tools, ZIP extraction, CUDA tensor runtime, or Colab upload.",
    ru: "Подключает библиотеку этой строки: системные инструменты Python, распаковку ZIP, CUDA-тензоры или загрузку Colab.",
    he: "מייבא את הספרייה של השורה: כלי מערכת של Python, חילוץ ZIP, זמן ריצה של CUDA tensors או העלאה ב-Colab."
  }],
  [/^WORK = |^WORK\.mkdir|^payload_name|^payload_path|^sys\.path\.insert/, {
    en: "Sets the working folder or Python import path used by the Colab detector.",
    ru: "Задаёт рабочую папку или путь импорта Python, который использует Colab-детектор.",
    he: "קובע את תיקיית העבודה או נתיב הייבוא של Python שבו משתמש גלאי Colab."
  }],
  [/torch\.cuda\.is_available|torch\.cuda\.get_device_name|return "cuda"|device == "cuda"|torch\.cuda\.synchronize/, {
    en: "This is the CUDA control point: it checks, selects, or synchronizes GPU execution.",
    ru: "Это точка управления CUDA: проверка, выбор или синхронизация выполнения на GPU.",
    he: "זו נקודת הבקרה של CUDA: בדיקה, בחירה או סנכרון של הרצה על GPU."
  }],
  [/files\.upload|zipfile\.ZipFile|extractall|write_bytes/, {
    en: "Loads or extracts the project payload that contains the same detector code and reference data.",
    ru: "Загружает или распаковывает payload проекта с тем же кодом детектора и эталонными данными.",
    he: "טוען או מחלץ את חבילת הפרויקט שמכילה את אותו קוד גלאי ונתוני ייחוס."
  }],
  [/def _preprocess_pil|img\.convert|img\.resize|Image\.new|canvas\.paste|np\.asarray|np\.transpose|torch\.from_numpy/, {
    en: "Preprocessing line: it converts the image into the fixed tensor format passed to CUDA/PyTorch.",
    ru: "Строка preprocessing: превращает картинку в фиксированный тензор, который передаётся в CUDA/PyTorch.",
    he: "שורת עיבוד מקדים: ממירה את התמונה לטנזור קבוע שנשלח אל CUDA/PyTorch."
  }],
  [/def _variants|Image\.open|variants =|for ratio|img\.crop|variants\.append/, {
    en: "Creates recognition variants so the detector can try the full image and several center crops.",
    ru: "Создаёт варианты распознавания: полную картинку и несколько центральных обрезок.",
    he: "יוצר וריאציות זיהוי: תמונה מלאה וכמה חיתוכים מרכזיים."
  }],
  [/class DeepIDTorch|def forward|F\.conv2d|F\.max_pool2d|flatten\(1\) @|F\.normalize|F\.relu/, {
    en: "Neural-network forward line: PyTorch dispatches this operation to CUDA when tensors are on the GPU.",
    ru: "Строка прямого прохода нейросети: PyTorch отправляет эту операцию в CUDA, если тензоры на GPU.",
    he: "שורת מעבר קדמי של הרשת: PyTorch שולח את הפעולה ל-CUDA כאשר הטנזורים על ה-GPU."
  }],
  [/def _embed_variants|torch\.stack|with torch\.inference_mode|model\(x\)\.detach/, {
    en: "Builds a batch tensor and runs inference without training gradients.",
    ru: "Собирает batch-тензор и запускает inference без обучающих градиентов.",
    he: "בונה טנזור אצווה ומריץ inference ללא גרדיאנטים של אימון."
  }],
  [/def load_references|self\.ref_emb|self\.ref_labels|for label|for path|items\.append|labels\.append/, {
    en: "Reference-bank line: it loads known people and stores their embeddings for comparison.",
    ru: "Строка банка эталонов: загружает известных людей и хранит их embeddings для сравнения.",
    he: "שורת מאגר ייחוס: טוענת אנשים מוכרים ושומרת embeddings להשוואה."
  }],
  [/def detect_image|self\._variants|time\.perf_counter|self\._embed_variants|sims = emb @|self\._decide/, {
    en: "Main detection flow: variants become embeddings, then matrix multiplication produces similarity scores.",
    ru: "Основной поток детектора: варианты становятся embeddings, затем матричное умножение даёт similarity scores.",
    he: "זרימת הזיהוי הראשית: וריאציות הופכות ל-embeddings ואז כפל מטריצות יוצר ציוני דמיון."
  }],
  [/def _decide|row_np|best_by_label|ranked|runner|margin|accepted|identity =|return \{/, {
    en: "Decision line: it ranks labels, computes margin, and decides whether the identity is accepted.",
    ru: "Строка решения: ранжирует имена, считает margin и решает, принимать ли identity.",
    he: "שורת החלטה: מדרגת שמות, מחשבת margin ומחליטה אם לקבל את הזהות."
  }],
  [/def detect_file_ui|_DETECTOR_UI_LOCK|detector\.min_score|detector\.detect_image|JSONResponse|@app\.post|UploadFile|NamedTemporaryFile|unlink/, {
    en: "Web API line: it receives an uploaded file, runs the detector, and returns JSON to the site.",
    ru: "Строка Web API: принимает загруженный файл, запускает детектор и возвращает JSON сайту.",
    he: "שורת Web API: מקבלת קובץ שהועלה, מריצה את הגלאי ומחזירה JSON לאתר."
  }],
  [/^\s*(if|for|with|try|finally|break|continue|return|else|elif)\b/, {
    en: "Python control-flow line that chooses a branch, repeats work, protects cleanup, or returns a value.",
    ru: "Строка управления Python: выбирает ветку, повторяет работу, защищает очистку или возвращает значение.",
    he: "שורת בקרת זרימה ב-Python: בוחרת ענף, חוזרת על עבודה, מגנה על ניקוי או מחזירה ערך."
  }],
  [/./, {
    en: "Project code line used by the connected Colab detector for this computation stage.",
    ru: "Строка кода проекта, которую использует подключённый Colab-детектор на этом этапе вычислений.",
    he: "שורת קוד של הפרויקט שבה משתמש גלאי Colab המחובר בשלב החישוב הזה."
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
  if (LOCAL_BRIDGE_ALLOWED && localBridgeUserConfirmed) {
    complexFrame.src = withLocalToken(LOCAL_HIVE_URL);
  } else {
    renderLocalBridgePlaceholder(bridgeHasSavedToken() ? "expired" : "locked");
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
