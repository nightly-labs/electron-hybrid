import 'electron';

export type HybridStatus =
  | 'bluetooth-permission-requested'
  | 'bluetooth-permission-denied'
  | 'bluetooth-off'
  | 'bluetooth-on'
  | 'phone-connected'
  | 'ble-advert-received'
  | 'ready'
  | 'closed';

export interface HybridRequestDetails {
  requestId: string;
  relyingPartyId: string;
  origin: string;
  frame: Electron.WebFrameMain | null;
}
export interface HybridQrDetails extends HybridRequestDetails {
  status: 'qr';
  /** Ephemeral secret: render exactly, never log or forward to remote content. */
  qr: string;
}
export interface HybridStatusDetails extends HybridRequestDetails {
  status: HybridStatus;
}

declare global {
  namespace Electron {
    interface Session {
      /** Opt in for new modal requests. Defaults to false and is not persisted. */
      setWebAuthnHybridEnabled(enabled: boolean): void;
      isWebAuthnHybridEnabled(): boolean;
      on(event: 'webauthn-hybrid-qr', listener: (event: Electron.Event, details: HybridQrDetails, cancel: () => void) => void): this;
      on(event: 'webauthn-hybrid-status', listener: (event: Electron.Event, details: HybridStatusDetails) => void): this;
      once(event: 'webauthn-hybrid-qr', listener: (event: Electron.Event, details: HybridQrDetails, cancel: () => void) => void): this;
      once(event: 'webauthn-hybrid-status', listener: (event: Electron.Event, details: HybridStatusDetails) => void): this;
    }
  }
}
