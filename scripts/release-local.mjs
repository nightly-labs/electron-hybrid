import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root,config,run,capture } from './common.mjs';
import { sha256 } from './hash.mjs';
const dir=path.join(root,'artifacts',config.releaseTag);
const manifest=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8'));
const head=capture('git',['rev-parse','HEAD'],{cwd:root});
if(capture('git',['status','--porcelain'],{cwd:root})) throw new Error('Commit source changes before publishing a release.');
if(manifest.sourceRepositoryCommit!==head) throw new Error('Package must match the current source commit.');
for(const line of readFileSync(path.join(dir,'SHASUMS256.txt'),'utf8').trim().split('\n')) {
  const match=/^([0-9a-f]{64})  ([^/]+)$/.exec(line);
  if(!match||await sha256(path.join(dir,match[2]))!==match[1]) throw new Error('Release checksum verification failed');
}
if(spawnSync('gh',['release','view',config.releaseTag,'--repo',config.repository],{stdio:'ignore'}).status===0) throw new Error('Release already exists; do not overwrite a published runtime.');
const tag=spawnSync('git',['rev-parse',`${config.releaseTag}^{commit}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
if(tag.status===0&&tag.stdout.trim()!==head) throw new Error('Existing release tag points at a different commit');
if(tag.status!==0) run('git',['tag','-a',config.releaseTag,'-m',`Electron ${config.electronVersion} native phone passkeys`],{cwd:root});
run('git',['push','origin','main',config.releaseTag],{cwd:root});
const notes=path.join(root,'artifacts',config.releaseTag+'-notes.md');
writeFileSync(notes,`Native phone passkeys on Electron ${config.electronVersion}, built locally for macOS arm64.\n\nOpt in per session with setWebAuthnHybridEnabled(true); your app renders the QR and status UI. Includes unique request IDs, cancellation and navigation cleanup, API types and a sample app.\n\nThis is an optimized testing-profile prerelease, not Developer ID signed or notarized. The attached native-tests.json records automated tests against the exact framework hash. The earlier 44.0.0 prototype passed physical-phone registration, authentication and Google sign-in; that historical result is not a physical-phone verification of this updated binary.\n\nSee README for installation, custom dialog integration and local rebuilding. Runtime resources and upstream licenses are included.\n`);
const assets=readdirSync(dir).filter(name=>name!=='.DS_Store').map(name=>path.join(dir,name));
run('gh',['release','create',config.releaseTag,...assets,'--repo',config.repository,'--verify-tag','--prerelease','--title',`Electron ${config.electronVersion} + phone passkeys (macOS arm64)`,'--notes-file',notes]);
