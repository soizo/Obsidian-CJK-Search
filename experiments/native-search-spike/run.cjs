// THROWAWAY feasibility probe, not a production plugin test suite.
// Run: node experiments/native-search-spike/run.cjs [--baseline]
// Uses a fresh profile + synthetic vault; never opens the user's real vault.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

(async () => {
  const fullData = process.argv.includes('--full-data');
  const surfaceBaseline = process.argv.includes('--surface-baseline');
  const settings = process.argv.includes('--settings');
  const surfaces = surfaceBaseline || process.argv.includes('--surfaces') || settings;
  const pluginArgument = process.argv.indexOf('--plugin-dir');
  if (pluginArgument >= 0 && !process.argv[pluginArgument + 1]) throw new Error('--plugin-dir requires a directory');
  const pluginSource = pluginArgument < 0 ? __dirname : path.resolve(process.argv[pluginArgument + 1]);
  let supplementary;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cjk-search-spike-'));
  const home = path.join(root, 'home');
  const profile = path.join(root, 'profile');
  const vault = path.join(root, 'CJK-Probe');
  for (const dir of [home, profile, path.join(vault, '.obsidian')]) {
    await fs.mkdir(dir, { recursive: true });
  }
  const fixtures = {
    'a-simplified.md': '前体后\n真\n人\n甲、乙\n',
    'b-variants.md': '前體后\n眞\n⼈\n甲､乙\n',
    'c-small-comma.md': '甲﹑乙\n无关文字\n',
  };
  if (fullData) {
    const table = require('../../data/character-data.json');
    supplementary = table.modes.eastAsian.entries.find(([a,b]) => a.length === 2 && [...b].length === 1 && a !== b && !'体真人、株式会社'.includes(b));
    assert(supplementary, 'Need an actual supplementary-plane fixture');
    Object.assign(fixtures, {
      'variants-a.md': '发\n弁\n⺅\n①\n㍿\nﬃ\n',
      'variants-b.md': '發\n辨\n亻\n1\n株式会社\nffi\n',
      'variants-c.md': '髮\n瓣\n辯\n²\nＡ\n前Ａ后\n',
      'negative-a.md': '土\n未\n丼\n鼠标\n',
      'negative-b.md': '士\n末\n井\n滑鼠\n鼠標\n',
      'unicode-a.md': `前${supplementary[0]}后\n`,
      'unicode-b.md': `前${supplementary[1]}后\n`,
    });
  }
  if (surfaces) Object.assign(fixtures, require('./surfaces.cjs').fixtures);
  for (const [name, content] of Object.entries(fixtures)) {
    await fs.mkdir(path.dirname(path.join(vault, name)), {recursive:true});
    await fs.writeFile(path.join(vault, name), content);
  }
  await fs.writeFile(path.join(profile, 'obsidian.json'), JSON.stringify({
    updateDisabled: true,
    vaults: { cjkprobe000000001: { path: vault, ts: Date.now(), open: true } },
  }));
  await fs.writeFile(path.join(vault, '.obsidian', 'core-plugins.json'), JSON.stringify(surfaces ? ['global-search', 'switcher'] : ['global-search']));
  console.log('ISOLATED RUN', root);
  let application;
  let child;
  let deadline;
  const evidence = { root, vault, fullData, surfaces, surfaceBaseline, pluginSource, baseline: process.argv.includes('--baseline'), assertions: [], pageErrors: [], probeLogs: [] };
  try {
    // Packaged Obsidian exposes renderer CDP, but not the main-process
    // --inspect endpoint required by Playwright's experimental Electron launcher.
    child = spawn('/Applications/Obsidian.app/Contents/MacOS/Obsidian', [
      // Test-only keychain: this profile must never contain real credentials.
      `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--use-mock-keychain',
    ], { env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Renderer CDP endpoint not ready')), 20000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`App exited: ${code}`)); });
      let log = '';
      child.stderr.on('data', chunk => {
        log += chunk;
        const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.stdout.on('data', chunk => process.stdout.write(chunk));
    });
    console.log('CDP', endpoint);
    deadline = setTimeout(() => {
      console.error('HARNESS DEADLINE: terminating only the isolated app');
      child.kill('SIGTERM');
    }, 150000);
    application = await chromium.connectOverCDP(endpoint);
    const context = application.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page');
    page.on('pageerror', error => { evidence.pageErrors.push(error.message); console.error('PAGE ERROR', error.message); });
    page.on('console', msg => {
      if (msg.text().startsWith('[CJK-Probe]')) {
        evidence.probeLogs.push(msg.text());
        console.log(msg.text());
      } else if (msg.type() === 'error') console.error('CONSOLE', msg.text());
    });
    console.log('CONNECTED', page.url());
    console.log('PAGE STATE', await page.evaluate(() => ({ ready: document.readyState, app: !!window.app, body: document.body.innerText.slice(0, 1500) })));
    await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 20000 });
    console.log('LAYOUT READY');
    evidence.actualVault = await page.evaluate(() => app.vault.adapter.getBasePath());
    assert.equal(await fs.realpath(evidence.actualVault), await fs.realpath(vault), 'Must only test the isolated vault');
    await page.waitForFunction(count => app.vault.getMarkdownFiles().length === count, Object.keys(fixtures).length);
    console.log('VAULT READY', evidence.actualVault);
    if (surfaces) {
      const checks = require('./surfaces.cjs');
      evidence.surfaceBaseline = await checks.captureBaseline(page);
      console.log('PASS native surface baseline', JSON.stringify(evidence.surfaceBaseline));
      if (!surfaceBaseline) {
        const pluginDir = path.join(vault, '.obsidian/plugins/cjk-search-probe');
        await fs.mkdir(pluginDir, {recursive:true});
        evidence.pluginHashes = {};
        for (const name of ['main.js','manifest.json']) {
          const bytes = await fs.readFile(path.join(pluginSource,name));
          await fs.writeFile(path.join(pluginDir,name),bytes);
          evidence.pluginHashes[name] = createHash('sha256').update(bytes).digest('hex');
        }
        await page.evaluate(async () => {
          await app.plugins.loadManifests(); await app.plugins.setEnable(true);
          await app.plugins.enablePlugin('cjk-search-probe');
          if (!app.plugins.plugins['cjk-search-probe']) throw new Error('Plugin did not load');
        });
        if (settings) await require('./settings.cjs').verifySettings(page,context,evidence);
        await checks.verifySurfaces(page,evidence,{findOnly:process.argv.includes('--find-only')});
      }
      for (const [name, original] of Object.entries(fixtures))
        assert.equal(await fs.readFile(path.join(vault,name),'utf8'),original, 'Surface checks must not modify notes');
    } else {
    await page.evaluate(async () => {
      const leaf = app.workspace.getLeftLeaf(false);
      await leaf.setViewState({ type: 'search', active: true });
      await app.workspace.revealLeaf(leaf);
      app.workspace.leftSplit.expand();
      window.probeView = leaf.view;
      probeView.containerEl.dataset.cjkProbeView = 'true';
      probeView.setQuery('體');
    });
    console.log('QUERY SUBMITTED');
    await page.waitForFunction(() => window.probeView?.dom?.getMatchCount() >= 1);
    evidence.native = await page.evaluate(() => ({
      input: probeView.searchComponent.getValue(),
      state: probeView.getState(),
      matchCount: probeView.dom.getMatchCount(),
      resultText: probeView.containerEl.innerText,
      resultHTML: probeView.dom.el.innerHTML,
      domKeys: Object.keys(probeView.dom),
      queryKeys: Object.keys(probeView.searchQuery),
    }));
    console.log('NATIVE', JSON.stringify(evidence.native));
    assert.equal(evidence.native.input, '體');
    if (evidence.baseline) {
      // Expected red: native search only finds the literal traditional form.
      assert.equal(evidence.native.matchCount, 2, 'Cross-script query should find both fixture files');
    }
    if (!evidence.baseline) {
      const pluginDir = path.join(vault, '.obsidian/plugins/cjk-search-probe');
      await fs.mkdir(pluginDir, { recursive: true });
      for (const name of ['main.js', 'manifest.json']) {
        await fs.copyFile(path.join(pluginSource, name), path.join(pluginDir, name));
      }
      evidence.pluginHashes = {};
      for (const name of ['main.js','manifest.json']) evidence.pluginHashes[name] = createHash('sha256').update(await fs.readFile(path.join(pluginDir,name))).digest('hex');
      await page.evaluate(async () => {
        await app.plugins.loadManifests();
        await app.plugins.setEnable(true);
        await app.plugins.enablePlugin('cjk-search-probe');
        if (!app.plugins.plugins['cjk-search-probe']) throw new Error('Probe did not load');
        const input = probeView.searchComponent.inputEl;
        const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        window.probeWrites = [];
        Object.defineProperty(input, 'value', {
          configurable: true,
          get() { return value.get.call(this); },
          set(text) { probeWrites.push(text); value.set.call(this, text); },
        });
      });
      if (fullData) assert.deepEqual(evidence.probeLogs, [], 'Production loading must not emit debug logs');
      else {
        assert(evidence.probeLogs.some(line => line.includes(' loaded ')), 'Probe must visibly log successful loading');
        assert(evidence.probeLogs.some(line => line.includes(' attached ')), 'Probe must log native search hook attachment');
      }
      const cases = [
        ['体', ['a-simplified.md', 'b-variants.md'], [1, 2]],
        ['體', ['a-simplified.md', 'b-variants.md'], [1, 2]],
        ['真', ['a-simplified.md', 'b-variants.md'], [4, 5]],
        ['眞', ['a-simplified.md', 'b-variants.md'], [4, 5]],
        ['人', ['a-simplified.md', 'b-variants.md'], [6, 7]],
        ['⼈', ['a-simplified.md', 'b-variants.md'], [6, 7]],
        ['甲、乙', ['a-simplified.md', 'b-variants.md', 'c-small-comma.md'], null],
        ['甲､乙', ['a-simplified.md', 'b-variants.md', 'c-small-comma.md'], null],
        ['甲﹑乙', ['a-simplified.md', 'b-variants.md', 'c-small-comma.md'], null],
      ];
      for (const [query, expectedFiles, expectedRange] of cases) {
        await page.evaluate(query => { probeWrites.length = 0; probeView.setQuery(query); }, query);
        await page.waitForFunction(({query,count}) => probeView.searchQuery?.query === query && probeView.dom.getMatchCount() === count && !probeView.dom.working, {query,count:expectedFiles.length});
        const actual = await page.evaluate(() => {
          probeView.saveSearch();
          return {
            input: probeView.getQuery(), state: probeView.getState().query,
            originalQuery: probeView.searchQuery.query,
            writes: probeWrites.slice(), files: probeView.dom.getFiles().map(f => f.path).sort(),
            results: probeView.dom.vChildren.children.map(row => ({ keys: Object.keys(row), result: row.result })),
            recent: app.loadLocalStorage('recent-searches')[0],
          };
        });
        assert.equal(actual.input, query);
        assert.equal(actual.state, query);
        assert.equal(actual.originalQuery, query);
        assert.equal(actual.recent, query);
        assert(actual.writes.every(value => value === query), 'No transient expanded text may be written to the input');
        assert.deepEqual(actual.files, expectedFiles);
        if (expectedRange) {
          for (const row of actual.results) assert.deepEqual(row.result.content, [expectedRange]);
        }
        evidence.assertions.push({ query, ...actual });
        console.log('PASS', query, actual.files);
      }
      if (fullData) {
        const settingToggle = settingsPage => settingsPage.locator('.setting-item').filter({hasText:'Compatibility characters'}).locator('.checkbox-container');
        async function checkQuery(query, files) {
          await page.evaluate(query => { probeWrites.length = 0; probeView.setQuery(query); }, query);
          await page.waitForFunction(query => probeView.searchQuery?.query === query && !probeView.dom.working, query);
          const actual = await page.evaluate(() => ({input:probeView.getQuery(),original:probeView.searchQuery.query,
            files:probeView.dom.getFiles().map(f=>f.path).sort(),writes:probeWrites.slice(),
            ranges:probeView.dom.vChildren.children.map(row=>({file:row.file.path,content:row.result.content}))}));
          assert.equal(actual.input,query); assert.equal(actual.original,query);
          assert(actual.writes.every(value=>value===query));
          assert.deepEqual(actual.files,files.slice().sort(),`Full data: ${query}`);
          evidence.assertions.push({query,...actual});
          console.log('PASS FULL',query,actual.files);
          return actual;
        }
        assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility),true);
        await checkQuery('①',['variants-a.md','variants-b.md']);
        const defaultSettingsPage = await openSettingsWindow();
        await settingToggle(defaultSettingsPage).click();
        await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility===false);
        await page.evaluate(()=>app.setting.close());
        evidence.defaultCompatibilityOn = true;
        const abc = ['variants-a.md','variants-b.md','variants-c.md'];
        for (const query of ['发','發','髮','弁','瓣','辨','辯']) await checkQuery(query,abc);
        await checkQuery('⺅',['variants-a.md','variants-b.md']);
        for (const query of ['土','未','丼']) await checkQuery(query,['negative-a.md']);
        await checkQuery('鼠标',['negative-a.md','negative-b.md']);
        await checkQuery('滑鼠',['negative-b.md']);
        await checkQuery('①',['variants-a.md']);
        await checkQuery('1',['variants-b.md']);
        await checkQuery('㍿',['variants-a.md','variants-b.md']);
        const sequence = await checkQuery('株式会社',['variants-a.md','variants-b.md']);
        const compact = sequence.ranges.find(row=>row.file==='variants-a.md').content[0];
        const expanded = sequence.ranges.find(row=>row.file==='variants-b.md').content[0];
        assert.equal(compact[1]-compact[0],1); assert.equal(expanded[1]-expanded[0],4);
        const pane = page.locator('[data-cjk-probe-view]');
        await pane.locator('.global-search-input-container input').press('Escape');
        await pane.locator('.search-result-file-match').filter({hasText:'㍿'}).click();
        await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='variants-a.md' && [...document.querySelectorAll('.cm-content .is-flashing')].some(el=>el.textContent==='㍿'));
        await page.screenshot({path:path.join(root,'sequence-opened.png')});
        await checkQuery('㍿',['variants-a.md','variants-b.md']);
        await pane.locator('.global-search-input-container input').press('Escape');
        await pane.locator('.search-result-file-match').filter({hasText:'株式会社'}).click();
        await page.waitForFunction(()=>app.workspace.getActiveFile()?.path==='variants-b.md' && [...document.querySelectorAll('.cm-content .is-flashing')].some(el=>el.textContent==='株式会社'));
        evidence.reverseSequenceNavigation = await page.evaluate(()=>app.workspace.activeLeaf.view.editor.getCursor());
        assert.deepEqual(evidence.reverseSequenceNavigation,{line:4,ch:0});
        const unicodeResult = await checkQuery(supplementary[1],['unicode-a.md','unicode-b.md']);
        assert.deepEqual(unicodeResult.ranges.find(row=>row.file==='unicode-a.md').content,[[1,3]]);
        // Desktop 1.13.7 opens settings in a separate browser window.
        async function openSettingsWindow() {
          const opened = context.waitForEvent('page');
          await page.evaluate(()=>app.setting.open());
          const settingsPage = await opened;
          settingsPage.on('pageerror',error=>evidence.pageErrors.push(error.message));
          await settingsPage.locator('[data-setting-id="cjk-search-probe"]').click();
          return settingsPage;
        }
        let settingsPage = await openSettingsWindow();
        await settingToggle(settingsPage).click();
        await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility===true);
        await settingsPage.screenshot({path:path.join(root,'full-compatibility-setting.png')});
        await page.evaluate(()=>app.setting.close());
        await checkQuery('①',['variants-a.md','variants-b.md']);
        await checkQuery('1',['variants-a.md','variants-b.md']);
        await checkQuery('2',['variants-c.md']);
        await checkQuery('前A后',['variants-c.md']);
        await checkQuery('FFI',['variants-a.md','variants-b.md']);
        await page.evaluate(()=>probeView.setState({...probeView.getState(),matchingCase:true},{}));
        await checkQuery('FFI',[]);
        await checkQuery('ffi',['variants-a.md','variants-b.md']);
        await page.evaluate(()=>probeView.setState({...probeView.getState(),matchingCase:false},{}));
        await page.evaluate(async()=>{await app.plugins.disablePlugin('cjk-search-probe');await app.plugins.enablePlugin('cjk-search-probe');});
        assert.equal(await page.evaluate(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility),true);
        settingsPage = await openSettingsWindow();
        await settingToggle(settingsPage).click();
        await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].settings.fullCompatibility===false);
        await page.evaluate(()=>app.setting.close());
        await checkQuery('①',['variants-a.md']);
        await checkQuery('体'.repeat(257),[]);
        assert(evidence.probeLogs.some(line=>line.includes('input-limit')));
        // Inject only a constructor failure, leaving the real native matcher intact.
        await page.evaluate(()=>{
          window.savedProbeHook=probeView.renderSearchInfo;
          probeView.renderSearchInfo=function(...args){
            if(this.searchQuery?.matcher===args[0]) this.searchQuery.constructor=class {constructor(){throw new Error('synthetic failure');}};
            return savedProbeHook.apply(this,args);
          };
        });
        try { await checkQuery('体',['a-simplified.md']); }
        finally { await page.evaluate(()=>{probeView.renderSearchInfo=savedProbeHook;delete window.savedProbeHook;}); }
        assert(evidence.probeLogs.some(line=>line.includes('native-interface-error')));
        await checkQuery('體',['a-simplified.md','b-variants.md']);
        // A panel created after onload is enhanced as well.
        await page.evaluate(async()=>{
          const leaf=app.workspace.getRightLeaf(false);
          await leaf.setViewState({type:'search',active:true});
          window.additionalProbeLeaf=leaf;
        });
        await page.waitForFunction(()=>app.plugins.plugins['cjk-search-probe'].patched.has(additionalProbeLeaf.view));
        await checkQuery('发',['variants-a.md','variants-b.md','variants-c.md']);
        await page.evaluate(()=>additionalProbeLeaf.view.setQuery('发'));
        await page.waitForFunction(()=>additionalProbeLeaf.view.dom.getMatchCount()===3 && !additionalProbeLeaf.view.dom.working);
        evidence.parallelPanels = await page.evaluate(()=>[probeView,additionalProbeLeaf.view].map(view=>view.dom.getFiles().map(file=>file.path).sort()));
        assert.deepEqual(evidence.parallelPanels[0],evidence.parallelPanels[1]);
        const incompatible = await page.evaluate(()=>{
          const plugin=app.plugins.plugins['cjk-search-probe'], view=additionalProbeLeaf.view;
          const record=plugin.patched.get(view);
          plugin.removeChild(record.component); plugin.patched.delete(view);
          const original=view.renderSearchInfo;
          view.renderSearchInfo=undefined;
          try { plugin.attachViews('test-incompatible'); return !plugin.patched.has(view); }
          finally { view.renderSearchInfo=original; view.setQuery('体'); }
        });
        assert(incompatible,'Incompatible view must not receive a half-installed hook');
        await page.waitForFunction(()=>additionalProbeLeaf.view.searchQuery?.query==='体' && !additionalProbeLeaf.view.dom.working);
        assert.deepEqual(await page.evaluate(()=>additionalProbeLeaf.view.dom.getFiles().map(file=>file.path)),['a-simplified.md']);
        assert(evidence.probeLogs.some(line=>line.includes('incompatible-view')));
        await page.evaluate(()=>additionalProbeLeaf.detach());
      }
      // Exercise the actual input event path, not just programmatic setQuery.
      const pane = page.locator('[data-cjk-probe-view]');
      const input = pane.locator('.global-search-input-container input');
      await page.evaluate(() => { probeWrites.length = 0; });
      await input.fill('前体后');
      await page.waitForFunction(() => probeView.dom.getMatchCount() === 2 && !probeView.dom.working);
      assert.equal(await input.inputValue(), '前体后');
      await page.waitForFunction(() => {
        const matches = probeView.containerEl.querySelectorAll('.search-result-file-matched-text');
        return matches.length === 2 && [...matches].every(el => ['前体后', '前體后'].includes(el.textContent));
      });
      evidence.rendered = await pane.locator('.search-result-container').innerText();
      evidence.highlights = await pane.locator('.search-result-file-matched-text').allTextContents();
      assert.deepEqual(evidence.highlights.slice().sort(), ['前体后', '前體后'].sort());
      evidence.typingWrites = await page.evaluate(() => probeWrites.slice());
      assert(evidence.typingWrites.every(value => value === '前体后'));
      assert(evidence.rendered.includes('前体后') && evidence.rendered.includes('前體后'), 'Native UI must show both original source strings');
      await input.press('Escape');
      await page.screenshot({ path: path.join(root, 'native-results.png') });
      await pane.locator('.search-result-file-match').filter({ hasText: '前體后' }).click();
      await page.waitForFunction(() => app.workspace.getActiveFile()?.path === 'b-variants.md');
      // Native search flashes the match and moves the cursor; it does not
      // select the match as editable text (verified in the native handler).
      await page.waitForFunction(() => [...document.querySelectorAll('.cm-content .is-flashing')].some(el => el.textContent === '前體后'));
      evidence.opened = await page.evaluate(() => ({
        file: app.workspace.getActiveFile().path,
        cursor: app.workspace.activeEditor.editor.getCursor(),
        highlights: [...document.querySelectorAll('.cm-content .is-flashing')].map(el => el.textContent),
      }));
      assert.deepEqual(evidence.opened, { file: 'b-variants.md', cursor: { line: 0, ch: 0 }, highlights: ['前體后'] });
      await page.screenshot({ path: path.join(root, 'native-opened.png') });
      await page.evaluate(async () => {
        await probeView.setState({ ...probeView.getState(), query: '眞' }, {});
      });
      await page.waitForFunction(() => probeView.dom.getMatchCount() === 2 && !probeView.dom.working);
      evidence.stateRestoration = await page.evaluate(() => ({ input: probeView.getQuery(), files: probeView.dom.getFiles().map(f => f.path).sort() }));
      assert.deepEqual(evidence.stateRestoration, { input: '眞', files: ['a-simplified.md', 'b-variants.md'] });
      console.log('PASS typed input, rendered highlights, click navigation, restored view state');
      await page.evaluate(() => probeView.setQuery('PRIVATEQUERYSENTINELxyz'));
      await page.waitForFunction(() => probeView.searchQuery?.query === 'PRIVATEQUERYSENTINELxyz' && !probeView.dom.working);
      await page.evaluate(() => probeView.setQuery('path:a 体'));
      await page.waitForFunction(() => probeView.searchQuery?.query === 'path:a 体' && !probeView.dom.working);
      await page.evaluate(() => {
        if (!app.commands.executeCommandById('cjk-search-probe:print-diagnostics')) throw new Error('Diagnostic command unavailable');
      });
      if (fullData) {
        const line = evidence.probeLogs.find(line => line.includes(' diagnostics '));
        assert(line, 'Explicit diagnostics must still be available');
        const diagnostic = JSON.parse(line.slice(line.indexOf('{')));
        assert(diagnostic.views.some(view => view.counters.inputs > 0 && view.counters.expanded > 0 && view.counters.skipped > 0));
      } else {
        for (const event of ['input', 'expanded', 'skipped', 'diagnostics']) {
          assert(evidence.probeLogs.some(line => line.includes(` ${event} `)), `Missing diagnostic event: ${event}`);
        }
        assert(evidence.probeLogs.some(line => line.includes('no-sample-mapping')));
      }
      assert(evidence.probeLogs.some(line => line.includes('unsupported-syntax')));
      assert(!evidence.probeLogs.some(line => line.includes('PRIVATEQUERYSENTINEL')), 'Logs must not expose raw queries');
      await page.evaluate(async () => {
        await app.plugins.disablePlugin('cjk-search-probe');
        probeView.setQuery('體');
      });
      await page.waitForFunction(() => probeView.dom.getMatchCount() === 1 && !probeView.dom.working);
      const restored = await page.evaluate(() => ({ input: probeView.getQuery(), files: probeView.dom.getFiles().map(f => f.path) }));
      assert.deepEqual(restored, { input: '體', files: ['b-variants.md'] });
      evidence.restored = restored;
      if (fullData) {
        assert(!evidence.probeLogs.some(line => / (module-evaluated|loaded|attached|input|expanded|skipped|unloaded|scan-views|settings-changed) /.test(line)),
          'Production lifecycle and searches must not emit debug logs');
      } else {
        assert(evidence.probeLogs.some(line => line.includes(' unloaded ')), 'Probe must log cleanup');
        assert(evidence.probeLogs.some(line => line.includes(' unloaded ') && /"restoredViews":[1-9]/.test(line)), 'Cleanup logs must report actual restored views');
      }
      const logCount = evidence.probeLogs.length;
      await input.fill('真');
      await page.waitForFunction(() => probeView.dom.getMatchCount() === 1 && !probeView.dom.working);
      assert.equal(evidence.probeLogs.length, logCount, 'Input logging must be removed on unload');
      for (const [name, original] of Object.entries(fixtures)) {
        assert.equal(await fs.readFile(path.join(vault, name), 'utf8'), original, 'Probe must not modify notes');
      }
      console.log('PASS input events, native rendering, unload restoration, unchanged notes');
    }
    }
    assert.deepEqual(evidence.pageErrors, [], 'No unhandled page exceptions');
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = error.stack;
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
    }
    if (application) await application.close();
    await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log('EVIDENCE', path.join(root, 'evidence.json'));
  }
})();
