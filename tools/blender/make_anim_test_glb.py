# STEP 04-B 애니메이션 시험 모델 (프로젝트 자체 제작, 해부학 모델 아님)
# 실행: blender --background --factory-startup --python tools/blender/make_anim_test_glb.py -- <출력.glb>
# 수업 범위 밖 개발 도구 (bpy 사용). 게임 로직 py/ 와 섞지 않는다.
#
# 들어가는 것 (모두 GLB AnimationClip으로 내보낸다)
#   1) "Spin"   : 상자 객체의 회전·위치 Keyframe (Transform 애니메이션)
#   2) "Inflate": 구의 Shape Key(Morph Target) "Inflated" 가중치 0→1→0
#   3) "Flap"   : 뼈 2개짜리 Armature에 붙은 판(flap)이 접혔다 펴짐 (Skeletal 애니메이션)
# 크기: 장면 단위 m. 시간: 24 fps, 각 클립 48 프레임(2초)

import bpy
import sys
import math

argv = sys.argv
out = argv[argv.index('--') + 1] if '--' in argv else 'anim-test.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
sc.frame_start = 1
sc.frame_end = 48


def make_action(obj, name):
    obj.animation_data_create()
    act = bpy.data.actions.new(name)
    obj.animation_data.action = act
    return act


def push_nla(obj, name):
    # 클립 이름을 지키기 위해 Action을 NLA 트랙으로 옮긴다 (glTF 내보내기가 트랙 이름으로 클립을 만든다)
    act = obj.animation_data.action
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(act.frame_range[0]), act)
    strip.name = name
    obj.animation_data.action = None


# 1) Transform: 상자
bpy.ops.mesh.primitive_cube_add(size=0.3, location=(-0.6, 0.3, 0))
box = bpy.context.active_object
box.name = 'spin_box'
make_action(box, 'Spin')
for f, rz, z in [(1, 0, 0.0), (24, 180, 0.15), (48, 360, 0.0)]:
    box.rotation_euler = (0, 0, math.radians(rz))
    box.location = (-0.6, 0.3 + z, 0)
    box.keyframe_insert('rotation_euler', frame=f)
    box.keyframe_insert('location', frame=f)
push_nla(box, 'Spin')

# 2) Morph: 구 + Shape Key
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0, 0.3, 0), segments=32, ring_count=16)
ball = bpy.context.active_object
ball.name = 'inflate_ball'
ball.shape_key_add(name='Basis')
key = ball.shape_key_add(name='Inflated')
for v in key.data:
    # 위아래로 늘이고 옆으로 조금 부풀림 (모양 변화가 단순 크기 변화와 구분되게)
    x, y, z = v.co
    v.co = (x * 1.25, y * 1.25, z * 1.6)
ball.data.shape_keys.animation_data_create()
kact = bpy.data.actions.new('Inflate')
ball.data.shape_keys.animation_data.action = kact
for f, w in [(1, 0.0), (24, 1.0), (48, 0.0)]:
    key.value = w
    key.keyframe_insert('value', frame=f)
sk_ad = ball.data.shape_keys.animation_data
tr = sk_ad.nla_tracks.new()
tr.name = 'Inflate'
st = tr.strips.new('Inflate', 1, kact)
st.name = 'Inflate'
sk_ad.action = None

# 3) Skeletal: Armature 2뼈 + 판
bpy.ops.object.armature_add(location=(0.6, 0.1, 0))
arm = bpy.context.active_object
arm.name = 'flap_rig'
bpy.ops.object.mode_set(mode='EDIT')
b1 = arm.data.edit_bones[0]
b1.name = 'root'
b1.head = (0, 0, 0)
b1.tail = (0, 0.25, 0)
b2 = arm.data.edit_bones.new('tip')
b2.head = (0, 0.25, 0)
b2.tail = (0, 0.5, 0)
b2.parent = b1
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.mesh.primitive_plane_add(size=1, location=(0.6, 0.35, 0))
flap = bpy.context.active_object
flap.name = 'flap'
flap.scale = (0.12, 0.25, 1)
flap.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=6)
bpy.ops.object.mode_set(mode='OBJECT')
flap.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
make_action(arm, 'Flap')
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones['tip']
for f, a in [(1, 0), (24, 75), (48, 0)]:
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (math.radians(a), 0, 0)
    pb.keyframe_insert('rotation_euler', frame=f)
bpy.ops.object.mode_set(mode='OBJECT')
push_nla(arm, 'Flap')

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_nla_strips=True,
                          export_morph=True, export_skins=True, export_yup=True, export_apply=False)
print('WROTE', out)
