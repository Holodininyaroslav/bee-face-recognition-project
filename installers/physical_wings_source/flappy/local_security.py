"""Loopback-only HTTP boundary. Never expose this development service to a LAN."""
import io
import json
import re
import secrets
import threading
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

MAX_BODY = 8 * 1024 * 1024
TOKEN = secrets.token_urlsafe(32)
JOBS = threading.BoundedSemaphore(2)
CLIENT_SCRIPT = r'''(() => {
  const original = window.fetch.bind(window); let token;
  async function session(refresh = false) {
    if (!token || refresh) token = original('/api/security-token', {cache:'no-store'})
      .then(r => {if (!r.ok) throw Error('Local API security session unavailable'); return r.json();}).then(v => v.token);
    return token;
  }
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== location.origin || /^(GET|HEAD|OPTIONS)$/.test(request.method)) return original(request);
    const saved = request.clone();
    async function authenticated(source, refresh) {
      const headers = new Headers(source.headers); headers.set('X-Local-CSRF', await session(refresh));
      return original(new Request(source, {headers}));
    }
    const response = await authenticated(request, false);
    return response.status === 403 && response.headers.get('X-Local-Token-Expired') === '1'
      ? authenticated(saved, true) : response;
  };
})();'''


def valid_authority(host, port):
    return host in {f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'}


def boundary_error(headers, method, port):
    host = headers.get('Host', '')
    if not valid_authority(host, port):
        return 403, 'Untrusted Host'
    origin = headers.get('Origin')
    if origin is not None and origin != 'http://' + host:
        return 403, 'Cross-origin access denied'
    if headers.get('Sec-Fetch-Site', '') == 'cross-site':
        return 403, 'Cross-site access denied'
    if method not in {'GET', 'HEAD', 'POST', 'OPTIONS'}:
        return 405, 'Method not allowed'
    if method == 'POST':
        if headers.get('Transfer-Encoding'):
            return 400, 'Transfer-Encoding is not supported'
        length = headers.get('Content-Length', '')
        if not re.fullmatch(r'[0-9]{1,9}', length):
            return 411, 'Valid Content-Length required'
        if int(length) > MAX_BODY:
            return 413, 'Request too large'
        if headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            return 415, 'application/json required'
        if not secrets.compare_digest(headers.get('X-Local-CSRF', ''), TOKEN):
            return 403, 'Invalid security token'
    return None


class SecureLocalMixin:
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def parse_request(self):
        if not super().parse_request():
            return False
        for key in ('Host', 'Origin', 'Content-Length', 'Content-Type', 'X-Local-CSRF'):
            if len(self.headers.get_all(key, [])) > 1:
                self.send_error(400, 'Duplicate security header')
                return False
        error = boundary_error(self.headers, self.command, self.server.server_address[1])
        if error:
            code, message = error
            self.send_response(code)
            if message == 'Invalid security token':
                self.send_header('X-Local-Token-Expired', '1')
            self.send_header('Content-Length', '0')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            return False
        return True

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
        super().end_headers()

    def security_get(self):
        path = urlsplit(self.path).path
        if path == '/api/security-token':
            body, mime = json.dumps({'token': TOKEN}).encode(), 'application/json'
        elif path == '/local-api-security.js':
            body, mime = CLIENT_SCRIPT.encode(), 'application/javascript'
        else:
            return False
        self.send_response(200)
        if path == '/api/security-token':
            self.send_header('Set-Cookie', f'MFLSession={TOKEN}; HttpOnly; SameSite=Strict; Path=/')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def do_POST(self):
        if not JOBS.acquire(blocking=False):
            self.send_error(503, 'Calculation slots are busy; retry later')
            return
        try:
            self.handle_post()
        finally:
            JOBS.release()

    def send_head(self):
        root = Path(self.directory).resolve()
        raw = urlsplit(self.path).path
        relative = unquote(raw).lstrip('/')
        parts = relative.split('/')
        if any(part.startswith('.') or ':' in part or '\\' in part for part in parts) or '%' in relative or '\0' in relative:
            self.send_error(404)
            return None
        if not relative or relative.endswith('/'):
            relative += 'index.html'
        # Explicit publication manifest; adding files to the working tree does
        # NOT automatically expose them. Generated research output is private.
        allowed = set(json.loads((root / 'static-files.json').read_text(encoding='utf-8')))
        artifact = re.fullmatch(r'scientific_output/multiquark/[0-9a-f]{12}/(?:manifest\.json|result\.json|multiquark_physics_frontend\.sv|tb_multiquark_physics_frontend\.sv)', relative)
        if artifact:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            session = cookie.get('MFLSession')
            if session and secrets.compare_digest(session.value, TOKEN):
                allowed.add(relative)
        candidate = root / relative
        if relative not in allowed or not candidate.resolve().is_relative_to(root) or not candidate.is_file():
            self.send_error(404)
            return None
        # Reject junctions/symlinks, including ones resolving elsewhere inside root.
        cursor = candidate
        while cursor != root:
            if cursor.is_symlink() or (hasattr(cursor, 'is_junction') and cursor.is_junction()):
                self.send_error(404)
                return None
            cursor = cursor.parent
        if candidate.suffix == '.html':
            content = candidate.read_bytes().replace(b'<head>', b'<head><script src="/local-api-security.js"></script>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            return io.BytesIO(content)
        return super().send_head()


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, *args, **kwargs):
        self._connections = threading.BoundedSemaphore(16)
        super().__init__(*args, **kwargs)

    def process_request(self, request, address):
        if not self._connections.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self._connections.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self._connections.release()
