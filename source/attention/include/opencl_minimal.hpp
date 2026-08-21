#pragma once

#include <cstddef>
#include <cstdint>

// Minimal OpenCL 1.2 ABI declarations. The implementation loads OpenCL.dll
// dynamically, so the local AMD path does not require an external SDK.
using cl_char = std::int8_t;
using cl_uchar = std::uint8_t;
using cl_short = std::int16_t;
using cl_ushort = std::uint16_t;
using cl_int = std::int32_t;
using cl_uint = std::uint32_t;
using cl_long = std::int64_t;
using cl_ulong = std::uint64_t;
using cl_half = std::uint16_t;
using cl_bool = cl_uint;
using cl_bitfield = cl_ulong;
using cl_device_type = cl_bitfield;
using cl_mem_flags = cl_bitfield;
using cl_command_queue_properties = cl_bitfield;
using cl_context_properties = std::intptr_t;
using cl_platform_info = cl_uint;
using cl_device_info = cl_uint;
using cl_program_build_info = cl_uint;
using cl_profiling_info = cl_uint;

struct _cl_platform_id;
struct _cl_device_id;
struct _cl_context;
struct _cl_command_queue;
struct _cl_mem;
struct _cl_program;
struct _cl_kernel;
struct _cl_event;

using cl_platform_id = _cl_platform_id*;
using cl_device_id = _cl_device_id*;
using cl_context = _cl_context*;
using cl_command_queue = _cl_command_queue*;
using cl_mem = _cl_mem*;
using cl_program = _cl_program*;
using cl_kernel = _cl_kernel*;
using cl_event = _cl_event*;

constexpr cl_int CL_SUCCESS = 0;
constexpr cl_bool CL_FALSE = 0;
constexpr cl_bool CL_TRUE = 1;
constexpr cl_device_type CL_DEVICE_TYPE_DEFAULT = 1ULL << 0;
constexpr cl_device_type CL_DEVICE_TYPE_CPU = 1ULL << 1;
constexpr cl_device_type CL_DEVICE_TYPE_GPU = 1ULL << 2;
constexpr cl_device_type CL_DEVICE_TYPE_ACCELERATOR = 1ULL << 3;
constexpr cl_device_type CL_DEVICE_TYPE_ALL = 0xFFFFFFFFULL;

constexpr cl_platform_info CL_PLATFORM_NAME = 0x0902;
constexpr cl_device_info CL_DEVICE_TYPE = 0x1000;
constexpr cl_device_info CL_DEVICE_MAX_COMPUTE_UNITS = 0x1002;
constexpr cl_device_info CL_DEVICE_MAX_WORK_GROUP_SIZE = 0x1004;
constexpr cl_device_info CL_DEVICE_GLOBAL_MEM_SIZE = 0x101F;
constexpr cl_device_info CL_DEVICE_LOCAL_MEM_SIZE = 0x1023;
constexpr cl_device_info CL_DEVICE_NAME = 0x102B;
constexpr cl_device_info CL_DEVICE_VENDOR = 0x102C;

constexpr cl_context_properties CL_CONTEXT_PLATFORM = 0x1084;
constexpr cl_command_queue_properties CL_QUEUE_PROFILING_ENABLE = 1ULL << 1;
constexpr cl_mem_flags CL_MEM_READ_WRITE = 1ULL << 0;
constexpr cl_mem_flags CL_MEM_WRITE_ONLY = 1ULL << 1;
constexpr cl_mem_flags CL_MEM_READ_ONLY = 1ULL << 2;
constexpr cl_program_build_info CL_PROGRAM_BUILD_LOG = 0x1183;
constexpr cl_profiling_info CL_PROFILING_COMMAND_START = 0x1280;
constexpr cl_profiling_info CL_PROFILING_COMMAND_END = 0x1281;

#if defined(_WIN32)
#define CL_API_CALL __stdcall
#else
#define CL_API_CALL
#endif

using PFN_clGetPlatformIDs = cl_int(CL_API_CALL*)(cl_uint, cl_platform_id*, cl_uint*);
using PFN_clGetPlatformInfo = cl_int(CL_API_CALL*)(cl_platform_id, cl_platform_info, std::size_t, void*, std::size_t*);
using PFN_clGetDeviceIDs = cl_int(CL_API_CALL*)(cl_platform_id, cl_device_type, cl_uint, cl_device_id*, cl_uint*);
using PFN_clGetDeviceInfo = cl_int(CL_API_CALL*)(cl_device_id, cl_device_info, std::size_t, void*, std::size_t*);
using PFN_clCreateContext = cl_context(CL_API_CALL*)(const cl_context_properties*, cl_uint, const cl_device_id*, void(CL_API_CALL*)(const char*, const void*, std::size_t, void*), void*, cl_int*);
using PFN_clCreateCommandQueue = cl_command_queue(CL_API_CALL*)(cl_context, cl_device_id, cl_command_queue_properties, cl_int*);
using PFN_clCreateBuffer = cl_mem(CL_API_CALL*)(cl_context, cl_mem_flags, std::size_t, void*, cl_int*);
using PFN_clCreateProgramWithSource = cl_program(CL_API_CALL*)(cl_context, cl_uint, const char**, const std::size_t*, cl_int*);
using PFN_clBuildProgram = cl_int(CL_API_CALL*)(cl_program, cl_uint, const cl_device_id*, const char*, void(CL_API_CALL*)(cl_program, void*), void*);
using PFN_clGetProgramBuildInfo = cl_int(CL_API_CALL*)(cl_program, cl_device_id, cl_program_build_info, std::size_t, void*, std::size_t*);
using PFN_clCreateKernel = cl_kernel(CL_API_CALL*)(cl_program, const char*, cl_int*);
using PFN_clSetKernelArg = cl_int(CL_API_CALL*)(cl_kernel, cl_uint, std::size_t, const void*);
using PFN_clEnqueueWriteBuffer = cl_int(CL_API_CALL*)(cl_command_queue, cl_mem, cl_bool, std::size_t, std::size_t, const void*, cl_uint, const cl_event*, cl_event*);
using PFN_clEnqueueNDRangeKernel = cl_int(CL_API_CALL*)(cl_command_queue, cl_kernel, cl_uint, const std::size_t*, const std::size_t*, const std::size_t*, cl_uint, const cl_event*, cl_event*);
using PFN_clEnqueueReadBuffer = cl_int(CL_API_CALL*)(cl_command_queue, cl_mem, cl_bool, std::size_t, std::size_t, void*, cl_uint, const cl_event*, cl_event*);
using PFN_clFinish = cl_int(CL_API_CALL*)(cl_command_queue);
using PFN_clGetEventProfilingInfo = cl_int(CL_API_CALL*)(cl_event, cl_profiling_info, std::size_t, void*, std::size_t*);
using PFN_clReleaseEvent = cl_int(CL_API_CALL*)(cl_event);
using PFN_clReleaseKernel = cl_int(CL_API_CALL*)(cl_kernel);
using PFN_clReleaseProgram = cl_int(CL_API_CALL*)(cl_program);
using PFN_clReleaseMemObject = cl_int(CL_API_CALL*)(cl_mem);
using PFN_clReleaseCommandQueue = cl_int(CL_API_CALL*)(cl_command_queue);
using PFN_clReleaseContext = cl_int(CL_API_CALL*)(cl_context);
