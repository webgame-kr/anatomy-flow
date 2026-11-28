# tools/blender/ — 해부학 모델 처리

> **STEP 03-A (2026-11-28) 구현됨:** `bp3d_to_glb.py`(OBJ → GLB 변환)를 만들었습니다. `tools/asset-processing/bp3d_build.py convert`가 실행합니다. 전체 흐름, 좌표 원칙, 결과는 `docs/development/bp3d/ANATOMY_PIPELINE.md`에 있습니다. 아래 표의 1~6, 8~10단계는 `bp3d_catalog.py`·`bp3d_build.py`·`bp3d_to_glb.py`로 구현했습니다. 7단계(폴리곤 최적화)는 측정만 하고, 원본이 이미 99% 감소판이라 적용하지 않았습니다.
>
> 아래는 STEP 02 시점에 세운 계획(원문 보존)입니다.

**(계획 당시) 이번 단계에서는 스크립트를 구현하지 않았습니다.** 앞으로 만들 자동화의 순서와 규칙만 정리합니다.

## 환경 (2026-11-27 확인)
- Blender **5.3.0** (빌드 2026-11-10)
- 실행 파일: `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`
- 버전 확인:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --version
```

## 실행 방식 (예정)
화면 없이 스크립트만 돌립니다. 입력은 `raw-models/`, 출력은 `tools/out/`(Git 제외)에 두고, 검수를 통과한 결과만 `assets/anatomy/<계통>/`으로 옮깁니다.

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup --python tools/blender/<script>.py -- <인자>
```

## 처리 단계 (예정 스크립트)
| 순서 | 작업 | 예정 파일 | 메모 |
|---|---|---|---|
| 1 | BodyParts3D 부위 ID·명칭 검색 | `find_parts.py` | `isa_parts_list_e.txt` / `partof_parts_list_e.txt`가 필요합니다(현재 누락). |
| 2 | 필요한 장기 OBJ만 추출 | `extract_parts.py` | ZIP 전체를 풀지 않고 해당 ID 파일만 `raw-models/bodyparts3d/extracted/`에 풉니다. |
| 3 | OBJ 불러오기 | `import_obj.py` | Blender 5.x의 내장 OBJ 가져오기를 씁니다. |
| 4 | 객체 이름 표준화 | `normalize_names.py` | `<계통>_<구조>_<BP3D ID>` 형식. 예: `cardiovascular_heart_FJxxxx` |
| 5 | 상대 위치 유지 | 위 스크립트 공통 | BodyParts3D 원본 좌표를 그대로 두고, 그룹 전체에만 변환을 적용합니다. |
| 6 | 좌표·크기 표준화 | `normalize_transform.py` | mm → m, Z-up → Y-up(Three.js), 원점은 몸 중심 기준 |
| 7 | 폴리곤 최적화 | `decimate.py` | Decimate 모디파이어. 부위별 목표 삼각형 수를 기록합니다. |
| 8 | 재질·색상 설정 | `assign_materials.py` | 계통별 기본 색을 정하고, 텍스처 없이 가볍게 만듭니다. |
| 9 | GLB 내보내기 | `export_glb.py` | glTF 2.0 바이너리. 압축 여부는 이후 결정합니다. |
| 10 | 용량 확인 | `../validation/check_assets.py` | 파일 크기, 삼각형 수, 이름 규칙을 검사하고 `asset_registry.csv`를 갱신합니다. |

## 원칙
- `raw-models/`의 원본은 수정하지 않습니다. 결과물은 항상 새 파일로 만듭니다.
- 결과 GLB마다 `docs/references/asset_registry.csv`에 한 줄씩 추가합니다(BodyParts3D 출처 표기 포함).
- 스크립트의 Python은 Blender 내장 Python(`bpy`)에서 돌아가는 개발 도구입니다. 게임 로직(`py/`)과는 별개입니다.
