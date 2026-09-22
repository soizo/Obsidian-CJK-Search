'use strict';
const {createMappedSearch, LIMITS} = require('./matcher.js');
const {watchDocuments} = require('./documents.js');
// Matches the native 1.13.7 image category, including its separation from the
// all-file-types option. Registry eligibility still owns other attachments.
const images = new Set(['bmp','png','jpg','jpeg','gif','svg','webp','avif']);
const fileKey = Symbol('file');

function augmentSuggestions(modal, rawQuery, nativeResults, expander, fullCompatibility, api) {
  if (typeof rawQuery !== 'string' || !Array.isArray(nativeResults)) throw new TypeError('Unsupported suggestions interface');
  const query = rawQuery.trim();
  if (!query) return nativeResults;
  if (query.length > LIMITS.input * 2 || [...query].length > LIMITS.input) throw new RangeError('input-limit');
  if (modal.context !== 'view') throw new Error('Unsupported switcher context');
  const flags = ['shouldShowMarkdown','shouldShowNonAttachments','shouldShowImages',
    'shouldShowNonImageAttachments','shouldShowAllTypes','shouldShowAlias'];
  if (flags.some(key => !(key in modal) || (modal[key] !== undefined && typeof modal[key] !== 'boolean')))
    throw new Error('Unsupported switcher options');
  const {vault,metadataCache,viewRegistry} = modal.app;
  function eligible(file) {
    if (file.extension === 'md') return modal.shouldShowMarkdown;
    if (file.extension === 'canvas' || file.extension === 'base') return modal.shouldShowNonAttachments;
    if (images.has(file.extension)) return modal.shouldShowImages;
    return modal.shouldShowAllTypes || (modal.shouldShowNonImageAttachments && viewRegistry.isExtensionRegistered(file.extension));
  }
  const files = vault.getFiles().filter(eligible);
  const prepare = files.length < 10000 ? api.prepareFuzzySearch : api.prepareSimpleSearch;
  const mappedMatch = createMappedSearch(query,expander,fullCompatibility,prepare);
  const results = nativeResults.slice(), seen = new Map();
  for (const row of nativeResults) {
    if (row?.type !== 'file' && row?.type !== 'alias') continue;
    if (!seen.has(row.file)) seen.set(row.file,new Set());
    seen.get(row.file).add(row.type === 'file' ? fileKey : row.alias);
  }
  for (const file of files) {
    const keys = seen.get(file) ?? new Set();
    const downranked = metadataCache.isUserIgnored(file.path);
    if (!keys.has(fileKey)) {
      const display = file.extension === 'md' ? file.path.slice(0,-3) : file.path;
      const start = display.lastIndexOf('/') + 1;
      // Split the ORIGINAL path; a full-width slash in a filename can itself
      // canonicalize to '/', but must never become a directory separator.
      let found = mappedMatch(display.slice(start),start);
      if (!found) {
        found = mappedMatch(display);
        if (found) found.score -= 1;
      }
      if (found) {
        if (downranked) found.score -= 10;
        results.push({type:'file',file,match:found,downranked});
        keys.add(fileKey);
      }
    }
    if (modal.shouldShowAlias) {
      const cache = metadataCache.getFileCache(file);
      const aliases = cache && api.parseFrontMatterAliases(cache.frontmatter);
      for (const alias of aliases ?? []) {
        if (keys.has(alias)) continue;
        const found = mappedMatch(alias);
        if (found) {
          if (downranked) found.score -= 10;
          results.push({type:'alias',alias,file,match:found,downranked});
          keys.add(alias);
        }
      }
    }
    seen.set(file,keys);
  }
  // Sort a new list only. Existing native score objects remain untouched and
  // stable ties retain their original order ahead of supplemental matches.
  return results.sort((a,b)=>b.match.score-a.match.score);
}

function installOpenFile(plugin, report, api) {
  const modals = new Map();
  let disposed = false, coreRecord = null;
  const getCore = () => plugin.app.internalPlugins?.getEnabledPluginById?.('switcher');
  function replace(target, name, wrapper) {
    const original = target[name], own = Object.prototype.hasOwnProperty.call(target,name);
    target[name] = wrapper(original);
    const installed = target[name];
    return () => {
      if (target[name] === installed) {
        if (own) target[name] = original; else delete target[name];
      }
    };
  }
  function scanNative() {
    if (disposed || !plugin.active || !plugin.expander) return;
    const core = getCore();
    if (core !== coreRecord?.core) {
      coreRecord?.restore();
      coreRecord = null;
      for (const restore of [...modals.values()]) restore();
      if (core && typeof core.onOpen === 'function') {
        const restore = replace(core,'onOpen', original => function (...args) {
          const returned = original.apply(this,args); scan(); return returned;
        });
        coreRecord = {core,restore};
      }
    }
    const modal = core?.activeModal;
    if (!modal || modals.has(modal) || !modal.inputEl || typeof modal.getSuggestions !== 'function') return;
    const restores = [];
    const restore = () => {
      for (const undo of restores) undo();
      modals.delete(modal);
    };
    try {
      restores.push(replace(modal,'getSuggestions', original => function (...args) {
        const native = original.apply(this,args);
        if (disposed || !plugin.active || getCore() !== core) return native;
        try {
          const results = augmentSuggestions(this,args[0],native,plugin.expander,plugin.settings.fullCompatibility,api);
          if (results.length > native.length)
            report('expanded', {surface:'open-file',added:results.length-native.length,stage:'native-suggestions-supplemented'});
          return results;
        } catch (error) {
          report('native-fallback', {surface:'open-file',reason:error instanceof RangeError ? 'limit-or-range' : 'native-interface-error'}, 'warn');
          return native;
        }
      }));
      if (typeof modal.onClose === 'function') restores.push(replace(modal,'onClose', original => function (...args) {
        try { return original.apply(this,args); } finally { restore(); }
      }));
      modals.set(modal,restore);
      report('attached', {surface:'open-file'});
    } catch {
      restore();
      report('native-fallback',{surface:'open-file',reason:'unsupported-interface'},'warn');
    }
  }
  function scan() {
    try { scanNative(); }
    catch { report('native-fallback',{surface:'open-file',reason:'scan-interface-error'},'warn'); }
  }
  const stopWatching = watchDocuments(plugin,scan);
  return () => {
    if (disposed) return;
    disposed = true;
    stopWatching();
    for (const restore of [...modals.values()]) restore();
    coreRecord?.restore(); coreRecord = null;
  };
}

module.exports = {augmentSuggestions, installOpenFile};
