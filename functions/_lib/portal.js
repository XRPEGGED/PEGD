const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function decodeBase58(str) {
  if (typeof str !== 'string') return null
  const bytes = []
  for (const char of str) {
    const value = ALPHABET.indexOf(char)
    if (value < 0) return null
    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const char of str) {
    if (char === '1') bytes.push(0)
    else break
  }
  return Uint8Array.from(bytes.reverse())
}

export function parseAllowlist(raw) {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes(':')) {
        const [rail, address] = entry.split(':')
        return { rail: rail.toLowerCase(), address: address.trim() }
      }
      if (entry.startsWith('r')) return { rail: 'xrpl', address: entry }
      return { rail: 'solana', address: entry }
    })
}

export function isAllowed(allowlist, rail, address) {
  if (!address) return false
  const normalized = address.trim()
  const lower = normalized.toLowerCase()
  return allowlist.some((entry) => {
    if (entry.rail !== rail) return false
    if (rail === 'xrpl') return entry.address.toLowerCase() === lower
    return entry.address === normalized
  })
}

export async function signSession(payload, secret) {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const mac = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${body}.${mac}`
}

export async function verifySession(token, secret) {
  if (!token || !secret) return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expectedMac = btoa(String.fromCharCode(...new Uint8Array(expected)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  if (expectedMac !== mac) return null
  try {
    const padded = body.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '==='.slice((padded.length + 3) % 4))
    const payload = JSON.parse(json)
    if (!payload?.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function sessionCookie(token, maxAgeSec = 4 * 60 * 60) {  // 4h to match token exp
  return `xrpeg_portal=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`
}

export function clearSessionCookie() {
  return 'xrpeg_portal=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
}

export async function verifyPhantomMessage(message, signatureInput, address) {
  if (!message?.startsWith('XRPEGGED portal')) return false
  const addressLine = message.split('\n').find((line) => line.startsWith('Address: '))
  if (addressLine?.replace('Address: ', '').trim() !== address) return false
  const timeLine = message.split('\n').find((line) => line.startsWith('Time: '))
  const timestamp = timeLine ? Number(timeLine.replace('Time: ', '').trim()) : NaN
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false
  const nonceLine = message.split('\n').find((line) => line.startsWith('Nonce: '))
  const nonce = nonceLine?.replace('Nonce: ', '').trim()
  if (!nonce || nonce.length < 8) return false

  const pubkey = decodeBase58(address)
  if (!pubkey || pubkey.length !== 32) return false

  let signature
  try {
    if (signatureInput.includes('+') || signatureInput.includes('/')) {
      signature = Uint8Array.from(atob(signatureInput), (c) => c.charCodeAt(0))
    } else {
      signature = decodeBase58(signatureInput)
    }
  } catch {
    return false
  }
  if (!signature || signature.length !== 64) return false

  const key = await crypto.subtle.importKey('raw', pubkey, { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify(
    'Ed25519',
    key,
    signature,
    new TextEncoder().encode(message)
  )
}

export const OFFICER_HUD = {
  mode: 'officer-led',
  phase: 'Proof of Worth — first completed USD sale',
  sprint: ['Active hero listing: Funko Vader with photo', 'Stripe live on worker', 'market.pegd.org DNS'],
  backlog: [
    { id: 'P0', task: 'First real sale + fulfillment', owner: 'COO' },
    { id: 'P0', task: 'PORTAL_SESSION_SECRET + allowlist', owner: 'CISO', blocked: 'Chairman' },
    { id: 'P0', task: 'Stripe secrets on Cloudflare', owner: 'CTO', blocked: 'Chairman keys' },
    { id: 'P1', task: 'Chairman Listings Portal (pegd portal CRUD + photos + orders)', owner: 'CTO', spec: 'CPO' },
    { id: 'P1', task: 'PEGD Phantom checkout', owner: 'CTO', spec: 'CPO' },
    { id: 'P1', task: 'market.pegd.org DNS', owner: 'CTO' },
    { id: 'P2', task: 'Public seller listings portal', owner: 'CTO', status: 'agenda' },
    { id: 'P3', task: 'Curve bot', owner: 'CFO', status: 'deferred' },
  ],
  extendedOfficers: ['COO', 'CISO', 'CPO'],
}