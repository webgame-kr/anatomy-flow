# FLOW Asset Pipeline v0.3: BodyParts3D 해부학 모델 가공 (STEP 03-A)

BodyParts3D 원본 OBJ를 검색하고, 필요한 ELEMENT만 꺼내, Blender로 GLB를 만드는 범용 파이프라인입니다. 계통에 묶이지 않습니다. 새 계통은 `targets/<계통>.json`(조사 대상)과 `specs/<계통>.json`(변환 사양)만 추가하면 됩니다.

## 1. 도구 (개발 도구 · 수업 범위 밖)
| 파일 | 역할 |
|---|---|
| `tools/asset-processing/bp3d_catalog.py` | 메타데이터 3종과 ZIP 안 OBJ 머리글로 트리별 색인을 만들고 검색합니다. ZIP은 풀지 않고 OBJ 머리글 1KB만 읽습니다. 지원하는 검색: 영문명·FMA ID, 완전·부분 일치(대소문자 무시), 구성 element, 포함 관계, CSV·JSON 출력 |
| `tools/asset-processing/survey_structures.py` | 조사 대상 목록(동의어 포함)을 IS-A·PART-OF 트리에서 따로 검색해 후보를 모두 기록합니다(→ `docs/development/bp3d/<계통>-survey.csv`). |
| `tools/asset-processing/bp3d_build.py` | 사양을 처리합니다. `plan`(element 해석·겹침 검사) → `extract`(필요한 OBJ만, 해시 기록) → `convert`(Blender) → `register`(메타데이터 JSON, 자산 대장). `all`이면 전부 실행합니다. |
| `tools/blender/bp3d_to_glb.py` | Blender 5.3 백그라운드 변환. OBJ 불러오기 축 자체 검사, 파트별 결합, mm→m, 메시 검사, 재질, GLB 내보내기, 다시 불러와 경계 상자 검증 |
| `tools/asset-processing/test_bp3d_tools.py` | 도구 자체 테스트 13개(원본이 없으면 건너뜀) |

게임 로직 Python(`py/`)은 수업 범위 문법만 쓰고, 이 도구들은 `zipfile`, `json`, `csv`, `argparse`, `pathlib`, `hashlib`, `bpy`를 씁니다. 둘을 섞지 않습니다.

```powershell
python tools/asset-processing/bp3d_build.py all tools/asset-processing/specs/cardiovascular.json
```

## 2. BodyParts3D 데이터 구조 (실제 파일로 확인)
- **ID 체계:** 메시는 원자 장기(ELEMENT)만 있습니다. OBJ 파일명은 element file ID(`FJ1931`, 좌우 대칭본은 `FJ1383M`처럼 `M`이 붙음)이고, FMA ID나 Representation ID(`BP…`)가 아닙니다.
- **COMPOUND:** 복합 장기는 `*_element_parts.txt`(concept id · name · element file id)에 적힌 ELEMENT의 합입니다.
- **OBJ 머리글:** File ID, Representation ID, Build-up logic, Concept ID, English name, `Bounds(mm)`, Volume(cm3)가 들어 있습니다.
- **트리:** IS-A(concept 2,905 · OBJ 2,234)와 PART-OF(concept 1,368 · OBJ 1,258)는 따로 색인하고 병합하지 않습니다. 같은 FMA ID라도 트리마다 구성 element가 다를 수 있습니다.
- **원본 데이터의 특이점** (수정하지 않고 기록만 합니다)
  - OBJ 머리글의 Concept ID 중 명칭표에 없는 것: IS-A 17개, PART-OF 2개
  - OBJ 머리글과 명칭표의 Representation ID 불일치: IS-A 11개, PART-OF 23개
  - PART-OF `mitral valve`(FMA7235)에 대동맥판 첨 2개(FJ2426, FJ2431)가 들어 있습니다.
  - PART-OF `wall of right ventricle`(FMA9533)은 유두근 3개뿐이고, `wall of left ventricle`(FMA9556)은 유두근 2개와 승모판 후엽입니다. **심실 심근(벽) 메시는 없습니다.** 심실 모양은 내강(cavity) 입체로 나타납니다.
  - **폐 실질(겉면) 메시가 없습니다.** `left lung`·`right lung`은 기관지 가지 98개, 분절 동맥 97개, 분절 정맥 85개의 합입니다.

## 3. 좌표계와 단위 (측정으로 확인)
| 단계 | 좌표 | 단위 | 근거 |
|---|---|---|---|
| 원본 OBJ | +X = 환자 왼쪽, −Y = 앞, +Z = 위 | mm | 머리글 `Bounds(mm)`, 전신 높이 1,719.5mm(Z), 잇몸 y≈−180, 좌폐 x>0 |
| Blender | 원본과 같음 (`obj_import forward_axis=Y, up_axis=Z`) | m (메시 데이터 ×0.001) | 첫 정점 대조, 차이 0.000034mm |
| glTF / Three.js | +X = 왼쪽, +Y = 위, +Z = 앞 | m | `export_yup=True`에서 한 번만 바꿈: **(x, y, z) = (X, Z, −Y) × 0.001** |

- **좌표 처리:** 장기별 중심 정렬이나 크기 정규화는 하지 않습니다. 모든 파일이 BodyParts3D 원점을 그대로 씁니다. 그래서 심장은 y≈1.2m, 곧 서 있는 사람의 가슴 높이에 있습니다.
- **엔진 프리셋과 일치:** 이 좌표는 엔진 카메라 프리셋(정면 +Z, 좌측 = 모델의 왼쪽 +X)과 그대로 맞습니다.

## 4. 심혈관계 조사 결과 (`cardiovascular-survey.csv`)
| 대상 | 결과 | 사용한 concept (PART-OF) |
|---|---|---|
| Heart | 있음 (COMPOUND, element 83) | FMA7088 |
| Right / Left atrium | 있음. 벽(ELEMENT) + 내강(ELEMENT) | 벽 FMA9457 · FMA9531, 내강 FMA11359 · FMA9465 |
| Right / Left ventricle | 내강만 있음, **심근 벽 없음** | 내강 FMA9291 · FMA9466 |
| Tricuspid / Pulmonary / Aortic valve | 있음 (판막엽·첨 3개씩) | FMA7234 · FMA7246 · FMA7236 |
| Mitral valve | 있음. 원본 concept에 대동맥판 첨이 섞여 있어 이름에 mitral이 든 2개만 사용 | FMA7235 (필터) |
| Interventricular septum | **없음** (두 트리 모두에 이름·부분 일치 없음) | - |
| Left / Right lung | 기관지 가지·혈관 묶음만 있음, **폐 겉면 없음** | FMA7310 · FMA7309 (기관지만) |
| Aorta | 있음 (상행·궁·하행·흉부·복부 5개) | FMA3734 |
| Superior / Inferior vena cava | 있음 | FMA4720 · FMA10951 |
| Pulmonary trunk | 있음 | FMA8612 |
| Pulmonary arteries | 있음 (우 55 · 좌 38 element, 폐 안 분절 동맥 포함) | FMA50872 · FMA50873 |
| Pulmonary veins | 있음 (4개) | FMA49914 · FMA49911 · FMA49916 · FMA49913 |

## 5. 출력 모델과 FMA·element 대응
모든 파일이 같은 좌표를 씁니다. element file ID 전체 목록은 각 `*.meta.json`과 `asset_registry.csv`에 있습니다.

| 파일 | 파트 (노드 이름) | FMA | 원본 concept | element | 삼각형 |
|---|---|---|---|---|---|
| heart.glb | `heart_wall_right_atrium` | FMA9457 | wall of right atrium | 1 | 17,784 |
| heart.glb | `heart_wall_left_atrium` | FMA9531 | wall of left atrium | 1 | 7,544 |
| heart.glb | `heart_cavity_right_atrium` | FMA11359 | cavity of right atrium | 1 | 2,244 |
| heart.glb | `heart_cavity_right_ventricle` | FMA9291 | cavity of right ventricle | 1 | 1,918 |
| heart.glb | `heart_cavity_left_atrium` | FMA9465 | cavity of left atrium | 1 | 1,064 |
| heart.glb | `heart_cavity_left_ventricle` | FMA9466 | cavity of left ventricle | 1 | 1,722 |
| heart.glb | `heart_valve_tricuspid` | FMA7234 | tricuspid valve | 3 | 17,612 |
| heart.glb | `heart_valve_pulmonary` | FMA7246 | pulmonary valve | 3 | 3,638 |
| heart.glb | `heart_valve_aortic` | FMA7236 | aortic valve | 3 | 2,150 |
| heart.glb | `heart_valve_mitral` | FMA7235 (mitral만) | mitral valve | 2 | 11,378 |
| heart.glb | `heart_papillary_muscles` | FMA7088 중 papillary | heart | 5 | 4,014 |
| heart.glb | `heart_coronary_veins` | FMA7088 중 vein·sinus | heart | 7 | 4,386 |
| heart.glb | `heart_coronary_arteries` | FMA7088 중 artery·branch | heart | 54 | 27,348 |
| aorta.glb | `aorta` | FMA3734 | aorta | 5 | 10,188 |
| vena-cava.glb | `superior_vena_cava` | FMA4720 | superior vena cava | 1 | 598 |
| vena-cava.glb | `inferior_vena_cava` | FMA10951 | inferior vena cava | 2 | 3,080 |
| pulmonary-vessels.glb | `pulmonary_trunk` | FMA8612 | pulmonary trunk | 1 | 1,302 |
| pulmonary-vessels.glb | `right_pulmonary_artery` | FMA50872 | right pulmonary artery | 55 | 19,962 |
| pulmonary-vessels.glb | `left_pulmonary_artery` | FMA50873 | left pulmonary artery | 38 | 22,926 |
| pulmonary-vessels.glb | `right_superior_pulmonary_vein` | FMA49914 | right superior pulmonary vein | 27 | 6,746 |
| pulmonary-vessels.glb | `right_inferior_pulmonary_vein` | FMA49911 | right inferior pulmonary vein | 24 | 5,524 |
| pulmonary-vessels.glb | `left_superior_pulmonary_vein` | FMA49916 | left superior pulmonary vein | 26 | 6,722 |
| pulmonary-vessels.glb | `left_inferior_pulmonary_vein` | FMA49913 | left inferior pulmonary vein | 15 | 4,554 |
| pulmonary-vessels.glb | `left_lung_other_pulmonary_arteries` | FMA7310 중 artery | left lung (혀구역 동맥) | 6 | 4,176 |
| lungs-airways.glb | `right_lung_bronchial_tree` | FMA7309 중 bronch | right lung | 53 | 42,278 |
| lungs-airways.glb | `left_lung_bronchial_tree` | FMA7310 중 bronch | left lung | 45 | 10,588 |

| 파일 | 크기 (bytes) | Mesh | 삼각형 | 경계 상자 크기 (m, x·y·z) |
|---|---|---|---|---|
| heart.glb | 2,069,080 | 13 | 102,802 | 0.116 · 0.105 · 0.106 |
| aorta.glb | 192,468 | 1 | 10,188 | 0.042 · 0.370 · 0.092 |
| vena-cava.glb | 74,192 | 2 | 3,678 | 0.025 · 0.359 · 0.025 |
| pulmonary-vessels.glb | 1,445,760 | 8 | 71,912 | 0.240 · 0.341 · 0.151 |
| lungs-airways.glb | 1,095,016 | 2 | 52,866 | 0.239 · 0.228 · 0.158 |
| cardiovascular-preview.glb | 4,875,284 | 26 | 241,446 | 0.242 · 0.409 · 0.158 |

- **최적화:** 원본이 이미 폴리곤 99% 감소판이라 Decimate는 하지 않았습니다. 형태는 바뀌지 않았습니다.
- **메시 검사:** 퇴화 면, 감김 방향 불일치, 떨어진 정점은 모두 0입니다. 모든 파트가 열린 메시라 경계 모서리가 있습니다(혈관 끝 등). 수리하지 않고 메타데이터에 기록했습니다.

## 6. 검증 결과 (2026-11-28, 로컬)
| 항목 | 결과 |
|---|---|
| OBJ 불러오기 축 (파일 첫 정점 = Blender 정점) | PASS (차이 0.000034mm) |
| GLB 다시 불러오기 경계 상자 (Blender) | PASS (차이 0) |
| Three.js 경계 상자 vs Blender 보고 (26 파트) | PASS (최대 차이 0.000005m) |
| 개별 GLB 5개 vs 통합 GLB (26 Mesh) | PASS (차이 0) |
| 해부학 상대 위치 7개 검사 (좌·우·앞·뒤·위·아래) | PASS |
| 엔진 기능: 로딩, 등록, ID, Focus(2.7cm 판막 → 0.171m), Hover·클릭, 숨김, 투명도, 격리, 단면, 제거 | PASS |
| 반복 전환 리소스 (E↔F 3회) | PASS (GPU geometry 31로 일정, 제거하면 추적 리소스 0) |
| 의학적 정확성 검증 | **NOT TESTED** (전문가 검토 없음) |
| 모바일 성능 (241k 삼각형) | **NOT TESTED** |

## 7. 재질 (교육용 색)
| 재질 | 색 | 적용 |
|---|---|---|
| heart_wall | #8b3a3a 적갈색 | 심방벽 |
| heart_cavity | #c97b7b | 네 방의 내강(혈액이 차는 공간의 형태) |
| valve / papillary | #e8d5b0 / #a34d4d | 판막 / 유두근 |
| systemic_artery / systemic_vein | #d23c3c / #3c62c8 | 대동맥·관상동맥 / 대정맥·심장 정맥 |
| pulmonary_artery / pulmonary_vein | #6f4fc0 / #e06c8a | 폐동맥(산소가 적은 혈액) / 폐정맥(산소가 많은 혈액) |
| airway | #f2b5bf 분홍 | 기관지 가지 |

- 혈관 색은 실제 혈액 색이 아닌 교육용 구분입니다. 동맥·정맥이라는 이름만으로 산소화 상태를 판단하지 않습니다.
- 파트마다 Mesh가 따로 있고, 엔진의 material-controller가 객체별로 재질을 복제해 바꿉니다.

## 8. 누락·검증 필요
- **심실중격, 심실 심근 벽, 폐 실질:** BodyParts3D 4.0(PART-OF·IS-A)에 없습니다. 도형으로 대신 만들지 않았습니다.
- **좌폐 혀구역 동맥 6개:** 좌폐동맥 concept에 들어 있지 않아 별도 파트(`left_lung_other_pulmonary_arteries`)로 두었습니다.
- **원본 ID 불일치:** Representation ID·Concept ID 불일치 항목은 원본 그대로 두었습니다(색인에 기록).
