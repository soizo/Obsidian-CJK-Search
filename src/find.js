'use strict';
const {watchDocuments} = require('./documents.js');

// Ranges refer to the unchanged original text. Keep native hits (including its
// compatibility semantics) and add literal-equivalence hits without normalization.
function collectMatches(text, source, nativeRanges) {
  const ranges = nativeRanges.map(range => {
    if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0]) ||
        !Number.isInteger(range[1]) || range[0] < 0 || range[1] <= range[0] || range[1] > text.length)
      throw new RangeError('Invalid native range');
    return range.slice();
  });
  const regex = new RegExp(source, 'gi');
  let match;
  while ((match = regex.exec(text))) {
    if (!match[0].length) throw new Error('Empty match in literal search');
    ranges.push([match.index, match.index + match[0].length]);
    // Previous navigates overlapping occurrences; never restart inside a pair.
    regex.lastIndex = match.index + (text.codePointAt(match.index) > 0xffff ? 2 : 1);
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  return ranges.filter((range, i) => !i || range[0] !== ranges[i - 1][0] || range[1] !== ranges[i - 1][1]);
}

function nonoverlapping(ranges) {
  const kept = [];
  let end = 0;
  for (const range of ranges) {
    if (range[0] >= end) { kept.push(range); end = range[1]; }
  }
  return kept;
}

function createFindCursor(editor, nativeCursor, source) {
  let text, ranges, all, selected = null, from = 0, to = 0;
  const position = range => range && ({from:editor.offsetToPos(range[0]), to:editor.offsetToPos(range[1])});
  function sync() {
    const value = editor.getValue();
    if (value === text) return;
    const native = nativeCursor.findAll().map(range => [editor.posToOffset(range.from), editor.posToOffset(range.to)]);
    const next = collectMatches(value, source, native);
    text = value;
    ranges = next;
    all = nonoverlapping(ranges);
    selected = null;
    from = editor.posToOffset(editor.getCursor('from'));
    to = editor.posToOffset(editor.getCursor('to'));
  }
  function select(range) {
    selected = range ?? null;
    if (selected) [from, to] = selected;
    return position(selected);
  }
  function readonly() { throw new Error('Enhanced Find cursor is read-only'); }
  return {
    current() { sync(); return position(selected); },
    findNext() {
      sync();
      return select(ranges.find(range => range[0] >= to) ?? ranges[0]);
    },
    findPrevious() {
      sync();
      let previous;
      for (const range of ranges) if (range[1] <= from) previous = range;
      return select(previous ?? ranges[ranges.length - 1]);
    },
    findAll() { sync(); return all.map(position); },
    getIndexAndCount() {
      sync();
      const index = selected ? all.filter(range => range[0] <= selected[0]).length : 0;
      return [Math.min(index, 9999), Math.min(all.length, 9999)];
    },
    replace: readonly,
    replaceAll: readonly,
  };
}

function installFind(plugin, report) {
  const workspace = plugin.app.workspace;
  const records = new Map(), modes = new Map(), cursors = new WeakSet();
  let disposed = false, scanning = false;
  const enabled = () => !disposed && plugin.active && plugin.expander;
  const fallback = (surface, reason) => report('native-fallback', {surface, reason}, 'warn');
  function patch(target, name, decorate, restores) {
    const original = target[name];
    if (typeof original !== 'function') throw new Error('Missing Find method');
    const own = Object.prototype.hasOwnProperty.call(target, name);
    const wrapper = decorate(original);
    target[name] = wrapper;
    restores.push(() => {
      if (target[name] === wrapper) {
        if (own) target[name] = original;
        else delete target[name];
      }
    });
  }
  function attach(search, kind) {
    if (!search || records.has(search)) return;
    const restores = [];
    const record = {kind, enhanced:false, nativeInput:search.onSearchInput, nativeUpdate:search.updateQuery};
    function enhanceEdit() {
      if (!enabled() || !search.isActive || search.isReplace || !search.cursor || cursors.has(search.cursor)) return;
      const native = search.cursor;
      try {
        const query = search.getQuery();
        if (typeof query !== 'string') return;
        const expanded = plugin.expander.expandLiteral(query, {fullCompatibility:plugin.settings.fullCompatibility});
        if (expanded.status === 'fallback') { fallback('find-edit', expanded.reason); return; }
        if (expanded.status !== 'expanded') return;
        const cursor = createFindCursor(search.editor, native, expanded.source);
        const match = cursor.findNext();
        cursors.add(cursor);
        search.cursor = cursor;
        if (match) search.highlight([match]); else search.clear();
        search.searchInputEl.toggleClass('mod-no-match', !match);
        search.requestUpdateCount();
        report('expanded', {surface:'find-edit',queryLength:query.length,stage:'readonly-cursor-installed'});
      } catch {
        search.cursor = native;
        fallback('find-edit', 'native-interface-error');
      }
    }
    record.cleanup = (reset = true) => {
      for (const restore of restores.reverse()) restore();
      if (!reset) return;
      try {
        if (kind === 'edit' && cursors.has(search.cursor)) record.nativeInput.call(search);
        if (kind === 'reading' && record.enhanced) {
          search.lastQuery = null;
          record.nativeUpdate.call(search);
          search.selectRange(0); search.updateCount();
        }
      } catch { fallback(`find-${kind}`, 'restore-interface-error'); }
    };
    try {
      if (kind === 'edit') {
        patch(search, 'onSearchInput', original => function (...args) {
          const returned = original.apply(this, args);
          enhanceEdit();
          return returned;
        }, restores);
        // The native input handler was bound during construction. Listen after
        // it as well as wrapping dynamic calls (show, document updates).
        search.searchInputEl.addEventListener('input', enhanceEdit);
        restores.push(() => search.searchInputEl.removeEventListener('input', enhanceEdit));
        for (const name of ['replaceAll','replaceCurrentMatch','findNextOrReplace']) {
          patch(search, name, original => function (...args) {
            if (cursors.has(this.cursor)) {
              if (this.isReplace) record.nativeInput.call(this);
              else return name === 'findNextOrReplace' ? this.findNext() : undefined;
            }
            return original.apply(this, args);
          }, restores);
        }
      } else {
        patch(search, 'updateQuery', original => function (...args) {
          if (!enabled()) return original.apply(this,args);
          const query = this.getQuery();
          const full = plugin.settings.fullCompatibility;
          const changed = record.query !== query || record.text !== this.renderer.lastText || record.full !== full;
          // Invalidate only when the query/document/mode changes. Unconditionally
          // invalidating here would make queueRender -> updateQuery loop forever.
          if (changed && record.enhanced) this.lastQuery = null;
          const returned = original.apply(this, args);
          if (!enabled() || !changed) return returned;
          record.query = query; record.text = this.renderer.lastText; record.full = full;
          record.enhanced = false;
          try {
            if (typeof query !== 'string') return returned;
            const expanded = plugin.expander.expandLiteral(query, {fullCompatibility:full});
            if (expanded.status === 'fallback') { fallback('find-reading',expanded.reason); return returned; }
            if (expanded.status !== 'expanded') return returned;
            const sections = [], all = [];
            for (const section of this.renderer.sections) {
              const nodes = [];
              const walker = section.el.ownerDocument.createTreeWalker(section.el, 4);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node.textContent ?? '');
              const native = (section.highlightRanges ?? []).map(range => [range.start,range.end]);
              const ranges = nonoverlapping(collectMatches(nodes.join(''), expanded.source, native))
                .map(([start,end]) => ({section,start,end,active:false}));
              sections.push([section,ranges]);
              all.push(...ranges);
            }
            for (const [section,ranges] of sections) section.highlightRanges = ranges.length ? ranges : null;
            this.highlightRanges = all;
            this.selectedRange = -1;
            this.searchInputEl.toggleClass('mod-no-match', all.length === 0);
            record.enhanced = true;
            this.renderer.queueRender();
            report('expanded', {surface:'find-reading',queryLength:query.length,matches:all.length});
          } catch {
            this.lastQuery = null;
            original.apply(this,args);
            fallback('find-reading','native-interface-error');
          }
          return returned;
        }, restores);
      }
      records.set(search, record);
      if (kind === 'edit' && search.isActive) search.onSearchInput();
      if (kind === 'reading') search.onSearchInput();
      report('attached', {surface:`find-${kind}`});
    } catch {
      record.cleanup(false);
      records.delete(search);
      fallback(`find-${kind}`, 'unsupported-interface');
    }
  }
  function scan() {
    if (!enabled() || scanning) return;
    scanning = true;
    try {
      const live = new Set(), liveModes = new Set();
      for (const {view} of workspace.getLeavesOfType('markdown')) {
        if (view?.getViewType?.() !== 'markdown') continue;
        for (const [mode,kind] of [[view.editMode,'edit'],[view.previewMode,'reading']]) {
          if (!mode) continue;
          liveModes.add(mode);
          if (!modes.has(mode) && typeof mode.showSearch === 'function') {
            const restores = [];
            patch(mode, 'showSearch', original => function (...args) {
              const returned = original.apply(this,args); scan(); return returned;
            }, restores);
            modes.set(mode, () => restores.forEach(restore => restore()));
          }
          if (mode.search) { live.add(mode.search); attach(mode.search,kind); }
        }
      }
      for (const [search,record] of records) if (!live.has(search)) { record.cleanup(false); records.delete(search); }
      for (const [mode,restore] of modes) if (!liveModes.has(mode)) { restore(); modes.delete(mode); }
    } catch { fallback('find','scan-interface-error'); }
    finally { scanning = false; }
  }
  // Only discover instances here; matching remains scoped to native Find.
  const stopWatching = watchDocuments(plugin,scan);
  return () => {
    if (disposed) return;
    disposed = true;
    stopWatching();
    for (const record of records.values()) record.cleanup();
    for (const restore of modes.values()) restore();
    records.clear(); modes.clear();
  };
}

module.exports = {collectMatches, createFindCursor, installFind};
