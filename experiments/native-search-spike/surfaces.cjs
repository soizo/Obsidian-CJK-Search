'use strict';
// Only called by run.cjs after its isolated vault realpath check.
const assert = require('node:assert/strict');
const path = require('node:path');

const fixtures = {
  '體育研究.md': '體 体 體\n① 1\n㍿ 株式会社\nﬃ ffi\n前𠀀后\n\n前**體**后 [体](體育研究.md)\n\n发 發 髮\n弁 瓣 辨 辯\n土 士 未 末 丼 井\n鼠标 鼠標 滑鼠\n',
  '档案/繁體说明.md': '---\naliases:\n  - 髮型指南\n  - 发型说明\n---\n测试正文\n',
  'Find替换夹具.md': '體 体 體\n',
};
const supplementary = require('../../data/character-data.json').modes.eastAsian.entries.find(([a,b]) =>
  a.length === 2 && b.length === 1 && a !== b && !Object.values(fixtures).join('').includes(b));
assert(supplementary);
fixtures['體育研究.md'] += `\n前${supplementary[0]}后 ${supplementary[1]}\n`;
fixtures['瓣體髮.md'] = '字符标题夹具\n';
const sequenceFilename = `㍿${supplementary[0]}.md`;
fixtures[sequenceFilename] = '变长及补充平面文件名夹具\n';
const findInput = page => page.locator('[data-cjk-surface-active] .document-search-input input:visible');

async function trackInput(input) {
  await input.evaluate(el => {
    window.surfaceWrites = [];
    if (el.hasAttribute('data-cjk-test-input')) return;
    el.setAttribute('data-cjk-test-input','true');
    const descriptor = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype,'value');
    Object.defineProperty(el,'value',{configurable:true,get(){return descriptor.get.call(this);},
      set(value){window.surfaceWrites.push(value);descriptor.set.call(this,value);}});
  });
}

async function openFind(page, mode = 'source', file = '體育研究.md') {
  await page.evaluate(async ({mode,file}) => {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(app.vault.getAbstractFileByPath(file), {active:true});
    await leaf.view.setState({...leaf.view.getState(), mode}, {});
    for (const el of document.querySelectorAll('[data-cjk-surface-active]')) el.removeAttribute('data-cjk-surface-active');
    leaf.view.containerEl.setAttribute('data-cjk-surface-active','true');
    app.commands.executeCommandById('editor:open-search');
  }, {mode,file});
  await findInput(page).waitFor({state:'visible'});
}

async function findSnapshot(page, query, mode) {
  await trackInput(findInput(page));
  await findInput(page).fill(query);
  // Poll actual parsed query and count, not a fixed timeout for the native debounce.
  await page.waitForFunction(({query, mode}) => {
    const view = app.workspace.activeLeaf.view;
    const search = mode === 'source' ? view.editMode.search : view.previewMode.search;
    return search?.getQuery() === query && (mode === 'source'
      ? search.countEl.textContent === search.cursor.getIndexAndCount().join(' / ')
      : search.lastQuery === query.toLowerCase()
        && search.countEl.textContent === `${search.selectedRange + 1} / ${(search.highlightRanges ?? []).length}`
        && (!(search.highlightRanges?.length) || search.highlightRanges[search.selectedRange]?.active));
  }, {query, mode});
  const snapshot = await page.evaluate(mode => {
    const view = app.workspace.activeLeaf.view;
    const search = mode === 'source' ? view.editMode.search : view.previewMode.search;
    return {query:search.getQuery(), count:search.countEl.textContent,writes:window.surfaceWrites,
      ranges:mode === 'source' ? search.cursor.findAll() : (search.highlightRanges ?? []).map(r => ({
        start:r.start,end:r.end,active:r.active,text:r.section.el.textContent,
      })),
      searchKeys:Object.keys(search),
      cursorMethods:search.cursor ? Object.keys(search.cursor).filter(k=>typeof search.cursor[k]==='function') : [],
    };
  }, mode);
  assert(snapshot.writes.every(value=>value===query),'Find must not rewrite input even transiently');
  return snapshot;
}

async function switcherSnapshot(page, query) {
  await page.evaluate(() => app.commands.executeCommandById('switcher:open'));
  const input = page.locator('.prompt-input:visible');
  await trackInput(input);
  await input.fill(query);
  await page.waitForFunction(query => {
    const modal = app.internalPlugins.getEnabledPluginById('switcher').activeModal;
    // Native no-results state legitimately has null chooser.values.
    return modal?.inputEl.value === query;
  }, query);
  // getSuggestions is the real native synchronous generator; UI assertions are separate.
  const result = await page.evaluate(query => {
    const modal = app.internalPlugins.getEnabledPluginById('switcher').activeModal;
    return {query:modal.inputEl.value,writes:window.surfaceWrites, modalKeys:Object.keys(modal), chooserHasValues:Array.isArray(modal.chooser?.values),
      results:modal.getSuggestions(query).map(row=>({type:row.type,path:row.file?.path,
        alias:row.alias,linktext:row.linktext,match:row.match,downranked:row.downranked})),
    };
  }, query);
  assert(result.writes.every(value=>value===query),'Open file must not rewrite input even transiently');
  await input.press('Escape');
  return result;
}

async function captureBaseline(page) {
  const baseline = {find:{},switcher:{}};
  for (const mode of ['source','preview']) {
    await openFind(page,mode);
    baseline.find[mode] = {};
    for (const query of ['体','體','1','株式会社','體 体','/体/']) {
      baseline.find[mode][query] = await findSnapshot(page,query,mode);
      assert.equal(baseline.find[mode][query].query,query);
    }
    await findInput(page).press('Escape');
  }
  for (const query of ['体育','体研','发型','繁體','']) baseline.switcher[query] = await switcherSnapshot(page,query);
  assert(baseline.find.source['体'].cursorMethods.includes('replaceAll'));
  assert.equal(baseline.find.source['体'].ranges.filter(r=>r.from.line===0).length,1);
  assert(baseline.switcher['繁體'].results.some(r=>r.path==='档案/繁體说明.md'));
  return baseline;
}

async function verifySurfaces(page, evidence, {findOnly = false} = {}) {
  const setFull = value => page.evaluate(value=>app.plugins.plugins['cjk-search-probe'].setFullCompatibility(value),value);
  assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility),true);
  evidence.findCases = [];
  for (const mode of ['source','preview']) {
    await openFind(page,mode);
    for (const [query,count] of [['体',6],['发',3],['弁',4],['株式会社',2],['㍿',2],['FFI',2],
      ['土',1],['未',1],['丼',1],['鼠标',2],['滑鼠',1],['体 体',1],['/体/',0],[supplementary[1],2]]) {
      const actual = await findSnapshot(page,query,mode);
      assert.equal(actual.ranges.length,count,`${mode} ${query}`);
      assert(actual.count.endsWith(` / ${count}`));
      if (mode === 'preview' && query === '体')
        assert(actual.ranges.every(r=>['体','體'].includes(r.text.slice(r.start,r.end))));
      if (mode === 'preview' && query === supplementary[1])
        assert.deepEqual(actual.ranges.map(r=>r.text.slice(r.start,r.end)).sort(),supplementary.slice().sort());
      evidence.findCases.push({mode,...actual});
    }
    await setFull(false);
    await findSnapshot(page,'PRIVATEQUERYSENTINELxyz',mode);
    const nativeCompatibility = await findSnapshot(page,'1',mode);
    assert.equal(nativeCompatibility.ranges.length,mode==='source'?2:1,'Retain each surface native compatibility');
    await setFull(true);
    assert.equal((await findSnapshot(page,'①',mode)).ranges.length,2);
    assert.equal((await findSnapshot(page,'体'.repeat(257),mode)).ranges.length,0);
    await findSnapshot(page,'体',mode);
    const current = () => page.evaluate(mode=>{
      const view=app.workspace.activeLeaf.view;
      return mode==='source'?JSON.stringify(view.editMode.search.cursor.current()):String(view.previewMode.search.selectedRange);
    },mode);
    const before = await current();
    const buttons = page.locator('[data-cjk-surface-active] .document-search-buttons button:visible');
    await buttons.nth(1).click(); assert.notEqual(await current(),before);
    await buttons.nth(0).click(); assert.equal(await current(),before);
    await page.screenshot({path:path.join(evidence.root,`find-${mode}.png`)});
    await findInput(page).press('Escape');
  }
  // Exercise real replacement only in the dedicated throwaway fixture. Undo it
  // afterwards, so the outer byte-for-byte assertion still covers every note.
  await openFind(page,'source','Find替换夹具.md');
  assert.equal((await findSnapshot(page,'体','source')).ranges.length,3);
  await page.evaluate(()=>{
    window.oldEnhancedCursor=app.workspace.activeLeaf.view.editMode.search.cursor;
    app.commands.executeCommandById('editor:open-search-replace');
  });
  assert.equal((await findSnapshot(page,'体','source')).ranges.length,1);
  await page.locator('.document-replace-input:visible').fill('X');
  await page.locator('.document-replace-buttons button:visible').nth(1).click();
  await page.waitForFunction(()=>app.workspace.activeLeaf.view.editor.getValue()==='體 X 體\n');
  const replacement = await page.evaluate(async()=>{
    const view=app.workspace.activeLeaf.view;
    await view.save();
    let blocked=false;
    try { oldEnhancedCursor.replaceAll('BAD'); } catch { blocked=true; }
    const after=view.editor.getValue();
    view.editor.undo(); await view.save();
    return {blocked,after,restored:view.editor.getValue()};
  });
  assert.deepEqual(replacement,{blocked:true,after:'體 X 體\n',restored:'體 体 體\n'});
  evidence.replacement = replacement;
  await findInput(page).press('Escape');
  await openFind(page,'source');
  await findSnapshot(page,'体','source');
  await page.evaluate(async()=>{
    window.firstFindLeaf=app.workspace.activeLeaf;
    window.secondFindLeaf=app.workspace.getLeaf('split');
    await secondFindLeaf.openFile(app.vault.getAbstractFileByPath('體育研究.md'),{active:true});
  });
  await openFind(page,'source');
  await findSnapshot(page,'体','source');
  evidence.parallelFind = await page.evaluate(()=>[firstFindLeaf,secondFindLeaf].map(leaf=>leaf.view.editMode.search.cursor.findAll().length));
  assert.deepEqual(evidence.parallelFind,[6,6]);
  await findInput(page).press('Escape');
  await page.evaluate(()=>{secondFindLeaf.detach();firstFindLeaf.view.editMode.search.hide();app.workspace.setActiveLeaf(firstFindLeaf,{focus:true});});
  await openFind(page,'source');
  await page.evaluate(()=>{
    const expander=app.plugins.plugins['cjk-search-probe'].expander;
    window.savedLiteral=expander.expandLiteral;
    expander.expandLiteral=()=>{throw new Error('PRIVATEQUERYSENTINELxyz');};
  });
  try { assert.equal((await findSnapshot(page,'体','source')).ranges.filter(r=>r.from.line===0).length,1); }
  finally { await page.evaluate(()=>{app.plugins.plugins['cjk-search-probe'].expander.expandLiteral=savedLiteral;delete window.savedLiteral;}); }
  assert.equal((await findSnapshot(page,'发','source')).ranges.length,3);
  await findInput(page).press('Escape');
  await openFind(page,'source','Find替换夹具.md');
  await findInput(page).press('Escape');
  if (!findOnly) {
    evidence.switcherCases = [];
    for (const [query,alias] of [['体育',null],['体研',null],['发型','髮型指南']]) {
      const result = await switcherSnapshot(page,query);
      assert(result.results.some(row=>alias?row.alias===alias:row.path==='體育研究.md'),`Open file: ${query}`);
      evidence.switcherCases.push(result);
    }
    for (const [query,file,ranges] of [['体','瓣體髮.md'],['发','瓣體髮.md'],['弁','瓣體髮.md'],
      ['株式会社',sequenceFilename,[[0,1]]],[supplementary[1],sequenceFilename,[[1,3]]]]) {
      const result=await switcherSnapshot(page,query);
      const row=result.results.find(row=>row.type==='file'&&row.path===file);
      assert(row,`Original filename missing: ${query}`);
      if(ranges) assert.deepEqual(row.match.matches,ranges);
      evidence.switcherCases.push(result);
    }
    for (const query of ['土','未','丼']) assert.equal((await switcherSnapshot(page,query)).results.length,0);
    await page.evaluate(()=>{
      const expander=app.plugins.plugins['cjk-search-probe'].expander;
      window.savedCanonical=expander.canonicalize;
      expander.canonicalize=()=>{throw new Error('PRIVATEQUERYSENTINELxyz');};
    });
    try { assert.equal((await switcherSnapshot(page,'体育')).results.length,0); }
    finally { await page.evaluate(()=>{app.plugins.plugins['cjk-search-probe'].expander.canonicalize=savedCanonical;delete window.savedCanonical;}); }
    assert((await switcherSnapshot(page,'体育')).results.some(row=>row.path==='體育研究.md'));
    // Actual rendered fuzzy highlighting and actual file navigation (start from
    // the different replacement fixture, not the file we're about to open).
    await page.evaluate(()=>app.commands.executeCommandById('switcher:open'));
    await page.locator('.prompt-input:visible').fill('体研');
    const item = page.locator('.suggestion-item').filter({hasText:'體育研究'});
    await item.waitFor({state:'visible'});
    await page.screenshot({path:path.join(evidence.root,'open-file-fuzzy.png')});
    evidence.fuzzyHighlights = await item.locator('.suggestion-highlight').allTextContents();
    assert.deepEqual(evidence.fuzzyHighlights,['體','研']);
    await item.click();
    await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='體育研究.md');
    // Native type filters and original result scores remain authoritative.
    await page.evaluate(async()=>{
      await app.vault.create('體.svg','<svg xmlns="http://www.w3.org/2000/svg"/>');
      await app.vault.create('體.pdf','synthetic file; never opened as a PDF');
      await app.vault.create('體.xyz','synthetic unsupported attachment');
      app.commands.executeCommandById('switcher:open');
    });
    evidence.typeFilters = await page.evaluate(()=>{
      const modal=app.internalPlugins.getEnabledPluginById('switcher').activeModal;
      const paths=()=>modal.getSuggestions('体').filter(r=>r.file).map(r=>r.file.path);
      const originalFlags={images:modal.shouldShowImages,attachments:modal.shouldShowNonImageAttachments,all:modal.shouldShowAllTypes};
      modal.shouldShowImages=false; modal.shouldShowNonImageAttachments=false; modal.shouldShowAllTypes=false;
      const base=paths();
      modal.shouldShowImages=true; modal.shouldShowNonImageAttachments=true;
      const registered=paths(); modal.shouldShowAllTypes=true;
      const all=paths();
      const native=Object.getPrototypeOf(modal).getSuggestions.call(modal,'体');
      const enhanced=modal.getSuggestions('体');
      const preserved=native.every(row=>enhanced.some(r=>r.type===row.type&&r.file===row.file&&r.alias===row.alias&&JSON.stringify(r.match)===JSON.stringify(row.match)));
      const recent=Object.getPrototypeOf(modal).getSuggestions.call(modal,'');
      const sameRecent=JSON.stringify(recent.map(r=>r.file?.path))===JSON.stringify(modal.getSuggestions('').map(r=>r.file?.path));
      modal.close();return {originalFlags,base,registered,all,preserved,sameRecent};
    });
    assert(!evidence.typeFilters.base.some(p=>/\.(svg|pdf|xyz)$/.test(p)));
    assert(evidence.typeFilters.registered.includes('體.svg')&&evidence.typeFilters.registered.includes('體.pdf'));
    assert(!evidence.typeFilters.registered.includes('體.xyz'));
    assert(evidence.typeFilters.all.includes('體.xyz'));
    assert(evidence.typeFilters.preserved&&evidence.typeFilters.sameRecent);
    // Leave the new empty note only inside this isolated test vault.
    await page.evaluate(()=>app.commands.executeCommandById('switcher:open'));
    await page.locator('.prompt-input:visible').fill('NEWCJKCREATESENTINEL體');
    await page.waitForFunction(()=>{
      const modal=app.internalPlugins.getEnabledPluginById('switcher').activeModal;
      return modal.chooser.values?.length===1 && modal.chooser.values[0]===null;
    });
    await page.locator('.prompt-input:visible').press('Enter');
    await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='NEWCJKCREATESENTINEL體.md');
    evidence.creationKeptOriginalName = true;
    await page.evaluate(()=>app.commands.executeCommandById('switcher:open'));
    evidence.candidateBenchmark = await page.evaluate(()=>{
      const modal=app.internalPlugins.getEnabledPluginById('switcher').activeModal;
      const original=Object.getPrototypeOf(modal).getSuggestions;
      const rows=[];
      for (const count of [100,1000,10000]) {
        const files=Array.from({length:count},(_,i)=>({path:`synthetic/體研究${i}.md`,extension:'md'}));
        const facade=Object.create(modal);
        // A test-only receiver, NOT mutation of app.vault or any real TFile.
        facade.app={...modal.app,vault:{getFiles:()=>files},
          metadataCache:{isUserIgnored:()=>false,getFileCache:()=>({frontmatter:{aliases:['髮型指南']}}),unresolvedLinks:{}},
          internalPlugins:{getEnabledPluginById:()=>null}};
        const native=[],enhanced=[];
        let resultCount=0;
        for (let i=0;i<4;i++) {
          let start=performance.now(); original.call(facade,'体');
          if(i) native.push(performance.now()-start);
          start=performance.now();resultCount=modal.getSuggestions.call(facade,'体').length;
          if(i) enhanced.push(performance.now()-start);
        }
        native.sort((a,b)=>a-b);enhanced.sort((a,b)=>a-b);
        rows.push({candidates:count,resultCount,nativeMedianMs:native[1],enhancedMedianMs:enhanced[1]});
      }
      modal.close();return rows;
    });
    assert(evidence.candidateBenchmark.every(row=>row.resultCount===row.candidates));
  }
  await setFull(false);
  await page.evaluate(async()=>{await app.plugins.disablePlugin('cjk-search-probe');await app.plugins.enablePlugin('cjk-search-probe');});
  assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility),false);
  await setFull(true);
  // Refresh native state after disabling, checking both adapters really restore.
  await page.evaluate(()=>app.plugins.disablePlugin('cjk-search-probe'));
  await openFind(page,'source');
  assert.equal((await findSnapshot(page,'体','source')).ranges.filter(r=>r.from.line===0).length,1);
  await findInput(page).press('Escape');
  await openFind(page,'preview');
  assert.equal((await findSnapshot(page,'体','preview')).ranges.length,2);
  await findInput(page).press('Escape');
  assert.equal((await switcherSnapshot(page,'体育')).results.length,0);
  assert(!evidence.probeLogs.some(line=>line.includes('PRIVATEQUERYSENTINEL')));
  evidence.restoredSurfaces = true;
}

module.exports = {fixtures, captureBaseline, verifySurfaces, openFind, findSnapshot, switcherSnapshot};
