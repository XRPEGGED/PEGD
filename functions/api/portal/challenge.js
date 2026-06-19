import { issueChallenge } from '../../_lib/security.js'

export async function onRequestGet({ env }) {
  try {
    const { timestamp, nonce } = await issueChallenge(env)
    return Response.json(
      {
        success: true,
        message: `XRPEGGED portal\nAddress: PLACEHOLDER\nTime: ${timestamp}\nNonce: ${nonce}`,
        timestamp,
        nonce,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Challenge error:', error)
    return Response.json(
      { success: false, error: 'Challenge creation failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}