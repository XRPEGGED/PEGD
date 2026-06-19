(() => {
  if (document.getElementById('xrpeg-sidecar')) return

  const style = document.createElement('style')
  style.textContent = `
    #xrpeg-sidecar-fab {
      position: fixed; right: 16px; bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 9998; border: none; border-radius: 999px; padding: 12px 16px;
      background: linear-gradient(135deg, #00f5ff, #9945ff); color: #0a0a1a;
      font-weight: 800; font-size: 0.82rem; cursor: pointer; box-shadow: 0 8px 28px rgba(0,245,255,0.35);
    }
    #xrpeg-sidecar-fab.locked { background: #1a1a3a; color: #7070a0; border: 1px solid rgba(0,245,255,0.25); box-shadow: none; }
    body.portal-authenticated #xrpeg-sidecar-fab { background: linear-gradient(135deg, #00f5ff, #9945ff); color: #0a0a1a; }
    #xrpeg-sidecar {
      position: fixed; right: 0; top: 0; bottom: 0; width: min(380px, 100vw);
      z-index: 9999; background: #0d0d22; border-left: 1px solid rgba(0,245,255,0.2);
      transform: translateX(100%); transition: transform 0.25s ease;
      display: flex; flex-direction: column; font-family: system-ui, sans-serif;
    }
    #xrpeg-sidecar.open { transform: translateX(0); }
    #xrpeg-sidecar header {
      padding: 14px 16px; border-bottom: 1px solid rgba(0,245,255,0.15);
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
    }
    #xrpeg-sidecar header h2 { font-size: 0.95rem; color: #00f5ff; margin: 0; flex: 1; }
    #xrpeg-sidecar .session-pill {
      font-size: 0.62rem; font-weight: 800; padding: 4px 8px; border-radius: 999px;
      background: rgba(0,245,255,0.15); color: #00f5ff; white-space: nowrap;
    }
    #xrpeg-sidecar .close { background: none; border: none; color: #7070a0; font-size: 1.2rem; cursor: pointer; }
    #xrpeg-sidecar .gate {
      flex: 1; padding: 20px 16px; display: flex; flex-direction: column; gap: 12px;
    }
    #xrpeg-sidecar .gate p { font-size: 0.82rem; color: #7070a0; line-height: 1.45; }
    #xrpeg-sidecar .gate .btn {
      width: 100%; padding: 12px; border: none; border-radius: 10px; font-weight: 800;
      font-size: 0.85rem; cursor: pointer;
    }
    #xrpeg-sidecar .gate .btn-xumm { background: linear-gradient(135deg, #0052ff, #0039b3); color: #fff; }
    #xrpeg-sidecar .gate .btn-phantom { background: linear-gradient(135deg, #9945ff, #7c3aed); color: #fff; }
    #xrpeg-sidecar .gate .err { color: #f87171; font-size: 0.78rem; min-height: 1.2rem; }
    #xrpeg-sidecar .gate .qr { max-width: 180px; margin: 8px auto; border-radius: 8px; display: none; }
    #xrpeg-sidecar .gate .qr.visible { display: block; }
    #xrpeg-sidecar .main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    #xrpeg-sidecar .main.hidden { display: none; }
    #xrpeg-sidecar .chips { padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    #xrpeg-sidecar .chip {
      font-size: 0.72rem; padding: 6px 10px; border-radius: 999px; cursor: pointer;
      border: 1px solid rgba(0,245,255,0.25); background: rgba(0,245,255,0.08); color: #e0e0ff;
    }
    #xrpeg-sidecar .chip.locked {
      opacity: 0.45; cursor: not-allowed; border-style: dashed;
    }
    #xrpeg-sidecar .log {
      flex: 1; overflow-y: auto; padding: 12px 16px; font-size: 0.82rem; color: #e0e0ff;
    }
    #xrpeg-sidecar .msg { margin-bottom: 12px; }
    #xrpeg-sidecar .msg .who { font-size: 0.68rem; color: #9945ff; font-weight: 700; text-transform: uppercase; }
    #xrpeg-sidecar .msg.user .who { color: #00f5ff; }
    #xrpeg-sidecar form {
      padding: 12px; border-top: 1px solid rgba(0,245,255,0.15);
      display: flex; gap: 8px; padding-bottom: max(12px, env(safe-area-inset-bottom));
    }
    #xrpeg-sidecar input {
      flex: 1; border-radius: 8px; border: 1px solid rgba(0,245,255,0.2);
      background: #0a0a1a; color: #e0e0ff; padding: 10px; font-size: 0.85rem;
    }
    #xrpeg-sidecar button.send {
      border: none; border-radius: 8px; background: #00f5ff; color: #0a0a1a;
      font-weight: 800; padding: 0 14px; cursor: pointer;
    }
    #xrpeg-sidecar .portal-link {
      display: block; text-align: center; font-size: 0.72rem; color: #7070a0;
      padding: 0 12px 8px;
    }
    #xrpeg-sidecar .portal-link a { color: #00f5ff; }
    @media (max-width: 480px) { #xrpeg-sidecar { width: 100vw; } }
  `
  document.head.appendChild(style)

  const fab = document.createElement('button')
  fab.id = 'xrpeg-sidecar-fab'
  fab.type = 'button'
  fab.className = 'locked'
  fab.textContent = '◎ Officers'
  fab.setAttribute('aria-label', 'Open XRPEGGED officers panel')

  const panel = document.createElement('aside')
  panel.id = 'xrpeg-sidecar'
  panel.innerHTML = `
    <header>
      <h2>XRPEGGED Officers</h2>
      <span class="session-pill hidden" id="xrpeg-sidecar-pill"></span>
      <button type="button" class="close" aria-label="Close">✕</button>
    </header>
    <div class="gate" id="xrpeg-sidecar-gate">
      <p><strong style="color:#e0e0ff">Wallet sign-in required.</strong> Officers panel is Chairman-only. Connect Xaman or Phantom — your wallet must be on the allowlist.</p>
      <button type="button" class="btn btn-xumm" id="xrpeg-gate-xumm">🔵 Sign in with Xaman</button>
      <button type="button" class="btn btn-phantom" id="xrpeg-gate-phantom">🟣 Sign in with Phantom</button>
      <img class="qr" id="xrpeg-gate-qr" alt="Xumm QR" width="180" height="180">
      <p class="err" id="xrpeg-gate-msg"></p>
      <p style="font-size:0.72rem;color:#505070;margin-top:auto;">Full HUD: <a href="/portal.html" style="color:#00f5ff">portal.html</a></p>
    </div>
    <div class="main hidden" id="xrpeg-sidecar-main">
      <div class="chips">
        <button type="button" class="chip" data-q="market status">Market</button>
        <button type="button" class="chip" data-q="treasury">Treasury</button>
        <button type="button" class="chip" data-q="curve pegd">PEGD curve</button>
        <button type="button" class="chip" data-q="sprint priority">Sprint</button>
      </div>
      <div class="log" id="xrpeg-sidecar-log"></div>
      <a class="portal-link" href="/portal.html">Open Command HUD →</a>
      <form id="xrpeg-sidecar-form">
        <input type="text" placeholder="Ask the officers…" maxlength="500" autocomplete="off">
        <button type="submit" class="send">Ask</button>
      </form>
    </div>
  `

  document.body.appendChild(fab)
  document.body.appendChild(panel)

  const gate = panel.querySelector('#xrpeg-sidecar-gate')
  const main = panel.querySelector('#xrpeg-sidecar-main')
  const log = panel.querySelector('#xrpeg-sidecar-log')
  const form = panel.querySelector('#xrpeg-sidecar-form')
  const input = form.querySelector('input')
  const pill = panel.querySelector('#xrpeg-sidecar-pill')
  const gateMsg = panel.querySelector('#xrpeg-gate-msg')
  const gateQr = panel.querySelector('#xrpeg-gate-qr')

  let authed = false
  let greeted = false

  // Public mode support (T1): on open without auth, show public brief immediately
  function openPublic() {
    panel.classList.add('open')
    if (!greeted && !authed) {
      greeted = true
      // fire public help (brief now supports unauthed)
      ask('help')
    }
  }

  const append = (who, text, user = false) => {
    const div = document.createElement('div')
    div.className = 'msg' + (user ? ' user' : '')
    div.innerHTML = `<div class="who">${who}</div><div>${text}</div>`
    log.appendChild(div)
    log.scrollTop = log.scrollHeight
  }

  const renderOfficers = (officers) => {
    if (!officers) return
    if (officers.ai && officers.ceo) {
      append('Brainiac', officers.ceo)
      return
    }
    ;['ceo', 'cto', 'cfo', 'cmo'].forEach((key) => {
      if (officers[key]) append(key.toUpperCase(), officers[key])
    })
  }

  const setAuthUi = (session) => {
    authed = Boolean(session)
    if (authed) {
      gate.classList.add('hidden')
      gate.style.display = 'none'
      main.classList.remove('hidden')
      fab.classList.remove('locked')
      fab.textContent = '◎ Officers'
      const rail = session.rail === 'xrpl' ? 'Xaman' : 'Phantom'
      const addr = window.XrpegPortal?.shortAddr(session.address) || session.address
      pill.textContent = `${rail} ${addr}`
      pill.classList.remove('hidden')
    } else {
      // Public mode: show main for market/treasury/curve/help (sprint gated in replies)
      gate.classList.remove('hidden')
      gate.style.display = ''
      main.classList.remove('hidden')
      fab.classList.add('locked')
      fab.textContent = '◎ Officers'
      pill.classList.add('hidden')
      // keep prior log or clear on sign-out only
      greeted = false
    }
  }

  const ask = async (question) => {
    const q = (question || '').trim()
    if (!q) return
    append('You', q, true)
    input.value = ''
    try {
      const res = await fetch('/api/officers/brief', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const msg =
          res.status === 503
            ? data.error || 'Brief temporarily unavailable. Try /portal.html.'
            : data.error || 'Brief unavailable'
        throw new Error(msg)
      }
      renderOfficers(data.officers)
    } catch (err) {
      append('CEO', err instanceof Error ? err.message : 'Briefing offline — try again.')
    }
  }

  async function pollXumm(payloadId) {
    for (let i = 0; i < 90; i++) {
      const res = await fetch('/api/xumm/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Xumm poll failed')
      if (data.pending) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (data.signed && data.account) return data.account
      throw new Error('Xumm sign-in cancelled')
    }
    throw new Error('Xumm timed out')
  }

  panel.querySelector('#xrpeg-gate-xumm').addEventListener('click', async () => {
    gateMsg.textContent = 'Opening Xumm…'
    try {
      const res = await fetch('/api/xumm/auth', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Xumm auth failed')
      if (data.qr) {
        gateQr.src = data.qr
        gateQr.classList.add('visible')
      }
      if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')
      gateMsg.textContent = 'Scan QR or approve in Xumm…'
      const account = await pollXumm(data.uuid)
      try {
        const session = await window.XrpegPortal.verifyXumm(data.uuid)
        setAuthUi(session)
        gateMsg.textContent = ''
      } catch (portalErr) {
        const msg = portalErr instanceof Error ? portalErr.message : 'Portal sign-in failed'
        if (msg.includes('not configured')) {
          gateMsg.textContent =
            'Wallet connected (' +
            (window.XrpegPortal?.shortAddr(account) || account) +
            ') — Full officers requires sign-in via /portal.html. Public brief (market/treasury) works without.'
          window.dispatchEvent(
            new CustomEvent('xrpeg-buyer-connected', { detail: { address: account, rail: 'xumm' } })
          )
        } else {
          throw portalErr
        }
      }
      gateQr.classList.remove('visible')
      if (!greeted) {
        greeted = true
        ask('help')
      }
    } catch (err) {
      gateMsg.textContent = err instanceof Error ? err.message : 'Xumm failed'
    }
  })

  panel.querySelector('#xrpeg-gate-phantom').addEventListener('click', async () => {
    gateMsg.textContent = 'Connect Phantom…'
    try {
      const session = await window.XrpegPortal.verifyPhantom()
      setAuthUi(session)
      gateMsg.textContent = ''
      if (!greeted) {
        greeted = true
        ask('help')
      }
    } catch (err) {
      gateMsg.textContent = err instanceof Error ? err.message : 'Phantom failed'
    }
  })

  fab.addEventListener('click', () => {
    if (authed) {
      panel.classList.add('open')
      if (!greeted) {
        greeted = true
        ask('help')
      }
    } else {
      openPublic()
    }
  })
  panel.querySelector('.close').addEventListener('click', () => panel.classList.remove('open'))
  panel.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => ask(chip.dataset.q))
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    ask(input.value)
  })

  window.addEventListener('xrpeg-portal-auth', (e) => setAuthUi(e.detail))
  window.addEventListener('xrpeg-portal-logout', () => setAuthUi(null))

  const boot = () => {
    const session = window.XrpegPortal?.getSession()
    if (session) setAuthUi(session)
    else window.XrpegPortal?.checkSession().then((s) => setAuthUi(s))
  }

  if (window.XrpegPortal) boot()
  else window.addEventListener('load', boot)
})()