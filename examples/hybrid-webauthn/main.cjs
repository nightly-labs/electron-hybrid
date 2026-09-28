const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} = require('@simplewebauthn/server');

// A disposable RP. Credentials and challenges stay in memory, and the server
// verifies the phone's responses rather than treating a resolved promise as proof.
const site = process.argv.find(arg => arg.startsWith('--site='))?.slice(7);
const testName = site ? 'electron-hybrid-site' : 'electron-hybrid-smoke';
app.setPath('userData', path.join(app.getPath('temp'), testName + '-profile'));
const logPath = path.join(app.getPath('temp'), testName + '.log');
fs.writeFileSync(logPath, '');
function log(message) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  console.log(message);
}
let origin, challenge, credential, win, qrWindow, cancelRequest, activeRequestId, lastStatus;
const page = fs.readFileSync(path.join(__dirname, 'test.html'));
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
      return res.end(page);
    }
    if (req.method !== 'POST' || req.headers.origin !== origin) {
      res.writeHead(403); return res.end();
    }
    let result;
    if (req.url === '/register/options') {
      result = await generateRegistrationOptions({
        rpName: 'Electron hybrid smoke test', rpID: 'localhost',
        userName: 'hybrid-test', attestationType: 'none',
        authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'required', userVerification: 'required' },
        timeout: 300000
      });
      challenge = result.challenge;
    } else if (req.url === '/authenticate/options') {
      if (!credential) throw new Error('Register first');
      result = await generateAuthenticationOptions({ rpID: 'localhost', userVerification: 'required', timeout: 300000,
        allowCredentials: [{ id: credential.id, transports: ['hybrid'] }] });
      challenge = result.challenge;
    } else {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) throw new Error('Response too large');
      }
      const expectedChallenge = challenge;
      challenge = undefined;
      if (!expectedChallenge) throw new Error('No outstanding challenge');
      if (req.url === '/register/verify') {
        result = await verifyRegistrationResponse({ response: JSON.parse(body), expectedChallenge, expectedOrigin: origin, expectedRPID: 'localhost', requireUserVerification: true });
        if (result.verified) credential = result.registrationInfo.credential;
        log(`REGISTRATION verified=${result.verified}`);
      } else if (req.url === '/authenticate/verify') {
        result = await verifyAuthenticationResponse({ response: JSON.parse(body), expectedChallenge, expectedOrigin: origin, expectedRPID: 'localhost', credential, requireUserVerification: true });
        if (result.verified) credential.counter = result.authenticationInfo.newCounter;
        log(`AUTHENTICATION verified=${result.verified}`);
      } else throw new Error('Unknown route');
      result = { verified: result.verified };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    log(`SERVER error: ${error.message}`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
function closeQr() {
  cancelRequest = null;
  activeRequestId = null;
  lastStatus = null;
  if (qrWindow && !qrWindow.isDestroyed()) qrWindow.destroy();
  qrWindow = null;
}
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://localhost:${server.address().port}`;
  log(`Electron ${process.versions.electron}; Chromium ${process.versions.chrome}`);
  log(`Test server ${origin}`);
  win = new BrowserWindow({ width: 950, height: 750, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const session = win.webContents.session;
  session.on('webauthn-hybrid-qr', async (_event, details, cancel) => {
    if (details.frame !== win.webContents.mainFrame) return;
    closeQr();
    log(`QR emitted; rp=${details.relyingPartyId}; payloadLength=${details.qr.length}`);
    cancelRequest = cancel;
    activeRequestId = details.requestId;
    const current = new BrowserWindow({ parent: win, width: 420, height: 570, title: 'Use a phone or tablet', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    qrWindow = current;
    current.on('closed', () => {
      if (qrWindow !== current) return;
      const cb = cancelRequest;
      cancelRequest = null; qrWindow = null;
      cb?.();
    });
    try {
      const dataUrl = await QRCode.toDataURL(details.qr, { width: 320, margin: 4, errorCorrectionLevel: 'M' });
      if (current.isDestroyed()) return;
      await current.loadFile(path.join(__dirname, 'qr.html'));
      if (!current.isDestroyed()) {
        current.webContents.send('qr', { dataUrl, rp: details.relyingPartyId });
        if (lastStatus) current.webContents.send('status', lastStatus);
      }
    } catch (error) {
      // Cancellation can destroy the window while its local page is loading.
      if (current.isDestroyed()) return;
      log(`QR window failed: ${error.message}`);
      if (qrWindow === current) closeQr();
      cancel();
    }
  });
  session.on('webauthn-hybrid-status', (_event, details) => {
    if (details.requestId !== activeRequestId) return;
    lastStatus = details.status;
    log(`HYBRID ${details.status}`);
    if (details.status === 'closed') closeQr();
    else if (qrWindow && !qrWindow.isDestroyed()) qrWindow.webContents.send('status', details.status);
  });
  session.on('select-webauthn-account', (event, details, callback) => {
    if (details.frame !== win.webContents.mainFrame) return;
    event.preventDefault();
    closeQr();
    dialog.showMessageBox(win, { type: 'question', message: `Select a passkey for ${details.relyingPartyId}`, buttons: [...details.accounts.map(a => a.displayName || a.name || 'Passkey'), 'Cancel'], cancelId: details.accounts.length }).then(({ response }) => callback(details.accounts[response]?.credentialId ?? null));
  });
  ipcMain.on('cancel-hybrid', event => {
    if (event.sender !== qrWindow?.webContents) return;
    const cb = cancelRequest;
    closeQr(); cb?.();
  });
  // Only record our own test output, never a remote site's console content.
  if (!site) win.webContents.on('console-message', details => log(`PAGE ${details.message}`));
  win.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) closeQr(); });
  win.on('closed', () => app.quit());
  if (typeof session.setWebAuthnHybridEnabled !== 'function') throw new Error('This app requires the Nightly Labs patched Electron build');
  session.setWebAuthnHybridEnabled(true);
  await win.loadURL(site || origin);
  if (process.argv.includes('--smoke')) {
    await win.webContents.executeJavaScript('runLifecycleSmoke()', true);
    log('LIFECYCLE smoke passed');
  }
  if (!site && process.argv.includes('--register')) {
    win.webContents.executeJavaScript('register()', true).catch(error => log(`Registration: ${error.message}`));
  }
}).catch(error => { log(`FATAL ${error.stack}`); app.exit(1); });
app.on('will-quit', () => server.close());
