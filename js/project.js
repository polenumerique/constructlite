// ================================================================
// project.js — Sauvegarde, chargement et réinitialisation du projet
// ================================================================

function saveProject() {
  const d = JSON.stringify({ objects, variables, timers, events, _nid, _neid, gameSettings }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([d], { type:'application/json' }));
  a.download = 'project.clite';
  a.click();
}

function loadProject() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.clite,.json';
  input.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d   = JSON.parse(ev.target.result);
        objects   = d.objects   || [];
        objects.forEach(o => { if (o.typeId === undefined) o.typeId = o.id; });
        variables = d.variables || [];
        timers    = d.timers    || [];
        events    = d.events    || [];
        // Compat descendante : normaliser les vieux événements
        (events || []).forEach(function normalizeEv(ev) {
          if (!ev.type) ev.type = 'event';
          if (!ev.subEvents) ev.subEvents = [];
          (ev.conditions || []).forEach(c => {
            if (c.negated === undefined) c.negated = false;
            // Migrer params.objId / params.objA → c.objRef
            if (!c.objRef) {
              if (c.params?.objA)  { c.objRef = c.params.objA;  delete c.params.objA;  }
              else if (c.params?.objId) { c.objRef = c.params.objId; delete c.params.objId; }
            }
          });
          (ev.actions || []).forEach(a => {
            // Migrer params.objId → a.objRef
            if (!a.objRef && a.params?.objId) { a.objRef = a.params.objId; delete a.params.objId; }
          });
          (ev.subEvents || []).forEach(normalizeEv);
          if (ev.type === 'group') (ev.children || []).forEach(normalizeEv);
        });
        _nid      = d._nid      || 1;
        _neid     = d._neid     || 1;
        if (d.gameSettings) Object.assign(gameSettings, d.gameSettings);
        if (!gameSettings.grid) gameSettings.grid = { enabled:false, size:32, snap:true };
        applyGameSize(gameSettings.width, gameSettings.height);
        syncGridUI();
        renderSceneList(); renderVars(); renderTmrs(); renderEvs(); renderCvs(); updSt(); showProps(null);
      } catch { alert('Fichier invalide.'); }
    };
    r.readAsText(f);
  };
  input.click();
}

function newProject() {
  if (!confirm('Nouveau projet ? Les modifications non sauvegardées seront perdues.')) return;
  objects = []; variables = []; timers = []; events = [];
  _nid = 1; _neid = 1; selId = null;
  Object.assign(gameSettings, { name:'Mon Jeu', width:800, height:500, bgColor:'#0d0f14', grid:{ enabled:false, size:32, snap:true } });
  applyGameSize(800, 500);
  syncGridUI();
  renderSceneList(); renderVars(); renderTmrs(); renderEvs(); renderCvs(); updSt(); showProps(null);
}
