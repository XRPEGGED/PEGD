// GET  /api/pets/:id  — public pet lookup (finder scans QR)
// PUT  /api/pets/:id  — update mutable fields (owner must sign)

import { decodeBase58 } from '../../_lib/portal.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'

async function verifySignature(address, message, signatureB64) {
  try {
    const pubkeyBytes = decodeBase58(address)
    if (!pubkeyBytes) return false
    const sigBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0))
    const msgBytes = new TextEncoder().encode(message)
    const key = await crypto.subtle.importKey('raw', pubkeyBytes, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, sigBytes, msgBytes)
  } catch {
    return false
  }
}

async function fetchPrices() {
  const prices = { PEGD: null, SOL: null }
  try {
    const [dex, cg] = await Promise.all([
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${PEGD_MINT}`).then(r => r.json()),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd').then(r => r.json()),
    ])
    const p = dex?.pairs?.[0]?.priceUsd
    if (p) prices.PEGD = parseFloat(p)
    if (cg?.solana?.usd) prices.SOL = cg.solana.usd
  } catch {}
  return prices
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS })
}

export async function onRequestGet({ params, env }) {
  const raw = await env.DIRECTIVES_KV.get(`pet:${params.id}`)
  if (!raw) return Response.json({ found: false }, { status: 404, headers: CORS })

  const p = JSON.parse(raw)

  // Fetch live prices only if there's an active bounty — skip the network call otherwise
  let bountyUsd = null
  let bountySol = null
  if (p.bounty > 0) {
    const prices = await fetchPrices()
    if (prices.PEGD && prices.SOL) {
      bountyUsd = p.bounty * prices.PEGD
      bountySol = bountyUsd / prices.SOL
    }
  }

  return Response.json({
    found:       true,
    id:          p.id,
    name:        p.name,
    species:     p.species,
    breed:       p.breed,
    color:       p.color,
    photoUrl:    p.photoUrl,
    description: p.description,
    contact:     p.contact,
    status:      p.status,
    ownerWallet: p.ownerWallet,
    createdAt:   p.createdAt,
    bounty: {
      pegd:   p.bounty,
      usd:    bountyUsd,
      sol:    bountySol,
    },
    // Registration sig lets anyone verify on-chain ownership independently
    ownershipProof: {
      message:   p.registrationMessage,
      signature: p.registrationSig,
    },
  }, { headers: CORS })
}

export async function onRequestPut({ params, request, env }) {
  const raw = await env.DIRECTIVES_KV.get(`pet:${params.id}`)
  if (!raw) return Response.json({ error: 'not found' }, { status: 404, headers: CORS })

  const body = await request.json().catch(() => null)
  if (!body?.address || !body?.message || !body?.signature) {
    return Response.json({ error: 'address, message and signature required' }, { status: 400, headers: CORS })
  }

  const p = JSON.parse(raw)
  if (body.address !== p.ownerWallet) {
    return Response.json({ error: 'not the registered owner' }, { status: 403, headers: CORS })
  }

  const valid = await verifySignature(body.address, body.message, body.signature)
  if (!valid) return Response.json({ error: 'invalid signature' }, { status: 401, headers: CORS })

  const u = body.updates || {}
  const updated = {
    ...p,
    // Identity locked: name, species, breed, color, photoUrl never change after registration
    description: u.description !== undefined ? String(u.description).slice(0, 400) : p.description,
    contact:     u.contact     !== undefined ? String(u.contact).slice(0, 200)     : p.contact,
    status:      ['home', 'lost'].includes(u.status) ? u.status : p.status,
    bounty:      typeof u.bounty === 'number' && u.bounty >= 0 ? u.bounty : p.bounty,
    updatedAt:   Date.now(),
  }

  await env.DIRECTIVES_KV.put(`pet:${p.id}`, JSON.stringify(updated), { expirationTtl: 60 * 60 * 24 * 365 * 10 })
  return Response.json({ success: true }, { headers: CORS })
}
