# 개발 참고 사이트

목적별로 분류했습니다. **참고 사이트의 상업용 모델·이미지·콘텐츠는 추출하거나 복제하지 않습니다.** 연출 방식과 UI 흐름만 참고하고, 실제 자산은 라이선스가 확인된 공개 자료(아래 "공개 해부학 모델")로 직접 만듭니다.

## 게임 진행 및 UI/UX
| 사이트 | 활용 목적 |
|---|---|
| [Metro Typing](https://metrotyping.kr/) | 경로(노선)를 따라 타이핑으로 진행하는 학습 흐름. 정답에 따라 이동하고 다음 역(노드)을 제시하는 방식을 참고합니다. |

## 실시간 3D 해부학 및 기전 연출
| 사이트 | 활용 목적 |
|---|---|
| [BioDigital Human](https://human.biodigital.com/) | 3D 인체에서 장기 선택, 레이어 숨기기, 카메라 이동 같은 상호작용 UX를 참고합니다. |
| [BioDigital Human 혈류 콘텐츠](https://human.biodigital.com/login?returnUrl=/results/modules%3FcategoryId%3Dall%26query%3Dblood%2520flow%26type%3DCategory) | 혈류 이동 연출(경로 위 입자, 색 변화)의 표현 방식을 참고합니다. 로그인이 필요한 상업 서비스라 모델과 영상은 사용하지 않습니다. |

## 해부생리학 콘텐츠
| 사이트 | 활용 목적 |
|---|---|
| [Innerbody — Cardiovascular System](https://www.innerbody.com/image/cardov.html) | 심혈관계 구조와 순서를 확인합니다(콘텐츠 기획용, 이미지 사용 안 함). |
| [OpenStax Anatomy and Physiology 2e](https://openstax.org/details/books/anatomy-and-physiology-2e) | 기전 설명과 용어(한·영)를 확인합니다. 무료 공개 교재이며, 인용할 때는 해당 라이선스와 출처 표기를 따릅니다. |

## 공개 해부학 모델
| 사이트 | 활용 목적 | 라이선스 (2026-11-27 확인) |
|---|---|---|
| [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) | 장기별 OBJ 원본 모델. 필요한 부위만 골라 GLB로 변환합니다. | CC BY 4.0 ([라이선스 페이지](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)) |
| [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) | BodyParts3D 기반으로 정리된 BLEND 아틀라스. 부위 이름과 계층 구조를 참고합니다. | CC BY-SA 4.0 (일부 부위는 NC 등 별도 조건) |

## 테스트 모델
| 사이트 | 활용 목적 |
|---|---|
| [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | GLB 로더, 재질, 조명 테스트. DamagedHelmet은 비상업(NC) 조건이 섞여 있어 공개 배포하지 않습니다. |

## 개발 기술
| 사이트 | 활용 목적 |
|---|---|
| [Three.js 문서](https://threejs.org/docs/) | API 확인(현재 r160에 고정되어 있으므로 버전 차이에 주의). |
| [Three.js Examples](https://threejs.org/examples/) | GLTFLoader, 클리핑(단면), 곡선 경로, 후처리 예제. |
| [Pyodide](https://pyodide.org/en/stable/) | 브라우저 Python과 Web Worker 연동(현재 0.26.4에 고정). |
| [Blender](https://www.blender.org/) | OBJ → GLB 변환, 폴리곤 최적화(로컬에 5.3.0 설치됨). |
| [GitHub Pages](https://docs.github.com/ko/pages) | 정적 사이트 배포. |

모델별 출처, 라이선스, 처리 상태는 [asset_registry.csv](asset_registry.csv)에서 관리합니다.
