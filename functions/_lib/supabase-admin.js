const DEFAULT_URL = 'https://tmaeezonwjyydkxwpeug.supabase.co'
const BUCKET = 'market-media'

function baseUrl(env) {
  return (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '')
}

function serviceKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || ''
}

function headers(env, extra = {}) {
  const key = serviceKey(env)
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  }
}

export function supabaseConfigured(env) {
  return Boolean(serviceKey(env))
}

async function rest(env, path, options = {}) {
  const key = serviceKey(env)
  if (!key) {
    throw new Error('Supabase not configured — set SUPABASE_SERVICE_ROLE_KEY on Cloudflare Pages')
  }
  const res = await fetch(`${baseUrl(env)}/rest/v1/${path}`, {
    ...options,
    headers: headers(env, options.headers),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.hint || text || res.statusText
    throw new Error(typeof msg === 'string' ? msg : 'Supabase request failed')
  }
  return data
}

export async function listAllListings(env, limit = 100) {
  const rows = await rest(
    env,
    `market_listings?select=*&order=created_at.desc&limit=${Math.min(limit, 200)}`
  )
  return Array.isArray(rows) ? rows : []
}

export async function getListing(env, id) {
  const rows = await rest(env, `market_listings?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function createListing(env, row) {
  const rows = await rest(env, 'market_listings', {
    method: 'POST',
    body: JSON.stringify([row]),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

export async function updateListing(env, id, updates) {
  const rows = await rest(env, `market_listings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

export async function deleteListing(env, id) {
  await rest(env, `market_listings?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  return { ok: true }
}

export async function listOrders(env, limit = 50) {
  try {
    const rows = await rest(
      env,
      `market_orders?select=id,listing_id,seller_wallet,buyer_wallet,price_drops,currency_code,status,network,fulfillment_status,shipping_submitted_at,tracking_number,created_at,updated_at&order=created_at.desc&limit=${Math.min(limit, 100)}`
    )
    return Array.isArray(rows) ? rows : []
  } catch (err) {
    if (String(err.message).includes('market_orders')) return []
    throw err
  }
}

export async function updateOrder(env, id, updates) {
  const rows = await rest(env, `market_orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

export async function uploadListingPhoto(env, file, filename) {
  const key = serviceKey(env)
  if (!key) throw new Error('Supabase not configured')

  const storagePath = `listings/${filename}`
  const bytes = await file.arrayBuffer()
  const res = await fetch(`${baseUrl(env)}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: bytes,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Upload failed')
  }
  return `${baseUrl(env)}/storage/v1/object/public/${BUCKET}/${storagePath}`
}