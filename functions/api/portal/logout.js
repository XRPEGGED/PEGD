import { clearSessionCookie } from '../../_lib/portal.js'

export async function onRequestPost() {
  return Response.json(
    { success: true },
    { headers: { 'Set-Cookie': clearSessionCookie() } }
  )
}