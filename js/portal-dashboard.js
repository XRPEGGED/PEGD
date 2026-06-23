(() => {
  const gate = document.getElementById('gate')
  const dash = document.getElementById('dash')
  const gateMsg = document.getElementById('gate-msg')
  const fmt = (n, d = 2) => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }))

  function showErr(msg) {
    gateMsg.textContent = msg
    gateMsg.classList.remove('hidden', 'okmsg')
    gateMsg.classList.add('err')
  }

  // --- Inactivity timeout for security (auto-logout after idle) ---
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
  let idleTimer = null

  function resetIdleTimer() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(async () => {
      showErr('Session timed out due to inactivity')
      try {
        await fetch('/api/portal/logout', { method: 'POST', credentials: 'include' })
      } catch {}
      // clear any local state from auth
      localStorage.removeItem('pegd_holder_wallet')
      localStorage.removeItem('pegd_holder_rail')
      sessionStorage.removeItem('pegd_holder_wallet')
      sessionStorage.removeItem('pegd_holder_rail')
      location.reload()
    }, IDLE_TIMEOUT_MS)
  }

  // attach activity listeners (passive for perf)
  ;['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, resetIdleTimer, { passive: true })
  })
  resetIdleTimer() // start timer

  // Helper to reset timer after successful auth or dashboard load
  function onSuccessfulAuth() {
    resetIdleTimer()
  }

  async function loadDashboard() {
    const res = await fetch('/api/portal/dashboard', { credentials: 'include' })
    if (res.status === 401) return false
    const data = await res.json()
    if (!data.success) return false

    gate.classList.add('hidden')
    dash.classList.remove('hidden')
    document.getElementById('who').textContent =
      (data.session.rail === 'xrpl' ? 'Xaman · ' : 'Phantom · ') + data.session.address

    const hud = data.hud || {}
    document.getElementById('phase').textContent = hud.phase || '—'
    if (window.XrpegPortal?.checkSession) await window.XrpegPortal.checkSession()
    const board = document.getElementById('directives-board')
    if (board && window.XrpegDirectives) {
      await window.XrpegDirectives.mount(board).catch(() => {})
    }

    const t = data.live?.treasury || {}
    const c = data.live?.curve || {}
    const m = data.live?.market || {}
    const tokenCount = (t.tokens || []).length;
    document.getElementById('metrics').innerHTML = `
        <div><div class="l">XRP treasury</div><div class="v">${fmt(t.xrp)} XRP</div></div>
        <div><div class="l">SOL treasury</div><div class="v">${fmt(t.sol, 3)} SOL</div></div>
        <div><div class="l">SPL tokens</div><div class="v">${tokenCount} holdings</div></div>
        <div><div class="l">Curve</div><div class="v">${c.graduationPct != null ? fmt(c.graduationPct, 2) + '%' : '—'}</div></div>
        <div><div class="l">Market active</div><div class="v">${m.active ?? '—'}</div></div>`
    document.getElementById('updated').textContent =
      'Updated ' + new Date(data.live?.generatedAt || Date.now()).toLocaleString()

    onSuccessfulAuth()

    // Load compute worker stats for the signed-in wallet (Solana address only)
    if (data.session.rail === 'solana') {
      loadComputeStats(data.session.address).catch(() => {})
    }

    // Load and surface Shipping Terminal automatically if Chairman has pending work
    loadShippingTerminal().catch(() => {})

    return true
  }

  async function loadShippingTerminal() {
    const card = document.getElementById('shipping-terminal-card')
    const listEl = document.getElementById('pending-shipments-list')
    if (!card || !listEl) return

    try {
      const res = await fetch('/api/portal/command/orders', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      if (!data.success || !Array.isArray(data.orders)) return

      const pending = data.orders.filter(o => 
        o.fulfillment_status === 'paid' || 
        o.fulfillment_status === 'shipping_submitted' ||
        (o.listing_id && o.listing_id.includes('a0c775db')) // Metapod PoC
      )

      if (pending.length === 0) return

      card.style.display = 'block'

      let html = ''
      pending.forEach(order => {
        const title = order.title || (order.listing_id ? order.listing_id.slice(0,8) + '...' : 'Order')
        const status = order.fulfillment_status || 'pending'
        html += `<div style="margin:4px 0; font-size:0.8rem;">
          <strong>${title}</strong> — ${status}
          <br><a href="/command.html?tab=orders" style="color:var(--neon);">Open in terminal →</a>
        </div>`
      })

      // For the current Metapod PoC, highlight the dedicated one-click
      if (pending.some(o => o.listing_id && o.listing_id.includes('a0c775db'))) {
        html += `<div style="margin-top:8px; font-size:0.75rem; color:var(--gold);">
          Metapod PoC: Use the gold one-click fulfill card in Command Overview (decrypt + mark shipped).
        </div>`
      }

      listEl.innerHTML = html
    } catch (e) {
      // silent
    }
  }

  // Initial state: if already logged in (valid cookie from previous session), auto-hide sign-in card and show HUD
  // This ensures the sign-in card + buttons are not visible when the user is logged in on page load.
  loadDashboard().catch(() => {
    // No valid session → ensure sign-in gate is visible
    gate.classList.remove('hidden')
    dash.classList.add('hidden')
  })

  document.getElementById('xumm-btn').addEventListener('click', async () => {
    showErr('Opening Xumm…')
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

      const poll = async () => {
        const res = await fetch('/api/xumm/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payloadId: payload.uuid }),
        })
        const data = await res.json()
        if (data.pending) return setTimeout(poll, 2000)
        if (!data.signed || !data.account) throw new Error('Sign-in cancelled')

        const verify = await fetch('/api/portal/verify-xumm', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payloadId: payload.uuid }),
        })
        const auth = await verify.json()
        if (!verify.ok) throw new Error(auth.error || 'Not authorized')
        await loadDashboard()
        onSuccessfulAuth()
      }
      poll()
    } catch (e) {
      showErr(e.message || 'Xumm sign-in failed')
    }
  })

  document.getElementById('phantom-btn').addEventListener('click', async () => {
    showErr('Connect Phantom…')
    try {
      const provider = window.solana
      if (!provider?.isPhantom) {
        window.open('https://phantom.app/', '_blank')
        throw new Error('Install Phantom app')
      }
      const { publicKey } = await provider.connect()
      const address = publicKey.toString()
      const ch = await fetch('/api/portal/challenge')
      const { timestamp, nonce } = await ch.json()
      const message = `XRPEGGED portal\nAddress: ${address}\nTime: ${timestamp}\nNonce: ${nonce}`
      const encoded = new TextEncoder().encode(message)
      const { signature } = await provider.signMessage(encoded, 'utf8')
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

      const verify = await fetch('/api/portal/verify-phantom', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature: sigB64 }),
      })
      const auth = await verify.json()
      if (!verify.ok) throw new Error(auth.error || 'Not authorized')
      await loadDashboard()
      onSuccessfulAuth()
    } catch (e) {
      showErr(e.message || 'Phantom sign-in failed')
    }
  })

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/portal/logout', { method: 'POST', credentials: 'include' })
    location.reload()
  })

  async function loadComputeStats(wallet) {
    const COMPUTE = 'https://pegd-compute.xrpegged.workers.dev'
    const [minerRes, statsRes] = await Promise.all([
      fetch(`${COMPUTE}/miner?wallet=${encodeURIComponent(wallet)}`).then(r => r.json()).catch(() => null),
      fetch(`${COMPUTE}/stats`).then(r => r.json()).catch(() => null),
    ])

    if (!minerRes?.found) {
      document.getElementById('cm-status').textContent = 'No worker seen'
      document.getElementById('cm-lastseen').textContent = 'Start pegd-worker.py to begin earning'
      return
    }

    const active = minerRes.active
    const hs = minerRes.hashrate || 0
    const hsText = hs >= 1 ? fmt(hs, 2) + ' MH/s' : fmt(hs * 1000, 1) + ' KH/s'

    document.getElementById('cm-status').textContent = active ? '🟢 Active' : '⚫ Idle'
    document.getElementById('cm-status').style.color = active ? 'var(--ok)' : 'var(--muted)'
    document.getElementById('cm-hashrate').textContent = active ? hsText : '—'
    document.getElementById('cm-pending').textContent = fmt(minerRes.pendingPegd || 0, 2) + ' PEGD'
    document.getElementById('cm-rank').textContent = minerRes.rank != null ? '#' + minerRes.rank : '—'
    document.getElementById('cm-share').textContent = minerRes.poolShare != null
      ? (minerRes.poolShare * 100).toFixed(2) + '%' : '—'
    document.getElementById('cm-gpu').textContent = minerRes.gpu || '—'

    if (minerRes.lastSeen) {
      const ago = Math.round((Date.now() - minerRes.lastSeen) / 1000)
      const agoText = ago < 60 ? ago + 's ago' : ago < 3600 ? Math.floor(ago / 60) + 'm ago' : Math.floor(ago / 3600) + 'h ago'
      document.getElementById('cm-lastseen').textContent = 'Last heartbeat: ' + agoText
    }

    if (statsRes) {
      document.getElementById('cm-pool').textContent =
        `Pool: ${statsRes.workers ?? '—'} workers · ${fmt(statsRes.totalHashrate, 2)} MH/s total · ${statsRes.currentCoin || '—'}`
    }
  }

  // Periodic re-check (keeps HUD fresh; will naturally show gate again on 401/expiry)
  setInterval(() => {
    loadDashboard().catch(() => {
      gate.classList.remove('hidden')
      dash.classList.add('hidden')
    })
  }, 60_000)
})()