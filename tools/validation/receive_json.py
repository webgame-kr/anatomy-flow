# 개발 도구 (수업 범위 밖): 브라우저 개발 도구가 만든 JSON을 tools/out/ 에 저장하는 localhost 전용 수신기
# 실행: python tools/validation/receive_json.py 8774
# 사용(브라우저 콘솔): fetch('http://127.0.0.1:8774/save?name=branch-paths', {method: 'POST', body: JSON.stringify(data)})
# - 127.0.0.1에만 묶는다. 파일 이름은 영문·숫자·-_ 만 허용하고 tools/out/browser/ 밖으로 쓰지 않는다.
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tools', 'out', 'browser')
MAX = 20 * 1024 * 1024


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b'receive_json ok')

    def do_POST(self):
        u = urlparse(self.path)
        name = (parse_qs(u.query).get('name') or [''])[0]
        n = int(self.headers.get('Content-Length') or 0)
        if u.path != '/save' or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', name) or n <= 0 or n > MAX:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        body = self.rfile.read(n)
        json.loads(body.decode('utf-8'))      # JSON이 아니면 오류로 끝난다
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, name + '.json')
        with open(path, 'wb') as f:
            f.write(body)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps({'saved': path, 'bytes': n}).encode('utf-8'))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8774
    print('receive_json on 127.0.0.1:{} -> {}'.format(port, OUT), flush=True)
    HTTPServer(('127.0.0.1', port), H).serve_forever()
