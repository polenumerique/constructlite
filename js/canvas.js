// ================================================================
// canvas.js — Rendu éditeur, interactions souris, menu contextuel
// ================================================================

const gcvs = document.getElementById('gcvs');
const gctx = gcvs.getContext('2d');
const imgCache = {};

let cvZoom = 1.0;

function setCvZoom(z) {
  cvZoom = Math.max(0.1, Math.min(8, z));
  gcvs.style.transform = `translate(-50%, -50%) scale(${cvZoom})`;
  const lbl = document.getElementById('zoom-lbl');
  if (lbl) lbl.textContent = Math.round(cvZoom * 100) + '%';
}

function cachedImg(src) {
  if (!imgCache[src]) { const i = new Image(); i.src = src; imgCache[src] = i; }
  return imgCache[src];
}

// ----------------------------------------------------------------
// Rendu d'un objet — partagé entre éditeur et runtime
// ----------------------------------------------------------------
// Compteurs de frame pour l'animation dans l'éditeur
const _animTick = {};
let   _animLastMs = 0;
function tickAnimations(now) {
  const dt = now - (_animLastMs || now);
  _animLastMs = now;
  objects.forEach(o => {
    if (!o.frames || o.frames.length <= 1) return;
    if (!_animTick[o.id]) _animTick[o.id] = { fr: 0, acc: 0 };
    const fps = o.animFps || 8;
    _animTick[o.id].acc += dt;
    if (_animTick[o.id].acc >= 1000 / fps) {
      _animTick[o.id].acc  = 0;
      _animTick[o.id].fr   = (_animTick[o.id].fr + 1) % o.frames.length;
    }
  });
}

function drawObject(ctx, o, runtimeFr, focused) {
  if (o.type === 'sprite') {
    // Déterminer quelle frame afficher
    let src = o.imageData;
    if (o.frames && o.frames.length > 0) {
      const fi = runtimeFr !== undefined
        ? runtimeFr % o.frames.length
        : (_animTick[o.id]?.fr || 0);
      src = o.frames[fi]?.dataURL || o.frames[0]?.dataURL || o.imageData;
    }
    if (src) {
      const i = cachedImg(src);
      if (i.complete && i.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(i, 0, 0, o.w, o.h);
      }
      else i.onload = renderCvs;
    } else {
      ctx.fillStyle = typeColor[o.libType] || o.color;
      ctx.fillRect(0, 0, o.w, o.h);
      if (typeIcon[o.libType]) {
        ctx.font = `${Math.min(o.w, o.h) * .5}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(typeIcon[o.libType], o.w / 2, o.h / 2);
      }
    }
  } else if (o.type === 'button') {
    ctx.fillStyle = o.bgColor || '#5b8fff';
    ctx.beginPath(); ctx.roundRect(0, 0, o.w, o.h, 5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${o.fontSize}px Syne`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.text, o.w / 2, o.h / 2);
  } else if (o.type === 'label') {
    ctx.fillStyle = o.fontColor || '#fff';
    ctx.font = `${o.fontSize}px Syne`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(o.text, 0, 0);
  } else if (o.type === 'textedit') {
    ctx.fillStyle = o.bgColor || '#ffffff';
    ctx.strokeStyle = focused ? '#5b8fff' : (o.borderColor || '#aaaaaa');
    ctx.lineWidth = focused ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(0, 0, o.w, o.h, 4); ctx.fill(); ctx.stroke();
    const pad = 8;
    ctx.font = `${o.fontSize || 13}px Syne`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (o.text) {
      ctx.fillStyle = o.fontColor || '#333333';
      ctx.fillText(o.text, pad, o.h / 2);
    } else {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(o.placeholder || 'Saisissez...', pad, o.h / 2);
    }
    // Curseur clignotant quand focalisé
    if (focused && Math.floor(Date.now() / 530) % 2 === 0) {
      const tw = ctx.measureText(o.text || '').width;
      const cx = pad + tw + 1;
      ctx.strokeStyle = o.fontColor || '#333333';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, o.h * .2); ctx.lineTo(cx, o.h * .8); ctx.stroke();
    }
  }
}

// ----------------------------------------------------------------
// Rendu de la scène dans l'éditeur
// ----------------------------------------------------------------
function applyGameSize(w, h) {
  gameSettings.width  = Math.max(200, Math.min(3000, w | 0));
  gameSettings.height = Math.max(100, Math.min(2000, h | 0));
  gcvs.width  = gameSettings.width;
  gcvs.height = gameSettings.height;
  renderCvs();
  showProps(null);
}

// ----------------------------------------------------------------
// Grille et snap
// ----------------------------------------------------------------
function snapG(v) {
  const g = gameSettings.grid;
  if (!g.enabled || !g.snap) return v | 0;
  const sz = Math.max(4, g.size | 0);
  return Math.round(v / sz) * sz;
}

function renderGrid() {
  const g = gameSettings.grid;
  if (!g.enabled) return;
  const sz = Math.max(4, g.size | 0);
  // Contraste adaptatif selon la luminosité du fond
  const hex = gameSettings.bgColor.replace('#', '');
  const r = parseInt(hex.slice(0,2),16), gr2 = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  const lum = (0.299*r + 0.587*gr2 + 0.114*b) / 255;
  const line = lum > 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
  gctx.save();
  gctx.strokeStyle = line;
  gctx.lineWidth = 1;
  gctx.beginPath();
  for (let x = 0; x <= gcvs.width; x += sz) { gctx.moveTo(x + .5, 0); gctx.lineTo(x + .5, gcvs.height); }
  for (let y = 0; y <= gcvs.height; y += sz) { gctx.moveTo(0, y + .5); gctx.lineTo(gcvs.width, y + .5); }
  gctx.stroke();
  gctx.restore();
}

function toggleGrid() {
  gameSettings.grid.enabled = !gameSettings.grid.enabled;
  const btn = document.getElementById('grid-toggle-btn');
  btn.classList.toggle('active', gameSettings.grid.enabled);
  document.getElementById('grid-snap-chk').disabled = !gameSettings.grid.enabled;
}

function setGridSize(v) {
  gameSettings.grid.size = Math.max(4, Math.min(256, v | 0)) || 32;
}

function toggleSnap(v) {
  gameSettings.grid.snap = v;
}

function syncGridUI() {
  const g = gameSettings.grid;
  document.getElementById('grid-toggle-btn').classList.toggle('active', g.enabled);
  document.getElementById('grid-size-inp').value = g.size ?? 32;
  const chk = document.getElementById('grid-snap-chk');
  chk.checked  = g.snap ?? true;
  chk.disabled = !g.enabled;
}

function renderCvs(now) {
  tickAnimations(now || performance.now());
  gctx.clearRect(0, 0, gcvs.width, gcvs.height);
  gctx.fillStyle = gameSettings.bgColor;
  gctx.fillRect(0, 0, gcvs.width, gcvs.height);
  renderGrid();

  [...objects].sort((a, b) => a.zIndex - b.zIndex).forEach(o => {
    if (!o.visible) return;
    gctx.save();
    gctx.globalAlpha = o.opacity;
    gctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    gctx.rotate(o.angle * Math.PI / 180);
    gctx.translate(-o.w / 2, -o.h / 2);

    drawObject(gctx, o);

    // Badge du premier behavior
    if (o.behaviors?.length > 0) {
      const bdef = BEH_CATALOG.find(b => b.type === o.behaviors[0].type);
      if (bdef) {
        gctx.globalAlpha = .8;
        gctx.font = '10px Syne'; gctx.fillStyle = 'rgba(192,132,252,.9)';
        gctx.textAlign = 'right'; gctx.textBaseline = 'bottom';
        gctx.fillText(bdef.icon + ' ' + bdef.name, o.w - 2, o.h - 2);
      }
    }

    // Contour de sélection + poignée de redimensionnement
    if (selIds.has(o.id)) {
      gctx.globalAlpha = 1;
      const isFocused = o.id === selId;
      gctx.strokeStyle = isFocused ? '#5b8fff' : 'rgba(91,143,255,.55)';
      gctx.lineWidth = 2; gctx.setLineDash([4, 3]);
      gctx.strokeRect(-2, -2, o.w + 4, o.h + 4); gctx.setLineDash([]);
      if (isFocused && selIds.size === 1) {
        gctx.fillStyle = '#5b8fff'; gctx.fillRect(o.w - 4, o.h - 4, 9, 9);
      }
    }
    gctx.restore();
  });
}

// ----------------------------------------------------------------
// Réordonnancement Z
// ----------------------------------------------------------------
function moveObjZ(id, dir) {
  const sorted = [...objects].sort((a, b) => a.zIndex - b.zIndex);
  const idx    = sorted.findIndex(o => o.id === id);
  const swap   = idx + dir;
  if (swap < 0 || swap >= sorted.length) return;
  [sorted[idx].zIndex, sorted[swap].zIndex] = [sorted[swap].zIndex, sorted[idx].zIndex];
  renderSceneList(); renderCvs();
}

// ----------------------------------------------------------------
// Rendu de la liste de scène
// ----------------------------------------------------------------
let _slDragId = null;

function renderSceneList() {
  const el     = document.getElementById('scene-list');
  el.innerHTML = '';
  const sorted = [...objects].sort((a, b) => b.zIndex - a.zIndex); // plus haut zIndex en tête

  sorted.forEach((o, listIdx) => {
    const d = document.createElement('div');
    d.className = 'si' + (selIds.has(o.id) ? ' sel' : '');
    d.draggable  = true;
    d.dataset.id = o.id;
    d.onclick    = e => {
      if (e.shiftKey) {
        if (selIds.has(o.id)) { selIds.delete(o.id); selId = selIds.size > 0 ? [...selIds].at(-1) : null; }
        else                  { selIds.add(o.id);    selId = o.id; }
        renderSceneList(); renderCvs();
        updateMultiSelProps();
        if (document.getElementById('rp-beh').classList.contains('on')) renderBehPanel();
      } else { selectObj(o.id); }
    };
    d.ondblclick = () => { if (o.type === 'sprite') openPx(o.id); };

    d.addEventListener('dragstart', e => {
      _slDragId = o.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => d.classList.add('si-dragging'), 0);
    });
    d.addEventListener('dragend', () => {
      _slDragId = null;
      document.querySelectorAll('.si-dragging, .si-over').forEach(el => {
        el.classList.remove('si-dragging', 'si-over');
      });
    });
    d.addEventListener('dragover', e => {
      e.preventDefault();
      if (_slDragId !== o.id) d.classList.add('si-over');
    });
    d.addEventListener('dragleave', () => d.classList.remove('si-over'));
    d.addEventListener('drop', e => {
      e.preventDefault();
      d.classList.remove('si-over');
      if (_slDragId === null || _slDragId === o.id) return;
      const dragObj = objects.find(x => x.id === _slDragId);
      const dropObj = objects.find(x => x.id === o.id);
      if (!dragObj || !dropObj) return;
      // Échanger les zIndex
      [dragObj.zIndex, dropObj.zIndex] = [dropObj.zIndex, dragObj.zIndex];
      renderSceneList(); renderCvs();
    });

    const th = document.createElement('div');
    th.className = 'sithumb';
    if (o.imageData) {
      const c = document.createElement('canvas');
      c.width = 26; c.height = 26; c.style.imageRendering = 'pixelated';
      const tc = c.getContext('2d');
      const i  = new Image(); i.src = o.imageData;
      i.onload = () => { tc.imageSmoothingEnabled = false; tc.drawImage(i, 0, 0, 26, 26); };
      th.appendChild(c);
    } else {
      if (o.type === 'textedit') {
        th.style.background = o.bgColor || '#ffffff';
        th.style.border = '1.5px solid ' + (o.borderColor || '#aaaaaa');
        th.style.boxSizing = 'border-box';
        th.style.borderRadius = '3px';
      } else {
        const ico = typeIcon[o.libType] || '';
        if (ico) { th.textContent = ico; th.style.background = 'transparent'; }
        else th.style.background = typeColor[o.libType] || o.color || '#5b8fff';
      }
    }

    const bcount     = o.behaviors?.length || 0;
    const editAction = o.type === 'sprite'
      ? `openPx(${o.id})`
      : `showProps(objects.find(o=>o.id==${o.id}))`;
    const isFirst = listIdx === 0;
    const isLast  = listIdx === sorted.length - 1;

    d.innerHTML = `
    <div class="siinfo">
      <div class="siname">${o.name}</div>
      <div class="sitype">${o.libType || o.type}${bcount > 0 ? ` · <span style="color:var(--accent5)">${bcount} beh.</span>` : ''}</div>
    </div>
    <div class="sibts">
      <button class="ib" onclick="event.stopPropagation();moveObjZ(${o.id},+1)" title="Vers l'avant" ${isFirst ? 'disabled' : ''}>▲</button>
      <button class="ib" onclick="event.stopPropagation();moveObjZ(${o.id},-1)" title="Vers l'arrière" ${isLast ? 'disabled' : ''}>▼</button>
      <button class="ib" onclick="event.stopPropagation();dupObj(${o.id})" title="Dupliquer">⧉</button>
      <button class="ib" onclick="event.stopPropagation();${editAction}" title="Éditer">✏</button>
      <button class="ib dl" onclick="event.stopPropagation();delObj(${o.id})" title="Supprimer">×</button>
    </div>`;
    d.insertBefore(th, d.firstChild);
    el.appendChild(d);
  });
  renderObjTypesPanel();
}

// ----------------------------------------------------------------
// Interactions souris sur le canvas
// ----------------------------------------------------------------
let drag = false, rsz = false, dox = 0, doy = 0;
let dragGroupOffsets = null; // {id: {ox, oy}} — déplacement en groupe

function cvP(e) {
  const r = gcvs.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (gcvs.width  / r.width),
    y: (e.clientY - r.top)  * (gcvs.height / r.height),
  };
}

function hitObj(x, y) {
  return [...objects]
    .sort((a, b) => b.zIndex - a.zIndex)
    .find(o => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)?.id;
}

function cvDown(e) {
  if (e.button !== 0) return;
  const p = cvP(e);
  if (p.x < 0 || p.y < 0 || p.x > gcvs.width || p.y > gcvs.height) return;
  const h = hitObj(p.x, p.y);
  if (h) {
    const o = objects.find(o => o.id === h);
    if (e.ctrlKey) {
      // Ctrl+drag → nouvelle instance du même type
      const newId = addInstance(o.typeId, p.x - o.w / 2 | 0, p.y - o.h / 2 | 0);
      if (newId) {
        const no = objects.find(x => x.id === newId);
        drag = true; dox = p.x - no.x; doy = p.y - no.y;
        dragGroupOffsets = null;
      }
    } else if (e.shiftKey) {
      // Shift+click → ajouter / retirer de la multi-sélection
      if (selIds.has(h)) {
        selIds.delete(h);
        selId = selIds.size > 0 ? [...selIds].at(-1) : null;
      } else {
        selIds.add(h);
        selId = h;
      }
      dragGroupOffsets = null;
      renderSceneList(); renderCvs();
      updateMultiSelProps();
      if (document.getElementById('rp-beh').classList.contains('on')) renderBehPanel();
    } else if (selIds.size > 1 && selIds.has(h)) {
      // Déplacement en groupe — conserver les distances relatives
      dragGroupOffsets = {};
      selIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj) dragGroupOffsets[id] = { ox: p.x - obj.x, oy: p.y - obj.y };
      });
      drag = true;
    } else {
      dragGroupOffsets = null;
      selectObj(h);
      if (Math.abs(p.x - (o.x + o.w)) < 10 && Math.abs(p.y - (o.y + o.h)) < 10) {
        rsz = true; dox = p.x; doy = p.y;
      } else {
        drag = true; dox = p.x - o.x; doy = p.y - o.y;
      }
    }
  } else if (!e.shiftKey) {
    // Clic sur zone vide sans Shift → déselectionner
    dragGroupOffsets = null;
    selectObj(null);
  }
}

function cvMove(e) {
  const p = cvP(e);
  if (drag && dragGroupOffsets) {
    // Déplacer tout le groupe en conservant les distances
    selIds.forEach(id => {
      const obj = objects.find(o => o.id === id);
      const off = dragGroupOffsets[id];
      if (obj && off) { obj.x = snapG(p.x - off.ox); obj.y = snapG(p.y - off.oy); }
    });
    renderCvs();
    return;
  }
  if (drag && selId) {
    const o = objects.find(o => o.id === selId);
    if (o) { o.x = snapG(p.x - dox); o.y = snapG(p.y - doy); }
    renderCvs(); showProps(objects.find(o => o.id === selId));
  }
  if (rsz && selId) {
    const o = objects.find(o => o.id === selId);
    if (o) { o.w = Math.max(10, snapG(p.x - o.x)); o.h = Math.max(10, snapG(p.y - o.y)); }
    renderCvs(); showProps(objects.find(o => o.id === selId));
  }
}

function cvUp() { drag = false; rsz = false; dragGroupOffsets = null; }

// Double-clic → dialog d'ajout d'objet
let pendingAddPos = { x: 400, y: 250 };

function cvDblClick(e) {
  const p = cvP(e);
  if (p.x < 0 || p.y < 0 || p.x > gcvs.width || p.y > gcvs.height) return;
  const hid = hitObj(p.x, p.y);
  if (hid) {
    const o = objects.find(o => o.id === hid);
    if (o && o.type === 'sprite') openPx(o.id);
    return;
  }
  pendingAddPos = { x: p.x, y: p.y };
  showAddObjDlg();
}

function showAddObjDlg() {
  const items = [
    { type:'sprite',   icon:'🖼', name:'Sprite',    desc:'Image pixel art animable' },
    { type:'button',   icon:'🔲', name:'Bouton',    desc:'UI cliquable' },
    { type:'label',    icon:'🔤', name:'Label',     desc:'Texte dynamique' },
    { type:'textedit', icon:'⌨️', name:'TextEdit', desc:'Champ de saisie texte' },
  ];
  document.getElementById('dlg-addobj-grid').innerHTML = items.map(i => `
    <div class="bpick-item" onclick="addFromLib('${i.type}',pendingAddPos.x,pendingAddPos.y);closeDlg();">
      <div class="bpick-icon">${i.icon}</div>
      <div class="bpick-name">${i.name}</div>
      <div class="bpick-desc">${i.desc}</div>
    </div>`).join('');
  showDlg('dlg-addobj');
}

// Drag & drop depuis la bibliothèque (nouveau type) ou depuis le panel types (instance)
let libDragType = null;
let libTypeDragId = null;
function libDragStart(type) { libDragType = type; libTypeDragId = null; }
function libTypeDragStart(typeId) { libTypeDragId = typeId; libDragType = null; }

document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('cvswrap');
  wrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    const p = cvP(e);
    if (libTypeDragId !== null) {
      addInstance(libTypeDragId, snapG(p.x), snapG(p.y)); libTypeDragId = null;
    } else if (libDragType) {
      addFromLib(libDragType, snapG(p.x), snapG(p.y)); libDragType = null;
    }
  });

  // Zoom molette
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    setCvZoom(cvZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });

  syncGridUI();

  // Boucle RAF pour animer les sprites multi-frames dans l'éditeur
  (function editorLoop(now) {
    renderCvs(now);
    requestAnimationFrame(editorLoop);
  })(performance.now());
});

// ----------------------------------------------------------------
// Menu contextuel (clic droit)
// ----------------------------------------------------------------
let ctxT = null;

function cvCtx(e) {
  e.preventDefault();
  const p = cvP(e);
  const h = hitObj(p.x, p.y);
  if (!h) return;
  ctxT = h; selectObj(h);
  const m = document.getElementById('ctx');
  m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
  m.classList.add('on');
  document.getElementById('ctx-edit').style.display =
    objects.find(o => o.id === h)?.type === 'sprite' ? '' : 'none';
}

document.addEventListener('click', () => document.getElementById('ctx').classList.remove('on'));

function ctxEdit()   { if (ctxT) openPx(ctxT); }
function ctxDup()    { if (ctxT) dupObj(ctxT); }
function ctxRename() {
  const o = objects.find(o => o.id === ctxT);
  if (!o) return;
  const n = prompt('Nouveau nom:', o.name);
  if (n?.trim()) { o.name = n.trim(); renderSceneList(); renderCvs(); renderEvs(); showProps(o); }
}
function ctxBeh() { if (ctxT) { selectObj(ctxT); switchRP('beh'); } }
function ctxZ(d) {
  const o = objects.find(o => o.id === ctxT);
  if (!o) return;
  o.zIndex = d > 0 ? objects.length : Math.max(0, o.zIndex - 1);
  renderCvs();
}
function ctxDel() { if (ctxT) delObj(ctxT); }
