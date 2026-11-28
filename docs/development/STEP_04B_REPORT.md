# STEP 04-B 보고서: 생리 애니메이션과 장기 변형 엔진

- **작성일:** 2026-11-28
- **범위**
  - 범용 Animation Manager, Timeline Engine, Morph·Deformation, 구조 상태(판막·혈관), Material 애니메이션, Model Transition
  - 경량 Animation Editor
  - 심장주기 개념 모델과 학습 콘텐츠
  - Play 생리 단계 패널(자유 관찰)
- **의학적 검증:** 이번 단계의 모델·애니메이션은 전문가 검토를 받지 않았다. 심장주기 모델은 직접 만든 개념 모델(CONCEPTUAL)이다. 단계 시간·모양·배율은 교육용 값이며 압력·용적·혈류역학 계산이 아니다.
- **Git:** 커밋·푸시·배포는 하지 않았다(사용자 승인 대기).

검증을 다섯 가지로 나눠 적는다.

| 구분 | 이번 단계 |
|---|---|
| 기술적 작동 | 테스트로 확인 (14·15장) |
| 강의자료와의 일치 | 단계 순서·판막 상태·심음을 쪽 번호로 대조 (2장) |
| 해부학적 정확성 | 개념 모델이라 해당 없음. 실제 모델은 바꾸지 않았다. |
| 생리학적 정확성 | 단계 순서와 판막 논리만 자료와 맞췄다. 시간·크기·압력은 검증하지 않았다. |
| 실제 전문가 검토 | 받지 않음 |

---

## 1. STEP 04-A 구현 검토 결과
04-A 보고서를 믿지 않고 코드와 화면으로 다시 확인했다.

| 04-A 기능 | 상태 | 04-B에서 한 일 |
|---|---|---|
| 중심선 경로 9개 (GEOMETRY_CHECKED) | 작동 (Play 혈액순환 처음부터 끝까지 재실행) | 없음 |
| 다중 스케일(scale-manager), 폐·조직 개념 장면 | 작동 | 심장주기 개념 모델을 같은 방식으로 스케일 장면에 등록 |
| 심장 내부 보기 | 작동 | 개념 장면에는 자동 단면을 적용하지 않게 조건 수정 |
| 명령 묶음 취소 처리, 일시정지 gameHold | 작동 | 애니메이션·타임라인도 같은 일시정지에 연결 |
| 부족했던 점 | GLB 클립 이름만 보고하고 재생 기능이 없었다. 장면 이벤트는 Python이 진행한 **뒤에** 실행되어 "필수 애니메이션 실패 시 진행 안 함"을 지킬 수 없었다. | Edge `timeline_id`로 필수 애니메이션을 이동 명령 묶음에 넣었다 (4장) |

## 2. 실제 활용한 강의자료와 관련 페이지
원문은 `references/`(Git 제외)에만 있다. 로컬 분석 문서는 `references/nursing/analysis/CARDIAC_CYCLE_ANALYSIS.md`다.

| 자료 | 쪽 | 쓴 내용 |
|---|---|---|
| 건강사정 6장 「심장과 혈관」 (HA6) | p5 그림 | 심장주기 5단계 표: 단계별 심방·심실 상태, 압력 관계, 판막 상태. 이미지를 직접 판독했다. |
| HA6 | p5 본문, p17, p19 | 수축기 = 그림 ②③, 이완기 = ①④⑤. S1·S2·S3·S4 시점 |
| 성인간호학 상권 (교재) | p614 | 확장기 4구분(등용적성 심실확장기, 빠른·느린 심실충만기, 심방수축기)과 판막·압력. EDV 120, ESV 50, SV 70 mL(그림 15-7). 방실결절 지연 |
| 교재 | p610 | 반월판은 수축기에 열리고 확장기에 닫힌다 |
| 기본간호학 「산소화 요구」 | p7 | 심장주기 순서 나열("등장성" 표기). 정답 동의어로만 썼다. |
| 약리 9주차 | p28–31, p59 | 혈관 평활근 칼슘 통로와 수축, 동방·방실결절 전도 (혈관 수축 시험 장면 설명의 배경) |

- **자료에 없어서 쓰지 않은 것**
  - 단계별 지속시간
  - 압력 수치(mmHg)
  - 첨판의 실제 움직임 형태
  - 혈관 수축 배율
- **누락 쪽:** 교재 p612–613(전도계 그림, 수축기 하위 단계)은 스캔에 없다.
- **자료와 다르게 쓰지 않은 것:** 판막은 압력 차이로 열리고 닫힌다. 설명에도 근육이 판막을 여닫는다는 표현을 쓰지 않았다.

## 3. Animation Manager 구현 결과 (`js/animation/animation-manager.js`)
- **종류:** transform, morph, clip(GLB AnimationClip), material, visibility, deform, procedural(pulse, morph_cycle, deform_cycle)
- **조작:** 등록(define/load), 재생, 일시정지, 재개, 정지(복원 선택), 반복(횟수·무한), 속도, 구간 이동, 역방향, 가중치, 완료·종료 이벤트, 취소, `cancelAll`(session 증가), 장면 해제(`unload`: Mixer 해제)
- **GLB 클립**
  - scene-manager의 `model` 이벤트가 클립을 넘기면 자동으로 인식한다. 모델마다 AnimationMixer는 하나만 만든다.
  - 시간은 엔진이 직접 맞춘다(`action.time` + `mixer.update(0)`). 그래서 일시정지, 구간 이동, 역방향이 다른 종류와 같은 방식으로 동작한다.
- **렌더링 루프:** 기존 루프의 `kit.tick(dt)`에서만 진행한다. 경로·이동 갱신보다 먼저 부른다. dt는 0.25초로 잘라 탭이 비활성이었다가 돌아올 때 크게 건너뛰지 않는다.
- **안정성**
  - 같은 ID를 다시 재생하면 이전 재생이 `replaced`로 끝난다(누적 방지).
  - 대상 객체가 사라지면 `failed`가 된다.
  - 게임 일시정지 중에 시작한 재생도 멈춘다.
  - 애니메이션 줄이기 옵션: 한 번 재생하는 애니메이션은 바로 끝 상태로 가고, 반복 장식은 멈춘다.
- **확인 (GLB 시험 모델 `assets/animations/anim-test.glb`, Sandbox AA)**
  - `Spin`: 노드 회전
  - `Inflate`: Morph 가중치
  - `Flap`: 뼈 회전
  - 세 클립 모두 재생되고, Mixer는 1개였다.

## 4. Timeline Engine 구현 결과 (`js/animation/animation-timeline.js`)
- **단계 종류:** animation, state(구조 상태), command(명령), delay, parallel, sequence, repeat, if(보이는 상태 조건), marker(중간 이벤트·단계 표시)
- **Blocking과 Non-blocking**
  - 타임라인 `blocking`: 끝까지 기다린다.
  - 단계 `wait:false`: 기다리지 않는 장식이다. 끝나지 않아도 타임라인은 끝난다(시험 확인).
- **학습 연결**
  - Python Edge `timeline_id`: motion_link가 이동 명령 뒤에 `timeline_play(wait)`를 붙인다.
  - 끝나야 `lesson.arrived`가 불린다. 실패·취소면 Python이 `moving`에 남는다. 다음 단계는 재시도(retry)나 복구(recover)다.
  - 노드 도착 이벤트는 Python이 이미 진행한 뒤라 필수 애니메이션을 거기에 두지 않는다.
- **일시정지·취소·세션**
  - 일시정지: 지연과 애니메이션이 모두 멈추고, 그동안 시작된 것도 멈춘다.
  - 취소: 남은 단계를 실행하지 않고, `restore_on_cancel`이면 시작 전 구조 상태로 되돌린다.
  - `cancelAll`: session을 올려 이전 타임라인의 남은 단계를 막는다.
- **닫힌 판막 통과 방지:** command 단계의 `through`에 적은 구조가 OPEN이 아니면 실행하지 않고 실패한다(시험 확인).

## 5. Morph 및 Deformation Engine 구현 결과
- **morph-controller**
  - 가중치를 이름 또는 번호로 바꾼다. 여러 Target을 혼합할 수 있다.
  - 처음 가중치를 기억해 복원한다.
  - `deformedVertex`: 변형이 반영된 정점 위치를 계산한다.
- **deformation-controller**
  - 관을 중심선 곡선으로 만들고, 정점마다 중심점·방향·기준 반지름을 기억한다.
  - 반지름 배율만 바꾸므로 중심선과 길이가 그대로다. 객체 전체 Scale을 바꾸지 않는다.
- **자체 제작 시험 모델** (모두 `concept-model-builder.js`가 JSON으로 만든다)
  - 팽창하는 구: Morph inflate, stretch
  - 원통형 혈관: deform
  - 수축·이완하는 장기: Morph contract, 반복 procedural
  - 두 상태 조직: 모델 전환
- **변형과 Anchor·Path의 관계**
  - Object-local Anchor와 `object_local` 경로 점은 객체 Transform만 따라가고 Mesh 변형은 따라가지 않는다(시험: 로컬 경로 2.000 m 그대로).
  - 변형을 따라가야 하는 점에는 새 점 형식 `{space:'mesh_vertex', object_id, vertex_index}`를 쓴다. Morph 가중치가 바뀌면 곡선을 다시 계산한다(시험: 2.000 → 2.500 m).
  - 혈관 변형 뒤 경로 길이는 1e-9 m 안에서 같았고, 고리 중심은 중심선에서 0.000 mm 벗어났다.
- **Material 애니메이션:** 별도 모듈을 만들지 않았다. material-controller 상태 층에 `getState`/`setState`를 더했다. 취소하면 이전 색(예: 산소화 상태 색)으로 돌아가고 선택 강조는 그대로다(시험 확인).
- **Model Transition (`model-transition.js`)**
  - swap, fade, crossfade 방식을 지원한다. 논리 ID는 그대로 유지한다.
  - 새 모델 불러오기 훅(loadModel)과 이전 모델 해제(remove_old)를 넣었다.
  - 이번에는 시험 모델로 Crossfade만 확인했다.

## 6. 심장 모델의 애니메이션 가능 여부 (BodyParts3D `heart.glb`)
| 요소 | 독립 구조 | 종류 | 변형 가능성 |
|---|---|---|---|
| 우심방·좌심방 | 있음 | 벽(Wall) + 내강(Cavity) 각각 | 벽 리깅 없음. Morph 없음 |
| 우심실·좌심실 | 내강만 | Cavity (빈 공간 표면) | 근육 벽이 없어 수축 모양을 만들 근거가 없음 |
| 심방 근육 벽 | 있음 (심방 벽) | 표면 | Morph·뼈 없음 |
| 심실 근육 벽, 심실중격 | **없음** | - | - |
| 판막 4개 | 있음 | 첨판 단위 메시 (삼첨판 3, 승모판 2, 폐동맥판 3, 대동맥판 3) | 경첩·리깅 없음 |
| GLB 내장 애니메이션 | 없음 (모델 로그: 애니메이션 []) | - | - |

- **선택한 방식:** 후보 1~5 중 4번과 5번이다.
  - 실제 모델은 억지로 변형하지 않았다. 판막은 상태 색으로만 표시한다(4번의 "검증 가능한 부분 구조 표시").
  - 개폐·수축 모양은 별도의 교육용 개념 모델로 보여 준다(5번).
- **2·3번(Blender Morph·리깅)을 하지 않은 이유:** 심실 벽이 없어 근거가 없고, 첨판 경첩 위치를 자료로 확인할 수 없다.

## 7. 심장주기 애니메이션 구현 범위
- **콘텐츠:** `content/lessons/cardiac-cycle/cardiac-cycle.json` (6노드: 시작 + 5단계)
- **애니메이션 데이터:** `content/animations/cardiac-concept.json` (애니메이션 22, 구조 4, 타임라인 7)
- **생성기:** `tools/content/make_cardiac_concept.py`, `make_cardiac_lesson.py`
- **단계** (HA6 p5 그림 번호)

| 단계 | 판막 (방실 / 반월) | 형태 변화 | 혈액 이동 |
|---|---|---|---|
| ⑤ 후기 심실확장기 (심실 충만기) | OPEN / CLOSED | 심실 이완 | 좌·우 심방 → 심실 (승모판·삼첨판 통과) |
| ① 심방수축기 | OPEN / CLOSED | 심방 수축 뒤 이완 | 마지막 충만 |
| ② 전기 심실수축기 (등용적 수축) | CLOSED / CLOSED | 용적 그대로, 심실 "압력 상승" 색 | 판막 통과 없음 |
| ③ 후기 심실수축기 (심실 박출) | CLOSED / OPEN | 심실 수축, 대동맥·폐동맥 맥동(장식, Non-blocking) | 심실 → 대동맥·폐동맥줄기 |
| ④ 전기 심실확장기 (등용적 이완) | CLOSED / CLOSED | 용적 그대로, 색 원래대로 | 판막 통과 없음 |

- 좌·우 심장은 같은 단계로 함께 움직인다(학습 적혈구 `rbc_01`은 왼쪽, 장식 적혈구 `rbc_right`는 오른쪽).
- 화면 표시는 생리 단계 패널(19장)과 변수에 나온다. 표시 항목: 심방, 심실, 방실판막, 반월판막, 혈액 이동, 압력 관계, 심음, 근거 쪽
- 정밀 압력·용적 계산과 심박수 연동은 하지 않았다(04-C).

## 8. 판막 개폐 구현 방식
- **구조 상태(`visual-state.js`)**
  - 판막 4개를 따로 관리한다. 상태는 OPEN, CLOSED, OPENING, CLOSING이다.
  - 전환 중에는 OPENING·CLOSING을 보여 준다. 취소되면 이전 상태로 돌아간다.
- **개념 모델 첨판**
  - 첨판 n개를 한 Geometry로 합쳤다.
  - Morph `open`이 첨판을 고리 가장자리(경첩)를 축으로 72° 젖힌다(열림 350 ms, 닫힘 300 ms, 교육용 값).
  - 판막 전체를 돌리거나 사라지게 하는 방식이 아니다.
- **실제 모델:** BodyParts3D 판막은 상태 색으로만 표시한다(OPEN 초록, CLOSED 회색, 전환 중 노랑·주황). 화면 설명에 "움직이지 않음"을 적었다.
- **수동적 구조:** 판막은 타임라인의 state 단계로만 바뀐다. 상태표는 HA6 p5의 압력 관계 행과 같은 단계에 맞췄다.
- **심음:** 패널에 S1(방실판막 닫힘), S2(반월판막 닫힘), S3, S4를 단계별로 글로 표시한다. 소리는 내지 않는다.

## 9. 혈액 이동과 심장 박동 동기화
- 기존 Actor Engine과 Path Engine을 그대로 쓴다. 개념 모델 경로 4개는 CONCEPTUAL이다.
- **판막 상태와 이동의 연동**
  - 타임라인 command 단계에 `through: ['valve.mitral']`처럼 지나는 판막을 적는다. 그 판막이 OPEN이 아니면 이동하지 않고 실패한다.
  - Python 테스트가 콘텐츠 일관성을 검사한다: 판막 통과 5곳이 모두 그 단계에서 OPEN이고, 등용적 단계에는 판막 통과 이동이 없다.
- **혈액순환 콘텐츠와 구분**
  - 혈액순환: 입력에 따라 해부 모델 경로를 단계적으로 이동한다.
  - 심장주기: 정답이면 그 단계 타임라인이 판막·형태·이동을 시간에 맞춰 함께 실행한다.
- **복구**
  - 타임라인이 실패·취소되면 오류 상태가 된다.
  - 복구하면 마지막 정상 단계의 모양(판막, Morph, 색, Actor 위치)으로 즉시 돌아간다(`applyPhaseEnd`).
- 실제 혈류역학을 계산했다고 표시하지 않는다(콘텐츠 verification_note, 패널 설명).

## 10. 혈관 수축 및 확장 구현 결과 (Sandbox AE)
- **상태:** BASELINE / VASOCONSTRICTION / VASODILATION (구조 `vessel.test_tone`). 전환마다 deform 애니메이션이 있다.
- **배율:** 기준 반지름 0.16 m → 수축 0.096 m(0.6배) → 확장 0.216 m(1.35배) → 복원 0.16 m. 배율은 교육용 값이다.
- **중심선 유지:** 반지름이 바뀌어도 경로 길이가 같고, 혈관 안에서 움직이는 적혈구는 같은 중심선 위에 있다(400점 표본 기준 1.5 mm 안, 표본 간격 약 9 mm).
- 저항·혈압과의 정량 관계는 04-C에서 다룬다.

## 11. Animation Editor 실행 화면 (Sandbox 오른쪽 "Animation" 패널)
- **목록**
  - 애니메이션마다 상태·종류·진행률과 ▶ ⏸ ■ 버튼이 있다.
  - 타임라인마다 Blocking 여부와 ▶ ⏸ ✕ 버튼이 있다.
  - 구조마다 상태를 고르는 메뉴가 있다.
- **편집**
  - 대상 객체, 종류, AnimationClip, Morph Target, 재생시간(ms), 반복 횟수(빈칸 = 무한), easing
  - Keyframe 추가·수정·삭제, "현재 상태로 Keyframe", "시작 상태 = 현재", "끝 상태 = 현재"
  - 타임라인 위치 슬라이더, 적용, 미리보기, 일시정지, 초기화
- **타임라인 편집:** JSON을 고친 뒤 검사·적용하고 미리보기한다(순차·병렬·지연·반복).
- **JSON:** 내보내기와 불러오기가 있다. 내보낸 파일을 다시 불러오면 같은 정의가 되는 것을 확인했다(AE).
- **화면 캡처:** AD 장면(박출 중간: 반월판 초록, 방실판 회색, 심실 압력 색)과 Play 모바일 화면을 이 세션에서 확인했다. 파일로 저장하지 않았다.

## 12. 실제 모델과 교육용 모델 구분
| 대상 | 종류 | 화면 표시 |
|---|---|---|
| BodyParts3D 심장·혈관 | 실제 해부 모델 (CC BY 4.0) | 출처 표기. 판막은 상태 색만 |
| 심장주기 개념 모델 `concept.cardiac` | CONCEPTUAL | 스케일 표시에 "개념 모델" 배지, 패널에 "교육용 값, 계산 아님" |
| 시험 모델 (`test.*`, `anim-test.glb`) | TEST | Sandbox 전용 |
| 폐·조직 모세혈관 (04-A) | CONCEPTUAL | 그대로 |

- 레지스트리 type도 개념 모델은 `concept`이다. 자산은 `asset_registry.csv`(nf-anim-test, nf-cardiac-concept)와 `assets/licenses/nf-animation-models.md`에 기록했다.

## 13. 추가 및 수정된 파일
**새 파일**
- `js/animation/`
  - animation-manager.js, animation-timeline.js
  - morph-controller.js, deformation-controller.js, visual-state.js
  - model-transition.js, concept-model-builder.js
  - animation-commands.js, animation-kit.js, animation-editor.js
- `js/play/cycle-panel.js`
- 콘텐츠
  - `content/animations/` (cardiac-concept, test-basic, test-morph, test-timeline, test-vessel)
  - `content/lessons/cardiac-cycle/cardiac-cycle.json`
- 자산·도구
  - `assets/animations/anim-test.glb` + meta
  - `tools/blender/make_anim_test_glb.py`
  - `tools/content/make_cardiac_concept.py`, `make_cardiac_lesson.py`, `make_animation_tests.py`
- 테스트: `tests/animation-tests.{js,html}`, `tests/test_cardiac_cycle.py`
- 문서: `assets/licenses/nf-animation-models.md`, 이 보고서

**수정**
- 엔진
  - `command-runner.js`: ctx.animation
  - `material-controller.js`: getState/setState
  - `resource-tracker.js`: Skeleton 해제
  - `scene-manager.js`: 클립 전달
  - `path-engine.js`: mesh_vertex 점
- Sandbox: `main.js`, `index.html`, `content/sandbox/scenes.json`(AA~AE), `css/style.css`
- Play
  - `play-engine.js`: 애니메이션 kit, 개념 장면 등록, 단계 모양 복원, 개념 장면 카메라
  - `gameplay-controller.js`: 타임라인 검증, 일시정지·재시작·복구 연동
  - `gameplay-ui.js`, `play-main.js`, `play.html`, `css/play.css`
- Python
  - `scene_commands.py`: ANIMATION 검사, set_animations
  - `content_loader.py`: timeline_id, visual_state
  - `game.py`, `motion_link.py`: 타임라인 명령
  - `lesson.py`: 복구 시 visual_state
- Worker: `py-worker.js`(허용 함수), `py-client.js`(WORKER_VERSION 04b-1)
- 문서: CLAUDE.md, README, FLOW_SPEC 7장, asset_registry.csv, `content/lessons/index.json`

## 14. 단위 테스트 결과 (Python, 실제 실행)
| 테스트 | 결과 |
|---|---|
| test_sandbox3d | 38/38 |
| test_scene_commands | 30/30 |
| test_engine | 70/70 |
| test_motion_commands | 37/37 |
| test_lesson | 63/63 |
| **test_cardiac_cycle (새)** | **27/27**: 콘텐츠 검증, 단계 순서, 판막 상태표, 판막 통과 일관성, 오답·실패·재시도·복구·완료, 애니메이션 명령 검사 |
| bp3d tools | 13/13 |

## 15. 브라우저 테스트 결과 (앱 내장 브라우저, 데스크톱)
| 항목 | 결과 |
|---|---|
| `tests/animation-tests.html` (새) | 26/26: Transform, 반복, 누적 방지, 대상 삭제, cancelAll, 클립·Mixer, Morph·혼합·복원, mesh_vertex 경로, 혈관 변형, 판막 상태, 타임라인 순차·병렬·반복·Blocking·닫힌 판막·일시정지·취소 복원, 재질 복원, 모델 전환, 명령 검증, 애니메이션 줄이기, 게임 일시정지, Skeleton 해제 |
| `tests/motion-tests.html` | 32/32 |
| 1. 기존 테스트 | PASS (위) |
| 2. 혈액순환 콘텐츠 | PASS: 가이드 모드 처음부터 끝까지, 폐·조직 장면 전환 포함 |
| 3. GLB 내장 애니메이션 | PASS (Sandbox AA, Spin·Inflate·Flap) |
| 4. Morph 형태 변환 | PASS |
| 5·6. 순차·병렬, Blocking·Non-blocking | PASS |
| 7. 반복 애니메이션 중 학습 진행 | PASS: 박출 단계의 맥동 장식이 도는 중에도 다음 문제로 진행 |
| 8. 일시정지·재개 | PASS: 충만 타임라인 중간 일시정지 → Actor 정지 → 재개 → 완료 |
| 9·10·11. 단계 표시, 판막 동기화, 혈액 이동 연동 | PASS: 단계별 판막 OOCC → OOCC → CCCC → CCOO → CCCC, 심실 Morph 0 → 1, 닫힌 승모판 통과 시도는 실패 |
| 12. 혈관 수축·확장 | PASS (Sandbox AE) |
| 13. 변형 모델의 Anchor·Path | PASS (시험 4번) |
| 14. 애니메이션 편집·JSON 내보내기 | PASS: 내보내기 → 불러오기 동일, 새 정의 검증 |
| 15. 정답 입력과 애니메이션 | PASS: 오답은 그대로, 정답 → 필수 타임라인 → 다음 문제 |
| 16. 취소 후 복구 | PASS: 등용적 수축 타임라인 취소 → error, Python은 이전 단계 moving 유지, 판막 복원 → 복구 → 재입력 진행 |
| 17. 장면 전환 리소스 | PASS (수정 후): AD↔A, AA↔A 반복 시 GPU geometry 21↔7, 6↔6, texture 2↔0. 수정 전에는 AA를 불러올 때마다 텍스처가 1개씩 남았다 (Skeleton boneTexture). |
| 18. GitHub Pages 호환 | 부분 PASS (모의). 배포될 파일 165개만 `/anatomy-flow/` 하위 경로로 띄워 심장주기 레슨을 열었다. 요청 59개가 모두 200이고, 콘텐츠 3D 검증 오류 0, 개념 장면 전환, 첫 정답 뒤 판막 OPENING까지 확인했다. 그 탭은 창이 가려져 프레임이 0이라 끝까지 진행하지 못했다. 같은 코드의 처음부터 끝까지 진행은 localhost에서 확인했다(15번). 실제 Pages 배포본은 NOT TESTED (푸시 안 함) |
| 프레임이 멈춘 탭 | 애니메이션·이동은 렌더링 프레임으로만 진행하므로, 프레임이 없으면 타임라인은 건너뛰지 않고 기다린다(학습이 앞서가지 않음). 탭이 다시 보이면 dt를 0.25초로 잘라 이어서 진행한다. |
| 19. 모바일 레이아웃 | 에뮬레이션(375×812)만 확인: 가로 넘침 없음. 패널을 화면 위쪽에 접힌 상태로 두어 모델을 가리지 않게 수정 |
| 모바일 성능·실기기 | **NOT TESTED** |
| 20. 검증 상태 표시 | PASS: 개념 모델 배지, 노드 상태 CONCEPTUAL, 패널 설명 |
| 자유 관찰이 학습 상태를 바꾸지 않음 | PASS: 관찰 전후 `lesson.view()` 결과가 같음. 관찰 중 입력 막힘. 암기 모드에서 관찰 중 단계 이름 숨김 |
| 기전 추론 모드 | NOT TESTED (심장주기 레슨에서 실행하지 않음) |
| 실제 한글 IME | NOT TESTED |

## 16. 성능 측정 결과
- **측정 환경:** Play 심장주기 레슨, 자유 관찰로 5단계 한 바퀴(7.8초, 프레임 235개). 앱 내장 브라우저이고 창이 가려진 상태였다.
- 애니메이션 tick(CPU, 매 프레임): 평균 0.26 ms, p95 1.1 ms, 최대 1.5 ms
- 렌더 호출(CPU 쪽): 평균 0.9 ms, 최대 1.7 ms
- draw call 44, 삼각형 342,382 (실제 모델 + 개념 모델이 함께 장면에 있음), GPU geometry 24
- FPS: **NOT MEASURED**. 창이 가려진 상태에서는 rAF가 제한되어 의미 있는 값이 아니다.
- **비용 원인:** 맥동 장식(deform_cycle)이 매 프레임 관 정점과 법선을 다시 계산하는 것이 가장 크다(최대 1.5 ms). 장식을 많이 쓰려면 셰이더 변형으로 바꾸는 것을 검토한다(04-D).
- 반복 재생 누적 없음, Mixer 중복 없음, 장면 전환 뒤 리소스 증가 없음(15장 17번).

## 17. 의학적으로 검토되지 않은 부분
- 심장주기 개념 모델의 모양·크기, 심실 수축 배율(0.76배 등), 첨판 젖힘 각도(72°)
- 단계 지속시간(ms)과 단계 사이 비율. 자료에 없다.
- "압력 상승" 색 표시: 압력 수치나 곡선이 아니다.
- 좌·우 심장이 완전히 같은 시각에 움직이는 표현(단순화)
- 혈관 수축·확장 배율(0.6배, 1.35배)
- 정답 동의어 "등장성 수축기·이완기": 기본간호학 자료 표기를 그대로 받았다. 생리학 용어로 맞는지 전문가 확인이 필요하다.

## 18. 추가로 필요한 3D 모델
- 심실 근육 벽과 심실중격이 있는 심장 모델 (라이선스 확인, 예: Z-Anatomy CC BY-SA 검토)
- 첨판 경첩·힘줄끈·유두근이 리깅된 판막 모델
- 전도계 경로(동방결절~푸르키네) 표시용 모델 또는 Anchor
- 세동맥·평활근이 보이는 혈관 단면 모델 (혈관 수축 콘텐츠)

## 19. 현재 제한 사항
- 실제 모델(BodyParts3D)은 움직이지 않는다. 판막 상태는 색으로만 표시한다.
- 심장주기 콘텐츠는 한 바퀴로 끝난다. 반복 관찰은 자유 관찰의 자동 재생으로 한다.
- Blender Morph·리깅 작업은 하지 않았다. 시험 GLB만 만들었다.
- Model Transition은 시험 모델로만 확인했다. 새 모델 불러오기(loadModel 훅)는 Play에서 연결하지 않았다.
- 편집기는 Keyframe 값을 JSON 문자열로 고친다. 3D 화면에서 끌어서 고치는 기능은 없다.
- 장식 맥동은 CPU 정점 갱신이다(16장).
- FPS와 실제 모바일은 측정하지 않았다.

## 20. STEP 04-C 개발 준비 상태
| 04-C 항목 | 준비된 것 | 남은 것 |
|---|---|---|
| 연속 생리 변수 | Python 변수·이벤트, 단계 변수(phase, 판막) | 범위·단위·정상값이 있는 수치 변수 |
| 인과 규칙 | Edge 조건, Python 판단 → JS 실행 구조 | 원인 → 결과 표, 이벤트 단위 계산 |
| 시각 연결 | 구조 상태(`set_biological_visual_state`), 혈관 BASELINE·수축·확장, 재질 상태 색, Morph·가중치 | 변수 값을 애니메이션 가중치·배율로 바꾸는 규칙 |
| 피드백 | 타임라인 조건(if), marker | 음성되먹임 노드, 보상 경로 |
| 심박수 | 타임라인 speed, 애니메이션 playback_rate | 심박수 변수와 단계 시간 연결(교육용으로 표시) |
| 필요한 결정 | - | 심장 모델 추가(18장), 압력·용적 수치의 근거 자료 |
