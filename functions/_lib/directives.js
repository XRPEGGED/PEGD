import { OFFICER_HUD } from './portal.js'

const KV_KEY = 'directives:v1'
const MAX_HISTORY = 20

export const DEFAULT_SPRINT = [
  { key: 'hero-listing', text: 'Active hero listing: Funko Vader with photo' },
  { key: 'stripe-live', text: 'Stripe live on worker' },
  { key: 'market-dns', text: 'market.pegd.org DNS' },
]

export const DEFAULT_BACKLOG = [
  { key: 'order1-sale', id: 'P0', task: 'First real sale + fulfillment', owner: 'COO' },
  { key: 'portal-secrets', id: 'P0', task: 'PORTAL_SESSION_SECRET + allowlist', owner: 'CISO', blocked: 'Chairman' },
  { key: 'stripe-secrets', id: 'P0', task: 'Stripe secrets on Cloudflare', owner: 'CTO', blocked: 'Chairman keys' },
  { key: 'listings-portal', id: 'P1', task: 'Chairman Listings Portal (pegd portal CRUD + photos + orders)', owner: 'CTO', spec: 'CPO' },
  { key: 'pegd-checkout', id: 'P1', task: 'PEGD Phantom checkout', owner: 'CTO', spec: 'CPO' },
  { key: 'market-dns', id: 'P1', task: 'market.pegd.org DNS', owner: 'CTO' },
  { key: 'seller-portal', id: 'P2', task: 'Public seller listings portal', owner: 'CTO', status: 'agenda' },
  { key: 'curve-bot', id: 'P3', task: 'Curve bot', owner: 'CFO', status: 'deferred' },
]

function orderByKeys(items, keys, keyField = 'key') {
  if (!Array.isArray(keys) || keys.length === 0) return items
  const map = new Map(items.map((item) => [item[keyField], item]))
  const ordered = keys.map((k) => map.get(k)).filter(Boolean)
  for (const item of items) {
    if (!ordered.some((o) => o[keyField] === item[keyField])) ordered.push(item)
  }
  return ordered
}

export function defaultState() {
  return {
    sprint: DEFAULT_SPRINT.map((s) => ({ ...s })),
    backlog: DEFAULT_BACKLOG.map((b) => ({ ...b })),
    updatedAt: null,
    updatedBy: null,
    role: null,
  }
}

async function readRaw(env) {
  if (!env?.DIRECTIVES_KV) return null
  try {
    return await env.DIRECTIVES_KV.get(KV_KEY, 'json')
  } catch {
    return null
  }
}

export async function getDirectiveState(env) {
  const raw = await readRaw(env)
  const sprint = orderByKeys(
    DEFAULT_SPRINT.map((s) => ({ ...s })),
    raw?.sprintOrder
  )
  const backlog = orderByKeys(
    DEFAULT_BACKLOG.map((b) => ({ ...b })),
    raw?.backlogOrder
  )
  return {
    sprint,
    backlog,
    updatedAt: raw?.updatedAt ?? null,
    updatedBy: raw?.updatedBy ?? null,
    role: raw?.role ?? null,
    canPersist: Boolean(env?.DIRECTIVES_KV),
  }
}

export async function buildHud(env) {
  const state = await getDirectiveState(env)
  return {
    ...OFFICER_HUD,
    sprint: state.sprint.map((s) => s.text),
    backlog: state.backlog,
    directivesMeta: {
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
      role: state.role,
      canPersist: state.canPersist,
    },
  }
}

function validateOrder(keys, allowed) {
  if (!Array.isArray(keys)) return false
  const allowedSet = new Set(allowed)
  if (keys.length !== allowed.length) return false
  return keys.every((k) => allowedSet.has(k))
}

export async function saveDirectiveOrder(env, { sprintOrder, backlogOrder }, actor) {
  if (!env?.DIRECTIVES_KV) {
    return { ok: false, error: 'Directive storage not configured (DIRECTIVES_KV)' }
  }

  const sprintKeys = DEFAULT_SPRINT.map((s) => s.key)
  const backlogKeys = DEFAULT_BACKLOG.map((b) => b.key)

  if (sprintOrder != null && !validateOrder(sprintOrder, sprintKeys)) {
    return { ok: false, error: 'Invalid sprint order' }
  }
  if (backlogOrder != null && !validateOrder(backlogOrder, backlogKeys)) {
    return { ok: false, error: 'Invalid backlog order' }
  }

  const prev = (await readRaw(env)) || {}
  const next = {
    sprintOrder: sprintOrder ?? prev.sprintOrder ?? sprintKeys,
    backlogOrder: backlogOrder ?? prev.backlogOrder ?? backlogKeys,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.address ?? null,
    role: actor?.role ?? 'holder',
    history: [
      {
        at: new Date().toISOString(),
        by: actor?.address ?? null,
        role: actor?.role ?? 'holder',
        sprint: Boolean(sprintOrder),
        backlog: Boolean(backlogOrder),
      },
      ...(Array.isArray(prev.history) ? prev.history : []),
    ].slice(0, MAX_HISTORY),
  }

  await env.DIRECTIVES_KV.put(KV_KEY, JSON.stringify(next))
  return { ok: true, state: await getDirectiveState(env) }
}

export function moveItem(keys, key, direction) {
  const idx = keys.indexOf(key)
  if (idx < 0) return keys
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= keys.length) return keys
  const next = keys.slice()
  ;[next[idx], next[swap]] = [next[swap], next[idx]]
  return next
}