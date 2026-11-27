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
