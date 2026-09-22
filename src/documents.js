'use strict';

// Both native entry points bind callbacks during construction. Discover their
// instances on focus/input in every workspace document, including new windows.
function watchDocuments(plugin, scan) {
  const workspace = plugin.app.workspace, documents = new Set();
  let disposed = false;
  function forget(doc) {
    for (const event of ['focusin','input']) doc.removeEventListener(event, run, true);
    documents.delete(doc);
  }
  function remember(doc) {
    if (!doc || documents.has(doc) || doc.defaultView?.closed) return;
    documents.add(doc);
    for (const event of ['focusin','input']) doc.addEventListener(event, run, true);
  }
  function run() {
    if (disposed || !plugin.active) return;
    for (const doc of documents) if (doc.defaultView?.closed) forget(doc);
    remember(workspace.containerEl?.ownerDocument);
    remember(workspace.activeLeaf?.view?.containerEl?.ownerDocument);
    workspace.iterateAllLeaves?.(leaf => remember(leaf.view?.containerEl?.ownerDocument));
    scan();
  }
  const events = ['layout-change','active-leaf-change','file-open','window-open','window-close']
    .map(event => workspace.on(event, run));
  run();
  return () => {
    disposed = true;
    for (const event of events) workspace.offref?.(event);
    for (const doc of documents) forget(doc);
  };
}

module.exports = {watchDocuments};
