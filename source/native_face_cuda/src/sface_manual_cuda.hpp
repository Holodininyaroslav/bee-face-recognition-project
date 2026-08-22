#pragma once

#include <filesystem>
#include <vector>

struct ManualSFaceCudaContext;

ManualSFaceCudaContext* create_manual_sface_cuda(
    const std::filesystem::path& weight_path
);

void destroy_manual_sface_cuda(ManualSFaceCudaContext* context) noexcept;

std::vector<float> manual_sface_cuda_forward(
    ManualSFaceCudaContext* context,
    const std::vector<float>& aligned_nchw_rgb,
    int batch_size
);
