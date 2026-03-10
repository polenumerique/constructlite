// ================================================================
// state.js — État global, présets et catalogues
// Toutes les données partagées entre modules sont ici.
// ================================================================

// --- Données du projet ---
let objects   = [];
let variables = [];
let timers    = [];
let events    = [];
let _nid  = 1;   // Prochain ID objet
let _neid = 1;   // Prochain ID événement

// --- Paramètres globaux du jeu ---
let gameSettings = { name:'Mon Jeu', width:800, height:500, bgColor:'#ffffff', grid:{ enabled:false, size:32, snap:true } };

const gid  = () => _nid++;
const geid = () => _neid++;

// --- Sélection courante ---
let selId  = null;
let selIds = new Set(); // multi-sélection (type complet depuis la bibliothèque)

// --- Types lib qui sont stockés comme 'sprite' dans la scène ---
const SPRITE_LIBTYPES = new Set(['sprite']);

// --- Présets par type de bibliothèque ---
const OBJ_PRESETS = {
  sprite:   { w:64,  h:64,  color:'#5b8fff', text:'', behaviors:[] },
  button:   { w:120, h:40,  color:'#5b8fff', bgColor:'#5b8fff', text:'Bouton', fontSize:13, fontColor:'#ffffff', behaviors:[] },
  label:    { w:130, h:28,  color:'#ffffff', text:'Label',  fontSize:15, fontColor:'#000000', behaviors:[] },
  textedit: { w:200, h:34,  bgColor:'#ffffff', text:'', placeholder:'Saisissez...', fontSize:13, fontColor:'#333333', borderColor:'#aaaaaa', behaviors:[] },
};

// --- Catalogue des behaviors disponibles ---
const BEH_CATALOG = [
  {
    type:'8dir', icon:'🕹', name:'8 directions', desc:'Déplacement clavier 8 dirs',
    props:[
      {n:'speed', l:'Vitesse (px/s)', def:150},
      {n:'accel', l:'Accélération',   def:800},
      {n:'keys',  l:'Touches',        def:'arrows', t:'sel', opts:['arrows','wasd']},
    ],
  },
  {
    type:'platform', icon:'🦘', name:'Platformer', desc:'Gravité + saut + sol',
    props:[
      {n:'speed',   l:'Vitesse (px/s)', def:200},
      {n:'jumpStr', l:'Force de saut',  def:450},
      {n:'gravity', l:'Gravité',        def:900},
    ],
  },
  {
    type:'sine', icon:'↔️', name:'Sine', desc:'Mouvement sinusoïdal', multi: true,
    props:[
      {n:'mode',      l:'Type',          def:'horizontal', t:'sel', opts:['horizontal','vertical','angle','size','opacity']},
      {n:'speed',     l:'Vitesse (0-10)',def:5, min:0, max:10},
      {n:'amplitude', l:'Amplitude',     def:50},
    ],
  },
  {
    type:'follow', icon:'🎯', name:'Follow', desc:'Suit un objet cible',
    props:[
      {n:'targetId', l:'ID objet cible', def:'', t:'obj'},
      {n:'speed',    l:'Vitesse',        def:100},
      {n:'minDist',  l:'Dist. min',      def:10},
    ],
  },
  {
    type:'rotate', icon:'🔄', name:'Rotation auto', desc:'Tourne en continu',
    props:[{n:'speed', l:'Degrés/sec', def:90}],
  },
  {
    type:'bounce', icon:'⚽', name:'Bounce', desc:'Rebondit sur les bords',
    props:[{n:'speedX', l:'Vitesse X', def:120}, {n:'speedY', l:'Vitesse Y', def:100}],
  },
  { type:'solid',            icon:'🧱', name:'Solid',              desc:'Objet solide (collision)', props:[] },
  {
    type:'flash', icon:'✨', name:'Flash', desc:'Clignote périodiquement',
    props:[{n:'period', l:'Période (s)', def:0.5}],
  },
  { type:'destroy_offscreen', icon:'💨', name:'Détruire hors écran', desc:'Détruit quand hors vue', props:[] },
  { type:'invisible',         icon:'👁‍🗨', name:'Invisible',          desc:"Invisible à l'exécution", props:[] },
  { type:'drag',              icon:'✋', name:'Drag & Drop',        desc:'Glissable à la souris',    props:[] },
  {
    type:'gravity', icon:'🌍', name:'Gravité seule', desc:'Tombe sans contrôle',
    props:[{n:'gravity', l:'Gravité', def:600}, {n:'maxFall', l:'Vitesse max chute', def:800}],
  },
];

// --- Catalogue des conditions ---
// cat = catégorie wizard ('system' | 'keyboard' | 'object')
// Les conditions 'object' utilisent c.objRef (pas de param objId)
const CONDS = [
  { id:'start_layout', label:'Au démarrage du layout',  cat:'system',   params:[] },
  { id:'every_tick',   label:'Chaque tick (60×/s)',      cat:'system',   params:[] },
  { id:'every_n_sec',  label:'Toutes les N secondes',   cat:'system',   params:[{n:'n',l:'Secondes',t:'num'}] },
  { id:'var_compare',  label:'Comparer une variable',   cat:'system',   params:[{n:'varName',l:'Variable',t:'var'},{n:'op',l:'Opérateur',t:'sel',opts:['==','!=','>','<','>=','<=']},{n:'value',l:'Valeur',t:'text'}] },
  { id:'timer_done',   label:'Timer terminé',           cat:'system',   params:[{n:'timerName',l:'Timer',t:'tmr'}] },
  { id:'key_pressed',  label:'Touche pressée (1 fois)', cat:'keyboard', params:[{n:'key',l:'Touche',t:'key'}] },
  { id:'key_down',     label:'Touche maintenue',        cat:'keyboard', params:[{n:'key',l:'Touche',t:'key'}] },
  // Object : objRef stocké sur la condition, pas dans params
  { id:'obj_clicked',  label:'Est cliqué',              cat:'object',   params:[] },
  { id:'mouse_over',   label:'Tant que curseur dessus', cat:'object',   params:[] },
  { id:'mouse_enter',  label:'Souris entre (1 fois)',   cat:'object',   params:[] },
  { id:'mouse_leave',  label:'Souris sort (1 fois)',    cat:'object',   params:[] },
  { id:'obj_overlaps', label:'Chevauche un autre objet',cat:'object',   params:[{n:'objB',l:'Autre objet',t:'objtype'}] },
  { id:'obj_offscreen',      label:'Est hors écran',               cat:'object',   params:[] },
  { id:'textedit_focused',   label:'TextEdit est focalisé',        cat:'object',   params:[] },
  { id:'textedit_submitted', label:'TextEdit validé (Entrée)',     cat:'object',   params:[] },
];

// --- Catalogue des actions ---
// Les actions 'object' utilisent a.objRef (pas de param objId)
const ACTS = [
  { id:'restart_layout', label:'Redémarrer le niveau',  cat:'system',  params:[] },
  { id:'set_var',     label:'Variable = valeur',        cat:'system',  params:[{n:'varName',l:'Variable',t:'var'},{n:'value',l:'Valeur',t:'text'}] },
  { id:'add_var',     label:'Variable += valeur',       cat:'system',  params:[{n:'varName',l:'Variable',t:'var'},{n:'value',l:'Valeur',t:'text'}] },
  { id:'start_timer', label:'Démarrer timer',           cat:'system',  params:[{n:'timerName',l:'Timer',t:'tmr'}] },
  { id:'stop_timer',  label:'Arrêter timer',            cat:'system',  params:[{n:'timerName',l:'Timer',t:'tmr'}] },
  { id:'set_bgcolor', label:'Couleur de fond de scène', cat:'system',  params:[{n:'color',l:'Couleur',t:'color'}] },
  { id:'play_sound',  label:'Jouer un son bip',         cat:'audio',   params:[{n:'freq',l:'Fréquence Hz',t:'num'},{n:'dur',l:'Durée ms',t:'num'}] },
  // Object : objRef stocké sur l'action, pas dans params
  { id:'move_obj',    label:'Déplacer (ΔX, ΔY/s)',      cat:'object',  params:[{n:'dx',l:'ΔX',t:'text'},{n:'dy',l:'ΔY',t:'text'}] },
  { id:'set_pos',     label:'Définir position X, Y',    cat:'object',  params:[{n:'x',l:'X',t:'text'},{n:'y',l:'Y',t:'text'}] },
  { id:'destroy_obj', label:'Détruire',                 cat:'object',  params:[] },
  { id:'set_visible', label:'Visibilité',               cat:'object',  params:[{n:'vis',l:'Visible',t:'sel',opts:['true','false']}] },
  { id:'set_angle',   label:'Angle = valeur',           cat:'object',  params:[{n:'angle',l:'Angle°',t:'text'}] },
  { id:'rotate_obj',  label:'Rotation (+=) degrés/s',  cat:'object',  params:[{n:'deg',l:'Degrés/s',t:'text'}] },
  { id:'set_opacity', label:'Opacité (0–1)',            cat:'object',  params:[{n:'opacity',l:'Valeur',t:'text'}] },
  { id:'set_color',   label:'Couleur',                  cat:'object',  params:[{n:'color',l:'Couleur',t:'color'}] },
  { id:'clone_obj',   label:'Créer une copie à X,Y',   cat:'object',  params:[{n:'x',l:'X',t:'text'},{n:'y',l:'Y',t:'text'}] },
  { id:'set_text',          label:'Définir le texte',           cat:'object',  params:[{n:'text',l:'Texte',t:'text'}] },
  { id:'get_textedit_text', label:'Lire le texte → variable',  cat:'object',  params:[{n:'varName',l:'Variable',t:'var'}] },
];

// Conditions/actions disponibles quand on sélectionne un type d'objet de scène
const OBJ_COND_IDS = ['obj_clicked','mouse_over','mouse_enter','mouse_leave','obj_overlaps','obj_offscreen','textedit_focused','textedit_submitted'];
const OBJ_ACT_IDS  = ['move_obj','set_pos','destroy_obj','set_visible','set_angle','rotate_obj','set_opacity','set_color','clone_obj','set_text','get_textedit_text'];

// --- Couleurs / icônes par libType (utilisées dans canvas et scene list) ---
const typeColor = {};
const typeIcon  = { sprite:'', button:'', label:'', textedit:'' };
