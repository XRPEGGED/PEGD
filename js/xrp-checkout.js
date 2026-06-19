(() => {
  const HOLDER_KEY = 'pegd_holder_wallet'
  const HOLDER_RAIL_KEY = 'pegd_holder_rail'

  const storageGet = (key) => localStorage.getItem(key) || sessionStorage.getItem(key)
  const storageSet = (key, value) => {
    localStorage.setItem(key, value)
    sessionStorage.setItem(key, value)
  }

  const getBuyer = () => {
    const wallet = storageGet(HOLDER_KEY)
    const rail = storageGet(HOLDER_RAIL_KEY)
    if (wallet && rail === 'xumm') return wallet
    const portal = window.XrpegPortal?.getSession?.()
    if (portal?.rail === 'xrpl') return portal.address
    return null
  }

  const rememberBuyer = (address) => {
    storageSet(HOLDER_KEY, address)
    storageSet(HOLDER_RAIL_KEY, 'xumm')
    document.body.classList.add('holders-unlocked')
    window.XrpegPortal?.updateBadge?.()
    window.dispatchEvent(
      new CustomEvent('xrpeg-buyer-connected', { detail: { address, rail: 'xumm' } })
    )
  }

  async function pollXummAuth(payloadId) {
    for (let i = 0; i < 90; i++) {
      const res = await fetch('/api/xumm/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Xaman connect failed')
      if (data.pending) {
        await new Promise((r) => {
          pollTimer = setTimeout(r, 2000)
        })
        continue
      }
      if (data.signed && data.account) return data.account
      throw new Error('Xaman sign-in cancelled')
    }
    throw new Error('Xaman connect timed out')
  }

  async function ensureBuyer() {
    const existing = getBuyer()
    if (existing) return existing

    ensureModal().classList.add('open')
    setMsg('Opening Xaman to connect your wallet…', '')

    const res = await fetch('/api/xumm/auth', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success) throw new Error(data?.error || 'Xaman auth failed')

    const qr = ensureModal().querySelector('#xrpeg-pay-qr')
    if (data.qr) {
      qr.src = data.qr
      qr.classList.remove('hidden')
    } else {
      qr.classList.add('hidden')
    }
    if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')

    setMsg('Approve sign-in in Xaman…', '')
    const account = await pollXummAuth(data.uuid)
    rememberBuyer(account)
    if (window.XrpegPortal?.verifyXumm) {
      try {
        await window.XrpegPortal.verifyXumm(data.uuid)
      } catch {
        /* checkout can proceed without portal cookie */
      }
    }
    return account
  }

  const fmtUsd = (n) =>
    '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmtXrp = (n) =>
    Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + ' XRP'

  let modal = null
  let pollTimer = null

  const ensureModal = () => {
    const existing = document.getElementById('xrpeg-pay-modal')
    if (existing) {
      modal = existing
      return modal
    }
    if (modal) return modal
    const style = document.createElement('style')
    style.textContent = `
      #xrpeg-pay-modal {
        position: fixed; inset: 0; z-index: 10000; display: none;
        align-items: center; justify-content: center; padding: 16px;
        background: rgba(5,5,20,0.85); backdrop-filter: blur(6px);
      }
      #xrpeg-pay-modal.open { display: flex; }
      #xrpeg-pay-card {
        width: min(420px, 100%); background: #13132e; border: 1px solid rgba(0,245,255,0.25);
        border-radius: 16px; padding: 20px; color: #e0e0ff; font-family: system-ui, sans-serif;
      }
      #xrpeg-pay-card h3 { margin: 0 0 8px; color: #00f5ff; font-size: 1.05rem; }
      #xrpeg-pay-card .sub { color: #7070a0; font-size: 0.82rem; margin-bottom: 12px; }
      #xrpeg-pay-card .row { display: flex; justify-content: space-between; font-size: 0.88rem; margin: 6px 0; }
      #xrpeg-pay-card .amt { color: #f0b90b; font-weight: 800; }
      #xrpeg-pay-qr { display: block; max-width: 220px; margin: 12px auto; border-radius: 10px; }
      #xrpeg-pay-qr.hidden { display: none; }
      #xrpeg-pay-msg { font-size: 0.8rem; min-height: 1.2rem; margin-top: 10px; }
      #xrpeg-pay-msg.err { color: #ff6b8a; }
      #xrpeg-pay-msg.ok { color: #34d399; }
      #xrpeg-pay-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
      #xrpeg-pay-actions button {
        flex: 1; min-width: 120px; padding: 12px; border: none; border-radius: 10px;
        font-weight: 800; cursor: pointer; font-size: 0.85rem;
      }
      .xrpeg-btn-xumm { background: linear-gradient(135deg, #0052ff, #0039b3); color: #fff; }
      .xrpeg-btn-ghost { background: transparent; border: 1px solid rgba(0,245,255,0.25) !important; color: #7070a0; }
      .btn-pay-xumm {
        margin-top: 8px; width: 100%; padding: 10px; border: none; border-radius: 8px;
        background: linear-gradient(135deg, #0052ff, #0039b3); color: #fff; font-weight: 800;
        font-size: 0.82rem; cursor: pointer;
      }
      .btn-pay-xumm:disabled { opacity: 0.5; cursor: not-allowed; }
      #xrpeg-ship-form { display: none; margin-top: 12px; }
      #xrpeg-ship-form.open { display: block; }
      #xrpeg-ship-form label { display: block; font-size: 0.72rem; color: #7070a0; margin: 8px 0 4px; }
      #xrpeg-ship-form input {
        width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(0,245,255,0.2);
        background: #0a0a1a; color: #e0e0ff; font-size: 0.85rem;
      }
      #xrpeg-ship-form .ship-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      #xrpeg-ship-form .ship-note { font-size: 0.75rem; color: #7070a0; margin: 10px 0; line-height: 1.4; }
      #xrpeg-ship-submit {
        margin-top: 12px; width: 100%; padding: 12px; border: none; border-radius: 10px;
        background: linear-gradient(135deg, #00f5ff, #0099aa); color: #0a0a1a; font-weight: 800; cursor: pointer;
      }
    `
    document.head.appendChild(style)

    modal = document.createElement('div')
    modal.id = 'xrpeg-pay-modal'
    modal.innerHTML = `
      <div id="xrpeg-pay-card">
        <h3 id="xrpeg-pay-title">XRP via Xaman</h3>
        <p class="sub" id="xrpeg-pay-sub">Secondary rail — prefer PEGD in Phantom when you can. Approve XRP in Xaman; no seed on this site.</p>
        <div id="xrpeg-pay-step-pay">
          <div class="row"><span>USD</span><span class="amt" id="xrpeg-pay-usd">—</span></div>
          <div class="row"><span>XRP (live quote)</span><span class="amt" id="xrpeg-pay-xrp">—</span></div>
          <div class="row"><span>To</span><span style="font-size:0.72rem;word-break:break-all" id="xrpeg-pay-dest">—</span></div>
          <img id="xrpeg-pay-qr" class="hidden" alt="Xaman QR" width="220" height="220">
        </div>
        <form id="xrpeg-ship-form" autocomplete="on">
          <p class="ship-note"><strong style="color:#00f5ff">Secure fulfillment.</strong> Address is encrypted server-side, tied to your paying wallet. Never posted on-chain.</p>
          <label>Full name</label><input name="fullName" required maxlength="120" autocomplete="name">
          <label>Address line 1</label><input name="line1" required maxlength="200" autocomplete="address-line1">
          <label>Address line 2</label><input name="line2" maxlength="200" autocomplete="address-line2">
          <div class="ship-grid">
            <div><label>City</label><input name="city" required maxlength="100" autocomplete="address-level2"></div>
            <div><label>State</label><input name="state" required maxlength="80" autocomplete="address-level1"></div>
          </div>
          <div class="ship-grid">
            <div><label>Postal</label><input name="postalCode" required maxlength="32" autocomplete="postal-code"></div>
            <div><label>Country (2-letter)</label><input name="country" required maxlength="2" placeholder="US" autocomplete="country"></div>
          </div>
          <label>Email (shipping updates)</label><input name="email" type="email" required maxlength="254" autocomplete="email">
          <button type="submit" id="xrpeg-ship-submit">Submit secure shipping</button>
        </form>
        <p id="xrpeg-pay-msg"></p>
        <div id="xrpeg-pay-actions">
          <button type="button" class="xrpeg-btn-xumm" id="xrpeg-pay-open">Open Xaman</button>
          <button type="button" class="xrpeg-btn-ghost" id="xrpeg-pay-close">Close</button>
        </div>
      </div>`
    document.body.appendChild(modal)

    modal.querySelector('#xrpeg-pay-close').addEventListener('click', close)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close()
    })
    modal.querySelector('#xrpeg-ship-form').addEventListener('submit', (e) => {
      e.preventDefault()
      if (modal._submitShipping) modal._submitShipping()
    })
    return modal
  }

  function congratulationsUrl(ctx, data) {
    const q = new URLSearchParams()
    if (ctx.buyer) q.set('wallet', ctx.buyer)
    if (ctx.txHash) q.set('tx', ctx.txHash)
    if (ctx.listingId) q.set('listing', ctx.listingId)
    if (ctx.title) q.set('title', ctx.title)
    if (data?.fulfillmentHash) q.set('proof', data.fulfillmentHash)
    if (data?.alreadySubmitted) q.set('repeat', '1')
    q.set('new', '1')
    return `${window.location.origin}/order-status.html?${q.toString()}`
  }

  function showShippingForm(ctx) {
    const form = ensureModal().querySelector('#xrpeg-ship-form')
    const payStep = ensureModal().querySelector('#xrpeg-pay-step-pay')
    const actions = ensureModal().querySelector('#xrpeg-pay-actions')
    form.classList.add('open')
    payStep.style.display = 'none'
    actions.style.display = 'none'
    ensureModal().querySelector('#xrpeg-pay-title').textContent = 'Secure shipping'
    ensureModal().querySelector('#xrpeg-pay-sub').textContent =
      'Payment received. Enter ship-to — encrypted, wallet-verified, seller-only.'
    ensureModal()._shipCtx = ctx
    ensureModal()._submitShipping = () => submitShipping(ctx)
  }

  async function submitShipping(ctx) {
    const form = ensureModal().querySelector('#xrpeg-ship-form')
    const fd = new FormData(form)
    setMsg('Encrypting and saving shipping…', '')
    try {
      const res = await fetch('/api/market/order-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payloadUuid: ctx.payloadUuid,
          buyerWallet: ctx.buyer,
          txHash: ctx.txHash,
          listingId: ctx.listingId || null,
          fullName: fd.get('fullName'),
          line1: fd.get('line1'),
          line2: fd.get('line2'),
          city: fd.get('city'),
          state: fd.get('state'),
          postalCode: fd.get('postalCode'),
          country: fd.get('country'),
          email: fd.get('email'),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Shipping save failed')
      setMsg('Order secured — taking you to confirmation…', 'ok')
      form.querySelector('#xrpeg-ship-submit').disabled = true
      window.location.assign(congratulationsUrl(ctx, data))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Shipping failed', 'err')
    }
  }

  const close = () => {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    const m = ensureModal()
    m.classList.remove('open')
    m.querySelector('#xrpeg-ship-form')?.classList.remove('open')
    const payStep = m.querySelector('#xrpeg-pay-step-pay')
    const actions = m.querySelector('#xrpeg-pay-actions')
    if (payStep) payStep.style.display = ''
    if (actions) actions.style.display = ''
    const submitBtn = m.querySelector('#xrpeg-ship-submit')
    if (submitBtn) submitBtn.disabled = false
  }

  const setMsg = (text, kind) => {
    const el = ensureModal().querySelector('#xrpeg-pay-msg')
    el.textContent = text || ''
    el.className = kind ? kind : ''
  }

  async function pollPayment(payloadId) {
    for (let i = 0; i < 90; i++) {
      const res = await fetch('/api/xumm/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Poll failed')
      if (data.pending) {
        await new Promise((r) => {
          pollTimer = setTimeout(r, 2000)
        })
        continue
      }
      if (data.signed) {
        return data
      }
      throw new Error('Payment cancelled in Xaman')
    }
    throw new Error('Payment timed out')
  }

  async function startCheckout(opts) {
    ensureModal().classList.add('open')
    setMsg('Connecting Xaman…', '')
    let buyer
    try {
      buyer = await ensureBuyer()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Xaman connect failed', 'err')
      return
    }

    setMsg('Creating Xaman payment…', '')
    ensureModal().querySelector('#xrpeg-pay-qr').classList.add('hidden')

    try {
      const res = await fetch('/api/market/xumm-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerAddress: buyer,
          listingId: opts.listingId || null,
          usd: opts.usd || null,
          memo: opts.memo || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Checkout failed')

      const p = data.payment
      ensureModal().querySelector('#xrpeg-pay-title').textContent =
        (opts.title ? opts.title + ' — ' : '') + 'XRP via Xaman (secondary)'
      ensureModal().querySelector('#xrpeg-pay-sub').textContent =
        'Secondary rail — PEGD via Phantom is preferred on pegd.org.'
      ensureModal().querySelector('#xrpeg-pay-usd').textContent = fmtUsd(p.usd)
      ensureModal().querySelector('#xrpeg-pay-xrp').textContent = fmtXrp(p.xrpAmount)
      ensureModal().querySelector('#xrpeg-pay-dest').textContent = p.destination

      const qr = ensureModal().querySelector('#xrpeg-pay-qr')
      if (data.qr) {
        qr.src = data.qr
        qr.classList.remove('hidden')
      }

      const openBtn = ensureModal().querySelector('#xrpeg-pay-open')
      openBtn.onclick = () => {
        if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')
      }
      if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')

      setMsg('Scan QR or approve in Xaman…', '')
      const payResult = await pollPayment(data.uuid)
      if (opts.listingId) {
        showShippingForm({
          payloadUuid: data.uuid,
          buyer,
          txHash: payResult?.txid || null,
          listingId: opts.listingId,
          title: opts.title,
        })
        setMsg('Payment received. Submit shipping below.', 'ok')
      } else {
        const txNote = payResult?.txid ? ` Tx: ${payResult.txid.slice(0, 12)}…` : ''
        setMsg('Payment signed in Xaman.' + txNote, 'ok')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Payment failed', 'err')
    }
  }

  function mountTreasuryWidget(root) {
    if (!root || root.dataset.mounted) return
    root.dataset.mounted = '1'
    root.innerHTML = `
      <p style="color:var(--muted);font-size:0.88rem;margin-bottom:1rem;">
        Pay the <strong style="color:var(--text)">XRPEGGED treasury</strong> in XRP via Xaman — same secure rail as Proof of Worth.
        No family seed in the browser (unlike the local desktop payment tool).
      </p>
      <div style="max-width:360px;margin:0 auto;display:flex;flex-direction:column;gap:0.75rem;">
        <input type="number" id="xrpeg-treasury-usd" min="0.5" step="0.01" placeholder="Amount in USD (e.g. 25.00)"
          style="padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);">
        <input type="text" id="xrpeg-treasury-memo" maxlength="200" placeholder="Memo (optional)"
          style="padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);">
        <button type="button" class="btn-connect xumm" id="xrpeg-treasury-pay" style="opacity:0.85;font-size:0.82rem;">Also pay treasury in XRP (Xaman)</button>
      </div>`
    root.querySelector('#xrpeg-treasury-pay').addEventListener('click', () => {
      const usd = parseFloat(root.querySelector('#xrpeg-treasury-usd').value)
      const memo = root.querySelector('#xrpeg-treasury-memo').value
      if (!Number.isFinite(usd) || usd < 0.5) {
        alert('Enter at least $0.50 USD')
        return
      }
      startCheckout({ usd, memo, title: 'Treasury payment' })
    })
  }

  window.XrpegCheckout = window.XrpegCheckout || {}
  window.XrpegCheckout.payWithXaman = (listing) =>
    startCheckout({
      listingId: listing.id,
      title: listing.title,
    })
  window.XrpegCheckout.payTreasuryXrp = (usd, memo) =>
    startCheckout({ usd, memo, title: 'Treasury payment' })
  window.XrpegCheckout.mountTreasuryWidget = mountTreasuryWidget
  if (!window.XrpegCheckout.getBuyer) {
    window.XrpegCheckout.getBuyer = getBuyer
  }

  const bootWidget = () => mountTreasuryWidget(document.getElementById('xrp-pay-widget'))
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWidget)
  } else {
    bootWidget()
  }
})()