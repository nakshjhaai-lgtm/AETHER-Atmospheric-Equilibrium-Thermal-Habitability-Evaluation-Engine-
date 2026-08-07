// app.js: AETHER orchestrator
// ---------------------------------------------------------------------------
// Binds DOM → state → math → shader/audio pipeline.

import { STELLAR_PRESETS, CORE_PRESETS, ASTRO_CONSTANTS, BASELINES } from './schema/constants.js';
import { globalIndex, stellarLifecycle, stellarWindLevel, habitableZone } from './solvers/climate-utils.js';
import { ModelAdapter } from './models/model-adapter.js';
import { ReducedClimateSolver } from './solvers/reduced-climate.js';
import { AdvancedClimateSolver } from './solvers/advanced-climate.js';
import { QHFSolver } from './solvers/qhf.js';

import { ModeController } from './ui/mode-controller.js';
import { ResultRenderer } from './ui/result-renderer.js';
import { bindModeSelector, bindAtmosphereControls, bindBiologyTarget, bindScenarioEditor, renderQHFResult } from './ui/integration.js';
import { ShaderEngine } from './shader-engine.js';
import { AudioEngine, freqToNote } from './audio-engine.js';

// ---------- Preset catalogs ----------
const BOTTOM_PRESETS = [
  { id:'earth',    name:'Earth System',     badge:'G-Type', stellarClass:'G-Type (Sol)',      flux:1.00, radius:1.00, desc:'Reference baseline. Values normalized to 1 Earth mass, 1 Earth radius, 1 AU, 288 K.', color:'#00e5ff',
    state:{ stellar:'G', pDistance:1.00, pRadius:1.00, pMass:1.00, pAlbedo:0.30, pTau:1.50, core:'silicate', label:'EARTH SYSTEM' } },
  { id:'mars',     name:'Mars System',      badge:'G-Type', stellarClass:'G-Type (Sol)',      flux:0.43, radius:0.53, desc:'Sub-freezing desert world. Observed values: radius 0.53 R⊕, orbit 1.52 AU. Albedo and τ are estimates.', color:'#ff6600',
    state:{ stellar:'G', pDistance:1.52, pRadius:0.53, pMass:0.107,pAlbedo:0.25, pTau:0.40, core:'silicate', label:'MARS SYSTEM' } },
  { id:'venus',    name:'Venus System',     badge:'G-Type', stellarClass:'G-Type (Sol)',      flux:1.91, radius:0.95, desc:'Runaway greenhouse state. Observed: radius 0.95 R⊕, orbit 0.72 AU. τ≈12 is an illustrative extreme.', color:'#ffe600',
    state:{ stellar:'G', pDistance:0.72, pRadius:0.95, pMass:0.815,pAlbedo:0.75, pTau:12.0, core:'silicate', label:'VENUS SYSTEM' } },
  { id:'trappist', name:'TRAPPIST-1e',      badge:'M-Type', stellarClass:'M-Type (Red Dwarf)',flux:0.66, radius:0.92, desc:'Candidate in an ultra-cool dwarf system. Radius and orbit are observed; albedo and τ are estimated.', color:'#ff6a30',
    state:{ stellar:'M', pDistance:0.029,pRadius:0.92, pMass:0.69, pAlbedo:0.30, pTau:1.20, core:'silicate', label:'TRAPPIST-1E' } },
  { id:'kepler452',name:'Kepler-452b',      badge:'G-Type', stellarClass:'G-Type (Aged Main)',flux:1.10, radius:1.63, desc:'Super-Earth orbiting a sun-like star. Radius is observed; mass is estimated. Albedo and τ are assumed.', color:'#6aa8ff',
    state:{ stellar:'G', pDistance:1.05, pRadius:1.63, pMass:3.29, pAlbedo:0.30, pTau:1.60, core:'silicate', label:'KEPLER-452B' } }
];

const CATALOG_PRESETS = [
  { name:'Kepler-22b',         hostClass:'G-Yellow Star', orbit:0.81, esi:0.75, color:'#6aa8ff',
    dataNote:'Radius observed; mass estimated. Albedo/τ assumed.',
    state:{ stellar:'G', pDistance:0.81, pRadius:2.38, pMass:6.4,  pAlbedo:0.30, pTau:1.3, core:'water', label:'KEPLER-22B' } },
  { name:'LHS 475b',           hostClass:'M-Red Dwarf',   orbit:0.02, vsi:0.93, color:'#ff6a30',
    dataNote:'Radius observed (JWST). Mass estimated. Albedo/τ illustrative.',
    state:{ stellar:'M', pDistance:0.02, pRadius:0.99, pMass:0.91, pAlbedo:0.45, pTau:8.0, core:'iron', label:'LHS 475B' } },
  { name:'Proxima Centauri b', hostClass:'M-Red Dwarf',   orbit:0.05, esi:0.87, color:'#ff8a3c',
    dataNote:'Minimum mass from radial velocity. Radius assumed. Albedo/τ estimated.',
    state:{ stellar:'M', pDistance:0.049,pRadius:1.08, pMass:1.27, pAlbedo:0.30, pTau:1.4, core:'silicate', label:'PROXIMA B' } },
  { name:'Kepler-186f',        hostClass:'M-Red Dwarf',   orbit:0.40, esi:0.61, color:'#4da6ff',
    dataNote:'Radius from transit. Mass estimated. Albedo/τ assumed.',
    state:{ stellar:'M', pDistance:0.40, pRadius:1.17, pMass:1.44, pAlbedo:0.30, pTau:1.5, core:'silicate', label:'KEPLER-186F' } },
  { name:'TOI-700 d',          hostClass:'M-Red Dwarf',   orbit:0.16, esi:0.93, color:'#00e5ff',
    dataNote:'Radius from transit (TESS). Mass estimated. Albedo/τ assumed.',
    state:{ stellar:'M', pDistance:0.163,pRadius:1.07,pMass:1.25, pAlbedo:0.30, pTau:1.5, core:'water', label:'TOI-700 D' } }
];

// ---------- State ----------
const state = {
  mode: 'astrobiology',
  telemetry: false,
  star: { teff: 5780, rstar: 1.00, lum: 1.00, preset: 'G' },
  planet: {
    distance: 1.00, radius: 1.00, mass: 1.00,
    albedo: 0.30, tau: 1.50, core: 'silicate', densityMul: 1.00,
    density_cgs: 5.51, vesc_kms: 11.2, g_ms2: 9.81,
    gEarth: 1.0, escapeNorm: 1.0, tEq: 255, tSurf: 288, climate: null
  },
  devices: { gyro: false, audio: false, haptics: true, night: false },
  ui: { activeTab:'stellar', drawerOpen:false, distanceUnit:'AU', mobileDockOpen:false },
  _dirty: { ui:true, lastUI:0, lastPhysics:0, lastScope:0, _lastClimate:null }
};

// DOM refs (cached at startup)
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const refs = {};

let shader, audio, running = true;
const adapter = new ModelAdapter();
const reducedSolver = new ReducedClimateSolver();
const advancedSolver = new AdvancedClimateSolver();
const qhfSolver = new QHFSolver();
const modeController = new ModeController();
let resultRenderer = null;
let currentBiologyTarget = 'surface_liquid_water';
let currentFidelity = 'reduced';

window.addEventListener('DOMContentLoaded', () => {
  cacheRefs();
  shader = new ShaderEngine(refs.webgl);
  shader.setupScene();
  audio = new AudioEngine();

  buildPresetCarousel();
  buildCatalogList();
  bindTabs(); bindModePills(); bindSliders(); bindNumBadges();
  bindToggles(); bindChips(); bindOverlays(); bindDialog();
  bindDrawer(); bindUnitToggle(); bindReticle();
  bindVisibility(); bindMobileDock();
  bindDisclaimer(); bindOnboarding(); bindReset(); bindShare(); bindEscapeKey(); bindOfflineState();
  bindModeSelector(modeController, state);
  bindAtmosphereControls(state, refs);
  bindBiologyTarget(state, { get value() { return currentBiologyTarget; }, set value(v) { currentBiologyTarget = v; } });
  bindScenarioEditor(adapter, state, { get value() { return currentFidelity; }, set value(v) { currentFidelity = v; } }, { get value() { return currentBiologyTarget; }, set value(v) { currentBiologyTarget = v; } });
  detectCapabilities();
  loadStateFromURL();

  resultRenderer = new ResultRenderer(document.getElementById('qhf-result-body'));

  applyStellarPreset('G', true);
  applyCorePreset('silicate', true);
  setActivePreset('earth');
  setSliderFills();
  document.body.dataset.mode = state.mode;
  applyModeAccent();
  state._dirty.ui = true;

  // Casual guided tutorial popups (transient, non-blocking)
  showTutorialTips();

  window.addEventListener('resize', onResize);

  let last = performance.now();
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updatePhysics();
    shader.render(dt, now * 0.001);
    if (audio.running && now - state._dirty.lastPhysics > 66) {
      audio.synthesize(state.planet.tSurf, state.planet.tau);
      state._dirty.lastPhysics = now;
    }
    if (now - state._dirty.lastScope > 50) { drawScopes(); state._dirty.lastScope = now; }
    if (state._dirty.ui || now - state._dirty.lastUI > 66) {
      syncUI(); state._dirty.ui = false; state._dirty.lastUI = now;
    }
  }
  requestAnimationFrame(tick);
});

function cacheRefs() {
  refs.webgl = document.getElementById('webgl-viewport');
  refs.fps   = document.getElementById('fps-readout');
  refs.hudMode = $('#hud-mode');
  refs.hudTarget = $('#hud-target');
  refs.hudStatus = $('#hud-status');
  refs.reticle = $('#reticle');
  refs.oscopeSmall = $('#oscope-canvas');
  refs.oscopeSmallCtx = refs.oscopeSmall.getContext('2d');
  refs.oscopeBig = $('#oscope-big');
  refs.oscopeBigCtx = refs.oscopeBig.getContext('2d');
  refs.oscopeFreq = $('#oscope-freq');
  refs.sonPitch = $('#son-pitch'); refs.sonLpf = $('#son-lpf'); refs.sonTau = $('#son-tau');
  refs.esi = $('#val-esi'); refs.msi = $('#val-msi'); refs.vsi = $('#val-vsi');
  refs.esiRing = $('#esi-ring'); refs.msiRing = $('#msi-ring'); refs.vsiRing = $('#vsi-ring');
  refs.rLum = $('#r-lum'); refs.rLife = $('#r-lifecycle'); refs.rLifeState = $('#r-lifecycle-state');
  refs.rWind = $('#r-wind'); refs.rHZ = $('#r-hz');
  refs.vDensity = $('#v-density'); refs.vDensitySub = refs.vDensity.nextElementSibling;
  refs.vVesc = $('#v-vesc'); refs.vVescSub = refs.vVesc.nextElementSibling;
  refs.vGrav = $('#v-grav'); refs.vGravSub = refs.vGrav.nextElementSibling;
  refs.vTeq = $('#v-teq'); refs.vTsurf = $('#v-tsurf');
  refs.cmpT = { r:$('#cmp-t-r'), rho:$('#cmp-t-rho'), v:$('#cmp-t-v'), g:$('#cmp-t-g'), t:$('#cmp-t-t'), si:$('#cmp-t-si') };
  refs.cmpEarthSi = $('#cmp-earth-si'); refs.cmpMarsSi = $('#cmp-mars-si'); refs.cmpVenusSi = $('#cmp-venus-si');
  refs.climateBadge = $('#climate-badge');
  refs.cDot = refs.climateBadge.querySelector('.climate-badge__dot');
  refs.cLabel = refs.climateBadge.querySelector('b');
  refs.cSub = refs.climateBadge.querySelector('i');
  refs.hzMarkerRV = $('#hz-marker-rv'); refs.hzMarkerRG = $('#hz-marker-rg');
  refs.hzMarkerMG = $('#hz-marker-mg'); refs.hzMarkerEM = $('#hz-marker-em');
  refs.hzZones = $$('.hz-zone'); refs.hzTarget = $('#hz-target');
  refs.hzTargetLabel = $('#hz-target-label'); refs.hzStatus = $('#hz-status');
  refs.starTarget = $('#star-target'); refs.planetCrossTarget = $('#planet-cross-target');
  refs.specPath = $('#spectrum-path'); refs.specLine = $('#spectrum-line');
  refs.btnTelemetry = $('#btn-telemetry');
  refs.btnGyro = $('#btn-gyro'); refs.gyroStatus = $('#gyro-status');
  refs.btnMic = $('#btn-mic'); refs.micStatus = $('#mic-status');
  refs.btnAudio = $('#btn-audio'); refs.audioState = $('#audio-state');
  refs.audioSwitch = refs.btnAudio.querySelector('.toggle-switch');
  refs.sliders = {
    's-teff': document.getElementById('s-teff'),
    's-rstar':document.getElementById('s-rstar'),
    'p-distance':document.getElementById('p-distance'),
    'p-radius':document.getElementById('p-radius'),
    'p-mass':document.getElementById('p-mass'),
    'p-albedo':document.getElementById('p-albedo'),
    'p-tau':document.getElementById('p-tau')
  };
  refs.badges = {}; $$('.num-badge').forEach(b => refs.badges[b.dataset.for] = b);
  refs.chipsStellar = $$('[data-stellar-preset]');
  refs.chipsCore = $$('[data-core]');
  refs.chipsMode = $$('.mode-pill');
  refs.drawer = $('#preset-drawer'); refs.drawerHandle = $('#drawer-handle');
  refs.drawerCarousel = $('#drawer-carousel');
  refs.controlPanel = $('.control-panel');
  refs.dialogSensor = $('#dialog-sensor');
  refs.dialogStatus = $('#dialog-status');
  refs.overlays = { catalog: $('#overlay-catalog'), whitepaper: $('#overlay-whitepaper') };
  refs.rtG = $('#rt-g'); refs.rtS = $('#rt-s'); refs.rtT = $('#rt-t');
}

// ---------- Builders ----------
function buildPresetCarousel() {
  const host = refs.drawerCarousel; host.innerHTML = '';
  BOTTOM_PRESETS.forEach(p => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'preset-card'; el.dataset.id = p.id;
    el.style.setProperty('--pc-color', p.color);
    el.style.setProperty('--pc-glow', hexToRgba(p.color, 0.35));
    el.innerHTML =
      '<div class="preset-card__name"><span>'+p.name+'</span>' +
      '<span class="preset-card__badge" style="background:'+p.color+';color:#050508">'+p.badge+'</span></div>' +
      '<div class="preset-card__desc">'+p.desc+'</div>' +
      '<div class="preset-card__meta">' +
        '<span>Flux <b>'+p.flux.toFixed(2)+' S<sub>⊕</sub></b></span>' +
        '<span>Radius <b>'+p.radius.toFixed(2)+' R<sub>⊕</sub></b></span>' +
        '<span>Class <b>'+p.stellarClass+'</b></span>' +
      '</div>';
    el.addEventListener('click', () => loadPreset(p));
    host.appendChild(el);
  });
  refs.presetCards = $$('.preset-card', host);
}

function buildCatalogList() {
  const host = $('#catalog-list'); host.innerHTML = '';
  CATALOG_PRESETS.forEach(p => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'catalog-card';
    const score = p.esi != null
      ? 'ESI <b>'+p.esi.toFixed(2)+'</b>'
      : 'VSI <b>'+p.vsi.toFixed(2)+'</b>';
    el.innerHTML =
      '<div class="catalog-card__title" style="color:'+p.color+'">'+p.name+'</div>' +
      '<div class="catalog-card__meta">' +
        '<span>Host <b style="color:'+p.color+'">'+p.hostClass+'</b></span>' +
        '<span>Orbit <b>'+p.orbit.toFixed(2)+' AU</b></span>' +
        '<span>'+score+'</span>' +
      '</div>' +
      (p.dataNote ? '<div class="catalog-card__note">'+p.dataNote+'</div>' : '');
    el.addEventListener('click', () => { loadPreset({ state:p.state, color:p.color }); closeOverlay('catalog'); });
    host.appendChild(el);
  });
}

// ---------- Binders ----------
function bindTabs() {
  const tabs = $$('.tab'), panels = $$('.tab-panel');
  tabs.forEach((tab) => {
    const p = tab.dataset.tab;
    tab.id = 'tab-' + p;
    tab.setAttribute('aria-controls', 'panel-' + p);
    tab.tabIndex = tab.classList.contains('tab--active') ? 0 : -1;
    const panel = panels.find(x => x.dataset.panel === p);
    if (panel) {
      panel.id = 'panel-' + p;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'tab-' + p);
    }
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', e => {
      const visible = tabs.filter(t => t.offsetParent !== null);
      const cur = visible.indexOf(tab);
      let idx = null;
      if (e.key === 'ArrowRight') idx = (cur + 1) % visible.length;
      if (e.key === 'ArrowLeft')  idx = (cur - 1 + visible.length) % visible.length;
      if (e.key === 'Home') idx = 0;
      if (e.key === 'End')  idx = visible.length - 1;
      if (idx !== null) { e.preventDefault(); activateTab(visible[idx]); visible[idx].focus(); }
    });
  });
  function activateTab(tab) {
    tabs.forEach(t => {
      const on = t === tab;
      t.classList.toggle('tab--active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(p => p.classList.toggle('tab-panel--active', p.dataset.panel === tab.dataset.tab));
    state.ui.activeTab = tab.dataset.tab;
  }
  const hzTrack = document.querySelector('.hz-bar__track');
  if (hzTrack) {
    hzTrack.style.cursor = 'pointer';
    hzTrack.addEventListener('click', () => hzTrack.classList.toggle('is-expanded'));
  }
}

function bindModePills() {
  refs.chipsMode.forEach(pill => pill.addEventListener('click', () => {
    refs.chipsMode.forEach(p => p.classList.remove('mode-pill--active'));
    pill.classList.add('mode-pill--active');
    state.mode = pill.dataset.mode;
    document.body.dataset.mode = state.mode;
    applyModeAccent();
    state._dirty.ui = true;
  }));
  refs.btnTelemetry.addEventListener('click', () => {
    state.telemetry = !state.telemetry;
    refs.btnTelemetry.setAttribute('aria-pressed', String(state.telemetry));
    document.body.classList.toggle('telemetry-on', state.telemetry);
    refs.btnTelemetry.querySelector('.utility-btn__label') &&
      (refs.btnTelemetry.querySelector('.utility-btn__label').textContent = state.telemetry ? 'Telemetry: ON' : 'Telemetry');
    state._dirty.ui = true;
  });
}

// Swaps the global accent between cyan (astrobiology) and rust (geophysics).
// Uses CSS custom properties so every slider thumb, ring, waveform and reticle
// inherits the change without per-component JS.
function applyModeAccent() {
  const root = document.documentElement;
  if (state.mode === 'geophysics') {
    root.style.setProperty('--cyan', '#ff6600');
    root.style.setProperty('--cyan-soft', 'rgba(255,102,0,0.18)');
  } else {
    root.style.setProperty('--cyan', '#00e5ff');
    root.style.setProperty('--cyan-soft', 'rgba(0,229,255,0.18)');
  }
}

function setSliderFill(el) {
  const min=parseFloat(el.min),max=parseFloat(el.max),val=parseFloat(el.value);
  // p-distance uses LOGARITHMIC fill so the fill visually matches log control
  let pct;
  if (el.id === 'p-distance') {
    const lmin = Math.log10(parseFloat(el.min)), lmax = Math.log10(parseFloat(el.max));
    pct = ((Math.log10(val) - lmin) / (lmax - lmin)) * 100;
  } else {
    pct = ((val-min)/(max-min))*100;
  }
  el.style.setProperty('--fill', pct+'%');
}
function setSliderFills() { Object.values(refs.sliders).forEach(setSliderFill); }

function bindSliders() {
  Object.entries(refs.sliders).forEach(([id, el]) => {
    el.addEventListener('input', () => {
      setSliderFill(el);
      // Logarithmic mapping for distance slider: visual position maps linearly,
      // underlying value is log-interpolated between min and max AU.
      if (id === 'p-distance') {
        const min=parseFloat(el.min), max=parseFloat(el.max);
        const lmin=Math.log10(min), lmax=Math.log10(max);
        const pct=(parseFloat(el.value)-min)/(max-min);
        state.planet.distance = Math.pow(10, lmin + (lmax-lmin)*pct);
      } else {
        syncSliderToState(id, parseFloat(el.value));
      }
      state._scenarioImported = false; // slider change overrides imported scenario
      state._dirty.ui = true;
    });
  });
}

// Convert slider 0-1 linear position <-> log AU value for p-distance
function setDistanceSliderFromValue(au) {
  const el = refs.sliders['p-distance'];
  const min=parseFloat(el.min), max=parseFloat(el.max);
  const lmin=Math.log10(min), lmax=Math.log10(max);
  const pct = (Math.log10(Math.max(min,Math.min(max,au))) - lmin)/(lmax-lmin);
  el.value = min + (max-min)*pct;
  setSliderFill(el);
}

function syncSliderToState(id, val) {
  switch(id){
    case 's-teff': state.star.teff=val; state.star.preset=null; refs.chipsStellar.forEach(c=>c.classList.remove('chip--active')); break;
    case 's-rstar':state.star.rstar=val; state.star.preset=null; refs.chipsStellar.forEach(c=>c.classList.remove('chip--active')); break;
    case 'p-radius':state.planet.radius=val; break;
    case 'p-mass':  state.planet.mass=val; break;
    case 'p-albedo':state.planet.albedo=val; break;
    case 'p-tau':   state.planet.tau=val; break;
  }
}

function bindNumBadges() {
  Object.entries(refs.badges).forEach(([forId, badge]) => {
    badge.addEventListener('click', () => {
      if (badge.classList.contains('is-editing')) return;
      const slider = refs.sliders[forId]; if (!slider) return;
      const step = parseFloat(slider.step);
      const dec = (forId==='s-teff') ? 0 : (step<1 ? 2 : 0);
      // For distance, show actual AU value rather than slider position
      let current;
      if (forId === 'p-distance') current = state.planet.distance;
      else current = parseFloat(slider.value);
      badge.classList.add('is-editing');
      badge.textContent = '';
      const input = document.createElement('input');
      input.type='text'; input.value = current.toFixed(dec);
      badge.appendChild(input);
      input.focus(); input.select();
      const commit = () => {
        const v = parseFloat(input.value);
        if (!Number.isNaN(v)) {
          if (forId === 'p-distance') {
            const clamped = Math.max(0.05, Math.min(5.0, v));
            state.planet.distance = clamped;
            setDistanceSliderFromValue(clamped);
          } else {
            const clamped = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), v));
            slider.value = clamped; setSliderFill(slider); syncSliderToState(forId, clamped);
          }
        }
        badge.removeChild(input); badge.classList.remove('is-editing');
        state._scenarioImported = false; // slider change overrides imported scenario
      state._dirty.ui = true;
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key==='Enter'){ e.preventDefault(); input.blur(); }
        if (e.key==='Escape'){ input.value = forId==='p-distance' ? state.planet.distance : slider.value; input.blur(); }
      });
    });
  });
}

function formatBadge(id) {
  const badge = refs.badges[id]; if (!badge || badge.classList.contains('is-editing')) return;
  const slider = refs.sliders[id];
  if (id === 'p-distance') {
    const v = state.planet.distance;
    badge.textContent = (state.ui.distanceUnit === 'KM')
      ? (v*ASTRO_CONSTANTS.AU_TO_KM).toExponential(2)+' km'
      : v.toFixed(2)+' AU';
    return;
  }
  const v = parseFloat(slider.value);
  const step = parseFloat(slider.step);
  const dec = (id==='s-teff') ? 0 : (step<1 ? 2 : 0);
  badge.textContent = v.toFixed(dec)+(badge.dataset.unit||'');
}

function bindToggles() {
  $$('.toggle-row').forEach(row => {
    if (row.id === 'btn-audio') return;
    row.addEventListener('click', () => {
      const active = row.classList.toggle('toggle-row--active');
      row.setAttribute('aria-pressed', String(active));
      row.querySelector('.toggle-switch').classList.toggle('toggle-switch--on', active);
      const label = row.querySelector('.toggle-row__state');
      const key = row.dataset.toggle;
      if (key==='night') {
        state.devices.night = active; label.textContent = active?'ON':'OFF';
        document.body.classList.toggle('night-mode', active);
      } else if (key==='haptics') {
        state.devices.haptics = active; label.textContent = active?'ON':'OFF';
      }
    });
  });

  refs.btnAudio.addEventListener('click', async () => {
    const on = !state.devices.audio;
    state.devices.audio = on ? !!(await audio.initialize()) : (audio.shutdown(), false);
    const a = state.devices.audio;
    refs.btnAudio.classList.toggle('toggle-row--active', a);
    refs.btnAudio.setAttribute('aria-pressed', String(a));
    refs.audioSwitch.classList.toggle('toggle-switch--on', a);
    refs.audioState.textContent = a?'ACTIVE':'INACTIVE';
  });

  refs.btnGyro.addEventListener('click', requestGyroPermission);
  refs.btnMic.addEventListener('click', async () => {
    try {
      refs.micStatus.textContent = 'REQUEST';
      if (!navigator.mediaDevices?.getUserMedia) { refs.micStatus.textContent='UNSUPPORTED'; return; }
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      refs.micStatus.textContent = 'LIVE'; refs.btnMic.classList.add('is-active');
      setTimeout(()=>{ stream.getTracks().forEach(t=>t.stop()); refs.micStatus.textContent='PASS'; refs.btnMic.classList.remove('is-active'); }, 3000);
    } catch(_) { refs.micStatus.textContent = 'DENIED'; }
  });
}

function bindChips() {
  refs.chipsStellar.forEach(c => c.addEventListener('click', ()=>applyStellarPreset(c.dataset.stellarPreset)));
  refs.chipsCore.forEach(c => c.addEventListener('click', ()=>applyCorePreset(c.dataset.core)));
}

function applyStellarPreset(key, silent) {
  const p = STELLAR_PRESETS[key]; if (!p) return;
  state.star.preset = key;
  state.star.teff = p.teff; state.star.rstar = p.rstar;
  refs.sliders['s-teff'].value = p.teff;
  refs.sliders['s-rstar'].value = p.rstar;
  setSliderFill(refs.sliders['s-teff']); setSliderFill(refs.sliders['s-rstar']);
  refs.chipsStellar.forEach(c => c.classList.toggle('chip--active', c.dataset.stellarPreset===key));
  shader.setStarClass(p.teff, p.color);
  updateStarCompare(p);
  if (!silent) state._dirty.ui = true;
}
function updateStarCompare(p) {
  const t = refs.starTarget; if (!t) return;
  const d = Math.max(8, Math.min(120, 36*p.rstar));
  t.style.width=d+'px'; t.style.height=d+'px';
  t.style.setProperty('--star-color', p.color);
  t.style.setProperty('--star-glow', (12+12*p.rstar)+'px');
  t.style.setProperty('--star-glow-color', p.glow);
}

function applyCorePreset(key, silent) {
  const p = CORE_PRESETS[key]; if (!p) return;
  state.planet.core = key; state.planet.densityMul = p.densityMul;
  refs.chipsCore.forEach(c => c.classList.toggle('chip--active', c.dataset.core===key));
  if (!silent) state._dirty.ui = true;
}

function bindOverlays() {
  $('#btn-catalog').addEventListener('click', ()=>openOverlay('catalog'));
  $('#btn-whitepaper').addEventListener('click', ()=>openOverlay('whitepaper'));
  $$('[data-close]').forEach(b => b.addEventListener('click', e => closeOverlay(e.currentTarget.dataset.close)));
}
function openOverlay(n){ refs.overlays[n].classList.add('is-open'); refs.overlays[n].setAttribute('aria-hidden','false'); }
function closeOverlay(n){ refs.overlays[n].classList.remove('is-open'); refs.overlays[n].setAttribute('aria-hidden','true'); }

function bindDialog() {
  $('#dialog-dismiss').addEventListener('click', () => {
    refs.dialogSensor.classList.remove('is-open');
    refs.dialogSensor.setAttribute('aria-hidden','true');
    setDialogStatus('DISMISSED');
  });
  // Single canonical authorize handler that works for both iOS (permission API)
  // and Android/desktop (immediate grant). Avoids stacking listeners on every tap.
  $('#dialog-authorize').addEventListener('click', async () => {
    const DO = window.DeviceOrientationEvent;
    if (typeof DO?.requestPermission === 'function') {
      setDialogStatus('REQUESTING');
      try {
        const s = await DO.requestPermission();
        setDialogStatus(s.toUpperCase());
        if (s === 'granted') {
          refs.dialogSensor.classList.remove('is-open');
          refs.dialogSensor.setAttribute('aria-hidden','true');
          enableGyro();
        }
      } catch (e) {
        setDialogStatus('DENIED (HTTPS REQUIRED)');
      }
    } else {
      refs.dialogSensor.classList.remove('is-open');
      refs.dialogSensor.setAttribute('aria-hidden','true');
      enableGyro();
    }
  });
}
function setDialogStatus(t) {
  if (!refs.dialogStatus) return;
  const color = (t === 'GRANTED') ? 'var(--cyan)'
              : (t === 'DENIED' || (typeof t === 'string' && t.startsWith('DENIED'))) ? 'var(--rust)'
              : 'var(--titan)';
  refs.dialogStatus.innerHTML = 'Status: <b style="color:'+color+'">'+t+'</b>';
}
function requestGyroPermission() {
  const DO = window.DeviceOrientationEvent;
  if (!DO) { refs.gyroStatus.textContent = 'UNSUPPORTED'; return; }
  // iOS 13+ requires an explicit permission request triggered from a user gesture.
  // Our single bound authorize handler (see bindDialog) handles that flow.
  if (typeof DO.requestPermission === 'function') {
    setDialogStatus('PROMPT');
    refs.dialogSensor.classList.add('is-open');
    refs.dialogSensor.setAttribute('aria-hidden','false');
    return;
  }
  // Non-iOS: enable immediately (no dialog needed)
  enableGyro();
}
function enableGyro() {
  state.devices.gyro = true; refs.btnGyro.classList.add('is-active'); refs.gyroStatus.textContent='LIVE';
  shader.setGyro(true);
  window.addEventListener('deviceorientation', ev => {
    if (!state.devices.gyro) return;
    shader.setGyroOrient((ev.beta||0)*Math.PI/180, (ev.gamma||0)*Math.PI/180);
  }, {passive:true});
}

function bindDrawer() {
  refs.drawerHandle.addEventListener('click', () => {
    refs.drawer.classList.toggle('is-expanded');
    state.ui.drawerOpen = refs.drawer.classList.contains('is-expanded');
  });
}
function bindUnitToggle() {
  $$('.unit-toggle__btn').forEach(b => b.addEventListener('click', () => {
    $$('.unit-toggle__btn').forEach(x => x.classList.remove('unit-toggle__btn--active'));
    b.classList.add('unit-toggle__btn--active');
    state.ui.distanceUnit = b.dataset.unit;
    state._dirty.ui = true;
  }));
}
function bindReticle() { refs.reticle.addEventListener('click', () => refs.reticle.classList.toggle('is-active')); }

function bindVisibility() {
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
}
function bindMobileDock() {
  const isMobile = () => window.innerWidth < 1024;
  // Tap WebGL closes the dock
  refs.webgl.addEventListener('pointerdown', e => {
    if (!isMobile()) return;
    const onUp = ev => {
      refs.webgl.removeEventListener('pointerup', onUp);
      refs.webgl.removeEventListener('pointercancel', onUp);
      if (Math.hypot(ev.clientX-e.clientX, ev.clientY-e.clientY) < 6 && state.ui.mobileDockOpen) {
        state.ui.mobileDockOpen = false; refs.controlPanel.classList.remove('is-docked');
      }
    };
    refs.webgl.addEventListener('pointerup', onUp); refs.webgl.addEventListener('pointercancel', onUp);
  });
  // Swipe tab-bar vertically to open/close dock
  const tabBar = $('.tab-bar');
  if (tabBar) {
    let startY=0, started=false;
    tabBar.style.touchAction='none'; tabBar.style.cursor='grab';
    tabBar.addEventListener('pointerdown', e => {
      if (!isMobile()) return;
      startY = e.clientY; started = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    });
    tabBar.addEventListener('pointermove', e => {
      if (!started) return;
      const dy = startY - e.clientY;
      if (dy > 30) { state.ui.mobileDockOpen=true; refs.controlPanel.classList.add('is-docked'); }
      else if (dy < -30) { state.ui.mobileDockOpen=false; refs.controlPanel.classList.remove('is-docked'); }
    });
    tabBar.addEventListener('pointerup', ()=>started=false);
    tabBar.addEventListener('pointercancel', ()=>started=false);
  }
}
function onResize() { shader.resize(); }

// ---------- Capability Detection & Fallbacks ----------
function detectCapabilities() {
  // WebGL check
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');
  } catch (_) {
    const fb = document.getElementById('fallback-notice');
    if (fb) fb.style.display = 'flex';
    const dismiss = document.getElementById('fallback-dismiss');
    if (dismiss) dismiss.addEventListener('click', () => fb.style.display = 'none');
  }

  // Audio check
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    const btn = document.getElementById('btn-audio');
    if (btn) { btn.disabled = true; btn.title = 'Web Audio API not supported in this browser'; }
  }

  // Sensor check
  if (!window.DeviceOrientationEvent) {
    refs.gyroStatus.textContent = 'UNSUPPORTED';
    if (refs.btnGyro) refs.btnGyro.disabled = true;
  }
}

// ---------- Disclaimer Banner ----------
function bindDisclaimer() {
  const banner = document.getElementById('disclaimer-banner');
  const close = document.getElementById('disclaimer-close');
  if (!banner || !close) return;
  const dismissed = sessionStorage.getItem('aether:disclaimer-dismissed');
  if (dismissed) banner.style.display = 'none';
  close.addEventListener('click', () => {
    banner.style.display = 'none';
    sessionStorage.setItem('aether:disclaimer-dismissed', 'true');
  });
}

// ---------- Onboarding Overlay ----------
function bindOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  const seen = localStorage.getItem('aether:onboarding-seen');
  if (seen) { overlay.style.display = 'none'; return; }

  // Star selection
  $$('[data-ob-star]', overlay).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ob-star]', overlay).forEach(b => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
  });
  // Planet selection
  $$('[data-ob-planet]', overlay).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ob-planet]', overlay).forEach(b => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
  });
  // Start Exploring
  const go = document.getElementById('btn-start-exploring');
  if (go) {
    go.addEventListener('click', () => {
      // Apply selected star
      const starBtn = $$('[data-ob-star]', overlay).find(b => b.classList.contains('chip--active'));
      if (starBtn) applyStellarPreset(starBtn.dataset.obStar);
      // Apply selected planet
      const planetBtn = $$('[data-ob-planet]', overlay).find(b => b.classList.contains('chip--active'));
      if (planetBtn) {
        const pMap = { earth:'earth', mars:'mars', venus:'venus' };
        const pid = pMap[planetBtn.dataset.obPlanet];
        if (pid) {
          const p = BOTTOM_PRESETS.find(x => x.id === pid);
          if (p) loadPreset(p);
        }
      }
      overlay.style.display = 'none';
      localStorage.setItem('aether:onboarding-seen', 'true');
      state._scenarioImported = false; // slider change overrides imported scenario
      state._dirty.ui = true;
    });
  }
}

// ---------- Reset Button ----------
function bindReset() {
  const btn = document.getElementById('btn-reset');
  if (!btn) return;
  btn.addEventListener('click', () => {
    applyStellarPreset('G');
    applyCorePreset('silicate');
    state.planet.distance = 1.00; setDistanceSliderFromValue(1.00);
    state.planet.radius = 1.00; refs.sliders['p-radius'].value = 1.00; setSliderFill(refs.sliders['p-radius']);
    state.planet.mass = 1.00; refs.sliders['p-mass'].value = 1.00; setSliderFill(refs.sliders['p-mass']);
    state.planet.albedo = 0.30; refs.sliders['p-albedo'].value = 0.30; setSliderFill(refs.sliders['p-albedo']);
    state.planet.tau = 1.50; refs.sliders['p-tau'].value = 1.50; setSliderFill(refs.sliders['p-tau']);
    setActivePreset('earth');
    refs.hudTarget.textContent = 'EARTH SYSTEM';
    state._dirty.ui = true;
  });
}

// ---------- Escape key handler ----------
function bindEscapeKey() {
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    Object.keys(refs.overlays).forEach(n => {
      if (refs.overlays[n].classList.contains('is-open')) closeOverlay(n);
    });
    if (refs.dialogSensor && refs.dialogSensor.classList.contains('is-open')) {
      refs.dialogSensor.classList.remove('is-open');
      refs.dialogSensor.setAttribute('aria-hidden', 'true');
    }
  });
}

// ---------- Offline state ----------
function bindOfflineState() {
  window.addEventListener('online', () => showTransientNotice('Connection restored.'));
  window.addEventListener('offline', () => showTransientNotice('You are offline. AETHER keeps working: all models run in your browser.'));
}

function showTransientNotice(msg) {
  const el = document.getElementById('calibration-notice');
  if (!el || el.style.display === 'flex') return;
  const span = el.querySelector('span');
  if (!span) return;
  const old = span.textContent;
  span.textContent = msg;
  el.style.display = 'flex';
  setTimeout(() => { el.style.display = 'none'; span.textContent = old; }, 4000);
}

// ---------- Share Configuration URL ----------
function bindShare() {
  const btn = document.getElementById('btn-share');
  const input = document.getElementById('share-url');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const params = new URLSearchParams({
      star: state.star.preset || 'custom',
      teff: state.star.teff,
      rstar: state.star.rstar.toFixed(2),
      dist: state.planet.distance.toFixed(3),
      rad: state.planet.radius.toFixed(2),
      mass: state.planet.mass.toFixed(3),
      alb: state.planet.albedo.toFixed(2),
      tau: state.planet.tau.toFixed(2),
      core: state.planet.core
    });
    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    input.value = url;
    input.select();
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url).catch(() => {}); }
    input.placeholder = '';
  });
}

function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('star') && !params.has('teff')) return; // No URL state

  const starKey = params.get('star');
  if (starKey && STELLAR_PRESETS[starKey]) applyStellarPreset(starKey);
  else {
    const teff = parseFloat(params.get('teff'));
    const rstar = parseFloat(params.get('rstar'));
    if (!isNaN(teff)) { state.star.teff = teff; refs.sliders['s-teff'].value = teff; setSliderFill(refs.sliders['s-teff']); }
    if (!isNaN(rstar)) { state.star.rstar = rstar; refs.sliders['s-rstar'].value = rstar; setSliderFill(refs.sliders['s-rstar']); }
  }

  const dist = parseFloat(params.get('dist'));
  if (!isNaN(dist)) { state.planet.distance = dist; setDistanceSliderFromValue(dist); }
  const rad = parseFloat(params.get('rad'));
  if (!isNaN(rad)) { state.planet.radius = rad; refs.sliders['p-radius'].value = rad; setSliderFill(refs.sliders['p-radius']); }
  const mass = parseFloat(params.get('mass'));
  if (!isNaN(mass)) { state.planet.mass = mass; refs.sliders['p-mass'].value = mass; setSliderFill(refs.sliders['p-mass']); }
  const alb = parseFloat(params.get('alb'));
  if (!isNaN(alb)) { state.planet.albedo = alb; refs.sliders['p-albedo'].value = alb; setSliderFill(refs.sliders['p-albedo']); }
  const tau = parseFloat(params.get('tau'));
  if (!isNaN(tau)) { state.planet.tau = tau; refs.sliders['p-tau'].value = tau; setSliderFill(refs.sliders['p-tau']); }
  const core = params.get('core');
  if (core && CORE_PRESETS[core]) applyCorePreset(core);

  // Hide onboarding if URL has state
  const ob = document.getElementById('onboarding-overlay');
  if (ob) ob.style.display = 'none';
  localStorage.setItem('aether:onboarding-seen', 'true');
}

// ---------- Calibration Range Check ----------
function checkCalibrationRange() {
  const warnings = [];
  const teff = state.star.teff;
  const tau = state.planet.tau;
  const alb = state.planet.albedo;
  const dist = state.planet.distance;
  const rad = state.planet.radius;
  const mass = state.planet.mass;

  // Kopparapu polynomial valid ~2500-7000K
  if (teff < 2600 || teff > 7200) warnings.push('Stellar temperature outside Kopparapu polynomial range (2500–7000 K)');
  // Optical depth extremes
  if (tau > 12) warnings.push('Optical depth > 12 exceeds typical planetary values');
  if (tau < 0.01 && tau > 0) warnings.push('Near-zero optical depth: model treats as vacuum');
  // Albedo edge
  if (alb > 0.9) warnings.push('Albedo > 0.9: approaching perfect reflector (physically implausible)');
  // Extreme distance
  if (dist < 0.01) warnings.push('Orbital distance < 0.01 AU: inside stellar Roche limit for most stars');
  if (dist > 4.5) warnings.push('Orbital distance > 4.5 AU: beyond typical habitable zone consideration');
  // Extreme mass-radius
  if (mass / (rad * rad) > 50) warnings.push('Mass-to-radius² ratio extreme: surface gravity exceeds model assumptions');
  if (rad > 2.5 && mass < 1) warnings.push('Large radius with low mass: density below model range');

  const notice = document.getElementById('calibration-notice');
  if (!notice) return;
  if (warnings.length > 0) {
    notice.querySelector('span').textContent = 'Outside calibrated range: ' + warnings[0] + (warnings.length > 1 ? ' (+' + (warnings.length - 1) + ' more)' : '') + '. Results are extrapolated and may be unreliable.';
    notice.style.display = 'flex';
  } else {
    notice.style.display = 'none';
  }
}

// ---------- Physics ----------
function updatePhysics() {
  // Build domain models via adapter
  adapter.buildFromLegacyState(state);

  // Select solver based on current mode
  const currentMode = modeController.currentMode;
  const useAdvanced = currentMode === 'advanced' || currentMode === 'expert';
  const solver = useAdvanced ? advancedSolver : reducedSolver;
  
  // Run climate solver
  const climateResult = solver.solve(adapter);

  // Update state from solver output
  state.star.lum = adapter.star?.luminositySolar ?? 1.0;
  state.planet.density_cgs = adapter.planet?.densityGcm3 ?? 5.51;
  state.planet.vesc_kms = adapter.planet?.escapeVelocityKms ?? 11.2;
  state.planet.g_ms2 = adapter.planet?.gravityMs2 ?? 9.81;
  state.planet.gEarth = adapter.planet?.gravityEarth ?? 1.0;
  state.planet.escapeNorm = adapter.planet?.escapeVelocityEarthUnits ?? 1.0;
  state.planet.tEq = climateResult.equilibrium_temperature_k;
  state.planet.tSurf = climateResult.surface_temperature_k;
  state.planet.climate = {
    label: climateResult.climate_regime?.label ?? 'Unknown',
    sub: climateResult.climate_regime?.description ?? '',
    color: climateResult.climate_regime?.color ?? 'cyan',
    status: climateResult.climate_regime?.label ?? '',
    confidence: climateResult.model_fidelity === 'advanced' ? 
      'Medium: gas-specific opacity, convective adjustment, condensation included' :
      'Low: atmospheric composition not modeled',
    surface_water: climateResult.surface_water
  };
  // Attach gas composition for QHF solver
  climateResult.gas_composition = adapter.atmosphere?.gasMixingRatios ?? {};
  climateResult.surface_pressure_bar = adapter.atmosphere?.totalPressureBar ?? 1.01325;
  state.planet.climateResult = climateResult;
  state.planet.hz = adapter.star?.getHabitableZone() ?? habitableZone(state.star.teff, state.star.lum);

  // Run QHF for the selected biological target
  const qhfTarget = { target_type: currentBiologyTarget };
  state.planet.qhfResult = qhfSolver.solve(climateResult, qhfTarget);

  shader.setPlanetState({
    surfaceTemp: state.planet.tSurf, opticalDepth: state.planet.tau, mode: state.mode,
    starColorHex: state.star.preset ? STELLAR_PRESETS[state.star.preset].color : '#fff3c2',
    terrainIntensity: Math.max(0.3, Math.min(1.3, state.planet.mass/(state.planet.radius*state.planet.radius))),
    atmoColorHex: atmoColorFor(state.planet.tSurf, state.planet.tau)
  });
  maybeHaptic(state.planet.climate);
  checkCalibrationRange();
}
function atmoColorFor(T, tau) {
  if (T<250) return '#9fc8ff';
  if (T>373 || tau>8) return tau>8 ? '#ffcf6b' : '#ff8a4c';
  return '#4db8ff';
}

// ---------- UI sync (throttled) ----------
function syncUI() {
  const esi = globalIndex(state.planet.radius, state.planet.density_cgs/ASTRO_CONSTANTS.EARTH_DENSITY,
    state.planet.escapeNorm, state.planet.tSurf, BASELINES.earth);
  const msi = globalIndex(state.planet.radius, state.planet.density_cgs/ASTRO_CONSTANTS.EARTH_DENSITY,
    state.planet.escapeNorm, state.planet.tSurf, BASELINES.mars);
  const vsi = globalIndex(state.planet.radius, state.planet.density_cgs/ASTRO_CONSTANTS.EARTH_DENSITY,
    state.planet.escapeNorm, state.planet.tSurf, BASELINES.venus);
  setRing(refs.esiRing, esi, '#00e5ff'); setRing(refs.msiRing, msi, '#ff6600'); setRing(refs.vsiRing, vsi, '#ffe600');
  refs.esi.textContent = esi.toFixed(3); refs.msi.textContent = msi.toFixed(3); refs.vsi.textContent = vsi.toFixed(3);

  Object.keys(refs.sliders).forEach(formatBadge);

  refs.rLum.innerHTML = state.star.lum.toFixed(2)+' <i>L<sub>☉</sub></i>';
  const life = stellarLifecycle(state.star.rstar, state.star.lum);
  refs.rLife.textContent = (life>1000?'>1000':life.toFixed(1))+' Gyr';
  refs.rLifeState.textContent = life>0.5 ? 'Active' : 'End-stage';
  const wind = stellarWindLevel(state.star.teff, state.star.rstar);
  refs.rWind.innerHTML = '<span class="chip-status '+wind.cls+'">'+wind.level+'</span>';
  const hz = habitableZone(state.star.teff, state.star.lum);
  refs.rHZ.textContent = (hz.runawayGreenhouse && hz.maximumGreenhouse)
    ? hz.runawayGreenhouse.toFixed(2)+' – '+hz.maximumGreenhouse.toFixed(2)+' AU' : '—';

  refs.vDensity.textContent = state.planet.density_cgs.toFixed(2)+' g/cm³';
  refs.vDensitySub.innerHTML = (state.planet.density_cgs/ASTRO_CONSTANTS.EARTH_DENSITY).toFixed(2)+' ρ<sub>⊕</sub>';
  refs.vVesc.textContent = state.planet.vesc_kms.toFixed(1)+' km/s';
  refs.vVescSub.innerHTML = state.planet.escapeNorm.toFixed(2)+' v<sub>⊕</sub>';
  refs.vGrav.textContent = state.planet.gEarth.toFixed(2)+' G';
  refs.vGravSub.textContent = state.planet.g_ms2.toFixed(2)+' m/s²';
  refs.vTeq.textContent = Math.round(state.planet.tEq)+' K';
  refs.vTsurf.textContent = Math.round(state.planet.tSurf)+' K';

  // Comparative table (telemetry/scientific mode)
  if (refs.cmpT.r) {
    const rhoEarth = state.planet.density_cgs/ASTRO_CONSTANTS.EARTH_DENSITY;
    refs.cmpT.r.textContent   = state.planet.radius.toFixed(2)+' R⊕';
    refs.cmpT.rho.textContent = rhoEarth.toFixed(2)+' ρ⊕';
    refs.cmpT.v.textContent   = state.planet.escapeNorm.toFixed(2)+' v⊕';
    refs.cmpT.g.textContent   = state.planet.gEarth.toFixed(2)+' G';
    refs.cmpT.t.textContent   = Math.round(state.planet.tSurf)+' K';
    refs.cmpT.si.textContent  = esi.toFixed(3);
    if (refs.cmpEarthSi) refs.cmpEarthSi.textContent = '1.000';
    if (refs.cmpMarsSi)  refs.cmpMarsSi.textContent  = msi.toFixed(3);
    if (refs.cmpVenusSi) refs.cmpVenusSi.textContent = vsi.toFixed(3);
  }

  const cb = state.planet.climate;
  if (cb) {
    refs.cDot.className = 'climate-badge__dot climate-badge__dot--'+cb.color;
    refs.cLabel.textContent = cb.label; refs.cSub.textContent = cb.sub;
    // Show confidence if available
    const confEl = document.getElementById('climate-confidence');
    if (confEl && cb.confidence) confEl.textContent = 'Confidence: ' + cb.confidence;
  }
  updateHZBar(hz);

  const flux = state.star.lum/(state.planet.distance*state.planet.distance);
  refs.rtG.textContent = state.planet.gEarth.toFixed(2)+' G';
  refs.rtS.innerHTML = flux.toFixed(2)+' S<sub>⊕</sub>';
  refs.rtT.textContent = Math.round(state.planet.tSurf)+' K';

  if (audio.running) {
    const note = freqToNote(audio.currentFreq);
    refs.sonPitch.textContent = note; refs.sonLpf.textContent=(audio.currentCutoff/1000).toFixed(2)+' kHz';
    refs.sonTau.textContent = state.planet.tau.toFixed(2);
    if (refs.oscopeFreq) refs.oscopeFreq.textContent = note;
  }

  refs.hudMode.textContent = (document.body.dataset.mode || 'beginner').toUpperCase();
  refs.hudStatus.textContent = (cb&&cb.label)?cb.label.toUpperCase():'—';
  refs.hudStatus.className = 'hud-val hud-val--'+((cb&&cb.color)||'cyan');

  // Telemetry mode: casual shows friendly labels already (CSS), scientific mode adds equation inline (CSS)
  // Swap climate status wording in casual vs scientific
  if (state.telemetry) {
    refs.cSub.textContent = 'T_surf = '+Math.round(state.planet.tSurf)+' K, τ = '+state.planet.tau.toFixed(2);
  }

  updatePlanetCross();
  updateSpectrum();
  refs.fps.textContent = shader.fps;
  // Render QHF result in advanced/expert mode
  if (state.planet.qhfResult && modeController.currentMode !== "beginner") {
    renderQHFResult(state.planet.qhfResult, resultRenderer, modeController.currentMode);
  }
}

function setRing(el, value, color) {
  if (!el) return;
  const C = 2*Math.PI*42, v = Math.max(0,Math.min(1,value));
  el.style.strokeDasharray = C; el.style.strokeDashoffset = C*(1-v);
  if (color) el.style.stroke = color;
}

function updateHZBar(hz) {
  if (!hz.recentVenus || !hz.earlyMars) return;
  const {recentVenus:inV, runawayGreenhouse:rg, maximumGreenhouse:mg, earlyMars:eM} = hz;
  const dMin = Math.min(inV*0.7, state.planet.distance*0.9);
  const dMax = Math.max(eM*1.2, state.planet.distance*1.1);
  const span = dMax-dMin; if (span<=0) return;
  const pct = d => ((d-dMin)/span)*100;
  refs.hzMarkerRV.style.left = pct(inV)+'%';
  refs.hzMarkerRG.style.left = pct(rg)+'%';
  refs.hzMarkerMG.style.left = pct(mg)+'%';
  refs.hzMarkerEM.style.left = pct(eM)+'%';
  [refs.hzMarkerRV,refs.hzMarkerRG,refs.hzMarkerMG,refs.hzMarkerEM].forEach(m => {
    if (!m.querySelector('span')) {
      const s = document.createElement('span');
      s.textContent = m.dataset.label;
      m.appendChild(s);
    }
  });
  const zones = refs.hzZones;
  zones[0].style.flex = Math.max(4,pct(inV))+' 1 0%';
  zones[1].style.flex = Math.max(4,pct(rg)-pct(inV))+' 1 0%';
  zones[2].style.flex = Math.max(4,pct(mg)-pct(rg))+' 1 0%';
  zones[3].style.flex = Math.max(6,100-pct(mg))+' 1 0%';
  const dPos = Math.max(0,Math.min(100,pct(state.planet.distance)));
  refs.hzTarget.style.left = dPos+'%';
  refs.hzTargetLabel.textContent = (state.ui.distanceUnit==='KM')
    ? (state.planet.distance*ASTRO_CONSTANTS.AU_TO_KM).toExponential(2)+' km'
    : state.planet.distance.toFixed(2)+' AU';
  const cb = state.planet.climate;
  if (cb) {
    const colorMap = {cyan:'var(--cyan-soft)',rust:'var(--rust-soft)',gold:'var(--gold-soft)',blue:'rgba(106,168,255,0.15)'};
    const textMap  = {cyan:'var(--cyan)',rust:'var(--rust)',gold:'var(--gold)',blue:'#6aa8ff'};
    refs.hzStatus.textContent = cb.status;
    refs.hzStatus.style.color = textMap[cb.color];
    refs.hzStatus.style.background = colorMap[cb.color];
  }
}

function updatePlanetCross() {
  const t = refs.planetCrossTarget;
  const d = Math.max(10,Math.min(80, 32*state.planet.radius));
  t.style.width=d+'px'; t.style.height=d+'px';
  let col = {light:'#5ccaff',mid:'#1f6fcf',dark:'#08203d',glow:'rgba(0,200,255,0.35)'};
  const T = state.planet.tSurf;
  if (T<250) col = {light:'#c9e8ff',mid:'#709dd0',dark:'#1f2a44',glow:'rgba(120,160,255,0.4)'};
  else if (T>373) col = {light:'#ff9c6b',mid:'#c83a12',dark:'#4a0f05',glow:'rgba(255,100,30,0.5)'};
  else if (T>323) col = {light:'#ffd37a',mid:'#d98a28',dark:'#3a2207',glow:'rgba(255,180,60,0.4)'};
  t.style.setProperty('--p-light',col.light); t.style.setProperty('--p-mid',col.mid);
  t.style.setProperty('--p-dark',col.dark); t.style.setProperty('--p-glow',col.glow);
}

function updateSpectrum() {
  const t = state.star.teff;
  const pk = 240 - ((t-2500)/7500)*160;
  const sigma = 40 + (t/10000)*30;
  const d = 'M0,60 C'+(pk-sigma*1.5)+',60 '+(pk-sigma)+',8 '+pk+',8 C'+(pk+sigma)+',8 '+(pk+sigma*1.5)+',60 300,60';
  refs.specPath.setAttribute('d', d+' Z'); refs.specLine.setAttribute('d', d);
}

function drawScopes() {
  const color = state.mode==='geophysics'?'#ff6600':'#00e5ff';
  const bigVis = refs.oscopeBig.offsetParent !== null;
  const smallVis = refs.oscopeSmall.offsetParent !== null;
  if (audio.running) {
    if (smallVis) audio.drawOscilloscope(refs.oscopeSmall, color, true);
    if (bigVis) audio.drawOscilloscope(refs.oscopeBig, color, true);
  } else {
    if (smallVis) drawIdleWave(refs.oscopeSmallCtx, refs.oscopeSmall, color);
    if (bigVis) drawIdleWave(refs.oscopeBigCtx, refs.oscopeBig, color);
  }
}

function maybeHaptic(cb) {
  if (!state.devices.haptics || !cb || !navigator.vibrate) return;
  if (state._dirty._lastClimate && state._dirty._lastClimate !== cb.label) {
    if (/Runaway/i.test(cb.label)) navigator.vibrate([80,60,80,60,160]); // continuous low pulse pattern
    else if (/Freeze|Frost/i.test(cb.label)) navigator.vibrate([40,80,40]); // sharp double-tap
    else navigator.vibrate(15);
  }
  state._dirty._lastClimate = cb.label;
}

function loadPreset(preset) {
  const s = preset.state; if (!s) return;
  if (s.stellar) applyStellarPreset(s.stellar);
  if (s.core) applyCorePreset(s.core);
  if (s.pDistance != null) { state.planet.distance = s.pDistance; setDistanceSliderFromValue(s.pDistance); }
  const map = { pRadius:'p-radius', pMass:'p-mass', pAlbedo:'p-albedo', pTau:'p-tau' };
  Object.entries(map).forEach(([k,id]) => {
    if (s[k] == null) return;
    refs.sliders[id].value = s[k]; setSliderFill(refs.sliders[id]); syncSliderToState(id, s[k]);
  });
  if (s.label) refs.hudTarget.textContent = s.label;
  if (preset.id) setActivePreset(preset.id);
  else refs.presetCards.forEach(c => c.classList.remove('is-active'));
  state._dirty.ui = true;
}
function setActivePreset(id) {
  if (!refs.presetCards) return;
  refs.presetCards.forEach(c => c.classList.toggle('is-active', c.dataset.id===id));
  const p = BOTTOM_PRESETS.find(x=>x.id===id);
  if (p && p.state.label) refs.hudTarget.textContent = p.state.label;
}

// ---------- Casual tutorial popups ----------
const TUTORIAL_TIPS = [
  { target: '#p-tau',    html: '<b>Optical depth τ</b> controls how strongly the atmosphere traps heat. Slide right for thicker atmosphere.', after: 2000 },
  { target: '#p-albedo', html: '<b>Albedo</b> is the fraction of starlight reflected away. 0.30 = Earth, 0.75 = Venus clouds.', after: 6000 },
  { target: '#hz-status', html: 'The <b>Habitable Zone</b> shows where liquid water is thermodynamically possible. Drag distance slider to explore.', after: 10000 }
];
function showTutorialTips() {
  if (state.telemetry) return;
  const seen = JSON.parse(localStorage.getItem('aether:tutorial-seen') || 'null');
  if (seen === true) return;
  TUTORIAL_TIPS.forEach((t, i) => {
    setTimeout(() => {
      if (state.telemetry) return;
      const anchor = document.querySelector(t.target);
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.className = 'tutorial-tip';
      tip.innerHTML = t.html + '<button type="button">Got it</button>';
      const dismiss = () => { tip.remove(); if (i === TUTORIAL_TIPS.length - 1) localStorage.setItem('aether:tutorial-seen','true'); };
      tip.querySelector('button').addEventListener('click', dismiss);
      tip.style.left = Math.min(window.innerWidth - 240, Math.max(12, r.left)) + 'px';
      tip.style.top  = (r.bottom + 8) + 'px';
      document.body.appendChild(tip);
      requestAnimationFrame(()=>tip.classList.add('is-visible'));
      setTimeout(dismiss, 6000);
    }, t.after);
  });
}

// ---------- utils ----------
function hexToRgba(hex, a) {
  const h = hex.replace('#','');
  const r=parseInt(h.substring(0,2),16),g=parseInt(h.substring(2,4),16),b=parseInt(h.substring(4,6),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}
function drawIdleWave(ctx2, canvas, color) {
  if (!ctx2||!canvas) return;
  const dpr = Math.min(window.devicePixelRatio||1, 1.5);
  const cssW = canvas.clientWidth||canvas.width, cssH=canvas.clientHeight||canvas.height;
  const tw=Math.floor(cssW*dpr), th=Math.floor(cssH*dpr);
  if (canvas.width!==tw||canvas.height!==th){canvas.width=tw;canvas.height=th;}
  const w=canvas.width, h=canvas.height;
  ctx2.setTransform(1,0,0,1,0,0); ctx2.clearRect(0,0,w,h);
  const g = ctx2.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'rgba(0,30,40,0.2)'); g.addColorStop(1,'rgba(5,5,8,0.6)');
  ctx2.fillStyle=g; ctx2.fillRect(0,0,w,h);
  ctx2.strokeStyle='rgba(0,229,255,0.08)'; ctx2.lineWidth=1; ctx2.beginPath();
  for(let i=1;i<4;i++){ const y=(h/4)*i; ctx2.moveTo(0,y); ctx2.lineTo(w,y); } ctx2.stroke();
  const t = performance.now()*0.002;
  ctx2.strokeStyle=color; ctx2.lineWidth=Math.max(1,Math.floor(1.4*dpr));
  ctx2.shadowBlur=8*dpr; ctx2.shadowColor=color; ctx2.globalAlpha=0.7; ctx2.beginPath();
  const scale=w/300;
  for(let x=0;x<w;x++){
    const nx=x/scale;
    const y=h/2+Math.sin(nx*0.03+t)*(h*0.15)+Math.sin(nx*0.08+t*1.7)*(h*0.06);
    if(x===0)ctx2.moveTo(x,y);else ctx2.lineTo(x,y);
  }
  ctx2.stroke(); ctx2.shadowBlur=0; ctx2.globalAlpha=1;
}
