# 판막 리깅 GLB를 닫힘/열림 두 상태로 렌더해 눈으로 확인 (개발 도구, 수업 범위 밖)
# 실행: blender --background --factory-startup --python tools/blender/render_valve_states.py -- <rig.glb> <out_prefix>
import bpy
import sys
import math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
GLB, PREFIX = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = 900
sc.render.resolution_y = 700
sc.render.film_transparent = False
meshes = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
c = sum(pts, Vector()) / len(pts)
cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 50
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam


def look(view, dist=0.17):
    # glTF 가져오기 후 Blender 좌표(Z-up)로 돌아온다: +Z 위, -Y 앞
    dirs = {'atrial': Vector((0.15, 0.25, 1.0)), 'front': Vector((0.0, -1.0, 0.15))}
    d = dirs[view].normalized()
    cam.location = c + d * dist
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()


for state in (0.0, 1.0):
    for o in meshes:
        if o.data.shape_keys and 'open' in o.data.shape_keys.key_blocks:
            o.data.shape_keys.key_blocks['open'].value = state
    for view in ('atrial', 'front'):
        look(view)
        sc.render.filepath = '{}_{}_{}.png'.format(PREFIX, view, 'open' if state else 'closed')
        bpy.ops.render.render(write_still=True)
print('RENDERED')
