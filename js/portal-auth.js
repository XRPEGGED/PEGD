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
    console.log('applySession called:', s)
    session = s
    if (s) {
      console.log('Session active, adding portal-authenticated class')
      document.body.classList.add('portal-authenticated')
      emit('xrpeg-portal-auth', s)
    } else {
      console.log('No session, removing portal-authenticated class')
      document.body.classList.remove('portal-authenticated')
      emit('xrpeg-portal-logout')
    }
    console.log('Calling updateBadge()')
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkSession())
  } else {
    checkSession()
  }
})()