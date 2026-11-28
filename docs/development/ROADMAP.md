# NURSE FLOW 3D 개발 로드맵 (2026-11-29 개정)

## 최종 목표
특정 기전 하나를 배우는 타이핑 게임을 넘어, **범용 실시간 3D 인체 해부학·생리학 학습 플랫폼**을 만든다.
- 간호학, 해부학, 생리학, 병태생리학, 약리학의 어떤 문제가 나와도 같은 인체 모델과 공통 엔진으로 새 학습 콘텐츠를 만든다.
- 콘텐츠마다 필요한 장기만 따로 확보하던 방식을 바꾼다. **전신 해부학 데이터베이스**를 먼저 쌓는다.
- 11개 계통: 골격, 근육, 신경·감각기관, 심혈관, 호흡, 소화, 비뇨, 내분비, 림프·면역, 외피, 생식
- 규모: 전신 → 장기 → 조직 → 세포 → 분자
- 기본은 정상 성인이다. 나중에 남녀 차이, 좌우, 연령, 질환, 해부학적 변이를 더할 수 있게 설계한다.

## 지키는 원칙
- **무료로 개발한다:** 유료 모델·유료 API·서버·DB를 쓰지 않는다. 정적 사이트(GitHub Pages)로 운영한다.
- **승인 받기:** 유료 구매, 커밋, 푸시, 공개 배포는 사용자 승인 없이 하지 않는다.
- **라이선스는 모델마다 관리한다:** `asset_registry.csv`에 출처·라이선스·좌표계·검증 상태를 적는다. SA 조건 자산은 별도 파일로 두고, NC·출처 불명 자산은 배포하지 않는다.
- **강의자료는 비공개다:** `references/`는 Git에서 제외한다. 공개 문서에는 쪽 번호만 적는다.
- **기존 엔진은 보존한다:** Python 규칙 엔진, Three.js 렌더링, Path·Actor·Animation 엔진, Biological State Engine을 다시 쓰지 않고 확장한다.
- **데이터로 만든다:** 새 기전을 만들 때 핵심 엔진을 고치지 않는다. 콘텐츠·모델·관계는 JSON 데이터로 더한다.
- **콘텐츠 유형:** 순차, 순환, 분기, 인과, 형태 변화, 병렬 반응, 되먹임, 복합형을 지원한다.
- **완료 표시는 정직하게:** 모델이나 콘텐츠가 실제로 없으면 완료로 표시하지 않는다. 전문가 검토 전이면 검토 완료로 표시하지 않는다.

## 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| STEP 01~02 | Pyodide + Three.js 엔진, Sandbox, 객체 레지스트리, 카메라 | 완료 |
| STEP 03-A | BodyParts3D → GLB 자동 변환 파이프라인 | 완료 |
| STEP 03-B | Anatomy Explorer, 해부학 레지스트리·Anchor·레이어 | 완료(심혈관만) |
| STEP 03-C | Path·Actor 이동 엔진 | 완료 |
| STEP 03-D | 학습 게임(Play), 규칙 엔진 | 완료 |
| STEP 04-A | 내강 중심선 경로, 다중 스케일(모세혈관 개념 장면) | 완료(경로 전공자 검토 전) |
| STEP 04-B / 04-B+ | 애니메이션 엔진, 심장주기 개념 모델, 심장 v2·판막 리깅·가지 혈관·04-C 준비 모델 | 완료(교육용 근사) |
| STEP 04-C | 생리 상태·계산·인과·되먹임 엔진, 혈역학·압력수용체 반사·RAAS | 완료(전문가 검토 전) |
| STEP 04-D | 입자(InstancedMesh)와 성능 최적화, 실제 모바일 FPS | 다음 |
| STEP 05-A | 전신 해부학 데이터베이스(구조 등록 ≠ 모델 확보) | 계획 |
| STEP 05-B | 11개 계통 3D 모델 | 계획 |
| STEP 05-C | 조직·세포·분자 모델 | 계획 |
| STEP 05-D | 해부학 관계·연결 데이터(포함·연결·위치·혈관·신경 분포) | 계획 |
| STEP 05-E | 통합 Anatomy Atlas | 계획 |
| STEP 05-F | 3D 그래픽 품질 개선 | 계획 |
| STEP 06 | FLOW Studio(콘텐츠 제작 도구) | 계획 |
| STEP 07 | 첫 번째 완성형 학습 콘텐츠 | 계획 |
| STEP 08 | 간호학 콘텐츠 확장 | 계획 |
| STEP 09 | UI/UX 및 학습 기능 | 계획 |
| STEP 10 | 정식 배포 | 계획 |

- 계통별 모델 현황, 미확보 구조, 공개 자료 조사는 `ANATOMY_COVERAGE.md`에 있다.

## 통합 해부학 데이터베이스 (STEP 05-A 설계 방향)
기존 Anatomy Registry(`structures.json`, 원본 `tools/asset-processing/anatomy/*.src.json`)를 확장한다. 새 레지스트리를 따로 만들지 않는다.

| 필드 | 내용 | 지금 |
|---|---|---|
| `anatomical_id` | 프로젝트 고유 ID | 있음 |
| `name_ko`, `name_en`, `aliases` | 명칭·동의어 | 있음 |
| `fma_id` | FMA ID | 있음 |
| `uberon_id` | Uberon ID | **새로** |
| `anatomical_system` | 11개 계통(여러 개 허용) | 필드는 있음, 값이 비어 있음 |
| `parent_id`, `children` | 포함 관계 | 있음 |
| `relations` | 연결(continuous_with), 위치(anterior_to 등), 혈관 공급, 신경 분포, 배액 | **새로**(STEP 05-D) |
| `scale_level` | body / organ / tissue / cell / molecule | **새로** |
| `models[]` | 출처별 모델(자산 ID, 노드, 좌표계, LOD, 성별·변이) | `asset_ids`·`objects` 확장 |
| `model_status` | NONE / CONCEPTUAL / CONVERTED / REVIEWED | 있음(값 정리 필요) |
| `variants` | sex, side, age, pathology, anatomical_variant | **새로**(자리만) |
| `source`, `license`, `verification_status` | 출처·라이선스·검증 | 있음 |

- 통계는 두 가지로 나눠 센다.
  - **등록 구조 수:** 모델이 없어도 센다.
  - **모델 확보 수:** 변환하고 배포할 수 있는 것만 센다.
- 계통별로 파일을 나누고 필요할 때만 불러온다(전신 데이터를 한 번에 불러오지 않음).

## 앞으로 필요한 엔진 기능

| 영역 | 필요한 것 | 기반 (이미 있는 것) |
|---|---|---|
| 데이터 | 계통별 레지스트리 분할·지연 로딩, 관계 그래프 질의(Python), Uberon 매핑 | anatomy-registry, ensureAsset(04-B+) |
| 좌표 | 출처별 좌표계 등록과 정렬 변환(BP3D / Z-Anatomy / HRA), 정렬 검사 기록 | Z-Anatomy 평행 이동 측정(04-B+) |
| 로딩·성능 | LOD·메시 감소, 계통별 스트리밍, InstancedMesh 입자, GPU 메모리 예산 | resource-tracker, 지연 로딩, STEP 04-D |
| 다중 규모 | 장기 → 조직 → 세포 → 분자 장면 연결, 같은 Actor 이어 쓰기 | scale-manager, micro-scene |
| 변이 | 남녀·좌우·연령·질환 레이어 전환(같은 구조 ID에 여러 모델) | 레이어 시스템(Explorer) |
| 생리 | 계통별 생리 모델 JSON(호흡, 신장, 내분비 등), 모델 사이 변수 공유 | Biological State Engine(04-C) |
| 콘텐츠 | 콘텐츠 유형 8종을 데이터로 표현, 검사 도구, FLOW Studio 편집기 | lesson v2 형식, physiology ops, Physiology Editor |
| 출처 표시 | 장면에 쓴 자산의 라이선스·출처를 자동으로 모아 표시 | 장면 `credits` |
| 검색·Atlas | 이름·동의어·ID 검색, 계통·규모 탐색, 구조 정보 패널 | Explorer 검색·레이어 |

## 이번 개정에서 하지 않은 것
- 엔진을 전면 재작성하지 않았다.
- 모델을 새로 변환하거나 다운로드하지 않았다.
- 레지스트리 형식을 바꾸지 않았다(STEP 05-A에서 함).
