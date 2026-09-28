import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const distPath = fileURLToPath(new URL('../dist/', import.meta.url));
export const executablePath = path.join(distPath, 'Electron.app/Contents/MacOS/Electron');
