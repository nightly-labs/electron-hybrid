# Custom passkey dialog example

Run with the patched runtime using `npm run example -- --register` at the
repository root (first run `npm ci --prefix examples/hybrid-webauthn`).
For Google: `npm run example -- --site=https://accounts.google.com/`.

The session explicitly opts into native hybrid discovery. The website keeps
its own WebAuthn implementation. A separate local window renders the QR and
connection status, matching status events by request ID. The native patch
handles Bluetooth and encryption. The localhost test verifies the phone's
registration and authentication responses on an in-memory server.

The app uses temporary profiles and logs (Electron's `app.getPath('temp')`).
No QR secrets or credential bytes are logged. Close the app to discard the
local server's test credential; delete the phone's test passkey separately.

The historical 44.0.0 prototype was also tested successfully with Google.
Current native lifecycle checks live in `tests/electron` and are run with
`npm test`; they do not substitute for a physical phone test.
