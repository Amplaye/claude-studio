/* Claude Studio — the task list in the sidebar.
   Just the hookup: the panel itself lives in taskspanel.js, because the same list is
   also drawn inside the full-screen tab. */
(() => {
  const vscode = acquireVsCodeApi();
  const panel = window.TaskPanel(document.body);

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    // The language is chosen in the chat's settings; here we're only told about it.
    if (e.data.k === 'lang') window.I18N.set(e.data.value);
    if (e.data.k === 'tasks') panel.render(e.data.d);
  });

  vscode.postMessage({ cmd: 'ready' });
})();
