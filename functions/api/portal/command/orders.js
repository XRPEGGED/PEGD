import { requireChairman } from '../../../_lib/chairman.js'
import { supabaseConfigured, listOrders, updateOrder } from '../../../_lib/supabase-admin.js'

const WORKER_ORIGIN = 'https://xrpegged-market.xrpegged.workers.dev'

async function notifyShippedEmail(operatorWallet, orderId, trackingNumber) {
  if (!trackingNumber?.trim()) return null
  try {
    const res = await fetch(`${WORKER_ORIGIN}/api/proof/orders/shipping/notify-shipped`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorWallet, orderId, trackingNumber: trackingNumber.trim() }),
    })
    return await res.json().catch(() => ({}))
  } catch {
    return { success: false, error: 'notify-unavailable' }
  }
}

export async function onRequestGet({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }
  const orders = await listOrders(env, 50)
  return Response.json({ success: true, orders }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return Response.json({ success: false, error: 'Order id required' }, { status: 400 })

  const updates = {}
  const allowedFulfillment = ['awaiting_payment', 'paid', 'shipping_submitted', 'shipped', 'delivered', 'cancelled']
  if (typeof body.fulfillmentStatus === 'string' && allowedFulfillment.includes(body.fulfillmentStatus)) {
    updates.fulfillment_status = body.fulfillmentStatus
  }
  if (typeof body.trackingNumber === 'string') {
    const tracking = body.trackingNumber.trim().slice(0, 120)
    updates.tracking_number = tracking || null
    if (tracking && !updates.fulfillment_status) {
      updates.fulfillment_status = 'shipped'
    }
  }
  if (typeof body.status === 'string') {
    updates.status = body.status.trim()
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ success: false, error: 'No valid updates' }, { status: 400 })
  }

  const order = await updateOrder(env, id, updates)
  let emailNotify = null
  const tracking = updates.tracking_number
  if (tracking && (updates.fulfillment_status === 'shipped' || order?.fulfillment_status === 'shipped')) {
    emailNotify = await notifyShippedEmail(auth.session.address, id, tracking)
  }
  return Response.json({ success: true, order, emailNotify })
}