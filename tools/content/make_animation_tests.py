# STEP 04-B 시험 장면 애니메이션 데이터 생성 (개발 도구)
import json, math
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'animations') + os.sep
def save(name, doc):
    open(OUT + name, 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')

# A — Basic: 기본 도형 Transform Keyframe + GLB 내장 클립
save('test-basic.json', {
 'version': 1, 'scene_id': 'anim_a', 'verification_status': 'TEST',
 'description': 'Animation Test A: 위치·회전·크기 Keyframe과 GLB 내장 AnimationClip(Spin, Inflate, Flap) 재생',
 'units': {'time': 'ms', 'position': 'm', 'rotation': 'deg'},
 'animations': [
  {'animation_id': 'a.cube_path', 'target_id': 'anim_cube', 'animation_type': 'transform', 'duration_ms': 2400, 'loop': False, 'easing': 'ease_in_out',
   'keyframes': [{'time': 0, 'value': {'position': [-1.2, 0.3, 0], 'rotation': [0, 0, 0], 'scale': 1}},
                 {'time': 0.5, 'value': {'position': [-1.2, 1.0, 0], 'rotation': [0, 180, 0], 'scale': 1.5}},
                 {'time': 1, 'value': {'position': [-1.2, 0.3, 0], 'rotation': [0, 360, 0], 'scale': 1}}],
   'restore_on_cancel': True, 'verification_status': 'TEST'},
  {'animation_id': 'a.glb_spin', 'target_id': 'nf-anim-test', 'animation_type': 'clip', 'clip_name': 'Spin', 'loop': True, 'verification_status': 'TEST'},
  {'animation_id': 'a.glb_inflate', 'target_id': 'nf-anim-test', 'animation_type': 'clip', 'clip_name': 'Inflate', 'loop': True, 'verification_status': 'TEST'},
  {'animation_id': 'a.glb_flap', 'target_id': 'nf-anim-test', 'animation_type': 'clip', 'clip_name': 'Flap', 'loop': True, 'verification_status': 'TEST'},
 ]})

# B — Morph: 팽창 구, 수축·이완 장기, 두 상태 조직, 변형을 따라가는 점
save('test-morph.json', {
 'version': 1, 'scene_id': 'anim_b', 'verification_status': 'TEST',
 'description': 'Animation Test B: Morph Target 형태 전환·혼합·복원, 모델 전환(Crossfade), 변형된 모델 위 경로 점(mesh_vertex)',
 'units': {'time': 'ms', 'morph': '0~1'},
 'groups': [{'group_id': 'test.morph', 'name_ko': 'Morph 시험 모델', 'origin': [0, 0, 0], 'backdrop': None, 'verification_status': 'TEST', 'objects': [
   {'id': 'morph_sphere', 'name_ko': '팽창하는 구 (시험)', 'shape': 'sphere', 'radius': 0.35, 'center': [-1.0, 0.6, 0], 'color': '#f5a00a',
    'morphs': {'inflate': {'scale': [1.4, 1.4, 1.4]}, 'stretch': {'scale': [0.75, 1.5, 0.75]}}},
   {'id': 'organ_blob', 'name_ko': '수축·이완하는 교육용 장기 (시험)', 'shape': 'ellipsoid', 'radius': [0.35, 0.45, 0.3], 'center': [0.2, 0.6, 0], 'color': '#cc6f6f',
    'morphs': {'contract': {'scale': [0.7, 0.85, 0.7]}}},
   {'id': 'tissue_normal', 'name_ko': '조직 상태 A (시험)', 'shape': 'box', 'size': [0.5, 0.25, 0.5], 'center': [1.3, 0.4, 0], 'color': '#d9a3b5'},
   {'id': 'tissue_changed', 'name_ko': '조직 상태 B (시험)', 'shape': 'ellipsoid', 'radius': [0.3, 0.2, 0.3], 'center': [1.3, 0.45, 0], 'color': '#8e4ec6'}]}],
 'animations': [
  {'animation_id': 'b.inflate', 'target_id': 'morph_sphere', 'animation_type': 'morph', 'morph_target': 'inflate', 'duration_ms': 1200, 'easing': 'ease_in_out',
   'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}], 'restore_on_cancel': True, 'verification_status': 'TEST'},
  {'animation_id': 'b.mix', 'target_id': 'morph_sphere', 'animation_type': 'morph', 'duration_ms': 1600,
   'keyframes': [{'time': 0, 'value': {'inflate': 0, 'stretch': 0}}, {'time': 0.5, 'value': {'inflate': 0.6, 'stretch': 0.0}}, {'time': 1, 'value': {'inflate': 0.3, 'stretch': 0.8}}],
   'restore_on_cancel': True, 'verification_status': 'TEST', 'notes': '두 Morph Target 혼합'},
  {'animation_id': 'b.organ_beat', 'target_id': 'organ_blob', 'animation_type': 'procedural', 'procedure': 'morph_cycle', 'morph_target': 'contract', 'duration_ms': 1000,
   'params': {'period_ms': 1000, 'min': 0, 'max': 1}, 'loop': True, 'verification_status': 'TEST'},
  {'animation_id': 'b.organ_contract', 'target_id': 'organ_blob', 'animation_type': 'morph', 'morph_target': 'contract', 'duration_ms': 800,
   'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}], 'verification_status': 'TEST'},
  {'animation_id': 'b.tissue_glow', 'target_id': 'tissue_normal', 'animation_type': 'material', 'duration_ms': 1000,
   'keyframes': [{'time': 0, 'value': {'color': '#d9a3b5'}}, {'time': 1, 'value': {'color': '#e5484d'}}], 'restore_on_cancel': True,
   'verification_status': 'TEST', 'notes': '상태 표시 색(교육용). 실제 조직 색 아님'}],
 'transitions': [{'logical_id': 'test.tissue', 'variants': {'A': 'tissue_normal', 'B': 'tissue_changed'}, 'initial': 'A'}],
 'motion': {'scene_id': 'anim_b', 'marker_size': 0.03, 'paths': [
   {'path_id': 'b.vertex_path', 'name_ko': '변형을 따라가는 점 시험', 'curve_type': 'linear', 'verification_status': 'TEST_PATH',
    'points': [{'space': 'scene', 'position': [0.2, 1.6, 0]}, {'space': 'mesh_vertex', 'object_id': 'organ_blob', 'vertex_index': 0}],
    'notes': '두 번째 점은 organ_blob의 정점 0(위 꼭짓점). Morph로 장기가 줄면 경로 끝이 따라 내려온다.'}], 'actors': []}})

# C — Timeline: 순차·병렬·반복·Blocking/Non-blocking
spheres = [{'id': f'tl_{c}', 'name_ko': f'시험 구 {c.upper()}', 'shape': 'sphere', 'radius': 0.22, 'center': [x, 0.5, 0], 'color': col,
            'morphs': {'inflate': {'scale': [1.5, 1.5, 1.5]}}} for c, x, col in [('a', -1.0, '#e5484d'), ('b', 0.0, '#46a758'), ('c', 1.0, '#2f6fde')]]
def pop(c): return {'animation_id': f'c.pop_{c}', 'target_id': f'tl_{c}', 'animation_type': 'morph', 'morph_target': 'inflate', 'duration_ms': 600,
                    'keyframes': [{'time': 0, 'value': 0}, {'time': 0.5, 'value': 1}, {'time': 1, 'value': 0}], 'verification_status': 'TEST'}
save('test-timeline.json', {
 'version': 1, 'scene_id': 'anim_c', 'verification_status': 'TEST',
 'description': 'Animation Test C: 순차·병렬·반복·지연 타임라인, Blocking과 Non-blocking 구분',
 'groups': [{'group_id': 'test.timeline', 'name_ko': '타임라인 시험 모델', 'origin': [0, 0, 0], 'backdrop': None, 'verification_status': 'TEST', 'objects': spheres}],
 'animations': [pop('a'), pop('b'), pop('c'),
   {'animation_id': 'c.decor_spin', 'target_id': 'tl_b', 'animation_type': 'procedural', 'procedure': 'pulse', 'duration_ms': 500,
    'params': {'period_ms': 500, 'amplitude': 0.15}, 'loop': True, 'verification_status': 'TEST', 'notes': '끝나지 않는 장식 애니메이션'}],
 'timelines': [
   {'timeline_id': 'c.sequence', 'blocking': True, 'steps': [{'type': 'animation', 'animation_id': 'c.pop_a'}, {'type': 'animation', 'animation_id': 'c.pop_b'}, {'type': 'animation', 'animation_id': 'c.pop_c'}]},
   {'timeline_id': 'c.parallel', 'blocking': True, 'steps': [{'type': 'parallel', 'steps': [{'type': 'animation', 'animation_id': 'c.pop_a'}, {'type': 'animation', 'animation_id': 'c.pop_b'}, {'type': 'animation', 'animation_id': 'c.pop_c'}]}]},
   {'timeline_id': 'c.repeat_delay', 'blocking': True, 'steps': [{'type': 'repeat', 'count': 3, 'steps': [{'type': 'animation', 'animation_id': 'c.pop_a'}, {'type': 'delay', 'ms': 200}]}]},
   {'timeline_id': 'c.blocking_with_decor', 'blocking': True, 'steps': [
     {'type': 'animation', 'animation_id': 'c.decor_spin', 'wait': False},
     {'type': 'marker', 'name': 'decor_started'},
     {'type': 'animation', 'animation_id': 'c.pop_c'},
     {'type': 'marker', 'name': 'blocking_done'}]}]})

# E — Vessel: 혈관 수축·확장 (중심선 유지)
VP = [[-1.6, 0.6, 0], [-0.8, 0.75, 0.1], [0.0, 0.6, 0], [0.8, 0.45, -0.1], [1.6, 0.6, 0]]
save('test-vessel.json', {
 'version': 1, 'scene_id': 'anim_e', 'verification_status': 'TEST',
 'description': 'Animation Test E: 혈관 내강 지름 변화(BASELINE / VASOCONSTRICTION / VASODILATION). 중심선과 길이는 그대로 두고 반지름만 바꾼다. 배율은 교육용 값.',
 'units': {'time': 'ms', 'radius_scale': '배 (1 = 기준)'},
 'groups': [{'group_id': 'test.vessel', 'name_ko': '혈관 변형 시험 모델', 'origin': [0, 0, 0], 'backdrop': None, 'verification_status': 'TEST', 'objects': [
   {'id': 'vessel_test', 'name_ko': '교육용 혈관 (시험)', 'shape': 'tube', 'points': VP, 'radius': 0.16, 'color': '#c05a5a', 'opacity': 0.45}]}],
 'animations': [
   {'animation_id': 'e.constrict', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 900, 'easing': 'ease_in_out',
    'keyframes': [{'time': 0, 'value': 1.0}, {'time': 1, 'value': 0.6}], 'verification_status': 'TEST', 'notes': '수축 배율 0.6은 교육용 값'},
   {'animation_id': 'e.dilate', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 900, 'easing': 'ease_in_out',
    'keyframes': [{'time': 0, 'value': 1.0}, {'time': 1, 'value': 1.35}], 'verification_status': 'TEST', 'notes': '확장 배율 1.35는 교육용 값'},
   {'animation_id': 'e.c_to_base', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 900, 'keyframes': [{'time': 0, 'value': 0.6}, {'time': 1, 'value': 1.0}], 'verification_status': 'TEST'},
   {'animation_id': 'e.d_to_base', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 900, 'keyframes': [{'time': 0, 'value': 1.35}, {'time': 1, 'value': 1.0}], 'verification_status': 'TEST'},
   {'animation_id': 'e.c_to_d', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 1200, 'keyframes': [{'time': 0, 'value': 0.6}, {'time': 1, 'value': 1.35}], 'verification_status': 'TEST'},
   {'animation_id': 'e.d_to_c', 'target_id': 'vessel_test', 'animation_type': 'deform', 'duration_ms': 1200, 'keyframes': [{'time': 0, 'value': 1.35}, {'time': 1, 'value': 0.6}], 'verification_status': 'TEST'}],
 'structures': [{'structure_id': 'vessel.test_tone', 'name_ko': '혈관 긴장도 (시험)', 'kind': 'vessel', 'states': ['BASELINE', 'VASOCONSTRICTION', 'VASODILATION'], 'initial': 'BASELINE',
   'transitions': {'BASELINE->VASOCONSTRICTION': {'animation': 'e.constrict'}, 'BASELINE->VASODILATION': {'animation': 'e.dilate'},
                   'VASOCONSTRICTION->BASELINE': {'animation': 'e.c_to_base'}, 'VASODILATION->BASELINE': {'animation': 'e.d_to_base'},
                   'VASOCONSTRICTION->VASODILATION': {'animation': 'e.c_to_d'}, 'VASODILATION->VASOCONSTRICTION': {'animation': 'e.d_to_c'}},
   'verification_status': 'TEST'}],
 'motion': {'scene_id': 'anim_e', 'marker_size': 0.03, 'follow': {'distance': 0.8, 'height': 0.3, 'side': 0.3, 'smooth': 5}, 'paths': [
   {'path_id': 'e.centerline', 'name_ko': '혈관 중심선 (시험)', 'curve_type': 'catmull_rom', 'closed': False, 'verification_status': 'TEST_PATH',
    'points': [{'space': 'scene', 'position': p} for p in VP], 'checkpoints': [{'checkpoint_id': 'cp.e.end', 'path_progress': 1, 'stop_on_arrival': True}],
    'notes': '관을 만든 점과 같은 중심선. 지름이 바뀌어도 경로는 그대로다.'}],
   'actors': [{'actor_id': 'rbc_vessel', 'actor_type': 'red_blood_cell', 'model_id': 'rbc', 'display_size': 0.1, 'path_id': 'e.centerline', 'speed': 0.35, 'rotation_mode': 'tangent',
               'biological_state': {'oxygenation': 'oxygenated'}}]}})
print('ok')
