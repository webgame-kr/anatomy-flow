# 심장주기 개념 모델·애니메이션 데이터 생성 (개발 도구, 수업 범위 밖)
import json, math

O = [100.0, 0.0, 0.0]          # 장면 원점 (기관 모델에서 멀리)
def W(p): return [round(O[0] + p[0], 4), round(O[1] + p[1], 4), round(O[2] + p[2], 4)]

CH = {
  'cc.ra': {'name_ko': '우심방 (개념)', 'center': [-0.36, 0.36, 0.0], 'radius': [0.22, 0.18, 0.18], 'color': '#7d8fd6', 'contract': [0.82, 0.86, 0.82], 'logical': 'cv.right_atrium'},
  'cc.la': {'name_ko': '좌심방 (개념)', 'center': [0.36, 0.38, -0.06], 'radius': [0.21, 0.17, 0.17], 'color': '#d67d7d', 'contract': [0.82, 0.86, 0.82], 'logical': 'cv.left_atrium'},
  'cc.rv': {'name_ko': '우심실 (개념)', 'center': [-0.3, -0.26, 0.05], 'radius': [0.25, 0.32, 0.21], 'color': '#6f82cc', 'contract': [0.76, 0.86, 0.76], 'logical': 'cv.right_ventricle'},
  'cc.lv': {'name_ko': '좌심실 (개념)', 'center': [0.3, -0.27, -0.01], 'radius': [0.27, 0.35, 0.23], 'color': '#cc6f6f', 'contract': [0.76, 0.86, 0.76], 'logical': 'cv.left_ventricle'},
}
VALVES = {
  'cc.valve_tv': {'name_ko': '삼첨판 (개념, 첨판 3)', 'count': 3, 'radius': 0.085, 'center': [-0.33, 0.12, 0.02], 'normal': [0, -1, 0], 'structure': 'valve.tricuspid', 'logical': 'cv.valve.tricuspid'},
  'cc.valve_mv': {'name_ko': '승모판 (개념, 첨판 2)', 'count': 2, 'radius': 0.085, 'center': [0.33, 0.13, -0.03], 'normal': [0, -1, 0], 'structure': 'valve.mitral', 'logical': 'cv.valve.mitral'},
  'cc.valve_pv': {'name_ko': '폐동맥판 (개념, 반달 첨판 3)', 'count': 3, 'radius': 0.06, 'center': [-0.12, 0.08, 0.2], 'normal': [0.25, 1, 0.15], 'structure': 'valve.pulmonary', 'logical': 'cv.valve.pulmonary'},
  'cc.valve_av': {'name_ko': '대동맥판 (개념, 반달 첨판 3)', 'count': 3, 'radius': 0.065, 'center': [0.1, 0.06, 0.04], 'normal': [-0.2, 1, 0], 'structure': 'valve.aortic', 'logical': 'cv.valve.aortic'},
}
TUBES = {
  'cc.svc': {'name_ko': '상대정맥 (개념)', 'points': [[-0.42, 0.95, 0.0], [-0.4, 0.7, 0.0], [-0.37, 0.48, 0.0]], 'radius': 0.07, 'color': '#5a6fc0'},
  'cc.pa': {'name_ko': '폐동맥줄기 (개념)', 'points': [[-0.12, 0.08, 0.2], [-0.06, 0.45, 0.2], [0.05, 0.72, 0.15], [-0.25, 0.82, 0.1], [-0.6, 0.78, 0.05]], 'radius': 0.06, 'color': '#5a6fc0'},
  'cc.pv': {'name_ko': '폐정맥 (개념)', 'points': [[0.85, 0.48, -0.12], [0.68, 0.42, -0.08], [0.52, 0.4, -0.06]], 'radius': 0.05, 'color': '#c05a5a'},
  'cc.aorta': {'name_ko': '대동맥 (개념)', 'points': [[0.1, 0.06, 0.04], [0.06, 0.5, 0.04], [0.15, 0.85, 0.0], [0.45, 0.9, -0.08], [0.62, 0.65, -0.12], [0.64, 0.2, -0.14]], 'radius': 0.065, 'color': '#c05a5a'},
}

objects = []
for cid, c in CH.items():
    objects.append({'id': cid, 'name_ko': c['name_ko'], 'shape': 'ellipsoid', 'center': c['center'], 'radius': c['radius'], 'color': c['color'],
                    'opacity': 0.42, 'logical_id': c['logical'], 'morphs': {'contract': {'scale': c['contract']}}})
for vid, v in VALVES.items():
    objects.append({'id': vid, 'name_ko': v['name_ko'], 'shape': 'leaflets', 'count': v['count'], 'radius': v['radius'], 'center': v['center'],
                    'normal': v['normal'], 'color': '#7a7f8c', 'logical_id': v['logical'], 'morphs': {'open': {'angle_deg': 72}}})
for tid, t in TUBES.items():
    objects.append({'id': tid, 'name_ko': t['name_ko'], 'shape': 'tube', 'points': t['points'], 'radius': t['radius'], 'color': t['color'], 'opacity': 0.4})

anims = []
# 판막 열기/닫기 (Morph 'open' 0↔1). 시간은 교육용 값(자료에 없음)
for vid, v in VALVES.items():
    s = v['structure']
    anims.append({'animation_id': f'{s}.open', 'target_id': vid, 'animation_type': 'morph', 'morph_target': 'open', 'duration_ms': 350, 'easing': 'ease_out',
                  'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}], 'restore_on_cancel': True, 'verification_status': 'CONCEPTUAL',
                  'notes': '개념 첨판을 경첩축으로 젖히는 교육용 형태. 실제 첨판 움직임이 아님. 시간은 교육용 값.'})
    anims.append({'animation_id': f'{s}.close', 'target_id': vid, 'animation_type': 'morph', 'morph_target': 'open', 'duration_ms': 300, 'easing': 'ease_in',
                  'keyframes': [{'time': 0, 'value': 1}, {'time': 1, 'value': 0}], 'restore_on_cancel': True, 'verification_status': 'CONCEPTUAL'})
# 방·실 수축/이완 (Morph 'contract')
for cid in CH:
    anims.append({'animation_id': f'{cid}.contract', 'target_id': cid, 'animation_type': 'morph', 'morph_target': 'contract', 'duration_ms': 700, 'easing': 'ease_in_out',
                  'keyframes': [{'time': 0, 'value': 0}, {'time': 1, 'value': 1}], 'verification_status': 'CONCEPTUAL',
                  'notes': '용적 감소를 보이게 한 교육용 축소. 실제 비율·모양 아님.'})
    anims.append({'animation_id': f'{cid}.relax', 'target_id': cid, 'animation_type': 'morph', 'morph_target': 'contract', 'duration_ms': 900, 'easing': 'ease_in_out',
                  'keyframes': [{'time': 0, 'value': 1}, {'time': 1, 'value': 0}], 'verification_status': 'CONCEPTUAL'})
# 등용적 구간: 심실 압력 변화 "표시" (색). 압력 수치 아님
for cid in ('cc.rv', 'cc.lv'):
    base = CH[cid]['color']
    anims.append({'animation_id': f'{cid}.pressure_up', 'target_id': cid, 'animation_type': 'material', 'duration_ms': 500,
                  'keyframes': [{'time': 0, 'value': {'color': base}}, {'time': 1, 'value': {'color': '#e8a33d'}}], 'restore_on_cancel': True,
                  'verification_status': 'CONCEPTUAL', 'notes': '심실 압력이 오르는 구간 표시용 색. 수치 아님.'})
    anims.append({'animation_id': f'{cid}.pressure_down', 'target_id': cid, 'animation_type': 'material', 'duration_ms': 500,
                  'keyframes': [{'time': 0, 'value': {'color': '#e8a33d'}}, {'time': 1, 'value': {'color': base}}], 'verification_status': 'CONCEPTUAL'})
# 장식: 박출 중 대동맥·폐동맥 맥동 (반복, 학습을 막지 않음)
for tid in ('cc.aorta', 'cc.pa'):
    anims.append({'animation_id': f'{tid}.pulse', 'target_id': tid, 'animation_type': 'procedural', 'procedure': 'deform_cycle', 'duration_ms': 600,
                  'params': {'period_ms': 600, 'scale': 1.12}, 'loop': True, 'verification_status': 'CONCEPTUAL', 'notes': '장식용 반복. Non-blocking.'})

structures = []
for vid, v in VALVES.items():
    s = v['structure']
    structures.append({'structure_id': s, 'name_ko': v['name_ko'].split(' (')[0], 'kind': 'valve', 'states': ['CLOSED', 'OPENING', 'OPEN', 'CLOSING'], 'initial': 'CLOSED',
                       'transitions': {'CLOSED->OPEN': {'via': 'OPENING', 'animation': f'{s}.open'}, 'OPEN->CLOSED': {'via': 'CLOSING', 'animation': f'{s}.close'}},
                       'indicators': [{'target': vid, 'state_colors': {'OPEN': '#3cb371', 'OPENING': '#9acd32', 'CLOSING': '#e0a040', 'CLOSED': '#7a7f8c'}},
                                      {'target': v['logical'], 'state_colors': {'OPEN': '#3cb371', 'OPENING': '#9acd32', 'CLOSING': '#e0a040', 'CLOSED': '#8a8f9c'}, 'real_model': True}],
                       'verification_status': 'CONCEPTUAL',
                       'notes': '실제 모델(BodyParts3D) 판막은 첨판 리깅이 없어 움직이지 않는다. 색으로 상태만 표시한다.'})

# 경로 (장면 좌표)
def c(k): return CH[k]['center']
vm = VALVES['cc.valve_mv']['center']; vt = VALVES['cc.valve_tv']['center']
va = VALVES['cc.valve_av']['center']; vp = VALVES['cc.valve_pv']['center']
paths = [
  {'path_id': 'cc.left_fill', 'name_ko': '좌심방 → 승모판 → 좌심실 (개념)', 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL',
   'points': [{'space': 'scene', 'position': W(p)} for p in [c('cc.la'), [vm[0], vm[1] + 0.08, vm[2]], vm, [vm[0] - 0.02, vm[1] - 0.12, vm[2]], [0.3, -0.18, 0.0], [0.28, -0.32, 0.0]]],
   'checkpoints': [{'checkpoint_id': 'cp.cc.la', 'path_progress': 0, 'stop_on_arrival': False, 'label': '좌심방'},
                   {'checkpoint_id': 'cp.cc.mitral', 'path_progress': 0.33, 'stop_on_arrival': False, 'label': '승모판'},
                   {'checkpoint_id': 'cp.cc.lv_fill', 'path_progress': 0.72, 'stop_on_arrival': True, 'label': '좌심실 (빠른 충만)'},
                   {'checkpoint_id': 'cp.cc.lv', 'path_progress': 1, 'stop_on_arrival': True, 'label': '좌심실 (충만 끝)'}],
   'links': [{'to': 'cc.left_eject'}], 'source': 'project concept model', 'notes': '개념 모델 경로. 해부학 경로 아님.'},
  {'path_id': 'cc.left_eject', 'name_ko': '좌심실 → 대동맥판 → 대동맥 (개념)', 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL',
   'points': [{'space': 'scene', 'position': W(p)} for p in [[0.28, -0.32, 0.0], [0.18, -0.12, 0.03], [va[0], va[1] - 0.06, va[2]], va] + TUBES['cc.aorta']['points'][1:4]],
   'checkpoints': [{'checkpoint_id': 'cp.cc.lv_out', 'path_progress': 0, 'stop_on_arrival': False, 'label': '좌심실'},
                   {'checkpoint_id': 'cp.cc.av', 'path_progress': 0.3, 'stop_on_arrival': False, 'label': '대동맥판'},
                   {'checkpoint_id': 'cp.cc.aorta', 'path_progress': 1, 'stop_on_arrival': True, 'label': '대동맥'}],
   'source': 'project concept model', 'notes': '개념 모델 경로.'},
  {'path_id': 'cc.right_fill', 'name_ko': '우심방 → 삼첨판 → 우심실 (개념)', 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL',
   'points': [{'space': 'scene', 'position': W(p)} for p in [c('cc.ra'), [vt[0], vt[1] + 0.08, vt[2]], vt, [vt[0], vt[1] - 0.12, vt[2]], [-0.3, -0.3, 0.05]]],
   'checkpoints': [{'checkpoint_id': 'cp.cc.ra', 'path_progress': 0, 'stop_on_arrival': False, 'label': '우심방'},
                   {'checkpoint_id': 'cp.cc.rv', 'path_progress': 1, 'stop_on_arrival': True, 'label': '우심실'}],
   'links': [{'to': 'cc.right_eject'}], 'source': 'project concept model'},
  {'path_id': 'cc.right_eject', 'name_ko': '우심실 → 폐동맥판 → 폐동맥 (개념)', 'curve_type': 'catmull_rom', 'verification_status': 'CONCEPTUAL',
   'points': [{'space': 'scene', 'position': W(p)} for p in [[-0.3, -0.3, 0.05], [-0.2, -0.08, 0.15], [vp[0] - 0.02, vp[1] - 0.06, vp[2]], vp] + TUBES['cc.pa']['points'][1:4]],
   'checkpoints': [{'checkpoint_id': 'cp.cc.rv_out', 'path_progress': 0, 'stop_on_arrival': False, 'label': '우심실'},
                   {'checkpoint_id': 'cp.cc.pa', 'path_progress': 1, 'stop_on_arrival': True, 'label': '폐동맥'}],
   'source': 'project concept model'},
]
actors = [
  {'actor_id': 'rbc_01', 'actor_type': 'red_blood_cell', 'model_id': 'rbc', 'name': '적혈구 (교육용 확대)', 'display_size': 0.05, 'path_id': 'cc.left_fill', 'speed': 0.4,
   'rotation_mode': 'tangent', 'biological_state': {'oxygenation': 'oxygenated'}},
  {'actor_id': 'rbc_right', 'actor_type': 'red_blood_cell', 'model_id': 'rbc', 'name': '적혈구 (오른쪽, 장식)', 'display_size': 0.05, 'path_id': 'cc.right_fill', 'speed': 0.4,
   'rotation_mode': 'tangent', 'biological_state': {'oxygenation': 'deoxygenated'}},
]

def st(m, wait=True): return {'type': 'state', 'set': m, 'wait': wait}
def an(a, wait=True): return {'type': 'animation', 'animation_id': a, 'wait': wait}
def cmd(c, through=None, wait=True):
    s = {'type': 'command', 'command': c, 'wait': wait}
    if through: s['through'] = through
    return s
def stop(a): return cmd({'action': 'animation_stop', 'target': a, 'restore': True}, wait=False)
AV = {'valve.tricuspid': 'OPEN', 'valve.mitral': 'OPEN', 'valve.pulmonary': 'CLOSED', 'valve.aortic': 'CLOSED'}

PH = {
 5: dict(key='filling', name_ko='후기 심실확장기 (심실 충만기)', atria='이완', ventricles='이완', av='열림', semilunar='닫힘',
         flow='심방 → 심실 (방실판막을 지나 채워짐)', pressure='심실 < 심방, 심실 < 동맥', sound='S3: 이완기 초기 빠른 충만 때 들릴 수 있음', refs=['HA6 p5 그림 ⑤', '교재 p614']),
 1: dict(key='atrial_systole', name_ko='심방수축기', atria='수축', ventricles='이완', av='열림', semilunar='닫힘',
         flow='심방 → 심실 (마지막 충만)', pressure='심실 < 심방, 심실 < 동맥', sound='S4: 이완기 말 심방수축 때 들릴 수 있음', refs=['HA6 p5 그림 ①', '교재 p614']),
 2: dict(key='isovolumetric_contraction', name_ko='전기 심실수축기 (등용적 수축)', atria='이완', ventricles='수축 (용적 일정)', av='닫힘', semilunar='닫힘',
         flow='판막을 지나는 이동 없음', pressure='심실 > 심방, 심실 < 동맥', sound='S1: 방실판막이 닫힐 때', refs=['HA6 p5 그림 ②', 'HA6 p17']),
 3: dict(key='ejection', name_ko='후기 심실수축기 (심실 박출)', atria='이완', ventricles='수축', av='닫힘', semilunar='열림',
         flow='심실 → 대동맥·폐동맥줄기', pressure='심실 > 심방, 심실 > 동맥', sound='', refs=['HA6 p5 그림 ③']),
 4: dict(key='isovolumetric_relaxation', name_ko='전기 심실확장기 (등용적 이완)', atria='이완', ventricles='이완 (용적 일정)', av='닫힘', semilunar='닫힘',
         flow='판막을 지나는 이동 없음', pressure='심실 > 심방, 심실 < 동맥', sound='S2: 반월판막이 닫힐 때', refs=['HA6 p5 그림 ④', '교재 p614']),
}
VS = {5: AV, 1: AV,
      2: {'valve.tricuspid': 'CLOSED', 'valve.mitral': 'CLOSED', 'valve.pulmonary': 'CLOSED', 'valve.aortic': 'CLOSED'},
      3: {'valve.tricuspid': 'CLOSED', 'valve.mitral': 'CLOSED', 'valve.pulmonary': 'OPEN', 'valve.aortic': 'OPEN'},
      4: {'valve.tricuspid': 'CLOSED', 'valve.mitral': 'CLOSED', 'valve.pulmonary': 'CLOSED', 'valve.aortic': 'CLOSED'}}
# 단계가 끝난 뒤의 형태·표시 (자유 관찰을 끝내거나 복구할 때 즉시 맞추는 값)
MORPH_END = {5: {'cc.lv': 0, 'cc.rv': 0, 'cc.la': 0, 'cc.ra': 0}, 1: {'cc.lv': 0, 'cc.rv': 0, 'cc.la': 0, 'cc.ra': 0},
             2: {'cc.lv': 0, 'cc.rv': 0, 'cc.la': 0, 'cc.ra': 0}, 3: {'cc.lv': 1, 'cc.rv': 1, 'cc.la': 0, 'cc.ra': 0},
             4: {'cc.lv': 1, 'cc.rv': 1, 'cc.la': 0, 'cc.ra': 0}}
TINT_END = {5: [], 1: [], 2: ['cc.lv', 'cc.rv'], 3: ['cc.lv', 'cc.rv'], 4: []}
ACTOR_END = {5: ('cc.left_fill', 'cp.cc.lv_fill', 'cc.right_fill', 'cp.cc.rv'), 1: ('cc.left_fill', 'cp.cc.lv', 'cc.right_fill', 'cp.cc.rv'),
             2: ('cc.left_fill', 'cp.cc.lv', 'cc.right_fill', 'cp.cc.rv'), 3: ('cc.left_eject', 'cp.cc.aorta', 'cc.right_eject', 'cp.cc.pa'),
             4: ('cc.left_eject', 'cp.cc.aorta', 'cc.right_eject', 'cp.cc.pa')}
phases = []
for k in (5, 1, 2, 3, 4):
    p = PH[k]
    phases.append({'phase': k, 'phase_key': p['key'], 'name_ko': p['name_ko'], 'atria': p['atria'], 'ventricles': p['ventricles'], 'av_valves': p['av'],
                   'semilunar_valves': p['semilunar'], 'flow': p['flow'], 'pressure_relation': p['pressure'], 'heart_sound': p['sound'],
                   'visual_state': VS[k], 'lecture_refs': p['refs'], 'timeline_id': f"cc.phase.{p['key']}",
                   'end_state': {'morph': {o: {'contract': w} for o, w in MORPH_END[k].items()}, 'tint': {o: '#e8a33d' for o in TINT_END[k]},
                                 'actors': {'rbc_01': ACTOR_END[k][1], 'rbc_right': ACTOR_END[k][3]}}})

timelines = [
 {'timeline_id': 'cc.phase.filling', 'blocking': True, 'name_ko': '심실 충만', 'steps': [
   {'type': 'marker', 'name': 'phase', 'phase': 5, 'label': PH[5]['name_ko']},
   stop('cc.aorta.pulse'), stop('cc.pa.pulse'),
   {'type': 'parallel', 'steps': [st(VS[5]), an('cc.lv.relax'), an('cc.rv.relax')]},
   cmd({'action': 'actor_place_at_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.la'}),
   cmd({'action': 'actor_place_at_checkpoint', 'target': 'rbc_right', 'checkpoint_id': 'cp.cc.ra'}),
   {'type': 'parallel', 'steps': [
     cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.lv_fill', 'duration': 1800}, through=['valve.mitral']),
     cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_right', 'checkpoint_id': 'cp.cc.rv', 'duration': 1800}, through=['valve.tricuspid'])]}]},
 {'timeline_id': 'cc.phase.atrial_systole', 'blocking': True, 'name_ko': '심방수축', 'steps': [
   {'type': 'marker', 'name': 'phase', 'phase': 1, 'label': PH[1]['name_ko']},
   st(VS[1]),
   {'type': 'parallel', 'steps': [an('cc.ra.contract'), an('cc.la.contract'),
     cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.lv', 'duration': 900}, through=['valve.mitral'])]},
   {'type': 'parallel', 'steps': [an('cc.ra.relax', wait=False), an('cc.la.relax', wait=False)]}]},
 {'timeline_id': 'cc.phase.isovolumetric_contraction', 'blocking': True, 'name_ko': '등용적 수축', 'steps': [
   {'type': 'marker', 'name': 'phase', 'phase': 2, 'label': PH[2]['name_ko']},
   st(VS[2]),
   {'type': 'parallel', 'steps': [an('cc.lv.pressure_up'), an('cc.rv.pressure_up')]},
   {'type': 'delay', 'ms': 300}]},
 {'timeline_id': 'cc.phase.ejection', 'blocking': True, 'name_ko': '심실 박출', 'steps': [
   {'type': 'marker', 'name': 'phase', 'phase': 3, 'label': PH[3]['name_ko']},
   st(VS[3]),
   an('cc.aorta.pulse', wait=False), an('cc.pa.pulse', wait=False),
   cmd({'action': 'actor_set_path', 'target': 'rbc_01', 'path_id': 'cc.left_eject'}),
   cmd({'action': 'actor_set_path', 'target': 'rbc_right', 'path_id': 'cc.right_eject'}),
   {'type': 'parallel', 'steps': [an('cc.lv.contract'), an('cc.rv.contract'),
     cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.aorta', 'duration': 1600}, through=['valve.aortic']),
     cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_right', 'checkpoint_id': 'cp.cc.pa', 'duration': 1600}, through=['valve.pulmonary'])]}]},
 {'timeline_id': 'cc.phase.isovolumetric_relaxation', 'blocking': True, 'name_ko': '등용적 이완', 'steps': [
   {'type': 'marker', 'name': 'phase', 'phase': 4, 'label': PH[4]['name_ko']},
   stop('cc.aorta.pulse'), stop('cc.pa.pulse'),
   st(VS[4]),
   {'type': 'parallel', 'steps': [an('cc.lv.pressure_down'), an('cc.rv.pressure_down')]},
   {'type': 'delay', 'ms': 300}]},
 {'timeline_id': 'cc.cycle.observe', 'blocking': False, 'name_ko': '심장주기 한 바퀴 (관찰)', 'steps': [
   {'type': 'command', 'command': {'action': 'timeline_play', 'target': f'cc.phase.{PH[k]["key"]}'}, 'wait': True} for k in (5, 1, 2, 3, 4)]},
 {'timeline_id': 'cc.test.closed_valve_move', 'blocking': True, 'name_ko': '(시험) 닫힌 판막 통과 시도', 'steps': [
   st({'valve.mitral': 'CLOSED'}),
   cmd({'action': 'actor_place_at_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.la'}),
   cmd({'action': 'actor_move_to_checkpoint', 'target': 'rbc_01', 'checkpoint_id': 'cp.cc.lv_fill', 'duration': 800}, through=['valve.mitral'])]},
]

group = {'group_id': 'concept.cardiac', 'name_ko': '심장주기 개념 모델', 'origin': O, 'backdrop': {'radius': 7, 'color': '#1d2130'},
         'verification_status': 'CONCEPTUAL', 'objects': objects}
doc = {'version': 1, 'scene_id': 'concept.cardiac', 'verification_status': 'CONCEPTUAL',
       'description': 'STEP 04-B 심장주기 개념 모델. 해부 모델이 아니라 직접 만든 단순 형태다. 심실 근육 벽·심실중격이 원본(BodyParts3D)에 없어서 만들었다. 모양·비율·시간은 교육용 값이며 실제 혈류역학 계산이 아니다.',
       'lecture_refs': 'HA6 p5(심장주기 5단계 그림·심음), HA6 p17, 교재 p614(확장기 구분, EDV·ESV), 산소화요구 p7. 단계 지속시간·압력 수치는 자료에 없어 쓰지 않는다.',
       'units': {'time': 'ms', 'length': 'm (개념 장면 단위, 실제 크기 아님)', 'morph': '0~1 가중치'},
       'scale_scene': {'scene_id': 'concept.cardiac', 'level': 'ORGAN', 'title_ko': '심장주기 개념 모델', 'unit_note': '모양·크기는 교육용 개념 모델 (실제 비율 아님)',
                       'magnification_note': '심실 수축은 용적이 줄어드는 것을 보이게 한 축소이며 실제 모양 변화가 아니다. 단계 시간도 교육용 값이다.',
                       'actor_display_size': 0.05, 'follow': {'distance': 0.6, 'height': 0.2, 'side': 0.2, 'smooth': 5}, 'view_direction': [0, 0.1, 1]},
       'groups': [group], 'animations': anims, 'structures': structures, 'timelines': timelines, 'phases': phases,
       'motion': {'scene_id': 'concept.cardiac', 'marker_size': 0.02, 'follow': {'distance': 0.6, 'height': 0.2, 'side': 0.2, 'smooth': 5}, 'paths': paths, 'actors': actors},
       'labels': [{'text': '우심방', 'position': W([-0.36, 0.6, 0.1])}, {'text': '좌심방', 'position': W([0.4, 0.62, 0.0])},
                  {'text': '우심실', 'position': W([-0.42, -0.6, 0.15])}, {'text': '좌심실', 'position': W([0.42, -0.62, 0.1])},
                  {'text': '대동맥', 'position': W([0.5, 0.98, -0.05])}, {'text': '폐동맥줄기', 'position': W([-0.45, 0.92, 0.1])}]}
import os
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'content', 'animations', 'cardiac-concept.json'), 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
print('anims', len(anims), 'timelines', len(timelines), 'paths', len(paths))
