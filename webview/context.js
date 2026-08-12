/* Claude Studio — il pannello del contesto nella barra laterale.
   Qui c'e' solo l'aggancio: il pannello vero e' in ctxpanel.js, perche' lo stesso
   disegno serve anche dentro la scheda a tutto schermo. */
(() => {
  const vscode = acquireVsCodeApi();
  const panel = window.CtxPanel(document.body, (m) => vscode.postMessage(m));

  window.addEventListener('message', (e) => {
    if (e.data && e.data.k === 'data') panel.render(e.data.d);
  });

  vscode.postMessage({ cmd: 'ready' });
})();
