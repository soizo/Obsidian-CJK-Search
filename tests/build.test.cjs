const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Script} = require('node:vm');
const root = path.resolve(__dirname, '..');

test('release command uses the manifest version as its exact tag and uploads installable assets', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  const step = workflow.split('      - name: Create release\n')[1];
  const command = step.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
  // Intercept only the remote boundary: execute the real shell step, never GitHub.
  const args = execFileSync('bash', ['-eu', '-c', 'gh() { printf "%s\\n" "$@"; };\n' + command], {
    cwd:root, encoding:'utf8', env:{...process.env, VERSION:require('../manifest.json').version, GITHUB_SHA:'test-commit'},
  }).trim().split('\n');
  assert.deepEqual(args.slice(0, 3), ['release', 'create', require('../manifest.json').version]);
  assert(args.includes('dist/main.js'));
  assert(args.includes('dist/manifest.json'));
  assert.equal(args[args.indexOf('--target') + 1], 'test-commit');
});

test('community main.js carries the full licences and notices without extra downloads', () => {
  execFileSync(process.execPath, ['scripts/build.cjs'], {cwd:root});
  const main = fs.readFileSync(path.join(root, 'dist/main.js'), 'utf8');
  const notices = main.split('\n').filter(line => line.startsWith('// ')).map(line => line.slice(3)).join('\n');
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'LICENSES/Unicode-LICENSE.txt', 'LICENSES/OpenCC-LICENSE.txt']) {
    const original = fs.readFileSync(path.join(root, name), 'utf8');
    assert(notices.includes(original.trimEnd()), `${name} must accompany the embedded data in main.js`);
    assert.equal(fs.readFileSync(path.join(root, 'dist', name), 'utf8'), original);
  }
  assert.doesNotThrow(() => new Script(main), 'Licence comments must not break the bundle');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'))), require('../manifest.json'));
});
