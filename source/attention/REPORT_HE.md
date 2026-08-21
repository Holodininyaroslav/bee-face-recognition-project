# דוח: Scaled Dot-Product Attention על CPU ועל CUDA

## מטרת הפרויקט

מומשה הנוסחה:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

מקרה הבדיקה הנדרש הוא `N=512`, `d=64`. כל המימושים מקבלים אותן מטריצות
דטרמיניסטיות Q, K ו-V עם seed 2026.

## מימוש CPU

`attention_cpu.cpp` הוא מימוש C++ נאיבי וסדרתי עם לולאות מקוננות. הוא אינו
משתמש ב-CUDA ואינו מקבל תוצאה מה-GPU, ולכן הוא reference עצמאי. למרות שבמחשב
יש Intel Core i9-14900K עם 24 ליבות פיזיות ו-32 מעבדים לוגיים, מימוש ה-reference
רץ ב-thread יחיד, בהתאם לדרישת naive CPU.

## מימוש CUDA בסיסי

1. `qk_matmul_basic`: grid דו-ממדי; כל thread מחשב איבר אחד של `Q*K^T`.
2. `scale_scores`: כל thread מכפיל score אחד ב-`1/sqrt(d)`.
3. `row_softmax`: block אחד של 256 threads לכל שורה. reduction ב-shared memory
   מחשב maximum וסכום; maximum מופחת לפני `exp` לצורך יציבות נומרית.
4. `attention_v_basic`: grid דו-ממדי; כל thread מחשב איבר אחד של `P*V`.

הקצאות מתבצעות באמצעות `cudaMalloc`, ההעתקות באמצעות `cudaMemcpy`, ובכל kernel
שעלול לעבור את הממדים הלוגיים קיימות boundary checks.

## מימוש CUDA מתקדם

`qk_matmul_tiled_scaled` ו-`attention_v_tiled` משתמשים ב-blocks בגודל `16x16`
וב-`__shared__` memory. הנתונים בכל tile נטענים פעם אחת ונעשה בהם שימוש חוזר.
שלב ה-scaling מאוחד עם QK, וכך מצטמצמים accesses ל-global memory ומספר ה-kernels.

## נכונות ומתודולוגיית מדידה

- חמש איטרציות warm-up אינן נמדדות.
- לאחר מכן נמדדות 50 איטרציות לכל מימוש.
- `kernel_ms` נמדד עם CUDA Events.
- `end_to_end_ms` כולל H2D, kernels, synchronization ו-D2H במצב warmed steady-state.
- זמן ה-CPU כולל יצירת vectors זמניים של `scores/output` בכל קריאה למימוש
  הנאיבי. מאגרי ההתקן של CUDA מוקצים פעם אחת לפני ה-warm-up, ולכן זמן CUDA
  מתאר worker מחומם שנעשה בו שימוש חוזר.
- זמן הפעלת התהליך, יצירת CUDA context ואתחול first-use אינם נכללים; זוהי
  השוואת steady-state throughput ולא cold start.
- כל פלט CUDA מושווה איבר-איבר ל-CPU.
- tolerance: `max_abs_error <= 2e-4`; כישלון מחזיר exit code 2.

סביבה: NVIDIA GeForce RTX 4060 8 GB, compute capability 8.9, ‏24 SM,
CUDA Toolkit/NVCC 13.2.

## תוצאות Attention

| מימוש | Kernel ms | End-to-end ms | Speedup לעומת CPU | סטטוס |
|---|---:|---:|---:|---|
| CPU naive | - | 10.6346 | 1.00x | PASS |
| CUDA basic | 0.251794 | 0.350112 | 30.37x | PASS |
| CUDA optimized | 0.114701 | 0.211658 | 50.24x | PASS |

בשני מימושי CUDA התקבל `max_abs_error=4.47035e-08`. התוצאה מוכיחה שההאצה
אינה מתקבלת על חשבון נכונות החישוב.

## צווארי בקבוק

- שני כפליי המטריצות הם מסדר `N^2*d`.
- מטריצת scores מכילה `N^2` איברים ויוצרת עומס על global memory.
- Softmax דורש reductions וסנכרון לכל שורה.
- עבור N קטן, עלויות kernel launch והעברות PCIe מקטינות את ה-speedup.
- גודל tile מוגבל על ידי registers, shared memory ו-occupancy.

## הדגמה נוספת: זיהוי פנים

זיהוי הפנים אינו מחליף את מימוש ה-Attention. הוא מדגים שימוש מעשי ב-batching
על GPU עם אותו manifest קבוע, ללא cache וללא דילוג על חזרות.

| ניסוי | CPU median | CUDA median | Speedup | התאמת labels |
|---|---:|---:|---:|---:|
| 50 פעולות | 1137.15 ms | 555.59 ms | 2.05x | 100% |
| 500 פעולות | 8168.78 ms | 3184.44 ms | 2.57x | 100% |

## שחזור

`verify_cuda_assignment.bat` מבצע בניית NVCC מלאה, מריץ את `N=512,d=64`,
בודק PASS ושומר CSV. אם CUDA אינה זמינה, הבנייה או הדיוק נכשלים, גם הפקודה
נכשלת ואין מעבר שקט ל-CPU.
