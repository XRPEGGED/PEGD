import { createXummPayment, XRP_TREASURY } from '../../_lib/xumm-pay.js'

const MIN_XRP = 1
const MAX_XRP = 5000

export async function onRequestPost({ request, env }) {
  const apiKey = env.XUMM_API_KEY || env.XUMM_API_KEY_MAINNET
  const apiSecret = env.XUMM_API_SECRET || env.XUMM_API_SECRET_MAINNET
  if (!apiKey || !apiSecret) {
    return Response.json({ success: false, error: 'Xaman not configured on host' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const buyerAddress = typeof body?.buyerAddress === 'string' ? body.buyerAddress.trim() : ''
  const phantomAddress = typeof body?.phantomAddress === 'string' ? body.phantomAddress.trim() : ''
  const xrpAmount = Number(body?.xrpAmount)
  const pegdEstimate = Number(body?.pegdEstimate)

  if (!buyerAddress.startsWith('r') || buyerAddress.length < 25) {
    return Response.json({ success: false, error: 'Valid Xaman wallet required' }, { status: 400 })
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(phantomAddress)) {
    return Response.json({ success: false, error: 'Valid Phantom wallet required' }, { status: 400 })
  }
  if (!Number.isFinite(xrpAmount) || xrpAmount < MIN_XRP || xrpAmount > MAX_XRP) {
    return Response.json(
      { success: false, error: `XRP amount must be between ${MIN_XRP} and ${MAX_XRP}` },
      { status: 400 }
    )
  }

  const drops = Math.round(xrpAmount * 1_000_000)
  if (drops <= 0) {
    return Response.json({ success: false, error: 'Invalid XRP amount' }, { status: 400 })
  }

  const pegdPart = Number.isFinite(pegdEstimate) && pegdEstimate > 0 ? pegdEstimate.toFixed(2) : 'quote'
  const memo = `xrpegged:swap:v1:xrp-pegd:${phantomAddress}:${pegdPart}`

  try {
    const data = await createXummPayment({
      apiKey,
      apiSecret,
      buyerAddress,
      drops,
      memo,
      destination: XRP_TREASURY,
    })

    return Response.json({
      success: true,
      uuid: data.uuid,
      qr: data.refs?.qr_png ?? null,
      deeplink: data.next?.always ?? null,
      treasury: XRP_TREASURY,
      memo,
      drops,
    })
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Xaman payload failed' },
      { status: 502 }
    )
  }
}