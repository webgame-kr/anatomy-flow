# CLAUDE.md — NURSE FLOW 3D 개발 원칙

## 프로젝트
실시간 3D 인체 모델에서 간호학·해부생리학 기전을 타이핑과 시각적 이동으로 학습하는 웹게임.
GitHub Pages 정적 사이트(webgame-kr/anatomy-flow)로 운영하며, 백엔드·DB·유료 API는 쓰지 않는다.
현재 단계는 STEP 01(3D 엔진 기반)이다. 구조는 `docs/ARCHITECTURE.md`에 있다.

## 아키텍처 원칙
- **실시간 3D 전용:** Three.js 0.160.0(WebGL)만 쓴다. 2D SVG 엔진은 쓰지 않는다(기록은 태그 `v0.1-svg`).
- **역할 분리**
  - Python(`py/`)은 게임 로직과 상태를 맡는다. Three.js와 DOM에 의존하지 않는다.
  - JavaScript(`js/`)는 렌더링, 입력, 저장을 맡는다. 게임 규칙을 JS에 복제하지 않는다.
- **Three.js 객체:** Mesh는 `js/engine/object-manager.js`만 만들고 지운다. 모든 객체는 고유 문자열 ID로 다룬다.
- **Python 호출:** Pyodide는 Web Worker에서 돈다. 호출은 메시지 + Promise(`py-client.js`)로 하고 이벤트 때만 부른다. 렌더링 프레임마다 부르지 않는다.
- **명령 형식:** Python은 `{ok, commands, objects, message}`를 돌려준다. 명령은 `clear` / `create` / `update` / `remove`이고 고유 `id`가 있다.
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
- Python을 바꾸면 `python tests/test_sandbox3d.py`와 `python tests/test_engine.py`가 모두 통과해야 한다.
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

## 범위 밖 (STEP 01)
실제 인체 모델, 의료 콘텐츠, 복잡한 경로 애니메이션, 로그인, 멀티플레이, 콘텐츠 에디터, 데이터 분석.

## STEP 02 후보
1. 3차원 경로: CatmullRomCurve3로 경로를 그리고, 그 위를 객체가 이동한다. Python은 경로 ID와 시간만 보낸다.
2. 보존한 진행 규칙 엔진(`flow_engine` 등)을 Worker에 싣고 노드 좌표를 `[x, y, z]`로 확장한다.
3. 타이핑 입력(`js/shared/typing-input.js`)과 정답에 따른 3D 이동을 연결한다.
4. 카메라 추적: 이동 객체를 부드럽게 따라간다.
5. 무료 라이선스 GLB 모델을 하나 시범으로 불러와 부위 ID를 연결한다.
