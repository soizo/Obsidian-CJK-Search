// THROWAWAY: tests one native-search hook with four tiny character groups.
// Not a production query parser or complete Unicode/OpenCC implementation.
const { Plugin, Notice, Platform, apiVersion } = require('obsidian');
const groups = ['体體', '真眞', '人⼈', '、､﹑'];
const unsupportedSyntax = /[\s/()[\]{}:"\\]|^-/;
const build = 'probe-0.0.2-logs';

// Local console only. Never include raw queries, note content, paths or errors
// whose messages might contain a query. JSON snapshots are easy to copy.
function log(event, details = {}, level = 'info') {
  console[level](`[CJK-Probe] ${event} ${JSON.stringify({ time: new Date().toISOString(), ...details })}`);
}
log('module-evaluated', { build });

function expandLiteral(query) {
  // ponytail: plain literals only; real query syntax needs a separate design.
  if (!query || unsupportedSyntax.test(query)) return query;
  let changed = false;
  const pattern = Array.from(query, character => {
    const group = groups.find(value => value.includes(character));
    if (group) { changed = true; return `[${group}]`; }
    return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return changed ? `/${pattern}/` : query;
}

module.exports = class NativeSearchProbe extends Plugin {
  onload() {
    this.patched = new Map();
    this.nextViewId = 1;
    log('loaded', {
      build, version: this.manifest.version, obsidianApi: apiVersion,
      platform: Platform.isIosApp ? 'ios' : Platform.isAndroidApp ? 'android' : 'desktop',
      supportedGroups: groups, plainLiteralsOnly: true, rawQueryLogging: false,
    });
    new Notice(`CJK 探针 ${this.manifest.version} 已加载（仅四组样例）。Console 筛选 [CJK-Probe]；命令面板可「打印诊断状态」。`, 8000);
    this.addCommand({ id: 'print-diagnostics', name: '打印诊断状态', callback: () => {
      this.printDiagnostics();
      new Notice('CJK 诊断已输出到 Console；筛选 [CJK-Probe]。');
    } });
    this.registerEvent(this.app.workspace.on('layout-change', () => this.attachViews('layout-change')));
    this.app.workspace.onLayoutReady(() => {
      log('layout-ready');
      this.attachViews('layout-ready');
    });
    this.register(() => {
      let restored = 0;
      for (const [view, { original, wrapper }] of this.patched) {
        if (view.renderSearchInfo === wrapper) { view.renderSearchInfo = original; restored++; }
      }
      log('unloaded', { restoredViews: restored, totalPatchedViews: this.patched.size });
      this.patched.clear();
    });
  }

  printDiagnostics() {
    const leaves = this.app.workspace.getLeavesOfType('search');
    log('diagnostics', {
      build, version: this.manifest.version, obsidianApi: apiVersion,
      searchViews: leaves.length, rawQueryLogging: false,
      views: leaves.map(({ view }) => {
        const record = this.patched.get(view);
        return {
          view: record?.id ?? null, attached: !!record,
          hookStillOwned: !!record && view.renderSearchInfo === record.wrapper,
          hasRenderSearchInfo: typeof view.renderSearchInfo === 'function',
          hasStartSearch: typeof view.startSearch === 'function',
          hasInput: !!view.searchComponent?.inputEl,
          queryLength: view.searchComponent?.inputEl?.value.length ?? null,
          nativeMatchCountSnapshot: view.dom?.getMatchCount?.() ?? null,
          counters: record?.counts ?? null, lastOutcome: record?.lastOutcome ?? 'not-attached',
        };
      }),
    });
  }

  attachViews(reason) {
    const leaves = this.app.workspace.getLeavesOfType('search');
    log('scan-views', { reason, found: leaves.length, previouslyPatched: this.patched.size });
    if (!leaves.length) log('waiting-for-search', { action: 'Open native global search (Cmd/Ctrl+Shift+F)' });
    for (const leaf of leaves) {
      const view = leaf.view;
      if (this.patched.has(view)) continue;
      const original = view.renderSearchInfo;
      if (typeof original !== 'function') {
        log('incompatible-view', { missing: 'renderSearchInfo', action: 'Keep native search' }, 'warn');
        new Notice('CJK 探针：搜索接口不兼容，已保留原生搜索。请打印诊断状态。');
        continue;
      }
      const record = { id: this.nextViewId++, original, wrapper: null, counts: { inputs: 0, compiled: 0, expanded: 0, skipped: 0, fallbacks: 0 }, lastOutcome: 'attached-awaiting-query' };
      const input = view.searchComponent?.inputEl;
      if (input) {
        this.registerDomEvent(input, 'input', event => {
          record.counts.inputs++;
          log('input', { view: record.id, queryLength: input.value.length, composing: !!event.isComposing });
        });
        for (const eventName of ['compositionstart', 'compositionend']) {
          this.registerDomEvent(input, eventName, () => log(eventName, { view: record.id, queryLength: input.value.length }));
        }
      }
      const wrapper = function (matcher, container) {
        const query = this.searchQuery;
        // Native rendering recurses; only intercept the top-level matcher.
        if (query && query.matcher === matcher && typeof query.query === 'string') {
          record.counts.compiled++;
          const expanded = expandLiteral(query.query);
          if (expanded === query.query) {
            const reason = !query.query ? 'empty-query' : unsupportedSyntax.test(query.query) ? 'unsupported-syntax' : 'no-sample-mapping';
            record.counts.skipped++;
            record.lastOutcome = reason;
            log('skipped', { view: record.id, reason, queryLength: query.query.length });
          } else {
            try {
              const replacement = new query.constructor(this.app, expanded, query.caseSensitive);
              if (!replacement.matcher || typeof replacement.matcher.match !== 'function') {
                throw new Error('Native matcher unavailable');
              }
              // Keep query.query and the input untouched. The original scan
              // still owns file reading, match offsets, cancellation and UI.
              query.matcher = replacement.matcher;
              query.requiredInputs = replacement.requiredInputs;
              record.counts.expanded++;
              record.lastOutcome = 'matcher-expanded';
              log('expanded', {
                view: record.id, queryLength: query.query.length, internalQueryLength: expanded.length,
                inputStillOriginal: this.searchComponent?.getValue?.() === query.query,
                stage: 'matcher-installed-before-native-scan',
              });
            } catch (error) {
              record.counts.fallbacks++;
              record.lastOutcome = 'native-fallback';
              log('native-fallback', { view: record.id, stage: 'compile-matcher', errorType: error?.constructor?.name || 'Error' }, 'error');
            }
          }
        }
        // Explain the original input tree; don't recurse over the replacement.
        return original.call(this, matcher, container);
      };
      record.wrapper = wrapper;
      this.patched.set(view, record);
      view.renderSearchInfo = wrapper;
      log('attached', { view: record.id, hasInput: !!input, currentQueryLength: input?.value.length ?? null });
    }
  }
};
