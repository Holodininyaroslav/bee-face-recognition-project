import asyncio
import base64
import importlib.util
import io
import json
import sys
import tempfile
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT/'source/beeboard/BeeBoard_Interface'
sys.path[:0] = [str(APP)]
import app
import local_security as sec
from PIL import Image


async def request(path='/', method='GET', body=b'', headers=None):
    pairs = [(b'host',b'127.0.0.1:8877')]
    pairs += [(k.lower().encode(),v.encode()) for k,v in (headers or {}).items()]
    if method == 'POST': pairs.append((b'content-length',str(len(body)).encode()))
    events=[]
    async def receive(): return {'type':'http.request','body':body,'more_body':False}
    async def send(event): events.append(event)
    await app.app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','scheme':'http',
                   'server':('127.0.0.1',8877),'client':('127.0.0.1',4000),'method':method,
                   'path':path,'raw_path':path.encode(),'query_string':b'','headers':pairs},receive,send)
    return events[0]['status'],b''.join(e.get('body',b'') for e in events[1:])


def test_page_and_security_token():
    assert b'local-api-security.js' in asyncio.run(request())[1]
    assert json.loads(asyncio.run(request('/api/security-token'))[1])['token'] == sec.TOKEN


@pytest.mark.parametrize('headers', [{'Origin':'https://evil.invalid'}, {'Origin':'null'}, {'Host':'evil.invalid'}, {'Sec-Fetch-Site':'cross-site'}])
def test_foreign_clients_rejected(headers):
    assert asyncio.run(request('/api/security-token',headers=headers))[0] in (400,403)


def test_launch_requires_post_and_token(monkeypatch):
    assert asyncio.run(request('/api/open-processors'))[0] == 405
    assert asyncio.run(request('/api/open-processors','POST',b'{}',{'Content-Type':'text/plain'}))[0] == 415
    assert asyncio.run(request('/api/open-processors','POST',b'{}',{'Content-Type':'application/json'}))[0] == 403
    monkeypatch.setattr(app,'AI_MIPS_DIR',Path('not-an-installed-project'))
    status,body=asyncio.run(request('/api/open-processors','POST',b'{}',{'Content-Type':'application/json','X-Local-CSRF':sec.TOKEN}))
    assert status == 404 and b'not found' in body  # Reached legitimate handler, no process launched.


def test_capture_validation_and_safe_image(tmp_path,monkeypatch):
    monkeypatch.setattr(app,'COLAB_INBOX_DIR',tmp_path/'inbox')
    monkeypatch.setattr(app,'COLAB_STATUS_DIR',tmp_path/'status')
    headers={'Content-Type':'application/json','X-Local-CSRF':sec.TOKEN}
    invalid=json.dumps({'image_data':base64.b64encode(b'x'*200).decode()}).encode()
    assert asyncio.run(request('/api/colab/capture/cpu','POST',invalid,headers))[0] == 400
    buf=io.BytesIO(); Image.new('RGB',(128,128),'blue').save(buf,format='PNG')
    valid=json.dumps({'image_data':base64.b64encode(buf.getvalue()).decode()}).encode()
    assert asyncio.run(request('/api/colab/capture/cpu','POST',valid,headers))[0] == 200
    assert len(list(tmp_path.rglob('*.png'))) == 1


def test_numeric_policy_rejects_pickle_and_mismatched_shapes(tmp_path):
    policy_path=ROOT/'installers/physical_wings_source/flappy/safe_policy.py'
    spec=importlib.util.spec_from_file_location('safe_policy',policy_path)
    policy=importlib.util.module_from_spec(spec); spec.loader.exec_module(policy)
    import numpy as np
    bad=tmp_path/'policy.pkl'; bad.write_bytes(b'not-executed')
    with pytest.raises(ValueError): policy.load_policy(bad)
    arrays={'h0w':np.ones((3,4)),'h0b':np.ones(4),'h1w':np.ones((4,2)),
            'h1b':np.ones(2),'ow':np.ones((2,1)),'ob':np.ones(1)}
    good=tmp_path/'policy.npz'; np.savez(good,**arrays)
    assert policy.load_policy(good)['h0w'].shape == (3,4)
    arrays['ob']=np.ones(2); np.savez(good,**arrays)
    with pytest.raises(ValueError): policy.load_policy(good)
