import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config,run,assertPlatform } from './common.mjs';
import { sha256 } from './hash.mjs';
export async function installRuntime(destination, local, expected) {
assertPlatform();
destination=destination&&path.resolve(destination);
if(!destination) throw new Error('Usage: node scripts/install-runtime.mjs /new/runtime/directory [local-release-directory]');
if(existsSync(destination)) throw new Error('Choose a new destination; existing runtime directories are not overwritten.');
local=local&&path.resolve(local);
const downloadDir=local||mkdtempSync(path.join(tmpdir(),'electron-hybrid-download-'));
let stage;
try {
  if(!local) run('gh',['release','download',config.releaseTag,'--repo',config.repository,'--dir',downloadDir,'--pattern','*.zip','--pattern','manifest.json']);
  const manifest=JSON.parse(readFileSync(path.join(downloadDir,'manifest.json'),'utf8'));
  const expectedName=`electron-${config.releaseTag}-${config.platform}-${config.arch}.zip`;
  if(manifest.filename!==expectedName||manifest.electronVersion!==config.electronVersion||manifest.electronCommit!==config.electronCommit||manifest.releaseTag!==config.releaseTag||manifest.arch!==config.arch||manifest.platform!==config.platform) throw new Error('Release metadata does not match pinned runtime.');
  if(expected && (manifest.sha256!==expected.sha256 || manifest.binarySha256!==expected.binarySha256)) throw new Error('Release hashes do not match the npm package');
  const archive=path.join(downloadDir,expectedName);
  if(await sha256(archive)!==manifest.sha256) throw new Error('Archive checksum mismatch');
  mkdirSync(path.dirname(destination),{recursive:true});
  stage=mkdtempSync(path.join(path.dirname(destination),'.electron-hybrid-install-'));
  run('ditto',['-x','-k',archive,stage]);
  const binary=path.join(stage,'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
  if(await sha256(binary)!==manifest.binarySha256) throw new Error('Extracted framework checksum mismatch');
  if(existsSync(destination)) throw new Error('Destination appeared during installation; refusing to overwrite it');
  renameSync(stage,destination);
  stage=undefined;
  console.log(`Installed ${destination}\nUse ELECTRON_OVERRIDE_DIST_PATH for development and electron-builder's electronDist for packaging.\nThis runtime needs application signing and notarization before customer distribution.`);
} finally {
  if(stage) rmSync(stage,{recursive:true,force:true});
  if(!local) rmSync(downloadDir,{recursive:true,force:true});
}

}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await installRuntime(process.argv[2],process.argv[3]);
}
