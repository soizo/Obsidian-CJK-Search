const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const sourcePath = path.resolve('src/main.js');
const data = require('../data/character-data.json');

function fixture({ table = data, ready = true, saved = {}, failSave = false, failLoad = false, language = 'en' } = {}) {
  const logs = [], notices = [], commands = [], rows = [], callbacks = new Map();
  let readyCallback, persisted = saved;
  class Component {
    constructor() { this.children = []; this.cleanups = []; }
    addChild(child) { this.children.push(child); return child; }
    removeChild(child) { child.unload(); this.children = this.children.filter(c => c !== child); }
    register(cleanup) { this.cleanups.push(cleanup); }
    registerEvent(event) { this.register(() => event.off()); }
    registerDomEvent(el, name, handler) { el.addEventListener(name, handler); this.register(() => el.removeEventListener(name,handler)); }
    unload() { for (const c of [...this.children]) this.removeChild(c); for (const fn of this.cleanups.splice(0).reverse()) fn(); this.onunload?.(); }
  }
  class Plugin extends Component {
    constructor(app) { super(); this.app = app; this.manifest = {version:'0.1.0'}; }
    async loadData() { if (failLoad) throw new Error('PRIVATE read path'); return persisted; }
    async saveData(value) { if (failSave) throw new Error('PRIVATE save path'); persisted = value; }
    addCommand(command) { const index=commands.findIndex(existing=>existing.id===command.id); if(index>=0) commands[index]=command; else commands.push(command); return command; }
    removeCommand(id) { const index=commands.findIndex(command=>command.id===id); if(index>=0) commands.splice(index,1); }
    addSettingTab(tab) { this.settingTab = tab; }
  }
  class PluginSettingTab {
    constructor(app, plugin) { this.app=app;this.plugin=plugin;this.containerEl={empty(){rows.length=0;},createEl(){}}; }
  }
  class Setting {
    constructor(){rows.push(this);}
    setName(value){this.name=value;return this;}
    setDesc(value){this.desc=value;return this;}
    setHeading(){this.heading=true;return this;}
    addDropdown(callback){
      const dropdown={addOptions(options){this.options=options;return this;},setValue(value){this.value=value;return this;},onChange(fn){this.change=fn;return this;},setDisabled(){return this;}};
      this.dropdown=dropdown;callback(dropdown);return this;
    }
    addToggle(callback){
      const toggle={setValue(value){this.value=value;return this;},onChange(fn){this.change=fn;return this;},setDisabled(){return this;}};
      this.toggle=toggle;callback(toggle);return this;
    }
  }
  const workspace = {
    leaves: [],
    on(name, callback) {
      if (!callbacks.has(name)) callbacks.set(name,new Set());
      callbacks.get(name).add(callback);
      return {off:()=>callbacks.get(name).delete(callback)};
    },
    offref(event) { event.off(); },
    onLayoutReady(callback) { readyCallback = callback; if (ready) callback(); },
    getLeavesOfType(type) { return type === 'search' ? this.leaves : []; },
    fireLayoutReady() { readyCallback(); },
    change() { for (const callback of callbacks.get('layout-change') ?? []) callback(); },
  };
  const app = {workspace};
  const api = {Plugin, Component, PluginSettingTab, Setting, Platform:{}, apiVersion:'1.13.7', getLanguage:()=>language,
    Notice:class { constructor(text) { notices.push(text); } }};
  const nativeRequire = createRequire(sourcePath);
  const context = { module:{exports:{}}, require: name => name === 'obsidian' ? api : name === '../data/character-data.json' ? table : nativeRequire(name),
    console:Object.fromEntries(['info','log','warn','error'].map(level => [level,(...args)=>logs.push(args.join(' '))])),
    performance, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(sourcePath,'utf8'), context, {filename:sourcePath});
  const plugin = new context.module.exports(app);
  function makeView() {
    const input = new EventTarget(); input.value = '体';
    class Query { constructor(_app, query, caseSensitive) { this.query = query; this.caseSensitive = caseSensitive; this.matcher = {match() {}}; this.requiredInputs = ['new']; } }
    const calls = [];
    const view = {app,searchComponent:{inputEl:input,getValue:()=>input.value},dom:{getMatchCount:()=>0},startSearch(){},
      renderSearchInfo(...args) { calls.push({self:this,args}); return 'original-result'; }};
    function search(text='体') {
      input.value = text;
      view.searchQuery = new Query(app,text,false);
      const oldMatcher = view.searchQuery.matcher;
      const value = view.renderSearchInfo(oldMatcher, 'container', 'extra');
      return {oldMatcher,value};
    }
    return {view,input,search,calls,Query};
  }
  return {plugin,workspace,logs,notices,commands,rows,makeView,listenerCount:name=>callbacks.get(name)?.size??0,get persisted(){return persisted;}};
}

test('per-entry choices default on, preserve old booleans and never write on load', async () => {
  for(const key of ['searchEnabled','findEnabled','quickSwitcherEnabled','graphEnabled','tagsEnabled','internalLinksEnabled']) {
    for(const [value,expected] of [[undefined,true],[false,false],[true,true],['false',true]]) {
      const saved={fullCompatibility:false,keep:'original',...(value===undefined?{}:{[key]:value})};
      const f=fixture({saved});await f.plugin.onload();
      assert.equal(f.plugin.settings[key],expected);assert.equal(f.plugin.settings.fullCompatibility,false);
      assert.equal(f.persisted,saved);f.plugin.unload();
    }
  }
});
test('advanced graph queries opt in without migrating old settings', async()=>{
  for(const [value,expected] of [[undefined,false],[null,false],['true',false],[true,true],[false,false]]) {
    const saved={keep:'unchanged',...(value===undefined?{}:{graphAdvancedQueries:value})};
    const f=fixture({saved});await f.plugin.onload();
    assert.equal(f.plugin.settings.graphAdvancedQueries,expected);assert.equal(f.persisted,saved);
    await f.plugin.setSetting('graphEnabled',false);await f.plugin.setSetting('graphAdvancedQueries',true);
    assert.equal(f.plugin.settings.graphEnabled,false);assert.equal(f.persisted.graphAdvancedQueries,true);
    assert.equal(f.persisted.keep,'unchanged');f.plugin.unload();
  }
});
test('entry controls restore native search, stay independent, and do not leak listeners on repeated toggles', async () => {
  const f=fixture();const v=f.makeView();f.workspace.leaves=[{view:v.view}];await f.plugin.onload();
  assert.equal(typeof f.plugin.setSetting,'function');
  await f.plugin.setSetting('searchEnabled',false);
  let result=v.search();assert.equal(v.view.searchQuery.matcher,result.oldMatcher);
  f.workspace.change();result=v.search();assert.equal(v.view.searchQuery.matcher,result.oldMatcher);
  assert.equal(f.plugin.settings.findEnabled,true);assert.equal(f.plugin.settings.quickSwitcherEnabled,true);
  await f.plugin.setSetting('searchEnabled',true);
  result=v.search();assert.notEqual(v.view.searchQuery.matcher,result.oldMatcher);
  const listeners=f.listenerCount('layout-change');
  for(let i=0;i<3;i++)for(const key of ['findEnabled','quickSwitcherEnabled','graphEnabled','tagsEnabled','internalLinksEnabled']) {
    await f.plugin.setSetting(key,false);await f.plugin.setSetting(key,true);
  }
  assert.equal(f.listenerCount('layout-change'),listeners,'Toggling must not accumulate workspace listeners');
  f.plugin.unload();
});
test('a retained foreign search wrapper cannot revive a retired enhancement after toggling', async () => {
  const f=fixture();const v=f.makeView();f.workspace.leaves=[{view:v.view}];await f.plugin.onload();
  assert.equal(typeof f.plugin.setSetting,'function');
  const old=f.plugin.patched.get(v.view),wrapped=v.view.renderSearchInfo;
  v.view.renderSearchInfo=function(...args){return wrapped.apply(this,args);};
  await f.plugin.setSetting('searchEnabled',false);await f.plugin.setSetting('searchEnabled',true);
  v.search();assert.equal(old.counts.compiled,0);assert.equal(f.plugin.patched.get(v.view).counts.compiled,1);
  f.plugin.unload();
});

test('concurrent setting writes preserve each choice and failures leave active behavior unchanged', async () => {
  const f=fixture({saved:{keep:'original'}});await f.plugin.onload();
  assert.equal(typeof f.plugin.setSetting,'function');
  await Promise.all([f.plugin.setSetting('searchEnabled',false),f.plugin.setSetting('findEnabled',false)]);
  assert.equal(f.persisted.searchEnabled,false);assert.equal(f.persisted.findEnabled,false);assert.equal(f.persisted.keep,'original');
  await assert.rejects(()=>f.plugin.setSetting('unknown',true));await assert.rejects(()=>f.plugin.setSetting('findEnabled','false'));
  const bad=fixture({failSave:true});await bad.plugin.onload();
  await assert.rejects(()=>bad.plugin.setSetting('findEnabled',false));assert.equal(bad.plugin.settings.findEnabled,true);
  f.plugin.unload();bad.plugin.unload();
});
test('settings expose eight usable English controls, rollback failed changes and load quietly', async () => {
  const f=fixture({failSave:true});await f.plugin.onload();
  assert.equal(f.notices.length,0,'Successful loading must not display a developer notification');
  f.plugin.settingTab.display();const controls=f.rows.filter(row=>row.toggle);
  assert.equal(controls.length,8);assert(controls.every(row=>typeof row.toggle.change==='function'));
  assert(!/[\u3400-\u9fff]/u.test(f.rows.map(row=>row.name+' '+row.desc).join(' ')+' '+f.commands.map(c=>c.name).join(' ')));
  controls[0].toggle.setValue(false);await controls[0].toggle.change(false);
  assert.equal(controls[0].toggle.value,true);assert.equal(f.plugin.settings.searchEnabled,true);
  f.plugin.unload();
});

test('language follows the host without writes; explicit overrides persist and update UI, command and notices', async () => {
  const saved={keep:'original',findEnabled:false};
  const f=fixture({saved,language:'zh'});await f.plugin.onload();
  assert.equal(f.plugin.settings.language,'auto');assert.equal(f.persisted,saved);
  f.plugin.settingTab.display();
  assert(f.rows.some(row=>row.name==='搜索增强'));
  const languageRow=f.rows.find(row=>row.dropdown);
  assert.equal(Object.keys(languageRow.dropdown.options).length,10);
  await languageRow.dropdown.change('ja');
  assert.equal(f.persisted.language,'ja');assert.equal(f.persisted.keep,'original');
  assert.equal(f.plugin.settings.findEnabled,false);
  assert(f.rows.some(row=>row.name==='検索の拡張'));
  assert.equal(f.commands.length,1);assert.equal(f.commands[0].id,'print-diagnostics');
  assert.equal(f.commands[0].name,'診断情報を出力');
  f.commands[0].callback();assert.match(f.notices.at(-1),/診断情報/);
  await Promise.all([f.plugin.setSetting('language','ko-KP'),f.plugin.setSetting('searchEnabled',false)]);
  assert.equal(f.persisted.language,'ko-KP');assert.equal(f.persisted.searchEnabled,false);
  assert.equal(f.commands.length,1);
  f.plugin.unload();await f.plugin.onload();f.plugin.settingTab.display();
  assert(f.rows.some(row=>row.name==='검색 개선'));assert.equal(f.plugin.settings.language,'ko-KP');
  for(const value of ['invalid','__proto__',true,null,{}]) await assert.rejects(()=>f.plugin.setSetting('language',value));
  await f.plugin.setSetting('language','auto');f.plugin.settingTab.display();
  assert(f.rows.some(row=>row.name==='搜索增强'));f.plugin.unload();
});
test('failed language writes keep the previous UI, command and persisted settings', async () => {
  const saved={language:'ja',keep:1};const f=fixture({saved,failSave:true});await f.plugin.onload();
  f.plugin.settingTab.display();const dropdown=f.rows.find(row=>row.dropdown)?.dropdown;
  assert(dropdown,'Language dropdown must exist');
  dropdown.setValue('vi');await dropdown.change('vi');
  assert.equal(dropdown.value,'ja');assert.equal(f.plugin.settings.language,'ja');assert.equal(f.persisted,saved);
  assert.equal(f.commands[0].name,'診断情報を出力');assert.match(f.notices.at(-1),/保存/);
  f.plugin.unload();
});
test('invalid saved languages safely follow the host; load failures localise before settings are available', async () => {
  for(const language of [false,{},'constructor','invalid',null]) {
    const saved={language};const f=fixture({saved,language:'vi'});await f.plugin.onload();
    assert.equal(f.plugin.settings.language,'auto');assert.equal(f.persisted,saved);
    f.plugin.settingTab.display();assert(f.rows.some(row=>row.name==='Tăng cường tìm kiếm'));f.plugin.unload();
  }
  const f=fixture({failLoad:true,language:'zh'});await f.plugin.onload();
  assert.match(f.notices[0],/无法加载设置/);f.plugin.unload();
});
test('routine lifecycle and searches stay quiet; explicit diagnostics still report counters', async () => {
  const f = fixture(), v = f.makeView();
  f.workspace.leaves = [{view:v.view}];
  await f.plugin.onload();
  f.workspace.change();
  v.input.dispatchEvent(new Event('input'));
  v.search('体');
  v.search('path:a 体');
  await f.plugin.setFullCompatibility(false);
  assert.deepEqual(f.logs, [], 'Normal operation must not write debug logs');
  f.commands.find(command => command.id === 'print-diagnostics').callback();
  assert.equal(f.logs.length, 1);
  const diagnostic = JSON.parse(f.logs[0].slice(f.logs[0].indexOf('{')));
  assert.equal(diagnostic.views[0].counters.inputs, 1);
  assert.equal(diagnostic.views[0].counters.expanded, 1);
  assert.equal(diagnostic.views[0].counters.skipped, 1);
  assert.equal(diagnostic.fullCompatibility, false);
  f.plugin.unload();
  assert.equal(f.logs.length, 1, 'Unloading must not write debug logs');
});

test('hook preserves input, query, this, args and return; attaches once and unloads safely', async () => {
  const f = fixture(); const v = f.makeView(); f.workspace.leaves = [{view:v.view}];
  const original = v.view.renderSearchInfo;
  await f.plugin.onload();
  const wrapper = v.view.renderSearchInfo;
  f.workspace.change(); assert.equal(v.view.renderSearchInfo,wrapper);
  const searched = v.search();
  assert.equal(searched.value,'original-result');
  assert.equal(v.calls[0].self,v.view);
  assert.deepEqual(v.calls[0].args,[searched.oldMatcher,'container','extra']);
  assert.notEqual(v.view.searchQuery.matcher,searched.oldMatcher);
  assert.equal(v.view.searchQuery.query,'体'); assert.equal(v.input.value,'体');
  v.input.dispatchEvent(new Event('input'));
  const record = f.plugin.patched.get(v.view);
  assert.equal(record.counts.inputs, 1);
  f.plugin.unload(); assert.equal(v.view.renderSearchInfo,original);
  assert.equal(record.restored, true);
  const count = f.logs.length;
  v.input.dispatchEvent(new Event('input'));
  f.workspace.fireLayoutReady(); assert.equal(v.view.renderSearchInfo,original);
  assert.equal(f.logs.length,count);
  assert.equal(record.counts.inputs, 1, 'Unload must remove the input listener');
});
test('late and removed panels and foreign hook ownership', async () => {
  const f = fixture({ready:false}); await f.plugin.onload();
  const v = f.makeView(), original = v.view.renderSearchInfo;
  f.workspace.leaves = [{view:v.view}]; f.workspace.fireLayoutReady();
  assert.notEqual(v.view.renderSearchInfo,original);
  f.workspace.leaves = []; f.workspace.change();
  assert.equal(v.view.renderSearchInfo,original); assert.equal(f.plugin.patched.size,0);
  f.workspace.leaves = [{view:v.view}]; f.workspace.change();
  const foreign = function(){}; v.view.renderSearchInfo = foreign;
  f.plugin.unload(); assert.equal(v.view.renderSearchInfo,foreign);
});
test('unloading before layout-ready cannot resurrect a hook', async () => {
  const f = fixture({ready:false}); const v = f.makeView(), original = v.view.renderSearchInfo;
  f.workspace.leaves = [{view:v.view}]; await f.plugin.onload(); f.plugin.unload(); f.workspace.fireLayoutReady();
  assert.equal(v.view.renderSearchInfo,original);
});
test('constructor failure restores original search and never logs private errors', async () => {
  const f = fixture(); const v = f.makeView(); f.workspace.leaves = [{view:v.view}]; await f.plugin.onload();
  v.view.searchQuery = new v.Query({},'体',false);
  const q = v.view.searchQuery, oldMatcher = q.matcher, oldInputs = q.requiredInputs;
  q.constructor = class { constructor() { throw new Error('PRIVATE_QUERY_SENTINEL'); } };
  assert.equal(v.view.renderSearchInfo(oldMatcher),'original-result');
  assert.equal(q.matcher,oldMatcher); assert.equal(q.requiredInputs,oldInputs);
  assert(f.logs.some(line=>line.includes('native-fallback')));
  v.search('PRIVATEQUERYSENTINELxyz');
  f.plugin.printDiagnostics();
  assert(!f.logs.join('\n').includes('PRIVATE'));
  f.plugin.unload();
});
test('bad data and incompatible views remain native; diagnostic missing fields are safe', async () => {
  for (const table of [null, {...data,modes:{eastAsian:null,full:null}}, {...data,schema:99}, data]) {
    const f = fixture({table}); const view = {renderSearchInfo:null,dom:{getMatchCount:17}};
    f.workspace.leaves = [{view}]; await f.plugin.onload();
    assert.doesNotThrow(()=>f.plugin.printDiagnostics());
    assert.equal(view.renderSearchInfo,null);
    assert(f.notices.length>0); f.plugin.unload();
  }
});
test('default-on preserves saved boolean choices and never writes settings during loading', async () => {
  for (const [mode,expected] of [[undefined,true],[true,true],[false,false],['false',true],[null,true]]) {
    const saved = {keep:'original',...(mode === undefined ? {} : {fullCompatibility:mode})};
    const f = fixture({saved}); await f.plugin.onload();
    assert.equal(f.plugin.settings.fullCompatibility,expected);
    assert.equal(f.persisted,saved); assert.equal(f.persisted.keep,'original');
    f.plugin.unload();
  }
  const saved = {fullCompatibility:false,keep:'original'};
  const failed = fixture({saved,failLoad:true}); await failed.plugin.onload();
  assert.equal(failed.plugin.settings.fullCompatibility,true);
  assert.equal(failed.persisted,saved);
  assert(!failed.logs.join('\n').includes('PRIVATE')); failed.plugin.unload();
});
test('settings persist without destroying unrelated values; failed saves preserve current mode', async () => {
  const f = fixture({saved:{fullCompatibility:'true',keep:'unchanged'}}); await f.plugin.onload();
  assert.equal(f.plugin.settings.fullCompatibility,true);
  await f.plugin.setFullCompatibility(true);
  assert.equal(f.persisted.fullCompatibility,true); assert.equal(f.persisted.keep,'unchanged');
  f.plugin.unload(); await f.plugin.onload(); assert.equal(f.plugin.settings.fullCompatibility,true);
  await f.plugin.setFullCompatibility(false); assert.equal(f.persisted.fullCompatibility,false);
  const bad = fixture({failSave:true}); await bad.plugin.onload();
  await assert.rejects(()=>bad.plugin.setFullCompatibility(false));
  assert.equal(bad.plugin.settings.fullCompatibility,true);
  assert(!bad.logs.join('\n').includes('PRIVATE'));
  f.plugin.unload(); bad.plugin.unload();
});
