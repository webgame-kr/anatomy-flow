# NURSE FLOW 3D — 아키텍처 (STEP 01)

```
메인 스레드 (화면)                                   Web Worker (게임 로직)
┌─────────────────────────────────────────┐      ┌──────────────────────────────┐
│ main.js            Sandbox UI 연결        │      │ py-worker.js                 │
│  ├ engine/viewport.js                    │      │  └ Pyodide 0.26.4            │
│  │   Scene·Renderer·Camera·Light·Helper   │ msg  │      └ py/sandbox3d.py        │
│  │   OrbitControls·반응형·렌더링 루프·선택   │◀────▶│         (dict·list 상태,      │
│  ├ engine/object-manager.js              │      │          명령 리스트 생성)      │
│  │   ID로 생성·변경·제거, 보간(tween)         │      └──────────────────────────────┘
│  ├ engine/command-runner.js              │
│  │   Python 명령 → 객체 관리 모듈 호출       │
│  └ python/py-client.js                   │
│      Worker 시작·Promise 호출·시간 초과      │
└─────────────────────────────────────────┘
```

## 원칙
1. **Python은 Three.js를 모른다.** `sandbox3d.py`는 객체 상태(dict)를 관리하고 명령 리스트를 돌려줄 뿐이다.
2. **Three.js Mesh는 `object-manager.js`만 만진다.** 다른 모듈은 ID로 요청한다.
3. **Python은 이벤트 때만 호출한다.** 버튼, 입력 같은 이벤트 때만 부르고 렌더링 프레임마다 부르지 않는다. 프레임별 보간은 JS가 맡는다(`duration`).
4. **좌표는 `[x, y, z]` 리스트, 회전은 도(degree) 단위다.** Y축이 위쪽이다.
5. **명령에는 고유 `id`가 있다.** `command-runner`는 같은 명령을 두 번 실행하지 않는다.
6. **Python 상태와 3D 장면은 매 호출 후 대조한다.** 객체 ID 목록이 다르면 로그에 오류를 남긴다.

## Worker 메시지

| 방향 | type | 내용 |
|---|---|---|
| main → worker | `init` | pyodideBase, pyBase, files |
| main → worker | `call` | id, fn, args |
| worker → main | `status` | 로딩 문구 |
| worker → main | `ready` | python, pyodide 버전, ping 결과 |
| worker → main | `init-error` | kind(cdn, engine, python), detail |
| worker → main | `result` | id, ok, value 또는 error |

Worker는 허용 목록(`ALLOWED`)에 있는 함수만 실행한다.

## Python → JS 명령

```json
{ "id": 1, "op": "clear",  "target": null }
{ "id": 2, "op": "create", "target": "box-1",
  "object": { "id": "box-1", "kind": "box", "name": "정육면체",
              "position": [-2.5, 0.5, 0], "rotation": [0, 0, 0],
              "scale": 1.0, "color": "#e5484d", "visible": true } }
{ "id": 5, "op": "update", "target": "box-1", "position": [-1.5, 0.5, 0], "duration": 400 }
{ "id": 6, "op": "update", "target": "box-1", "color": "#46a758", "duration": 0 }
{ "id": 7, "op": "remove", "target": "box-1" }
```

Python 함수의 반환값은 항상 `{ ok, commands, objects, message }` 형식이다.

## 다음 단계에서 붙일 자리
- **GLB 모델:** `object-manager`에 `kind: 'model'`을 추가하고 GLTFLoader를 쓴다.
- **3차원 경로:** `engine/path3d.js`(CatmullRomCurve3)를 만들고 Python은 경로 ID와 시간만 보낸다.
- **카메라 추적:** `viewport.controls.target`을 보간한다.
- **단면 관찰:** `renderer.localClippingEnabled`를 켜고 재질에 clippingPlanes를 준다.
- **타이핑·진행 규칙:** 보존한 `py/flow_engine.py` 등을 Worker에 함께 싣는다.
