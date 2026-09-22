const test=require('node:test'),assert=require('node:assert/strict');
const {createExpander}=require('../src/matcher');
const expander=createExpander(require('../data/character-data.json'));
const {augmentTags,augmentLinks,installEditorSuggestions}=require('../src/editor-suggest');
const prepare=q=>text=>{const i=text.toLowerCase().indexOf(q.toLowerCase());return i<0?null:{score:10,matches:[[i,i+q.length]]};};
const api={prepareFuzzySearch:prepare,prepareSimpleSearch:prepare};
test('tags supplement native rows with original names and original UTF-16 highlights',()=>{
 const native=[{tag:'研究',score:20,matches:[[0,1]]}];const pool=[...native,{tag:'硏究/體',score:0,matches:null}];
 const rows=augmentTags('研',native,pool,expander,false,api);
 assert.equal(rows[0],native[0]);assert.equal(rows[1].tag,'硏究/體');assert.deepEqual(rows[1].matches,[[0,1]]);
 assert.equal(augmentTags('',native,pool,expander,true,api),native);
 assert.equal(augmentTags('1',[],[{tag:'①',score:0,matches:null}],expander,true,api)[0].tag,'①');
 assert.deepEqual(augmentTags('1',[],[{tag:'①',score:0,matches:null}],expander,false,api),[]);
});
test('tag supplements use the native tag scorer lowercase inputs',()=>{
 const seen=[];const tagApi={prepareFuzzySearch:q=>{seen.push(q);return text=>{seen.push(text);return{score:1,matches:[[0,1]]};};}};
 augmentTags('a',[],[{tag:'ＡBC'}],expander,true,tagApi);
 assert.deepEqual(seen,['a','abc']);
 assert.throws(()=>augmentTags('i',[],[{tag:'İx'}],expander,false,api),/case-range/);
 assert.doesNotThrow(()=>augmentTags('i',[],[{tag:'İx'}],expander,true,api));
});
test('links use native candidates, preserve files, aliases, unresolved rows and path boundaries',()=>{
 const file={path:'目录/體.md'},ignored={path:'ignored/體.md'};
 const manager={app:{metadataCache:{isUserIgnored:p=>p.startsWith('ignored/')}},fileSuggestions:[
  {file,path:'目录/體'},{file,path:'目录/體',alias:'發型'}, {file:null,path:'體未创建'}, {file:ignored,path:'ignored/體'},
 ]};
 const native=[{type:'linktext',path:'体原生',score:1,matches:[[0,1]]}];
 const rows=augmentLinks(manager,'体',native,expander,false,api);
 assert.equal(rows[0],native[0]);assert.equal(rows.length,3);assert.equal(rows[1].file,file);assert.equal(rows[1].path,'目录/體');
 assert.deepEqual(rows[1].matches,[[3,4]]);assert.equal(rows[2].downranked,true);assert.equal(rows[2].score,0);
 const alias=augmentLinks(manager,'发型',[],expander,false,api)[0];assert.equal(alias.alias,'發型');assert.equal(alias.file,file);
 assert.equal(augmentLinks(manager,'',native,expander,false,api),native);
 const row={type:'file',file,path:'目录/體',score:55,matches:[[3,4]]};
 assert.deepEqual(augmentLinks(manager,'体',[row],expander,false,api).filter(r=>r.file===file),[row]);
 manager.fileSuggestions=[{file,path:'前／體'}];assert.equal(augmentLinks(manager,'体',[],expander,true,api)[0].score,10);
});
test('instance hooks preserve foreign ownership, retire references and cancel late supplements',async()=>{
 const editor={},file={path:'體.md',extension:'md'},events=new Set(),logs=[];
 const context={editor,file,query:'研'};
 const tags={onTrigger:()=>({query:'x',start:{ch:0},end:{ch:2}}),getSuggestions:c=>c.query===''?[{tag:'硏究',score:0,matches:null}]:[]};
 const target={app:{metadataCache:{isUserIgnored:()=>false}},fileSuggestions:[{file,path:'體'}],getFileSuggestions:async()=>[]};
 const links={context:{editor,file,query:'体'},onTrigger:()=>({query:'x',start:{ch:2},end:{ch:3}}),suggestManager:target};
 const workspace={activeLeaf:{view:{editor}},editorSuggest:{suggests:[links,tags]},on(){const e={};events.add(e);return e;},offref(e){events.delete(e);}};
 const plugin={active:true,expander,settings:{tagsEnabled:true,internalLinksEnabled:true},app:{workspace}};
 let stop=installEditorSuggestions(plugin,(...a)=>logs.push(a),api);
 assert.equal(tags.getSuggestions(context)[0].tag,'硏究');
 const old=tags.getSuggestions;tags.getSuggestions=function(...args){return old.apply(this,args);};const foreign=tags.getSuggestions;
 const pending=target.getFileSuggestions({isCancelled:()=>false},'体');stop();assert.deepEqual(await pending,[]);
 assert.equal(tags.getSuggestions,foreign);assert.deepEqual(old.call(tags,context),[]);assert.equal(events.size,0);
 stop=installEditorSuggestions(plugin,(...a)=>logs.push(a),api);assert.equal(tags.getSuggestions(context)[0].tag,'硏究');assert.deepEqual(old.call(tags,context),[]);
 assert.deepEqual(await target.getFileSuggestions({isCancelled:()=>true},'体'),[]);
 plugin.settings.tagsEnabled=false;assert.deepEqual(tags.getSuggestions(context),[]);
 assert.equal((await target.getFileSuggestions({isCancelled:()=>false},'体'))[0].file,file);
 plugin.settings.tagsEnabled=true;assert.deepEqual(tags.getSuggestions({...context,file:{extension:'canvas'}}),[]);
 stop();assert.equal(events.size,0);
});
test('oversized input or bad candidate aborts rather than returning partial supplements',()=>{
 assert.throws(()=>augmentTags('体'.repeat(257),[],[],expander,true,api),/limit/);
 const native=[];assert.throws(()=>augmentTags('体',native,[{tag:'體'},{tag:1}],expander,true,api));assert.deepEqual(native,[]);
});
