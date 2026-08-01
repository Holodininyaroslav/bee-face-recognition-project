#define NOMINMAX
#include <windows.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

using cl_char = signed char;
using cl_uchar = unsigned char;
using cl_short = short;
using cl_ushort = unsigned short;
using cl_int = int;
using cl_uint = unsigned int;
using cl_long = long long;
using cl_ulong = unsigned long long;
using cl_bool = cl_uint;
using cl_bitfield = cl_ulong;
using cl_device_type = cl_bitfield;
using cl_mem_flags = cl_bitfield;
using cl_map_flags = cl_bitfield;
using cl_platform_info = cl_uint;
using cl_device_info = cl_uint;
using cl_context_properties = intptr_t;
using cl_command_queue_properties = cl_bitfield;
using cl_program_build_info = cl_uint;
using cl_kernel_work_group_info = cl_uint;
using cl_context = struct _cl_context*;
using cl_command_queue = struct _cl_command_queue*;
using cl_mem = struct _cl_mem*;
using cl_program = struct _cl_program*;
using cl_kernel = struct _cl_kernel*;
using cl_device_id = struct _cl_device_id*;
using cl_platform_id = struct _cl_platform_id*;
using cl_event = struct _cl_event*;

constexpr cl_int CL_SUCCESS = 0;
constexpr cl_device_type CL_DEVICE_TYPE_GPU = 1 << 2;
constexpr cl_mem_flags CL_MEM_READ_WRITE = 1 << 0;
constexpr cl_mem_flags CL_MEM_WRITE_ONLY = 1 << 1;
constexpr cl_mem_flags CL_MEM_READ_ONLY = 1 << 2;
constexpr cl_mem_flags CL_MEM_COPY_HOST_PTR = 1 << 5;
constexpr cl_platform_info CL_PLATFORM_NAME = 0x0902;
constexpr cl_device_info CL_DEVICE_NAME = 0x102B;
constexpr cl_device_info CL_DEVICE_MAX_COMPUTE_UNITS = 0x1002;
constexpr cl_program_build_info CL_PROGRAM_BUILD_LOG = 0x1183;

namespace {
const char* kOpenClSource = R"CLC(
__kernel void conv_relu(
    __global const float* input,
    __global const float* weights,
    __global const float* bias,
    __global float* output,
    int in_h,
    int in_w,
    int in_c,
    int kh,
    int kw,
    int out_c,
    int batch_size) {
    int out_h = in_h - kh + 1;
    int out_w = in_w - kw + 1;
    int idx = get_global_id(0);
    int image_stride = out_h * out_w * out_c;
    int total = batch_size * image_stride;
    if (idx >= total) return;

    int batch = idx / image_stride;
    int local_idx = idx % image_stride;

    int oc = local_idx % out_c;
    int x = (local_idx / out_c) % out_w;
    int y = local_idx / (out_w * out_c);

    float sum = bias[oc];
    for (int ky = 0; ky < kh; ++ky) {
        for (int kx = 0; kx < kw; ++kx) {
            for (int ic = 0; ic < in_c; ++ic) {
                int input_idx = batch * in_h * in_w * in_c + ((y + ky) * in_w + (x + kx)) * in_c + ic;
                int weights_idx = (((ky * kw + kx) * in_c + ic) * out_c) + oc;
                sum += input[input_idx] * weights[weights_idx];
            }
        }
    }
    output[idx] = fmax(sum, 0.0f);
}

__kernel void max_pool_2x2(
    __global const float* input,
    __global float* output,
    int in_h,
    int in_w,
    int channels,
    int batch_size) {
    int out_h = in_h / 2;
    int out_w = in_w / 2;
    int idx = get_global_id(0);
    int image_stride = out_h * out_w * channels;
    int total = batch_size * image_stride;
    if (idx >= total) return;

    int batch = idx / image_stride;
    int local_idx = idx % image_stride;

    int c = local_idx % channels;
    int x = (local_idx / channels) % out_w;
    int y = local_idx / (out_w * channels);
    float value = -1.0e30f;
    for (int ky = 0; ky < 2; ++ky) {
        for (int kx = 0; kx < 2; ++kx) {
            int input_idx = batch * in_h * in_w * channels + (((y * 2 + ky) * in_w) + (x * 2 + kx)) * channels + c;
            value = fmax(value, input[input_idx]);
        }
    }
    output[idx] = value;
}

__kernel void dense(
    __global const float* input,
    __global const float* weights,
    __global const float* bias,
    __global float* output,
    int in_features,
    int out_features,
    int batch_size) {
    int idx = get_global_id(0);
    if (idx >= batch_size * out_features) return;
    int batch = idx / out_features;
    int o = idx % out_features;

    float sum = bias[o];
    for (int i = 0; i < in_features; ++i) {
        sum += input[batch * in_features + i] * weights[i * out_features + o];
    }
    output[idx] = sum;
}

__kernel void add_relu(__global const float* a, __global const float* b, __global float* output, int count) {
    int idx = get_global_id(0);
    if (idx < count) output[idx] = fmax(a[idx] + b[idx], 0.0f);
}
)CLC";

struct OpenCL {
    HMODULE lib = nullptr;
    cl_int (__stdcall *clGetPlatformIDs)(cl_uint, cl_platform_id*, cl_uint*) = nullptr;
    cl_int (__stdcall *clGetPlatformInfo)(cl_platform_id, cl_platform_info, size_t, void*, size_t*) = nullptr;
    cl_int (__stdcall *clGetDeviceIDs)(cl_platform_id, cl_device_type, cl_uint, cl_device_id*, cl_uint*) = nullptr;
    cl_int (__stdcall *clGetDeviceInfo)(cl_device_id, cl_device_info, size_t, void*, size_t*) = nullptr;
    cl_context (__stdcall *clCreateContext)(const cl_context_properties*, cl_uint, const cl_device_id*, void*, void*, cl_int*) = nullptr;
    cl_command_queue (__stdcall *clCreateCommandQueue)(cl_context, cl_device_id, cl_command_queue_properties, cl_int*) = nullptr;
    cl_mem (__stdcall *clCreateBuffer)(cl_context, cl_mem_flags, size_t, void*, cl_int*) = nullptr;
    cl_int (__stdcall *clReleaseMemObject)(cl_mem) = nullptr;
    cl_program (__stdcall *clCreateProgramWithSource)(cl_context, cl_uint, const char**, const size_t*, cl_int*) = nullptr;
    cl_int (__stdcall *clBuildProgram)(cl_program, cl_uint, const cl_device_id*, const char*, void*, void*) = nullptr;
    cl_int (__stdcall *clGetProgramBuildInfo)(cl_program, cl_device_id, cl_program_build_info, size_t, void*, size_t*) = nullptr;
    cl_kernel (__stdcall *clCreateKernel)(cl_program, const char*, cl_int*) = nullptr;
    cl_int (__stdcall *clSetKernelArg)(cl_kernel, cl_uint, size_t, const void*) = nullptr;
    cl_int (__stdcall *clEnqueueNDRangeKernel)(cl_command_queue, cl_kernel, cl_uint, const size_t*, const size_t*, const size_t*, cl_uint, const cl_event*, cl_event*) = nullptr;
    cl_int (__stdcall *clEnqueueReadBuffer)(cl_command_queue, cl_mem, cl_bool, size_t, size_t, void*, cl_uint, const cl_event*, cl_event*) = nullptr;
    cl_int (__stdcall *clFinish)(cl_command_queue) = nullptr;
    cl_int (__stdcall *clReleaseKernel)(cl_kernel) = nullptr;
    cl_int (__stdcall *clReleaseProgram)(cl_program) = nullptr;
    cl_int (__stdcall *clReleaseCommandQueue)(cl_command_queue) = nullptr;
    cl_int (__stdcall *clReleaseContext)(cl_context) = nullptr;
};

OpenCL load_opencl() {
    OpenCL cl;
    cl.lib = LoadLibraryA("OpenCL.dll");
    if (!cl.lib) throw std::runtime_error("OpenCL.dll was not found");

    auto load = [&](auto& fn, const char* name) {
        fn = reinterpret_cast<std::remove_reference_t<decltype(fn)>>(GetProcAddress(cl.lib, name));
        if (!fn) throw std::runtime_error(std::string("OpenCL function not found: ") + name);
    };

    load(cl.clGetPlatformIDs, "clGetPlatformIDs");
    load(cl.clGetPlatformInfo, "clGetPlatformInfo");
    load(cl.clGetDeviceIDs, "clGetDeviceIDs");
    load(cl.clGetDeviceInfo, "clGetDeviceInfo");
    load(cl.clCreateContext, "clCreateContext");
    load(cl.clCreateCommandQueue, "clCreateCommandQueue");
    load(cl.clCreateBuffer, "clCreateBuffer");
    load(cl.clReleaseMemObject, "clReleaseMemObject");
    load(cl.clCreateProgramWithSource, "clCreateProgramWithSource");
    load(cl.clBuildProgram, "clBuildProgram");
    load(cl.clGetProgramBuildInfo, "clGetProgramBuildInfo");
    load(cl.clCreateKernel, "clCreateKernel");
    load(cl.clSetKernelArg, "clSetKernelArg");
    load(cl.clEnqueueNDRangeKernel, "clEnqueueNDRangeKernel");
    load(cl.clEnqueueReadBuffer, "clEnqueueReadBuffer");
    load(cl.clFinish, "clFinish");
    load(cl.clReleaseKernel, "clReleaseKernel");
    load(cl.clReleaseProgram, "clReleaseProgram");
    load(cl.clReleaseCommandQueue, "clReleaseCommandQueue");
    load(cl.clReleaseContext, "clReleaseContext");
    return cl;
}

void check(cl_int status, const char* call) {
    if (status != CL_SUCCESS) {
        throw std::runtime_error(std::string(call) + " failed with OpenCL error " + std::to_string(status));
    }
}

struct ClBuffer {
    const OpenCL* cl = nullptr;
    cl_mem mem = nullptr;
    ClBuffer() = default;
    ClBuffer(const OpenCL* cl_api, cl_mem memory) : cl(cl_api), mem(memory) {}
    ClBuffer(const ClBuffer&) = delete;
    ClBuffer& operator=(const ClBuffer&) = delete;
    ClBuffer(ClBuffer&& other) noexcept : cl(other.cl), mem(other.mem) {
        other.cl = nullptr;
        other.mem = nullptr;
    }
    ClBuffer& operator=(ClBuffer&& other) noexcept {
        if (this != &other) {
            if (mem) cl->clReleaseMemObject(mem);
            cl = other.cl;
            mem = other.mem;
            other.cl = nullptr;
            other.mem = nullptr;
        }
        return *this;
    }
    ~ClBuffer() { if (mem) cl->clReleaseMemObject(mem); }
};

struct Kernel {
    const OpenCL* cl = nullptr;
    cl_kernel kernel = nullptr;
    ~Kernel() { if (kernel) cl->clReleaseKernel(kernel); }
};

template <typename T>
void set_arg(const OpenCL& cl, cl_kernel kernel, cl_uint index, const T& value) {
    check(cl.clSetKernelArg(kernel, index, sizeof(T), &value), "clSetKernelArg");
}

class OpenClSession {
public:
    OpenClSession() : cl_(load_opencl()) {
        cl_uint platform_count = 0;
        check(cl_.clGetPlatformIDs(0, nullptr, &platform_count), "clGetPlatformIDs count");
        if (platform_count == 0) throw std::runtime_error("No OpenCL platforms found");

        std::vector<cl_platform_id> platforms(platform_count);
        check(cl_.clGetPlatformIDs(platform_count, platforms.data(), nullptr), "clGetPlatformIDs");

        cl_uint best_compute_units = 0;
        for (auto platform : platforms) {
            cl_uint device_count = 0;
            const auto status = cl_.clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 0, nullptr, &device_count);
            if (status != CL_SUCCESS || device_count == 0) continue;

            std::vector<cl_device_id> devices(device_count);
            check(cl_.clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, device_count, devices.data(), nullptr), "clGetDeviceIDs");
            for (auto candidate : devices) {
                cl_uint compute_units = 0;
                if (cl_.clGetDeviceInfo(candidate, CL_DEVICE_MAX_COMPUTE_UNITS, sizeof(compute_units), &compute_units, nullptr) != CL_SUCCESS) {
                    continue;
                }
                if (!device_ || compute_units > best_compute_units) {
                    device_ = candidate;
                    best_compute_units = compute_units;
                }
            }
        }

        if (!device_) throw std::runtime_error("No OpenCL GPU device found");
        static std::once_flag log_device_once;
        std::call_once(log_device_once, [&]() {
            std::cerr << "OpenCL GPU device selected: " << device_name(device_)
                      << " (compute_units=" << best_compute_units << ")\n";
        });

        cl_int status = CL_SUCCESS;
        context_ = cl_.clCreateContext(nullptr, 1, &device_, nullptr, nullptr, &status);
        check(status, "clCreateContext");
        queue_ = cl_.clCreateCommandQueue(context_, device_, 0, &status);
        check(status, "clCreateCommandQueue");

        const char* src = kOpenClSource;
        const size_t src_len = std::strlen(kOpenClSource);
        program_ = cl_.clCreateProgramWithSource(context_, 1, &src, &src_len, &status);
        check(status, "clCreateProgramWithSource");

        status = cl_.clBuildProgram(program_, 1, &device_, "", nullptr, nullptr);
        if (status != CL_SUCCESS) {
            size_t log_size = 0;
            cl_.clGetProgramBuildInfo(program_, device_, CL_PROGRAM_BUILD_LOG, 0, nullptr, &log_size);
            std::string log(log_size, '\0');
            if (log_size > 0) cl_.clGetProgramBuildInfo(program_, device_, CL_PROGRAM_BUILD_LOG, log.size(), log.data(), nullptr);
            throw std::runtime_error("clBuildProgram failed: " + log);
        }

        conv_kernel_ = create_kernel("conv_relu");
        pool_kernel_ = create_kernel("max_pool_2x2");
        dense_kernel_ = create_kernel("dense");
        add_relu_kernel_ = create_kernel("add_relu");
    }

    ~OpenClSession() {
        if (add_relu_kernel_) cl_.clReleaseKernel(add_relu_kernel_);
        if (dense_kernel_) cl_.clReleaseKernel(dense_kernel_);
        if (pool_kernel_) cl_.clReleaseKernel(pool_kernel_);
        if (conv_kernel_) cl_.clReleaseKernel(conv_kernel_);
        if (program_) cl_.clReleaseProgram(program_);
        if (queue_) cl_.clReleaseCommandQueue(queue_);
        if (context_) cl_.clReleaseContext(context_);
        if (cl_.lib) FreeLibrary(cl_.lib);
    }

    ClBuffer buffer_from(const std::vector<float>& values) {
        cl_int status = CL_SUCCESS;
        ClBuffer buffer(&cl_, cl_.clCreateBuffer(context_, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, values.size() * sizeof(float), const_cast<float*>(values.data()), &status));
        check(status, "clCreateBuffer input");
        return buffer;
    }

    ClBuffer buffer_empty(size_t count) {
        cl_int status = CL_SUCCESS;
        ClBuffer buffer(&cl_, cl_.clCreateBuffer(context_, CL_MEM_READ_WRITE, count * sizeof(float), nullptr, &status));
        check(status, "clCreateBuffer output");
        return buffer;
    }

    cl_kernel create_kernel(const char* name) {
        cl_int status = CL_SUCCESS;
        cl_kernel k = cl_.clCreateKernel(program_, name, &status);
        check(status, "clCreateKernel");
        return k;
    }

    void run(cl_kernel kernel, size_t global) {
        const size_t local = 256;
        const size_t rounded = ((global + local - 1) / local) * local;
        check(cl_.clEnqueueNDRangeKernel(queue_, kernel, 1, nullptr, &rounded, &local, 0, nullptr, nullptr), "clEnqueueNDRangeKernel");
    }

    std::vector<float> read(ClBuffer& buffer, size_t count) {
        std::vector<float> out(count);
        check(cl_.clEnqueueReadBuffer(queue_, buffer.mem, 1, 0, count * sizeof(float), out.data(), 0, nullptr, nullptr), "clEnqueueReadBuffer");
        check(cl_.clFinish(queue_), "clFinish");
        return out;
    }

    void launch_conv(ClBuffer& input, ClBuffer& kernel, ClBuffer& bias, ClBuffer& output, int in_h, int in_w, int in_c, int kh, int kw, int out_c, int batch_size) {
        int arg = 0;
        set_arg(cl_, conv_kernel_, arg++, input.mem);
        set_arg(cl_, conv_kernel_, arg++, kernel.mem);
        set_arg(cl_, conv_kernel_, arg++, bias.mem);
        set_arg(cl_, conv_kernel_, arg++, output.mem);
        set_arg(cl_, conv_kernel_, arg++, in_h);
        set_arg(cl_, conv_kernel_, arg++, in_w);
        set_arg(cl_, conv_kernel_, arg++, in_c);
        set_arg(cl_, conv_kernel_, arg++, kh);
        set_arg(cl_, conv_kernel_, arg++, kw);
        set_arg(cl_, conv_kernel_, arg++, out_c);
        set_arg(cl_, conv_kernel_, arg++, batch_size);
        run(conv_kernel_, static_cast<size_t>(batch_size) * (in_h - kh + 1) * (in_w - kw + 1) * out_c);
    }

    void launch_pool(ClBuffer& input, ClBuffer& output, int in_h, int in_w, int channels, int batch_size) {
        int arg = 0;
        set_arg(cl_, pool_kernel_, arg++, input.mem);
        set_arg(cl_, pool_kernel_, arg++, output.mem);
        set_arg(cl_, pool_kernel_, arg++, in_h);
        set_arg(cl_, pool_kernel_, arg++, in_w);
        set_arg(cl_, pool_kernel_, arg++, channels);
        set_arg(cl_, pool_kernel_, arg++, batch_size);
        run(pool_kernel_, static_cast<size_t>(batch_size) * (in_h / 2) * (in_w / 2) * channels);
    }

    void launch_dense(ClBuffer& input, ClBuffer& kernel, ClBuffer& bias, ClBuffer& output, int in_features, int out_features, int batch_size) {
        int arg = 0;
        set_arg(cl_, dense_kernel_, arg++, input.mem);
        set_arg(cl_, dense_kernel_, arg++, kernel.mem);
        set_arg(cl_, dense_kernel_, arg++, bias.mem);
        set_arg(cl_, dense_kernel_, arg++, output.mem);
        set_arg(cl_, dense_kernel_, arg++, in_features);
        set_arg(cl_, dense_kernel_, arg++, out_features);
        set_arg(cl_, dense_kernel_, arg++, batch_size);
        run(dense_kernel_, static_cast<size_t>(batch_size) * out_features);
    }

    void launch_add_relu(ClBuffer& a, ClBuffer& b, ClBuffer& output, int count) {
        int arg = 0;
        set_arg(cl_, add_relu_kernel_, arg++, a.mem);
        set_arg(cl_, add_relu_kernel_, arg++, b.mem);
        set_arg(cl_, add_relu_kernel_, arg++, output.mem);
        set_arg(cl_, add_relu_kernel_, arg++, count);
        run(add_relu_kernel_, static_cast<size_t>(count));
    }

private:
    std::string device_name(cl_device_id device) {
        size_t size = 0;
        cl_.clGetDeviceInfo(device, CL_DEVICE_NAME, 0, nullptr, &size);
        std::string name(size, '\0');
        if (size > 0) cl_.clGetDeviceInfo(device, CL_DEVICE_NAME, name.size(), name.data(), nullptr);
        while (!name.empty() && name.back() == '\0') name.pop_back();
        return name.empty() ? "unknown OpenCL GPU" : name;
    }

    OpenCL cl_;
    cl_device_id device_ = nullptr;
    cl_context context_ = nullptr;
    cl_command_queue queue_ = nullptr;
    cl_program program_ = nullptr;
    cl_kernel conv_kernel_ = nullptr;
    cl_kernel pool_kernel_ = nullptr;
    cl_kernel dense_kernel_ = nullptr;
    cl_kernel add_relu_kernel_ = nullptr;
};

struct CachedWeights {
    ClBuffer conv1_k;
    ClBuffer conv1_b;
    ClBuffer conv2_k;
    ClBuffer conv2_b;
    ClBuffer conv3_k;
    ClBuffer conv3_b;
    ClBuffer conv4_k;
    ClBuffer conv4_b;
    ClBuffer fc11_k;
    ClBuffer fc11_b;
    ClBuffer fc12_k;
    ClBuffer fc12_b;
};
}

std::vector<float> run_deepid_opencl_forward_batch(
    const std::vector<float>& input,
    int batch_size,
    const std::vector<float>& conv1_kernel,
    const std::vector<float>& conv1_bias,
    const std::vector<float>& conv2_kernel,
    const std::vector<float>& conv2_bias,
    const std::vector<float>& conv3_kernel,
    const std::vector<float>& conv3_bias,
    const std::vector<float>& conv4_kernel,
    const std::vector<float>& conv4_bias,
    const std::vector<float>& fc11_kernel,
    const std::vector<float>& fc11_bias,
    const std::vector<float>& fc12_kernel,
    const std::vector<float>& fc12_bias) {
    static std::mutex runtime_mutex;
    static std::unique_ptr<OpenClSession> session;
    static std::unique_ptr<CachedWeights> cached_weights;

    std::lock_guard<std::mutex> lock(runtime_mutex);
    if (!session) {
        session = std::make_unique<OpenClSession>();
        cached_weights = std::make_unique<CachedWeights>(CachedWeights{
            session->buffer_from(conv1_kernel),
            session->buffer_from(conv1_bias),
            session->buffer_from(conv2_kernel),
            session->buffer_from(conv2_bias),
            session->buffer_from(conv3_kernel),
            session->buffer_from(conv3_bias),
            session->buffer_from(conv4_kernel),
            session->buffer_from(conv4_bias),
            session->buffer_from(fc11_kernel),
            session->buffer_from(fc11_bias),
            session->buffer_from(fc12_kernel),
            session->buffer_from(fc12_bias)});
    }

    auto& s = *session;
    auto& w = *cached_weights;
    auto d_input = s.buffer_from(input);

    if (batch_size <= 0 || input.size() != static_cast<std::size_t>(batch_size) * 55 * 47 * 3) {
        throw std::runtime_error("Invalid OpenCL DeepID batch input");
    }
    const auto batch = static_cast<std::size_t>(batch_size);
    auto d_conv1 = s.buffer_empty(batch * 52 * 44 * 20);
    auto d_pool1 = s.buffer_empty(batch * 26 * 22 * 20);
    auto d_conv2 = s.buffer_empty(batch * 24 * 20 * 40);
    auto d_pool2 = s.buffer_empty(batch * 12 * 10 * 40);
    auto d_conv3 = s.buffer_empty(batch * 10 * 8 * 60);
    auto d_pool3 = s.buffer_empty(batch * 5 * 4 * 60);
    auto d_fc11 = s.buffer_empty(batch * 160);
    auto d_conv4 = s.buffer_empty(batch * 4 * 3 * 80);
    auto d_fc12 = s.buffer_empty(batch * 160);
    auto d_embedding = s.buffer_empty(batch * 160);

    s.launch_conv(d_input, w.conv1_k, w.conv1_b, d_conv1, 55, 47, 3, 4, 4, 20, batch_size);
    s.launch_pool(d_conv1, d_pool1, 52, 44, 20, batch_size);
    s.launch_conv(d_pool1, w.conv2_k, w.conv2_b, d_conv2, 26, 22, 20, 3, 3, 40, batch_size);
    s.launch_pool(d_conv2, d_pool2, 24, 20, 40, batch_size);
    s.launch_conv(d_pool2, w.conv3_k, w.conv3_b, d_conv3, 12, 10, 40, 3, 3, 60, batch_size);
    s.launch_pool(d_conv3, d_pool3, 10, 8, 60, batch_size);
    s.launch_dense(d_pool3, w.fc11_k, w.fc11_b, d_fc11, 1200, 160, batch_size);
    s.launch_conv(d_pool3, w.conv4_k, w.conv4_b, d_conv4, 5, 4, 60, 2, 2, 80, batch_size);
    s.launch_dense(d_conv4, w.fc12_k, w.fc12_b, d_fc12, 960, 160, batch_size);
    s.launch_add_relu(d_fc11, d_fc12, d_embedding, batch_size * 160);

    return s.read(d_embedding, batch * 160);
}

std::vector<float> run_deepid_opencl_forward(
    const std::vector<float>& input,
    const std::vector<float>& conv1_kernel,
    const std::vector<float>& conv1_bias,
    const std::vector<float>& conv2_kernel,
    const std::vector<float>& conv2_bias,
    const std::vector<float>& conv3_kernel,
    const std::vector<float>& conv3_bias,
    const std::vector<float>& conv4_kernel,
    const std::vector<float>& conv4_bias,
    const std::vector<float>& fc11_kernel,
    const std::vector<float>& fc11_bias,
    const std::vector<float>& fc12_kernel,
    const std::vector<float>& fc12_bias) {
    return run_deepid_opencl_forward_batch(
        input, 1,
        conv1_kernel, conv1_bias,
        conv2_kernel, conv2_bias,
        conv3_kernel, conv3_bias,
        conv4_kernel, conv4_bias,
        fc11_kernel, fc11_bias,
        fc12_kernel, fc12_bias);
}
