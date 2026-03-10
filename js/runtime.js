// ================================================================
// runtime.js — Moteur de jeu (boucle, behaviors, conditions/actions)
// ================================================================

// ----------------------------------------------------------------
// Collision polygonale — SAT (Separating Axis Theorem)
// ----------------------------------------------------------------
/** Transforme un polygone normalisé (0..1) en coords monde */
function _worldPoly(o, poly) {
  return poly.map(p => ({x: o.x + p.x * o.w, y: o.y + p.y * o.h}));
}
/** AABB d'un objet en 4 sommets */
function _aabbVerts(o) {
  return [{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}];
}
/** Test SAT sur deux polygones convexes (tableaux de {x,y}) */
function _satOverlap(pa, pb) {
  for (const poly of [pa, pb]) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const nx = -(poly[j].y - poly[i].y), ny = poly[j].x - poly[i].x;
      let minA=Infinity, maxA=-Infinity, minB=Infinity, maxB=-Infinity;
      for (const p of pa) { const d=p.x*nx+p.y*ny; if(d<minA)minA=d; if(d>maxA)maxA=d; }
      for (const p of pb) { const d=p.x*nx+p.y*ny; if(d<minB)minB=d; if(d>maxB)maxB=d; }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}
/** Collision entre deux objets : SAT si poly custom, sinon AABB */
function _collidesObjs(a, b, objects) {
  const ma = objects.find(m => m.id === a.typeId);
  const mb = objects.find(m => m.id === b.typeId);
  const pa = ma?.collisionPoly ? _worldPoly(a, ma.collisionPoly) : _aabbVerts(a);
  const pb = mb?.collisionPoly ? _worldPoly(b, mb.collisionPoly) : _aabbVerts(b);
  return _satOverlap(pa, pb);
}

/** AABB serrée du polygone de collision en coords monde.
 *  Fallback sur l'AABB complète de l'objet si pas de polygone custom. */
function _collBounds(o, objects) {
  const master = objects.find(m => m.id === o.typeId);
  const poly = master?.collisionPoly;
  if (!poly || poly.length === 0)
    return {x1: o.x, y1: o.y, x2: o.x+o.w, y2: o.y+o.h};
  let x1=Infinity, y1=Infinity, x2=-Infinity, y2=-Infinity;
  for (const p of poly) {
    const wx = o.x + p.x*o.w, wy = o.y + p.y*o.h;
    if (wx<x1) x1=wx; if (wx>x2) x2=wx;
    if (wy<y1) y1=wy; if (wy>y2) y2=wy;
  }
  return {x1, y1, x2, y2};
}

let raf = null;   // requestAnimationFrame handle
let rst = null;   // État runtime (copie des données du projet)
let lrt = 0;      // Timestamp de la dernière frame
let _pendingRestart = false; // Restart demandé depuis une action en cours de frame

// ----------------------------------------------------------------
// Lancer la prévisualisation
// ----------------------------------------------------------------
function runGame() {
  const ov  = document.getElementById('runov');
  ov.classList.add('on');
  const rc   = document.getElementById('runcvs');
  rc.width   = gameSettings.width;
  rc.height  = gameSettings.height;
  const rctx = rc.getContext('2d');

  // Copie profonde de l'état éditeur → état runtime
  rst = {
    objects:    JSON.parse(JSON.stringify(objects)),
    variables:  JSON.parse(JSON.stringify(variables)),
    timers:     JSON.parse(JSON.stringify(timers)),
    keys:       {}, pressed: {}, mouse: { x:0, y:0 },
    clicked:    false, clickObj: null,
    timerDone:  {}, tick: 0, secAcc: 0,
    sceneBg:    gameSettings.bgColor, startFired: false,
    bstate:     {},
    w: gameSettings.width, h: gameSettings.height,
    focusedTextEditId: null, textEditSubmitted: null,
    mouseOver: new Set(), mouseEntered: new Set(), mouseLeft: new Set(),
  };
  rst.timers.forEach(t => { t.elapsed = 0; t.running = true; });

  // Initialisation des états de behavior + animation
  rst.objects.forEach(o => {
    rst.bstate[o.id] = {};
    // État d'animation de frames
    if (o.frames && o.frames.length > 1) {
      rst.bstate[o.id].anim = { fr: 0, acc: 0 };
    }
    (o.behaviors || []).forEach(b => {
      if (b.type === 'bounce')   rst.bstate[o.id].bounce   = { vx: +b.props.speedX || 120, vy: +b.props.speedY || 100 };
      if (b.type === 'platform') rst.bstate[o.id].platform = { vy: 0, onGround: false };
      if (b.type === 'gravity')  rst.bstate[o.id].gravity  = { vy: 0 };
      if (b.type === 'sine') {
        b._phase = 0;
        b._base  = { x:o.x, y:o.y, angle:o.angle, w:o.w, h:o.h, opacity:o.opacity };
      }
    });
  });

  // --- Clavier ---
  const kd = e => {
    // Si un TextEdit est focalisé, il capture la saisie
    if (rst.focusedTextEditId !== null) {
      const te = rst.objects.find(o => o.id === rst.focusedTextEditId);
      if (te) {
        if (e.key === 'Escape')     { rst.focusedTextEditId = null; }
        else if (e.key === 'Backspace') { te.text = te.text.slice(0, -1); e.preventDefault(); }
        else if (e.key === 'Enter') { rst.textEditSubmitted = rst.focusedTextEditId; }
        else if (e.key.length === 1) { te.text = (te.text || '') + e.key; e.preventDefault(); }
      }
      return;
    }
    rst.keys[e.code] = true; rst.pressed[e.code] = true;
  };
  const ku = e => { rst.keys[e.code] = false; };

  // --- Souris ---
  const mm = e => {
    const r = rc.getBoundingClientRect();
    rst.mouse.x = e.clientX - r.left; rst.mouse.y = e.clientY - r.top;
  };
  const mc = e => {
    const r = rc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    rst.clicked = true; rst.clickObj = null;
    // Défocaliser le TextEdit courant sauf si on clique dessus
    rst.focusedTextEditId = null;
    [...rst.objects].sort((a,b) => b.zIndex - a.zIndex).forEach(o => {
      if (!rst.clickObj && o.visible && mx >= o.x && mx <= o.x+o.w && my >= o.y && my <= o.y+o.h) {
        rst.clickObj = o.id;
        if (o.type === 'textedit') rst.focusedTextEditId = o.id;
      }
    });
  };
  let mdObj = null, mdOff = { x:0, y:0 };
  const mdown = e => {
    const r = rc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    [...rst.objects].sort((a,b) => b.zIndex - a.zIndex).forEach(o => {
      if (!mdObj && o.visible && (o.behaviors||[]).some(b => b.type === 'drag') &&
          mx >= o.x && mx <= o.x+o.w && my >= o.y && my <= o.y+o.h) {
        mdObj = o.id; mdOff = { x: mx - o.x, y: my - o.y };
      }
    });
  };
  const mmove2 = e => {
    if (!mdObj) return;
    const r = rc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const o = rst.objects.find(o => o.id === mdObj);
    if (o) { o.x = mx - mdOff.x; o.y = my - mdOff.y; }
  };
  const mup2 = () => { mdObj = null; };

  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  rc.addEventListener('mousemove', mm);   rc.addEventListener('click', mc);
  rc.addEventListener('mousedown', mdown);rc.addEventListener('mousemove', mmove2); rc.addEventListener('mouseup', mup2);

  let fa = 0, ff = 0, dt = 0;

  // ----------------------------------------------------------------
  // Évaluation d'expressions (substitution variables)
  // ----------------------------------------------------------------
  function xpr(e) {
    try {
      let s = String(e);
      rst.variables.forEach(v => { s = s.split(v.name).join(v.value); });
      return eval(s); // eslint-disable-line no-eval
    } catch { return parseFloat(e) || 0; }
  }

  // ----------------------------------------------------------------
  // Résolution d'un ID : si c'est une ref de groupe dans le contexte,
  // retourne l'ID de l'objet concret ; sinon retourne la valeur telle quelle.
  // ----------------------------------------------------------------
  function rid(val, ctx) { return (ctx && ctx[val] !== undefined) ? ctx[val] : val; }

  // ----------------------------------------------------------------
  // Évaluation des conditions
  // ----------------------------------------------------------------
  function evalCInner(c, sec, ctx) {
    const p = c.params;
    switch (c.type) {
      case 'start_layout': return true;
      case 'every_tick':   return true;
      case 'every_n_sec':  return sec && rst.tick % Math.max(1, Math.round(+p.n || 1)) === 0;
      case 'key_pressed':  return !!rst.pressed[p.key];
      case 'key_down':     return !!rst.keys[p.key];
      case 'obj_clicked':  { const id = rid(c.objRef ?? p.objId, ctx); return rst.clicked && rst.clickObj == id; }
      case 'mouse_over': {
        const o = rst.objects.find(o => o.id == rid(c.objRef ?? p.objId, ctx));
        return o ? rst.mouseOver.has(o.id) : false;
      }
      case 'mouse_enter': {
        const o = rst.objects.find(o => o.id == rid(c.objRef ?? p.objId, ctx));
        return o ? rst.mouseEntered.has(o.id) : false;
      }
      case 'mouse_leave': {
        const o = rst.objects.find(o => o.id == rid(c.objRef ?? p.objId, ctx));
        return o ? rst.mouseLeft.has(o.id) : false;
      }
      case 'obj_overlaps': {
        const a = rst.objects.find(o => o.id == rid(c.objRef ?? p.objA, ctx));
        const b = rst.objects.find(o => o.id == rid(p.objB, ctx));
        return a && b ? _collidesObjs(a, b, rst.objects) : false;
      }
      case 'obj_offscreen': {
        const o = rst.objects.find(o => o.id == rid(c.objRef ?? p.objId, ctx));
        return o ? (o.x > rst.w || o.x+o.w < 0 || o.y > rst.h || o.y+o.h < 0) : false;
      }
      case 'textedit_focused': {
        const id = rid(c.objRef ?? p.objId, ctx);
        return rst.focusedTextEditId == id;
      }
      case 'textedit_submitted': {
        const id = rid(c.objRef ?? p.objId, ctx);
        return rst.textEditSubmitted == id;
      }
      case 'var_compare': {
        const v = rst.variables.find(x => x.name === p.varName); if (!v) return false;
        const lv = parseFloat(v.value), rv = parseFloat(p.value);
        switch (p.op) {
          case '==': return v.value == p.value; case '!=': return v.value != p.value;
          case '>':  return lv > rv;            case '<':  return lv < rv;
          case '>=': return lv >= rv;           case '<=': return lv <= rv;
        }
        return false;
      }
      case 'timer_done': return !!rst.timerDone[p.timerName];
      default: return false;
    }
  }

  function evalC(c, sec, ctx) {
    const result = evalCInner(c, sec, ctx);
    return c.negated ? !result : result;
  }

  // ----------------------------------------------------------------
  // Évaluation des actions
  // ----------------------------------------------------------------
  function evalA(a, ctx) {
    const p = a.params;
    switch (a.type) {
      case 'move_obj':    { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) { o.x += xpr(p.dx)*dt; o.y += xpr(p.dy)*dt; } break; }
      case 'set_pos':     { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) { o.x = xpr(p.x); o.y = xpr(p.y); } break; }
      case 'destroy_obj': { const idx = rst.objects.findIndex(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (idx !== -1) rst.objects.splice(idx, 1); break; }
      case 'set_visible': { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) o.visible = p.vis === 'true'; break; }
      case 'restart_layout': _pendingRestart = true; return;
      case 'set_var':     { const v = rst.variables.find(x => x.name === p.varName); if (v) v.value = xpr(p.value); break; }
      case 'add_var':     { const v = rst.variables.find(x => x.name === p.varName); if (v) v.value = parseFloat(v.value) + xpr(p.value); break; }
      case 'set_text': {
        const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx));
        if (o) o.text = String(p.text).replace(/{(\w+)}/g, (m, n) => {
          if (n === 'time')  return new Date().toLocaleTimeString();
          if (n === 'date')  return new Date().toLocaleDateString();
          if (n === 'today') return new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
          const v = rst.variables.find(x => x.name === n); return v ? v.value : m;
        });
        break;
      }
      case 'set_angle':   { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) o.angle = xpr(p.angle); break; }
      case 'rotate_obj':  { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) o.angle += xpr(p.deg)*dt; break; }
      case 'set_opacity': { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) o.opacity = Math.max(0, Math.min(1, xpr(p.opacity))); break; }
      case 'set_color':   { const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx)); if (o) { o.color = p.color; if (o.type === 'label') o.fontColor = p.color; } break; }
      case 'clone_obj': {
        const src = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx));
        if (src) {
          const nid = gid(), cl = JSON.parse(JSON.stringify(src));
          cl.id = nid; cl.name = src.name+'_'+nid; cl.x = xpr(p.x); cl.y = xpr(p.y); cl.zIndex = rst.objects.length;
          rst.objects.push(cl);
        }
        break;
      }
      case 'start_timer': { const t = rst.timers.find(x => x.name === p.timerName); if (t) { t.running = true; t.elapsed = 0; } break; }
      case 'stop_timer':  { const t = rst.timers.find(x => x.name === p.timerName); if (t) t.running = false; break; }
      case 'play_sound': {
        try {
          const ac = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ac.createOscillator(), gn = ac.createGain();
          osc.frequency.value = +p.freq || 440;
          osc.connect(gn); gn.connect(ac.destination);
          gn.gain.setValueAtTime(0.1, ac.currentTime);
          gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (+p.dur || 200) / 1000);
          osc.start(); osc.stop(ac.currentTime + (+p.dur || 200) / 1000);
        } catch (e) {}
        break;
      }
      case 'set_bgcolor': rst.sceneBg = p.color; break;
      case 'get_textedit_text': {
        const o = rst.objects.find(x => x.id == rid(a.objRef ?? p.objId, ctx));
        const v = rst.variables.find(x => x.name === p.varName);
        if (o && v) v.value = o.text || '';
        break;
      }
    }
  }

  // ----------------------------------------------------------------
  // Exécution d'un événement avec expansion des groupes (@groupname)
  // ----------------------------------------------------------------
  function getGroupRefs(ev) {
    const refs = new Set();
    const addV = v => { if (typeof v === 'string' && v.startsWith('@')) refs.add(v); };
    ev.conditions.forEach(c => { addV(c.objRef); Object.values(c.params || {}).forEach(addV); });
    ev.actions.forEach(a    => { addV(a.objRef); Object.values(a.params || {}).forEach(addV); });
    return [...refs];
  }

  function runEv(ev, sec) {
    if (ev.type === 'group') {
      if (ev.enabled !== false) (ev.children || []).forEach(child => runEv(child, sec));
      return;
    }
    const groupRefs = getGroupRefs(ev);
    if (groupRefs.length === 0) {
      if (ev.conditions.length === 0 || ev.conditions.every(c => evalC(c, sec, null))) {
        ev.actions.forEach(a => evalA(a, null));
        // Sub-events : s'exécutent si les conditions du parent sont vraies
        (ev.subEvents || []).forEach(sub => runEv(sub, sec));
      }
      return;
    }
    // Séparer les actions globales (sans @) des actions d'instance (avec @)
    const hasTypeRef = a => (a.objRef && String(a.objRef).startsWith('@')) ||
      Object.values(a.params || {}).some(v => typeof v === 'string' && v.startsWith('@'));
    const globalActs = ev.actions.filter(a => !hasTypeRef(a));
    const instActs   = ev.actions.filter(a =>  hasTypeRef(a));
    // Résoudre chaque ref de type en liste d'instances
    const groupLists = groupRefs.map(g => rst.objects.filter(o => o.typeId == g.slice(1)));
    let globalRan = false;
    // Itérer toutes les combinaisons
    function iter(depth, ctx) {
      if (depth === groupRefs.length) {
        if (ev.conditions.length === 0 || ev.conditions.every(c => evalC(c, sec, ctx))) {
          // Actions globales (add_var, etc.) : une seule fois
          if (!globalRan) { globalActs.forEach(a => evalA(a, null)); globalRan = true; }
          // Actions d'instance : une fois par combinaison
          instActs.forEach(a => evalA(a, ctx));
          // Sub-events avec le même contexte
          (ev.subEvents || []).forEach(sub => runEv(sub, sec));
        }
        return;
      }
      for (const o of groupLists[depth])
        iter(depth + 1, { ...ctx, [groupRefs[depth]]: o.id });
    }
    iter(0, {});
  }

  // ----------------------------------------------------------------
  // Boucle principale
  // ----------------------------------------------------------------
  raf = requestAnimationFrame(function loop(now) {
    dt = Math.min(now - (lrt || now), 50) / 1000;
    lrt = now;
    fa += dt * 1000; ff++;
    if (fa >= 500) { document.getElementById('rfps').textContent = 'FPS: ' + Math.round(ff / (fa/1000)); fa = 0; ff = 0; }

    rst.tick++; rst.timerDone = {}; rst.secAcc += dt * 1000;
    const sec = rst.secAcc >= 1000; if (sec) rst.secAcc -= 1000;

    // Timers
    rst.timers.forEach(t => {
      if (!t.running) return;
      t.elapsed += dt * 1000;
      if (t.elapsed >= t.duration) {
        rst.timerDone[t.name] = true;
        if (t.repeat === 'loop') t.elapsed = 0; else t.running = false;
      }
    });

    const solids = rst.objects.filter(o => (o.behaviors||[]).some(b => b.type === 'solid'));

    // ---- Avancement des frames d'animation ----
    rst.objects.forEach(o => {
      const anim = rst.bstate[o.id]?.anim;
      if (!anim || !o.frames || o.frames.length <= 1) return;
      const fps = o.animFps || 8;
      anim.acc += dt * 1000;
      if (anim.acc >= 1000 / fps) {
        anim.acc = 0;
        anim.fr  = (anim.fr + 1) % o.frames.length;
      }
    });

    // ---- Application des behaviors ----
    rst.objects.forEach(o => {
      const bs = o.behaviors || [];
      const st = rst.bstate[o.id] || {};

      // Invisible
      if (bs.some(b => b.type === 'invisible')) o.visible = false;

      // Flash
      const flash = bs.find(b => b.type === 'flash');
      if (flash) o.opacity = Math.sin(rst.tick / (+(flash.props.period || .5) * 30) * Math.PI) > 0 ? 1 : 0.1;

      // Rotation auto
      const rot = bs.find(b => b.type === 'rotate');
      if (rot) o.angle = (o.angle + (+rot.props.speed || 90) * dt) % 360;

      // Sine (supporte plusieurs instances)
      bs.filter(b => b.type === 'sine').forEach(sineBeh => {
        if (sineBeh._phase === undefined) sineBeh._phase = 0;
        if (!sineBeh._base) sineBeh._base = { x:o.x, y:o.y, angle:o.angle, w:o.w, h:o.h, opacity:o.opacity };
        const speedInput = Math.max(0, Math.min(10, parseFloat(sineBeh.props.speed) || 5));
        const amp   = parseFloat(sineBeh.props.amplitude) || 50;
        const omega = amp > 0.1 ? (speedInput * 10) / amp : 0;
        sineBeh._phase += dt * omega;
        const v = Math.sin(sineBeh._phase) * amp;
        switch (sineBeh.props.mode) {
          case 'horizontal': o.x = sineBeh._base.x + v; break;
          case 'vertical':   o.y = sineBeh._base.y + v; break;
          case 'angle':      o.angle = sineBeh._base.angle + v; break;
          case 'size':       o.w = Math.max(1, sineBeh._base.w + v); o.h = Math.max(1, sineBeh._base.h + v); break;
          case 'opacity':    o.opacity = Math.max(0, Math.min(1, sineBeh._base.opacity + v/100)); break;
          default:           o.x = sineBeh._base.x + v;
        }
      });

      // Bounce
      if (st.bounce) {
        o.x += st.bounce.vx * dt; o.y += st.bounce.vy * dt;
        if (o.x < 0 || o.x+o.w > rst.w) { st.bounce.vx *= -1; o.x = Math.max(0, Math.min(rst.w-o.w, o.x)); }
        if (o.y < 0 || o.y+o.h > rst.h) { st.bounce.vy *= -1; o.y = Math.max(0, Math.min(rst.h-o.h, o.y)); }
      }

      // 8 directions — BUGFIX: WASD utilisait ArrowRight dans les deux branches
      const dir8 = bs.find(b => b.type === '8dir');
      if (dir8) {
        const spd = +(dir8.props.speed || 150);
        const useWasd = dir8.props.keys === 'wasd';
        const L = useWasd ? rst.keys['KeyA']     : rst.keys['ArrowLeft'];
        const R = useWasd ? rst.keys['KeyD']     : rst.keys['ArrowRight'];
        const U = useWasd ? rst.keys['KeyW']     : rst.keys['ArrowUp'];
        const D = useWasd ? rst.keys['KeyS']     : rst.keys['ArrowDown'];
        if (L) o.x -= spd*dt; if (R) o.x += spd*dt;
        if (U) o.y -= spd*dt; if (D) o.y += spd*dt;
      }

      // Platformer
      const plat = bs.find(b => b.type === 'platform');
      if (plat && st.platform !== undefined) {
        const spd = +(plat.props.speed || 200), jmp = +(plat.props.jumpStr || 450), grav = +(plat.props.gravity || 900);
        const L = rst.keys['ArrowLeft'] || rst.keys['KeyA'];
        const R = rst.keys['ArrowRight']|| rst.keys['KeyD'];
        const J = (rst.pressed['ArrowUp'] || rst.pressed['KeyW'] || rst.pressed['Space']) && st.platform.onGround;
        if (L) o.x -= spd*dt; if (R) o.x += spd*dt;
        if (J) st.platform.vy = -jmp;
        st.platform.vy += grav * dt;
        o.y += st.platform.vy * dt;
        st.platform.onGround = false;
        solids.forEach(s => {
          if (o.id === s.id) return;
          const co = _collBounds(o, rst.objects), cs = _collBounds(s, rst.objects);
          if (co.x2 > cs.x1+2 && co.x1 < cs.x2-2 && co.y2 > cs.y1 && co.y2 < cs.y2+10 && st.platform.vy >= 0) {
            o.y = cs.y1 - (co.y2 - o.y); st.platform.vy = 0; st.platform.onGround = true;
          }
        });
      }

      // Gravité seule
      if (st.gravity) {
        const g    = bs.find(b => b.type === 'gravity');
        const grav = +(g.props.gravity || 600), maxF = +(g.props.maxFall || 800);
        st.gravity.vy = Math.min(st.gravity.vy + grav*dt, maxF);
        o.y += st.gravity.vy * dt;
        solids.forEach(s => {
          if (o.id === s.id) return;
          const co = _collBounds(o, rst.objects), cs = _collBounds(s, rst.objects);
          if (co.x2 > cs.x1 && co.x1 < cs.x2 && co.y2 > cs.y1 && co.y2 < cs.y2 + st.gravity.vy*dt + 4) {
            o.y = cs.y1 - (co.y2 - o.y); st.gravity.vy = 0;
          }
        });
      }

      // Follow
      const fol = bs.find(b => b.type === 'follow');
      if (fol) {
        const tgt = rst.objects.find(x => x.id == fol.props.targetId);
        if (tgt) {
          const dx = tgt.x+tgt.w/2 - (o.x+o.w/2), dy = tgt.y+tgt.h/2 - (o.y+o.h/2);
          const dist = Math.sqrt(dx*dx + dy*dy);
          const minD = +(fol.props.minDist || 10);
          if (dist > minD) { const spd = +(fol.props.speed || 100); o.x += dx/dist*spd*dt; o.y += dy/dist*spd*dt; }
        }
      }

      // Détruire hors écran
      if (bs.some(b => b.type === 'destroy_offscreen')) {
        if (o.x > rst.w+10 || o.x+o.w < -10 || o.y > rst.h+10 || o.y+o.h < -10) {
          const idx = rst.objects.indexOf(o); if (idx !== -1) rst.objects.splice(idx, 1);
        }
      }
    });

    // ---- Mouse enter / leave ----
    const curOver = new Set();
    rst.objects.forEach(o => {
      if (o.visible && rst.mouse.x >= o.x && rst.mouse.x <= o.x+o.w && rst.mouse.y >= o.y && rst.mouse.y <= o.y+o.h)
        curOver.add(o.id);
    });
    rst.mouseEntered = new Set([...curOver].filter(id => !rst.mouseOver.has(id)));
    rst.mouseLeft    = new Set([...rst.mouseOver].filter(id => !curOver.has(id)));
    rst.mouseOver    = curOver;

    // ---- Événements ----
    function runEvOrGroup(ev) {
      if (ev.type === 'group') {
        if (ev.enabled !== false) (ev.children || []).forEach(runEvOrGroup);
        return;
      }
      const isStart = ev.isStart || (ev.conditions || []).some(c => c.type === 'start_layout');
      if (isStart) {
        if (rst.startFired) return;
        rst.startFired = true;
      }
      runEv(ev, sec);
    }
    for (const ev of events) runEvOrGroup(ev);

    // ---- Rendu ----
    rctx.fillStyle = rst.sceneBg; rctx.fillRect(0, 0, rst.w, rst.h);
    [...rst.objects].filter(o => o.visible).sort((a,b) => a.zIndex - b.zIndex).forEach(o => {
      rctx.save();
      rctx.globalAlpha = o.opacity;
      rctx.translate(o.x+o.w/2, o.y+o.h/2); rctx.rotate(o.angle * Math.PI/180); rctx.translate(-o.w/2, -o.h/2);
      const runtimeFr = rst.bstate[o.id]?.anim?.fr ?? 0;
      const focused   = (o.id === rst.focusedTextEditId);
      drawObject(rctx, o, runtimeFr, focused);
      rctx.restore();
    });

    rst.pressed = {}; rst.clicked = false; rst.textEditSubmitted = null;
    if (_pendingRestart) { _pendingRestart = false; restartGame(); return; }
    raf = requestAnimationFrame(loop);
  });

  // Méthode d'arrêt attachée à l'overlay
  ov._stop = () => {
    cancelAnimationFrame(raf); raf = null; lrt = 0;
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    rc.removeEventListener('mousemove', mm);   rc.removeEventListener('click', mc);
    rc.removeEventListener('mousedown', mdown);rc.removeEventListener('mousemove', mmove2); rc.removeEventListener('mouseup', mup2);
  };
}

// ----------------------------------------------------------------
// Arrêter la prévisualisation
// ----------------------------------------------------------------
function stopGame() {
  const ov = document.getElementById('runov');
  if (ov._stop) ov._stop();
  ov.classList.remove('on');
}

// ----------------------------------------------------------------
// Redémarrer (arrêt + relance immédiate)
// ----------------------------------------------------------------
function restartGame() {
  const ov = document.getElementById('runov');
  if (ov._stop) ov._stop();
  runGame();
}
