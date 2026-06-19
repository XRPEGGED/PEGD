import {
  applySecurityHeaders,
  checkRateLimit,
  guardApiOrigin,
  jsonError,
  portalPageHeaders,
  securityHeaders,
} from './_lib/security.js'
import { isCommandPath, isOraclePath, isProofOraclePath } from './_lib/chairman.js'

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>XRPEGGED — Paused</title>
  <style>
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      font-family: system-ui, sans-serif; background: #0a0a1a; color: #e0e0ff;
      padding: 24px; text-align: center;
    }
    .card {
      max-width: 420px; border: 1px solid rgba(0,245,255,0.2);
      border-radius: 16px; padding: 28px 22px; background: #13132e;
    }
    h1 { font-size: 1.1rem; color: #00f5ff; margin: 0 0 8px; }
    p { color: #7070a0; font-size: 0.9rem; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>XRPEGGED is paused</h1>
    <p>pegd.org is temporarily offline while we harden ops. Treasury and on-chain assets are unchanged.</p>
    <p style="margin-top:14px;color:#00f5ff;font-weight:700;">Target return: __MAINTENANCE_LABEL__</p>
  </div>
</body>
</html>`

function pauseRequested(env) {
  return env.SITE_PAUSED === 'true' || env.SITE_PAUSED === '1' || env.MAINTENANCE_MODE === 'true'
}

function formatUntilLabel(until) {
  const d = new Date(until)
  if (Number.isNaN(d.getTime())) return 'TBD — Chairman sets return date'
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const isApi = url.pathname.startsWith('/api/')

  if (isApi && !guardApiOrigin(request, env)) {
    return jsonError('Origin not allowed', 403)
  }

  const rate = await checkRateLimit(request, env)
  if (!rate.ok) {
    return jsonError('Too many requests — slow down', 429, {
      'Retry-After': String(rate.retryAfter || 60),
    })
  }

  if (
    pauseRequested(env) &&
    !isCommandPath(url.pathname) &&
    !isOraclePath(url.pathname) &&
    !url.pathname.startsWith('/api/market/order-status') &&
    url.pathname !== '/portal.html'
  ) {
    const until = env.MAINTENANCE_UNTIL || ''
    const untilMs = until ? new Date(until).getTime() : NaN

    if (Number.isFinite(untilMs) && Date.now() >= untilMs) {
      const response = await context.next()
      return applySecurityHeaders(response)
    }

    const label = until ? formatUntilLabel(until) : 'TBD — Chairman sets return date'
    const retryAfter = Number.isFinite(untilMs)
      ? String(Math.max(60, Math.ceil((untilMs - Date.now()) / 1000)))
      : '3600'

    if (isApi) {
      return jsonError('Site paused for maintenance', 503, { 'Retry-After': retryAfter })
    }

    const html = MAINTENANCE_HTML.replace('__MAINTENANCE_LABEL__', label.replace(/[<>&"']/g, ''))
    return new Response(html, {
      status: 503,
      headers: {
        ...securityHeaders(),
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': retryAfter,
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }

  if (url.pathname === '/portal.html' || url.pathname === '/command.html' || url.pathname === '/command') {
    const response = await context.next()
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(portalPageHeaders())) {
      if (!headers.has(k)) headers.set(k, v)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  const response = await context.next()

  if (isProofOraclePath(url.pathname)) {
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(securityHeaders({ 'X-Frame-Options': 'SAMEORIGIN' }))) {
      headers.set(k, v)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return applySecurityHeaders(response)
}