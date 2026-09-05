"""Compile-test actual host parser code extracted from the CUDA translation unit."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
source = (root/'source/native_face_cuda/src/sface_manual_cuda.cu').read_text()
parser = source[source.index('struct HostTensor {'):source.index('float* upload(')]
transpose = source[source.index('std::vector<float> transpose_weights('):source.index('struct DeviceLayer {')]
includes = '\n'.join('#include <'+name+'>' for name in ('algorithm','array','cmath','cstdint','cstring','filesystem','fstream','iostream','stdexcept','string','unordered_map','vector'))
main = r'''
template<class T> void put(std::ofstream& f, T value) {f.write(reinterpret_cast<const char*>(&value),sizeof(value));}
void fixture(const char* path, uint32_t count, uint32_t rank, uint64_t dim, uint64_t elements) {
 std::ofstream f(path,std::ios::binary); f.write("SFCUDA1\0",8); put(f,uint32_t(1)); put(f,count);
 put(f,uint32_t(1)); f.write("x",1); put(f,rank);
 if(rank<=4) for(uint32_t i=0;i<rank;i++) put(f,dim);
 put(f,elements); for(int i=0;i<4;i++) put(f,float(i));
}
int main(int argc,char**argv) {
 if(argc!=2) return 2; int rejected=0;
 for(auto config : std::vector<std::array<uint64_t,4>>{{1,2,2,1},{999999,2,2,4},{1,5,2,4},{1,2,~uint64_t(0),4},{1,2,2,99999}}) {
  fixture(argv[1],config[0],config[1],config[2],config[3]);
  try {load_weight_file(argv[1]); return 3;} catch(const std::runtime_error&) {rejected++;}
 }
 fixture(argv[1],1,2,2,4); auto good=load_weight_file(argv[1]);
 if(transpose_weights(good.at("x"))!=std::vector<float>{0,2,1,3}) return 4;
 try {transpose_weights(HostTensor{{2,2},{1}}); return 5;} catch(const std::runtime_error&) {rejected++;}
 std::cout<<"Parser security: "<<rejected<<" malformed cases rejected; valid 2x2 transpose passed\n";
}
'''
(root/'parser_security_test.cpp').write_text(includes+'\n'+parser+'\n'+transpose+'\n'+main)
print('Generated host-only parser sanitizer test from actual CUDA source')
