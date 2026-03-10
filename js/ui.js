// ================================================================
// ui.js — Navigation, dialogs, thème, statusbar
// ================================================================

// ----------------------------------------------------------------
// Thème clair / sombre
// ----------------------------------------------------------------
function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
}
window.addEventListener('load', () => {
  if (localStorage.getItem('theme') === 'light') document.body.classList.add('light');
});

// ----------------------------------------------------------------
// Raccourcis clavier éditeur
// ----------------------------------------------------------------
window.addEventListener('keydown', e => {
  // Ignorer si le focus est dans un champ de saisie
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Suppr / Backspace → supprimer la sélection (1 ou plusieurs objets)
  if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.size > 0) {
    e.preventDefault();
    delSelected();
  }
});

// ----------------------------------------------------------------
// Toast notifications
// ----------------------------------------------------------------
function toast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = `<span class="toast-icon">${type === 'error' ? '⚠' : type === 'success' ? '✓' : 'ℹ'}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  setTimeout(() => {
    el.classList.remove('toast-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3000);
}

// ----------------------------------------------------------------
// Onglets principaux (Éditeur / Codage Visuel)
// ----------------------------------------------------------------
function switchTab(t) {
  document.getElementById('t-ed').style.display = t === 'ed' ? 'flex' : 'none';
  document.getElementById('t-ev').style.display = t === 'ev' ? 'flex' : 'none';
  document.getElementById('mt-ed').classList.toggle('on', t === 'ed');
  document.getElementById('mt-ev').classList.toggle('on', t === 'ev');
}

// ----------------------------------------------------------------
// Onglets du panel droit (Propriétés / Bibliothèque / Behaviors)
// ----------------------------------------------------------------
function switchRP(p) {
  ['props', 'lib', 'beh'].forEach(x => {
    document.getElementById('rp-' + x).classList.toggle('on', x === p);
    document.getElementById('rp-' + x + '-body').classList.toggle('on', x === p);
  });
  if (p === 'beh') renderBehPanel();
}

// ----------------------------------------------------------------
// Dialogs génériques
// ----------------------------------------------------------------
function showDlg(id) {
  document.getElementById('mbg').classList.add('on');
  document.getElementById(id).classList.add('on');
}
function closeDlg() {
  // Ne ferme que les .dlg — ne touche PAS #pxmod (pixel editor)
  document.getElementById('mbg').classList.remove('on');
  document.querySelectorAll('.dlg').forEach(d => d.classList.remove('on'));
}

// ----------------------------------------------------------------
// Sous-sections pliables (Variables / Timers)
// ----------------------------------------------------------------
function togSS(k) {
  const h = document.getElementById('ssh-' + k);
  const b = document.getElementById('ssb-' + k);
  const op = h.classList.toggle('op');
  b.classList.toggle('hid', !op);
}

// ----------------------------------------------------------------
// Statusbar
// ----------------------------------------------------------------
function updSt() {
  document.getElementById('s-obj').textContent = objects.length;
}
