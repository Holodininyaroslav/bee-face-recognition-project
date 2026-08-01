// Basic stage 1: one two-dimensional work-item computes one Q*K^T value.
__kernel void qk_matmul_basic(
    __global const float* q,
    __global const float* k,
    __global float* scores,
    const int n,
    const int d
) {
    const int column = (int)get_global_id(0);
    const int row = (int)get_global_id(1);
    if (row >= n || column >= n) {
        return;
    }
    float sum = 0.0f;
    for (int feature = 0; feature < d; ++feature) {
        sum += q[row * d + feature] * k[column * d + feature];
    }
    scores[row * n + column] = sum;
}

// Basic stage 2: a separate scaling kernel, as requested by the base assignment.
__kernel void scale_scores(
    __global float* scores,
    const int count,
    const float scale
) {
    const int index = (int)get_global_id(0);
    if (index < count) {
        scores[index] *= scale;
    }
}

// Stage 3: one work-group per row. Local-memory reductions find the maximum
// and sum. Subtracting row_max before exp provides numerical stability.
__kernel void row_softmax(
    __global float* scores,
    const int n,
    __local float* maximum_scratch,
    __local float* sum_scratch
) {
    const int row = (int)get_group_id(0);
    const int local_id = (int)get_local_id(0);
    const int local_size = (int)get_local_size(0);
    if (row >= n) {
        return;
    }

    float local_maximum = -INFINITY;
    for (int column = local_id; column < n; column += local_size) {
        local_maximum = fmax(local_maximum, scores[row * n + column]);
    }
    maximum_scratch[local_id] = local_maximum;
    barrier(CLK_LOCAL_MEM_FENCE);

    for (int stride = local_size / 2; stride > 0; stride >>= 1) {
        if (local_id < stride) {
            maximum_scratch[local_id] = fmax(
                maximum_scratch[local_id],
                maximum_scratch[local_id + stride]
            );
        }
        barrier(CLK_LOCAL_MEM_FENCE);
    }

    const float row_maximum = maximum_scratch[0];
    float local_sum = 0.0f;
    for (int column = local_id; column < n; column += local_size) {
        const float value = exp(scores[row * n + column] - row_maximum);
        scores[row * n + column] = value;
        local_sum += value;
    }
    sum_scratch[local_id] = local_sum;
    barrier(CLK_LOCAL_MEM_FENCE);

    for (int stride = local_size / 2; stride > 0; stride >>= 1) {
        if (local_id < stride) {
            sum_scratch[local_id] += sum_scratch[local_id + stride];
        }
        barrier(CLK_LOCAL_MEM_FENCE);
    }

    const float inverse_sum = 1.0f / sum_scratch[0];
    for (int column = local_id; column < n; column += local_size) {
        scores[row * n + column] *= inverse_sum;
    }
}

// Basic stage 4: one two-dimensional work-item computes one output value.
__kernel void attention_v_basic(
    __global const float* probabilities,
    __global const float* v,
    __global float* output,
    const int n,
    const int d
) {
    const int feature = (int)get_global_id(0);
    const int row = (int)get_global_id(1);
    if (row >= n || feature >= d) {
        return;
    }
    float sum = 0.0f;
    for (int column = 0; column < n; ++column) {
        sum += probabilities[row * n + column] * v[column * d + feature];
    }
    output[row * d + feature] = sum;
}

#define TILE 16

// Advanced stage 1+2: tiled Q*K^T through local memory with fused scaling.
__kernel void qk_matmul_tiled_scaled(
    __global const float* q,
    __global const float* k,
    __global float* scores,
    const int n,
    const int d,
    const float scale
) {
    __local float tile_q[TILE][TILE];
    __local float tile_k[TILE][TILE];
    const int local_x = (int)get_local_id(0);
    const int local_y = (int)get_local_id(1);
    const int column = (int)get_global_id(0);
    const int row = (int)get_global_id(1);
    float sum = 0.0f;

    for (int start = 0; start < d; start += TILE) {
        const int q_feature = start + local_x;
        const int k_feature = start + local_y;
        tile_q[local_y][local_x] = (row < n && q_feature < d)
            ? q[row * d + q_feature]
            : 0.0f;
        tile_k[local_y][local_x] = (column < n && k_feature < d)
            ? k[column * d + k_feature]
            : 0.0f;
        barrier(CLK_LOCAL_MEM_FENCE);
        for (int inner = 0; inner < TILE; ++inner) {
            sum += tile_q[local_y][inner] * tile_k[inner][local_x];
        }
        barrier(CLK_LOCAL_MEM_FENCE);
    }

    if (row < n && column < n) {
        scores[row * n + column] = sum * scale;
    }
}

// Advanced stage 4: tiled probabilities*V through local memory.
__kernel void attention_v_tiled(
    __global const float* probabilities,
    __global const float* v,
    __global float* output,
    const int n,
    const int d
) {
    __local float tile_probabilities[TILE][TILE];
    __local float tile_v[TILE][TILE];
    const int local_x = (int)get_local_id(0);
    const int local_y = (int)get_local_id(1);
    const int feature = (int)get_global_id(0);
    const int row = (int)get_global_id(1);
    float sum = 0.0f;

    for (int start = 0; start < n; start += TILE) {
        const int probability_column = start + local_x;
        const int v_row = start + local_y;
        tile_probabilities[local_y][local_x] = (row < n && probability_column < n)
            ? probabilities[row * n + probability_column]
            : 0.0f;
        tile_v[local_y][local_x] = (v_row < n && feature < d)
            ? v[v_row * d + feature]
            : 0.0f;
        barrier(CLK_LOCAL_MEM_FENCE);
        for (int inner = 0; inner < TILE; ++inner) {
            sum += tile_probabilities[local_y][inner] * tile_v[inner][local_x];
        }
        barrier(CLK_LOCAL_MEM_FENCE);
    }

    if (row < n && feature < d) {
        output[row * d + feature] = sum;
    }
}

