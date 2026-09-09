import { corsHeaders, guardApiOrigin } from '../_lib/security.js'

const XRPL_RPCS = [
  'https://xrplcluster.com',
  'https://s1.ripple.com:51234',
  'https://s2.ripple.com:51234',
]

/** Read methods + carefully gated submit of already-signed blobs. */
const ALLOWED_METHODS = new Set([
  'account_info',
  'account_tx',
  'account_lines',
  'account_objects',
  'fee',
  'submit',
])

const CLASSIC_ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/
const TX_BLOB = /^[0-9A-Fa-f]{64,}$/

function isClassicAddress(value) {
  return typeof value === 'string' && CLASSIC_ADDR.test(value)
}

function sanitizeParams(method, rawParams) {
  if (method === 'fee') {
    return { params: [{}] }
  }

  if (method === 'submit') {
    const first = Array.isArray(rawParams) ? rawParams[0] : rawParams
    const blob =
      (typeof first === 'string' && first) ||
      (first && typeof first === 'object' ? first.tx_blob || first.txBlob : null)
    if (!blob || typeof blob !== 'string' || !TX_BLOB.test(blob.replace(/\s+/g, ''))) {
      return { error: 'submit requires hex tx_blob (signed transaction only)' }
    }
    const cleaned = blob.replace(/\s+/g, '')
    if (cleaned.length > 200_000) {
      return { error: 'tx_blob too large' }
    }
    // Never accept unsigned tx_json for submit — signing stays in the wallet.
    return { params: [{ tx_blob: cleaned }] }
  }

  const first = Array.isArray(rawParams) ? rawParams[0] : rawParams
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return { error: 'params[0] must be an object' }
  }

  const account = first.account
  if (!isClassicAddress(account)) {
    return { error: 'Valid classic account address required' }
  }

  const params = {
    account,
    ledger_index:
      first.ledger_index === 'current' || first.ledger_index === 'closed'
        ? first.ledger_index
        : 'validated',
  }

  if (method === 'account_tx') {
    if (typeof first.limit === 'number' && first.limit > 0) {
      params.limit = Math.min(Math.floor(first.limit), 40)
    } else {
      params.limit = 15
    }
    if (typeof first.forward === 'boolean') params.forward = first.forward
    params.ledger_index_min = -1
    params.ledger_index_max = -1
  }

  if (method === 'account_lines') {
    if (typeof first.limit === 'number' && first.limit > 0) {
      params.limit = Math.min(Math.floor(first.limit), 50)
    }
    if (isClassicAddress(first.peer)) params.peer = first.peer
  }

  if (method === 'account_objects') {
    if (typeof first.limit === 'number' && first.limit > 0) {
      params.limit = Math.min(Math.floor(first.limit), 50)
    }
    if (typeof first.type === 'string' && /^[a-z_]{2,32}$/.test(first.type)) {
      params.type = first.type
    }
  }

  return { params: [params] }
}

async function proxyRpc(method, params) {
  const body = JSON.stringify({ method, params })
  let lastError = 'XRPL endpoint unavailable'

  for (const rpc of XRPL_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        lastError = text.slice(0, 200)
        continue
      }
      if (data?.result || data?.error) {
        return { status: res.status, text }
      }
      lastError = text.slice(0, 200)
    } catch (err) {
      lastError = String(err)
    }
  }

  return {
    status: 502,
    text: JSON.stringify({ error: lastError }),
  }
}

export async function onRequest(context) {
  const { request, env } = context
  const cors = corsHeaders(request, env)

  if (request.method === 'OPTIONS') {
    if (!guardApiOrigin(request, env)) return new Response(null, { status: 403 })
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

  let method = typeof payload?.method === 'string' ? payload.method.trim() : 'account_info'
  if (!payload?.method && (payload?.account || payload?.params?.[0]?.account)) {
    method = 'account_info'
  }

  if (!ALLOWED_METHODS.has(method)) {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        allowed: [...ALLOWED_METHODS],
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      }
    )
  }

  const rawParams =
    payload?.params ||
    (payload?.account ? [{ account: payload.account, ledger_index: 'validated' }] : null)

  const cleaned = sanitizeParams(method, rawParams)
  if (cleaned.error) {
    return new Response(JSON.stringify({ error: cleaned.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const { status, text } = await proxyRpc(method, cleaned.params)
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...cors,
    },
  })
}
