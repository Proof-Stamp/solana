declare const __BUILD_SHA__: string;

export const APP_VERSION = '0.1.0';
export const BUILD_SHA = __BUILD_SHA__;
export const RECEIPT_VERSION = 1;
export const PROTOCOL_VERSION = 1;
export const NETWORK_LABEL = 'solana-devnet';
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PROTOCOL_PREFIX = `proofstamp:v${PROTOCOL_VERSION}:sha256:`;

export const PRIMARY_RPC =
  import.meta.env.VITE_SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
export const FALLBACK_RPC = import.meta.env.VITE_SOLANA_RPC_FALLBACK_URL?.trim() || '';
export const SUBMIT_API_BASE =
  import.meta.env.VITE_SUBMIT_API_BASE?.trim().replace(/\/$/, '') || '';

export function explorerUrl(signature: string): string {
  const value = encodeURIComponent(signature);
  return `https://explorer.solana.com/tx/${value}?cluster=devnet`;
}
