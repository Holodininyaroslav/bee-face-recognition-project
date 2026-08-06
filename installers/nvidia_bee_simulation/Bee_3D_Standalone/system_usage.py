from __future__ import annotations

import ctypes
import os
import threading
from ctypes import wintypes
from statistics import fmean


class _SystemCpuReader:
    """Read total Windows CPU use from the same system time counters used by monitors."""

    def __init__(self) -> None:
        self._kernel32 = None
        self._previous: tuple[int, int] | None = None
        if os.name != "nt":
            return
        try:
            self._kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            self._kernel32.GetSystemTimes.argtypes = (
                ctypes.POINTER(wintypes.FILETIME),
                ctypes.POINTER(wintypes.FILETIME),
                ctypes.POINTER(wintypes.FILETIME),
            )
            self._kernel32.GetSystemTimes.restype = wintypes.BOOL
            self._previous = self._read_times()
        except Exception:
            self._kernel32 = None

    @staticmethod
    def _filetime_value(value: wintypes.FILETIME) -> int:
        return (int(value.dwHighDateTime) << 32) | int(value.dwLowDateTime)

    def _read_times(self) -> tuple[int, int] | None:
        if self._kernel32 is None:
            return None
        idle = wintypes.FILETIME()
        kernel = wintypes.FILETIME()
        user = wintypes.FILETIME()
        if not self._kernel32.GetSystemTimes(
            ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
        ):
            return None
        return self._filetime_value(idle), self._filetime_value(kernel) + self._filetime_value(user)

    def sample(self) -> float | None:
        current = self._read_times()
        previous = self._previous
        self._previous = current
        if current is None or previous is None:
            return None
        idle_delta = current[0] - previous[0]
        total_delta = current[1] - previous[1]
        if total_delta <= 0:
            return None
        busy = max(0, total_delta - idle_delta)
        return max(0.0, min(100.0, busy * 100.0 / total_delta))


class _NvidiaGpuReader:
    """Read whole-device NVIDIA utilization directly from the driver through NVML."""

    class _Utilization(ctypes.Structure):
        _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]

    def __init__(self, index: int = 0) -> None:
        self._nvml = None
        self._handle = ctypes.c_void_p()
        self.name = "NVIDIA GPU"
        if os.name != "nt":
            return
        for library_name in ("nvml.dll", r"C:\Program Files\NVIDIA Corporation\NVSMI\nvml.dll"):
            try:
                self._nvml = ctypes.WinDLL(library_name)
                break
            except OSError:
                continue
        if self._nvml is None:
            return
        try:
            init = getattr(self._nvml, "nvmlInit_v2", self._nvml.nvmlInit)
            get_handle = getattr(
                self._nvml,
                "nvmlDeviceGetHandleByIndex_v2",
                self._nvml.nvmlDeviceGetHandleByIndex,
            )
            init.restype = ctypes.c_int
            get_handle.argtypes = (ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p))
            get_handle.restype = ctypes.c_int
            self._nvml.nvmlDeviceGetUtilizationRates.argtypes = (
                ctypes.c_void_p,
                ctypes.POINTER(self._Utilization),
            )
            self._nvml.nvmlDeviceGetUtilizationRates.restype = ctypes.c_int
            if init() != 0 or get_handle(index, ctypes.byref(self._handle)) != 0:
                self._nvml = None
                return
            self.name = self._read_name()
        except Exception:
            self.close()

    def _read_name(self) -> str:
        if self._nvml is None:
            return self.name
        try:
            get_name = self._nvml.nvmlDeviceGetName
            get_name.argtypes = (ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint)
            get_name.restype = ctypes.c_int
            buffer = ctypes.create_string_buffer(96)
            if get_name(self._handle, buffer, len(buffer)) == 0:
                return buffer.value.decode("utf-8", errors="replace") or self.name
        except Exception:
            pass
        return self.name

    def sample(self) -> float | None:
        if self._nvml is None:
            return None
        utilization = self._Utilization()
        try:
            if self._nvml.nvmlDeviceGetUtilizationRates(self._handle, ctypes.byref(utilization)) == 0:
                return float(max(0, min(100, int(utilization.gpu))))
        except Exception:
            pass
        return None

    def close(self) -> None:
        nvml = self._nvml
        self._nvml = None
        if nvml is None:
            return
        try:
            shutdown = getattr(nvml, "nvmlShutdown")
            shutdown.restype = ctypes.c_int
            shutdown()
        except Exception:
            pass


class ResourceUsageSampler:
    """Measure total CPU/GPU use during one recognition job."""

    def __init__(self, interval: float = 0.12) -> None:
        self.interval = max(0.05, float(interval))
        self._cpu = _SystemCpuReader()
        self._gpu = _NvidiaGpuReader()
        self._cpu_values: list[float] = []
        self._gpu_values: list[float] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="recognition-resource-sampler")
        self._started = False

    def start(self) -> "ResourceUsageSampler":
        if not self._started:
            self._started = True
            first_gpu = self._gpu.sample()
            if first_gpu is not None:
                self._gpu_values.append(first_gpu)
            self._thread.start()
        return self

    def _sample_once(self) -> None:
        cpu = self._cpu.sample()
        gpu = self._gpu.sample()
        if cpu is not None:
            self._cpu_values.append(cpu)
        if gpu is not None:
            self._gpu_values.append(gpu)

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self._sample_once()

    @staticmethod
    def _summary(values: list[float]) -> tuple[float | None, float | None, float | None]:
        if not values:
            return None, None, None
        return values[-1], fmean(values), max(values)

    def stop(self) -> dict[str, object]:
        if self._started:
            self._stop.set()
            self._thread.join(timeout=max(0.5, self.interval * 3.0))
            self._sample_once()
        self._gpu.close()
        cpu_now, cpu_average, cpu_peak = self._summary(self._cpu_values)
        gpu_now, gpu_average, gpu_peak = self._summary(self._gpu_values)
        return {
            "cpu_percent": cpu_now,
            "cpu_average_percent": cpu_average,
            "cpu_peak_percent": cpu_peak,
            "gpu_percent": gpu_now,
            "gpu_average_percent": gpu_average,
            "gpu_peak_percent": gpu_peak,
            "gpu_name": self._gpu.name,
            "sample_count": max(len(self._cpu_values), len(self._gpu_values)),
            "source": "Windows system CPU counters + NVIDIA NVML",
        }
