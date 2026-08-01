#include "attention.hpp"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

struct Options {
    std::string mode = "both";
    std::string variant = "all";
    int n = 512;
    int d = 64;
    int iterations = 5;
    unsigned seed = 2026;
    float tolerance = 2.0e-4f;
    std::size_t device_index = std::numeric_limits<std::size_t>::max();
    bool list_devices = false;
    std::filesystem::path kernel_path;
    std::filesystem::path csv_path;
};

int parse_positive_int(const char* value, const char* name) {
    const int result = std::stoi(value);
    if (result <= 0) {
        throw std::invalid_argument(std::string(name) + " must be positive");
    }
    return result;
}

void print_usage() {
    std::cout
        << "Scaled Dot-Product Attention: CPU + OpenCL\n\n"
        << "Options:\n"
        << "  --mode cpu|opencl|both       Execution path (default: both)\n"
        << "  --variant basic|optimized|all OpenCL implementation (default: all)\n"
        << "  --n NUMBER                    Sequence length (default: 512)\n"
        << "  --d NUMBER                    Vector dimension (default: 64)\n"
        << "  --iterations NUMBER           Measured iterations (default: 5)\n"
        << "  --seed NUMBER                 Random seed (default: 2026)\n"
        << "  --device-index NUMBER         Exact OpenCL device from --list-devices\n"
        << "  --kernel PATH                 Path to kernels/attention.cl\n"
        << "  --csv PATH                    Write benchmark rows to CSV\n"
        << "  --tolerance VALUE             Maximum accepted absolute error\n"
        << "  --list-devices                Show actual OpenCL devices and exit\n"
        << "  --help                        Show this message\n";
}

Options parse_options(int argc, char** argv) {
    Options options;
    for (int i = 1; i < argc; ++i) {
        const std::string argument = argv[i];
        auto require_value = [&]() -> const char* {
            if (i + 1 >= argc) {
                throw std::invalid_argument("missing value after " + argument);
            }
            return argv[++i];
        };
        if (argument == "--help") {
            print_usage();
            std::exit(0);
        } else if (argument == "--mode") {
            options.mode = require_value();
        } else if (argument == "--variant") {
            options.variant = require_value();
        } else if (argument == "--n") {
            options.n = parse_positive_int(require_value(), "N");
        } else if (argument == "--d") {
            options.d = parse_positive_int(require_value(), "d");
        } else if (argument == "--iterations") {
            options.iterations = parse_positive_int(require_value(), "iterations");
        } else if (argument == "--seed") {
            options.seed = static_cast<unsigned>(std::stoul(require_value()));
        } else if (argument == "--device-index") {
            options.device_index = static_cast<std::size_t>(std::stoull(require_value()));
        } else if (argument == "--kernel") {
            options.kernel_path = require_value();
        } else if (argument == "--csv") {
            options.csv_path = require_value();
        } else if (argument == "--tolerance") {
            options.tolerance = std::stof(require_value());
        } else if (argument == "--list-devices") {
            options.list_devices = true;
        } else {
            throw std::invalid_argument("unknown option: " + argument);
        }
    }
    if (options.mode != "cpu" && options.mode != "opencl" && options.mode != "both") {
        throw std::invalid_argument("--mode must be cpu, opencl or both");
    }
    if (options.variant != "basic" && options.variant != "optimized" && options.variant != "all") {
        throw std::invalid_argument("--variant must be basic, optimized or all");
    }
    if (options.tolerance <= 0.0f) {
        throw std::invalid_argument("--tolerance must be positive");
    }
    return options;
}

void print_devices(const std::vector<attention::OpenClDeviceInfo>& devices) {
    if (devices.empty()) {
        std::cout << "No OpenCL devices found.\n";
        return;
    }
    for (const auto& device : devices) {
        std::cout
            << '[' << device.index << "] " << device.type << " | " << device.name
            << " | " << device.vendor
            << " | CU=" << device.compute_units
            << " | global=" << device.global_memory_mb << " MiB"
            << " | local=" << device.local_memory_kb << " KiB"
            << " | platform=" << device.platform_name << '\n';
    }
}

std::size_t choose_default_device(const std::vector<attention::OpenClDeviceInfo>& devices) {
    if (devices.empty()) {
        throw std::runtime_error("no OpenCL devices are available");
    }
    auto score = [](const attention::OpenClDeviceInfo& device) {
        const std::uint64_t gpu_bonus = device.type == "GPU" ? (1ULL << 60) : 0;
        return gpu_bonus
            + static_cast<std::uint64_t>(device.compute_units) * (1ULL << 32)
            + device.global_memory_mb;
    };
    const auto best = std::max_element(
        devices.begin(),
        devices.end(),
        [&](const auto& left, const auto& right) { return score(left) < score(right); }
    );
    return best->index;
}

std::filesystem::path locate_kernel(
    const std::filesystem::path& requested,
    const std::filesystem::path& executable
) {
    if (!requested.empty()) {
        if (!std::filesystem::exists(requested)) {
            throw std::runtime_error("requested kernel file does not exist: " + requested.string());
        }
        return requested;
    }
    const auto executable_directory = std::filesystem::absolute(executable).parent_path();
    const std::vector<std::filesystem::path> candidates = {
        std::filesystem::current_path() / "kernels" / "attention.cl",
        executable_directory / "kernels" / "attention.cl",
        executable_directory.parent_path() / "kernels" / "attention.cl",
        executable_directory.parent_path().parent_path() / "kernels" / "attention.cl"
    };
    for (const auto& candidate : candidates) {
        if (std::filesystem::exists(candidate)) {
            return candidate;
        }
    }
    throw std::runtime_error("kernels/attention.cl was not found; use --kernel PATH");
}

double run_cpu_average(
    const std::vector<float>& q,
    const std::vector<float>& k,
    const std::vector<float>& v,
    int n,
    int d,
    int iterations,
    std::vector<float>& output
) {
    attention::Timing ignored;
    attention::scaled_dot_product_attention_cpu(q, k, v, n, d, &ignored); // warm-up
    double total = 0.0;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        attention::Timing timing;
        output = attention::scaled_dot_product_attention_cpu(q, k, v, n, d, &timing);
        total += timing.milliseconds;
    }
    return total / iterations;
}

void write_csv_header(std::ofstream& csv) {
    csv << "backend,variant,device,N,d,iterations,kernel_ms,end_to_end_ms,max_abs_error,mean_abs_error\n";
}

}  // namespace

int main(int argc, char** argv) {
    try {
        const Options options = parse_options(argc, argv);
        const auto devices = attention::enumerate_opencl_devices();
        if (options.list_devices) {
            print_devices(devices);
            return 0;
        }

        std::cout << "Formula: softmax((Q * K^T) / sqrt(d)) * V\n";
        std::cout << "Shape: N=" << options.n << ", d=" << options.d
                  << ", iterations=" << options.iterations << "\n";
        std::cout << "Generating deterministic Q, K and V...\n";
        const auto q = attention::make_random_matrix(options.n, options.d, options.seed);
        const auto k = attention::make_random_matrix(options.n, options.d, options.seed + 1);
        const auto v = attention::make_random_matrix(options.n, options.d, options.seed + 2);

        // A CPU result is always computed when OpenCL is requested because it is
        // the independent numerical oracle required by the assignment.
        std::vector<float> cpu_output;
        const double cpu_ms = run_cpu_average(
            q, k, v, options.n, options.d, options.iterations, cpu_output
        );
        std::cout << std::fixed << std::setprecision(4);
        std::cout << "CPU naive: " << cpu_ms << " ms\n";

        std::ofstream csv;
        if (!options.csv_path.empty()) {
            csv.open(options.csv_path);
            if (!csv) {
                throw std::runtime_error("cannot open CSV output: " + options.csv_path.string());
            }
            write_csv_header(csv);
            csv << "CPU,naive,host," << options.n << ',' << options.d << ',' << options.iterations
                << "," << cpu_ms << ',' << cpu_ms << ",0,0\n";
        }

        if (options.mode == "cpu") {
            std::cout << "CPU-only mode completed successfully.\n";
            return 0;
        }

        if (devices.empty()) {
            throw std::runtime_error("OpenCL mode requested, but no OpenCL device was found");
        }
        const std::size_t selected_index = options.device_index == std::numeric_limits<std::size_t>::max()
            ? choose_default_device(devices)
            : options.device_index;
        if (selected_index >= devices.size()) {
            throw std::out_of_range("--device-index is outside the list reported by --list-devices");
        }
        const auto kernel_path = locate_kernel(options.kernel_path, argv[0]);
        std::cout << "OpenCL device [" << selected_index << "]: " << devices[selected_index].name
                  << " (" << devices[selected_index].type << ")\n";
        std::cout << "Kernel source: " << kernel_path.string() << "\n";

        const std::vector<bool> variants = options.variant == "all"
            ? std::vector<bool>{false, true}
            : std::vector<bool>{options.variant == "optimized"};
        bool all_correct = true;
        for (bool optimized : variants) {
            const auto result = attention::scaled_dot_product_attention_opencl(
                q,
                k,
                v,
                options.n,
                options.d,
                selected_index,
                optimized,
                options.iterations,
                kernel_path
            );
            const auto errors = attention::compare_outputs(cpu_output, result.output);
            const bool correct = errors.maximum_absolute <= options.tolerance;
            all_correct = all_correct && correct;
            const char* variant_name = optimized ? "optimized" : "basic";
            std::cout
                << "OpenCL " << variant_name
                << ": kernels=" << result.kernel_milliseconds << " ms"
                << ", end-to-end=" << result.end_to_end_milliseconds << " ms"
                << ", max_abs_error=" << errors.maximum_absolute
                << ", mean_abs_error=" << errors.mean_absolute
                << ", verification=" << (correct ? "PASS" : "FAIL") << '\n';
            if (csv) {
                csv << "OpenCL," << variant_name << ',' << result.device.name << ','
                    << options.n << ',' << options.d << ',' << options.iterations << ','
                    << result.kernel_milliseconds << ',' << result.end_to_end_milliseconds << ','
                    << errors.maximum_absolute << ',' << errors.mean_absolute << '\n';
            }
        }

        if (!all_correct) {
            std::cerr << "Verification failed: maximum absolute error exceeded "
                      << options.tolerance << "\n";
            return 2;
        }
        std::cout << "All requested implementations passed the CPU reference check.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "ERROR: " << error.what() << '\n';
        return 1;
    }
}

