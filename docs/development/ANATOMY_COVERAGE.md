# 전신 해부학 모델 보유 현황 (2026-11-29 조사)

- 최종 목표: 11개 인체 계통 전체의 해부학 데이터베이스와 3D 모델(`ROADMAP.md`)
- 이 문서는 **조사 결과**다. 여기 적힌 "원본에 있음"은 변환·검수·배포가 끝났다는 뜻이 아니다.

**상태 구분**

| 상태 | 뜻 |
|---|---|
| 배포 중 | GLB로 변환하고 대장에 등록했다. 라이선스를 확인했고 `deployable = YES`다. |
| 원본에 있음 | 로컬 원본(`raw-models/`, Git 제외)에서 이름·element를 확인했다. 변환하지 않았다. |
| 원본에 없음 | 우리가 가진 원본에서 찾지 못했다. 다른 공개 자료를 조사해야 한다. |
| 개념 모델 | 직접 만든 교육용 모델(CONCEPTUAL)이다. 실제 해부학 모델이 아니다. |

- 의학적 검증: 모든 모델이 **전문가 검토 전**(`NOT_REVIEWED`)이다.

## 1. 지금 가진 것 (수치)

| 항목 | 수 | 근거 |
|---|---|---|
| 배포 중인 해부학 GLB | 21개 | `docs/references/asset_registry.csv` |
| 배포 중인 해부학 GLB: 출처별 | BodyParts3D 파생 17(미리보기·맥락 모델 포함), Z-Anatomy 파생 1, 직접 제작 미세 개념 3 | 〃 |
| 개념 장면(절차형, 파일 없음) | 4종 | `content/micro/capillary-scenes.json`, `content/animations/cardiac-concept.json`, `content/animations/physiology-concept.json`, Actor 모델 |
| Anatomy Registry 등록 구조 | 63개(심혈관 + 맥락) | `content/anatomy/cardiovascular/structures.json` |
| 04-C 준비 구조 | 21개 | `content/anatomy/regulation/prep-04c.json` |
| Anchor | 11개(심혈관) + 10개(조절) | `anchors.json`, `prep-04c.json` |
| 3D 경로 | 9개(Play) + 13개(가지, Explorer 개발자) | `paths.json`, `paths-branches.json` |
| 학습 콘텐츠 | 5개(모두 심혈관) | `content/lessons/index.json` |

**아직 없는 것**
- 해부학 구조 등록과 3D 모델 확보를 나눠 세는 **전신 데이터베이스**가 아직 없다(STEP 05-A).
- 지금 레지스트리는 모델이 있는 구조 위주로 등록되어 있다.

## 2. 원본 아카이브 안의 계통별 규모

### BodyParts3D 4.0 (CC BY 4.0, 로컬 원본)
- 로컬 메타데이터로 집계했다(개발 도구, 공개하지 않는 원본에서 읽은 수치만 적음).
- PART-OF 트리: 개념 1,368, element(OBJ) 1,258
- IS-A 트리: 개념 2,905, element 2,234

| 계통 (FMA 개념) | PART-OF 하위 개념 | element |
|---|---|---|
| skeletal system | 98 | 138 |
| IS-A "bone organ" | 320 | 203 |
| IS-A "muscle organ" | 535 | 323 |
| nervous system | 89 | 60 |
| cardiovascular system | 293 | 627 |
| respiratory system | 92 | 284 |
| alimentary system | 141 | 147 |
| urinary system | 10 | 6 |
| endocrine system | 4 | 7 |
| integumentary system | 1 | 1 |
| genital system | 2 | 1 |

- **남성 인체 하나뿐이다.** 원본에서 이름으로 찾지 못한 것:
  - 난소, 자궁, 질
  - 림프절, 편도
  - 속귀(달팽이관)
  - 손발톱
- 척수는 3.5 cm 조각뿐이다(04-B+ 확인).

### Z-Anatomy (CC BY-SA 4.0, 로컬 원본 `Startup.blend`)
- 객체 7,184개: 메시 4,569, 곡선 951, 글자 1,660(라벨) 등
- 최상위 컬렉션별 객체 수 / 그중 메시 수

| 컬렉션 | 객체 | 메시 |
|---|---|---|
| 1 Skeletal system | 2,218 | 1,244 |
| 2 Muscular insertions | 705 | 705 |
| 3 Joints | 593 | 480 |
| 4 Muscular system | 894 | 789 |
| 5 Cardiovascular system | 757 | 60(혈관 대부분은 곡선) |
| 6 Lymphoid organs | 276 | 220 |
| 7 Nervous system & Sense organs | 842 | 460 |
| 8 Visceral systems | 479 | 254 |
| 9 Regions of human body | 343 | 299 |

- 장기계 세부 객체 수
  - 소화 88, 호흡 41, 비뇨 9, 내분비 8, 생식 19, 림프계 54, 감각기관 50
- 생식계는 **남성 구조만** 있다(고환, 부고환, 정관, 전립샘, 음경 등).
- 피부 메시는 이름으로 찾지 못했다.
- 쓰지 않는 객체
  - 출처·라이선스가 불명확한 "White matter" 계열(척수 포함)
  - NC 모델

## 3. 계통별 현황

| 계통 | 배포 중 (우리 GLB) | 원본에 있음 (미변환) | 원본에 없음 / 부족 | 후보 자료 |
|---|---|---|---|---|
| 골격계 | 갈비뼈 우리(맥락용 `rib-cage.glb`) | BP3D 뼈 203 element, Z-Anatomy 뼈·관절 | 연골 세부, 성장판(연령 차이) | BP3D, Z-Anatomy, HRA(일부 장기만) |
| 근육계 | 가로막 | BP3D 근육 323 element, Z-Anatomy 근육·부착부 | 근육 섬유 방향, 근막 세부 | BP3D, Z-Anatomy |
| 신경계·감각기관 | 숨뇌·척수 조각(BP3D), 미주신경·교감신경줄기(Z-Anatomy) | BP3D 뇌 59 element·신경 일부, 눈알, 바깥귀 / Z-Anatomy 중추·말초 신경, 감각기관 | 척수 전체(라이선스 확인된 것), 속귀, 신경핵(연수 심혈관 중추 등), 수용체 | Z-Anatomy(출처 확인 필요 객체 제외), HRA 뇌, BP3D |
| 심혈관계 | 심장 v1·v2(판막 리깅·심실 영역), 대동맥, 대정맥, 폐혈관, 체순환 혈관 22, 속목동맥 | BP3D 627 element(말초 혈관), Z-Anatomy 혈관 곡선 | 전도계, 심실중격 독립 메시, 목동맥팽대 부위, 모세혈관(개념 모델로 대체) | BP3D, HRA 심장·혈관 |
| 호흡기계 | 폐·기도(`lungs-airways.glb`) | BP3D 284 element, Z-Anatomy 폐엽·기관지·가슴막 | 폐 실질(폐포는 개념 모델), 코안·부비동 세부 | BP3D, Z-Anatomy, HRA 폐 |
| 소화기계 | 이자 | BP3D 147 element(간, 위, 장 등), Z-Anatomy 88 | 장벽 층, 융모(개념 모델 필요) | BP3D, Z-Anatomy, HRA(대장·소장·간 등) |
| 비뇨기계 | 콩팥 | BP3D 6 element, Z-Anatomy 9(콩팥·요관·방광·요도) | 네프론·사구체(개념 모델 필요) | Z-Anatomy, HRA 콩팥·방광·요관 |
| 내분비계 | 부신, 이자, 갑상샘(Z-Anatomy) | BP3D 뇌하수체·가슴샘, Z-Anatomy 뇌하수체 전·후엽·솔방울샘 | 부갑상샘, 시상하부 핵 | Z-Anatomy, HRA |
| 림프·면역계 | **없음** | BP3D 가슴샘·지라, Z-Anatomy 림프 장기 220 메시 | 림프관망 전체, 림프절 세부 | Z-Anatomy, HRA 림프절·지라·가슴샘 |
| 외피계 | 몸 표면(`body-skin.glb`, 맥락용 1 메시) | BP3D 털 등 일부 | 피부 층(표피·진피·피하), 땀샘, 손발톱 | HRA 피부, 개념 모델 |
| 생식계 | **없음** | 남성 구조만(BP3D 전립샘·고환 등, Z-Anatomy 남성 생식기) | **여성 생식기 전체**(난소, 자궁, 질, 유방) | HRA Visible Human Female 장기(자궁, 난소, 나팔관 등) |

- 조직·세포·분자 수준
  - 지금은 개념 모델 3개(폐포, 조직 모세혈관, 혈관 벽)와 개념 장면만 있다.
  - 세포·분자 모델은 없다(STEP 05-C).

## 4. 활용 가능한 공개 데이터베이스

| 자료 | 내용 | 라이선스 (조사 결과) | 현재 사용 | 주의 |
|---|---|---|---|---|
| BodyParts3D 4.0 | 남성 전신 장기·뼈·근육·혈관 OBJ, FMA ID | CC BY 4.0 (우리 원본 아카이브 기준) | 사용 중(원본 보유) | 여성 구조 없음. 원점 기준 좌표를 그대로 씀 |
| Z-Anatomy | Blender 전신 아틀라스(뼈·관절·근육·신경·림프) | CC BY-SA 4.0 (일부 객체 출처 별도) | 신경·갑상샘만 별도 GLB | 동일조건변경허락. BP3D 자산과 합치지 않음. 좌표 평행 이동 보정 필요. 출처 불명 객체 제외 |
| OrganUI | BodyParts3D 기반 웹 심장 모델·UI | 코드 MIT, 모델 CC BY 4.0(BP3D) | 사용 안 함(조사만) | 원점·크기를 바꿔 우리 좌표와 맞지 않음. 같은 형상은 원본에서 직접 꺼냄 |
| Human Reference Atlas (HuBMAP CCF) 3D Reference Object Library | Visible Human 남녀 기준 장기 GLB(뇌, 심장, 콩팥, 폐, 림프절, 지라, 가슴샘, 피부, 자궁, 난소 등), Uberon 연결 | CC BY 4.0 (공식 페이지 표기. 버전별 변경 이력이 있어 파일마다 확인) | 없음(다음 조사 대상) | BP3D와 다른 인체·좌표계. 무조건 합치지 않고 별도 좌표계로 등록 |
| NIH 3D | HRA 모델 재배포 + 다양한 의학 모델 | 항목마다 다름 | 없음 | 항목별 라이선스 확인 필수. NC·불명 항목 제외 |
| Uberon | 다종 해부학 온톨로지(ID·계층·관계) | CC BY 3.0 | 없음 | 구조 ID·관계 데이터용(모델 아님) |
| FMA | 인체 해부학 온톨로지(BP3D가 쓰는 ID) | **확인 필요** | ID만 사용 | 관계 데이터를 가져오기 전에 라이선스를 확인한다 |
| RCSB PDB / wwPDB | 단백질·분자 구조 | 데이터 CC0 1.0 | 없음 | 분자 수준 교육 모델(헤모글로빈, 수용체 등)의 후보. 원저자 표기를 권장 |
| Allen Cell Explorer 등 세포 모델 | 세포 3D 데이터 | **확인 필요** | 없음 | 조사 전에는 쓰지 않음 |

- 이번 단계에서는 다운로드하거나 변환하지 않았다. HRA, NIH 3D, PDB는 다음 단계에서 파일별로 라이선스를 확인한 뒤 대장에 등록한다.

## 5. 서로 다른 모델을 다루는 원칙
- 출처마다 좌표계를 따로 등록한다.
  - BP3D: 원점 그대로, mm → m
  - Z-Anatomy: 측정한 평행 이동 T
  - HRA: 별도 인체(VH)이므로 정렬 변환 + 검사 결과를 기록한다
- 서로 다른 인체(남/녀, 다른 출처)의 메시를 한 파일로 합치지 않는다.
- 라이선스 조건이 다른 자산(CC BY와 CC BY-SA)은 별도 파일로 두고, 장면 `credits`에 각각 표시한다.
- 모델이 없는 구조도 데이터베이스에는 등록하되 `model_status: NONE`으로 둔다.
  - 개념 모델로 대신하면 `CONCEPTUAL`로 표시한다.
