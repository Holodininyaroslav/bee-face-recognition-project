#include "attention.hpp"
#include "opencl_minimal.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <fstream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <utility>

#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace attention {
namespace {

class OpenClApi {
public:
    OpenClApi() {
#if defined(_WIN32)
        module_ = LoadLibraryW(L"OpenCL.dll");
#else
        module_ = dlopen("libOpenCL.so.1", RTLD_NOW | RTLD_LOCAL);
#endif
        if (module_ == nullptr) {
            throw std::runtime_error("OpenCL runtime library was not found");
        }

        get_platform_ids = load<PFN_clGetPlatformIDs>("clGetPlatformIDs");
        get_platform_info = load<PFN_clGetPlatformInfo>("clGetPlatformInfo");
        get_device_ids = load<PFN_clGetDeviceIDs>("clGetDeviceIDs");
        get_device_info = load<PFN_clGetDeviceInfo>("clGetDeviceInfo");
        create_context = load<PFN_clCreateContext>("clCreateContext");
        create_command_queue = load<PFN_clCreateCommandQueue>("clCreateCommandQueue");
        create_buffer = load<PFN_clCreateBuffer>("clCreateBuffer");
        create_program_with_source = load<PFN_clCreateProgramWithSource>("clCreateProgramWithSource");
        build_program = load<PFN_clBuildProgram>("clBuildProgram");
        get_program_build_info = load<PFN_clGetProgramBuildInfo>("clGetProgramBuildInfo");
        create_kernel = load<PFN_clCreateKernel>("clCreateKernel");
        set_kernel_arg = load<PFN_clSetKernelArg>("clSetKernelArg");
        enqueue_write_buffer = load<PFN_clEnqueueWriteBuffer>("clEnqueueWriteBuffer");
        enqueue_nd_range_kernel = load<PFN_clEnqueueNDRangeKernel>("clEnqueueNDRangeKernel");
        enqueue_read_buffer = load<PFN_clEnqueueReadBuffer>("clEnqueueReadBuffer");
        finish = load<PFN_clFinish>("clFinish");
        get_event_profiling_info = load<PFN_clGetEventProfilingInfo>("clGetEventProfilingInfo");
        release_event = load<PFN_clReleaseEvent>("clReleaseEvent");
        release_kernel = load<PFN_clReleaseKernel>("clReleaseKernel");
        release_program = load<PFN_clReleaseProgram>("clReleaseProgram");
        release_mem_object = load<PFN_clReleaseMemObject>("clReleaseMemObject");
        release_command_queue = load<PFN_clReleaseCommandQueue>("clReleaseCommandQueue");
        release_context = load<PFN_clReleaseContext>("clReleaseContext");
    }

    OpenClApi(const OpenClApi&) = delete;
    OpenClApi& operator=(const OpenClApi&) = delete;

    ~OpenClApi() {
#if defined(_WIN32)
        if (module_ != nullptr) {
            FreeLibrary(module_);
        }
#else
        if (module_ != nullptr) {
            dlclose(module_);
        }
#endif
    }

    PFN_clGetPlatformIDs get_platform_ids = nullptr;
    PFN_clGetPlatformInfo get_platform_info = nullptr;
    PFN_clGetDeviceIDs get_device_ids = nullptr;
    PFN_clGetDeviceInfo get_device_info = nullptr;
    PFN_clCreateContext create_context = nullptr;
    PFN_clCreateCommandQueue create_command_queue = nullptr;
    PFN_clCreateBuffer create_buffer = nullptr;
    PFN_clCreateProgramWithSource create_program_with_source = nullptr;
    PFN_clBuildProgram build_program = nullptr;
    PFN_clGetProgramBuildInfo get_program_build_info = nullptr;
    PFN_clCreateKernel create_kernel = nullptr;
    PFN_clSetKernelArg set_kernel_arg = nullptr;
    PFN_clEnqueueWriteBuffer enqueue_write_buffer = nullptr;
    PFN_clEnqueueNDRangeKernel enqueue_nd_range_kernel = nullptr;
    PFN_clEnqueueReadBuffer enqueue_read_buffer = nullptr;
    PFN_clFinish finish = nullptr;
    PFN_clGetEventProfilingInfo get_event_profiling_info = nullptr;
    PFN_clReleaseEvent release_event = nullptr;
    PFN_clReleaseKernel release_kernel = nullptr;
    PFN_clReleaseProgram release_program = nullptr;
    PFN_clReleaseMemObject release_mem_object = nullptr;
    PFN_clReleaseCommandQueue release_command_queue = nullptr;
    PFN_clReleaseContext release_context = nullptr;

private:
    template <typename Function>
    Function load(const char* name) {
#if defined(_WIN32)
        auto address = GetProcAddress(module_, name);
#else
        auto address = dlsym(module_, name);
#endif
        if (address == nullptr) {
            throw std::runtime_error(std::string("OpenCL function is missing: ") + name);
        }
        return reinterpret_cast<Function>(address);
    }

#if defined(_WIN32)
    HMODULE module_ = nullptr;
#else
    void* module_ = nullptr;
#endif
};

void check(cl_int error, const char* operation) {
    if (error != CL_SUCCESS) {
        throw std::runtime_error(std::string(operation) + " failed with OpenCL error " + std::to_string(error));
    }
}

std::string platform_string(const OpenClApi& api, cl_platform_id platform, cl_platform_info key) {
    std::size_t size = 0;
    check(api.get_platform_info(platform, key, 0, nullptr, &size), "clGetPlatformInfo(size)");
    if (size == 0) {
        return {};
    }
    std::vector<char> buffer(size, '\0');
    check(api.get_platform_info(platform, key, size, buffer.data(), nullptr), "clGetPlatformInfo(value)");
    return std::string(buffer.data());
}

std::string device_string(const OpenClApi& api, cl_device_id device, cl_device_info key) {
    std::size_t size = 0;
    check(api.get_device_info(device, key, 0, nullptr, &size), "clGetDeviceInfo(size)");
    if (size == 0) {
        return {};
    }
    std::vector<char> buffer(size, '\0');
    check(api.get_device_info(device, key, size, buffer.data(), nullptr), "clGetDeviceInfo(value)");
    return std::string(buffer.data());
}

template <typename Value>
Value device_value(const OpenClApi& api, cl_device_id device, cl_device_info key) {
    Value value{};
    check(api.get_device_info(device, key, sizeof(value), &value, nullptr), "clGetDeviceInfo(value)");
    return value;
}

std::string device_type_name(cl_device_type type) {
    if ((type & CL_DEVICE_TYPE_GPU) != 0) {
        return "GPU";
    }
    if ((type & CL_DEVICE_TYPE_CPU) != 0) {
        return "CPU";
    }
    if ((type & CL_DEVICE_TYPE_ACCELERATOR) != 0) {
        return "ACCELERATOR";
    }
    return "OTHER";
}

struct DeviceRecord {
    cl_platform_id platform = nullptr;
    cl_device_id device = nullptr;
    OpenClDeviceInfo info;
};

std::vector<DeviceRecord> enumerate_records(const OpenClApi& api) {
    cl_uint platform_count = 0;
    check(api.get_platform_ids(0, nullptr, &platform_count), "clGetPlatformIDs(count)");
    std::vector<cl_platform_id> platforms(platform_count);
    check(api.get_platform_ids(platform_count, platforms.data(), nullptr), "clGetPlatformIDs(values)");

    std::vector<DeviceRecord> records;
    for (cl_platform_id platform : platforms) {
        cl_uint device_count = 0;
        const cl_int count_error = api.get_device_ids(platform, CL_DEVICE_TYPE_ALL, 0, nullptr, &device_count);
        if (count_error != CL_SUCCESS || device_count == 0) {
            continue;
        }
        std::vector<cl_device_id> devices(device_count);
        check(api.get_device_ids(platform, CL_DEVICE_TYPE_ALL, device_count, devices.data(), nullptr), "clGetDeviceIDs(values)");
        for (cl_device_id device : devices) {
            DeviceRecord record;
            record.platform = platform;
            record.device = device;
            record.info.index = records.size();
            record.info.platform_name = platform_string(api, platform, CL_PLATFORM_NAME);
            record.info.name = device_string(api, device, CL_DEVICE_NAME);
            record.info.vendor = device_string(api, device, CL_DEVICE_VENDOR);
            record.info.type = device_type_name(device_value<cl_device_type>(api, device, CL_DEVICE_TYPE));
            record.info.compute_units = device_value<cl_uint>(api, device, CL_DEVICE_MAX_COMPUTE_UNITS);
            record.info.global_memory_mb = static_cast<std::size_t>(
                device_value<cl_ulong>(api, device, CL_DEVICE_GLOBAL_MEM_SIZE) / (1024ULL * 1024ULL)
            );
            record.info.local_memory_kb = static_cast<std::size_t>(
                device_value<cl_ulong>(api, device, CL_DEVICE_LOCAL_MEM_SIZE) / 1024ULL
            );
            records.push_back(std::move(record));
        }
    }
    return records;
}

std::string read_text(const std::filesystem::path& path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("cannot open OpenCL kernel file: " + path.string());
    }
    std::ostringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
}

std::size_t round_up(std::size_t value, std::size_t multiple) {
    return ((value + multiple - 1) / multiple) * multiple;
}

double event_milliseconds(const OpenClApi& api, cl_event event) {
    cl_ulong start = 0;
    cl_ulong end = 0;
    check(api.get_event_profiling_info(event, CL_PROFILING_COMMAND_START, sizeof(start), &start, nullptr), "clGetEventProfilingInfo(start)");
    check(api.get_event_profiling_info(event, CL_PROFILING_COMMAND_END, sizeof(end), &end, nullptr), "clGetEventProfilingInfo(end)");
    return static_cast<double>(end - start) / 1'000'000.0;
}

struct Resources {
    explicit Resources(const OpenClApi& api_reference) : api(api_reference) {}
    ~Resources() {
        for (cl_kernel kernel : kernels) {
            if (kernel != nullptr) api.release_kernel(kernel);
        }
        for (cl_mem memory : buffers) {
            if (memory != nullptr) api.release_mem_object(memory);
        }
        if (program != nullptr) api.release_program(program);
        if (queue != nullptr) api.release_command_queue(queue);
        if (context != nullptr) api.release_context(context);
    }
    const OpenClApi& api;
    cl_context context = nullptr;
    cl_command_queue queue = nullptr;
    cl_program program = nullptr;
    std::vector<cl_mem> buffers;
    std::vector<cl_kernel> kernels;
};

}  // namespace

std::vector<OpenClDeviceInfo> enumerate_opencl_devices() {
    OpenClApi api;
    const auto records = enumerate_records(api);
    std::vector<OpenClDeviceInfo> result;
    result.reserve(records.size());
    for (const auto& record : records) {
        result.push_back(record.info);
    }
    return result;
}

OpenClResult scaled_dot_product_attention_opencl(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    std::size_t device_index,
    bool optimized,
    int iterations,
    const std::filesystem::path& kernel_path
) {
    if (n <= 0 || d <= 0 || iterations <= 0) {
        throw std::invalid_argument("N, d and iterations must be positive");
    }
    const std::size_t matrix_elements = static_cast<std::size_t>(n) * d;
    if (q.size() != matrix_elements || k.size() != matrix_elements || v.size() != matrix_elements) {
        throw std::invalid_argument("Q, K and V must each contain N*d elements");
    }

    OpenClApi api;
    const auto devices = enumerate_records(api);
    if (devices.empty()) {
        throw std::runtime_error("no OpenCL devices are available");
    }
    if (device_index >= devices.size()) {
        throw std::out_of_range("OpenCL device index is out of range");
    }
    const DeviceRecord& selected = devices[device_index];
    Resources resources(api);
    cl_int error = CL_SUCCESS;

    const cl_context_properties properties[] = {
        CL_CONTEXT_PLATFORM,
        reinterpret_cast<cl_context_properties>(selected.platform),
        0
    };
    resources.context = api.create_context(properties, 1, &selected.device, nullptr, nullptr, &error);
    check(error, "clCreateContext");
    resources.queue = api.create_command_queue(
        resources.context,
        selected.device,
        CL_QUEUE_PROFILING_ENABLE,
        &error
    );
    check(error, "clCreateCommandQueue");

    const std::size_t qkv_bytes = matrix_elements * sizeof(float);
    const std::size_t score_elements = static_cast<std::size_t>(n) * n;
    const std::size_t score_bytes = score_elements * sizeof(float);
    cl_mem q_buffer = api.create_buffer(resources.context, CL_MEM_READ_ONLY, qkv_bytes, nullptr, &error);
    check(error, "clCreateBuffer(Q)");
    resources.buffers.push_back(q_buffer);
    cl_mem k_buffer = api.create_buffer(resources.context, CL_MEM_READ_ONLY, qkv_bytes, nullptr, &error);
    check(error, "clCreateBuffer(K)");
    resources.buffers.push_back(k_buffer);
    cl_mem v_buffer = api.create_buffer(resources.context, CL_MEM_READ_ONLY, qkv_bytes, nullptr, &error);
    check(error, "clCreateBuffer(V)");
    resources.buffers.push_back(v_buffer);
    cl_mem scores_buffer = api.create_buffer(resources.context, CL_MEM_READ_WRITE, score_bytes, nullptr, &error);
    check(error, "clCreateBuffer(scores)");
    resources.buffers.push_back(scores_buffer);
    cl_mem output_buffer = api.create_buffer(resources.context, CL_MEM_WRITE_ONLY, qkv_bytes, nullptr, &error);
    check(error, "clCreateBuffer(output)");
    resources.buffers.push_back(output_buffer);

    const std::string source = read_text(kernel_path);
    const char* source_pointer = source.c_str();
    const std::size_t source_size = source.size();
    resources.program = api.create_program_with_source(
        resources.context,
        1,
        &source_pointer,
        &source_size,
        &error
    );
    check(error, "clCreateProgramWithSource");
    error = api.build_program(resources.program, 1, &selected.device, "-cl-std=CL1.2", nullptr, nullptr);
    if (error != CL_SUCCESS) {
        std::size_t log_size = 0;
        api.get_program_build_info(resources.program, selected.device, CL_PROGRAM_BUILD_LOG, 0, nullptr, &log_size);
        std::string log(log_size, '\0');
        if (log_size > 0) {
            api.get_program_build_info(resources.program, selected.device, CL_PROGRAM_BUILD_LOG, log_size, log.data(), nullptr);
        }
        throw std::runtime_error("OpenCL build failed:\n" + log);
    }

    auto create_kernel = [&](const char* name) {
        cl_kernel kernel = api.create_kernel(resources.program, name, &error);
        check(error, name);
        resources.kernels.push_back(kernel);
        return kernel;
    };

    cl_kernel qk_kernel = create_kernel(optimized ? "qk_matmul_tiled_scaled" : "qk_matmul_basic");
    cl_kernel scale_kernel = optimized ? nullptr : create_kernel("scale_scores");
    cl_kernel softmax_kernel = create_kernel("row_softmax");
    cl_kernel output_kernel = create_kernel(optimized ? "attention_v_tiled" : "attention_v_basic");

    const float scale = 1.0f / std::sqrt(static_cast<float>(d));
    check(api.set_kernel_arg(qk_kernel, 0, sizeof(q_buffer), &q_buffer), "clSetKernelArg(qk,Q)");
    check(api.set_kernel_arg(qk_kernel, 1, sizeof(k_buffer), &k_buffer), "clSetKernelArg(qk,K)");
    check(api.set_kernel_arg(qk_kernel, 2, sizeof(scores_buffer), &scores_buffer), "clSetKernelArg(qk,scores)");
    check(api.set_kernel_arg(qk_kernel, 3, sizeof(n), &n), "clSetKernelArg(qk,N)");
    check(api.set_kernel_arg(qk_kernel, 4, sizeof(d), &d), "clSetKernelArg(qk,d)");
    if (optimized) {
        check(api.set_kernel_arg(qk_kernel, 5, sizeof(scale), &scale), "clSetKernelArg(qk,scale)");
    } else {
        const int score_count = static_cast<int>(score_elements);
        check(api.set_kernel_arg(scale_kernel, 0, sizeof(scores_buffer), &scores_buffer), "clSetKernelArg(scale,scores)");
        check(api.set_kernel_arg(scale_kernel, 1, sizeof(score_count), &score_count), "clSetKernelArg(scale,count)");
        check(api.set_kernel_arg(scale_kernel, 2, sizeof(scale), &scale), "clSetKernelArg(scale,value)");
    }

    constexpr std::size_t softmax_local = 256;
    check(api.set_kernel_arg(softmax_kernel, 0, sizeof(scores_buffer), &scores_buffer), "clSetKernelArg(softmax,scores)");
    check(api.set_kernel_arg(softmax_kernel, 1, sizeof(n), &n), "clSetKernelArg(softmax,N)");
    check(api.set_kernel_arg(softmax_kernel, 2, softmax_local * sizeof(float), nullptr), "clSetKernelArg(softmax,max local)");
    check(api.set_kernel_arg(softmax_kernel, 3, softmax_local * sizeof(float), nullptr), "clSetKernelArg(softmax,sum local)");

    check(api.set_kernel_arg(output_kernel, 0, sizeof(scores_buffer), &scores_buffer), "clSetKernelArg(output,scores)");
    check(api.set_kernel_arg(output_kernel, 1, sizeof(v_buffer), &v_buffer), "clSetKernelArg(output,V)");
    check(api.set_kernel_arg(output_kernel, 2, sizeof(output_buffer), &output_buffer), "clSetKernelArg(output,result)");
    check(api.set_kernel_arg(output_kernel, 3, sizeof(n), &n), "clSetKernelArg(output,N)");
    check(api.set_kernel_arg(output_kernel, 4, sizeof(d), &d), "clSetKernelArg(output,d)");

    constexpr std::size_t tile = 16;
    const std::size_t qk_global[] = {round_up(static_cast<std::size_t>(n), tile), round_up(static_cast<std::size_t>(n), tile)};
    const std::size_t qk_local[] = {tile, tile};
    const std::size_t scale_global[] = {round_up(score_elements, softmax_local)};
    const std::size_t scale_local[] = {softmax_local};
    const std::size_t softmax_global[] = {static_cast<std::size_t>(n) * softmax_local};
    const std::size_t softmax_group[] = {softmax_local};
    const std::size_t output_global[] = {round_up(static_cast<std::size_t>(d), tile), round_up(static_cast<std::size_t>(n), tile)};
    const std::size_t output_local[] = {tile, tile};

    std::vector<float> output(matrix_elements, 0.0f);
    auto execute_once = [&](bool measure) {
        const auto wall_begin = std::chrono::steady_clock::now();
        check(api.enqueue_write_buffer(resources.queue, q_buffer, CL_TRUE, 0, qkv_bytes, q.data(), 0, nullptr, nullptr), "clEnqueueWriteBuffer(Q)");
        check(api.enqueue_write_buffer(resources.queue, k_buffer, CL_TRUE, 0, qkv_bytes, k.data(), 0, nullptr, nullptr), "clEnqueueWriteBuffer(K)");
        check(api.enqueue_write_buffer(resources.queue, v_buffer, CL_TRUE, 0, qkv_bytes, v.data(), 0, nullptr, nullptr), "clEnqueueWriteBuffer(V)");

        std::vector<cl_event> events;
        cl_event event = nullptr;
        check(api.enqueue_nd_range_kernel(resources.queue, qk_kernel, 2, nullptr, qk_global, qk_local, 0, nullptr, &event), "clEnqueueNDRangeKernel(QK)");
        events.push_back(event);
        if (!optimized) {
            event = nullptr;
            check(api.enqueue_nd_range_kernel(resources.queue, scale_kernel, 1, nullptr, scale_global, scale_local, 0, nullptr, &event), "clEnqueueNDRangeKernel(scale)");
            events.push_back(event);
        }
        event = nullptr;
        check(api.enqueue_nd_range_kernel(resources.queue, softmax_kernel, 1, nullptr, softmax_global, softmax_group, 0, nullptr, &event), "clEnqueueNDRangeKernel(softmax)");
        events.push_back(event);
        event = nullptr;
        check(api.enqueue_nd_range_kernel(resources.queue, output_kernel, 2, nullptr, output_global, output_local, 0, nullptr, &event), "clEnqueueNDRangeKernel(output)");
        events.push_back(event);
        check(api.enqueue_read_buffer(resources.queue, output_buffer, CL_TRUE, 0, qkv_bytes, output.data(), 0, nullptr, nullptr), "clEnqueueReadBuffer(output)");
        check(api.finish(resources.queue), "clFinish");
        const auto wall_end = std::chrono::steady_clock::now();

        double kernel_ms = 0.0;
        for (cl_event completed : events) {
            if (measure) {
                kernel_ms += event_milliseconds(api, completed);
            }
            api.release_event(completed);
        }
        const double wall_ms = std::chrono::duration<double, std::milli>(wall_end - wall_begin).count();
        return std::pair<double, double>{kernel_ms, wall_ms};
    };

    execute_once(false);  // Driver/kernel warm-up is excluded from benchmark averages.
    double kernel_total = 0.0;
    double wall_total = 0.0;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        const auto [kernel_ms, wall_ms] = execute_once(true);
        kernel_total += kernel_ms;
        wall_total += wall_ms;
    }

    OpenClResult result;
    result.output = std::move(output);
    result.device = selected.info;
    result.kernel_milliseconds = kernel_total / iterations;
    result.end_to_end_milliseconds = wall_total / iterations;
    result.optimized = optimized;
    return result;
}

}  // namespace attention
