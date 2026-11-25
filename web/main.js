// Corre en la página: controla velocidad, tono y efectos del reproductor.
(() => {
  const worklet = globalThis.__slWorklet, crearEfectos = globalThis.__slEfectos;
  delete globalThis.__slWorklet;
  delete globalThis.__slEfectos;
  const P = HTMLMediaElement.prototype;
  const own = n => Object.getOwnPropertyDescriptor(P, n);
  const rate = own('playbackRate'), keep = own('preservesPitch'), nativePlay = P.play;
  const st = { speed: 1, semis: 0, vinilo: false, fx: {} };
  const els = new Set();          // referencias débiles a reproductores de sonido vistos
  const liberar = new FinalizationRegistry(ref => els.delete(ref));
  const base = new WeakMap();     // velocidad que pide la propia web (p. ej. podcasts)
  const graphs = new WeakMap();
  let ctx, ready, efectos;

  const decorative = el => el.loop && el.muted;
  const say = o => document.dispatchEvent(new CustomEvent('sl-estado', { detail: JSON.stringify(o) }));
  const procesa = () => st.semis !== 0 || Object.values(st.fx).some(v => v > 0);

  function apply(el) {
    const r = Math.min(4, Math.max(0.25, (base.get(el) ?? 1) * st.speed));
    const kp = !st.vinilo;
    if (keep.get.call(el) !== kp) keep.set.call(el, kp);
    if (Math.abs(rate.get.call(el) - r) > 1e-3) rate.set.call(el, r);
    if (procesa() || graphs.has(el)) conectar(el);
  }

  // El grafo de audio solo se crea si se usa el tono o algún efecto: sin ellos no hay coste extra.
  async function conectar(el) {
    const g = graphs.get(el);
    if (g) {
      if (g.src) tono(g);
      despertar();
      return;
    }
    if (el.paused && !el.currentSrc) return;
    graphs.set(el, {});
    try {
      if (!ctx) {
        // Spotify emite a 44,1 kHz: procesar a los 96 kHz de la tarjeta era el doble de trabajo.
        // Un búfer de 0,1 s despierta menos al procesador.
        ctx = new AudioContext({ latencyHint: 0.1, sampleRate: 44100 });
        const url = URL.createObjectURL(new Blob([`(${worklet})()`], { type: 'text/javascript' }));
        ready = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
      }
      await ready;
      efectos ??= crearEfectos(ctx);
      efectos.set(st.fx);
      const src = ctx.createMediaElementSource(el), nuevo = { src, node: null };
      src.connect(efectos.input);
      graphs.set(el, nuevo);
      tono(nuevo);
      ctx.resume();
      if (!sonando()) dormir();
      watch(el, src);
    } catch (e) {
      graphs.delete(el);
      say({ error: 'No se pudieron activar los efectos: ' + e.message });
    }
  }

  // El procesador de tono solo existe mientras el tono no es 0.
  function tono(g) {
    clearTimeout(g.quitar);
    if (st.semis !== 0 && !g.node) {
      g.node = new AudioWorkletNode(ctx, 'sl-pitch', { outputChannelCount: [2] });
      g.node.connect(efectos.input);
      g.src.disconnect(efectos.input);
      g.src.connect(g.node);
    }
    if (!g.node) return;
    g.node.port.postMessage(2 ** (st.semis / 12));
    if (st.semis === 0) g.quitar = setTimeout(() => {          // tras el fundido interno a sonido directo
      const n = g.node;
      g.node = null;
      g.src.connect(efectos.input);
      g.src.disconnect(n);
      n.disconnect();
      n.port.postMessage('fin');
    }, 600);
  }

  function* reproductores() {
    for (const ref of els) {
      const el = ref.deref();
      if (el) yield el;
    }
  }

  function sonando() {
    for (const el of reproductores()) if (!el.paused && !el.ended) return true;
    return false;
  }

  // Para los botones de la miniatura (barra.js).
  const avisarSonando = () => document.dispatchEvent(new CustomEvent('sl-sonando', { detail: sonando() }));
  const despertar = () => { if (ctx?.state === 'suspended' && sonando()) ctx.resume(); };
  let siesta = 0;
  // En pausa, deja terminar la cola de la reverb y apaga el motor de audio.
  function dormir() {
    if (!ctx) return;
    clearTimeout(siesta);
    siesta = setTimeout(() => { if (ctx?.state === 'running' && !sonando()) ctx.suspend(); }, 4500);
  }

  // Si la protección del audio impide procesarlo, saldría silencio: avisar.
  function watch(el, node) {
    const a = ctx.createAnalyser(), buf = new Float32Array(a.fftSize);
    const eventos = ['playing', 'pause', 'ended', 'emptied', 'volumechange'];
    node.connect(a);
    let t = 0, quiet = 0, espera = 0;
    const audible = () => !el.paused && !el.ended && !el.muted && el.volume > 0;

    function detener() {
      clearInterval(t);
      t = 0;
    }

    function terminar(silencio) {
      detener();
      for (const evento of eventos) el.removeEventListener(evento, actualizar);
      node.disconnect(a);
      if (silencio) say({ error: 'Este audio no deja usar tono ni efectos. Pulsa Normal y reinicia la app.' });
    }

    function revisar() {
      if (!audible()) return detener();
      if (ctx.state !== 'running') {
        if (++espera >= 20) detener();
        return;
      }
      espera = 0;
      a.getFloatTimeDomainData(buf);
      if (buf.some(v => v !== 0)) return terminar(false);
      if (++quiet === 16) terminar(true);
    }

    function actualizar() {
      if (!audible()) return detener();
      if (t) return;
      espera = 0;
      t = setInterval(revisar, 250);
    }

    for (const evento of eventos) el.addEventListener(evento, actualizar);
    actualizar();
  }

  function track(el) {
    if (decorative(el)) return;
    if (!base.has(el)) {
      const ref = new WeakRef(el);
      els.add(ref);
      liberar.register(el, ref);
      base.set(el, rate.get.call(el) || 1);
      for (const ev of ['loadedmetadata', 'play', 'playing']) el.addEventListener(ev, () => apply(el));
      for (const ev of ['pause', 'ended', 'emptied']) el.addEventListener(ev, dormir);
      for (const ev of ['playing', 'pause', 'ended', 'emptied']) el.addEventListener(ev, avisarSonando);
    }
    apply(el);
  }

  P.play = function (...a) { track(this); return nativePlay.apply(this, a); };
  Object.defineProperty(P, 'playbackRate', {
    ...rate,
    get() { return base.has(this) ? base.get(this) : rate.get.call(this); },
    set(v) {
      if (!base.has(this)) return rate.set.call(this, v);
      base.set(this, +v);
      apply(this);
    }
  });
  Object.defineProperty(P, 'preservesPitch', {
    ...keep,
    set(v) { if (!base.has(this)) keep.set.call(this, v); }
  });

  for (const ev of ['pointerdown', 'keydown'])
    addEventListener(ev, despertar, true);

  document.addEventListener('sl-ajustes', e => {
    const d = JSON.parse(e.detail);
    if (Number.isFinite(d.speed)) st.speed = d.speed;
    if (Number.isFinite(d.semis)) st.semis = d.semis;
    st.vinilo = !!d.vinilo;
    st.fx = {};
    for (const [k, v] of Object.entries(d.fx ?? {})) if (Number.isFinite(v)) st.fx[k] = Math.min(1, Math.max(0, v));
    efectos?.set(st.fx);
    for (const el of reproductores()) apply(el);
  });
})();
