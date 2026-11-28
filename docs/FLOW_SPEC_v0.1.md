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
| verification_status | `VERIFIED`, `APPROXIMATE`, `PENDING`, `CONCEPT`, `TEST` 중 하나 |
| revisit | 순환으로 다시 온 노드 처리. `relearn`(기본)은 새 학습 시점으로 첫 시도 통계에 넣고, `review`는 복습으로 첫 시도 통계에서 뺀다. 어느 쪽이든 다시 입력해야 한다. |

### Edge (추가 필드)
| 키 | 설명 |
|---|---|
| path_id | 이동 경로 |
| checkpoint_id | 도착 Checkpoint. 없으면 도착 노드의 checkpoint_id를 쓴다. 같은 노드에 여러 경로로 들어올 때 쓴다(예: 하대정맥 → 우심방). |
| actor_id | 이 Edge에서 움직일 Actor (없으면 콘텐츠 actor_id) |
| transition_type | `move`(기본)는 경로를 따라 이동한다. `jump`는 이동 없이 바로 도착한다. jump는 Checkpoint가 있으면 그 위치에 놓고, 없으면 그대로 둔다. 3D 경로가 없는 PENDING 구간에 쓴다. |
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
  - scene 이벤트의 없는 Actor
- 경고
  - 모델이 없는(MISSING) 구조
  - 노드는 VERIFIED인데 경로는 검증되지 않음
- 규칙 검증(Python `content_loader`): 시작 노드, 정답, 완료 조건, 순환 경고, 지원하지 않는 이벤트·전환·검증 상태·버전
- 오류가 하나라도 있으면 그 콘텐츠는 시작하지 않는다. 엔진과 다른 콘텐츠는 계속 쓸 수 있다.
