# STEP 03-C 보고서 — 3D Path, Actor & Motion Engine

작성일 2026-11-28. 측정은 로컬 서버(`python -m http.server`)와 Claude 데스크톱 앱 브라우저 창에서 했다. 측정한 값만 적었다. 이 창의 FPS는 약 30에서 멈춰 실제 기기 대표값이 아니다.

## 1. 기존 STEP 03-B 구현 상태 검토
- **최신 커밋:** `2694ccf` (STEP 03-B)
- **보고서와 코드 대조:** STEP 03-B 보고서 내용과 실제 코드가 일치했다.
  - Anchor는 object-local로 저장된다.
  - 레지스트리는 `"asset:node"` 이름으로 매핑된다.
  - 레이어 개별 상태가 유지된다.
- **이번에 확인한 기존 모듈 상태:**
  - `camera-controller.setFollowTarget`: 대상 중심으로 target만 따라가는 자리 표시였다. 이번에 추적 모드를 구현했다.
  - `viewport`: dt를 이미 0.1초로 제한하고 있었다. 이동 엔진은 이 제한을 그대로 쓴다.
  - Python 함수 목록: `scene_commands.py`, `py-worker.js`(ALLOWED), `py-client.js`(PY_FILES)
- **발견한 기존 문제와 수정**
  - **이전 장면 명령 섞임 (STEP 02부터 있던 경쟁 조건):** 장면을 빠르게 바꾸면 이전 장면의 Python 결과 명령이 새 장면에서 실행되었다. 예를 들어 step01 → scene_e로 바꾸면 scene_e에 step01 객체 3개가 생겼다.
    - Python Bridge에 session 검사를 넣었다. 수정 후 경고 로그 "명령 4개를 실행하지 않음"을 확인했고, scene_e 객체 수는 정상값 36이었다.
  - **Worker 캐시:** 브라우저가 이전 `py-worker.js`를 캐시해 새 함수를 거부했다.
    - `WORKER_VERSION` 쿼리를 붙였다. Pages에서도 같은 문제를 막는다.

## 2. 추가 및 수정된 파일
**새 파일**

| 파일 | 역할 |
|---|---|
| `js/motion/path-engine.js` | 경로·곡선·호 길이 캐시, Waypoint/Checkpoint 편집, 기술 검증, 표시 |
| `js/motion/actor-manager.js` | Actor 기록, 자체 제작 모델(적혈구 등), 공유 리소스 |
| `js/motion/motion-controller.js` | 이동, Checkpoint 감지, 분기·순환, 결과 Promise, session |
| `js/motion/motion-commands.js` | 이동 명령 검증·실행 (command-runner 위임) |
| `js/motion/motion-kit.js` | Sandbox·Explorer 공용 조립, 장면 이동 데이터 불러오기 |
| `js/motion/path-editor.js` | 개발자 경로 편집기와 미리보기 패널 |
| `js/motion/path-geometry-check.js` | 경로 기하 검사 (ray parity) |
| `py/motion_link.py` | 규칙 엔진 move ↔ 3D 이동 명령 (STEP 03-D 준비) |
| `content/sandbox/motion/{basic,checkpoint,branch-loop,multi}.json` | Sandbox 시험 장면 ME~MH |
| `content/anatomy/cardiovascular/{paths,actors}.json` | Scene I |
| `tests/motion-tests.{js,html}` | 브라우저 엔진 테스트 28개 |
| `tests/test_motion_commands.py` | Python 이동 명령 테스트 29개 |
| `docs/development/MOTION_DATA_SPEC.md` | 경로·Checkpoint·Actor·명령 명세 |
| `assets/licenses/nf-actor-models.md` | 자체 제작 Actor 모델 출처 |

**수정한 파일**

| 파일 | 변경 |
|---|---|
| `camera-controller.js` | 추적 모드(follow, first_person), 수동 조작 시 일시 해제, 대상이 사라지면 안전하게 종료, `setExtraBounds`(전체 보기에 경로 포함) |
| `command-runner.js` | `ctx.motion` 위임, `wait`, `results` |
| `material-controller.js` | `setBaseMaterial` (공유 재질 교체) |
| `python-bridge.js` | session guard |
| `py-client.js`, `py-worker.js` | `motion_link.py`, 함수 허용 목록, Worker 버전 |
| `py/scene_commands.py` | MOTION 명령 검사, `set_paths`, `route_demo`, `move_to`, `motion_error_test` |
| `main.js`, `index.html` | Motion 패널, 이동 데이터 불러오기, Python 이동 데모 |
| `anatomy-explorer.js`, `explorer.html` | 개발자 모드 Motion 패널, Checkpoint 도착 시 구조 초점, Python 적혈구 이동 |
| `content/sandbox/scenes.json` | motion_e~h 장면 |
| `content/anatomy/cardiovascular/scene.json` | `motion` 항목 |
| `cardiovascular.structures.src.json` → `anchors.json` | 판막 중심 Anchor 3개 추가 (`a.tv.center`, `a.pv.center`, `a.mv.center`, 정점 평균) |
| `asset_registry.csv` | `nf-actor-models` 행 |
| `style.css` | 편집기 스타일 |
| `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md` | 문서 |

## 3. 3D 경로 데이터 규격
자세한 내용은 `MOTION_DATA_SPEC.md` 2장에 있다. 요약:
- 필드: path_id, scene_id, source/target_anchor_id, points(Waypoint), checkpoints, coordinate_space(`scene`), curve_type(`catmull_rom` 또는 `linear`), direction, closed, links(분기), default_duration, default_speed, verification_status, source, notes
- **점 좌표계:** 점마다 `anchor_id`, `object_local`(object_id + 로컬 좌표), `scene` 중 하나를 적는다.
  - 곡선은 장면 좌표로 계산한다.
  - 참조 객체의 matrixWorld가 바뀌면 다음 프레임에 다시 계산한다(장면 G의 회전판에서 확인).
  - GLB 변환은 다시 적용하지 않는다.
- **곡선과 이동:** CatmullRomCurve3는 centripetal 방식을 쓰고 `arcLengthDivisions = max(200, 점 수 × 64)`다. 이동은 거리(m) → `getPointAt`/`getTangentAt`(호 길이 기준)으로 한다.
- **Waypoint와 Checkpoint 분리:** Waypoint는 곡선 모양을 정하는 점이다. 학습 지점(Checkpoint)은 따로 둔다.

## 4. Actor 데이터 규격
- 필드: actor_id, actor_type(9종), model_id, source_asset_id(`project-made`), path_id, progress, direction, speed, visible, rotation_mode, movement_state(6종), biological_state, display_size, real_size_m
- 3D 객체는 Object Registry에 type `actor`로 등록한다. 선택, 재질, Python 스냅샷, 해제 경로를 공유한다.
- Python에는 논리 상태만 보낸다.
- **공유 리소스:** 같은 모델 Actor는 Geometry 1개를 공유한다. Material은 상태마다 1개를 공유한다.
  - 적혈구 50개로 확인: Geometry 1, Material 2
  - Actor를 모두 제거하면 0으로 해제됐다.

## 5. Checkpoint 이벤트 처리 방식
- **감지:** 프레임 이동 구간 [이전 거리, 새 거리]과 교차하는 Checkpoint를 진행 순서대로 처리한다.
  - 정지 Checkpoint에서는 위치를 정확히 맞추고 남은 이동량을 버린다.
  - 한 프레임에 8 m를 이동해도(경로 전체 9.4 m) 3개 정지점에서 모두 정확히 멈췄다(0.2000, 0.5000, 0.8000).
- **방향 구분:** `trigger: forward | backward | both`. 이벤트에는 방향이 들어간다.
- **중복 방지:** (Checkpoint, 바퀴, 방향)마다 한 번만 낸다.
- **다시 활성화되는 조건:** 순환 경로의 새 바퀴, `actor_reset`, `actor_set_path`, 연결 경로 전환
- **목표 Checkpoint 이동:** 중간 정지점은 이벤트만 내고 지나간다.
- **개발자 Next:** 다음 정지 Checkpoint까지 이동한다. 실제 타이핑 정답 제출 대신 쓴다.

## 6. Python 명령 연동 방식
- 요구서 예시 형식(`actor_set_path` + `actor_move_to_checkpoint` + `duration`)을 그대로 지원한다. Python 테스트로 확인했다.
- **검증:** Python `scene_commands.validate`(MOTION 표, `set_paths`로 받은 경로·Checkpoint ID)와 JS `motion-commands.validate`가 각각 검사한다.
  - 잘못된 이동 명령 6개를 보냈을 때 Python이 5개를 걸렀다.
  - 원본 6개를 그대로 보내자 JS가 6개를 모두 거부했다. 6번째(pause)는 대기 상태라 실패했다.
  - 프로그램은 계속 동작했다.
- **결과:** 이동 명령은 `arrived`, `completed`, `cancelled`, `failed`로 끝난다. `wait: true`면 결과가 나온 뒤 다음 명령을 실행한다.
- **session:** 장면 전환·초기화 때 session을 올리고 진행 중인 명령을 `cancelled`로 끝낸다. 이전 session 명령은 거부한다.
- **프레임마다 Python을 부르지 않는다.** 버튼, 이벤트, 결과 때만 부른다.
- **확인한 화면 동작**
  - Sandbox MF: Python `route_demo`로 경로 지정 → Checkpoint 이동 → 추적 카메라 순서로 실행됐다.
  - Explorer: Python 버튼으로 적혈구가 우심방 Checkpoint에 도착했다. 스냅샷은 53개(해부학 41, Anchor 11, Actor 1)였다.

## 7. Path Editor 구현 결과
Sandbox 오른쪽 "Motion" 패널과 Explorer 개발자 모드에 같은 모듈을 붙였다.
- **경로:** Path 목록(표시 토글, 길이, 순환·연결 표시), 새 경로, 삭제, 이름, 직선·곡선, 순환, 시작·종료 Anchor
- **Waypoint:** 선택, ↑↓ 순서 변경, 중간 삽입, 삭제, 카메라 초점 위치에 추가, 장면·로컬 XYZ 입력, Anchor로 지정, TransformControls 이동
- **Checkpoint:** Actor 위치나 선택 Waypoint 위치에 추가, 정지 여부 설정, 삭제, 클릭으로 그 지점까지 이동
- **미리보기:** Actor와 모델 선택, Play, Pause, Resume, Stop, Next, Reset, 방향 반전, 속도(로그 슬라이더), 진행률(seek)
- **카메라:** 카메라 추적, 1인칭, 추적 재개, 전체 보기 복귀, Checkpoint 도착 시 초점
- **파일·검증:** JSON 내보내기·불러오기, 기술 검증, 기하 검사(Explorer)
- **상태 표시:** Actor, Path, 진행률, 상태, 다음 CP, FPS, 카메라 모드, 오류 수 (0.25초마다)
- **편집용 객체 분리:** 핸들과 경로선은 레지스트리 밖 overlay라 해부학 선택을 방해하지 않는다.
  - 핸들 클릭은 capture 단계에서 처리하고 전파를 멈춘다. 실제 클릭으로 확인: 곡선 경로 2번 점이 선택됐고 객체 선택은 null이었다.
  - 기즈모를 드래그하는 동안 OrbitControls를 끈다.
- **실제 마우스 기즈모 드래그:** Z축 화살표를 드래그하자 점이 (3, 0.4, −1.5)에서 (3, 0.4, 0.143)으로 움직였다. X·Y는 그대로였고, 길이가 6.000 m에서 6.221 m로 갱신됐다. 드래그 뒤 OrbitControls는 다시 켜졌다.

## 8. 카메라 추적 구현 결과
| 모드 | 내용 |
|---|---|
| overview | 전체 보기. 경로 범위를 포함한다. |
| orbit | 기존 조작 |
| follow | Actor 뒤에서 거리·높이·좌우 오프셋을 두고 따라간다. 지수 보간으로 위치와 시선을 부드럽게 바꾸고, 시선은 진행 방향으로 조금 앞을 본다. |
| checkpoint | 도착 시 해부학 구조 초점 (Explorer: 구조 선택과 `manager.focus`) |
| first_person | Actor 바로 뒤에서 진행 방향을 본다. |

- **충돌 방지:** 추적하는 동안 near와 OrbitControls 거리·각도 제한을 잠시 푼다. 추적이 끝나면 원래대로 돌린다.
- **수동 조작:** 사용자가 직접 조작하면 추적을 일시 해제한다. "추적 재개"로 다시 시작한다.
- **대상 제거:** 추적 대상이 사라지면 오류 없이 추적을 끝낸다. 장면 전환, Actor 제거, 개발자 모드 해제에서 확인했다.
- **확인:** Explorer에서 적혈구를 추적하며 상대정맥 → 폐동맥줄기 경로를 끝까지 이동했다. 이때 카메라와 Actor 거리는 33 mm로 유지됐다.
- **내부 관찰의 한계:** 심장 모델 안에서는 벽면이 화면을 가린다. 심장·혈관 레이어 투명도를 0.15로 낮추자 삼첨판 첨판과 적혈구가 보였다.
  - 내부 관찰에는 투명화나 단면이 필요하다.
  - 1인칭에서는 표면을 통과할 때 화면이 깜빡이거나 방향이 급하게 바뀔 수 있다. 실제 화면에서 충분히 검증하지 못했다(NOT TESTED).

## 9. 자체 적혈구 모델 제작 결과
- **형태:** Three.js LatheGeometry로 만들었다. 단면은 Evans & Fung(1972) 양면 오목 원반 식을 정규화했다. 외부 모델은 쓰지 않았다.
- **표시:** 화면과 문서에 "교육용 형태"로 적었다. 실제 세포 구조를 재현한 모델이 아니다.
- **크기:** `real_size_m` 7.8e-6와 `display_size`를 분리했다.
  - Sandbox: 0.40~0.45 m
  - 심장 장면: 3 mm (약 385배)
- **산소화 상태:** `biological_state.oxygenation`에 따라 공유 재질을 바꾼다.
  - oxygenated `#d62839`, deoxygenated `#8a1c3c`
  - 둘 다 붉은 계열이다. 파란색을 쓰지 않는다.
- **다른 모델:** 백혈구, 혈소판, 림프 입자, 음식물, 영양소, 호르몬, 신경 신호, 표식도 같은 엔진으로 움직였다(장면 MH).

## 10. 실제 해부학 모델 적용 범위 (Scene I)
경로 6개는 Anchor(정점 평균)를 잇는다. 상태는 모두 `APPROXIMATE`다. Explorer 개발자 모드에서만 불러온다.

| 경로 | 길이 | 기하 검사 (메시 닫힌 면 밖 표본 비율) |
|---|---|---|
| 상대정맥 → 우심방 | 60.1 mm | 0% (상대정맥 → 우심방 내강) |
| 하대정맥 → 우심방 | 163.0 mm | 3% |
| 우심방 → 삼첨판 → 우심실 | 52.9 mm | 2% (방실 사이 짧은 구간) |
| 우심실 → 폐동맥판 → 폐동맥줄기 | 49.3 mm | 2% |
| 좌심방 → 승모판 → 좌심실 | 47.5 mm | 7% (25~32% 구간) |
| 좌심실 → 대동맥판 | 27.1 mm | 0% |

- **연결 이동:** 상대정맥 → 우심방 → (연결) → 삼첨판 → 우심실 → (연결) → 폐동맥판 → 폐동맥줄기 순서로 Next 6번 만에 끝까지 갔다. 정지점 5곳에서 모두 멈췄다.
- **기하 검사 방법:** 6방향 ray parity, 5/6 다수결이다. 표면 기하만 보는 근거이며 검증이 아니다.

## 11. 해부학적으로 검증되지 않은 경로
- **모든 Scene I 경로:** 정점 평균 Anchor 사이를 Catmull-Rom 곡선으로 이은 것이다. 혈관·심방·심실 내강 중심선이 아니다.
  - 판막 통과 위치는 첨판 정점 평균이다.
  - 혈류 방향은 교과서 순서를 따랐을 뿐 모델에서 검증하지 않았다.
- **만들지 않은 경로:**
  - 폐 → 폐정맥 → 좌심방: 폐 실질 모델이 없고, 폐정맥 정점 평균이 폐 안쪽 가지까지 포함한다.
  - 대동맥 안쪽: 대동맥이 한 메시라 정점 평균이 내강 밖이다. 중심선 Anchor가 필요하다.
- **기술 검증과 해부학 검증을 분리했다:** 기술 검증(ID, 좌표, 길이 0, 연결, 범위)은 자동이다. 해부학 검증은 수동 대상(단면, 여러 카메라 각도, 전문가 검토)으로 남겼다.

## 12. 테스트 장면별 실행 화면
화면은 작업 중 브라우저에서 확인하고 대화에 캡처를 남겼다. 이미지 파일로 저장하지는 않았다.
- **ME Basic Path:** 직선(6 m)과 곡선(10.49 m, 급커브·수직 구간). 실제 Play 버튼 클릭으로 이동했다(1.5초에 25.2%).
- **MF Checkpoint:** 정지 3개, 통과 1개, 역방향 전용 1개. Python `route_demo`와 화면 캡처로 확인했다.
- **MG Branch & Loop:** 분기 left는 순환 2바퀴 뒤 완료됐다(관문 이벤트 바퀴마다 1회). 분기 right는 끝 Checkpoint에 도착했다. 회전판을 이동·45° 회전하자 로컬 경로가 따라갔다(신호 Actor 로컬 y 0.250 유지).
- **MH Multiple Actors:** Actor 8개의 서로 다른 속도. 스트레스 측정은 15장 참고
- **Scene I:** 적혈구 추적, 투명화한 심장 안 삼첨판 근처 화면

## 13. 기존 단위 테스트 결과
| 테스트 | 결과 |
|---|---|
| `tests/test_sandbox3d.py` | 38 통과 |
| `tests/test_scene_commands.py` | 30 통과 |
| `tests/test_engine.py` | 70 통과 |
| `tools/asset-processing/test_bp3d_tools.py` | 13 통과 |
| 신규 `tests/test_motion_commands.py` | 29 통과 |
| 신규 `tests/motion-tests.html` (브라우저) | 28/28 통과 |

## 14. 완료 기준 18개
| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 기존 Python 테스트 유지 | PASS | 13장 |
| 2 | STEP 02·03-B 기능 정상 | PASS | 아래 확인 결과 |
| 3 | Anchor로 3D 경로 생성 | PASS | Scene I 6개 경로. 편집기의 시작·종료 Anchor 지정 |
| 4 | Waypoint 수정 시 경로 변경 | PASS | 삽입·순서·삭제 시 길이 2.000 → 2.828 → 2.000. 실제 기즈모 드래그 |
| 5 | 곡선을 따라 이동 | PASS | 프레임당 이동 최대/최소 1.025 (매개변수 선형 증가면 3.78) |
| 6 | 프레임 속도와 무관한 이동 시간 | PASS | 30/60/144fps와 불규칙 dt: 5.267/5.250/5.250/5.343 s (기대 5.246 s, 차이는 마지막 프레임 이하) |
| 7 | 경로 방향 회전 | PASS | 접선 오차 최대 0.000°. 프레임당 최대 회전 17.4°(급커브 꼭짓점), 180° 뒤집힘 없음 |
| 8 | Checkpoint를 건너뛰지 않고 정확히 정지 | PASS | 5장 |
| 9 | 일시정지·재개 | PASS | 1.000 m → 정지 2초 1.000 m → 재개 2.000 m |
| 10 | 여러 경로 이동과 순환 | PASS | 분기, 순환 3바퀴 완료, 연결 전환 |
| 11 | 여러 Actor 독립 제어 | PASS | 50개, 서로 다른 속도, 개별 일시정지 |
| 12 | Follow Camera | PASS | Sandbox와 Explorer. 1인칭 표면 통과 품질은 NOT TESTED |
| 13 | 경로 JSON 저장·복원 | PASS | export → load 동일 |
| 14 | Python 명령으로 Actor 제어 | PASS | 6장 |
| 15 | 초기화·장면 전환 시 이동·이벤트 제거 | PASS | session 2→4, 이동 cancelled. 이전 session 명령 거부. Python 결과 guard |
| 16 | 실제 해부학 모델에 검증 가능한 이동 구간 | PASS (기술 기준) / 해부학 NOT TESTED | 우심계 연결 경로 3개가 기하 검사상 대부분 메시 안. 의학적 검증 없음 |
| 17 | GitHub Pages 호환 | NOT TESTED | 상대 경로, `import.meta.url`, 정적 JSON만 사용. 배포본은 커밋 전이라 확인하지 않음 |
| 18 | 모바일 화면·터치 | 화면 PASS / 터치 NOT TESTED | 375×812 에뮬레이션에서 Motion 패널 가로 넘침 없음. 실제 기기 터치는 확인하지 않음 |

항목 2의 확인 결과:
- STEP 02:
  - scene_d 데모: 8개 적용
  - 오류 테스트: 1개 적용, 6개 실패
  - scene_c: 격리 3, 단면 7 Mesh
  - 객체 수: a 5, b 17, step01 0→3, e 36
- STEP 03-B: 검색, 레이어를 껐다 켜도 승모판 숨김 유지, 초점, Anchor 11개 export
- 개발자 모드를 끈 뒤 tracker는 geometry 24로 03-B와 같았다.

**기술 검증과 의료 모델 경로 검증 (별도 보고)**
- **기술 기능:** 위 표의 PASS 항목
- **의료 모델 경로:** 검증하지 않았다(NOT TESTED). 모든 해부학 경로는 APPROXIMATE다.

## 15. 성능 측정 결과
| 상황 | FPS (앱 창) | 이동 계산 시간 (paths.tick + motion.tick, 프레임당) | draw calls |
|---|---|---|---|
| MH Actor 8개 | 30 | 0.034 ms | — |
| Actor 208개 | 26 | 0.453 ms | 219 |
| Actor 1,008개 | 12 | 1.087 ms | 1,019 |
| Explorer: 적혈구 1개 이동 | 28 | — | 삼각형 192,580 |

- **병목:** Actor 1,000개에서 FPS가 떨어진 원인은 이동 계산(1.1 ms)이 아니라 Actor마다 1개씩 생기는 draw call이다.
  - 200개를 넘는 입자 표현에는 InstancedMesh가 필요하다. Actor마다 레지스트리 ID와 선택이 필요해 이번에는 적용하지 않았다.
- **메모리:** JS heap은 Actor 8개일 때 8 MB, 1,008개일 때 14 MB였다(Chromium `performance.memory`).
  - Actor를 제거한 뒤 tracker는 원래 값(geo 6, mat 7)으로 돌아왔다.
  - heap은 GC 전이라 바로 줄지 않았다.
- **캐시:** 경로 길이와 곡선은 캐시한다. 참조 객체 matrixWorld 비교 비용은 경로당 점 수만큼이다.
- **기하 검사:** 경로 1개에 약 2.5초가 걸리는 동안 화면이 멈춘다. 버튼으로만 실행한다.
- **측정하지 않은 것:** 모바일 GPU 부하, 실제 기기 FPS

## 16. 미해결 오류 및 제한 사항
- **해부학 경로:** 모든 Scene I 경로는 APPROXIMATE다. 내강 중심선, 폐 순환, 대동맥 내부 경로가 없다.
- **판막과 박동:** 판막 개폐와 심장 박동이 없다(범위 밖).
- **1인칭 시점:** 표면을 통과할 때 품질이 검증되지 않았다. 심장 안쪽은 투명화나 단면 없이는 벽만 보인다.
- **InstancedMesh 미적용:** Actor 1,000개에서 12 FPS(앱 창)였다.
- **경로 표시:** 참조 객체가 계속 움직이면 경로선 BufferGeometry를 프레임마다 다시 만든다. 지금 장면에서는 명령으로 움직일 때만 다시 만든다.
- **편집기:** 경로 JSON을 내보내도 서버에 저장되지 않는다(정적 사이트). 받은 파일을 `content/`에 직접 넣어야 한다.
  - 내보내기 버튼은 브라우저 다운로드를 만든다. 이번에는 실제 다운로드 대신 `exportJson` → `load` 왕복으로 확인했다.
- **화면 캡처:** 실행 화면을 이미지 파일로 저장하지 않았다.
- **Sandbox 장면 이름:** 요구서 Scene E~H는 기존 장면 E·F(해부학)와 겹친다. 그래서 ME~MH로 이름을 바꿨다.

## 17. STEP 03-D 타이핑 엔진 연결 준비 상태
- **준비된 것**
  - `py/motion_link.py`: `game.submit()`의 move 명령 → `actor_move_to_checkpoint` 또는 `set_path` + `move`. 이동 결과 → `game.arrive`에 넘길 Edge ID. 중복 결과는 무시한다.
  - Python 테스트 8개로 확인했다.
  - 이동 결과 Promise와 이벤트(`arrive`, `completed`, `cancelled`)가 있다. STEP 03-D는 이를 받아 Python `motion_done`을 부르면 된다.
  - 개발자 Next 버튼 자리가 타이핑 정답 제출 자리다.
- **남은 것**
  - `game.py`, `flow_engine.py`, `state_engine.py`, `typing_engine.py`, `record_engine.py`, `content_loader.py`를 Worker 파일 목록에 추가해야 한다.
  - 콘텐츠의 Edge에 path_id와 checkpoint_id를 적는 형식이 필요하다(`FLOW_SPEC_v0.1`의 edge.path 확장).
  - 타이핑 입력 UI(`js/shared/typing-input.js`)를 연결해야 한다.
