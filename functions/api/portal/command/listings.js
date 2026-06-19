import { requireChairman, CHAIRMAN_DEFAULTS } from '../../../_lib/chairman.js'
import {
  supabaseConfigured,
  listAllListings,
  createListing,
} from '../../../_lib/supabase-admin.js'

export async function onRequestGet({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured on Pages' }, { status: 503 })
  }
  const listings = await listAllListings(env, 100)
  return Response.json({ success: true, listings }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function onRequestPost({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured on Pages' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const title = String(body.title || '').trim().slice(0, 120)
  if (!title) return Response.json({ success: false, error: 'Title required' }, { status: 400 })

  const priceUsd = Number(body.priceUsd)
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return Response.json({ success: false, error: 'priceUsd must be positive' }, { status: 400 })
  }

  const mediaUri = typeof body.mediaUri === 'string' ? body.mediaUri.trim().slice(0, 500) : null
  if (!mediaUri) {
    return Response.json({ success: false, error: 'Product photo required — upload or paste URL' }, { status: 400 })
  }

  const listing = await createListing(env, {
    title,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null,
    price_drops: Math.round(priceUsd * 100),
    currency_code: 'USD',
    media_uri: mediaUri,
    status: body.status === 'pending' ? 'pending' : 'active',
    owner_wallet: CHAIRMAN_DEFAULTS.treasuryXrp,
    category: ['pokemon', 'collectibles', 'merch', 'digital', 'services', 'other'].includes(body.category)
      ? body.category
      : 'other',
    listing_mode: 'direct',
    payment_rail: 'solana',
    network: 'multi',
    solana_wallet: CHAIRMAN_DEFAULTS.treasurySol,
  })

  return Response.json({ success: true, listing })
}