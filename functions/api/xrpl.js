import { corsHeaders, guardApiOrigin } from '../_lib/security.js'

const XRPL_RPCS = [
  'https://xrplcluster.com',
  'https://s1.ripple.com:51234',
  'https://s2.ripple.com:51234',
]

function buildAccountInfoPayload(account) {
  return {
    method: 'account_info',
    params: [{ account, ledger_index: 'validated' }],
  }
}

async function proxyAccountInfo(account) {
  const body = JSON.stringify(buildAccountInfoPayload(account))
  let lastError = 'XRPL endpoint unavailable'

  for (const rpc of XRPL_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const text = await res.text()
      const data = JSON.parse(text)
      if (data?.result?.account_data || data?.error) {
        return { status: res.status, text }
      }
      lastError = text
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

  const account = payload?.account || payload?.params?.[0]?.account
  if (!account || typeof account !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing account' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const { status, text } = await proxyAccountInfo(account)
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...cors,
    },
  })
}
