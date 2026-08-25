// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : identity_cli.cpp
// DATE         : 23/08/2026
// DESCRIPTION  : Provides the command-line entry point for native DeepID CPU and CUDA recognition.
// -----------------------------------------------------------------------------
// Source Unit : identity_cli
// Purpose     : Provides the command-line entry point for native DeepID CPU and CUDA recognition.
// -----------------------------------------------------------------------------
#include "deepid_engine.hpp"
#include "image_io.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

#if FACE_DETECTOR_USE_CUDA
std::vector<float> run_cosine_cuda_scores(
    const std::vector<float>& queries,
    const std::vector<float>& references,
    int query_count,
    int reference_count,
    int embedding_size);
#endif

namespace {
struct Reference {
    std::string label;
    fs::path path;
    std::vector<float> embedding;
};

struct LabelResult {
    std::string label;
    fs::path reference;
    std::string variant;
    float score = -1.0f;
};

struct RecognitionResult {
    bool accepted = false;
    LabelResult best;
    LabelResult runner;
    float margin = 0.0f;
    std::string source = "deepid";
    std::string backend;
    std::size_t reference_count = 0;
    std::size_t variant_count = 0;
    double recognition_ms = 0.0;
};

std::string arg_value(int argc, char** argv, const std::string& name) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == name) return argv[i + 1];
    }
    return {};
}

bool has_arg(int argc, char** argv, const std::string& name) {
    for (int i = 1; i < argc; ++i) if (argv[i] == name) return true;
    return false;
}

float float_arg(int argc, char** argv, const std::string& name, float fallback) {
    const auto value = arg_value(argc, argv, name);
    return value.empty() ? fallback : std::stof(value);
}

std::vector<std::string> split(const std::string& value, char separator) {
    std::vector<std::string> result;
    std::stringstream stream(value);
    std::string item;
    while (std::getline(stream, item, separator)) result.push_back(item);
    return result;
}

bool image_extension(const fs::path& path) {
    auto ext = path.extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".bmp";
}

std::string json_escape(const std::string& input) {
    std::string out;
    out.reserve(input.size() + 8);
    for (unsigned char c : input) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += static_cast<char>(c); break;
        }
    }
    return out;
}

Image center_crop(const Image& source, float ratio) {
    const int side = std::max(1, static_cast<int>(std::min(source.width, source.height) * ratio));
    const int left = (source.width - side) / 2;
    const int top = (source.height - side) / 2;
    Image out{side, side, std::vector<std::uint8_t>(static_cast<std::size_t>(side) * side * 4)};
    for (int y = 0; y < side; ++y) {
        const auto* src = source.rgba.data() + (static_cast<std::size_t>(top + y) * source.width + left) * 4;
        auto* dst = out.rgba.data() + static_cast<std::size_t>(y) * side * 4;
        std::copy(src, src + static_cast<std::size_t>(side) * 4, dst);
    }
    return out;
}

std::vector<std::pair<std::string, Image>> variants(const fs::path& path) {
    const auto image = load_image_rgba(path);
    std::vector<std::pair<std::string, Image>> result{{"full", image}};
    for (float ratio : {0.86f, 0.74f, 0.62f, 0.50f, 0.40f}) {
        const int side = static_cast<int>(std::min(image.width, image.height) * ratio);
        if (side >= 60) result.emplace_back("center_" + std::to_string(static_cast<int>(ratio * 100.0f)), center_crop(image, ratio));
    }
    return result;
}

float cosine(const std::vector<float>& a, const std::vector<float>& b) {
    return std::inner_product(a.begin(), a.end(), b.begin(), 0.0f);
}

// Load references once and reuse the detector for every request in persistent server mode.
class IdentityDetector {
public:
    IdentityDetector(const fs::path& weights, const fs::path& reference_root, float min_score, float min_margin)
        : model_(weights), min_score_(min_score), min_margin_(min_margin) {
        std::vector<Image> images;
        for (const auto& label : {"Adi", "Faraj", "Slava"}) {
            const auto folder = reference_root / label;
            if (!fs::is_directory(folder)) throw std::runtime_error("Reference folder missing: " + folder.string());
            for (const auto& entry : fs::directory_iterator(folder)) {
                if (!entry.is_regular_file() || !image_extension(entry.path())) continue;
                references_.push_back({label, entry.path(), {}});
                images.push_back(load_image_rgba(entry.path()));
            }
        }
        if (references_.empty()) throw std::runtime_error("No reference images found");
        const auto embeddings = model_.embed_batch(images);
        for (std::size_t index = 0; index < references_.size(); ++index) references_[index].embedding = embeddings[index];
    }

    std::vector<RecognitionResult> recognize(const std::vector<fs::path>& paths, const std::vector<std::string>& hints) const {
        struct Range { std::size_t begin; std::size_t count; std::vector<std::string> names; };
        std::vector<Image> all_images;
        std::vector<Range> ranges;
        for (const auto& path : paths) {
            const auto local = variants(path);
            Range range{all_images.size(), local.size(), {}};
            for (const auto& [name, image] : local) {
                range.names.push_back(name);
                all_images.push_back(image);
            }
            ranges.push_back(std::move(range));
        }

        const auto started = std::chrono::steady_clock::now();
        const auto embeddings = model_.embed_batch(all_images);
#if FACE_DETECTOR_USE_CUDA
        std::vector<float> flat_queries;
        flat_queries.reserve(embeddings.size() * 160);
        for (const auto& embedding : embeddings) {
            flat_queries.insert(flat_queries.end(), embedding.begin(), embedding.end());
        }
        std::vector<float> flat_references;
        flat_references.reserve(references_.size() * 160);
        for (const auto& reference : references_) {
            flat_references.insert(
                flat_references.end(),
                reference.embedding.begin(),
                reference.embedding.end()
            );
        }
        const auto cuda_scores = run_cosine_cuda_scores(
            flat_queries,
            flat_references,
            static_cast<int>(embeddings.size()),
            static_cast<int>(references_.size()),
            160
        );
#endif
        const auto finished = std::chrono::steady_clock::now();
        const double total_ms = std::chrono::duration<double, std::milli>(finished - started).count();

        std::vector<RecognitionResult> results;
        for (std::size_t image_index = 0; image_index < paths.size(); ++image_index) {
            std::map<std::string, LabelResult> best_by_label;
            const auto& range = ranges[image_index];
            for (std::size_t local_index = 0; local_index < range.count; ++local_index) {
                const auto& embedding = embeddings[range.begin + local_index];
                for (std::size_t reference_index = 0; reference_index < references_.size(); ++reference_index) {
                    const auto& reference = references_[reference_index];
#if FACE_DETECTOR_USE_CUDA
                    const float score = cuda_scores[
                        (range.begin + local_index) * references_.size() + reference_index
                    ];
#else
                    const float score = cosine(embedding, reference.embedding);
#endif
                    auto& best = best_by_label[reference.label];
                    if (score > best.score) best = {reference.label, reference.path, range.names[local_index], score};
                }
            }
            std::vector<LabelResult> ranked;
            for (const auto& [label, result] : best_by_label) ranked.push_back(result);
            std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) { return a.score > b.score; });
            if (ranked.empty()) throw std::runtime_error("No scored identities");

            RecognitionResult result;
            result.best = ranked.front();
            result.runner = ranked.size() > 1 ? ranked[1] : LabelResult{"Unknown", {}, {}, -1.0f};
            const std::string hint = image_index < hints.size() ? hints[image_index] : "";
            const auto hint_result = best_by_label.find(hint);
            if (hint_result != best_by_label.end() && hint_result->second.score >= min_score_ &&
                (result.best.label == hint || result.best.score - hint_result->second.score <= 0.06f)) {
                result.best = hint_result->second;
                result.source = "scene_hint_tiebreak";
                const auto other = std::find_if(ranked.begin(), ranked.end(), [&](const auto& item) { return item.label != hint; });
                if (other != ranked.end()) result.runner = *other;
            }
            result.margin = result.best.score - result.runner.score;
            result.accepted = result.best.score >= min_score_ && (result.margin >= min_margin_ || result.source == "scene_hint_tiebreak");
            result.backend = model_.backend();
            result.reference_count = references_.size();
            result.variant_count = range.count;
            result.recognition_ms = total_ms / std::max<std::size_t>(1, paths.size());
            results.push_back(std::move(result));
        }
        return results;
    }

    std::string backend() const { return model_.backend(); }
    std::size_t reference_count() const { return references_.size(); }

private:
    DeepIDModel model_;
    std::vector<Reference> references_;
    float min_score_;
    float min_margin_;
};

std::string result_json(const RecognitionResult& result, const fs::path& path) {
    std::ostringstream out;
    out << std::fixed << std::setprecision(6)
        << "{\"accepted\":" << (result.accepted ? "true" : "false")
        << ",\"identity\":\"" << (result.accepted ? json_escape(result.best.label) : "Unknown") << "\""
        << ",\"best_label\":\"" << json_escape(result.best.label) << "\""
        << ",\"best_score\":" << result.best.score
        << ",\"runner_up_label\":\"" << json_escape(result.runner.label) << "\""
        << ",\"runner_up_score\":" << result.runner.score
        << ",\"margin\":" << result.margin
        << ",\"best_variant\":\"" << json_escape(result.best.variant) << "\""
        << ",\"matched_reference\":\"" << json_escape(result.best.reference.u8string()) << "\""
        << ",\"backend\":\"" << result.backend << "\""
        << ",\"identity_source\":\"" << result.source << "\""
        << ",\"image\":\"" << json_escape(path.u8string()) << "\""
        << ",\"reference_count\":" << result.reference_count
        << ",\"variant_count\":" << result.variant_count
        << ",\"recognition_ms\":" << result.recognition_ms << "}";
    return out.str();
}
}

// Parse single-image or persistent batch commands and serialize each recognition result as machine-readable output.
int main(int argc, char** argv) {
    try {
        const fs::path references = widen_utf8(arg_value(argc, argv, "--references"));
        const fs::path weights = widen_utf8(arg_value(argc, argv, "--weights"));
        if (references.empty() || weights.empty()) throw std::runtime_error("Required: --references DIR --weights FILE");
        const auto init_started = std::chrono::steady_clock::now();
        const IdentityDetector detector(weights, references, float_arg(argc, argv, "--min-score", 0.89f), float_arg(argc, argv, "--min-margin", 0.04f));
        const auto init_finished = std::chrono::steady_clock::now();
        const double initialization_ms = std::chrono::duration<double, std::milli>(init_finished - init_started).count();

        if (has_arg(argc, argv, "--serve-tsv")) {
            std::cout << "{\"ready\":true,\"backend\":\"" << detector.backend() << "\",\"reference_count\":"
                      << detector.reference_count() << ",\"initialization_ms\":" << initialization_ms << "}" << std::endl;
            std::string line;
            while (std::getline(std::cin, line)) {
                if (line == "quit") break;
                try {
                    const auto fields = split(line, '\t');
                    if (fields.size() < 2) throw std::runtime_error("Protocol: single|batch<TAB>paths<TAB>hints");
                    const auto raw_paths = fields[0] == "batch" ? split(fields[1], '|') : std::vector<std::string>{fields[1]};
                    const auto hints = fields.size() > 2 ? split(fields[2], '|') : std::vector<std::string>{};
                    std::vector<fs::path> paths;
                    for (const auto& path : raw_paths) paths.push_back(widen_utf8(path));
                    const auto results = detector.recognize(paths, hints);
                    if (fields[0] == "batch") {
                        double total_ms = 0.0;
                        std::cout << "{\"count\":" << results.size() << ",\"backend\":\"" << detector.backend() << "\",\"results\":[";
                        for (std::size_t index = 0; index < results.size(); ++index) {
                            if (index) std::cout << ',';
                            std::cout << result_json(results[index], paths[index]);
                            total_ms += results[index].recognition_ms;
                        }
                        std::cout << "],\"total_ms\":" << total_ms << "}" << std::endl;
                    } else {
                        std::cout << result_json(results.front(), paths.front()) << std::endl;
                    }
                } catch (const std::exception& error) {
                    std::cout << "{\"error\":\"" << json_escape(error.what()) << "\"}" << std::endl;
                }
            }
            return 0;
        }

        const fs::path image_path = widen_utf8(arg_value(argc, argv, "--image"));
        if (image_path.empty()) throw std::runtime_error("Required: --image FILE or --serve-tsv");
        const auto results = detector.recognize({image_path}, {arg_value(argc, argv, "--scene-hint")});
        std::cout << result_json(results.front(), image_path) << std::endl;
        return results.front().accepted ? 0 : 2;
    } catch (const std::exception& error) {
        std::cerr << "{\"error\":\"" << json_escape(error.what()) << "\"}" << std::endl;
        return 1;
    }
}
