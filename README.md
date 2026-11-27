# FLOW ENGINE v0.1 — Core Engine & Sandbox

간호학의 해부학 구조, 생리 기전, 병태생리 과정을 **타이핑**과 **시각적 이동**으로 학습하는 웹게임의 공통 엔진입니다.
이번 버전은 실제 의료 콘텐츠가 아니라 원·사각형·곡선 같은 단순 도형으로 엔진을 시험하는 **Sandbox**입니다.

- 핵심 규칙(정답 판정, 진행, 상태, 검증, 기록)은 **Python**으로 작성하고 **Pyodide 0.26.4**로 브라우저에서 실행합니다.
- 화면(SVG, 애니메이션, 카메라, 입력)은 **HTML, CSS, Vanilla JavaScript**로 처리합니다.
- 서버, 데이터베이스, 유료 API가 필요 없는 정적 사이트라서 GitHub Pages에 그대로 올릴 수 있습니다.
- 새 콘텐츠는 엔진 코드를 고치지 않고 `content/` 폴더에 JSON 파일만 추가하면 됩니다.

## 폴더 구조

```
flow-engine/
├─ index.html            Sandbox 화면
├─ css/style.css
├─ js/                   화면 담당 (JavaScript)
│  ├─ main.js            UI 연결, Python 명령 실행
│  ├─ py-bridge.js       Pyodide 로딩(버전 고정), Python 호출, 오류 안내
│  ├─ render.js          Rendering Engine: SVG 노드·모델·경로
│  ├─ animation.js       Animation Engine: 곡선 이동(requestAnimationFrame)
│  ├─ camera.js          Camera Engine: 휠 확대·축소, 드래그, 두 손가락 확대, 추적
│  ├─ typing-input.js    한글 IME 조합 처리, 제출
│  └─ records.js         LocalStorage 저장, CSV 다운로드
├─ py/                   규칙 담당 (Python)
│  ├─ game.py            JavaScript가 부르는 API
│  ├─ typing_engine.py   Typing Engine: 입력 정규화, 정답 비교
│  ├─ flow_engine.py     Flow Engine: 후보, 조건, 이벤트, 완료
│  ├─ state_engine.py    State Engine: 게임 상태
│  ├─ content_loader.py  Content Loader: JSON 구조 검증
│  └─ record_engine.py   Record Engine: 기록 계산, CSV 문자열
├─ content/              테스트 콘텐츠 (JSON)
│  ├─ index.json         선택 목록
│  ├─ 01_sequential.json 순차형
│  ├─ 02_branch.json     분기형 (입력 선택 + 변수 조건)
│  ├─ 03_cycle.json      순환형 (3번째 방문에서 완료)
│  ├─ 04_causal.json     인과관계형 (변수·여러 객체 변화)
│  └─ 99_broken.json     검증 실패 예시
├─ tests/test_engine.py  Python 단위 테스트
├─ docs/DATA_SPEC.md     아키텍처와 데이터 명세
└─ CLAUDE.md             개발 원칙
```

## 로컬 실행

브라우저 보안 때문에 `index.html`을 더블클릭(`file://`)하면 동작하지 않습니다. 로컬 서버로 여세요.

```powershell
cd flow-engine
python -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000`을 엽니다.

- 처음 열 때는 Pyodide(약 10MB)를 CDN에서 내려받으므로 시간이 걸립니다. 인터넷 연결이 필요합니다.
- 파일을 고쳤는데 화면이 그대로면 강력 새로고침(Ctrl+Shift+R)을 하세요.
- 주소 뒤에 `?c=03_cycle.json`처럼 붙이면 해당 콘텐츠로 바로 시작합니다.

## 테스트

### Python 단위 테스트

```powershell
cd flow-engine
python tests/test_engine.py
```

70개 항목을 검사합니다. 실패가 하나라도 있으면 종료 코드 1을 돌려줍니다.
- 정규화와 복수 정답
- 잘못된 ID·연결 검출
- 오답일 때 상태 유지
- 이동 중 중복 제출·중복 도착 방지
- 분기, 순환, 무한 반복 방지
- 인과관계 이벤트, 초기화, 기록·CSV

### 브라우저 확인 순서

1. **순차형:** 출발 → 펌프 → 통로 → 도착을 입력합니다. 영어(start, pump…)나 대문자로 입력해도 됩니다.
2. **분기형:** 분기점에서 `위쪽` 또는 `아래쪽`을 입력해 갈래를 고릅니다. 위쪽으로 왔을 때만 합류 뒤에 `보너스` 길이 열립니다.
3. **순환형:** 출발점 → 오른쪽 → 아래 → 왼쪽 → 출발점을 두 바퀴 돌면 3번째 방문에서 완료됩니다.
4. **인과관계형:** 자극 → 증가 → 확인을 반복합니다. 압력이 3이 되면 경고등이 켜지고 `조절`로 가는 길이 열립니다.
5. **검증 실패 예시:** 패널의 "콘텐츠 검증"에 오류 8개가 표시되고 게임은 시작되지 않습니다.
6. 이동 중에 초기화를 누르면 애니메이션이 멈추고 처음 상태로 돌아가는지 확인합니다.
7. 한글 입력에서 조합 중에 Enter를 눌러도 한 번만 판정되는지 확인합니다.

## GitHub Pages 배포

1. `flow-engine` 폴더의 내용을 저장소에 올립니다. 저장소 루트나 하위 폴더 어디에 두어도 됩니다.
2. 저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`로 고릅니다.
3. 브랜치와 폴더를 지정합니다(예: `main` / `/ (root)`).
4. 몇 분 뒤 `https://<사용자>.github.io/<저장소>/`에서 열립니다.

모든 경로가 상대 경로(`py/`, `content/`, `js/`)라서 `/<저장소>/` 같은 하위 경로에서도 동작합니다.
`.nojekyll` 파일은 Jekyll 처리를 끄기 위해 넣어 두었습니다.

## 새 콘텐츠 추가

1. `content/`에 JSON 파일을 만듭니다. 형식은 `docs/DATA_SPEC.md`를 따릅니다.
2. `content/index.json` 목록에 `{ "file": "파일이름.json", "title": "제목" }`을 추가합니다.
3. 화면에서 고르면 Python 검증을 거친 뒤 실행됩니다. 오류가 있으면 패널에 표시됩니다.

## 학습 기록

- 시나리오가 끝날 때마다 기록이 브라우저 LocalStorage(`flowengine.records.v1`)에 저장됩니다. 기록 항목은 날짜, 정답·오답 수, 정답률, 이동 수, 시간입니다.
- 패널의 **CSV 내보내기**로 엑셀에서 열 수 있는 CSV(UTF-8 BOM)를 받습니다.
- 기록은 그 브라우저에만 저장되며 서버로 보내지 않습니다.
