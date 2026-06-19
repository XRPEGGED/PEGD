const MARKET_API =
  'https://xrpegged-market.xrpegged.workers.dev/api/proof/listings?limit=8'

const TREASURY_WALLET = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
const MARKET_ORIGIN = 'https://xrpegged-market.xrpegged.workers.dev'

function absoluteMediaUri(uri) {
  if (!uri) return null
  const trimmed = uri.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? `${MARKET_ORIGIN}${trimmed}` : `${MARKET_ORIGIN}/${trimmed}`
}

function isSeedListing(item) {
  const hasPhoto = Boolean(item.media_uri?.trim())
  const treasuryOwned =
    (item.owner_wallet || '').toLowerCase() === TREASURY_WALLET.toLowerCase()
  return !hasPhoto && treasuryOwned
}

const CATEGORY_EMOJI = {
  pokemon: '🃏',
  collectibles: '🏆',
  merch: '👕',
  digital: '🖼️',
  services: '🛠️',
  other: '📦',
}

async function fetchPrices() {
  const prices = { XRP: null, SOL: null }
  try {
    const [xrp, sol] = await Promise.all([
      fetch('https://api.coinbase.com/v2/prices/XRP-USD/spot').then((r) => r.json()),
      fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot').then((r) => r.json()),
    ])
    prices.XRP = xrp?.data?.amount ? parseFloat(xrp.data.amount) : null
    prices.SOL = sol?.data?.amount ? parseFloat(sol.data.amount) : null
  } catch {
    /* optional quotes */
  }
  return prices
}

const PEGD_CURVE_USD = 5107.77 / 1_000_000_000

function quote(usd, prices) {
  const parts = []
  if (prices.XRP) parts.push((usd / prices.XRP).toFixed(4) + ' XRP')
  if (prices.SOL) parts.push((usd / prices.SOL).toFixed(4) + ' SOL')
  if (PEGD_CURVE_USD > 0) {
    parts.push(Math.ceil(usd / PEGD_CURVE_USD).toLocaleString() + ' PEGD')
  }
  return parts.join(' · ')
}

export async function onRequest() {
  const prices = await fetchPrices()

  try {
    const res = await fetch(MARKET_API, {
      headers: { Accept: 'application/json' },
    })
    const data = await res.json()
    if (!res.ok || !data?.success || !Array.isArray(data.listings)) {
      throw new Error(data?.error || 'market unavailable')
    }

    const listings = data.listings
      .filter((item) => item.status === 'active')
      .map((item) => {
        const priceUsd = Number(item.price_drops) / 100
        const category = (item.category || 'other').toLowerCase()
        const isDemo = isSeedListing(item)
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
          category,
          emoji: CATEGORY_EMOJI[category] || '📦',
          mediaUri: absoluteMediaUri(item.media_uri),
          quotes: quote(priceUsd, prices),
          isDemo,
          live: !isDemo,
        }
      })

    const liveListings = listings.filter((item) => !item.isDemo)

    return new Response(
      JSON.stringify({
        success: true,
        listings: liveListings,
        demoCount: listings.length - liveListings.length,
        hasRealInventory: liveListings.length > 0,
        source: 'proof-market',
        marketUrl: 'https://xrpegged-market.xrpegged.workers.dev/proof',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load market listings',
        listings: [],
        source: 'proof-market',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}