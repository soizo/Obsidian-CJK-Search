const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const open = fs.existsSync(path.resolve('src/open-file.js')) ? require('../src/open-file.js') : {};
const expander = require('../src/matcher.js').createExpander(require('../data/character-data.json'));

function fixture() {
  const files = ['體育研究.md','档案/繁體说明.md','①.md','ﬃ.md','體.png','體.pdf','體.xyz'].map(path=>Object.freeze({path,extension:path.split('.').pop()}));
  const calls = [], ignored = new Set();
  // This double checks argument/range/score plumbing only. Native fuzzy scoring
  // and actual modal rendering are tested separately in the real-app harness.
  const prepare = kind => query => text => {
    calls.push({kind,query,text});
    if (query==='体研' && text==='体育研究') return {score:7,matches:[[0,1],[2,3]]};
    const start = text.indexOf(query);
    return start<0 ? null : {score:10,matches:[[start,start+query.length]]};
  };
  const api = {prepareFuzzySearch:prepare('fuzzy'),prepareSimpleSearch:prepare('simple'),
    parseFrontMatterAliases:frontmatter=>frontmatter?.aliases ?? null};
  const app = {vault:{getFiles:()=>files}, viewRegistry:{isExtensionRegistered:ext=>['md','pdf','png'].includes(ext)},
    metadataCache:{isUserIgnored:p=>ignored.has(p),getFileCache:file=>file===files[1]?{frontmatter:{aliases:['髮型指南','发型说明']}}:null}};
  const modal = {app,context:'view',shouldShowMarkdown:true,shouldShowNonAttachments:true,
    shouldShowAlias:true,shouldShowNonImageAttachments:false,shouldShowImages:false,shouldShowAllTypes:false};
  return {files,modal,api,calls,ignored};
}

test('Open file attaches after bound native opening, falls back whole, and preserves later hooks', () => {
  assert.equal(typeof open.installOpenFile,'function');
  const f = fixture(), doc = new EventTarget(), logs = [];
  const native = () => [];
  const core = {activeModal:null,onOpen(){this.activeModal={...f.modal,inputEl:{value:'体'},getSuggestions:native,onClose(){}};}};
  const boundOpen = core.onOpen.bind(core);
  const callbacks = new Map();
  f.modal.app.internalPlugins = {getEnabledPluginById:()=>core};
  f.modal.app.workspace = {containerEl:{ownerDocument:doc},on(name,callback){callbacks.set(name,callback);return {name};}};
  const plugin = {app:f.modal.app,active:true,expander,settings:{fullCompatibility:false},registerEvent(){}};
  const dispose = open.installOpenFile(plugin,(event,details)=>logs.push({event,...details}),f.api);
  boundOpen(); doc.dispatchEvent(new Event('focusin'));
  const modal = core.activeModal;
  assert(modal.getSuggestions('体').some(row=>row.file===f.files[0]));
  assert.equal(modal.inputEl.value,'体');
  assert.deepEqual(modal.getSuggestions('体'.repeat(257)),[]);
  assert(logs.some(row=>row.event==='native-fallback'));
  const owned = modal.getSuggestions;
  const foreign = function(query){return owned.call(this,query);};
  modal.getSuggestions = foreign;
  dispose(); dispose();
  assert.equal(modal.getSuggestions,foreign);
  assert.deepEqual(modal.getSuggestions('体'),[]);
  boundOpen(); doc.dispatchEvent(new Event('focusin'));
  assert.equal(core.activeModal.getSuggestions,native);
  assert(!JSON.stringify(logs).includes('體育研究'));
});

test('Open file discovers bound opening in a newly active window and ignores readonly core hooks safely', () => {
  const f=fixture(), root=new EventTarget(), second=new EventTarget(), callbacks=new Map();
  const native=()=>[];
  const core={activeModal:null,onOpen(){this.activeModal={...f.modal,inputEl:{value:'体'},getSuggestions:native,onClose(){}};}};
  const bound=core.onOpen.bind(core);
  const workspace={containerEl:{ownerDocument:root},on(name,fn){callbacks.set(name,fn);return {name};}};
  f.modal.app.workspace=workspace; f.modal.app.internalPlugins={getEnabledPluginById:()=>core};
  const plugin={app:f.modal.app,active:true,expander,settings:{fullCompatibility:false},registerEvent(){}};
  const dispose=open.installOpenFile(plugin,()=>{},f.api);
  workspace.activeLeaf={view:{containerEl:{ownerDocument:second}}};
  callbacks.get('active-leaf-change')();
  bound(); second.dispatchEvent(new Event('focusin'));
  assert(core.activeModal.getSuggestions('体').some(row=>row.file===f.files[0]));
  dispose();
  Object.defineProperty(core,'onOpen',{writable:false});
  let cleanup;
  assert.doesNotThrow(()=>{cleanup=open.installOpenFile(plugin,()=>{},f.api);});
  cleanup();
});

test('Open file preserves native row identity and supplements actual files and distinct aliases', () => {
  assert.equal(typeof open.augmentSuggestions,'function');
  const f = fixture();
  const original = Object.freeze({type:'file',file:f.files[0],match:Object.freeze({score:42,matches:[[0,1]]})});
  const opaque = Object.freeze({type:'unresolved',linktext:'体',match:{score:2,matches:[[0,1]]}});
  const rows = open.augmentSuggestions(f.modal,'体',[original,opaque],expander,false,f.api);
  assert.equal(rows.find(row=>row.file===f.files[0]),original);
  assert(rows.includes(opaque)); assert.equal(original.match.score,42);
  assert(rows.some(row=>row.file===f.files[1] && row.type==='file'));
  const aliases = open.augmentSuggestions(f.modal,'发型',[],expander,false,f.api);
  assert.deepEqual(aliases.map(row=>row.alias),['髮型指南','发型说明']);
  assert(aliases.every(row=>row.file===f.files[1]));
});
test('Open file uses supplied fuzzy positions and maps different lengths back to original names', () => {
  assert.equal(typeof open.augmentSuggestions,'function');
  const f = fixture();
  const fuzzy = open.augmentSuggestions(f.modal,'体研',[],expander,false,f.api);
  assert.equal(fuzzy[0].file,f.files[0]);
  assert.deepEqual(fuzzy[0].match,{score:7,matches:[[0,1],[2,3]]});
  const ligature = open.augmentSuggestions(f.modal,'ffi',[],expander,true,f.api);
  assert.equal(ligature[0].file,f.files[3]); assert.deepEqual(ligature[0].match.matches,[[0,1]]);
  assert.deepEqual(open.augmentSuggestions(f.modal,'1',[],expander,false,f.api),[]);
  assert.equal(open.augmentSuggestions(f.modal,'1',[],expander,true,f.api)[0].file,f.files[2]);
});
test('Open file keeps type eligibility, ignore penalties, path offsets and empty-query behavior', () => {
  assert.equal(typeof open.augmentSuggestions,'function');
  const f = fixture();
  const recent = [{type:'file',file:f.files[0],match:null}];
  assert.equal(open.augmentSuggestions(f.modal,'  ',recent,expander,true,f.api),recent);
  assert.equal(f.calls.length,0);
  f.ignored.add(f.files[1].path);
  const rows = open.augmentSuggestions(f.modal,'体',[],expander,false,f.api);
  const nested = rows.find(row=>row.file===f.files[1]);
  assert.deepEqual(nested.match.matches,[[4,5]]); assert.equal(nested.match.score,0);
  assert.equal(nested.downranked,true);
  assert(!rows.some(row=>['png','pdf','xyz'].includes(row.file.extension)));
  f.modal.shouldShowImages = true; f.modal.shouldShowNonImageAttachments = true;
  const attachments = open.augmentSuggestions(f.modal,'体',[],expander,false,f.api);
  assert(attachments.some(row=>row.file===f.files[4])); assert(attachments.some(row=>row.file===f.files[5]));
  assert(!attachments.some(row=>row.file===f.files[6]));
  f.modal.shouldShowAllTypes = true;
  assert(open.augmentSuggestions(f.modal,'体',[],expander,false,f.api).some(row=>row.file===f.files[6]));
  const byPath = open.augmentSuggestions(f.modal,'档案/繁体',[],expander,false,f.api);
  assert.equal(byPath[0].match.score,-1); // Native matcher score 10, path -1, ignored -10.
  assert.deepEqual(byPath[0].match.matches,[[0,5]]);
});
test('Open file preserves original basename boundaries and switches to native simple matching at 10000 files', () => {
  const f = fixture();
  const slash = Object.freeze({path:'甲／體.md',extension:'md'});
  f.files.push(slash);
  const matched = open.augmentSuggestions(f.modal,'甲/体',[],expander,true,f.api).find(row=>row.file===slash);
  assert.deepEqual(matched.match,{score:10,matches:[[0,3]]});
  const many = [f.files[0], ...Array.from({length:9999},(_,i)=>({path:`other-${i}.md`,extension:'md'}))];
  f.modal.app.vault.getFiles = () => many;
  f.calls.length = 0;
  const rows = open.augmentSuggestions(f.modal,'体',[],expander,false,f.api);
  assert.equal(rows[0].file,f.files[0]);
  assert(f.calls.length > 0 && f.calls.every(call=>call.kind==='simple'));
});
test('Open file refuses missing native eligibility flags instead of silently narrowing support', () => {
  const f = fixture();
  delete f.modal.shouldShowMarkdown;
  assert.throws(()=>open.augmentSuggestions(f.modal,'体',[],expander,false,f.api),/interface|options/i);
});

test('Open file bounds queries and rejects broken mappings without modifying native rows or files', () => {
  assert.equal(typeof open.augmentSuggestions,'function');
  const f = fixture(), native = [{type:'file',file:f.files[0],match:{score:1,matches:[[0,1]]}}];
  assert.throws(()=>open.augmentSuggestions(f.modal,'体'.repeat(257),native,expander,false,f.api),/input-limit/);
  const broken = {...f.api,prepareFuzzySearch:()=>()=>({score:1,matches:[[0,99999]]})};
  assert.throws(()=>open.augmentSuggestions(f.modal,'体',native,expander,false,broken),/range/i);
  assert.equal(native.length,1); assert.equal(native[0].match.score,1);
  assert.equal(f.files[0].path,'體育研究.md');
});
