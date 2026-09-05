// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : sface_manual_cuda.cu
// DATE         : 23/08/2026
// DESCRIPTION  : Implements the trained SFace forward pass with project-owned CUDA kernels and no SFace inference-library call.
// -----------------------------------------------------------------------------
// CUDA Unit : sface_manual_cuda
// Purpose     : Implements the trained SFace forward pass with project-owned CUDA kernels and no SFace inference-library call.
// -----------------------------------------------------------------------------
#include "sface_manual_cuda.hpp"

#include <cuda_runtime.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {
constexpr int kInputChannels = 3;
constexpr int kInputSize = 112;
constexpr int kEmbeddingSize = 128;
constexpr int kTile = 16;
constexpr float kConvBatchNormEpsilon = 1.0e-3f;
constexpr float kFinalBatchNormEpsilon = 2.0e-5f;

void check_cuda(cudaError_t status, const char* operation) {
    if (status != cudaSuccess) {
        throw std::runtime_error(std::string(operation) + ": " + cudaGetErrorString(status));
    }
}

struct HostTensor {
    std::vector<std::uint64_t> dimensions;
    std::vector<float> values;
};

constexpr std::uint64_t kMaxTensorElements = 16 * 1024 * 1024;
constexpr std::uint64_t kMaxFileBytes = 256 * 1024 * 1024;
std::uint64_t checked_elements(const std::vector<std::uint64_t>& dimensions) {
    if (dimensions.size() > 4) throw std::runtime_error("Invalid SFace rank");
    std::uint64_t count = 1; // Rank-zero scalars contain one value.
    for (auto dimension : dimensions) {
        if (dimension == 0 || dimension > 65536 || count > kMaxTensorElements / dimension)
            throw std::runtime_error("SFace tensor exceeds allocation limit");
        count *= dimension;
    }
    return count;
}

template <typename T>
T read_value(std::ifstream& stream, const char* field) {
    T value{};
    stream.read(reinterpret_cast<char*>(&value), sizeof(T));
    if (!stream) throw std::runtime_error(std::string("Invalid SFace weight field: ") + field);
    return value;
}

// Validate the custom binary header and tensor metadata before any trained weight reaches device memory.
std::unordered_map<std::string, HostTensor> load_weight_file(const std::filesystem::path& path) {
    const auto file_bytes = std::filesystem::file_size(path);
    if (file_bytes > kMaxFileBytes) throw std::runtime_error("SFace file exceeds size limit");
    std::ifstream stream(path, std::ios::binary);
    if (!stream) throw std::runtime_error("Manual SFace weight file is missing: " + path.string());
    std::array<char, 8> magic{};
    stream.read(magic.data(), static_cast<std::streamsize>(magic.size()));
    if (!stream || std::memcmp(magic.data(), "SFCUDA1\0", magic.size()) != 0) {
        throw std::runtime_error("Manual SFace weight file has an invalid header");
    }
    const auto version = read_value<std::uint32_t>(stream, "version");
    const auto tensor_count = read_value<std::uint32_t>(stream, "tensor count");
    if (version != 1) throw std::runtime_error("Unsupported manual SFace weight version");
    if (tensor_count == 0 || tensor_count > 1024) throw std::runtime_error("Invalid SFace tensor count");

    std::unordered_map<std::string, HostTensor> tensors;
    tensors.reserve(tensor_count);
    for (std::uint32_t index = 0; index < tensor_count; ++index) {
        const auto name_size = read_value<std::uint32_t>(stream, "name length");
        if (name_size == 0 || name_size > 256) throw std::runtime_error("Invalid tensor name length");
        std::string name(name_size, '\0');
        stream.read(name.data(), static_cast<std::streamsize>(name_size));
        const auto rank = read_value<std::uint32_t>(stream, "rank");
        if (rank > 4 || name.find('\0') != std::string::npos || tensors.count(name))
            throw std::runtime_error("Invalid or duplicate SFace tensor metadata");
        HostTensor tensor;
        tensor.dimensions.resize(rank);
        for (auto& dimension : tensor.dimensions) {
            dimension = read_value<std::uint64_t>(stream, "dimension");
        }
        const auto element_count = read_value<std::uint64_t>(stream, "element count");
        const auto position = stream.tellg();
        if (element_count != checked_elements(tensor.dimensions) || position < 0 ||
            static_cast<std::uint64_t>(position) > file_bytes ||
            element_count > (file_bytes - static_cast<std::uint64_t>(position)) / sizeof(float))
            throw std::runtime_error("SFace tensor shape/length mismatch");
        tensor.values.resize(static_cast<std::size_t>(element_count));
        stream.read(
            reinterpret_cast<char*>(tensor.values.data()),
            static_cast<std::streamsize>(tensor.values.size() * sizeof(float))
        );
        if (!stream) throw std::runtime_error("Truncated manual SFace tensor: " + name);
        if (!std::all_of(tensor.values.begin(), tensor.values.end(), [](float value) { return std::isfinite(value); }))
            throw std::runtime_error("Non-finite SFace weight");
        tensors.emplace(std::move(name), std::move(tensor));
    }
    if (stream.peek() != std::char_traits<char>::eof()) throw std::runtime_error("Unexpected trailing SFace data");
    return tensors;
}

const HostTensor& tensor(
    const std::unordered_map<std::string, HostTensor>& tensors,
    const std::string& name
) {
    const auto found = tensors.find(name);
    if (found == tensors.end()) throw std::runtime_error("Manual SFace tensor is missing: " + name);
    return found->second;
}

float* upload(const std::vector<float>& values, const char* operation) {
    float* device = nullptr;
    check_cuda(cudaMalloc(&device, values.size() * sizeof(float)), operation);
    try {
        check_cuda(
            cudaMemcpy(device, values.data(), values.size() * sizeof(float), cudaMemcpyHostToDevice),
            operation
        );
        return device;
    } catch (...) {
        cudaFree(device);
        throw;
    }
}

std::vector<float> transpose_weights(const HostTensor& source) {
    if (source.dimensions.size() < 2) throw std::runtime_error("SFace matrix weight has invalid rank");
    if (checked_elements(source.dimensions) != source.values.size())
        throw std::runtime_error("SFace matrix shape does not match storage");
    const int rows = static_cast<int>(source.dimensions[0]);
    std::size_t columns = 1;
    for (std::size_t index = 1; index < source.dimensions.size(); ++index) {
        columns *= static_cast<std::size_t>(source.dimensions[index]);
    }
    std::vector<float> transposed(columns * rows);
    for (int row = 0; row < rows; ++row) {
        for (std::size_t column = 0; column < columns; ++column) {
            transposed[column * rows + row] = source.values[static_cast<std::size_t>(row) * columns + column];
        }
    }
    return transposed;
}

struct DeviceLayer {
    enum class Kind { Standard3x3, Depthwise3x3, Pointwise1x1 };
    Kind kind = Kind::Pointwise1x1;
    int input_channels = 0;
    int output_channels = 0;
    int input_height = 0;
    int input_width = 0;
    int output_height = 0;
    int output_width = 0;
    int stride = 1;
    float* weights = nullptr;
    float* scale = nullptr;
    float* shift = nullptr;
    float* slope = nullptr;
};

std::pair<std::vector<float>, std::vector<float>> fused_batch_norm(
    const std::unordered_map<std::string, HostTensor>& tensors,
    const std::string& prefix,
    float epsilon
) {
    const auto& gamma = tensor(tensors, prefix + "_gamma").values;
    const auto& beta = tensor(tensors, prefix + "_beta").values;
    const auto& mean = tensor(tensors, prefix + "_moving_mean").values;
    const auto& variance = tensor(tensors, prefix + "_moving_var").values;
    if (gamma.size() != beta.size() || gamma.size() != mean.size() || gamma.size() != variance.size()) {
        throw std::runtime_error("Inconsistent SFace BatchNorm tensors: " + prefix);
    }
    std::vector<float> scale(gamma.size());
    std::vector<float> shift(gamma.size());
    for (std::size_t index = 0; index < gamma.size(); ++index) {
        scale[index] = gamma[index] / std::sqrt(variance[index] + epsilon);
        shift[index] = beta[index] - mean[index] * scale[index];
    }
    return {std::move(scale), std::move(shift)};
}

__device__ float activate(float value, const float* scale, const float* shift, const float* slope, int channel) {
    value = value * scale[channel] + shift[channel];
    return value >= 0.0f ? value : value * slope[channel];
}

__global__ void preprocess_kernel(float* values, std::size_t count, float subtract, float multiply) {
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < count) values[index] = (values[index] - subtract) * multiply;
}

__global__ void standard_conv3x3_kernel(
    const float* input,
    const float* weights,
    const float* scale,
    const float* shift,
    const float* slope,
    float* output,
    int batch,
    int input_channels,
    int output_channels,
    int height,
    int width
) {
    const std::size_t total = static_cast<std::size_t>(batch) * output_channels * height * width;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;
    const int x = static_cast<int>(index % width);
    const int y = static_cast<int>((index / width) % height);
    const int channel = static_cast<int>((index / (static_cast<std::size_t>(width) * height)) % output_channels);
    const int image = static_cast<int>(index / (static_cast<std::size_t>(width) * height * output_channels));
    float sum = 0.0f;
    for (int input_channel = 0; input_channel < input_channels; ++input_channel) {
        for (int ky = 0; ky < 3; ++ky) {
            const int source_y = y + ky - 1;
            if (source_y < 0 || source_y >= height) continue;
            for (int kx = 0; kx < 3; ++kx) {
                const int source_x = x + kx - 1;
                if (source_x < 0 || source_x >= width) continue;
                const std::size_t input_index =
                    ((static_cast<std::size_t>(image) * input_channels + input_channel) * height + source_y) * width + source_x;
                const std::size_t weight_index =
                    ((static_cast<std::size_t>(channel) * input_channels + input_channel) * 3 + ky) * 3 + kx;
                sum += input[input_index] * weights[weight_index];
            }
        }
    }
    output[index] = activate(sum, scale, shift, slope, channel);
}

__global__ void depthwise_conv3x3_kernel(
    const float* input,
    const float* weights,
    const float* scale,
    const float* shift,
    const float* slope,
    float* output,
    int batch,
    int channels,
    int input_height,
    int input_width,
    int output_height,
    int output_width,
    int stride
) {
    const std::size_t total = static_cast<std::size_t>(batch) * channels * output_height * output_width;
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;
    const int x = static_cast<int>(index % output_width);
    const int y = static_cast<int>((index / output_width) % output_height);
    const int channel = static_cast<int>((index / (static_cast<std::size_t>(output_width) * output_height)) % channels);
    const int image = static_cast<int>(index / (static_cast<std::size_t>(output_width) * output_height * channels));
    float sum = 0.0f;
    for (int ky = 0; ky < 3; ++ky) {
        const int source_y = y * stride + ky - 1;
        if (source_y < 0 || source_y >= input_height) continue;
        for (int kx = 0; kx < 3; ++kx) {
            const int source_x = x * stride + kx - 1;
            if (source_x < 0 || source_x >= input_width) continue;
            const std::size_t input_index =
                ((static_cast<std::size_t>(image) * channels + channel) * input_height + source_y) * input_width + source_x;
            sum += input[input_index] * weights[(channel * 3 + ky) * 3 + kx];
        }
    }
    output[index] = activate(sum, scale, shift, slope, channel);
}

// Express each 1x1 convolution as a tiled GEMM and reuse input and weight tiles through shared memory.
__global__ void pointwise_gemm_kernel(
    const float* input,
    const float* transposed_weights,
    const float* scale,
    const float* shift,
    const float* slope,
    float* output,
    int rows,
    int input_channels,
    int output_channels,
    int spatial
) {
    __shared__ float input_tile[kTile][kTile];
    __shared__ float weight_tile[kTile][kTile];
    const int output_tiles = (output_channels + kTile - 1) / kTile;
    const int row_tile = static_cast<int>(blockIdx.x) / output_tiles;
    const int output_tile = static_cast<int>(blockIdx.x) % output_tiles;
    const int local_row = threadIdx.x;
    const int local_output = threadIdx.y;
    const int row = row_tile * kTile + local_row;
    const int output_channel = output_tile * kTile + local_output;
    float sum = 0.0f;
    for (int start = 0; start < input_channels; start += kTile) {
        const int input_channel_for_a = start + local_output;
        const int input_channel_for_b = start + local_row;
        if (row < rows && input_channel_for_a < input_channels) {
            const int image = row / spatial;
            const int position = row % spatial;
            input_tile[local_output][local_row] =
                input[(static_cast<std::size_t>(image) * input_channels + input_channel_for_a) * spatial + position];
        } else {
            input_tile[local_output][local_row] = 0.0f;
        }
        if (input_channel_for_b < input_channels && output_channel < output_channels) {
            weight_tile[local_row][local_output] =
                transposed_weights[static_cast<std::size_t>(input_channel_for_b) * output_channels + output_channel];
        } else {
            weight_tile[local_row][local_output] = 0.0f;
        }
        __syncthreads();
        #pragma unroll
        for (int k = 0; k < kTile; ++k) {
            sum += input_tile[k][local_row] * weight_tile[k][local_output];
        }
        __syncthreads();
    }
    if (row < rows && output_channel < output_channels) {
        const int image = row / spatial;
        const int position = row % spatial;
        const std::size_t output_index =
            (static_cast<std::size_t>(image) * output_channels + output_channel) * spatial + position;
        output[output_index] = activate(sum, scale, shift, slope, output_channel);
    }
}

__global__ void affine_in_place_kernel(
    float* values,
    const float* scale,
    const float* shift,
    std::size_t total,
    int channels,
    int spatial
) {
    const std::size_t index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index >= total) return;
    const int channel = static_cast<int>((index / spatial) % channels);
    values[index] = values[index] * scale[channel] + shift[channel];
}

// Compute the 128-value embedding directly from flattened features and apply the trained output transform.
__global__ void fully_connected_kernel(
    const float* input,
    const float* transposed_weights,
    const float* bias,
    const float* scale,
    const float* shift,
    float* output,
    int rows,
    int input_dimensions
) {
    __shared__ float input_tile[kTile][kTile];
    __shared__ float weight_tile[kTile][kTile];
    const int output_tiles = (kEmbeddingSize + kTile - 1) / kTile;
    const int row_tile = static_cast<int>(blockIdx.x) / output_tiles;
    const int output_tile = static_cast<int>(blockIdx.x) % output_tiles;
    const int local_row = threadIdx.x;
    const int local_output = threadIdx.y;
    const int row = row_tile * kTile + local_row;
    const int output_dimension = output_tile * kTile + local_output;
    float sum = 0.0f;
    for (int start = 0; start < input_dimensions; start += kTile) {
        const int input_for_a = start + local_output;
        const int input_for_b = start + local_row;
        input_tile[local_output][local_row] =
            row < rows && input_for_a < input_dimensions
                ? input[static_cast<std::size_t>(row) * input_dimensions + input_for_a]
                : 0.0f;
        weight_tile[local_row][local_output] =
            input_for_b < input_dimensions && output_dimension < kEmbeddingSize
                ? transposed_weights[static_cast<std::size_t>(input_for_b) * kEmbeddingSize + output_dimension]
                : 0.0f;
        __syncthreads();
        #pragma unroll
        for (int k = 0; k < kTile; ++k) {
            sum += input_tile[k][local_row] * weight_tile[k][local_output];
        }
        __syncthreads();
    }
    if (row < rows && output_dimension < kEmbeddingSize) {
        const float value = sum + bias[output_dimension];
        output[static_cast<std::size_t>(row) * kEmbeddingSize + output_dimension] =
            value * scale[output_dimension] + shift[output_dimension];
    }
}

__global__ void normalize_embeddings_kernel(float* embeddings, int rows) {
    __shared__ float sums[256];
    const int row = blockIdx.x;
    const int lane = threadIdx.x;
    float sum = 0.0f;
    for (int dimension = lane; dimension < kEmbeddingSize; dimension += blockDim.x) {
        const float value = embeddings[static_cast<std::size_t>(row) * kEmbeddingSize + dimension];
        sum += value * value;
    }
    sums[lane] = sum;
    __syncthreads();
    for (int width = blockDim.x / 2; width > 0; width /= 2) {
        if (lane < width) sums[lane] += sums[lane + width];
        __syncthreads();
    }
    const float inverse_norm = rsqrtf(fmaxf(sums[0], 1.0e-12f));
    for (int dimension = lane; dimension < kEmbeddingSize; dimension += blockDim.x) {
        embeddings[static_cast<std::size_t>(row) * kEmbeddingSize + dimension] *= inverse_norm;
    }
}
}

struct ManualSFaceCudaContext {
    std::vector<DeviceLayer> layers;
    float input_subtract = 127.5f;
    float input_multiply = 1.0f / 128.0f;
    float* final_feature_scale = nullptr;
    float* final_feature_shift = nullptr;
    float* fc_weights = nullptr;
    float* fc_bias = nullptr;
    float* embedding_scale = nullptr;
    float* embedding_shift = nullptr;
    int final_dimensions = 0;
};

namespace {
void release_context(ManualSFaceCudaContext* context) noexcept {
    if (!context) return;
    for (auto& layer : context->layers) {
        cudaFree(layer.weights);
        cudaFree(layer.scale);
        cudaFree(layer.shift);
        cudaFree(layer.slope);
    }
    cudaFree(context->final_feature_scale);
    cudaFree(context->final_feature_shift);
    cudaFree(context->fc_weights);
    cudaFree(context->fc_bias);
    cudaFree(context->embedding_scale);
    cudaFree(context->embedding_shift);
    delete context;
}

DeviceLayer make_layer(
    const std::unordered_map<std::string, HostTensor>& tensors,
    const std::string& convolution,
    const std::string& batch_norm,
    const std::string& prelu,
    DeviceLayer::Kind kind,
    int input_channels,
    int input_height,
    int input_width,
    int stride
) {
    const auto& weight = tensor(tensors, convolution + "_weight");
    const bool pointwise = kind == DeviceLayer::Kind::Pointwise1x1;
    const bool depthwise = kind == DeviceLayer::Kind::Depthwise3x3;
    if (weight.dimensions.size() != 4 || weight.dimensions[0] > 2048 ||
        weight.dimensions[1] != static_cast<std::uint64_t>(depthwise ? 1 : input_channels) ||
        weight.dimensions[2] != (pointwise ? 1 : 3) || weight.dimensions[3] != (pointwise ? 1 : 3) ||
        (depthwise && weight.dimensions[0] != static_cast<std::uint64_t>(input_channels)))
        throw std::runtime_error("SFace convolution shape violates kernel schema");
    DeviceLayer layer;
    layer.kind = kind;
    layer.input_channels = input_channels;
    layer.output_channels = static_cast<int>(weight.dimensions.at(0));
    layer.input_height = input_height;
    layer.input_width = input_width;
    layer.stride = stride;
    layer.output_height = (input_height + 2 - 3) / stride + 1;
    layer.output_width = (input_width + 2 - 3) / stride + 1;
    if (kind == DeviceLayer::Kind::Pointwise1x1) {
        layer.output_height = input_height;
        layer.output_width = input_width;
    }
    auto [scale, shift] = fused_batch_norm(tensors, batch_norm, kConvBatchNormEpsilon);
    if (scale.size() != static_cast<std::size_t>(layer.output_channels) ||
        tensor(tensors, prelu + "_gamma").values.size() != scale.size())
        throw std::runtime_error("SFace channel parameter mismatch");
    try {
        layer.weights = upload(pointwise ? transpose_weights(weight) : weight.values, "upload SFace weights");
        layer.scale = upload(scale, "upload SFace BatchNorm scale");
        layer.shift = upload(shift, "upload SFace BatchNorm shift");
        layer.slope = upload(tensor(tensors, prelu + "_gamma").values, "upload SFace PReLU slope");
    } catch (...) {
        cudaFree(layer.weights); cudaFree(layer.scale); cudaFree(layer.shift); cudaFree(layer.slope);
        throw;
    }
    return layer;
}
}

ManualSFaceCudaContext* create_manual_sface_cuda(const std::filesystem::path& weight_path) {
    auto tensors = load_weight_file(weight_path);
    auto* context = new ManualSFaceCudaContext();
    try {
        context->input_subtract = tensor(tensors, "scalar_op1").values.at(0);
        context->input_multiply = tensor(tensors, "scalar_op2").values.at(0);
        int channels = kInputChannels;
        int height = kInputSize;
        int width = kInputSize;
        context->layers.push_back(make_layer(
            tensors,
            "conv_1_conv2d",
            "conv_1_batchnorm",
            "conv_1_relu",
            DeviceLayer::Kind::Standard3x3,
            channels,
            height,
            width,
            1
        ));
        channels = context->layers.back().output_channels;
        for (int block = 2; block <= 14; ++block) {
            const int stride = block == 3 || block == 5 || block == 7 || block == 13 ? 2 : 1;
            const std::string base = "conv_" + std::to_string(block);
            context->layers.push_back(make_layer(
                tensors,
                base + "_dw_conv2d",
                base + "_dw_batchnorm",
                base + "_dw_relu",
                DeviceLayer::Kind::Depthwise3x3,
                channels,
                height,
                width,
                stride
            ));
            height = context->layers.back().output_height;
            width = context->layers.back().output_width;
            context->layers.push_back(make_layer(
                tensors,
                base + "_conv2d",
                base + "_batchnorm",
                base + "_relu",
                DeviceLayer::Kind::Pointwise1x1,
                channels,
                height,
                width,
                1
            ));
            channels = context->layers.back().output_channels;
        }
        auto [feature_scale, feature_shift] = fused_batch_norm(tensors, "bn1", kFinalBatchNormEpsilon);
        if (height != 7 || width != 7 || feature_scale.size() != static_cast<std::size_t>(channels))
            throw std::runtime_error("SFace final feature shape mismatch");
        context->final_feature_scale = upload(feature_scale, "upload final feature BatchNorm scale");
        context->final_feature_shift = upload(feature_shift, "upload final feature BatchNorm shift");
        const auto& fc_weight = tensor(tensors, "pre_fc1_weight");
        if (fc_weight.dimensions != std::vector<std::uint64_t>{kEmbeddingSize, static_cast<std::uint64_t>(channels * 49)} ||
            tensor(tensors, "pre_fc1_bias").values.size() != kEmbeddingSize)
            throw std::runtime_error("SFace dense layer shape mismatch");
        context->final_dimensions = static_cast<int>(fc_weight.dimensions.at(1));
        context->fc_weights = upload(transpose_weights(fc_weight), "upload manual SFace FC weights");
        context->fc_bias = upload(tensor(tensors, "pre_fc1_bias").values, "upload manual SFace FC bias");
        auto [embedding_scale, embedding_shift] = fused_batch_norm(tensors, "fc1", kFinalBatchNormEpsilon);
        if (embedding_scale.size() != kEmbeddingSize) throw std::runtime_error("SFace embedding shape mismatch");
        context->embedding_scale = upload(embedding_scale, "upload embedding BatchNorm scale");
        context->embedding_shift = upload(embedding_shift, "upload embedding BatchNorm shift");
        return context;
    } catch (...) {
        release_context(context);
        throw;
    }
}

void destroy_manual_sface_cuda(ManualSFaceCudaContext* context) noexcept {
    release_context(context);
}

// Execute every trained SFace layer with project-owned kernels while keeping the complete image batch on the GPU.
std::vector<float> manual_sface_cuda_forward(
    ManualSFaceCudaContext* context,
    const std::vector<float>& aligned_nchw_rgb,
    int batch_size
) {
    if (!context) throw std::runtime_error("Manual SFace CUDA context is not initialized");
    if (batch_size <= 0) return {};
    if (batch_size > 64) throw std::runtime_error("SFace batch exceeds safe limit (64)");
    const std::size_t input_elements =
        static_cast<std::size_t>(batch_size) * kInputChannels * kInputSize * kInputSize;
    if (aligned_nchw_rgb.size() != input_elements) {
        throw std::runtime_error("Manual SFace CUDA input has an invalid size");
    }
    std::size_t maximum_elements = input_elements;
    for (const auto& layer : context->layers) {
        maximum_elements = std::max(
            maximum_elements,
            static_cast<std::size_t>(batch_size) * layer.output_channels * layer.output_height * layer.output_width
        );
    }
    float* first = nullptr;
    float* second = nullptr;
    float* embeddings = nullptr;
    check_cuda(cudaMalloc(&first, maximum_elements * sizeof(float)), "cudaMalloc manual SFace buffer A");
    try {
        check_cuda(cudaMalloc(&second, maximum_elements * sizeof(float)), "cudaMalloc manual SFace buffer B");
        check_cuda(
            cudaMalloc(&embeddings, static_cast<std::size_t>(batch_size) * kEmbeddingSize * sizeof(float)),
            "cudaMalloc manual SFace embeddings"
        );
        check_cuda(
            cudaMemcpy(
                first,
                aligned_nchw_rgb.data(),
                input_elements * sizeof(float),
                cudaMemcpyHostToDevice
            ),
            "copy aligned faces to manual SFace CUDA"
        );
        constexpr int threads = 256;
        preprocess_kernel<<<static_cast<unsigned int>((input_elements + threads - 1) / threads), threads>>>(
            first,
            input_elements,
            context->input_subtract,
            context->input_multiply
        );
        check_cuda(cudaGetLastError(), "manual SFace preprocess kernel");

        float* input = first;
        float* output = second;
        for (const auto& layer : context->layers) {
            const std::size_t output_elements =
                static_cast<std::size_t>(batch_size) * layer.output_channels * layer.output_height * layer.output_width;
            if (layer.kind == DeviceLayer::Kind::Standard3x3) {
                standard_conv3x3_kernel<<<
                    static_cast<unsigned int>((output_elements + threads - 1) / threads),
                    threads
                >>>(
                    input,
                    layer.weights,
                    layer.scale,
                    layer.shift,
                    layer.slope,
                    output,
                    batch_size,
                    layer.input_channels,
                    layer.output_channels,
                    layer.output_height,
                    layer.output_width
                );
            } else if (layer.kind == DeviceLayer::Kind::Depthwise3x3) {
                depthwise_conv3x3_kernel<<<
                    static_cast<unsigned int>((output_elements + threads - 1) / threads),
                    threads
                >>>(
                    input,
                    layer.weights,
                    layer.scale,
                    layer.shift,
                    layer.slope,
                    output,
                    batch_size,
                    layer.input_channels,
                    layer.input_height,
                    layer.input_width,
                    layer.output_height,
                    layer.output_width,
                    layer.stride
                );
            } else {
                const int spatial = layer.output_height * layer.output_width;
                const int rows = batch_size * spatial;
                const int row_tiles = (rows + kTile - 1) / kTile;
                const int output_tiles = (layer.output_channels + kTile - 1) / kTile;
                pointwise_gemm_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(
                    input,
                    layer.weights,
                    layer.scale,
                    layer.shift,
                    layer.slope,
                    output,
                    rows,
                    layer.input_channels,
                    layer.output_channels,
                    spatial
                );
            }
            check_cuda(cudaGetLastError(), "manual SFace layer kernel");
            std::swap(input, output);
        }

        const std::size_t feature_elements = static_cast<std::size_t>(batch_size) * context->final_dimensions;
        affine_in_place_kernel<<<
            static_cast<unsigned int>((feature_elements + threads - 1) / threads),
            threads
        >>>(
            input,
            context->final_feature_scale,
            context->final_feature_shift,
            feature_elements,
            context->final_dimensions / 49,
            49
        );
        check_cuda(cudaGetLastError(), "manual SFace final feature BatchNorm kernel");

        const int row_tiles = (batch_size + kTile - 1) / kTile;
        const int output_tiles = (kEmbeddingSize + kTile - 1) / kTile;
        fully_connected_kernel<<<row_tiles * output_tiles, dim3(kTile, kTile)>>>(
            input,
            context->fc_weights,
            context->fc_bias,
            context->embedding_scale,
            context->embedding_shift,
            embeddings,
            batch_size,
            context->final_dimensions
        );
        check_cuda(cudaGetLastError(), "manual SFace fully connected kernel");
        normalize_embeddings_kernel<<<batch_size, 256>>>(embeddings, batch_size);
        check_cuda(cudaGetLastError(), "manual SFace normalization kernel");

        std::vector<float> result(static_cast<std::size_t>(batch_size) * kEmbeddingSize);
        check_cuda(
            cudaMemcpy(
                result.data(),
                embeddings,
                result.size() * sizeof(float),
                cudaMemcpyDeviceToHost
            ),
            "copy manual SFace embeddings to host"
        );
        cudaFree(embeddings);
        cudaFree(second);
        cudaFree(first);
        return result;
    } catch (...) {
        cudaFree(embeddings);
        cudaFree(second);
        cudaFree(first);
        throw;
    }
}
