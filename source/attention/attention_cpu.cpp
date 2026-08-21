#include "attention.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <random>
#include <stdexcept>

namespace attention {

namespace {

void validate_inputs(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d
) {
    if (n <= 0 || d <= 0) {
        throw std::invalid_argument("N and d must be positive");
    }
    const auto expected = static_cast<std::size_t>(n) * static_cast<std::size_t>(d);
    if (q.size() != expected || k.size() != expected || v.size() != expected) {
        throw std::invalid_argument("Q, K and V must each contain N*d elements");
    }
}

void compute_attention_cpu(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    std::vector<float>& scores,
    std::vector<float>& output,
    Timing* timing
) {
    const auto begin = std::chrono::steady_clock::now();
    const float scale = 1.0f / std::sqrt(static_cast<float>(d));

    // Stage 1 and 2: Q*K^T followed by scaling.
    for (int row = 0; row < n; ++row) {
        for (int column = 0; column < n; ++column) {
            float sum = 0.0f;
            for (int feature = 0; feature < d; ++feature) {
                sum += q[static_cast<std::size_t>(row) * d + feature]
                    * k[static_cast<std::size_t>(column) * d + feature];
            }
            scores[static_cast<std::size_t>(row) * n + column] = sum * scale;
        }
    }

    // Stage 3: numerically stable row-wise softmax.
    for (int row = 0; row < n; ++row) {
        float* current = scores.data() + static_cast<std::size_t>(row) * n;
        float maximum = current[0];
        for (int column = 1; column < n; ++column) {
            maximum = std::max(maximum, current[column]);
        }
        double sum = 0.0;
        for (int column = 0; column < n; ++column) {
            current[column] = std::exp(current[column] - maximum);
            sum += current[column];
        }
        const float inverse_sum = 1.0f / static_cast<float>(sum);
        for (int column = 0; column < n; ++column) {
            current[column] *= inverse_sum;
        }
    }

    // Stage 4: softmax(scores)*V.
    for (int row = 0; row < n; ++row) {
        for (int feature = 0; feature < d; ++feature) {
            float sum = 0.0f;
            for (int column = 0; column < n; ++column) {
                sum += scores[static_cast<std::size_t>(row) * n + column]
                    * v[static_cast<std::size_t>(column) * d + feature];
            }
            output[static_cast<std::size_t>(row) * d + feature] = sum;
        }
    }

    const auto end = std::chrono::steady_clock::now();
    if (timing != nullptr) {
        timing->milliseconds = std::chrono::duration<double, std::milli>(end - begin).count();
    }
}

}  // namespace

std::vector<float> make_random_matrix(int rows, int columns, unsigned seed) {
    if (rows <= 0 || columns <= 0) {
        throw std::invalid_argument("matrix dimensions must be positive");
    }
    std::mt19937 generator(seed);
    std::uniform_real_distribution<float> distribution(-1.0f, 1.0f);
    std::vector<float> matrix(static_cast<std::size_t>(rows) * columns);
    for (float& value : matrix) {
        value = distribution(generator);
    }
    return matrix;
}

std::vector<float> scaled_dot_product_attention_cpu(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    Timing* timing
) {
    validate_inputs(q, k, v, n, d);
    const std::size_t score_count = static_cast<std::size_t>(n) * n;
    std::vector<float> scores(score_count, 0.0f);
    std::vector<float> output(static_cast<std::size_t>(n) * d, 0.0f);
    compute_attention_cpu(q, k, v, n, d, scores, output, timing);
    return output;
}

void scaled_dot_product_attention_cpu_into(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    std::vector<float>& scores,
    std::vector<float>& output,
    Timing* timing
) {
    validate_inputs(q, k, v, n, d);
    const std::size_t expected_scores = static_cast<std::size_t>(n) * n;
    const std::size_t expected_output = static_cast<std::size_t>(n) * d;
    if (scores.size() != expected_scores || output.size() != expected_output) {
        throw std::invalid_argument("CPU workspace sizes must be N*N and N*d");
    }
    compute_attention_cpu(q, k, v, n, d, scores, output, timing);
}

ErrorStats compare_outputs(
    const std::vector<float>& expected,
    const std::vector<float>& actual
) {
    if (expected.size() != actual.size()) {
        throw std::invalid_argument("cannot compare outputs with different sizes");
    }
    ErrorStats result;
    double total = 0.0;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        if (!std::isfinite(expected[i]) || !std::isfinite(actual[i])) {
            result.maximum_absolute = std::numeric_limits<float>::infinity();
            result.mean_absolute = std::numeric_limits<double>::infinity();
            return result;
        }
        const float difference = std::abs(expected[i] - actual[i]);
        result.maximum_absolute = std::max(result.maximum_absolute, difference);
        total += difference;
    }
    result.mean_absolute = expected.empty() ? 0.0 : total / expected.size();
    return result;
}

}  // namespace attention
