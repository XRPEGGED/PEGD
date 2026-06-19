const WORKER_ORIGIN = 'https://xrpegged-market.xrpegged.workers.dev'
const ALLOWED_ORIGINS = new Set([
  'https://pegd.org',
  'https://pegd.pages.dev',
  'https://market.pegd.org',
])

function corsHeaders(request) {
  const origin = request.headers.get('Origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
  }
  return {}
}

export async function onRequestPost({ request }) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const res = await fetch(`${WORKER_ORIGIN}/api/proof/orders/log-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return Response.json(data, {
      status: res.status,
      headers: corsHeaders(request),
    })
  } catch {
    return Response.json(
      { success: false, error: 'Order log unavailable' },
      { status: 502, headers: corsHeaders(request) }
    )
  }
}