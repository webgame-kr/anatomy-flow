# BodyParts3D 파생 모델 (assets/anatomy/)

**출처 표기 (공식 지정 문구)**
> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

- 원본: BodyParts3D Release 4.0. PART-OF 트리 `partof_BP3D_4.0_obj_99.zip`(폴리곤 99% 감소판)을 썼습니다.
  - [다운로드 페이지](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)
  - [README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html)
- 라이선스: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
  - [공식 라이선스 페이지](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), 확인일 2026-11-28
- 사용자 안내: Sandbox의 해부학 장면(E, F)과 Anatomy Explorer(`explorer.html`, `scene.json`의 `credits`) 화면 아래에 위 문구가 표시됩니다.

## 수정 내역 (CC BY 4.0의 변경 표시)
- 원본 OBJ 중 필요한 ELEMENT만 골라 해부학 파트별로 하나의 Mesh로 합쳤습니다. 파트 구성은 `tools/asset-processing/specs/cardiovascular.json`(심혈관)과 `specs/context.json`(맥락 모델: 피부 `body-skin.glb`, 흉곽 `rib-cage.glb`, 2026-11-28 추가)에 있습니다.
- 단위를 mm에서 m로 바꿨습니다(×0.001). 모든 파일에 같은 배율을 적용하고, 중심 이동이나 크기 정규화는 하지 않았습니다.
- 좌표축을 바꿨습니다. glTF 내보내기에서 Z-up을 Y-up으로 한 번만 바꿉니다: glTF (x, y, z) = (X, Z, −Y) × 0.001.
- 교육용 재질 색을 새로 지정했습니다. 원본에는 색 정보가 없습니다.
- 정점, 면, 형태는 바꾸지 않았습니다. Decimate나 메시 수리도 하지 않았습니다.
- 모델별 상세 정보(FMA ID, element file ID, 삼각형 수, 경계 상자)는 `assets/anatomy/<계통>/*.meta.json`과 `docs/references/asset_registry.csv`에 있습니다.

- Anchor 시드 위치(`content/anatomy/cardiovascular/anchors.json`)는 원본 OBJ 정점의 평균으로 계산한 파생 데이터입니다. 해부학적으로 검증한 위치가 아닙니다.

## 색상에 대한 주의
혈관 색은 실제 혈액 색이 아니라 교육용 구분입니다.
- 체순환 동맥은 빨강, 체순환 정맥은 파랑입니다.
- 폐동맥은 보라색입니다. 이름은 동맥이지만 산소가 적은 혈액을 나릅니다.
- 폐정맥은 분홍빛 빨강입니다. 이름은 정맥이지만 산소가 많은 혈액을 나릅니다.
- 동맥·정맥이라는 이름만으로 산소화 상태를 판단하지 않습니다. 산소화 상태 표현은 이후 게임 상태(색 층)에서 따로 다룹니다.

## 의학적 검증
이 모델들은 원본 ID와 형태를 추적해 확인한 것입니다. 전문가가 의학적으로 검증한 것은 **아닙니다**.

## STEP 04-B+ 추가 (2026-11-29)
- **IS-A 트리도 쓴다:** `isa_BP3D_4.0_obj_99.zip`(같은 BodyParts3D 4.0, 같은 라이선스). PART-OF 개념은 하위 가지 전체를 담아 element가 수십 개가 되는 경우가 있어, 단일 구조는 IS-A element를 쓴다. 자산별로 실제 쓴 아카이브를 `asset_registry.csv`의 `source_archive`에 적는다.
- 새 변환 사양: `specs/cardiovascular-v2.json`(심장 v2: 통합 심실 벽 FJ2428, 첨판별 파트), `specs/systemic-vessels.json`(목·팔·다리 혈관 22개), `specs/regulation-prep.json`(숨뇌·척수 일부, 콩팥·부신, 가로막, 이자, 오른속목동맥). 변경 내용은 위 "수정 내역"과 같다(형태 변경 없음).
- **형태를 바꾼 파생 모델 (변경 표시):**
  - `cardiovascular/heart-v2-ventricle-regions.glb` — FJ2428 심실 벽의 면을 좌·우 심실 내강까지 거리로 나눠 좌심실 자유벽·우심실 자유벽·중격 영역 3개 객체로 분리하고, 내강 중심 쪽으로 당기는 Shape Key `contract`를 더했다(`tools/blender/split_ventricle_wall.py`). 기하 분할이며 해부학적 경계가 아니다.
  - `cardiovascular/heart-v2-valves-rig.glb` — 첨판 11개와 유두근 5개에 개폐 Shape Key `open`(판륜 경첩 회전 근사)과 클립을 더했다(`tools/blender/rig_valves.py`). 교육용 근사이며 실제 첨판 변형이 아니다.
- 화면 출처 표기: Sandbox 장면 HC·HV·RP의 `credits`.
