import {
  sessionCookie,
  signSession,
  verifyPhantomMessage,
} from '../../_lib/portal.js'
import { formatPegdAmount, getHolderMinPegd, isPegdHolder, SOL_TREASURY } from '../../_lib/holder.js'
import { consumeChallenge } from '../../_lib/security.js'

export async function onRequestPost({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  if (!secret) {
    return Response.json({ success: false, error: 'Portal not configured' }, { status: 503 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { address, message, signature } = body || {}
  if (!address || !message || !signature) {
    return Response.json({ success: false, error: 'Missing sign-in fields' }, { status: 400 })
  }

  const valid = await verifyPhantomMessage(message, signature, address)
  if (!valid) {
    return Response.json({ success: false, error: 'Invalid signature' }, { status: 401 })
  }

  const fresh = await consumeChallenge(env, message)
  if (!fresh) {
    return Response.json({ success: false, error: 'Sign-in challenge expired — try again' }, { status: 401 })
  }

  // Treasury wallet is always chairman — no balance check needed
  const isTreasury = address === SOL_TREASURY
  if (isTreasury) {
    const exp = Date.now() + 4 * 60 * 60 * 1000
    const token = await signSession({ rail: 'solana', address, role: 'chairman', exp }, secret)
    return Response.json(
      { success: true, rail: 'solana', address, role: 'chairman' },
      { headers: { 'Set-Cookie': sessionCookie(token) } }
    )
  }

  // All other wallets must meet treasury parity
  const { min, source, treasury } = await getHolderMinPegd(env)
  const check = await isPegdHolder(address, min)
  if (!check.ok) {
    const need = formatPegdAmount(min)
    const have = formatPegdAmount(check.balance)
    const basis =
      source === 'env'
        ? 'Chairman minimum'
        : `treasury parity (${formatPegdAmount(treasury)} PEGD held)`
    return Response.json(
      {
        success: false,
        error: `Need ≥${need} PEGD to move directives (${basis}). Wallet has ${have}.`,
        minPegdRequired: min,
        balance: check.balance,
        source,
      },
      { status: 403 }
    )
  }

  const exp = Date.now() + 4 * 60 * 60 * 1000
  const token = await signSession({ rail: 'solana', address, role: 'holder', exp }, secret)

  return Response.json(
    { success: true, rail: 'solana', address, role: 'holder' },
    { headers: { 'Set-Cookie': sessionCookie(token) } }
  )
}