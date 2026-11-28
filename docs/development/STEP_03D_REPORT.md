# STEP 03-D 보고서 — Gameplay Integration & Python Learning Engine

작성일 2026-11-28. 측정은 로컬 서버와 Claude 데스크톱 앱 브라우저 창에서 했다. 측정한 값만 적었다.

창이 숨겨져 있을 때는 브라우저가 렌더링을 늦춰 FPS가 약 10으로 떨어진다. 이 값은 성능 값으로 쓰지 않았다.

## 1. 기존 STEP 03-C 검토 결과
- **완료 상태:** 최신 커밋 `251e231`에서 STEP 03-C 기능이 정상 동작했다.
  - 브라우저 엔진 테스트 28/28
  - Python 이동 명령 테스트 29개
  - Sandbox 장면 ME~MH와 Explorer 개발자 모드 경로
- **규칙 엔진 구조:** v0.1 규칙 엔진은 이미 "정답 → `moving` 상태 → `arrive(edge)` 진행"으로 되어 있었다. 이동 전과 후 상태를 나누는 확장이 거의 필요 없었다.
- **이번에 보완한 것**
  - Checkpoint 위치에 바로 놓는 명령(`actor_place_at_checkpoint`), 전체 일시정지·재개(`pauseAll`/`resumeAll`). 이동 없는 jump 구간과 위치 복구에 필요했다.
  - 판정 중(`checking`)에 재시작이 막혀 있었다. 판정 중에도 재시작할 수 있게 하고, 늦게 온 응답은 세션 번호로 버린다.
  - 2D 콘텐츠 파일은 STEP 01에서 지워져 테스트 코드 안에만 남아 있다. v0.1 형식 호환은 기존 70개 테스트로 확인했다.

## 2. 재사용한 모듈
| 영역 | 재사용 | 확장 |
|---|---|---|
| Python | `typing_engine`, `state_engine`, `flow_engine`, `content_loader`, `record_engine`, `game`, `motion_link`, `scene_commands` | 유니코드 정규화(NFKC), version 2 별칭 변환과 3D 필드 검사, `scene` 이벤트, Edge 이벤트, 힌트, 첫 시도 통계, 이동 취소, 진행률, 기록 v2 |
| JS 공용 | `typing-input.js`(IME), `records.js`(CSV 다운로드) | 없음 (그대로) |
| JS 엔진 | viewport, registry, material, camera, clipping, selection, scene-manager, command-runner, py-client | Worker 파일 목록과 허용 함수 |
| 해부학 | anatomy-registry, anatomy-manager, labels, anchor-manager | 없음 |
| 이동 | path-engine, actor-manager, motion-controller, motion-commands, motion-kit | Checkpoint에 놓기, 전체 일시정지 |

## 3. 추가 및 수정된 파일
**새 파일**
- `play.html`, `css/play.css`
- `js/play/`
  - `play-main.js`: 화면 연결
  - `play-engine.js`: 엔진 조립
  - `gameplay-controller.js`, `gameplay-state.js`, `gameplay-ui.js`, `learning-mode.js`, `session-manager.js`
- `py/lesson.py`: 3D 학습 API
- `content/lessons/index.json`
- `content/lessons/cardiovascular/blood-circulation.json`
- `content/lessons/test/sequential.json`, `content/lessons/test/branch-cycle.json`
- `tests/test_lesson.py` (49개)
- `docs/development/STEP_03D_REPORT.md`

**수정한 파일**
- Python: `py/game.py`, `content_loader.py`, `flow_engine.py`, `state_engine.py`, `record_engine.py`, `typing_engine.py`, `motion_link.py`, `scene_commands.py`
- JS: `js/motion/motion-controller.js`, `motion-commands.js`, `js/python/py-client.js`, `py-worker.js`
- 데이터
  - `content/anatomy/cardiovascular/paths.json`: Checkpoint `cp.ivc`, `cp.la` 추가
  - `content/sandbox/motion/branch-loop.json`: 개념 장면 Checkpoint 추가
- 화면: `explorer.html` (Play 링크)
- 문서: `docs/FLOW_SPEC_v0.1.md`(6장 3D 콘텐츠), `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`

## 4. 게임 진행 상태 머신
상태: `loading`, `ready`, `waiting_input`, `checking`, `transitioning`, `waiting_choice`, `paused`, `completed`, `error`

허용 입력과 전이는 `gameplay-state.js`의 `ALLOWED`와 `NEXT` 표에 있다. 표에 없는 전이는 거절하고 기록한다.

| 문제 | 막는 방법 |
|---|---|
| Enter 중복 | `typing-input` 200 ms 간격 + 잠금. 상태가 `checking`이면 `submit`을 허용하지 않는다. Enter 3번과 제출 버튼 2번을 눌러도 Python 판정 요청은 1번이었다. |
| 판정 중 추가 요청 | `checking`에서 submit, hint, pause 금지 |
| 이동 중 다음 노드 중복 | `transitioning`에서는 입력이 잠긴다. Python도 `moving` 중 제출을 `busy`로 거절한다(이중 잠금). |
| 이전 세션 이벤트 | Python 응답과 이동 결과에 보낸 때의 세션 번호를 확인한다. 재시작 때 `motion.cancelAll()`이 진행 중인 이동을 cancelled로 끝낸다. |
| 초기화 뒤 이동 완료 이벤트 | 위와 같다. Python도 재시작 뒤의 `arrived`를 `ignored`로 처리한다. |
| 일시정지 중 진행 | `pauseAll()`로 이동을 멈추고 학습 시간도 멈춘다. paused에서는 resume, restart, end만 허용한다. |
| 장면 전환 중 입력 | `loading`에서는 입력을 허용하지 않는다. |
| Python 응답 지연 | 응답이 1.5초 늦게 오는 동안 재시작하자, 늦게 온 응답이 `stale`로 버려졌다. |
| 시각적 이동 실패 | 학습을 진행 처리하지 않는다. `error` 상태에서 재시도하거나 마지막 정상 Checkpoint로 복구한다. |

## 5. Python과 3D 엔진의 연결 방식
```
입력 ─▶ lesson.submit(text) ─▶ game.submit (판정)
         │ 오답: view만 (위치 유지)
         │ 정답: game → moving, motion_link.to_motion → [actor_move_to_checkpoint {wait}] 또는 [actor_place_at_checkpoint]
         ▼
JS command-runner 실행 (Actor 이동, 카메라 추적) ─▶ 결과 arrived / cancelled / failed
         ▼
lesson.arrived(status) ─▶ 도착: game.arrive → Edge 이벤트 → 노드 이벤트(var, scene) → 완료 검사
                         실패: moving 유지 → lesson.retry() 또는 lesson.recover()
```
- Python 호출은 입력, 도착, 힌트, 기록 때만 한다. 렌더링 프레임마다 부르지 않는다.
- 진행 규칙(정답, 조건, 순환, 완료, 정답률)은 JS에 없다.

## 6. 콘텐츠 데이터 규격
`docs/FLOW_SPEC_v0.1.md` 6장에 있다.
- Node 필드: node_id, name_ko, name_en, accepted_answers, prompt, reason_prompt, explanation, hint, anatomical_id, anchor_id, checkpoint_id, scene_id, prerequisites, events, source, verification_status, revisit
- Edge 필드: edge_id, source_node, target_node, path_id, checkpoint_id, actor_id, duration, conditions, events, transition_type(move 또는 jump)
- 버전 관리: `version: 2`이면 3D 형식이다. `content_loader.upgrade()`가 별칭을 v0.1 이름으로 바꾼다. v0.1 콘텐츠는 그대로 동작한다(기존 테스트 70개 통과).
- 좌표는 콘텐츠에 없다. 모든 위치는 ID로 Anchor Manager와 Path Engine이 찾는다.

## 7. 구현한 학습 모드
| 모드 | 질문 | 정답 표시 | 3D 다음 위치 강조 | 라벨·진행 목록·Hover |
|---|---|---|---|---|
| 가이드 | prompt | 질문 옆에 한·영 정답 | 함 | 모두 표시 |
| 암기 | prompt | 숨김 (정답 보기 = 힌트 1회) | 함 | 배운 구조만 표시, 나머지 "? ? ?" |
| 기전 추론 | reason_prompt | 숨김 | 하지 않음 | 배운 구조만 표시 |

- **확인:**
  - 암기 모드 진행 목록: 첫 노드만 이름이 보이고 나머지는 "? ? ?"였다.
  - 정답 보기를 누르면 두 후보의 정답과 힌트가 나왔고, 힌트 수가 1이 됐다.
  - 기전 추론 모드에서 강조된 Mesh는 0개, 가이드 모드에서는 2개(우심방 벽·내강)였다.
- 하위 구조 이름(예: "우심방 내강")도 부모 구조가 학습 노드이면 함께 숨긴다.

## 8. 실제 혈액순환 콘텐츠 적용 범위
콘텐츠: 「혈액순환: 정맥 환류에서 체순환까지」. 노드 16개, Edge 16개다.
- **분기:** 정맥 환류 → 상대정맥 또는 하대정맥. 두 대정맥을 순서대로 지나지 않는다. 설명에 "실제로는 동시에 들어온다"고 적었다.
- **3D 이동 (APPROXIMATE)**
  - 상대정맥/하대정맥 → 우심방 → 삼첨판 → 우심실 → 폐동맥판 → 폐동맥
  - 좌심방 → 승모판 → 좌심실 → 대동맥판
- **이동 없는 개념 진행 (PENDING)**
  - 폐 모세혈관: 폐를 지연 로딩해 초점을 맞춘다. 산소화 상태로 바꾼다.
  - 폐정맥, 대동맥: 모델에 초점만 맞춘다.
  - 좌심방: Checkpoint에 바로 놓는다.
- **개념 노드:** 정맥 환류, 전신 조직
- **방향 확인**
  - 폐순환: `current_circulation`이 폐동맥판에서 pulmonary가 된다.
  - 체순환: 대동맥판에서 systemic이 된다.
  - 산소화: 폐 모세혈관에서 oxygenated, 전신 조직에서 deoxygenated가 되고 `completed_cycles`가 1이 된다.
- **끝까지 플레이:** 가이드 모드로 15번 입력해 완료했다(progress 1.0).
  - 경로 구간 하나에 1.5~2.5초가 걸렸다(콘텐츠 duration).
  - 도착할 때마다 해당 구조로 카메라 초점이 옮겨 갔다.

## 9. 해부학적으로 검증된 구조 및 경로
- **해부학적으로 검증된 경로는 없다.**
  - 모든 3D 이동 경로는 Anchor 정점 평균을 이은 APPROXIMATE 경로다(STEP 03-C 기하 검사: 메시 밖 0~7%).
  - 화면의 진행 목록과 설명에 노드마다 "근사 경로", "모델·경로 없음", "개념" 배지를 붙여 구분한다.
- **구조 이름:** BodyParts3D FMA 기반 레지스트리(STEP 03-B)를 쓴다. 의학적 검증 표시는 하지 않았다.
- **강의자료 대조 (2026-11-28 추가):** 사용자가 준 `데이터 베이스.zip`의 강의자료로 대조했다.
  - 대조한 자료: 건강사정 「심장과 혈관」, 약리학 「심혈관계 약물1」, 기본간호학 「산소화 요구」
  - 일치: 순환 순서, 판막 분류, 동맥·정맥 정의와 폐동맥·폐정맥 예외, 모세혈관 교환
  - 추가: 강의 용어 "정맥 귀환", "삼첨판막", "승모판막"을 허용 정답에 넣었다(콘텐츠 0.1.1).
  - 강의자료에 없어 확인하지 못한 내용은 전공자 검토가 필요하다. 첨판 수, 대정맥이 혈액을 모으는 부위, 좌심실 벽 두께, 폐정맥 수 등이다.
  - 자세한 결과는 `docs/development/CONTENT_REVIEW_cardiovascular.md`에 있다.

## 10. 미확보 모델과 미검증 경로
- **모델 없음:** 폐 실질과 폐 모세혈관, 심실 근육 벽, 심실중격(STEP 03-A부터 같음)
- **경로 없음:**
  - 폐동맥 → 폐 안쪽
  - 폐정맥 → 좌심방
  - 대동맥 내부
  - 전신 동맥·정맥
  - 하대정맥과 우심방의 정확한 연결부
- **동작 없음:** 판막 개폐와 심장 박동 (STEP 04)

## 11. 실제 플레이 화면
작업 중 브라우저에서 캡처해 대화에 남겼다. 이미지 파일로 저장하지는 않았다.
- **데스크톱:** 왼쪽 기전 흐름(배지 포함), 가운데 3D(반투명 심장·혈관 안을 지나는 적혈구, 다음 구조 강조), 오른쪽 진행률·정답률·첫 시도·시간·힌트·생리 상태·설명, 아래 입력창
- **모바일 375×812 에뮬레이션**
  - 3D 화면과 하단 입력창, 진행·정보 패널(서랍)을 확인했다.
  - 상단 바 가로 넘침과 진행 기호 스타일 충돌(`.dot` 클래스)을 발견해 고쳤다.

## 12. 학습 기록 저장 결과
- **저장:** 완료하거나 학습을 종료하면 Python `make_record_v2`가 기록을 만들고 LocalStorage(`nurseflow.records.v2`)에 저장한다.
  - 분기·순환 콘텐츠를 완료했을 때의 기록: 암기 모드, 정답률 88.9%(8/9), 첫 시도 85.7%(6/7), 학습 시간 8.8초, 완료 노드 6개, 오답 개념 "순환 A"
- **CSV**
  - 열은 17개다.
  - v0.1 기록(`flowengine.records.v1`)이 있으면 v2 열로 바꿔 함께 내보낸다.
  - 실제 다운로드 버튼은 누르지 않았다. CSV 문자열 생성만 확인했다.
- **저장 공간 오류:** `setItem`이 QuotaExceededError를 내게 했을 때 "저장 공간이 부족합니다"를 표시했고 게임은 완료 화면까지 갔다.
- **정답률 정의:** 전체 시도 정답률과 첫 시도 정답률은 FLOW_SPEC 6장에 문서화했다.

## 13. 단위 테스트 결과
| 테스트 | 결과 |
|---|---|
| `tests/test_sandbox3d.py` | 38 통과 |
| `tests/test_scene_commands.py` | 30 통과 |
| `tests/test_engine.py` (v0.1 규칙 엔진) | 70 통과 |
| `tests/test_motion_commands.py` | 29 통과 |
| 신규 `tests/test_lesson.py` | 49 통과 (강의 용어 대조 뒤 51) |
| `tools/asset-processing/test_bp3d_tools.py` | 13 통과 |
| `tests/motion-tests.html` (브라우저) | 28/28 통과 |

## 14. 브라우저 테스트
| 시나리오 | 항목 | 결과 |
|---|---|---|
| A Basic Gameplay | 실제 키 입력(클릭, 입력, Enter)으로 정답 → 이동(1.2 s) → 다음 문제 → 완료 | PASS |
| B Wrong Answer | 오답이면 위치(진행률 0.000)와 노드 유지, 오답 수 1, 다시 입력하면 진행 | PASS |
| C Korean IME | 조합 중 Enter는 판정 0회, 조합이 끝나면 완성된 값 1회 제출, Enter 연타는 1회만 | PASS (합성 이벤트) / 실제 OS 한글 IME: NOT TESTED |
| D Branch & Cycle | 입력으로 분기 선택, 조건(laps<2)에 따라 후보 제한, 순환 2바퀴, 출구 조건, 명시적 완료, 고르지 않은 가지는 진행률 제외 | PASS |
| E Async Safety | 연속 입력, 이동 중 일시정지(이동 0 m, 시계 정지), 이동 중 재시작(stale), 이동 중 콘텐츠 변경(stale), Python 응답 지연 + 재시작(stale), 이동 취소 → 재시도 성공, 이동 취소 → 마지막 정상 위치 복구 | PASS |
| F Anatomy Gameplay | 실제 모델 로딩, 근사 경로 이동, 문제와 구조 연결, 도착 시 구조 초점, 폐 지연 로딩, 산소화 상태 변경 | PASS (경로는 APPROXIMATE) |

**완료 기준 18개**

| # | 항목 | 결과 |
|---|---|---|
| 1 | 기존 엔진 기능 유지 | PASS (16장) |
| 2 | 기존 Python 단위 테스트 | PASS |
| 3 | Play 화면에 실제 3D 모델 표시 | PASS |
| 4 | 가이드 모드 | PASS |
| 5 | 암기 모드 | PASS |
| 6 | 기전 추론 모드 | PASS |
| 7 | 한글·영문 정답 입력 | PASS (한글, 영문, 약어 SVC, 띄어쓰기 허용, 전각 문자 정규화) |
| 8 | 오답 시 위치 유지 | PASS |
| 9 | 정답 시 다음 Checkpoint로 이동 | PASS |
| 10 | 이동 완료 뒤 다음 문제 | PASS |
| 11 | 카메라 추적과 자유 탐색 전환 | PASS (자동은 follow, 자유는 카메라 이동 0, 애니메이션 줄이기는 추적 없음) |
| 12 | 분기형·순환형 테스트 콘텐츠 | PASS |
| 13 | 일시정지와 재시작 | PASS |
| 14 | 학습 완료 화면 | PASS (기전, 완료 여부, 시간, 정답률, 첫 시도, 오답, 힌트, 구조 목록, 오답 개념, 복습, 다시 플레이·다른 모드) |
| 15 | 기록 저장과 CSV 내보내기 | 저장 PASS / CSV 문자열 PASS / 파일 다운로드 NOT TESTED |
| 16 | 잘못된 콘텐츠 오류 처리 | PASS (3D 연결 오류 3개, 규칙 오류 2개, 알 수 없는 이벤트, 순환 경고. 이후 정상 콘텐츠를 다시 불러옴) |
| 17 | GitHub Pages 하위 경로 | NOT TESTED (상대 경로만 사용. 배포 전이라 확인하지 않음) |
| 18 | 검증된 구간과 미검증 구간 구분 | PASS (노드별 배지, 콘텐츠 안내문, PENDING 구간 jump) |

## 15. 성능 측정 결과
| 항목 | 값 |
|---|---|
| Play 첫 로딩 (해부학 콘텐츠, 모델·경로·Python 준비 포함, Pyodide 캐시 있음) | 1,548 ms |
| Python 호출 왕복 (`lesson.peek` 20회) | 중앙값 0.1 ms, 최대 2.1 ms |
| Python `lesson.view` | 중앙값 0.4 ms |
| 정답 → 도착 | 콘텐츠 duration(1.5~2.5 s) + Python 수 ms. jump 구간은 1~10 ms |
| 렌더링 (반투명 벽, 폐 로딩 전) | draw 45, 삼각형 346,302 |
| FPS | 창이 보일 때 측정값 없음(이번 측정은 창이 숨겨진 상태라 약 10). STEP 03-C에서 같은 장면을 측정했을 때 약 30이었다. |

- 반투명 벽(기본 0.55)이라 삼각형 수가 불투명할 때보다 늘었다. 양면 반투명은 두 번 그린다.
- 탭이 비활성이면 브라우저가 렌더링을 멈춘다. 이동도 멈추고, 학습 시간도 멈춘다(visibilitychange). 게임은 이동 완료를 기다리므로 상태가 어긋나지 않았다.
- 모바일 GPU와 실제 기기 FPS는 측정하지 않았다(NOT TESTED).

## 16. 기존 기능 회귀 테스트 결과
- **Sandbox (STEP 02)**
  - scene_d 데모: 8개 적용
  - 오류 테스트: 1개 적용, 6개 실패
  - 객체 수: a 5, b 17, c 10, step01 3, e 36, motion_f 1, motion_g 5
  - Python route_demo 동작, 오류 로그 없음
- **Explorer (STEP 03-B·C)**
  - 구조 41개, Anchor 11개, 검색 정상
  - 개발자 모드 경로 6개, 기술 검증 오류 0, 적혈구 이동 arrived
  - 오류 로그 없음
- **이동 엔진:** `motion-tests.html` 28/28

## 17. 미해결 문제
- **해부학 경로:** 모든 3D 경로가 APPROXIMATE다. 폐 순환과 대동맥 이후 구간은 PENDING이다.
- **카메라:** 추적 카메라가 심장 안쪽에 있을 때 벽 때문에 시야가 좁다. 기본 반투명(0.55)으로 줄였지만 단면이나 고스트 연출을 더 다듬어야 한다.
- **실제 환경 미검증:** 실제 OS 한글 IME 조합, 실제 모바일 키보드(visualViewport 대응 코드만 있음), 실제 기기 터치
- **기록 위치:** 학습 기록은 이 브라우저에만 있다(로그인·동기화 없음, 범위 밖).
- **기하 검사:** Explorer에서 2.5초 동안 화면이 멈춘다(개발자 기능).
- **실패 후 재정답 통계:** 이동 실패를 복구한 뒤 같은 문제를 다시 맞히면 정답 제출 수가 늘어난다. 정답률 분모에 이동 실패가 섞이는 셈이라 문서에 정의로 적었다.

## 18. STEP 04 개발 준비 상태
- **확장 지점:**
  - 3D 이벤트(`scene` + sequential/parallel/required)
  - 생리 상태 변수(산소화, 순환, 현재 구조, 순환 횟수)
  - Actor 상태별 재질
- **추가 방식:** 박동·판막 같은 끝나지 않는 연출은 parallel 이벤트로 붙인다.
- **필요한 것**
  - 내강 중심선 기반 경로: 폐정맥, 대동맥, 폐 순환
  - 라이선스가 확인된 판막·심근 모델 또는 자체 애니메이션
  - 다른 계통 콘텐츠: 소화, 호흡, 비뇨, 림프
