# FLOW ENGINE v0.1 — 아키텍처와 데이터 명세

## 1. 전체 구조

```
브라우저
 ├─ JavaScript (화면 담당)            ── Pyodide ──  Python (규칙 담당)
 │   main.js        UI 연결·명령 실행                game.py            외부에 공개하는 API
 │   py-bridge.js   Pyodide 로딩·호출                content_loader.py  JSON 구조 검증
 │   render.js      SVG 노드·모델·경로                typing_engine.py   입력 정규화·정답 비교
 │   animation.js   곡선 이동·강조                     flow_engine.py     후보 계산·조건·이벤트·완료
 │   camera.js      확대·축소·드래그·추적              state_engine.py    게임 상태 dict
 │   typing-input.js IME 처리·제출                    record_engine.py   학습 기록·CSV 문자열
 │   records.js     LocalStorage·CSV 다운로드
```

- Python은 화면을 모른다. `submit(text)`, `arrive(edge_id)`를 받으면 **상태(view)**와 **명령(commands) 목록**만 돌려준다.
- JavaScript는 명령을 차례대로 화면에 반영한다. 이동 명령(`move`)은 애니메이션이 끝난 뒤 `arrive(edge_id)`를 호출해서 Python에 도착을 알린다.
- 이동 중에는 Python 상태가 `phase = "moving"`이 되고 그동안의 제출은 `busy`로 거절된다. JS에서도 입력창을 잠근다(이중 잠금).
- 명령마다 고유 번호 `id`가 있다. JS는 실행한 id를 기록해서 같은 명령을 두 번 실행하지 않는다.

## 2. 진행 규칙

1. 시작 직후 `current = None`이고 후보는 시작 노드 하나다. 시작 노드의 용어를 입력하면 이동 없이 바로 활성화된다.
2. 현재 노드에서 나가는 Edge 중 **활성화 조건**과 도착 노드의 **선행 조건(requires)**을 만족하는 것이 후보다.
3. 입력이 어떤 후보 도착 노드의 허용 정답과 같으면 그 Edge로 이동한다. 후보가 여러 개이면 입력한 용어가 분기를 고른다.
4. 도착하면 방문 횟수를 늘리고, 완료 노드 목록에 넣고, 노드의 실행 이벤트를 차례로 실행한 뒤 완료 조건을 검사한다.
5. 오답이면 오답 횟수만 늘고 나머지 상태는 그대로다.
6. 이동 횟수가 `max_steps`(기본 200)에 닿으면 강제로 끝낸다. 순환 구조의 무한 반복을 막는 안전장치다.

## 3. 콘텐츠 JSON

```json
{
  "id": "sequential",
  "title": "1. 순차적 노드 이동",
  "start": "s1",
  "max_steps": 50,
  "options": { "ignore_spaces": false },
  "variables": { "count": 0 },
  "models": [ ... ],
  "paths":  [ ... ],
  "nodes":  [ ... ],
  "edges":  [ ... ],
  "complete": { "node": "s4" }
}
```

| 키 | 필수 | 설명 |
|---|---|---|
| id, title | ○ | 콘텐츠 식별자, 제목 |
| start | ○ | 시작 노드 id |
| nodes, edges | ○ | 아래 표 |
| complete | ○ | 완료 조건 |
| max_steps |  | 최대 이동 횟수 (기본 200) |
| options.ignore_spaces |  | true이면 가운데 공백도 무시하고 비교 (기본 false) |
| variables |  | 게임 상태 변수 초기값 |
| models |  | 화면에 그릴 도형 |
| paths |  | SVG 경로 |

### Node

| 키 | 필수 | 예 | 설명 |
|---|---|---|---|
| id | ○ | `"s1"` | 고유 ID |
| ko | ○ | `"출발"` | 한글 용어 |
| en |  | `"start"` | 영어 용어 |
| answers | ○ | `["출발", "start"]` | 허용 정답 목록 (1개 이상) |
| desc |  | `"..."` | 설명 (입력 힌트로 표시) |
| x, y | ○ | `100, 300` | 좌표 |
| model |  | `"m_pump"` | 연결된 모델 id |
| requires |  | `["s2"]` | 먼저 완료해야 하는 노드 id 목록 |
| events |  | `[...]` | 도착할 때 실행할 이벤트 |

### Edge

| 키 | 필수 | 예 | 설명 |
|---|---|---|---|
| id | ○ | `"e1"` | 고유 ID |
| from, to | ○ | `"s1"`, `"s2"` | 출발·도착 노드 |
| path |  | `"p12"` | SVG 경로 id (없으면 두 노드를 직선으로 잇는다) |
| reverse |  | `true` | 경로를 거꾸로 따라간다 |
| duration |  | `1200` | 이동 시간(ms, 기본 1000) |
| mover |  | `{"shape": "circle", "color": "#e5484d", "size": 9}` | 이동 객체 |
| condition |  | `{"var": "p", "op": ">=", "value": 3}` | 활성화 조건 |

### Model

```json
{ "id": "m_tank", "shape": "rect", "x": 600, "y": 80, "w": 120, "h": 160,
  "color": "#9db4d8", "visible": true, "label": "탱크" }
```
shape: `circle`(x, y, r), `rect`(x, y, w, h), `ellipse`(x, y, rx, ry), `path`(d)

### Path

```json
{ "id": "p12", "d": "M 100 300 C 180 120, 270 120, 350 150" }
```

### 조건 (condition, when, complete.vars)

- 변수 비교: `{"var": "pressure", "op": ">=", "value": 3}` — op는 `== != > >= < <=`
- 방문 여부: `{"visited": "b2"}`
- 리스트로 쓰면 모두 만족해야 한다(AND): `[{...}, {...}]`

### 이벤트 (Node.events)

| type | 필드 | 설명 |
|---|---|---|
| set | var, value | 변수에 값 넣기 |
| add | var, value | 변수에 값 더하기 |
| color | model, color | 모델 색 바꾸기 |
| show / hide | model | 모델 보이기·숨기기 |
| pulse | model | 모델 강조 효과 |
| log | text | 이벤트 로그 남기기 |

모든 이벤트에 `when`(조건)을 붙일 수 있다. 조건을 만족할 때만 실행된다.

### 완료 조건 (complete)

| 키 | 설명 |
|---|---|
| node | 이 노드에 도착해야 한다 |
| visits | node를 이 횟수만큼 방문해야 한다 (순환형) |
| vars | 조건 목록을 모두 만족해야 한다 |

적은 키를 **모두** 만족하면 완료된다.

## 4. 검증 규칙 (content_loader.py)

**오류 (실행하지 않음)**
- 필수 키 누락, 자료형 오류
- 노드·Edge·모델·경로 id 중복
- 존재하지 않는 노드·모델·경로 참조 (start, from, to, path, model, requires, events, visited, complete.node)
- 허용 정답이 비어 있음
- 알 수 없는 이벤트 종류·비교 연산자
- 완료 조건이 비어 있음

**경고 (실행은 함)**
- 시작 노드에서 갈 수 없는 노드
- 나가는 Edge가 없는데 완료 노드도 아닌 노드 (막다른 노드)
- 순환 구조가 있음 → 완료 조건과 max_steps로 끝난다는 안내

## 5. Python → JS 명령 형식

```json
{ "id": 7, "type": "move", "edge": "e1", "from": "s1", "to": "s2",
  "path": "p12", "reverse": false, "duration": 1200, "mover": {...} }
{ "id": 8, "type": "arrive", "node": "s2" }
{ "id": 9, "type": "color", "model": "m_pump", "color": "#e5484d" }
{ "id": 10, "type": "show", "model": "m_alarm" }
{ "id": 11, "type": "var", "var": "pressure", "value": 2 }
{ "id": 12, "type": "log", "text": "..." }
{ "id": 13, "type": "complete", "reason": "goal" }
```

---

## 6. 3D 학습 콘텐츠 (version 2, STEP 03-D)

v0.1 형식은 그대로 쓸 수 있다(`version` 생략 = 1). `"version": 2`이면 3D 필드를 쓰고, 노드의 2D 좌표 `x`, `y`를 요구하지 않는다. 공간 위치는 콘텐츠에 좌표로 적지 않는다. Anchor Manager와 Path Engine이 ID로 찾는다.

파일 위치는 `content/lessons/<계통>/*.json`이고, 목록은 `content/lessons/index.json`에 있다.

### 최상위
| 키 | 설명 |
|---|---|
| version | `2` |
| id, title, content_version, system | 식별자, 제목, 콘텐츠 버전(기록에 남음), 계통 |
| scene | `{type: "anatomy", url}` 해부학 scene.json, 또는 `{type: "sandbox", catalog, scene_id}` 교육용 개념 장면 |
| actor_id | 기본으로 움직일 Actor |
| start, nodes, edges, complete, variables, max_steps, options | v0.1과 같음 |
| verification_note, source | 검증 상태와 출처 안내 (화면에 표시) |

### 별칭 (요구서 필드 이름)
`content_loader.upgrade()`가 아래 이름을 v0.1 이름으로 바꾼다. 원본 dict는 바꾸지 않는다.

| 3D 이름 | v0.1 이름 |
|---|---|
| node_id | id |
| name_ko, name_en | ko, en |
| accepted_answers | answers |
| prerequisites | requires |
| edge_id | id |
| source_node, target_node | from, to |
| conditions | condition |
| path_id | path |
| 이벤트 `set_variable` | `set` |

### Node (추가 필드)
| 키 | 설명 |
|---|---|
| prompt | 가이드·암기 모드 질문 |
| reason_prompt | 기전 추론 모드 질문 (없으면 prompt) |
| explanation | 도착 후 설명 |
| hint | 힌트 (힌트 횟수로 기록) |
| anatomical_id | 해부학 레지스트리 구조 (초점, 강조, 라벨 숨김에 씀) |
| anchor_id | 관련 Anchor |
| checkpoint_id | 이 노드에 도착했을 때 Actor가 있을 Checkpoint (복구 위치) |
| scene_id, source | 장면, 출처 |
| verification_status | 3D 표현 상태. `VERIFIED`, `APPROXIMATE`, `PENDING`, `CONCEPT`, `TEST`, (STEP 04-A) `GEOMETRY_CHECKED`, `ANATOMY_REVIEWED`, `CONCEPTUAL` 중 하나 |
| lecture_check | (STEP 04-A, 선택) 강의자료 대조 결과 `{status: MATCH\|PARTIAL, refs: [쪽 번호], unconfirmed: [...], date}`. 3D 상태와 별개다. 원문은 적지 않는다. |
| revisit | 순환으로 다시 온 노드 처리. `relearn`(기본)은 새 학습 시점으로 첫 시도 통계에 넣고, `review`는 복습으로 첫 시도 통계에서 뺀다. 어느 쪽이든 다시 입력해야 한다. |

### Edge (추가 필드)
| 키 | 설명 |
|---|---|
| path_id | 이동 경로 |
| checkpoint_id | 도착 Checkpoint. 없으면 도착 노드의 checkpoint_id를 쓴다. 같은 노드에 여러 경로로 들어올 때 쓴다(예: 하대정맥 → 우심방). |
| actor_id | 이 Edge에서 움직일 Actor (없으면 콘텐츠 actor_id) |
| transition_type | `move`(기본)는 경로를 따라 이동한다. `jump`는 이동 없이 바로 도착한다. jump는 Checkpoint가 있으면 그 위치에 놓고, 없으면 그대로 둔다. 3D 경로가 없는 PENDING 구간에 쓴다. `scene`(STEP 04-A)은 스케일 장면을 바꾼다(아래 표). |
| pre_checkpoint_id | (scene) 장면을 바꾸기 전에 지금 장면에서 이동할 Checkpoint |
| scale | (scene) `{level, scene_id, checkpoint_id}`. level은 `BODY`, `ORGAN`, `TISSUE`, `CELL`, `MOLECULAR` 중 하나. 같은 Actor를 새 장면의 checkpoint_id에 놓는다. Edge의 checkpoint_id가 있고 그것과 다르면 새 장면에서 거기까지 이동한다. |
| events | 도착할 때 노드 이벤트보다 먼저 실행 |

### 3D 이벤트
```json
{ "type": "scene", "command": { "action": "actor_set_state", "target": "rbc_01", "value": { "oxygenation": "oxygenated" } },
  "mode": "parallel", "required": false }
```
- `command`: STEP 02·03-C 명령(`set_color`, `highlight`, `camera_focus`, `actor_*` 등). Python이 이름을 검사한다.
- `mode`:
  - `sequential`: 끝날 때까지 기다린다. 최대 8초를 기다리고, 넘으면 기다리지 않고 진행한다.
  - `parallel`(기본): 기다리지 않는다.
- `required: true`: 실패하면 진행을 멈춘다. false면 장식용으로 보고 실패를 기록만 한다.
- 반복 박동이나 입자처럼 끝나지 않는 연출은 parallel로 둔다.

### 스케일 전환 (STEP 04-A)
- motion_link가 scene Edge를 다음 명령으로 바꾼다.
  1. `actor_move_to_checkpoint`(pre_checkpoint_id, 있을 때)
  2. `scale_change` `{target, level, scene_id, checkpoint_id, duration, wait: true}`
  3. `actor_move_to_checkpoint`(Edge checkpoint_id, 전환 위치와 다를 때)
- JS `js/scale/scale-manager.js`가 페이드 → 장면 교체 → 같은 Actor 배치(표시 크기만 장면 값으로) → 카메라 순으로 실행한다.
- 유지되는 것: 학습 세션, 노드, Actor ID, biological_state, 정답·오답 기록, 진행. 학습 상태는 Python에 있다.
- 기다린 명령이 취소되면 같은 묶음의 나머지 명령(예: 이동 뒤 전환)은 실행하지 않는다. 결과는 cancelled → 재시도·복구
- 복구할 Checkpoint가 다른 장면에 있으면 그 장면으로 먼저 즉시 전환한다.
- 일시정지 중에는 전환 단계 사이에서 기다리고, 일시정지 중에 시작된 이동은 멈춘 채로 시작한다.

### 진행과 이동 (lesson.py)
1. JS가 `lesson.submit(text)`를 부르면 Python이 판정한다.
   - 오답이면 현재 노드와 Actor 위치를 그대로 둔다.
   - 정답이면 이동 명령(`actor_move_to_checkpoint` 또는 `actor_place_at_checkpoint`, `wait: true`)을 돌려준다. 이때 규칙 엔진은 `moving` 상태다.
2. JS가 이동을 실행한다. 끝나면 `lesson.arrived(status)`를 부른다.
   - `arrived` 또는 `completed`: `game.arrive()` → Edge 이벤트 → 노드 이벤트 → 완료 검사
   - `failed` 또는 `cancelled`: 규칙 엔진은 `moving` 상태로 남는다.
     - `lesson.retry()`: 같은 이동을 다시 한다.
     - `lesson.recover()`: 마지막 정상 노드와 그 Checkpoint로 되돌린다.
   - 시각적 이동이 실패하면 학습을 진행 처리하지 않는다.
3. 순환
   - `laps`: 이미 지난 Edge를 다시 지난 횟수(순환 이동 횟수)
   - `visits`: 노드 방문 횟수
   - 둘을 따로 센다.
4. 진행률
   - 진행률 = 완료한 노드 수 / (완료한 노드 수 + 현재 노드에서 완료 노드까지 최소 Edge 수)
   - 고르지 않은 분기 경로는 분모에 들어가지 않는다.

### 기록 (record_engine.make_record_v2)
- 필드: session_id, content_id, content_version, learning_mode, start_time, end_time, active_learning_time, correct_count, wrong_count, first_attempt_correct_count, question_count, hint_count, completed_nodes, attempted_answers, completion_status, wrong_nodes
- 정답률 정의
  - **전체 시도 정답률** = 정답 제출 수 / (정답 제출 수 + 오답 제출 수). 빈 입력은 세지 않는다.
  - **첫 시도 정답률** = 오답 없이 맞힌 문제 수 / 맞힌 문제 수
    - `revisit: review` 노드를 다시 맞힌 것은 분모와 분자에서 뺀다.
    - 힌트를 봤어도 오답이 없으면 첫 시도로 센다. 힌트 사용은 따로 기록한다.
    - 이동 실패를 복구한 뒤 같은 문제를 다시 맞히면 새 문제로 센다.
- `active_learning_time`: 일시정지와 탭이 비활성인 시간을 뺀 학습 시간
- 저장
  - LocalStorage 키 `nurseflow.records.v2`, 최대 500개
  - v0.1 기록(`flowengine.records.v1`)은 읽기만 한다. CSV로 내보낼 때 `from_v1()`이 v2 열에 맞춘다.

### 3D 연결 검증 (JS, 불러올 때)
- 오류
  - Node ID·Edge ID 중복
  - 없는 해부학 구조, Anchor, Path, Checkpoint, Actor
  - `move` Edge인데 Path와 Checkpoint가 모두 없음
  - `scene` Edge의 없는 스케일 장면, 수준 불일치, 없는 Checkpoint(pre_checkpoint_id, scale.checkpoint_id)
  - scene 이벤트의 없는 Actor
- 경고
  - 모델이 없는(MISSING) 구조
  - 노드는 VERIFIED인데 경로는 검증되지 않음
- 규칙 검증(Python `content_loader`): 시작 노드, 정답, 완료 조건, 순환 경고, 지원하지 않는 이벤트·전환·검증 상태·버전
- 오류가 하나라도 있으면 그 콘텐츠는 시작하지 않는다. 엔진과 다른 콘텐츠는 계속 쓸 수 있다.

## 7. 애니메이션 데이터 (STEP 04-B)
파일은 `content/animations/*.json`이다. JS `js/animation/animation-kit.js`가 불러온다. 학습 콘텐츠는 `scene.animations`(파일 경로)와 `scene.start_scale`(시작 장면)로 연결한다.

### 단위
- 시간은 ms다. `keyframes[].time`은 재생시간에 대한 비율(0~1)이다.
- 위치는 m, 회전은 도(°), Morph 가중치는 0~1, 관 반지름은 배율(1 = 기준)이다.
- 개념 모델의 시간·크기·배율은 교육용 값이다. 실제 생리 수치가 아니며, 파일의 `notes`·`verification_status`에 그렇게 적는다.

### 최상위
| 키 | 설명 |
|---|---|
| groups | 개념·시험 모델 정의 (`concept-model-builder.js`): `{group_id, origin, backdrop, verification_status, objects: [{id, shape: ellipsoid\|sphere\|leaflets\|tube\|box, morphs, logical_id, …}]}` |
| animations | 애니메이션 정의 (아래) |
| structures | 구조 상태 정의 (판막·혈관 등) |
| timelines | 타임라인 정의 |
| transitions | 모델 전환 정의 `{logical_id, variants: {상태: 객체 ID}, initial}` |
| phases | (선택) 단계 표시 정보: 이름, 심방·심실 상태, 판막, 혈액 이동, 압력 관계, 심음, 강의 근거 쪽, `visual_state`, `end_state` |
| motion | (선택) 이 장면의 경로·Actor (MOTION_DATA_SPEC 형식) |
| scale_scene | (선택) 스케일 장면 등록 정보 (Play에서 `start_scale`로 전환) |

### animations[]
```json
{ "animation_id": "cc.lv.contract", "target_id": "cc.lv", "animation_type": "morph", "morph_target": "contract",
  "duration_ms": 700, "loop": false, "playback_rate": 1, "easing": "ease_in_out",
  "keyframes": [{ "time": 0, "value": 0 }, { "time": 1, "value": 1 }],
  "initial_state": null, "final_state": null, "restore_on_cancel": true,
  "verification_status": "CONCEPTUAL", "source": "", "notes": "" }
```
| animation_type | value 형식 | 대상 |
|---|---|---|
| transform | `{position:[m], rotation:[도], scale:배 또는 [x,y,z]}` | 레지스트리 객체 |
| morph | 숫자(`morph_target` 가중치) 또는 `{이름: 가중치}`(혼합) | Morph Target이 있는 Mesh |
| clip | (없음) `clip_name`의 GLB AnimationClip 시간을 직접 맞춘다 | GLB 모델 루트 ID |
| material | `{color:'#rrggbb', opacity, highlight}` | material-controller 상태 층 |
| visibility | `{opacity, visible}` | 등장·사라짐 |
| deform | 숫자(관 반지름 배율) | deformation-controller 관 |
| procedural | `procedure`: `pulse`(크기 맥동), `morph_cycle`, `deform_cycle`. `params.period_ms` 등 | 반복 장식 |

- `loop`: `false` 또는 0이면 한 번만, 숫자면 그만큼 더 반복, `true`면 끝없이 반복한다.
- 같은 animation_id를 다시 재생하면 이전 재생은 `cancelled(replaced)`로 끝난다. 그래서 반복이 쌓이지 않는다.
- `restore_on_cancel`(기본 true): 취소·정지하면 시작 전 상태(Transform, Morph, 재질 상태 층, 반지름)로 되돌린다.
- 대상 객체가 사라지면 그 재생은 `failed`가 된다.

### structures[] (구조 상태)
```json
{ "structure_id": "valve.mitral", "states": ["CLOSED", "OPENING", "OPEN", "CLOSING"], "initial": "CLOSED",
  "transitions": { "CLOSED->OPEN": { "via": "OPENING", "animation": "valve.mitral.open" } },
  "indicators": [{ "target": "cv.valve.mitral", "state_colors": { "OPEN": "#3cb371", "CLOSED": "#8a8f9c" } }] }
```
- 전환 중에는 `via` 상태(예: OPENING)를 보여 준다. 애니메이션이 끝나면 목표 상태가 된다.
- 전환이 취소되면 이전 상태로 돌아간다.
- `indicators`는 상태를 색으로 표시한다. 실제 모델(BodyParts3D 판막)은 움직일 수 없어 이 표시만 한다. 이 색을 판막이 실제로 움직이는 모습이라고 설명하지 않는다.

### timelines[]
| 단계 type | 필드 | 뜻 |
|---|---|---|
| animation | animation_id, wait(기본 true), speed, loop | 애니메이션 재생. `wait:false`면 기다리지 않는다(Non-blocking 장식) |
| state | set: {구조ID: 상태}, wait, instant | 구조 상태 바꾸기 |
| command | command, wait, through: [구조ID] | 명령 실행(Actor 이동 등). `through`의 구조가 하나라도 OPEN이 아니면 실행하지 않고 실패한다(닫힌 판막 통과 방지) |
| delay | ms | 지연 |
| parallel / sequence | steps | 동시에 / 순서대로 |
| repeat | count, steps | 반복 |
| if | when {structure, equals} 또는 {phase, equals}, then, else | 보이는 상태 조건. 학습 규칙 조건은 Python edge condition을 쓴다 |
| marker | name, phase, label | 중간 이벤트(화면 표시) |

- `blocking: true` 타임라인은 끝까지 기다린다. 실패·취소되면 결과가 그대로 돌아간다.
- `restore_on_cancel`(기본 true): 실패·취소되면 시작 전 구조 상태로 되돌린다.
- 일시정지(`pauseAll`) 중에는 지연과 애니메이션이 모두 멈춘다. `cancelAll` 뒤에는 남은 단계를 실행하지 않는다(session).

### 학습 콘텐츠와 연결
- **Edge `timeline_id`**
  - 정답이면 motion_link가 이동 명령 뒤에 `{action: 'timeline_play', target, wait: true}`를 붙인다.
  - JS는 타임라인이 끝나야 `lesson.arrived('completed')`를 부른다.
  - 실패하거나 취소되면 진행하지 않는다. 다음 단계는 재시도(`retry`)나 복구(`recover`)다.
- **Node `visual_state`**: `{구조ID: 상태}`. `lesson.recover`가 이 값을 돌려주고, JS는 그 단계의 모양(판막·형태·Actor 위치)으로 즉시 맞춘다.
- **최상위 `initial_visual_state`, `variable_labels`**: 시작·재시작 때의 구조 상태, 화면 변수 이름
- **Non-blocking 장식**
  - 노드 이벤트 `{type:'scene', mode:'parallel', command:{action:'animation_play', …}}`를 쓰거나, 타임라인 안에서 `wait:false`로 넣는다.
  - 끝나지 않아도 학습은 진행된다.

### 애니메이션 명령 (Python `scene_commands.ANIMATION`, JS `animation-commands.js`)
- 명령 목록: `animation_play|pause|resume|stop|seek|set_speed|set_loop|set_weight`, `morph_set_value`, `morph_transition`, `timeline_play|pause|resume|cancel`, `set_biological_visual_state`, `model_transition`
- Python은 `set_animations()`로 받은 ID 목록을 보고 검사한다. JS도 실행 전에 다시 검사한다.
- 잘못된 명령은 실패 결과만 남긴다. 다음 명령은 계속 실행한다.

### 변형과 경로·Anchor
- Object-local Anchor와 `object_local` 경로 점은 객체 Transform만 따라간다. Morph로 바뀐 Mesh 모양은 따라가지 않는다.
- 변형을 따라가야 하는 점은 `{space:'mesh_vertex', object_id, vertex_index}`로 적는다. Morph 가중치가 바뀌면 곡선을 다시 계산한다.
- 혈관 수축·확장(deform)은 중심선을 유지하고 반지름만 바꾼다. 같은 중심선 위의 경로와 Actor는 그대로다.

## 8. 생리 상태 모델 (STEP 04-C)
교육용 계산·단순화 모델이다. 실제 환자의 생리 반응을 예측하지 않는다. 기준 파일: `content/physiology/cardiovascular-model.json`(생성기 `tools/content/make_physiology_model.py`). 엔진: `py/biological_state.py`, `formula_engine.py`, `causal_engine.py`, `feedback_engine.py`, `scenario_engine.py`, `physiology_commands.py`.

### 8.1 변수 (`variables`)
| 필드 | 뜻 |
|---|---|
| `variable_id`, `name_ko`, `name_en` | ID와 이름 |
| `data_type` | `number`(수치), `computed`(계산 결과, 공식만 씀), `relative`(상대 단계 -2~2), `activation`(ACTIVE/INACTIVE), `boolean`, `category` |
| `unit`, `baseline`, `allowed_range` | 단위, 기준값, 입력 검사 범위(정상 범위가 아님) |
| `normal_range` | 참고 범위 (표시용) |
| `source`, `verification_status` | 근거(강의 쪽 번호·공개 자료)와 상태: `LECTURE_CHECKED`, `PUBLIC_REFERENCE`, `EDUCATIONAL_VALUE`, `CONCEPTUAL`, `PENDING_REVIEW`, `TECH_TESTED`, `NEEDS_*_REVIEW`, `EXPERT_REVIEWED`(사람만) |
| `value_kind` | `input`, `calculated`, `derived`(다른 기준값에서 유도), `relative`, `activation` |

- 상대 단계: -2 크게 감소, -1 감소, 0 기준, 1 증가, 2 크게 증가, `UNKNOWN`(판단 불가), `MIXED`(반대 원인).
- 수치 변수도 `trend`(방향 단계)를 가진다. 인과관계는 크기 근거가 없으면 숫자를 바꾸지 않고 `trend`만 바꾼다.

### 8.2 공식 (`formulas`)
`{formula_id, output, function, inputs: {매개변수: 변수}, input_units, output_unit, round, mode_group, mode, run, source}`
- `function`은 허용 목록만: `cardiac_output`(HR × SV ÷ 1000), `stroke_volume`, `ejection_fraction`, `pulse_pressure`, `map_estimate`(DBP + PP/3), `map_hemodynamic`(CO × SVR + CVP), `svr_from_map_co`. 문자열 수식은 없다.
- 같은 결과를 내는 공식은 `mode_group`으로 묶고 하나만 켠다(`formula_modes`). MAP: `pressure_estimate` / `hemodynamic`.
- `run: "baseline"`: 기준값 유도 전용(예: SVR = MAP ÷ CO).
- 오류: 입력 누락, 숫자 아님·NaN·무한대, 단위 불일치, 0으로 나누기, 음수 용적(ESV > EDV), 비정상 관계(SBP < DBP), 순환 의존성.

### 8.3 인과관계 (`causal`)
`{causal_id, source_variable, target_variable, direction: increase|decrease, relationship_type, conditions, threshold, delay, priority, dominant, mechanism, timescale, out_of_range, magnitude, source, verification_status, notes}`
- `relationship_type`: positive, negative, activation, inhibition, conditional, threshold, multi_condition, parallel, formula_direction.
- `conditions`: `[{var, op, level}]`(상대 단계) 또는 `[{var, op, value}]`(값). 맞지 않으면 적용하지 않고, `out_of_range: "unknown"`이면 결과를 `UNKNOWN`으로.
- `threshold`: `{var, op, value}` — 값이 역치를 넘을 때만.
- `delay`: 물리 시간 단위(정수). 같은 시간에 바뀌는 변수는 병렬 반응이다.
- 결합 정책: 같은 방향 원인은 가장 큰 단계 하나(더하지 않음). 반대 방향은 `dominant`인 최고 우선 관계가 있을 때만 그쪽, 아니면 `MIXED`(더 전하지 않음).
- 일반 인과관계 그래프는 순환이 없어야 한다. 되먹임은 8.4로 정의한다.
- `mechanism`: 실행 때 넘기는 기전 목록에 있는 관계만 적용한다(`core`도 명시). 학습 단계를 하나씩 보여 줄 때 쓴다.

### 8.4 되먹임 (`feedback`)
`{loop_id, loop_type: negative|positive, sensed_variable, setpoint: {level}|{range}, sensor_variable, sensor_direction, mechanism, also_mechanisms, delay, timescale, max_iterations(1~50), limits: [{when, cap_level, reason}], stop: [조건]}`
- 한 번 부를 때 한 단계: 설정점에서 벗어난 정도 → 수용체 → 인과 전파 → 감지 변수의 회복(또는 강화) 방향 기록.
- 끝: `within_setpoint`, `plateau`(변화 없음·제한), `max_iterations`, `stop_condition`, `undetermined`. 여러 고리는 물리 시간 순서로 번갈아(결정적) 실행하고 총 반복 수를 제한한다.
- `limits`: 원인이 남아 있으면 감지 변수가 기준까지 가지 못한다(무조건 정상화하지 않음).

### 8.5 수용체·신호·시각 바인딩·시나리오
- `receptors`: `{receptor_id, variable(activation), ligand, anatomical_location, target_variables, downstream_effects, mechanisms, source}`.
- `signals`: `{signal_id, signal_type(neural_afferent|neural_efferent|hormone|enzyme|neurotransmitter|paracrine|electrical), source_structure, target_structure, path_id, from_checkpoint, to_checkpoint, signal_direction, actor_id, receptor_id, visual_style, educational_scale, duration_ms}`.
- `visual_bindings`(상태 → 시각, 한 방향): `animation_speed`(mode ratio|level|auto, map, weight_variable, weight_map), `morph`, `structure_state`, `material`, `signal`(when: change|increase|decrease). 명령은 Python이 만들고 JS command-runner가 실행한다.
- `scenarios`: `{scenario_id, initial_state, trigger, available_mechanisms, expected_response, learning_objectives, completion_condition, source, limitations}`.

### 8.6 학습 콘텐츠 연결 (version 2 확장)
- 콘텐츠 최상위 `physiology`: `{model, context, scenario, monitor, graph, experiment: {inputs, outputs, note}, observe: {scenarios, loops}, mechanism_note}`.
- Edge `physiology`: `{"ops": [...]}` — 정답 뒤 생리 변화. op: `causal_apply{changes, mechanisms}`, `feedback_step{loop_id}`, `feedback_run{loop_ids}`, `signal_emit`, `receptor_activate`, `state_set`, `state_update`, `scenario_start`, `set_formula_mode`.
  - 실행 흐름: 정답 → `begin`(확정 전 계산, 시각 명령을 이동 묶음에 넣음) → 필수 명령 완료 → `lesson.arrived` → `commit`. 실패·취소·복구 → `rollback`(이전 정상 상태). 같은 Edge 방문은 한 번만 확정한다.
- Edge `physiology_hide`: 암기·추론 모드에서 제출 전 상태 모니터가 숨길 변수.
- 물질 이동 Actor 없이 상태만 바뀌는 단계는 `transition_type: "jump"`로 쓴다.
- 문맥: `mechanism`(학습, 정답으로만 바뀜) · `experiment`(자유 실험) · `observe`(자동 관찰). 상태·기록을 따로 둔다.
