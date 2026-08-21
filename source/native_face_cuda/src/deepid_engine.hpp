#pragma once

#include "image_io.hpp"

#include <filesystem>
#include <string>
#include <vector>

struct MatchResult {
    bool detected = false;
    bool face_like_region = false;
    float face_gate_score = 0.0f;
    float similarity = 0.0f;
    float threshold = 0.0f;
    std::filesystem::path matched_reference;
    std::string backend;
    std::string reason;
};

class DeepIDModel {
public:
    struct Tensor {
        std::vector<float> data;
        int h = 0;
        int w = 0;
        int c = 0;
    };

    explicit DeepIDModel(const std::filesystem::path& weights_path);

    std::vector<float> embed(const Image& image) const;
    std::vector<std::vector<float>> embed_batch(const std::vector<Image>& images) const;
    std::string backend() const;

private:
    std::vector<float> conv1_kernel_;
    std::vector<float> conv1_bias_;
    std::vector<float> conv2_kernel_;
    std::vector<float> conv2_bias_;
    std::vector<float> conv3_kernel_;
    std::vector<float> conv3_bias_;
    std::vector<float> conv4_kernel_;
    std::vector<float> conv4_bias_;
    std::vector<float> fc11_kernel_;
    std::vector<float> fc11_bias_;
    std::vector<float> fc12_kernel_;
    std::vector<float> fc12_bias_;
};

class FaceMatcher {
public:
    FaceMatcher(std::filesystem::path weights_path, std::filesystem::path reference_dir, float threshold);

    void reload_references();
    MatchResult match(const Image& image) const;
    MatchResult match_file(const std::filesystem::path& image_path) const;

private:
    struct ReferenceEmbedding {
        std::filesystem::path path;
        std::string label;
        std::vector<float> embedding;
    };

    DeepIDModel model_;
    std::filesystem::path reference_dir_;
    float threshold_;
    std::vector<ReferenceEmbedding> references_;
};
