# STEP 04-C 보고서 — 생리 상태·인과·되먹임 엔진

- 작성일: 2026-11-29
- 범위:
  - Python 범용 생리 상태 엔진: 변수, 계산, 인과관계, 되먹임, 시나리오, 수용체·신호
  - 기존 학습 게임(Play)과 애니메이션 엔진(STEP 04-B)에 연결
  - 학습 콘텐츠 3개: 혈압·심박출량, 압력수용체 반사, RAAS
  - Play 상태 모니터·그래프·자유 실험·자동 관찰, Sandbox 생리 편집기
- **교육용 단순화 모델이다.**
  - 실제 환자의 생리 반응이나 혈역학을 예측하지 않는다.
  - 진단, 처치, 약물 용량 결정에 쓰지 않는다.
  - 화면마다 이 사실을 표시한다(콘텐츠 `verification_note`, 모니터 머리글·바닥글, 그래프 설명).
- **전문가 검토:** 받지 않았다. 강의자료와 대조한 것(`LECTURE_CHECKED`)은 용어·방향의 근거일 뿐이다. `EXPERT_REVIEWED`로 표시한 항목은 없다.
- 커밋·푸시·배포: 하지 않았다(사용자 승인 대기). 유료 API·서버·DB는 쓰지 않는다.

---

## 1. 기존 STEP 04-B+ 구현 상태
- 최신 커밋 `fd02135`(STEP 04-B+)에서 작업 트리가 깨끗한 상태로 시작했다. Pages 배포도 확인한 상태였다.
- 이번 단계에서 다시 쓴 것:
  - STEP 03-D 학습 규칙 엔진: `lesson.py`, `game.py`, `flow_engine.py`, `content_loader.py`, `motion_link.py`
  - STEP 04-B 애니메이션 엔진: Morph, 절차형 morph_cycle, 변형(deform) 혈관, 구조 상태, 명령 처리기
  - STEP 03-C Actor·Path 엔진: 신호 Actor 이동
  - 심장주기 개념 모델 도형(`cardiac-concept.json`)
- 보완한 것:
  - 상태만 바뀌는 학습 단계(Edge `physiology`)를 이동 묶음에 넣는 연결
  - 신호 명령(`signal_emit`)
  - `content_loader`의 생리 블록 검사
  - 지연 로딩·문맥 분리

## 2. 실제 확보된 해부학 모델
| 구분 | 모델 | 이번 단계 사용 |
|---|---|---|
| BodyParts3D (CC BY 4.0) | 심장 v1/v2, 대동맥, 대정맥, 폐혈관, 체순환 혈관(온목동맥 등), 숨뇌·척수(일부), 콩팥·부신, 가로막, 이자, 속목동맥 | Play 기관 장면(심혈관)은 그대로. 생리 학습은 개념 장면 중심 |
| Z-Anatomy (CC BY-SA 4.0, 별도 파일) | 미주신경, 교감신경줄기·신경절, 갑상샘 | Sandbox RP 장면. 생리 학습 화면에는 넣지 않음(개념 경로 사용) |
| 직접 제작 (CONCEPTUAL) | 심장주기 개념 모델, 미세 모델 3종, **혈압 조절 개념 장면(새)** | 세 콘텐츠의 기본 장면 |

- 새 개념 장면 `content/animations/physiology-concept.json`(생성기 `tools/content/make_physiology_concept.py`):
  - 도형 32개: 개념 심장, 숨뇌, 시상하부·뇌하수체 후엽, 척수, 온목동맥·목동맥팽대, 대동맥동, 세동맥(지름 변형), 신장·사구체옆세포·세뇨관, 부신피질, 간, 폐 혈관, 혈액량 표시, 신경 6개
  - 신호 경로 12개, 신호 Actor 12개
  - 모두 CONCEPTUAL로 표시하며, 배치·크기는 실제가 아니다.

## 3. 부족한 모델 및 대체 방법
| 구조 | 상태 | 대체 |
|---|---|---|
| 연수 심혈관 중추(핵) | 모델 없음 | 숨뇌 전체를 개념 구로 표시 |
| 목동맥팽대·대동맥동 압력수용체 | 수용체 모델 없음. 온목동맥 갈림 부위 약 6 cm 공백(04-B+) | 개념 구 + 색 변화(발화 단계) |
| 혀인두신경·미주신경 구심 가지 | 실제 주행 모델 없음(미주신경 원심 곡선은 Z-Anatomy) | 개념 신경 관 + 구심 신호(파랑) |
| 교감 심장·혈관·신장 가지 | 없음 | 개념 관 3개 + 원심 신호(주황) |
| 사구체옆세포·원위세뇨관·집합관 | 미세 구조, 없음 | 개념 구·관 |
| 간(안지오텐시노겐), 폐 혈관(ACE) | 장기 모델은 추출 가능하나 이번 단계는 개념 배치 | 개념 타원체 |
| 전도계(동방결절) | 없음 | 심박수는 박동 애니메이션 속도로만 표시 |

- 다중 스케일 연결(장기 → 조직 → 세포 → 분자 RAAS 장면)은 **만들지 않았다**(19번).

## 4. 실제 활용한 강의자료와 페이지
원문은 `references/`(Git 제외)에만 있다. 공개 문서에는 쪽 번호만 적는다.

| 자료 | 쪽 | 쓴 곳 |
|---|---|---|
| 14주 통합적 이해 (기초간호과학II) | p4 | MAP = CO × TPR, 임상 추정식, 정상 70–100 mmHg |
| 〃 | p5–6 | 숨뇌 심혈관 중추, 혈관운동중추·노르에피네프린 |
| 〃 | p7–9, p15 | 압력수용체 위치(대동맥동: 대동맥판 바로 위, 목동맥팽대: 속목동맥 기저부), 발화 변화, 반사 방향, 음성 되먹임 |
| 〃 | p10 | ADH 분비 요인, 수분 재흡수, 혈관 수축 |
| 〃 | p11–14 | RAAS 전 과정, 레닌은 효소, 갈증, 알도스테론 |
| 〃 | p15, p20 | 출혈(시나리오 한계 문구) |
| 약리 9주차 심혈관계 약물1 | p4 | 혈압 3변수, 맥압, MAP 약 95 유지, 단기(신경)·장기(내분비·신장) 기전, **내분비계는 신경계보다 느림** |
| 〃 | p9 | ACE: 모든 혈관 내부, 특히 폐 혈관계통에 풍부 / 안지오텐신 II 직접·간접 작용, 알도스테론 |
| 〃 | p24 | AT1: 혈관·심장 / AT2: 부신·신장·중추신경, 알도스테론 수용체 |
| 〃 | p36 | 정맥 귀환과 전부하 |
| 약리 10주차 심혈관계 약물2 | p8–9 | 일회박출량 결정 요인, 전부하 = EDV, Frank-Starling(**"어느 시점까지"**), 후부하 |
| 자율신경계 기관별·수용체별 표 | p1–3 | β1(심장 HR·수축력·전도, 신장 레닌), α1(혈관 수축), β2(골격근·관상동맥 혈관 확장), 무스카린 M(심박수 감소) |
| 성인간호학 상권 9판 | p614 그림 15-7 | EDV 120, ESV 50, SV 70 mL. CO 정의, 정상 4~8 L/분 |
| 〃 | p615 | 전부하(돌아온 혈액량), 후부하(박출 저항) |
| 기본간호학 활력징후 | 혈압 슬라이드 | BP = PR × CO, MAP 식 |
| 신장생리학 강의 | 슬라이드 35–39 | 자가조절·세관사구체 되먹임·JGA·치밀반 그림 |
| 〃 | 슬라이드 50 | ADH 분비 자극(혈장 삼투압↑, 혈액량↓), 집합관 수분 투과도 |
| 내분비생리 통합 | 슬라이드 46 | 알도스테론: 원위세뇨관 Na⁺ 재흡수·K⁺ 배설, 작용 시간 그래프(분~시간) |

- 보조 공개 자료(출처를 따로 표시함): OpenStax A&P 2e 19.4, 20.2, 20.4
  - 심박수 예시 75회/분(정상 60–100), 혈압 예시 120/80
  - CO 4–8 L/분, EF 55–70%
  - 약 160회/분 이상에서 CO 감소 예시
  - 압력수용체·RAAS·ADH·ANP 설명
- 강의 텍스트에서 심박수·혈압 정상 수치를 찾지 못했다(활력징후 표 3-6이 추출되지 않음). 그래서 그 값은 `PUBLIC_REFERENCE`로 표시했다.
- **자료 충돌 (선택하지 않고 검토 대상으로 남김):**
  1. MAP 정상 범위: 강의 70–100 mmHg, OpenStax 70–110 mmHg. 화면은 강의 값을 쓰고 차이를 변수 설명에 적었다.
  2. 안지오텐신 II 수용체: 강의(약리 9주 p24)는 AT2를 부신에 둔다. 일반 교재는 알도스테론 분비를 AT1 매개로 설명한다. 모델은 안지오텐신 II → 알도스테론을 **수용체 없이** 이었다.
  3. 무스카린 수용체 아형: 강의는 "M"으로만 적는다. M₂는 일반 약리 지식이다.
  4. 대동맥 압력수용체 위치: 04-B+ 준비 데이터의 Anchor는 대동맥활 꼭대기에 있었다. 강의(14주 p7)는 대동맥판 바로 위 오름대동맥 벽이라고 한다. 개념 장면은 강의 위치를 따랐다. `prep-04c.json`의 대동맥활 Anchor는 고치지 않았다(19번).

## 5. 생리적 변수 데이터 규격
- 명세: `docs/FLOW_SPEC_v0.1.md` 8장. 모듈: `py/biological_state.py`.
- 필드: `variable_id, name_ko, name_en, value, data_type, unit, baseline, allowed_range, normal_range, change_direction, source, verification_status, notes, value_kind`. 엔진이 내부 필드 `trend`와 `note`를 더한다.
- 자료형: number, computed, relative(-2~2), activation, boolean, category.
- 상태 분류: INCREASED / DECREASED / BASELINE(+ MARKEDLY_*), ACTIVE / INACTIVE, UNKNOWN, MIXED.
- 등록 변수 39개
  - 자료형: 수치 6, 계산 5, 상대 21, 수용체 활성 7
  - 근거 상태: 강의 대조 34, 공개 자료 4, 교육용 값 1
  - 요구서의 22개를 모두 넣었다: heart_rate, stroke_volume, cardiac_output, EDV, ESV, EF, preload, afterload, contractility, SBP, DBP, MAP, SVR, venous_return, blood_volume, sympathetic, parasympathetic, baroreceptor, renin, angiotensin II, aldosterone, ADH
  - 추가한 변수: 맥압, 신장 관류, 안지오텐시노겐, 안지오텐신 I, ACE, 혈장 삼투압, 갈증, 나트륨·수분 재흡수, 골격근 혈류(국소), 수용체 7개
- **수치를 정한 변수:** HR, EDV, ESV, SBP, DBP 다섯 개만 근거 수치가 있다. SVR은 기준 MAP ÷ 기준 CO로 유도한 교육용 값이다(`derived`).
- **정량 근거가 없는 변수:** 전부하, 후부하, 수축력, 신경 활성, 호르몬 등은 숫자 없이 상대 단계로만 둔다.

## 6. 계산 엔진 구현 결과
- 모듈: `py/formula_engine.py`. 허용 함수 7개만 쓰고, 문자열 실행(eval)은 없다.
- 계산 순서: 의존성 위상 정렬(반복문)로 정한다. 공식 사이 순환은 검출하면 불러오지 않는다.
- 기준 상태 계산 결과(브라우저에서 같은 값 확인):
  - SV = 120 − 50 = **70 mL**
  - EF = **58.3%**
  - CO = 75 × 70 ÷ 1000 = **5.25 L/분**
  - PP = **40 mmHg**
  - MAP(추정) = 80 + 40/3 = **93.3 mmHg**
  - SVR(유도) = **17.77 mmHg·분/L**
- **MAP 두 방식:**
  - `pressure_estimate`(SBP·DBP)와 `hemodynamic`(CO × SVR)을 모드로 나눠 한 번에 하나만 켠다.
  - 자유 실험 예: HR 100 → CO 7.0 L/분. 추정 모드에서는 MAP 93.3 그대로, 혈역학 모드에서는 124.4로 계산된다.
  - MAP에서 SBP·DBP를 거꾸로 만들지 않는다.
- 오류 처리(테스트로 확인):
  - 입력 오류: 잘못된 자료형, NaN·무한대, 단위 불일치(자동 변환 안 함), 누락 입력
  - 계산 오류: 0으로 나누기(EDV 0), 음수 용적(ESV > EDV), 비정상 관계(SBP < DBP), 공식 순환 의존성
  - 자유 실험에서 계산할 수 없는 값을 넣으면 설정을 되돌리고 오류를 보인다.
- 근사식 한계(MAP 추정식): 안정 시 확장기가 더 길다는 가정에 기댄다. 매우 빠른 심박수에서 맞지 않을 수 있다는 점은 일반 지식이며 자료로 확인하지 않았다(검토 대상).

## 7. 인과관계 및 피드백 엔진 구조
- 인과(`py/causal_engine.py`): 관계 39개
  - 기전별: core 12, ans 7, ans_renal 2, ans_beta2 1, baroreflex 2, raas 15
  - 유형별: positive 21, activation 6, negative 4, formula_direction 4, conditional 3, threshold 1
  - 엔진은 inhibition, multi_condition, parallel 유형도 지원한다(콘텐츠에서는 아직 안 씀). 병렬 반응은 같은 물리 시간에 바뀌는 변화로 표현한다.
- 방향만 전한다. 크기 근거가 없어서다.
- 조건·적용 범위:
  - 전부하 → SV: "어느 시점까지"(전부하 단계 ≤ +1). 넘으면 미확정(UNKNOWN).
  - 심박수 → CO: 160회/분 미만에서만. 이상이면 미확정.
  - 심박수 ≥ 160 → EDV 감소: 역치 관계. 자유 실험에서 경고로 보인다.
  - 레닌 → 안지오텐신 I: 안지오텐시노겐이 있어야 한다.
  - 안지오텐신 I → II: ACE가 작용해야 한다(ACE 억제 단계에서는 적용 안 됨).
- 결합 정책:
  - 같은 방향 원인은 가장 큰 단계 하나만 쓴다(더하지 않음).
  - 반대 방향 원인은 우선 관계(`dominant`)가 있을 때만 그쪽을 따르고, 없으면 MIXED(미확정)로 두고 더 전하지 않는다.
  - 예: 후부하↑ 질문에서 MAP는 저항↑(올림)과 CO↓(내림)가 겹쳐 MIXED로 표시된다. "혈관 지름만으로 혈압을 설명하지 않는다"를 보여 주는 장면이다.
- 중복 방지: 같은 `event_id`는 한 번만 적용한다. 학습 Edge는 방문 번호를 붙인다(`edge@n`). 복구 때는 이벤트를 잊게 해서 다시 맞히면 다시 적용된다.
- 되먹임(`py/feedback_engine.py`): 고리 2개
  - `fb.baroreflex`: 음성, 신경, 지연 1, 최대 6회
  - `fb.raas`: 음성, 호르몬, 지연 4, 최대 4회
- 되먹임 실행 방식:
  - 한 번 부를 때 한 단계: 오차 → 수용체 → 기전 관계만 전파 → 감지 변수 기록
  - 재귀 없이 물리 시간 순서로 번갈아 실행한다. 반복 총수 제한이 있고, 결정적이다(테스트).
  - 종료: within_setpoint, plateau, max_iterations, stop_condition, undetermined
- **무조건 정상화하지 않음:** 혈액량 감소가 남아 있으면 압력수용체 반사만으로는 MAP가 −1에서 멈춘다(`limits`). RAAS로 혈액량이 회복 방향으로 움직인 뒤에야 기준 단계로 간다.
- 개발 중 고친 결함:
  - 수용체를 "새 단계"로 다시 맞추면 오차가 줄 때 반대 방향 전파가 생겼다 → 오차가 남아 있는 동안 조절 신호를 한 번 더 보내는 방식으로 바꿨다.
  - 기준값을 유도할 때 생긴 미세 변화(17.78→17.77)가 "감소 방향"으로 남아 세동맥이 확장으로 보였다 → 유도 뒤 방향을 0으로 고쳤다.
- 생리 시간: 학습 시간(정답·단계)과 물리 시간(t)을 나눈다.
  - 신경 반사 t=1, RAAS t=4 이후, 체액량 지연 3. 화면에서 1단위 = 0.6초(교육용 압축).
  - 신경(초)과 RAAS(분~시간)의 실제 차이를 같은 비율로 줄이지 않았다고 화면에 적었다.
  - 자동 관찰에서 단계 진행, 일시정지, 0.5·1·2배 속도, 처음부터 다시, 변화 기록을 지원한다.

## 8. 신호 전달 및 수용체 구현 결과
- 신호 12개: 구심 신경 2, 원심 신경 4, 호르몬 5, 효소 1(레닌)
  - 데이터: `signal_id, signal_type, source/target_structure, path_id, signal_direction, activation_state, receptor_id, visual_style, educational_scale`
- `js/physiology/signal-manager.js`(command-runner `signal_emit`):
  - 기존 Actor·Path 엔진으로 신호 Actor를 출발 Checkpoint에서 도착 Checkpoint까지 옮긴 뒤 숨긴다.
  - 신경은 빛나는 구(구심 파랑, 교감 주황, 부교감 초록), 호르몬은 보라 팔면체, 효소는 노랑이다.
  - 애니메이션 줄이기를 켜면 이동 없이 잠깐 표시한다. 재시작·복구 때 모두 숨긴다.
- 실제 신경 모델은 쓰지 않았다. 개념 경로를 쓰고 "실제 신경 주행이 아님"을 표시한다.
- 수용체 7개: β₁(심장), β₁(사구체옆세포), α₁(세동맥), β₂(골격근·관상동맥 혈관), 무스카린(심장), AT₁(혈관), 무기질코르티코이드 수용체
  - 데이터: `ligand, anatomical_location, target_variables, downstream_effects, source`
  - β₂는 국소 혈류만 바꾸고 전신 말초저항에는 넣지 않았다. 수용체 작용을 모든 조직에 같게 적용하지 않는다.
- 수용체 비활성화는 "비활성 표시"만 한다. 이전 활성으로 생긴 변화는 되돌리지 않는다(복원·초기화로 되돌림). 결합 동역학, 약물 용량은 구현하지 않았다.

## 9. 기존 애니메이션 엔진 연동
- 연결은 상태 → 시각 한 방향이다. Python이 명령을 만들고 JS command-runner가 실행하며, 시각 변화가 생리 값을 바꾸지 않는다.

| 생리 변수 | 시각 | 방식 |
|---|---|---|
| heart_rate | 개념 심실 박동 속도 | 절차형 morph_cycle, 속도 = HR ÷ 기준(수치) 또는 단계 표(방향만) |
| contractility | 박동 깊이 | 같은 애니메이션의 가중치(단계 표) |
| systemic_vascular_resistance | 세동맥 수축·확장 | 구조 상태 BASELINE / VASOCONSTRICTION / VASODILATION, 지름 변형 0.65·1.35배 |
| baroreceptor, sympathetic, parasympathetic | 수용체·신경 색, 구심·원심 신호 | material + signal |
| renin, angiotensin I·II, aldosterone, ADH | 사구체옆세포·부신·세뇨관 색, 호르몬·효소 신호 | material + signal |
| sodium_reabsorption, blood_volume | 세뇨관·혈액량 표시 색 | material |

- 산소화 → 적혈구 재질은 기존 Actor 상태(STEP 03-D)가 있다. 이번 모델에는 산소화 변수를 넣지 않았다.
- 확인 결과
  - Play: 신호 중에도 기존 경로·Actor·카메라·단면 오류는 없었다.
  - Sandbox: phys_lab ↔ A를 2번 오가도 GPU geo/tex가 늘지 않았다(A 7/0, 공유 Actor geometry 1개는 첫 방문 뒤 고정).
  - 복원(state_restore·rollback)하면 `bind_all`로 시각 상태가 기준으로 돌아온다(브라우저 테스트).

## 10. 혈압·심박출량 콘텐츠 (`cv.hemodynamics`, 13문제)
- 정의: 심박출량, 일회박출량, 전부하, 후부하, 심근수축력, 말초혈관저항
- 계산 문제: SV 70 mL, CO 5.25 L/분, HR 100일 때 CO 7 L/분, MAP 추정 93.3 mmHg. 정답 값은 계산 엔진으로 생성해 콘텐츠와 엔진이 어긋나지 않는다.
- 방향 예측: 전부하↑ → SV↑, 후부하↑ → SV↓(MAP 미확정), 수축력↑ → SV↑
  - 매 방향 문제 전에 기준 상태로 되돌린다: "다른 조건이 같다"
- 3D: HR 100이 되면 박동이 1.33배 빨라진다(브라우저 측정 속도 1.333). 후부하 문제에서는 세동맥이 수축한다.
- **자유 실험 모드:**
  - 문맥 `experiment`: 상태·기록이 학습과 분리되고, 그동안 입력이 잠긴다.
  - 입력: HR, EDV, ESV, SBP, DBP, SVR. MAP 계산 방식을 고를 수 있다.
  - 화면 문구: "바꾼 값 하나만 다르고 나머지 조건은 일정하다고 가정"
  - 브라우저 확인: HR 170 → CO 11.9 + 역치 경고, 혈역학 모드 MAP 211.5, ESV 200은 되돌림 + 오류
  - 암기·추론 모드에서는 정답을 미리 계산할 수 있어 학습을 마친 뒤에만 연다.

## 11. 압력수용체 반사 콘텐츠 (`cv.baroreflex`, 10문제)
- 시작 시나리오: 혈압 감소
- 순서: 압력수용체 → 발화 감소(구심 신호) → 숨뇌 → 교감 증가(원심 신호) → 부교감 감소 → β₁·무스카린 → 심박수·수축력 증가 → α₁ → 혈관 수축 → 혈압 회복 방향 → 음성 되먹임
  - 마지막 문제는 **혈압 증가 상황**이다. 되먹임 엔진이 반사 한 단계를 병렬로 계산한다: 발화↑ → 부교감↑·교감↓ → 심박수↓.
- 학습 단계는 기전 범위를 좁혀(`_step`, `ans`, `core`) 원인 하나씩 보여 준다. 화면과 설명에 "실제 반응은 동시에(병렬) 일어난다"를 적었다.
- 구심(파랑)과 원심(주황·초록) 신호를 색과 경로로 구분한다.
- 자동 관찰: 혈압 감소·증가 시나리오를 처음부터 되먹임까지 재생한다. 학습 상태는 바뀌지 않는다(브라우저 확인).

## 12. RAAS 콘텐츠 구현 범위 (`cv.raas`, 10문제)
- 시작 시나리오: 혈액량 감소(→ 정맥 환류·전부하·SV·CO·MAP 감소)
- 순서: 레닌(효소, 사구체옆세포) → 안지오텐신 I(간의 안지오텐시노겐) → ACE → 병렬 분기
  - 분기 a: 혈관 수축(AT₁)
  - 분기 b: 알도스테론 → 나트륨 재흡수
  - 분기 c: ADH(+ 갈증 변수)
  - 이어서 혈액량 증가 → 혈압 회복 방향 → "신경 반사보다 느리다"
- 레닌·ACE·호르몬의 역할을 구분했다. ACE는 "폐에만"이 아니라 "폐 혈관에 풍부, 다른 혈관에도"로 설명한다(약리 9주 p9).
- 레닌 분비 자극: 혈압 저하(14주)와 교감 β₁(수용체 표)
  - 치밀반 NaCl 감지는 신장 강의 그림에만 있다. 본문으로 확인하지 못해 모델에 넣지 않았다(검토 대상).
- **만들지 않은 것:** ANP(설명만), EPO, 갈증 → 섭취, 신장 미세 장면, 장기 → 조직 → 세포 → 분자 다중 스케일 연결, 입자 다수 표현(04-D)
- 자동 관찰(혈액량 감소): 신경 반사(t=1)는 제한 때문에 MAP −1에서 plateau, RAAS(t=4)가 혈액량·MAP를 회복 방향으로 움직인다.
- 이 모델은 회복을 한 단계로 단순화했다. 실제 회복 정도·시간은 원인과 처치에 따라 다르다고 표시한다.

## 13. 실제 플레이 화면
브라우저 창(앱 내장)에서 직접 찍었다. 창이 숨겨진 상태여서, 캡처할 때는 렌더링을 수동으로 진행시켰다.

- `docs/development/img/play-raas-monitor.jpg`: RAAS 학습 중 상태 모니터
  - 기준·현재·방향, 근거 표시(강의 대조/공개 자료/교육용 값/계산값/상대 상태)
  - "(방향만)" 표시, 활성 수용체, 최근 신호, 면책 문구
- `docs/development/img/play-baroreflex-scene.jpg`: 혈압 조절 개념 장면. "교감 증가"에 정답을 낸 직후 교감신경 관이 주황으로 밝아짐
- 모바일(375×812): 모니터가 위쪽에 접힌 채 시작하고, 가로 넘침이 없다(확인).

## 14. 상태 변화 그래프
- `docs/development/img/play-raas-graph.jpg`: 평균동맥압, 레닌, 알도스테론, 혈액량의 학습 단계별 변화
  - MAP와 혈액량은 −1에서 시작해 혈액량 단계에서 기준으로 돌아온다.
  - 레닌은 먼저, 알도스테론은 나중에 증가한다.
- 축과 표시
  - 세로: 수치 변수는 기준값 대비 변화율(±50%), 상대 상태·방향만 바뀐 수치는 단계(±2). 단위·기준·물리 시간 배율을 그래프 아래에 적는다.
  - "실제 환자 모니터 데이터가 아님"을 표시한다.
  - 상태가 바뀔 때만 다시 그린다. 기록은 300개로 제한하고, 화면에는 최근 60개를 보낸다.
- 고친 문제
  - 기전 학습에서는 MAP 값이 그대로이고 방향만 바뀌어 처음에 기준선에 그려졌다 → 기록에 단계도 함께 남겼다.
  - 같은 단계로 겹치는 선은 조금 띄워 그린다.

## 15. 추가 및 수정한 파일
- **Python (수업 범위 문법 유지: class·try·재귀·enumerate·zip·컴프리헨션·삼항식 없음, 검사함)**
  - 새 파일: `py/biological_state.py`, `formula_engine.py`, `causal_engine.py`, `feedback_engine.py`, `scenario_engine.py`, `physiology_commands.py`
  - 고친 파일:
    - `py/lesson.py`: 생리 연결, begin/commit/rollback, 문맥 보호, `lesson.physiology`
    - `py/game.py`: Edge physiology 전달, `physiology_hide`
    - `py/motion_link.py`: 상태만 바뀌는 Edge 허용
    - `py/content_loader.py`: physiology 블록 검사
- **JS**
  - 새 파일: `js/physiology/signal-manager.js`, `physiology-monitor.js`, `physiology-editor.js`
  - 고친 파일:
    - `js/engine/command-runner.js`: `ctx.physiology` 처리기
    - `js/play/play-engine.js`, `play-main.js`, `gameplay-controller.js`, `gameplay-ui.js`
    - `js/main.js`
    - `js/python/py-client.js`: 파일 6개 추가, `WORKER_VERSION` 04c-1
    - `js/python/py-worker.js`: 허용 목록 추가
  - 요구서의 `physiology-controller.js`, `state-binding.js`, `receptor-visualizer.js`는 따로 만들지 않았다. 같은 역할을 기존 모듈 확장으로 처리했다(중복 금지 원칙).
    - 제어: `gameplay-controller.physiologyCall`
    - 바인딩: Python `physiology_commands` + command-runner
    - 수용체 표시: 모니터·material 바인딩
- **콘텐츠**
  - `content/physiology/cardiovascular-model.json`
  - `content/animations/physiology-concept.json`
  - `content/lessons/hemodynamics/`, `baroreceptor-reflex/`, `raas/`, `index.json`(3개 추가)
  - `content/sandbox/scenes.json`(PH 장면)
- **생성기·테스트**
  - 생성기: `tools/content/make_physiology_model.py`, `make_physiology_concept.py`, `make_physiology_lessons.py`, `make_physiology_fixture.py`
  - 테스트: `tests/test_biological_state.py`, `test_formula_engine.py`, `test_causal_engine.py`, `test_feedback_engine.py`, `test_physiology_lesson.py`, `tests/physiology-tests.{html,js}`, `tests/fixtures/physiology-visual.json`
- **화면:** `play.html`(#ph-panel), `index.html`(Physiology 패널), `css/play.css`, `css/style.css`
- **문서:** `docs/FLOW_SPEC_v0.1.md` 8장, `docs/ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, 이 보고서, 화면 캡처 3장

## 16. 기존 및 신규 테스트 결과 (실제 실행)
| 테스트 | 결과 |
|---|---|
| tests/test_biological_state.py (새) | 34/34 |
| tests/test_formula_engine.py (새) | 25/25 |
| tests/test_causal_engine.py (새) | 26/26 |
| tests/test_feedback_engine.py (새, 실제 모델 포함) | 30/30 |
| tests/test_physiology_lesson.py (새, Gameplay 통합) | 53/53 |
| tests/physiology-tests.html (새, 브라우저 시각 연결) | 17/17 |
| tests/test_sandbox3d.py | 38/38 |
| tests/test_scene_commands.py | 30/30 |
| tests/test_engine.py | 70/70 |
| tests/test_motion_commands.py | 37/37 |
| tests/test_lesson.py | 63/63 |
| tests/test_cardiac_cycle.py | 27/27 |
| tools/asset-processing/test_bp3d_tools.py | 13/13 |
| tools/asset-processing/test_asset_upgrade.py | 42/42 |
| tests/animation-tests.html | 26/26 |
| tests/motion-tests.html | 32/32 |

- 브라우저 수동 확인
  - Play 세 콘텐츠를 정답으로 끝까지 진행했다(혈역학은 안내·암기 모드, 반사는 안내, RAAS는 추론 모드). 오답이면 상태가 바뀌지 않았다.
  - 숨김 확인: 암기 모드에서 다음 정답 변수의 현재값·기준값이 "?"로 보였다.
  - 자유 실험·자동 관찰을 하고 학습 문맥으로 돌아와도 학습 상태가 그대로였다.
  - 기존 혈액순환·심장주기 콘텐츠도 정상 진행됐다(생리 패널은 숨김).
  - Sandbox PH 편집기: 모델 불러오기, 시나리오, 되먹임 한 단계, 순환 관계 거부, 관계 추가, 신호를 확인했다.
  - 콘솔 오류는 0개였다.
- 실패·취소 복구:
  - Python 테스트: 실패 → 진행 안 함 → 복구 시 이전 상태 → 다시 맞히면 다시 적용, 같은 도착 두 번은 무시.
  - 브라우저에서 실패를 일부러 일으켜 보는 시험은 하지 않았다.

## 17. 성능 측정 결과 (브라우저, Pyodide Worker, 측정값)
| 항목 | 측정 |
|---|---|
| `lesson.load` (모델 39변수·39관계 포함) | 28 ms |
| `lesson.submit` (정답, 생리 begin 포함) | 2.8~5.6 ms |
| `lesson.arrived` (commit) | 3 ms |
| 상태 조회 (`view`) | 2.7 ms |
| 자동 관찰: 시나리오 + 되먹임 2고리 전체 실행 | 3.5 / 5.6 / 3.8 / 16.1 / 6.7 ms (5회) |
| 콘텐츠 크기 | 모델 70 KB, 개념 장면 36 KB, 콘텐츠 16~19 KB |

- Python은 상태가 바뀔 때만 부른다(정답, 실험 입력, 관찰 시작). 프레임마다 부르지 않는다. 그래프도 상태 변화 때만 그린다.
- **NOT TESTED:**
  - FPS: 창이 숨겨진 상태라 측정값을 믿을 수 없다.
  - 실제 모바일 기기(크기 흉내만 확인)
  - 배포된 Pages(커밋 전)
  - 브라우저 비활성 탭에서 긴 관찰의 동작
- 신호 Actor는 12개뿐이다. 대규모 입자는 04-D 범위다.

## 18. 의학적 검토가 필요한 항목
1. 인과관계 39개의 방향과 조건: 특히 Frank-Starling 범위(+1), 심박수 160회/분 역치(OpenStax 예시), 혈액량 → 정맥 환류
2. 결합 정책의 결과: 후부하↑ 때 MAP "미확정" 표시가 교육적으로 적절한지
3. 되먹임 제한: 혈액량 감소가 남으면 반사만으로는 −1에서 멈추고, RAAS 한 단계로 회복 방향이 된다는 단순화
4. 물리 시간 지연값(신경 1, 호르몬 1~2, 체액량 3, RAAS 고리 4)과 화면 압축 설명
5. 수용체 배정(4번 충돌 2·3 포함)과 β₂를 국소 효과로만 둔 결정
6. 압력수용체 위치 표시(대동맥동은 대동맥판 바로 위)와 04-B+ Anchor의 차이
7. 레닌 분비 자극의 범위(치밀반 NaCl 미포함)와 ADH·갈증의 범위
8. 계산 문제의 예시값(HR 75, 혈압 120/80은 공개 자료) — 강의 표 3-6과 대조 필요
9. 교육용 시각 배율(박동 속도·깊이, 세동맥 지름 0.65·1.35배)
10. 개념 장면 배치와 신경·호르몬 경로가 오해를 주지 않는지

## 19. 미해결 오류 및 제한 사항
- 단계(정수)로만 변화를 표현해 부분 회복을 나타낼 수 없다(예: 혈액량 −1 → 0을 한 번에).
- 수용체 비활성화는 이전 효과를 되돌리지 않는다.
- 되먹임이 끝나도 교감 활성 등은 그대로 남는다(되돌아가는 과정을 모델링하지 않음).
- `prep-04c.json`의 대동맥활 압력수용체 Anchor(04-B+)를 강의 위치로 고치지 않았다.
- 다중 스케일 RAAS(장기 → 조직 → 세포 → 분자), ANP·EPO, 약물 분기(혈관확장제·베타차단제)는 만들지 않았다.
- 개념 장면 라벨 일부가 겹친다(시상하부·뇌하수체 라벨과 숨뇌 라벨). 옆으로 옮겼지만 화면 크기에 따라 겹칠 수 있다.
- 모니터의 탭 버튼은 패널을 접어도 보인다(CSS `.row`의 표시 규칙). 기능에는 문제가 없다.
- 자동 관찰의 일시정지는 엔진 전체 이동·애니메이션을 멈추는 방식이다. 관찰 중 학습 입력은 잠겨 있다.
- 실제 해부 모델(Z-Anatomy 미주신경, BodyParts3D 온목동맥 등) 위로 신호를 흘리지 않았다. 개념 장면만 쓴다.
- Physiology Editor는 경량 도구다. 노드 편집, 관계 삭제·수정 UI는 없다(JSON 내보내기·가져오기로 편집).

## 20. STEP 04-D 진행 준비 상태
**진행 가능하다.**
- 04-D(대규모 입자·InstancedMesh)가 쓸 기반이 준비됐다.
  - 생리 상태(Python)가 입자 수·흐름 방향을 정할 수 있는 변수(혈액량, 호르몬 단계, 신호 기록)
  - 신호 데이터 형식(`signal_type`, 경로, 표시 스타일)
  - 상태 → 시각 바인딩 경로
- 04-D에서 할 일
  - 신호 Actor(지금 12개)를 InstancedMesh 입자층으로 바꾸기
  - 호르몬 "양"을 입자 밀도로 표현하기(교육용 표시라고 유지)
  - 실제 모바일 FPS 측정
- 04-D 전에 정할 것
  - 18번 검토 항목 중 콘텐츠 문구에 영향이 큰 1·3·5번
  - 다중 스케일 RAAS를 04-D 입자 장면과 함께 만들지
