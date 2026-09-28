import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(readFileSync(path.join(root,'upstream.json'),'utf8'));
export const src = path.resolve(process.env.ELECTRON_SRC || path.join(root,'src'));
export const out = path.resolve(process.env.ELECTRON_OUT || path.join(src,'out','Default'));
export const electron = path.join(src,'electron');
export function run(command,args,options={}) {
  const result = spawnSync(command,args,{stdio:'inherit',...options});
  if(result.error) throw result.error;
  if(result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result.stdout?.toString().trim();
}
export function capture(command,args,options={}) { return run(command,args,{stdio:['ignore','pipe','inherit'],...options}); }
export function assertPlatform() {
  if(process.platform !== config.platform || process.arch !== config.arch) throw new Error('This release is supported only on macOS arm64');
}
export function assertUpstream() {
  const actual=capture('git',['rev-parse','HEAD'],{cwd:electron});
  if(actual !== config.electronCommit) throw new Error(`Expected clean upstream HEAD ${config.electronCommit}; found ${actual}. Keep custom changes uncommitted while building the pinned patch.`);
}
