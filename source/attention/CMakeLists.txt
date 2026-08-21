cmake_minimum_required(VERSION 3.24)

project(gpu_course_attention LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(attention_local
    main.cpp
    attention_cpu.cpp
    attention_opencl.cpp
)
target_include_directories(attention_local PRIVATE include)

if(MSVC)
    target_compile_options(attention_local PRIVATE /W4 /permissive- /EHsc)
    target_compile_definitions(attention_local PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
else()
    target_compile_options(attention_local PRIVATE -Wall -Wextra -Wpedantic)
    if(UNIX AND NOT APPLE)
        target_link_libraries(attention_local PRIVATE dl)
    endif()
endif()

add_custom_command(TARGET attention_local POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/attention.cl"
        "$<TARGET_FILE_DIR:attention_local>/attention.cl"
)

option(BUILD_CUDA "Build the mandatory CUDA C++ implementation" ON)
if(BUILD_CUDA)
    include(CheckLanguage)
    check_language(CUDA)
    if(CMAKE_CUDA_COMPILER)
        enable_language(CUDA)
        add_executable(attention_cuda
            attention_cuda.cu
            attention_cpu.cpp
        )
        target_include_directories(attention_cuda PRIVATE include)
        set_target_properties(attention_cuda PROPERTIES
            CUDA_STANDARD 17
            CUDA_STANDARD_REQUIRED ON
            CUDA_ARCHITECTURES native
        )
    else()
        message(FATAL_ERROR "BUILD_CUDA=ON, but NVCC was not found")
    endif()
endif()
