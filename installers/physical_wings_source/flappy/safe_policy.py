"""Numeric policies only. Never deserialize Python objects from model files."""
from pathlib import Path
import zipfile
import numpy as np

KEYS = ('h0w', 'h0b', 'h1w', 'h1b', 'ow', 'ob')


def load_policy(path):
    path = Path(path)
    if path.suffix.lower() != '.npz' or path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('Only bounded numeric .npz policies are supported; legacy pickle is disabled')
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > 7 or sum(i.file_size for i in archive.infolist()) > 16 * 1024 * 1024:
            raise ValueError('Policy expands beyond the permitted size')
        if any(i.filename not in {key + '.npy' for key in (*KEYS, 'ologstd')} for i in archive.infolist()):
            raise ValueError('Unexpected policy entries')
    with np.load(path, allow_pickle=False) as data:
        if not set(KEYS).issubset(data.files):
            raise ValueError('Incomplete numeric policy')
        result = {key: data[key] for key in data.files}
    for value in result.values():
        if value.dtype.kind not in 'fi' or value.size > 1_000_000 or not np.isfinite(value).all():
            raise ValueError('Invalid numeric policy tensor')
    for weight, bias in (('h0w','h0b'), ('h1w','h1b'), ('ow','ob')):
        if result[weight].ndim != 2 or result[bias].shape != (result[weight].shape[1],):
            raise ValueError('Invalid layer dimensions')
    if result['h0w'].shape[1] != result['h1w'].shape[0] or result['h1w'].shape[1] != result['ow'].shape[0]:
        raise ValueError('Incompatible policy layers')
    return result
