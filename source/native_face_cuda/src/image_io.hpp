#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

struct Image {
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> rgba;
};

Image load_image_rgba(const std::filesystem::path& path);
void copy_image_file(const std::filesystem::path& source, const std::filesystem::path& destination);
std::wstring widen_utf8(const std::string& value);
