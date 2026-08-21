# התאמה לדרישות המטלה

- [x] חישוב `Q*K^T` למטריצה בגודל `N*N`.
- [x] Scaling באמצעות `1/sqrt(d)`.
- [x] Softmax יציב לכל שורה עם reductions.
- [x] כפל במטריצה V לקבלת פלט `N*d`.
- [x] מימוש CUDA C/C++ אמיתי בקובץ `.cu`.
- [x] kernels בסיסיים נפרדים לכל שלב.
- [x] grid ו-block דו-ממדיים; thread אחד לכל איבר פלט במכפלות הבסיסיות.
- [x] boundary checks.
- [x] `cudaMalloc`, העברות Host/Device ו-`cudaFree`.
- [x] מימוש מתקדם עם shared-memory tiling ו-fused scaling.
- [x] מימוש CPU נאיבי ועצמאי.
- [x] השוואת CPU, CUDA basic ו-CUDA optimized.
- [x] warm-up, ‏CUDA Events וזמן end-to-end.
- [x] מרחבי העבודה של CPU ומאגרי CUDA מוקצים פעם אחת לפני warm-up, ללא ניפוח
  speedup באמצעות הקצאות CPU חוזרות.
- [x] בדיקת דיוק ו-exit code שאינו אפס בכישלון.
- [x] מקרה הבדיקה הנדרש `N=512`, `d=64` על RTX 4060.
- [x] תוצאות הרצה, speedup ודיון בצווארי בקבוק.
- [x] פקודת אימות אחת: `verify_cuda_assignment.bat`.

הדגמת זיהוי הפנים היא הרחבה בלבד. ההתאמה הפורמלית למטלה מבוססת על מימוש
ה-Attention ב-CUDA ועל תוצאות ה-CPU/CUDA הניתנות לשחזור.
