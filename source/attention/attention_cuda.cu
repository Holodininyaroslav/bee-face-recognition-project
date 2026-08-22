#include <cuda_runtime.h>
#include <math_constants.h>

#include "attention.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

#define CUDA_CHECK(call)                                                                      \
    do {                                                                                      \
        const cudaError_t cuda_error__ = (call);                                               \
        if (cuda_error__ != cudaSuccess) {                                                     \
            throw std::runtime_error(                                                         \
                std::string(#call) + " failed: " + cudaGetErrorString(cuda_error__)           \
            );                                                                                \
        }                                                                                     \
    } while (false)

namespace {

constexpr int kTile = 16;
constexpr int kSoftmaxThreads = 256;

__global__ void qk_matmul_basic(
    const float* q,
    const float* k,
    float* scores,
    int n,
    int d
) {
    const int column = blockIdx.x * blockDim.x + threadIdx.x;
    const int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row >= n || column >= n) {
        return;
    }
    float sum = 0.0f;
    for (int feature = 0; feature < d; ++feature) {
        sum += q[row * d + feature] * k[column * d + feature];
    }
    scores[row * n + column] = sum;
}

__global__ void scale_scores(float* scores, int count, float scale) {
    const int index = blockIdx.x * blockDim.x + threadIdx.x;
    if (index < count) {
        scores[index] *= scale;
    }
}

// One block handles one row. The first reduction finds the maximum; the
// second reduction sums exp(x-max), providing stable row-wise softmax.
__global__ void row_softmax(float* scores, int n) {
    extern __shared__ float scratch[];
    const int row = blockIdx.x;
    const int lane = threadIdx.x;
    if (row >= n) {
        return;
    }

    float local_maximum = -CUDART_INF_F;
    for (int column = lane; column < n; column += blockDim.x) {
        local_maximum = fmaxf(local_maximum, scores[row * n + column]);
    }
    scratch[lane] = local_maximum;
    __syncthreads();
    for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {
        if (lane < stride) {
            scratch[lane] = fmaxf(scratch[lane], scratch[lane + stride]);
        }
        __syncthreads();
    }

    const float row_maximum = scratch[0];
    // Every thread must capture the maximum before scratch is reused for the sum reduction.
    __syncthreads();
    float local_sum = 0.0f;
    for (int column = lane; column < n; column += blockDim.x) {
        const float value = expf(scores[row * n + column] - row_maximum);
        scores[row * n + column] = value;
        local_sum += value;
    }
    scratch[lane] = local_sum;
    __syncthreads();
    for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {
        if (lane < stride) {
            scratch[lane] += scratch[lane + stride];
        }
        __syncthreads();
    }

    const float inverse_sum = 1.0f / scratch[0];
    for (int column = lane; column < n; column += blockDim.x) {
        scores[row * n + column] *= inverse_sum;
    }
}

__global__ void attention_v_basic(
    const float* probabilities,
    const float* v,
    float* output,
    int n,
    int d
) {
    const int feature = blockIdx.x * blockDim.x + threadIdx.x;
    const int row = blockIdx.y * blockDim.y + threadIdx.y;
    if (row >= n || feature >= d) {
        return;
    }
    float sum = 0.0f;
    for (int column = 0; column < n; ++column) {
        sum += probabilities[row * n + column] * v[column * d + feature];
    }
    output[row * d + feature] = sum;
}

__global__ void qk_matmul_tiled_scaled(
    const float* q,
    const float* k,
    float* scores,
    int n,
    int d,
    float scale
) {
    __shared__ float tile_q[kTile][kTile];
    __shared__ float tile_k[kTile][kTile];
    const int local_x = threadIdx.x;
    const int local_y = threadIdx.y;
    const int column = blockIdx.x * kTile + local_x;
    const int row = blockIdx.y * kTile + local_y;
    float sum = 0.0f;

    for (int start = 0; start < d; start += kTile) {
        const int q_feature = start + local_x;
        const int k_feature = start + local_y;
        tile_q[local_y][local_x] = (row < n && q_feature < d)
            ? q[row * d + q_feature]
            : 0.0f;
        tile_k[local_y][local_x] = (column < n && k_feature < d)
            ? k[column * d + k_feature]
            : 0.0f;
        __syncthreads();
        #pragma unroll
        for (int inner = 0; inner < kTile; ++inner) {
            sum += tile_q[local_y][inner] * tile_k[inner][local_x];
        }
        __syncthreads();
    }

    if (row < n && column < n) {
        scores[row * n + column] = sum * scale;
    }
}

__global__ void attention_v_tiled(
    const float* probabilities,
    const float* v,
    float* output,
    int n,
    int d
) {
    __shared__ float tile_probabilities[kTile][kTile];
    __shared__ float tile_v[kTile][kTile];
    const int local_x = threadIdx.x;
    const int local_y = threadIdx.y;
    const int feature = blockIdx.x * kTile + local_x;
    const int row = blockIdx.y * kTile + local_y;
    float sum = 0.0f;

    for (int start = 0; start < n; start += kTile) {
        const int probability_column = start + local_x;
        const int v_row = start + local_y;
        tile_probabilities[local_y][local_x] = (row < n && probability_column < n)
            ? probabilities[row * n + probability_column]
            : 0.0f;
        tile_v[local_y][local_x] = (v_row < n && feature < d)
            ? v[v_row * d + feature]
            : 0.0f;
        __syncthreads();
        #pragma unroll
        for (int inner = 0; inner < kTile; ++inner) {
            sum += tile_probabilities[local_y][inner] * tile_v[inner][local_x];
        }
        __syncthreads();
    }

    if (row < n && feature < d) {
        output[row * d + feature] = sum;
    }
}

struct DeviceMemory {
    float* q = nullptr;
    float* k = nullptr;
    float* v = nullptr;
    float* scores = nullptr;
    float* output = nullptr;
    ~DeviceMemory() {
        if (q != nullptr) cudaFree(q);
        if (k != nullptr) cudaFree(k);
        if (v != nullptr) cudaFree(v);
        if (scores != nullptr) cudaFree(scores);
        if (output != nullptr) cudaFree(output);
    }
};

void launch_pipeline(DeviceMemory& memory, int n, int d, bool optimized) {
    const dim3 block(kTile, kTile);
    const dim3 score_grid((n + kTile - 1) / kTile, (n + kTile - 1) / kTile);
    const dim3 output_grid((d + kTile - 1) / kTile, (n + kTile - 1) / kTile);
    const float scale = 1.0f / std::sqrt(static_cast<float>(d));
    if (optimized) {
        qk_matmul_tiled_scaled<<<score_grid, block>>>(memory.q, memory.k, memory.scores, n, d, scale);
    } else {
        qk_matmul_basic<<<score_grid, block>>>(memory.q, memory.k, memory.scores, n, d);
        const int count = n * n;
        scale_scores<<<(count + 255) / 256, 256>>>(memory.scores, count, scale);
    }
    row_softmax<<<n, kSoftmaxThreads, kSoftmaxThreads * sizeof(float)>>>(memory.scores, n);
    if (optimized) {
        attention_v_tiled<<<output_grid, block>>>(memory.scores, memory.v, memory.output, n, d);
    } else {
        attention_v_basic<<<output_grid, block>>>(memory.scores, memory.v, memory.output, n, d);
    }
    CUDA_CHECK(cudaGetLastError());
}

struct CudaRunResult {
    std::vector<float> output;
    float kernel_milliseconds = 0.0f;
    double end_to_end_milliseconds = 0.0;
};

CudaRunResult run_cuda(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    int warmup_iterations,
    int iterations,
    bool optimized
) {
    DeviceMemory memory;
    const std::size_t qkv_bytes = static_cast<std::size_t>(n) * d * sizeof(float);
    const std::size_t scores_bytes = static_cast<std::size_t>(n) * n * sizeof(float);
    CUDA_CHECK(cudaMalloc(&memory.q, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.k, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.v, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.scores, scores_bytes));
    CUDA_CHECK(cudaMalloc(&memory.output, qkv_bytes));
    CudaRunResult result;
    result.output.resize(static_cast<std::size_t>(n) * d);

    for (int iteration = 0; iteration < warmup_iterations; ++iteration) {
        CUDA_CHECK(cudaMemcpy(memory.q, q.data(), qkv_bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(memory.k, k.data(), qkv_bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(memory.v, v.data(), qkv_bytes, cudaMemcpyHostToDevice));
        launch_pipeline(memory, n, d, optimized);
        CUDA_CHECK(cudaMemcpy(result.output.data(), memory.output, qkv_bytes, cudaMemcpyDeviceToHost));
    }

    cudaEvent_t start = nullptr;
    cudaEvent_t stop = nullptr;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));
    float kernel_total_ms = 0.0f;
    double end_to_end_total_ms = 0.0;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        const auto end_to_end_start = std::chrono::steady_clock::now();
        CUDA_CHECK(cudaMemcpy(memory.q, q.data(), qkv_bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(memory.k, k.data(), qkv_bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(memory.v, v.data(), qkv_bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaEventRecord(start));
        launch_pipeline(memory, n, d, optimized);
        CUDA_CHECK(cudaEventRecord(stop));
        CUDA_CHECK(cudaEventSynchronize(stop));
        float kernel_elapsed_ms = 0.0f;
        CUDA_CHECK(cudaEventElapsedTime(&kernel_elapsed_ms, start, stop));
        kernel_total_ms += kernel_elapsed_ms;
        CUDA_CHECK(cudaMemcpy(result.output.data(), memory.output, qkv_bytes, cudaMemcpyDeviceToHost));
        const auto end_to_end_stop = std::chrono::steady_clock::now();
        end_to_end_total_ms += std::chrono::duration<double, std::milli>(
            end_to_end_stop - end_to_end_start
        ).count();
    }
    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    result.kernel_milliseconds = kernel_total_ms / iterations;
    result.end_to_end_milliseconds = end_to_end_total_ms / iterations;
    return result;
}

std::vector<float> run_cpu_average(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    int warmup_iterations,
    int iterations,
    double& average_milliseconds
) {
    std::vector<float> scores(static_cast<std::size_t>(n) * n, 0.0f);
    std::vector<float> output(static_cast<std::size_t>(n) * d, 0.0f);
    for (int iteration = 0; iteration < warmup_iterations; ++iteration) {
        attention::Timing timing;
        attention::scaled_dot_product_attention_cpu_into(
            q, k, v, n, d, scores, output, &timing
        );
    }

    double total_milliseconds = 0.0;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        attention::Timing timing;
        attention::scaled_dot_product_attention_cpu_into(
            q, k, v, n, d, scores, output, &timing
        );
        total_milliseconds += timing.milliseconds;
    }
    average_milliseconds = total_milliseconds / iterations;
    return output;
}

}  // namespace

int main(int argc, char** argv) {
    try {
        int n = 512;
        int d = 64;
        int warmup_iterations = 3;
        int iterations = 30;
        unsigned seed = 2026;
        float tolerance = 2.0e-4f;
        std::string variant = "all";
        std::filesystem::path csv_path;
        for (int i = 1; i < argc; ++i) {
            const std::string argument = argv[i];
            auto value = [&]() -> const char* {
                if (++i >= argc) throw std::invalid_argument("missing value after " + argument);
                return argv[i];
            };
            if (argument == "--n") n = std::stoi(value());
            else if (argument == "--d") d = std::stoi(value());
            else if (argument == "--warmup") warmup_iterations = std::stoi(value());
            else if (argument == "--iterations") iterations = std::stoi(value());
            else if (argument == "--seed") seed = static_cast<unsigned>(std::stoul(value()));
            else if (argument == "--tolerance") tolerance = std::stof(value());
            else if (argument == "--variant") variant = value();
            else if (argument == "--csv") csv_path = value();
            else if (argument == "--help") {
                std::cout
                    << "attention_cuda [options]\n"
                    << "  --n NUMBER              Sequence length (default: 512)\n"
                    << "  --d NUMBER              Vector dimension (default: 64)\n"
                    << "  --warmup NUMBER         Unmeasured warm-up iterations (default: 3)\n"
                    << "  --iterations NUMBER     Measured iterations (default: 30)\n"
                    << "  --seed NUMBER           Deterministic input seed (default: 2026)\n"
                    << "  --tolerance NUMBER      Maximum absolute error (default: 2e-4)\n"
                    << "  --variant basic|optimized|all\n"
                    << "  --csv PATH              Write reproducible benchmark rows\n";
                return 0;
            } else throw std::invalid_argument("unknown option: " + argument);
        }
        if (n <= 0 || d <= 0 || warmup_iterations < 0 || iterations <= 0) {
            throw std::invalid_argument("N, d and iterations must be positive; warmup cannot be negative");
        }
        if (tolerance <= 0.0f) throw std::invalid_argument("tolerance must be positive");
        if (variant != "basic" && variant != "optimized" && variant != "all") throw std::invalid_argument("invalid variant");

        cudaDeviceProp properties{};
        CUDA_CHECK(cudaGetDeviceProperties(&properties, 0));
        std::cout << "CUDA device: " << properties.name << '\n';
        std::cout << "Compute capability: " << properties.major << '.' << properties.minor
                  << ", SMs=" << properties.multiProcessorCount << '\n';
        std::cout << "N=" << n << ", d=" << d << ", warmup=" << warmup_iterations
                  << ", iterations=" << iterations << '\n';
        std::cout << "Formula: softmax((Q*K^T)/sqrt(d))*V\n";
        std::cout << "Mapping: QK/PV block=16x16; softmax=one 256-thread block per row\n";

        const auto q = attention::make_random_matrix(n, d, seed);
        const auto k = attention::make_random_matrix(n, d, seed + 1);
        const auto v = attention::make_random_matrix(n, d, seed + 2);
        double cpu_ms = 0.0;
        const auto expected = run_cpu_average(
            q, k, v, n, d, warmup_iterations, iterations, cpu_ms
        );
        std::cout << std::fixed << std::setprecision(6)
                  << "CPU naive: end-to-end=" << cpu_ms << " ms\n";

        std::ofstream csv;
        if (!csv_path.empty()) {
            if (!csv_path.parent_path().empty()) {
                std::filesystem::create_directories(csv_path.parent_path());
            }
            csv.open(csv_path);
            if (!csv) throw std::runtime_error("could not open CSV output: " + csv_path.string());
            csv << "backend,variant,device,N,d,warmup,iterations,kernel_ms,end_to_end_ms,"
                   "speedup_vs_cpu,max_abs_error,mean_abs_error,verification\n";
            csv << "CPU,naive,host," << n << ',' << d << ',' << warmup_iterations << ','
                << iterations << ",0," << cpu_ms << ",1,0,0,PASS\n";
        }

        bool passed = true;
        for (bool optimized : std::vector<bool>{false, true}) {
            if (variant != "all" && (optimized != (variant == "optimized"))) continue;
            const CudaRunResult gpu = run_cuda(
                q, k, v, n, d, warmup_iterations, iterations, optimized
            );
            const attention::ErrorStats error = attention::compare_outputs(expected, gpu.output);
            const bool correct = error.maximum_absolute <= tolerance;
            passed = passed && correct;
            const double speedup = cpu_ms / gpu.end_to_end_milliseconds;
            const char* variant_name = optimized ? "optimized" : "basic";
            std::cout << "CUDA " << (optimized ? "optimized" : "basic")
                      << ": kernel=" << gpu.kernel_milliseconds
                      << " ms, end-to-end=" << gpu.end_to_end_milliseconds
                      << " ms, speedup=" << speedup << "x"
                      << ", max_abs_error=" << error.maximum_absolute
                      << ", mean_abs_error=" << error.mean_absolute
                      << ", verification=" << (correct ? "PASS" : "FAIL") << '\n';
            if (csv) {
                csv << "CUDA," << variant_name << ',' << properties.name << ','
                    << n << ',' << d << ',' << warmup_iterations << ',' << iterations << ','
                    << gpu.kernel_milliseconds << ',' << gpu.end_to_end_milliseconds << ','
                    << speedup << ',' << error.maximum_absolute << ',' << error.mean_absolute << ','
                    << (correct ? "PASS" : "FAIL") << '\n';
            }
        }
        if (csv) std::cout << "CSV: " << std::filesystem::absolute(csv_path).string() << '\n';
        return passed ? 0 : 2;
    } catch (const std::exception& error) {
        std::cerr << "ERROR: " << error.what() << '\n';
        return 1;
    }
}
