# STEP 04-B 애니메이션 시험·개념 모델 (프로젝트 자체 제작)

모두 이 저장소에서 직접 만들었고 저장소와 같은 조건을 따른다. 해부 모델이 아니며 의학적으로 검증하지 않았다.

| 자산 | 파일 | 만든 방법 | 상태 |
|---|---|---|---|
| nf-anim-test | `assets/animations/anim-test.glb` | `tools/blender/make_anim_test_glb.py` (Blender 5.3, factory settings) | TEST |
| nf-cardiac-concept | `content/animations/cardiac-concept.json` (실행할 때 도형 생성) | `tools/content/make_cardiac_concept.py` → `js/animation/concept-model-builder.js` | CONCEPTUAL |
| nf-animation-tests | `content/animations/test-*.json` | `tools/content/make_animation_tests.py` | TEST |

## nf-anim-test (GLB)
- 상자 + Transform 클립 `Spin`
- 구 + Shape Key `Inflated` + 가중치 클립 `Inflate`
- 뼈 2개 Armature에 스킨된 판 + 클립 `Flap`
- 24 fps, 클립마다 48프레임. 엔진의 GLB AnimationClip 재생 검증용이다.

## nf-cardiac-concept (심장주기 개념 모델)
- **만든 이유:** BodyParts3D 심장 모델에는 심실 근육 벽과 심실중격이 없다. 판막은 첨판 메시가 있지만 경첩·리깅이 없어 움직일 수 없다.
- **구성**
  - 심방 2개·심실 2개: 반투명 타원체. Morph `contract`로 줄어든다.
  - 판막 4개: 첨판을 한 Geometry로 합쳤다. Morph `open`으로 첨판이 고리 가장자리를 축으로 젖혀진다.
  - 대혈관 4개: 관.
- **표시**
  - 화면에 "개념 모델" 배지를 띄운다.
  - 실제 모델(BodyParts3D) 판막은 색으로만 상태를 표시한다(OPEN 초록, CLOSED 회색, 전환 중 노랑·주황).
- **근거와 한계**
  - 단계 구분과 판막 상태는 강의자료 HA6 p5 그림과 교재 p614를 따랐다.
  - 모양, 크기, 단계 시간(ms), 수축 배율은 교육용 값이며 자료에서 확인한 수치가 아니다.
  - 실제 압력·용적·혈류역학 계산이 아니다.
