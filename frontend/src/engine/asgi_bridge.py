"""Runs the unchanged FastAPI app inside Pyodide: one ASGI HTTP call per request, no server."""
import asyncio
import json
import sys

ENGINE_ROOT = '/home/pyodide/engine'
# Vendored pure-Python packages first (anyio gets typing-extensions 4.16.0), then the backend.
sys.path[:0] = [f'{ENGINE_ROOT}/vendor', f'{ENGINE_ROOT}/backend']

from app.main import app  # noqa: E402


async def dispatch(method, path, query, headers_json, body):
    headers = json.loads(headers_json)
    payload = body.encode('utf-8')
    scope = {
        'type': 'http',
        'asgi': {'version': '3.0', 'spec_version': '2.3'},
        'http_version': '1.1',
        'method': method,
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode('utf-8'),
        'root_path': '',
        'query_string': query.encode('latin-1'),
        'headers': [(name.lower().encode('latin-1'), value.encode('latin-1')) for name, value in headers.items()],
        'client': ('127.0.0.1', 0),
        'server': ('127.0.0.1', 80),
    }
    done = asyncio.get_running_loop().create_future()
    request_sent = False
    status = 500
    response_headers = []
    chunks = []

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {'type': 'http.request', 'body': payload, 'more_body': False}
        # Disconnect only after the response is complete, so the app never sees a premature disconnect.
        await done
        return {'type': 'http.disconnect'}

    async def send(message):
        nonlocal status, response_headers
        if message['type'] == 'http.response.start':
            status = message['status']
            response_headers = [[name.decode('latin-1'), value.decode('latin-1')] for name, value in message.get('headers', [])]
        elif message['type'] == 'http.response.body':
            chunks.append(message.get('body', b''))
            if not message.get('more_body', False) and not done.done():
                done.set_result(None)

    try:
        await app(scope, receive, send)
    finally:
        if not done.done():
            done.set_result(None)
    return status, response_headers, b''.join(chunks)
