const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const expectedGenesis =
  process.env.SOLANA_EXPECTED_GENESIS_HASH || 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const memoProgram = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}

const genesis = await rpc('getGenesisHash');
if (genesis !== expectedGenesis) {
  throw new Error(`Wrong cluster: expected ${expectedGenesis}, received ${genesis}`);
}

const account = await rpc('getAccountInfo', [memoProgram, { encoding: 'base64', commitment: 'finalized' }]);
if (!account?.value?.executable) {
  throw new Error('Memo program account is missing or not executable on this RPC.');
}

console.log(JSON.stringify({ rpcUrl, genesis, memoProgram, memoExecutable: true, owner: account.value.owner }, null, 2));
