(() => {
  console.log('portal-auth.js loaded')
  const API_BASE_URL = ''; // Use relative URLs - portal functions are on same domain
  let session = null

  const shortAddr = (value) =>
    value && value.length > 12 ? value.slice(0, 6) + '…' + value.slice(-4) : value || ''

  const emit = (name, detail) => {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }

  const applySession = (s) => {
    session = s
    // Remove all role classes first
    document.body.classList.remove('portal-authenticated', 'portal-chairman', 'portal-holder')
    if (s) {
      document.body.classList.add('portal-authenticated')
      document.body.classList.add(s.role === 'chairman' ? 'portal-chairman' : 'portal-holder')
      emit('xrpeg-portal-auth', s)
    } else {
      emit('xrpeg-portal-logout')
    }
    updateBadge()
    return session
  }

  function updateBadge() {
    console.log('updateBadge called, session:', session)
    const badge = document.getElementById('portal-badge')
    if (!badge) {
      console.warn('portal-badge element not found')
      return
    }
    if (session) {
      const rail = session.rail === 'xrpl' ? 'Xaman' : 'Phantom'
      const role = session.role === 'holder' ? 'Holder' : 'Chairman'
      badge.textContent = `${role} · ${rail} ${shortAddr(session.address)}`
      badge.classList.remove('hidden')
      console.log('Badge updated:', badge.textContent)
    } else {
      badge.textContent = ''
      badge.classList.add('hidden')
      console.log('Badge hidden (no session)')
    }
    console.log('About to call updateWalletIndicator()')
    updateWalletIndicator()
  }

  function updateWalletIndicator() {
    const indicator = document.getElementById('wallet-indicator')
    const identicon = document.getElementById('wallet-identicon')
    const emoji = document.getElementById('wallet-emoji')
    const addressEl = document.getElementById('wallet-address')

    if (!indicator || !identicon || !emoji || !addressEl) {
      console.warn('Wallet indicator elements not found')
      return
    }

    if (session && session.address) {
      const isXrpl = session.rail === 'xrpl'
      console.log('Updating wallet indicator:', { rail: session.rail, address: session.address, isXrpl })

      if (isXrpl) {
        // Show Bithomp identicon for XRP addresses
        const avatarUrl = `https://cdn.bithomp.com/avatar/${session.address}`
        console.log('Loading XRP identicon:', avatarUrl)
        identicon.src = avatarUrl
        identicon.style.display = 'block'
        emoji.style.display = 'none'
      } else {
        // Show emoji for Solana addresses
        console.log('Showing Solana emoji')
        emoji.textContent = '🟣'
        emoji.style.display = 'block'
        identicon.style.display = 'none'
      }

      addressEl.textContent = shortAddr(session.address)
      indicator.style.display = 'flex'
      document.body.classList.add('portal-authenticated')
      console.log('Wallet indicator updated successfully')
    } else {
      console.log('No session, hiding wallet indicator')
      identicon.style.display = 'none'
      emoji.style.display = 'none'
      addressEl.textContent = ''
      indicator.style.display = 'none'
      document.body.classList.remove('portal-authenticated')
    }
  }

  async function checkSession() {
    console.log('checkSession called')
    try {
      const res = await fetch(`${API_BASE_URL}/api/portal/session`, { credentials: 'include' })
      console.log('Session check response:', res.status)
      const data = await res.json()
      console.log('Session data:', data)
      if (data.success && data.authenticated && data.session) {
        console.log('Session found, applying:', data.session)
        return applySession(data.session)
      }
    } catch (err) {
      console.warn('checkSession error:', err)
    }
    console.log('No session found, applying null')
    return applySession(null)
  }

  async function verifyXumm(payloadId) {
    const res = await fetch(`${API_BASE_URL}/api/portal/verify-xumm`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payloadId }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg =
        res.status === 503
          ? 'Portal not configured — set PORTAL_SESSION_SECRET + PORTAL_ALLOWLIST on Cloudflare'
          : res.status === 403
            ? 'Wallet not on allowlist — contact Chairman'
            : data.error || 'Portal sign-in failed'
      throw new Error(msg)
    }
    return applySession({ rail: data.rail, address: data.address, role: data.role || 'chairman' })
  }

  async function verifyHolderPhantom() {
    const provider = window.solana
    if (!provider?.isPhantom) {
      window.open('https://phantom.app/', '_blank', 'noopener')
      throw new Error('Phantom not found — install phantom.app')
    }
    const { publicKey } = await provider.connect()
    const address = publicKey.toString()
    const ch = await fetch(`${API_BASE_URL}/api/portal/challenge`)
    const { timestamp, nonce } = await ch.json()
    const message = `XRPEGGED portal\nAddress: ${address}\nTime: ${timestamp}\nNonce: ${nonce}`
    const encoded = new TextEncoder().encode(message)
    const { signature } = await provider.signMessage(encoded, 'utf8')
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

    const res = await fetch(`${API_BASE_URL}/api/portal/verify-holder-phantom`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, message, signature: sigB64 }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg =
        res.status === 503
          ? 'Portal not configured — set PORTAL_SESSION_SECRET on Cloudflare'
          : res.status === 403
            ? data.error || 'PEGD bar not met — need treasury-parity holdings to move directives'
            : data.error || 'Holder sign-in failed'
      throw new Error(msg)
      // T1 note: 503 kept only for real sign-in/auth failures; public officers brief is now graceful (no cookie) per CEO-T1-PORTAL-OFFICERS-20260614-001
    }
    return applySession({ rail: data.rail, address: data.address, role: data.role || 'holder' })
  }

  async function verifyPhantom() {
    const provider = window.solana
    if (!provider?.isPhantom) {
      window.open('https://phantom.app/', '_blank', 'noopener')
      throw new Error('Phantom not found — install phantom.app')
    }
    const { publicKey } = await provider.connect()
    const address = publicKey.toString()
    const ch = await fetch(`${API_BASE_URL}/api/portal/challenge`)
    const { timestamp, nonce } = await ch.json()
    const message = `XRPEGGED portal\nAddress: ${address}\nTime: ${timestamp}\nNonce: ${nonce}`
    const encoded = new TextEncoder().encode(message)
    const { signature } = await provider.signMessage(encoded, 'utf8')
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))

    const res = await fetch(`${API_BASE_URL}/api/portal/verify-phantom`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, message, signature: sigB64 }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg =
        res.status === 503
          ? 'Portal not configured — set PORTAL_SESSION_SECRET + PORTAL_ALLOWLIST on Cloudflare'
          : res.status === 403
            ? 'Wallet not on allowlist — contact Chairman'
            : data.error || 'Portal sign-in failed'
      throw new Error(msg)
    }
    return applySession({ rail: data.rail, address: data.address, role: data.role || 'chairman' })
  }

  async function logout() {
    try {
      await fetch(`${API_BASE_URL}/api/portal/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
    localStorage.removeItem('pegd_holder_wallet')
    localStorage.removeItem('pegd_holder_rail')
    sessionStorage.removeItem('pegd_holder_wallet')
    sessionStorage.removeItem('pegd_holder_rail')
    document.body.classList.remove('holders-unlocked')
    return applySession(null)
  }

  window.XrpegPortal = {
    checkSession,
    verifyXumm,
    verifyPhantom,
    verifyHolderPhantom,
    logout,
    getSession: () => session,
    shortAddr,
    railLabel: (rail) => (rail === 'xrpl' ? 'Xaman' : 'Phantom'),
    updateBadge,
    updateWalletIndicator,
  }

  // Make wallet indicator clickable to disconnect
  document.addEventListener('DOMContentLoaded', () => {
    const indicator = document.getElementById('wallet-indicator')
    if (indicator) {
      indicator.addEventListener('click', async () => {
        if (session) {
          if (confirm('Disconnect wallet?')) {
            await logout()
          }
        }
      })
      indicator.style.cursor = 'pointer'
    }
  })

  // ── Floating auth widget ──────────────────────────────────────────────────

  const TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes
  let timeoutHandle = null
  let floatEl = null

  function resetTimeout() {
    if (!session) return
    clearTimeout(timeoutHandle)
    timeoutHandle = setTimeout(async () => {
      await logout()
      if (floatEl) updateFloat()
      // Show brief notice in the float widget
      if (floatEl) {
        const notice = floatEl.querySelector('#float-status')
        if (notice) { notice.textContent = 'Session timed out'; notice.style.color = '#f87171' }
      }
    }, TIMEOUT_MS)
  }

  function updateFloat() {
    if (!floatEl) return
    const pill   = floatEl.querySelector('#float-pill')
    const panel  = floatEl.querySelector('#float-panel')
    const status = floatEl.querySelector('#float-status')
    const timer  = floatEl.querySelector('#float-timer')

    if (session) {
      const isChairman = session.role === 'chairman'
      const roleLabel  = isChairman ? '👑 Chairman' : '🟣 Holder'
      pill.textContent      = roleLabel + ' · ' + shortAddr(session.address)
      pill.style.background  = isChairman ? '#1a1a0a' : '#14532d'
      pill.style.borderColor = isChairman ? '#fbbf24' : '#4ade80'
      pill.style.color       = isChairman ? '#fbbf24' : '#4ade80'
      if (status) status.textContent = roleLabel + ' · ' + shortAddr(session.address)
      if (timer)  timer.textContent  = 'Auto-logout in 10 min of inactivity'
    } else {
      pill.textContent      = '🔐 Sign In'
      pill.style.background  = '#0f172a'
      pill.style.borderColor = '#1e3a5f'
      pill.style.color       = '#60a5fa'
      if (status) status.textContent = ''
      if (timer)  timer.textContent  = ''
    }
  }

  function buildFloat() {
    floatEl = document.createElement('div')
    floatEl.id = 'pegd-float-auth'
    floatEl.innerHTML = `
      <button id="float-pill" style="
        display:flex;align-items:center;gap:8px;
        background:#0f172a;border:1px solid #1e3a5f;border-radius:24px;
        color:#60a5fa;font-family:'Courier New',monospace;font-size:12px;font-weight:600;
        padding:8px 16px;cursor:pointer;white-space:nowrap;
        box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:all 0.2s;
      ">🔐 Sign In</button>
      <div id="float-panel" style="
        display:none;position:absolute;bottom:52px;right:0;
        background:#0f172a;border:1px solid #1e293b;border-radius:12px;
        padding:16px;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.6);
      ">
        <div id="float-status" style="color:#94a3b8;font-size:11px;margin-bottom:12px;word-break:break-all"></div>
        <button id="float-phantom" style="
          width:100%;background:#1e3a5f;border:1px solid #2d4f7c;border-radius:8px;
          color:#60a5fa;font-family:'Courier New',monospace;font-size:12px;
          padding:8px;cursor:pointer;margin-bottom:8px;
        ">🟣 Phantom</button>
        <button id="float-signout" style="
          display:none;width:100%;background:#1e1e2e;border:1px solid #2d1b3d;border-radius:8px;
          color:#f87171;font-family:'Courier New',monospace;font-size:12px;
          padding:8px;cursor:pointer;margin-bottom:8px;
        ">Sign Out</button>
        <div id="float-timer" style="color:#475569;font-size:10px;text-align:center"></div>
      </div>
    `
    Object.assign(floatEl.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      zIndex: '9999', fontFamily: "'Courier New',monospace",
    })

    const pill    = floatEl.querySelector('#float-pill')
    const panel   = floatEl.querySelector('#float-panel')
    const phantom = floatEl.querySelector('#float-phantom')
    const signout = floatEl.querySelector('#float-signout')

    let open = false
    pill.addEventListener('click', () => {
      open = !open
      panel.style.display = open ? 'block' : 'none'
      // Update signout visibility
      signout.style.display = session ? 'block' : 'none'
      phantom.style.display = session ? 'none' : 'block'
    })

    phantom.addEventListener('click', async () => {
      const status = floatEl.querySelector('#float-status')
      status.textContent = 'Opening Phantom…'
      status.style.color = '#94a3b8'
      try {
        await window.XrpegPortal.verifyPhantom()
        open = false
        panel.style.display = 'none'
        updateFloat()
        resetTimeout()
      } catch (e) {
        status.textContent = e.message || 'Sign-in failed'
        status.style.color = '#f87171'
      }
    })

    signout.addEventListener('click', async () => {
      await logout()
      open = false
      panel.style.display = 'none'
      updateFloat()
    })

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!floatEl.contains(e.target)) {
        open = false
        panel.style.display = 'none'
      }
    })

    document.body.appendChild(floatEl)
    updateFloat()
  }

  // Reset inactivity timer on any user activity
  ;['mousemove','keydown','click','scroll','touchstart'].forEach(ev => {
    document.addEventListener(ev, resetTimeout, { passive: true })
  })

  // Hook into session changes to update the float
  window.addEventListener('xrpeg-portal-auth',   () => { updateFloat(); resetTimeout() })
  window.addEventListener('xrpeg-portal-logout',  () => { clearTimeout(timeoutHandle); updateFloat() })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { checkSession(); buildFloat() })
  } else {
    checkSession()
    buildFloat()
  }
})()