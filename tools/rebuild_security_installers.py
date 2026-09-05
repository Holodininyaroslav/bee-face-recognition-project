"""Rebuild reviewed installer snapshots without old user capture data or bytecode."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).resolve().parents[1]
def include(name):
    parts=Path(name).parts
    return not any(p in {'__pycache__','.git','.pytest_cache','inbox','status','verification'} for p in parts) and not name.endswith(('.pyc','.log'))

def write_archive(target, contents):
    temporary=target.with_suffix('.zip.new')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(contents.items()):
            if not include(name): continue
            info=zipfile.ZipInfo(name,date_time=(2026,9,5,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644 << 16
            archive.writestr(info,data)
    with zipfile.ZipFile(temporary) as check:
        if check.testzip(): raise ValueError('Corrupt installer')
    temporary.replace(target)

physical=ROOT/'installers/physical_wings_source'
write_archive(ROOT/'physical_simulation_installer.zip', {
    p.relative_to(physical).as_posix():p.read_bytes() for p in physical.rglob('*') if p.is_file() and include(p.as_posix())})

target=ROOT/'installers/beeboard_interface_installer.zip'
with zipfile.ZipFile(target) as original:
    # Preserve the board design and documented assets, but replace all application sources.
    files={i.filename:original.read(i) for i in original.infolist()
           if not i.is_dir() and not i.filename.startswith('BeeBoard_Interface/')}
source=ROOT/'source/beeboard/BeeBoard_Interface'
for p in source.rglob('*'):
    if p.is_file() and include(p.as_posix()):
        files['BeeBoard_Interface/'+p.relative_to(source).as_posix()]=p.read_bytes()
write_archive(target,files)
records={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(ROOT.rglob('*.zip')) if '.git' not in p.parts}
(ROOT/'installers/SHA256SUMS.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps(records,indent=2))
