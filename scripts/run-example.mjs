import path from 'node:path';
import { root,out,run,assertPlatform } from './common.mjs';
assertPlatform();
run('open',['-n',path.join(out,'Electron.app'),'--args',path.join(root,'examples','hybrid-webauthn'),...process.argv.slice(2)]);
