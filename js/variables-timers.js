// ================================================================
// variables-timers.js — Gestion des variables et timers
// ================================================================

// ----------------------------------------------------------------
// Variables
// ----------------------------------------------------------------
function addVar() { showDlg('dlg-v'); }

function confVar() {
  const n = document.getElementById('dv-n').value.trim();
  if (!n) return;
  if (variables.some(v => v.name === n)) { toast(`Variable "${n}" existe déjà.`); return; }
  const t = document.getElementById('dv-t').value;
  let   v = document.getElementById('dv-v').value;
  if (t === 'number')  v = parseFloat(v) || 0;
  if (t === 'boolean') v = v === 'true';
  variables.push({ name:n, type:t, value:v });
  renderVars(); closeDlg();
}

function renderVars() {
  const el = document.getElementById('ssb-v');
  el.innerHTML = '';
  variables.forEach((v, i) => {
    const d = document.createElement('div');
    d.className = 'vrow';
    d.innerHTML = `
      <span class="vn">${v.name}</span>
      <span class="vt">${v.type}</span>
      <span class="vv">${v.value}</span>
      <button class="ib dl" onclick="variables.splice(${i},1);renderVars()" style="margin-left:auto">×</button>`;
    el.appendChild(d);
  });
}

// ----------------------------------------------------------------
// Timers
// ----------------------------------------------------------------
function addTmr() { showDlg('dlg-t'); }

function confTmr() {
  const n   = document.getElementById('dt-n').value.trim();
  if (!n) return;
  if (timers.some(t => t.name === n)) { toast(`Timer "${n}" existe déjà.`); return; }
  const dur = +document.getElementById('dt-d').value || 3000;
  const rep = document.getElementById('dt-r').value;
  timers.push({ name:n, duration:dur, repeat:rep, elapsed:0, running:false });
  renderTmrs(); closeDlg();
}

function renderTmrs() {
  const el = document.getElementById('ssb-t');
  el.innerHTML = '';
  timers.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'trow';
    d.innerHTML = `
      <div class="tdot ${t.running ? '' : 'off'}"></div>
      <span style="flex:1;font-size:11px">${t.name}</span>
      <span style="font-size:9px;color:var(--dim)">${(t.duration / 1000).toFixed(1)}s ${t.repeat}</span>
      <button class="ib dl" onclick="timers.splice(${i},1);renderTmrs()" style="margin-left:4px">×</button>`;
    el.appendChild(d);
  });
}
