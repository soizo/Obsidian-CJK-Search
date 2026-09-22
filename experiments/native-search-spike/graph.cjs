'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fixtures={
 'graph-root.md':'[[graph/體.svg]] [[graph/体A]] [[graph/體A]] [[graph/lower-体a]] [[graph/土]] [[研究/记录]] [[硏究/記錄]]\n',
 'graph/体A.md':'---\ntags: [研究]\n---\n体 发 弁 ① ㍿\n[[體A]]\n',
 'graph/體A.md':'體 發 辨 1 株式会社\n#硏究/體\n[[体A]]\n',
 'graph/lower-体a.md':'髮 瓣 ﬃ ffi\n#研究者\n',
 'graph/土.md':'土\n#研究／體\n',
 '研究/记录.md':'正文标记\n',
 '硏究/記錄.md':'正文標記\n',
};
const sourceText=Object.values(fixtures).join('');
const supplementary=require('../../data/character-data.json').modes.eastAsian.entries.find(([a,b])=>a.length===2&&[...b].length===1&&a!==b&&!sourceText.includes(b));
fixtures['graph/体A.md']+=supplementary[0]+'\n';
fixtures['graph/體A.md']+=supplementary[1]+'\n';
async function openGraph(page,type='graph') {
 await page.evaluate(async type=>{
  document.querySelectorAll('[data-cjk-graph]').forEach(el=>delete el.dataset.cjkGraph);
  const leaf=app.workspace.getLeaf('tab');
  await leaf.setViewState({type,state:type==='localgraph'?{file:'graph-root.md'}:{},active:true});
  window.graphView=leaf.view;window.graphEngine=graphView.dataEngine||graphView.engine;
  graphEngine.setOptions({showOrphans:true,showTags:false,showAttachments:false,hideUnresolved:true,localJumps:1,localBacklinks:true,localForelinks:true,localInterlinks:true});
  graphView.containerEl.dataset.cjkGraph='active';graphEngine.controlsEl.removeClass('is-close');graphEngine.filterOptions.setCollapsed(false,false);
 },type);
 await page.waitForFunction(()=>graphEngine.renderer.nodes.length>0);
}
async function query(page,text,groups=[],flush=true) {
 await page.evaluate(groups=>graphEngine.colorGroupOptions.setColorQueries(groups),groups);
 const input=page.locator('[data-cjk-graph="active"] .mod-filter input[type="search"]');
 // Typing already triggers native debounce. Enter accepts native suggestions
 // (including inserted spaces), which is a different user action.
 await input.fill(text);
 // Explicit native refresh also covers re-running unchanged text after a fault
 // or mode change; otherwise a settled previous queue can satisfy the predicate.
 if(flush) await page.evaluate(()=>graphEngine.updateSearch());
 await page.waitForFunction(({text,groups})=>{
  const e=graphEngine;
  const wanted=[...(text?[{query:text,color:null}]:[]),...groups].filter(g=>g.query);
  const actual=(e.searchQueries||[]).map(g=>({query:g.query.query,color:g.color}));
  return e.hasFilter===!!text && JSON.stringify(actual)===JSON.stringify(wanted) &&
   (!e.queue||!!e.queue.promise&&!e.queue.runnable.isRunning());
 },{text,groups});
 return page.evaluate(()=>({input:graphEngine.filterOptions.search.getValue(),options:graphEngine.getOptions(),
  nodes:graphEngine.renderer.nodes.map(n=>({id:n.id,color:n.color,type:n.type})).sort((a,b)=>a.id.localeCompare(b.id)),
  originals:graphEngine.searchQueries?.map(q=>q.query.query)||[]}));
}
async function captureBaseline(page) {
 await page.evaluate(async()=>{await app.vault.create('graph/體.svg','<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>');});
 await page.waitForFunction(()=>app.metadataCache.resolvedLinks['graph-root.md']?.['graph/體.svg']>0);
 await page.waitForFunction(()=>Object.keys(app.metadataCache.resolvedLinks).length>=10);
 await openGraph(page);
 const native=await query(page,'file:体A');
 assert.deepEqual(native.nodes.map(n=>n.id),['graph/lower-体a.md','graph/体A.md'].sort((a,b)=>a.localeCompare(b)));
 const basic=await query(page,'發');
 const preserved={};
 for(const text of ['file:/体A/','content:發','[tags:研究]','"體A"']) preserved[text]=(await query(page,text)).nodes.map(n=>n.id);
 const shape=await page.evaluate(()=>{
  const Q=graphEngine.searchQueries[0].query.constructor;
  const walk=n=>({keys:Object.keys(n),tokens:n.matchedTokens,text:n.text,regex:n.regex,caseSensitive:n.caseSensitive,
   children:n.matchers?.map(walk),child:n.matcher?walk(n.matcher):undefined});
  window.GraphNativeQuery=Q;
  return ['体','file:体','path:"研究"','tag:研究','-file:体 OR match-case:體','[tags:研究]'].map(s=>({query:s,tree:walk(new Q(app,s,false).matcher)}));
 });
 // Observe first actual match calls without touching any global prototype.
 await page.evaluate(()=>{
  window.graphCalls=[];
  const e=graphEngine,original=e.setQuery;
  e.setQuery=function(...args){
   const result=original.apply(this,args);
   for(const entry of this.searchQueries||[]) {
    const q=entry.query,match=q._match;
    q._match=function(...values){graphCalls.push({query:q.query,enhanced:this!==q});return match.apply(this,values);};
    if(window.graphFault) Object.freeze(entry);
   }
   return result;
  };
 });
 console.log('GRAPH BASELINE',JSON.stringify({native,basic,shape}));
 return {native,basic,preserved,shape};
}
async function verifyGraph(page,context,evidence) {
 const sort=ids=>ids.slice().sort((a,b)=>a.localeCompare(b));
 const trio=['graph/体A.md','graph/體A.md','graph/lower-体a.md'];
 const pair=['graph/体A.md','graph/體A.md'];
 const dirs=['研究/记录.md','硏究/記錄.md'];
 const set=(key,value)=>page.evaluate(({key,value})=>app.plugins.plugins['cjk-search-probe'].setSetting(key,value),{key,value});
 evidence.graph=[];
 async function check(text,ids,local=false,groups=[]) {
  const r=await query(page,text,groups);
  assert.deepEqual(r.nodes.map(n=>n.id),sort(local?[...new Set([...ids,'graph-root.md'])]:ids),text);
  assert.equal(r.input,text);assert.equal(r.options.search,text);
  assert.deepEqual(r.options.colorGroups,groups);
  assert.deepEqual(r.originals,[...(text?[text]:[]),...groups.map(g=>g.query)].filter(Boolean));
  evidence.graph.push({text,local,...r});return r;
 }
 const result=await query(page,'發',[],false);
 assert(result.nodes.some(n=>n.id==='graph/体A.md'),'Graph should also find simplified 发 from typed 發');
 assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.graphAdvancedQueries),false);
 assert((await page.evaluate(()=>graphCalls.filter(c=>c.query==='發'))).every(c=>c.enhanced),'First actual match must already be enhanced');
 for(const local of [false,true]) {
  if(local) await openGraph(page,'localgraph');
  await check('發',trio,local);await check('弁',trio,local);await check('株式会社',pair,local);
  await check(supplementary[0],pair,local);
  await check('file:体A',['graph/体A.md','graph/lower-体a.md'],local);
  await set('graphAdvancedQueries',true);
  await check('file:体A',trio,local);
  await check('match-case:file:体A',pair,local);
  await check('file:體 -file:lower',pair,local);
  await check('file:體 OR path:研究',[...trio,...dirs],local);
  await check('path:"研究"',dirs,local);
  await check('tag:研究',pair,local);
  await check('tag:#硏究/体',['graph/體A.md'],local);
  await check('tag:研究 -file:體',[],local);
  await check('file:体 content:發',['graph/體A.md'],local);
  for(const [text,native] of Object.entries(evidence.graphBaseline.preserved)) await check(text,native,local);
  const groups=[{query:'file:体',color:{a:1,rgb:0xff0000}},{query:'file:體',color:{a:1,rgb:0x0000ff}}];
  const colored=await query(page,'',groups);
  for(const id of trio) assert.equal(colored.nodes.find(n=>n.id===id).color.rgb,0xff0000,'First color group retains priority');
  assert.deepEqual(colored.options.colorGroups,groups);
  await check('file:体',trio,local,[{query:'path:研究',color:{a:1,rgb:0x0000ff}}]);
  await set('fullCompatibility',false);await check('①',['graph/体A.md'],local);
  await set('fullCompatibility',true);await check('①',pair,local);
  await check('体'.repeat(257),[],local);
  await check('file:体',trio,local,groups);
  await page.locator('[data-cjk-graph="active"] .mod-filter input[type="search"]').evaluate(el=>el.blur());
  await page.evaluate(()=>graphEngine.colorGroupOptions.setCollapsed(false,false));
  await page.screenshot({path:path.join(evidence.root,local?'graph-local.png':'graph-global.png')});
  await set('graphAdvancedQueries',false);
 }
 // Frozen native entries must fall back without partial writes or private errors.
 await openGraph(page);
 // Instrument this new engine before reinstalling its instance wrapper.
 await set('graphEnabled',false);
 await page.evaluate(()=>{
  const e=graphEngine,original=e.setQuery;
  e.setQuery=function(...args){const result=original.apply(this,args);if(window.graphFault)for(const entry of this.searchQueries||[])Object.freeze(entry);return result;};
 });
 await set('graphEnabled',true);await page.evaluate(()=>window.graphFault=true);
 await check('發',evidence.graphBaseline.basic.nodes.map(n=>n.id));
 await page.evaluate(()=>window.graphFault=false);await check('發',trio);
 await page.evaluate(()=>{window.retainedGraphQuery=graphEngine.searchQueries[0].query;});
 await set('graphEnabled',false);
 await page.waitForFunction(()=>graphEngine.queue.promise&&!graphEngine.queue.runnable.isRunning());
 assert.equal(await page.evaluate(()=>retainedGraphQuery.matchContent('发')),null);
 await check('發',evidence.graphBaseline.basic.nodes.map(n=>n.id));
 await set('graphEnabled',true);await check('發',trio);
 // Input value setters record even temporary writes, not just the final value.
 await page.evaluate(()=>{
  const el=graphEngine.filterOptions.search.inputEl;
  const property=Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype,'value');
  window.graphWrites=[];Object.defineProperty(el,'value',{configurable:true,get(){return property.get.call(this);},set(v){graphWrites.push(v);property.set.call(this,v);}});
 });
 await check('发',trio);assert((await page.evaluate(()=>graphWrites)).every(value=>value==='发'));
 await set('graphAdvancedQueries',true);await check('tag:研究',pair);
 await page.evaluate(()=>graphEngine.setOptions({showTags:true}));
 const tagged=await query(page,'tag:研究');
 assert.deepEqual(sort(tagged.nodes.filter(n=>n.type==='tag').map(n=>n.id)),sort(['#研究','#硏究/體']));
 await page.evaluate(()=>graphEngine.setOptions({showTags:false,showAttachments:true}));
 await check('file:体',[...trio,'graph/體.svg']);
 await page.evaluate(()=>graphEngine.setOptions({showAttachments:false}));
 evidence.graphPerformance=[];
 for(const enabled of [false,true]) {
  await set('graphEnabled',enabled);
  evidence.graphPerformance.push(...await page.evaluate(enabled=>{
   return [1,5,20].map(groups=>{
    const values=Array.from({length:groups},()=>({query:'file:体',color:{a:1,rgb:0xff0000}}));
    const times=[];for(let i=0;i<6;i++){const start=performance.now();graphEngine.setQuery(values);if(i)times.push(performance.now()-start);}
    return {enabled,groups,medianMs:times.sort((a,b)=>a-b)[2],scope:'Synchronous query setup in a 10-note test vault; not full I/O or large-vault performance'};
   });
  },enabled));
 }
 await check('tag:研究',pair);
 // Actual native node click handler opens the original file.
 await page.evaluate(()=>{graphEngine.onNodeClick(new MouseEvent('click'),'graph/體A.md','');});
 await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='graph/體A.md');
 // Native navigation may reuse the graph leaf for the Markdown view.
 await openGraph(page);
 // Actual settings control persists the opt-in across plugin reload.
 const opened=context.waitForEvent('page');await page.evaluate(()=>app.setting.open());const settings=await opened;
 await settings.locator('[data-setting-id="cjk-search-probe"]').click();
 await settings.getByText('Advanced graph queries',{exact:true}).waitFor();
 const row=settings.locator('.setting-item').filter({has:settings.getByText('Advanced graph queries',{exact:true})});
 await row.locator('.checkbox-container').click();
 await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.graphAdvancedQueries===false);
 await settings.screenshot({path:path.join(evidence.root,'graph-settings.png')});
 await page.evaluate(()=>app.setting.close());
 await page.evaluate(async()=>{await app.plugins.disablePlugin('cjk-search-probe');await app.plugins.enablePlugin('cjk-search-probe');});
 assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.graphAdvancedQueries),false);
 await query(page,'PRIVATEQUERYSENTINELxyz');assert(!evidence.probeLogs.join('\n').includes('PRIVATEQUERYSENTINEL'));
 await page.evaluate(async()=>{await app.internalPlugins.getPluginById('graph').disable();});
 await page.evaluate(async()=>{await app.internalPlugins.getPluginById('graph').enable();});
 await openGraph(page);await check('發',trio);
 await page.evaluate(()=>app.plugins.disablePlugin('cjk-search-probe'));
 await check('發',evidence.graphBaseline.basic.nodes.map(n=>n.id));
 console.log('PASS graph global/local, advanced opt-in, native semantics, colors, input, fallback and cleanup');
}
module.exports={fixtures,captureBaseline,verifyGraph,openGraph,query};
