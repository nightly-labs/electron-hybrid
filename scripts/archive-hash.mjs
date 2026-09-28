import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
export async function archiveEntrySha256(archive, entry) {
  const child=spawn('unzip',['-p',archive,entry],{stdio:['ignore','pipe','inherit']});
  const completion=new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('close',code=>code===0?resolve():reject(new Error(`unzip exited with ${code}`)));
  });
  // Observe both the stream and process, including early command failures.
  const digest=(async()=>{
    const hash=createHash('sha256');
    for await (const chunk of child.stdout) hash.update(chunk);
    return hash.digest('hex');
  })();
  const [hash]=await Promise.all([digest,completion]);
  return hash;
}
