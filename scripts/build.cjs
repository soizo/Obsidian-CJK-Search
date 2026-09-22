const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');

(async () => {
  const bytes = await fs.readFile(path.join(root, 'data/character-data.json'));
  let report;
  try { report = JSON.parse(await fs.readFile(path.join(root, 'data/report.json'), 'utf8')); }
  catch (cause) { throw new Error('Cannot read generated data report; run data:build first', {cause}); }
  if (createHash('sha256').update(bytes).digest('hex') !== report.sha256) throw new Error('Generated data/report mismatch');
  const files = ['manifest.json', 'THIRD_PARTY_NOTICES.md', 'LICENSES/Unicode-LICENSE.txt', 'LICENSES/OpenCC-LICENSE.txt'];
  try { await fs.access(path.join(root,'LICENSES/OpenCC-NOTICE.txt')); files.push('LICENSES/OpenCC-NOTICE.txt'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of files) await fs.access(path.join(root,name));
  const result = await build({
    absWorkingDir: root, entryPoints: ['src/main.js'], outfile: 'dist/main.js', bundle: true,
    platform: 'browser', format: 'cjs', target: 'es2018', external: ['obsidian'],
    sourcemap: false, minify: false, metafile: true, write: false,
  });
  for (const output of Object.values(result.metafile.outputs))
    for (const dependency of output.imports)
      if (dependency.external && dependency.path !== 'obsidian') throw new Error('Unexpected runtime dependency');
  await fs.mkdir(path.join(root,'dist'), {recursive:true});
  for (const output of result.outputFiles) await fs.writeFile(output.path,output.contents);
  for (const name of files) {
    await fs.mkdir(path.dirname(path.join(root,'dist',name)),{recursive:true});
    await fs.copyFile(path.join(root,name),path.join(root,'dist',name));
  }
  const main = await fs.readFile(path.join(root,'dist/main.js'));
  console.log(JSON.stringify({mainBytes:main.length,sha256:createHash('sha256').update(main).digest('hex'),dataSha256:report.sha256}));
})().catch(error => { console.error(error); process.exitCode = 1; });
