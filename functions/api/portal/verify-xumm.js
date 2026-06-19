import { isAllowed, parseAllowlist, sessionCookie, signSession } from '../../_lib/portal.js'

export async function onRequestPost({ request, env }) {
  const apiKey = env.XUMM_API_KEY
  const apiSecret = env.XUMM_API_SECRET
  const secret = env.PORTAL_SESSION_SECRET
  const allowlist = parseAllowlist(env.PORTAL_ALLOWLIST)

  if (!apiKey || !apiSecret) {
    return Response.json({ success: false, error: 'Xumm not configured' }, { status: 503 })
  }
  if (!secret || allowlist.length === 0) {
    return Response.json({ success: false, error: 'Portal not configured' }, { status: 503 })
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

  const res = await fetch(`https://xumm.app/api/v1/platform/payload/${payloadId}`, {
    headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret },
  })
  const data = await res.json()
  if (!res.ok) {
    return Response.json({ success: false, error: 'Xumm verification failed' }, { status: 502 })
  }

  if (!data?.meta?.resolved || !data?.meta?.signed) {
    return Response.json({ success: false, error: 'Sign-in not completed' }, { status: 401 })
  }

  const account = data?.response?.account ?? data?.response?.accountname ?? null
  if (!isAllowed(allowlist, 'xrpl', account)) {
    return Response.json({ success: false, error: 'Wallet not authorized' }, { status: 403 })
  }

  const exp = Date.now() + 4 * 60 * 60 * 1000  // 4h session
  const token = await signSession({ rail: 'xrpl', address: account, role: 'chairman', exp }, secret)

  return Response.json(
    { success: true, rail: 'xrpl', address: account, role: 'chairman' },
    { headers: { 'Set-Cookie': sessionCookie(token) } }
  )
}