# CLAUDE.md — NURSE FLOW 3D 개발 원칙

## 프로젝트
실시간 3D 인체 모델에서 간호학·해부생리학 기전을 타이핑과 시각적 이동으로 학습하는 웹게임.
GitHub Pages 정적 사이트(webgame-kr/anatomy-flow)로 운영하며, 백엔드·DB·유료 API는 쓰지 않는다.
현재 단계는 STEP 03-C(경로·Actor·이동 엔진)까지 완료했다. 엔진 구조는 `docs/ARCHITECTURE.md`, 사용법은 README의 "STEP 02 엔진", "STEP 03-B Anatomy Explorer", "STEP 03-C 이동 엔진"에 있다. 이동 데이터 형식은 `docs/development/MOTION_DATA_SPEC.md`에 있다.

## 아키텍처 원칙
- **실시간 3D 전용:** Three.js 0.160.0(WebGL)만 쓴다. 2D SVG 엔진은 쓰지 않는다(기록은 태그 `v0.1-svg`).
- **역할 분리**
  - Python(`py/`)은 게임 로직과 상태를 맡는다. Three.js와 DOM에 의존하지 않는다.
  - JavaScript(`js/`)는 렌더링, 입력, 저장을 맡는다. 게임 규칙을 JS에 복제하지 않는다.
- **Three.js 객체 (STEP 02):** 조작할 수 있는 모든 객체는 `object-registry.js`에 고유 ID로 등록한다.
  - 기본 도형과 그룹은 `object-manager.js`가 만든다. GLB는 `scene-manager.addModel` → `registry.registerModel`로 등록한다.
  - 객체를 지울 때는 `registry.unregister`를 쓴다. 이때 `resource-tracker`가 참조 수가 0인 리소스만 dispose한다.
  - 재질 변경은 반드시 `material-controller`로 한다. Mesh의 material을 직접 바꾸면 공유 재질이 오염된다.
  - 층(상태 색·투명도 / 강조 / 격리·고스트 / 단면)을 섞지 않는다.
- **상태의 기준:** 렌더링 상태의 기준은 JS 레지스트리다. Python에는 `registry.snapshot()`(id, type, visible, parent)만 보낸다. 예외는 STEP 01 `step01` 장면의 `sandbox3d.py`다.
- **같은 역할 모듈 확장:** 같은 역할의 모듈이 이미 있으면 새로 만들지 말고 확장한다. 요구서의 `renderer.js`는 `viewport.js`가, `python-bridge`는 `py-client` + `python-bridge.js`가 맡는다.
- **Python 호출:** Pyodide는 Web Worker에서 돈다. 호출은 메시지 + Promise(`py-client.js`)로 하고 이벤트 때만 부른다. 렌더링 프레임마다 부르지 않는다.
- **명령 형식:**
  - STEP 01(`sandbox3d`): `{id, op: clear|create|update|remove}`
  - STEP 02(`scene_commands`): `{action, target, value, duration}`. action은 set_position, set_rotation, set_scale, set_color, set_visibility, set_opacity, highlight, camera_focus, camera_overview, scene_change.
  - 반환값은 `{ok, commands, errors, message}`다.
  - Python과 JS가 각각 검증한다. 잘못된 명령은 로그만 남기고 다음 명령을 계속 실행한다.
  - 이동처럼 시간이 걸리는 변화는 목표값과 `duration`만 보내고, 프레임 보간은 JS가 한다.
- **좌표·단위:** 좌표는 `[x, y, z]`이고 Y가 위쪽이다. 회전은 도, 시간은 ms다.
- **콘텐츠 분리:** 그래픽 엔진에 의료 콘텐츠를 하드코딩하지 않는다. 콘텐츠는 `content/`(JSON), 모델은 `models/`(GLB)에 둔다.
- **미리 만들지 않기:** 지금 단계에 필요 없는 기능은 만들지 않는다. 다만 GLB, 3D 경로, 카메라 추적, 애니메이션, 단면 관찰을 붙일 자리는 남겨 둔다.

## Python 코딩 규칙 (학생 프로젝트 · 수업 범위)
- 사용하는 것:
  - 자료형과 제어문: 리스트, 딕셔너리, 튜플, 셋, if/elif/else, for/while
  - 함수와 모듈: def/return, 기본값 인자, import(sys, math, random), `global`
  - 문자열: `.format()`, `split`/`join`
- 사용하지 않는 것: class, try/except, 재귀, enumerate, zip, `sorted(key=)`, 딕셔너리 컴프리헨션, 타입 힌트, 데코레이터, 외부 라이브러리.
- 오류는 예외 대신 검사(`in`, `dict.get`, `type(x) == list`)로 처리하고 `fail(메시지)`를 돌려준다.
- 상태를 밖으로 보낼 때는 복사본을 만든다. 리스트를 그대로 넘기지 않는다.
- 주석은 짧은 한국어로 쓴다.

## 라이브러리 버전
- Three.js: `index.html` importmap → `three@0.160.0`
- Pyodide: `js/python/py-client.js` → `PYODIDE_VERSION = '0.26.4'`
- 버전을 올릴 때는 Sandbox 전체 검증(README의 확인 목록)을 다시 한다.
- Python 파일을 추가하면 `py-client.js`의 `PY_FILES`와 `py-worker.js`의 `ALLOWED`를 함께 고친다.

## 테스트
- Python을 바꾸면 `tests/test_sandbox3d.py`, `tests/test_scene_commands.py`, `tests/test_engine.py`가 모두 통과해야 한다.
- STEP 02 화면 검증은 README "STEP 02 엔진"의 장면 A~D로 한다. 장면을 오가며 Debug 오버레이와 Status Bar의 GPU geo/tex 수가 늘어나지 않는지 본다.
- 테스트 결과는 실제로 실행한 것만 PASS로 적는다. FPS와 로딩 시간은 측정값만 적는다.
- 화면을 바꾸면 로컬 서버에서 Sandbox를 확인한다. 확인할 것:
  - 회전과 확대
  - Python 명령 적용
  - 초기화
  - `?simulate=nopython`, `?simulate=nowebgl` 안내
  - 콘솔 오류

## 배포와 저작권
- 모든 경로는 상대 경로로 쓴다. Worker와 Python 경로는 `import.meta.url` 기준이다(GitHub Pages 하위 경로 대응).
- `main`에 푸시하면 Pages에 배포된다.
- 수업 강의자료와 전공 교재는 `references/`(gitignore)에만 둔다. 절대 커밋하지 않는다.
- 3D 모델은 라이선스를 확인한 것만 커밋한다.

## 자료·자산 관리 (2026-11-27 추가)
- **폴더 역할**
  - `assets/`: 배포용 최적화 자산
  - `raw-models/`: 원본 모델(Git 제외)
  - `references/`: 강의·교재(Git 제외)
  - `content/<계통>/`: 콘텐츠 JSON
  - `tools/blender/`: 모델 처리
  - 자세한 내용은 `docs/development/MATERIALS_INVENTORY.md`에 있다.
- **기존 경로 유지:** 엔진 경로(`py/`, `js/`, `css/`, `index.html`)는 바꾸지 않는다. `py/`가 목표 구조의 `python/` 역할을 한다.
- **원본 보존:** `raw-models/` 원본은 수정하지 않는다. 처리 결과는 `tools/out/`에서 검수한 뒤 `assets/anatomy/<계통>/`에 새 파일로 둔다.
- **자산 등록:** 외부 자산은 쓰기 전에 `docs/references/asset_registry.csv`에 등록한다. 모르는 값은 `UNKNOWN` 또는 `PENDING`으로 적고 추측하지 않는다.
- **공개 배포 조건:** 라이선스를 확인해 `verification_status`가 확인되었고, `assets/licenses/`에 출처 표기를 남긴 자산만 커밋하고 배포한다.
  - NC(비상업) 조건 자산(DamagedHelmet 등)은 공개 배포하지 않는다.
  - SA(Z-Anatomy) 조건 자산은 쓰기 전에 사용자와 상의한다.
- **Git 조작:** 커밋, 푸시, Git 기록 삭제는 사용자 확인 없이 하지 않는다.
- **배포 전 점검:** Pages 배포본에 `references/`, `raw-models/`, `assets/test-models/`가 들어가지 않았는지 `git ls-files`로 확인한다.
- **Blender:** 5.3.0이 `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`에 있다. 스크립트는 `--background --factory-startup --python`으로 실행한다.

## 범위 밖 (STEP 02까지)
실제 혈액순환·소화 과정, 3D 곡선 경로 이동, 타이핑 게임 진행, 심장 수축·판막, 대규모 의료 모델 변환, FLOW Studio 에디터, 학습 기록 분석, 로그인, 멀티플레이.
단면(clipping)은 표면 Mesh를 자를 뿐이다. 원본에 없는 내부 구조(판막, 심방, 심실 등)를 만들어 내지 않는다. 그런 구조가 필요하면 검증된 모델을 쓴다.

## 해부학 자산 파이프라인 (STEP 03-A, 2026-11-28)
- **도구 위치:** `tools/asset-processing/`(검색·조사·계획·추출·등록)과 `tools/blender/bp3d_to_glb.py`(변환). 문서는 `docs/development/bp3d/ANATOMY_PIPELINE.md`에 있다.
- **수업 범위 밖:** 이 도구들은 개발 도구라 zipfile, json, csv, argparse, pathlib, hashlib, bpy를 쓴다. 게임 로직 `py/`의 문법 제한(강의 범위)은 그대로 지킨다. 둘을 섞지 않는다.
- **OBJ 찾기:** OBJ 파일명은 element file ID(`FJ…`)다. FMA ID나 BP ID로 OBJ를 찾지 않는다. COMPOUND는 `*_element_parts.txt`로 풀고, IS-A와 PART-OF 트리는 병합하지 않는다.
- **좌표:** 장기별 중심 정렬과 크기 정규화를 하지 않는다.
  - OBJ는 `forward_axis=Y, up_axis=Z`로 축 변환 없이 불러온다(자체 검사 있음).
  - mm→m는 모든 메시에 같은 배율로 적용한다.
  - 축 변환은 glTF `export_yup`에서 한 번만 한다.
  - 결과: glTF (x, y, z) = (X, Z, −Y) × 0.001, +X = 환자 왼쪽, +Y = 위, +Z = 앞
- **변환 단위:** 한 element는 한 파트에만 넣는다(`bp3d_build.py plan`이 겹침을 검사). 원본 concept 이름이 내용과 다르면 element 이름 필터(`rest_of` + `keywords`)를 쓰고, 그 사실을 사양의 `note`에 남긴다.
- **원본에 없는 구조:** 도형으로 만들어 실제 해부학 모델처럼 표시하지 않는다(현재 없음: 심실 심근 벽, 심실중격, 폐 실질).
- **결과물 관리:** 결과 GLB마다 `*.meta.json`을 두고 `asset_registry.csv` 행을 남긴다(`bp3d_build.py register`). `verification_status`에 의학적 검증 여부를 정직하게 적는다.
- **출처 표기:** BodyParts3D 파생 모델은 CC BY 4.0이다. 해당 장면의 `credits`로 화면에 출처를 표시하고, 수정 내역은 `assets/licenses/bodyparts3d.md`에 적는다.
- **Z-Anatomy:** 별도 라이선스 검토 전까지 쓰지 않는다.

## 해부학 Explorer (STEP 03-B, 2026-11-28)
- **화면 분리:** `explorer.html`은 사용자용, `index.html`은 개발자 Sandbox다. 공유 엔진 모듈(`js/engine/`)은 확장만 하고 Sandbox 동작을 깨지 않는다.
- **해부학 레지스트리**(`js/anatomy/anatomy-registry.js`)
  - 구조와 Mesh는 `"asset:node"` 이름으로 명시적으로 연결한다. Three.js UUID를 쓰지 않는다.
  - 렌더링 상태를 저장하지 않는다. 그 기준은 엔진 레지스트리와 material-controller다.
- **데이터 원본:** `structures.json`과 `anchors.json`은 직접 고치지 않는다. 원본은 `tools/asset-processing/anatomy/*.src.json`이고, `anatomy_data.py`로 다시 만든다.
- **레이어:** 레이어 숨김과 구조별 숨김은 따로 저장한다. 상위 레이어를 다시 켜도 개별 상태가 유지되어야 한다.
- **Anchor:**
  - 대상 Object의 로컬 좌표로 저장한다. 장면 좌표는 필요할 때 계산한다.
  - `verification_status`에 출처를 적는다(GEOMETRY_DERIVED, MANUAL, EDITED).
  - 해부학적으로 검증했다고 표시하지 않는다.
- **Python:** target에 anatomical_id를 쓸 수 있고, JS `resolve` 훅이 Mesh ID로 바꾼다. 스냅샷에는 구조와 Anchor의 id·상태만 보낸다.

## 이동 엔진 (STEP 03-C, 2026-11-28)
- **모듈 위치:** `js/motion/`. Sandbox와 Explorer는 `motion-kit.js`로 같은 방식으로 조립한다. 같은 역할 모듈을 새로 만들지 말고 여기서 확장한다.
- **좌표:**
  - 곡선은 장면 좌표로 계산한다.
  - 점은 `anchor_id`, `object_local`, `scene` 중 자기 좌표계를 적는다.
  - 참조 객체가 움직이면 다음 프레임에 캐시를 다시 만든다.
  - GLB의 축·단위 변환을 다시 적용하지 않는다.
- **이동:**
  - 진행은 거리(m) 단위로 한다. 위치·방향은 `getPointAt`/`getTangentAt`(호 길이)로 얻는다.
  - 기존 렌더링 루프의 `kit.tick(dt)`에서만 움직인다. 별도 루프를 만들지 않는다.
- **Checkpoint:**
  - 프레임 구간 교차로 감지한다(건너뛰지 않음).
  - 이벤트는 (Checkpoint, 바퀴, 방향)마다 한 번만 낸다.
  - 다시 활성화되는 조건(새 바퀴, reset, set_path, 경로 전환)을 바꾸면 `tests/motion-tests.js`도 고친다.
- **Actor:**
  - 레지스트리 type `actor`로 등록한다.
  - 모델별 Geometry와 상태별 Material을 공유한다.
  - 재질을 바꿀 때는 `materials.setBaseMaterial`을 쓴다.
- **명령과 결과:**
  - 이동 명령은 Python(`scene_commands.MOTION`)과 JS(`motion-commands.js`)가 각각 검사한다.
  - 결과는 arrived, completed, cancelled, failed 중 하나다.
  - 장면 전환·초기화 때 `motion.cancelAll()`이 session을 올린다. Python Bridge는 호출 뒤 session이 바뀌면 명령을 버린다.
- **해부학 경로:**
  - Anchor 정점 평균을 이은 경로는 `APPROXIMATE`로 적는다.
  - 기하 검사(ray parity)는 근거일 뿐 검증이 아니다.
  - 원본에 없는 구조를 임의 좌표로 이어 정확한 혈류 경로라고 표시하지 않는다.
- **노출 범위:** 해부학 이동 시험 데이터와 편집기는 Explorer 개발자 모드에서만 불러온다.
- **테스트:**
  - 이동 엔진을 바꾸면 `tests/motion-tests.html`(브라우저, 28개)과 `python tests/test_motion_commands.py`를 실행한다.
  - Worker 파일을 바꾸면 `py-client.js`의 `WORKER_VERSION`을 올린다.

## STEP 03-D 방향
1. (완료: STEP 03-A~C) 심혈관 GLB, 해부학 레지스트리, Anchor, 경로·Actor·이동 엔진
2. 보존한 규칙 엔진(`game.py`, `flow_engine.py`, `state_engine.py`, `typing_engine.py`)을 Worker에 싣는다. `py-client.js`의 `PY_FILES`와 `py-worker.js`의 `ALLOWED`에 추가한다.
3. 콘텐츠 Edge를 경로·Checkpoint에 연결한다(`motion_link.setup`). 정답 제출 결과를 `motion_link.to_motion`으로 바꿔 실행하고, 이동 결과를 `motion_link.motion_done`과 `game.arrive`로 돌려준다.
4. 타이핑 입력(`js/shared/typing-input.js`)과 Next 버튼을 교체한다.
