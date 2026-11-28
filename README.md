# NURSE FLOW 3D

실시간 3D 인체 모델에서 간호학·해부생리학 기전을 **타이핑**과 **시각적 이동**으로 배우는 웹게임입니다. 혈액, 림프액, 음식물, 세포, 호르몬, 신경 신호 등이 이동하고 변화하는 모습을 다룹니다.

**현재 단계: STEP 03-A — FLOW Asset Pipeline v0.3 (해부학 모델 가공)**
BodyParts3D 원본에서 심혈관계 모델을 골라 GLB로 변환했습니다(장면 E·F). 혈액 이동과 타이핑 진행은 아직 없습니다.

- STEP 01: 실시간 3D 렌더링과 Pyodide 연결 (`step01` 장면에서 그대로 동작)
- STEP 02: 객체·카메라·선택·재질·단면·장면 관리 엔진 (아래 "STEP 02 엔진")
- 2026-11-27 개발 자료 정리: 원본 모델, 강의·전공 자료, 자산 대장, 참고 사이트 ("개발 자료와 자산 관리")
- **STEP 03-A:** BodyParts3D 검색·선택 추출·Blender 변환 파이프라인. 심장, 대동맥, 대정맥, 폐혈관, 기관지 가지 GLB 6개를 원본 상대 위치 그대로 만들었습니다(`docs/development/bp3d/ANATOMY_PIPELINE.md`).
- **다음 단계 (STEP 03-B):** 3D 곡선 경로 위 혈액 이동, 이동 객체 추적 카메라, 보존한 진행 규칙 엔진과 타이핑 입력 연결

3D 해부학 모델 출처: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International (변형 내역은 `assets/licenses/bodyparts3d.md`)

배포 주소: https://webgame-kr.github.io/anatomy-flow/

## 기술 스택과 버전

| 구분 | 사용 기술 | 버전 |
|---|---|---|
| 3D | Three.js (WebGL) | **0.160.0** (r160), importmap으로 고정 |
| 카메라 조작 | OrbitControls (three/addons) | 0.160.0 |
| Python 실행 | Pyodide (Web Worker 안에서 실행) | **0.26.4** (Python 3.12.1) |
| 화면 | Vanilla JavaScript (ES Modules), HTML, CSS | - |
| 데이터 | JSON / CSV | - |
| 배포 | GitHub Pages (정적 사이트) | - |

라이브러리는 모두 jsDelivr CDN에서 버전을 고정해 불러옵니다. 빌드 도구와 npm 설치가 필요 없습니다.
- Three.js: `index.html`의 importmap
- Pyodide: `js/python/py-client.js`의 `PYODIDE_VERSION`

## 폴더 구조

```
anatomy-flow/
├─ index.html              개발자 Sandbox (importmap에 Three.js 버전 고정)
├─ css/style.css
├─ js/
│  ├─ main.js              Sandbox UI 연결 (엔진 모듈 조립)
│  ├─ engine/              3D 엔진 (Three.js는 여기서만)
│  │  ├─ viewport.js       Renderer: Scene, Camera, Light, Grid/Axes, OrbitControls, 반응형, 루프, 컨텍스트 손실
│  │  ├─ object-registry.js   Object Registry: 모든 객체를 고유 ID·부모/자식으로 관리, 스냅샷
│  │  ├─ object-manager.js    기본 도형·그룹 생성, 위치·회전·크기 보간 (STEP 01 API 유지)
│  │  ├─ resource-tracker.js  Geometry·Material·Texture 참조 수 관리 (0일 때만 dispose)
│  │  ├─ model-loader.js      GLB/glTF 로딩, 진행률, 구조 분석, 로컬 파일 세트
│  │  ├─ camera-controller.js Focus · Overview · Presets · 부드러운 이동 · 추적 확장 자리
│  │  ├─ selection-controller.js Hover · 클릭 선택(드래그 구분) · 선택 상자
│  │  ├─ material-controller.js  객체별 색·투명도·표시·강조·격리·고스트 (공유 재질 보호)
│  │  ├─ clipping-controller.js  X/Y/Z 단면
│  │  ├─ scene-manager.js     장면 정의 → 생성·전환·초기화·이전 장면 복귀
│  │  └─ command-runner.js    Python 명령 검증·실행 (STEP 01 op + STEP 02 action)
│  ├─ python/
│  │  ├─ py-client.js      Worker 시작, 메시지 기반 Promise 호출, 오류 안내
│  │  ├─ py-worker.js      Web Worker 안에서 Pyodide 실행 (허용 함수 목록)
│  │  └─ python-bridge.js  Python 호출 → 명령 실행 → 로그
│  ├─ ui/
│  │  ├─ hierarchy-panel.js   Scene Hierarchy
│  │  ├─ inspector-panel.js   Object Inspector
│  │  └─ debug-panel.js       Status Bar · 로그 · Debug 오버레이
│  └─ shared/              다음 단계에서 다시 쓸 모듈 (v0.1에서 보존)
│     ├─ typing-input.js   한글 IME 조합 처리
│     └─ records.js        LocalStorage 기록, CSV 다운로드
├─ py/                     Python 게임 로직 (Three.js에 의존하지 않음)
│  ├─ sandbox3d.py         STEP 01: 3D 객체 상태와 명령 생성 (step01 장면)
│  ├─ scene_commands.py    STEP 02: 스냅샷 기반 명령 생성·검증
│  ├─ typing_engine.py     ┐
│  ├─ flow_engine.py       │ v0.1에서 보존한 진행 규칙 엔진
│  ├─ state_engine.py      │ (타이핑 판정, 노드·Edge 진행, 상태, 검증, 기록)
│  ├─ content_loader.py    │ STEP 02 이후 3D 콘텐츠에 연결
│  ├─ record_engine.py     │
│  └─ game.py              ┘
├─ content/sandbox/scenes.json  테스트 장면 정의 (step01, A~D)
├─ assets/sandbox/nf-test-rig.glb  자체 제작 테스트 모델 (공개)
├─ models/                 (STEP 01 자리, assets/로 통합 예정)
├─ tools/blender/make_test_rig.py  테스트 GLB 생성 스크립트
├─ tests/
│  ├─ test_sandbox3d.py    STEP 01 Python 테스트 (38개)
│  ├─ test_scene_commands.py STEP 02 명령 테스트 (30개)
│  └─ test_engine.py       진행 규칙 엔진 테스트 (70개)
├─ docs/
│  ├─ ARCHITECTURE.md      구조, Worker 메시지, 명령 형식
│  └─ FLOW_SPEC_v0.1.md    진행 규칙 데이터 명세 (2D 시절, 3D로 확장 예정)
├─ references/             수업 강의자료 (로컬 전용, .gitignore로 커밋 제외)
└─ CLAUDE.md               개발 원칙
```

2D SVG 버전(v0.1)은 태그 `v0.1-svg`에 남아 있습니다. 렌더러와 무관한 Python 규칙 엔진과 입력·기록 모듈은 보존했습니다.

## 로컬 실행

ES 모듈과 Web Worker를 쓰기 때문에 `index.html`을 더블클릭(`file://`)하면 동작하지 않습니다. 로컬 서버로 여세요.

```powershell
cd anatomy-flow
python -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000`을 엽니다.
- 인터넷 연결이 필요합니다. Three.js와 Pyodide(약 10MB)를 CDN에서 받습니다.
- 파일을 고쳤는데 그대로면 강력 새로고침(Ctrl+Shift+R)을 하세요.

### 조작
- 왼쪽 드래그: 회전
- 휠 또는 두 손가락: 확대·축소
- 오른쪽 드래그: 화면 이동
- 클릭: 객체 선택
- 패널 버튼: Python 명령으로 생성, 이동, 회전, 크기, 색상, 표시, 제거, 원형 배치, 전체 초기화

### 개발용 오류 시뮬레이션
- `?simulate=nopython`: Pyodide 로딩 실패 상황 (3D는 동작하고 Python 명령 버튼은 비활성화)
- `?simulate=nowebgl`: WebGL 미지원 상황 (안내 화면 표시)

## 테스트

```powershell
python tests/test_sandbox3d.py
```

```powershell
python tests/test_scene_commands.py
```

```powershell
python tests/test_engine.py
```

둘 다 프로젝트 폴더에서 실행합니다. 실패가 있으면 종료 코드 1을 돌려줍니다.

브라우저에서 확인할 것:
1. 격자, 축, 객체 3개가 보이는지
2. 드래그하면 회전하고 휠로 확대되는지
3. 객체를 클릭하면 선택 상자와 좌표가 표시되는지
4. 버튼을 누르면 해당 객체만 부드럽게 이동하거나 색이 바뀌는지
5. 전체 초기화 후 기본 객체 3개로 돌아오는지
6. 로그에 "상태 불일치" 오류가 없는지
7. 위의 두 시뮬레이션 주소에서 안내가 나오는지

## GitHub Pages 배포

1. 저장소의 `main` 브랜치에 푸시합니다.
2. 처음 한 번만 **Settings → Pages**에서 `Deploy from a branch`, `main`, `/ (root)`를 고릅니다.
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/`에 반영됩니다.

모든 경로가 상대 경로라서 `/anatomy-flow/` 같은 하위 경로에서도 동작합니다. Worker와 Python 파일 경로는 `import.meta.url` 기준으로 계산합니다. `.nojekyll`은 Jekyll 처리를 끄기 위해 둡니다.

## 저작권 자료

수업 강의자료와 전공 교재는 로컬 `references/` 폴더에만 둡니다. 이 폴더는 `.gitignore`에 있어 커밋되지 않습니다.

## STEP 02 엔진

### 개발자 Sandbox 사용법
| 영역 | 기능 |
|---|---|
| 상단 Toolbar | Import GLB(로컬 `.glb` 또는 `.gltf`+`.bin`+텍스처 세트), 장면 선택, 이전 장면, Reset, 카메라 프리셋(정면·후면·좌측·우측·상단·사선·전체·기본), 선택 단위(부분/모델 전체), 격자·축 표시, Debug |
| 왼쪽 Scene Hierarchy | 부모·자식 트리, ●/○ 표시 전환, 클릭 선택, 더블클릭 Focus, 불러온 모델 목록(Focus·제거) |
| 중앙 Viewport | 드래그 회전, 휠/두 손가락 확대, 오른쪽 드래그 이동, Hover 강조, 클릭 선택, 빈 곳 클릭 해제, `F` 초점, `Esc` 해제 |
| 오른쪽 Inspector | ID·이름·종류·원본 자산·부모/자식·재질·BBox·애니메이션, Position/Rotation/Scale 입력, Opacity, Visible, Color, Focus, Isolate, 나머지 투명, 전체 표시, Restore Material, 단면, Python 명령 |
| 하단 Status Bar | FPS, 등록 객체 수, draw call·삼각형, GPU geometry·texture 수, Python 상태, 모델 로딩(진행률/진행률 모름), 마지막 로그(누르면 전체 로그) |

모바일(폭 900px 이하)에서는 좌우 패널이 접히고 툴바의 `계층`, `속성` 버튼으로 엽니다. 툴바는 한 줄로 가로 스크롤됩니다.
주소 뒤에 `?scene=scene_b`를 붙이면 해당 장면으로 시작합니다.

### 테스트 장면 (`content/sandbox/scenes.json`)
| 장면 | 내용 |
|---|---|
| `step01` | STEP 01 기능. Python(`sandbox3d`)이 객체를 만들고 움직입니다. |
| `scene_a` Primitive | 크기·위치가 다른 정육면체, 구, 원통, 작은 정육면체, 토러스: 선택, 카메라, 투명도, 단면 |
| `scene_b` GLB Import | 자체 제작 `nf-test-rig.glb` + (로컬에만) DamagedHelmet: 계층·재질 분석, BBox 카메라, 리소스 해제 |
| `scene_c` Multi-object | 그룹 3단계, 공유 Material, 6면 다중 Material, 같은 표시 이름(Part): 개별 조작, Isolation, 재질 충돌 방지 |
| `scene_d` Python Command | Python이 위치·회전·크기·색·투명도·강조·카메라 명령을 보내고, 일부러 만든 잘못된 명령의 처리를 확인합니다. |

### 객체 관리 구조
- **Object Registry (JavaScript)가 렌더링 상태의 기준**입니다. 객체마다 `object_id`, `display_name`, `object_type`(primitive/group/model/mesh), `source_asset_id`, `parent_id`, `children`, 변환, 표시, 투명도, 재질 요약, `bounding_box`, `selectable`, `animation_names`를 갖습니다.
- **Python에는 스냅샷만** (`id`, `type`, `visible`, `parent`) 보냅니다. Python은 그걸 보고 명령을 만들 뿐, 위치·재질을 따로 들고 있지 않아 상태가 어긋나지 않습니다. 예외인 STEP 01 `step01` 장면은 기존 방식을 유지합니다.
- **GLB 모델 등록:** 모델 루트를 `type: model`로 등록하고, 내부 Group·Mesh를 원래 계층 그대로 `모델ID/이름` 형식의 ID로 등록합니다. 이름이 겹치면 `_2`, `_3`을 붙입니다(이름만으로 ID를 정하지 않음). 원본의 상대 위치는 그대로 둡니다.
- **선택:** Raycaster가 맞힌 Mesh에서 위로 올라가며 가장 가까운 등록 객체를 찾습니다. "선택: 모델 전체"면 최상위 객체를 고릅니다. 숨김, 선택 불가, 투명도 0, 단면으로 잘린 부분은 제외합니다.
- **재질 층 분리:**
  - 상태 색·투명도(`set_color`/`set_opacity`, 이후 생리 상태 변화용) → `color`/`opacity`
  - 강조(선택 > 이벤트 `highlight` > Hover) → `emissive`
  - 격리·고스트 → 표시·투명도 곱
  - 단면 → `clippingPlanes`

  바꿔야 하는 Mesh만 재질을 복제하고, 상태가 없어지면 원본으로 되돌립니다. 그래서 공유 재질을 쓰는 다른 객체에 영향이 없습니다.
- **리소스 해제:** `resource-tracker`가 Geometry, Material, Texture의 참조 수를 세고, 0이 될 때만 dispose합니다. 장면 전환이나 모델 제거 때 사용합니다.

### 카메라 시스템
- **Orbit:** OrbitControls에 감속 효과를 줍니다. 최소·최대 거리와 near/far는 초점 대상 크기에 맞춰 자동으로 조정됩니다.
- **Focus:** Bounding Sphere 반지름과 화면 비율(세로·가로 FOV)로 거리를 계산하고 0.7초 동안 부드럽게 이동합니다. 이동은 한 번에 하나만 하며, 사용자가 조작하면 멈춥니다.
- **Overview / 기본:** 장면 전체 보기, 장면 정의의 `camera_defaults`로 복귀
- **Presets:** 장면의 `coordinate_system`(`up`, `front`)을 기준으로 합니다. 좌측·우측은 **모델의 해부학적 좌·우측 면을 보는 시점**입니다(`+Z`를 보는 모델이면 좌측 = `+X`).
- **확장 자리:** `setFollowTarget(id)` 추적 인터페이스(STEP 03에서 이동 객체 추적에 사용)

### Python 명령 (STEP 02)
```python
commands = [
    {"action": "set_visibility", "target": "sphere_01", "value": True},
    {"action": "set_opacity", "target": "sphere_01", "value": 0.5},
    {"action": "camera_focus", "target": "sphere_01"},
]
```
| action | value | 비고 |
|---|---|---|
| `set_position` / `set_rotation` | `[x, y, z]` (회전은 도) | `duration`(ms)이 있으면 보간 |
| `set_scale` | 숫자 또는 `[x, y, z]` (0보다 큼) | |
| `set_color` | `"#rrggbb"` | 상태 색 층 |
| `set_visibility` | `True` / `False` | |
| `set_opacity` | 0 ~ 1 | |
| `highlight` | `True` / `False` | 이벤트 강조 층 (선택 강조와 별개) |
| `camera_focus` | - | 대상이 이동 중이면 도착한 뒤 초점 |
| `camera_overview` | - | target 불필요 |
| `scene_change` | 장면 ID | target 불필요 |

- 검증은 두 번 합니다. Python(`scene_commands.validate`)과 JavaScript(`command-runner`)가 각각 명령 종류, 대상 ID, 값을 검사합니다.
- 잘못된 명령은 로그에 남기고 건너뛰며, 나머지 명령은 계속 실행합니다.

## STEP 03-A 해부학 모델 파이프라인

```powershell
python tools/asset-processing/bp3d_catalog.py search "pulmonary vein" --tree partof
python tools/asset-processing/survey_structures.py tools/asset-processing/targets/cardiovascular.json
python tools/asset-processing/bp3d_build.py all tools/asset-processing/specs/cardiovascular.json
python tools/asset-processing/test_bp3d_tools.py
```

- **필요한 원본:** `raw-models/bodyparts3d/`(Git 제외)에 원본 ZIP 2개와 메타데이터 6개가 있어야 합니다.
- **결과물:** GLB와 `*.meta.json`은 `assets/anatomy/cardiovascular/`에 생기고, 자산 대장(`docs/references/asset_registry.csv`)이 갱신됩니다.
- **새 계통 추가:** `tools/asset-processing/targets/`와 `specs/`에 JSON을 추가합니다. 코드는 그대로 씁니다.
- **좌표:** 모든 GLB가 같은 원점을 씁니다. glTF (x, y, z) = (X, Z, −Y) × 0.001이고, +X = 환자 왼쪽, +Y = 위, +Z = 앞입니다. 장면 E(개별 GLB 5개)와 F(통합 GLB)에서 확인합니다.
- **데이터 한계:** BodyParts3D 4.0에는 심실 심근 벽, 심실중격, 폐 실질 메시가 없습니다. 자세한 내용은 `docs/development/bp3d/ANATOMY_PIPELINE.md`에 있습니다.
- **코드 범위:** 이 도구들은 개발 도구라 수업 범위 밖의 라이브러리(zipfile, json, bpy 등)를 씁니다. 게임 로직 `py/`와 분리되어 있습니다.

## 개발 자료와 자산 관리

### 개발 원칙 요약
- **실시간 3D 기반:** Three.js(WebGL)로만 그립니다. 2D SVG 엔진은 쓰지 않습니다.
- **역할 분리:**
  - Python(Pyodide, Web Worker)은 게임 규칙과 상태만 맡고 명령을 돌려줍니다.
  - JavaScript(Three.js)는 렌더링, 보간, 카메라, 입력을 맡습니다.
  - Python은 Three.js를 모르고, 프레임마다 호출되지 않습니다.
- **무료·정적 배포:** 무료 오픈소스만 씁니다. 서버, DB, 유료 API 없이 GitHub Pages로 배포합니다.
- **원본과 배포 모델 분리:**
  - 원본: `raw-models/`(로컬, Git 제외)
  - 배포: Blender로 최적화한 GLB만 `assets/`에 둡니다.

### 추가된 폴더
```
assets/            배포용 최적화 자산
  anatomy/<계통>/  cardiovascular, respiratory, digestive, urinary, lymphatic,
                   nervous, endocrine, integumentary, musculoskeletal
  test-models/     로더 테스트용 (DamagedHelmet, 라이선스 확인 전 Git 제외)
  cells/ particles/ textures/ animations/
  licenses/        배포 자산의 라이선스·출처 표기
raw-models/        원본 대용량 모델 (Git 제외)
  bodyparts3d/archives|metadata|extracted, z-anatomy/, blender-projects/
references/        비공개 참고자료 (Git 제외)
  programming/, nursing/{anatomy,physiology,fundamentals,adult-health}, design/, technical/
content/<계통>/    sandbox, cardiovascular, digestive, respiratory, urinary, lymphatic
tools/             blender/, asset-processing/, validation/
docs/              development/, references/ (기존 ARCHITECTURE.md는 그대로 둠)
```
기존 엔진 경로(`py/`, `js/`, `css/`, `index.html`)는 바꾸지 않았습니다.
- 목표 구조의 `python/`은 기존 `py/`가 같은 역할을 합니다.
- `docs/architecture/`는 기존 `docs/ARCHITECTURE.md`가 같은 역할을 합니다.
- 빈 폴더는 Git에 올라가지 않으므로, 자료를 넣을 때 함께 커밋됩니다.

### 저작권·라이선스 관리 원칙
- 강의자료와 전공 교재는 공개 GitHub에 올리지 않습니다(`references/` 제외).
- 모든 외부 모델은 `docs/references/asset_registry.csv`에 출처, 라이선스, 처리 상태를 기록합니다. 확인되지 않은 값은 `UNKNOWN` 또는 `PENDING`으로 적습니다.
- 라이선스를 확인하기 전에는 외부 모델을 공개 배포하지 않습니다.
  - BodyParts3D는 CC BY 4.0이라 출처 표기가 필요합니다.
  - Z-Anatomy는 CC BY-SA 4.0입니다.
  - DamagedHelmet에는 NC(비상업) 조건이 섞여 있습니다.
- 참고 사이트(BioDigital 등)의 상업용 모델과 콘텐츠는 추출하지 않습니다(`docs/references/REFERENCES.md`).

관련 문서:
- `docs/development/MATERIALS_INVENTORY.md`: 수집 현황, 누락 목록, 폴더 역할
- `docs/references/REFERENCES.md`: 참고 사이트
- `docs/references/asset_registry.csv`: 모델 대장
- `tools/blender/README.md`: 모델 처리 계획
