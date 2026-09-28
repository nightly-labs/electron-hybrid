import { existsSync, readFileSync, mkdtempSync, writeFileSync, createWriteStream, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { installRuntime } from '../scripts/install-runtime.mjs';
import { sha256 } from '../scripts/hash.mjs';
import { assertPlatform } from '../scripts/common.mjs';
import { distPath } from './index.mjs';
const release = JSON.parse(readFileSync(new URL('./release.json', import.meta.url), 'utf8'));
export async function ensureRuntime() {
  assertPlatform();
  if (existsSync(distPath)) {
    const binary = path.join(distPath, 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
    if (await sha256(binary) !== release.binarySha256) throw new Error('Installed runtime checksum mismatch; remove this package’s dist directory and reinstall.');
    return;
  }
  const local = process.env.ELECTRON_HYBRID_RELEASE_DIR;
  if (local) return installRuntime(distPath, local, release);
  const download = mkdtempSync(path.join(tmpdir(), 'electron-hybrid-npm-'));
  try {
    const url = `https://github.com/${release.repository}/releases/download/${release.releaseTag}/${release.filename}`;
    const response = await fetch(url, {signal:AbortSignal.timeout(600000)});
    if (!response.ok || !response.body) throw new Error(`Runtime download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path.join(download, release.filename)));
    writeFileSync(path.join(download, 'manifest.json'), JSON.stringify(release));
    await installRuntime(distPath, download, release);
  } finally {
    rmSync(download, {recursive:true, force:true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.ELECTRON_HYBRID_SKIP_DOWNLOAD !== '1') await ensureRuntime();
}
