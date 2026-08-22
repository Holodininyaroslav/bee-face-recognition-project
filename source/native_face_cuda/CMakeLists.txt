cmake_minimum_required(VERSION 3.24)

project(native_face_recognition LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

set(COMMON_SOURCES
    src/deepid_engine.cpp
    src/image_io.cpp
    src/identity_cli.cpp
)

add_executable(identity_deepid_cpu ${COMMON_SOURCES})
target_compile_definitions(identity_deepid_cpu PRIVATE
    FACE_DETECTOR_USE_CUDA=0
    FACE_DETECTOR_USE_HIP=0
    FACE_DETECTOR_USE_OPENCL=0
    NOMINMAX
    WIN32_LEAN_AND_MEAN
)
target_link_libraries(identity_deepid_cpu PRIVATE gdiplus)

add_executable(identity_deepid_cuda ${COMMON_SOURCES} src/deepid_cuda.cu)
target_compile_definitions(identity_deepid_cuda PRIVATE
    FACE_DETECTOR_USE_CUDA=1
    FACE_DETECTOR_USE_HIP=0
    FACE_DETECTOR_USE_OPENCL=0
    NOMINMAX
    WIN32_LEAN_AND_MEAN
)
set_target_properties(identity_deepid_cuda PROPERTIES
    CUDA_ARCHITECTURES native
    CUDA_SEPARABLE_COMPILATION ON
    CUDA_RUNTIME_LIBRARY Shared
)
target_link_libraries(identity_deepid_cuda PRIVATE gdiplus)

set(ONNXRUNTIME_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/third_party/onnxruntime")
set(ONNXRUNTIME_INCLUDE "${ONNXRUNTIME_ROOT}/build/native/include")
set(ONNXRUNTIME_NATIVE "${ONNXRUNTIME_ROOT}/runtimes/win-x64/native")
set(SFACE_SOURCES
    src/sface_engine.cpp
    src/sface_identity_cli.cpp
    src/image_io.cpp
)

add_executable(identity_cpu ${SFACE_SOURCES})
target_include_directories(identity_cpu PRIVATE "${ONNXRUNTIME_INCLUDE}")
target_compile_definitions(identity_cpu PRIVATE FACE_USE_CUDA=0 NOMINMAX WIN32_LEAN_AND_MEAN)
target_link_libraries(identity_cpu PRIVATE gdiplus "${ONNXRUNTIME_NATIVE}/onnxruntime.lib")

add_executable(identity_cuda
    ${SFACE_SOURCES}
    src/sface_cuda.cu
    src/sface_manual_cuda.cu
)
target_include_directories(identity_cuda PRIVATE "${ONNXRUNTIME_INCLUDE}")
target_compile_definitions(identity_cuda PRIVATE FACE_USE_CUDA=1 NOMINMAX WIN32_LEAN_AND_MEAN)
set_target_properties(identity_cuda PROPERTIES
    CUDA_ARCHITECTURES native
    CUDA_SEPARABLE_COMPILATION ON
    CUDA_RUNTIME_LIBRARY Shared
)
target_link_libraries(identity_cuda PRIVATE gdiplus "${ONNXRUNTIME_NATIVE}/onnxruntime.lib")

foreach(target identity_cpu identity_cuda)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${ONNXRUNTIME_NATIVE}/onnxruntime.dll"
            "$<TARGET_FILE_DIR:${target}>/onnxruntime.dll"
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${ONNXRUNTIME_NATIVE}/onnxruntime_providers_shared.dll"
            "$<TARGET_FILE_DIR:${target}>/onnxruntime_providers_shared.dll"
    )
endforeach()

if(EXISTS "${ONNXRUNTIME_NATIVE}/onnxruntime_providers_cuda.dll")
    add_custom_command(TARGET identity_cuda POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${ONNXRUNTIME_NATIVE}/onnxruntime_providers_cuda.dll"
            "$<TARGET_FILE_DIR:identity_cuda>/onnxruntime_providers_cuda.dll"
    )
endif()

if(MSVC)
    target_compile_options(identity_deepid_cpu PRIVATE /W4 /permissive- /EHsc)
    target_compile_options(identity_deepid_cuda PRIVATE $<$<COMPILE_LANGUAGE:CXX>:/W4 /permissive- /EHsc>)
    target_compile_options(identity_cpu PRIVATE /W4 /permissive- /EHsc)
    target_compile_options(identity_cuda PRIVATE $<$<COMPILE_LANGUAGE:CXX>:/W4 /permissive- /EHsc>)
endif()
