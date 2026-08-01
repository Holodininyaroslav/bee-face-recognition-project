const UI = {
  en: {
    back:"Bee Face project", kicker:"GPU COURSE PROJECT / EXACT EXECUTABLE SOURCE", title:"Scaled Dot-Product Attention",
    lead:"The AMD version runs locally through OpenCL. The NVIDIA version is real CUDA C++ source and must be compiled on an NVIDIA GPU or CUDA-enabled Colab. OpenCL is never presented as CUDA.",
    checkFormula:"✓ exact formula", checkKernels:"✓ custom GPU kernels", checkBounds:"✓ boundary checks", checkMemory:"✓ host/device memory", checkTiming:"✓ CPU/GPU timing and error check", verified:"Verified on this computer",
    implementationKicker:"SOURCE IMPLEMENTATION", implementationTitle:"Choose the code path to inspect", openclButton:"AMD / OpenCL (locally verified)", cudaButton:"NVIDIA / CUDA C++",
    stagesKicker:"SIX EXACT STAGES", stagesTitle:"From input matrices to the verified result", stagesLead:"Every stage is a contiguous part of the selected real source. The six full stages concatenate to the complete listing below without omitted lines.",
    closeStage:"Close stage", shortCode:"Short essential version", fullStageCode:"Full exact stage", fullKicker:"COMPLETE SELECTED SOURCE", fullTitle:"All six stages as one continuous listing",
    fullLead:"This is the same source used above. Each row has a line-specific explanation; executable code remains unchanged and in its original programming language.", rawSource:"Open primary raw source", download:"Download CPU/OpenCL/CUDA project", showFull:"Show complete annotated source", hideFull:"Hide complete source",
    runtimeTitle:"Face-recognition runtime used by Hive", runtimeText:"The local GPU path uses one persistent native OpenCL DeepID worker and a CPU YuNet/SFace accuracy verifier. CPU mode uses YuNet/SFace directly. Batch GPU input is submitted to OpenCL as one tensor batch; the backend names report both parts honestly.",
    openStage:"Open exact stage", lines:"lines", audit:"PASS: stage sum equals full source", fullClosed:"Complete source is closed", fullOpen:"Complete annotated source is open"
  },
  ru: {
    back:"Проект распознавания лиц", kicker:"КУРСОВОЙ GPU-ПРОЕКТ / ТОЧНЫЙ ИСПОЛНЯЕМЫЙ ИСХОДНИК", title:"Scaled Dot-Product Attention",
    lead:"Версия для AMD локально работает через OpenCL. Версия для NVIDIA — настоящий исходник CUDA C++, который нужно компилировать на видеокарте NVIDIA или в Colab с CUDA. OpenCL нигде не выдаётся за CUDA.",
    checkFormula:"✓ точная формула", checkKernels:"✓ собственные GPU-ядра", checkBounds:"✓ проверки границ", checkMemory:"✓ память host/device", checkTiming:"✓ время CPU/GPU и проверка ошибки", verified:"Проверено на этом компьютере",
    implementationKicker:"ВАРИАНТ ИСХОДНИКА", implementationTitle:"Выберите вычислительный путь", openclButton:"AMD / OpenCL (проверено локально)", cudaButton:"NVIDIA / CUDA C++",
    stagesKicker:"ШЕСТЬ ТОЧНЫХ ЭТАПОВ", stagesTitle:"От входных матриц до проверенного результата", stagesLead:"Каждый этап — непрерывная часть выбранного реального исходника. Шесть полных этапов без пропусков образуют цельный код внизу.",
    closeStage:"Закрыть этап", shortCode:"Короткая основная версия", fullStageCode:"Полный точный этап", fullKicker:"ПОЛНЫЙ ВЫБРАННЫЙ ИСХОДНИК", fullTitle:"Все шесть этапов одним непрерывным кодом",
    fullLead:"Это тот же исходник, который разделён выше. У каждой строки есть отдельное объяснение; исполняемый код не переведён и не изменён.", rawSource:"Открыть основной raw-исходник", download:"Скачать проект CPU/OpenCL/CUDA", showFull:"Показать полный код с аннотациями", hideFull:"Скрыть полный код",
    runtimeTitle:"Система распознавания лиц, подключённая к Hive", runtimeText:"Локальный GPU-путь использует один постоянный нативный OpenCL-процесс DeepID и CPU-проверку точности YuNet/SFace. CPU-режим напрямую использует YuNet/SFace. Пакет GPU передаётся в OpenCL одним тензорным пакетом; названия backend честно указывают обе части.",
    openStage:"Открыть точный этап", lines:"строк", audit:"PASS: сумма этапов равна полному исходнику", fullClosed:"Полный исходник закрыт", fullOpen:"Полный исходник с аннотациями открыт"
  },
  he: {
    back:"פרויקט זיהוי הפנים", kicker:"פרויקט קורס GPU / קוד מקור מדויק ובר־הרצה", title:"Scaled Dot-Product Attention",
    lead:"גרסת AMD רצה מקומית באמצעות OpenCL. גרסת NVIDIA היא קוד מקור אמיתי ב־CUDA C++ ויש להדר אותה על כרטיס NVIDIA או ב־Colab עם CUDA. OpenCL לעולם אינו מוצג כ־CUDA.",
    checkFormula:"✓ נוסחה מדויקת", checkKernels:"✓ קרנלי GPU מותאמים", checkBounds:"✓ בדיקות גבולות", checkMemory:"✓ זיכרון host/device", checkTiming:"✓ זמני CPU/GPU ובדיקת שגיאה", verified:"נבדק במחשב הזה",
    implementationKicker:"מימוש קוד המקור", implementationTitle:"בחרו את מסלול החישוב לבדיקה", openclButton:"AMD / OpenCL (נבדק מקומית)", cudaButton:"NVIDIA / CUDA C++",
    stagesKicker:"שישה שלבים מדויקים", stagesTitle:"ממטריצות הקלט ועד לתוצאה המאומתת", stagesLead:"כל שלב הוא מקטע רציף מקוד המקור האמיתי שנבחר. ששת השלבים המלאים מתחברים לרשימה המלאה שלמטה ללא שורות חסרות.",
    closeStage:"סגירת השלב", shortCode:"גרסה חיונית קצרה", fullStageCode:"השלב המלא והמדויק", fullKicker:"קוד המקור המלא שנבחר", fullTitle:"כל ששת השלבים כרשימת קוד רציפה אחת",
    fullLead:"זהו אותו קוד מקור שמחולק למעלה. לכל שורה הסבר ייעודי; הקוד בר־ההרצה נשאר ללא תרגום וללא שינוי.", rawSource:"פתיחת קוד המקור הראשי", download:"הורדת פרויקט CPU/OpenCL/CUDA", showFull:"הצגת הקוד המלא עם הסברים", hideFull:"הסתרת הקוד המלא",
    runtimeTitle:"מערכת זיהוי הפנים המחוברת ל־Hive", runtimeText:"מסלול ה־GPU המקומי משתמש בתהליך DeepID ילידי וקבוע של OpenCL ובמאמת דיוק YuNet/SFace על CPU. מצב CPU משתמש ישירות ב־YuNet/SFace. קלט אצווה ל־GPU נשלח ל־OpenCL כאצוות טנזורים אחת; שמות ה־backend מציינים ביושר את שני החלקים.",
    openStage:"פתיחת השלב המדויק", lines:"שורות", audit:"PASS: סכום השלבים שווה לקוד המקור המלא", fullClosed:"קוד המקור המלא סגור", fullOpen:"קוד המקור המלא עם ההסברים פתוח"
  }
};

const IMPLEMENTATIONS = {
  opencl: {
    description: {
      en:"The executable local path: a naive CPU reference plus basic and optimized OpenCL kernels. Device discovery selects the discrete Radeon by compute-unit count and reports it by its real OpenCL name.",
      ru:"Исполняемый локальный путь: наивная CPU-эталонная версия, обычные и оптимизированные ядра OpenCL. Выбор устройства предпочитает дискретную Radeon по числу compute units и показывает её настоящее OpenCL-имя.",
      he:"המסלול המקומי בר־ההרצה: מימוש CPU נאיבי לייחוס לצד קרנלי OpenCL בסיסיים וממוטבים. בחירת ההתקן מעדיפה את Radeon הנפרד לפי מספר יחידות החישוב ומציגה את שמו האמיתי ב־OpenCL."
    },
    files:["source/attention/main.cpp","source/attention/attention_cpu.cpp","source/attention/attention_opencl.cpp","source/attention/attention.cl"],
    raw:"source/attention/attention_opencl.cpp",
    anchors:["__FILE__:main.cpp","__FILE__:attention_cpu.cpp","__FILE__:attention_opencl.cpp","OpenClResult scaled_dot_product_attention_opencl(","__FILE__:attention.cl","__kernel void attention_v_basic("],
    stages:[
      ["CLI, dimensions and input matrices","Параметры запуска, размеры и входные матрицы","ארגומנטים, ממדים ומטריצות קלט"],
      ["Independent CPU reference","Независимая эталонная CPU-версия","מימוש CPU עצמאי לייחוס"],
      ["OpenCL runtime and device discovery","Среда OpenCL и выбор устройства","סביבת OpenCL ובחירת התקן"],
      ["Buffers, launches, timing and readback","Буферы, запуск, замеры и чтение результата","באפרים, הפעלה, מדידה וקריאת תוצאה"],
      ["QKᵀ, scaling and stable softmax kernels","Ядра QKᵀ, масштабирования и стабильного softmax","קרנלי QKᵀ, קנה מידה ו־softmax יציב"],
      ["Probability × V and tiled optimization","Умножение вероятностей на V и tiled-оптимизация","כפל הסתברויות ב־V ואופטימיזציה באריחים"]
    ]
  },
  cuda: {
    description: {
      en:"The required NVIDIA path is actual CUDA C++: explicit cudaMalloc/cudaMemcpy, separate kernels, shared-memory tiling, CUDA Events, CPU verification and a non-zero exit code on numerical failure. It cannot be runtime-tested on this AMD-only computer.",
      ru:"Требуемый путь NVIDIA написан на настоящем CUDA C++: явные cudaMalloc/cudaMemcpy, отдельные ядра, shared-memory tiling, CUDA Events, CPU-проверка и ненулевой код выхода при численной ошибке. На этом компьютере только AMD, поэтому выполнить CUDA здесь невозможно.",
      he:"מסלול NVIDIA הנדרש הוא CUDA C++ אמיתי: הקצאות cudaMalloc והעתקות cudaMemcpy מפורשות, קרנלים נפרדים, ריצוף בזיכרון משותף, CUDA Events, אימות מול CPU וקוד יציאה שאינו אפס בכשל מספרי. אי־אפשר להריץ אותו במחשב זה שבו יש AMD בלבד."
    },
    files:["source/attention/attention_cuda.cu"], raw:"source/attention/attention_cuda.cu",
    anchors:["#include <cuda_runtime.h>","__global__ void qk_matmul_basic(","__global__ void row_softmax(","__global__ void attention_v_basic(","std::vector<float> cpu_attention(","int main("],
    stages:[
      ["CUDA support, constants and error checking","Подключение CUDA, константы и обработка ошибок","תשתית CUDA, קבועים ובדיקת שגיאות"],
      ["QKᵀ and scale kernels","Ядра QKᵀ и масштабирования","קרנלי QKᵀ וקנה מידה"],
      ["Numerically stable row softmax","Численно стабильный построчный softmax","softmax יציב מספרית לכל שורה"],
      ["Output product and shared-memory optimization","Выходное умножение и оптимизация shared memory","כפל הפלט ואופטימיזציה בזיכרון משותף"],
      ["CPU reference, device memory and measured launches","CPU-эталон, память устройства и замеренные запуски","ייחוס CPU, זיכרון התקן והפעלות נמדדות"],
      ["Command line, verification and final result","Параметры, проверка и итоговый результат","שורת פקודה, אימות ותוצאה סופית"]
    ]
  }
};

const FUNCTION_PURPOSE = {
  qk_matmul_basic:["computes one unscaled Q·Kᵀ score per GPU work item","вычисляет одно немасштабированное значение Q·Kᵀ на каждый GPU-поток","מחשב ציון Q·Kᵀ לא־מדורג אחד לכל יחידת עבודה ב־GPU"],
  scale_scores:["divides every score by √d through a precomputed scale","умножает каждую оценку на заранее вычисленный коэффициент 1/√d","מכפיל כל ציון במקדם 1/√d שחושב מראש"],
  row_softmax:["applies stable softmax independently to one matrix row","применяет стабильный softmax независимо к одной строке матрицы","מפעיל softmax יציב בנפרד על שורה אחת במטריצה"],
  attention_v_basic:["computes one output element of probabilities × V","вычисляет один элемент результата probabilities × V","מחשב איבר פלט אחד של probabilities × V"],
  qk_matmul_tiled_scaled:["computes scaled QKᵀ with reusable shared/local-memory tiles","вычисляет масштабированное QKᵀ с повторным использованием блоков shared/local memory","מחשב QKᵀ מדורג באמצעות אריחי זיכרון shared/local לשימוש חוזר"],
  attention_v_tiled:["computes probabilities × V with shared/local-memory tiles","вычисляет probabilities × V блоками shared/local memory","מחשב probabilities × V באמצעות אריחי זיכרון shared/local"],
  cpu_attention:["implements the complete formula on CPU for independent verification","реализует полную формулу на CPU для независимой проверки","מממש את הנוסחה המלאה ב־CPU לצורך אימות עצמאי"],
  scaled_dot_product_attention_cpu:["implements the complete CPU reference path","реализует полный эталонный CPU-путь","מממש את מסלול הייחוס המלא ב־CPU"],
  scaled_dot_product_attention_opencl:["allocates OpenCL resources and executes the selected GPU pipeline","выделяет ресурсы OpenCL и выполняет выбранный GPU-конвейер","מקצה משאבי OpenCL ומריץ את מסלול ה־GPU שנבחר"],
  launch_pipeline:["launches QKᵀ, scaling, softmax and ×V in dependency order","запускает QKᵀ, масштабирование, softmax и ×V в порядке зависимостей","מפעיל QKᵀ, קנה מידה, softmax ו־×V לפי סדר התלויות"],
  run_cuda:["owns CUDA buffers, warm-up, event timing and device-to-host readback","управляет CUDA-буферами, прогревом, замером Events и чтением device-to-host","מנהל באפרי CUDA, חימום, מדידת Events וקריאה מ־device ל־host"],
  compare_outputs:["calculates maximum and mean absolute error against the CPU output","вычисляет максимальную и среднюю абсолютную ошибку относительно CPU-результата","מחשב שגיאה מוחלטת מרבית וממוצעת ביחס לפלט ה־CPU"],
  parse_positive_int:["converts a command-line value to a positive integer and rejects invalid input","преобразует параметр командной строки в положительное целое и отклоняет неверное значение","ממיר ערך משורת הפקודה למספר שלם חיובי ודוחה קלט שגוי"],
  parse_options:["maps every supported command-line flag into the Options structure","переносит каждый поддерживаемый флаг командной строки в структуру Options","ממפה כל דגל נתמך משורת הפקודה אל מבנה Options"],
  print_usage:["prints the exact supported command-line syntax without running attention","печатает точный синтаксис командной строки, не запуская attention","מדפיס את תחביר שורת הפקודה המדויק בלי להריץ attention"],
  enumerate_opencl_devices:["returns the real OpenCL devices reported by every installed platform","возвращает реальные OpenCL-устройства, найденные на всех установленных платформах","מחזיר התקני OpenCL אמיתיים שדווחו מכל הפלטפורמות המותקנות"],
  make_random_matrix:["creates a deterministic float matrix from the supplied dimensions and seed","создаёт детерминированную float-матрицу по указанным размерам и seed","יוצר מטריצת float דטרמיניסטית לפי הממדים וה־seed שסופקו"],
  validate_inputs:["checks matrix sizes and dimensions before any CPU or GPU calculation","проверяет размеры матриц и измерения до любых вычислений CPU или GPU","בודק את גדלי המטריצות והממדים לפני כל חישוב CPU או GPU"],
  main:["parses options, generates Q/K/V, runs implementations and returns PASS or FAIL","разбирает параметры, создаёт Q/K/V, запускает реализации и возвращает PASS или FAIL","מפרש אפשרויות, יוצר Q/K/V, מריץ מימושים ומחזיר PASS או FAIL"]
};

let language="en", implementation="opencl", sources={}, lines=[], stages=[], activeStage=0, codeMode="short", fullVisible=false;
const pick = value => Array.isArray(value) ? value[language==="en"?0:language==="ru"?1:2] : value[language];
const escapeHtml = value => value.replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

async function loadImplementation(){
  const spec=IMPLEMENTATIONS[implementation]; sources={};
  for(const url of spec.files){const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`${response.status} ${url}`);sources[url]=await response.text();}
  if(implementation==="cuda") lines=sources[spec.files[0]].replace(/\r/g,"").split("\n");
  else {
    lines=[];
    for(const url of spec.files){const name=url.split("/").pop();lines.push(`// __FILE__:${name}`,...sources[url].replace(/\r/g,"").split("\n"));}
  }
  const starts=spec.anchors.map(anchor=>{const i=lines.findIndex(line=>line.includes(anchor));if(i<0)throw new Error(`Missing stage anchor: ${anchor}`);return i;});
  stages=starts.map((start,index)=>lines.slice(start,index+1<starts.length?starts[index+1]:lines.length));
  render();
}

function stageText(index){const data=IMPLEMENTATIONS[implementation].stages[index];return data[language==="en"?0:language==="ru"?1:2];}
function stageDescription(index){
  if(implementation==="cuda"){
    const en=["Imports the CUDA runtime, fixes the tile size and turns every CUDA status into a checked failure.","Maps CUDA threads to QKᵀ cells and provides separate basic scaling by 1/√d.","Normalizes each score row on the GPU using maximum subtraction and two stable reductions.","Computes probabilities × V and provides tiled shared-memory kernels for both expensive matrix products.","Builds an independent CPU answer, owns device buffers, performs explicit transfers and times completed CUDA work.","Parses the command line, creates identical inputs, runs CPU and CUDA paths, compares both errors and returns PASS or failure."];
    const ru=["Подключает CUDA runtime, фиксирует размер tile и превращает каждый статус CUDA в проверяемую ошибку.","Сопоставляет CUDA-потоки ячейкам QKᵀ и отдельно реализует обычное масштабирование на 1/√d.","Нормирует каждую строку оценок на GPU: вычитает максимум и выполняет две устойчивые редукции.","Вычисляет probabilities × V и содержит tiled-ядра в shared memory для обоих тяжёлых матричных умножений.","Строит независимый CPU-ответ, управляет device-буферами, явно копирует данные и измеряет завершённую CUDA-работу.","Разбирает командную строку, создаёт одинаковые входы, запускает CPU и CUDA, сравнивает обе ошибки и возвращает PASS либо ошибку."];
    const he=["טוען את סביבת CUDA, קובע את גודל האריח והופך כל קוד מצב של CUDA לשגיאה שנבדקת.","ממפה תהליכוני CUDA לתאי QKᵀ ומספק קרנל בסיסי נפרד לכפל ב־1/√d.","מנרמל כל שורת ציונים ב־GPU באמצעות חיסור המקסימום ושני צמצומים יציבים.","מחשב probabilities × V ומספק קרנלים מרוצפים בזיכרון shared לשני כפלֵי המטריצות הכבדים.","בונה תשובת CPU עצמאית, מנהל באפרי device, מבצע העברות מפורשות ומודד עבודת CUDA שהושלמה.","מפרש את שורת הפקודה, יוצר קלטים זהים, מריץ CPU ו־CUDA, משווה את שתי השגיאות ומחזיר PASS או כשל."];
    return (language==="en"?en:language==="ru"?ru:he)[index];
  }
  const en=["Establishes the data, dimensions and execution contract used by every later step.","Produces an independent result that is not allowed to reuse the GPU output.","Loads the runtime, enumerates real devices and prepares the selected accelerator.","Allocates buffers, transfers Q/K/V, launches kernels in order, measures completion and reads the output.","Builds the N×N score matrix, applies 1/√d and normalizes every row without overflow.","Produces the final N×d tensor and shows the tiled implementation that reduces global-memory traffic."];
  const ru=["Задаёт данные, размеры и контракт выполнения для всех последующих шагов.","Получает независимый результат, не используя выходные данные GPU.","Загружает среду, перечисляет реальные устройства и подготавливает выбранный ускоритель.","Выделяет буферы, копирует Q/K/V, по порядку запускает ядра, измеряет завершённую работу и читает результат.","Строит матрицу оценок N×N, применяет 1/√d и нормализует каждую строку без переполнения.","Получает итоговый тензор N×d и показывает tiled-реализацию, уменьшающую обращения к global memory."];
  const he=["מגדיר את הנתונים, הממדים וחוזה ההרצה לכל השלבים הבאים.","מפיק תוצאה עצמאית שאינה משתמשת בפלט ה־GPU.","טוען את סביבת הריצה, מונה התקנים אמיתיים ומכין את המאיץ שנבחר.","מקצה באפרים, מעתיק Q/K/V, מפעיל קרנלים לפי הסדר, מודד השלמה וקורא את הפלט.","בונה מטריצת ציונים N×N, מחיל 1/√d ומנרמל כל שורה ללא גלישה.","מפיק טנזור סופי N×d ומציג מימוש באריחים שמפחית גישות לזיכרון גלובלי."];
  return (language==="en"?en:language==="ru"?ru:he)[index];
}
function substepText(stage,index){
  if(implementation==="cuda"){
    const en=[["Import CUDA runtime","Define tile size","Check every CUDA status","Report file and line"],["Map thread to score","Accumulate Q·K","Write QKᵀ cell","Scale every score"],["Assign one block per row","Reduce row maximum","Reduce exponential sum","Write normalized row"],["Basic probabilities × V","Tiled scaled QKᵀ","Tiled probabilities × V","Guard edges and synchronize"],["Compute CPU reference","Allocate and copy device data","Warm up and time launches","Read back and release"],["Parse N, d and mode","Create identical Q/K/V","Run CPU and CUDA","Compare errors and exit"]];
    const ru=[["Подключить CUDA runtime","Задать размер tile","Проверять каждый статус CUDA","Сообщать файл и строку"],["Сопоставить поток оценке","Накопить Q·K","Записать ячейку QKᵀ","Масштабировать оценки"],["Назначить block строке","Свести строку к максимуму","Свести сумму экспонент","Записать нормированную строку"],["Обычное probabilities × V","Tiled масштабированное QKᵀ","Tiled probabilities × V","Проверять края и синхронизировать"],["Вычислить CPU-эталон","Выделить и скопировать device-данные","Прогреть и измерить запуски","Прочитать и освободить"],["Разобрать N, d и режим","Создать одинаковые Q/K/V","Запустить CPU и CUDA","Сравнить ошибки и завершить"]];
    const he=[["טעינת סביבת CUDA","קביעת גודל האריח","בדיקת כל סטטוס CUDA","דיווח קובץ ושורה"],["מיפוי thread לציון","צבירת Q·K","כתיבת תא QKᵀ","דירוג כל ציון"],["הקצאת block לשורה","צמצום למקסימום השורה","צמצום סכום המעריכים","כתיבת שורה מנורמלת"],["probabilities × V בסיסי","QKᵀ מדורג ומרוצף","probabilities × V מרוצף","בדיקת שוליים וסנכרון"],["חישוב ייחוס CPU","הקצאה והעתקה להתקן","חימום ותזמון הפעלות","קריאה חזרה ושחרור"],["פירוש N, d ומצב","יצירת Q/K/V זהים","הרצת CPU ו־CUDA","השוואת שגיאות וסיום"]];
    return (language==="en"?en:language==="ru"?ru:he)[stage][index];
  }
  const en=[["Read options","Validate N and d","Create Q, K and V","Select requested mode"],["Compute QKᵀ","Scale by 1/√d","Stable row softmax","Multiply by V"],["Load GPU API","Enumerate platforms","Inspect every device","Select discrete GPU"],["Allocate buffers","Copy host to device","Launch and synchronize","Read output and timing"],["One score per work item","Apply scale","Find each row maximum","Normalize exponential sum"],["Load reusable tiles","Accumulate products","Write N×d output","Compare with CPU"]];
  const ru=[["Прочитать параметры","Проверить N и d","Создать Q, K и V","Выбрать режим"],["Вычислить QKᵀ","Применить 1/√d","Стабильный softmax строки","Умножить на V"],["Загрузить GPU API","Перечислить платформы","Проверить устройства","Выбрать дискретный GPU"],["Выделить буферы","Скопировать host → device","Запустить и синхронизировать","Прочитать результат и время"],["Одна оценка на поток","Применить масштаб","Найти максимум строки","Нормировать сумму экспонент"],["Загрузить reusable tiles","Накопить произведения","Записать выход N×d","Сравнить с CPU"]];
  const he=[["קריאת אפשרויות","אימות N ו־d","יצירת Q, K ו־V","בחירת מצב"],["חישוב QKᵀ","החלת 1/√d","softmax יציב לשורה","כפל ב־V"],["טעינת API של GPU","מניית פלטפורמות","בדיקת כל התקן","בחירת GPU נפרד"],["הקצאת באפרים","העתקת host → device","הפעלה וסנכרון","קריאת פלט וזמן"],["ציון אחד לכל יחידת עבודה","החלת קנה מידה","מציאת מקסימום בשורה","נרמול סכום מעריכי"],["טעינת אריחים לשימוש חוזר","צבירת מכפלות","כתיבת פלט N×d","השוואה ל־CPU"]];
  return (language==="en"?en:language==="ru"?ru:he)[stage][index];
}
function substepDetail(stage,index){
  if(implementation==="cuda" && language==="en"){
    return [
      ["Includes cuda_runtime.h so C++ can call the CUDA host API and launch kernels.","Uses a 16×16 tile matching the shared arrays and two-dimensional thread blocks.","CUDA_CHECK sends every returned cudaError_t to cuda_check instead of silently continuing.","cuda_check reports the failing expression, CUDA message, source file and exact line."],
      ["Derives row and column from blockIdx, blockDim and threadIdx, then rejects out-of-range cells.","Loops over d features and accumulates one dot product between a Q row and a K row.","Stores the scalar at scores[row*N+col], producing the N×N matrix.","A separate kernel multiplies each score by the host-computed 1/√d factor."],
      ["Uses one CUDA block for one matrix row; its threads traverse that row by striding.","Each thread finds a partial maximum; shared memory reduces these to one row maximum.","Threads exponentiate score−maximum and a second shared reduction obtains the denominator.","Each thread divides its stored exponential by that denominator, completing stable softmax."],
      ["The basic kernel gives each thread one N×d output element and loops over N probabilities.","Two-dimensional blocks cooperatively cache Q and K tiles before accumulating scaled scores.","Threads cache probability and V tiles, reuse them and accumulate one output element.","Every global access checks bounds, and __syncthreads protects shared-tile replacement."],
      ["Runs the full formula with ordinary C++ loops and stable softmax, independently of CUDA.","cudaMalloc creates Q/K/V, score and output buffers; cudaMemcpy transfers all inputs.","A warm-up precedes measured runs; CUDA Events surround launches and synchronize completion.","Copies the N×d tensor device-to-host, then destroys events and every device buffer."],
      ["Accepts positive N, d and iteration values plus basic or optimized mode.","A fixed seed creates identical N×d Q, K and V values for CPU and GPU.","Times the CPU reference and run_cuda, reporting kernel and end-to-end CUDA time.","Computes maximum and mean error, prints PASS within tolerance and otherwise exits non-zero."]
    ][stage][index];
  }
  if(implementation==="cuda" && language==="ru"){
    return [
      ["Подключает cuda_runtime.h, чтобы C++ вызывал host API CUDA и запускал ядра.","Использует tile 16×16, совпадающий с shared-массивами и двумерными блоками потоков.","CUDA_CHECK передаёт каждый cudaError_t в cuda_check, не позволяя молча продолжить работу.","cuda_check сообщает выражение, текст ошибки CUDA, файл и точный номер строки."],
      ["Получает row и column из blockIdx, blockDim и threadIdx и отбрасывает выход за границы.","Проходит по d признакам и накапливает скалярное произведение строки Q со строкой K.","Записывает число в scores[row*N+col], формируя матрицу N×N.","Отдельное ядро умножает каждую оценку на вычисленный host коэффициент 1/√d."],
      ["Назначает один CUDA-block одной строке; потоки обходят её с заданным шагом.","Каждый поток находит частичный максимум, shared memory сводит их к максимуму строки.","Потоки считают exp(score−maximum), вторая shared-редукция получает знаменатель.","Каждый поток делит свою экспоненту на общий знаменатель, завершая стабильный softmax."],
      ["Обычное ядро назначает потоку один элемент N×d и проходит по N вероятностям.","Двумерные блоки совместно кэшируют tiles Q и K перед накоплением оценок.","Потоки кэшируют tiles вероятностей и V, повторно используют их и накапливают выход.","Каждый global-доступ проверяет границы; __syncthreads защищает замену shared tile."],
      ["Выполняет полную формулу обычными C++-циклами и стабильным softmax независимо от CUDA.","cudaMalloc создаёт буферы Q/K/V, scores и output; cudaMemcpy передаёт входы.","Перед замерами выполняется прогрев; CUDA Events окружают запуски и ждут завершения.","Копирует N×d device-to-host, затем уничтожает Events и все device-буферы."],
      ["Принимает положительные N, d, число итераций и режим basic либо optimized.","Фиксированный seed создаёт одинаковые N×d матрицы Q, K и V для CPU и GPU.","Измеряет CPU-эталон и run_cuda, отдельно показывая kernel и end-to-end время.","Считает max и mean error, печатает PASS в допуске, иначе возвращает ненулевой код."]
    ][stage][index];
  }
  if(implementation==="cuda" && language==="he"){
    return [
      ["כולל cuda_runtime.h כדי ש־C++ יקרא ל־host API של CUDA ויפעיל קרנלים.","משתמש באריח 16×16 התואם למערכי shared ולבלוקים דו־ממדיים של threads.","CUDA_CHECK מעביר כל cudaError_t אל cuda_check ואינו מאפשר להמשיך בשקט.","cuda_check מדווח על הביטוי, הודעת CUDA, הקובץ ומספר השורה המדויק."],
      ["מחשב row ו־column מתוך blockIdx, blockDim ו־threadIdx ודוחה חריגה מהגבולות.","עובר על d תכונות וצובר מכפלה פנימית בין שורת Q לשורת K.","כותב את הסקלר אל scores[row*N+col] וכך יוצר מטריצת N×N.","קרנל נפרד מכפיל כל ציון במקדם 1/√d שחושב ב־host."],
      ["מקצה CUDA block אחד לכל שורה; ה־threads עוברים עליה בקפיצות.","כל thread מוצא מקסימום חלקי ו־shared memory מצמצם למקסימום השורה.","ה־threads מחשבים exp(score−maximum) וצמצום shared שני מחשב את המכנה.","כל thread מחלק את המעריך שלו במכנה המשותף ומשלים softmax יציב."],
      ["הקרנל הבסיסי מקצה לכל thread איבר N×d אחד ועובר על N הסתברויות.","בלוקים דו־ממדיים שומרים יחד אריחי Q ו־K לפני צבירת ציונים.","ה־threads שומרים אריחי הסתברויות ו־V, משתמשים בהם שוב וצוברים פלט.","כל גישה גלובלית בודקת גבולות; __syncthreads מגן על החלפת אריח משותף."],
      ["מריץ את הנוסחה המלאה בלולאות C++ וב־softmax יציב, ללא תלות ב־CUDA.","cudaMalloc יוצר באפרי Q/K/V, ציונים ופלט; cudaMemcpy מעביר את הקלטים.","חימום קודם למדידות; CUDA Events מקיפים את ההפעלות וממתינים לסיום.","מעתיק N×d מההתקן למארח ומשמיד את האירועים ואת כל באפרי ההתקן."],
      ["מקבל N, d ומספר איטרציות חיוביים ומצב basic או optimized.","seed קבוע יוצר מטריצות N×d זהות של Q, K ו־V עבור CPU ו־GPU.","מודד ייחוס CPU ואת run_cuda ומציג בנפרד זמן kernel ו־end-to-end.","מחשב max ו־mean error, מדפיס PASS בתוך הסבילות ואחרת מחזיר קוד כשל."]
    ][stage][index];
  }
  const en=[
    ["Parses N, d, iteration count, device and implementation flags.","Rejects zero or negative dimensions before allocating a matrix.","Creates deterministic N×d float matrices so CPU and GPU receive identical values.","Chooses CPU, basic GPU, optimized GPU or both without relabelling the backend."],
    ["Calculates every dot product between one Q row and one K row.","Multiplies each score by the exact factor 1/√d.","Subtracts the row maximum, exponentiates and divides by the row sum.","Combines normalized attention probabilities with every feature column of V."],
    ["Loads the OpenCL entry points from the installed driver at runtime.","Requests all OpenCL platforms exposed by the driver.","Reads device type, name, memory sizes and compute-unit count for each candidate.","Selects the GPU with the highest compute-unit count, which is gfx1012 on this computer."],
    ["Creates device buffers sized exactly for Q, K, V, N×N scores and N×d output.","Enqueues explicit host-to-device writes for the three input matrices.","Sets every kernel argument, enqueues dependent kernels and waits for completed events.","Reads N×d floats back to host and reports kernel and end-to-end time separately."],
    ["Maps one global work item to one row/column score with an explicit bounds check.","Applies the scale in a separate basic kernel or fuses it into the optimized QK kernel.","Reduces a row to its maximum in local/shared memory before exponentiation.","Reduces exponentials to a sum and divides every row element by that same sum."],
    ["Cooperatively loads probability and V tiles so multiple threads reuse each value.","Accumulates tile products in a private scalar and synchronizes before replacing a tile.","Writes only when row<N and feature<d, producing exactly N×d values.","Computes maximum and mean absolute error and fails the program if tolerance is exceeded."]
  ];
  const ru=[
    ["Разбирает N, d, число повторов, устройство и вариант реализации.","Отклоняет нулевые и отрицательные размеры до выделения матриц.","Создаёт детерминированные float-матрицы N×d, поэтому CPU и GPU получают одинаковые значения.","Выбирает CPU, обычный GPU, оптимизированный GPU или оба варианта без подмены названия backend."],
    ["Вычисляет скалярное произведение каждой строки Q с каждой строкой K.","Умножает каждую оценку на точный коэффициент 1/√d.","Вычитает максимум строки, вычисляет экспоненты и делит их на сумму строки.","Объединяет нормированные вероятности attention с каждым столбцом признаков V."],
    ["Во время работы загружает функции OpenCL из установленного драйвера.","Запрашивает все OpenCL-платформы, предоставленные драйвером.","Для каждого кандидата читает тип, имя, объёмы памяти и число compute units.","Выбирает GPU с наибольшим числом compute units — на этом компьютере это gfx1012."],
    ["Создаёт device-буферы точного размера для Q, K, V, оценок N×N и выхода N×d.","Явно ставит в очередь три копирования входных матриц host-to-device.","Задаёт каждый аргумент ядер, запускает зависимые ядра и ждёт завершённых events.","Читает N×d чисел обратно на host и отдельно сообщает kernel и end-to-end время."],
    ["Сопоставляет один global work item одной оценке row/column и явно проверяет границы.","Применяет масштаб отдельным обычным ядром или объединяет его с оптимизированным QK-ядром.","До вычисления экспонент сводит строку к максимуму через local/shared memory.","Сводит экспоненты к сумме и делит каждый элемент строки на одну и ту же сумму."],
    ["Совместно загружает tiles вероятностей и V, чтобы потоки повторно использовали значения.","Накапливает произведения tiles в приватном числе и синхронизируется перед заменой tile.","Записывает только при row<N и feature<d, поэтому получает ровно N×d значений.","Вычисляет max и mean absolute error и завершает программу ошибкой при превышении допуска."]
  ];
  const he=[
    ["מפרש N, d, מספר חזרות, התקן ודגלי מימוש.","דוחה ממדים אפסיים או שליליים לפני הקצאת מטריצה.","יוצר מטריצות float דטרמיניסטיות בגודל N×d כדי ש־CPU ו־GPU יקבלו ערכים זהים.","בוחר CPU, GPU בסיסי, GPU ממוטב או שניהם בלי לשנות את שם ה־backend."],
    ["מחשב מכפלה פנימית בין כל שורת Q לכל שורת K.","מכפיל כל ציון במקדם המדויק 1/√d.","מחסיר את מקסימום השורה, מחשב מעריכים ומחלק בסכום השורה.","משלב את הסתברויות ה־attention המנורמלות עם כל עמודת תכונות של V."],
    ["טוען בזמן ריצה את פונקציות OpenCL מתוך מנהל ההתקן המותקן.","מבקש את כל פלטפורמות OpenCL שמנהל ההתקן חושף.","קורא לכל התקן את הסוג, השם, גדלי הזיכרון ומספר יחידות החישוב.","בוחר את ה־GPU בעל מספר יחידות החישוב הגבוה ביותר — gfx1012 במחשב זה."],
    ["יוצר באפרי device בגודל מדויק עבור Q, K, V, ציוני N×N ופלט N×d.","מכניס לתור שלוש העתקות host-to-device מפורשות של מטריצות הקלט.","מגדיר כל ארגומנט לקרנל, מפעיל קרנלים תלויים וממתין ל־events שהושלמו.","קורא N×d ערכים חזרה ל־host ומדווח בנפרד זמן kernel וזמן end-to-end."],
    ["ממפה יחידת עבודה גלובלית אחת לציון row/column עם בדיקת גבולות מפורשת.","מחיל קנה מידה בקרנל בסיסי נפרד או מאחד אותו עם קרנל QK הממוטב.","מצמצם שורה למקסימום בזיכרון local/shared לפני חישוב המעריכים.","מצמצם את המעריכים לסכום ומחלק כל איבר בשורה באותו סכום."],
    ["טוען בשיתוף אריחים של הסתברויות ושל V כדי שכמה threads ישתמשו שוב בכל ערך.","צובר מכפלות אריחים במשתנה פרטי ומסתנכרן לפני החלפת אריח.","כותב רק כאשר row<N ו־feature<d ולכן מפיק בדיוק N×d ערכים.","מחשב שגיאה מוחלטת מרבית וממוצעת ומכשיל את התוכנית אם הסבילות נחצית."]
  ];
  return (language==="en"?en:language==="ru"?ru:he)[stage][index];
}

function functionContext(all,index){
  const returnType="(?:void|int|double|float|bool|Options|ErrorStats|OpenClResult|std::size_t|std::string|std::vector<[^>]+>|__global__\\s+void|__kernel\\s+void)";
  for(let i=index;i>=0;i--){for(const name of Object.keys(FUNCTION_PURPOSE)){const declaration=new RegExp(`^\\s*${returnType}\\s+${name}\\s*\\(`);if(declaration.test(all[i]))return name;}}
  return implementation.toUpperCase()+" source";
}
function annotation(line,index,all){
  const trimmed=line.trim(), n=index+1, context=functionContext(all,index);
  const L=(en,ru,he)=>language==="en"?en:language==="ru"?ru:he;
  if(!trimmed)return L(`Line ${n} visually separates adjacent declarations; it executes nothing.`,`Строка ${n} визуально разделяет соседние объявления и ничего не выполняет.`,`שורה ${n} מפרידה חזותית בין הצהרות סמוכות ואינה מבצעת דבר.`);
  if(trimmed.startsWith("// __FILE__:")){const f=trimmed.split(":").pop();return L(`The combined listing now begins the exact contents of ${f}.`,`В объединённом листинге здесь начинается точное содержимое файла ${f}.`,`ברשימה המאוחדת מתחיל כאן התוכן המדויק של הקובץ ${f}.`);}
  if(trimmed.startsWith("#include")){const h=trimmed.replace("#include","").trim();return L(`Includes ${h}, making its declarations available to the following C++ source.`,`Подключает ${h}, делая его объявления доступными следующему C++-коду.`,`כולל את ${h} וכך מעמיד את ההצהרות שלו לרשות קוד ה־C++ הבא.`);}
  if(trimmed.startsWith("//")||trimmed.startsWith("# "))return L(`Non-executable comment on line ${n}: ${trimmed.replace(/^\/\/\s*/,"")}`,`Неисполняемый комментарий строки ${n}: ${trimmed.replace(/^\/\/\s*/,"")}`,`הערה שאינה מבוצעת בשורה ${n}: ${trimmed.replace(/^\/\/\s*/,"")}`);
  for(const [name,purpose] of Object.entries(FUNCTION_PURPOSE))if(trimmed.includes(name+"(")||trimmed.includes(name+"<<<"))return L(`This line invokes or declares ${name}; it ${purpose[0]}.`,`Эта строка вызывает или объявляет ${name}; функция ${purpose[1]}.`,`שורה זו מפעילה או מצהירה על ${name}; הקוד ${purpose[2]}.`);
  if(trimmed.includes("cudaMalloc"))return L(`Executes the exact allocation “${trimmed}”: cudaMalloc reserves the requested byte count in NVIDIA device memory and stores its device address through the first argument.`,`Выполняет точное выделение памяти «${trimmed}»: cudaMalloc резервирует указанное число байт в памяти устройства NVIDIA и записывает адрес устройства через первый аргумент.`,`מבצע את ההקצאה המדויקת „${trimmed}”: הפונקציה cudaMalloc מקצה את מספר הבתים המבוקש בזיכרון התקן NVIDIA וכותבת את כתובת ההתקן דרך הארגומנט הראשון.`);
  if(trimmed.includes("cudaMemcpy"))return L(`Executes the exact transfer “${trimmed}”. The final cudaMemcpy kind, ${trimmed.match(/cudaMemcpy[A-Za-z]+/)?.[0]||"shown in the command"}, states whether these named bytes move host-to-device or device-to-host.`,`Выполняет точную передачу «${trimmed}». Последний параметр вида cudaMemcpy — ${trimmed.match(/cudaMemcpy[A-Za-z]+/)?.[0]||"указанный в команде"} — явно задаёт направление этих байтов: host-to-device либо device-to-host.`,`מבצע את ההעברה המדויקת „${trimmed}”. סוג ה־cudaMemcpy האחרון, ${trimmed.match(/cudaMemcpy[A-Za-z]+/)?.[0]||"המוצג בפקודה"}, קובע במפורש אם הבתים הנקובים עוברים מהמארח להתקן או מההתקן למארח.`);
  if(trimmed.includes("cudaDeviceSynchronize")||trimmed.includes("clFinish"))return L("Blocks the host until all previously submitted GPU work has actually completed.","Останавливает host-поток до фактического завершения всей ранее отправленной работы GPU.","עוצר את ה־host עד שכל עבודת ה־GPU שנשלחה קודם הושלמה בפועל.");
  if(trimmed.startsWith("cudaEvent_t"))return L("Declares a CUDA Event handle and initializes it to null; no GPU event exists until cudaEventCreate receives this handle's address.","Объявляет дескриптор CUDA Event и задаёт ему null; событие GPU ещё не существует, пока cudaEventCreate не получит адрес этого дескриптора.","מצהיר על ידית CUDA Event ומאתחל אותה ל־null; עדיין אין אירוע ב־GPU עד ש־cudaEventCreate יקבל את כתובת הידית.");
  if(trimmed.includes("cudaEventCreate"))return L(`Creates the CUDA Event object named in “${trimmed}”; later timing calls use this event as a GPU timeline marker.`,`Создаёт объект CUDA Event, указанный в «${trimmed}»; последующие вызовы таймера используют его как отметку на временной шкале GPU.`,`יוצר את אובייקט ה־CUDA Event הנקוב ב־„${trimmed}”; קריאות התזמון הבאות משתמשות בו כסמן על ציר הזמן של ה־GPU.`);
  if(trimmed.includes("cudaEventRecord"))return L(`Records the event in “${trimmed}” into the current CUDA stream after all previously submitted work, defining one endpoint of the GPU interval.`,`Ставит событие из «${trimmed}» в текущий CUDA stream после всей ранее отправленной работы, задавая одну границу измеряемого GPU-интервала.`,`רושם את האירוע שב־„${trimmed}” בזרם CUDA הנוכחי אחרי כל העבודה שנשלחה קודם, וכך מגדיר קצה אחד של מרווח זמן ה־GPU.`);
  if(trimmed.includes("cudaEventSynchronize"))return L(`Waits until the GPU reaches the event named in “${trimmed}”, so the measured interval is complete before it is read.`,`Ждёт, пока GPU достигнет события из «${trimmed}», чтобы измеряемый интервал полностью завершился до чтения результата.`,`ממתין עד שה־GPU יגיע לאירוע הנקוב ב־„${trimmed}”, כדי שמרווח המדידה יושלם לפני קריאת התוצאה.`);
  if(trimmed.includes("cudaEventElapsedTime"))return L(`Computes elapsed GPU milliseconds between the two recorded events in “${trimmed}” and writes the result through its first argument.`,`Вычисляет прошедшие GPU-миллисекунды между двумя записанными событиями из «${trimmed}» и записывает результат через первый аргумент.`,`מחשב את מספר מילישניות ה־GPU בין שני האירועים שנרשמו ב־„${trimmed}” וכותב את התוצאה דרך הארגומנט הראשון.`);
  if(trimmed.includes("cudaEventDestroy"))return L(`Destroys the CUDA Event named in “${trimmed}”, releasing the timing resource after its last use.`,`Уничтожает CUDA Event, указанный в «${trimmed}», освобождая ресурс таймера после последнего использования.`,`משמיד את ה־CUDA Event הנקוב ב־„${trimmed}” ומשחרר את משאב התזמון אחרי השימוש האחרון.`);
  if(trimmed.includes("cudaEvent"))return L(`Uses the exact CUDA Event operation “${trimmed}” inside ${context}; this measures completed GPU work rather than CPU submission latency.`,`Выполняет точную операцию CUDA Event «${trimmed}» внутри ${context}; так измеряется завершённая работа GPU, а не задержка отправки с CPU.`,`מבצע את פעולת ה־CUDA Event המדויקת „${trimmed}” בתוך ${context}; כך נמדדת עבודת GPU שהושלמה ולא זמן השליחה מה־CPU.`);
  if(/cl(Create|Enqueue|SetKernelArg|Release|Get|Build|Wait)/.test(trimmed))return L(`Calls the OpenCL runtime in ${context}: the exact operation is “${trimmed}”. Its returned status is checked by the surrounding helper.`,`Вызывает OpenCL внутри ${context}: точная операция — «${trimmed}». Окружающий helper проверяет возвращённый статус.`,`קורא לסביבת OpenCL בתוך ${context}: הפעולה המדויקת היא “${trimmed}”. פונקציית העזר מסביב בודקת את קוד המצב.`);
  if(trimmed.startsWith("if")||trimmed.startsWith("else if")){return L(`Evaluates the exact condition “${trimmed}”; its block runs only when that condition is true.`,`Проверяет точное условие «${trimmed}»; связанный блок выполняется только при истинном результате.`,`בודק את התנאי המדויק “${trimmed}”; הבלוק המשויך רץ רק כאשר התנאי אמת.`);}
  if(trimmed.startsWith("for"))return L(`Inside ${context}, starts the exact loop “${trimmed}”; its initializer chooses the first index, its middle expression is the continuation bound, and its final expression advances that index.`,`Внутри ${context} запускает точный цикл «${trimmed}»: первая часть задаёт начальный индекс, средняя — границу продолжения, последняя — изменение индекса после итерации.`,`בתוך ${context}, מתחיל את הלולאה המדויקת „${trimmed}”: החלק הראשון קובע את האינדקס ההתחלתי, האמצעי הוא תנאי ההמשך, והאחרון מקדם את האינדקס.`);
  if(trimmed.startsWith("return"))return L(`Returns “${trimmed.slice(6).replace(/;$/,"").trim()}” immediately from ${context}.`,`Немедленно возвращает «${trimmed.slice(6).replace(/;$/,"").trim()}» из ${context}.`,`מחזיר מיד את “${trimmed.slice(6).replace(/;$/,"").trim()}” מתוך ${context}.`);
  if(trimmed.startsWith("throw"))return L(`Stops normal execution of ${context} and reports the exact error expression “${trimmed}”.`,`Прерывает обычное выполнение ${context} и сообщает точное выражение ошибки «${trimmed}».`,`עוצר את ההרצה הרגילה של ${context} ומדווח על ביטוי השגיאה המדויק “${trimmed}”.`);
  const assign=trimmed.match(/^(.+?)\s*=\s*(.+);?$/);if(assign&&!trimmed.includes("=="))return L(`Assigns ${assign[1].trim()} from the expression “${assign[2].replace(/;$/,"")}” inside ${context}.`,`Присваивает ${assign[1].trim()} результат выражения «${assign[2].replace(/;$/,"")}» внутри ${context}.`,`מקצה אל ${assign[1].trim()} את תוצאת הביטוי “${assign[2].replace(/;$/,"")}” בתוך ${context}.`);
  if(trimmed==="{"||trimmed.endsWith("{"))return L(`Opens the lexical block for ${context}; declarations inside it follow that scope.`,`Открывает блок области видимости ${context}; следующие объявления принадлежат этому блоку.`,`פותח את תחום הבלוק של ${context}; ההצהרות הבאות שייכות לתחום זה.`);
  if(trimmed.startsWith("}"))return L(`Closes the current lexical block inside ${context}; any trailing token on this line is preserved exactly.`,`Закрывает текущий блок внутри ${context}; возможный завершающий токен строки сохранён без изменений.`,`סוגר את הבלוק הנוכחי בתוך ${context}; כל אסימון מסיים בשורה נשמר בדיוק.`);
  if(trimmed.startsWith("#"))return L(`C/C++ preprocessor directive on line ${n}: “${trimmed}”. It changes compilation, not runtime tensor values.`,`Директива препроцессора C/C++ в строке ${n}: «${trimmed}». Она влияет на компиляцию, а не на значения тензоров во время работы.`,`הנחיית קדם־מעבד C/C++ בשורה ${n}: “${trimmed}”. היא משנה את ההידור ולא את ערכי הטנזורים בזמן הריצה.`);
  return L(`In ${context}, line ${n} executes or declares exactly “${trimmed}”; no hidden operation is implied.`,`Внутри ${context} строка ${n} выполняет или объявляет ровно «${trimmed}»; никакой скрытой операции не подразумевается.`,`בתוך ${context}, שורה ${n} מבצעת או מצהירה בדיוק “${trimmed}”; אין כאן פעולה נסתרת.`);
}

function renderCode(container,codeLines,baseIndex=0){container.innerHTML=codeLines.map((line,i)=>`<div class="code-row"><pre class="code-line"><span class="line-number">${baseIndex+i+1}</span>${escapeHtml(line||" ")}</pre><p class="annotation">${escapeHtml(annotation(line,baseIndex+i,lines))}</p></div>`).join("");}
function shortLines(stageLines){
  const scored=stageLines.map((line,i)=>{const t=line.trim();let score=0;if(!t||/^[{}]+;?$/.test(t)||/^(<<|\?|:|,|\);?$)/.test(t))return null;
    if(t.includes("__FILE__"))score=120;
    else if(/(__kernel|__global__|\bmain\s*\(|OpenClResult\s+|scaled_dot_product_attention|cpu_attention|run_cuda|launch_pipeline)/.test(t))score=110;
    else if(/(cudaMalloc|cudaMemcpy|clCreateBuffer|clEnqueue|clSetKernelArg|compare_outputs|row_softmax|qk_matmul|attention_v)/.test(t))score=95;
    else if(/^(if|for|return|throw)\b/.test(t))score=65;
    else if(/^\/\//.test(t))score=45;
    else if(/[=;]/.test(t))score=30;
    return {line,i,score};
  }).filter(Boolean);
  if(scored.length<=18)return scored;
  return scored.sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,18).sort((a,b)=>a.i-b.i);
}
function render(){
  document.documentElement.lang=language;document.documentElement.dir=language==="he"?"rtl":"ltr";
  document.querySelectorAll("[data-t]").forEach(el=>{const key=el.dataset.t;if(UI[language][key])el.textContent=UI[language][key];});
  document.querySelectorAll(".lang").forEach(b=>b.classList.toggle("active",b.dataset.lang===language));
  document.querySelectorAll(".implementation").forEach(b=>b.classList.toggle("active",b.dataset.implementation===implementation));
  document.getElementById("implementationDescription").textContent=pick(IMPLEMENTATIONS[implementation].description);
  document.getElementById("rawSource").href=IMPLEMENTATIONS[implementation].raw;
  document.getElementById("stageCards").innerHTML=stages.map((stage,i)=>`<article class="stage-card" tabindex="0" data-stage="${i}"><strong>${String(i+1).padStart(2,"0")}</strong><h3>${escapeHtml(stageText(i))}</h3><p>${escapeHtml(stageDescription(i))}</p><span>${UI[language].openStage} · ${stage.length} ${UI[language].lines}</span></article>`).join("");
  document.querySelectorAll(".stage-card").forEach(card=>{const open=()=>openStage(Number(card.dataset.stage));card.onclick=open;card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}};});
  const total=stages.reduce((sum,stage)=>sum+stage.length,0);document.getElementById("lineAudit").textContent=`${UI[language].audit}: ${stages.map(s=>s.length).join(" + ")} = ${total}`;
  document.getElementById("fullMeta").textContent=`${fullVisible?UI[language].fullOpen:UI[language].fullClosed} · ${total} ${UI[language].lines}`;
  document.getElementById("toggleFull").textContent=fullVisible?UI[language].hideFull:UI[language].showFull;
  document.getElementById("fullCode").classList.toggle("hidden",!fullVisible);if(fullVisible)renderCode(document.getElementById("fullCode"),lines);
  if(!document.getElementById("stageDetail").classList.contains("hidden"))renderStage();
}
function openStage(index){activeStage=index;codeMode="short";document.getElementById("stageDetail").classList.remove("hidden");renderStage();document.getElementById("stageDetail").scrollIntoView({behavior:"smooth",block:"start"});}
function renderStage(){
  document.getElementById("stageKicker").textContent=`${UI[language].stagesKicker} / ${String(activeStage+1).padStart(2,"0")}`;
  document.getElementById("stageTitle").textContent=stageText(activeStage);document.getElementById("stageDescription").textContent=stageDescription(activeStage);
  document.getElementById("substeps").innerHTML=[0,1,2,3].map(i=>`<div class="flow-step"><strong>${i+1}</strong><h3>${escapeHtml(substepText(activeStage,i))}</h3><p>${escapeHtml(substepDetail(activeStage,i))}</p></div>`).join("");
  document.querySelectorAll(".code-mode").forEach(b=>b.classList.toggle("active",b.dataset.codeMode===codeMode));
  const stage=stages[activeStage],start=stages.slice(0,activeStage).reduce((s,x)=>s+x.length,0);document.getElementById("stageLineCount").textContent=`${stage.length} ${UI[language].lines}`;
  if(codeMode==="full")renderCode(document.getElementById("stageCode"),stage,start);else{const selected=shortLines(stage);const table=document.getElementById("stageCode");table.innerHTML=selected.map(x=>`<div class="code-row"><pre class="code-line"><span class="line-number">${start+x.i+1}</span>${escapeHtml(x.line)}</pre><p class="annotation">${escapeHtml(annotation(x.line,start+x.i,lines))}</p></div>`).join("");}
}

document.querySelectorAll(".lang").forEach(b=>b.onclick=()=>{language=b.dataset.lang;localStorage.setItem("course-language",language);render();});
document.querySelectorAll(".implementation").forEach(b=>b.onclick=async()=>{implementation=b.dataset.implementation;fullVisible=false;await loadImplementation();});
document.querySelectorAll(".code-mode").forEach(b=>b.onclick=()=>{codeMode=b.dataset.codeMode;renderStage();});
document.getElementById("closeStage").onclick=()=>document.getElementById("stageDetail").classList.add("hidden");
document.getElementById("toggleFull").onclick=()=>{fullVisible=!fullVisible;render();};
language=localStorage.getItem("course-language")||"en";if(!UI[language])language="en";
loadImplementation().catch(error=>{document.getElementById("lineAudit").textContent=`ERROR: ${error.message}`;console.error(error);});
