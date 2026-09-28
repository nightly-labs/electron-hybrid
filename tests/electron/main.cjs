const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const resultPath = process.argv.find(a => a.startsWith('--result='))?.slice(9);
app.setPath('userData', path.join(app.getPath('temp'), 'hybrid-regression-' + process.pid));
const passed = [];
const windows = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (predicate()) return; await sleep(25); }
  throw new Error('Timed out: ' + label);
}
let origin;
const server = http.createServer((_req, res) => {
  res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><title>Native hybrid regression</title>');
});
async function windowFor(ses) {
  const win = new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  windows.push(win); await win.loadURL(origin); return win;
}
async function start(win, mediation = 'optional') {
  await win.webContents.executeJavaScript(`
    window.result = null;
    window.controller = new AbortController();
    navigator.credentials.get({mediation:${JSON.stringify(mediation)},signal:controller.signal,
      publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:'localhost',timeout:60000}
    }).then(()=>window.result='success', error=>window.result=error.name);
    undefined;
  `, true);
}
async function result(win, expected) {
  for (let i=0;i<100;i++) {
    const value = await win.webContents.executeJavaScript('window.result');
    if (value) { assert.equal(value, expected); return; }
    await sleep(25);
  }
  throw new Error('WebAuthn promise did not settle');
}
app.whenReady().then(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://localhost:'+server.address().port;
  const ses = session.fromPartition('hybrid-regression');
  const other = session.fromPartition('hybrid-other');
  assert.equal(process.versions.electron, '44.4.5');
  assert.equal(ses.isWebAuthnHybridEnabled(),false);
  const qrs=[],statuses=[];
  const listener=(_event,details,cancel)=>qrs.push({...details,cancel});
  ses.on('webauthn-hybrid-qr',listener);
  ses.on('webauthn-hybrid-status',(_event,details)=>statuses.push(details));
  const win=await windowFor(ses);
  await start(win); await sleep(600);
  assert.equal(qrs.length,0);
  await win.webContents.executeJavaScript('controller.abort()');
  await result(win,'AbortError');
  passed.push('disabled by default: no QR');
  ses.setWebAuthnHybridEnabled(true);
  assert.equal(ses.isWebAuthnHybridEnabled(),true);
  assert.equal(other.isWebAuthnHybridEnabled(),false);
  passed.push('opt-in is per session');
  await start(win); await until(()=>qrs.length===1,'first QR');
  assert.match(qrs[0].qr,/^FIDO:\/[0-9]+$/);
  assert.equal(qrs[0].origin,origin); assert.equal(qrs[0].relyingPartyId,'localhost');
  assert.equal(qrs[0].frame,win.webContents.mainFrame);
  assert.ok(qrs[0].requestId);
  qrs[0].cancel(); qrs[0].cancel();
  await result(win,'NotAllowedError');
  await until(()=>statuses.some(s=>s.requestId===qrs[0].requestId&&s.status==='closed'),'cancel closed');
  passed.push('native QR and double cancellation');
  await start(win); await until(()=>qrs.length===2,'second QR');
  assert.notEqual(qrs[0].requestId,qrs[1].requestId);
  assert.notEqual(qrs[0].qr,qrs[1].qr);
  qrs[0].cancel(); await sleep(200);
  assert.equal(await win.webContents.executeJavaScript('window.result'),null);
  await win.webContents.executeJavaScript('controller.abort()');
  await result(win,'AbortError');
  passed.push('fresh request ID/key and stale callback isolation');
  await start(win,'conditional'); await sleep(600);
  assert.equal(qrs.length,2);
  await win.webContents.executeJavaScript('controller.abort()'); await result(win,'AbortError');
  passed.push('conditional request produces no QR');
  await start(win); await until(()=>qrs.length===3,'navigation QR');
  await win.loadURL(origin+'/?navigated');
  await until(()=>statuses.some(s=>s.requestId===qrs[2].requestId&&s.status==='closed'),'navigation closed');
  passed.push('navigation closes request');
  await start(win); await until(()=>qrs.length===4,'destruction QR');
  win.destroy();
  await until(()=>statuses.some(s=>s.requestId===qrs[3].requestId&&s.status==='closed'),'destroy closed');
  passed.push('destroyed frame still closes request');
  const a=await windowFor(ses), b=await windowFor(ses);
  await start(a); await start(b); await until(()=>qrs.length===6,'concurrent QRs');
  const qa=qrs.find(q=>q.frame===a.webContents.mainFrame), qb=qrs.find(q=>q.frame===b.webContents.mainFrame);
  assert.notEqual(qa.requestId,qb.requestId); qa.cancel(); await result(a,'NotAllowedError');
  assert.equal(await b.webContents.executeJavaScript('window.result'),null);
  qb.cancel(); await result(b,'NotAllowedError');
  passed.push('concurrent windows cancel independently');
  ses.removeListener('webauthn-hybrid-qr',listener);
  await start(a); await result(a,'NotAllowedError');
  passed.push('enabled request without UI listener cancels');
  for (const status of statuses) assert.equal('qr' in status,false);
  passed.push('status events contain no QR secrets');
  for (const qr of qrs) assert.equal(statuses.filter(s=>s.requestId===qr.requestId&&s.status==='closed').length,1);
  finish(0);
}).catch(error=>finish(1,error));
function finish(code,error) {
  const report={ok:code===0,electron:process.versions.electron,passed,error:error?.stack};
  if (resultPath) fs.writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  server.close(); app.exit(code);
}
app.on('window-all-closed',()=>{});
