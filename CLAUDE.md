# CLAUDE.md — FLOW ENGINE 개발 원칙

## 프로젝트
간호학 기전(해부·생리·병태생리)을 타이핑과 시각적 이동으로 학습하는 웹게임의 공통 엔진.
GitHub Pages 정적 사이트. 백엔드, DB, 유료 API는 쓰지 않는다. 데이터 명세는 `docs/DATA_SPEC.md`에 있다.

## 아키텍처 원칙
- **Python(`py/`) = 규칙.** 판정, 진행, 상태, 검증, 기록 계산을 맡는다. DOM이나 그래픽 코드는 넣지 않는다.
- **JavaScript(`js/`) = 화면.** SVG, 애니메이션 프레임 계산, 카메라, 입력, LocalStorage를 맡는다. 게임 규칙을 JS에 복제하지 않는다.
- **통신 방식**
  - JS가 `game.submit(text)` / `game.arrive(edge_id)`를 부른다.
  - Python은 `{result, commands, view}`를 돌려준다.
  - JS는 `commands`를 순서대로 실행하고 `view`로 화면을 다시 그린다.
- **중복 방지:** 명령마다 고유 `id`가 있고, JS는 실행한 id를 기억한다. 이동 중에는 Python이 `phase = moving`으로 제출을 거절하고, JS도 입력창을 잠근다.
- **화면 동기화:** 초기화하거나 콘텐츠를 바꾸면 JS의 `session` 번호가 오른다. 이전 애니메이션의 완료 콜백은 무시한다.
- **콘텐츠 = JSON:** 새 시나리오는 엔진 코드를 고치지 않고 `content/`에 JSON만 추가해 만든다. 엔진에 콘텐츠별 분기(`if content_id == ...`)를 넣지 않는다.

## Python 코딩 규칙 (학생 프로젝트 · 수업 범위)
- 사용하는 것: 리스트, 딕셔너리, 튜플, 셋, if/elif/else, for/while, 함수(def/return, 기본값 인자), 모듈 import, `global`, `.format()`, `split`/`join`.
- 사용하지 않는 것: class, try/except, 재귀, enumerate, zip, `sorted(key=)`, 딕셔너리 컴프리헨션, 타입 힌트, 데코레이터, 외부 라이브러리.
- 오류 처리는 예외 대신 `dict.get`, `in`, `type(x) == list` 검사로 한다. `validate()`가 걸러낸 데이터만 엔진에 들어온다.
- 함수와 변수 이름은 단순하게 짓고, 주석은 짧은 한국어로 쓴다.
- JSON 파싱은 JS가 하고 Python은 dict를 받는다. Python 쪽에서는 `json` 모듈이 필요 없다.

## 테스트
- Python 로직을 바꾸면 `python tests/test_engine.py`가 모두 통과해야 한다.
- 새 기능에는 테스트를 같은 파일에 `check(이름, 조건)` 형식으로 추가한다.
- 화면을 바꾸면 `python -m http.server`로 열어 4개 시나리오와 검증 실패 예시를 확인한다.

## 배포 규칙
- 모든 경로는 상대 경로로 쓴다. 맨 앞에 `/`를 붙이지 않는다(GitHub Pages 하위 경로 대응).
- Pyodide 버전은 `js/py-bridge.js`의 `PYODIDE_VERSION`에 고정한다. 올릴 때는 전체 시나리오를 다시 확인한다.
- Python 파일을 추가하면 `py-bridge.js`의 `PY_FILES`에도 넣는다.

## 하지 않는 것 (v0.1 범위 밖)
로그인, 멀티플레이, 실시간 서버, 3D 모델, 대규모 의료 콘텐츠, AI 연동, 콘텐츠 제작 에디터.

## 다음 단계 후보
1. 실제 기전 콘텐츠 1종을 시범 제작한다(예: 심장 혈액 순환). 제작 중에 데이터 명세의 부족한 점을 찾는다.
2. 모델을 SVG 파일이나 `<symbol>`로 불러오는 기능.
3. 노드 설명 카드와 오답 힌트 단계(첫 글자 공개 등).
4. 콘텐츠 검증 결과를 노드 위치와 함께 보여 주는 화면.
5. 브라우저 자동 테스트(시나리오 재생 스크립트).
