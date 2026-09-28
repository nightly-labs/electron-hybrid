# Electron hybrid passkeys

A small, opt-in Electron patch that uses Chromium's native caBLE v2 transport
for phone passkeys, including Google sign-in. Applications own the QR dialog;
Chromium owns Bluetooth discovery, proximity matching, the encrypted tunnel
and WebAuthn processing. No WebAuthn replacement is injected into websites.

Upstream is pinned in [`upstream.json`](upstream.json): **Electron 44.4.5**, the
latest stable release checked on 2026-09-28. The supported binary target is
**macOS arm64**. Builds run locally; GitHub stores source and release artifacts.

The previous 44.0.0 prototype passed physical-phone registration and assertion
verification on a local RP, and the user confirmed Google sign-in worked.
See the current release's `native-tests.json` for automated checks on its exact
binary. A passing regression suite alone does not verify a physical phone.

## Install from npm

```sh
npm install --save-dev @nightlylabs/electron-hybrid@next
npx electron-hybrid /absolute/path/to/your/app
```

The npm package downloads the pinned GitHub release and verifies the archive
and extracted framework against hashes bundled in the package. It contains no
Chromium source or binary archive. This first release supports **macOS arm64**
only and is an optimized testing build, without Developer ID signing or
notarization. No GitHub login is required for the public binary download.

The launcher uses macOS LaunchServices for Bluetooth permission attribution.
`npx electron-hybrid --version` prints the runtime version;
`npx electron-hybrid --print-dist` prints the distribution directory for
`electron-builder`'s `electronDist` (use `electronVersion: "44.4.5"`).
The package also exports `distPath` and `executablePath` as ESM values.
Your application's Electron API imports remain `import { app } from 'electron'`.

For TypeScript, keep `electron@44.4.5` as a development dependency and add
`"@nightlylabs/electron-hybrid/types"` to `compilerOptions.types`.
The stock Electron package supplies API definitions; run your app with
`electron-hybrid` to use the patched runtime.

If your package manager skips install scripts, run `npx electron-hybrid install`.
Set `ELECTRON_HYBRID_SKIP_DOWNLOAD=1` to skip the install-time download, or
`ELECTRON_HYBRID_RELEASE_DIR` to an existing release directory for offline
installation. Offline archives must match the same bundled hashes.
Sign and notarize your final application before distributing it to customers.

## Application API

Use the patched runtime and include [`types/hybrid.d.ts`](types/hybrid.d.ts) in
your TypeScript project when using the stock Electron npm package's types.
Register listeners before enabling discovery:

```js
const pending = new Map();
const ses = window.webContents.session;

ses.on('webauthn-hybrid-qr', (_event, details, cancel) => {
  // Associate the request with the correct window/frame in your application.
  // Implement showPasskeyDialog and updatePasskeyDialog in your own UI.
  const dialog = showPasskeyDialog({
    requestId: details.requestId,
    origin: details.origin,
    relyingPartyId: details.relyingPartyId,
    qr: details.qr,
    onCancel: cancel,
  });
  pending.set(details.requestId, dialog);
});
ses.on('webauthn-hybrid-status', (_event, details) => {
  const dialog = pending.get(details.requestId);
  if (!dialog) return;
  if (details.status === 'closed') {
    dialog.close();
    pending.delete(details.requestId);
  } else {
    updatePasskeyDialog(dialog, details.status);
  }
});
ses.setWebAuthnHybridEnabled(true);
```

This switch defaults to false, is scoped to the session, and is not persisted.
Disabling affects new requests. Cancel existing requests with their callback.
Without a QR listener an enabled request is cancelled rather than left hanging.
QR payloads are ephemeral secrets: render them unchanged, never log them, and
never forward them to remote web content. A local, isolated preload can expose
only the rendering data and cancellation action needed by your app's UI.

Statuses are `bluetooth-permission-requested`, `bluetooth-permission-denied`,
`bluetooth-off`, `bluetooth-on`, `phone-connected`, `ble-advert-received`,
`ready`, and `closed`. `ready` is transport readiness, not login success.
`closed` is delivered asynchronously on completion or teardown; the frame can
already be gone, so match by `requestId`. The site's WebAuthn promise determines
the result. Use the existing `select-webauthn-account` event to show an account
chooser when requested; see the example.

Conditional/autofill and immediate requests are excluded. Pairing persistence,
Apple's iCloud Keychain authenticator, and built-in browser UI are not provided.
This patch does not grant Apple entitlements or change website origin checks.

## Build locally

Prerequisites: macOS arm64, Xcode, Node 22+, Electron build-tools/depot_tools,
and a complete Electron checkout. A first build requires substantial disk and
time. This repository deliberately ignores `src/`, `artifacts/`, and dependencies.

For an existing checkout, preserve any local work before switching versions:

```sh
cd /path/to/checkout/src/electron
# Commit or otherwise preserve your changes first.
git fetch origin tag v44.4.5
git switch --detach v44.4.5
# Use the build-tools configuration belonging to this checkout.
e sync
```

`e sync` synchronizes Chromium, Node, toolchains and upstream patches. Do not
skip it when changing Electron versions. Then, from this repository:

```sh
export ELECTRON_SRC=/path/to/checkout/src
export ELECTRON_OUT="$ELECTRON_SRC/out/Default"
npm run apply
npm run build
npm test
npm run test:tooling
npm run package
```

The build scripts require HEAD at the exact pinned upstream commit and apply
the patch as working-tree changes. Reapplying an identical patch is a no-op;
conflicts stop before editing. Keep your completed custom patch in this repo.

The output directory must have an `args.gn` and a generated Ninja build. This
release reuses the optimized Electron `testing.gn` profile, with DCHECKs and
symbols enabled; it is not an official PGO release build. A fresh configuration:

```sh
mkdir -p "$ELECTRON_OUT"
printf 'import("//electron/build/args/testing.gn")\n' > "$ELECTRON_OUT/args.gn"
cd "$ELECTRON_SRC"
buildtools/mac/gn gen "$ELECTRON_OUT"
```

Use your checkout's SDK configuration if needed. `BUILD_JOBS` defaults to 6.
No build script requests remote execution. The upstream `electron_dist_zip`
target includes Electron and Chromium license files and runtime resources.

`npm test` launches through macOS LaunchServices and verifies native opt-in,
QR generation, repeated/stale cancellation, fresh keys and request IDs,
conditional suppression, navigation, frame destruction, concurrent windows,
missing listeners and status-secret isolation. Packaging requires a passing
report matching the patch and framework hashes.

## Try a physical phone

```sh
npm ci --prefix examples/hybrid-webauthn
npm run example -- --register
# Or Google's real sign-in flow:
npm run example -- --site=https://accounts.google.com/
```

Launch via `open`/the scripts, not directly from a terminal: Chromium checks the
responsible process's Bluetooth usage metadata. Allow the macOS Bluetooth
prompt if shown. The example keeps remote content sandboxed with no Node or
preload. Its QR window is local and isolated. The localhost server verifies
registration and authentication; test credentials remain in memory only.
A passkey created on the phone remains until manually removed.

## Install the runtime into another app

After authenticating `gh` with access to this private repository:

```sh
node scripts/install-runtime.mjs /absolute/path/to/electron-hybrid-runtime
# Or install from artifacts without a download:
node scripts/install-runtime.mjs /absolute/path/to/electron-hybrid-runtime \
  artifacts/v44.4.5-hybrid.1
```

The installer verifies release metadata, archive SHA-256 and extracted framework
SHA-256. It requires a new destination and will not overwrite an existing runtime.
Pin the stock npm `electron` package to `44.4.5` for CLI/types compatibility, then
point development at the patched distribution:

```sh
ELECTRON_OVERRIDE_DIST_PATH=/absolute/path/to/electron-hybrid-runtime npx electron .
```

For a phone test on macOS, launch through LaunchServices so the app owns its
Bluetooth permission:

```sh
open -n /absolute/path/to/electron-hybrid-runtime/Electron.app --args /absolute/path/to/your/app
```

For electron-builder, set `electronVersion` to `44.4.5` and `electronDist` to that
absolute runtime directory. Other packagers must likewise use the custom
runtime rather than downloading a stock binary. Keep a startup check for
`session.defaultSession.setWebAuthnHybridEnabled` to catch accidental stock use.

The local runtime is not Developer ID signed or notarized. Sign and notarize the
final application with your own identity as part of your normal app packaging.
Include `NSBluetoothAlwaysUsageDescription` in its Info.plist. No Apple browser
passkey entitlement is added by this patch.

## Releases and updates

Release assets contain the runtime zip, checksums, manifest (upstream SHA,
patch SHA, binary SHA and build arguments), native test report, patch and types.
Commit source changes, run `npm run package`, then `npm run release:local` to
verify checksums, push the version tag and publish a GitHub prerelease. The
release command refuses to overwrite an existing release or publish a package
from a different source commit. No hosted CI compiles Electron.

For an upgrade, save the current patch and binary, fetch the new stable tag,
sync dependencies, port the patch, update `upstream.json`, rebuild and rerun
regressions. Repeat physical-phone and Google sign-in tests before relying on a
new release in production. Preserve license files when redistributing.
