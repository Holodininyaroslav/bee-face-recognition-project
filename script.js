const COLAB_BASE_URL = "";
const API_PREFIX = COLAB_BASE_URL ? `${COLAB_BASE_URL}/gradio_api` : "";

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
    backToSimple: "Return to simple demonstration",
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
const stagePrev = document.getElementById("stagePrev");
const stageNext = document.getElementById("stageNext");
const stageReturnTop = document.getElementById("stageReturnTop");
const stageReturnBottom = document.getElementById("stageReturnBottom");

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
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === id);
  });
  if (id !== "simple") hideStageDetail();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function localized(value) {
  if (!value || typeof value === "string") return value || "";
  const lang = document.documentElement.lang || "en";
  return value[lang] || value.en || "";
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
  stageCode.textContent = data.code;
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

async function uploadFile(file) {
  if (!API_PREFIX) {
    throw new Error("Colab bridge is disabled for safety. Enable it only when you intentionally start a new Colab/Gradio session.");
  }
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

setLanguage("en");
renderPreviews([]);
