// Efectos combinables. Cada uno es { in, out, set(cantidad 0..1) } y se encadenan
// en el orden de ORDEN; los apagados no se conectan, así que no gastan CPU.
globalThis.__slEfectos = ctx => {
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filter = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  };
  const to = (param, v) => param.setTargetAtTime(v, ctx.currentTime, 0.03);
  const chain = (...n) => { n.reduce((a, b) => (a.connect(b), b)); return n[n.length - 1]; };

  const CREAR = {
    // Quita lo que está en el centro (casi siempre la voz) y conserva los graves
    karaoke() {
      const inp = gain(1), out = gain(1), sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      const dry = gain(0), side = gain(1), lado = gain(1), inv = gain(-1), low = gain(1);
      inp.channelCount = 2; inp.channelCountMode = 'explicit';
      inp.connect(dry).connect(out);
      inp.connect(sp);
      sp.connect(lado, 0); sp.connect(inv, 1); inv.connect(lado);
      lado.connect(side);
      side.connect(mg, 0, 0); side.connect(mg, 0, 1);
      mg.connect(out);
      chain(inp, filter('lowpass', 130), low, out);
      return { in: inp, out, set(a) { to(dry.gain, 1 - a); to(side.gain, 0.8 * a); to(low.gain, a); } };
    },
    bajos() {
      const f = filter('lowshelf', 110);
      return { in: f, out: f, set(a) { to(f.gain, 14 * a); } };
    },
    lofi() {
      const hp = filter('highpass', 90), lp = filter('lowpass', 4000), ws = ctx.createWaveShaper();
      const curve = new Float32Array(1025);
      for (let i = 0; i < 1025; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
      ws.curve = curve;
      const d = ctx.createDelay(0.05), lfo = ctx.createOscillator(), dep = gain(0);
      d.delayTime.value = 0.012; lfo.frequency.value = 0.7;
      lfo.connect(dep).connect(d.delayTime); lfo.start();          // vaivén de cinta
      chain(hp, lp, ws, d);
      return { in: hp, out: d, set(a) { to(lp.frequency, 9000 - 6800 * a); to(dep.gain, 0.0016 * a); } };
    },
    agua() {
      const a1 = filter('lowpass', 600), a2 = filter('lowpass', 600);
      a1.connect(a2);
      return { in: a1, out: a2, set(a) { const f = 2400 * (0.11 ** a); to(a1.frequency, f); to(a2.frequency, f); } };
    },
    radio() {
      const hp = filter('highpass', 400), lp = filter('lowpass', 3200), g = gain(1.6);
      chain(hp, lp, g);
      return { in: hp, out: g, set(a) { to(hp.frequency, 120 + 500 * a); to(lp.frequency, 6500 - 4200 * a); } };
    },
    amplio() {
      const inp = gain(1), out = gain(1), sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      inp.channelCount = 2; inp.channelCountMode = 'explicit';
      const ll = gain(1), rr = gain(1), lr = gain(0), rl = gain(0);
      inp.connect(sp);
      sp.connect(ll, 0); sp.connect(lr, 0); sp.connect(rr, 1); sp.connect(rl, 1);
      ll.connect(mg, 0, 0); rl.connect(mg, 0, 0); rr.connect(mg, 0, 1); lr.connect(mg, 0, 1);
      mg.connect(out);
      return {
        in: inp, out,
        set(a) {
          const w = 1 + a;                       // anchura del lado respecto al centro
          for (const g of [ll, rr]) to(g.gain, (1 + w) / 2);
          for (const g of [lr, rl]) to(g.gain, (1 - w) / 2);
        }
      };
    },
    eco() {
      const inp = gain(1), out = gain(1), d = ctx.createDelay(1), fb = gain(0), wet = gain(0), lp = filter('lowpass', 3500);
      d.delayTime.value = 0.32;
      inp.connect(out);
      chain(inp, d, lp, wet, out);
      chain(lp, fb, d);
      return { in: inp, out, set(a) { to(wet.gain, 0.6 * a); to(fb.gain, 0.6 * a); } };
    },
    reverb() {
      const inp = gain(1), out = gain(1), dry = gain(1), wet = gain(0);
      const rv = new AudioWorkletNode(ctx, 'sl-reverb', { outputChannelCount: [2] });
      inp.connect(dry).connect(out);
      chain(inp, filter('highpass', 160), rv, wet, out);
      return { in: inp, out, set(a) { to(dry.gain, 1 - 0.45 * a); to(wet.gain, 2.4 * a); } };
    },
    ocho() {
      const p = ctx.createStereoPanner(), lfo = ctx.createOscillator(), dep = gain(0);
      lfo.frequency.value = 0.11;
      lfo.connect(dep).connect(p.pan); lfo.start();
      return { in: p, out: p, set(a) { to(dep.gain, 0.9 * a); } };
    }
  };
  const ORDEN = Object.keys(CREAR);

  const input = gain(1), salida = gain(1), vol = gain(1), lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15;
  const nodos = {};
  let firma = null, cambio = 0;
  salida.connect(ctx.destination);

  function conectar(activos) {
    input.disconnect();
    for (const k in nodos) nodos[k].out.disconnect();
    vol.disconnect(); lim.disconnect();
    let cola = input;
    for (const k of activos) { cola.connect(nodos[k].in); cola = nodos[k].out; }
    if (activos.length) { cola.connect(vol); vol.connect(lim); lim.connect(salida); vol.gain.value = 0.8; }
    else cola.connect(salida);
    to(salida.gain, 1);
  }

  return {
    input,
    set(fx) {
      const activos = ORDEN.filter(k => fx[k] > 0);
      for (const k of activos) (nodos[k] ??= CREAR[k]()).set(fx[k]);
      const f = activos.join();
      if (f === firma) return;
      const primera = firma === null;
      firma = f;
      clearTimeout(cambio);
      if (primera) return conectar(activos);
      salida.gain.setTargetAtTime(0, ctx.currentTime, 0.008);   // microfundido para que no haga clic
      cambio = setTimeout(() => conectar(activos), 40);
    }
  };
};
