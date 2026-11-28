# CLAUDE.md — NURSE FLOW 3D 개발 원칙

## 프로젝트
실시간 3D 인체 모델에서 간호학·해부생리학 기전을 타이핑과 시각적 이동으로 학습하는 웹게임.
GitHub Pages 정적 사이트(webgame-kr/anatomy-flow)로 운영하며, 백엔드·DB·유료 API는 쓰지 않는다.
현재 단계는 STEP 04-B+(해부학 자산 확장: 심장 v2·판막 리깅·가지 혈관·미세 개념 모델·04-C 준비 모델)까지 진행했다. 보고서는 `docs/development/STEP_04A_REPORT.md`, `docs/development/STEP_04B_REPORT.md`, `docs/development/STEP_04B_ASSET_UPGRADE_REPORT.md`다. 학습자 화면은 `play.html`이다. 엔진 구조는 `docs/ARCHITECTURE.md`, 사용법은 README의 "STEP 02 엔진", "STEP 03-B Anatomy Explorer", "STEP 03-C 이동 엔진"에 있다. 이동 데이터 형식은 `docs/development/MOTION_DATA_SPEC.md`에 있다.

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
  - (STEP 04-B+) 사양의 파트마다 트리를 고를 수 있다(`"tree": "isa"`). PART-OF 개념이 하위 가지 전체를 담으면(예: 팔머리동맥 93 element) IS-A 단일 element를 쓴다.
  - 검색은 `bp3d_catalog.py find`(동의어·FMA·FJ·OBJ 머리글). 이름 검색 0건이 모델 없음은 아니다(예: 힘줄끈은 방실판막 첨판 element 안에 있다). `matched_by`와 형상을 확인한다.
- **좌표:** 장기별 중심 정렬과 크기 정규화를 하지 않는다.
  - OBJ는 `forward_axis=Y, up_axis=Z`로 축 변환 없이 불러온다(자체 검사 있음).
  - mm→m는 모든 메시에 같은 배율로 적용한다.
  - 축 변환은 glTF `export_yup`에서 한 번만 한다.
  - 결과: glTF (x, y, z) = (X, Z, −Y) × 0.001, +X = 환자 왼쪽, +Y = 위, +Z = 앞
- **변환 단위:** 한 element는 한 파트에만 넣는다(`bp3d_build.py plan`이 겹침을 검사). 원본 concept 이름이 내용과 다르면 element 이름 필터(`rest_of` + `keywords`)를 쓰고, 그 사실을 사양의 `note`에 남긴다.
- **원본에 없는 구조:** 도형으로 만들어 실제 해부학 모델처럼 표시하지 않는다(현재 없음: 심실중격 독립 메시, 전도계, 폐 실질, 목동맥 갈림 부위, 척수 전체). 통합 심실 벽은 IS-A FJ2428로 있다(`heart-v2.glb`).
- **결과물 관리:** 결과 GLB마다 `*.meta.json`을 두고 `asset_registry.csv` 행을 남긴다(`bp3d_build.py register`). `verification_status`에 의학적 검증 여부를 정직하게 적는다.
- **출처 표기:** BodyParts3D 파생 모델은 CC BY 4.0이다. 해당 장면의 `credits`로 화면에 출처를 표시하고, 수정 내역은 `assets/licenses/bodyparts3d.md`에 적는다.
- **Z-Anatomy (STEP 04-B+, 사용자 허용):** 객체마다 라이선스를 확인하고 CC BY-SA 4.0 파생물은 **별도 GLB**로 둔다(BodyParts3D 메시와 합치지 않음).
  - NC 모델(Inner Ear, Kidney by Lissie Cowley)과 출처 불명 모델("White matter" 계열, 척수 포함)은 쓰지 않는다.
  - BLEND는 항상 `--disable-autoexec`로 연다. 좌표는 BodyParts3D와 같지 않다: 측정한 평행 이동 T = (+0.0013, +0.0975, +0.0643) m(Blender Z-up)를 빼서 맞춘다.
  - 출처 표기는 `assets/licenses/z-anatomy.md`, 장면 `credits`에 CC-BY-SA를 적는다.

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

## 학습 게임 (STEP 03-D, 2026-11-28)
- **규칙은 Python에만:** 정답 판정, 다음 노드, 분기 조건, 순환, 완료, 기록 계산은 `py/`(`lesson.py` → `game.py`, `flow_engine.py`, `record_engine.py`)가 한다. JS(`js/play/`)에 학습 규칙을 복제하지 않는다.
- **이동과 진행 분리:**
  - 정답이면 Python은 `moving` 상태가 되고 이동 명령만 돌려준다.
  - JS가 이동을 끝내고 `lesson.arrived(status)`를 불러야 진행한다.
  - 이동이 실패하거나 취소되면 진행하지 않는다. 재시도(`retry`)나 마지막 정상 위치 복구(`recover`)를 한다.
- **상태 머신:** `js/play/gameplay-state.js`의 표에 상태별 허용 입력과 전이가 있다. 새 동작을 추가하면 이 표를 먼저 고친다.
- **세션:**
  - 시작, 재시작, 콘텐츠 변경 때 `session.newSession()`을 부르고 `motion.cancelAll()`을 실행한다.
  - Python 응답과 이동 결과는 보낸 때의 세션 번호가 같을 때만 반영한다.
- **콘텐츠:**
  - `content/lessons/`는 version 2 형식이다(`docs/FLOW_SPEC_v0.1.md` 6장).
  - 좌표를 적지 않고 anatomical_id, anchor_id, checkpoint_id, path_id로 잇는다.
  - 3D 경로가 없는 구간은 `transition_type: "jump"`와 `verification_status: "PENDING"`으로 적는다.
  - 상대정맥과 하대정맥은 서로 다른 유입 경로(분기)로 두고, 순서대로 이어 붙이지 않는다.
- **정답:**
  - 비슷한 말을 자동으로 정답 처리하지 않는다. 동의어·약어는 `accepted_answers`에 적은 것만 허용한다.
  - 띄어쓰기 무시는 콘텐츠의 `options.ignore_spaces`로 정한다.
- **정답 노출:** 암기·추론 모드에서 이름을 보여 줄지는 `learning-mode.js`의 `canShowName`으로만 정한다(라벨, 진행 목록, Hover, 질문 모두).
- **산소화 색:** 교육용 구분이다. 혈액이 파란색이 된다고 설명하지 않는다.
- **Worker:** Python 파일이나 허용 함수를 추가하면 `py-client.js`의 `PY_FILES`·`WORKER_VERSION`과 `py-worker.js`의 `ALLOWED`를 함께 고친다.

## 간호학 자료 분석 (STEP 04-A 사전 분석, 2026-11-28)
- **콘텐츠 작성 전 확인할 문서:** 학습 콘텐츠나 기전을 새로 만들거나 고치기 전에 `references/nursing/analysis/`의 문서를 먼저 읽는다.
  - `NURSING_REFERENCE_INDEX.md`: 자료 목록과 주제별 근거 쪽
  - `CARDIOVASCULAR_CONTENT_AUDIT.md`: 혈액순환 콘텐츠 검증 결과와 수정 목록
  - `PHYSIOLOGY_MECHANISM_DATABASE.json`: 기전 데이터의 기준. 같은 내용의 `.md`도 있다.
  - `STEP_04_REQUIREMENTS.md`: STEP 04-A~D 요구사항
  - `MISSING_MATERIALS.md`: 확인하지 못한 자료와 내용
- **기준 자료의 우선순위:** 교재와 교수님 강의자료가 우선이다. 자료에서 확인되지 않는 내용은 "미확인"으로 적고, 단정해서 쓰지 않는다.
- **공개 금지:** `references/`(분석 문서와 `_text/` 추출본 포함)는 Git에서 제외된다. 강의 문장이나 상세 추출 내용을 공개 문서(`docs/`, `content/`, 커밋 메시지)에 옮기지 않는다. 공개 문서에는 쪽 번호와 일치 여부만 적는다.
- **검증 상태의 범위:** 강의자료와 대조한 것은 용어와 설명의 근거일 뿐이다. 3D 경로의 해부학적 검증(VERIFIED)으로 올리지 않는다.

## 해부학 정확도와 다중 스케일 (STEP 04-A, 2026-11-28)
- **경로 상태:** `PENDING`, `APPROXIMATE`, `GEOMETRY_CHECKED`, `ANATOMY_REVIEWED`, `CONCEPTUAL`(+ `TEST_PATH`). 정의는 `docs/development/MOTION_DATA_SPEC.md` 2장에 있다.
  - GEOMETRY_CHECKED는 기하 검사 결과로만 올린다.
  - ANATOMY_REVIEWED는 사람(전공자 검토)만 올린다. 기하 검사나 강의 대조로 올리지 않는다.
  - 점을 편집하면 path-engine이 자동으로 APPROXIMATE로 내린다. 이 동작을 없애지 않는다.
- **경로 만들기:** 혈관은 `js/motion/centerline-tracer.js`(단면 중심선), 판막은 중심 ±6~8 mm Waypoint로 만든다. 만든 뒤 `checkPathGeometryAsync`로 검사하고, 결과를 `geometry_check`에 저장한다. 메시 밖 표본이 있으면 잘라내거나 고치고, 이유를 `notes`에 적는다.
- **기하 검사:** `checkPathGeometryAsync`(삼각형 격자 색인, 8 ms 단위로 나눠 실행, 캐시)만 쓴다. 동기 `checkPathGeometry`는 없앴다. 화면을 멈추는 검사를 다시 만들지 않는다.
- **이전 경로:** `paths.v1-approx.json`은 비교용 기록이다. 게임에서 불러오지 않는다.
- **다중 스케일:** `js/scale/scale-manager.js`
  - 장면을 바꿀 때 Actor를 새로 만들지 않는다. 같은 Actor를 옮기고 표시 크기만 바꾼다.
  - 학습 상태는 Python에 있다. 스케일 관리자는 학습 규칙을 모른다.
  - 콘텐츠는 Edge `transition_type: "scene"`과 `scale`로 연결한다(FLOW_SPEC 6장).
- **개념 장면:** `content/micro/*.json`
  - 해부 모델이 없는 구조는 이렇게 만들고 `CONCEPTUAL`과 화면 배지로 표시한다. 실제 해부학 모델이라고 쓰지 않는다.
  - 암기·추론 모드에서 정답이 드러나지 않게 라벨에 다음 노드 이름을 쓰지 않는다.
- **명령 묶음:** command-runner에서 `wait` 명령이 cancelled면 나머지를 실행하지 않는다. 이동 뒤 전환이 따로 실행되면 학습 상태와 화면이 어긋난다.
- **일시정지:** `motion.pauseAll()` 중에 시작된 이동은 멈춘 채로 시작한다(gameHold). `cancelAll()`이 이를 푼다.
- **단면:** clipping-controller는 기본으로 `actor` type을 자르지 않는다. Play 보기 모드(`engine.setViewMode`)는 바꿀 때마다 `clipping.reset()`으로 재질을 되돌린다.
- **테스트:** 이동·명령을 바꾸면 `tests/motion-tests.html`(32개), `python tests/test_motion_commands.py`(37개), `python tests/test_lesson.py`(63개)를 실행한다.

## 애니메이션 엔진 (STEP 04-B, 2026-11-28)
- **모듈 위치:** `js/animation/`. Sandbox(main.js)와 Play(play-engine.js)는 `animation-kit.js`로 같은 방식으로 조립한다. 같은 역할 모듈을 새로 만들지 말고 여기서 확장한다.
  - `animation-manager.js`: 재생 (transform, morph, clip, material, visibility, deform, procedural)
  - `animation-timeline.js`: 순차·병렬·지연·반복·조건·marker
  - `morph-controller.js`, `deformation-controller.js`, `visual-state.js`(판막·혈관 상태), `model-transition.js`, `concept-model-builder.js`, `animation-commands.js`, `animation-editor.js`
  - 재질 애니메이션은 material-controller 상태 층을 쓴다(`getState`/`setState`). 별도 재질 모듈을 만들지 않았다.
- **렌더링 루프:** `kit.tick(dt)`만 기존 루프에서 부른다(경로·이동보다 먼저). requestAnimationFrame을 따로 만들지 않는다. dt는 0.25초로 자른다.
- **GLB 클립:** scene-manager `model` 이벤트가 클립을 넘긴다. 모델마다 AnimationMixer는 하나이며, 시간은 직접 맞춘다(일시정지·구간 이동·역방향). 장면을 내릴 때 `kit.unload()`가 Mixer를 해제한다. 데이터만 다시 불러올 때(`apply`)는 Mixer를 남긴다.
- **역할:** Python이 언제 무엇을 재생할지 정한다(Edge `timeline_id`, 노드 `visual_state`). JS는 프레임 보간만 한다. Python을 프레임마다 부르지 않는다.
- **Blocking:** 학습 진행에 필요한 애니메이션은 Edge `timeline_id`로 이동 명령과 같은 묶음에 넣는다(motion_link). 끝나야 `lesson.arrived`가 불린다. 실패·취소면 진행하지 않는다. 노드 도착 이벤트(scene event)는 Python이 이미 진행한 뒤에 실행되므로, 필수 애니메이션을 거기에 넣지 않는다.
- **Non-blocking:** 끝나지 않는 장식은 타임라인 `wait:false`나 parallel 이벤트로 둔다. 같은 animation_id를 다시 재생하면 이전 재생이 끝나므로 쌓이지 않는다.
- **판막·실제 모델:**
  - 기존 `heart.glb`(Play·Explorer) 판막은 리깅이 없어 움직이지 않는다. 상태 색(`indicators`)으로만 표시하고, 실제 개폐 모습이라고 설명하지 않는다.
  - (STEP 04-B+) `heart-v2-valves-rig.glb`는 첨판별 경첩 회전 Shape Key(교육용 근사, Sandbox HV)다. 실제 첨판 변형이라고 설명하지 않는다.
  - 판막 개폐 형태와 심실 수축은 개념 모델(`content/animations/cardiac-concept.json`, CONCEPTUAL)에서만 보여 준다.
- **닫힌 판막 통과 금지:** 타임라인 command 단계의 `through`에 구조를 적으면, 그 구조가 OPEN이 아닐 때 실행하지 않고 실패한다. 판막을 지나는 이동에는 반드시 `through`를 적는다.
- **변형과 경로:**
  - object_local Anchor·경로 점은 Morph 변형을 따라가지 않는다. 따라가야 하면 `space: 'mesh_vertex'` 점을 쓴다.
  - 혈관 변형은 `deformation-controller`로 반지름만 바꾼다. 객체 전체 Scale로 수축을 표현하지 않는다.
- **자유 관찰 (Play `cycle-panel.js`):** Python을 부르지 않는다. 관찰 중에는 입력을 막는다. 끝내면 `engine.applyPhaseEnd`로 학습 단계 모양으로 되돌린다. 암기·추론 모드에서는 관찰 중 단계 이름(정답)을 숨긴다.
- **개념 모델 데이터:** `content/animations/*.json`과 심장주기 콘텐츠는 `tools/content/make_*.py`로 만든다. 직접 고치지 말고 생성기를 고친 뒤 다시 만든다.
- **리소스:** resource-tracker는 SkinnedMesh의 Skeleton(boneTexture)도 해제한다. 장면 전환 뒤 GPU geo/tex 수가 늘지 않는지 Sandbox AA↔A로 확인한다.
- **테스트:**
  - `tests/animation-tests.html` (26개)
  - `python tests/test_cardiac_cycle.py` (27개)
  - 이동·Play를 건드렸으면 motion-tests(32), test_lesson(63)도 실행한다.
  - Worker 파일을 바꾸면 `WORKER_VERSION`을 올린다(현재 04b-1).

## STEP 04 방향
1. (완료: STEP 03-A~D) 해부학 모델, 레지스트리, Anchor, 이동 엔진, 학습 게임
2. (진행: STEP 04-A) 내강 중심선 경로(GEOMETRY_CHECKED 9개), 폐·조직 모세혈관 개념 장면을 만들었다. STEP 04-B+에서 나머지 폐정맥·대동맥 가지·팔다리 혈관 경로 13개(GEOMETRY_CHECKED 9, APPROXIMATE 4)를 더했다. 남은 것은 전공자 경로 검토다. 세부 요구사항은 `references/nursing/analysis/STEP_04_REQUIREMENTS.md`에 있다(로컬 전용).
3. (진행: STEP 04-B) 범용 애니메이션 엔진과 심장주기 개념 모델을 만들었다. STEP 04-B+에서 BodyParts3D 파생 판막 리깅·심실 벽 영역 모델(교육용 근사)을 Sandbox HV에 만들었다. Play 학습 화면 연결은 아직이다. 다음은 04-C(연속 생리 변수·인과·피드백)다.
4. 다른 계통 콘텐츠(소화, 호흡, 비뇨, 림프)를 같은 형식으로 추가한다.

## 해부학 자산 확장 (STEP 04-B+, 2026-11-29)
- **버전 관리:** 기존 모델은 바꾸지 않고 새 파일로 만든다(`heart.glb` 그대로, `heart-v2*.glb` 추가). 학습 화면(Play)은 아직 v1을 쓴다.
- **자산 대장:** `bp3d_build.py register` 뒤 `python tools/asset-processing/registry_extend.py`를 실행한다(파이프라인 밖 자산 meta·행, 확장 열). 모르는 값은 UNKNOWN, 검토 전은 NOT_REVIEWED.
- **Blender 내보내기 주의**
  - Blender 5.3은 새 Shape Key 값을 1로 둔다 → `value = 0`. NLA 클립을 내보내면 기본 가중치가 1이 될 수 있어 GLB를 고친다(`zero_weights`).
  - 여러 메시에 걸친 클립은 `export_animation_mode='NLA_TRACKS'`(트랙 이름 = 클립 이름).
  - 작은 메시 수백 개에 Morph를 달면 파일이 커진다 → 한 메시로 합치고 `export_morph_normal=False`.
- **GLB 클립과 상태:** 클립이 끝나면 Mixer가 원래 값으로 되돌린다. 유지해야 하는 상태(판막, 혈관 긴장도)는 `morph` 애니메이션으로 만든다. 클립은 반복 장식에 쓴다.
- **가지 혈관 경로:** `content/anatomy/cardiovascular/paths-branches.json`(지연 로딩 자산을 가리킴). Play가 읽는 `paths.json`에 넣지 않는다. Explorer 개발자 모드가 `requires_assets`를 불러온 뒤 더한다. 만들기: `tools/validation/trace-branch-paths.mjs` → `receive_json.py` → `tools/content/merge_branch_paths.py`.
- **지연 로딩:** `anatomy-manager.ensureAsset`은 불러온 뒤 레이어 표시 상태를 다시 적용한다(꺼진 레이어 자산이 보이지 않게).
- **04-C 준비 데이터:** `content/anatomy/regulation/prep-04c.json`(구조·Anchor·교육용 신호 경로). 게임 로직은 넣지 않는다.
- **테스트:** 자산·데이터를 바꾸면 `python tools/asset-processing/test_asset_upgrade.py`(42개)를 실행한다.
