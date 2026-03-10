// ================================================================
// objects.js — CRUD objets, panneau propriétés, behaviors
// ================================================================

// ----------------------------------------------------------------
// Création d'un objet depuis la bibliothèque
// ----------------------------------------------------------------
function addFromLib(type, x, y) {
  const id     = gid();
  const preset = OBJ_PRESETS[type] || OBJ_PRESETS.sprite;
  x = x ?? (80 + Math.random() * 500 | 0);
  y = y ?? (80 + Math.random() * 300 | 0);

  const o = {
    id,
    name:      type + '_' + id,
    type:      SPRITE_LIBTYPES.has(type) ? 'sprite' : type,
    libType:   type,
    x, y,
    w:         preset.w,
    h:         preset.h,
    visible:   true,
    angle:     0,
    opacity:   1,
    zIndex:    objects.length,
    imageData: null,
    color:     preset.color     || '#5b8fff',
    bgColor:   preset.bgColor   || '#5b8fff',
    text:      preset.text      ?? '',
    fontSize:  preset.fontSize  || 13,
    fontColor: preset.fontColor || '#000000',
    behaviors: JSON.parse(JSON.stringify(preset.behaviors || [])),
    typeId:    id,   // auto-référence = cet objet EST un type maître
  };

  objects.push(o);
  renderSceneList(); renderCvs(); updSt(); selectObj(id);
  return id;
}

// ----------------------------------------------------------------
// Ajout d'une instance d'un type existant
// ----------------------------------------------------------------
function addInstance(typeId, x, y) {
  const master = objects.find(o => o.id === typeId);
  if (!master) return null;
  const newId = gid();
  const inst  = JSON.parse(JSON.stringify(master));
  inst.id     = newId;
  inst.typeId = typeId;
  inst.x      = x !== undefined ? x : (master.x + 24 + Math.random() * 32 | 0);
  inst.y      = y !== undefined ? y : (master.y + 24);
  inst.zIndex = objects.length;
  objects.push(inst);
  renderSceneList(); renderCvs(); updSt(); selectObj(newId);
  return newId;
}

// ----------------------------------------------------------------
// Suppression
// ----------------------------------------------------------------
function delObj(id) {
  const obj = objects.find(o => o.id === id);
  objects = objects.filter(o => o.id !== id);
  // Si on supprime le maître du type, promouvoir la prochaine instance
  if (obj && obj.typeId === obj.id) {
    const next = objects.find(o => o.typeId === obj.id);
    if (next) {
      const newMaster = next.id;
      objects.forEach(o => { if (o.typeId === obj.id) o.typeId = newMaster; });
      next.typeId = next.id;
    }
  }
  selIds.delete(id);
  if (selId === id) { selId = null; showProps(null); }
  renderSceneList(); renderCvs(); updSt();
}

function delType(typeId) {
  if (!confirm('Supprimer toutes les instances de ce type ?')) return;
  objects = objects.filter(o => o.typeId !== typeId);
  selId = null; selIds = new Set();
  renderSceneList(); renderCvs(); updSt(); showProps(null);
  document.getElementById('s-sel').textContent = '—';
}

// ----------------------------------------------------------------
// Suppression de la sélection courante (1 ou plusieurs objets)
// ----------------------------------------------------------------
function delSelected() {
  if (selIds.size === 0) return;
  const ids = new Set(selIds);
  // Promotion des maîtres si des instances restent après suppression
  objects.filter(o => ids.has(o.id) && o.typeId === o.id).forEach(master => {
    const next = objects.find(o => o.typeId === master.id && !ids.has(o.id));
    if (next) {
      objects.forEach(o => { if (o.typeId === master.id) o.typeId = next.id; });
      next.typeId = next.id;
    }
  });
  objects = objects.filter(o => !ids.has(o.id));
  selId = null; selIds = new Set();
  renderSceneList(); renderCvs(); updSt(); showProps(null);
  document.getElementById('s-sel').textContent = '—';
}

// ----------------------------------------------------------------
// Mise à jour du panel selon la sélection courante
// ----------------------------------------------------------------
function updateMultiSelProps() {
  const ssel = document.getElementById('s-sel');
  if (selIds.size === 0) { showProps(null); ssel.textContent = '—'; return; }
  if (selIds.size === 1) {
    const o = objects.find(o => o.id === selId);
    showProps(o); ssel.textContent = o?.name || '—'; return;
  }
  // Tous du même type ?
  const typeIds = new Set([...selIds].map(id => objects.find(o => o.id === id)?.typeId));
  if (typeIds.size === 1) {
    const tid = [...typeIds][0];
    showGroupProps(tid);
    const m = objects.find(o => o.id === tid);
    ssel.textContent = m ? `${m.name} ×${selIds.size}` : '—';
  } else {
    showMixedProps();
    ssel.textContent = `${selIds.size} objets`;
  }
}

function showMixedProps() {
  const el = document.getElementById('rp-props-body');
  el.innerHTML = `
  <div class="pg"><div class="pgt">Sélection multiple</div>
    <div class="pr"><div class="pl">Objets sélectionnés</div><input class="pi" value="${selIds.size}" disabled></div>
  </div>
  <div class="pg">
    <button class="btn dl" style="width:100%;font-size:11px;" onclick="delSelected()">🗑 Supprimer la sélection</button>
  </div>`;
}

// ----------------------------------------------------------------
// Duplication — crée une instance du même type
// ----------------------------------------------------------------
function dupObj(id) {
  const s = objects.find(o => o.id === id);
  if (!s) return;
  const nid = gid();
  const c   = JSON.parse(JSON.stringify(s));
  c.id = nid; c.typeId = s.typeId; c.x += 24; c.y += 24; c.zIndex = objects.length;
  objects.push(c);
  renderSceneList(); renderCvs(); updSt(); selectObj(nid);
}

// ----------------------------------------------------------------
// Sélection
// ----------------------------------------------------------------
function selectObj(id) {
  selId  = id;
  selIds = id ? new Set([id]) : new Set();
  renderSceneList(); renderCvs();
  const o = objects.find(o => o.id === id);
  showProps(o);
  document.getElementById('s-sel').textContent = id ? (o?.name || '—') : '—';
  if (document.getElementById('rp-beh').classList.contains('on')) renderBehPanel();
}

function selectType(typeId) {
  const instances = objects.filter(o => o.typeId === typeId);
  selIds = new Set(instances.map(o => o.id));
  selId  = typeId;
  renderSceneList(); renderCvs();
  showGroupProps(typeId);
  const master = objects.find(o => o.id === typeId);
  document.getElementById('s-sel').textContent =
    master ? `${master.name} ×${instances.length}` : '—';
  if (document.getElementById('rp-beh').classList.contains('on')) renderBehPanel();
}

// ----------------------------------------------------------------
// Mise à jour d'une propriété
// ----------------------------------------------------------------
function up(id, k, v) {
  const o = objects.find(o => o.id === id);
  if (!o) return;
  o[k] = v;
  renderCvs(); renderSceneList();
  if (k === 'name') renderEvs();
}

// ----------------------------------------------------------------
// Nom du type maître + nombre d'instances
// ----------------------------------------------------------------
function getTypeMasterName(o) {
  const master = objects.find(x => x.id === o.typeId);
  const count  = objects.filter(x => x.typeId === o.typeId).length;
  return (master ? master.name : o.name) + (count > 1 ? ` ×${count}` : '');
}

// ----------------------------------------------------------------
// Rendu du panel "Types d'objets" dans l'onglet Bibliothèque
// ----------------------------------------------------------------
function renderObjTypesPanel() {
  const el = document.getElementById('lib-types-list');
  if (!el) return;
  const types = objects.filter(o => o.typeId === o.id);
  if (types.length === 0) {
    el.innerHTML = '<div style="color:var(--dim);font-size:10px;padding:6px 4px;">Aucun objet créé.</div>';
    return;
  }
  el.innerHTML = types.map(t => {
    const count = objects.filter(o => o.typeId === t.id).length;
    const thumb = t.color || '#5b8fff';
    return `<div class="lib-type-item" draggable="true"
      ondragstart="libTypeDragStart(${t.id})"
      onclick="selectType(${t.id})"
      title="Glisser sur le canvas pour une nouvelle instance · Ctrl+drag sur un objet dans la scène">
      <div class="lib-type-thumb" style="background:${thumb}"></div>
      <div class="lib-type-info">
        <div class="lib-type-name">${t.name}</div>
        <div class="lib-type-count">${t.libType || t.type} · ${count} inst.</div>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
// PANNEAU PROPRIÉTÉS — groupe de type
// ================================================================
function showGroupProps(typeId) {
  const master    = objects.find(o => o.id === typeId);
  if (!master) { showProps(null); return; }
  const instances = objects.filter(o => o.typeId === typeId);
  const el = document.getElementById('rp-props-body');

  let h = `
  <div class="pg"><div class="pgt">🗂 Type d'objet</div>
    <div class="pr"><div class="pl">Type</div><input class="pi" value="${master.name}" onchange="up(${master.id},'name',this.value)"></div>
    <div class="pr"><div class="pl">Instances</div><input class="pi" value="${instances.length}" disabled></div>
  </div>
  <div class="pg">
    <button class="btn dl" style="width:100%;font-size:11px;" onclick="delType(${typeId})">🗑 Supprimer toutes les instances</button>
  </div>`;

  if (master.behaviors?.length > 0) h += `
  <div class="pg"><div class="pgt">Behaviors (toutes instances)</div>
    ${master.behaviors.map(b => {
      const d = BEH_CATALOG.find(x => x.type === b.type);
      return d ? `<span class="beh-badge" style="background:rgba(192,132,252,.15);border:1px solid rgba(192,132,252,.3);color:var(--accent5)">${d.icon} ${d.name}</span>` : '';
    }).join('')}
    <div style="margin-top:6px;">
      <button class="btn btnc" style="font-size:10px;height:24px;" onclick="switchRP('beh')">Gérer les behaviors →</button>
    </div>
  </div>`;

  el.innerHTML = h;
}

// ================================================================
// PANNEAU PROPRIÉTÉS
// ================================================================
function showProps(o) {
  const el = document.getElementById('rp-props-body');
  if (!o) {
    el.innerHTML = `
    <div class="pg"><div class="pgt">🎮 Paramètres du Jeu</div>
      <div class="pr"><div class="pl">Nom</div><input class="pi" value="${gameSettings.name}" onchange="gameSettings.name=this.value"></div>
    </div>
    <div class="pg"><div class="pgt">Taille</div>
      <div class="pr"><div class="pl">Largeur</div><input class="pi" type="number" min="200" max="3000" value="${gameSettings.width}" onchange="applyGameSize(+this.value,gameSettings.height)"></div>
      <div class="pr"><div class="pl">Hauteur</div><input class="pi" type="number" min="100" max="2000" value="${gameSettings.height}" onchange="applyGameSize(gameSettings.width,+this.value)"></div>
    </div>
    <div class="pg"><div class="pgt">Visuel</div>
      <div class="pr"><div class="pl">Couleur de fond</div><input type="color" class="pi" value="${gameSettings.bgColor}" oninput="gameSettings.bgColor=this.value;renderCvs()"></div>
    </div>`;
    return;
  }

  let h = `
  <div class="pg"><div class="pgt">Identité</div>
    <div class="pr"><div class="pl">Nom</div><input class="pi" value="${o.name}" onchange="up(${o.id},'name',this.value)"></div>
  </div>
  <div class="pg"><div class="pgt">Transform</div>
    <div class="pr"><div class="pl">X</div><input class="pi" type="number" value="${o.x}" onchange="up(${o.id},'x',+this.value)"></div>
    <div class="pr"><div class="pl">Y</div><input class="pi" type="number" value="${o.y}" onchange="up(${o.id},'y',+this.value)"></div>
    <div class="pr"><div class="pl">Largeur</div><input class="pi" type="number" value="${o.w}" onchange="up(${o.id},'w',+this.value)"></div>
    <div class="pr"><div class="pl">Hauteur</div><input class="pi" type="number" value="${o.h}" onchange="up(${o.id},'h',+this.value)"></div>
    <div class="pr"><div class="pl">Angle</div><input class="pi" type="number" value="${o.angle}" onchange="up(${o.id},'angle',+this.value)"></div>
  </div>
  <div class="pg"><div class="pgt">Apparence</div>
    <div class="pr"><div class="pl">Opacité</div><input class="pi" type="range" min="0" max="1" step=".05" value="${o.opacity}" onchange="up(${o.id},'opacity',+this.value)"></div>
    <div class="pr"><div class="pl">Visible</div><input type="checkbox" ${o.visible ? 'checked' : ''} onchange="up(${o.id},'visible',this.checked)"></div>
  </div>`;

  if (o.type === 'sprite') h += `
  <div class="pg"><div class="pgt">Sprite</div>
    <div class="pr"><div class="pl">Couleur</div><input type="color" class="pi" value="${o.color || '#5b8fff'}" onchange="up(${o.id},'color',this.value)"></div>
    <div class="pr"><button class="btn btnp" style="width:100%;margin-top:4px" onclick="openPx(${o.id})">🎨 Éditer Pixel Art</button></div>
  </div>`;

  if (o.type === 'label' || o.type === 'button') h += `
  <div class="pg"><div class="pgt">Texte</div>
    <div class="pr"><div class="pl">Texte</div><input class="pi" value="${o.text || ''}" onchange="up(${o.id},'text',this.value)"></div>
    <div class="pr"><div class="pl">Taille</div><input class="pi" type="number" value="${o.fontSize}" onchange="up(${o.id},'fontSize',+this.value)"></div>
    <div class="pr"><div class="pl">Couleur txt</div><input type="color" class="pi" value="${o.fontColor || '#000000'}" onchange="up(${o.id},'fontColor',this.value)"></div>
  </div>`;

  if (o.type === 'button') h += `
  <div class="pg"><div class="pr">
    <div class="pl">Couleur BG</div>
    <input type="color" class="pi" value="${o.bgColor || '#5b8fff'}" onchange="up(${o.id},'bgColor',this.value)">
  </div></div>`;

  if (o.type === 'textedit') h += `
  <div class="pg"><div class="pgt">TextEdit</div>
    <div class="pr"><div class="pl">Valeur</div><input class="pi" value="${o.text || ''}" onchange="up(${o.id},'text',this.value)"></div>
    <div class="pr"><div class="pl">Placeholder</div><input class="pi" value="${o.placeholder || ''}" onchange="up(${o.id},'placeholder',this.value)"></div>
    <div class="pr"><div class="pl">Taille txt</div><input class="pi" type="number" value="${o.fontSize || 13}" onchange="up(${o.id},'fontSize',+this.value)"></div>
    <div class="pr"><div class="pl">Couleur txt</div><input type="color" class="pi" value="${o.fontColor || '#333333'}" onchange="up(${o.id},'fontColor',this.value)"></div>
    <div class="pr"><div class="pl">Fond</div><input type="color" class="pi" value="${o.bgColor || '#ffffff'}" onchange="up(${o.id},'bgColor',this.value)"></div>
    <div class="pr"><div class="pl">Bordure</div><input type="color" class="pi" value="${o.borderColor || '#aaaaaa'}" onchange="up(${o.id},'borderColor',this.value)"></div>
  </div>`;

  if (o.behaviors?.length > 0) h += `
  <div class="pg"><div class="pgt">Behaviors actifs</div>
    ${o.behaviors.map(b => {
      const d = BEH_CATALOG.find(x => x.type === b.type);
      return d ? `<span class="beh-badge" style="background:rgba(192,132,252,.15);border:1px solid rgba(192,132,252,.3);color:var(--accent5)">${d.icon} ${d.name}</span>` : '';
    }).join('')}
    <div style="margin-top:6px;">
      <button class="btn btnc" style="font-size:10px;height:24px;" onclick="switchRP('beh')">Gérer les behaviors →</button>
    </div>
  </div>`;

  el.innerHTML = h;
}

// ================================================================
// PANEL BEHAVIORS
// ================================================================
function renderBehPanel() {
  const nosel = document.getElementById('beh-no-sel');
  const cont  = document.getElementById('beh-content');
  const o     = selId ? objects.find(o => o.id === selId) : null;
  if (!o) { nosel.style.display = ''; cont.style.display = 'none'; return; }

  nosel.style.display = 'none'; cont.style.display = '';
  const grpCount = selIds.size > 1 ? selIds.size : 0;
  document.getElementById('beh-obj-label').innerHTML = grpCount > 0
    ? `Type: <b style="color:var(--accent)">${o.name}</b> <span style="color:var(--accent3)">× ${grpCount} instances</span>`
    : `Objet: <b style="color:var(--accent)">${o.name}</b> <span style="color:var(--dim)">#${o.id}</span>`;

  const list = document.getElementById('beh-list');
  list.innerHTML = '';

  (o.behaviors || []).forEach((b, bi) => {
    const def = BEH_CATALOG.find(x => x.type === b.type);
    if (!def) return;

    let propsHtml = '';
    def.props.forEach(p => {
      const val = b.props[p.n] !== undefined ? b.props[p.n] : p.def;
      propsHtml += `<div class="beh-prop"><div class="beh-lbl">${p.l}</div>`;

      if (p.t === 'sel')
        propsHtml += `<select class="beh-val" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)">${p.opts.map(x => `<option ${val === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      else if (p.t === 'obj')
        propsHtml += `<select class="beh-val" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)"><option value="">— Aucun —</option>${objects.filter(x => x.id !== o.id).map(x => `<option value="${x.id}" ${val == x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select>`;
      else if (p.t === 'var')
        propsHtml += `<select class="beh-val" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)"><option value="">—</option>${variables.map(v => `<option ${val === v.name ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`;
      else if (p.t === 'tmr')
        propsHtml += `<select class="beh-val" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)"><option value="">—</option>${timers.map(t => `<option ${val === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}</select>`;
      else if (p.t === 'key')
        propsHtml += `<input class="beh-val" value="${val}" placeholder="ArrowLeft, Space, KeyA…" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)">`;
      else if (p.t === 'color')
        propsHtml += `<input type="color" class="beh-val" value="${val}" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)">`;
      else if (p.t === 'num' || p.min !== undefined || p.max !== undefined)
        propsHtml += `<input class="beh-val" type="number" ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''} value="${val}" onchange="updBeh(${o.id},${bi},'${p.n}',+this.value)">`;
      else
        propsHtml += `<input class="beh-val" value="${val}" onchange="updBeh(${o.id},${bi},'${p.n}',this.value)">`;

      propsHtml += '</div>';
    });

    const card = document.createElement('div');
    card.className = 'beh-card';
    card.innerHTML = `
    <div class="beh-card-head" onclick="togBehCard(this)">
      <span class="beh-icon">${def.icon}</span>
      <span class="beh-label">${def.name}</span>
      <span style="font-size:9px;color:var(--dim);margin-right:8px;">${def.desc}</span>
      <span class="beh-edit" onclick="event.stopPropagation();togBehCard(this.parentElement)" title="Modifier">✏</span>
      <span class="beh-del" onclick="event.stopPropagation();delBeh(${o.id},${bi})">🗑</span>
    </div>
    <div class="beh-card-body">${propsHtml || '<div style="color:var(--dim);font-size:10px;">Aucun paramètre</div>'}</div>`;
    list.appendChild(card);
  });
  updSt();
}

function togBehCard(head) { head.nextElementSibling.classList.toggle('on'); }

function updBeh(objId, bi, prop, val) {
  const master = objects.find(o => o.id === objId);
  if (!master || !master.behaviors[bi]) return;
  const behType = master.behaviors[bi].type;
  // En mode groupe, propager la valeur à toutes les instances
  const targets = selIds.size > 1 ? [...selIds] : [objId];
  targets.forEach(id => {
    const o = objects.find(o => o.id === id);
    if (!o) return;
    const beh = o.behaviors.find(b => b.type === behType);
    if (beh) beh.props[prop] = val;
  });
}

function delBeh(objId, bi) {
  const master = objects.find(o => o.id === objId);
  if (!master || !master.behaviors[bi]) return;
  const behType = master.behaviors[bi].type;
  const targets = selIds.size > 1 ? [...selIds] : [objId];
  targets.forEach(id => {
    const o = objects.find(o => o.id === id);
    if (o) o.behaviors = o.behaviors.filter(b => b.type !== behType);
  });
  renderBehPanel(); renderSceneList();
  if (selIds.size > 1) showGroupProps(selId); else showProps(master);
}

function openBehPicker() {
  const o = selId ? objects.find(o => o.id === selId) : null;
  if (!o) return;
  const existing = new Set((o.behaviors || []).map(b => b.type));
  document.getElementById('bpick-grid').innerHTML = BEH_CATALOG.map(b => {
    const has = !b.multi && existing.has(b.type);
    return `<div class="bpick-item${has ? ' bpick-has' : ''}" onclick="${has ? '' : `addBeh(${selId},'${b.type}')`}">
      <div class="bpick-icon">${b.icon}</div>
      <div class="bpick-name">${b.name}${has ? ' ✓' : ''}</div>
      <div class="bpick-desc">${b.desc}</div>
    </div>`;
  }).join('');
  showDlg('dlg-beh');
}

function addBeh(objId, type) {
  const def = BEH_CATALOG.find(x => x.type === type);
  if (!def) return;
  const targets = selIds.size > 1 ? [...selIds] : [objId];
  targets.forEach(id => {
    const o = objects.find(o => o.id === id);
    if (!o) return;
    if (!o.behaviors) o.behaviors = [];
    if (!def.multi && o.behaviors.some(b => b.type === type)) return;
    const props = {};
    def.props.forEach(p => props[p.n] = p.def);
    const beh = { type, props };
    if (type === 'sine') {
      beh._phase = 0;
      beh._base  = { x:o.x, y:o.y, angle:o.angle, w:o.w, h:o.h, opacity:o.opacity };
    }
    o.behaviors.push(beh);
  });
  const master = objects.find(o => o.id === objId);
  closeDlg(); renderBehPanel(); renderSceneList();
  if (selIds.size > 1) showGroupProps(selId); else if (master) showProps(master);
}
