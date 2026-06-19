import { requireChairman } from '../../../../_lib/chairman.js'
import { supabaseConfigured, updateListing, deleteListing } from '../../../../_lib/supabase-admin.js'

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  const id = params?.id
  if (!id) return Response.json({ success: false, error: 'Listing id required' }, { status: 400 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const updates = {}
  if (typeof body.title === 'string') updates.title = body.title.trim().slice(0, 120)
  if (typeof body.description === 'string') updates.description = body.description.trim().slice(0, 1000)
  if (typeof body.mediaUri === 'string') updates.media_uri = body.mediaUri.trim().slice(0, 500)
  if (typeof body.status === 'string') updates.status = body.status.trim()
  if (typeof body.category === 'string') updates.category = body.category.trim()
  if (body.priceUsd != null) {
    const priceUsd = Number(body.priceUsd)
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return Response.json({ success: false, error: 'Invalid priceUsd' }, { status: 400 })
    }
    updates.price_drops = Math.round(priceUsd * 100)
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ success: false, error: 'No fields to update' }, { status: 400 })
  }

  const listing = await updateListing(env, id, updates)
  return Response.json({ success: true, listing })
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  const id = params?.id
  if (!id) return Response.json({ success: false, error: 'Listing id required' }, { status: 400 })

  await updateListing(env, id, { status: 'archived' })
  return Response.json({ success: true, archived: true })
}