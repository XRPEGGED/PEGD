const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function mintProofToken(secret, payload) {
  const payloadStr = JSON.stringify(payload)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr))
  return b64url(new TextEncoder().encode(payloadStr)) + '.' + b64url(mac)
}

export async function onRequestPost({ request, env }) {
  const { XUMM_API_KEY, XUMM_API_SECRET, AIRDROP_PROOF_SECRET } = env
  if (!XUMM_API_KEY || !XUMM_API_SECRET || !AIRDROP_PROOF_SECRET)
    return Response.json({ error: 'not configured' }, { status: 503, headers: CORS })

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'invalid json' }, { status: 400, headers: CORS })
  }
  const { payloadId, solAddress } = body || {}
  if (!payloadId)
    return Response.json({ error: 'missing payloadId' }, { status: 400, headers: CORS })
  if (!solAddress || solAddress.length < 32 || solAddress.length > 50)
    return Response.json({ error: 'invalid solAddress' }, { status: 400, headers: CORS })

  let xummData
  try {
    const res = await fetch(`https://xumm.app/api/v1/platform/payload/${payloadId}`, {
      headers: { 'X-API-Key': XUMM_API_KEY, 'X-API-Secret': XUMM_API_SECRET },
    })
    xummData = await res.json()
    if (!res.ok) return Response.json({ error: 'Xumm payload lookup failed' }, { status: 502, headers: CORS })
  } catch {
    return Response.json({ error: 'Xumm API unavailable' }, { status: 502, headers: CORS })
  }

  if (!xummData.meta?.resolved || !xummData.meta?.signed)
    return Response.json({ error: 'Payload not yet signed' }, { status: 400, headers: CORS })

  const xrpAddress = xummData.response?.account
  if (!xrpAddress || !xrpAddress.startsWith('r') || xrpAddress.length < 25 || xrpAddress.length > 50)
    return Response.json({ error: 'No valid XRP account in signed payload' }, { status: 400, headers: CORS })

  const jti = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + 900
  const xamanProof = await mintProofToken(AIRDROP_PROOF_SECRET, { xrpAddress, solAddress, exp, jti, payloadId })

  return Response.json({ xamanProof, xrpAddress }, { headers: CORS })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
