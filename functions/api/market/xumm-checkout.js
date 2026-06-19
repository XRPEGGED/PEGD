const BUYER_XRP_DISABLED =
  'XRP buyer checkout is disabled (QR-009). Use Phantom (PEGD). XRP is treasury + listing bonds only.'

/** Buyer Xumm checkout deprecated — XRP reserved for treasury + seller listing bonds. */
export async function onRequestPost() {
  return Response.json(
    { success: false, error: 'buyer_xrp_disabled', message: BUYER_XRP_DISABLED },
    { status: 410, headers: { 'Access-Control-Allow-Origin': '*' } }
  )
}