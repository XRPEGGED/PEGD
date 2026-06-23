// POST /api/pets/register
// Registers a pet tied to a Solana wallet. The signed message proves on-chain ownership —
// whoever holds that keypair is the verifiable owner. Core identity fields (name, species)
// are locked after registration; only contact/status/bounty are mutable.

import { decodeBase58 } from '../../_lib/portal.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function shortId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

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

export async function onRequestOptions() {
  return new Response(null, { headers: CORS })
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null)
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400, headers: CORS })

  const { address, message, signature, pet } = body

  if (!address || !message || !signature || !pet?.name || !pet?.species) {
    return Response.json({ error: 'address, message, signature, pet.name and pet.species required' }, { status: 400, headers: CORS })
  }

  // Verify the owner signed this registration
  const valid = await verifySignature(address, message, signature)
  if (!valid) {
    return Response.json({ error: 'invalid signature' }, { status: 401, headers: CORS })
  }

  const id = shortId()
  const now = Date.now()

  const record = {
    id,
    // Identity — immutable after registration
    name:        pet.name.trim().slice(0, 60),
    species:     ['dog', 'cat', 'bird', 'rabbit', 'other'].includes(pet.species) ? pet.species : 'other',
    breed:       (pet.breed || '').trim().slice(0, 60),
    color:       (pet.color || '').trim().slice(0, 80),
    photoUrl:    (pet.photoUrl || '').slice(0, 600),
    // Mutable fields
    description: (pet.description || '').trim().slice(0, 400),
    contact:     (pet.contact || '').trim().slice(0, 200),
    status:      'home',
    bounty:      0,
    // Ownership proof
    ownerWallet:         address,
    registrationMessage: message,
    registrationSig:     signature,
    createdAt:           now,
    updatedAt:           now,
  }

  await env.DIRECTIVES_KV.put(`pet:${id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 * 10 })

  // Index by owner so they can list their pets
  const ownerKey = `pets_by_owner:${address}`
  const existing = JSON.parse(await env.DIRECTIVES_KV.get(ownerKey) || '[]')
  existing.unshift(id)
  await env.DIRECTIVES_KV.put(ownerKey, JSON.stringify(existing.slice(0, 50)))

  return Response.json({ success: true, id }, { headers: CORS })
}
