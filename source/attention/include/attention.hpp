#pragma once

#include <cstddef>
#include <filesystem>
#include <string>
#include <vector>

namespace attention {

struct Timing {
    double milliseconds = 0.0;
};

struct ErrorStats {
    float maximum_absolute = 0.0f;
    double mean_absolute = 0.0;
};

struct OpenClDeviceInfo {
    std::size_t index = 0;
    std::string platform_name;
    std::string name;
    std::string vendor;
    std::string type;
    unsigned compute_units = 0;
    std::size_t global_memory_mb = 0;
    std::size_t local_memory_kb = 0;
};

struct OpenClResult {
    std::vector<float> output;
    OpenClDeviceInfo device;
    double kernel_milliseconds = 0.0;
    double end_to_end_milliseconds = 0.0;
    bool optimized = false;
};

std::vector<float> make_random_matrix(int rows, int columns, unsigned seed);

std::vector<float> scaled_dot_product_attention_cpu(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    Timing* timing = nullptr
);

ErrorStats compare_outputs(
    const std::vector<float>& expected,
    const std::vector<float>& actual
);

std::vector<OpenClDeviceInfo> enumerate_opencl_devices();

OpenClResult scaled_dot_product_attention_opencl(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    std::size_t device_index,
    bool optimized,
    int iterations,
    const std::filesystem::path& kernel_path
);

}  // namespace attention
