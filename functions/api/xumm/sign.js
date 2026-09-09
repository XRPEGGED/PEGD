import { corsHeaders, guardApiOrigin } from '../../_lib/security.js'

const CLASSIC_ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/
const TX_TYPE = /^[A-Za-z][A-Za-z0-9]{1,31}$/

const STRIP_KEYS = new Set([
  'SigningPubKey',
  'TxnSignature',
  'Signers',
  'LastLedgerSequence',
  'Sequence',
])

function stripDangerous(tx) {
  const out = {}
  for (const [k, v] of Object.entries(tx)) {
    if (STRIP_KEYS.has(k)) continue
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
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
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  if (!guardApiOrigin(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const apiKey = env.XUMM_API_KEY
  const apiSecret = env.XUMM_API_SECRET
  if (!apiKey || !apiSecret) {
    return new Response(
      JSON.stringify({ success: false, error: 'Xaman connect unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...cors } }
    )
  }

  let body
  try {
    body = JSON.parse(await request.text())
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const rawTx = body?.txjson
  if (!rawTx || typeof rawTx !== 'object' || Array.isArray(rawTx)) {
    return new Response(JSON.stringify({ success: false, error: 'txjson object required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const txjson = stripDangerous(rawTx)
  if (!TX_TYPE.test(String(txjson.TransactionType || ''))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Valid TransactionType required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
    )
  }

  if (txjson.Account != null && !CLASSIC_ADDR.test(String(txjson.Account))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid Account address' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
    )
  }

  const serialized = JSON.stringify(txjson)
  if (serialized.length > 12_000) {
    return new Response(
      JSON.stringify({ success: false, error: 'Transaction JSON too large' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
    )
  }

  try {
    const res = await fetch('https://xumm.app/api/v1/platform/payload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
      },
      body: JSON.stringify({
        txjson,
        options: {
          submit: true,
          expire: 15,
          return_url: {
            app: 'https://pegd.org/xrpl',
            web: 'https://pegd.org/xrpl',
          },
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      const errMsg =
        (typeof data?.error === 'object' ? data.error?.message : data?.error) ||
        data?.message ||
        'Xumm payload failed'
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        uuid: data.uuid,
        qr: data.refs?.qr_png ?? null,
        deeplink: data.next?.always ?? null,
        txjson,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
      }
    )
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Xumm request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
}
