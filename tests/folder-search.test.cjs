const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const folder=fs.existsSync('src/folder-search.js')?require('../src/folder-search.js'):{};
const expander=require('../src/matcher.js').createExpander(require('../data/character-data.json'));
// Matcher double verifies mapping and native candidate ownership; real fuzzy
// scoring, rendering and move restrictions are checked in the isolated app.
function fixture(){
 class TFolder {constructor(path){this.path=path;}}
 const items=['/','檔案/體育研究','①','ﬃ','土'].map(path=>Object.freeze(new TFolder(path)));
 const api={TFolder,prepareFuzzySearch:query=>text=>{const i=text.indexOf(query);return i<0?null:{score:10,matches:[[i,i+query.length]]};}};
 const modal={getItems:()=>items,getItemText:item=>item.path,sortSuggestions:rows=>rows.sort((a,b)=>b.match.score-a.match.score)};
 return {items,api,modal};
}
test('folder search supplements only native-eligible folders and preserves native rows, scores and original offsets',()=>{
 assert.equal(typeof folder.augmentFolderSuggestions,'function');
 const {items,api,modal}=fixture(),native=Object.freeze({item:items[1],match:Object.freeze({score:42,matches:[[3,4]]})});
 const results=folder.augmentFolderSuggestions(modal,'  体育  ',[],expander,false,api);
 assert.equal(results.length,1);assert.equal(results[0].item,items[1]);assert.deepEqual(results[0].match.matches,[[3,5]]);
 assert.deepEqual(folder.augmentFolderSuggestions(modal,'体育',[native],expander,false,api),[native]);
 modal.getItems=()=>items.filter(item=>item!==items[1]);
 assert.deepEqual(folder.augmentFolderSuggestions(modal,'体育',[],expander,false,api),[],'Never reconstruct excluded folders from the vault');
});
test('folder search keeps empty/create rows native and maps compatibility sequences without changing folder names',()=>{
 assert.equal(typeof folder.augmentFolderSuggestions,'function');
 const {items,api,modal}=fixture(),empty=[{item:null,match:{score:0,matches:[]}}];
 assert.equal(folder.augmentFolderSuggestions(modal,'  ',empty,expander,true,api),empty);
 assert.deepEqual(folder.augmentFolderSuggestions(modal,'1',[],expander,false,api),[]);
 assert.equal(folder.augmentFolderSuggestions(modal,'1',[],expander,true,api)[0].item,items[2]);
 const rows=folder.augmentFolderSuggestions(modal,'ffi',empty,expander,true,api);
 assert(rows.includes(empty[0]));assert.equal(rows[0].item,items[3]);assert.deepEqual(rows[0].match.matches,[[0,1]]);
 assert.throws(()=>folder.augmentFolderSuggestions(modal,'体'.repeat(257),[],expander,true,api),/input-limit/);
 const broken={...api,prepareFuzzySearch:()=>()=>({score:1,matches:[[0,99999]]})};
 assert.throws(()=>folder.augmentFolderSuggestions(modal,'体',[],expander,true,broken),/range/i);
});

test('folder adapter scopes the shared hook, falls back whole and retires safely through foreign wrappers',()=>{
 assert.equal(typeof folder.installFolderSearch,'function');
 const {items,api,modal}=fixture(),logs=[],native=[];
 class TAbstractFile {}
 class TFolder extends TAbstractFile {}
 const candidates=items.map(item=>Object.assign(new TFolder(),item));
 class FuzzySuggestModal {getSuggestions(){return native;}}
 class MoveModal extends FuzzySuggestModal {
  constructor(app){super();this.app=app;this.files=[new TAbstractFile()];this.emptyMatch=Object.freeze({item:null,match:{score:0,matches:[]}});this.inputEl={value:'体育'};}
  getItems(){return candidates;}
  getItemText(item){return item.path;}
  onChooseItem(){}
  sortSuggestions(rows){return modal.sortSuggestions(rows);}
 }
 const plugin={app:{},active:true,expander,settings:{folderSearchEnabled:true,fullCompatibility:true}};
 Object.assign(api,{TAbstractFile,TFolder,FuzzySuggestModal});
 const proto=FuzzySuggestModal.prototype,original=proto.getSuggestions;
 const dispose=folder.installFolderSearch(plugin,(event,details)=>logs.push({event,...details}),api);
 const move=new MoveModal(plugin.app);
 assert.equal(move.getSuggestions('体育')[0].item,candidates[1]);assert.equal(move.inputEl.value,'体育');
 assert.equal(new MoveModal({}).getSuggestions('体育'),native,'Other apps must stay native');
 assert.equal(new FuzzySuggestModal().getSuggestions('体育'),native,'Unrelated suggestion modals must stay native');
 class ThirdParty extends MoveModal {}
 assert.equal(new ThirdParty(plugin.app).getSuggestions('体育'),native,'Unknown subclasses must stay native');
 move.getItems=()=>[{path:'體育'}];
 assert.equal(move.getSuggestions('体育'),native,'Invalid folder pools fall back as a whole');delete move.getItems;
 assert.equal(move.getSuggestions('体'.repeat(257)),native);
 assert(logs.some(log=>log.event==='native-fallback'));
 const owned=proto.getSuggestions,foreign=function(...args){return owned.apply(this,args);};proto.getSuggestions=foreign;
 dispose();dispose();assert.equal(proto.getSuggestions,foreign);assert.equal(move.getSuggestions('体育'),native);
 const stop=folder.installFolderSearch(plugin,()=>{},api);
 assert.equal(move.getSuggestions('体育')[0].item,candidates[1]);
 plugin.active=false;assert.equal(move.getSuggestions('体育'),native);stop();
 assert.equal(proto.getSuggestions,foreign);proto.getSuggestions=original;
 Object.defineProperty(proto,'getSuggestions',{writable:false});
 assert.doesNotThrow(()=>folder.installFolderSearch(plugin,()=>{},api)());
 assert(!JSON.stringify(logs).includes('體育研究'));
});
