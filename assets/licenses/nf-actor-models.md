# 이동 객체(Actor) 모델 — 자체 제작

- 위치: `js/motion/actor-manager.js`의 `ACTOR_MODELS`. 실행할 때 Three.js 코드로 형태를 만든다. 별도 모델 파일(GLB)이 없어서 `assets/particles/`도 비어 있다.
- 출처: 이 프로젝트에서 만든 코드다. 외부 모델, 텍스처, 스캔 데이터, 애니메이션은 쓰지 않았다. BioDigital Human과 Innerbody의 자료도 쓰지 않았다.
- 라이선스: 이 저장소와 같은 조건이다. 외부 출처 표기 의무가 없다.
- 자산 대장: `docs/references/asset_registry.csv`의 `nf-actor-models` 행

## 모델과 주의
| model_id | 형태 | 실제 크기 참고값 |
|---|---|---|
| `rbc` | 양면 오목 원반. Evans & Fung(1972) 단면 식을 정규화해 LatheGeometry로 만들었다. | 지름 약 7.8 µm |
| `wbc` | 이십면체 구 (단순 형태) | 약 12 µm |
| `platelet` | 납작한 구 (단순 형태) | 약 2.5 µm |
| `lymph`, `nutrient`, `hormone`, `nerve_signal`, `food`, `marker` | 표시용 기호 형태 | — |

- 실제 세포 구조(막, 세포골격, 핵 등)를 재현한 모델이 **아니다**. 화면에도 "교육용 형태"라고 표시한다.
- 크기는 실제 크기 참고값(`real_size_m`)과 화면 표시 크기(`display_size`)를 분리한다. 예를 들어 심장 장면의 적혈구는 3 mm로, 실제 지름의 약 385배다.
- 색은 교육용 구분이다.
  - 적혈구는 산소화(`#d62839`)와 탈산소화(`#8a1c3c`) 모두 붉은 계열이다.
  - 혈액을 파란색으로 표시하거나 설명하지 않는다.
