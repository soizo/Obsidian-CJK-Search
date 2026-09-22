'use strict';
const { Plugin, Component, Notice, PluginSettingTab, Setting, Platform, apiVersion,
  prepareFuzzySearch, prepareSimpleSearch, parseFrontMatterAliases, getLanguage } = require('obsidian');
const { createExpander } = require('./matcher.js');
const { installFind } = require('./find.js');
const { installOpenFile } = require('./open-file.js');
const { installGraph } = require('./graph.js');
const { installEditorSuggestions } = require('./editor-suggest.js');
const data = require('../data/character-data.json');
const { localeIds, getStrings } = require('./strings.js');
const DEFAULT_SETTINGS = {language:'auto', searchEnabled:true, findEnabled:true, quickSwitcherEnabled:true, graphEnabled:true, graphAdvancedQueries:false, tagsEnabled:true, internalLinksEnabled:true, fullCompatibility:true};
const build = 'editor-suggestions-0.5.0';

function log(event, details = {}, level = 'info') {
  console[level](`[CJK-Probe] ${event} ${JSON.stringify({ time: new Date().toISOString(), ...details })}`);
}
log('module-evaluated', { build });

class CompatibilitySettings extends PluginSettingTab {
  display() {
    this.containerEl.empty();
    const text = this.plugin.getText();
    new Setting(this.containerEl).setName(text.enhancements).setDesc(text.introduction).setHeading();
    new Setting(this.containerEl).setName(text.language.name).setDesc(text.language.description)
      .addDropdown(dropdown => dropdown.addOptions(text.language.options).setValue(this.plugin.settings.language).onChange(async value => {
        dropdown.setDisabled(true);
        try { await this.plugin.setSetting('language', value); }
        catch { dropdown.setValue(this.plugin.settings.language); }
        finally { dropdown.setDisabled(false); }
      }));
    for (const [key, core] of [['searchEnabled','global-search'],['findEnabled',null],['quickSwitcherEnabled','switcher'],['graphEnabled','graph'],['graphAdvancedQueries',null],['tagsEnabled',null],['internalLinksEnabled',null],['fullCompatibility',null]]) {
      if (key === 'fullCompatibility') new Setting(this.containerEl).setName(text.matching).setHeading();
      const copy = text.settings[key];
      const unavailable = core && !this.app.internalPlugins?.getEnabledPluginById?.(core);
      new Setting(this.containerEl).setName(copy.name)
        .setDesc(unavailable ? copy.unavailable : copy.description)
        .addToggle(toggle => toggle.setValue(this.plugin.settings[key]).onChange(async value => {
          toggle.setDisabled(true);
          try { await this.plugin.setSetting(key,value); }
          catch { toggle.setValue(this.plugin.settings[key]); }
          finally { toggle.setDisabled(false); }
        }));
    }
    this.containerEl.createEl('p',{text:text.nextSearch,cls:'setting-item-description'});
  }
}

module.exports = class CjkSearchPlugin extends Plugin {
  async onload() {
    this.active = true;
    this.patched = new Map();
    this.warned = new Set();
    this.nextViewId = 1;
    this.settings = {...DEFAULT_SETTINGS};
    this.text = getStrings('auto', getLanguage());
    this.diagnosticsCommand = null;
    this.settingWrites = Promise.resolve();
    this.surfaceEvents = {};
    this.savedSettings = {};
    try {
      const saved = await this.loadData();
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.savedSettings = saved;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const value = this.savedSettings[key];
        if (key === 'language') {
          if (value === 'auto' || localeIds.includes(value)) this.settings[key] = value;
          else if (value !== undefined) log('settings-invalid', {setting:key, action:'using-default-mode'}, 'warn');
        } else if (typeof value === 'boolean') this.settings[key] = value;
        else if (value !== undefined) log('settings-invalid', {setting:key, action:'using-default-mode'}, 'warn');
      }
    this.refreshText();
    } catch {
      log('settings-load-failed', { action: 'using-default-mode' }, 'warn');
      this.warn('settings-load-failed', this.getText().errors.settingsLoad);
    }
    if (!this.active) return;
    const started = performance.now();
    try { this.expander = createExpander(data); }
    catch {
      this.expander = null;
      log('data-invalid', { action: 'native-search-unchanged' }, 'error');
      this.warn('data-invalid', this.getText().errors.dataInvalid);
    }
    log('loaded', { build, version: this.manifest.version, obsidianApi: apiVersion,
      platform: Platform.isIosApp ? 'ios' : Platform.isAndroidApp ? 'android' : 'desktop',
      unicodeVersion: data?.unicodeVersion, openccVersion: data?.openccVersion,
      characters: Object.fromEntries(Object.entries(data?.modes ?? {}).map(([mode, value]) => [mode, value?.entries?.length ?? 0])),
      dataReady: !!this.expander, fullCompatibility: this.settings.fullCompatibility,
      dataInitMs: +(performance.now() - started).toFixed(2), rawQueryLogging: false });
    this.diagnosticsCommand = this.addCommand({ id: 'print-diagnostics', name: this.getText().diagnostics, callback: () => {
      this.printDiagnostics(); new Notice(this.getText().diagnosticsPrinted);
    } });
    this.addSettingTab(new CompatibilitySettings(this.app, this));
    this.reportSurface = (event, details, level) => {
      this.surfaceEvents[details.surface] = { event, ...details };
      log(event, details, level);
    };
    this.updateEnhancement('findEnabled');
    this.updateEnhancement('quickSwitcherEnabled');
    this.updateEnhancement('graphEnabled');
    this.updateEnhancement('tagsEnabled');
    this.register(() => this.stopEditorSuggestions?.());
    this.register(() => this.graphController?.dispose());
    this.register(() => this.stopFind?.());
    this.register(() => this.stopQuickSwitcher?.());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.attachViews('layout-change')));
    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      log('layout-ready'); this.attachViews('layout-ready');
    });
  }

  onunload() {
    this.active = false;
    if (!this.patched) return;
    let restored = 0;
    for (const record of this.patched.values()) {
      this.removeChild(record.component);
      if (record.restored) restored++;
    }
    log('unloaded', { restoredViews: restored, totalPatchedViews: this.patched.size });
    this.patched.clear();
  }

  warn(reason, message) {
    if (this.warned.has(reason)) return;
    this.warned.add(reason);
    new Notice(`CJK Search: ${message}`, 8000);
  }

  setFullCompatibility(enabled) { return this.setSetting('fullCompatibility',enabled); }

  async setSetting(key, enabled) {
    if (key === 'language') {
      if (typeof enabled !== 'string' || (enabled !== 'auto' && !localeIds.includes(enabled))) throw new TypeError('Unsupported language');
    } else if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS,key) || typeof enabled !== 'boolean') throw new TypeError('Unsupported setting');
    // Serialize disk writes so quickly changing different toggles loses no choice.
    const operation = this.settingWrites.then(async () => {
      const next = {...this.savedSettings,[key]:enabled};
      try { await this.saveData(next); }
      catch {
        log('settings-save-failed', {setting:key}, 'error');
        new Notice(this.getText().errors.settingsSave);
        throw new Error('settings-save-failed');
      }
      this.savedSettings = next;
      this.settings[key] = enabled;
      if (key === 'language') {
        this.refreshText();
        this.settingTab?.display?.();
      }
      if (this.active) this.updateEnhancement(key);
      log('settings-changed', {setting:key,enabled,applies:'next-query'});
    });
    this.settingWrites = operation.catch(() => {});
    return operation;
  }

  updateEnhancement(key) {
    try {
      if (key === 'findEnabled') {
        this.stopFind?.();
        this.stopFind = this.settings.findEnabled ? installFind(this,this.reportSurface) : null;
      } else if (key === 'quickSwitcherEnabled') {
        this.stopQuickSwitcher?.();
        this.stopQuickSwitcher = this.settings.quickSwitcherEnabled
          ? installOpenFile(this,this.reportSurface,{prepareFuzzySearch,prepareSimpleSearch,parseFrontMatterAliases}) : null;
      } else if (key === 'tagsEnabled' || key === 'internalLinksEnabled') {
        this.stopEditorSuggestions?.();
        this.stopEditorSuggestions = this.settings.tagsEnabled || this.settings.internalLinksEnabled
          ? installEditorSuggestions(this,this.reportSurface,{prepareFuzzySearch,prepareSimpleSearch}) : null;
      } else if (key === 'graphEnabled') {
        this.graphController?.dispose();
        this.graphController = this.settings.graphEnabled ? installGraph(this,this.reportSurface) : null;
      } else if (key === 'graphAdvancedQueries' || key === 'fullCompatibility') {
        this.graphController?.refresh();
      } else if (key === 'searchEnabled') {
        if (this.settings.searchEnabled) this.attachViews('settings-changed');
        else {
          for (const record of this.patched.values()) this.removeChild(record.component);
          this.patched.clear();
        }
      }
    } catch {
      log('native-fallback',{surface:'settings',reason:'update-interface-error'},'warn');
      new Notice(this.getText().errors.enhancementUpdate);
    }
  }

  getText() { return this.text; }

  refreshText() {
    this.text = getStrings(this.settings.language, getLanguage());
    if (this.diagnosticsCommand) this.diagnosticsCommand.name = this.text.diagnostics;
  }

  printDiagnostics() {
    const leaves = this.app.workspace.getLeavesOfType('search');
    log('diagnostics', { build, version: this.manifest.version, obsidianApi: apiVersion,
      unicodeVersion: data?.unicodeVersion, openccVersion: data?.openccVersion,
      dataReady: !!this.expander, fullCompatibility: this.settings.fullCompatibility,
      enhancements: {search:this.settings.searchEnabled,find:this.settings.findEnabled,quickSwitcher:this.settings.quickSwitcherEnabled,graph:this.settings.graphEnabled,graphAdvancedQueries:this.settings.graphAdvancedQueries,tags:this.settings.tagsEnabled,internalLinks:this.settings.internalLinksEnabled},
      searchViews: leaves.length, rawQueryLogging: false, lastSurfaceEvents: this.surfaceEvents,
      views: leaves.map(({ view }) => {
        const record = this.patched.get(view);
        return { view: record?.id ?? null, attached: !!record,
          hookStillOwned: !!record && view.renderSearchInfo === record.wrapper,
          hasRenderSearchInfo: typeof view.renderSearchInfo === 'function',
          hasStartSearch: typeof view.startSearch === 'function', hasInput: !!view.searchComponent?.inputEl,
          queryLength: view.searchComponent?.inputEl?.value?.length ?? null,
          nativeMatchCountSnapshot: typeof view.dom?.getMatchCount === 'function' ? view.dom.getMatchCount() : null,
          counters: record?.counts ?? null, lastOutcome: record?.lastOutcome ?? 'not-attached' };
      }) });
  }

  attachViews(reason) {
    if (!this.active || !this.expander || !this.settings.searchEnabled) return;
    const leaves = this.app.workspace.getLeavesOfType('search');
    const liveViews = new Set(leaves.map(leaf => leaf.view));
    for (const [view, record] of this.patched) {
      if (!liveViews.has(view)) { this.removeChild(record.component); this.patched.delete(view); }
    }
    log('scan-views', { reason, found: leaves.length, previouslyPatched: this.patched.size });
    if (!leaves.length) log('waiting-for-search', { action: 'Open native global search (Cmd/Ctrl+Shift+F)' });
    for (const { view } of leaves) {
      if (this.patched.has(view)) continue;
      const original = view.renderSearchInfo;
      if (typeof original !== 'function') {
        log('incompatible-view', { missing: 'renderSearchInfo', action: 'native-search-unchanged' }, 'warn');
        this.warn('incompatible-view', this.getText().errors.incompatible);
        continue;
      }
      const component = this.addChild(new Component());
      const record = { id: this.nextViewId++, original, component, wrapper: null,
        counts: { inputs: 0, compiled: 0, expanded: 0, skipped: 0, fallbacks: 0 }, lastOutcome: 'attached-awaiting-query' };
      const input = view.searchComponent?.inputEl;
      if (input) {
        component.registerDomEvent(input, 'input', event => {
          record.counts.inputs++;
          log('input', { view: record.id, queryLength: input.value.length, composing: !!event.isComposing });
        });
        for (const event of ['compositionstart', 'compositionend'])
          component.registerDomEvent(input, event, () => log(event, { view: record.id, queryLength: input.value.length }));
      }
      const plugin = this;
      const wrapper = function (...args) {
        const query = this.searchQuery;
        if (plugin.active && !record.disposed && plugin.settings.searchEnabled && query?.matcher === args[0] && typeof query.query === 'string') {
          const started = performance.now();
          const oldMatcher = query.matcher, oldInputs = query.requiredInputs;
          record.counts.compiled++;
          try {
            const expanded = plugin.expander.expand(query.query, {
              fullCompatibility: plugin.settings.fullCompatibility, caseSensitive: !!query.caseSensitive });
            record.lastOutcome = expanded.reason;
            if (expanded.status === 'expanded') {
              if (Object.isFrozen(query)) throw new Error('Readonly query');
              const replacement = new query.constructor(this.app, `/${expanded.source}/`, query.caseSensitive);
              if (!replacement.matcher || typeof replacement.matcher.match !== 'function') throw new Error('Native matcher unavailable');
              query.matcher = replacement.matcher;
              query.requiredInputs = replacement.requiredInputs;
              record.counts.expanded++;
              record.lastOutcome = 'matcher-expanded';
              log('expanded', { view: record.id, queryLength: query.query.length,
                internalQueryLength: expanded.source.length + 2,
                inputStillOriginal: this.searchComponent?.getValue?.() === query.query,
                fullCompatibility: plugin.settings.fullCompatibility,
                expandMs: +(performance.now() - started).toFixed(2), nodes: expanded.nodes,
                stage: 'matcher-installed-before-native-scan' });
            } else if (expanded.status === 'fallback') {
              record.counts.fallbacks++;
              log('native-fallback', { view: record.id, reason: expanded.reason, nodes: expanded.nodes }, 'warn');
              plugin.warn(expanded.reason, plugin.getText().errors.limit);
            } else {
              record.counts.skipped++;
              log('skipped', { view: record.id, reason: expanded.reason, queryLength: query.query.length });
            }
          } catch {
            // Construct before assignment; roll back only fields actually changed.
            if (query.matcher !== oldMatcher) query.matcher = oldMatcher;
            if (query.requiredInputs !== oldInputs) query.requiredInputs = oldInputs;
            record.counts.fallbacks++;
            record.lastOutcome = 'native-fallback';
            log('native-fallback', { view: record.id, stage: 'compile-matcher', reason: 'native-interface-error' }, 'error');
            plugin.warn('native-interface-error', plugin.getText().errors.nativeInterface);
          }
        }
        return original.apply(this, args);
      };
      record.wrapper = wrapper;
      view.renderSearchInfo = wrapper;
      component.register(() => {
        record.disposed = true;
        if (view.renderSearchInfo === wrapper) { view.renderSearchInfo = original; record.restored = true; }
      });
      this.patched.set(view, record);
      log('attached', { view: record.id, hasInput: !!input, currentQueryLength: input?.value?.length ?? null });
    }
  }
};
