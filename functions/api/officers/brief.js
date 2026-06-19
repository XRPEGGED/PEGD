import { verifySession } from '../../_lib/portal.js'
import { buildHud } from '../../_lib/directives.js'

const MARKET_API = 'https://xrpegged-market.xrpegged.workers.dev/api/proof/listings?limit=50'
const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
const XRP_TREASURY = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
const SOL_TREASURY = 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb'

const OFFICER_SYSTEM = `You are the XRPEGGED executive brainiac synthesizing CEO, CTO, CFO, and CMO.
Brand: XRPEGGED and $PEGD only. Proof over hype. Not financial advice.
Be concise (under 120 words). Chairman leads by veto only; officers execute.
Use only facts from the CONTEXT block. If unsure, say so.`

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || ''
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function liveSnapshot() {
  const [xrp, sol, curve, market, solTokens] = await Promise.all([
    fetch('https://xrplcluster.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: XRP_TREASURY, ledger_index: 'validated' }],
      }),
    })
      .then((r) => r.json())
      .then((d) => Number(d?.result?.account_data?.Balance) / 1_000_000)
      .catch(() => null),
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [SOL_TREASURY],
      }),
    })
      .then((r) => r.json())
      .then((d) => d?.result?.value / 1_000_000_000)
      .catch(() => null),
    fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`)
      .then((r) => r.json())
      .then((d) => {
        const attrs = d?.data?.attributes
        const ld = attrs?.launchpad_details ?? {}
        return {
          graduationPct: ld.graduation_percentage ?? null,
          reserveUsd: attrs?.total_reserve_in_usd != null ? Number(attrs.total_reserve_in_usd) : null,
        }
      })
      .catch(() => ({})),
    fetch(MARKET_API)
      .then((r) => r.json())
      .then((d) => ({
        ok: Boolean(d?.success),
        active: Array.isArray(d?.listings) ? d.listings.filter((l) => l.status === 'active').length : 0,
      }))
      .catch(() => ({ ok: false, active: 0 })),
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          SOL_TREASURY,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { commitment: 'confirmed', encoding: 'jsonParsed' }
        ]
      })
    }).then((r) => r.json()).then((d) => {
      const accounts = d?.result?.value || [];
      return accounts.map((acc) => {
        const info = acc.account.data.parsed.info;
        const ta = info.tokenAmount;
        return {
          mint: info.mint,
          amount: ta.uiAmountString || ta.amount,
          decimals: ta.decimals
        };
      });
    }).catch(() => []),
  ])
  return { treasury: { xrp, sol, tokens: solTokens }, curve, market }
}

function ruleBasedReply(question, live, authenticated, hud) {
  const q = (question || '').toLowerCase()
  const fmt = (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d))

  if (!question || q.includes('help') || q.includes('hello') || q.includes('hi')) {
    return {
      ceo: 'Officer-led mode active. Ask about market, treasury, sprint, or payments.',
      cto: 'Proof Market: xrpegged-market.xrpegged.workers.dev/proof',
      cfo: `Treasury snapshot: ${fmt(live.treasury.xrp)} XRP, ${fmt(live.treasury.sol, 3)} SOL.`,
      cmo: 'Proof of Worth = real USD listing + completed sale. That is the story.',
      authenticated,
    }
  }

  if (q.includes('market') || q.includes('shop') || q.includes('worth') || q.includes('listing')) {
    return {
      ceo: 'Priority: first completed Proof of Worth order.',
      cto: `Market ${live.market.ok ? 'live' : 'degraded'} · ${live.market.active} active listings. USD-priced direct checkout.`,
      cfo: 'Stripe card rail coded; production keys still needed on worker.',
      cmo: 'Open Market from nav — no wallet required to browse.',
      authenticated,
    }
  }

  if (q.includes('treasury') || q.includes('xrp') || q.includes('sol') || q.includes('reserve')) {
    const tokens = live.treasury.tokens || [];
    const tokenCount = tokens.length;
    let portfolioStr = 'none';
    if (tokenCount > 0) {
      const top = tokens.filter(t => t.amount !== '0').slice(0, 5).map(t => {
        let amt = t.amount;
        if (!amt || amt === '0') {
          const dec = t.decimals || 0;
          const scale = BigInt(10 ** dec);
          const int = BigInt(t.amount || 0) / scale;
          let frac = (BigInt(t.amount || 0) % scale).toString().padStart(dec, '0').replace(/0+$/, '');
          amt = frac ? `${int}.${frac}` : int.toString();
        }
        const label = t.mint === PEGD_MINT ? 'PEGD' : (t.mint.substring(0,4) + '..' + t.mint.substring(t.mint.length-4));
        return `${label}:${amt}`;
      }).join(', ');
      const shownCount = Math.min(5, tokens.filter(t => t.amount !== '0').length);
      portfolioStr = top + (tokenCount > shownCount ? ` +${tokenCount - shownCount} more` : '');
    }
    return {
      ceo: 'Transparency is the brand — verify on-chain anytime.',
      cto: 'Treasury wallets are public on pegd.org #treasury.',
      cfo: `Live: ${fmt(live.treasury.xrp)} XRP · ${fmt(live.treasury.sol, 3)} SOL. Portfolio (${tokenCount} tokens): ${portfolioStr}. Curve ~$${fmt(live.curve.reserveUsd, 0)}.`,
      cmo: 'Proof-of-reserves supports proof-of-worth commerce.',
      authenticated,
    }
  }

  if (q.includes('curve') || q.includes('moon') || q.includes('jupiter') || q.includes('pegd')) {
    return {
      ceo: 'Curve graduation is separate from market proof — market first per QR-006.',
      cto: `Bonding curve ~${fmt(live.curve.graduationPct, 2)}% · Jupiter locked until graduation.`,
      cfo: 'Curve bot deferred until Chairman sets a budget cap.',
      cmo: 'Trade section on site shows honest Moonit 404 + on-chain verify links.',
      authenticated,
    }
  }

  if (q.includes('sprint') || q.includes('backlog') || q.includes('priority')) {
    if (!authenticated) {
      return {
        ceo: 'Sign in as PEGD holder (Phantom) or Chairman allowlist to view sprint backlog.',
        cto: 'Public briefing stays market + treasury focused.',
        cfo: 'No internal sprint data without wallet auth.',
        cmo: 'Bookmark portal for Chairman HUD on cell data.',
        authenticated,
      }
    }
    const sprint = (hud?.sprint || []).join('; ')
    const backlog = (hud?.backlog || []).map((b) => `${b.id} ${b.task}`).join('; ')
    return {
      ceo: `Phase: ${hud?.phase || '—'}`,
      cto: `Sprint: ${sprint}`,
      cfo: `Backlog: ${backlog}`,
      cmo: 'Holders can reprioritize directives — Chairman ratifies treasury moves.',
      authenticated,
    }
  }

  return {
    ceo: 'Ask about market, treasury, curve, or sprint (portal for sprint).',
    cto: 'I pull live metrics each request — no stale cache on decisions.',
    cfo: 'Numbers above are chain/API sourced right now.',
    cmo: 'XRPEGGED — prove its worth with real sales.',
    authenticated,
  }
}

async function aiReply(question, live, authenticated, env, hud) {
  if (!env.AI) return null
  const context = JSON.stringify({ live, authenticated, phase: hud?.phase })
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: `${OFFICER_SYSTEM}\nCONTEXT: ${context}` },
        { role: 'user', content: question },
      ],
    })
    const text = result?.response?.trim()
    if (!text) return null
    return {
      ceo: text,
      cto: 'Workers AI assist · verify on-chain for treasury facts.',
      cfo: 'Not financial advice.',
      cmo: 'XRPEGGED proof over hype.',
      authenticated,
      ai: true,
    }
  } catch {
    return null
  }
}

export async function onRequestPost({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  if (!secret) {
    return Response.json(
      { success: false, error: 'Officers panel not configured — Chairman must set PORTAL_SESSION_SECRET' },
      { status: 503 }
    )
  }

  const token = readCookie(request, 'xrpeg_portal')
  const session = await verifySession(token, secret)
  const authenticated = !!session

  let question = ''
  try {
    const body = await request.json()
    question = String(body?.question || '').trim().slice(0, 500)
  } catch {
    question = ''
  }

  const [live, hud] = await Promise.all([liveSnapshot(), buildHud(env)])
  let officers = await aiReply(question, live, authenticated, env, hud)
  if (!officers) officers = ruleBasedReply(question, live, authenticated, hud)

  return Response.json(
    {
      success: true,
      question: question || null,
      officers,
      live,
      authenticated,
      portalUrl: '/portal.html',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function onRequestGet({ request, env }) {
  return onRequestPost({ request: new Request(request.url, { method: 'POST', body: JSON.stringify({}) }), env })
}