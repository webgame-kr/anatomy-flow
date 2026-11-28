# NURSE FLOW 3D

실시간 3D 인체 모델에서 간호학·해부생리학 기전을 **타이핑**과 **시각적 이동**으로 배우는 웹게임입니다. 혈액, 림프액, 음식물, 세포, 호르몬, 신경 신호 등이 이동하고 변화하는 모습을 다룹니다.

**최종 목표:** 범용 실시간 3D 인체 해부학·생리학 학습 플랫폼입니다.
- 간호학·해부학·생리학·병태생리학·약리학의 어떤 문제든 같은 인체 모델과 공통 엔진으로 학습 콘텐츠를 만들 수 있게 합니다.
- 11개 인체 계통(골격, 근육, 신경·감각, 심혈관, 호흡, 소화, 비뇨, 내분비, 림프·면역, 외피, 생식)의 전신 해부학 데이터베이스를 전신 → 장기 → 조직 → 세포 → 분자 규모로 구축합니다.
- 로드맵: `docs/development/ROADMAP.md`
- 계통별 모델 보유 현황: `docs/development/ANATOMY_COVERAGE.md`

**현재 단계: STEP 04-C 완료 → 다음 STEP 04-D(입자·성능), 이어서 STEP 05(전신 해부학)**
- 지금 3D 모델과 학습 콘텐츠는 **심혈관계 중심**입니다.
- 다른 계통 모델은 원본 자료 조사만 했고, 아직 변환하지 않았습니다.
- 모든 모델과 콘텐츠는 전문가 검토 전입니다.

- STEP 01: 실시간 3D 렌더링과 Pyodide 연결 (`step01` 장면에서 그대로 동작)
- STEP 02: 객체·카메라·선택·재질·단면·장면 관리 엔진 (아래 "STEP 02 엔진")
- 2026-11-27 개발 자료 정리: 원본 모델, 강의·전공 자료, 자산 대장, 참고 사이트 ("개발 자료와 자산 관리")
- **STEP 03-A:** BodyParts3D 검색·선택 추출·Blender 변환 파이프라인. 심장, 대동맥, 대정맥, 폐혈관, 기관지 가지 GLB 6개를 원본 상대 위치 그대로 만들었습니다(`docs/development/bp3d/ANATOMY_PIPELINE.md`).
- **STEP 03-B:** Anatomy Explorer. 심혈관 구조 41개 레지스트리, 레이어, 3D 라벨, 검색, 해부학 Anchor(object-local) 편집, 피부·흉곽 맥락 모델 (`docs/development/STEP_03B_REPORT.md`)
- **STEP 03-C:** 경로 엔진(호 길이 기반 이동), Checkpoint(건너뛰기 없는 감지), Actor(적혈구 교육용 모델 등), 추적 카메라, 경로 편집기, Python 이동 명령 (`docs/development/STEP_03C_REPORT.md`, `docs/development/MOTION_DATA_SPEC.md`)
- **STEP 03-D:** Play 화면, Gameplay Controller(상태 머신, 세션 검증), Python 학습 API(`lesson.py`), 3D 콘텐츠 형식(version 2), 심혈관 혈액순환 콘텐츠, 학습 기록 v2 (`docs/development/STEP_03D_REPORT.md`, `docs/FLOW_SPEC_v0.1.md` 6장)
- **STEP 04-A~C:** 내강 중심선 경로·다중 스케일, 애니메이션 엔진·심장주기, 해부학 자산 확장, 생리 상태·인과·되먹임 엔진 (아래 각 섹션과 `docs/development/STEP_04*_REPORT.md`)
- **다음 단계:** STEP 04-D 입자·성능 → STEP 05-A~F 전신 해부학(DB, 11개 계통 모델, 조직·세포·분자, 관계 데이터, Atlas, 그래픽) → STEP 06 FLOW Studio → STEP 07~10 콘텐츠·UI·정식 배포

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

그다음 브라우저에서 엽니다.
- 학습 게임 (Play): `http://localhost:8000/play.html`
- 사용자용 Anatomy Explorer: `http://localhost:8000/explorer.html`
- 개발자 Sandbox (STEP 02): `http://localhost:8000/`
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

## STEP 04-C 생리 상태·인과·되먹임 엔진

> 교육용 단순화 모델입니다. 실제 환자의 생리 반응을 예측하지 않으며, 진단·처치·약물 결정에 쓰지 않습니다. 전문가 검토 전입니다.

- **Play 콘텐츠**

  | 콘텐츠 | 주소 | 내용 |
  |---|---|---|
  | 혈압·심박출량 | `play.html?lesson=cv.hemodynamics` | SV·CO·MAP 계산, 전부하·후부하·수축력 방향 예측, 자유 실험(HR·EDV·ESV·SBP·DBP·SVR 입력) |
  | 압력수용체 반사 | `play.html?lesson=cv.baroreflex` | 혈압 감소 → 수용체 → 숨뇌 → 교감·부교감 → 심장·혈관 → 음성 되먹임, 자동 관찰 |
  | RAAS | `play.html?lesson=cv.raas` | 혈액량 감소 → 레닌 → 안지오텐신 I·II → 혈관 수축·알도스테론·ADH → 혈액량 회복 방향, 자동 관찰 |

  - 화면 왼쪽 위 생리 패널: 상태(기준·현재·방향·근거), 그래프, 자유 실험, 자동 관찰
  - 암기·추론 모드에서는 정답 변수를 숨기고, 실험·관찰은 학습을 마친 뒤에 열립니다.
- **Sandbox:** `index.html?scene=phys_lab` (PH) — Physiology Editor(모델 불러오기·검사, 값 설정, 시나리오, 되먹임 단계, 관계 추가, 신호)
- **엔진:** `py/biological_state.py`, `formula_engine.py`, `causal_engine.py`, `feedback_engine.py`, `scenario_engine.py`, `physiology_commands.py`. 데이터 형식은 `docs/FLOW_SPEC_v0.1.md` 8장에 있습니다.
- **데이터 생성기:** `tools/content/make_physiology_model.py`, `make_physiology_concept.py`, `make_physiology_lessons.py`, `make_physiology_fixture.py`
- **테스트:**

  ```powershell
  python tests/test_biological_state.py
  ```

  ```powershell
  python tests/test_formula_engine.py
  ```

  ```powershell
  python tests/test_causal_engine.py
  ```

  ```powershell
  python tests/test_feedback_engine.py
  ```

  ```powershell
  python tests/test_physiology_lesson.py
  ```

  브라우저: 로컬 서버에서 `tests/physiology-tests.html`
- **보고서:** `docs/development/STEP_04C_REPORT.md`

## STEP 04-B+ 해부학 자산 확장

- **Sandbox 새 장면** (`index.html?scene=<id>`)

  | 장면 | 내용 |
  |---|---|
  | `heart_cmp` (HC) | 기존 `heart.glb`, `heart-v2.glb`(통합 심실 벽 FJ2428·첨판 분리), 심실 벽 영역(좌·우 자유벽, 중격 영역) 비교 |
  | `heart_valves` (HV) | 판막 첨판 11개 개폐(경첩 회전 근사), 유두근 연결, 심실 벽 영역 수축, 닫힌 판막 통과 금지 |
  | `micro_alv` (MA) | 폐포 개념 모델 |
  | `micro_tis` (MB) | 조직 모세혈관 개념 모델 |
  | `micro_ves` (MC) | 혈관 벽 단면 개념 모델(수축·확장) |
  | `prep_04c` (RP) | STEP 04-C 준비 모델(숨뇌, 온목·속목동맥, 콩팥·부신, 가로막, 이자 + Z-Anatomy 미주신경·교감신경줄기·갑상샘) |

- **Explorer:** "동맥 가지 / 정맥 가지" 레이어(기본 꺼짐), 개발자 모드에 가지 혈관 경로 13개(`paths-branches.json`)가 있다.
- **모델·도구**
  - 변환 사양: `tools/asset-processing/specs/cardiovascular-v2.json`, `systemic-vessels.json`, `regulation-prep.json`
  - Blender: `tools/blender/split_ventricle_wall.py`, `rig_valves.py`, `make_micro_concepts.py`, `za_extract_regulation.py`
  - 대장: `python tools/asset-processing/registry_extend.py`
- **라이선스:** BodyParts3D 파생은 CC BY 4.0(`assets/licenses/bodyparts3d.md`)이다. Z-Anatomy 파생 `assets/anatomy/regulation/za-nerves-thyroid.glb`만 CC BY-SA 4.0(`assets/licenses/z-anatomy.md`, 별도 파일)이다.
- **테스트:**

  ```powershell
  python tools/asset-processing/test_asset_upgrade.py
  ```

- **보고서:** `docs/development/STEP_04B_ASSET_UPGRADE_REPORT.md`. 모든 모델·경로는 의학적 검증 전이고, 판막·심실 변형은 교육용 근사다.

## STEP 04-B 애니메이션 엔진

- **Play 「심장주기: 판막과 심실의 다섯 단계」** (`play.html?lesson=cv.cardiac_cycle`)
  - 강의자료(HA6 p5 그림, 교재 p614)의 5단계를 차례로 입력한다. 정답이면 그 단계의 애니메이션이 끝난 뒤 다음 문제로 간다.
  - 애니메이션: 판막 개폐, 심방·심실 수축, 혈액 이동
  - 모델은 직접 만든 개념 모델(CONCEPTUAL)이다. 단계 시간과 모양은 교육용 값이며 압력·혈류 계산이 아니다.
- **생리 단계 패널**
  - 현재 단계, 심방·심실, 방실판막·반월판막, 혈액 이동 방향, 압력 관계, 심음, 강의 근거 쪽을 보여 준다.
  - 자유 관찰: 자동 재생, 이전·다음, 일시정지, 속도, 실제 모델 보기. 학습 기록과 진행은 바뀌지 않는다.
  - 실제 모델 보기에서는 BodyParts3D 판막을 색으로만 상태를 표시한다. 리깅이 없어 움직이지 않는다.
- **Sandbox 시험 장면**
  - AA: Transform Keyframe, GLB 클립 Spin·Inflate·Flap
  - AB: Morph 혼합, 모델 전환, 변형을 따라가는 경로 점
  - AC: 타임라인 순차·병렬·반복, Blocking과 Non-blocking
  - AD: 심장주기 개념 모델
  - AE: 혈관 수축·확장
  - 오른쪽 "Animation" 패널이 경량 편집기다. Keyframe 편집, 미리보기, 타임라인 JSON, 가져오기·내보내기를 할 수 있다.
- **문서·테스트**
  - 데이터 형식: `docs/FLOW_SPEC_v0.1.md` 7장
  - 테스트: `tests/animation-tests.html`, `python tests/test_cardiac_cycle.py`
  - 보고서: `docs/development/STEP_04B_REPORT.md`

## STEP 04-A 해부학 경로·다중 스케일

- **경로:** 심혈관 경로 9개를 BodyParts3D 혈관 메시의 단면 중심선과 판막 전후 Waypoint로 다시 만들었습니다(`content/anatomy/cardiovascular/paths.json`). 모두 기하 검사(메시 밖 0%)를 통과한 `GEOMETRY_CHECKED`이며 해부학 전문가 검토는 받지 않았습니다. 이전 경로는 `paths.v1-approx.json`에 있습니다.
- **다중 스케일:** 혈액순환 학습 중 폐 모세혈관과 전신 조직에서 직접 만든 개념 장면(CONCEPTUAL, `content/micro/capillary-scenes.json`)으로 확대했다가 돌아옵니다. 화면 왼쪽 아래에 수준, 실제 크기, 교육용 확대 배율을 표시합니다.
- **심장 내부 보기 (Play 설정):** 자동(심장 안이면 Actor 앞을 자르는 움직이는 단면), 반투명, 불투명, 고스트, 절개, 움직이는 단면, 좌우 단면. 학습 물질(Actor)은 자르지 않습니다.
- **Path Editor (Explorer 개발자 모드):** 경로별 검증 상태, 기하 검사 문제 지점(빨간 점), 되돌리기·다시 하기(Ctrl+Z / Ctrl+Y), 이전 버전 비교(회색 점선과 최대 차이), 단면 중심선으로 Waypoint 채우기
- **기하 검사 속도:** 경로 6개 12.7초(화면 멈춤 1.4~2.6초) → 0.18초(최대 정지 10 ms). 자세한 내용은 `docs/development/STEP_04A_REPORT.md`
- **문서:** 경로 상태와 중심선은 `docs/development/MOTION_DATA_SPEC.md`, 스케일 전환 Edge는 `docs/FLOW_SPEC_v0.1.md` 6장

## STEP 03-D Play (학습 게임)

`play.html`이 학습자용 게임 화면입니다. Explorer와 Sandbox는 그대로 있습니다.

- **콘텐츠:** `content/lessons/index.json`에 목록이 있습니다.
  - 심혈관 「혈액순환: 정맥 환류에서 체순환까지」: 실제 BodyParts3D 모델을 씁니다. (STEP 04-A부터) 3D 경로는 기하 검사만 통과한 GEOMETRY_CHECKED이고, 폐·조직 모세혈관은 개념 장면(CONCEPTUAL)입니다.
  - 테스트 콘텐츠 2개: 교육용 개념 장면에서 기본 진행과 분기·순환을 확인합니다.
- **진행:** 질문에 맞는 용어(한글·영문·등록된 약어)를 입력합니다.
  - 정답이면 Python이 다음 노드를 정하고 적혈구가 다음 Checkpoint로 이동합니다.
  - 오답이면 위치가 그대로입니다.
  - 갈림길에서는 입력한 이름으로 경로를 고릅니다.
- **모드:**
  - 가이드: 정답과 설명을 보여 줍니다.
  - 암기: 정답을 숨기고 3D 위치와 힌트를 줍니다.
  - 기전 추론: 원인과 결과를 묻는 질문을 보여 주고, 맞힌 뒤 설명합니다.
  - 암기·추론 모드에서는 라벨, 진행 목록, Hover에서 아직 배우지 않은 구조 이름을 숨깁니다.
- **설정:** 자동 추적·자유 탐색, 애니메이션 줄이기, 카메라·이동 속도, 경로 표시, 라벨, 투명도, 심장 내부 보기(STEP 04-A), 정답이면 자동 제출(한글 조합 중 제외)
- **기록:** 완료하거나 학습을 종료하면 이 브라우저(LocalStorage)에 저장합니다. 설정에서 CSV로 내보낼 수 있습니다. 정답률의 정의는 `docs/FLOW_SPEC_v0.1.md` 6장에 있습니다.
- **주소 옵션 (개발·검증용):** `play.html?lesson=cv.blood_circulation&mode=memory&autostart=1`
- **Python 테스트:** `python tests/test_lesson.py`

## STEP 03-C 이동 엔진

- **Sandbox 시험 장면:** 장면 선택에서 고릅니다. 기존 E·F는 해부학 장면이라, 요구서의 Scene E~H는 앞에 M을 붙였습니다.
  - ME: Basic Path
  - MF: Checkpoint
  - MG: Branch & Loop
  - MH: Multiple Actors
- **오른쪽 "Motion" 패널 (경로 편집기)**
  - 이동: Play, Pause, Resume, Stop, Next(다음 정지 Checkpoint까지), Reset, 방향 반전, 속도·진행률 조절
  - 카메라: 카메라 추적, 1인칭, 추적 재개, 전체 보기 복귀
  - 경로 편집: Path 목록, Waypoint 삽입·순서 변경·삭제, XYZ 입력, 편집 핸들 기즈모, 직선·곡선 전환, 순환
  - Checkpoint: 추가·삭제, 정지 여부 설정
  - 파일·검증: JSON 내보내기·불러오기, 기술 검증
- **Scene I (해부학):** Anatomy Explorer에서 설정 → 개발자 모드를 켜면 심혈관 시험 경로 6개와 적혈구 Actor를 불러옵니다. 학습자 화면에는 보이지 않습니다.
  - 경로는 Anchor(정점 평균)를 잇는 **APPROXIMATE** 경로이며 해부학적으로 검증하지 않았습니다.
  - "기하 검사" 버튼은 경로 표본점이 어느 메시의 닫힌 면 안쪽에 있는지 추정할 뿐입니다.
- **엔진 테스트:** 로컬 서버에서 `tests/motion-tests.html`을 엽니다. 렌더링 루프와 분리된 인스턴스로 28개 항목을 검사합니다.
- **Python:**
  - 이동 명령: `scene_commands.validate`가 이동 명령을 검사합니다. 형식은 `docs/development/MOTION_DATA_SPEC.md`에 있습니다.
  - 규칙 엔진 연결: `py/motion_link.py`(STEP 03-D 준비)
  - 테스트: `python tests/test_motion_commands.py`

## STEP 03-B Anatomy Explorer

`explorer.html`은 사용자용 화면이고, `index.html`(개발자 Sandbox)은 그대로 둡니다.

- **데이터:** `content/anatomy/cardiovascular/`
  - `scene.json`: 자산, 레이어, 카메라 시점·방향, 라벨, 출처
  - `structures.json`: 해부학 레지스트리
  - `anchors.json`: Anchor
  - `structures.json`과 `anchors.json`은 원본 `tools/asset-processing/anatomy/cardiovascular.structures.src.json`에서 만듭니다:
    ```powershell
    python tools/asset-processing/anatomy_data.py tools/asset-processing/anatomy/cardiovascular.structures.src.json
    ```
- **모듈:** `js/anatomy/`
  - `anatomy-registry.js`: 구조 ↔ Mesh 명시적 매핑과 상태
  - `anatomy-search.js`: 검색
  - `anatomy-manager.js`: 레이어, 선택, 카메라, 격리, 단면
  - `anatomy-labels.js`: 3D 라벨
  - `anchor-manager.js`: Anchor
  - `anatomy-explorer.js`: 화면 연결
- **구조 상태:** AVAILABLE, PARTIAL(원본에 일부만 있음), MISSING(원본에 없음), NOT_LOADED(지연 로딩 전). 원본에 없는 구조는 도형으로 만들지 않습니다.
- **해부학 좌우:** "해부학 좌측"은 환자의 왼쪽(+X)에서 본 화면입니다.
- **개발자 모드:** 설정 → 개발자 모드를 켜면 다음이 보입니다.
  - Anchor 표시와 표면 클릭 생성, 기즈모 이동, XYZ 편집, JSON 내보내기·불러오기
  - Python 연동 테스트와 로그
- **Anchor 좌표:** 대상 Object의 로컬 좌표로 저장합니다. 모델이 움직여도 따라갑니다. 시드 Anchor는 정점 평균으로 만든 기하 위치이며 해부학적으로 검증하지 않았습니다.
- **Python:** `scene_commands`의 target에 anatomical_id(예: `cv.left_ventricle`)를 쓸 수 있습니다. JS가 그 구조의 Mesh 전체로 바꿉니다.

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
