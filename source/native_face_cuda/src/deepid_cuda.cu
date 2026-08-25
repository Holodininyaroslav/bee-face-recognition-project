// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : deepid_cuda.cu
// DATE         : 23/08/2026
// DESCRIPTION  : Implements manual CUDA convolution, pooling, dense, normalization, and cosine kernels for DeepID.
// -----------------------------------------------------------------------------
// CUDA Unit : deepid_cuda
// Purpose     : Implements manual CUDA convolution, pooling, dense, normalization, and cosine kernels for DeepID.
// -----------------------------------------------------------------------------
#include <cuda_runtime.h>

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstddef>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#define CUDA_CHECK(call)                                                                    \
    do {                                                                                    \
        const cudaError_t error__ = (call);                                                  \
        if (error__ != cudaSuccess) {                                                        \
            throw std::runtime_error(std::string(#call) + ": " + cudaGetErrorString(error__)); \
        }                                                                                   \
    } while (false)

namespace {

constexpr int kThreads = 256;
constexpr int kInputH = 55;
constexpr int kInputW = 47;
constexpr int kInputC = 3;
constexpr int kEmbedding = 160;

// Wrap cudaMalloc and cudaFree in RAII so exceptions cannot leak device memory.
class DeviceBuffer {
public:
    DeviceBuffer() = default;
    explicit DeviceBuffer(std::size_t count) { allocate(count); }
    DeviceBuffer(const DeviceBuffer&) = delete;
    DeviceBuffer& operator=(const DeviceBuffer&) = delete;
    ~DeviceBuffer() { reset(); }

    void allocate(std::size_t count) {
        reset();
        count_ = count;
        if (count_ != 0) CUDA_CHECK(cudaMalloc(&data_, count_ * sizeof(float)));
    }

    void reset() noexcept {
        if (data_ != nullptr) cudaFree(data_);
        data_ = nullptr;
        count_ = 0;
    }

    float* get() { return data_; }
    const float* get() const { return data_; }
    std::size_t size() const { return count_; }

private:
    float* data_ = nullptr;
    std::size_t count_ = 0;
};

void copy_to_device(DeviceBuffer& destination, const std::vector<float>& source) {
    destination.allocate(source.size());
    CUDA_CHECK(cudaMemcpy(
        destination.get(), source.data(), source.size() * sizeof(float), cudaMemcpyHostToDevice
    ));
}

// Assign one thread to each output activation and fuse convolution with ReLU to avoid an extra memory pass.
__global__ void conv_relu_kernel(
    const float* input,
    const float* weights,
    const float* bias,
    float* output,
    int batch_size,
    int input_h,
    int input_w,
    int input_c,
    int kernel_h,
    int kernel_w,
    int output_c
) {
    const int output_h = input_h - kernel_h + 1;
    const int output_w = input_w - kernel_w + 1;
    const std::size_t total = static_cast<std::size_t>(batch_size) * output_h * output_w * output_c;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;

    std::size_t remaining = index;
    const int oc = static_cast<int>(remaining % output_c);
    remaining /= output_c;
    const int x = static_cast<int>(remaining % output_w);
    remaining /= output_w;
    const int y = static_cast<int>(remaining % output_h);
    const int batch = static_cast<int>(remaining / output_h);

    float sum = bias[oc];
    for (int ky = 0; ky < kernel_h; ++ky) {
        for (int kx = 0; kx < kernel_w; ++kx) {
            const std::size_t input_base =
                ((static_cast<std::size_t>(batch) * input_h + y + ky) * input_w + x + kx) * input_c;
            const std::size_t weight_base =
                (static_cast<std::size_t>(ky) * kernel_w + kx) * input_c * output_c;
            for (int ic = 0; ic < input_c; ++ic) {
                sum += input[input_base + ic] * weights[weight_base + static_cast<std::size_t>(ic) * output_c + oc];
            }
        }
    }
    output[index] = fmaxf(sum, 0.0f);
}

__global__ void max_pool_2x2_kernel(
    const float* input,
    float* output,
    int batch_size,
    int input_h,
    int input_w,
    int channels
) {
    const int output_h = input_h / 2;
    const int output_w = input_w / 2;
    const std::size_t total = static_cast<std::size_t>(batch_size) * output_h * output_w * channels;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;

    std::size_t remaining = index;
    const int channel = static_cast<int>(remaining % channels);
    remaining /= channels;
    const int x = static_cast<int>(remaining % output_w);
    remaining /= output_w;
    const int y = static_cast<int>(remaining % output_h);
    const int batch = static_cast<int>(remaining / output_h);

    float maximum = -FLT_MAX;
    for (int ky = 0; ky < 2; ++ky) {
        for (int kx = 0; kx < 2; ++kx) {
            const std::size_t input_index =
                ((static_cast<std::size_t>(batch) * input_h + y * 2 + ky) * input_w + x * 2 + kx) * channels
                + channel;
            maximum = fmaxf(maximum, input[input_index]);
        }
    }
    output[index] = maximum;
}

__global__ void dense_kernel(
    const float* input,
    const float* weights,
    const float* bias,
    float* output,
    int batch_size,
    int input_features,
    int output_features
) {
    const std::size_t total = static_cast<std::size_t>(batch_size) * output_features;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;
    const int output_feature = static_cast<int>(index % output_features);
    const int batch = static_cast<int>(index / output_features);
    const float* sample = input + static_cast<std::size_t>(batch) * input_features;
    float sum = bias[output_feature];
    for (int input_feature = 0; input_feature < input_features; ++input_feature) {
        sum += sample[input_feature] * weights[
            static_cast<std::size_t>(input_feature) * output_features + output_feature
        ];
    }
    output[index] = sum;
}

__global__ void add_relu_kernel(
    const float* first,
    const float* second,
    float* output,
    std::size_t count
) {
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < count) output[index] = fmaxf(first[index] + second[index], 0.0f);
}

__global__ void normalize_embeddings_kernel(float* embeddings, int batch_size, int width) {
    extern __shared__ float scratch[];
    const int batch = blockIdx.x;
    const int lane = threadIdx.x;
    if (batch >= batch_size) return;
    float sum = 0.0f;
    for (int index = lane; index < width; index += blockDim.x) {
        const float value = embeddings[static_cast<std::size_t>(batch) * width + index];
        sum += value * value;
    }
    scratch[lane] = sum;
    __syncthreads();
    for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {
        if (lane < stride) scratch[lane] += scratch[lane + stride];
        __syncthreads();
    }
    const float inverse_norm = rsqrtf(fmaxf(scratch[0], 1.0e-24f));
    for (int index = lane; index < width; index += blockDim.x) {
        embeddings[static_cast<std::size_t>(batch) * width + index] *= inverse_norm;
    }
}

// Evaluate independent query/reference embedding pairs in parallel and write the complete score matrix.
__global__ void cosine_scores_kernel(
    const float* queries,
    const float* references,
    float* scores,
    int query_count,
    int reference_count,
    int width
) {
    const std::size_t total = static_cast<std::size_t>(query_count) * reference_count;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;
    const int reference = static_cast<int>(index % reference_count);
    const int query = static_cast<int>(index / reference_count);
    float sum = 0.0f;
    for (int feature = 0; feature < width; ++feature) {
        sum += queries[static_cast<std::size_t>(query) * width + feature]
            * references[static_cast<std::size_t>(reference) * width + feature];
    }
    scores[index] = sum;
}

std::size_t blocks(std::size_t count) {
    return (count + kThreads - 1) / kThreads;
}

struct CudaWeights {
    DeviceBuffer conv1_kernel, conv1_bias;
    DeviceBuffer conv2_kernel, conv2_bias;
    DeviceBuffer conv3_kernel, conv3_bias;
    DeviceBuffer conv4_kernel, conv4_bias;
    DeviceBuffer fc11_kernel, fc11_bias;
    DeviceBuffer fc12_kernel, fc12_bias;

    CudaWeights(
        const std::vector<float>& conv1_k, const std::vector<float>& conv1_b,
        const std::vector<float>& conv2_k, const std::vector<float>& conv2_b,
        const std::vector<float>& conv3_k, const std::vector<float>& conv3_b,
        const std::vector<float>& conv4_k, const std::vector<float>& conv4_b,
        const std::vector<float>& fc11_k, const std::vector<float>& fc11_b,
        const std::vector<float>& fc12_k, const std::vector<float>& fc12_b
    ) {
        copy_to_device(conv1_kernel, conv1_k); copy_to_device(conv1_bias, conv1_b);
        copy_to_device(conv2_kernel, conv2_k); copy_to_device(conv2_bias, conv2_b);
        copy_to_device(conv3_kernel, conv3_k); copy_to_device(conv3_bias, conv3_b);
        copy_to_device(conv4_kernel, conv4_k); copy_to_device(conv4_bias, conv4_b);
        copy_to_device(fc11_kernel, fc11_k); copy_to_device(fc11_bias, fc11_b);
        copy_to_device(fc12_kernel, fc12_k); copy_to_device(fc12_bias, fc12_b);
    }
};

}  // namespace

std::vector<float> run_deepid_cuda_forward_batch(
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
    const std::vector<float>& fc12_bias
) {
    if (batch_size <= 0 || input.size() != static_cast<std::size_t>(batch_size) * kInputH * kInputW * kInputC) {
        throw std::runtime_error("Invalid CUDA DeepID batch input");
    }
    static std::mutex runtime_mutex;
    static CudaWeights weights(
        conv1_kernel, conv1_bias, conv2_kernel, conv2_bias, conv3_kernel, conv3_bias,
        conv4_kernel, conv4_bias, fc11_kernel, fc11_bias, fc12_kernel, fc12_bias
    );
    std::lock_guard<std::mutex> lock(runtime_mutex);

    const std::size_t batch = static_cast<std::size_t>(batch_size);
    DeviceBuffer d_input;
    copy_to_device(d_input, input);
    DeviceBuffer d_conv1(batch * 52 * 44 * 20);
    DeviceBuffer d_pool1(batch * 26 * 22 * 20);
    DeviceBuffer d_conv2(batch * 24 * 20 * 40);
    DeviceBuffer d_pool2(batch * 12 * 10 * 40);
    DeviceBuffer d_conv3(batch * 10 * 8 * 60);
    DeviceBuffer d_pool3(batch * 5 * 4 * 60);
    DeviceBuffer d_fc11(batch * kEmbedding);
    DeviceBuffer d_conv4(batch * 4 * 3 * 80);
    DeviceBuffer d_fc12(batch * kEmbedding);
    DeviceBuffer d_embedding(batch * kEmbedding);

    conv_relu_kernel<<<static_cast<unsigned>(blocks(d_conv1.size())), kThreads>>>(
        d_input.get(), weights.conv1_kernel.get(), weights.conv1_bias.get(), d_conv1.get(),
        batch_size, 55, 47, 3, 4, 4, 20
    );
    max_pool_2x2_kernel<<<static_cast<unsigned>(blocks(d_pool1.size())), kThreads>>>(
        d_conv1.get(), d_pool1.get(), batch_size, 52, 44, 20
    );
    conv_relu_kernel<<<static_cast<unsigned>(blocks(d_conv2.size())), kThreads>>>(
        d_pool1.get(), weights.conv2_kernel.get(), weights.conv2_bias.get(), d_conv2.get(),
        batch_size, 26, 22, 20, 3, 3, 40
    );
    max_pool_2x2_kernel<<<static_cast<unsigned>(blocks(d_pool2.size())), kThreads>>>(
        d_conv2.get(), d_pool2.get(), batch_size, 24, 20, 40
    );
    conv_relu_kernel<<<static_cast<unsigned>(blocks(d_conv3.size())), kThreads>>>(
        d_pool2.get(), weights.conv3_kernel.get(), weights.conv3_bias.get(), d_conv3.get(),
        batch_size, 12, 10, 40, 3, 3, 60
    );
    max_pool_2x2_kernel<<<static_cast<unsigned>(blocks(d_pool3.size())), kThreads>>>(
        d_conv3.get(), d_pool3.get(), batch_size, 10, 8, 60
    );
    dense_kernel<<<static_cast<unsigned>(blocks(d_fc11.size())), kThreads>>>(
        d_pool3.get(), weights.fc11_kernel.get(), weights.fc11_bias.get(), d_fc11.get(),
        batch_size, 1200, kEmbedding
    );
    conv_relu_kernel<<<static_cast<unsigned>(blocks(d_conv4.size())), kThreads>>>(
        d_pool3.get(), weights.conv4_kernel.get(), weights.conv4_bias.get(), d_conv4.get(),
        batch_size, 5, 4, 60, 2, 2, 80
    );
    dense_kernel<<<static_cast<unsigned>(blocks(d_fc12.size())), kThreads>>>(
        d_conv4.get(), weights.fc12_kernel.get(), weights.fc12_bias.get(), d_fc12.get(),
        batch_size, 960, kEmbedding
    );
    add_relu_kernel<<<static_cast<unsigned>(blocks(d_embedding.size())), kThreads>>>(
        d_fc11.get(), d_fc12.get(), d_embedding.get(), d_embedding.size()
    );
    normalize_embeddings_kernel<<<batch_size, kThreads, kThreads * sizeof(float)>>>(
        d_embedding.get(), batch_size, kEmbedding
    );
    CUDA_CHECK(cudaGetLastError());

    std::vector<float> output(d_embedding.size());
    CUDA_CHECK(cudaMemcpy(
        output.data(), d_embedding.get(), output.size() * sizeof(float), cudaMemcpyDeviceToHost
    ));
    return output;
}

std::vector<float> run_deepid_cuda_forward(
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
    const std::vector<float>& fc12_bias
) {
    return run_deepid_cuda_forward_batch(
        input, 1,
        conv1_kernel, conv1_bias, conv2_kernel, conv2_bias, conv3_kernel, conv3_bias,
        conv4_kernel, conv4_bias, fc11_kernel, fc11_bias, fc12_kernel, fc12_bias
    );
}

std::vector<float> run_cosine_cuda_scores(
    const std::vector<float>& queries,
    const std::vector<float>& references,
    int query_count,
    int reference_count,
    int embedding_size
) {
    if (query_count <= 0 || reference_count <= 0 || embedding_size <= 0) return {};
    if (queries.size() != static_cast<std::size_t>(query_count) * embedding_size
        || references.size() != static_cast<std::size_t>(reference_count) * embedding_size) {
        throw std::runtime_error("Invalid CUDA cosine score matrix dimensions");
    }
    DeviceBuffer d_queries, d_references;
    copy_to_device(d_queries, queries);
    copy_to_device(d_references, references);
    DeviceBuffer d_scores(static_cast<std::size_t>(query_count) * reference_count);
    cosine_scores_kernel<<<static_cast<unsigned>(blocks(d_scores.size())), kThreads>>>(
        d_queries.get(), d_references.get(), d_scores.get(), query_count, reference_count, embedding_size
    );
    CUDA_CHECK(cudaGetLastError());
    std::vector<float> scores(d_scores.size());
    CUDA_CHECK(cudaMemcpy(
        scores.data(), d_scores.get(), scores.size() * sizeof(float), cudaMemcpyDeviceToHost
    ));
    return scores;
}
