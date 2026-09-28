#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureRuntime } from './install.mjs';
import { distPath, executablePath } from './index.mjs';
const args = process.argv.slice(2);
if (args[0] === '--help') {
  console.log('Usage: electron-hybrid [app-directory] [app arguments]\n       electron-hybrid install | --version | --print-dist\nRequires macOS arm64.');
} else {
  await ensureRuntime();
  if (args[0] === '--print-dist') console.log(distPath);
  else if (args[0] !== 'install') {
    // LaunchServices preserves macOS Bluetooth permission attribution.
    const version = args[0] === '--version';
    const child = spawn(version ? executablePath : 'open', version ? ['--version'] :
      ['-n', '-W', path.join(distPath, 'Electron.app'), '--args', path.resolve(args[0] || '.'), ...args.slice(1)], {stdio:'inherit'});
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
}
