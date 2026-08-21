# Соответствие заданию

Эта папка реализует требуемую формулу:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

## Обязательная CUDA C/C++ реализация

- `attention_cuda.cu` компилируется NVCC, а не запускается как Python-код.
- Базовый вариант разделён на kernels `qk_matmul_basic`, `scale_scores`,
  `row_softmax` и `attention_v_basic`.
- В матричных kernels двумерный grid назначает один CUDA thread одному
  выходному элементу.
- Во всех kernels, где grid может выйти за логические размеры, есть boundary
  checks.
- Стабильный row-wise softmax вычитает максимум строки, а maximum и сумму
  вычисляет reductions в shared memory.
- Device memory управляется через `cudaMalloc`, `cudaMemcpy` и `cudaFree`.
- Оптимизированный вариант использует tiles `16x16` в shared memory и
  объединяет scaling с записью `Q*K^T`.

## Проверка и производительность

- Независимый CPU reference является наивной последовательной C++ реализацией.
- CPU, basic CUDA и optimized CUDA получают одни и те же Q, K, V с seed 2026.
- Каждый CUDA-результат сравнивается с CPU по всем элементам; превышение допуска
  завершает программу с кодом 2.
- `kernel_ms` измеряется CUDA Events, а `end_to_end_ms` включает H2D, kernels,
  synchronization и D2H.
- CPU-буферы `scores/output` и CUDA device-буферы выделяются один раз до
  warm-up; повторные CPU-аллокации не увеличивают заявленный speedup.
- `verify_cuda_assignment.bat` строго собирает NVCC и проверяет обязательный
  случай `N=512`, `d=64`; скрытого перехода на CPU нет.

Распознавание лиц является дополнительной прикладной CUDA-демонстрацией и не
подменяет обязательную реализацию Attention.
