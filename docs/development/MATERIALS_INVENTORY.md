# 개발 자료 정리 현황 (2026-11-27, 메타데이터 추가 2026-11-28)

비공개 자료의 **파일 목록과 원본 파일명 대응표**는 공개 저장소에 올리지 않습니다. 대신 로컬에 둡니다.
- `references/FILE_MAP.csv`: 강의자료·전공 자료
- `raw-models/FILE_MAP.csv`: 원본 모델

두 파일 모두 SHA-256과 다운로드 폴더 안의 중복 파일 목록을 담고 있습니다. 이 문서에는 분류와 개수만 적습니다.

## 수집한 자료 (다운로드 폴더 → 프로젝트로 복사, 원본은 그대로 둠)

| 분류 | 위치 (Git 제외) | 개수 |
|---|---|---|
| 프로그래밍 강의자료 1~12장 | `references/programming/` | 12 |
| 같은 강의의 실습 자료 | `references/programming/practice/` | 3 |
| 강의 학습 노트 (STEP 00에서 작성) | `references/programming/notes/` | 4 |
| 생리학·기초간호과학 | `references/nursing/physiology/` | 3 |
| 기본간호학 | `references/nursing/fundamentals/` | 19 |
| 성인간호학 (교재 상권 2종 + 추가자료 2종) | `references/nursing/adult-health/` | 4 |
| BodyParts3D 원본 ZIP (is-a, part-of) | `raw-models/bodyparts3d/archives/` | 2 |
| BodyParts3D 메타데이터 (2026-11-28 공식 페이지에서 다운로드) | `raw-models/bodyparts3d/metadata/` | 6 |
| 테스트 모델 DamagedHelmet | `assets/test-models/` (라이선스 확인 전 Git 제외) | 1 |

파일명은 `번호_제목.pdf` 형식으로 정리했습니다(공백과 쉼표는 `_`로 바꿈).

## 중복 처리
- 같은 이름에 `(1)`, `(2)`가 붙은 파일은 SHA-256으로 비교했습니다. 모두 원본과 내용이 같았습니다(강의자료 12종, 간호과정 학생용, 감염관리 3개, 산소화요구 2개).
- 내용이 같은 파일은 하나만 복사했고, 나머지 이름은 대응표의 `duplicates_in_downloads` 열에 기록했습니다.
- 전 단계에서 `references/lectures/`에 복사해 두었던 강의자료는 `references/programming/`과 해시가 같은 것을 확인한 뒤 정리했습니다. 학습 노트는 `programming/notes/`로 옮겼습니다.

## BodyParts3D 메타데이터 (2026-11-28)

[공식 다운로드 페이지](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)의 링크(`https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/<파일명>`)에서 `curl`로 원본 그대로 받았습니다.
- 원본 파일명을 그대로 썼고 내용은 수정하지 않았습니다. SHA-256은 로컬 `raw-models/FILE_MAP.csv`에 있습니다.
- 6개 모두 HTTP 200, `text/plain; charset=UTF-8`로 응답했습니다. HTML 오류 페이지가 아닙니다.
- 인코딩은 UTF-8(실제로는 ASCII만 사용)이고 BOM은 없습니다.
- 줄 끝은 LF이고, 탭으로 구분되며 빈 줄은 없습니다. 모든 행의 열 수가 같습니다.

| 파일 | 크기 (bytes) | 행 수 (헤더 포함) | 헤더 (탭 구분) | 열 |
|---|---|---|---|---|
| `isa_parts_list_e.txt` | 128,086 | 2,906 | concept id · representation id · en | 3 |
| `partof_parts_list_e.txt` | 59,351 | 1,369 | concept id · representation id · en | 3 |
| `isa_element_parts.txt` | 1,142,159 | 29,550 | concept id · name · element file id | 3 |
| `partof_element_parts.txt` | 651,179 | 17,944 | concept id · name · element file id | 3 |
| `isa_inclusion_relation_list.txt` | 207,664 | 2,905 | parent id · parent name · child id · child name | 4 |
| `partof_inclusion_relation_list.txt` | 91,241 | 1,368 | parent id · parent name · child id · child name | 4 |

**OBJ 압축파일과의 일치 검증**
- **OBJ ↔ element file id:** `*_element_parts.txt`의 element file id 집합이 같은 트리 ZIP의 OBJ 파일명 집합과 정확히 같습니다(빠지거나 남는 것 없음, `FJ1383M`처럼 `M`이 붙은 ID 포함).
  - is-a: 2,234 = 2,234
  - part-of: 1,258 = 1,258
- **concept id:** `*_element_parts.txt`의 concept id가 모두 `*_parts_list_e.txt`에 있습니다.
  - is-a: 2,905개
  - part-of: 1,368개
- **데이터 버전:** OBJ 파일 머리글은 `Compatibility version : 4.0`이고 ZIP 이름은 `BP3D_4.0`입니다. 공식 페이지의 `LATEST` 디렉터리에도 4.0 ZIP만 있습니다. 텍스트 파일 자체에는 버전 표기가 없지만, 같은 디렉터리에서 받았고 ID가 1:1로 맞으므로 같은 데이터 버전으로 판단합니다.

**STEP 03 참고:** part-of 트리에 `heart`(FMA7088), `right/left atrium`, `right/left ventricle`, `tricuspid/mitral/aortic valve`와 판막엽(leaflet)이 각각 부위로 들어 있습니다.

## 누락 목록 (다운로드 폴더에 없음)
| 자료 | 비고 |
|---|---|
| ~~`isa_parts_list_e.txt`, `partof_parts_list_e.txt`~~ | 2026-11-28 공식 페이지에서 받음 (위 "BodyParts3D 메타데이터") |
| Z-Anatomy BLEND / OBJ | 받지 않음 |
| 해부학 전공 자료 | 다운로드 폴더에서 해부학 강의자료를 찾지 못했습니다(`references/nursing/anatomy/` 비어 있음). |

## 가져오지 않은 자료 (관련성 불명확 또는 개인 파일)
- 개인 과제, 보고서, 시험 문제, 퀴즈 정리본, 개인 필기(`.hwp`)
- 다른 과목 자료: 성장발달, 간호학개론, 디지털헬스, 보건의료 빅데이터, 다른 해의 파이썬 수업 등

필요하면 사용자가 지정해서 추가합니다.

## 폴더 역할
| 폴더 | 역할 | Git |
|---|---|---|
| `py/` | Python 게임 로직 (기존 경로 유지. 목표 구조의 `python/`에 해당) | 추적 |
| `js/`, `css/`, `index.html` | Three.js 엔진과 UI | 추적 |
| `assets/` | 웹게임에 쓰는 **최적화된** 배포용 모델·텍스처·애니메이션 | 추적 (`test-models/`만 제외) |
| `assets/licenses/` | 배포 자산의 라이선스 원문과 출처 표기 | 추적 |
| `models/` | STEP 01에서 만든 GLB 자리. 이후 `assets/`로 통합 예정 | 추적 |
| `raw-models/` | 원본 대용량 모델(ZIP, OBJ, BLEND), 압축 해제본, Blender 작업 파일 | **제외** |
| `references/` | 강의자료, 전공 교재, 디자인·기술 참고자료 | **제외** |
| `content/` | 학습 콘텐츠 JSON (계통별 하위 폴더) | 추적 |
| `tools/` | Blender 스크립트, 자산 처리, 검증 도구 | 추적 (`tools/out/` 제외) |
| `tests/` | Python 단위 테스트 | 추적 |
| `docs/` | 아키텍처, 개발 문서, 참고 사이트, 자산 대장 | 추적 |

빈 폴더는 Git에 올라가지 않습니다. 자료를 넣을 때 해당 폴더가 함께 커밋됩니다.
