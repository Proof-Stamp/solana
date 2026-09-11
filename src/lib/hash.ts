import { MAX_FILE_BYTES } from './config';

export class FileTooLargeError extends Error {
  constructor(size: number) {
    super(`File is ${size} bytes; the current limit is ${MAX_FILE_BYTES} bytes.`);
    this.name = 'FileTooLargeError';
  }
}

export function bytesToLowerHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256File(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileTooLargeError(file.size);
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToLowerHex(new Uint8Array(digest));
}
