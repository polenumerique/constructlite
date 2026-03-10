// ================================================================
// events.js — Feuille d'événements style Construct 2
// ================================================================

// ----------------------------------------------------------------
// Conversion code clavier → label lisible
// ----------------------------------------------------------------
function _keyLabel(code) {
  if (!code) return '?';
  const m = {
    Space:'Espace', Enter:'Entrée', Escape:'Échap', Backspace:'Retour',
    Tab:'Tab', Delete:'Suppr', Insert:'Inser',
    ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓',
    ShiftLeft:'Shift G', ShiftRight:'Shift D',
    ControlLeft:'Ctrl G', ControlRight:'Ctrl D',
    AltLeft:'Alt G', AltRight:'Alt D',
    Home:'Début', End:'Fin', PageUp:'PgPréc', PageDown:'PgSuiv',
    NumpadEnter:'Pavé Entrée', NumpadAdd:'Pavé +', NumpadSubtract:'Pavé -',
    NumpadMultiply:'Pavé *', NumpadDivide:'Pavé /',
  };
  if (m[code]) return m[code];
  if (code.startsWith('Key'))    return code.slice(3);              // KeyA → A
  if (code.startsWith('Digit'))  return code.slice(5);              // Digit1 → 1
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);    // Numpad0 → Pavé 0
  if (/^F\d+$/.test(code))       return code;                       // F1-F12
  return code;
}

let _keyCaptureHandler = null;

function _startKeyCapture(paramName, btn) {
  // Annuler capture précédente si active
  if (_keyCaptureHandler) document.removeEventListener('keydown', _keyCaptureHandler, true);
  btn.classList.add('capturing');
  btn.querySelector('.key-badge').textContent = '🎹 Appuyez sur une touche…';

  _keyCaptureHandler = e => {
    // Ignorer les touches modificatrices seules
    if (['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    document.removeEventListener('keydown', _keyCaptureHandler, true);
    _keyCaptureHandler = null;
    btn.classList.remove('capturing');
    btn.querySelector('.key-badge').textContent = _keyLabel(e.code);
    const inp = document.getElementById('ep-' + paramName);
    if (inp) inp.value = e.code;
    _wParams[paramName] = e.code;
  };
  document.addEventListener('keydown', _keyCaptureHandler, true);

  // Annuler si clic en dehors
  setTimeout(() => {
    const cancel = e => {
      if (!btn.contains(e.target)) {
        document.removeEventListener('keydown', _keyCaptureHandler, true);
        document.removeEventListener('click', cancel, true);
        _keyCaptureHandler = null;
        btn.classList.remove('capturing');
        btn.querySelector('.key-badge').textContent = _wParams[paramName] ? _keyLabel(_wParams[paramName]) : 'Cliquer et appuyer…';
      }
    };
    document.addEventListener('click', cancel, true);
  }, 100);
}

// ----------------------------------------------------------------
// Formatage d'un chip (condition ou action)
// ----------------------------------------------------------------
function _chipObjLabel(objRef, cat) {
  if (objRef && String(objRef).startsWith('@')) {
    const master = objects.find(o => o.id == objRef.slice(1));
    return master ? master.name : objRef;
  }
  if (cat === 'keyboard') return 'Clavier';
  if (cat === 'audio')    return 'Audio';
  return 'Système';
}

function fmtChip(type, params, list, objRef) {
  const d = list.find(x => x.id === type);
  if (!d) return type;
  const objLabel = _chipObjLabel(objRef, d.cat);
  const ps = d.params.map(p => {
    let v = params?.[p.n] ?? '';
    if (p.t === 'objtype' || p.t === 'obj') {
      if (String(v).startsWith('@')) { const m = objects.find(o => o.id == v.slice(1)); v = `<b style="color:var(--accent5)">${m ? m.name : v}</b>`; }
      else { const o = objects.find(o => o.id == v); v = o ? `<b style="color:var(--accent3)">${o.name}</b>` : v; }
    } else if (p.t === 'key') v = `<b style="color:var(--accent4)">${_keyLabel(v)}</b>`;
    else if (p.t === 'var') v = `<b style="color:var(--accent4)">${v}</b>`;
    else if (p.t === 'tmr') v = `<b style="color:var(--accent3)">${v}</b>`;
    else v = `<b style="color:var(--accent4)">${v}</b>`;
    return `${p.l}:${v}`;
  }).join(' <span style="color:var(--dim)">·</span> ');
  return `<span class="chip-obj">${objLabel}</span><span class="chip-sep">▸</span><span>${d.label}</span>${ps ? ` <span style="font-size:10px;color:var(--dim)">→ ${ps}</span>` : ''}`;
}

// ----------------------------------------------------------------
// CRUD événements
// ----------------------------------------------------------------
function _mkEv() {
  return { id:geid(), type:'event', conditions:[], actions:[], subEvents:[] };
}
function addEv()      { events.push(_mkEv()); renderEvs(); updSt(); switchTab('ev'); }
function addStartEv() {
  const ev = _mkEv();
  ev.isStart = true;
  ev.conditions = [{ type:'start_layout', objRef:null, params:{}, negated:false }];
  events.push(ev); renderEvs(); updSt(); switchTab('ev');
}
function addGroup() {
  events.push({ id:geid(), type:'group', name:'Groupe', enabled:true, children:[] });
  renderEvs(); updSt();
}
function clearEvs() {
  if (confirm('Vider tous les événements ?')) { events = []; renderEvs(); updSt(); }
}

function _findEvAnywhere(id, list) {
  for (const ev of list) {
    if (ev.id === id) return { ev, list };
    if (ev.type === 'group') { const f = _findEvAnywhere(id, ev.children || []); if (f) return f; }
    if (ev.subEvents)        { const f = _findEvAnywhere(id, ev.subEvents);       if (f) return f; }
  }
  return null;
}

function delEv(id)    { const f = _findEvAnywhere(id, events); if (f) { f.list.splice(f.list.indexOf(f.ev), 1); renderEvs(); updSt(); } }
function delCond(eid, ci) {
  const f = _findEvAnywhere(eid, events); if (!f) return;
  f.ev.conditions.splice(ci, 1);
  if (!f.ev.conditions.some(c => c.type === 'start_layout')) f.ev.isStart = false;
  renderEvs();
}
function delAct(eid, ai)           { const f = _findEvAnywhere(eid, events); if (f) { f.ev.actions.splice(ai, 1); renderEvs(); } }
function toggleNot(eid, ci)        { const f = _findEvAnywhere(eid, events); if (!f) return; const c = f.ev.conditions[ci]; if (c) { c.negated = !c.negated; renderEvs(); updSt(); } }
function addSubEv(parentId)        { const f = _findEvAnywhere(parentId, events); if (!f) return; f.ev.subEvents.push(_mkEv()); renderEvs(); updSt(); }
function delSubEv(parentId, si)    { const f = _findEvAnywhere(parentId, events); if (!f) return; f.ev.subEvents.splice(si, 1); renderEvs(); updSt(); }
function setGroupEnabled(id, val)  { const f = _findEvAnywhere(id, events); if (f) { f.ev.enabled = val; updSt(); } }
function setGroupName(id, name)    { const f = _findEvAnywhere(id, events); if (f) { f.ev.name = name; updSt(); } }
function addEvInGroup(groupId)     { const f = _findEvAnywhere(groupId, events); if (!f) return; f.ev.children.push(_mkEv()); renderEvs(); updSt(); }

// ----------------------------------------------------------------
// Rendu de la feuille d'événements
// ----------------------------------------------------------------

/** Retire l'événement `evId` de sa liste parente et retourne [ev, liste] */
function _extractEv(evId) {
  // Chercher dans events racine
  let idx = events.findIndex(e => e.id === evId);
  if (idx !== -1) return [events.splice(idx, 1)[0], events, idx];
  // Chercher dans groupes et sub-events récursivement
  function search(list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === evId) return [list.splice(i, 1)[0], list, i];
      if (list[i].children) { const r = search(list[i].children); if (r) return r; }
      if (list[i].subEvents) { const r = search(list[i].subEvents); if (r) return r; }
    }
    return null;
  }
  return search(events);
}

/** Retourne la liste parente d'un événement (events racine, children d'un groupe, ou subEvents) */
function _getParentList(parentId) {
  if (parentId === null) return events;
  const f = _findEvAnywhere(parentId, events);
  if (!f) return null;
  if (f.ev.type === 'group') return f.ev.children;
  return f.ev.subEvents;
}

/** Crée une zone de drop entre événements */
function _mkDropZone(insertInto, insertIdx) {
  const dz = document.createElement('div');
  dz.className = 'ev-dropzone';
  dz.addEventListener('dragover', e => {
    if (!_dragEv) return;
    e.preventDefault();
    e.stopPropagation(); // empêche le bubble vers le row parent
    dz.classList.add('dz-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dz-over');
    if (!_dragEv) return;

    const draggedId = _dragEv.evId;

    // Interdire de dropper un event dans ses propres sub-events (récursivement)
    function isDescendant(ancestorId, targetContainerId) {
      const f = _findEvAnywhere(ancestorId, events);
      if (!f) return false;
      const subs = f.ev.subEvents || [];
      for (const s of subs) {
        if (s.id === targetContainerId) return true;
        if (isDescendant(s.id, targetContainerId)) return true;
      }
      return false;
    }
    if (insertInto !== null && (draggedId === insertInto || isDescendant(draggedId, insertInto))) return;

    const targetList = _getParentList(insertInto);
    if (!targetList) return;

    // Mémoriser si la source est dans la même liste et avant la cible
    const srcIdxInTarget = targetList.findIndex(e => e.id === draggedId);
    const extracted = _extractEv(draggedId);
    if (!extracted) return;
    const [moved] = extracted;

    // Corriger l'index si la source était dans la même liste avant la cible
    const correctedIdx = (srcIdxInTarget !== -1 && srcIdxInTarget < insertIdx)
      ? insertIdx - 1
      : insertIdx;
    const finalIdx = Math.min(Math.max(0, correctedIdx), targetList.length);
    targetList.splice(finalIdx, 0, moved);
    _dragEv = null;
    renderEvs(); updSt();
  });
  return dz;
}

function renderEvs() {
  const el = document.getElementById('ev-list');
  el.innerHTML = '';
  el.appendChild(_mkDropZone(null, 0));
  events.forEach((ev, idx) => {
    el.appendChild(_renderItem(ev, idx, null));
    el.appendChild(_mkDropZone(null, idx + 1));
  });

  // Bouton "+ Ajouter un événement" toujours présent en bas à gauche, style C2
  const addRow = document.createElement('div');
  addRow.className = 'ev-addrow';
  addRow.innerHTML = `
    <div class="ev-addrow-conds" onclick="addEv()">➕ Ajouter un événement</div>
    <div class="ev-addrow-acts"></div>`;
  el.appendChild(addRow);
  _updatePasteBtns();
}

function _renderItem(ev, idx, parentId) {
  return ev.type === 'group' ? _renderGroup(ev) : _renderEvRow(ev, idx, parentId);
}

function _renderGroup(grp) {
  const wrap = document.createElement('div');
  wrap.className = 'evgroup';
  wrap.draggable = true;
  wrap.innerHTML = `
    <div class="evgroup-header">
      <span class="ev-drag-handle" title="Glisser pour réordonner">⠿</span>
      <span class="evgroup-toggle" onclick="this.closest('.evgroup').classList.toggle('collapsed')">▾</span>
      <input class="evgroup-name" value="${grp.name || 'Groupe'}" onchange="setGroupName(${grp.id}, this.value)">
      <label class="evgroup-enabled">
        <input type="checkbox" ${grp.enabled !== false ? 'checked' : ''} onchange="setGroupEnabled(${grp.id}, this.checked)"> Actif
      </label>
      <button class="evbtn-sm" onclick="addEvInGroup(${grp.id})">+ Événement</button>
      <span class="evdel" onclick="delEv(${grp.id})" title="Supprimer le groupe">🗑</span>
    </div>
    <div class="evgroup-body" id="grp-body-${grp.id}"></div>`;
  wrap.addEventListener('dragstart', e => {
    if (e.target.closest('.evgroup-body')) return; // ne pas capturer si drag depuis enfant
    _dragEv = { evId: grp.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'ev');
    setTimeout(() => wrap.classList.add('ev-dragging'), 0);
  });
  wrap.addEventListener('dragend', () => { wrap.classList.remove('ev-dragging'); _dragEv = null; });
  const body = wrap.querySelector(`#grp-body-${grp.id}`);
  body.appendChild(_mkDropZone(grp.id, 0));
  (grp.children || []).forEach((child, ci) => {
    body.appendChild(_renderItem(child, ci, grp.id));
    body.appendChild(_mkDropZone(grp.id, ci + 1));
  });
  return wrap;
}

function _renderEvRow(ev, idx, parentId) {
  const row = document.createElement('div');
  row.className = 'evrow' + (ev.isStart ? ' ev-start' : '');
  row.draggable = true;

  // Conditions (+ menu contextuel clic-droit)
  let condsHtml = '';
  (ev.conditions || []).forEach((c, ci) => {
    condsHtml += `<div class="cchip" oncontextmenu="evCtxShow(event,'cond',${ev.id},${ci})">
      <span class="chi-not${c.negated ? ' active' : ''}" onclick="toggleNot(${ev.id},${ci})" title="Inverser">NOT</span>
      <span ondblclick="openWizard('cond','edit',${ev.id},${ci})">${fmtChip(c.type, c.params, CONDS, c.objRef)}</span>
      <span class="che" onclick="openWizard('cond','edit',${ev.id},${ci})" title="Modifier">✏</span>
      <span class="chd" onclick="delCond(${ev.id},${ci})">×</span>
    </div>`;
  });

  const cHead = ev.isStart ? '🟢 DÉCLENCHEUR' : 'CONDITIONS';
  row.innerHTML = `
  <div class="evrow-in">
    <div class="evconds">
      <div class="evsh evsh-c"><span class="ev-drag-handle" title="Glisser pour réordonner">⠿</span>${cHead}</div>
      <div class="evitems">${condsHtml || '<span class="ev-empty">Aucune — toujours vrai</span>'}</div>
      ${ev.isStart ? '' : `
        <button class="addbtn c" onclick="openWizard('cond','add',${ev.id})">+ Condition</button>
        <button class="addbtn c paste-btn" id="cpaste-${ev.id}" onclick="evCtxPasteEnd('cond',${ev.id})" style="display:none">📌 Coller</button>`}
    </div>
    <div class="evacts">
      <div class="evsh evsh-a">ACTIONS</div>
      <div class="evitems" id="actlist-${ev.id}"></div>
      <button class="addbtn a" onclick="openWizard('act','add',${ev.id})">+ Action</button>
      <button class="addbtn a paste-btn" id="apaste-${ev.id}" onclick="evCtxPasteEnd('act',${ev.id})" style="display:none">📌 Coller</button>
    </div>
  </div>
  <div class="ev-subevents" id="subs-${ev.id}"></div>
  <div class="evfoot">
    <span class="evnum">Evt ${idx + 1} · ID ${ev.id}${ev.isStart ? ' · 🟢 On Start' : ''}</span>
    <span class="evfoot-actions">
      ${parentId === null ? `<span class="evbtn-sm" onclick="addSubEv(${ev.id})">↳ Sub-event</span>` : ''}
      <span class="evdel" onclick="delEv(${ev.id})">🗑</span>
    </span>
  </div>`;

  // Drag de l'événement entier
  row.addEventListener('dragstart', e => {
    if (e.target.closest('.achip') || e.target.closest('.cchip')) return;
    // Bloquer si le drag vient d'un sub-event enfant (pas de ce row lui-même)
    const closestSub = e.target.closest('.ev-sub');
    if (closestSub && closestSub !== row) return;
    if (e.target.closest('.evdel') || e.target.closest('.addbtn') || e.target.closest('.evbtn-sm') || e.target.closest('.evfoot-actions')) {
      e.preventDefault(); return;
    }
    _dragEv = { evId: ev.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'ev');
    setTimeout(() => row.classList.add('ev-dragging'), 0);
  });
  row.addEventListener('dragend', () => { row.classList.remove('ev-dragging'); _dragEv = null; });

  // Actions — drag cross-event + menu contextuel clic-droit
  const actList = row.querySelector(`#actlist-${ev.id}`);
  if (!(ev.actions || []).length) {
    actList.innerHTML = '<span class="ev-empty">Aucune action</span>';
  } else {
    ev.actions.forEach((a, ai) => {
      const chip = document.createElement('div');
      chip.className = 'achip';
      chip.draggable = true;
      chip.innerHTML = `<span class="chi">▶</span><span>${fmtChip(a.type, a.params, ACTS, a.objRef)}</span><span class="che" title="Modifier">✏</span><span class="chd">×</span>`;
      chip.ondblclick = () => openWizard('act', 'edit', ev.id, ai);
      chip.querySelector('.che').onclick = e => { e.stopPropagation(); openWizard('act', 'edit', ev.id, ai); };
      chip.querySelector('.chd').onclick = e => { e.stopPropagation(); delAct(ev.id, ai); };

      // Drag : module-level _dragAct pour le drag cross-event
      chip.addEventListener('dragstart', e => {
        _dragAct = { evId: ev.id, ai };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'act');
        setTimeout(() => chip.classList.add('chip-dragging'), 0);
      });
      chip.addEventListener('dragend', () => { chip.classList.remove('chip-dragging'); _dragAct = null; });
      chip.addEventListener('dragover', e => {
        e.preventDefault();
        if (_dragAct && !(_dragAct.evId === ev.id && _dragAct.ai === ai)) chip.classList.add('chip-over');
      });
      chip.addEventListener('dragleave', () => chip.classList.remove('chip-over'));
      chip.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        chip.classList.remove('chip-over');
        if (!_dragAct) return;
        const { evId: srcEvId, ai: srcAi } = _dragAct;
        if (srcEvId === ev.id && srcAi === ai) return;
        const srcFound = _findEvAnywhere(srcEvId, events);
        if (!srcFound) return;
        const moved = srcFound.ev.actions.splice(srcAi, 1)[0];
        // Si même événement, corriger l'index après splice
        ev.actions.splice(srcEvId === ev.id && srcAi < ai ? ai - 1 : ai, 0, moved);
        renderEvs(); updSt();
      });

      // Menu contextuel clic-droit
      chip.addEventListener('contextmenu', e => evCtxShow(e, 'act', ev.id, ai));

      actList.appendChild(chip);
    });
  }

  // Zone de drop sur le container actList (pour déposer en fin de liste)
  actList.addEventListener('dragover', e => { e.preventDefault(); });
  actList.addEventListener('drop', e => {
    if (!_dragAct) return;
    e.preventDefault();
    const { evId: srcEvId, ai: srcAi } = _dragAct;
    const srcFound = _findEvAnywhere(srcEvId, events);
    if (!srcFound) return;
    const moved = srcFound.ev.actions.splice(srcAi, 1)[0];
    ev.actions.push(moved);
    renderEvs(); updSt();
  });

  // Sub-events
  const subsEl = row.querySelector(`#subs-${ev.id}`);
  subsEl.appendChild(_mkDropZone(ev.id, 0));
  (ev.subEvents || []).forEach((sub, si) => {
    const subRow = _renderEvRow(sub, si, ev.id);
    subRow.classList.add('ev-sub');
    subsEl.appendChild(subRow);
    subsEl.appendChild(_mkDropZone(ev.id, si + 1));
  });

  return row;
}

// ----------------------------------------------------------------
// WIZARD — Style Construct 2 : panneau gauche (objets) + droit
// ----------------------------------------------------------------
let _wMode    = null;  // 'cond' | 'act'
let _wOp      = null;  // 'add' | 'edit'
let _wEvId    = null;
let _wEditIdx = null;
let _wCat     = null;  // 'system' | 'keyboard' | 'audio' | 'obj_'+typeId
let _wObjRef  = null;  // '@typeId' ou null
let _wType    = null;  // id de la condition/action sélectionnée
let _wParams  = {};    // valeurs des paramètres en cours

// --- État drag cross-event et presse-papiers ---
let _dragAct     = null; // { evId, ai } — action en cours de glissement
let _dragEv      = null; // { evId, parentId } — événement en cours de glissement
let _clipboard   = null; // { kind:'act'|'cond', item:{...} }
let _evCtxTarget = null; // { kind, evId, idx } — cible du menu contextuel

// Catégories système toujours présentes
function _sysWizCats() {
  if (_wMode === 'cond') {
    return [
      { id:'system',   name:'Système', icon:'⚙️' },
      { id:'keyboard', name:'Clavier', icon:'⌨️' },
    ];
  }
  return [
    { id:'system', name:'Système', icon:'⚙️' },
    { id:'audio',  name:'Audio',   icon:'🔊' },
  ];
}

// Déterminer la catégorie d'un type/objRef existant (pour édition)
function _wizGuessCat(type, objRef) {
  if (objRef && String(objRef).startsWith('@')) return 'obj_' + objRef.slice(1);
  const d = [...CONDS, ...ACTS].find(x => x.id === type);
  return d ? d.cat : 'system';
}

// Conditions/actions disponibles pour la catégorie sélectionnée
function _wizItems() {
  const list = _wMode === 'cond' ? CONDS : ACTS;
  if (_wCat && _wCat.startsWith('obj_')) {
    const ids = _wMode === 'cond' ? OBJ_COND_IDS : OBJ_ACT_IDS;
    return ids.map(id => list.find(x => x.id === id)).filter(Boolean);
  }
  return list.filter(x => x.cat === _wCat);
}

function openWizard(mode, op, evId, editIdx) {
  _wMode = mode; _wOp = op; _wEvId = evId; _wEditIdx = editIdx ?? null;
  _wCat = null; _wObjRef = null; _wType = null; _wParams = {};

  if (op === 'edit' && editIdx !== null) {
    const found = _findEvAnywhere(evId, events);
    if (found) {
      const item = (mode === 'cond' ? found.ev.conditions : found.ev.actions)[editIdx];
      if (item) {
        _wObjRef = item.objRef ?? null;
        _wType   = item.type;
        _wParams = { ...(item.params || {}) };
        _wCat    = _wizGuessCat(item.type, _wObjRef);
      }
    }
  }

  document.getElementById('dlg-e-title').textContent =
    op === 'edit'
      ? (mode === 'cond' ? 'Modifier la Condition' : "Modifier l'Action")
      : (mode === 'cond' ? 'Ajouter une Condition' : 'Ajouter une Action');

  _drawWizard();
  showDlg('dlg-e');
}

function _drawWizard() {
  const sysCats   = _sysWizCats();
  const objTypes  = objects.filter(o => o.typeId === o.id);
  const items     = _wCat ? _wizItems() : [];
  const acol      = _wMode === 'cond' ? 'var(--accent2)' : 'var(--accent)';

  // --- Panneau gauche : liste des objets ---
  let leftHtml = `<div class="wiz-section-label">${_wMode === 'cond' ? 'CONDITIONS' : 'ACTIONS'}</div>`;
  sysCats.forEach(cat => {
    const active = _wCat === cat.id;
    leftHtml += `<div class="wiz-obj-item${active ? ' active' : ''}" onclick="_wSelCat('${cat.id}')">
      <span class="wiz-obj-icon">${cat.icon}</span><span>${cat.name}</span>
    </div>`;
  });
  if (objTypes.length > 0) {
    leftHtml += `<div class="wiz-separator">── Scène ──</div>`;
    objTypes.forEach(t => {
      const catId = 'obj_' + t.id;
      const active = _wCat === catId;
      const thumb  = (t.frames?.[0]?.dataURL || t.imageData) ? `<img src="${t.frames?.[0]?.dataURL || t.imageData}" class="wiz-obj-thumb">` : `<span class="wiz-obj-swatch" style="background:${t.color || '#5b8fff'}"></span>`;
      leftHtml += `<div class="wiz-obj-item${active ? ' active' : ''}" onclick="_wSelCat('${catId}')">
        ${thumb}<span>${t.name}</span>
      </div>`;
    });
  }

  // --- Panneau droit : liste + params ---
  let rightHtml = '';
  if (!_wCat) {
    rightHtml = `<div class="wiz-right-empty">← Sélectionnez un objet ou une catégorie</div>`;
  } else {
    const sectionLabel = _wMode === 'cond' ? 'CONDITIONS DISPONIBLES' : 'ACTIONS DISPONIBLES';
    rightHtml = `<div class="wiz-section-label">${sectionLabel}</div>
    <div class="wiz-item-list">`;
    items.forEach(item => {
      const active = _wType === item.id;
      rightHtml += `<div class="wiz-cond-item${active ? ' active' : ''}" onclick="_wSelType('${item.id}')" style="${active ? '--acol:' + acol : ''}">
        ${item.label}
      </div>`;
    });
    if (!items.length) rightHtml += `<div class="wiz-empty">Aucun élément disponible</div>`;
    rightHtml += `</div>`;

    // Params (si une condition/action est sélectionnée)
    if (_wType) {
      const d = (_wMode === 'cond' ? CONDS : ACTS).find(x => x.id === _wType);
      if (d && d.params.length > 0) {
        rightHtml += `<div class="wiz-params"><div class="wiz-section-label">PARAMÈTRES</div>`;
        d.params.forEach(p => { rightHtml += _buildParamField(p); });
        rightHtml += `</div>`;
      }
    }
  }

  document.getElementById('dlg-e-body').innerHTML =
    `<div class="wiz-dialog"><div class="wiz-left">${leftHtml}</div><div class="wiz-right">${rightHtml}</div></div>`;

  // Injecter les valeurs texte après rendu (évite encodage HTML)
  if (_wType) {
    const d = (_wMode === 'cond' ? CONDS : ACTS).find(x => x.id === _wType);
    if (d) d.params.forEach(p => {
      const el = document.getElementById('ep-' + p.n);
      if (el && (p.t === 'text' || p.t === 'num')) el.value = _wParams[p.n] ?? '';
    });
  }

  const okBtn = document.getElementById('dlg-e-ok');
  okBtn.style.display = _wType ? '' : 'none';
  okBtn.textContent   = _wOp === 'edit' ? '✓ Modifier' : '✓ Ajouter';
  okBtn.onclick       = _confWizard;
}

function _buildParamField(p) {
  const pv = _wParams[p.n] ?? '';
  let html = `<div class="pr" style="margin-bottom:9px;"><div class="pl">${p.l}</div>`;

  if (p.t === 'objtype') {
    // Sélecteur visuel de type d'objet (pour objB dans obj_overlaps)
    const types = objects.filter(o => o.typeId === o.id);
    html += `<div class="wiz-objtype-picker">`;
    types.forEach(t => {
      const val = '@' + t.id;
      html += `<div class="wiz-objtype-btn${pv === val ? ' sel' : ''}" onclick="_wSetObjType('${p.n}','${val}',this)">${t.name}</div>`;
    });
    if (!types.length) html += `<span style="color:var(--dim);font-size:11px">Aucun objet dans la scène</span>`;
    html += `</div><input type="hidden" id="ep-${p.n}" value="${pv}">`;
  } else if (p.t === 'var') {
    html += `<select class="pi" id="ep-${p.n}"><option value="">—</option>${variables.map(v => `<option ${pv === v.name ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`;
  } else if (p.t === 'tmr') {
    html += `<select class="pi" id="ep-${p.n}"><option value="">—</option>${timers.map(t => `<option ${pv === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}</select>`;
  } else if (p.t === 'sel') {
    html += `<select class="pi" id="ep-${p.n}">${p.opts.map(o => `<option ${pv === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  } else if (p.t === 'key') {
    const label = pv ? _keyLabel(pv) : 'Cliquer et appuyer…';
    html += `<div class="key-capture" onclick="_startKeyCapture('${p.n}', this)">
      <span class="key-badge">${label}</span>
    </div><input type="hidden" id="ep-${p.n}" value="${pv || ''}">`;
  } else if (p.t === 'color') {
    html += `<input type="color" class="pi" id="ep-${p.n}" value="${pv || '#5b8fff'}">`;
  } else if (p.t === 'num') {
    html += `<input type="number" class="pi" id="ep-${p.n}" value="${pv !== '' ? pv : 0}">`;
  } else {
    html += `<input class="pi" id="ep-${p.n}" placeholder="${p.l}" value=""
      oninput="_varSuggest(this,'${p.n}')" onblur="_varHide('${p.n}')"
      onkeydown="if(event.key==='Escape')_varHide('${p.n}')">`;
  }

  return html + '</div>';
}

const _BUILTIN_TOKENS = [
  { name:'time',  hint:'heure actuelle' },
  { name:'date',  hint:'date courte' },
  { name:'today', hint:'date longue' },
];

function _vsPopup() {
  let el = document.getElementById('vs-global');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vs-global';
    el.className = 'var-suggest';
    document.body.appendChild(el);
  }
  return el;
}

// Fermer avec Échap globalement
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const v = document.getElementById('vs-global'); if (v) v.style.display = 'none'; }
});

function _varSuggest(inp, paramName) {
  _wParams[paramName] = inp.value;
  const pos    = inp.selectionStart;
  const before = inp.value.slice(0, pos);
  const m      = before.match(/\{(\w*)$/);
  const vsEl   = _vsPopup();
  vsEl.dataset.param = paramName;
  if (!m) { vsEl.style.display = 'none'; return; }
  const q    = m[1].toLowerCase();
  const hits = [
    ..._BUILTIN_TOKENS.filter(t => t.name.startsWith(q)).map(t => ({ name:t.name, hint:t.hint, builtin:true })),
    ...variables.filter(v => v.name.toLowerCase().startsWith(q)).map(v => ({ name:v.name, hint:v.type, builtin:false })),
  ];
  if (!hits.length) { vsEl.style.display = 'none'; return; }
  const rect = inp.getBoundingClientRect();
  vsEl.style.top   = (rect.bottom + 2) + 'px';
  vsEl.style.left  = rect.left + 'px';
  vsEl.style.width = rect.width + 'px';
  vsEl.innerHTML = hits.map(h =>
    `<div class="vs-item${h.builtin ? ' vs-bi' : ''}" onmousedown="_varInsert('${paramName}','${h.name}')">
      <span>${h.builtin ? '⏱' : '📊'}</span>
      <b>${h.name}</b>
      <span class="vs-hint">${h.hint}</span>
    </div>`
  ).join('');
  vsEl.style.display = 'block';
}

function _varInsert(paramName, token) {
  const inp = document.getElementById('ep-' + paramName);
  if (!inp) return;
  const pos    = inp.selectionStart;
  const before = inp.value.slice(0, pos);
  const after  = inp.value.slice(pos);
  const m      = before.match(/\{(\w*)$/);
  if (!m) return;
  inp.value = before.slice(0, pos - m[0].length) + '{' + token + '}' + after;
  _wParams[paramName] = inp.value;
  const vsEl = document.getElementById('vs-global');
  if (vsEl) vsEl.style.display = 'none';
  inp.focus();
}

function _varHide(paramName) {
  setTimeout(() => {
    const vsEl = document.getElementById('vs-global');
    if (vsEl && vsEl.dataset.param === paramName) vsEl.style.display = 'none';
  }, 150);
}

function _wSelCat(catId) {
  _wCat    = catId;
  _wObjRef = catId.startsWith('obj_') ? '@' + catId.slice(4) : null;
  _wType   = null;
  _wParams = {};
  _drawWizard();
}

function _wSelType(typeId) {
  _wType = typeId;
  // Garder les params existants qui correspondent aux nouveaux params
  const d = (_wMode === 'cond' ? CONDS : ACTS).find(x => x.id === typeId);
  const newP = {};
  if (d) d.params.forEach(p => { newP[p.n] = _wParams[p.n] ?? ''; });
  _wParams = newP;
  _drawWizard();
}

function _wSetObjType(paramName, val, el) {
  _wParams[paramName] = val;
  el.closest('.wiz-objtype-picker').querySelectorAll('.wiz-objtype-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  const inp = document.getElementById('ep-' + paramName);
  if (inp) inp.value = val;
}

function _confWizard() {
  if (!_wType) return;
  const d = (_wMode === 'cond' ? CONDS : ACTS).find(x => x.id === _wType);
  const params = {};
  if (d) d.params.forEach(p => { const el = document.getElementById('ep-' + p.n); if (el) params[p.n] = el.value; });
  // Récupérer valeurs hidden (objtype)
  if (d) d.params.filter(p => p.t === 'objtype').forEach(p => { params[p.n] = _wParams[p.n] || ''; });

  const found = _findEvAnywhere(_wEvId, events);
  if (!found) return;
  const ev = found.ev;

  if (_wMode === 'cond') {
    const cond = { type:_wType, objRef:_wObjRef, params, negated:false };
    if (_wEditIdx !== null) ev.conditions[_wEditIdx] = cond;
    else { ev.conditions.push(cond); if (_wType === 'start_layout') ev.isStart = true; }
  } else {
    const act = { type:_wType, objRef:_wObjRef, params };
    if (_wEditIdx !== null) ev.actions[_wEditIdx] = act;
    else ev.actions.push(act);
  }

  closeDlg(); renderEvs(); updSt();
}

// ----------------------------------------------------------------
// MENU CONTEXTUEL — conditions et actions
// ----------------------------------------------------------------
function evCtxShow(e, kind, evId, idx) {
  e.preventDefault(); e.stopPropagation();
  _evCtxTarget = { kind, evId, idx };
  const canPaste = _clipboard?.kind === kind;
  document.getElementById('ev-ctx-paste').style.display = canPaste ? '' : 'none';
  const m = document.getElementById('ev-ctx');
  m.style.left = e.clientX + 'px';
  m.style.top  = e.clientY + 'px';
  m.classList.add('on');
}

document.addEventListener('click', () => document.getElementById('ev-ctx')?.classList.remove('on'));

function evCtxCopy() {
  if (!_evCtxTarget) return;
  const { kind, evId, idx } = _evCtxTarget;
  const f = _findEvAnywhere(evId, events);
  if (!f) return;
  const arr = kind === 'act' ? f.ev.actions : f.ev.conditions;
  _clipboard = { kind, item: JSON.parse(JSON.stringify(arr[idx])) };
  document.getElementById('ev-ctx').classList.remove('on');
  _updatePasteBtns();
}

function evCtxCut() {
  if (!_evCtxTarget) return;
  const { kind, evId, idx } = _evCtxTarget;
  const f = _findEvAnywhere(evId, events);
  if (!f) return;
  const arr = kind === 'act' ? f.ev.actions : f.ev.conditions;
  _clipboard = { kind, item: JSON.parse(JSON.stringify(arr[idx])) };
  arr.splice(idx, 1);
  if (kind === 'cond' && !f.ev.conditions.some(c => c.type === 'start_layout')) f.ev.isStart = false;
  document.getElementById('ev-ctx').classList.remove('on');
  renderEvs(); updSt(); _updatePasteBtns();
}

function evCtxDup() {
  if (!_evCtxTarget) return;
  const { kind, evId, idx } = _evCtxTarget;
  const f = _findEvAnywhere(evId, events);
  if (!f) return;
  const arr = kind === 'act' ? f.ev.actions : f.ev.conditions;
  arr.splice(idx + 1, 0, JSON.parse(JSON.stringify(arr[idx])));
  document.getElementById('ev-ctx').classList.remove('on');
  renderEvs(); updSt();
}

function evCtxPaste() {
  if (!_evCtxTarget || !_clipboard) return;
  const { kind, evId, idx } = _evCtxTarget;
  if (_clipboard.kind !== kind) return;
  const f = _findEvAnywhere(evId, events);
  if (!f) return;
  const arr = kind === 'act' ? f.ev.actions : f.ev.conditions;
  arr.splice(idx, 0, JSON.parse(JSON.stringify(_clipboard.item)));
  if (kind === 'cond' && _clipboard.item.type === 'start_layout') f.ev.isStart = true;
  document.getElementById('ev-ctx').classList.remove('on');
  renderEvs(); updSt();
}

function evCtxPasteEnd(kind, evId) {
  if (!_clipboard || _clipboard.kind !== kind) return;
  const f = _findEvAnywhere(evId, events);
  if (!f) return;
  const arr = kind === 'act' ? f.ev.actions : f.ev.conditions;
  arr.push(JSON.parse(JSON.stringify(_clipboard.item)));
  if (kind === 'cond' && _clipboard.item.type === 'start_layout') f.ev.isStart = true;
  renderEvs(); updSt();
}

function evCtxDel() {
  if (!_evCtxTarget) return;
  const { kind, evId, idx } = _evCtxTarget;
  if (kind === 'act') delAct(evId, idx); else delCond(evId, idx);
  document.getElementById('ev-ctx').classList.remove('on');
}

function _updatePasteBtns() {
  document.querySelectorAll('[id^="apaste-"]').forEach(btn => {
    btn.style.display = _clipboard?.kind === 'act'  ? '' : 'none';
  });
  document.querySelectorAll('[id^="cpaste-"]').forEach(btn => {
    btn.style.display = _clipboard?.kind === 'cond' ? '' : 'none';
  });
}
