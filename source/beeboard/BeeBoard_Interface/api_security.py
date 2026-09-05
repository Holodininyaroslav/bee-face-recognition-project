"""ASGI loopback boundary, bounded bodies, and explicit same-origin sessions."""
import asyncio
import json
from local_security import TOKEN, CLIENT_SCRIPT, MAX_BODY, boundary_error


class LocalSecurityMiddleware:
    def __init__(self, app):
        self.app = app
        self.active_jobs = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        pairs = scope.get('headers', [])
        headers = {key.decode().title(): value.decode('latin-1') for key, value in pairs}
        method = scope['method']
        error = None
        for key in (b'host', b'origin', b'content-length', b'content-type', b'x-local-csrf'):
            if sum(k.lower() == key for k, _ in pairs) > 1:
                error = (400, 'Duplicate security header')
        # Canonical casing for the shared, case-sensitive mapping.
        for canonical in ('X-Local-CSRF', 'Sec-Fetch-Site'):
            headers[canonical] = headers.get(canonical.title(), '')
        port = scope.get('server', ('127.0.0.1', 8877))[1]
        error = error or boundary_error(headers, method, port)

        async def reply(status, body=b'', content_type=b'application/json', extra=()):
            await send({'type':'http.response.start', 'status':status, 'headers':[
                (b'content-type',content_type), (b'content-length', str(len(body)).encode()),
                (b'cache-control',b'no-store'), (b'x-content-type-options',b'nosniff'), *extra]})
            await send({'type':'http.response.body','body':body})
        if error:
            extra = [(b'x-local-token-expired', b'1')] if error[1] == 'Invalid security token' else []
            return await reply(error[0], extra=extra)
        if method == 'GET' and scope['path'] == '/api/security-token':
            return await reply(200, json.dumps({'token':TOKEN}).encode())
        if method == 'GET' and scope['path'] == '/local-api-security.js':
            return await reply(200, CLIENT_SCRIPT.encode(), b'application/javascript')
        payload = bytearray()
        if method == 'POST':
            if self.active_jobs >= 2:
                return await reply(503)
            self.active_jobs += 1
            try:
                while True:
                    event = await asyncio.wait_for(receive(), 15)
                    if event['type'] == 'http.disconnect':
                        return
                    payload.extend(event.get('body', b''))
                    if len(payload) > MAX_BODY:
                        return await reply(413)
                    if not event.get('more_body', False):
                        break
                if len(payload) != int(headers['Content-Length']):
                    return await reply(400)
                async def buffered_receive():
                    return {'type':'http.request', 'body':bytes(payload), 'more_body':False}
                await self.app(scope, buffered_receive, send)
            except asyncio.TimeoutError:
                await reply(408)
            finally:
                self.active_jobs -= 1
        else:
            await self.app(scope, receive, send)
