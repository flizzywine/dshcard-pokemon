/* Optional, session-only user-supplied Stadium battle GIFs. */
(function (root) {
  'use strict';
  const files = new Map();
  let generation = 0;
  function clear() {
    for (const url of files.values()) URL.revokeObjectURL(url);
    files.clear();
    generation++;
  }
  function importFiles(selection) {
    const next = new Map();
    for (const file of selection || []) {
      const match = /^(\d+)-(front|back)-(n|s)\.gif$/i.exec(file.name || '');
      if (!match) continue;
      const id = Number(match[1]);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      const key = `${id}-${match[2].toLowerCase()}-${match[3].toLowerCase()}`;
      if (!next.has(key)) next.set(key, URL.createObjectURL(file));
    }
    if (!next.size) return 0;
    clear();
    for (const [key, url] of next) files.set(key, url);
    return files.size;
  }
  function resolve(id, back, shiny) {
    return files.get(`${Number(id)}-${back ? 'back' : 'front'}-${shiny ? 's' : 'n'}`) || null;
  }
  root.KantoStadiumSprites = { importFiles, resolve, clear, get generation() { return generation; }, get count() { return files.size; } };
})(typeof window === 'undefined' ? globalThis : window);
