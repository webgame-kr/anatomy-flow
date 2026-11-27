// Object Inspector: 선택 객체 정보와 Transform · Material · Visibility 입력

const TYPE_LABEL = { model: '모델', group: '그룹', mesh: 'Mesh', primitive: '기본 도형' };

export function createInspectorPanel(handlers) {
  const $ = (id) => document.getElementById(id);
  const f = {
    id: $('i-id'), name: $('i-name'), type: $('i-type'), asset: $('i-asset'), family: $('i-family'),
    mat: $('i-mat'), bbox: $('i-bbox'), anim: $('i-anim'),
    opacity: $('i-opacity'), opacityVal: $('i-opacity-val'), visible: $('i-visible'), color: $('i-color'),
  };
  const xyz = [...document.querySelectorAll('.xyz input')];
  const AXIS = ['X', 'Y', 'Z'];
  const KIND = { position: 'Position', rotation: 'Rotation(도)', scale: 'Scale' };
  for (const input of xyz) input.setAttribute('aria-label', `${KIND[input.dataset.t]} ${AXIS[Number(input.dataset.a)]}`);
  const sections = ['sec-transform', 'sec-look'].map($);
  let current = null;

  // 입력 중인 칸은 갱신으로 덮어쓰지 않는다
  function setInput(input, value) {
    if (document.activeElement === input) return;
    input.value = value;
  }

  function show(info) {
    current = info;
    for (const s of sections) s.classList.toggle('disabled', !info);
    if (!info) {
      f.id.textContent = '(선택 없음 — 화면이나 계층에서 클릭)';
      for (const k of ['name', 'type', 'asset', 'family', 'mat', 'bbox', 'anim']) f[k].textContent = '-';
      for (const input of xyz) input.value = '';
      return;
    }
    f.id.textContent = info.object_id;
    f.name.textContent = info.display_name;
    f.type.textContent = `${TYPE_LABEL[info.object_type] || info.object_type}${info.selectable ? '' : ' (선택 불가)'}`;
    f.asset.textContent = info.source_asset_id || '-';
    f.family.textContent = `${info.parent_id || '(최상위)'} / ${info.children.length}개`;
    f.mat.textContent = `${info.material.count}개 ${info.material.types.join(', ')}${info.material.color ? ` · ${info.material.color}` : ''}`;
    f.bbox.textContent = info.bounding_box ? info.bounding_box.size.join(' × ') : '-';
    f.anim.textContent = info.animation_names.length ? info.animation_names.join(', ') : '-';
    for (const input of xyz) setInput(input, info[input.dataset.t][Number(input.dataset.a)]);
    setInput(f.opacity, info.opacity);
    f.opacityVal.textContent = Number(info.opacity).toFixed(2);
    f.visible.checked = info.visible;
    if (info.material.color && document.activeElement !== f.color) f.color.value = info.material.color;
  }

  for (const input of xyz) {
    input.addEventListener('change', () => {
      if (!current) return;
      const kind = input.dataset.t;
      const values = xyz.filter((i) => i.dataset.t === kind).map((i) => Number(i.value));
      if (values.some((n) => !isFinite(n))) return;
      if (kind === 'scale' && values.some((n) => n <= 0)) return;
      handlers.onTransform(current.object_id, kind, values);
    });
  }
  f.opacity.addEventListener('input', () => {
    if (!current) return;
    f.opacityVal.textContent = Number(f.opacity.value).toFixed(2);
    handlers.onOpacity(current.object_id, Number(f.opacity.value));
  });
  f.visible.addEventListener('change', () => current && handlers.onVisible(current.object_id, f.visible.checked));
  f.color.addEventListener('input', () => current && handlers.onColor(current.object_id, f.color.value));
  $('b-focus').addEventListener('click', () => current && handlers.onFocus(current.object_id));
  $('b-isolate').addEventListener('click', () => current && handlers.onIsolate(current.object_id));
  $('b-ghost').addEventListener('click', () => current && handlers.onGhost(current.object_id));
  $('b-showall').addEventListener('click', () => handlers.onShowAll());
  $('b-restore').addEventListener('click', () => current && handlers.onRestore(current.object_id));

  return { show, get current() { return current; } };
}
