'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fixtures={
 'move-source.md':'Original move fixture\n',
 '檔案/體育研究/keep.md':'Keep\n',
 '①/keep.md':'Keep compatibility\n',
 'ﬃ/keep.md':'Keep ligature\n',
 '體育移動/子體育/keep.md':'Keep nested\n',
 '土/keep.md':'Negative\n',
};
async function openMove(page,contextMenu=false){
 await page.evaluate(async()=>{window.folderModal?.close();await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('move-source.md'));});
 if(contextMenu){
  await page.evaluate(()=>{app.workspace.leftSplit.expand();const leaf=app.workspace.getLeavesOfType('file-explorer')[0];app.workspace.revealLeaf(leaf);});
  await page.locator('.nav-file-title[data-path="move-source.md"]').click({button:'right'});
  await page.locator('.menu').waitFor();
  console.log('FILE MENU',await page.locator('.menu-item-title').allTextContents());
  await page.locator('.menu-item').filter({hasText:/Move/}).click();
 }else await page.evaluate(()=>app.commands.executeCommandById('file-explorer:move-file'));
 await page.locator('.prompt-input:visible').waitFor();
}
async function snapshot(page,query){
 await page.locator('.prompt-input:visible').fill(query);
 return page.evaluate(()=>({input:folderModal.inputEl.value,rows:folderModal.chooser.values.map(r=>({path:r.item?.path??null,match:r.match}))}));
}
async function captureBaseline(page){
 // Test-only capture: production must not depend on this observer or test globals.
 await page.evaluate(async()=>{
  const dir='.obsidian/plugins/folder-harness',adapter=app.vault.adapter;
  await adapter.mkdir(dir);
  await adapter.write(dir+'/manifest.json',JSON.stringify({id:'folder-harness',name:'Folder harness',version:'0.0.1',minAppVersion:'1.13.7',description:'Isolated test helper',author:'test'}));
  await adapter.write(dir+'/main.js',`const api=require('obsidian');module.exports=class extends api.Plugin{onload(){window.folderTestApi=api;const p=api.Modal.prototype,original=p.open;p.open=function(...args){window.folderModal=this;return original.apply(this,args);};this.register(()=>p.open=original);const m=api.Menu.prototype,show=m.showAtMouseEvent;m.showAtMouseEvent=function(...args){this.setUseNativeMenu(false);return show.apply(this,args);};this.register(()=>m.showAtMouseEvent=show);}};`);
  await app.plugins.loadManifests();await app.plugins.setEnable(true);await app.plugins.enablePlugin('folder-harness');
 });
 await openMove(page,true);
 const native=await snapshot(page,'体育');
 assert(!native.rows.some(r=>r.path==='檔案/體育研究'));
 assert((await snapshot(page,'體育')).rows.some(r=>r.path==='檔案/體育研究'));
 await page.evaluate(()=>folderModal.close());
 console.log('PASS native Files context-menu folder baseline');return native;
}
async function verifyFolders(page,_context,evidence){
 const set=(key,value)=>page.evaluate(({key,value})=>app.plugins.plugins['cjk-search-probe'].setSetting(key,value),{key,value});
 await openMove(page,true);
 let r=await snapshot(page,'体育');
 assert(r.rows.some(r=>r.path==='檔案/體育研究'),'Move dialog should match equivalent folder names');
 assert.equal(r.input,'体育');evidence.folders=[r];
 for(const [query,target]of [['档案/体育','檔案/體育研究'],['体研','檔案/體育研究'],['ffi','ﬃ'],['1','①']]){
  r=await snapshot(page,query);assert(r.rows.some(row=>row.path===target),query);evidence.folders.push(r);
 }
 await snapshot(page,'体研');
 assert.match(await page.locator('.suggestion-item').filter({hasText:'檔案/體育研究'}).textContent(),/檔案\/體育研究/);
 const highlights=await page.locator('.suggestion-item').filter({hasText:'檔案/體育研究'}).locator('.suggestion-highlight').allTextContents();
 assert(highlights.includes('體')&&highlights.includes('研'));evidence.folderHighlights=highlights;
 await page.screenshot({path:path.join(evidence.root,'folder-search.png')});
 await set('quickSwitcherEnabled',false);assert((await snapshot(page,'体育')).rows.some(r=>r.path==='檔案/體育研究'));
 await set('folderSearchEnabled',false);assert.deepEqual((await snapshot(page,'体育')).rows,evidence.folderBaseline.rows);
 await set('folderSearchEnabled',true);
 await set('fullCompatibility',false);assert(!(await snapshot(page,'1')).rows.some(r=>r.path==='①'));
 await set('fullCompatibility',true);
 assert(!(await snapshot(page,'体'.repeat(257))).rows.some(r=>r.path==='檔案/體育研究'));
 await snapshot(page,'体育');
 await page.locator('.suggestion-item').filter({hasText:'檔案/體育研究'}).click();
 await page.waitForFunction(()=>!!app.vault.getAbstractFileByPath('檔案/體育研究/move-source.md'));
 assert.equal(await page.evaluate(()=>app.vault.read(app.vault.getAbstractFileByPath('檔案/體育研究/move-source.md'))),fixtures['move-source.md']);
 // Restore the synthetic fixture so the runner can verify every byte unchanged.
 await page.evaluate(()=>app.fileManager.renameFile(app.vault.getAbstractFileByPath('檔案/體育研究/move-source.md'),'move-source.md'));
 await openMove(page);
 await snapshot(page,'新字體');await page.locator('.prompt-input:visible').press('Shift+Enter');
 await page.waitForFunction(()=>!!app.vault.getAbstractFileByPath('新字體/move-source.md'));
 assert.equal(await page.evaluate(()=>!!app.vault.getAbstractFileByPath('新字体')),false);
 await page.evaluate(()=>app.fileManager.renameFile(app.vault.getAbstractFileByPath('新字體/move-source.md'),'move-source.md'));
 evidence.folderCreationKeptOriginalName=true;
 await openMove(page);
 await page.evaluate(()=>{const Constructor=folderModal.constructor;folderModal.close();new Constructor(app,[app.vault.getAbstractFileByPath('體育移動')]).open();});
 r=await snapshot(page,'体育');assert(!r.rows.some(r=>r.path==='體育移動'||r.path?.startsWith('體育移動/')));
 assert(r.rows.some(r=>r.path==='檔案/體育研究'));evidence.folderRestriction=r;
 await page.evaluate(()=>folderModal.close());
 await openMove(page);
 await set('folderSearchEnabled',false);
 await page.evaluate(async()=>{await app.plugins.disablePlugin('cjk-search-probe');await app.plugins.enablePlugin('cjk-search-probe');});
 assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.folderSearchEnabled),false);
 assert.deepEqual((await snapshot(page,'体育')).rows,evidence.folderBaseline.rows);
 await set('folderSearchEnabled',true);assert((await snapshot(page,'体育')).rows.some(r=>r.path==='檔案/體育研究'));
 await page.evaluate(()=>app.plugins.disablePlugin('cjk-search-probe'));
 assert.deepEqual((await snapshot(page,'体育')).rows,evidence.folderBaseline.rows);
 await page.evaluate(()=>folderModal.close());
 console.log('PASS folder matching, original highlights, actual move/create, restrictions, independent persisted toggles and unload');
}
module.exports={fixtures,captureBaseline,verifyFolders};
