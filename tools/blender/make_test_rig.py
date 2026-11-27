# 프로젝트 자체 테스트 모델(nf-test-rig.glb) 만들기 — Blender 내장 Python(bpy) 개발 도구
# 실행:
#   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup
#       --python tools/blender/make_test_rig.py -- assets/sandbox/nf-test-rig.glb
#
# 검증하려는 것: 여러 단계 계층, 공유 재질, 다중 재질 Mesh, 같은 계열 이름(Marker), 내장 애니메이션.
# 해부학 모델이 아니며, 직접 만든 도형이라 외부 라이선스 제약이 없다.

import sys
import math
import bpy

argv = sys.argv
out_path = argv[argv.index('--') + 1] if '--' in argv else 'nf-test-rig.glb'

# 기본 장면 비우기
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for block in [bpy.data.meshes, bpy.data.materials, bpy.data.actions]:
    for item in list(block):
        block.remove(item)


def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def mesh(kind, name, parent, location, scale=(1, 1, 1), mat=None):
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif kind == 'cylinder':
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=1)
    elif kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.5)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.5, depth=1)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name + '_geo'
    obj.parent = parent
    obj.location = location
    obj.scale = scale
    if mat:
        obj.data.materials.append(mat)
    return obj


shared = material('NF_Shared_Blue', (0.18, 0.43, 0.87), roughness=0.4)
white = material('NF_White', (0.9, 0.9, 0.92), roughness=0.6)
red = material('NF_Red', (0.9, 0.28, 0.3), roughness=0.45)
metal = material('NF_Metal', (0.7, 0.72, 0.75), metallic=0.8, roughness=0.3)

# Blender는 Z가 위쪽. glTF로 내보낼 때 Y-up으로 바뀐다.
root = empty('NF_TestRig')
base = empty('Base', root)
mesh('cube', 'Plate', base, (0, 0, 0.1), (2.0, 2.0, 0.2), shared)
mesh('cube', 'Marker', base, (0.8, 0.8, 0.3), (0.2, 0.2, 0.2), shared)
mesh('cube', 'Marker', base, (-0.8, 0.8, 0.3), (0.2, 0.2, 0.2), shared)   # 같은 이름 → Blender가 Marker.001로 바꿈

arm = empty('Arm', root, (0, 0, 0.2))
mesh('cylinder', 'Arm_Segment', arm, (0, 0, 0.6), (0.3, 0.3, 1.2), white)
mesh('sphere', 'Joint', arm, (0, 0, 1.3), (0.45, 0.45, 0.45), shared)
tool = empty('Tool', arm, (0, 0, 1.3))
mesh('cone', 'Tool_Tip', tool, (0, 0, 0.45), (0.3, 0.3, 0.5), red)
mesh('cylinder', 'Tool_Ring', tool, (0, 0, 0.15), (0.38, 0.38, 0.08), metal)

# 다중 재질 Mesh: 한 Mesh에 재질 슬롯 2개 (위 면만 빨강)
badge = mesh('cube', 'Badge', root, (-0.7, -0.7, 0.45), (0.4, 0.4, 0.5), white)
badge.data.materials.append(red)
for poly in badge.data.polygons:
    if poly.normal.z > 0.9:
        poly.material_index = 1

# 내장 애니메이션 2개
arm.animation_data_create()
swing = bpy.data.actions.new('ArmSwing')
arm.animation_data.action = swing
arm.rotation_euler = (0, 0, 0)
arm.keyframe_insert('rotation_euler', frame=1)
arm.rotation_euler = (0, math.radians(25), 0)
arm.keyframe_insert('rotation_euler', frame=30)
arm.rotation_euler = (0, 0, 0)
arm.keyframe_insert('rotation_euler', frame=60)
track = arm.animation_data.nla_tracks.new()
track.name = 'ArmSwing'          # glTF 애니메이션 이름은 NLA 트랙 이름을 따른다
track.strips.new('ArmSwing', 1, swing)
arm.animation_data.action = None

tool.animation_data_create()
spin = bpy.data.actions.new('ToolSpin')
tool.animation_data.action = spin
tool.rotation_euler = (0, 0, 0)
tool.keyframe_insert('rotation_euler', frame=1)
tool.rotation_euler = (0, 0, math.radians(360))
tool.keyframe_insert('rotation_euler', frame=60)
track2 = tool.animation_data.nla_tracks.new()
track2.name = 'ToolSpin'
track2.strips.new('ToolSpin', 1, spin)
tool.animation_data.action = None

bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS')
print('exported', out_path)
