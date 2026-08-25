// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : deepid_engine.cpp
// DATE         : 23/08/2026
// DESCRIPTION  : Implements the C++ DeepID host pipeline, preprocessing, references, and backend dispatch.
// -----------------------------------------------------------------------------
// Source Unit : deepid_engine
// Purpose     : Implements the C++ DeepID host pipeline, preprocessing, references, and backend dispatch.
// -----------------------------------------------------------------------------
#include "deepid_engine.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cwctype>
#include <fstream>
#include <functional>
#include <iostream>
#include <numeric>
#include <queue>
#include <stdexcept>
#include <unordered_map>

namespace fs = std::filesystem;

#if FACE_DETECTOR_USE_CUDA
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
    const std::vector<float>& fc12_bias);
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
    const std::vector<float>& fc12_bias);
#endif

#if FACE_DETECTOR_USE_HIP
std::vector<float> run_deepid_hip_forward(
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
    const std::vector<float>& fc12_bias);
#endif

#if FACE_DETECTOR_USE_OPENCL
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
    const std::vector<float>& fc12_bias);
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
    const std::vector<float>& fc12_bias);
#endif

namespace {
constexpr int kInputH = 55;
constexpr int kInputW = 47;
constexpr int kEmbedding = 160;
constexpr int kFaceGateGrid = 96;

bool is_supported_image(const fs::path& path) {
    auto ext = path.extension().wstring();
    for (auto& ch : ext) {
        ch = static_cast<wchar_t>(std::towlower(ch));
    }
    return ext == L".png" || ext == L".jpg" || ext == L".jpeg" || ext == L".bmp";
}

std::string reference_label(const fs::path& path) {
    const auto parent = path.parent_path().filename().string();
    if (!parent.empty() && parent != "." && parent != "references") {
        return parent;
    }

    const auto stem = path.stem().string();
    const auto double_sep = stem.find("__");
    if (double_sep != std::string::npos && double_sep > 0) {
        return stem.substr(0, double_sep);
    }

    const auto single_sep = stem.find('_');
    if (single_sep != std::string::npos && single_sep > 0) {
        return stem.substr(0, single_sep);
    }

    return stem;
}

float relu(float value) {
    return value > 0.0f ? value : 0.0f;
}

std::uint32_t read_u32(std::istream& in) {
    std::uint32_t value = 0;
    in.read(reinterpret_cast<char*>(&value), sizeof(value));
    return value;
}

std::vector<float> read_record(std::istream& in, const std::uint32_t count) {
    std::vector<float> values(count);
    in.read(reinterpret_cast<char*>(values.data()), static_cast<std::streamsize>(count * sizeof(float)));
    return values;
}

std::unordered_map<std::string, std::vector<float>> load_weights(const fs::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error("DeepID weights not found: " + path.string());
    }

    char magic[8] = {};
    in.read(magic, sizeof(magic));
    if (std::string(magic, magic + 8) != std::string("DIDW1\0\0\0", 8)) {
        throw std::runtime_error("Invalid DeepID weights file: " + path.string());
    }

    const auto records = read_u32(in);
    std::unordered_map<std::string, std::vector<float>> weights;
    for (std::uint32_t i = 0; i < records; ++i) {
        const auto name_size = read_u32(in);
        std::string name(name_size, '\0');
        in.read(name.data(), static_cast<std::streamsize>(name.size()));
        const auto count = read_u32(in);
        weights.emplace(std::move(name), read_record(in, count));
    }
    return weights;
}

const std::vector<float>& require_weight(
    const std::unordered_map<std::string, std::vector<float>>& weights,
    const std::string& name,
    std::size_t count) {
    const auto found = weights.find(name);
    if (found == weights.end()) {
        throw std::runtime_error("Missing DeepID weight: " + name);
    }
    if (found->second.size() != count) {
        throw std::runtime_error("Unexpected weight size for " + name);
    }
    return found->second;
}

DeepIDModel::Tensor resize_letterbox_bgr(const Image& image) {
    DeepIDModel::Tensor out;
    out.h = kInputH;
    out.w = kInputW;
    out.c = 3;
    out.data.assign(kInputH * kInputW * 3, 0.0f);

    const float scale = std::min(static_cast<float>(kInputW) / image.width, static_cast<float>(kInputH) / image.height);
    const int resized_w = std::max(1, static_cast<int>(image.width * scale));
    const int resized_h = std::max(1, static_cast<int>(image.height * scale));
    const int pad_x = (kInputW - resized_w) / 2;
    const int pad_y = (kInputH - resized_h) / 2;

    for (int y = 0; y < resized_h; ++y) {
        const float src_y = (y + 0.5f) / scale - 0.5f;
        const int y0 = std::clamp(static_cast<int>(std::floor(src_y)), 0, image.height - 1);
        const int y1 = std::clamp(y0 + 1, 0, image.height - 1);
        const float wy = src_y - y0;

        for (int x = 0; x < resized_w; ++x) {
            const float src_x = (x + 0.5f) / scale - 0.5f;
            const int x0 = std::clamp(static_cast<int>(std::floor(src_x)), 0, image.width - 1);
            const int x1 = std::clamp(x0 + 1, 0, image.width - 1);
            const float wx = src_x - x0;

            float rgb[3] = {};
            for (int yy = 0; yy < 2; ++yy) {
                for (int xx = 0; xx < 2; ++xx) {
                    const int sx = xx == 0 ? x0 : x1;
                    const int sy = yy == 0 ? y0 : y1;
                    const float weight = (xx == 0 ? 1.0f - wx : wx) * (yy == 0 ? 1.0f - wy : wy);
                    const auto* px = image.rgba.data() + (static_cast<std::size_t>(sy) * image.width + sx) * 4;
                    rgb[0] += weight * px[0];
                    rgb[1] += weight * px[1];
                    rgb[2] += weight * px[2];
                }
            }

            const int dst = ((pad_y + y) * kInputW + (pad_x + x)) * 3;
            out.data[dst + 0] = rgb[2] / 255.0f;
            out.data[dst + 1] = rgb[1] / 255.0f;
            out.data[dst + 2] = rgb[0] / 255.0f;
        }
    }

    return out;
}

DeepIDModel::Tensor conv_relu(
    const DeepIDModel::Tensor& input,
    const std::vector<float>& kernel,
    const std::vector<float>& bias,
    int kh,
    int kw,
    int out_c) {
    DeepIDModel::Tensor out;
    out.h = input.h - kh + 1;
    out.w = input.w - kw + 1;
    out.c = out_c;
    out.data.assign(out.h * out.w * out.c, 0.0f);

    for (int y = 0; y < out.h; ++y) {
        for (int x = 0; x < out.w; ++x) {
            for (int oc = 0; oc < out.c; ++oc) {
                float sum = bias[oc];
                for (int ky = 0; ky < kh; ++ky) {
                    for (int kx = 0; kx < kw; ++kx) {
                        for (int ic = 0; ic < input.c; ++ic) {
                            const int input_idx = ((y + ky) * input.w + (x + kx)) * input.c + ic;
                            const int kernel_idx = (((ky * kw + kx) * input.c + ic) * out.c) + oc;
                            sum += input.data[input_idx] * kernel[kernel_idx];
                        }
                    }
                }
                out.data[(y * out.w + x) * out.c + oc] = relu(sum);
            }
        }
    }

    return out;
}

DeepIDModel::Tensor max_pool_2x2(const DeepIDModel::Tensor& input) {
    DeepIDModel::Tensor out;
    out.h = input.h / 2;
    out.w = input.w / 2;
    out.c = input.c;
    out.data.assign(out.h * out.w * out.c, 0.0f);

    for (int y = 0; y < out.h; ++y) {
        for (int x = 0; x < out.w; ++x) {
            for (int c = 0; c < out.c; ++c) {
                float value = -1.0e30f;
                for (int ky = 0; ky < 2; ++ky) {
                    for (int kx = 0; kx < 2; ++kx) {
                        const int idx = (((y * 2 + ky) * input.w) + (x * 2 + kx)) * input.c + c;
                        value = std::max(value, input.data[idx]);
                    }
                }
                out.data[(y * out.w + x) * out.c + c] = value;
            }
        }
    }
    return out;
}

std::vector<float> dense(
    const std::vector<float>& input,
    const std::vector<float>& kernel,
    const std::vector<float>& bias,
    int out_features) {
    std::vector<float> out(out_features, 0.0f);
    for (int o = 0; o < out_features; ++o) {
        float sum = bias[o];
        for (std::size_t i = 0; i < input.size(); ++i) {
            sum += input[i] * kernel[i * out_features + o];
        }
        out[o] = sum;
    }
    return out;
}

void l2_normalize(std::vector<float>& embedding) {
    double norm = 0.0;
    for (float value : embedding) {
        norm += static_cast<double>(value) * value;
    }
    norm = std::sqrt(norm);
    if (norm <= 1.0e-12) {
        return;
    }
    for (float& value : embedding) {
        value = static_cast<float>(value / norm);
    }
}

float cosine_similarity(const std::vector<float>& a, const std::vector<float>& b) {
    if (a.size() != b.size()) {
        throw std::runtime_error("Embedding sizes do not match");
    }
    return std::inner_product(a.begin(), a.end(), b.begin(), 0.0f);
}

bool has_face_like_region(const Image& image, float* out_score) {
    if (out_score) {
        *out_score = 0.0f;
    }

    std::vector<float> gray(kFaceGateGrid * kFaceGateGrid);
    std::vector<unsigned char> skin(kFaceGateGrid * kFaceGateGrid);

    for (int gy = 0; gy < kFaceGateGrid; ++gy) {
        const int sy = gy * image.height / kFaceGateGrid;
        for (int gx = 0; gx < kFaceGateGrid; ++gx) {
            const int sx = gx * image.width / kFaceGateGrid;
            const auto* px = image.rgba.data() + (static_cast<std::size_t>(sy) * image.width + sx) * 4;
            const float r = px[0] / 255.0f;
            const float g = px[1] / 255.0f;
            const float b = px[2] / 255.0f;
            gray[gy * kFaceGateGrid + gx] = 0.299f * r + 0.587f * g + 0.114f * b;

            const float maxc = std::max({r, g, b});
            const float minc = std::min({r, g, b});
            const bool rgb_skin = r > 0.34f && g > 0.20f && b > 0.12f && r > g * 1.05f && r > b * 1.18f && maxc - minc > 0.09f;
            const bool not_too_bright = maxc < 0.96f;
            const bool not_too_dark = maxc > 0.22f;
            skin[gy * kFaceGateGrid + gx] = (rgb_skin && not_too_bright && not_too_dark) ? 1 : 0;
        }
    }

    float best_score = 0.0f;
    std::vector<unsigned char> visited(kFaceGateGrid * kFaceGateGrid);
    const int dxs[] = {1, -1, 0, 0};
    const int dys[] = {0, 0, 1, -1};

    for (int start_y = 0; start_y < kFaceGateGrid; ++start_y) {
        for (int start_x = 0; start_x < kFaceGateGrid; ++start_x) {
            const int start = start_y * kFaceGateGrid + start_x;
            if (!skin[start] || visited[start]) {
                continue;
            }

            int min_x = start_x;
            int max_x = start_x;
            int min_y = start_y;
            int max_y = start_y;
            int area = 0;
            std::queue<int> queue;
            queue.push(start);
            visited[start] = 1;

            while (!queue.empty()) {
                const int idx = queue.front();
                queue.pop();
                const int x = idx % kFaceGateGrid;
                const int y = idx / kFaceGateGrid;
                ++area;
                min_x = std::min(min_x, x);
                max_x = std::max(max_x, x);
                min_y = std::min(min_y, y);
                max_y = std::max(max_y, y);

                for (int i = 0; i < 4; ++i) {
                    const int nx = x + dxs[i];
                    const int ny = y + dys[i];
                    if (nx < 0 || ny < 0 || nx >= kFaceGateGrid || ny >= kFaceGateGrid) {
                        continue;
                    }
                    const int nidx = ny * kFaceGateGrid + nx;
                    if (skin[nidx] && !visited[nidx]) {
                        visited[nidx] = 1;
                        queue.push(nidx);
                    }
                }
            }

            const int width = max_x - min_x + 1;
            const int height = max_y - min_y + 1;
            const float image_area = static_cast<float>(kFaceGateGrid * kFaceGateGrid);
            const float area_ratio = area / image_area;
            const float aspect = width / static_cast<float>(std::max(1, height));
            const float fill = area / static_cast<float>(std::max(1, width * height));

            if (area_ratio < 0.015f || area_ratio > 0.42f || aspect < 0.45f || aspect > 1.35f || fill < 0.22f) {
                continue;
            }

            const int eye_y0 = min_y + height / 5;
            const int eye_y1 = min_y + height / 2;
            const int left_x0 = min_x + width / 8;
            const int left_x1 = min_x + width / 2;
            const int right_x0 = min_x + width / 2;
            const int right_x1 = max_x - width / 8;

            int left_dark = 0;
            int right_dark = 0;
            int left_count = 0;
            int right_count = 0;
            for (int y = eye_y0; y <= eye_y1; ++y) {
                for (int x = left_x0; x <= left_x1; ++x) {
                    ++left_count;
                    if (gray[y * kFaceGateGrid + x] < 0.34f) {
                        ++left_dark;
                    }
                }
                for (int x = right_x0; x <= right_x1; ++x) {
                    ++right_count;
                    if (gray[y * kFaceGateGrid + x] < 0.34f) {
                        ++right_dark;
                    }
                }
            }

            const float left_dark_ratio = left_dark / static_cast<float>(std::max(1, left_count));
            const float right_dark_ratio = right_dark / static_cast<float>(std::max(1, right_count));
            const bool has_eye_regions = left_dark_ratio > 0.015f && right_dark_ratio > 0.015f;

            float symmetry_sum = 0.0f;
            int symmetry_count = 0;
            const int cx = (min_x + max_x) / 2;
            for (int y = min_y; y <= max_y; ++y) {
                for (int offset = 1; offset < width / 2; ++offset) {
                    const int lx = cx - offset;
                    const int rx = cx + offset;
                    if (lx >= min_x && rx <= max_x) {
                        symmetry_sum += 1.0f - std::abs(gray[y * kFaceGateGrid + lx] - gray[y * kFaceGateGrid + rx]);
                        ++symmetry_count;
                    }
                }
            }
            const float symmetry = symmetry_sum / static_cast<float>(std::max(1, symmetry_count));

            const float area_score = std::clamp(area_ratio * 8.0f, 0.0f, 1.0f);
            const float aspect_score = std::clamp(1.0f - std::abs(aspect - 0.78f), 0.0f, 1.0f);
            const float fill_score = std::clamp((fill - 0.22f) * 2.0f, 0.0f, 1.0f);
            const float symmetry_score = std::clamp((symmetry - 0.68f) * 2.2f, 0.0f, 1.0f);
            const float eye_score = has_eye_regions ? 1.0f : 0.0f;
            best_score = std::max(best_score, 0.22f * area_score + 0.20f * aspect_score + 0.18f * fill_score + 0.20f * symmetry_score + 0.20f * eye_score);
        }
    }

    if (out_score) {
        *out_score = best_score;
    }
    return best_score >= 0.78f;
}
}

DeepIDModel::DeepIDModel(const fs::path& weights_path) {
    const auto weights = load_weights(weights_path);

    conv1_kernel_ = require_weight(weights, "Conv1/kernel", 4 * 4 * 3 * 20);
    conv1_bias_ = require_weight(weights, "Conv1/bias", 20);
    conv2_kernel_ = require_weight(weights, "Conv2/kernel", 3 * 3 * 20 * 40);
    conv2_bias_ = require_weight(weights, "Conv2/bias", 40);
    conv3_kernel_ = require_weight(weights, "Conv3/kernel", 3 * 3 * 40 * 60);
    conv3_bias_ = require_weight(weights, "Conv3/bias", 60);
    conv4_kernel_ = require_weight(weights, "Conv4/kernel", 2 * 2 * 60 * 80);
    conv4_bias_ = require_weight(weights, "Conv4/bias", 80);
    fc11_kernel_ = require_weight(weights, "fc11/kernel", 1200 * 160);
    fc11_bias_ = require_weight(weights, "fc11/bias", 160);
    fc12_kernel_ = require_weight(weights, "fc12/kernel", 960 * 160);
    fc12_bias_ = require_weight(weights, "fc12/bias", 160);
}

// Route one prepared tensor through the selected native backend while preserving the same model weights.
std::vector<float> DeepIDModel::embed(const Image& image) const {
    const auto input = resize_letterbox_bgr(image);

#if FACE_DETECTOR_USE_CUDA
    auto embedding = run_deepid_cuda_forward(
        input.data,
        conv1_kernel_, conv1_bias_,
        conv2_kernel_, conv2_bias_,
        conv3_kernel_, conv3_bias_,
        conv4_kernel_, conv4_bias_,
        fc11_kernel_, fc11_bias_,
        fc12_kernel_, fc12_bias_);
#elif FACE_DETECTOR_USE_HIP
    auto embedding = run_deepid_hip_forward(
        input.data,
        conv1_kernel_, conv1_bias_,
        conv2_kernel_, conv2_bias_,
        conv3_kernel_, conv3_bias_,
        conv4_kernel_, conv4_bias_,
        fc11_kernel_, fc11_bias_,
        fc12_kernel_, fc12_bias_);
#elif FACE_DETECTOR_USE_OPENCL
    auto embedding = run_deepid_opencl_forward(
        input.data,
        conv1_kernel_, conv1_bias_,
        conv2_kernel_, conv2_bias_,
        conv3_kernel_, conv3_bias_,
        conv4_kernel_, conv4_bias_,
        fc11_kernel_, fc11_bias_,
        fc12_kernel_, fc12_bias_);
#else
    const auto conv1 = conv_relu(input, conv1_kernel_, conv1_bias_, 4, 4, 20);
    const auto pool1 = max_pool_2x2(conv1);
    const auto conv2 = conv_relu(pool1, conv2_kernel_, conv2_bias_, 3, 3, 40);
    const auto pool2 = max_pool_2x2(conv2);
    const auto conv3 = conv_relu(pool2, conv3_kernel_, conv3_bias_, 3, 3, 60);
    const auto pool3 = max_pool_2x2(conv3);
    const auto fc11 = dense(pool3.data, fc11_kernel_, fc11_bias_, kEmbedding);
    const auto conv4 = conv_relu(pool3, conv4_kernel_, conv4_bias_, 2, 2, 80);
    const auto fc12 = dense(conv4.data, fc12_kernel_, fc12_bias_, kEmbedding);

    std::vector<float> embedding(kEmbedding);
    for (int i = 0; i < kEmbedding; ++i) {
        embedding[i] = relu(fc11[i] + fc12[i]);
    }
#endif

    l2_normalize(embedding);
    return embedding;
}

// Keep the batch intact for CUDA so kernels can expose parallelism across images as well as tensor elements.
std::vector<std::vector<float>> DeepIDModel::embed_batch(const std::vector<Image>& images) const {
    if (images.empty()) {
        return {};
    }
#if FACE_DETECTOR_USE_CUDA || FACE_DETECTOR_USE_OPENCL
    std::vector<float> batch_input;
    batch_input.reserve(images.size() * kInputH * kInputW * 3);
    for (const auto& image : images) {
        const auto tensor = resize_letterbox_bgr(image);
        batch_input.insert(batch_input.end(), tensor.data.begin(), tensor.data.end());
    }
    auto flat =
#if FACE_DETECTOR_USE_CUDA
        run_deepid_cuda_forward_batch(
#else
        run_deepid_opencl_forward_batch(
#endif
        batch_input,
        static_cast<int>(images.size()),
        conv1_kernel_, conv1_bias_,
        conv2_kernel_, conv2_bias_,
        conv3_kernel_, conv3_bias_,
        conv4_kernel_, conv4_bias_,
        fc11_kernel_, fc11_bias_,
        fc12_kernel_, fc12_bias_);
    std::vector<std::vector<float>> result(images.size(), std::vector<float>(kEmbedding));
    for (std::size_t index = 0; index < images.size(); ++index) {
        std::copy_n(flat.begin() + static_cast<std::ptrdiff_t>(index * kEmbedding), kEmbedding, result[index].begin());
        l2_normalize(result[index]);
    }
    return result;
#else
    std::vector<std::vector<float>> result;
    result.reserve(images.size());
    for (const auto& image : images) {
        result.push_back(embed(image));
    }
    return result;
#endif
}

std::string DeepIDModel::backend() const {
#if FACE_DETECTOR_USE_CUDA
    return "cuda-cpp-deepid";
#elif FACE_DETECTOR_USE_HIP
    return "hip-deepid";
#elif FACE_DETECTOR_USE_OPENCL
    return "opencl-deepid";
#else
    return "cpu-deepid";
#endif
}

FaceMatcher::FaceMatcher(fs::path weights_path, fs::path reference_dir, float threshold)
    : model_(std::move(weights_path)),
      reference_dir_(std::move(reference_dir)),
      threshold_(threshold) {
    reload_references();
}

// Recompute normalized reference embeddings whenever the reference directory changes.
void FaceMatcher::reload_references() {
    references_.clear();
    if (!fs::exists(reference_dir_)) {
        throw std::runtime_error("Reference folder does not exist: " + reference_dir_.string());
    }

    for (const auto& entry : fs::recursive_directory_iterator(reference_dir_)) {
        if (!entry.is_regular_file() || !is_supported_image(entry.path())) {
            continue;
        }
        try {
            references_.push_back(ReferenceEmbedding{
                entry.path(),
                reference_label(entry.path()),
                model_.embed(load_image_rgba(entry.path()))});
            std::cout << "Loaded reference: " << entry.path().string() << "\n";
        } catch (const std::exception& error) {
            std::cerr << "Skipping reference " << entry.path().string() << ": " << error.what() << "\n";
        }
    }

    if (references_.empty()) {
        throw std::runtime_error("Reference folder has no supported images: " + reference_dir_.string());
    }
}

MatchResult FaceMatcher::match(const Image& image) const {
    MatchResult result;
    result.backend = model_.backend();
    result.similarity = -1.0f;
    result.threshold = threshold_;

    float face_gate_score = 0.0f;
    result.face_like_region = has_face_like_region(image, &face_gate_score);
    result.face_gate_score = face_gate_score;

    const auto embedding = model_.embed(image);
    struct LabelScore {
        std::filesystem::path best_path;
        float best_similarity = -1.0f;
        std::vector<float> similarities;
    };
    std::unordered_map<std::string, LabelScore> label_scores;

    for (const auto& reference : references_) {
        const float similarity = cosine_similarity(embedding, reference.embedding);
        auto& label_score = label_scores[reference.label];
        label_score.similarities.push_back(similarity);
        if (similarity > label_score.best_similarity) {
            label_score.best_similarity = similarity;
            label_score.best_path = reference.path;
        }
    }

    for (auto& [label, label_score] : label_scores) {
        auto top = label_score.similarities;
        std::sort(top.begin(), top.end(), std::greater<float>());
        const std::size_t top_count = std::min<std::size_t>(top.size(), 8);
        if (top_count == 0) {
            continue;
        }

        const float top_sum = std::accumulate(top.begin(), top.begin() + top_count, 0.0f);
        const float top_average = top_sum / static_cast<float>(top_count);
        const float identity_similarity = (top_average * 0.72f) + (label_score.best_similarity * 0.28f);
        if (identity_similarity > result.similarity) {
            result.similarity = identity_similarity;
            result.matched_reference = label_score.best_path;
        }
    }

    result.detected = result.similarity >= threshold_;
    result.reason = result.detected
        ? "DeepID cosine similarity is above threshold"
        : "DeepID cosine similarity is below threshold";
    if (!result.face_like_region) {
        result.reason += "; face gate is low-confidence";
    }
    return result;
}

MatchResult FaceMatcher::match_file(const fs::path& image_path) const {
    return match(load_image_rgba(image_path));
}
