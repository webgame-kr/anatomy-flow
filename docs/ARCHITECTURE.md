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

---

# STEP 03-C — 3D Path, Actor & Motion Engine

```
motion-kit.js (조립: Sandbox·Explorer 공용)
 ├ path-engine.js ───────── 경로 데이터 · CatmullRom/직선 곡선 · 호 길이 캐시 · Waypoint/Checkpoint 편집 · 기술 검증 · 표시(레지스트리 밖 overlay)
 ├ actor-manager.js ─────── Actor 기록 + 3D 객체(레지스트리 type 'actor') · 모델별 공유 Geometry/상태별 공유 Material
 ├ motion-controller.js ─── 거리 기반 이동 · Checkpoint 구간 교차 감지 · 분기/순환/전환 · 결과 Promise · session
 ├ motion-commands.js ───── actor_* / path_* / camera_follow 명령 검증·실행 (command-runner의 ctx.motion)
 ├ path-editor.js ───────── 개발자 경로 편집기 + 미리보기 패널 (TransformControls, 핸들 클릭은 capture 단계)
 └ path-geometry-check.js ─ 표본점 ray parity 기하 검사 (버튼으로만, 해부학 검증 아님)
camera-controller.js ────── + startFollow/stopFollow/resumeFollow (follow · first_person), setExtraBounds
command-runner.js ───────── + ctx.motion 위임, wait, results
python-bridge.js ────────── + guard(session): 호출 뒤 장면이 바뀌면 명령을 실행하지 않음
py/scene_commands.py ────── + MOTION 명령 검사, set_paths, route_demo, move_to
py/motion_link.py ───────── 규칙 엔진(game.py) move ↔ 3D 이동 명령 (STEP 03-D용)
```

## 프레임 루프 (STEP 03-C 이후)
`objects.tick` → `kit.tick`(경로 갱신 검사 → Actor 이동) → `camera.tick`(이동 뒤 위치를 추적) → … → `controls.update()` → `render`
- 별도 requestAnimationFrame 루프를 만들지 않는다.
- dt는 viewport가 0.1초로 제한한다.
- Python은 이벤트(버튼, 도착 결과) 때만 부른다.

## 데이터 명세
`docs/development/MOTION_DATA_SPEC.md`

---

# STEP 03-D — Gameplay Integration

```
play.html → js/play/play-main.js (화면 연결)
 ├ play-engine.js ─────── STEP 02 엔진 + 해부학(03-B) + 이동(03-C) 조립. anatomy / sandbox 장면
 ├ gameplay-controller.js 입력 → Python 판정 → 이동 명령 실행·대기 → Python 도착 처리 → 다음 문제
 ├ gameplay-state.js ──── 상태 머신 (loading, ready, waiting_input, checking, transitioning, waiting_choice, paused, completed, error)
 ├ session-manager.js ─── 세션 ID, 학습 시간(일시정지·탭 비활성 제외), 기록 저장(LocalStorage v2)
 ├ learning-mode.js ───── guide / memory / reasoning 노출 정책 (canShowName)
 ├ gameplay-ui.js ─────── 진행 패널, 학습 정보, 문제·피드백, 완료·복습 화면
 └ shared/typing-input.js IME 조합 처리 (STEP v0.1 재사용)
py/lesson.py ─────────── game.py(규칙) + motion_link.py(3D 이동 명령 변환) 묶음 API
py/game.py ───────────── + 힌트, 첫 시도, 이동 취소(cancel_move), 진행률, 기록 v2
py/content_loader.py ─── + version 2 별칭 변환(upgrade), 3D 필드 검사
```

## 정답 한 번의 흐름
1. `submit(text)`: 상태가 checking이 된다.
2. Python `lesson.submit`: 오답이면 waiting 상태로 돌아간다.
3. 정답이면 상태가 transitioning이 된다. command-runner가 이동 명령(wait)을 실행하고, 카메라가 추적한다.
4. 이동 결과를 Python `lesson.arrived`에 보낸다: 이벤트(var, scene) → 도착 초점 → 다음 문제
5. 실패하면 상태가 error가 된다. 재시도나 복구 중에서 고른다.


## 생리 상태 엔진 (STEP 04-C)
- Python(`py/`): `biological_state`(변수·단계·스냅샷·기록) → `formula_engine`(허용 공식, 의존성 순서) → `causal_engine`(방향 전파, 조건·역치·지연·결합 정책) → `feedback_engine`(단계별 되먹임) · `scenario_engine` → `physiology_commands`(JS용 명령, 문맥, begin/commit/rollback, 시각 바인딩 명령 생성).
- `lesson.py`가 학습 흐름에 붙인다: 정답 → begin → 이동 묶음(필수 시각 명령) → arrived → commit / 실패 → rollback.
- JS(`js/physiology/`): `signal-manager`(command-runner의 `signal_emit` 처리, Actor·Path 재사용), `physiology-monitor`(Play 상태·그래프·자유 실험·자동 관찰), `physiology-editor`(Sandbox 편집기). 생리 값은 Python 스냅샷으로만 표시한다.
- Python은 상태가 바뀔 때만 부른다(정답·실험 입력·관찰 시작). 프레임마다 부르지 않는다. 그래프도 상태가 바뀔 때만 다시 그린다.
- 명세: `docs/FLOW_SPEC_v0.1.md` 8장.
