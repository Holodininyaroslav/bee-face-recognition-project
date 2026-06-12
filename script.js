const translations = {
  en: {
    kicker: "COLAB GPU / FACE DETECTION / PROJECT INTERFACE",
    title: "Welcome to Bee Face recognition project",
    lead: "Upload screenshots, recognize faces through the Colab detector, and inspect the same result stream inside the integrated AI MIPS project view.",
    simple: "Simple demonstration",
    complex: "Complex demonstration integrated into the project",
    toolUrsina: "Ursina game installer",
    toolUrsinaText: "Download the local Ursina game package.",
    toolBeeBoard: "BeeBoard installer",
    toolBeeBoardText: "Download the local BeeBoard interface package.",
    toolPhysical: "Physical simulation installer",
    toolPhysicalText: "Download the local physical simulation package.",
    simpleKicker: "SIMPLE MODE",
    simpleTitle: "Simple face recognition demo",
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
    lead: "Загружайте скриншоты, распознавайте лица через Colab-детектор и смотрите тот же поток результатов в интегрированном AI MIPS проекте.",
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
    complexKicker: "ИНТЕГРИРОВАННЫЙ РЕЖИМ",
    complexTitle: "Интегрированный интерфейс проекта",
    openColabProject: "Открыть Colab проект",
    downloadUrsina: "Ursina инсталлер",
    downloadBeeBoard: "BeeBoard инсталлер",
    downloadPhysical: "Физический инсталлер",
    back: "Назад"
  },
  he: {
    kicker: "COLAB GPU / זיהוי פנים / ממשק פרויקט",
    title: "ברוכים הבאים אל Bee Face recognition project",
    lead: "העלו צילומי מסך, הפעילו זיהוי פנים דרך Colab, וצפו באותו זרם תוצאות בממשק הפרויקט המשולב.",
    simple: "הדגמה פשוטה",
    complex: "הדגמה מורכבת המשולבת בפרויקט",
    toolColab: "מחברת Colab של הפרויקט",
    toolColabText: "פתחו את גרסת CUDA/Colab של הגלאי מהמאגר.",
    toolUrsina: "מתקין משחק Ursina",
    toolUrsinaText: "הורדת חבילת משחק Ursina מקומית.",
    toolBeeBoard: "מתקין BeeBoard",
    toolBeeBoardText: "הורדת חבילת ממשק BeeBoard מקומית.",
    toolPhysical: "מתקין סימולציה פיזית",
    toolPhysicalText: "הורדת חבילת הסימולציה הפיזית המקומית.",
    simpleKicker: "מצב פשוט",
    simpleTitle: "הדגמת זיהוי פנים פשוטה",
    complexKicker: "מצב משולב",
    complexTitle: "ממשק פרויקט משולב",
    openColabProject: "פתח פרויקט Colab",
    downloadUrsina: "מתקין Ursina",
    downloadBeeBoard: "מתקין BeeBoard",
    downloadPhysical: "מתקין פיזי",
    back: "חזרה"
  }
};

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

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.target));
});

document.querySelectorAll(".lang").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

setLanguage("en");
