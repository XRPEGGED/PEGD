const WORKER_ORIGIN = 'https://xrpegged-market.xrpegged.workers.dev'

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const wallet = (url.searchParams.get('wallet') || '').trim()
  const tx = (url.searchParams.get('tx') || '').trim()

  if (!wallet || !tx) {
    return Response.json(
      { success: false, error: 'wallet and tx query params required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const base = (env.SUPABASE_URL || '').replace(/\/$/, '')
  if (!key || !base) {
    return Response.json({ success: false, error: 'Order status unavailable' }, { status: 503 })
  }

  try {
    const q =
      `${base}/rest/v1/market_orders` +
      `?select=id,listing_id,status,fulfillment_status,tracking_number,shipping_submitted_at,updated_at` +
      `&buyer_wallet=eq.${encodeURIComponent(wallet)}` +
      `&accept_tx_hash=eq.${encodeURIComponent(tx)}` +
      `&limit=1`

    const res = await fetch(q, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    })
    const rows = await res.json().catch(() => [])
    const order = Array.isArray(rows) ? rows[0] : null

    if (!order) {
      return Response.json(
        { success: false, error: 'Order not found — check wallet + payment tx' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    let listingTitle = null
    if (order.listing_id) {
      const lres = await fetch(
        `${base}/rest/v1/market_listings?id=eq.${encodeURIComponent(order.listing_id)}&select=title&limit=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
          },
        }
      )
      const listings = await lres.json().catch(() => [])
      listingTitle = Array.isArray(listings) ? listings[0]?.title ?? null : null
    }

    return Response.json(
      {
        success: true,
        orderId: order.id,
        listingId: order.listing_id,
        listingTitle,
        status: order.status,
        fulfillmentStatus: order.fulfillment_status,
        trackingNumber: order.tracking_number || null,
        shippingSubmittedAt: order.shipping_submitted_at,
        updatedAt: order.updated_at,
        marketUrl: `${WORKER_ORIGIN}/proof`,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch {
    return Response.json({ success: false, error: 'Order status lookup failed' }, { status: 502 })
  }
}