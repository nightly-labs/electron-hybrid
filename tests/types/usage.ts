import '../../types/hybrid.js';
import type { HybridQrDetails, HybridStatusDetails } from '../../types/hybrid.js';
import { session } from 'electron';

const ses = session.defaultSession;
ses.setWebAuthnHybridEnabled(true);
const enabled: boolean = ses.isWebAuthnHybridEnabled();
ses.on('webauthn-hybrid-qr', (_event, details: HybridQrDetails, cancel) => {
  const id: string = details.requestId;
  const payload: string = details.qr;
  void id; void payload;
  if (!enabled) cancel();
});
ses.on('webauthn-hybrid-status', (_event, details: HybridStatusDetails) => {
  const id: string = details.requestId;
  if (details.status === 'closed') void id;
});
