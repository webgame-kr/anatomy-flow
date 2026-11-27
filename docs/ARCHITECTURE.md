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

---

# STEP 02 — 3D Object Management & Camera System

```
main.js (조립)
 ├ viewport.js ─────────── renderer · scene · camera · OrbitControls · 루프(onFrame) · 컨텍스트 손실
 ├ resource-tracker.js ─── Geometry/Material/Texture 참조 수 (0일 때만 dispose)
 ├ object-registry.js ──── ID ↔ Object3D, 부모/자식, info(), snapshot(), resolvePick()
 │   ├ object-manager.js ─ 기본 도형·그룹 생성, 변환 보간, whenSettled()
 │   └ model-loader.js ─── GLTFLoader(+Draco/Meshopt), 진행률, 구조 분석, 로컬 파일 세트
 ├ material-controller.js  상태 색·투명도 | 강조 | 격리·고스트 | 단면  (Mesh별 복제 재질)
 ├ selection-controller.js Hover · 클릭(드래그 구분) · 선택 상자
 ├ camera-controller.js ── focus · overview · preset · animateTo · setFollowTarget
 ├ clipping-controller.js  X/Y/Z 평면, 전체/선택 범위, 반전
 ├ scene-manager.js ────── scenes.json → 생성/전환/초기화/이전 장면 (토큰으로 늦은 로딩 무시)
 ├ command-runner.js ───── op(STEP 01) + action(STEP 02) 검증·실행
 └ python-bridge.js ────── py-client(Worker) 호출 → command-runner
```

## 프레임 루프 (렌더링마다)
`objects.tick(dt)` 보간 → `camera.tick(dt)` 카메라 이동·추적 → `selection.tick()` 선택 상자 → `controls.update()` → `render`
Python은 루프에서 부르지 않는다.

## Worker 호출 이름
`"모듈.함수"` 형식이다(예: `scene_commands.demo`). 모듈 없이 부르면 STEP 01의 `sandbox3d`로 본다.
배열과 객체 인자는 Worker에서 `py.toPy`로 Python list/dict로 바꾼다.

## 장면 정의 (content/sandbox/scenes.json)
`scene_id, scene_name, coordinate_system{up, front, unit}, camera_defaults{position, target, fov}, lighting(studio|soft), background, materials{공유 재질}, groups[], objects[], assets[{asset_id, position, fit{size}, optional}], default_visible_objects, python(step01|commands)`
자산 URL과 공개 여부는 상위 `assets{}`에 둔다. 공개하지 않는 자산(`public: false`)은 배포본에 없으므로 `optional: true`로 둔다.
