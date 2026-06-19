const WORKER_ORIGIN = 'https://xrpegged-market.xrpegged.workers.dev'

async function finalizeOrderOnWorker(payloadId) {
  try {
    await fetch(`${WORKER_ORIGIN}/api/xumm/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payloadId }),
    })
  } catch {
    /* best-effort — treasury still receives XRP */
  }
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.XUMM_API_KEY
  const apiSecret = env.XUMM_API_SECRET
  if (!apiKey || !apiSecret) {
    return Response.json({ success: false, error: 'Xumm not configured on host' }, { status: 503 })
  }

  let payloadId
  try {
    const body = await request.json()
    payloadId = body?.payloadId
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  if (!payloadId) {
    return Response.json({ success: false, error: 'Missing payloadId' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://xumm.app/api/v1/platform/payload/${payloadId}`, {
      headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
    })
    const data = await res.json()
    if (!res.ok) {
      return Response.json({ success: false, error: data?.error || 'Poll failed' }, { status: 502 })
    }

    const resolved = Boolean(data?.meta?.resolved)
    const signed = Boolean(data?.meta?.signed)
    const account = data?.response?.account ?? data?.response?.accountname ?? null

    if (!resolved) {
      return Response.json({ success: true, pending: true }, { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    const txid = data?.response?.txid ?? data?.response?.hash ?? null

    if (signed && txid) {
      await finalizeOrderOnWorker(payloadId)
    }

    return Response.json({
      success: true,
      pending: false,
      signed,
      account,
      txid,
      finalized: Boolean(signed && txid),
    }, { headers: { 'Access-Control-Allow-Origin': '*' } })
  } catch {
    return Response.json({ success: false, error: 'Poll request failed' }, { status: 502 })
  }
}