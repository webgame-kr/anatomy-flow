// Scene Hierarchy: 레지스트리의 부모·자식 트리, 표시 토글, 선택

const TYPE_LABEL = { model: '모델', group: '그룹', mesh: 'Mesh', primitive: '도형' };

export function createHierarchyPanel(listEl, countEl, { registry, onSelect, onToggleVisible, onFocus }) {
  const collapsed = new Set();
  let selectedId = null;
  let hoverId = null;

  function node(id, depth) {
    const e = registry.get(id);
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'node';
    row.dataset.id = id;
    if (id === selectedId) row.classList.add('active');
    if (id === hoverId) row.classList.add('hovered');
    if (!e.object3D.visible) row.classList.add('hidden');

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'caret';
    if (e.children.length) {
      caret.textContent = collapsed.has(id) ? '▸' : '▾';
      caret.title = collapsed.has(id) ? '펼치기' : '접기';
      caret.addEventListener('click', () => {
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        render();
      });
    } else {
      caret.disabled = true;
    }

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'eye';
    eye.textContent = e.object3D.visible ? '●' : '○';
    eye.title = e.object3D.visible ? '숨기기' : '보이기';
    eye.addEventListener('click', () => onToggleVisible(id, !e.object3D.visible));

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'name';
    name.textContent = e.displayName;
    name.title = id;
    name.addEventListener('click', () => onSelect(id));
    name.addEventListener('dblclick', () => onFocus(id));

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = TYPE_LABEL[e.type] || e.type;

    row.append(caret, eye, name, type);
    li.appendChild(row);
    if (e.children.length && !collapsed.has(id)) {
      const ul = document.createElement('ul');
      for (const child of e.children) ul.appendChild(node(child, depth + 1));
      li.appendChild(ul);
    }
    return li;
  }

  function render() {
    listEl.innerHTML = '';
    for (const id of registry.roots()) listEl.appendChild(node(id, 0));
    if (registry.size === 0) listEl.innerHTML = '<li class="muted" style="padding:6px 10px">(객체 없음)</li>';
    countEl.textContent = `${registry.size}개`;
  }

  function setSelected(id) {
    selectedId = id;
    // 선택한 항목이 접힌 부모 안에 있으면 펼친다
    let cur = id ? registry.get(id) : null;
    while (cur && cur.parentId) {
      collapsed.delete(cur.parentId);
      cur = registry.get(cur.parentId);
    }
    render();
    const row = id ? listEl.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function setHover(id) {
    if (hoverId === id) return;
    const prev = hoverId ? listEl.querySelector(`[data-id="${CSS.escape(hoverId)}"]`) : null;
    if (prev) prev.classList.remove('hovered');
    hoverId = id;
    const row = id ? listEl.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
    if (row) row.classList.add('hovered');
  }

  // 큰 모델은 처음에 2단계 아래를 접어 둔다
  function collapseDeep(rootId, depthLimit = 1) {
    const walk = (id, depth) => {
      const e = registry.get(id);
      if (!e) return;
      if (depth >= depthLimit && e.children.length) collapsed.add(id);
      for (const c of e.children) walk(c, depth + 1);
    };
    walk(rootId, 0);
  }

  return { render, setSelected, setHover, collapseDeep };
}
