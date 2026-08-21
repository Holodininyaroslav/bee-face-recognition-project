#include <cuda_runtime.h>

#include <stdexcept>
#include <string>
#include <vector>

namespace {
void check_cuda(cudaError_t status, const char* operation) {
    if (status != cudaSuccess) {
        throw std::runtime_error(std::string(operation) + ": " + cudaGetErrorString(status));
    }
}

__global__ void cosine_scores_kernel(
    const float* queries,
    const float* references,
    float* scores,
    int query_count,
    int reference_count,
    int dimensions
) {
    // Grid Y selects a query image; grid X spans the reference database.
    // The guard is required because the final block may be only partly full.
    const int reference_index = blockIdx.x * blockDim.x + threadIdx.x;
    const int query_index = blockIdx.y;
    if (query_index >= query_count || reference_index >= reference_count) return;
    float dot = 0.0f;
    for (int index = 0; index < dimensions; ++index) {
        dot += queries[query_index * dimensions + index] * references[reference_index * dimensions + index];
    }
    scores[query_index * reference_count + reference_index] = dot;
}
}

std::vector<float> sface_cuda_scores(
    const std::vector<float>& queries,
    const std::vector<float>& references,
    int query_count,
    int reference_count,
    int dimensions
) {
    if (query_count <= 0 || reference_count <= 0 || dimensions <= 0) return {};
    float* device_queries = nullptr;
    float* device_references = nullptr;
    float* device_scores = nullptr;
    const std::size_t query_bytes = queries.size() * sizeof(float);
    const std::size_t reference_bytes = references.size() * sizeof(float);
    const std::size_t score_bytes = static_cast<std::size_t>(query_count) * reference_count * sizeof(float);
    check_cuda(cudaMalloc(&device_queries, query_bytes), "cudaMalloc queries");
    check_cuda(cudaMalloc(&device_references, reference_bytes), "cudaMalloc references");
    check_cuda(cudaMalloc(&device_scores, score_bytes), "cudaMalloc scores");
    try {
        // Every query/reference pair is evaluated, including duplicate images.
        // This is deliberately a measurement of executed inference work.
        check_cuda(cudaMemcpy(device_queries, queries.data(), query_bytes, cudaMemcpyHostToDevice), "copy queries");
        check_cuda(cudaMemcpy(device_references, references.data(), reference_bytes, cudaMemcpyHostToDevice), "copy references");
        const dim3 block(256);
        const dim3 grid((reference_count + block.x - 1) / block.x, query_count);
        cosine_scores_kernel<<<grid, block>>>(
            device_queries, device_references, device_scores, query_count, reference_count, dimensions
        );
        check_cuda(cudaGetLastError(), "cosine_scores_kernel launch");
        std::vector<float> result(static_cast<std::size_t>(query_count) * reference_count);
        check_cuda(cudaMemcpy(result.data(), device_scores, score_bytes, cudaMemcpyDeviceToHost), "copy scores");
        cudaFree(device_scores);
        cudaFree(device_references);
        cudaFree(device_queries);
        return result;
    } catch (...) {
        cudaFree(device_scores);
        cudaFree(device_references);
        cudaFree(device_queries);
        throw;
    }
}
