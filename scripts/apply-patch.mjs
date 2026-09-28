import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, electron, run, assertUpstream } from './common.mjs';
assertUpstream();
const patch=path.join(root,'patches','native-hybrid.patch');
const applied=spawnSync('git',['apply','--reverse','--check',patch],{cwd:electron,stdio:'ignore'}).status===0;
if(applied) console.log('Patch already applied.');
else {
  run('git',['apply','--check',patch],{cwd:electron});
  run('git',['apply',patch],{cwd:electron});
}
