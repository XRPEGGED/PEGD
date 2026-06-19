import { verifySession } from './portal.js'

const TREASURY_XRP = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
const TREASURY_SOL = 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb'

export function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || ''
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export async function getChairmanSession(request, env) {
  const secret = env.PORTAL_SESSION_SECRET
  if (!secret) return null
  const token = readCookie(request, 'xrpeg_portal')
  const session = await verifySession(token, secret)
  if (!session) return null
  if ((session.role || 'chairman') !== 'chairman') return null
  return session
}

export async function requireChairman(request, env) {
  const session = await getChairmanSession(request, env)
  if (!session) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Chairman allowlist required — sign in via Xaman or Phantom' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      ),
    }
  }
  return { ok: true, session }
}

export function isCommandPath(pathname) {
  return (
    pathname === '/command.html' ||
    pathname === '/command' ||
    pathname.startsWith('/api/portal/command/')
  )
}

/** Buyer order tracking — available during site pause */
export function isOrderStatusPath(pathname) {
  return (
    pathname === '/order-status.html' ||
    pathname === '/order-status' ||
    pathname === '/order-complete.html' ||
    pathname === '/order-complete' ||
    pathname === '/js/order-status.js'
  )
}

/** Public transparency pages — available during site pause */
export function isOraclePath(pathname) {
  return (
    pathname === '/about-xrp.html' ||
    pathname === '/about-xrp' ||
    pathname === '/proof-oracle.html' ||
    pathname === '/proof-oracle' ||
    isOrderStatusPath(pathname)
  )
}

export function isProofOraclePath(pathname) {
  return pathname === '/proof-oracle.html' || pathname === '/proof-oracle'
}

export const CHAIRMAN_DEFAULTS = {
  treasuryXrp: TREASURY_XRP,
  treasurySol: TREASURY_SOL,
}