'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {openFind,findSnapshot,switcherSnapshot} = require('./surfaces.cjs');

// Called only by the existing isolated-vault harness after its realpath check.
async function verifySettings(page, context, evidence) {
  async function openSettings() {
    const opened=context.waitForEvent('page');
    await page.evaluate(()=>app.setting.open());
    const settings=await opened;
    settings.on('pageerror',error=>evidence.pageErrors.push(error.message));
    await settings.locator('[data-setting-id="cjk-search-probe"]').click();
    await settings.locator('.setting-item-name').getByText('Compatibility characters',{exact:true}).waitFor();
    return settings;
  }
  const row=(settings,label)=>settings.locator('.setting-item').filter({
    has:settings.locator('.setting-item-name').getByText(label,{exact:true}),
  });
  async function change(label,key,value) {
    const settings=await openSettings();
    await row(settings,label).locator('.checkbox-container').click();
    await page.waitForFunction(({key,value})=>app.plugins.plugins['cjk-search-probe'].settings[key]===value,{key,value});
    await page.evaluate(()=>app.setting.close());
  }
  let settings=await openSettings();
  assert.equal(await settings.locator('.checkbox-container:visible').count(),8);
  assert.equal(await settings.locator('.setting-item-name').getByText('Graph view',{exact:true}).count(),1);
  await settings.setViewportSize({width:1000,height:800});
  await settings.screenshot({path:path.join(evidence.root,'settings-desktop.png')});
  await settings.evaluate(()=>{document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');});
  await settings.screenshot({path:path.join(evidence.root,'settings-dark.png')});
  await settings.evaluate(()=>{document.body.classList.remove('theme-dark');document.body.classList.add('theme-light');});
  await settings.setViewportSize({width:600,height:800});
  await settings.screenshot({path:path.join(evidence.root,'settings-narrow.png')});
  assert(await settings.locator('.vertical-tab-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Settings must not overflow horizontally');
  await page.evaluate(()=>app.setting.close());

  // Existing Find stays open while changing its setting in the actual UI.
  for(const mode of ['source','preview']) {
    await openFind(page,mode);assert.equal((await findSnapshot(page,'体',mode)).ranges.length,6);
    await change('Find','findEnabled',false);
    assert.equal((await findSnapshot(page,'体',mode)).ranges.length,2);
    assert((await switcherSnapshot(page,'体育')).results.some(r=>r.path==='體育研究.md'));
    await change('Find','findEnabled',true);
    assert.equal((await findSnapshot(page,'体',mode)).ranges.length,6);
    await page.locator('[data-cjk-surface-active] .document-search-input input:visible').press('Escape');
  }
  await change('Quick switcher','quickSwitcherEnabled',false);
  assert.equal((await switcherSnapshot(page,'体育')).results.length,0);
  await openFind(page,'source');assert.equal((await findSnapshot(page,'体','source')).ranges.length,6);
  await page.locator('[data-cjk-surface-active] .document-search-input input:visible').press('Escape');
  await change('Quick switcher','quickSwitcherEnabled',true);
  assert((await switcherSnapshot(page,'体育')).results.some(r=>r.path==='體育研究.md'));

  await change('Search','searchEnabled',false);
  await page.evaluate(async()=>{
    const leaf=app.workspace.getLeftLeaf(false);await leaf.setViewState({type:'search',active:true});
    window.settingsSearchView=leaf.view;settingsSearchView.setQuery('体');
  });
  await page.waitForFunction(()=>settingsSearchView.searchQuery?.query==='体'&&!settingsSearchView.dom.working);
  const native=await page.evaluate(()=>settingsSearchView.dom.getMatchCount());
  await change('Search','searchEnabled',true);
  await page.evaluate(()=>settingsSearchView.setQuery('體'));
  await page.waitForFunction(()=>settingsSearchView.searchQuery?.query==='體'&&!settingsSearchView.dom.working);
  const enhanced=await page.evaluate(()=>settingsSearchView.dom.getMatchCount());
  assert(enhanced>native,'Re-enabling Search must add equivalent matches');

  // Preference remains editable when the host feature itself is disabled.
  await page.evaluate(()=>app.internalPlugins.getPluginById('switcher').disable());
  settings=await openSettings();
  assert.match(await row(settings,'Quick switcher').textContent(),/Enable Quick switcher in Core plugins/);
  assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.quickSwitcherEnabled),true);
  await settings.screenshot({path:path.join(evidence.root,'settings-core-disabled.png')});
  await page.evaluate(()=>app.setting.close());
  await page.evaluate(()=>app.internalPlugins.getPluginById('switcher').enable());

  // Persist an explicit off choice, then reopen both plugin and settings page.
  await change('Find','findEnabled',false);
  await page.evaluate(async()=>{await app.plugins.disablePlugin('cjk-search-probe');await app.plugins.enablePlugin('cjk-search-probe');});
  assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.findEnabled),false);
  await change('Find','findEnabled',true);
  settings=await openSettings();
  const compatibility=row(settings,'Compatibility characters').locator('.checkbox-container');
  await compatibility.focus();await compatibility.press('Space');
  await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility===false);
  await compatibility.press('Space');
  await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility===true);
  await page.evaluate(()=>app.setting.close());
  evidence.settingsUI={controls:8,findModes:['source','preview'],independentToggles:true,
    persistedOff:true,coreDisabledHint:true,keyboardToggle:true,nativeSearchMatches:native,enhancedSearchMatches:enhanced,
    visualCoverage:'Desktop native settings, light/dark CSS themes and 600px window; not iOS WebKit'};
}
module.exports={verifySettings};
