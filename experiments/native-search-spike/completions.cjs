const assert=require('node:assert/strict');
const path=require('node:path');
const fixtures={
 'completion-input.md':'',
 '補全/體育.md':'---\naliases: [發型]\ntags: [硏究/體]\n---\n# 標題\n正文 ^block-id\n',
 '補全/①.md':'#兼容①\n',
 '補全/土.md':'#土地\n[[未存在]]\n',
};
async function setup(page){
 await page.waitForFunction(()=>!!app.metadataCache.getTags()['#硏究/體']);
 await page.evaluate(async()=>{
  const leaf=app.workspace.getLeaf(false);await leaf.openFile(app.vault.getAbstractFileByPath('completion-input.md'),{active:true});
  await leaf.view.setState({...leaf.view.getState(),mode:'source'},{});
  leaf.view.containerEl.dataset.cjkCompletion='active';window.completionEditor=leaf.view.editor;
  window.completionCalls=[];
  app.workspace.editorSuggest.suggests.slice(0,2).forEach((suggest,index)=>{
   const original=suggest.showSuggestions;
   suggest.showSuggestions=function(rows){
    window.lastCompletion={kind:index===0?'links':'tags',query:this.context?.query,rows:rows.map(r=>({type:r.type,tag:r.tag,path:r.path,file:r.file?.path,alias:r.alias,score:r.score,matches:r.matches}))};
    completionCalls.push(lastCompletion);return original.call(this,rows);
   };
  });
 });
}
async function complete(page,text){
 await page.evaluate(()=>{app.workspace.editorSuggest.close();completionEditor.setValue('');completionEditor.setCursor({line:0,ch:0});completionEditor.focus();window.lastCompletion=null;});
 await page.keyboard.insertText(text);
 const kind=text.startsWith('#')?'tags':'links',query=text.slice(kind==='tags'?1:2);
 await page.waitForFunction(({kind,query})=>lastCompletion?.kind===kind&&lastCompletion.query===query,{kind,query});
 const result=await page.evaluate(()=>({text:completionEditor.getValue(),...lastCompletion}));
 assert.equal(result.text,text,'Typing must remain original before selection');return result;
}
async function choose(page,predicate){
 const index=await page.evaluate(source=>{
  const rows=app.workspace.editorSuggest.currentSuggest.suggestions.values;
  return rows.findIndex(row=>source.tag?row.tag===source.tag:source.alias?row.alias===source.alias:row.file?.path===source.file);
 },predicate);assert(index>=0);
 await page.evaluate(index=>app.workspace.editorSuggest.currentSuggest.suggestions.forceSetSelectedItem(index,null),index);
 await page.keyboard.press('Enter');return page.evaluate(()=>completionEditor.getValue());
}
async function captureBaseline(page){
 await setup(page);
 const tags=await complete(page,'#研'),links=await complete(page,'[[体育');
 assert(!tags.rows.some(r=>r.tag==='硏究/體'));assert(!links.rows.some(r=>r.file==='補全/體育.md'));
 const nativeTags=await complete(page,'#硏');assert(nativeTags.rows.some(r=>r.tag==='硏究/體'));
 const nativeLinks=await complete(page,'[[體育');assert(nativeLinks.rows.some(r=>r.file==='補全/體育.md'));
 console.log('PASS native tags / internal-links baseline');return {tags,links};
}
async function verifyCompletions(page,_context,evidence){
 evidence.completions=[];
 const set=(key,value)=>page.evaluate(({key,value})=>app.plugins.plugins['cjk-search-probe'].setSetting(key,value),{key,value});
 let r=await complete(page,'#研');assert(r.rows.some(r=>r.tag==='硏究/體'),'Tags should match equivalent characters');evidence.completions.push(r);
 assert.equal(await choose(page,{tag:'硏究/體'}),'#硏究/體 ');
 r=await complete(page,'[[体育');assert(r.rows.some(r=>r.file==='補全/體育.md'),'Internal links should match equivalent names');evidence.completions.push(r);
 assert.match(await choose(page,{file:'補全/體育.md'}),/^\[\[(?:補全\/)?體育\]\]$/);
 r=await complete(page,'[[发型');assert(r.rows.some(r=>r.alias==='發型'));evidence.completions.push(r);
 assert.match(await choose(page,{alias:'發型'}),/^\[\[(?:補全\/)?體育\|發型\]\]$/);
 await set('tagsEnabled',false);r=await complete(page,'#研');assert.deepEqual(r.rows,evidence.completionBaseline.tags.rows);
 r=await complete(page,'[[体育');assert(r.rows.some(r=>r.file==='補全/體育.md'));
 await set('tagsEnabled',true);await set('internalLinksEnabled',false);
 r=await complete(page,'[[体育');assert.deepEqual(r.rows,evidence.completionBaseline.links.rows);
 r=await complete(page,'#研');assert(r.rows.some(r=>r.tag==='硏究/體'));
 await set('internalLinksEnabled',true);
 await complete(page,'[[新字體');await page.keyboard.press('Shift+Enter');assert.equal(await page.evaluate(()=>completionEditor.getValue()),'[[新字體]]');
 r=await complete(page,'[[體育#標');assert(r.rows.some(r=>r.type==='heading'));
 await complete(page,'[[体育');await page.screenshot({path:path.join(evidence.root,'internal-links.png')});
 await complete(page,'#研');await page.screenshot({path:path.join(evidence.root,'tags.png')});
 await page.evaluate(async()=>{app.workspace.editorSuggest.close();completionEditor.setValue('');await app.workspace.activeLeaf.view.save();await app.plugins.disablePlugin('cjk-search-probe');});
 assert.deepEqual((await complete(page,'#研')).rows,evidence.completionBaseline.tags.rows);
 assert.deepEqual((await complete(page,'[[体育')).rows,evidence.completionBaseline.links.rows);
 await page.evaluate(async()=>{app.workspace.editorSuggest.close();completionEditor.setValue('');await app.workspace.activeLeaf.view.save();});
 console.log('PASS native tags / internal-links matching, insertion, independence, native subpaths and unload');
}
module.exports={fixtures,captureBaseline,verifyCompletions};
