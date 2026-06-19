import { requireChairman } from '../../../_lib/chairman.js'
import { supabaseConfigured, uploadListingPhoto } from '../../../_lib/supabase-admin.js'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX = 5 * 1024 * 1024

export async function onRequestPost({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response
  if (!supabaseConfigured(env)) {
    return Response.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ success: false, error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return Response.json({ success: false, error: 'JPEG, PNG, GIF, or WebP only' }, { status: 400 })
  }
  if (file.size > MAX) {
    return Response.json({ success: false, error: 'Max 5MB' }, { status: 400 })
  }

  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const filename = `${crypto.randomUUID().replace(/-/g, '')}.${ext}`
  const url = await uploadListingPhoto(env, file, filename)

  return Response.json({ success: true, url, filename })
}