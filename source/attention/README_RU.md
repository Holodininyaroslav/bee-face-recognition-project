# Курсовой проект: Scaled Dot-Product Attention на CUDA

В этой папке находится самостоятельный пакет сдачи по формуле:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

## Полная проверка одной командой

На Windows с NVIDIA GPU, CUDA Toolkit, CMake и Visual Studio C++ запустите:

```bat
verify_cuda_assignment.bat
```

Команда собирает CPU/CUDA, запускает обязательный случай `N=512`, `d=64`,
сравнивает basic и optimized CUDA с независимым CPU-эталоном и сохраняет CSV.
Скрытого переключения CUDA на CPU нет: отсутствие NVCC или NVIDIA завершает
проверку ошибкой.

## Основные файлы

- `attention_cpu.cpp` - наивный последовательный CPU-эталон.
- `attention_cuda.cu` - обязательные basic и optimized CUDA kernels.
- `CMakeLists.txt` - воспроизводимая сборка.
- `verify_cuda_assignment.bat` - сборка, benchmark, проверка точности и CSV.
- `REPORT_RU.md` - mapping threads, blocks, memory, результаты и узкие места.
- `ASSIGNMENT_COMPLIANCE_RU.md` - таблица соответствия требованиям на русском.
- `results/rtx4060-n512-d64.csv` - проверенный результат RTX 4060.

CPU-буферы `scores/output` и CUDA device-буферы выделяются по одному разу до
warm-up. Основное ускорение считается по полному CUDA end-to-end времени,
включая Host-to-Device и Device-to-Host; CPU-таймер охватывает только
последовательные циклы Attention. Распознавание лиц является дополнительной
демонстрацией и не выдаётся за обязательную реализацию Attention.
