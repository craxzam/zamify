// Puente con los botones de la miniatura de la barra de tareas (Miniatura.cs).
(() => {
  const wv = window.chrome?.webview;
  if (!wv) return;
  const q = s => document.querySelector(s);
  const BOTONES = { prev: 'control-button-skip-back', play: 'control-button-playpause', next: 'control-button-skip-forward' };
  const meGusta = () => q('[data-testid="now-playing-widget"] button[aria-checked]');
  let sonando = false, ultimo = '', barra = null, pendiente = 0;

  // Solo cambios de "Me gusta" o de canción: el avance del tiempo no despierta al observador.
  const obs = new MutationObserver(() => { clearTimeout(pendiente); pendiente = setTimeout(avisar, 100); });

  function avisar() {
    const b = q('[data-testid="now-playing-bar"]');
    if (b !== barra) {
      obs.disconnect();
      barra = b;
      if (b) obs.observe(b, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
    }
    const g = meGusta();
    const m = 'e' + (sonando ? 1 : 0) + (g ? (g.getAttribute('aria-checked') === 'true' ? 1 : 0) : '-');
    if (m !== ultimo) { ultimo = m; wv.postMessage(m); }
  }

  document.addEventListener('sl-sonando', e => { sonando = e.detail; avisar(); });
  wv.addEventListener('message', e => {
    if (e.data === 'like') {
      const g = meGusta();
      if (g?.getAttribute('aria-checked') === 'false') g.click();   // quitarla abriría un menú: eso, en la ventana
    } else if (Object.hasOwn(BOTONES, e.data)) {
      q(`[data-testid="${BOTONES[e.data]}"]`)?.click();
    }
  });
  // La barra aparece después de cargar: unas pocas comprobaciones, sin sondeo continuo.
  for (const ms of [3000, 10000, 30000]) setTimeout(avisar, ms);
})();
