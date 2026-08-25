// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : sface_engine.hpp
// DATE         : 23/08/2026
// DESCRIPTION  : Declares the native YuNet/SFace recognition engine, configuration, and result interface.
// -----------------------------------------------------------------------------
// Header Name : sface_engine
// Purpose     : Declares the native YuNet/SFace recognition engine, configuration, and result interface.
// -----------------------------------------------------------------------------
#pragma once

#include "image_io.hpp"

#include <filesystem>
#include <memory>
#include <string>
#include <vector>

// Return identity, confidence, acceptance, and timing together for both CLI and Hive consumers.
struct SFaceResult {
    bool accepted = false;
    bool face_found = false;
    std::string identity = "Unknown";
    std::string best_label = "Unknown";
    std::string runner_label = "Unknown";
    std::filesystem::path matched_reference;
    float best_score = -1.0f;
    float runner_score = -1.0f;
    float margin = 0.0f;
    double recognition_ms = 0.0;
};

// Own long-lived model sessions, references, and CUDA state to avoid reinitialization between requests.
class NativeSFaceEngine {
public:
    NativeSFaceEngine(
        const std::filesystem::path& model_root,
        const std::filesystem::path& reference_root,
        bool use_cuda,
        float min_score = 0.42f,
        float min_margin = 0.12f
    );
    ~NativeSFaceEngine();

    NativeSFaceEngine(const NativeSFaceEngine&) = delete;
    NativeSFaceEngine& operator=(const NativeSFaceEngine&) = delete;

    std::vector<SFaceResult> recognize(
        const std::vector<std::filesystem::path>& paths,
        const std::vector<std::string>& hints
    );
    std::string backend() const;
    std::size_t reference_count() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
