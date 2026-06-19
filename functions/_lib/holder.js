const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
export const SOL_TREASURY = 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb'
const MIN_CACHE_KEY = 'holder-min-pegd-cache'
const MIN_CACHE_MS = 60 * 60 * 1000
/** Last verified treasury PEGD — used if RPC read fails in the worker */
const TREASURY_PEGD_FALLBACK = 20_877_450

export function formatPegdAmount(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export async function pegdBalanceUiAmount(address) {
  if (!address) return 0
  const res = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        address,
        { mint: PEGD_MINT },
        { encoding: 'jsonParsed' },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  const accounts = data?.result?.value
  if (!Array.isArray(accounts) || accounts.length === 0) return 0
  let total = 0
  for (const row of accounts) {
    const amt = row?.account?.data?.parsed?.info?.tokenAmount?.uiAmount
    if (typeof amt === 'number' && Number.isFinite(amt)) total += amt
  }
  return total
}

export async function getTreasuryPegdBalance() {
  return pegdBalanceUiAmount(SOL_TREASURY)
}

/** Default: match treasury PEGD holdings. Override with HOLDER_MIN_PEGD Pages secret. */
export async function getHolderMinPegd(env) {
  if (env?.HOLDER_MIN_PEGD) {
    const fixed = Number(env.HOLDER_MIN_PEGD)
    if (Number.isFinite(fixed) && fixed > 0) {
      return { min: fixed, source: 'env', treasury: null }
    }
  }

  if (env?.DIRECTIVES_KV) {
    try {
      const cached = await env.DIRECTIVES_KV.get(MIN_CACHE_KEY, 'json')
      if (cached?.exp > Date.now() && Number.isFinite(cached.min) && cached.min > 1) {
        return { min: cached.min, source: 'treasury', treasury: cached.treasury ?? null }
      }
    } catch {
      /* fall through */
    }
  }

  let treasury = await getTreasuryPegdBalance()
  if (!Number.isFinite(treasury) || treasury <= 0) {
    treasury = TREASURY_PEGD_FALLBACK
  }
  const min = treasury

  if (env?.DIRECTIVES_KV && treasury > 1) {
    try {
      await env.DIRECTIVES_KV.put(
        MIN_CACHE_KEY,
        JSON.stringify({ min, treasury, exp: Date.now() + MIN_CACHE_MS })
      )
    } catch {
      /* ignore cache write */
    }
  }

  return { min, source: 'treasury', treasury }
}

export async function isPegdHolder(address, minBalance) {
  const balance = await pegdBalanceUiAmount(address)
  return { ok: balance >= minBalance, balance }
}