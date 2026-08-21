# פרויקט קורס: Scaled Dot-Product Attention ב-CUDA

תיקייה זו היא חבילת הגשה עצמאית עבור הנוסחה:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

## אימות מלא בפקודה אחת

ב-Windows עם NVIDIA GPU, CUDA Toolkit, CMake וכלי Visual Studio C++ יש להריץ:

```bat
verify_cuda_assignment.bat
```

הפקודה בונה את מימושי CPU ו-CUDA, מריצה את המקרה הנדרש `N=512`, `d=64`,
משווה את CUDA basic ואת CUDA optimized למימוש CPU עצמאי, ושומרת קובץ CSV.
אין מעבר שקט מ-CUDA ל-CPU: אם NVCC או NVIDIA אינם זמינים, הבדיקה נכשלת.

## קבצים מרכזיים

- `attention_cpu.cpp` - מימוש CPU נאיבי וסדרתי המשמש כ-reference.
- `attention_cuda.cu` - kernels בסיסיים ומתקדמים ב-CUDA.
- `CMakeLists.txt` - בנייה שחוזרת על עצמה.
- `verify_cuda_assignment.bat` - בנייה, benchmark, אימות דיוק ויצירת CSV.
- `REPORT_HE.md` - מיפוי threads, blocks, memory, תוצאות וצווארי בקבוק.
- `ASSIGNMENT_COMPLIANCE_HE.md` - התאמה מפורשת לדרישות המטלה.
- `results/rtx4060-n512-d64.csv` - תוצאה מאומתת על RTX 4060.

ההשוואה הראשית משתמשת בזמן CUDA end-to-end, כולל העברות Host-to-Device
ו-Device-to-Host. זיהוי הפנים הוא הדגמה נוספת ואינו מחליף את מימוש ה-Attention.
