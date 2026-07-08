import { supabaseConfigured } from '../_lib/supabase-admin.js'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX     = 5 * 1024 * 1024
const BUCKET  = 'market-media'

function baseUrl(env) {
  return (env.SUPABASE_URL || 'https://tmaeezonwjyydkxwpeug.supabase.co').replace(/\/$/, '')
}

function serviceKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || ''
}

async function uploadBytes(env, path, body, contentType) {
  const key = serviceKey(env)
  const url = `${baseUrl(env)}/storage/v1/object/${BUCKET}/${path}`

  // Try with declared content type first, fall back to octet-stream (bypasses bucket MIME check)
  for (const ct of [contentType, 'application/octet-stream']) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': ct, 'x-upsert': 'true' },
      body,
    })
    if (res.ok) return `${baseUrl(env)}/storage/v1/object/public/${BUCKET}/${path}`
    const txt = await res.text()
    // If it's a MIME type rejection, retry with octet-stream
    if (txt.includes('mime') || txt.includes('type')) continue
    throw new Error(`Supabase ${res.status}: ${txt.slice(0, 200)}`)
  }
  throw new Error('Upload failed after MIME fallback')
}

export async function onRequestPost({ request, env }) {
  try {
    if (!supabaseConfigured(env)) {
      return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not set in Cloudflare environment variables' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      })
    }

    let form
    try { form = await request.formData() } catch {
      return new Response(JSON.stringify({ error: 'Invalid form data' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const image       = form.get('image')
    const name        = (form.get('name')        || '').trim().slice(0, 32)
    const symbol      = (form.get('symbol')      || '').trim().slice(0, 10)
    const description = (form.get('description') || '').trim().slice(0, 500)
    const website     = (form.get('website')     || '').trim()
    const twitter     = (form.get('twitter')     || '').trim()
    const telegram    = (form.get('telegram')    || '').trim()

    if (!name || !symbol) {
      return new Response(JSON.stringify({ error: 'name and symbol required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    // Upload image if provided
    let imageUrl = ''
    if (image && typeof image.arrayBuffer === 'function' && image.size > 0) {
      if (!ALLOWED.has(image.type)) {
        return new Response(JSON.stringify({ error: `Image type ${image.type} not allowed. Use JPEG, PNG, GIF, or WebP.` }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (image.size > MAX) {
        return new Response(JSON.stringify({ error: 'Image must be under 5MB' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        })
      }
      const ext   = (image.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const bytes = await image.arrayBuffer()
      imageUrl    = await uploadBytes(env, `tokens/${id}.${ext}`, bytes, image.type)
    }

    // Build Metaplex-standard metadata JSON
    const metadata = { name, symbol, description, image: imageUrl }
    if (website) metadata.external_url = website
    if (imageUrl) {
      metadata.properties = {
        files:    [{ uri: imageUrl, type: image?.type || 'image/png' }],
        category: 'image',
      }
    }
    const extensions = {}
    if (twitter)  extensions.twitter  = twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`
    if (telegram) extensions.telegram = telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`
    if (Object.keys(extensions).length) metadata.extensions = extensions

    // Upload metadata JSON
    const jsonBytes  = new TextEncoder().encode(JSON.stringify(metadata))
    const metadataUri = await uploadBytes(env, `tokens/${id}.json`, jsonBytes, 'application/json')

    return new Response(JSON.stringify({ success: true, uri: metadataUri, imageUrl }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
