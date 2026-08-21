from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs"
OUTPUT.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#071524")
INK = colors.HexColor("#17283B")
BLUE = colors.HexColor("#087FB2")
CYAN = colors.HexColor("#19B6CF")
GOLD = colors.HexColor("#F0B429")
GREEN = colors.HexColor("#16835B")
PALE = colors.HexColor("#EAF3F7")
LINE = colors.HexColor("#B8CAD5")
MUTED = colors.HexColor("#526A7B")

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Consolas", r"C:\Windows\Fonts\consola.ttf"))


CONTENT = {
    "ru": {
        "filename": "Face_Recognition_CUDA_Demo_Guide_RU.pdf",
        "meta_title": "Актуальное руководство по нативному распознаванию лиц CPU/CUDA",
        "eyebrow": "АКТУАЛЬНАЯ НАТИВНАЯ РЕАЛИЗАЦИЯ - 21.08.2026",
        "title": "Распознавание лиц на C++ CPU и CUDA",
        "lead": "Краткое техническое руководство по активному коду Hive: одиночный запуск, batch 50 и batch 500, реальные границы CPU/GPU и измеренное ускорение.",
        "pipeline_title": "Фактический путь одного запроса",
        "pipeline": ["JPEG/PNG", "C++ prep", "YuNet", "5 landmarks", "C++ align", "SFace", "CUDA scores", "Decision"],
        "pipeline_note": "CPU: декодирование, подготовка, разбор YuNet, alignment и решение | GPU: YuNet/SFace через ONNX Runtime CUDA и собственный score kernel",
        "purpose_title": "Что именно доказывает демонстрация",
        "purpose": "Обе версии выполняют одинаковую задачу YuNet + SFace по одним изображениям и эталонам. CPU-версия запускает нейросети строго по одному изображению. CUDA-версия передаёт весь B-image batch в нативные ONNX Runtime CUDA sessions и затем вычисляет матрицу сходства B x N собственным kernel из sface_cuda.cu.",
        "important": "Python не выполняет нейросеть. Он остаётся транспортом HTTP/Ursina. Активные вычислительные процессы - identity_cpu.exe и identity_cuda.exe, собранные из C++ и CUDA C++.",
        "boundary_title": "Где реально работает CPU, а где GPU",
        "boundary_rows": [
            ("Загрузка изображения", "CPU / C++", "image_io.cpp декодирует JPEG/PNG в RGBA."),
            ("Подготовка YuNet", "CPU / C++", "prepare_detection_batch создаёт NCHW BGR тензор и padding."),
            ("YuNet inference", "GPU в CUDA-версии", "Ort::Session использует CUDAExecutionProvider для dynamic batch B."),
            ("Разбор детекций", "CPU / C++", "Код читает 12 выходов YuNet, выбирает лицо и пять landmarks."),
            ("Alignment 112 x 112", "CPU / C++", "align_faces вычисляет similarity transform и bilinear sampling."),
            ("SFace inference", "GPU в CUDA-версии", "Второй Ort::Session создаёт 128D embedding для всего batch."),
            ("Нормализация", "CPU / C++", "Каждый 128D вектор нормализуется до длины 1."),
            ("Cosine scores", "GPU / CUDA C++", "sface_cuda.cu запускает B x N независимых оценок."),
            ("Порог и JSON", "CPU / C++", "Выбираются имя, runner-up, score, margin и accepted."),
        ],
        "honesty": "Важно: текущий код не утверждает, что абсолютно каждый шаг выполняется на GPU. Ускоряются самые тяжёлые нейросетевые графы YuNet/SFace и массовое сравнение embeddings; подготовка, alignment и финальное решение остаются нативным C++ на CPU.",
        "modes_title": "Один и тот же код для 1, 50 и 500",
        "modes_rows": [
            ("1", "Один путь через CUDA provider", "Проверяет правильность и минимальную задержку; массовый параллелизм ещё не заполнен."),
            ("50", "Один dynamic batch B=50", "YuNet/SFace получают 50 элементов за один запрос, затем kernel считает 50 x N оценок."),
            ("500", "Один dynamic batch B=500", "Если используются 50 кадров x10, все 500 позиций проходят нейросети; повторы не пропускаются."),
        ],
        "parallel_title": "Что означает параллельность CUDA",
        "parallel": "Batch 500 не означает 500 отдельных программ и не гарантирует, что все 500 изображений физически исполняются в один такт. ONNX Runtime разбивает свёртки и матричные операции на CUDA kernels, а GPU распределяет тысячи threads по доступным SM. В собственном score kernel запускается двумерный grid: B строк запросов x ceil(N/256) блоков эталонов, по одному score на допустимый thread.",
        "duplicates": "Повтор одного изображения десять раз остаётся десятью заданиями. benchmark_native.ps1 формирует B путей, worker возвращает ровно B результатов, а тест падает при несовпадении count или expected identity.",
        "code_title": "Активные файлы и ключевые команды",
        "code_rows": [
            ("sface_engine.cpp", "options.AppendExecutionProvider_CUDA", "Подключает CUDAExecutionProvider к YuNet и SFace sessions."),
            ("sface_engine.cpp", "yunet.Run(...) / sface.Run(...)", "Запускает два ONNX-графа для полного dynamic batch."),
            ("sface_engine.cpp", "for (...) embed_images({images[index]})", "Создаёт намеренно последовательную CPU-базу: один кадр за один вызов."),
            ("sface_cuda.cu", "cudaMalloc / cudaMemcpy H2D", "Выделяет device-буферы и загружает Bx128 queries и Nx128 references."),
            ("sface_cuda.cu", "cosine_scores_kernel<<<grid, block>>>", "Запускает собственный kernel: block=256, grid=(ceil(N/256), B)."),
            ("sface_cuda.cu", "dot += query[d] * reference[d]", "Один thread выполняет 128 multiply-add для одной пары query/reference."),
            ("sface_cuda.cu", "cudaMemcpy D2H / cudaFree", "Возвращает BxN scores и освобождает все три GPU-буфера."),
            ("sface_identity_cli.cpp", "--serve-tsv", "Держит модели и эталоны загруженными между запросами Hive."),
        ],
        "benchmark_title": "Проверенное сравнение на этом компьютере",
        "hardware": "Intel Core i9-14900K + NVIDIA GeForce RTX 4060. Нативные Release binaries, одинаковые модели, изображения и эталоны, предварительный прогрев каждой формы batch.",
        "benchmark_headers": ["Нагрузка", "C++ CPU последовательно", "C++/CUDA batch", "Ускорение", "Корректность"],
        "benchmark_rows": [
            ["50", "6551,4 мс", "2840,1 мс", "2,31x", "50/50"],
            ["500", "65304,2 мс", "9365,7 мс", "6,97x", "500/500"],
        ],
        "benchmark_note": "Старые цифры Python/PyTorch из предыдущего PDF удалены. Таблица выше относится только к текущим identity_cpu.exe и identity_cuda.exe. Для batch 500 CUDA сокращает время примерно с 65,3 до 9,37 секунды.",
        "why_title": "Почему преимущество растёт с batch",
        "why_rows": [
            ("CPU baseline", "Каждый кадр отдельно проходит YuNet, alignment и SFace; следующая итерация начинается после предыдущей."),
            ("CUDA batch", "Один большой тензор лучше заполняет GPU, а стоимость запуска kernels и runtime распределяется на большее число изображений."),
            ("Score kernel", "Все B x N пары независимы; CUDA назначает отдельный thread каждой допустимой паре."),
            ("Ограничение", "Передачи памяти, host alignment и малые batch уменьшают выигрыш; GPU не обязан быть быстрее для одиночного кадра."),
        ],
        "run_title": "Как воспроизвести",
        "run_steps": [
            "Собрать Release: .\\setup_windows.ps1 -CudnnBin PATH_TO_CUDNN_BIN",
            "Проверить наличие identity_cpu.exe, identity_cuda.exe, ONNX Runtime CUDA DLL, CUDA runtime и cuDNN 9.",
            "Запустить одинаковый тест: .\\benchmark_native.ps1 -RuntimePaths PATH_TO_CUDNN_BIN",
            "Открыть results/native_face_cpu_cuda_results.csv и проверить batch, correct, errors, recognition_ms и images_per_second.",
            "Для Hive оставить AI_MIPS_NATIVE_FACE=1; server.py запускает нативный persistent worker и не выполняет inference в Python.",
        ],
        "conclusion_title": "Итог для защиты проекта",
        "conclusion": "Проект показывает контролируемое сравнение: последовательный C++ CPU против пакетного C++/CUDA на той же задаче. Результат не основан на пропуске повторов или кэше ответов. На RTX 4060 преимущество составляет 2,31x для 50 и 6,97x для 500 распознаваний. Главная причина - пакетное выполнение YuNet/SFace на CUDA и независимое параллельное вычисление B x N cosine scores.",
        "footer": "Native C++ CPU/CUDA face recognition - актуальная версия",
        "page": "Страница",
    },
    "he": {
        "filename": "Face_Recognition_CUDA_Demo_Guide_HE.pdf",
        "meta_title": "מדריך עדכני לזיהוי פנים מקורי ב-CPU וב-CUDA",
        "eyebrow": "מימוש מקורי ועדכני - 21.08.2026",
        "title": "זיהוי פנים ב-C++ CPU וב-CUDA",
        "lead": "מדריך טכני קצר לקוד הפעיל של Hive: הרצה יחידה, batch 50 ו-batch 500, החלוקה האמיתית בין CPU ל-GPU וההאצה שנמדדה.",
        "pipeline_title": "המסלול בפועל של בקשה אחת",
        "pipeline": ["JPEG/PNG", "C++ prep", "YuNet", "5 landmarks", "C++ align", "SFace", "CUDA scores", "Decision"],
        "pipeline_note": "CPU: פענוח, הכנה, פענוח YuNet, יישור והחלטה | GPU: YuNet/SFace דרך ONNX Runtime CUDA ו-score kernel מותאם",
        "purpose_title": "מה ההדגמה מוכיחה",
        "purpose": "שתי הגרסאות מבצעות אותה משימת YuNet + SFace על אותן תמונות ואותם ייחוסים. גרסת CPU מפעילה את הרשתות על תמונה אחת בכל פעם. גרסת CUDA שולחת batch מלא של B תמונות אל ONNX Runtime CUDA sessions מקוריים, ולאחר מכן מחשבת מטריצת דמיון B x N באמצעות kernel מותאם מתוך sface_cuda.cu.",
        "important": "Python אינו מריץ את הרשת. הוא נשאר שכבת תעבורה עבור HTTP/Ursina. תהליכי החישוב הפעילים הם identity_cpu.exe ו-identity_cuda.exe, שנבנו מ-C++ ומ-CUDA C++.",
        "boundary_title": "היכן CPU עובד והיכן GPU עובד בפועל",
        "boundary_rows": [
            ("טעינת תמונה", "CPU / C++", "image_io.cpp מפענח JPEG/PNG ל-RGBA."),
            ("הכנת YuNet", "CPU / C++", "prepare_detection_batch יוצר טנזור NCHW BGR ו-padding."),
            ("YuNet inference", "GPU בגרסת CUDA", "Ort::Session משתמש ב-CUDAExecutionProvider עבור dynamic batch B."),
            ("פענוח זיהויים", "CPU / C++", "הקוד קורא 12 פלטי YuNet ובוחר פנים וחמש נקודות ציון."),
            ("יישור 112 x 112", "CPU / C++", "align_faces מחשב similarity transform ודגימה bilinear."),
            ("SFace inference", "GPU בגרסת CUDA", "Ort::Session השני יוצר embedding בגודל 128D לכל ה-batch."),
            ("נרמול", "CPU / C++", "כל וקטור 128D מנורמל לאורך 1."),
            ("Cosine scores", "GPU / CUDA C++", "sface_cuda.cu משגר B x N חישובי ציון בלתי תלויים."),
            ("סף ו-JSON", "CPU / C++", "נבחרים identity, runner-up, score, margin ו-accepted."),
        ],
        "honesty": "חשוב: הקוד הנוכחי אינו טוען שכל שלב רץ ב-GPU. גרפי הרשת הכבדים YuNet/SFace וההשוואה ההמונית של embeddings מואצים; הכנה, יישור והחלטה סופית נשארים C++ מקורי על CPU.",
        "modes_title": "אותו קוד עבור 1, 50 ו-500",
        "modes_rows": [
            ("1", "מסלול יחיד דרך CUDA provider", "בודק נכונות וזמן השהיה מינימלי; המקביליות עדיין אינה ממלאת את ה-GPU."),
            ("50", "dynamic batch יחיד B=50", "YuNet/SFace מקבלים 50 פריטים בבקשה אחת, ואז ה-kernel מחשב 50 x N ציונים."),
            ("500", "dynamic batch יחיד B=500", "כאשר משתמשים ב-50 frames כפול 10, כל 500 המקומות עוברים ברשת; כפילויות אינן מדולגות."),
        ],
        "parallel_title": "מה פירוש מקביליות CUDA",
        "parallel": "Batch 500 אינו 500 תוכניות נפרדות ואינו מבטיח שכל 500 התמונות מבוצעות פיזית באותו clock. ONNX Runtime מפרק קונבולוציות ופעולות מטריצה ל-CUDA kernels, וה-GPU מחלק אלפי threads בין יחידות SM זמינות. ב-score kernel המותאם משוגר grid דו-ממדי: B שורות שאילתה כפול ceil(N/256) בלוקים של ייחוסים, עם score אחד לכל thread תקין.",
        "duplicates": "חזרה על אותה תמונה עשר פעמים נשארת עשר משימות. benchmark_native.ps1 יוצר B נתיבים, ה-worker מחזיר בדיוק B תוצאות, והבדיקה נכשלת אם count או expected identity אינם תואמים.",
        "code_title": "קבצים פעילים ופקודות מרכזיות",
        "code_rows": [
            ("sface_engine.cpp", "options.AppendExecutionProvider_CUDA", "מחבר CUDAExecutionProvider ל-sessions של YuNet ו-SFace."),
            ("sface_engine.cpp", "yunet.Run(...) / sface.Run(...)", "מריץ את שני גרפי ONNX עבור dynamic batch מלא."),
            ("sface_engine.cpp", "for (...) embed_images({images[index]})", "יוצר בכוונה baseline סדרתי ב-CPU: frame אחד לכל קריאה."),
            ("sface_cuda.cu", "cudaMalloc / cudaMemcpy H2D", "מקצה מאגרי התקן ומעלה queries בגודל Bx128 ו-references בגודל Nx128."),
            ("sface_cuda.cu", "cosine_scores_kernel<<<grid, block>>>", "משגר kernel מותאם: block=256, grid=(ceil(N/256), B)."),
            ("sface_cuda.cu", "dot += query[d] * reference[d]", "thread יחיד מבצע 128 פעולות multiply-add לזוג query/reference אחד."),
            ("sface_cuda.cu", "cudaMemcpy D2H / cudaFree", "מחזיר ציוני BxN ומשחרר את כל שלושת מאגרי ה-GPU."),
            ("sface_identity_cli.cpp", "--serve-tsv", "משאיר מודלים ו-embeddings של ייחוס טעונים בין בקשות Hive."),
        ],
        "benchmark_title": "השוואה מאומתת במחשב זה",
        "hardware": "Intel Core i9-14900K + NVIDIA GeForce RTX 4060. קובצי Release מקוריים, אותם מודלים, תמונות וייחוסים, וחימום מוקדם לכל צורת batch.",
        "benchmark_headers": ["עומס", "C++ CPU סדרתי", "C++/CUDA batch", "האצה", "נכונות"],
        "benchmark_rows": [
            ["50", "6551.4 ms", "2840.1 ms", "2.31x", "50/50"],
            ["500", "65304.2 ms", "9365.7 ms", "6.97x", "500/500"],
        ],
        "benchmark_note": "המספרים הישנים של Python/PyTorch מה-PDF הקודם הוסרו. הטבלה מתייחסת רק ל-identity_cpu.exe ול-identity_cuda.exe הנוכחיים. ב-batch 500 CUDA מקטינה את הזמן מכ-65.3 לכ-9.37 שניות.",
        "why_title": "מדוע היתרון גדל עם batch",
        "why_rows": [
            ("CPU baseline", "כל frame עובר בנפרד דרך YuNet, יישור ו-SFace; האיטרציה הבאה מתחילה אחרי הקודמת."),
            ("CUDA batch", "טנזור גדול ממלא טוב יותר את ה-GPU, ועלות שיגור kernels ו-runtime מתחלקת בין יותר תמונות."),
            ("Score kernel", "כל B x N הזוגות בלתי תלויים; CUDA מקצה thread נפרד לכל זוג תקין."),
            ("מגבלה", "העברות זיכרון, יישור בצד המארח ו-batch קטן מפחיתים את הרווח; GPU אינו חייב להיות מהיר יותר לתמונה יחידה."),
        ],
        "run_title": "כיצד לשחזר",
        "run_steps": [
            "בניית Release: .\\setup_windows.ps1 -CudnnBin PATH_TO_CUDNN_BIN",
            "יש לוודא שקיימים identity_cpu.exe, identity_cuda.exe, ONNX Runtime CUDA DLL, CUDA runtime ו-cuDNN 9.",
            "הרצת אותו מבחן: .\\benchmark_native.ps1 -RuntimePaths PATH_TO_CUDNN_BIN",
            "יש לפתוח results/native_face_cpu_cuda_results.csv ולבדוק batch, correct, errors, recognition_ms ו-images_per_second.",
            "עבור Hive יש להשאיר AI_MIPS_NATIVE_FACE=1; server.py מפעיל worker מקורי ומתמשך ואינו מבצע inference ב-Python.",
        ],
        "conclusion_title": "סיכום להגנת הפרויקט",
        "conclusion": "הפרויקט מציג השוואה מבוקרת: C++ CPU סדרתי מול C++/CUDA ב-batch עבור אותה משימה. התוצאה אינה מבוססת על דילוג כפילויות או על cache של תשובות. ב-RTX 4060 ההאצה היא 2.31x עבור 50 ו-6.97x עבור 500 זיהויים. הסיבה המרכזית היא הרצת YuNet/SFace ב-batch על CUDA וחישוב מקבילי בלתי תלוי של B x N ציוני cosine.",
        "footer": "Native C++ CPU/CUDA face recognition - גרסה עדכנית",
        "page": "עמוד",
    },
}


class Pipeline(Flowable):
    def __init__(self, width: float, labels: list[str], rtl: bool):
        super().__init__()
        self.width = width
        self.labels = labels
        self.rtl = rtl
        self.height = 28 * mm

    def draw(self):
        labels = list(reversed(self.labels)) if self.rtl else self.labels
        gap = 2.2 * mm
        box_width = (self.width - gap * (len(labels) - 1)) / len(labels)
        for index, label in enumerate(labels):
            x = index * (box_width + gap)
            self.canv.setFillColor(NAVY if label in {"JPEG/PNG", "Decision"} else BLUE)
            self.canv.roundRect(x, 8 * mm, box_width, 13 * mm, 1.5 * mm, fill=1, stroke=0)
            self.canv.setFillColor(colors.white)
            self.canv.setFont("Arial-Bold", 6.8)
            self.canv.drawCentredString(x + box_width / 2, 13 * mm, label)
            if index < len(labels) - 1:
                self.canv.setStrokeColor(GOLD)
                self.canv.setLineWidth(1.4)
                self.canv.line(x + box_width, 14.5 * mm, x + box_width + gap, 14.5 * mm)


def build_guide(lang: str) -> Path:
    data = CONTENT[lang]
    rtl = lang == "he"
    align = TA_RIGHT if rtl else TA_LEFT
    base = getSampleStyleSheet()

    body = ParagraphStyle(
        "body",
        parent=base["BodyText"],
        fontName="Arial",
        fontSize=9.2,
        leading=13.2,
        textColor=INK,
        alignment=align,
        wordWrap="RTL" if rtl else None,
        spaceAfter=2.2 * mm,
    )
    small = ParagraphStyle("small", parent=body, fontSize=8.0, leading=10.8, spaceAfter=0)
    title = ParagraphStyle("title", parent=body, fontName="Arial-Bold", fontSize=24, leading=29, textColor=NAVY, spaceAfter=5 * mm)
    lead = ParagraphStyle("lead", parent=body, fontSize=11.2, leading=16, textColor=MUTED, spaceAfter=7 * mm)
    h1 = ParagraphStyle("h1", parent=body, fontName="Arial-Bold", fontSize=15.5, leading=19, textColor=BLUE, spaceBefore=2 * mm, spaceAfter=3 * mm)
    h2 = ParagraphStyle("h2", parent=body, fontName="Arial-Bold", fontSize=11.2, leading=14, textColor=INK, spaceBefore=2 * mm, spaceAfter=1.5 * mm)
    eyebrow = ParagraphStyle("eyebrow", parent=body, fontName="Arial-Bold", fontSize=8.2, textColor=CYAN, spaceAfter=2 * mm)
    callout = ParagraphStyle("callout", parent=body, fontName="Arial-Bold", fontSize=9.5, leading=13.5, borderColor=GOLD, borderWidth=1, borderPadding=8, backColor=colors.HexColor("#FFF6DC"), spaceBefore=2 * mm, spaceAfter=4 * mm)
    code_style = ParagraphStyle("code", parent=small, fontName="Consolas", fontSize=7.4, leading=9.4, alignment=TA_LEFT, wordWrap=None)
    header_style = ParagraphStyle("header", parent=small, fontName="Arial-Bold", textColor=colors.white, alignment=align)

    def p(text: str, style=body):
        return Paragraph(escape(text), style)

    def table(rows, widths, header=True, code_column=None):
        rendered = []
        for row_index, row in enumerate(rows):
            rendered_row = []
            for column_index, value in enumerate(row):
                style = header_style if header and row_index == 0 else (code_style if code_column == column_index else small)
                rendered_row.append(p(str(value), style))
            rendered.append(rendered_row)
        result = Table(rendered, colWidths=widths, repeatRows=1 if header else 0)
        commands = [
            ("GRID", (0, 0), (-1, -1), 0.45, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("BACKGROUND", (0, 1 if header else 0), (-1, -1), colors.white),
        ]
        if header:
            commands.extend([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ])
        result.setStyle(TableStyle(commands))
        return result

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.line(17 * mm, 14 * mm, A4[0] - 17 * mm, 14 * mm)
        canvas.setFont("Arial", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(17 * mm, 9 * mm, data["footer"])
        canvas.drawRightString(A4[0] - 17 * mm, 9 * mm, f'{data["page"]} {doc.page}')
        canvas.restoreState()

    story = [
        Spacer(1, 6 * mm),
        p(data["eyebrow"], eyebrow),
        p(data["title"], title),
        p(data["lead"], lead),
        p(data["pipeline_title"], h2),
        Pipeline(176 * mm, data["pipeline"], rtl),
        p(data["pipeline_note"], small),
        p(data["purpose_title"], h1),
        p(data["purpose"]),
        p(data["important"], callout),
        PageBreak(),
        p(data["boundary_title"], h1),
    ]

    boundary_headers = ["Этап", "Устройство", "Что делает код"] if lang == "ru" else ["שלב", "התקן", "מה הקוד עושה"]
    boundary_rows = [boundary_headers] + [list(row) for row in data["boundary_rows"]]
    story.extend([
        table(boundary_rows, [35 * mm, 38 * mm, 103 * mm]),
        Spacer(1, 3 * mm),
        p(data["honesty"], callout),
        p(data["modes_title"], h1),
    ])
    mode_headers = ["Batch", "Фактический запуск", "Смысл"] if lang == "ru" else ["Batch", "הרצה בפועל", "משמעות"]
    story.extend([
        table([mode_headers] + [list(row) for row in data["modes_rows"]], [20 * mm, 58 * mm, 98 * mm]),
        p(data["parallel_title"], h2),
        p(data["parallel"]),
        p(data["duplicates"], callout),
        PageBreak(),
        p(data["code_title"], h1),
    ])

    code_headers = ["Файл", "Команда", "Точное назначение"] if lang == "ru" else ["קובץ", "פקודה", "תפקיד מדויק"]
    story.extend([
        table([code_headers] + [list(row) for row in data["code_rows"]], [34 * mm, 61 * mm, 81 * mm], code_column=1),
        Spacer(1, 3 * mm),
        p(data["benchmark_title"], h1),
        p(data["hardware"]),
        table([data["benchmark_headers"]] + data["benchmark_rows"], [24 * mm, 43 * mm, 39 * mm, 29 * mm, 41 * mm]),
        p(data["benchmark_note"], callout),
        PageBreak(),
        p(data["why_title"], h1),
    ])

    why_headers = ["Фактор", "Объяснение"] if lang == "ru" else ["גורם", "הסבר"]
    story.extend([
        table([why_headers] + [list(row) for row in data["why_rows"]], [41 * mm, 135 * mm]),
        p(data["run_title"], h1),
    ])
    for index, step in enumerate(data["run_steps"], start=1):
        story.append(table([[str(index), step]], [11 * mm, 165 * mm], header=False))
        story.append(Spacer(1, 1.2 * mm))
    story.extend([
        p(data["conclusion_title"], h1),
        p(data["conclusion"], callout),
    ])

    output = OUTPUT / data["filename"]
    document = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=16 * mm,
        bottomMargin=19 * mm,
        title=data["meta_title"],
        author="Bee Face Recognition Project",
        subject="Native C++ CPU versus CUDA face-recognition demonstration",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return output


if __name__ == "__main__":
    for language in ("ru", "he"):
        print(build_guide(language))
