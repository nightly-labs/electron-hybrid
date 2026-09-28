import { existsSync } from 'node:fs';
import path from 'node:path';
import { src, out, run, assertPlatform, assertUpstream } from './common.mjs';
assertPlatform(); assertUpstream();
if(!existsSync(path.join(out,'args.gn'))) throw new Error('Configure the output directory first; see README.');
await import('./apply-patch.mjs');
const jobs=process.env.BUILD_JOBS || '6';
if(!/^[1-9][0-9]*$/.test(jobs)) throw new Error('BUILD_JOBS must be a positive integer');
// No remote build service or hosted runner is used.
run(path.join(src,'third_party/ninja/ninja'),['-C',out,'electron','electron_dist_zip','-j',jobs],{cwd:src});
