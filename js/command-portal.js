(() => {
  const gate = document.getElementById('gate')
  const app = document.getElementById('app')
  const gateMsg = document.getElementById('gate-msg')
  const ctoBox = document.getElementById('cto-box')
  const ctoChips = document.getElementById('cto-chips')
  const ctoForm = document.getElementById('cto-form')
  let activeTab = 'overview'
  let overviewCache = null

  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const fmtUsd = (drops) => {
    const n = Number(drops)
    if (!Number.isFinite(n)) return '—'
    return `$${(n / 100).toFixed(2)}`
  }

  const short = (v) => (v && v.length > 12 ? v.slice(0, 6) + '…' + v.slice(-4) : v || '—')

  function showGateErr(msg) {
    gateMsg.textContent = msg
    gateMsg.classList.remove('hidden')
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }

  function setTab(tab) {
    activeTab = tab
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab))
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'))
    document.getElementById(`panel-${tab}`)?.classList.remove('hidden')
    askCto('', tab)
  }

  function renderCto(guidance) {
    if (!guidance) return
    const actions = (guidance.actions || [])
      .map((a) => `<button type="button" class="cto-chip" data-q="${esc(a)}">${esc(a)}</button>`)
      .join('')
    ctoBox.innerHTML = `<div class="head">${esc(guidance.headline || 'CTO')}</div><div>${esc(guidance.body || '')}</div>`
    ctoChips.innerHTML = actions
    ctoChips.querySelectorAll('.cto-chip').forEach((chip) => {
      chip.addEventListener('click', () => askCto(chip.dataset.q, activeTab))
    })
  }

  async function askCto(question, section = activeTab) {
    try {
      const data = await api('/api/portal/command/cto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, section }),
      })
      renderCto(data.guidance)
    } catch (err) {
      ctoBox.innerHTML = `<div class="head">CTO offline</div><div>${esc(err.message)}</div>`
    }
  }

  async function loadOverview() {
    const data = await api('/api/portal/command/overview')
    overviewCache = data
    const m = data.market || {}
    const t = data.treasury || {}
    const s = data.site || {}

    document.getElementById('pause-pill').classList.toggle('hidden', !s.paused)
    document.getElementById('metrics').innerHTML = `
      <div class="metric"><div class="l">XRP treasury</div><div class="v">${t.xrp != null ? Number(t.xrp).toFixed(2) : '—'}</div></div>
      <div class="metric"><div class="l">SOL treasury</div><div class="v">${t.sol != null ? Number(t.sol).toFixed(3) : '—'}</div></div>
      <div class="metric"><div class="l">Active SKUs</div><div class="v">${m.activeListings ?? '—'}</div></div>
      <div class="metric"><div class="l">Completed orders</div><div class="v">${m.completedOrders ?? 0}</div></div>`
    document.getElementById('overview-meta').textContent =
      `${m.pendingListings ?? 0} pending listings · ${m.awaitingShip ?? 0} awaiting ship · ` +
      (s.supabaseConfigured ? 'DB connected' : 'Set SUPABASE_SERVICE_ROLE_KEY') +
      (s.paused ? ` · public site paused until ${s.maintenanceUntil || 'TBD'}` : '')

    const phase = document.getElementById('phase')
    if (phase) phase.textContent = 'Proof of Worth — first completed USD sale'
  }

  async function loadListings() {
    const data = await api('/api/portal/command/listings')
    const body = document.getElementById('listings-body')
    body.innerHTML = (data.listings || [])
      .map((l) => {
        const thumb = l.media_uri
          ? `<img class="thumb" src="${esc(l.media_uri)}" alt="">`
          : '<span class="thumb"></span>'
        return `<tr>
          <td>${thumb}</td>
          <td>${esc(l.title)}<br><span style="color:var(--muted);font-size:0.68rem">${esc(l.id)}</span></td>
          <td>${fmtUsd(l.price_drops)}</td>
          <td><span class="status ${esc(l.status)}">${esc(l.status)}</span></td>
          <td><button type="button" class="btn btn-ghost btn-sm edit-listing" data-id="${esc(l.id)}">Edit</button></td>
        </tr>`
      })
      .join('')
    body.querySelectorAll('.edit-listing').forEach((btn) => {
      btn.addEventListener('click', () => openEdit(btn.dataset.id, data.listings))
    })
  }

  function openEdit(id, listings) {
    const l = (listings || []).find((x) => x.id === id)
    if (!l) return
    document.getElementById('edit-card').classList.remove('hidden')
    document.getElementById('edit-id').value = l.id
    document.getElementById('edit-title').value = l.title || ''
    document.getElementById('edit-price').value = (Number(l.price_drops) / 100).toFixed(2)
    document.getElementById('edit-status').value = l.status || 'active'
    document.getElementById('edit-media').value = l.media_uri || ''
    setTab('editor')
  }

  async function loadOrders() {
    const data = await api('/api/portal/command/orders')
    const body = document.getElementById('orders-body')
    const opts = ['awaiting_payment', 'paid', 'shipping_submitted', 'shipped', 'delivered', 'cancelled']
    body.innerHTML = (data.orders || [])
      .map((o) => {
        const sel = opts
          .map(
            (v) =>
              `<option value="${v}" ${o.fulfillment_status === v ? 'selected' : ''}>${v}</option>`
          )
          .join('')
        const tracking = o.tracking_number || ''
        return `<tr>
          <td style="font-size:0.68rem">${esc(short(o.id))}</td>
          <td>${esc(short(o.listing_id))}</td>
          <td>${esc(short(o.buyer_wallet))}</td>
          <td>${esc(o.status || '—')}</td>
          <td><select class="fulfill-sel" data-id="${esc(o.id)}">${sel}</select></td>
          <td><input class="track-inp" data-id="${esc(o.id)}" type="text" maxlength="120" placeholder="USPS / UPS #" value="${esc(tracking)}" style="width:9rem;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(0,0,0,0.25);color:var(--text);font-size:0.72rem;"></td>
          <td><button type="button" class="btn btn-ghost btn-sm save-order" data-id="${esc(o.id)}">Save</button></td>
        </tr>`
      })
      .join('')
    body.querySelectorAll('.save-order').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr')
        const sel = row?.querySelector('.fulfill-sel')
        const track = row?.querySelector('.track-inp')
        try {
          await api('/api/portal/command/orders', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: btn.dataset.id,
              fulfillmentStatus: sel?.value,
              trackingNumber: track?.value?.trim() || '',
            }),
          })
          await loadOrders()
          askCto('Order updated — what next?', 'orders')
        } catch (err) {
          alert(err.message)
        }
      })
    })
  }

  // === Metapod PoC One-Click Fulfill (CEO simplification) ===
  const METAPOD_LISTING = 'a0c775db-0bee-43d6-86af-bd6ae6504a3b'

  async function findMetapodOrder() {
    const data = await api('/api/portal/command/orders')
    return (data.orders || []).find(o =>
      o.listing_id === METAPOD_LISTING ||
      (o.title || '').toLowerCase().includes('metapod')
    )
  }

  async function decryptForMetapod() {
    const msg = document.getElementById('metapod-msg')
    msg.textContent = 'Decrypting… (one-time view)'
    msg.style.color = 'var(--warn)'
    try {
      const order = await findMetapodOrder()
      if (!order) throw new Error('Metapod order not found in recent orders')
      const res = await fetch('https://xrpegged-market.xrpegged.workers.dev/api/proof/orders/shipping/operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorWallet: 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78',
          orderId: order.id
        })
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Decrypt failed')
      const addr = d.address || d.shipping || JSON.stringify(d).slice(0,200)
      msg.innerHTML = `Address: <strong style="color:#fff">${addr}</strong> <button onclick="this.parentElement.textContent='Cleared for security.';setTimeout(()=>document.getElementById('metapod-msg').textContent='',8000)" style="font-size:0.6rem;margin-left:6px;">clear</button>`
      msg.style.color = 'var(--ok)'
      // also refresh orders so id is fresh
      await loadOrders()
    } catch (e) {
      msg.textContent = e.message
      msg.style.color = 'var(--err)'
    }
  }

  async function oneClickShipMetapod() {
    const msg = document.getElementById('metapod-msg')
    msg.textContent = 'Marking PoC as shipped + delivered…'
    msg.style.color = 'var(--warn)'
    try {
      const order = await findMetapodOrder()
      if (!order) throw new Error('Metapod order not found')
      await api('/api/portal/command/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          fulfillmentStatus: 'delivered',
          trackingNumber: 'PoC self-fulfill - Metapod card prepared + shipped by Chairman',
          status: 'completed'
        })
      })
      msg.textContent = '✅ Order #1 KPI complete (delivered). Officers will see in logs.'
      msg.style.color = 'var(--ok)'
      await loadOrders()
      askCto('Metapod PoC marked delivered. Next action for Order #1 close?', 'orders')
    } catch (e) {
      msg.textContent = e.message
      msg.style.color = 'var(--err)'
    }
  }

  async function bootDashboard(session) {
    gate.classList.add('hidden')
    app.classList.add('open')
    const rail = session.rail === 'xrpl' ? 'Xaman' : 'Phantom'
    document.getElementById('who-pill').textContent = `Chairman · ${rail} ${short(session.address)}`

    await loadOverview().catch((e) => showGateErr(e.message))
    await loadListings().catch(() => {})
    await loadOrders().catch(() => {})

    const board = document.getElementById('directives-board')
    if (board && window.XrpegDirectives) {
      await window.XrpegDirectives.mount(board).catch(() => {})
    }
    askCto('What should I focus on right now?', 'overview')
  }

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab')
    if (!tab) return
    setTab(tab.dataset.tab)
    if (tab.dataset.tab === 'listings') loadListings().catch(() => {})
    if (tab.dataset.tab === 'orders') loadOrders().catch(() => {})
  })

  document.getElementById('new-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const msg = document.getElementById('editor-msg')
    msg.textContent = 'Uploading…'
    msg.classList.remove('hidden')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portal/command/upload', { method: 'POST', credentials: 'include', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      document.getElementById('new-media').value = data.url
      msg.textContent = 'Uploaded — URL filled in'
      msg.style.color = 'var(--ok)'
    } catch (err) {
      msg.textContent = err.message
      msg.style.color = 'var(--err)'
    }
  })

  document.getElementById('new-save').addEventListener('click', async () => {
    const msg = document.getElementById('editor-msg')
    msg.classList.remove('hidden')
    try {
      await api('/api/portal/command/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('new-title').value,
          description: document.getElementById('new-desc').value,
          priceUsd: document.getElementById('new-price').value,
          category: document.getElementById('new-cat').value,
          mediaUri: document.getElementById('new-media').value,
          status: 'active',
        }),
      })
      msg.style.color = 'var(--ok)'
      msg.textContent = 'Listing created — check Listings tab'
      await loadListings()
      askCto('New listing created — anything to verify before Order #1?', 'listings')
    } catch (err) {
      msg.style.color = 'var(--err)'
      msg.textContent = err.message
    }
  })

  document.getElementById('edit-save').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value
    const msg = document.getElementById('edit-msg')
    msg.classList.remove('hidden')
    try {
      await api(`/api/portal/command/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('edit-title').value,
          priceUsd: document.getElementById('edit-price').value,
          status: document.getElementById('edit-status').value,
          mediaUri: document.getElementById('edit-media').value,
        }),
      })
      msg.style.color = 'var(--ok)'
      msg.textContent = 'Saved'
      await loadListings()
    } catch (err) {
      msg.style.color = 'var(--err)'
      msg.textContent = err.message
    }
  })

  document.getElementById('edit-archive').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value
    if (!confirm('Archive this listing?')) return
    await api(`/api/portal/command/listings/${id}`, { method: 'DELETE' })
    document.getElementById('edit-card').classList.add('hidden')
    await loadListings()
  })

  ctoForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const input = ctoForm.querySelector('input')
    askCto(input.value, activeTab)
    input.value = ''
  })

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.XrpegPortal?.logout()
    location.reload()
  })

  // Wire Metapod PoC buttons (always available in overview)
  const decryptBtn = document.getElementById('metapod-decrypt-btn')
  const shipBtn = document.getElementById('metapod-ship-btn')
  if (decryptBtn) decryptBtn.addEventListener('click', decryptForMetapod)
  if (shipBtn) shipBtn.addEventListener('click', oneClickShipMetapod)

  async function pollXumm(payloadId) {
    for (let i = 0; i < 90; i++) {
      const res = await fetch('/api/xumm/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Xumm poll failed')
      if (data.pending) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (data.signed && data.account) return data
      throw new Error('Sign-in cancelled')
    }
    throw new Error('Xumm timed out')
  }

  document.getElementById('gate-xumm').addEventListener('click', async () => {
    showGateErr('Opening Xumm…')
    try {
      const start = await fetch('/api/xumm/auth', { method: 'POST' })
      const payload = await start.json()
      if (!payload.success) throw new Error(payload.error || 'Xumm failed')
      const qr = document.getElementById('xumm-qr')
      if (payload.qr) {
        qr.src = payload.qr
        qr.classList.remove('hidden')
      }
      if (payload.deeplink) window.open(payload.deeplink, '_blank')
      await pollXumm(payload.uuid)
      const session = await window.XrpegPortal.verifyXumm(payload.uuid)
      await bootDashboard(session)
      gateMsg.classList.add('hidden')
    } catch (err) {
      showGateErr(err.message)
    }
  })

  document.getElementById('gate-phantom').addEventListener('click', async () => {
    showGateErr('Connect Phantom…')
    try {
      const session = await window.XrpegPortal.verifyPhantom()
      await bootDashboard(session)
      gateMsg.classList.add('hidden')
    } catch (err) {
      showGateErr(err.message)
    }
  })

  window.addEventListener('xrpeg-portal-auth', (e) => {
    if (e.detail?.role === 'chairman') bootDashboard(e.detail)
  })

  const boot = async () => {
    const session = window.XrpegPortal?.getSession()
    if (session?.role === 'chairman') return bootDashboard(session)
    const s = await window.XrpegPortal?.checkSession()
    if (s?.role === 'chairman') return bootDashboard(s)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()