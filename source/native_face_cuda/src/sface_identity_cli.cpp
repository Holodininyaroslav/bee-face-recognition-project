// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : sface_identity_cli.cpp
// DATE         : 23/08/2026
// DESCRIPTION  : Provides the persistent command-line worker for sequential CPU and batched CUDA face recognition.
// -----------------------------------------------------------------------------
// Source Unit : sface_identity_cli
// Purpose     : Provides the persistent command-line worker for sequential CPU and batched CUDA face recognition.
// -----------------------------------------------------------------------------
#include "sface_engine.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifndef FACE_USE_CUDA
#define FACE_USE_CUDA 0
#endif

namespace fs = std::filesystem;

namespace {
std::string argument(int argc, char** argv, const std::string& name) {
    for (int index = 1; index + 1 < argc; ++index) {
        if (argv[index] == name) return argv[index + 1];
    }
    return {};
}

bool has_argument(int argc, char** argv, const std::string& name) {
    for (int index = 1; index < argc; ++index) if (argv[index] == name) return true;
    return false;
}

float float_argument(int argc, char** argv, const std::string& name, float fallback) {
    const auto value = argument(argc, argv, name);
    return value.empty() ? fallback : std::stof(value);
}

std::vector<std::string> split(const std::string& value, char separator) {
    std::vector<std::string> result;
    std::stringstream stream(value);
    std::string item;
    while (std::getline(stream, item, separator)) result.push_back(item);
    return result;
}

std::string escape_json(const std::string& value) {
    std::string result;
    for (const unsigned char character : value) {
        switch (character) {
            case '\\': result += "\\\\"; break;
            case '"': result += "\\\""; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default: result += static_cast<char>(character); break;
        }
    }
    return result;
}

// Serialize a stable JSON contract consumed by the Python Hive bridge.
std::string result_json(const SFaceResult& result, const fs::path& image, const std::string& backend) {
    std::ostringstream output;
    output << std::fixed << std::setprecision(6)
        << "{\"accepted\":" << (result.accepted ? "true" : "false")
        << ",\"identity\":\"" << escape_json(result.identity) << "\""
        << ",\"best_label\":\"" << escape_json(result.best_label) << "\""
        << ",\"best_score\":" << result.best_score
        << ",\"runner_up_label\":\"" << escape_json(result.runner_label) << "\""
        << ",\"runner_up_score\":" << result.runner_score
        << ",\"margin\":" << result.margin
        << ",\"best_variant\":\"yunet-5-landmark-aligned-sface\""
        << ",\"matched_reference\":\"" << escape_json(result.matched_reference.u8string()) << "\""
        << ",\"backend\":\"" << escape_json(backend) << "\""
        << ",\"identity_source\":\"sface-visual\""
        << ",\"face_found\":" << (result.face_found ? "true" : "false")
        << ",\"detection_miss\":" << (result.face_found ? "false" : "true")
        << ",\"image\":\"" << escape_json(image.u8string()) << "\""
        << ",\"recognition_ms\":" << result.recognition_ms << "}";
    return output.str();
}
}

// Start one reusable engine and support line-oriented batch commands without respawning the native process.
int main(int argc, char** argv) {
    try {
        const fs::path references = widen_utf8(argument(argc, argv, "--references"));
        const fs::path models = widen_utf8(argument(argc, argv, "--models"));
        if (references.empty() || models.empty()) {
            throw std::runtime_error("Required: --references DIR --models DIR");
        }
        const auto initialization_started = std::chrono::steady_clock::now();
        NativeSFaceEngine engine(
            models,
            references,
            FACE_USE_CUDA != 0,
            float_argument(argc, argv, "--min-score", 0.42f),
            float_argument(argc, argv, "--min-margin", 0.12f)
        );
        const auto initialization_finished = std::chrono::steady_clock::now();
        const double initialization_ms = std::chrono::duration<double, std::milli>(
            initialization_finished - initialization_started
        ).count();

        if (has_argument(argc, argv, "--serve-tsv")) {
            // Persistent line protocol: models and reference embeddings stay
            // loaded while Hive sends single-image or batch requests over stdin.
            std::cout << "{\"ready\":true,\"backend\":\"" << engine.backend()
                      << "\",\"reference_count\":" << engine.reference_count()
                      << ",\"initialization_ms\":" << initialization_ms << "}" << std::endl;
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
                    const auto results = engine.recognize(paths, hints);
                    if (fields[0] == "batch") {
                        double total_ms = 0.0;
                        std::cout << "{\"count\":" << results.size() << ",\"backend\":\"" << engine.backend() << "\",\"results\":[";
                        for (std::size_t index = 0; index < results.size(); ++index) {
                            if (index) std::cout << ',';
                            std::cout << result_json(results[index], paths[index], engine.backend());
                            total_ms += results[index].recognition_ms;
                        }
                        std::cout << "],\"total_ms\":" << total_ms << "}" << std::endl;
                    } else {
                        std::cout << result_json(results.front(), paths.front(), engine.backend()) << std::endl;
                    }
                } catch (const std::exception& error) {
                    std::cout << "{\"error\":\"" << escape_json(error.what()) << "\"}" << std::endl;
                }
            }
            return 0;
        }

        const fs::path image = widen_utf8(argument(argc, argv, "--image"));
        if (image.empty()) throw std::runtime_error("Required: --image FILE or --serve-tsv");
        const auto results = engine.recognize({image}, {argument(argc, argv, "--scene-hint")});
        std::cout << result_json(results.front(), image, engine.backend()) << std::endl;
        return results.front().accepted ? 0 : 2;
    } catch (const std::exception& error) {
        std::cerr << "{\"error\":\"" << escape_json(error.what()) << "\"}" << std::endl;
        return 1;
    }
}
