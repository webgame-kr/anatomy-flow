# Z-Anatomy 파생 모델 (CC BY-SA 4.0) — `assets/anatomy/regulation/za-nerves-thyroid.glb`

**출처 표기**
> Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0 (https://www.z-anatomy.com, https://github.com/Z-Anatomy)
> Z-Anatomy는 다음을 포함·참고한다: BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan,
> "Cranial Nerves and Foramina - by University of Dundee, CAHID - CC-BY 4.0"

- **라이선스:** [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
  - 이 파일(파생물)도 **CC BY-SA 4.0**으로 배포한다. 이 저장소의 다른 파일(코드, BodyParts3D CC BY 4.0 모델, 직접 만든 모델)의 라이선스는 바뀌지 않는다. 서로 다른 라이선스 모델을 하나의 메시·GLB로 합치지 않았다(별도 파일, 장면에서 함께 표시만 한다).
- **원본:** `Z-Anatomy.zip` (86,734,957 bytes, sha256 `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`) 안의 `Startup.blend`. 원본은 `raw-models/z-anatomy/`(Git 제외)에만 둔다.
- **쓴 객체 (7개):** `Thyroid gland`, `Vagus nerve (X).l`, `Vagus nerve (X).r`, `Sympathetic trunk.l`, `Sympathetic trunk.r`, `Ganglia of sympathetic trunk.l`, `Ganglia of sympathetic trunk.r`
- **쓰지 않은 것 (NC 조건):** Inner Ear(University of Dundee, CC BY-NC-SA 4.0), Kidney(Lissie Cowley, CC BY-NC 4.0). 콩팥은 BodyParts3D(CC BY 4.0) 모델을 쓴다.
- **미주신경 출처 메모:** Z-Anatomy Readme는 뇌신경 모델에 University of Dundee "Cranial Nerves and Foramina"(CC BY 4.0)를 참고·포함했다고 적는다. 미주신경 곡선이 그 자료에서 왔는지 객체 단위로 확인하지 못해, 위 출처 표기에 함께 적었다. CC BY 4.0은 CC BY-SA 4.0 파생물에 포함할 수 있다.

## 수정 내역 (변경 표시)
- `tools/blender/za_extract_regulation.py`로 만들었다. Blender를 `--disable-autoexec`(내장 스크립트 자동 실행 끔)로 열었다.
- 수정자(Mirror, Solidify, Subdivision)를 적용한 평가 메시를 썼다. 신경 곡선은 원본 굵기(bevel 0.5 mm)를 그대로 관 메시로 바꿨다.
- 위치: Z-Anatomy 좌표에서 T = (+0.0013, +0.0975, +0.0643) m(Blender Z-up)를 뺐다. STEP 04-B+에서 Z-Anatomy 심장과 BodyParts3D 심장을 비교해 잰 평행 이동이다. **Z-Anatomy 좌표가 BodyParts3D와 같다고 가정하지 않았다.**
  - 정렬 확인: 오른미주신경(옮긴 뒤)과 BodyParts3D 오른온목동맥 표면 사이 거리 중앙값 12.6 mm(9.4~15.8 mm, 목 부위 276점). 기하 근거일 뿐 해부학 검증이 아니다.
- glTF 내보내기에서 Z-up → Y-up을 한 번 바꿨다(다른 자산과 같은 장면 좌표).
- 교육용 재질 색(갑상샘 적갈색, 미주신경 노랑, 교감신경줄기·신경절 초록)을 새로 지정했다.

## 의학적 검증
전문가가 검증한 모델이 아니다. 신경의 굵기는 원본 표시값이며 실제 굵기가 아니다.
