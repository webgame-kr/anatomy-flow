# STEP 03-B 보고서 — Anatomy Viewer & Anatomical Anchor System

작성일 2026-11-28. 측정값은 로컬 서버(`python -m http.server`)와 Claude 데스크톱 앱 브라우저 창에서 실제로 잰 값만 적었다. 실제 기기에서는 다를 수 있다.

## 1. STEP 03-A 결과 검토
- 심혈관 GLB 6개는 모두 같은 원점과 축을 쓴다(glTF (x, y, z) = (X, Z, −Y) × 0.001). 정렬 오차는 0이다.
- 데이터 한계는 그대로다. BodyParts3D 4.0에는 심실 심근 벽, 심실중격, 폐 실질이 없다. 그래서 다음과 같이 표시한다.
  - 좌심실과 우심실: PARTIAL (내강만 있음)
  - 심실중격: MISSING
  - 좌·우 폐: PARTIAL (기관지 가지와 혈관만 있음)
- 메타데이터의 이름 오류(승모판 concept에 대동맥판 첨판이 섞인 것 등)는 03-A의 element 필터를 그대로 유지했다.

## 2. 해부학 장면 구조
| 파일 | 역할 |
|---|---|
| `content/anatomy/cardiovascular/scene.json` | 자산 목록(처음 로드 4개, 지연 로드 3개), 레이어, 기본 카메라, 시점(전체·심장·혈관·폐), 방향 프리셋, 라벨 목록, 출처 |
| `content/anatomy/cardiovascular/structures.json` | 해부학 레지스트리 41개 구조 (생성 파일) |
| `content/anatomy/cardiovascular/anchors.json` | Anchor 8개 (object-local), 후보 15개 (PENDING) |

- `structures.json`과 `anchors.json`은 사람이 고치는 원본(`tools/asset-processing/anatomy/cardiovascular.structures.src.json`)에서 `anatomy_data.py`로 만든다.
  - element ID와 삼각형 수는 `*.meta.json`에서 채운다.
  - Anchor 위치는 원본 OBJ 정점 평균으로 계산한다.
- 인체 외형(피부)과 흉곽(흉골·늑연골·좌우 늑골) 맥락 모델을 `tools/asset-processing/specs/context.json`으로 새로 변환했다.
  - 위치: `assets/anatomy/context/`
  - 크기: 피부 203,382 tris / 4.9 MB, 흉곽 194,110 tris / 3.6 MB

## 3. Anatomy Registry
- `js/anatomy/anatomy-registry.js`가 맡는다.
- 필드: anatomical_id, object_ids, asset_id(s), name_ko, name_en, aliases, fma_id, element_file_ids, group, parent, children, source, license, verification_status, selectable, internal_structure_available.
- 매핑 방식:
  - Mesh와의 연결은 `"asset:node"` 이름으로 명시한다. Three.js UUID는 쓰지 않는다.
  - 불러온 뒤 `resolve()`가 엔진 레지스트리 ID(`asset/slug`)로 바꾼다.
  - 상태 값: AVAILABLE, PARTIAL, MISSING, NOT_LOADED (지연 로딩 전)
- 렌더링 상태(색, 투명도, 표시 여부)는 저장하지 않는다. 그 상태의 기준은 기존 엔진 레지스트리와 material-controller다.
- 한 Mesh가 여러 구조에 속하면 `structureForObject`가 가장 구체적인 구조(자식이 없는 쪽)를 돌려준다.

## 4. Layer 시스템
- 레이어 10개: 인체 외형, 심장, 심장 내부 구조, 심장판막, 주요 동맥, 주요 정맥, 폐, 흉곽, 라벨, Anchor
- 레이어 숨김과 구조별 숨김은 따로 저장한다.
  - 보이는지: 레이어가 켜져 있고, 그 Mesh를 포함하는 구조 중 숨긴 것이 없어야 보인다.
  - 투명도: 레이어 투명도와 구조별 투명도 중 작은 값을 쓴다.
- 상위 레이어를 껐다 켜도 개별로 숨긴 구조(예: 승모판)는 계속 숨겨져 있다(확인함).
- 꺼진 레이어의 자산은 처음 켤 때 불러온다. 같은 자산을 동시에 요청해도 한 번만 불러온다.

## 5. 카메라 시스템
- 시점(views)과 방향 프리셋(directions)은 `scene.json` 데이터로 정의한다.
- 방향: 정면(앞), 후면(뒤), 해부학 좌측, 해부학 우측, 위(상단), 사선
- "해부학 좌측"은 환자의 왼쪽(+X)에서 본 화면이다. 화면 왼쪽을 뜻하지 않는다. 이 설명은 버튼 title과 scene.json의 note에 있다.
- 구조를 선택한 상태에서는 그 구조의 경계 상자를 기준으로, 선택이 없으면 불러온 전체를 기준으로 맞춘다.
- 좌심실 초점 이동: 목표점 오차 0, 방향 오차 0°

## 6. Label 시스템
- `js/anatomy/anatomy-labels.js`가 HTML 오버레이로 그린다. 매 프레임 구조 경계 상자의 중심을 화면에 투영한다.
- 언어: 한글, 영문, 한글·영문
- 범위: 주요 구조, 전체, 선택한 구조만, 끄기
- 숨김 조건: 카메라 뒤에 있음, 화면 밖, 구조가 숨겨짐
- 겹침 줄이기: 선택 > 호버 > 주요 순서로 우선순위를 매기고, 겹치는 라벨은 숨긴다.
- 확인 결과: 앞쪽 라벨 5개 표시, 카메라 뒤 라벨 0개 표시

## 7. Search 시스템
- `js/anatomy/anatomy-search.js`가 한글 이름, 영문 이름, 별칭, anatomical_id, FMA ID로 찾는다.
- 정규화: 소문자, 공백·하이픈 제거
- 점수: 정확히 일치 100, 앞부분 일치 70, 포함 40. 별칭으로 맞으면 −5.
- MISSING 구조도 결과에 나오고 "모델 없음" 배지가 붙는다.

## 8. Anchor 데이터 구조
```json
{ "anchor_id": "a.svc.lumen", "scene_id": "anatomy_cardiovascular",
  "anatomical_id": "cv.superior_vena_cava",
  "object": {"asset_id": "bp3d-cv-vena-cava", "node": "superior_vena_cava"},
  "object_id": "bp3d-cv-vena-cava/superior_vena_cava",
  "name_ko": "...", "name_en": "SVC centroid",
  "position": [-0.01495, 1.29124, 0.11527], "coordinate_space": "object_local",
  "optional_direction": null,
  "verification_status": "GEOMETRY_DERIVED (vertex centroid); NOT anatomically verified",
  "notes": "..." }
```
- 위치는 대상 Object의 로컬 좌표로 저장한다. 모델이 움직이거나 회전해도 따라간다(오차 0으로 확인).
- 장면 좌표는 저장하지 않고, 필요할 때 `localToWorld`로 계산한다.
- 시드 Anchor 8개는 정점 평균으로 만든 기하 위치다. 해부학적으로 검증한 위치가 아니다. 사용자가 표면 클릭으로 만든 Anchor는 `MANUAL (surface pick); NOT anatomically verified`로, 편집한 Anchor는 뒤에 `; EDITED`를 붙여 표시한다.

## 9. Anchor 편집 기능
`js/anatomy/anchor-manager.js`와 Explorer 개발자 패널에서 쓴다.
- 만들기: "표면 클릭으로 만들기"를 켜고 표면을 클릭하면 레이캐스트 지점에 생긴다. 단면으로 잘려 안 보이는 면은 건너뛴다.
- 이동: TransformControls 기즈모 또는 로컬·장면 XYZ 직접 입력. 두 좌표는 서로 변환된다.
- 이름 바꾸기(한글·영문), 선택 구조에 연결, 삭제
- JSON 내보내기·불러오기. 불러올 때 형식을 검사하고, 잘못된 항목은 이유와 함께 거부한다.

## 10. Python 연동 방식
- Worker로 보내는 스냅샷: 엔진 객체, 해부학 구조 41개(id, status, visible), Anchor 9개(id, anatomical_id)
- Python `scene_commands.build`는 target에 anatomical_id(예: `cv.left_ventricle`)를 쓸 수 있다.
  - JS command-runner가 `resolve` 훅으로 그 구조의 Mesh 전체로 바꾼다.
  - camera_focus는 여러 Mesh를 묶은 상자로 이동한다.
- Python은 버튼 이벤트 때만 호출한다. 프레임마다 호출하지 않는다.
- 확인: Python 명령으로 좌심실 강조와 초점 이동 성공

## 11. Explorer와 Sandbox 분리
- `explorer.html`: 사용자용 화면
  - 계통 선택(심혈관만 활성), 검색, 레이어 트리, 3D 화면, 카메라 바, 구조 정보, 격리·투명·숨김·투명도, 단면
  - 설정에서 라벨 언어와 범위를 고른다.
  - 개발자 모드를 켜야 Anchor, Python, 로그 패널이 보인다.
- `index.html`: 기존 STEP 02 개발자 Sandbox, 그대로 둠
  - 공유 엔진 모듈 변경 뒤 장면 a, b, c, e, step01, 데모, 오류 테스트가 이전과 같게 동작함을 확인했다.
- 공유 엔진 모듈은 기존 기능을 유지한 채 확장만 했다.

| 모듈 | 추가한 것 |
|---|---|
| material-controller | `isolateSet`, `ghostSet` |
| clipping-controller | `targetIds` |
| scene-manager | `useCatalog` |
| command-runner | resolve 훅, 여러 대상 |
| camera-controller | `directionOf` |

## 12. 성능 측정 결과
| 항목 | 값 |
|---|---|
| 첫 장면 로드 (4개 GLB) | 74 ms |
| 초기화 | 172 ms |
| 지연 로딩: 폐 / 흉곽 / 피부 | 29 / 66 / 49 ms |
| 처음 렌더링 삼각형 | 191,936 |
| 모든 레이어를 켰을 때 렌더링 삼각형 | 1,092,652 |
| 초기화 3회 반복 후 | 루트 4개, 지오메트리 24개 (누수 없음) |
| FPS | 앱 브라우저 창에서 약 30. 백그라운드 창이라 대표값이 아니다. |

- 투명 양면 재질은 두 번 그려져 삼각형 수가 늘어난다. 피부와 흉곽은 기본으로 꺼 두었다.
- 픽셀 비율 상한은 2다.
- 최적화 후보: forceSinglePass, 피부 decimate. 이번 단계에서는 적용하지 않았다.

## 13. 테스트 결과
| # | 항목 | 결과 |
|---|---|---|
| 1 | scene.json 로드와 자산 배치 | PASS |
| 2 | 레지스트리 매핑 (불일치 0, 상태 AVAILABLE 30 / PARTIAL 2 / MISSING 1 / NOT_LOADED 8) | PASS |
| 3 | Mesh 클릭 → 가장 구체적인 구조 | PASS |
| 4 | 검색 (한글, 영문, 별칭, ID, FMA, MISSING 표시) | PASS |
| 5 | 레이어 토글 후 개별 상태 유지 | PASS |
| 6 | 레이어와 구조 투명도 | PASS |
| 7 | 카메라 시점과 방향 프리셋, 해부학 좌우 | PASS |
| 8 | 구조 초점 이동 (좌심실 오차 0) | PASS |
| 9 | 여러 Mesh 구조의 강조, 격리, 고스트, 복원 (폐정맥 4개) | PASS |
| 10 | 라벨 투영, 뒤쪽 숨김, 겹침 줄이기 | PASS |
| 11 | 단면이 선택 구조에만 적용 (심장 13개 Mesh) | PASS |
| 12 | Anchor가 모델 이동과 회전을 따라감 (오차 0) | PASS |
| 13 | Anchor 표면 클릭 생성, XYZ 편집, 이름 변경, 삭제 | PASS |
| 14 | Anchor JSON 내보내기·불러오기, 잘못된 JSON 거부 | PASS |
| 15 | TransformControls 실제 마우스 드래그 | NOT TESTED (objectChange 경로만 확인) |
| 16 | Python에서 anatomical_id로 명령 | PASS |
| 17 | 초기화 반복 후 리소스 누수 없음, 지연 로딩 중복 없음 | PASS |
| 18 | 모바일 | 375×812 에뮬레이션 레이아웃은 PASS. 실제 기기 터치(핀치·회전)는 NOT TESTED |

추가로 확인한 것:
- Python 테스트 통과 (`test_sandbox3d` 38, `test_scene_commands` 30, `test_engine` 70)
- 도구 테스트 13개 통과
- STEP 02 Sandbox 회귀 확인 통과
- GitHub Pages 배포본: 커밋 전이라 NOT TESTED
- 의학적 정확성: NOT TESTED. 전문가 검증 없음.

## 14. 남은 문제
- 원본 데이터에 없는 구조는 만들지 않았다: 심실 심근 벽, 심실중격, 폐 실질
- Anchor 시드는 기하 위치다. 해부학 전문가 검토가 필요하다.
- 피부 모델이 무겁다(4.9 MB, 20만 tris). 모바일에서 켤 때 부담이 될 수 있다.
- 라벨 위치는 경계 상자 중심이다. 휘어진 혈관에서는 표면에서 벗어날 수 있다.
- 실제 기기 성능과 터치 조작은 확인하지 못했다.

## 15. 사용한 라이선스와 출처
- BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0
  - 심혈관 6개, 피부, 흉곽
  - Explorer 화면 하단에 출처를 표시한다.
  - 수정 내역은 `assets/licenses/bodyparts3d.md`에 있다.
- Three.js r160 (MIT), Pyodide 0.26.4 (MPL 2.0): CDN으로 불러오고 재배포하지 않는다.
- BioDigital Human, Innerbody, Z-Anatomy의 자료는 쓰지 않았다.

## 16. STEP 03-C에서 필요한 모델과 데이터
- **경로:** 심장 내강과 혈관 중심선을 따라 혈액 이동 경로를 만든다(CatmullRomCurve3).
  - 출발점은 Anchor 8개와 후보 15개다.
  - 중심선 추출에는 정점 평균보다 나은 방법이 필요하다(예: 단면 중심 샘플링).
- **판막 개폐와 심장 박동:** BodyParts3D는 정적 모델이다. 애니메이션은 라이선스가 확인된 다른 자료가 필요하다.
- **심실 심근과 중격:** 라이선스를 확인한 다른 출처가 필요하다. Z-Anatomy는 검토 전까지 쓰지 않는다.
- **관상동맥 세부 가지, 폐 실질:** 같은 조건이다.
- **다른 계통 장면:** 소화기, 호흡기, 비뇨기, 림프계는 `specs/`와 `anatomy/*.src.json`을 추가해 같은 파이프라인으로 만든다.
- **검증:** Anchor 위치와 구조 이름의 전문가 검토
