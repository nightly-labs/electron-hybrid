import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config,run,assertPlatform } from './common.mjs';
import { sha256 } from './hash.mjs';
assertPlatform();
const destination=process.argv[2]&&path.resolve(process.argv[2]);
if(!destination) throw new Error('Usage: node scripts/install-runtime.mjs /new/runtime/directory [local-release-directory]');
if(existsSync(destination)) throw new Error('Choose a new destination; existing runtime directories are not overwritten.');
const local=process.argv[3]&&path.resolve(process.argv[3]);
const downloadDir=local||mkdtempSync(path.join(tmpdir(),'electron-hybrid-download-'));
try {
  if(!local) run('gh',['release','download',config.releaseTag,'--repo',config.repository,'--dir',downloadDir,'--pattern','*.zip','--pattern','manifest.json']);
  const manifest=JSON.parse(readFileSync(path.join(downloadDir,'manifest.json'),'utf8'));
  const expectedName=`electron-${config.releaseTag}-${config.platform}-${config.arch}.zip`;
  if(manifest.filename!==expectedName||manifest.electronCommit!==config.electronCommit||manifest.releaseTag!==config.releaseTag||manifest.arch!==config.arch||manifest.platform!==config.platform) throw new Error('Release metadata does not match pinned runtime.');
  const archive=path.join(downloadDir,expectedName);
  if(await sha256(archive)!==manifest.sha256) throw new Error('Archive checksum mismatch');
  mkdirSync(path.dirname(destination),{recursive:true});
  run('ditto',['-x','-k',archive,destination]);
  const binary=path.join(destination,'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
  if(await sha256(binary)!==manifest.binarySha256) throw new Error('Extracted framework checksum mismatch');
  console.log(`Installed ${destination}\nUse ELECTRON_OVERRIDE_DIST_PATH for development and electron-builder's electronDist for packaging.\nThis runtime needs application signing and notarization before customer distribution.`);
} finally {
  if(!local) rmSync(downloadDir,{recursive:true,force:true});
}
