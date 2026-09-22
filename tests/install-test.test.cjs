const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installTestPlugin } = require('../scripts/install-test.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'cjk-install-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source = path.join(root,'dist'), vault = path.join(root,'vault');
  const target = path.join(vault,'.obsidian/plugins/cjk-search-probe');
  await fs.mkdir(path.join(source,'LICENSES'),{recursive:true});
  await fs.mkdir(target,{recursive:true});
  await fs.writeFile(path.join(source,'main.js'),'new plugin');
  await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify({id:'cjk-search-probe',version:'0.1.0'}));
  await fs.writeFile(path.join(source,'THIRD_PARTY_NOTICES.md'),'notices');
  for (const name of ['Unicode-LICENSE.txt','OpenCC-LICENSE.txt']) await fs.writeFile(path.join(source,'LICENSES',name),'license');
  await fs.writeFile(path.join(target,'main.js'),'old plugin');
  await fs.writeFile(path.join(target,'manifest.json'),'{"id":"cjk-search-probe","version":"0.0.2"}');
  await fs.writeFile(path.join(target,'data.json'),'{"fullCompatibility":true,"private":"untouched"}');
  await fs.writeFile(path.join(vault,'user-note.md'),'user note never overwritten');
  return {root,source,vault,target};
}

test('only explicit plugin artifacts change, old files are backed up',async t=>{
  const f = await fixture(t);
  const note = await fs.readFile(path.join(f.vault,'user-note.md'));
  const settings = await fs.readFile(path.join(f.target,'data.json'));
  const result = await installTestPlugin(f.source,f.vault);
  t.after(()=>fs.rm(result.backupDir,{recursive:true,force:true}));
  assert.equal(await fs.readFile(path.join(f.target,'main.js'),'utf8'),'new plugin');
  assert.deepEqual(await fs.readFile(path.join(f.vault,'user-note.md')),note);
  assert.deepEqual(await fs.readFile(path.join(f.target,'data.json')),settings);
  assert.equal(await fs.readFile(path.join(result.backupDir,'main.js'),'utf8'),'old plugin');
  assert(!result.files.includes('data.json'));
});
test('wrong ID, missing license and source/target overlap fail before changing target',async t=>{
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source,'manifest.json'),'{"id":"wrong-plugin","version":"1"}');
  await assert.rejects(()=>installTestPlugin(f.source,f.vault),/manifest|identity/i);
  await fs.writeFile(path.join(f.source,'manifest.json'),'{"id":"cjk-search-probe","version":"0.1.0"}');
  await fs.unlink(path.join(f.source,'LICENSES/Unicode-LICENSE.txt'));
  await assert.rejects(()=>installTestPlugin(f.source,f.vault));
  await assert.rejects(()=>installTestPlugin(f.target,f.vault));
  assert.equal(await fs.readFile(path.join(f.target,'main.js'),'utf8'),'old plugin');
});
test('symlinked target artifact is rejected without following it',async t=>{
  const f = await fixture(t), outside = path.join(f.root,'outside.js');
  await fs.writeFile(outside,'outside original');
  await fs.unlink(path.join(f.target,'main.js'));
  await fs.symlink(outside,path.join(f.target,'main.js'));
  await assert.rejects(()=>installTestPlugin(f.source,f.vault),/symlink/i);
  assert.equal(await fs.readFile(outside,'utf8'),'outside original');
});
test('mid-install failure restores already replaced files',async t=>{
  const f = await fixture(t), rename = fs.rename;
  let calls = 0;
  const replacement = t.mock.method(fs,'rename',async (...args)=>{
    if (++calls === 2) throw new Error('simulated rename failure');
    return rename(...args);
  });
  await assert.rejects(()=>installTestPlugin(f.source,f.vault),/simulated rename failure/);
  replacement.mock.restore();
  assert.equal(await fs.readFile(path.join(f.target,'main.js'),'utf8'),'old plugin');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.target,'manifest.json'),'utf8')).version,'0.0.2');
});
