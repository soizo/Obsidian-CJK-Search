const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname,'..');
const REQUIRED = ['main.js','manifest.json','THIRD_PARTY_NOTICES.md','LICENSES/Unicode-LICENSE.txt','LICENSES/OpenCC-LICENSE.txt'];

async function plainDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) throw new Error('Refusing symlink directory');
  if (!stat.isDirectory()) throw new Error('Expected directory');
  return fs.realpath(directory);
}
async function inspect(root, relative) {
  const parts = relative.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current,parts[i]);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Refusing symlink artifact or parent');
    if (i < parts.length-1 && !stat.isDirectory()) throw new Error('Expected artifact directory');
    if (i === parts.length-1) return stat;
  }
}

async function installTestPlugin(sourceDir, vaultDir) {
  const source = await plainDirectory(sourceDir), vault = await plainDirectory(vaultDir);
  const relative = '.obsidian/plugins/cjk-search-probe';
  const target = path.join(vault,relative);
  if (source === target || source.startsWith(target+path.sep) || target.startsWith(source+path.sep))
    throw new Error('Source and target overlap');
  const targetStat = await inspect(vault,relative);
  if (targetStat && !targetStat.isDirectory()) throw new Error('Plugin target must be directory');
  const files = [...REQUIRED];
  if (await inspect(source,'LICENSES/OpenCC-NOTICE.txt')) files.push('LICENSES/OpenCC-NOTICE.txt');
  const next = new Map(), previous = new Map();
  for (const name of files) {
    const stat = await inspect(source,name);
    if (!stat?.isFile() || stat.size === 0) throw new Error('Missing or empty plugin artifact: '+name);
    const old = await inspect(vault,relative+'/'+name);
    if (old && !old.isFile()) throw new Error('Existing artifact must be a file');
    next.set(name,await fs.readFile(path.join(source,name)));
    previous.set(name,old ? await fs.readFile(path.join(target,name)) : null);
  }
  let manifest;
  try { manifest = JSON.parse(next.get('manifest.json').toString('utf8')); }
  catch (cause) { throw new Error('Invalid plugin manifest',{cause}); }
  if (manifest.id !== 'cjk-search-probe' || !/^\d+\.\d+\.\d+$/.test(manifest.version))
    throw new Error('Unexpected plugin manifest identity');
  const backups = path.join(ROOT,'.pi/plugin-backups');
  await fs.mkdir(backups,{recursive:true});
  const backupDir = await fs.mkdtemp(path.join(backups,'before-install-'));
  for (const [name,bytes] of previous) if (bytes !== null) {
    await fs.mkdir(path.dirname(path.join(backupDir,name)),{recursive:true});
    await fs.writeFile(path.join(backupDir,name),bytes);
  }
  await fs.mkdir(target,{recursive:true});
  const staging = await fs.mkdtemp(path.join(target,'.cjk-install-'));
  const changed = [];
  try {
    for (const [name,bytes] of next) {
      await fs.mkdir(path.dirname(path.join(staging,name)),{recursive:true});
      await fs.writeFile(path.join(staging,name),bytes);
    }
    for (const name of files) {
      await fs.mkdir(path.dirname(path.join(target,name)),{recursive:true});
      await fs.rename(path.join(staging,name),path.join(target,name));
      changed.push(name);
    }
    for (const [name,bytes] of next)
      if (!(await fs.readFile(path.join(target,name))).equals(bytes)) throw new Error('Installed artifact verification failed');
    return {files,backupDir};
  } catch (error) {
    const rollbackErrors = [];
    for (const name of changed.reverse()) {
      try {
        const bytes = previous.get(name);
        if (bytes === null) await fs.unlink(path.join(target,name));
        else {
          await fs.mkdir(path.dirname(path.join(staging,name)),{recursive:true});
          await fs.writeFile(path.join(staging,name),bytes);
          await fs.rename(path.join(staging,name),path.join(target,name));
        }
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error,...rollbackErrors],`Restore incomplete; backup retained at ${backupDir}`);
    throw error;
  } finally {
    // Only our freshly created staging directory; never remove the plugin folder.
    await fs.rm(staging,{recursive:true,force:true});
  }
}

module.exports = {installTestPlugin};
if (require.main === module) {
  (async()=>{
    const vault = path.join(ROOT,'experiments/native-search-spike/manual-test-vault');
    const realRoot = await fs.realpath(ROOT), realVault = await fs.realpath(vault);
    if (!realVault.startsWith(realRoot+path.sep)) throw new Error('Test vault must stay inside this project');
    const result = await installTestPlugin(path.join(ROOT,'dist'),vault);
    console.log(JSON.stringify({vault, ...result}));
    console.log('Only plugin artifacts updated. Disable/re-enable CJK Search in this test vault; notes and settings were preserved.');
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
