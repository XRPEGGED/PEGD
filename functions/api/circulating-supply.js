const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
const TREASURY_WALLETS = [
  'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb',   // Main treasury
  '4xpXLWEndmwFRm8tZm31pcUdGCw2u6MaeBs3q1RgE5C9',  // Compute treasury
]
const SOLANA_RPCS = [
  'https://solana.publicnode.com',
  'https://api.mainnet-beta.solana.com',
]

async function fetchRpc(method, params) {
  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const data = await res.json()
      if (data.result != null) return data.result
    } catch {}
  }
  return null
}

export async function onRequest() {
  const mintInfo = await fetchRpc('getAccountInfo', [PEGD_MINT, { encoding: 'jsonParsed' }])
  const parsed = mintInfo?.value?.data?.parsed?.info
  if (!parsed) {
    return new Response('0', { status: 502, headers: { 'Content-Type': 'text/plain' } })
  }

  const totalRaw = BigInt(parsed.supply)
  const decimals = parsed.decimals

  let treasuryRaw = 0n
  for (const wallet of TREASURY_WALLETS) {
    const accounts = await fetchRpc('getTokenAccountsByOwner', [
      wallet,
      { mint: PEGD_MINT },
      { encoding: 'jsonParsed' },
    ])
    for (const acct of accounts?.value ?? []) {
      const amt = acct.account.data.parsed.info.tokenAmount.amount
      treasuryRaw += BigInt(amt)
    }
  }

  const circulating = Math.floor(Number(totalRaw - treasuryRaw) / Math.pow(10, decimals))
  return new Response(circulating.toString(), {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
