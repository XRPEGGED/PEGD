export async function onRequestPost({ env }) {
  const apiKey = env.XUMM_API_KEY
  const apiSecret = env.XUMM_API_SECRET
  if (!apiKey || !apiSecret) {
    return Response.json({ success: false, error: 'Xumm not configured on host' }, { status: 503 })
  }

  try {
    const res = await fetch('https://xumm.app/api/v1/platform/payload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
      },
      body: JSON.stringify({ txjson: { TransactionType: 'SignIn' } }),
    })
    const data = await res.json()
    if (!res.ok) {
      return Response.json({ success: false, error: data?.error || 'Xumm payload failed' }, { status: 502 })
    }
    return Response.json({
      success: true,
      uuid: data.uuid,
      qr: data.refs?.qr_png ?? null,
      deeplink: data.next?.always ?? null,
    }, { headers: { 'Access-Control-Allow-Origin': '*' } })
  } catch {
    return Response.json({ success: false, error: 'Xumm request failed' }, { status: 502 })
  }
}