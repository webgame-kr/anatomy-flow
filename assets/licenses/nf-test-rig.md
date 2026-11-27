# nf-test-rig.glb

- 파일: `assets/sandbox/nf-test-rig.glb` (100,964 bytes)
- 출처: 이 프로젝트에서 직접 만든 모델입니다. `tools/blender/make_test_rig.py`를 Blender 5.3.0으로 실행해 생성했습니다.
- 구성: Blender 기본 도형(정육면체, 원통, 구, 원뿔)만 사용했습니다. 외부 모델, 텍스처, 스캔 데이터는 쓰지 않았습니다.
- 라이선스: 이 저장소와 같은 조건입니다. 외부 출처 표기 의무가 없습니다.
- 용도: 엔진 테스트(Scene B)
  - 다단계 계층
  - 공유 재질(`NF_Shared_Blue`를 Mesh 4개가 사용)
  - 다중 재질 Mesh(`Badge`)
  - 같은 이름 계열 노드(`Marker`, `Marker.001`)
  - 내장 애니메이션 2개(`ArmSwing`, `ToolSpin`)
- 수정 방법: GLB를 직접 고치지 말고 스크립트를 고친 뒤 다시 생성합니다.

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup --python tools/blender/make_test_rig.py -- assets/sandbox/nf-test-rig.glb
```
