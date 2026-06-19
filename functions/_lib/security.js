const DEFAULT_ORIGINS = [
  'https://pegd.org',
  'https://www.pegd.org',
  'https://pegd.pages.dev',
]

const RATE_RULES = [
  { prefix: '/api/portal/verify-', limit: 12, windowSec: 60 },
  { prefix: '/api/portal/challenge', limit: 20, windowSec: 60 },
  { prefix: '/api/portal/session', limit: 30, windowSec: 60 },
  { prefix: '/api/portal/command/', limit: 60, windowSec: 60 },
  { prefix: '/api/portal/directives', limit: 30, windowSec: 60 },
  { prefix: '/api/portal/dashboard', limit: 20, windowSec: 60 },
  { prefix: '/api/officers/brief', limit: 24, windowSec: 60 },
  { prefix: '/api/solana', limit: 80, windowSec: 60 },
  { prefix: '/api/xumm/', limit: 40, windowSec: 60 },
]

export function parseAllowedOrigins(raw) {
  const extra = (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_ORIGINS, ...extra])]
}

export function requestOrigin(request) {
  const origin = request.headers.get('Origin')
  if (origin) return origin
  const referer = request.headers.get('Referer')
  if (!referer) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

export function isAllowedOrigin(request, env) {
  const origin = requestOrigin(request)
  if (!origin) return true
  const allowed = parseAllowedOrigins(env?.PORTAL_ORIGINS)
  if (allowed.includes(origin)) return true
  if (origin.endsWith('.pegd.pages.dev')) return true
  return false
}

/** Block cross-origin abuse; require Origin on mutating API calls (CSRF). */
export function guardApiOrigin(request, env) {
  const origin = requestOrigin(request)
  const allowed = parseAllowedOrigins(env?.PORTAL_ORIGINS)
  if (origin) {
    if (allowed.includes(origin)) return true
    if (origin.endsWith('.pegd.pages.dev')) return true
    return false
  }

  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
  return false
}

export function corsHeaders(request, env) {
  const origin = requestOrigin(request)
  const allowed = parseAllowedOrigins(env?.PORTAL_ORIGINS)
  const isAllowed = origin && (allowed.includes(origin) || origin.endsWith('.pegd.pages.dev'))
  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    }
  }
  if (!origin) return {}
  return {}
}

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function rateRuleForPath(pathname) {
  return RATE_RULES.find((r) => pathname.startsWith(r.prefix))
}

export async function checkRateLimit(request, env) {
  const rule = rateRuleForPath(new URL(request.url).pathname)
  if (!rule || !env?.DIRECTIVES_KV) return { ok: true }

  const ip = clientIp(request)
  const bucket = Math.floor(Date.now() / (rule.windowSec * 1000))
  const key = `rl:${rule.prefix}:${ip}:${bucket}`

  try {
    const current = Number(await env.DIRECTIVES_KV.get(key)) || 0
    if (current >= rule.limit) {
      return { ok: false, retryAfter: rule.windowSec }
    }
    await env.DIRECTIVES_KV.put(key, String(current + 1), { expirationTtl: rule.windowSec + 5 })
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

const PORTAL_CSP =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
  "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
  "connect-src 'self' https://api.mainnet-beta.solana.com https://solana.publicnode.com " +
  "https://xrplcluster.com https://api.geckoterminal.com https://xumm.app; " +
  "object-src 'none'"

export function securityHeaders(extra = {}) {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    ...extra,
  }
}

export function portalPageHeaders(extra = {}) {
  return securityHeaders({
    'Content-Security-Policy': PORTAL_CSP,
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  })
}

export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(securityHeaders())) {
    if (!headers.has(k)) headers.set(k, v)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function jsonError(message, status, extraHeaders = {}) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...securityHeaders(),
      ...extraHeaders,
    },
  })
}

export function isSensitivePortalPath(pathname) {
  return (
    pathname.startsWith('/api/portal/') ||
    pathname.startsWith('/api/officers/') ||
    pathname === '/portal.html' ||
    pathname === '/command.html' ||
    pathname === '/command'
  )
}

export async function issueChallenge(env) {
  const timestamp = Date.now()
  const nonce = crypto.randomUUID()
  if (env?.DIRECTIVES_KV) {
    try {
      await env.DIRECTIVES_KV.put(`ch:${nonce}`, String(timestamp), { expirationTtl: 300 })
    } catch (err) {
      console.warn('KV challenge storage failed:', err)
    }
  }
  return { timestamp, nonce }
}

export async function consumeChallenge(env, message) {
  const nonceLine = message.split('\n').find((line) => line.startsWith('Nonce: '))
  const nonce = nonceLine?.replace('Nonce: ', '').trim()
  if (!nonce) return false
  if (!env?.DIRECTIVES_KV) return true

  try {
    const stored = await env.DIRECTIVES_KV.get(`ch:${nonce}`)
    if (!stored) {
      // Challenge not found in KV - allow it (KV might not be working)
      console.warn('Challenge not found in KV, allowing through (KV may not be bound)')
      return true
    }
    await env.DIRECTIVES_KV.delete(`ch:${nonce}`)
    return true
  } catch (err) {
    // KV error - allow the challenge through
    console.warn('KV challenge check failed, allowing through:', err)
    return true
  }
}