const PENDING_KEY = 'proofstamp-solana:pending-v1';

export interface PendingStamp {
  requestId: string;
  sha256: string;
  signature: string | null;
}

export function savePendingStamp(value: PendingStamp): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // Recovery is useful but not required for correctness.
  }
}

export function loadPendingStamp(): PendingStamp | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStamp;
    if (!parsed.requestId || !parsed.sha256) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingStamp(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Ignore storage failures.
  }
}
