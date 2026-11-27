# 개발 자료 정리 현황 (2026-11-27)

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
| 테스트 모델 DamagedHelmet | `assets/test-models/` (라이선스 확인 전 Git 제외) | 1 |

파일명은 `번호_제목.pdf` 형식으로 정리했습니다(공백과 쉼표는 `_`로 바꿈).

## 중복 처리
- 같은 이름에 `(1)`, `(2)`가 붙은 파일은 SHA-256으로 비교했습니다. 모두 원본과 내용이 같았습니다(강의자료 12종, 간호과정 학생용, 감염관리 3개, 산소화요구 2개).
- 내용이 같은 파일은 하나만 복사했고, 나머지 이름은 대응표의 `duplicates_in_downloads` 열에 기록했습니다.
- 전 단계에서 `references/lectures/`에 복사해 두었던 강의자료는 `references/programming/`과 해시가 같은 것을 확인한 뒤 정리했습니다. 학습 노트는 `programming/notes/`로 옮겼습니다.

## 누락 목록 (다운로드 폴더에 없음)
| 자료 | 비고 |
|---|---|
| `isa_parts_list_e.txt` | BodyParts3D 부위 ID ↔ 영문 명칭표. ZIP 안에도 없어서 BodyParts3D 다운로드 페이지에서 따로 받아야 합니다. |
| `partof_parts_list_e.txt` | 위와 같음 |
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
