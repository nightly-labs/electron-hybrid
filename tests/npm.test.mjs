import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { root } from '../scripts/common.mjs';

// Run against the real release archive to exercise npm's lifecycle and CLI.
test('packed npm package installs and launches the pinned runtime', {skip:process.platform!=='darwin'}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hybrid-npm-test-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  function run(command, args, options={}) {
    const result = spawnSync(command, args, {cwd:dir, encoding:'utf8', timeout:600000, ...options});
    assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
    return result.stdout;
  }
  const packed = JSON.parse(run('npm', ['pack', root, '--json', '--pack-destination', dir]))[0];
  const paths = packed.files.map(file => file.path);
  assert.ok(paths.includes('runtime/release.json'));
  assert.ok(paths.includes('types/hybrid.d.ts'));
  assert.ok(!paths.some(file => /^(src|artifacts|dist|tests|examples)\//.test(file)));
  assert.ok(packed.size < 100000, 'npm archive should contain only installer, types and documentation');
  writeFileSync(path.join(dir,'package.json'), '{"private":true,"type":"module"}');
  const env = {...process.env};
  delete env.ELECTRON_HYBRID_SKIP_DOWNLOAD;
  // Use public download by default; local release is an optional offline test.
  run('npm', ['install', path.join(dir,packed.filename), '--no-audit', '--no-fund', '--foreground-scripts'], {env});
  const packageDir = path.join(dir,'node_modules/@nightlylabs/electron-hybrid');
  const cli = path.join(packageDir,'runtime/cli.mjs');
  const api = await import(pathToFileURL(path.join(packageDir,'runtime/index.mjs')));
  assert.equal(run(process.execPath,[cli,'--version']).trim(),'v44.4.5');
  assert.equal(run(process.execPath,[cli,'--print-dist']).trim(),api.distPath);
  run(process.execPath,[cli,'install']); // Reinstall is idempotent.
  const app = path.join(dir,'app with spaces'); mkdirSync(app);
  writeFileSync(path.join(app,'package.json'), '{"main":"main.cjs"}');
  const result = path.join(dir,'launched.json');
  writeFileSync(path.join(app,'main.cjs'), `const {app,session}=require('electron'); app.whenReady().then(()=>{require('fs').writeFileSync(${JSON.stringify(result)},JSON.stringify({version:process.versions.electron,hybrid:typeof session.defaultSession.setWebAuthnHybridEnabled,arg:process.argv.at(-1)}));app.exit(0);});`);
  run(process.execPath,[cli,app,'argument with spaces']);
  assert.deepEqual(JSON.parse(readFileSync(result,'utf8')), {version:'44.4.5',hybrid:'function',arg:'argument with spaces'});
  // A local manifest cannot replace the release hashes pinned in npm.
  const invalid = path.join(dir,'invalid'); mkdirSync(invalid);
  const manifest = JSON.parse(readFileSync(path.join(packageDir,'runtime/release.json'),'utf8'));
  writeFileSync(path.join(invalid,'manifest.json'),JSON.stringify({...manifest,sha256:'0'.repeat(64)}));
  rmSync(api.distPath,{recursive:true});
  const rejected = spawnSync(process.execPath,[cli,'install'],{env:{...env,ELECTRON_HYBRID_RELEASE_DIR:invalid},encoding:'utf8'});
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/Release hashes do not match the npm package/);
});
