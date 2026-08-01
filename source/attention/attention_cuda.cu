#include <cuda_runtime.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
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

std::vector<float> cpu_attention(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    double& milliseconds
) {
    const auto begin = std::chrono::steady_clock::now();
    std::vector<float> scores(static_cast<std::size_t>(n) * n);
    std::vector<float> output(static_cast<std::size_t>(n) * d, 0.0f);
    const float scale = 1.0f / std::sqrt(static_cast<float>(d));
    for (int row = 0; row < n; ++row) {
        for (int column = 0; column < n; ++column) {
            float sum = 0.0f;
            for (int feature = 0; feature < d; ++feature) {
                sum += q[static_cast<std::size_t>(row) * d + feature]
                    * k[static_cast<std::size_t>(column) * d + feature];
            }
            scores[static_cast<std::size_t>(row) * n + column] = sum * scale;
        }
    }
    for (int row = 0; row < n; ++row) {
        float* current = scores.data() + static_cast<std::size_t>(row) * n;
        float maximum = *std::max_element(current, current + n);
        double sum = 0.0;
        for (int column = 0; column < n; ++column) {
            current[column] = std::exp(current[column] - maximum);
            sum += current[column];
        }
        const float inverse_sum = 1.0f / static_cast<float>(sum);
        for (int column = 0; column < n; ++column) {
            current[column] *= inverse_sum;
        }
    }
    for (int row = 0; row < n; ++row) {
        for (int feature = 0; feature < d; ++feature) {
            float sum = 0.0f;
            for (int column = 0; column < n; ++column) {
                sum += scores[static_cast<std::size_t>(row) * n + column]
                    * v[static_cast<std::size_t>(column) * d + feature];
            }
            output[static_cast<std::size_t>(row) * d + feature] = sum;
        }
    }
    const auto end = std::chrono::steady_clock::now();
    milliseconds = std::chrono::duration<double, std::milli>(end - begin).count();
    return output;
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

std::vector<float> run_cuda(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    int iterations,
    bool optimized,
    float& average_ms
) {
    DeviceMemory memory;
    const std::size_t qkv_bytes = static_cast<std::size_t>(n) * d * sizeof(float);
    const std::size_t scores_bytes = static_cast<std::size_t>(n) * n * sizeof(float);
    CUDA_CHECK(cudaMalloc(&memory.q, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.k, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.v, qkv_bytes));
    CUDA_CHECK(cudaMalloc(&memory.scores, scores_bytes));
    CUDA_CHECK(cudaMalloc(&memory.output, qkv_bytes));
    CUDA_CHECK(cudaMemcpy(memory.q, q.data(), qkv_bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(memory.k, k.data(), qkv_bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(memory.v, v.data(), qkv_bytes, cudaMemcpyHostToDevice));

    launch_pipeline(memory, n, d, optimized);
    CUDA_CHECK(cudaDeviceSynchronize());

    cudaEvent_t start = nullptr;
    cudaEvent_t stop = nullptr;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));
    float total_ms = 0.0f;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        CUDA_CHECK(cudaEventRecord(start));
        launch_pipeline(memory, n, d, optimized);
        CUDA_CHECK(cudaEventRecord(stop));
        CUDA_CHECK(cudaEventSynchronize(stop));
        float elapsed = 0.0f;
        CUDA_CHECK(cudaEventElapsedTime(&elapsed, start, stop));
        total_ms += elapsed;
    }
    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    average_ms = total_ms / iterations;

    std::vector<float> output(static_cast<std::size_t>(n) * d);
    CUDA_CHECK(cudaMemcpy(output.data(), memory.output, qkv_bytes, cudaMemcpyDeviceToHost));
    return output;
}

struct ErrorMetrics {
    float maximum = 0.0f;
    double mean = 0.0;
};

ErrorMetrics error_metrics(const std::vector<float>& expected, const std::vector<float>& actual) {
    ErrorMetrics result;
    double absolute_error_sum = 0.0;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        if (!std::isfinite(actual[i])) {
            result.maximum = std::numeric_limits<float>::infinity();
            result.mean = std::numeric_limits<double>::infinity();
            return result;
        }
        const float absolute_error = std::abs(expected[i] - actual[i]);
        result.maximum = std::max(result.maximum, absolute_error);
        absolute_error_sum += absolute_error;
    }
    result.mean = absolute_error_sum / static_cast<double>(expected.size());
    return result;
}

}  // namespace

int main(int argc, char** argv) {
    try {
        int n = 512;
        int d = 64;
        int iterations = 5;
        std::string variant = "all";
        for (int i = 1; i < argc; ++i) {
            const std::string argument = argv[i];
            auto value = [&]() -> const char* {
                if (++i >= argc) throw std::invalid_argument("missing value after " + argument);
                return argv[i];
            };
            if (argument == "--n") n = std::stoi(value());
            else if (argument == "--d") d = std::stoi(value());
            else if (argument == "--iterations") iterations = std::stoi(value());
            else if (argument == "--variant") variant = value();
            else if (argument == "--help") {
                std::cout << "attention_cuda [--n 512] [--d 64] [--iterations 5] [--variant basic|optimized|all]\n";
                return 0;
            } else throw std::invalid_argument("unknown option: " + argument);
        }
        if (n <= 0 || d <= 0 || iterations <= 0) throw std::invalid_argument("N, d and iterations must be positive");
        if (variant != "basic" && variant != "optimized" && variant != "all") throw std::invalid_argument("invalid variant");

        cudaDeviceProp properties{};
        CUDA_CHECK(cudaGetDeviceProperties(&properties, 0));
        std::cout << "CUDA device: " << properties.name << '\n';
        std::cout << "N=" << n << ", d=" << d << ", formula=softmax((Q*K^T)/sqrt(d))*V\n";

        std::mt19937 generator(2026);
        std::uniform_real_distribution<float> distribution(-1.0f, 1.0f);
        auto random_matrix = [&]() {
            std::vector<float> matrix(static_cast<std::size_t>(n) * d);
            for (float& value : matrix) value = distribution(generator);
            return matrix;
        };
        const auto q = random_matrix();
        const auto k = random_matrix();
        const auto v = random_matrix();
        double cpu_ms = 0.0;
        const auto expected = cpu_attention(q, k, v, n, d, cpu_ms);
        std::cout << std::fixed << std::setprecision(6) << "CPU naive: " << cpu_ms << " ms\n";

        bool passed = true;
        for (bool optimized : std::vector<bool>{false, true}) {
            if (variant != "all" && (optimized != (variant == "optimized"))) continue;
            float gpu_ms = 0.0f;
            const auto actual = run_cuda(q, k, v, n, d, iterations, optimized, gpu_ms);
            const ErrorMetrics error = error_metrics(expected, actual);
            const bool correct = error.maximum <= 2.0e-4f;
            passed = passed && correct;
            std::cout << "CUDA " << (optimized ? "optimized" : "basic")
                      << ": " << gpu_ms << " ms, max_abs_error=" << error.maximum
                      << ", mean_abs_error=" << error.mean
                      << ", verification=" << (correct ? "PASS" : "FAIL") << '\n';
        }
        return passed ? 0 : 2;
    } catch (const std::exception& error) {
        std::cerr << "ERROR: " << error.what() << '\n';
        return 1;
    }
}
