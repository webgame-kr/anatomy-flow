# nf-micro-concept — 미세 구조 개념 장면 (프로젝트 자체 제작)

- **파일:** `content/micro/capillary-scenes.json`(장면 데이터), `js/scale/micro-scene.js`(도형 생성). 모델 파일은 없다. 실행할 때 Three.js 도형으로 만든다.
- **출처·라이선스:** 이 저장소에서 직접 만들었다. 저장소와 같은 조건을 따른다.
- **검증 상태:** `CONCEPTUAL`. 해부 모델이 아니며 의학적으로 검증하지 않았다.

## 만든 이유
- BodyParts3D 4.0에는 폐포, 폐 실질, 모세혈관이 없다(STEP 03-A·04-A 카탈로그 검색).
- 무료·출처 표기 라이선스의 폐포·모세혈관 3D 모델을 찾지 못했다(2026-11-28 검색).
  - Z-Anatomy는 CC BY-SA라서 사용자와 검토하기 전까지 쓰지 않는다.
  - 판매 사이트의 모델은 유료라 구매하지 않는다.
  - NIAID BioArt에는 내려받을 수 있는 3D 파일이 없었다.

## 장면 구성
| 장면 | 구성 | 경로 |
|---|---|---|
| `micro.pulmonary` | 폐포(반투명 구), 폐포를 감싸는 모세혈관 관 1개, O₂(폐포 → 혈액), CO₂(혈액 → 폐포) 입자 | `micro.pcap` (cp.pcap_in → cp.pcap_exchange → cp.pcap_out) |
| `micro.systemic` | 조직 모세혈관 관 1개, 조직 세포(납작한 구), O₂(혈액 → 조직), CO₂(조직 → 혈액) 입자 | `micro.scap` (cp.scap_in → cp.scap_exchange → cp.scap_out) |

## 크기와 단순화
- 1 장면 m는 실제 약 130 µm다.
- 상대 크기는 일반 참고 수치를 썼다. **강의자료에서 확인한 값이 아니다.**
  - 적혈구 약 7.8 µm
  - 모세혈관 지름 약 5~10 µm (장면 10.4 µm)
  - 폐포 지름 약 200~300 µm (장면 260 µm)
  - 조직 세포 약 20 µm
- 단순화한 점
  - 실제 폐포는 여러 모세혈관 그물에 둘러싸여 있다. 혈관 하나가 폐포를 감싸는 모양이 아니다.
  - 기체 입자는 분자보다 훨씬 크게 그렸다. 보이게 하려는 표시이며 개수와 속도는 의미가 없다.
  - 색은 교육용 구분이다.
- 화면 표시: 스케일 표시 상자에 "개념 모델" 배지, 단위 설명, 확대 설명을 띄운다.

## STEP 04-B+ GLB 개념 모델 (2026-11-29)
- **파일:** `assets/micro/alveolus-concept.glb`, `assets/micro/tissue-capillary-concept.glb`, `assets/micro/vessel-wall-concept.glb`
- **만든 방법:** `tools/blender/make_micro_concepts.py`(Blender 5.3, 기본 도형·곡선·Remesh·Boolean). 외부 모델이나 텍스처를 쓰지 않았다.
- **애니메이션 데이터:** `content/animations/micro-concepts.json`(`tools/content/make_micro_anim.py`로 생성). Sandbox 장면 MA·MB·MC.
- **검증 상태:** `CONCEPTUAL`. 해부 모델이 아니며 의학적으로 검증하지 않았다.
- 단순화한 점
  - 폐포: 폐포 7개와 폐포관을 합친 주머니를 한 사분면만 잘라 보였다. 모세혈관 그물은 폐포 바깥 점을 이웃끼리 이은 것이고 실제 배치가 아니다. 교환 부위 확대판의 층 두께는 보이게 키운 값이다.
  - 조직 모세혈관: 모세혈관 5줄과 가로 연결, 세포 배치는 교육용이다. 세동맥 고리는 모세혈관앞 조임근을 단순화한 표시다.
  - 혈관 벽: 중간 크기 동맥 단면의 층 순서만 따랐다. 층 두께·민무늬근 세포 수·수축/확장 때 반지름 변화는 실측이 아니다.
  - 적혈구·기체·물질 입자의 크기·개수·속도는 의미가 없다.
