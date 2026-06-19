import { requireChairman } from '../../../_lib/chairman.js'
import { supabaseConfigured, listAllListings, listOrders } from '../../../_lib/supabase-admin.js'

const CTO_SYSTEM = `You are CTO_XRPEGGED for XRPEGGED ($PEGD). Chairman-only private command portal.
Brand: XRPEGGED and $PEGD only. Proof over hype. Not financial advice.
Give concrete next steps for listings, orders, deploy, and security. Under 150 words unless asked for detail.`

function ruleBased(context, question) {
  const q = (question || '').toLowerCase()
  const site = context.site || {}
  const market = context.market || {}

  if (!site.supabaseConfigured) {
    return {
      headline: 'Blocker: Supabase secret missing',
      body: 'Set SUPABASE_SERVICE_ROLE_KEY on Cloudflare Pages (pegd project) so Command can read/write listings and orders. PORTAL_SESSION_SECRET + PORTAL_ALLOWLIST must also be set. Until then, use local wrangler dev or proof-market /proof with wallet auth.',
      actions: ['Cloudflare → pegd → Secrets → SUPABASE_SERVICE_ROLE_KEY', 'bash setup-portal-secrets.sh'],
    }
  }

  if (site.paused) {
    return {
      headline: 'Site paused — Command portal still works',
      body: `Public pegd returns 503 until ${site.maintenanceUntil || 'MAINTENANCE_UNTIL'}. Preview shop locally: wrangler pages dev with SITE_PAUSED=false. Command portal bypasses pause for Chairman.`,
      actions: ['Local: npx wrangler pages dev . --binding SITE_PAUSED=false', 'Public resume: bash unpause.sh'],
    }
  }

  if (q.includes('order') || q.includes('ship') || q.includes('fulfill')) {
    return {
      headline: 'Fulfillment path',
      body: `${market.completedOrders ?? 0} completed orders · ${market.awaitingShip ?? 0} need ship action. Flow: buyer pays → treasury verify → shipping API encrypts PII → you mark shipped here or via operator decrypt route. North star: first Metapod $4.99 completed.`,
      actions: ['Orders tab → set fulfillment to shipped + tracking', 'Decrypt PII: POST /api/proof/orders/shipping/operator (treasury wallet)'],
    }
  }

  if (q.includes('list') || q.includes('sku') || q.includes('photo') || q.includes('metapod')) {
    return {
      headline: 'Listings ops',
      body: `${market.activeListings ?? 0} active · ${market.pendingListings ?? 0} pending review. USD direct listings need photo (media_uri). Hero SKU: Metapod a0c775db-0bee-43d6-86af-bd6ae6504a3b. Upload here or paste HTTPS image URL.`,
      actions: ['Listings tab → edit title/price/photo', 'Approve pending → set status active', 'Shop smoke: pegd.pages.dev after unpause'],
    }
  }

  if (q.includes('deploy') || q.includes('secret') || q.includes('security')) {
    return {
      headline: 'Deploy & security',
      body: 'pegd-site: bash deploy.sh. proof-app: npm run deploy. Never commit service role or PORTAL_SESSION_SECRET. Portal is chairman-allowlist only. Stripe still 503 until worker secrets set.',
      actions: ['PORTAL_SESSION_SECRET + ALLOWLIST on Pages', 'HW-011: fix pegd.org /api/* nginx routing', 'CISO unpause checklist before public go-live'],
    }
  }

  if ((market.completedOrders ?? 0) === 0) {
    return {
      headline: 'P0: Order #1',
      body: 'Zero completed sales yet. Close the loop: active hero listing with photo → Phantom/Xaman checkout on pegd.pages.dev → treasury credit → fulfill → mark order shipped. Everything else is secondary.',
      actions: ['Verify Metapod listing active + photo', 'Pay test path via pegd.pages.dev', 'Watch treasury for +~4.46 XRP or PEGD rail'],
    }
  }

  return {
    headline: 'CTO standing by',
    body: `Treasury listings: ${market.activeListings ?? 0} active. Ask about listings, orders, deploy, pause, or security. I pull live counts each request.`,
    actions: ['What blocks Order #1?', 'How do I add a photo?', 'When should I unpause?'],
  }
}

async function aiReply(question, context, env) {
  if (!env.AI) return null
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: `${CTO_SYSTEM}\nCONTEXT: ${JSON.stringify(context)}` },
        { role: 'user', content: question },
      ],
    })
    const text = result?.response?.trim()
    if (!text) return null
    return { headline: 'CTO (AI)', body: text, actions: [], ai: true }
  } catch {
    return null
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response

  let question = ''
  let section = 'overview'
  try {
    const body = await request.json()
    question = String(body?.question || '').trim().slice(0, 500)
    section = String(body?.section || 'overview').slice(0, 40)
  } catch {
    question = ''
  }

  const [listings, orders] = supabaseConfigured(env)
    ? await Promise.all([listAllListings(env, 100), listOrders(env, 50)])
    : [[], []]

  const context = {
    section,
    site: {
      paused: env.SITE_PAUSED === 'true' || env.SITE_PAUSED === '1',
      maintenanceUntil: env.MAINTENANCE_UNTIL || null,
      supabaseConfigured: supabaseConfigured(env),
      portalConfigured: Boolean(env.PORTAL_SESSION_SECRET),
    },
    market: {
      activeListings: listings.filter((l) => l.status === 'active').length,
      pendingListings: listings.filter((l) => l.status === 'pending').length,
      completedOrders: orders.filter((o) => o.status === 'completed').length,
      awaitingShip: orders.filter(
        (o) => o.fulfillment_status === 'shipping_submitted' || o.fulfillment_status === 'paid'
      ).length,
    },
  }

  let guidance = await aiReply(question || `What should I focus on in ${section}?`, context, env)
  if (!guidance) guidance = ruleBased(context, question || section)

  return Response.json(
    { success: true, guidance, context, question: question || null },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}