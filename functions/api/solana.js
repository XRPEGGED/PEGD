import { corsHeaders, guardApiOrigin } from '../_lib/security.js'

const SOLANA_RPCS = [
  'https://solana.publicnode.com',
  'https://api.mainnet-beta.solana.com',
]

/** Read-only RPC methods for treasury stats + PEGD checkout (no sendTransaction). */
const ALLOWED_METHODS = new Set([
  'getBalance',
  'getTokenAccountsByOwner',
  'getAccountInfo',
  'getLatestBlockhash',
  'getRecentBlockhash',
  'getSignatureStatuses',
  'getBlockHeight',
  'getSlot',
  'getTokenAccountBalance',
  'simulateTransaction',
])

export async function onRequest(context) {
  const { request, env } = context
  const cors = corsHeaders(request, env)

  if (request.method === 'OPTIONS') {
    if (!guardApiOrigin(request, env)) {
      return new Response(null, { status: 403 })
    }
    return new Response(null, {
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!guardApiOrigin(request, env)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  let payload
  try {
    payload = JSON.parse(await request.text())
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  if (!ALLOWED_METHODS.has(payload?.method)) {
    return new Response(JSON.stringify({ error: 'RPC method not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const body = JSON.stringify(payload)
  let lastError = 'All RPC endpoints failed'

  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const text = await res.text()
      const data = JSON.parse(text)
      if (data.result != null || (data.error && data.error.code !== 403)) {
        return new Response(text, {
          status: res.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...cors,
          },
        })
      }
      lastError = text
    } catch (e) {
      lastError = String(e)
    }
  }

  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: lastError }, id: 1 }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
    },
  })
}