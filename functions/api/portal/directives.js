import { verifySession } from '../../_lib/portal.js'
import { getDirectiveState, saveDirectiveOrder, moveItem, DEFAULT_SPRINT, DEFAULT_BACKLOG } from '../../_lib/directives.js'
import { formatPegdAmount, getHolderMinPegd } from '../../_lib/holder.js'

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || ''
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function canMove(session) {
  return session && (session.role === 'chairman' || session.role === 'holder')
}

export async function onRequestGet({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  const token = readCookie(request, 'xrpeg_portal')
  const session = await verifySession(token, secret)
  if (!session) {
    return Response.json(
      { success: false, error: 'Sign in required — directives are holder-gated', authenticated: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const [state, minGate] = await Promise.all([getDirectiveState(env), getHolderMinPegd(env)])
  const isChairman = (session.role || 'chairman') === 'chairman'

  return Response.json({
    success: true,
    sprint: state.sprint,
    backlog: state.backlog,
    meta: {
      updatedAt: state.updatedAt,
      updatedBy: isChairman ? state.updatedBy : null,
      role: session.role || 'holder',
      canPersist: state.canPersist,
      minPegdLabel: `≥${formatPegdAmount(minGate.min)} PEGD`,
      ...(isChairman
        ? {
            minPegdRequired: minGate.min,
            minPegdSource: minGate.source,
            treasuryPegd: minGate.treasury,
          }
        : {}),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function onRequestPost({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  const token = readCookie(request, 'xrpeg_portal')
  const session = await verifySession(token, secret)
  if (!canMove(session)) {
    return Response.json(
      { success: false, error: 'Holder sign-in required — connect Phantom with PEGD balance or Chairman allowlist' },
      { status: 401 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const state = await getDirectiveState(env)
  const sprintKeys = state.sprint.map((s) => s.key)
  const backlogKeys = state.backlog.map((b) => b.key)

  let sprintOrder = null
  let backlogOrder = null

  if (Array.isArray(body.sprintOrder)) {
    sprintOrder = body.sprintOrder
  } else if (Array.isArray(body.backlogOrder)) {
    backlogOrder = body.backlogOrder
  } else if (body.list && body.key && body.direction) {
    if (body.list === 'sprint') {
      sprintOrder = moveItem(sprintKeys, body.key, body.direction)
    } else if (body.list === 'backlog') {
      backlogOrder = moveItem(backlogKeys, body.key, body.direction)
    } else {
      return Response.json({ success: false, error: 'list must be sprint or backlog' }, { status: 400 })
    }
  } else {
    return Response.json({ success: false, error: 'Send sprintOrder, backlogOrder, or list+key+direction' }, { status: 400 })
  }

  const result = await saveDirectiveOrder(
    env,
    { sprintOrder, backlogOrder },
    { address: session.address, role: session.role }
  )

  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: 503 })
  }

  return Response.json({
    success: true,
    sprint: result.state.sprint,
    backlog: result.state.backlog,
    meta: {
      updatedAt: result.state.updatedAt,
      updatedBy: result.state.updatedBy,
      role: result.state.role,
    },
    defaults: {
      sprint: DEFAULT_SPRINT.map((s) => s.key),
      backlog: DEFAULT_BACKLOG.map((b) => b.key),
    },
  })
}