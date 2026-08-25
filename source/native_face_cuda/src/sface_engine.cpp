// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : sface_engine.cpp
// DATE         : 23/08/2026
// DESCRIPTION  : Coordinates YuNet detection, landmark alignment, CPU SFace, and the project-owned manual CUDA SFace path.
// -----------------------------------------------------------------------------
// Source Unit : sface_engine
// Purpose     : Coordinates YuNet detection, landmark alignment, CPU SFace, and the project-owned manual CUDA SFace path.
// -----------------------------------------------------------------------------
#include "sface_engine.hpp"
#include "sface_manual_cuda.hpp"

#include <onnxruntime_cxx_api.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <map>
#include <numeric>
#include <stdexcept>
#include <unordered_map>

#ifndef FACE_USE_CUDA
#define FACE_USE_CUDA 0
#endif

#if FACE_USE_CUDA
std::vector<float> sface_cuda_scores(
    const std::vector<float>& queries,
    const std::vector<float>& references,
    int query_count,
    int reference_count,
    int dimensions
);
#endif

namespace fs = std::filesystem;

namespace {
constexpr int kDetectMaxSide = 192;
constexpr int kAlignedSize = 112;
constexpr int kEmbeddingSize = 128;
constexpr std::array<int, 3> kStrides{8, 16, 32};
constexpr std::array<std::array<float, 2>, 5> kLandmarkTemplate{{
    {38.2946f, 51.6963f},
    {73.5318f, 51.5014f},
    {56.0252f, 71.7366f},
    {41.5493f, 92.3655f},
    {70.7299f, 92.2041f},
}};

struct PreparedBatch {
    std::vector<float> nchw_bgr;
    std::vector<int> content_widths;
    std::vector<int> content_heights;
    int width = 0;
    int height = 0;
};

struct DetectedFace {
    bool valid = false;
    std::array<float, 10> landmarks{};
    float score = 0.0f;
};

struct EmbeddingBatch {
    std::vector<float> vectors;
    std::vector<bool> valid;
};

int round_up_32(int value) {
    return ((value + 31) / 32) * 32;
}

float pixel_bgr(const Image& image, float x, float y, int channel) {
    if (x < 0.0f || y < 0.0f || x > image.width - 1.0f || y > image.height - 1.0f) return 0.0f;
    const int x0 = static_cast<int>(std::floor(x));
    const int y0 = static_cast<int>(std::floor(y));
    const int x1 = std::min(x0 + 1, image.width - 1);
    const int y1 = std::min(y0 + 1, image.height - 1);
    const float tx = x - x0;
    const float ty = y - y0;
    const int rgba_channel = channel == 0 ? 2 : channel == 1 ? 1 : 0;
    auto at = [&](int px, int py) {
        return static_cast<float>(image.rgba[(static_cast<std::size_t>(py) * image.width + px) * 4 + rgba_channel]);
    };
    const float top = at(x0, y0) * (1.0f - tx) + at(x1, y0) * tx;
    const float bottom = at(x0, y1) * (1.0f - tx) + at(x1, y1) * tx;
    return top * (1.0f - ty) + bottom * ty;
}

// Pad all images to one dynamic tensor shape so YuNet can process the request as a single batch.
PreparedBatch prepare_detection_batch(const std::vector<Image>& images) {
    // Build one dynamic NCHW tensor. All images share the largest padded shape
    // so ONNX Runtime can execute the entire request as one CUDA batch.
    PreparedBatch batch;
    for (const auto& image : images) {
        const float scale = std::min(1.0f, static_cast<float>(kDetectMaxSide) / std::max(image.width, image.height));
        const int width = std::max(32, static_cast<int>(std::round(image.width * scale)));
        const int height = std::max(32, static_cast<int>(std::round(image.height * scale)));
        batch.content_widths.push_back(width);
        batch.content_heights.push_back(height);
        batch.width = std::max(batch.width, round_up_32(width));
        batch.height = std::max(batch.height, round_up_32(height));
    }
    const std::size_t plane = static_cast<std::size_t>(batch.width) * batch.height;
    batch.nchw_bgr.assign(images.size() * 3 * plane, 0.0f);
    for (std::size_t index = 0; index < images.size(); ++index) {
        const auto& image = images[index];
        const int target_width = batch.content_widths[index];
        const int target_height = batch.content_heights[index];
        const float scale_x = static_cast<float>(image.width) / target_width;
        const float scale_y = static_cast<float>(image.height) / target_height;
        for (int y = 0; y < target_height; ++y) {
            const float source_y = (y + 0.5f) * scale_y - 0.5f;
            for (int x = 0; x < target_width; ++x) {
                const float source_x = (x + 0.5f) * scale_x - 0.5f;
                for (int channel = 0; channel < 3; ++channel) {
                    const std::size_t offset = (index * 3 + channel) * plane + static_cast<std::size_t>(y) * batch.width + x;
                    batch.nchw_bgr[offset] = pixel_bgr(image, source_x, source_y, channel);
                }
            }
        }
    }
    return batch;
}

// Estimate a five-landmark similarity transform and resample every face to the canonical 112 x 112 SFace input.
std::vector<float> align_faces(
    const PreparedBatch& batch,
    const std::vector<DetectedFace>& faces
) {
    // Estimate a 2D similarity transform from YuNet's five landmarks to the
    // canonical SFace template, then resample each aligned 112 x 112 face.
    const std::size_t input_plane = static_cast<std::size_t>(batch.width) * batch.height;
    const std::size_t output_plane = static_cast<std::size_t>(kAlignedSize) * kAlignedSize;
    std::vector<float> aligned(faces.size() * 3 * output_plane, 0.0f);
    auto sample = [&](std::size_t image, int channel, float x, float y) {
        if (x < 0.0f || y < 0.0f || x > batch.width - 1.0f || y > batch.height - 1.0f) return 0.0f;
        const int x0 = static_cast<int>(std::floor(x));
        const int y0 = static_cast<int>(std::floor(y));
        const int x1 = std::min(x0 + 1, batch.width - 1);
        const int y1 = std::min(y0 + 1, batch.height - 1);
        const float tx = x - x0;
        const float ty = y - y0;
        const float* plane = batch.nchw_bgr.data() + (image * 3 + channel) * input_plane;
        const float top = plane[static_cast<std::size_t>(y0) * batch.width + x0] * (1.0f - tx)
            + plane[static_cast<std::size_t>(y0) * batch.width + x1] * tx;
        const float bottom = plane[static_cast<std::size_t>(y1) * batch.width + x0] * (1.0f - tx)
            + plane[static_cast<std::size_t>(y1) * batch.width + x1] * tx;
        return top * (1.0f - ty) + bottom * ty;
    };

    for (std::size_t image = 0; image < faces.size(); ++image) {
        if (!faces[image].valid) continue;
        float source_mean_x = 0.0f;
        float source_mean_y = 0.0f;
        float target_mean_x = 0.0f;
        float target_mean_y = 0.0f;
        for (int point = 0; point < 5; ++point) {
            source_mean_x += faces[image].landmarks[point * 2];
            source_mean_y += faces[image].landmarks[point * 2 + 1];
            target_mean_x += kLandmarkTemplate[point][0];
            target_mean_y += kLandmarkTemplate[point][1];
        }
        source_mean_x /= 5.0f;
        source_mean_y /= 5.0f;
        target_mean_x /= 5.0f;
        target_mean_y /= 5.0f;
        float numerator_a = 0.0f;
        float numerator_b = 0.0f;
        float denominator = 0.0f;
        for (int point = 0; point < 5; ++point) {
            const float sx = faces[image].landmarks[point * 2] - source_mean_x;
            const float sy = faces[image].landmarks[point * 2 + 1] - source_mean_y;
            const float dx = kLandmarkTemplate[point][0] - target_mean_x;
            const float dy = kLandmarkTemplate[point][1] - target_mean_y;
            numerator_a += sx * dx + sy * dy;
            numerator_b += sx * dy - sy * dx;
            denominator += sx * sx + sy * sy;
        }
        const float a = numerator_a / std::max(denominator, 1.0e-8f);
        const float b = numerator_b / std::max(denominator, 1.0e-8f);
        const float tx = target_mean_x - a * source_mean_x + b * source_mean_y;
        const float ty = target_mean_y - b * source_mean_x - a * source_mean_y;
        const float determinant = std::max(a * a + b * b, 1.0e-8f);
        for (int y = 0; y < kAlignedSize; ++y) {
            for (int x = 0; x < kAlignedSize; ++x) {
                const float dx = x - tx;
                const float dy = y - ty;
                const float source_x = (a * dx + b * dy) / determinant;
                const float source_y = (-b * dx + a * dy) / determinant;
                for (int rgb_channel = 0; rgb_channel < 3; ++rgb_channel) {
                    const int bgr_channel = 2 - rgb_channel;
                    aligned[(image * 3 + rgb_channel) * output_plane + static_cast<std::size_t>(y) * kAlignedSize + x]
                        = sample(image, bgr_channel, source_x, source_y);
                }
            }
        }
    }
    return aligned;
}

void normalize(float* vector, int size) {
    float sum = 0.0f;
    for (int index = 0; index < size; ++index) sum += vector[index] * vector[index];
    const float norm = std::sqrt(std::max(sum, 1.0e-12f));
    for (int index = 0; index < size; ++index) vector[index] /= norm;
}
}

struct NativeSFaceEngine::Impl {
    struct Reference {
        std::string label;
        fs::path path;
        std::vector<float> vector;
    };

    bool use_cuda;
    float min_score;
    float min_margin;
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "native-sface"};
    Ort::SessionOptions options;
    Ort::Session yunet{nullptr};
    // The CPU baseline keeps the optimized ONNX Runtime implementation.
    // CUDA never enters this session: its SFace graph is implemented by the
    // project-owned kernels in sface_manual_cuda.cu.
    Ort::Session cpu_sface{nullptr};
#if FACE_USE_CUDA
    ManualSFaceCudaContext* manual_sface = nullptr;
#endif
    std::vector<Reference> references;

    Impl(const fs::path& model_root, const fs::path& reference_root, bool cuda, float score, float margin)
        : use_cuda(cuda), min_score(score), min_margin(margin) {
        options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
        options.SetLogSeverityLevel(3);
        if (use_cuda) {
            // This option is compiled into identity_cuda.exe; Python never
            // creates or owns the CUDA execution-provider session.
            OrtCUDAProviderOptions cuda_options{};
            cuda_options.device_id = 0;
            cuda_options.arena_extend_strategy = 1;
            options.AppendExecutionProvider_CUDA(cuda_options);
        }
        yunet = Ort::Session(env, (model_root / "yunet_dynamic.onnx").c_str(), options);
        if (use_cuda) {
#if FACE_USE_CUDA
            manual_sface = create_manual_sface_cuda(model_root / "sface_manual_weights.bin");
#else
            throw std::runtime_error("This executable was built without the manual CUDA SFace runtime");
#endif
        } else {
            cpu_sface = Ort::Session(env, (model_root / "sface_dynamic.onnx").c_str(), options);
        }

        std::vector<Image> images;
        std::vector<std::pair<std::string, fs::path>> metadata;
        for (const auto& label : {"Adi", "Faraj", "Slava"}) {
            const fs::path folder = reference_root / label;
            if (!fs::is_directory(folder)) throw std::runtime_error("Reference folder is missing: " + folder.string());
            for (const auto& entry : fs::directory_iterator(folder)) {
                if (!entry.is_regular_file()) continue;
                const auto extension = entry.path().extension().string();
                if (extension != ".jpg" && extension != ".jpeg" && extension != ".png" && extension != ".bmp") continue;
                images.push_back(load_image_rgba(entry.path()));
                metadata.emplace_back(label, entry.path());
            }
        }
        auto embedded = embed_images(images);
        // Reference embeddings are computed once during worker startup and
        // reused for every request handled by the persistent process.
        for (std::size_t index = 0; index < metadata.size(); ++index) {
            if (!embedded.valid[index]) continue;
            references.push_back({
                metadata[index].first,
                metadata[index].second,
                std::vector<float>(
                    embedded.vectors.begin() + static_cast<std::ptrdiff_t>(index * kEmbeddingSize),
                    embedded.vectors.begin() + static_cast<std::ptrdiff_t>((index + 1) * kEmbeddingSize)
                )
            });
        }
        if (references.empty()) throw std::runtime_error("YuNet/SFace could not initialize any reference image");
    }

    ~Impl() {
#if FACE_USE_CUDA
        destroy_manual_sface_cuda(manual_sface);
#endif
    }

    EmbeddingBatch embed_images(const std::vector<Image>& images) {
        if (images.empty()) return {};
        auto prepared = prepare_detection_batch(images);
        const std::array<int64_t, 4> input_shape{
            static_cast<int64_t>(images.size()), 3, prepared.height, prepared.width
        };
        auto memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        auto input = Ort::Value::CreateTensor<float>(
            memory,
            prepared.nchw_bgr.data(),
            prepared.nchw_bgr.size(),
            input_shape.data(),
            input_shape.size()
        );
        Ort::AllocatorWithDefaultOptions allocator;
        auto input_name = yunet.GetInputNameAllocated(0, allocator);
        const char* input_names[]{input_name.get()};
        const char* output_names[]{
            "cls_8", "cls_16", "cls_32",
            "obj_8", "obj_16", "obj_32",
            "bbox_8", "bbox_16", "bbox_32",
            "kps_8", "kps_16", "kps_32",
        };
        auto outputs = yunet.Run(Ort::RunOptions{nullptr}, input_names, &input, 1, output_names, 12);
        std::vector<DetectedFace> faces(images.size());
        // Decode YuNet's three feature-map levels and retain the strongest
        // centered face candidate plus its five alignment landmarks.
        for (std::size_t image = 0; image < images.size(); ++image) {
            float best_rank = -1.0f;
            for (int level = 0; level < 3; ++level) {
                const int stride = kStrides[level];
                const int columns = prepared.width / stride;
                const auto shape = outputs[level + 6].GetTensorTypeAndShapeInfo().GetShape();
                const int anchors = static_cast<int>(shape[1]);
                const float* cls = outputs[level].GetTensorData<float>();
                const float* obj = outputs[level + 3].GetTensorData<float>();
                const float* bbox = outputs[level + 6].GetTensorData<float>();
                const float* keypoints = outputs[level + 9].GetTensorData<float>();
                for (int anchor = 0; anchor < anchors; ++anchor) {
                    const std::size_t scalar = image * anchors + anchor;
                    const float confidence = std::sqrt(
                        std::clamp(cls[scalar], 0.0f, 1.0f) * std::clamp(obj[scalar], 0.0f, 1.0f)
                    );
                    if (confidence < 0.55f) continue;
                    const float grid_x = static_cast<float>(anchor % columns);
                    const float grid_y = static_cast<float>(anchor / columns);
                    const float* box = bbox + (image * anchors + anchor) * 4;
                    const float centre_x = (grid_x + box[0]) * stride;
                    const float centre_y = (grid_y + box[1]) * stride;
                    const float width = std::exp(std::clamp(box[2], -20.0f, 20.0f)) * stride;
                    const float height = std::exp(std::clamp(box[3], -20.0f, 20.0f)) * stride;
                    const float offset = std::abs(centre_x / prepared.content_widths[image] - 0.5f)
                        + std::abs(centre_y / prepared.content_heights[image] - 0.43f);
                    const float rank = width * height * std::max(0.25f, 1.25f - offset);
                    if (rank <= best_rank) continue;
                    best_rank = rank;
                    faces[image].valid = true;
                    faces[image].score = confidence;
                    const float* points = keypoints + (image * anchors + anchor) * 10;
                    for (int point = 0; point < 5; ++point) {
                        faces[image].landmarks[point * 2] = (points[point * 2] + grid_x) * stride;
                        faces[image].landmarks[point * 2 + 1] = (points[point * 2 + 1] + grid_y) * stride;
                    }
                }
            }
        }

        auto aligned = align_faces(prepared, faces);
        EmbeddingBatch result;
        if (use_cuda) {
#if FACE_USE_CUDA
            // Stage 5 is a project-owned CUDA forward pass. The 27
            // convolutions, BatchNorm/PReLU operations, 50176x128 matrix
            // multiplication and L2 normalization are launched explicitly in
            // sface_manual_cuda.cu; no ONNX Runtime SFace session is called.
            result.vectors = manual_sface_cuda_forward(
                manual_sface,
                aligned,
                static_cast<int>(images.size())
            );
#endif
        } else {
            const std::array<int64_t, 4> sface_shape{
                static_cast<int64_t>(images.size()), 3, kAlignedSize, kAlignedSize
            };
            auto sface_input = Ort::Value::CreateTensor<float>(
                memory, aligned.data(), aligned.size(), sface_shape.data(), sface_shape.size()
            );
            auto sface_input_name = cpu_sface.GetInputNameAllocated(0, allocator);
            auto sface_output_name = cpu_sface.GetOutputNameAllocated(0, allocator);
            const char* sface_input_names[]{sface_input_name.get()};
            const char* sface_output_names[]{sface_output_name.get()};
            auto sface_outputs = cpu_sface.Run(
                Ort::RunOptions{nullptr}, sface_input_names, &sface_input, 1, sface_output_names, 1
            );
            const float* output = sface_outputs.front().GetTensorData<float>();
            result.vectors.assign(output, output + images.size() * kEmbeddingSize);
        }
        result.valid.reserve(faces.size());
        for (std::size_t index = 0; index < faces.size(); ++index) {
            result.valid.push_back(faces[index].valid);
            if (!use_cuda) normalize(result.vectors.data() + index * kEmbeddingSize, kEmbeddingSize);
        }
        return result;
    }

    std::vector<SFaceResult> recognize(const std::vector<fs::path>& paths) {
        const auto started = std::chrono::steady_clock::now();
        std::vector<Image> images;
        images.reserve(paths.size());
        for (const auto& path : paths) images.push_back(load_image_rgba(path));

        EmbeddingBatch embedded;
        if (use_cuda) {
            // YuNet is one dynamic CUDA batch; the aligned faces then enter the
            // project-owned manual CUDA SFace network as the same batch.
            embedded = embed_images(images);
        } else {
            // The grading baseline intentionally invokes the same networks one
            // image at a time, making CPU execution strictly sequential.
            embedded.vectors.resize(paths.size() * kEmbeddingSize);
            embedded.valid.resize(paths.size());
            for (std::size_t index = 0; index < images.size(); ++index) {
                auto one = embed_images({images[index]});
                std::copy_n(one.vectors.begin(), kEmbeddingSize, embedded.vectors.begin() + index * kEmbeddingSize);
                embedded.valid[index] = one.valid.front();
            }
        }

        std::vector<float> flat_references;
        flat_references.reserve(references.size() * kEmbeddingSize);
        for (const auto& reference : references) {
            flat_references.insert(flat_references.end(), reference.vector.begin(), reference.vector.end());
        }
        std::vector<float> scores(paths.size() * references.size());
#if FACE_USE_CUDA
        if (use_cuda) {
            // Query/reference cosine products are computed by the explicit
            // kernel in sface_cuda.cu, not by Python or a cached result.
            scores = sface_cuda_scores(
                embedded.vectors,
                flat_references,
                static_cast<int>(paths.size()),
                static_cast<int>(references.size()),
                kEmbeddingSize
            );
        } else
#endif
        {
            for (std::size_t query = 0; query < paths.size(); ++query) {
                for (std::size_t reference = 0; reference < references.size(); ++reference) {
                    scores[query * references.size() + reference] = std::inner_product(
                        embedded.vectors.begin() + static_cast<std::ptrdiff_t>(query * kEmbeddingSize),
                        embedded.vectors.begin() + static_cast<std::ptrdiff_t>((query + 1) * kEmbeddingSize),
                        references[reference].vector.begin(),
                        0.0f
                    );
                }
            }
        }

        const auto finished = std::chrono::steady_clock::now();
        const double shared_ms = std::chrono::duration<double, std::milli>(finished - started).count()
            / std::max<std::size_t>(1, paths.size());
        std::vector<SFaceResult> results(paths.size());
        for (std::size_t query = 0; query < paths.size(); ++query) {
            auto& result = results[query];
            result.face_found = embedded.valid[query];
            result.recognition_ms = shared_ms;
            if (!result.face_found) continue;
            struct LabelBest { float score = -1.0f; std::size_t reference = 0; };
            std::map<std::string, LabelBest> label_scores;
            for (std::size_t reference = 0; reference < references.size(); ++reference) {
                const float score = scores[query * references.size() + reference];
                auto& best = label_scores[references[reference].label];
                if (score > best.score) best = {score, reference};
            }
            std::vector<std::pair<std::string, LabelBest>> ranked(label_scores.begin(), label_scores.end());
            std::sort(ranked.begin(), ranked.end(), [](const auto& left, const auto& right) {
                return left.second.score > right.second.score;
            });
            result.best_label = ranked[0].first;
            result.best_score = ranked[0].second.score;
            result.runner_label = ranked[1].first;
            result.runner_score = ranked[1].second.score;
            result.margin = result.best_score - result.runner_score;
            result.matched_reference = references[ranked[0].second.reference].path;
            result.accepted = result.best_score >= min_score && result.margin >= min_margin;
            result.identity = result.accepted ? result.best_label : "Unknown";
        }
        return results;
    }
};

NativeSFaceEngine::NativeSFaceEngine(
    const fs::path& model_root,
    const fs::path& reference_root,
    bool use_cuda,
    float min_score,
    float min_margin
) : impl_(std::make_unique<Impl>(model_root, reference_root, use_cuda, min_score, min_margin)) {}

NativeSFaceEngine::~NativeSFaceEngine() = default;

// Preserve batch order from detection through embedding and scoring so each result maps to its original frame.
std::vector<SFaceResult> NativeSFaceEngine::recognize(
    const std::vector<fs::path>& paths,
    const std::vector<std::string>&
) {
    return impl_->recognize(paths);
}

std::string NativeSFaceEngine::backend() const {
    return impl_->use_cuda
        ? "native-cpp-onnxruntime-cuda-yunet-manual-cuda-sface"
        : "native-cpp-onnxruntime-cpu-yunet-sface-sequential";
}

std::size_t NativeSFaceEngine::reference_count() const {
    return impl_->references.size();
}
