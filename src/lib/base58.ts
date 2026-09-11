const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(58);
const LOOKUP = new Map(Array.from(ALPHABET, (char, index) => [char, BigInt(index)]));

export function decodeBase58(input: string): Uint8Array {
  if (!input) return new Uint8Array();

  let value = BigInt(0);
  for (const char of input) {
    const digit = LOOKUP.get(char);
    if (digit === undefined) {
      throw new Error('Invalid base58 data.');
    }
    value = value * BASE + digit;
  }

  const bytes: number[] = [];
  while (value > 0) {
    bytes.push(Number(value & BigInt(255)));
    value >>= BigInt(8);
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === '1') {
    leadingZeros += 1;
  }

  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);
  return result;
}
