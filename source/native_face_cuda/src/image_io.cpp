#include "image_io.hpp"

#include <stdexcept>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>
#pragma comment(lib, "gdiplus.lib")

namespace {
class GdiPlusSession {
public:
    GdiPlusSession() {
        Gdiplus::GdiplusStartupInput input;
        const auto status = Gdiplus::GdiplusStartup(&token_, &input, nullptr);
        if (status != Gdiplus::Ok) {
            throw std::runtime_error("GDI+ startup failed");
        }
    }

    ~GdiPlusSession() {
        if (token_ != 0) {
            Gdiplus::GdiplusShutdown(token_);
        }
    }

private:
    ULONG_PTR token_ = 0;
};

GdiPlusSession& gdiplus_session() {
    static GdiPlusSession session;
    return session;
}
}
#endif

std::wstring widen_utf8(const std::string& value) {
    if (value.empty()) {
        return {};
    }

#ifdef _WIN32
    const int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (size <= 0) {
        throw std::runtime_error("Failed to convert UTF-8 string to UTF-16");
    }
    std::wstring wide(size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), wide.data(), size);
    return wide;
#else
    return std::wstring(value.begin(), value.end());
#endif
}

Image load_image_rgba(const std::filesystem::path& path) {
#ifndef _WIN32
    throw std::runtime_error("Image loading currently uses Windows GDI+");
#else
    (void)gdiplus_session();

    Gdiplus::Bitmap bitmap(path.wstring().c_str(), false);
    if (bitmap.GetLastStatus() != Gdiplus::Ok) {
        throw std::runtime_error("Failed to load image: " + path.string());
    }

    Image image;
    image.width = static_cast<int>(bitmap.GetWidth());
    image.height = static_cast<int>(bitmap.GetHeight());
    image.rgba.resize(static_cast<std::size_t>(image.width) * static_cast<std::size_t>(image.height) * 4);

    Gdiplus::Rect rect(0, 0, image.width, image.height);
    Gdiplus::BitmapData data;
    const auto status = bitmap.LockBits(&rect, Gdiplus::ImageLockModeRead, PixelFormat32bppARGB, &data);
    if (status != Gdiplus::Ok) {
        throw std::runtime_error("Failed to lock image pixels: " + path.string());
    }

    const auto* source = static_cast<const std::uint8_t*>(data.Scan0);
    const int stride = data.Stride;
    for (int y = 0; y < image.height; ++y) {
        const auto* row = stride >= 0
            ? source + static_cast<std::ptrdiff_t>(y) * stride
            : source + static_cast<std::ptrdiff_t>(image.height - 1 - y) * -stride;
        for (int x = 0; x < image.width; ++x) {
            const auto* bgra = row + x * 4;
            auto* rgba = image.rgba.data() + (static_cast<std::size_t>(y) * image.width + x) * 4;
            rgba[0] = bgra[2];
            rgba[1] = bgra[1];
            rgba[2] = bgra[0];
            rgba[3] = bgra[3];
        }
    }

    bitmap.UnlockBits(&data);
    return image;
#endif
}

void copy_image_file(const std::filesystem::path& source, const std::filesystem::path& destination) {
    std::filesystem::create_directories(destination.parent_path());
    std::filesystem::copy_file(source, destination, std::filesystem::copy_options::overwrite_existing);
}
