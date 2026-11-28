# STEP 04-B+ 보고서 — 해부학 자산 확장과 모델 품질 개선

- 작성일: 2026-11-29
- 범위: 기존 엔진(STEP 04-B)은 그대로 두고, 그 엔진이 쓸 실제 해부학 모델·교육용 3D 자산을 늘렸다.
  - 심장 v2(통합 심실 벽·첨판 분리), 심실 벽 영역 분할, 판막 리깅
  - 가지 혈관 모델과 경로 13개, 미세 구조 개념 모델 3종, STEP 04-C 준비 모델
  - 자산 대장 확장, 출처·라이선스 문서
- **의학적 검증:** 이 단계의 어떤 모델·경로·애니메이션도 해부학 전문가 검토를 받지 않았다. 아래의 "통과"는 기하 검사나 엔진 동작 검사 결과다.
- **커밋·푸시·배포:** 하지 않았다(사용자 승인 대기). 유료 모델은 사지 않았다.
- Sandbox 새 장면:

  | 장면 | 내용 |
  |---|---|
  | HC | 심장 v1·v2·영역 비교 |
  | HV | 판막 리깅 |
  | MA | 폐포 |
  | MB | 조직 모세혈관 |
  | MC | 혈관 벽 |
  | RP | 04-C 준비 모델 |

---

## 1. FJ2428.obj 확보 여부
**확보했다.**
- 우리가 가진 원본 아카이브 `isa_BP3D_4.0_obj_99.zip`(IS-A 트리)에서 직접 꺼냈다. OrganUI의 GLB를 쓰지 않았다.
  - 개념: FMA13884 "wall of ventricle"
  - element: FJ2428 (IS-A 트리에만 있음)
- 내용: 좌·우 심실 벽과 심실중격이 붙은 **한 개의 메시**다.
- 함께 확인한 것: PART-OF의 "wall of left/right ventricle"(FMA9556/FMA9533)에는 벽이 없다. 유두근과 승모판 뒤첨판만 들어 있다.
- 파이프라인 개선
  - 사양의 파트마다 트리를 고를 수 있다(`"tree": "isa"`).
  - 추출과 변환이 element마다 다른 ZIP·폴더를 쓴다.
  - 대장의 `source`와 `source_archive`에 실제로 쓴 트리를 적는다. 예: heart-v2는 "IS-A + PART-OF trees".
- **이전 보고서(Claude Doc "필요 3D 모델 보고서")의 "BodyParts3D에 심실 벽 없음"은 틀렸다.** IS-A에 FJ2428이 있다. 그 문서는 아직 고치지 않았다.

## 2. 통합 심실 근육 벽 적용 결과
- `assets/anatomy/cardiovascular/heart-v2.glb`
  - 사양: `tools/asset-processing/specs/cardiovascular-v2.json`
  - 21 메시, 140,244 삼각형, 2,806,272 bytes
  - 기존 `heart.glb`(v1)와 원점·배율이 같다.
- 파트 구성
  - 심방 벽 2개, 통합 심실 벽 1개, 내강 4개
  - 첨판 11개: 삼첨판 3, 승모판 2, 폐동맥판 3, 대동맥판 3
  - 유두근, 관상정맥, 관상동맥
- 기존 `heart.glb`는 바꾸지 않았다. v1과 v2는 HC 장면에서 나란히 볼 수 있다.
- 개선된 점: 심실의 "벽"이 처음으로 보인다. 이전에는 내강 모양만 있었다. 판막도 첨판 단위로 고르고 색을 바꿀 수 있다.

## 3. 심실중격 및 심실 벽 분리 가능 여부
**결론: 원본 메시로는 분리할 수 없고, 기하 분할로 근사했다.**
- 통합 벽(FJ2428)은 한 메시다. 원본에는 좌심실 벽, 우심실 벽, 중격 경계가 없다. "통합 벽 = 독립 중격"이 아니다.
- 기하 분할 결과: `heart-v2-ventricle-regions.glb`
  - 만든 도구: `tools/blender/split_ventricle_wall.py`
  - 크기: 3 메시, 37,442 삼각형, 1,332,368 bytes
  - 분할 방법
    - 면마다 좌·우 심실 내강까지 거리를 잰다.
    - 두 내강이 모두 15 mm 안에 있고, 그 면이 두 내강 "사이"에 있으면 중격 영역이다. "사이"는 가장 가까운 점 방향이 반대(내적 < −0.3)인 것이다.
    - 나머지 면은 더 가까운 쪽 자유벽이다.
  - 처음에는 거리만 썼다. 그러자 얇은 우심실 자유벽이 좌심실을 감싸는 곳까지 중격으로 잡혀, 중격이 면적의 29%가 되었다. 방향 조건을 더하자 12%가 되었다.

  | 영역 | 면 수 | 면적 |
  |---|---|---|
  | 좌심실 자유벽 | 13,835 | 20,256 mm² |
  | 우심실 자유벽 | 16,816 | 23,461 mm² |
  | 중격 영역 | 6,791 | 5,932 mm² |

  - 영역마다 Shape Key `contract`를 넣었다. 각 내강 중심 쪽으로 정점을 당기며, 비율은 좌 12%, 우 15%, 중격 5%다(교육용 값).
- **엔진 검사 (Sandbox, 실제 실행)**
  - 세 영역이 레지스트리에 각각 등록된다. ID는 `.../heart_wall_lv_free`, `.../heart_wall_rv_free`, `.../heart_wall_septum`이다.
  - 좌심실 자유벽만 `contract` = 1로 바꿨다.
    - 좌심실 정점 100번이 4.07 mm 움직였다.
    - 우심실 정점은 0 mm였다.
    - 중격 가중치는 그대로였다.
  - `restore` 뒤 원래 위치와의 차이는 0.000 mm였다.
  - **독립 선택과 독립 변형: 통과.**
- 수정한 문제: Blender 5.3은 새 Shape Key 값을 1로 둔다. 그래서 GLB의 기본 가중치가 1로 들어갔고, 처음부터 수축한 모양으로 열렸다. `value = 0`으로 고치고 다시 확인했다.
- 한계
  - 영역 경계는 앞·뒤 심실사이고랑을 따르지 않는다. 그래서 `GEOMETRY_DERIVED`다.
  - 좌심실만 수축시키면 이웃 영역과 이음매가 벌어진다.
  - 실제 심근의 비틀림이나 두께 변화가 아니다.
- 참고: Z-Anatomy에는 좌·우 심실 벽이 따로 있다.
  - 측정한 중앙 두께는 좌 9.5 mm, 우 3.3 mm였다.
  - 중격 메시는 없다.
  - 이번에는 BodyParts3D(CC BY) 기하 분할을 택했다. 라이선스가 단순하고 판막·내강과 원점이 같기 때문이다. Z-Anatomy 심실 벽(CC BY-SA)은 만들지 않았다(선택 과제로 남김).

## 4. 판막 리깅 결과
- 파일: `heart-v2-valves-rig.glb`
  - 만든 도구: `tools/blender/rig_valves.py`
  - 16 메시, 38,792 삼각형, 1,318,848 bytes
- 구성
  - 첨판·반달첨판 11개가 각각 독립 메시다. 판막마다 그룹(Empty) `valve_tricuspid`, `valve_mitral`, `valve_pulmonary`, `valve_aortic`으로 묶었다.
  - 유두근 5개를 좌심실 2개(승모판 그룹), 우심실 3개(삼첨판 그룹)로 나눴다.
- 변형 방법: Morph(Shape Key) `open`, 경첩 회전 근사
  - **반월판:** 첨판 정점 PCA의 가장 얇은 방향을 혈류 축으로 썼다. 상류 내강과 이루는 각도는 폐동맥판 6.7°, 대동맥판 5.9°다. 바깥 테두리가 부착부, 중심 쪽이 자유연이다. 최대 55° 회전한다.
  - **방실판막:** 첨판이 심실 쪽으로 늘어진 깔때기 모양이라, PCA 축이 혈류 축과 87°(삼첨판), 60°(승모판) 어긋났다. 그래서 심방 내강 중심 → 심실 내강 중심을 축으로 바꿨다. 판륜(가장 상류)이 부착부이고, 깊이 14 mm까지의 몸통이 최대 30° 회전한다. 회전만 하면 자유연이 심방 쪽으로 올라가서 5 mm 하류로 더 민다.
  - **판륜 부착:** 부착부의 가중치가 0이라 움직이지 않는다.
- **새로 확인한 사실: BodyParts3D 방실판막 첨판 element에는 힘줄끈이 이미 들어 있다.**
  - 렌더로 확인했다. 힘줄끈이 유두근까지 이어진다. 그래서 "chordae tendineae" 이름 검색은 0건이어도 모델은 있다.
  - 처음 만든 개념 힘줄끈(관)은 원본과 겹쳐서 지웠다.
  - 첨판 회전이 원본 힘줄끈을 유두근에서 떼어 내는 문제가 있었다. 유두근 표면 10 mm 안의 정점은 유두근 변위를 따르게 고쳤다.
  - 유두근 `open`은 길이 +10%(이완)다. 기본 상태가 수축이다.
- 클립: GLB 안에 판막마다 하나씩 들어 있다.
  - 이름: `<판막>_open`(8프레임), `<판막>_close`(7프레임), 24 fps
  - NLA 트랙 이름으로 클립을 만든다(`export_animation_mode='NLA_TRACKS'`). 처음에는 메시마다 클립이 따로 생겼다.
  - 기본 가중치 1 문제가 있어서 내보낸 뒤 0으로 고쳤다.
- 상태 연결: `content/animations/heart-v2-valves.json`(생성기 `tools/content/make_valve_rig_anim.py`)
  - 구조 `valve.*`는 CLOSED → OPENING → OPEN → CLOSING으로 바뀐다. 판막 그룹 Morph 애니메이션을 쓴다.
  - 심실 벽 영역 수축·이완 애니메이션도 있다.
  - 근사 경로 4개를 넣었다: 내강 중심 → 판막 중심 → 다음 공간, `APPROXIMATE`.
- **엔진 검사 (Sandbox HV, 실제 실행)**
  - 승모판 상태 전환: CLOSED에서 OPENING(가중치 0.51)을 거쳐 OPEN(1)이 되고, 다시 CLOSED(0)로 돌아갔다. 같은 그룹의 힘줄끈과 유두근도 함께 움직였다. 삼첨판은 그대로였다.
  - `hv2.blocked_test`: 닫힌 승모판을 지나는 이동이 failed가 되었다("닫힌 구조를 지나는 이동: valve.mitral는 CLOSED").
  - `hv2.filling`과 `hv2.ejection`은 completed였다. 상태가 맞았고, 좌심실 수축 가중치는 1이었다.
  - GLB 클립 `aortic_open`은 재생 중 0.87이었다. 끝나면 Mixer가 원래 값(0)으로 되돌린다. 그래서 상태 유지는 Morph 애니메이션으로 한다(15번 참고).
- 렌더: `docs/development/img/valves-atrial-closed.jpg`, `valves-atrial-open.jpg`
- **한계 (그대로 설명할 것)**
  - 경첩 회전 근사다. 첨판의 실제 접힘, 접합(coaptation), 혈류 압력을 재현하지 않는다.
  - BodyParts3D 첨판이 닫힌 모양이라고 가정했다. 이 가정은 확인이 필요하다.
  - 힘줄끈이 유두근과 만나는 부분이 조금 구겨진다.

## 5. 기존 모델과 개선 모델 비교 화면
- Sandbox **HC**: 왼쪽에 v1 `heart.glb`, 가운데에 v2 `heart-v2.glb`, 오른쪽에 심실 벽 영역이 있다.
  - 모델 자리를 바로잡았다. 장면 위치를 모델 원점에 다시 더해서 y ≈ 2.3에 놓였었다.
  - 카메라 기본값과 출처 표기를 고쳤다.
- Sandbox **HV**: 심실 벽 영역과 판막 리깅을 함께 보여 준다.
- 화면 확인 범위: 브라우저 창이 숨겨진 상태에서 진행해 실시간 프레임 확인은 제한적이었다. 모양은 Blender 렌더로, 동작은 엔진 상태 값으로 확인했다. 실제 화면에서 애니메이션을 눈으로 본 확인은 **NOT TESTED**다.

## 6. Z-Anatomy 확보 구조 목록
- 원본: `raw-models/z-anatomy/Z-Anatomy.zip`(Git 제외)
  - 86,734,957 bytes, sha256 `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`
  - `Startup.blend`에 객체 7,184개가 있다.
  - 항상 `--disable-autoexec`(내장 스크립트 자동 실행 끔)로 열었다.
- 좌표: BodyParts3D와 같다고 가정하지 않았다. 심장을 비교해 평행 이동 T = (+0.0013, +0.0975, +0.0643) m(Blender Z-up)를 쟀다. 배율은 같다.

| 조사 항목 | Z-Anatomy | 이번에 쓴 것 |
|---|---|---|
| 심실 근육 벽 | 좌·우 따로(중앙 두께 9.5 / 3.3 mm) | 쓰지 않음(BodyParts3D 분할로 대신) |
| 심실중격 | 없음 | — |
| 힘줄끈 | 없음 | BodyParts3D 첨판에 있음 |
| 판막 | 있음(BodyParts3D 계열) | 쓰지 않음 |
| 폐 실질 | 폐엽 표면 있음 | 쓰지 않음(다음 단계 후보) |
| 미주신경 | 곡선 `Vagus nerve (X).l/.r` | **씀** |
| 교감신경줄기 | 곡선 + 신경절 메시 | **씀** |
| 전도계 | 없음 | — |
| 갑상샘 | `Thyroid gland`(Mirror·Solidify·Subsurf) | **씀** |
| 림프 | 림프절 메시 있음(예: Thyroid nodes) | 쓰지 않음 |
| 척수 | `White matter of spinal cord`(Array·Curve) | **쓰지 않음**: Readme의 출처·라이선스 불명 "White matter"(Univ. of Washington)와 관계를 확인하지 못함 |

- 만든 파일: `assets/anatomy/regulation/za-nerves-thyroid.glb`
  - 만든 도구: `tools/blender/za_extract_regulation.py`
  - 7 메시, 164,440 삼각형, 3,727,116 bytes
  - CC BY-SA 4.0. BodyParts3D 자산과 합치지 않은 **별도 파일**이다.
- 정렬 검사: 오른미주신경(옮긴 뒤)에서 BodyParts3D 오른온목동맥 표면까지
  - 거리: 중앙값 12.6 mm, 범위 9.4~15.8 mm, 목 부위 276점
  - 렌더에서 갑상샘은 목에, 미주신경은 숨뇌에서 온목동맥 옆으로 내려오는 위치에 있다.
  - 기하 근거일 뿐 해부학 검증이 아니다.

## 7. OrganUI 조사 결과
- heart-3d
  - 라이선스: 코드 MIT, 모델 CC BY 4.0(BodyParts3D)
  - 구조 11개. 심실 벽은 IS-A FJ2428을 썼다.
  - 처리: 중심 이동, 배율 0.02, 축 [x, z, −y], 감량 없음
  - `heart.glb`: 2,524,400 bytes, sha256 b80a727d…a946
  - 좌·우 심실을 따로 고를 수 없다.
- 사이트에 나온 기관 목록: 부신, 방광, 뇌, 가로막, 식도, 장, 콩팥, 폐, 림프절, 신경, 이자, 척수, 위, 갑상샘, 혈관 등. 각 모델을 열어 확인하지는 않았다.
- 결론
  - 새 형상은 없다. 모두 BodyParts3D에서 왔다.
  - 중심이 이동되어 우리 원점과 맞지 않는다.
  - 그래서 내려받지도 합치지도 않았다. 같은 FJ2428을 원본에서 직접 썼다. React UI도 쓰지 않았다.
- 대장에 `organui-heart-3d`를 조사 기록으로 남겼다(배포 불가, 사용 안 함).
- 라이선스 문구 차이: 사이트는 CC BY 4.0, 옛 OBJ 주석은 CC BY-SA 2.1 Japan이다. 우리는 BodyParts3D 공식 라이선스 페이지(CC BY 4.0, 2026-11-28 확인)를 따른다.

## 8. 추가 혈관 및 이동 경로
**모델:** `assets/anatomy/cardiovascular/systemic-vessels.glb`
- 사양 `specs/systemic-vessels.json`, IS-A 단일 element 22개
- 22 메시, 85,732 삼각형, 1,577,564 bytes
- 동맥: 팔머리동맥, 좌·우 온목동맥, 좌·우 빗장밑동맥, 오른겨드랑동맥, 오른위팔동맥, 오른온엉덩동맥, 오른바깥엉덩동맥, 오른넙다리동맥
- 정맥: 좌·우 팔머리정맥, 오른속목정맥, 오른빗장밑정맥, 오른겨드랑정맥, 오른노쪽·자쪽피부정맥, 좌·우 온엉덩정맥, 오른바깥엉덩정맥, 오른넙다리정맥, 오른큰두렁정맥
- PART-OF 개념은 하위 가지를 모두 담는다(예: 팔머리동맥 93 element, 뇌동맥까지). 그래서 IS-A를 썼다.
- Explorer에 구조 22개를 추가했다. 새 레이어 "동맥 가지 / 정맥 가지"는 기본으로 꺼져 있고, 켜면 지연 로딩한다.
- 한국어 이름은 강의자료와 대조하지 않았다(구조 `note`에 적음).

**경로:** `content/anatomy/cardiovascular/paths-branches.json`, 13개
- 만든 도구: `tools/validation/trace-branch-paths.mjs`
  - 기존 `centerline-tracer`로 혈관 사슬의 단면 중심선을 따라간다.
  - 6 mm 간격 object_local 점을 만들고, `checkPathGeometryAsync`로 검사한다(표본 80개).
  - 메시 밖 표본이 0이면 `GEOMETRY_CHECKED`, 아니면 `APPROXIMATE`(이유를 notes에 적음).

| 경로 | 길이 | 상태 | 메시 밖 비율 |
|---|---|---|---|
| cv.pv_ri_to_la 오른아래폐정맥 → 좌심방 | 10.4 cm | APPROXIMATE | 0.136 (폐 안 끝부분) |
| cv.pv_ls_to_la 왼위폐정맥 → 좌심방 | 7.5 cm | APPROXIMATE | 0.012 (정맥 끝 ↔ 좌심방 Anchor 사이) |
| cv.pv_li_to_la 왼아래폐정맥 → 좌심방 | 9.8 cm | APPROXIMATE | 0.025 (시작점) |
| cv.arch_to_r_carotid 팔머리동맥 → 오른온목동맥 | 8.3 cm | GEOMETRY_CHECKED | 0 |
| cv.bca_to_r_arm 빗장밑 → 겨드랑 → 위팔동맥 | 45.2 cm | GEOMETRY_CHECKED | 0 |
| cv.arch_to_l_carotid 왼온목동맥 | 6.7 cm | GEOMETRY_CHECKED | 0 |
| cv.arch_to_l_subclavian 왼빗장밑동맥 | 10.4 cm | GEOMETRY_CHECKED | 0 |
| cv.aorta_to_r_leg 온엉덩 → 바깥엉덩 → 넙다리동맥 | 57.5 cm | GEOMETRY_CHECKED | 0 |
| cv.r_arm_vein_to_svc 자쪽피부 → 겨드랑 → 빗장밑 → 팔머리정맥 (→ 상대정맥) | 71.6 cm | GEOMETRY_CHECKED | 0 |
| cv.r_ij_to_svc 오른속목 → 팔머리정맥 (→ 상대정맥) | 8.8 cm | APPROXIMATE | 0.012 (시작점) |
| cv.l_bcv_to_svc 왼팔머리정맥 (→ 상대정맥) | 6.5 cm | GEOMETRY_CHECKED | 0 |
| cv.r_leg_vein_to_ivc 넙다리 → 바깥엉덩 → 온엉덩정맥 (→ 하대정맥, 하대정맥 연장) | 55.0 cm | GEOMETRY_CHECKED | 0 |
| cv.l_iliac_vein_to_ivc 왼온엉덩정맥 (→ 하대정맥) | 7.9 cm | GEOMETRY_CHECKED | 0 |

- 정리: 내강 기하 검사 통과(`GEOMETRY_CHECKED`) 9개, 근사(`APPROXIMATE`) 4개다. 기존 학습용 경로 9개는 그대로다.
- 폐정맥: 메시에 폐 안 가지가 모두 들어 있다. 그래서 04-A와 같이 좌심방 쪽에서 7 cm까지만 따라간 뒤 뒤집었다. 이제 폐정맥 4개 모두 경로가 있다.
- 대표 말초정맥: 자쪽피부정맥(팔)과 넙다리정맥(다리)을 골랐다.
- **고친 문제**
  - 처음에는 가지 경로를 `paths.json`에 넣었다. 그러자 Play가 불러오지 않은 자산을 가리키는 점마다 "없는 객체" 오류를 약 490개 냈다.
    - 가지 경로를 `paths-branches.json`으로 나눴다.
    - Explorer 개발자 모드만 필요한 자산(`requires_assets`)을 불러온 뒤 경로를 더한다.
    - 고친 뒤 Play는 경로 9개에 오류 0개, Explorer 개발자 모드는 경로 22개에 검증 오류 0개, 길이 0인 경로 0개였다.
  - `anatomy-manager.ensureAsset`이 지연 로딩한 자산에 레이어 표시 상태를 적용하지 않아, 꺼진 레이어의 혈관이 보였다. 불러온 뒤 `apply()`를 부르도록 고쳤다.
  - 수신기: 브라우저에서 만든 JSON을 저장하려고 localhost 전용 수신기(`tools/validation/receive_json.py`, 127.0.0.1:8774, `tools/out/browser/`에만 씀)를 개발 도구로 추가했다.

## 9. 자체 제작 미세 구조 (CONCEPTUAL)
- 만든 도구: `tools/blender/make_micro_concepts.py`
- 애니메이션: `content/animations/micro-concepts.json`(생성기 `tools/content/make_micro_anim.py`)

| 모델 | 구성 | 크기 | 동작(실행 확인) |
|---|---|---|---|
| `assets/micro/alveolus-concept.glb` | 폐포 7개 + 폐포관 주머니(한 사분면을 잘라 봄), 폐포 벽, 모세혈관 그물(폐포 바깥 이웃 점 연결), 들어오는 세동맥·나가는 세정맥, 교환 부위 확대판(폐포 공기 / 상피 / 기저막 / 내피 / 혈장 + 적혈구), 적혈구, O₂·CO₂ | 54 메시, 27,616 삼각형, 689,904 B | `gas_exchange`·`rbc_flow` 반복 클립 재생. 확대판 O₂는 공기 → 혈장, CO₂는 반대로 움직임 |
| `assets/micro/tissue-capillary-concept.glb` | 세동맥 + 민무늬근 고리 6개, 모세혈관 5줄 + 가로 연결, 세정맥, 조직 세포 + 핵, 적혈구, O₂(파랑)·영양소(초록) → 세포, CO₂(주황)·노폐물(보라) → 혈관 | 85 메시, 16,652 삼각형, 514,616 B | `rbc_flow`·`tissue_exchange` 반복 재생, 적혈구가 세동맥에서 모세혈관으로 이동 |
| `assets/micro/vessel-wall-concept.glb` | 동맥 벽 270° 단면: 내막, 내탄력판, 중막(반투명) + 민무늬근 세포(한 메시), 외탄력판, 외막, 영양혈관, 내강 | 8 메시, 46,648 삼각형, 1,905,060 B | Shape Key `constrict`·`dilate`, 상태 BASELINE ↔ VASOCONSTRICTION ↔ VASODILATION 모두 completed |

- 혈관 벽 수축·확장 값(교육용)
  - 수축: 내강 반지름 0.30 → 0.20, 중막 0.17 → 0.24로 두꺼워짐
  - 확장: 내강 0.30 → 0.40, 중막 0.17 → 0.11로 얇아짐
- 고친 문제
  - 혈관 벽 파일이 11.9 MB였다. 원인은 민무늬근 세포 380개가 각각 메시이고, 평면 음영으로 정점이 중복되고, Morph 법선까지 들어간 것이다. 한 메시로 합치고 부드러운 음영을 쓰고 Morph 법선을 뺐더니 1.9 MB가 되었다.
  - 조직 모델의 Skin 고리가 큰 원통이 되어 토러스로 바꿨다.
  - 폐포 모세혈관이 벽 뒤에 가려 있어, 앞쪽 절반이 아니라 한 사분면만 잘랐다.
- 렌더: `docs/development/img/micro-alveolus.jpg`, `micro-tissue-capillary.jpg`, `micro-vessel-wall-tone.jpg`(수축 / 기본 / 확장)
- 장면: Sandbox MA·MB·MC
- **아직 하지 않은 것:** Play의 미세 장면(`content/micro/*.json`, `js/scale/micro-scene.js`)은 여전히 04-A의 단순 도형을 쓴다. 새 GLB를 학습 흐름에 연결하는 일은 하지 않았다(15번).

## 10. STEP 04-C 준비 모델
- BodyParts3D: `assets/anatomy/regulation/`, 사양 `specs/regulation-prep.json`

| 파일 | 구조 | 삼각형 | 크기 |
|---|---|---|---|
| medulla-spinal-cord.glb | 숨뇌, 척수(**일부**) | 12,824 | 244,848 B |
| kidneys-adrenals.glb | 좌·우 콩팥, 좌·우 부신 | 11,582 | 213,028 B |
| diaphragm.glb | 가로막 | 68,522 | 1,265,116 B |
| pancreas.glb | 이자 | 4,890 | 89,748 B |
| internal-carotid.glb | 오른속목동맥(목동맥팽대 위치 표시용) | 1,272 | 24,632 B |

- 온목동맥과 대동맥활은 `systemic-vessels.glb`와 `aorta.glb`에 있다.
- Z-Anatomy(별도 CC BY-SA 파일): 갑상샘, 좌·우 미주신경, 좌·우 교감신경줄기와 신경절
- 데이터: `content/anatomy/regulation/prep-04c.json`(생성기 `tools/content/make_prep_04c.py`)
  - 구조 21개: MODEL 10, PARTIAL 1, Z-ANATOMY_SA 4, ANCHOR_ONLY 3, MISSING 3
  - Anchor 10개: GEOMETRY_DERIVED 4, APPROXIMATE 4, CONCEPTUAL 2
  - 교육용 신호 경로 4개(CONCEPTUAL): 목동맥팽대 → 숨뇌, 대동맥활 → 숨뇌, 숨뇌 → 미주신경 → 심장, 숨뇌 → 척수 → 심장. 모두 신경 주행을 따르지 않는 표시용 선이다.
  - **압력반사·RAAS 게임 로직은 만들지 않았다.**
- Sandbox **RP**: 9개 자산을 함께 불러오고 출처 표기를 보여 준다(BodyParts3D + Z-Anatomy CC BY-SA). 콘솔 오류 0개.
- 발견한 모델 공백
  - BodyParts3D 오른온목동맥 element는 y 1.373 m에서 끝나고, 속목동맥은 y 1.435 m에서 시작한다. **약 6 cm가 비어 있다.** 갈림 부위와 목동맥팽대 자리에 모델이 없다. 그래서 목동맥팽대 Anchor는 속목동맥 시작부의 근사 위치(APPROXIMATE)다.
  - BodyParts3D "spinal cord" element(FMA7647)는 숨뇌 아래 3.5 cm, 폭 2 mm뿐이다. 척수 전체가 없다. 가슴 척수 Anchor는 Z-Anatomy 척수 경계 상자로 위치만 근사했다.

## 11. 출처 및 라이선스 관리 결과
- `docs/references/asset_registry.csv`: 31행 36열
  - 새 열: `source_category`(BodyParts3D / Z-Anatomy / OrganUI / Other public / Self-made), `source_version`, `animation`, `rig`, `technical_status`, `anatomy_review_status`, `deployable`, `license_file`, `sha256`
  - 도구: `tools/asset-processing/registry_extend.py`. 파이프라인 밖 자산의 meta.json과 대장 행을 GLB에서 읽어 만든다.
  - `bp3d_build.py register`가 실제 트리(IS-A / PART-OF)와 ZIP을 적도록 고쳤다. 기존 BodyParts3D 행 9개의 meta.json은 바뀌지 않았다.
- 라이선스 문서
  - `assets/licenses/bodyparts3d.md`: IS-A 트리 사용, 새 사양, 형태를 바꾼 파생 2개(영역 분할, 판막 리깅)의 변경 표시를 더했다.
  - `assets/licenses/z-anatomy.md`(새 문서): CC BY-SA 4.0 출처 표기, Dundee 뇌신경(CC BY 4.0) 포함 가능성, NC 모델 제외, 쓴 객체 7개, 평행 이동, 정렬 검사, 별도 파일이라는 점을 적었다.
  - `assets/licenses/nf-micro-concept.md`: GLB 3종과 단순화한 점을 더했다.
- 화면 출처 표기
  - BodyParts3D·Z-Anatomy 자산을 쓰는 Sandbox 장면에는 모두 `credits`가 있다(HC·HV·RP를 새로 추가, 테스트로 확인).
  - RP 장면 출처에는 CC-BY-SA를 함께 적는다.
- 지킨 원칙
  - 라이선스가 다른 모델을 한 파생 메시·GLB로 합치지 않았다.
  - 출처별 GLB를 따로 관리했다.
  - NC 모델(Inner Ear, Kidney by Lissie Cowley)과 라이선스 불명 모델(White matter 계열)은 쓰지 않았다.
  - BLEND 파일은 내장 스크립트 자동 실행을 끄고 열었다.
  - 원본(`raw-models/`)은 Git 제외다.
- 대장의 `deployable`: YES 26행, NO 5행
  - 원본 아카이브 3개(BodyParts3D IS-A·PART-OF, Z-Anatomy), DamagedHelmet(NC), OrganUI(사용 안 함)
  - 배포 가능 행은 모두 라이선스 파일이 있다(테스트로 확인).

## 12. 실제 모델 용량 및 삼각형 수 (이번 단계 새 파일, GLB에서 직접 셈)

| 파일 | 메시 | 삼각형 | bytes |
|---|---|---|---|
| cardiovascular/heart-v2.glb | 21 | 140,244 | 2,806,272 |
| cardiovascular/heart-v2-ventricle-regions.glb | 3 | 37,442 | 1,332,368 |
| cardiovascular/heart-v2-valves-rig.glb | 16 | 38,792 | 1,318,848 |
| cardiovascular/systemic-vessels.glb | 22 | 85,732 | 1,577,564 |
| regulation/medulla-spinal-cord.glb | 2 | 12,824 | 244,848 |
| regulation/kidneys-adrenals.glb | 4 | 11,582 | 213,028 |
| regulation/diaphragm.glb | 1 | 68,522 | 1,265,116 |
| regulation/pancreas.glb | 1 | 4,890 | 89,748 |
| regulation/internal-carotid.glb | 1 | 1,272 | 24,632 |
| regulation/za-nerves-thyroid.glb (CC BY-SA) | 7 | 164,440 | 3,727,116 |
| micro/alveolus-concept.glb | 54 | 27,616 | 689,904 |
| micro/tissue-capillary-concept.glb | 85 | 16,652 | 514,616 |
| micro/vessel-wall-concept.glb | 8 | 46,648 | 1,905,060 |
| **합계** | | **656,656** | **15,709,120** |

- 가장 무거운 것은 Z-Anatomy 신경(미주신경 곡선 관 메시)이다. 필요하면 관 해상도를 낮출 수 있다.
- **FPS와 로딩 시간은 측정하지 않았다(NOT TESTED).** 브라우저 창이 숨겨진 상태라 측정값을 믿을 수 없었다.
- GPU 리소스: Sandbox에서 A → HV → MC → RP → HC → MA → A를 3번 돌았다.
  - 장면 A의 geometry는 6에서 처음 한 번만 7이 되고, 이후 7로 고정이었다. 공유 Actor geometry가 남는 것으로, 누적되지 않는다.
  - texture는 0이었다. HV의 Morph 텍스처 19개는 장면을 떠날 때 해제되었다.

## 13. 기존 테스트 재실행 결과 (실제 실행)

| 테스트 | 결과 |
|---|---|
| tests/test_sandbox3d.py | 38/38 통과 |
| tests/test_scene_commands.py | 30/30 통과 |
| tests/test_engine.py | 70/70 통과 |
| tests/test_motion_commands.py | 37/37 통과 |
| tests/test_lesson.py | 63/63 통과 |
| tests/test_cardiac_cycle.py | 27/27 통과 |
| tools/asset-processing/test_bp3d_tools.py | 13/13 통과 |
| **tools/asset-processing/test_asset_upgrade.py (새)** | **42/42 통과**: GLB 구성·기본 가중치, 경로 상태 규칙(GEOMETRY_CHECKED ⇔ 메시 밖 0), 학습용 경로 분리, 판막 through, 04-C 데이터에 게임 로직 없음, 대장·라이선스 파일·출처 표기, 검색(FJ2428, 중격 없음, myocardium 동의어) |
| tests/animation-tests.html (브라우저) | 26/26 통과 |
| tests/motion-tests.html (브라우저) | 32/32 통과 |
| Play 실행 | 콘솔 오류 0, 경로 9개, 로그 오류 0 |
| Explorer 개발자 모드 | 경로 22개, 검증 오류 0, 길이 0 경로 0, 콘솔 오류 0 |
| Sandbox HC·HV·MA·MB·MC·RP | 모두 불러옴, 콘솔 오류 0 |

- **NOT TESTED**
  - 실제 모바일 기기
  - FPS와 로딩 시간
  - 배포된 Pages(커밋 전)
  - 화면에서 애니메이션을 눈으로 따라간 확인(창이 숨겨져 있었음)
  - 추론 모드
  - Python Worker 변경 없음 → `WORKER_VERSION` 그대로(04b-1)

## 14. 미확보 구조
| 구조 | 상태 | 대신 쓴 것 |
|---|---|---|
| 심실중격(독립 메시) | BodyParts3D·Z-Anatomy 모두 없음 | 기하 분할 영역(GEOMETRY_DERIVED) |
| 전도계(동방결절·방실결절·히스다발) | 둘 다 없음 | 동방결절 위치 표시 Anchor(CONCEPTUAL) |
| 판륜(annulus) 독립 메시 | 이름 검색 0건 | 첨판 부착부 고정(가중치 0) |
| 목동맥팽대·갈림 부위 | 온목동맥과 속목동맥 사이 약 6 cm 공백 | Anchor(APPROXIMATE) |
| 척수 전체 | BodyParts3D는 3.5 cm 조각, Z-Anatomy 척수는 출처 확인 전 | Anchor(APPROXIMATE) |
| 혀인두신경 | 없음 | 교육용 경로(CONCEPTUAL) |
| 사구체곁장치 | 미세 구조, 없음 | 없음(필요하면 개념 장면) |
| 폐 실질(폐포 조직) | BodyParts3D 폐엽은 기관지·혈관만, Z-Anatomy는 폐엽 표면 | 폐포 개념 모델(CONCEPTUAL) |
| 림프절 | BodyParts3D 없음, Z-Anatomy 일부 있음 | 이번 범위에서 쓰지 않음 |
| 왼팔·왼다리 혈관 | 모델은 있음 | 대칭이라 오른쪽만 넣음 |

- 검색에서 "없음"과 "모델 없음"을 구분한 예
  - "chordae tendineae"는 이름 검색 0건이지만, 방실판막 첨판 element 안에 형상이 있다.
  - "sympathetic trunk"와 "lung parenchyma"는 MODEL_PRESENT로 나오지만, 실제로는 부교감 신경절과 기관지·혈관 가지가 걸린 것이다.
  - 검색 결과의 `matched_by`와 형상을 확인해야 한다(`tools/out/bp3d_reaudit_04b_plus.json`, 42개 질의: MODEL_PRESENT 35, NO_MATCH 7).

## 15. 기술적으로 구현되지 않은 기능
- **GLB 클립의 끝 모양 유지:** 클립이 끝나면 Three.js Mixer가 원래 값으로 되돌린다. 판막과 혈관 긴장도 상태는 Morph 애니메이션으로 유지한다. 클립은 반복 장식(미세 모델)과 확인용으로만 쓴다.
- **판막 첨판의 실제 변형:** 접힘, 접합, 혈류 압력에 따른 변형은 만들지 않았다. 경첩 회전 근사다.
- **심실 벽 수축 때 영역 이음매:** 영역마다 따로 움직여 경계가 벌어질 수 있다. 정점 공유나 경계 블렌딩은 하지 않았다.
- **새 미세 모델을 Play 학습 흐름에 연결:** 하지 않았다(Sandbox에서만 사용).
- **가지 혈관 경로를 학습 콘텐츠(lesson)에 연결:** 하지 않았다. Explorer 개발자 모드 데이터다.
- **04-C 준비 데이터를 엔진이 불러오는 기능:** 데이터 파일만 만들었다. 엔진·Python 연결은 04-C에서 한다.
- **Z-Anatomy 심실 벽 GLB, 폐엽, 림프:** 만들지 않았다.
- **heart-v2를 Explorer·Play 기본 심장으로 바꾸기:** 하지 않았다. 기존 heart.glb와 경로·Anchor가 그대로다.

## 16. 전문가 검토가 필요한 항목
1. 심실 벽 영역 경계(중격 영역 12%)가 해부학적 중격과 얼마나 맞는지
2. 판막 열림 모양: 방실판막 30° + 5 mm, 반월판 55°. BodyParts3D 첨판이 닫힌 모양이라는 가정
3. 유두근 이완(+10%)과 수축의 방향, 판막 상태와의 연결
4. 가지 혈관 경로 13개의 중심선(특히 APPROXIMATE 4개, 이음부)
5. 새 구조 22개의 한국어 이름(강의자료 대조 전)
6. Z-Anatomy 정렬: 미주신경과 온목동맥 거리 12.6 mm가 목동맥집 안 위치로 타당한지
7. 04-C Anchor 위치: 목동맥팽대, 대동맥활 압력수용체, 동방결절 표시, 가슴 척수
8. 교육용 신호 경로 4개의 내용: 대동맥 압력수용체 → 미주신경 등. 강의자료 대조 전이다.
9. 미세 모델: 폐포·모세혈관 배치, 교환 부위 층 순서, 혈관 벽 층 순서와 수축·확장 표현
10. 심실 수축 비율(좌 12%, 우 15%, 중격 5%)과 표현 방식

## 17. STEP 04-C 진행 가능 여부
**진행 가능하다(조건부).**
- 갖춘 것
  - 혈압 조절 기전에 필요한 구조의 모델이나 위치 표시: 숨뇌, 온목동맥, 대동맥활, 심장, 콩팥·부신, 미주신경·교감신경줄기
  - 상태를 보여 줄 수단
    - 판막 상태(엔진 연결 완료)
    - 심실 벽 영역 수축
    - 혈관 수축·확장 단면 모델(BASELINE / VASOCONSTRICTION / VASODILATION 상태 구조)
  - 기존 엔진(애니메이션, 타임라인, 상태, 이동)이 이 자산들로 동작하는 것을 확인했다.
- 04-C를 시작하기 전에 정할 것
  1. 목동맥팽대·동방결절·척수는 Anchor와 개념 표시뿐이다. 이것을 화면에서 "위치 표시"로만 설명하기로 할지
  2. Play 미세 장면을 새 GLB로 바꿀지
  3. heart-v2를 Play 심장으로 쓸지. 쓴다면 경로와 Anchor를 다시 만들어야 한다.
- 전문가 검토 항목(16번)은 04-C 진행을 막지 않는다. 다만 화면 문구는 "교육용 근사"로 유지해야 한다.
