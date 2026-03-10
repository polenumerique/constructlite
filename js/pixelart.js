// ================================================================
// pixelart.js — Éditeur Pixel Art avec animations (frames)
// ================================================================

// ---- Références DOM ----
const pec   = document.getElementById('pecanvas');
const pectx = pec.getContext('2d');

// ---- État de l'éditeur ----
let pesz      = 32;
const pezm    = 9;            // Zoom (px d'écran par pixel)
let petool    = 'pencil';
let peBrush     = 1;
let peCursorPos = null; // {x,y} en coords pixel, null si hors canvas
let pecol     = '#5b8fff';
let peA       = 1;
let pedrawing = false;
let pehist    = [];           // Historique undo de la frame courante
let petid     = null;
let pers      = null;         // Point de départ rect/ligne

// ---- Frames ----
let peFrames = [];            // [{ pixels: Array(sz*sz) }]
let peCurFr  = 0;

// ---- Mode éditeur ----
let peMode    = 'draw';  // 'draw' | 'collision'
let collPts   = [];      // [{x,y}] en coords PIXEL entières (0..pesz-1)
let collDragI = -1;      // index du point en cours de drag (-1 = aucun)

// ---- Prévisualisation animation ----
let peAnimRAF  = null;
let peAnimFr   = 0;
let peAnimLast = 0;

const PAL = [
  '#ff5b8f','#5b8fff','#5bffb8','#ffd166','#ff4a4a','#c0c0c0',
  '#ffffff','#000000','#ff9900','#9b59b6','#2ecc71','#e74c3c',
  '#3498db','#f39c12','#2c3e50','#00bcd4',
];

// Accès aux pixels de la frame courante
const pepx    = ()    => peFrames[peCurFr]?.pixels;
const setPepx = (arr) => { if (peFrames[peCurFr]) peFrames[peCurFr].pixels = arr; };

// ================================================================
// PALETTE
// ================================================================
function initPal() {
  const el = document.getElementById('pepal');
  el.innerHTML = '';
  PAL.forEach(c => {
    const s = document.createElement('div');
    s.className = 'pmsw' + (c === pecol ? ' on' : '');
    s.style.background = c; s.title = c;
    s.onclick = () => {
      pecol = c;
      document.getElementById('pecol').value = c.startsWith('#') ? c : '#5b8fff';
      document.querySelectorAll('.pmsw').forEach(x => x.classList.remove('on'));
      s.classList.add('on');
    };
    el.appendChild(s);
  });
}

// ================================================================
// OUVERTURE / FERMETURE
// ================================================================
function openPx(id) {
  petid = id;
  pesz  = +document.getElementById('pesize').value;
  const o = objects.find(o => o.id === id);

  if (o?.frames && o.frames.length > 0) {
    // Nouveau format multi-frames
    peFrames = o.frames.map(f => ({ pixels: [...f.pixels] }));
    pesz     = o.frameSize || pesz;
    document.getElementById('pesize').value = pesz;
    peCurFr  = 0; pehist = [];
    _resizeCanvas(); rndPe(); renderFrameStrip();
  } else if (o?.imageData) {
    // Rétrocompatibilité : imageData → 1 frame
    peFrames = [{ pixels: Array(pesz * pesz).fill(null) }];
    peCurFr = 0; pehist = [];
    _resizeCanvas();
    const img = new Image();
    img.onload = () => {
      pectx.clearRect(0, 0, pesz, pesz);
      pectx.drawImage(img, 0, 0, pesz, pesz);
      peFrames[0].pixels = _readCanvasPixels();
      rndPe(); renderFrameStrip();
    };
    img.src = o.imageData;
  } else {
    // Nouveau sprite vide
    peFrames = [{ pixels: Array(pesz * pesz).fill(null) }];
    peCurFr = 0; pehist = [];
    _resizeCanvas(); rndPe(); renderFrameStrip();
  }

  // Charger le polygone de collision du type maître (coords normalisées → pixel)
  const master = objects.find(m => m.id === (objects.find(x => x.id === id)?.typeId ?? id));
  if (master?.collisionPoly) {
    collPts = master.collisionPoly.map(p => ({
      x: Math.max(0, Math.min(pesz-1, Math.round(p.x * pesz - 0.5))),
      y: Math.max(0, Math.min(pesz-1, Math.round(p.y * pesz - 0.5))),
    }));
  } else {
    collPts = [{x:0,y:0},{x:pesz-1,y:0},{x:pesz-1,y:pesz-1},{x:0,y:pesz-1}];
  }
  collDragI = -1;
  switchPeMode('draw');

  stopAnimPreview();
  document.getElementById('pxmod').classList.add('on');
  document.getElementById('mbg').classList.add('on');
  initPal();
  setPeBrush(peBrush); // sync l'input avec la valeur courante
  peCursorPos = null;
}

function closePx() {
  stopAnimPreview();
  document.getElementById('pxmod').classList.remove('on');
  document.getElementById('mbg').classList.remove('on');
}

// ================================================================
// GESTION DES FRAMES
// ================================================================
function addFrame() {
  peFrames.push({ pixels: Array(pesz * pesz).fill(null) });
  selectFrame(peFrames.length - 1);
}

function dupFrame(idx) {
  peFrames.splice(idx + 1, 0, { pixels: [...peFrames[idx].pixels] });
  selectFrame(idx + 1);
}

function delFrame(idx) {
  if (peFrames.length <= 1) return;
  peFrames.splice(idx, 1);
  selectFrame(Math.min(peCurFr, peFrames.length - 1));
}

function moveFrame(idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= peFrames.length) return;
  [peFrames[idx], peFrames[to]] = [peFrames[to], peFrames[idx]];
  selectFrame(to);
}

function selectFrame(idx) {
  peCurFr = Math.max(0, Math.min(idx, peFrames.length - 1));
  pehist  = [];
  rndPe(); renderFrameStrip();
}

function pushHist() {
  pehist.push([...pepx()]);
  if (pehist.length > 40) pehist.shift();
}

function renderFrameStrip() {
  const strip = document.getElementById('pe-frame-strip');
  if (!strip) return;
  strip.innerHTML = '';

  peFrames.forEach((fr, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'pef-wrap' + (i === peCurFr ? ' on' : '');

    const mc = document.createElement('canvas');
    mc.width = pesz; mc.height = pesz;
    mc.className = 'pef-thumb';
    mc.style.imageRendering = 'pixelated';
    _renderFrameToCanvas(mc, fr.pixels, pesz);
    mc.onclick = () => selectFrame(i);
    wrap.appendChild(mc);

    const lbl = document.createElement('div');
    lbl.className = 'pef-lbl'; lbl.textContent = i + 1;
    wrap.appendChild(lbl);

    const btns = document.createElement('div');
    btns.className = 'pef-btns';
    btns.innerHTML = `
      <button title="◀ Reculer"   onclick="moveFrame(${i},-1);event.stopPropagation()">◀</button>
      <button title="Dupliquer"   onclick="dupFrame(${i});event.stopPropagation()">⧉</button>
      <button title="Supprimer"   onclick="delFrame(${i});event.stopPropagation()" class="del">×</button>
      <button title="Avancer ▶"   onclick="moveFrame(${i},+1);event.stopPropagation()">▶</button>`;
    wrap.appendChild(btns);
    strip.appendChild(wrap);
  });

  // Bouton "+"
  const addBtn = document.createElement('div');
  addBtn.className = 'pef-add'; addBtn.title = 'Ajouter une frame';
  addBtn.textContent = '+'; addBtn.onclick = addFrame;
  strip.appendChild(addBtn);

  // Compteur
  const counter = document.getElementById('pe-frame-count');
  if (counter) counter.textContent = `${peCurFr + 1} / ${peFrames.length}`;
}

// ================================================================
// PRÉVISUALISATION ANIMATION
// ================================================================
function startAnimPreview() {
  if (peFrames.length <= 1) return;
  stopAnimPreview();
  const fps      = +document.getElementById('pe-fps').value || 8;
  const interval = 1000 / fps;
  const prevc    = document.getElementById('pe-anim-canvas');
  if (!prevc) return;
  prevc.width  = pesz; prevc.height = pesz;
  prevc.style.width = '64px'; prevc.style.height = '64px';
  prevc.style.imageRendering = 'pixelated';
  peAnimFr = 0; peAnimLast = performance.now();

  function loop(now) {
    if (now - peAnimLast >= interval) {
      peAnimFr = (peAnimFr + 1) % peFrames.length;
      _renderFrameToCanvas(prevc, peFrames[peAnimFr].pixels, pesz);
      peAnimLast = now;
    }
    peAnimRAF = requestAnimationFrame(loop);
  }
  peAnimRAF = requestAnimationFrame(loop);
  document.getElementById('pe-anim-play').textContent = '⏹';
  document.getElementById('pe-anim-play').onclick     = stopAnimPreview;
}

function stopAnimPreview() {
  if (peAnimRAF) { cancelAnimationFrame(peAnimRAF); peAnimRAF = null; }
  const prevc = document.getElementById('pe-anim-canvas');
  if (prevc && peFrames.length > 0) _renderFrameToCanvas(prevc, peFrames[0].pixels, pesz);
  const btn = document.getElementById('pe-anim-play');
  if (btn) { btn.textContent = '▶'; btn.onclick = startAnimPreview; }
}

// ================================================================
// CANVAS — UTILITAIRES INTERNES
// ================================================================
function _resizeCanvas() {
  pec.width  = pesz; pec.height = pesz;
  pec.style.width  = pesz * pezm + 'px';
  pec.style.height = pesz * pezm + 'px';
}

function resizePe() {
  const newSz = +document.getElementById('pesize').value;
  peFrames = peFrames.map(fr => ({
    pixels: _scalePixels(fr.pixels, pesz, newSz),
  }));
  pesz   = newSz;
  pehist = [];
  _resizeCanvas(); rndPe(); renderFrameStrip();
}

function _scalePixels(src, srcSz, dstSz) {
  const dst = Array(dstSz * dstSz).fill(null);
  const lim = Math.min(srcSz, dstSz);
  for (let y = 0; y < lim; y++)
    for (let x = 0; x < lim; x++)
      dst[y * dstSz + x] = src[y * srcSz + x] ?? null;
  return dst;
}

function _readCanvasPixels() {
  const px  = [];
  const dat = pectx.getImageData(0, 0, pesz, pesz).data;
  for (let i = 0; i < pesz * pesz; i++) {
    const a = dat[i * 4 + 3];
    px.push(a < 8 ? null : `rgba(${dat[i*4]},${dat[i*4+1]},${dat[i*4+2]},${(a/255).toFixed(2)})`);
  }
  return px;
}

/** Damier + pixels — utilisé pour les thumbs et le canvas d'anim */
function _renderFrameToCanvas(canvas, pixels, sz) {
  const ctx  = canvas.getContext('2d');
  const tile = Math.max(1, Math.round(sz / 8));
  ctx.clearRect(0, 0, sz, sz);
  for (let ty = 0; ty < sz; ty += tile) {
    for (let tx = 0; tx < sz; tx += tile) {
      ctx.fillStyle = (Math.floor(tx/tile) + Math.floor(ty/tile)) % 2 === 0 ? '#444' : '#666';
      ctx.fillRect(tx, ty, tile, tile);
    }
  }
  if (!pixels) return;
  for (let i = 0; i < sz * sz; i++) {
    if (!pixels[i]) continue;
    ctx.fillStyle = pixels[i];
    ctx.fillRect(i % sz, Math.floor(i / sz), 1, 1);
  }
}

/** Rendu dans le canvas éditeur principal (damier + pixels + grille) */
function rndPe() {
  if (peMode === 'collision') { rndCollision(); return; }
  const px = pepx(); if (!px) return;
  const tile = Math.max(1, Math.round(pesz / 8));

  // Fond damier
  for (let ty = 0; ty < pesz; ty += tile) {
    for (let tx = 0; tx < pesz; tx += tile) {
      pectx.fillStyle = (Math.floor(tx/tile) + Math.floor(ty/tile)) % 2 === 0 ? '#3a3a3a' : '#555';
      pectx.fillRect(tx, ty, tile, tile);
    }
  }

  // Pixels de la frame
  for (let i = 0; i < pesz * pesz; i++) {
    if (!px[i]) continue;
    pectx.fillStyle = px[i];
    pectx.fillRect(i % pesz, Math.floor(i / pesz), 1, 1);
  }

  // Grille légère
  pectx.strokeStyle = 'rgba(0,0,0,0.2)';
  pectx.lineWidth   = 1 / pezm;
  for (let x = 0; x <= pesz; x++) {
    pectx.beginPath(); pectx.moveTo(x, 0); pectx.lineTo(x, pesz); pectx.stroke();
  }
  for (let y = 0; y <= pesz; y++) {
    pectx.beginPath(); pectx.moveTo(0, y); pectx.lineTo(pesz, y); pectx.stroke();
  }

  // Prévisualisation des outils
  if (peCursorPos) {
    const {x, y} = peCursorPos;
    pectx.save();

    if (petool === 'pencil' || petool === 'eraser') {
      // Carré du pinceau
      const half = Math.floor(peBrush / 2);
      const bx = x - half, by = y - half;
      pectx.strokeStyle = 'rgba(0,0,0,0.65)';
      pectx.lineWidth = 2 / pezm;
      pectx.strokeRect(bx - 1/pezm, by - 1/pezm, peBrush + 2/pezm, peBrush + 2/pezm);
      pectx.strokeStyle = 'rgba(255,255,255,0.9)';
      pectx.lineWidth = 1 / pezm;
      pectx.strokeRect(bx, by, peBrush, peBrush);

    } else if (petool === 'rect' && pers) {
      // Prévisualisation rectangle
      const x0 = Math.min(pers.x, x), y0 = Math.min(pers.y, y);
      const w  = Math.abs(x - pers.x) + 1, h = Math.abs(y - pers.y) + 1;
      pectx.fillStyle = h2r(pecol, peA * 0.35);
      pectx.fillRect(x0, y0, w, h);
      pectx.strokeStyle = 'rgba(255,255,255,0.85)';
      pectx.lineWidth = 1 / pezm;
      pectx.strokeRect(x0, y0, w, h);
      pectx.strokeStyle = 'rgba(0,0,0,0.4)';
      pectx.lineWidth = 2 / pezm;
      pectx.strokeRect(x0 - 1/pezm, y0 - 1/pezm, w + 2/pezm, h + 2/pezm);

    } else if (petool === 'line' && pers) {
      // Prévisualisation ligne
      pectx.strokeStyle = 'rgba(0,0,0,0.4)';
      pectx.lineWidth = 3 / pezm;
      pectx.beginPath(); pectx.moveTo(pers.x + .5, pers.y + .5); pectx.lineTo(x + .5, y + .5); pectx.stroke();
      pectx.strokeStyle = h2r(pecol, peA);
      pectx.lineWidth = 1 / pezm;
      pectx.beginPath(); pectx.moveTo(pers.x + .5, pers.y + .5); pectx.lineTo(x + .5, y + .5); pectx.stroke();

    } else {
      // Crosshair générique (fill, eyedrop, rect/line avant de cliquer)
      const lw = 1 / pezm, arm = 3 / pezm;
      pectx.strokeStyle = 'rgba(0,0,0,0.6)';
      pectx.lineWidth = 2 / pezm;
      pectx.beginPath();
      pectx.moveTo(x + .5 - arm, y + .5); pectx.lineTo(x + .5 + arm, y + .5);
      pectx.moveTo(x + .5, y + .5 - arm); pectx.lineTo(x + .5, y + .5 + arm);
      pectx.stroke();
      pectx.strokeStyle = 'rgba(255,255,255,0.9)';
      pectx.lineWidth = lw;
      pectx.beginPath();
      pectx.moveTo(x + .5 - arm, y + .5); pectx.lineTo(x + .5 + arm, y + .5);
      pectx.moveTo(x + .5, y + .5 - arm); pectx.lineTo(x + .5, y + .5 + arm);
      pectx.stroke();
    }

    pectx.restore();
  }

  // Mettre à jour le thumb de la frame courante
  _updateCurrentFrameThumb();
}

function _updateCurrentFrameThumb() {
  const strip = document.getElementById('pe-frame-strip');
  if (!strip) return;
  const thumbs = strip.querySelectorAll('.pef-thumb');
  if (thumbs[peCurFr]) _renderFrameToCanvas(thumbs[peCurFr], pepx(), pesz);
}

// ================================================================
// MODE COLLISION
// ================================================================
function switchPeMode(m) {
  peMode = m;
  document.getElementById('pe-mode-draw').classList.toggle('on', m === 'draw');
  document.getElementById('pe-mode-coll').classList.toggle('on', m === 'collision');
  const tls = document.querySelector('.pmtls');
  tls.style.opacity       = m === 'draw' ? '' : '0.35';
  tls.style.pointerEvents = m === 'draw' ? '' : 'none';
  document.getElementById('pe-coll-panel').style.display = m === 'collision' ? '' : 'none';
  rndPe();
}

/** Retourne l'index du point de collision le plus proche du curseur, -1 sinon.
 *  Tout en coords ÉCRAN (px CSS) pour que le seuil soit indépendant du zoom. */
function _collFindNear(e, thresh = 7) {
  const r = pec.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  for (let i = 0; i < collPts.length; i++) {
    // point pixel (px,py) → centre écran = (px+0.5)*pezm
    const sx = (collPts[i].x + 0.5) * pezm, sy = (collPts[i].y + 0.5) * pezm;
    if ((mx-sx)**2 + (my-sy)**2 < thresh**2) return i;
  }
  return -1;
}

/** Réinitialise le polygone aux 4 coins du sprite */
function collReset() {
  collPts  = [{x:0,y:0},{x:pesz-1,y:0},{x:pesz-1,y:pesz-1},{x:0,y:pesz-1}];
  collDragI = -1; rndPe();
}

/** Polygone = bbox des pixels non-transparents de la frame courante */
function collResetImage() {
  const px = pepx(); if (!px) { collReset(); return; }
  let x0=pesz, y0=pesz, x1=-1, y1=-1;
  for (let i = 0; i < pesz*pesz; i++) {
    if (!px[i]) continue;
    const xi=i%pesz, yi=Math.floor(i/pesz);
    if (xi<x0) x0=xi; if (xi>x1) x1=xi;
    if (yi<y0) y0=yi; if (yi>y1) y1=yi;
  }
  if (x1 < 0) { collReset(); return; }
  collPts  = [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  collDragI = -1; rndPe();
}

/** Rendu du canvas en mode collision.
 *  Coords CANVAS (0..pesz) — même repère que rndPe(), CSS fait le zoom ×pezm. */
function rndCollision() {
  const px = pepx(); if (!px) return;

  // Damier
  const tile = Math.max(1, Math.round(pesz / 8));
  for (let ty = 0; ty < pesz; ty += tile)
    for (let tx = 0; tx < pesz; tx += tile) {
      pectx.fillStyle = (Math.floor(tx/tile)+Math.floor(ty/tile))%2===0 ? '#3a3a3a' : '#555';
      pectx.fillRect(tx, ty, tile, tile);
    }

  // Sprite atténué
  pectx.globalAlpha = 0.4;
  for (let i = 0; i < pesz*pesz; i++) {
    if (!px[i]) continue;
    pectx.fillStyle = px[i];
    pectx.fillRect(i%pesz, Math.floor(i/pesz), 1, 1);
  }
  pectx.globalAlpha = 1;

  if (collPts.length === 0) return;

  // Polygone — centre du pixel = (x+0.5, y+0.5) en canvas coords
  pectx.beginPath();
  pectx.moveTo(collPts[0].x + 0.5, collPts[0].y + 0.5);
  for (let i = 1; i < collPts.length; i++)
    pectx.lineTo(collPts[i].x + 0.5, collPts[i].y + 0.5);
  if (collPts.length >= 3) {
    pectx.closePath();
    pectx.fillStyle = 'rgba(0,200,255,0.12)';
    pectx.fill();
  }
  pectx.strokeStyle = '#00c8ff';
  pectx.lineWidth   = 1 / pezm;   // 1px écran
  pectx.stroke();

  // Points de contrôle (cercles, 5px écran de rayon)
  const R = 5 / pezm;
  collPts.forEach(({x, y}, i) => {
    pectx.beginPath();
    pectx.arc(x + 0.5, y + 0.5, R, 0, Math.PI * 2);
    pectx.fillStyle   = i === collDragI ? '#ffff00' : '#00c8ff';
    pectx.strokeStyle = '#002233';
    pectx.lineWidth   = 0.5 / pezm;
    pectx.fill();
    pectx.stroke();
  });
}

// ================================================================
// OUTILS DE DESSIN
// ================================================================
function clearPe() { pushHist(); setPepx(Array(pesz * pesz).fill(null)); rndPe(); }
function undoPe()  { if (pehist.length) { setPepx(pehist.pop()); rndPe(); } }

function setTool(t) {
  petool = t;
  document.querySelectorAll('.ptl').forEach(b => b.classList.remove('on'));
  const el = document.getElementById('ptl-' + t);
  if (el) el.classList.add('on');
}
function setPeBrush(n) {
  peBrush = Math.max(1, Math.min(8, n | 0));
  const el = document.getElementById('pe-brush');
  if (el) el.value = peBrush;
  const lbl = document.getElementById('pe-brush-val');
  if (lbl) lbl.textContent = peBrush;
}
function setPeCol(c) {
  pecol = c;
  document.querySelectorAll('.pmsw').forEach(s => s.classList.toggle('on', s.title === c));
}
function h2r(h, a) {
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function pepos(e) {
  const r = pec.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(pesz-1, Math.floor((e.clientX - r.left) / pezm))),
    y: Math.max(0, Math.min(pesz-1, Math.floor((e.clientY - r.top)  / pezm))),
  };
}
function paint(x, y) {
  const px = pepx(); if (!px) return;
  if (petool === 'eyedrop') {
    const i = y * pesz + x;
    if (px[i]) { pecol = px[i]; document.getElementById('pecol').value = '#5b8fff'; }
    setTool('pencil');
    rndPe(); return;
  }
  const half = Math.floor(peBrush / 2);
  for (let dy = -half; dy < peBrush - half; dy++) {
    for (let dx = -half; dx < peBrush - half; dx++) {
      const bx = x + dx, by = y + dy;
      if (bx < 0 || bx >= pesz || by < 0 || by >= pesz) continue;
      const i = by * pesz + bx;
      if      (petool === 'pencil') px[i] = h2r(pecol, peA);
      else if (petool === 'eraser') px[i] = null;
    }
  }
  rndPe();
}
// Flood fill itératif (pas de stack overflow)
function fill(sx, sy, tgt, col) {
  const px = pepx(); if (!px) return;
  const stack = [[sx, sy]], seen = new Set();
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= pesz || y < 0 || y >= pesz) continue;
    const i = y * pesz + x;
    if (seen.has(i) || px[i] !== tgt || px[i] === col) continue;
    seen.add(i); px[i] = col;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
}

// ================================================================
// ÉVÉNEMENTS SOURIS
// ================================================================
pec.addEventListener('contextmenu', e => { if (peMode === 'collision') e.preventDefault(); });

pec.addEventListener('mousedown', e => {
  // --- Mode collision ---
  if (peMode === 'collision') {
    if (e.button === 2) {                      // clic droit → supprimer
      const idx = _collFindNear(e);
      if (idx >= 0) { collPts.splice(idx, 1); collDragI = -1; rndPe(); }
      return;
    }
    if (e.button !== 0) return;
    const idx = _collFindNear(e);
    if (idx >= 0) {
      collDragI = idx;                         // drag d'un point existant
    } else {
      const pt = pepos(e);                     // nouveau point, snappé au pixel
      collPts.push(pt);
      collDragI = collPts.length - 1;
      rndPe();
    }
    return;
  }
  // --- Mode dessin ---
  if (e.button !== 0) return;
  pedrawing = true; pushHist();
  const {x, y} = pepos(e);
  if (petool === 'fill') {
    const px = pepx(); if (!px) return;
    const i = y*pesz+x, t = px[i], c = h2r(pecol, peA);
    if (t !== c) fill(x, y, t, c); rndPe(); pedrawing = false; return;
  }
  if (petool === 'rect' || petool === 'line') { pers = {x, y}; return; }
  paint(x, y);
});
pec.addEventListener('mousemove', e => {
  if (peMode === 'collision') {
    if (collDragI >= 0) collPts[collDragI] = pepos(e);
    rndPe(); return;
  }
  const {x, y} = pepos(e);
  peCursorPos = {x, y};
  if (pedrawing && petool !== 'rect' && petool !== 'line') paint(x, y);
  else rndPe();
});
pec.addEventListener('mouseleave', () => {
  if (peMode === 'collision') { rndPe(); return; }
  peCursorPos = null; rndPe();
});

document.addEventListener('mousemove', e => {
  if (peMode === 'collision') {
    if (collDragI >= 0) { collPts[collDragI] = pepos(e); rndPe(); }
    return;
  }
  if (!pedrawing) return;
  const {x, y} = pepos(e);
  if (petool !== 'rect' && petool !== 'line') paint(x, y);
  else rndPe();
});
document.addEventListener('mouseup', e => {
  if (peMode === 'collision') {
    collDragI = -1; rndPe(); return;
  }
  if (!pedrawing && !pers) return;
  if ((petool === 'rect' || petool === 'line') && pers) {
    const {x, y} = pepos(e);
    const px = pepx(); if (!px) { pedrawing = false; return; }
    if (petool === 'rect') {
      const x0=Math.min(pers.x,x), y0=Math.min(pers.y,y), x1=Math.max(pers.x,x), y1=Math.max(pers.y,y);
      for (let py=y0; py<=y1; py++) for (let qx=x0; qx<=x1; qx++) px[py*pesz+qx] = h2r(pecol,peA);
    } else {
      let ex=pers.x, ey=pers.y, dx=Math.abs(x-ex), dy=Math.abs(y-ey);
      const sx=ex<x?1:-1, sy=ey<y?1:-1; let err=dx-dy;
      while(true) {
        px[ey*pesz+ex] = h2r(pecol,peA);
        if(ex===x&&ey===y) break;
        const e2=2*err;
        if(e2>-dy){err-=dy;ex+=sx;} if(e2<dx){err+=dx;ey+=sy;}
      }
    }
    rndPe(); pers = null;
  }
  pedrawing = false;
});

// ================================================================
// APPLIQUER
// ================================================================
function applyPe() {
  const o = objects.find(o => o.id === petid);
  if (!o) { closePx(); return; }

  const off    = document.createElement('canvas');
  off.width = pesz; off.height = pesz;
  const offCtx = off.getContext('2d');

  o.frames    = peFrames.map(fr => {
    // Fond transparent uniquement (pas de damier) pour que la transparence soit préservée
    offCtx.clearRect(0, 0, pesz, pesz);
    fr.pixels.forEach((col, i) => {
      if (!col) return;
      offCtx.fillStyle = col;
      offCtx.fillRect(i % pesz, Math.floor(i / pesz), 1, 1);
    });
    return { pixels: [...fr.pixels], dataURL: off.toDataURL() };
  });
  o.frameSize = pesz;
  o.imageData = o.frames[0].dataURL; // Rétrocompatibilité

  // Sauvegarder le polygone (coords pixel → normalisées, centre du pixel = +0.5)
  // null = pas de polygone custom (AABB utilisée en runtime)
  const isDefault = collPts.length === 4
    && collPts[0].x===0     && collPts[0].y===0
    && collPts[1].x===pesz-1 && collPts[1].y===0
    && collPts[2].x===pesz-1 && collPts[2].y===pesz-1
    && collPts[3].x===0     && collPts[3].y===pesz-1;
  const savedPoly = (collPts.length >= 3 && !isDefault)
    ? collPts.map(p => ({x: (p.x + 0.5) / pesz, y: (p.y + 0.5) / pesz}))
    : null;

  // Propager l'image et le polygone à toutes les instances du même type
  objects.forEach(inst => {
    if (inst.typeId === o.typeId) {
      inst.collisionPoly = savedPoly;
      if (inst.id !== o.id) {
        inst.frames    = JSON.parse(JSON.stringify(o.frames));
        inst.frameSize = o.frameSize;
        inst.imageData = o.imageData;
      }
    }
  });

  renderCvs(); renderSceneList(); closePx();
}
