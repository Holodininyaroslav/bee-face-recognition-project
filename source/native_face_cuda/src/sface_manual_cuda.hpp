// -----------------------------------------------------------------------------
// Copyright (C) Shenkar College
// Electronics & Electrical Engineering Department
// All rights reserved.
// Owner        : Yaroslav Holodinin and Goldstein Adi and Faraj Kharbaoui
// FILE NAME    : sface_manual_cuda.hpp
// DATE         : 23/08/2026
// DESCRIPTION  : Declares creation, destruction, and batch execution functions for the manual CUDA SFace runtime.
// -----------------------------------------------------------------------------
// Header Name : sface_manual_cuda
// Purpose     : Declares creation, destruction, and batch execution functions for the manual CUDA SFace runtime.
// -----------------------------------------------------------------------------
#pragma once

#include <filesystem>
#include <vector>

struct ManualSFaceCudaContext;

// Upload immutable trained weights once and return an opaque context reused by subsequent batches.
ManualSFaceCudaContext* create_manual_sface_cuda(
    const std::filesystem::path& weight_path
);

void destroy_manual_sface_cuda(ManualSFaceCudaContext* context) noexcept;

// Accept a complete Bx3x112x112 tensor and return B normalized 128-dimensional embeddings.
std::vector<float> manual_sface_cuda_forward(
    ManualSFaceCudaContext* context,
    const std::vector<float>& aligned_nchw_rgb,
    int batch_size
);
