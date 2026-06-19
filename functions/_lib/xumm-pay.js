const MARKET_LISTINGS =
  'https://xrpegged-market.xrpegged.workers.dev/api/proof/listings'
const XRP_TREASURY = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'

export function utf8ToHex(str) {
  const bytes = new TextEncoder().encode(str)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function fetchXrpUsd() {
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/XRP-USD/spot')
    const data = await res.json()
    const n = parseFloat(data?.data?.amount)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function usdToXrpDrops(usd, xrpUsd) {
  if (!Number.isFinite(usd) || usd <= 0 || !xrpUsd) return null
  const xrp = usd / xrpUsd
  const drops = Math.round(xrp * 1_000_000)
  return drops > 0 ? drops : 1
}

export async function fetchListing(listingId) {
  const res = await fetch(`${MARKET_LISTINGS}?limit=50`)
  const data = await res.json()
  if (!data?.success || !Array.isArray(data.listings)) return null
  return data.listings.find((l) => l.id === listingId && l.status === 'active') || null
}

export async function createXummPayment({ apiKey, apiSecret, buyerAddress, drops, memo, destination }) {
  const txjson = {
    TransactionType: 'Payment',
    Account: buyerAddress,
    Destination: destination || XRP_TREASURY,
    Amount: String(drops),
  }
  if (memo) {
    txjson.Memos = [{ Memo: { MemoData: utf8ToHex(memo) } }]
  }

  const res = await fetch('https://xumm.app/api/v1/platform/payload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret,
    },
    body: JSON.stringify({
      txjson,
      options: { submit: true, expire: 10 },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Xumm payload failed')
  }
  return data
}

export { XRP_TREASURY }