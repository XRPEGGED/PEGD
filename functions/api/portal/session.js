import { verifySession } from '../../_lib/portal.js'

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || ''
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export async function onRequestGet({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  const token = readCookie(request, 'xrpeg_portal')
  const session = secret ? await verifySession(token, secret) : null
  if (!session) {
    return Response.json(
      { success: true, authenticated: false },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return Response.json(
    {
      success: true,
      authenticated: true,
      session: { rail: session.rail, address: session.address, role: session.role || 'chairman' },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}