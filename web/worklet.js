// Cambio de tono en tiempo real sin alterar la velocidad.
// WSOLA estira el audio por p y un remuestreo cúbico lo devuelve a su duración.
// La función se convierte en texto y se carga como AudioWorklet (ver main.js).
globalThis.__slWorklet = function () {
  const N = 2048, HS = 1024, SEARCH = 512, CORR = 1024, RING = 1 << 15, MASK = RING - 1;
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);

  class SlPitch extends AudioWorkletProcessor {
    constructor() {
      super();
      this.p = 1; this.on = false; this.wet = 0;
      this.inp = [new Float32Array(RING), new Float32Array(RING)];
      this.mono = new Float32Array(RING);
      this.out = [new Float32Array(RING), new Float32Array(RING)];
      this.reset();
      this.port.onmessage = e => {
        if (e.data === 'fin') { this.fin = true; return; }
        const on = Math.abs(e.data - 1) > 1e-4;
        if (on) this.p = e.data;
        this.on = on;
      };
    }
    reset() {
      this.listo = false; this.inW = 0; this.ana = 0; this.prev = -1; this.outW = 0; this.outR = 0;
      for (const b of [...this.inp, ...this.out, this.mono]) b.fill(0);
    }
    score(a, b, step) {
      const m = this.mono;
      let c = 0, e = 1e-9;
      for (let i = 0; i < CORR; i += step) {
        const x = m[(a + i) & MASK];
        c += x * m[(b + i) & MASK];
        e += x * x;
      }
      return c / Math.sqrt(e);
    }
    produce() {
      const t = Math.round(this.ana);
      if (t + SEARCH + N > this.inW || (this.prev >= 0 && this.prev + HS + CORR > this.inW)) return false;
      let start = t;
      if (this.prev >= 0) {
        const ref = this.prev + HS;
        let best = -Infinity, bd = 0;
        for (let d = -SEARCH; d <= SEARCH; d += 4) {
          if (t + d < 0) continue;
          const s = this.score(t + d, ref, 4);
          if (s > best) { best = s; bd = d; }
        }
        best = -Infinity;
        let fine = bd;
        for (let d = bd - 3; d <= bd + 3; d++) {
          if (t + d < 0 || d > SEARCH) continue;
          const s = this.score(t + d, ref, 2);
          if (s > best) { best = s; fine = d; }
        }
        start = t + fine;
      }
      for (let ch = 0; ch < 2; ch++) {
        const o = this.out[ch], x = this.inp[ch], w = this.outW;
        for (let i = HS; i < N; i++) o[(w + i) & MASK] = 0;
        for (let i = 0; i < N; i++) o[(w + i) & MASK] += hann[i] * x[(start + i) & MASK];
      }
      this.prev = start;
      this.outW += HS;
      this.ana += HS / this.p;
      return true;
    }
    process(inputs, outputs) {
      if (this.fin) return false;
      const I = inputs[0], O = outputs[0], n = O[0].length;
      const l = I[0], r = I[1] || I[0];
      if (!this.on && this.wet === 0) {
        if (this.inW) this.reset();
        for (let c = 0; c < O.length; c++) {
          const s = c ? r : l;
          if (s) O[c].set(s); else O[c].fill(0);
        }
        return true;
      }
      for (let i = 0; i < n; i++) {
        const k = (this.inW + i) & MASK, a = l ? l[i] : 0, b = r ? r[i] : 0;
        this.inp[0][k] = a;
        this.inp[1][k] = b;
        this.mono[k] = 0.5 * (a + b);
      }
      this.inW += n;
      if (this.inW - this.ana > RING / 2) { this.ana = this.inW - N - SEARCH; this.prev = -1; }
      const need = n * this.p + 4 + (this.listo ? 0 : HS);   // al arrancar guarda un margen para no cortarse
      while (this.outW - this.outR < need) if (!this.produce()) break;
      const ready = this.outW - this.outR >= need;
      if (ready) this.listo = true;
      const step = 1 / 2048, w0 = this.wet;
      let pos = this.outR, w = w0;
      for (let c = 0; c < O.length; c++) {
        const b = this.out[Math.min(c, 1)], dry = c ? r : l;
        pos = this.outR;
        w = w0;
        for (let i = 0; i < n; i++) {
          let v = 0;
          if (ready) {
            const k = Math.floor(pos), f = pos - k;
            const y0 = b[(k - 1) & MASK], y1 = b[k & MASK], y2 = b[(k + 1) & MASK], y3 = b[(k + 2) & MASK];
            v = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
            pos += this.p;
            w = this.on ? Math.min(1, w + step) : Math.max(0, w - step);
          }
          const d = dry ? dry[i] : 0;
          O[c][i] = v * w + d * (1 - w);
        }
      }
      this.outR = pos;
      this.wet = w;
      return true;
    }
  }
  registerProcessor('sl-pitch', SlPitch);

  // Reverb por red de retardos: 8 líneas realimentadas en vez de una convolución de 3 s.
  const NIVEL = 0.23;

  // Los retardos comparten un búfer, con un cursor y límites separados por línea.
  function retardos(longitudes) {
    const inicio = new Int32Array(longitudes.length), fin = new Int32Array(longitudes.length);
    let total = 0;
    for (let j = 0; j < longitudes.length; j++) {
      inicio[j] = total;
      total += longitudes[j];
      fin[j] = total;
    }
    return { buf: new Float32Array(total), pos: inicio.slice(), inicio, fin };
  }

  class SlReverb extends AudioWorkletProcessor {
    constructor() {
      super();
      const sr = sampleRate, k = sr / 44100, RT = 2.9;
      const longitudes = [1783, 2113, 2447, 2749, 3089, 3413, 3761, 4093].map(v => Math.round(v * k));
      this.red = retardos(longitudes);
      this.g = Float64Array.from(longitudes, v => 10 ** (-3 * v / (sr * RT)));
      this.lp = new Float64Array(8);
      this.x = new Float64Array(8);
      this.difusores = retardos([142, 379, 107, 277, 151, 367, 113, 293].map(v => Math.round(v * k)));
      this.pre = [0, 1].map(() => new Float32Array(Math.round(0.022 * sr)));
      this.pp = 0;
    }
    difundir(primero, x) {
      const { buf, pos, inicio, fin } = this.difusores;
      for (let j = primero; j < primero + 4; j++) {
        const i = pos[j], y = buf[i] - 0.62 * x;
        buf[i] = x + 0.62 * y;
        pos[j] = i + 1 === fin[j] ? inicio[j] : i + 1;
        x = y;
      }
      return x;
    }
    process(inputs, outputs) {
      const I = inputs[0], [L, R] = outputs[0], n = L.length, l = I[0], r = I[1] || I[0];
      const { g, lp, x, pre } = this;
      const { buf, pos, inicio, fin } = this.red;
      for (let i = 0; i < n; i++) {
        const pl = pre[0][this.pp], pr = pre[1][this.pp];
        pre[0][this.pp] = l ? l[i] : 0;
        pre[1][this.pp] = r ? r[i] : 0;
        if (++this.pp === pre[0].length) this.pp = 0;
        const a = this.difundir(0, pl) + 1e-18, b = this.difundir(4, pr) + 1e-18;
        let sum = 0;
        for (let j = 0; j < 8; j++) {
          lp[j] += 0.62 * (buf[pos[j]] - lp[j]);        // los agudos se apagan antes
          x[j] = lp[j] * g[j];
          sum += x[j];
        }
        sum *= 0.25;
        for (let j = 0; j < 8; j++) {
          const p = pos[j];
          buf[p] = x[j] - sum + (j & 1 ? b : a);
          pos[j] = p + 1 === fin[j] ? inicio[j] : p + 1;
        }
        L[i] = NIVEL * (x[0] - x[2] + x[4] - x[6] + 0.4 * (x[1] - x[5]));
        R[i] = NIVEL * (x[1] - x[3] + x[5] - x[7] + 0.4 * (x[4] - x[0]));
      }
      return true;
    }
  }
  registerProcessor('sl-reverb', SlReverb);
};
