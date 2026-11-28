# STEP 04-A 보고서 — 해부학 정확도와 다중 스케일 시각화

- 작성일: 2026-11-28
- 범위: 혈액순환 콘텐츠의 강의자료 반영, BodyParts3D 모델 점검, 중심선 경로 재작성, 경로 검증 상태, 다중 스케일(기관 ↔ 조직 개념 장면), 심장 내부 보기, Path Editor, 기하 검사 성능
- **의학적 검증 여부:** 이번 단계의 어떤 경로·장면도 해부학 전문가 검토(ANATOMY_REVIEWED)를 받지 않았다. 경로는 기하 검사만 통과했고(GEOMETRY_CHECKED), 폐·조직 모세혈관은 직접 만든 개념 장면(CONCEPTUAL)이다.
- 커밋·푸시·배포: 하지 않았다 (사용자 승인 대기).

---

## 1. 실제 분석한 간호학 자료
자료 원본과 추출 텍스트는 `references/nursing/`(Git 제외)에만 있다. 여기에는 쪽 번호와 쓰임만 적는다.

| 자료 (약칭) | 확인한 쪽 | 쓴 곳 |
|---|---|---|
| 성인간호학 상권 제9판 (교재, 스캔본 `part_1.pdf`) | p485, p610, p611, p614, p615 | 폐순환·체순환 경계, 폐정맥 4개, 심장정맥굴, 심음, 대동맥활 |
| 건강사정 6장 「심장과 혈관」 (HA6) | p2–5, p12, p16–19, p23–26, 그림 9-1·9-2, 심장주기 그림 | 순환 순서, 판막 이름(새 용어), 청진 부위, 동맥·정맥·모세혈관 정의 |
| 약리학 9주차 「심혈관계 약물1」 (PH9) | p4–9, p19, p22, p36 | 정맥귀환·전부하 용어 |
| 약리학 10주차 「심혈관계 약물2」 (PH10) | p7–9, p14–22 | STEP 04-C 준비(이번 콘텐츠에는 쓰지 않음) |
| 14주 「통합적 이해」 (IN14) | p4–15 | 압력수용체·RAAS(STEP 04-C 준비), 상행대동맥 용어 |
| 기본간호학 「산소화 요구」 (OX) | p6 | 분압차 확산, 가스 교환 방향 |

- 분석하지 못한 자료: 성인간호학 상권 원본(587 MB, 텍스트 추출 시간 초과), 핵심건강사정 교재, 기본간호학2 교재, 하권 혈관장애 장. 모두 스캔본이고 OCR 도구가 없다.
- 교재 스캔에 없는 쪽: p606–609(심방·심실·판막 본문), p612–613(전도계), p620–621.

## 2. 강의자료 기반 콘텐츠 수정 내역
콘텐츠 `content/lessons/cardiovascular/blood-circulation.json` 0.1.1 → **0.2.0**. 자세한 표는 `docs/development/CONTENT_REVIEW_cardiovascular.md` "0.2.0 반영"에 있다.

| 수정 | 노드 | 근거 |
|---|---|---|
| 정답 추가: 폐동맥반달판막, 허파동맥반달판막 | n.pulm_valve | HA6 그림 9-2 |
| 정답 추가: 허파동맥줄기 | n.pt | HA6 그림 9-1·9-2 |
| 정답 추가: 대동맥반달판막 | n.aortic_valve | HA6 그림 9-2 |
| 순환 경계: 우심실 도착 → `pulmonary`, 좌심실 도착 → `systemic`. 판막에서 바꾸던 것은 지움 | n.rv, n.lv (n.pulm_valve, n.aortic_valve에서 삭제) | 교재 p485 |
| 설명: 심장정맥굴(관상정맥동) | n.ra | 교재 p611 |
| 설명: 오름대동맥·대동맥활·내림대동맥 | n.aorta | HA6 그림 9-1, 교재 p615 |
| 설명: 승모판 폐쇄와 제1심음 | n.mitral | HA6 p17 |
| 설명: 반월판 폐쇄와 제2심음 | n.aortic_valve | 교재 p614 |
| 설명: 3D 표현 바뀐 것(경로·개념 장면) | n.pulm_cap, n.pulm_veins, n.aorta, n.systemic | - |
| 노드별 `lecture_check` (MATCH 10, PARTIAL 6) | 16개 전체 | 쪽 번호만 |

- **미확인으로 남긴 것 (PARTIAL):** 대정맥 배액 부위, SVC·IVC 약어, 삼첨판 첨판 수(그림으로만 확인), 폐동맥판 첨판 수, 이첨판 동의어와 승모판 첨판 수, 좌심실 벽 두께.
- 강의 대조(`lecture_check`)와 3D 상태(`verification_status`)를 다른 필드로 나눴다. 강의 대조로 3D 상태를 올리지 않는다.
- 질문과 설명은 직접 썼다. 강의 문장을 옮기지 않았다.

## 3. 기존 모델의 한계 (BodyParts3D 4.0 점검)
| 구조 | 모델에 있는 형태 | 판정 |
|---|---|---|
| 심장 겉면 | 없음. 심방 벽 2개와 관상혈관·판막·내강을 합친 모양뿐 | 겉면 메시 없음 |
| 우심방 | 벽(Wall of right atrium) + 내강(Cavity) | 벽·내강 |
| 우심실 | 내강만 (심실 근육 벽 없음) | 내강 |
| 좌심방 | 벽 + 내강 | 벽·내강 |
| 좌심실 | 내강만. "Myocardium of left ventricle" 개념에는 유두근과 승모판 첨판 1개만 있다 | 내강 |
| 심실중격 | 없음 | MISSING |
| 삼첨판 | 첨판 3개 (개별 구조) | 개별 구조 |
| 승모판 | 첨판 2개 (03-A에서 대동맥판 첨판이 섞인 것을 이름 필터로 분리) | 개별 구조 |
| 폐동맥판 | 반달 첨판 3개 (FMA7246) | 개별 구조 |
| 대동맥판 | 반달 첨판 3개 | 개별 구조 |
| 상대정맥 | 관 표면 1개, 길이 약 3.7 cm, 위쪽 끝이 열려 있음 | 혈관 벽 표면 (열린 관) |
| 하대정맥 | 관 표면 1개, 약 24 cm, 위·아래 끝이 열려 있음 | 혈관 벽 표면 (열린 관) |
| 폐동맥 | 폐동맥줄기 + 좌우 폐동맥(폐 안 가지 포함, 오른쪽 약 33 cm) | 혈관 벽 표면 (가지 많음) |
| 폐정맥 | 4개 각각 (가지 포함) | 혈관 벽 표면 |
| 대동맥 | 오름·활·내림이 한 메시, 활의 큰 가지 포함 | 혈관 벽 표면 |
| 폐 실질 | 없음. 폐 개념에는 기관지 가지만 있다 | MISSING |
| 폐포 | 없음 | MISSING |
| 모세혈관 | 없음 | MISSING |

- 내강(cavity) 메시는 닫힌 면이라 안쪽 판정이 잘 된다. 혈관은 끝이 열린 관이라 광선 홀짝 판정만으로는 틀릴 수 있어, 옆으로 둘러싸임 검사를 추가했다(5장).
- 심방 내강과 대정맥, 좌심실 내강과 대동맥판·승모판처럼 메시가 서로 겹치는 곳이 있다.

## 4. 추가 확보한 모델
- **새로 들여온 외부 모델: 없음.**
- 검색 결과 (우선순위 순)
  1. BodyParts3D 4.0: 심실중격, 심실 심근 벽, 폐 실질, 폐포, 모세혈관 모두 없음(카탈로그 재검색). 경로에 필요한 혈관(상·하대정맥, 폐동맥줄기·좌우 폐동맥, 폐정맥 4개, 대동맥)은 03-A에서 이미 변환해 두었다.
  2. Z-Anatomy: CC BY-SA이고 BodyParts3D 파생이다. CLAUDE.md 원칙대로 사용자와 라이선스를 검토하기 전까지 쓰지 않았다.
  3. 무료 라이선스 폐포·모세혈관 모델: 찾지 못했다. 판매 사이트 모델은 유료라 구매하지 않았다. NIAID BioArt에는 3D 파일이 없었다.
  4. 자체 제작 개념 모델: 폐포-모세혈관, 조직 모세혈관 (`nf-micro-concept`, CONCEPTUAL). `docs/references/asset_registry.csv`와 `assets/licenses/nf-micro-concept.md`에 기록했다.
- 서로 다른 인체 모델을 겹쳐 쓰지 않았다. Blender 파이프라인은 이번에 새 변환이 없어 실행하지 않았다.

## 5. 개선된 혈액 이동 경로
`content/anatomy/cardiovascular/paths.json` (version 2). 이전 경로는 `paths.v1-approx.json`에 보존했다.

**만든 방법**
- **단면 중심선** (`js/motion/centerline-tracer.js`): 혈관 메시를 진행 방향에 수직인 평면으로 잘라, 잘린 선분의 길이 가중 중심을 3 mm마다 따라간다. 관 끝에서 단면이 없어지면 멈춘다.
  - 처음에는 정점을 얇은 판으로 모았는데, 하대정맥처럼 삼각형이 긴 메시는 단면 정점이 3~5개라 한 걸음 만에 멈췄다. 그래서 삼각형 단면 방식으로 바꿨다.
- **판막 전후 Waypoint (반자동):** 판막 중심(첨판 정점 평균)에서 앞뒤로 6 mm·8 mm 점을 둔다.
  - 폐동맥판·대동맥판: 첨판 모양의 얇은 축이 흐름 방향과 6~7°라 그 축을 썼다.
  - 삼첨판·승모판: 얇은 축이 흐름과 87°·60°로 맞지 않아, 앞뒤 방·실 내강 중심을 잇는 방향을 썼다.
- **Path Editor**에서 확인하고, "단면 중심선으로 채우기"로 같은 방법을 화면에서도 쓸 수 있다.

| 구간 (요구 순서) | 경로 ID | 길이 | 방법 |
|---|---|---|---|
| 상대정맥 → 우심방 | cv.svc_to_ra (유지) | 7.9 cm | 상대정맥 중심선 + 우심방 내강 중심 |
| 하대정맥 → 우심방 | cv.ivc_to_ra (유지) | 27.6 cm | 하대정맥 중심선(모델 아래 끝부터) + 우심방 |
| 우심방 → 삼첨판 → 우심실 | cv.ra_to_rv (유지) | 5.6 cm | 판막 전후 점 |
| 우심실 → 폐동맥판 → 폐동맥줄기 | cv.rv_to_pt (유지) | 9.5 cm | 판막 축 + 폐동맥줄기 중심선(갈림 부위까지) |
| 폐동맥 → 폐 안쪽 | **cv.pt_to_lung (새)** | 7.5 cm | 오른폐동맥 중심선, 첫 큰 가지 앞(x = −3.2 cm)까지 |
| 폐 모세혈관 | micro.pcap (개념 장면) | - | 6장 |
| 폐정맥 → 좌심방 | **cv.pv_to_la (새)** | 10.2 cm | 오른위폐정맥 중심선(좌심방 쪽에서 추적 후 뒤집음) |
| 좌심방 → 승모판 → 좌심실 | cv.la_to_lv (유지) | 5.5 cm | 판막 전후 점 |
| 좌심실 → 대동맥판 | cv.lv_to_av (유지) | 2.7 cm | 판막 축 |
| 대동맥판 → 오름 → 활 → 내림대동맥 | **cv.aorta (새)** | 47.4 cm | 대동맥 중심선, Checkpoint: 오름대동맥, 대동맥활(가장 높은 점), 내림대동맥 |
| 전신 조직 | micro.scap (개념 장면) | - | 6장 |
| 정맥 귀환 | 시작 노드(개념) | - | 3D 경로 없음 |

- 기존 경로 ID 6개와 Checkpoint ID는 모두 유지했다. 새 Checkpoint: cp.rpa, cp.lung_in, cp.pv_lung, cp.pv_la, cp.asc_aorta, cp.aortic_arch, cp.desc_aorta
- 잘라낸 구간: 오른폐동맥 가지 부위(메시 밖 4~14%), 오른위폐정맥 폐 쪽 합류부(메시 밖 19%). 단면 중심이 가지 사이로 빠져서 내강 밖이 됐다.
- 경로 엔진: 시작·끝 Anchor가 points에 없으면 자동으로 붙이는 규칙 때문에, 중심선 경로에 예전 정점 평균 Anchor가 앞에 붙어 길이가 38.8 cm로 늘었다. 중심선 경로에서는 그 Anchor 필드를 뺐다.

## 6. 각 경로의 검증 상태
**상태 정의 (MOTION_DATA_SPEC 2장)**
- PENDING, APPROXIMATE, GEOMETRY_CHECKED, ANATOMY_REVIEWED(사람만), CONCEPTUAL
- 점을 편집하면 GEOMETRY_CHECKED·ANATOMY_REVIEWED에서 APPROXIMATE로 자동으로 내려가고, 저장된 검사에 `stale`이 붙는다.

**GEOMETRY_CHECKED 조건:** 표본 81개가 모두 메시 안쪽이다(닫힌 면 안쪽이거나, 수직 8방향 중 75% 이상이 3 cm 안에서 벽에 닿음). 또 연결 간격 0, Checkpoint 순서 정상, 모든 Checkpoint 위치 계산 가능해야 한다.

| 경로 | 상태 | 메시 밖 | 관통 | 최소 여유 | 시작 → 끝 판정 |
|---|---|---|---|---|---|
| cv.svc_to_ra | GEOMETRY_CHECKED | 0% | 2 | 1.31 mm | 상대정맥 → 우심방 내강 |
| cv.ivc_to_ra | GEOMETRY_CHECKED | 0% | 4 | 0.14 mm | 하대정맥 → 우심방 내강 |
| cv.ra_to_rv | GEOMETRY_CHECKED | 0% | 2 | 0.20 mm | 우심방 → 우심실 내강 |
| cv.rv_to_pt | GEOMETRY_CHECKED | 0% | 7 | 0.09 mm | 우심실 → 폐동맥줄기·오른폐동맥 |
| cv.pt_to_lung | GEOMETRY_CHECKED | 0% | 8 | 0.01 mm | 폐동맥줄기 → (끝: 열린 관 안, 둘러싸임) |
| cv.pv_to_la | GEOMETRY_CHECKED | 0% | 11 | 0.02 mm | (시작: 열린 관 안) → 좌심방 내강 |
| cv.la_to_lv | GEOMETRY_CHECKED | 0% | 4 | 0.06 mm | 좌심방 → 좌심실 내강 |
| cv.lv_to_av | GEOMETRY_CHECKED | 0% | 4 | 0.00 mm | 좌심실 → 대동맥판·대동맥 |
| cv.aorta | GEOMETRY_CHECKED | 0% | 10 | 0.16 mm | 대동맥판 → 대동맥 |
| micro.pcap, micro.scap | CONCEPTUAL | - | - | - | 개념 장면 |

- **관통 수**는 실패 조건이 아니라 참고값이다. 메시가 겹치는 경계(혈관 ↔ 심방 내강)와 판막 첨판에서 생긴다. 판막을 지나는 경로는 닫힌 판막 모델을 뚫고 지나간다(판막 개폐는 04-B 범위).
- **최소 여유**가 0.1 mm 이하인 곳이 있다. 판막 첨판 옆이나 혈관이 갈라지는 곳으로, 벽에 거의 닿는 구간이다. 전문가 검토 때 볼 곳이다.
- 노드의 3D 상태: 경로가 있는 13개는 GEOMETRY_CHECKED, 폐 모세혈관·전신 조직은 CONCEPTUAL, 정맥 환류는 CONCEPT

## 7. 폐포 및 모세혈관 장면
`content/micro/capillary-scenes.json` + `js/scale/micro-scene.js`. 모두 CONCEPTUAL이다.

| | 폐 (micro.pulmonary) | 조직 (micro.systemic) |
|---|---|---|
| 구조 | 폐포(반투명 구, 지름 260 µm), 폐포를 감싸는 모세혈관 관(지름 10.4 µm) | 조직 모세혈관 관, 조직 세포 12개 |
| 기체 입자 | O₂ 폐포 → 혈액, CO₂ 혈액 → 폐포 (각 10개) | O₂ 혈액 → 조직, CO₂ 조직 → 혈액 |
| 입구·출구 | cp.pcap_in(폐동맥 쪽) → cp.pcap_exchange → cp.pcap_out | cp.scap_in(동맥 쪽) → cp.scap_exchange → cp.scap_out |
| 적혈구 | 같은 Actor `rbc_01`, 표시 크기 6 cm(= 7.8 µm) | 같음 |
| 라벨 | 폐포, 폐 모세혈관, O₂ → 혈액, CO₂ → 폐포, 들어옴, 나감 | 조직 세포, 조직 모세혈관, O₂ → 조직, CO₂ → 혈액 |

- 1 장면 m는 실제 약 130 µm다. 크기는 일반 참고 수치를 썼고, **강의자료에서 확인한 값이 아니다.**
- 기체 이동 방향은 교재 p485와 OX p6의 확산 방향과 같다. 확산 방정식이나 실제 기체 수치는 계산하지 않는다.
- 단순화
  - 실제 폐포는 모세혈관 그물에 둘러싸여 있다. 혈관 하나가 감싸는 모양이 아니다.
  - 기체 입자는 보이게 하려고 크게 그렸다.
- 암기·추론 모드에서 다음 정답이 보이지 않도록 출구 라벨을 "나감 (심장 쪽으로)"로 했다. "폐정맥 쪽"이라고 쓰면 다음 문제의 정답이 드러난다.

## 8. Multi-scale Scene 구현 결과
- **모듈:** `js/scale/scale-manager.js`
  - 수준: BODY, ORGAN, TISSUE, CELL, MOLECULAR. 장면이 있는 것은 ORGAN과 TISSUE이고, 나머지는 자리만 있다.
  - 장면마다 원점·단위 설명·카메라 추적 설정·Actor 표시 크기·확대 설명을 따로 둔다. 기관 장면은 실제 크기(1 m = 1 m)이고 적혈구만 약 385배로 표시한다. 개념 장면은 1 m = 130 µm다.
  - 개념 장면은 기관 모델에서 40 m·60 m 떨어진 곳에 만들고, 안쪽을 향한 배경 구로 가린다. 기관 모델의 표시 상태(레지스트리·재질)는 건드리지 않는다.
- **흐름** (Python이 정하고 JS가 보여 준다)
  - 콘텐츠 Edge `transition_type: "scene"` → motion_link가 명령으로 바꾼다: 이동 → `scale_change` → 이동
  - JS는 페이드(900 ms) → 장면 교체 → 같은 Actor를 새 Checkpoint에 배치 → 카메라 → 페이드 해제 순으로 실행한다.
- **유지되는 것:** 세션, 현재 노드, Actor ID `rbc_01`, `biological_state`(산소화), 정답·오답 수, 진행률. 전환 전후에 같은 Actor 객체를 쓰고, 학습 상태는 Python에 있다.
- **중복·입력 차단**
  - 전환 중 두 번째 `scale_change`는 "이미 스케일 전환 중"으로 실패한다(실행 확인).
  - 전환 중 입력은 상태 머신(transitioning)이 막는다.
- **실패·복구**
  - 기다린 이동이 취소되면 같은 묶음의 나머지 명령(전환)을 실행하지 않는다. 처음에는 취소된 이동 뒤에 전환이 그대로 실행되는 문제가 있었다.
  - 복구 위치가 다른 장면에 있으면 그 장면으로 먼저 즉시 전환한다. 폐 모세혈관에서 다음 이동을 취소한 뒤 복구하면 TISSUE 장면, 교환 지점, 산소화 상태, 표시 크기 6 cm로 돌아온다(확인).
  - 재시작하면 기관 장면, 표시 크기 3 mm, 산소 적음, 상대정맥 경로로 돌아온다.
- **일시정지**
  - 전환 단계 사이에서 기다린다.
  - 일시정지 중에 시작된 이동은 멈춘 채로 시작한다(`motion.gameHold`). 전에는 전환 뒤 이어지는 이동이 일시정지를 무시했다.
  - 일시정지 상태에서 재시작해도 이동이 막히지 않는다(cancelAll이 해제).
- **애니메이션 줄이기:** 페이드 0 ms, 기체 입자 정지
- **화면 표시:** 왼쪽 아래에 수준, 장면 이름, "개념 모델" 배지, 단위, 확대 설명을 보여 준다. TISSUE에서는 기관 라벨을 숨긴다.

## 9. 심장 내부 시야 개선 결과
Play 설정 "심장 내부 보기"에 모드 7개를 두었다.

| 모드 | 동작 |
|---|---|
| 자동 (기본) | Actor가 심장 상자 안에 있으면 움직이는 단면, 밖이면 반투명. 0.2초마다 판단하고 바뀔 때만 재질을 바꾼다. TISSUE에서는 적용하지 않는다. |
| 반투명 | 심장·혈관 층 투명도를 사용자 값(기본 0.55)으로 |
| 불투명 (Normal) | 투명도 1, 단면 없음 |
| 고스트 | 투명도 0.2 |
| 절개 (Cutaway) | 켤 때의 카메라 방향으로 심장·혈관(구조 7개, 메시 24개)의 앞쪽 절반을 자른다(고정) |
| 움직이는 단면 (Dynamic) | Actor와 카메라 사이를 자르는 평면이 매 프레임 Actor를 따라간다. 재질은 다시 적용하지 않고 평면만 옮긴다. |
| 좌우 단면 | STEP 03-D의 x축 단면 |

- Clipping Controller 확장
  - 임의 평면(`custom`), 제외 type(`excludeTypes`, 기본 actor), `movePlane`, `appliedCount`
  - 학습 물질은 어떤 모드에서도 잘리지 않는다(확인).
  - Explorer·Sandbox 단면도 이제 Actor를 자르지 않는다.
- **재질 복원 확인:** 모드를 normal → ghost → cutaway → dynamic → section_x → translucent → normal 순으로 바꿨다.
  - 마지막 normal에서 단면이 적용된 재질 0개, 투명 재질 0개였다.
  - 다시 자동으로 바꾸면 심장 안에서 단면 24개가 적용됐다.
- **렌더링 순서:** 반투명 벽은 STEP 03-B의 재질 층(depthWrite 끔)을 그대로 쓴다. 개념 장면의 관·폐포는 renderOrder 1·2, 기체 입자는 불투명이다. 눈으로 본 범위에서 깊이 문제는 보지 못했다. 체계적인 깊이 정렬 검사는 하지 않았다.
- 단면은 표면 메시를 자를 뿐이며, 원본에 없는 구조(심실 벽, 중격)를 보여 준다고 설명하지 않는다.
- **카메라**
  - 외부 추적(기존 follow: 진행 방향 lookAhead, smooth 5)에 자동 단면을 더해 가림을 처리한다. Play는 1인칭 시점을 쓰지 않는다.
  - 기관 → 조직 전환은 페이드다. 조직 장면에 도착하면 장면 정면 전체 보기로, 기관 장면에서는 구조 확대로 맞춘다.
  - 자유 탐색, 전체 보기, 물질 위치로 가기, 애니메이션 줄이기는 03-D 기능을 유지한다.

## 10. 실제 게임 플레이 화면
브라우저 창(앱 내장 브라우저, 데스크톱)에서 확인했다.
- **가이드 모드, 상대정맥 분기, 처음부터 끝까지 (로컬 서버)**
  - 15개 입력이 모두 arrived였고 완료(goal)했다.
  - 장면 순서: 기관 → 폐 모세혈관(TISSUE) → 기관 → … → 조직 모세혈관(TISSUE)
  - 산소 상태가 폐 모세혈관에서 많음으로, 조직에서 적음으로 바뀌었다.
  - 순환 변수: 우심실부터 pulmonary, 좌심실부터 systemic
- **가이드 모드, 하대정맥 분기, 처음부터 끝까지 (Pages와 같은 하위 경로 `/anatomy-flow/`, 배포될 파일만 복사)**
  - 완료(goal), 콘솔 오류 0, 요청 모두 200
- **암기 모드**
  - 시작 때 이름 16개를 숨기고, 진행하면서 13개로 줄었다.
  - 오답 1회 뒤 위치·노드가 유지됐고, 다음 정답으로 진행했다.
- **분기·순환 테스트 콘텐츠:** 왼쪽 순환 가지를 2바퀴(laps 2) 돈 뒤 완료했다. 기록 저장(6 → 7개), CSV 헤더 17열, 행 수가 기록 수 + 1이었다.
- **스크린샷:** 폐포 개념 장면과 조직 개념 장면(완료 직후)을 이 세션에서 확인했다. 파일로 저장하지 않았다.
- **기전 추론 모드는 NOT TESTED** (이번 단계에서 실행하지 않음)

## 11. 추가 및 변경 파일
**새 파일**
- `js/motion/triangle-grid.js`: 삼각형 격자 색인, 광선 교차
- `js/motion/centerline-tracer.js`: 단면 중심선 추적, 주축·판막 얇은 축
- `js/scale/scale-manager.js`, `js/scale/micro-scene.js`
- `content/micro/capillary-scenes.json`
- `content/anatomy/cardiovascular/paths.v1-approx.json`: 이전 경로 보존(비교용)
- `assets/licenses/nf-micro-concept.md`
- `docs/development/STEP_04A_REPORT.md`

**변경**
- 이동: `js/motion/path-geometry-check.js`(비동기·색인·캐시·둘러싸임·관통·문제 지점), `path-engine.js`(상태·편집 시 상태 낮춤·snapshot/restore·method·geometry_check), `motion-controller.js`(경로 끝 부동소수 수정, gameHold), `motion-kit.js`(url), `path-editor.js`(상태 표시·문제 지점·Undo/Redo·이전 버전 비교·중심선 채우기·비동기 기하 검사)
- 엔진: `js/engine/clipping-controller.js`(임의 평면·Actor 제외·movePlane), `command-runner.js`(ctx.scale, 취소 시 묶음 중단)
- Play: `js/play/play-engine.js`(스케일·개념 장면·보기 모드), `gameplay-controller.js`(scene Edge 검증, 전환 뒤 추적, 다른 장면 복구, 일시정지 연동), `gameplay-ui.js`(새 상태 배지), `play-main.js`(보기 모드·스케일 표시), `play.html`, `css/play.css`, `css/style.css`
- Python: `py/content_loader.py`(scene 전환, 새 상태), `py/game.py`(scale·pre_checkpoint 전달), `py/motion_link.py`(scene → 이동·scale_change·이동), `py/scene_commands.py`(scale_change 검사), `js/python/py-client.js`(WORKER_VERSION 04a-1)
- 콘텐츠: `content/anatomy/cardiovascular/paths.json`, `content/lessons/cardiovascular/blood-circulation.json`
- 테스트: `tests/motion-tests.js`(+4), `tests/test_lesson.py`(+12), `tests/test_motion_commands.py`(+8)
- 문서: README, CLAUDE.md, `docs/FLOW_SPEC_v0.1.md` 6장, `docs/development/MOTION_DATA_SPEC.md`, `docs/development/CONTENT_REVIEW_cardiovascular.md`, `docs/references/asset_registry.csv`

## 12. 테스트 결과
| 요구 항목 | 결과 | 방법 |
|---|---|---|
| 기존 Python 단위 테스트 | PASS | sandbox3d 38/38, scene_commands 30/30, engine 70/70, motion_commands 37/37(+8), lesson 63/63(+12), bp3d tools 13/13 |
| 기존 브라우저 테스트 | PASS | `tests/motion-tests.html` 32/32(+4) |
| 강의자료 기반 콘텐츠 수정 | PASS | test_lesson: 새 정답 3개, 순환 경계 3곳, lecture_check 16개, content_version 0.2.0 |
| 혈액순환 경로 개선 | PASS (기하) | 경로 9개 메시 밖 0%, 연결 간격 0, Checkpoint 순서 정상. 해부학 검토는 NOT TESTED(전문가 필요) |
| 폐포 장면 전환 | PASS | Play에서 TISSUE ↔ ORGAN 왕복 |
| 장면 전환 후 학습 상태 유지 | PASS | 노드·변수·산소화·정답 수 유지, 취소 → 복구, 재시작, 일시정지 |
| 카메라 추적 | 부분 PASS | 전환 뒤 추적 재개와 도착 확대를 코드·상태로 확인. 화면에서 끊김 없이 부드러운지는 창이 가려져 확인하지 못함 |
| 자동 투명화 및 단면 | PASS | 심장 안 → dynamic(24 메시), 밖 → translucent, 모드 전환 뒤 재질 복원, Actor 제외 |
| 경로 검사 성능 | PASS | 13장 |
| 혈액순환 게임 처음부터 끝까지 | PASS | 가이드 모드 상대정맥·하대정맥 분기 각 1회 |
| GitHub Pages 호환성 | PASS (모의) | 배포 대상 파일만 복사해 `/anatomy-flow/` 하위 경로로 Play·Sandbox 실행. 실제 Pages 배포본은 NOT TESTED(푸시하지 않음) |
| 기존 Explorer 및 Sandbox 작동 | PASS | Explorer 개발자 모드 경로 9개 로드·검증·편집·비교·단면 편집, Sandbox motion_g 이동 |
| 비공개 자료의 배포 제외 | PASS | 배포될 파일 목록 137개에 references/, raw-models/, assets/test-models/ 0개. 원본 강의 문장 없음 |
| 기전 추론 모드 | NOT TESTED | |
| 실제 한글 IME 입력 | NOT TESTED | 이번 단계에서 입력 코드를 바꾸지 않음 |
| 실제 모바일 기기 | NOT TESTED | 기기 없음 |
| 모바일 에뮬레이션(화면 크기) | NOT TESTED | 이번 단계에서 실행하지 않음 (스케일 표시 상자에 720 px 이하 CSS만 추가) |
| FPS | NOT MEASURED | 브라우저 창이 가려진 상태라 rAF가 느려져 의미 있는 값이 아님 |

**테스트 중 발견해 고친 문제**
1. **경로 끝 Checkpoint 통과 (기존 버그)**
   - 증상: 상대정맥 → 우심방 이동이 우심방(진행률 1.0)에서 멈추지 않고 연결 경로를 따라 폐동맥 끝까지 갔다.
   - 원인: `d0 + (len − d0)`의 부동소수 오차로 `c.distance === len` 비교가 실패했다.
   - 수정: 끝에 닿으면 끝 좌표를 그대로 쓴다. 회귀 테스트를 추가했다(dt 1/60~1.3 s).
   - 이 테스트는 수정한 뒤에만 실행했다. 수정 전 코드에서 실패하는지는 확인하지 않았다.
2. 취소된 이동 뒤에도 같은 묶음의 스케일 전환이 실행됐다. 테스트를 추가했다.
3. 전환 중 일시정지 뒤 이어지는 이동이 멈추지 않았다.
4. 개념 장면 출구 라벨이 다음 정답을 드러냈다.
5. 하대정맥·상대정맥 경로 앞에 예전 정점 평균 Anchor가 자동으로 붙었다(5장).

## 13. 성능 개선 전후 측정값
같은 환경(Explorer, 데스크톱 앱 내장 브라우저, 심혈관 메시 25개·삼각형 192,500개, 경로 6개, 표본 61개)에서 쟀다.

| 경로 | 전 (동기) | 후 (전체) | 후 (최대 정지) |
|---|---|---|---|
| cv.svc_to_ra | 1,756 ms | 93 ms (색인 만들기 80 ms 포함) | 10 ms |
| cv.ivc_to_ra | 1,420 ms | 10 ms | 8 ms |
| cv.ra_to_rv | 2,415 ms | 22 ms | 9 ms |
| cv.rv_to_pt | 2,044 ms | 13 ms | 8 ms |
| cv.la_to_lv | 2,478 ms | 19 ms | 8 ms |
| cv.lv_to_av | 2,604 ms | 18 ms | 8 ms |
| **합계** | **12,715 ms** (경로마다 화면 정지 1.4~2.6 s) | **177 ms** | 50 ms 넘는 Long Task **0개** |
| 같은 경로 다시 검사 | - | 0.3 ms (캐시) | - |

- **원인 (실제 코드):** 표본 61개마다 6방향 광선을 장면의 모든 메시에 쐈다. Three.js Raycaster는 메시마다 삼각형을 전부 검사하고, 공간 색인이 없었다. 모든 작업이 한 번에 동기로 돌았다.
- **개선**
  1. 삼각형 격자 색인(29×48×19칸)과 3D DDA로, 광선이 지나는 칸의 삼각형만 검사한다.
  2. 8 ms 단위로 나눠 실행하고 MessageChannel로 양보한다. rAF 양보는 창이 가려지면 거의 멈춰서 쓰지 않았다.
  3. 결과와 색인을 캐시한다.
  4. 경로 근처 메시만 쓰고, 경계 상자를 정점 순회(setFromObject) 대신 geometry.boundingBox로 구한다.
- 중간 단계 측정: 시간만 나눠 실행하고 색인이 없을 때는 표본 하나가 약 100 ms였다. 정지 구간이 100 ms 남고 전체 시간은 오히려 늘어서(경로당 2.8~6.5 s) 색인을 추가했다.
- Web Worker 분리는 하지 않았다. 색인으로 충분히 빨라졌고, Worker로 메시를 복사하는 비용이 더 크다고 판단했다(측정하지 않음).

## 14. 남은 해부학적 한계
- 모든 경로는 ANATOMY_REVIEWED가 아니다. 전공자 검토가 필요한 곳은 다음과 같다.
  - 판막 전후 점의 방향(특히 삼첨판·승모판)
  - 벽에 0.1 mm 이하로 붙는 구간
  - 폐정맥 경로가 실제로 오른위폐정맥 본줄기인지(가운데엽 정맥 가지일 수 있음, 미확인)
- 심실 근육 벽·심실중격이 없어 우심실·좌심실은 내강만 보인다. 판막 개폐가 없어 경로가 닫힌 첨판을 지나간다.
- 폐정맥 4개 중 1개, 폐동맥은 오른쪽 첫 가지 앞까지만 경로가 있다. 대동맥 큰 가지와 전신 동맥 → 조직 구간은 3D로 따라가지 않는다(개념 장면으로 건너뜀).
- 하대정맥은 모델 아래 끝(엉덩이 높이 위)부터 시작한다.
- 폐포·모세혈관은 개념 모델이다. 크기 수치는 강의자료에서 확인하지 않은 일반 참고값이다.
- 교재 p606–609, p612–613 스캔 누락으로 판막 첨판 수, 좌심실 벽 두께, 전도계는 강의 근거가 없다.

## 15. STEP 04-B 진행 준비 상태
| 04-B 항목 | 준비된 것 | 남은 것 |
|---|---|---|
| 판막 개폐 | 판막 4개는 첨판 단위 메시(삼첨판 3, 승모판 2, 폐동맥판 3, 대동맥판 3). 판막 중심·얇은 축 계산(`centerline-tracer.thinAxis`). 판막 전후 Waypoint가 경로에 있다. | 첨판별 회전축(경첩) 지정. 열림 상태에서 경로 관통 재검사 |
| 심장 박동(내강 변형) | 내강 메시 4개(닫힌 면). 스케일·Actor 표시 크기 분리 구조 | 변형 방식(스케일/모프) 결정, 경로 점(object_local)이 변형을 따라가게 할지 결정 |
| 끝나지 않는 연출 | parallel 이벤트, 일시정지(gameHold, scale.pause), 애니메이션 줄이기 연동 | 주기 시계와 심박수 변수 |
| 가림 처리 | 자동 움직이는 단면, 절개, 고스트 | 박동 중 단면 평면 안정성 |
| 성능 | 기하 검사 색인·캐시 | 실제 기기 FPS 측정(NOT TESTED 유지) |
- **선행 결정이 필요한 것**
  - Z-Anatomy(CC BY-SA) 사용 여부: 심실 벽·중격이 필요하면 검토해야 한다.
  - 경로 해부학 검토를 누가 할지
