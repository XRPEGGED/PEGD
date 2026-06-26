import {
  isAllowed,
  parseAllowlist,
  sessionCookie,
  signSession,
  verifyPhantomMessage,
} from '../../_lib/portal.js'
import { consumeChallenge } from '../../_lib/security.js'

export async function onRequestPost({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  if (!secret) {
    return Response.json({ success: false, error: 'Portal not configured' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { address, message, signature } = body || {}
  if (!address || !message || !signature) {
    return Response.json({ success: false, error: 'Missing sign-in fields' }, { status: 400 })
  }

  const valid = await verifyPhantomMessage(message, signature, address)
  if (!valid) {
    return Response.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  }

  const fresh = await consumeChallenge(env, message)
  if (!fresh) {
    return Response.json({ success: false, error: 'Sign-in challenge expired — try again' }, { status: 401 })
  }

  // Chairman = on allowlist. Everyone else = holder (can sign in, limited access).
  const allowlist = parseAllowlist(env.PORTAL_ALLOWLIST)
  const role = isAllowed(allowlist, 'solana', address) ? 'chairman' : 'holder'

  const exp = Date.now() + 4 * 60 * 60 * 1000
  const token = await signSession({ rail: 'solana', address, role, exp }, secret)

  return Response.json(
    { success: true, rail: 'solana', address, role },
    { headers: { 'Set-Cookie': sessionCookie(token) } }
  )
}