const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
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
  const info = await fetchRpc('getAccountInfo', [PEGD_MINT, { encoding: 'jsonParsed' }])
  const parsed = info?.value?.data?.parsed?.info
  if (!parsed) {
    return new Response('0', { status: 502, headers: { 'Content-Type': 'text/plain' } })
  }
  const supply = Math.floor(Number(BigInt(parsed.supply)) / Math.pow(10, parsed.decimals))
  return new Response(supply.toString(), {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
