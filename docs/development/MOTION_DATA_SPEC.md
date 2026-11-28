# 이동 데이터 명세 (STEP 03-C)

경로(Path), Checkpoint, Actor, 이동 명령의 데이터 형식이다. 엔진은 특정 의료 콘텐츠를 모른다. 혈액, 림프액, 음식물, 신경 신호 모두 같은 형식을 쓴다.

## 1. 파일 위치
| 파일 | 내용 |
|---|---|
| `content/sandbox/motion/*.json` | Sandbox 시험 장면(ME~MH)의 경로와 Actor. `scenes.json`의 `motion` 필드가 가리킨다. |
| `content/anatomy/cardiovascular/paths.json` | 심혈관 시험 경로(Scene I). `scene.json`의 `motion.paths`가 가리킨다. |
| `content/anatomy/cardiovascular/actors.json` | 심혈관 장면 Actor. `scene.json`의 `motion.actors`가 가리킨다. |

장면 이동 데이터의 최상위 필드:

| 필드 | 설명 |
|---|---|
| `scene_id` | 장면 ID |
| `marker_size` | 경로 핸들과 Checkpoint 표시 크기(m). 장면 크기에 맞춘다. 심장 장면은 0.0012, Sandbox는 0.08이다. |
| `follow` | 추적 카메라 기본값: `{distance, height, side, smooth}` (m, smooth는 1/s) |
| `paths` | 경로 목록 |
| `actors` | Actor 목록. 해부학 장면은 별도 파일(`actors.json`)에 둔다. |

## 2. 경로 (Path)
| 필드 | 필수 | 설명 |
|---|---|---|
| `path_id` | ○ | 고유 ID. 중복이면 불러오기를 거부한다. |
| `points` | ○ | Waypoint 목록(곡선 모양). 아래 "점 좌표계" 참고 |
| `scene_id` | | 생략하면 파일의 `scene_id` |
| `name_ko`, `name_en` | | 표시 이름 |
| `source_anchor_id`, `target_anchor_id` | | 시작·종료 Anchor. `points`의 처음·끝에 없으면 자동으로 붙인다. |
| `checkpoints` | | Checkpoint 목록 |
| `curve_type` | | `catmull_rom`(기본, centripetal) 또는 `linear`(직선 구간) |
| `closed` | | `true`면 순환 경로 |
| `direction` | | 기본 진행 방향. `1`은 정방향, `-1`은 역방향 |
| `links` | | 끝에서 이어질 경로. `[{to, when, label}]`. `when`이 Actor의 `biological_state.branch`와 같은 연결을 고르고, 맞는 것이 없으면 첫 연결을 쓴다. |
| `default_speed` | | m/s |
| `default_duration` | | ms (참고값) |
| `verification_status` | | (STEP 04-A) `PENDING`, `APPROXIMATE`, `GEOMETRY_CHECKED`, `ANATOMY_REVIEWED`, `CONCEPTUAL`, `TEST_PATH` 중 하나. `VERIFIED_GEOMETRY`(03-C 이름)는 `GEOMETRY_CHECKED`로 읽는다. 아래 "검증 상태" 참고 |
| `method` | | (STEP 04-A) 만든 방법. 예: `centerline:aorta`, `waypoints:valve normal` |
| `geometry_check` | | (STEP 04-A) 저장한 기하 검사 결과. `{date, samples, outside_ratio, enclosed_ratio, surface_crossings, min_clearance_mm, start_inside, end_inside, checkpoint_order_ok, link_gap_mm, length_m, stale}`. 점을 편집하면 `stale: true` |
| `source`, `notes` | | 출처와 메모 |

### 검증 상태 (STEP 04-A)
| 상태 | 뜻 | 누가 올리나 |
|---|---|---|
| PENDING | 경로가 없거나 작성 중 | - |
| APPROXIMATE | Anchor 정점 평균을 이은 근사, 또는 편집 뒤 다시 검사하지 않은 경로 | 자동(편집하면 GEOMETRY_CHECKED·ANATOMY_REVIEWED에서 내려감) |
| GEOMETRY_CHECKED | 기하 검사 통과: 표본 81개가 모두 메시 안쪽(닫힌 면 안 또는 옆으로 둘러싸임), 연결 간격 0, Checkpoint 순서 정상, 모든 Checkpoint 위치 계산 가능 | 개발자(검사 결과로) |
| ANATOMY_REVIEWED | 전공자가 경로를 검토함 | 사람만. 기하 검사로 올리지 않는다 |
| CONCEPTUAL | 해부 모델이 없는 개념 장면의 경로 | 개념 장면 |
| TEST_PATH | 엔진 시험용 | - |

기하 검사(`js/motion/path-geometry-check.js`)는 표면 메시 기하만 본다. 해부학적으로 맞는 혈류 경로라는 뜻이 아니다.
- parity: 6방향 광선의 교차 홀짝(5/6 다수결)로 닫힌 메시 안쪽인지 본다.
- 둘러싸임: 진행 방향에 수직인 8방향 광선이 3 cm 안에서 벽에 닿는 비율이 75% 이상이면 끝이 열린 관 안쪽으로 본다.
- 관통: 이웃 표본 사이 선분이 면을 지나는 횟수를 기록한다. 메시가 겹치는 곳(혈관↔심방)과 판막 첨판에서 생기므로 실패 조건이 아니라 참고값이다.
- 속도: 삼각형 격자 색인(`triangle-grid.js`) + 8 ms 단위로 나눠 실행 + 결과 캐시

### 중심선 경로 (STEP 04-A)
`js/motion/centerline-tracer.js`가 혈관 메시를 진행 방향에 수직인 평면으로 잘라, 단면 선분의 길이 가중 중심을 따라간다(3 mm 간격). 정점만 쓰면 혈관처럼 길쭉한 삼각형에서 단면 정점이 3~5개뿐이라 중심이 치우쳐서 삼각형 단면을 쓴다. 관이 열려 단면이 없어지면 멈춘다. Path Editor의 "단면 중심선으로 채우기"가 선택한 점에서 다음 점 방향으로 추적해 Waypoint를 넣는다.

### 점 좌표계
곡선은 항상 장면(world) 좌표로 계산한다. 점마다 자기 좌표계를 적고, 계산할 때 장면 좌표로 바꾼다.

| 형식 | 의미 | 갱신 |
|---|---|---|
| `{ "anchor_id": "a.ra.cavity" }` | Anchor Manager의 `worldOf()`. Anchor는 object-local로 저장되어 있다. | 연결 객체의 matrixWorld가 바뀌면 다음 프레임에 다시 계산한다. Anchor를 편집하면 `refreshAnchor`가 바로 다시 계산한다. |
| `{ "space": "object_local", "object_id": "turntable", "position": [x,y,z] }` | 레지스트리 객체의 로컬 좌표. 장면 좌표는 `matrixWorld × position`이다. | 객체(와 부모)의 위치·회전·크기가 바뀌면 다음 프레임에 다시 계산한다. |
| `{ "space": "scene", "position": [x,y,z] }` | 장면 좌표(m) | 바뀌지 않는다. |

- GLB에 이미 들어 있는 축·단위 변환(glTF (x, y, z) = (X, Z, −Y) × 0.001)은 다시 적용하지 않는다.
- 편집기에서 Anchor 점의 장면 좌표를 직접 고치면 `{space: "scene"}` 점으로 바뀐다. 이때 `detached_from`에 원래 Anchor ID가 남는다.

### 길이와 진행
- 진행은 거리(m)로 다룬다. 진행률(progress, 0~1)은 표시와 Python용이다.
- 위치는 `curve.getPointAt(distance / length)`, 방향은 `getTangentAt`으로 얻는다. 둘 다 호 길이 기준이다.
- 호 길이 표본 수는 `max(200, 점 수 × 64)`다.
- 곡선, 길이, Checkpoint 거리는 캐시한다. 점을 편집하거나 참조 객체가 움직일 때만 다시 계산한다.

## 3. Checkpoint
| 필드 | 설명 |
|---|---|
| `checkpoint_id` | 고유 ID (전체 경로에서 유일해야 `actor_move_to_checkpoint`로 찾을 수 있다) |
| `path_distance` / `path_progress` / `anchor_id` | 위치를 정하는 방법. 이 순서로 우선한다. `anchor_id`만 있으면 곡선에서 그 Anchor에 가장 가까운 점(400 표본)을 쓴다. |
| `anatomical_id` | 관련 해부학 구조 (도착 초점 이동에 쓴다) |
| `stop_on_arrival` | 도착하면 멈출지 여부 |
| `trigger` | `both`(기본), `forward`, `backward` 중 하나. 이 방향으로 지날 때만 이벤트를 낸다. |
| `event_ids` | 이벤트 ID 목록. 엔진은 그대로 전달만 한다. |
| `label` | 표시 이름 |
| `verification_status` | 검증 상태 |

### 감지 규칙
- **구간 교차 감지:** 한 프레임 이동 구간 [이전 거리, 새 거리]과 교차하는 Checkpoint를 진행 순서대로 처리한다. 한 프레임에 경로 전체를 지나가도 건너뛰지 않는다.
- **정지:** 멈출 Checkpoint를 만나면 위치를 그 Checkpoint 거리에 정확히 맞추고 `waiting_at_checkpoint`가 된다. 남은 이동량은 버린다.
- **중복 방지:** 이벤트는 (Checkpoint, 바퀴 수, 방향)마다 한 번만 낸다.
- **다시 활성화되는 조건:**
  - 순환 경로에서 새 바퀴를 시작할 때
  - `actor_reset` 또는 `actor_set_path`를 실행할 때
  - 연결 경로로 전환될 때
- **목표 Checkpoint 이동:** `actor_move_to_checkpoint` 중에는 중간의 정지 Checkpoint에서 멈추지 않는다. 이벤트만 내고 지나간다.
- **순간 이동:** `actor_seek`은 그 사이 Checkpoint 이벤트를 내지 않는다.

## 4. Actor
| 필드 | 설명 |
|---|---|
| `actor_id` | 고유 ID. Object Registry ID와 같다(type `actor`). |
| `actor_type` | `red_blood_cell`, `lymph_particle`, `food`, `nutrient`, `white_blood_cell`, `platelet`, `hormone`, `nerve_signal`, `custom` 중 하나 |
| `model_id` | `rbc`, `wbc`, `platelet`, `lymph`, `food`, `nutrient`, `hormone`, `nerve_signal`, `marker` 중 하나. 생략하면 종류별 기본 모델 |
| `display_size` | 화면 표시 크기(m). 교육용 가시성 배율이다. |
| `real_size_m` | 실제 크기 참고값. 모델 표에서 채운다(예: 적혈구 7.8e-6). |
| `path_id`, `progress`, `direction`, `speed` | 시작 경로, 진행률, 방향, 속도(m/s) |
| `rotation_mode` | `tangent`(경로 접선을 따라 회전) 또는 `fixed` |
| `biological_state` | 자유 형식. 예: `{oxygenation: "oxygenated" \| "deoxygenated", branch: "left"}`. 산소화 상태는 공유 재질 색을 바꾼다. |
| `movement_state` | 엔진이 관리한다. `idle`, `moving`, `paused`, `waiting_at_checkpoint`, `completed`, `cancelled` 중 하나 |

- 3D 상태(위치, 회전, 재질)는 JS가 관리한다. Python에는 `actors.snapshot()`의 논리 상태만 보낸다(id, actor_type, path_id, movement_state, progress, direction).
- 같은 모델 Actor는 Geometry 1개를 공유한다. Material은 상태마다 1개를 공유한다. Resource Tracker가 참조 수가 0이 되면 해제한다.

## 5. 이동 명령
`{action, target, ...}` 형식이다. STEP 02 명령과 같은 목록에 섞어 보낼 수 있다. Python(`scene_commands.validate`)과 JS(`motion-commands.validate`)가 각각 검사한다.

| action | 필드 |
|---|---|
| `actor_create` | `target`=새 ID, `value`={actor_type, model_id, display_size, biological_state, path_id, speed} |
| `actor_remove` | `target` |
| `actor_set_path` | `target`, `path_id`, `progress`?, `direction`?(1 또는 -1) |
| `actor_move` | `target`, `speed`?, `duration`?(ms), `until`?(`end` 또는 `next_stop`), `loops`?, `pass_stops`?, `route`?[path_id] |
| `actor_move_to_checkpoint` | `target`, `checkpoint_id`, `duration`? 또는 `speed`? (다른 경로의 Checkpoint면 그 경로로 옮긴다) |
| `actor_pause`, `actor_resume`, `actor_stop`, `actor_reset`, `actor_reverse` | `target` |
| `actor_set_speed` | `target`, `value`(m/s) |
| `actor_seek` | `target`, `value`(0~1) |
| `actor_set_state` | `target`, `value`(biological_state 일부) |
| `path_show`, `path_hide` | `target`=path_id |
| `camera_follow` | `target`=actor_id, `value`?={distance, height, side, first_person} |
| `camera_unfollow` | (없음) |

선택 필드:
- `wait: true`: 이동 결과가 나올 때까지 다음 명령을 기다린다.
- `session`: 현재 session과 다르면 실행하지 않는다.

### 결과
이동 명령은 Promise로 결과를 돌려준다.

```json
{ "status": "arrived | completed | cancelled | failed", "actor_id": "rbc_01", "cmd_id": 3,
  "action": "actor_move_to_checkpoint", "session": 2, "path_id": "path_001", "progress": 0.5,
  "checkpoint_id": "checkpoint_02", "reason": "..." }
```

| status | 뜻 |
|---|---|
| `arrived` | 정지 Checkpoint(또는 목표 Checkpoint)에 도착 |
| `completed` | 경로 끝 도착, 또는 지정한 순환 바퀴 수를 마침 |
| `cancelled` | 다음 경우 중 하나: `actor_stop`, 새 이동 명령으로 대체, `actor_reset`, 경로 변경, 장면 전환·초기화 |
| `failed` | 없는 ID, 잘못된 값, 경로 삭제 |

### session
- 장면 전환이나 초기화가 일어나면 `motion.cancelAll()`이 session 번호를 올리고, 진행 중인 명령을 모두 `cancelled`로 끝낸다.
- Python Bridge는 호출할 때의 session을 기억한다. 결과가 돌아왔을 때 session이 바뀌었으면 명령을 실행하지 않는다.

## 6. 규칙 엔진 연결 (STEP 03-D 준비)
`py/motion_link.py`가 맡는다.
- `setup(actor_id, {edge_id: {path_id, checkpoint_id}})`: Edge와 3D 경로를 연결한다.
- `to_motion(game_commands)`: `game.submit()`이 돌려준 `{type: 'move', edge, reverse, duration}`을 3D 이동 명령으로 바꾼다.
  - Edge에 Checkpoint가 연결되어 있으면 `actor_move_to_checkpoint`로 바꾼다.
  - 연결되어 있지 않으면 `actor_set_path`와 `actor_move`로 바꾼다.
- `motion_done(status)`: JS 이동 결과를 받는다. `arrived`나 `completed`면 `game.arrive()`에 넘길 Edge ID를 돌려준다. 같은 결과가 두 번 오면 무시한다.
