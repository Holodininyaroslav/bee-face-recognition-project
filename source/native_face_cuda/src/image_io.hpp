// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : image_io.hpp
// DATE         : 23/08/2026
// DESCRIPTION  : Declares image storage and image-loading functions shared by the native recognition engines.
// -----------------------------------------------------------------------------
// Header Name : image_io
// Purpose     : Declares image storage and image-loading functions shared by the native recognition engines.
// -----------------------------------------------------------------------------
#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

// Store dimensions next to contiguous RGBA bytes to make tensor conversion explicit and bounds-checkable.
struct Image {
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> rgba;
};

// Keep platform-specific decoding behind this small interface so inference code remains image-format independent.
Image load_image_rgba(const std::filesystem::path& path);
void copy_image_file(const std::filesystem::path& source, const std::filesystem::path& destination);
std::wstring widen_utf8(const std::string& value);
