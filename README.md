# NURSE FLOW 3D

실시간 3D 인체 모델에서 간호학·해부생리학 기전을 **타이핑**과 **시각적 이동**으로 배우는 웹게임입니다. 혈액, 림프액, 음식물, 세포, 호르몬, 신경 신호 등이 이동하고 변화하는 모습을 다룹니다.

**현재 단계: STEP 01 — Real-time 3D Engine Foundation v0.1**
실제 인체 모델과 의료 콘텐츠는 아직 없습니다. 실시간 3D 렌더링과 Python 게임 로직 연결을 검증하는 개발자 Sandbox만 있습니다.

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
│  ├─ main.js              Sandbox UI 연결
│  ├─ engine/              3D 렌더링 (Three.js는 여기서만)
│  │  ├─ viewport.js       Scene, Renderer, Camera, Light, Grid/Axes, OrbitControls, 반응형, 루프, 클릭 선택
│  │  ├─ object-manager.js 공통 객체 관리: ID로 생성·변경·제거, 보간
│  │  └─ command-runner.js Python 명령 해석·적용
│  ├─ python/
│  │  ├─ py-client.js      Worker 시작, 메시지 기반 Promise 호출, 오류 안내
│  │  └─ py-worker.js      Web Worker 안에서 Pyodide 실행
│  └─ shared/              다음 단계에서 다시 쓸 모듈 (v0.1에서 보존)
│     ├─ typing-input.js   한글 IME 조합 처리
│     └─ records.js        LocalStorage 기록, CSV 다운로드
├─ py/                     Python 게임 로직 (Three.js에 의존하지 않음)
│  ├─ sandbox3d.py         STEP 01: 3D 객체 상태와 명령 생성
│  ├─ typing_engine.py     ┐
│  ├─ flow_engine.py       │ v0.1에서 보존한 진행 규칙 엔진
│  ├─ state_engine.py      │ (타이핑 판정, 노드·Edge 진행, 상태, 검증, 기록)
│  ├─ content_loader.py    │ STEP 02 이후 3D 콘텐츠에 연결
│  ├─ record_engine.py     │
│  └─ game.py              ┘
├─ content/                학습 콘텐츠 JSON (STEP 02부터)
├─ models/                 GLB 모델 (STEP 02부터)
├─ tools/                  모델 변환 도구 (STEP 02부터)
├─ tests/
│  ├─ test_sandbox3d.py    STEP 01 Python 테스트 (38개)
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
