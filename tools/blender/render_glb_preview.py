# GLB 미리보기 렌더 (개발 도구, 수업 범위 밖): 화면 확인용 PNG
# 실행: blender --background --factory-startup --python tools/blender/render_glb_preview.py -- <in.glb> <out.png> [shape_key=value ...] [view=front|iso|top]
import bpy
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = args[0], args[1]
opts = dict(a.split('=', 1) for a in args[2:] if '=' in a)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = 960
sc.render.resolution_y = 720
world = bpy.data.worlds.new('w')
sc.world = world
world.color = (0.12, 0.13, 0.18)
meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    ks = o.data.shape_keys
    if ks and ks.animation_data:
        ks.animation_data_clear()      # 가져온 클립(NLA)이 Shape Key 값을 덮어쓰지 않게
    if ks:
        for k, v in opts.items():
            if k in ks.key_blocks:
                ks.key_blocks[k].value = float(v)
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
mn = Vector([min(p[i] for p in pts) for i in range(3)])
mx = Vector([max(p[i] for p in pts) for i in range(3)])
c = (mn + mx) / 2
size = (mx - mn).length
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
view = opts.get('view', 'iso')
d = {'front': Vector((0, -1, 0.15)), 'iso': Vector((0.6, -1, 0.55)), 'top': Vector((0, -0.2, 1)), 'end': Vector((0, -0.05, 1))}[view].normalized()
cam.location = c + d * size * 1.05
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDERED', OUT)
