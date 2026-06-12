const COLAB_BASE_URL = "https://b780ca63576abeb03d.gradio.live";
const API_PREFIX = `${COLAB_BASE_URL}/gradio_api`;

const translations = {
  en: {
    kicker: "COLAB GPU / FACE DETECTION / PROJECT INTERFACE",
    title: "Welcome to Bee Face recognition project",
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
    complexKicker: "INTEGRATED MODE",
    complexTitle: "Integrated project interface",
    downloadUrsina: "Ursina installer",
    downloadBeeBoard: "BeeBoard installer",
    downloadPhysical: "Physical installer",
    back: "Back"
  },
  ru: {
    kicker: "COLAB GPU / РАСПОЗНАВАНИЕ ЛИЦ / ИНТЕРФЕЙС ПРОЕКТА",
    title: "Добро пожаловать в Bee Face recognition project",
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
    downloadUrsina: "Ursina инсталлер",
    downloadBeeBoard: "BeeBoard инсталлер",
    downloadPhysical: "Физический инсталлер",
    back: "Назад"
  },
  he: {
    kicker: "COLAB GPU / זיהוי פנים / ממשק פרויקט",
    title: "ברוכים הבאים אל Bee Face recognition project",
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
    downloadUrsina: "מתקין Ursina",
    downloadBeeBoard: "מתקין BeeBoard",
    downloadPhysical: "מתקין פיזי",
    back: "חזרה"
  }
};

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

function setLanguage(lang) {
  const dict = translations[lang] || translations.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (dict[key]) node.textContent = dict[key];
  });
  document.querySelectorAll(".lang").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === id);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
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

async function uploadFile(file) {
  const form = new FormData();
  form.append("files", file, file.name || "image.png");
  const response = await fetch(`${API_PREFIX}/upload`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);
  const uploaded = await response.json();
  if (!uploaded?.[0]) throw new Error("Upload returned no file path.");
  return uploaded[0];
}

function parseSseData(text) {
  const lines = text.split(/\r?\n/);
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error("Detector did not return data.");
  return JSON.parse(dataLine.slice(6));
}

async function runRecognition(file, mode, score, margin) {
  const uploadedPath = await uploadFile(file);
  const payload = {
    data: [
      { path: uploadedPath, orig_name: file.name || "image.png", meta: { _type: "gradio.FileData" } },
      mode,
      score,
      margin
    ]
  };
  const callResponse = await fetch(`${API_PREFIX}/call/recognize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!callResponse.ok) throw new Error(`Recognize call failed: HTTP ${callResponse.status}`);
  const call = await callResponse.json();
  if (!call.event_id) throw new Error("Detector returned no event id.");
  const resultResponse = await fetch(`${API_PREFIX}/call/recognize/${encodeURIComponent(call.event_id)}`);
  if (!resultResponse.ok) throw new Error(`Recognize result failed: HTTP ${resultResponse.status}`);
  const result = parseSseData(await resultResponse.text());
  return { markdown: result[0], json: result[1] };
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
  jsonBox.textContent = JSON.stringify({ ok: false, error: error.message || String(error), backend: COLAB_BASE_URL }, null, 2);
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
    backendStatus.textContent = "Colab connected";
  } catch (error) {
    backendStatus.textContent = "Colab error";
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

imageInput.addEventListener("change", () => renderPreviews(Array.from(imageInput.files || [])));
scoreInput.addEventListener("input", () => { scoreValue.textContent = Number(scoreInput.value).toFixed(2); });
marginInput.addEventListener("input", () => { marginValue.textContent = Number(marginInput.value).toFixed(3).replace(/0$/, ""); });
recognizeButton.addEventListener("click", recognizeSelectedFiles);

setLanguage("en");
renderPreviews([]);
