/* Claude Studio — the context panel in the sidebar.
   This is just the hookup: the real panel lives in ctxpanel.js, because the same
   design is also needed inside the full-screen tab. */
(() => {
  const vscode = acquireVsCodeApi();
  const panel = window.CtxPanel(document.body, (m) => vscode.postMessage(m));

  window.addEventListener('message', (e) => {
    if (e.data && e.data.k === 'data') panel.render(e.data.d);
  });

  vscode.postMessage({ cmd: 'ready' });
})();
