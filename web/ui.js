// Paletas, modos, panel y ajustes guardados. ESTILO lo define Program.cs.
(() => {
  // nombre: fondo, superficie, realce, acento
  const PALETAS = {
    'Negro puro': ['#000000', '#0a0a0a', '#171717', '#ffffff'],
    Grafito: ['#0a0a0a', '#121212', '#1e1e1e', '#bdbdbd'],
    Medianoche: ['#03060c', '#080d17', '#121b2c', '#7aa2ff'],
    Hielo: ['#03080a', '#081013', '#111d22', '#7fdbe8'],
    Bosque: ['#030805', '#08100b', '#121e16', '#6fd39a'],
    Brasa: ['#090502', '#110a05', '#1e140c', '#ffab5e'],
    Vino: ['#0a0306', '#12070b', '#200f16', '#ff7d9c'],
    Violeta: ['#06040b', '#0d0915', '#191227', '#b69cff']
  };
  // Ritmo: solo uno a la vez (pulsarlo de nuevo lo quita). No toca los efectos.
  const RITMOS = {
    'Super slowed': { speed: 0.75, semis: 0, vinilo: true },
    Slowed: { speed: 0.85, semis: 0, vinilo: true },
    'Sped up': { speed: 1.15, semis: 0, vinilo: true },
    Nightcore: { speed: 1.25, semis: 0, vinilo: true }
  };
  const SIN_RITMO = { speed: 1, semis: 0, vinilo: false };
  // Efectos: se pueden juntar todos los que quieras. [nombre, intensidad inicial]
  const EFECTOS = {
    reverb: ['Reverb', 0.5],
    bajos: ['Bajos', 0.5],
    ocho: ['8D', 0.8],
    eco: ['Eco', 0.5],
    lofi: ['Lo-fi', 0.6],
    agua: ['Bajo el agua', 0.6],
    radio: ['Radio', 0.6],
    amplio: ['Estéreo amplio', 0.5],
    karaoke: ['Menos voz', 0.9]
  };
  const CLAVE = 'zamify';
  const s = { ...SIN_RITMO, fx: {}, min: true, paleta: 'Negro puro' };
  try { Object.assign(s, JSON.parse(localStorage.getItem(CLAVE) ?? localStorage.getItem('ligero-app'))); } catch { /* ajustes dañados: valores de fábrica */ }
  if (!Object.hasOwn(PALETAS, s.paleta)) s.paleta = 'Negro puro';
  s.fx = Object.fromEntries(Object.entries(s.fx ?? {}).filter(([k, v]) => Object.hasOwn(EFECTOS, k) && v > 0));

  let q, timer;
  const signed = n => (n > 0 ? '+' : '') + n;
  const send = () => document.dispatchEvent(new CustomEvent('sl-ajustes', { detail: JSON.stringify(s) }));
  const ritmo = () => Object.keys(RITMOS).find(n => Object.entries(RITMOS[n]).every(([k, v]) => s[k] === v));

  function set(patch) {
    Object.assign(s, patch);
    s.speed = Math.min(2, Math.max(0.5, Math.round(s.speed * 100) / 100));
    s.semis = Math.min(12, Math.max(-12, Math.round(s.semis * 2) / 2));
    clearTimeout(timer);
    timer = setTimeout(() => localStorage.setItem(CLAVE, JSON.stringify(s)), 150);
    send();
    if (patch.paleta || 'min' in patch) tema();
    draw();
  }
  function efecto(k, v) {
    const fx = { ...s.fx };
    if (v > 0) fx[k] = v; else delete fx[k];
    set({ fx });
  }

  function tema() {
    const root = document.documentElement;
    ['fondo', 'sup', 'realce', 'acento'].forEach((n, i) => root.style.setProperty('--lg-' + n, PALETAS[s.paleta][i]));
    root.classList.toggle('lg-min', s.min);
    window.chrome?.webview?.postMessage(PALETAS[s.paleta][0]);
  }

  function draw() {
    if (!q) return;
    const r = ritmo(), n = Object.keys(s.fx).length;
    const changed = s.speed !== 1 || s.semis !== 0 || n > 0;
    q('#v').value = s.speed;
    q('#t').value = s.semis;
    q('#vn').textContent = s.speed.toFixed(2) + '×';
    q('#tn').textContent = signed(s.semis);
    q('#vi').checked = s.vinilo;
    q('#mi').checked = s.min;
    q('#b').classList.toggle('on', changed);
    const partes = [r ?? `${s.speed}×${s.semis ? ' ' + signed(s.semis) : ''}`];
    if (n === 1) partes.push(EFECTOS[Object.keys(s.fx)[0]][0]);
    if (n > 1) partes.push(n + ' efectos');
    if (!r && s.speed === 1 && !s.semis && n) partes.shift();
    q('#b').textContent = partes.join(' + ');
    for (const b of q('#ri').children) b.setAttribute('aria-pressed', b.dataset.k === r);
    for (const b of q('#fx').children) b.setAttribute('aria-pressed', b.dataset.k in s.fx);
    for (const f of q('#in').children) {
      const k = f.dataset.k;
      f.hidden = !(k in s.fx);
      if (!f.hidden) f.querySelector('input').value = s.fx[k];
    }
    q('#no').disabled = !changed;
    for (const b of q('.pal').children) b.setAttribute('aria-pressed', b.title === s.paleta);
    q('#pn').textContent = s.paleta;
  }

  function boton(destino, texto, clave, alPulsar) {
    const b = document.createElement('button');
    b.textContent = texto;
    b.dataset.k = clave;
    b.onclick = alPulsar;
    destino.append(b);
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = ESTILO;
    document.head.append(st);
    const host = document.createElement('div');
    host.id = 'sl-panel';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `
<style>
  :host{all:initial;position:fixed;right:14px;bottom:92px;z-index:99999;font:12px "Segoe UI Variable","Segoe UI",sans-serif;color:#e6e6e6}
  #b{float:right;height:28px;padding:0 10px;border:1px solid #ffffff1f;border-radius:14px;background:var(--lg-fondo);color:#9b9b9b;font:inherit;font-variant-numeric:tabular-nums;cursor:pointer}
  #b:hover{color:#fff;border-color:#ffffff45}
  #b.on{color:var(--lg-acento);border-color:var(--lg-acento)}
  #p{box-sizing:border-box;width:276px;max-height:calc(100vh - 150px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#ffffff30 transparent;margin-bottom:8px;padding:16px;border:1px solid #ffffff1f;border-radius:8px;background:var(--lg-fondo)}
  #p[hidden],[hidden]{display:none!important}
  .f{display:flex;justify-content:space-between;align-items:baseline;color:#9b9b9b}
  .f b{color:#e6e6e6;font-weight:500;font-variant-numeric:tabular-nums}
  input[type=range]{appearance:none;width:100%;height:18px;margin:2px 0 10px;background:none;cursor:pointer}
  input[type=range]::-webkit-slider-runnable-track{height:2px;background:#ffffff2b}
  input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:12px;margin-top:-5px;border-radius:50%;background:var(--lg-acento)}
  .ch{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 14px}
  .ch button{height:26px;padding:0 9px;border:1px solid #ffffff24;border-radius:4px;background:none;color:#b5b5b5;font:inherit;cursor:pointer}
  .ch button:hover{color:#fff;border-color:#ffffff50}
  .ch button[aria-pressed=true]{background:var(--lg-acento);border-color:var(--lg-acento);color:#000}
  #in{margin-bottom:6px}
  #in label{display:grid;grid-template-columns:92px 1fr;align-items:center;color:#9b9b9b}
  #in input{margin:2px 0}
  #no{padding:0;border:0;background:none;color:#e6e6e6;font:inherit;cursor:pointer}
  #no:disabled{color:#6a6a6a;cursor:default}
  label.c{display:flex;align-items:center;justify-content:space-between;padding:4px 0;color:#9b9b9b;cursor:pointer}
  input[type=checkbox]{margin:0;accent-color:var(--lg-acento)}
  hr{height:1px;margin:12px 0;border:0;background:#ffffff17}
  .pal{display:flex;justify-content:space-between;margin-top:10px}
  .pal button{width:20px;height:20px;padding:0;border:1px solid #ffffff2e;border-radius:50%;cursor:pointer}
  .pal button[aria-pressed=true]{outline:1px solid #fff;outline-offset:2px}
  button:focus-visible,input:focus-visible{outline:1px solid #fff;outline-offset:2px}
  #e{margin-top:10px;color:#ff9c8a}
  #e:empty{display:none}
</style>
<div id="p" hidden>
  <div class="f"><span>Ritmo</span><button id="no">Normal</button></div>
  <div class="ch" id="ri"></div>
  <div class="f"><span>Efectos</span></div>
  <div class="ch" id="fx"></div>
  <div id="in"></div>
  <div class="f"><label for="v">Velocidad</label><b id="vn"></b></div>
  <input id="v" type="range" min="0.5" max="2" step="0.01" title="Doble clic: 1×">
  <div class="f"><label for="t">Tono</label><b id="tn"></b></div>
  <input id="t" type="range" min="-12" max="12" step="0.5" title="Doble clic: 0">
  <label class="c">Tono sigue a la velocidad<input id="vi" type="checkbox"></label>
  <label class="c">Minimalista<input id="mi" type="checkbox"></label>
  <hr>
  <div class="f"><span>Paleta</span><b id="pn"></b></div>
  <div class="pal"></div>
  <div id="e" role="alert"></div>
</div>
<button id="b" title="Ajustes (Alt+Mayús+L)" aria-label="Modos, velocidad, tono y paleta"></button>`;
    q = x => sh.querySelector(x);
    for (const n in RITMOS) boton(q('#ri'), n, n, () => set(ritmo() === n ? SIN_RITMO : RITMOS[n]));
    for (const k in EFECTOS) {
      const [nombre, inicial] = EFECTOS[k];
      boton(q('#fx'), nombre, k, () => efecto(k, k in s.fx ? 0 : inicial));
      const l = document.createElement('label'), r = document.createElement('input');
      l.dataset.k = k;
      r.type = 'range'; r.min = 0.05; r.max = 1; r.step = 0.05;
      r.oninput = () => efecto(k, +r.value);
      l.append(nombre, r);
      q('#in').append(l);
    }
    for (const n in PALETAS) {
      const b = document.createElement('button');
      const [fondo, , , acento] = PALETAS[n];
      b.title = n;
      b.setAttribute('aria-label', 'Paleta ' + n);
      b.style.background = `linear-gradient(135deg, ${fondo} 50%, ${acento} 50%)`;
      b.onclick = () => set({ paleta: n });
      q('.pal').append(b);
    }
    q('#no').onclick = normal;
    q('#b').onclick = abrir;
    q('#v').oninput = e => set({ speed: +e.target.value });
    q('#t').oninput = e => set({ semis: +e.target.value });
    q('#v').ondblclick = () => set({ speed: 1 });
    q('#t').ondblclick = () => set({ semis: 0 });
    q('#vi').onchange = e => set({ vinilo: e.target.checked });
    q('#mi').onchange = e => set({ min: e.target.checked });
    host.addEventListener('keydown', e => { if (e.key === 'Escape') q('#p').hidden = true; e.stopPropagation(); });
    addEventListener('pointerdown', e => { if (!e.composedPath().includes(host)) q('#p').hidden = true; }, true);
    document.body.append(host);
    draw();
  }
  function abrir() { q('#p').hidden = !q('#p').hidden; }
  function normal() { set({ ...SIN_RITMO, fx: {} }); }

  addEventListener('keydown', e => {
    if (!e.altKey || !e.shiftKey) return;
    const a = {
      ArrowUp: () => set({ speed: s.speed + 0.05 }),
      ArrowDown: () => set({ speed: s.speed - 0.05 }),
      ArrowRight: () => set({ semis: s.semis + 1 }),
      ArrowLeft: () => set({ semis: s.semis - 1 }),
      Digit0: normal,
      KeyL: abrir
    }[e.code];
    if (a && q) { e.preventDefault(); e.stopImmediatePropagation(); a(); }
  }, true);
  document.addEventListener('sl-estado', e => { if (q) q('#e').textContent = JSON.parse(e.detail).error || ''; });
  const start = () => { tema(); build(); send(); };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();
