export interface PendingStamp {
  requestId: string;
  sha256: string;
  signature: string | null;
}

// v1 deliberately keeps no client or server recovery journal.
// These functions remain as no-ops so the UI can stay small while the
// prototype validates the basic Solana flow first.
export function savePendingStamp(_value: PendingStamp): void {}

export function loadPendingStamp(): PendingStamp | null {
  return null;
}

export function clearPendingStamp(): void {}
