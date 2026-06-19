(() => {
  const WORKER = 'https://xrpegged-market.xrpegged.workers.dev'
  const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
  const TREASURY = 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb'
  const HOLDER_KEY = 'pegd_holder_wallet'
  const HOLDER_RAIL_KEY = 'pegd_holder_rail'
  const RPC_PROXY = '/api/solana'

  const storageGet = (key) => localStorage.getItem(key) || sessionStorage.getItem(key)
  const storageSet = (key, value) => {
    localStorage.setItem(key, value)
    sessionStorage.setItem(key, value)
  }

  const fmtUsd = (n) =>
    '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmtPegd = (n) =>
    Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' PEGD'

  let modal = null
  let solanaLibs = null

  async function loadSolanaLibs() {
    if (solanaLibs) return solanaLibs
    const bundles = [
      [
        'https://esm.sh/@solana/web3.js@1.98.4',
        'https://esm.sh/@solana/spl-token@0.4.13',
      ],
      [
        'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.4/+esm',
        'https://cdn.jsdelivr.net/npm/@solana/spl-token@0.4.13/+esm',
      ],
    ]
    let lastErr = null
    for (const [web3Url, splUrl] of bundles) {
      try {
        const [web3, spl] = await Promise.all([import(web3Url), import(splUrl)])
        solanaLibs = { ...web3, ...spl }
        return solanaLibs
      } catch (err) {
        lastErr = err
      }
    }
    throw new Error(
      lastErr instanceof Error ? lastErr.message : 'Could not load Solana libraries — refresh pegd and retry.'
    )
  }

  function mapPhantomError(err) {
    const msg = String(err?.message || err || '')
    if (/reject|cancel|denied|declined/i.test(msg)) {
      return 'Payment cancelled in Phantom. Tap Pay with PEGD again when ready.'
    }
    if (/blockhash|block height|expired/i.test(msg)) {
      return 'Solana network timed out — refresh pegd and retry.'
    }
    if (/insufficient|0x1/i.test(msg)) {
      return 'Transaction rejected — check PEGD balance and SOL for fees, then retry.'
    }
    return msg || 'PEGD payment failed'
  }

  function rpcUrl() {
    return new URL(RPC_PROXY, window.location.origin).toString()
  }

  function isMobileUa() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
  }

  function isBraveWalletInjected() {
    return window.braveSolana?.isBraveWallet === true || window.solana?.isBraveWallet === true
  }

  function getPhantomProvider() {
    if ('phantom' in window) {
      const provider = window.phantom?.solana
      if (provider?.isPhantom) return provider
    }
    return null
  }

  function hasRealPhantom() {
    return !!getPhantomProvider()
  }

  function openPhantomApp(listingId) {
    const link = phantomBrowseUrl(payResumeUrl(listingId))
    const a = document.createElement('a')
    a.href = link
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 500)
  }

  function phantomBrowseUrl(pageUrl) {
    const ref = encodeURIComponent(`${window.location.origin}/`)
    const url = encodeURIComponent(pageUrl)
    return `https://phantom.app/ul/browse/${url}?ref=${ref}`
  }

  function payResumeUrl(listingId) {
    const base = `${window.location.origin}${window.location.pathname}`
    const hash = listingId ? `#shop?pay=${encodeURIComponent(listingId)}` : '#shop'
    return `${base}${hash}`
  }

  const getBuyer = () => {
    const wallet = storageGet(HOLDER_KEY)
    const rail = storageGet(HOLDER_RAIL_KEY)
    if (wallet && rail === 'phantom') return wallet
    const portal = window.XrpegPortal?.getSession?.()
    if (portal?.rail === 'solana') return portal.address
    return null
  }

  const rememberBuyer = (address) => {
    storageSet(HOLDER_KEY, address)
    storageSet(HOLDER_RAIL_KEY, 'phantom')
    document.body.classList.add('holders-unlocked')
    window.XrpegPortal?.updateBadge?.()
    window.dispatchEvent(
      new CustomEvent('xrpeg-buyer-connected', { detail: { address, rail: 'phantom' } })
    )
  }

  function showOpenInPhantom(listingId) {
    const brave = isBraveWalletInjected() || /Brave/i.test(navigator.userAgent)
    const mobile = isMobileUa()
    ensureModal().classList.add('open')
    setMsg(
      brave
        ? 'Brave Wallet is not Phantom — ignore any Brave popup. Tap below to open pegd in the Phantom app, then approve payment there.'
        : mobile
          ? 'This browser cannot pay with PEGD. Tap below — opens pegd inside Phantom. Then tap Approve.'
          : 'Install the Phantom browser extension to pay with PEGD on desktop.',
      ''
    )
    const actions = ensureModal().querySelector('#xrpeg-pay-actions')
    const openBtn = ensureModal().querySelector('#xrpeg-pay-open')
    openBtn.textContent = mobile ? 'Open in Phantom app' : 'Get Phantom extension'
    openBtn.onclick = () => {
      if (mobile) openPhantomApp(listingId)
      else window.open('https://phantom.app/', '_blank', 'noopener')
    }
    if (actions) actions.style.display = ''
  }

  async function ensurePhantom(opts = {}) {
    const provider = getPhantomProvider()
    if (!provider) {
      showOpenInPhantom(opts.listingId || null)
      throw new Error('OPEN_IN_PHANTOM')
    }
    const existing = getBuyer()
    if (existing) {
      try {
        await provider.connect({ onlyIfTrusted: true })
      } catch {
        await provider.connect()
      }
      if (provider.publicKey?.toString() === existing) return existing
    }
    const { publicKey } = await provider.connect()
    const address = publicKey.toString()
    rememberBuyer(address)
    return address
  }

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
        width: min(420px, 100%); background: #13132e; border: 1px solid rgba(153,69,255,0.35);
        border-radius: 16px; padding: 20px; color: #e0e0ff; font-family: system-ui, sans-serif;
      }
      #xrpeg-pay-card h3 { margin: 0 0 8px; color: #9945ff; font-size: 1.05rem; }
      #xrpeg-pay-card .sub { color: #7070a0; font-size: 0.82rem; margin-bottom: 12px; }
      #xrpeg-pay-card .row { display: flex; justify-content: space-between; font-size: 0.88rem; margin: 6px 0; }
      #xrpeg-pay-card .amt { color: #f0b90b; font-weight: 800; }
      #xrpeg-pay-msg { font-size: 0.8rem; min-height: 1.2rem; margin-top: 10px; }
      #xrpeg-pay-msg.err { color: #ff6b8a; }
      #xrpeg-pay-msg.ok { color: #34d399; }
      #xrpeg-pay-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
      #xrpeg-pay-actions button {
        flex: 1; min-width: 120px; padding: 12px; border: none; border-radius: 10px;
        font-weight: 800; cursor: pointer; font-size: 0.85rem;
      }
      .xrpeg-btn-phantom { background: linear-gradient(135deg, #9945ff, #7c3aed); color: #fff; }
      .xrpeg-btn-ghost { background: transparent; border: 1px solid rgba(153,69,255,0.35) !important; color: #7070a0; }
      .btn-pay-pegd {
        margin-top: 8px; width: 100%; padding: 10px; border: none; border-radius: 8px;
        background: linear-gradient(135deg, #9945ff, #7c3aed); color: #fff; font-weight: 800;
        font-size: 0.82rem; cursor: pointer;
      }
      .btn-pay-pegd:disabled { opacity: 0.5; cursor: not-allowed; }
      #xrpeg-ship-form { display: none; margin-top: 12px; }
      #xrpeg-ship-form.open { display: block; }
      #xrpeg-ship-form label { display: block; font-size: 0.72rem; color: #7070a0; margin: 8px 0 4px; }
      #xrpeg-ship-form input {
        width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(153,69,255,0.25);
        background: #0a0a1a; color: #e0e0ff; font-size: 0.85rem;
      }
      #xrpeg-ship-form .ship-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      #xrpeg-ship-form .ship-note { font-size: 0.75rem; color: #7070a0; margin: 10px 0; line-height: 1.4; }
      #xrpeg-ship-submit {
        margin-top: 12px; width: 100%; padding: 12px; border: none; border-radius: 10px;
        background: linear-gradient(135deg, #9945ff, #7c3aed); color: #fff; font-weight: 800; cursor: pointer;
      }
    `
    document.head.appendChild(style)

    modal = document.createElement('div')
    modal.id = 'xrpeg-pay-modal'
    modal.innerHTML = `
      <div id="xrpeg-pay-card">
        <h3 id="xrpeg-pay-title">Pay with PEGD</h3>
        <p class="sub" id="xrpeg-pay-sub">Approve the SPL transfer in Phantom — no seed phrase on this site. Phantom may warn on new domains; verify token + treasury before approving.</p>
        <div id="xrpeg-pay-step-pay">
          <div class="row"><span>USD</span><span class="amt" id="xrpeg-pay-usd">—</span></div>
          <div class="row"><span id="xrpeg-pay-token-label">PEGD (live quote)</span><span class="amt" id="xrpeg-pay-xrp">—</span></div>
          <div class="row"><span>To treasury</span><span style="font-size:0.72rem;word-break:break-all" id="xrpeg-pay-dest">—</span></div>
        </div>
        <form id="xrpeg-ship-form" autocomplete="on">
          <p class="ship-note"><strong style="color:#9945ff">Secure fulfillment.</strong> Address is encrypted server-side, tied to your paying wallet. Never posted on-chain.</p>
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
          <button type="button" class="xrpeg-btn-phantom" id="xrpeg-pay-open">Approve in Phantom</button>
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

  const setMsg = (text, kind) => {
    const el = ensureModal().querySelector('#xrpeg-pay-msg')
    el.textContent = text || ''
    el.className = kind ? kind : ''
  }

  const close = () => {
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

  const API_FALLBACK = 'https://pegd.pages.dev'

  async function fetchMarketJson(path) {
    const bases = ['', API_FALLBACK]
    for (const base of bases) {
      try {
        const url = base ? `${base}${path}` : path
        const res = await fetch(url)
        const text = await res.text()
        const data = JSON.parse(text)
        if (data && typeof data === 'object') return data
      } catch {
        /* try fallback — pegd.org may 301 /api to HTML */
      }
    }
    throw new Error('Market API unavailable')
  }

  async function fetchListingUsd(listingId) {
    const data = await fetchMarketJson('/api/market/listings')
    const item = (data.listings || []).find((l) => l.id === listingId)
    if (!item) throw new Error('Listing not found')
    return { usd: item.priceUsd, title: item.title }
  }

  function pegdUsdFromGeckoAttrs(attrs) {
    if (!attrs) return null
    const reserve = parseFloat(attrs.total_reserve_in_usd)
    const supply = parseFloat(attrs.normalized_total_supply)
    const spot = attrs.price_usd != null ? parseFloat(attrs.price_usd) : null
    if (Number.isFinite(spot) && spot > 0) return spot
    if (reserve > 0 && supply > 0) return reserve / supply
    return null
  }

  async function fetchPegdUsdFromGecko() {
    const urls = [
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`,
      `https://app.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`,
    ]
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) continue
        const data = await res.json()
        const pegd = pegdUsdFromGeckoAttrs(data?.data?.attributes)
        if (Number.isFinite(pegd) && pegd > 0) return pegd
      } catch {
        /* try mirror */
      }
    }
    return null
  }

  async function fetchPegdUsd() {
    const direct = await fetchPegdUsdFromGecko()
    if (Number.isFinite(direct) && direct > 0) return direct

    try {
      const data = await fetchMarketJson('/api/market/prices')
      const pegd = data?.pricesUsd?.PEGD
      if (Number.isFinite(pegd) && pegd > 0) return pegd
    } catch {
      /* API may 301 on pegd.org — pages fallback inside fetchMarketJson */
    }

    throw new Error('PEGD price unavailable — try again shortly')
  }

  async function checkSolBalance(buyer) {
    const libs = await loadSolanaLibs()
    const { Connection, PublicKey } = libs
    const connection = new Connection(rpcUrl(), 'confirmed')
    const lamports = await connection.getBalance(new PublicKey(buyer))
    const sol = lamports / 1_000_000_000
    if (!Number.isFinite(sol) || sol < 0.002) {
      throw new Error(
        `Need ~0.002 SOL for network fees (wallet has ~${Number.isFinite(sol) ? sol.toFixed(4) : '0'} SOL).`
      )
    }
  }

  async function checkPegdBalance(buyer, pegdAmount) {
    const libs = await loadSolanaLibs()
    const { Connection, PublicKey } = libs
    const {
      getAssociatedTokenAddress,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    } = libs

    const connection = new Connection(rpcUrl(), 'confirmed')
    const mintPk = new PublicKey(PEGD_MINT)
    const buyerPk = new PublicKey(buyer)
    const buyerAta = await getAssociatedTokenAddress(
      mintPk,
      buyerPk,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    let balanceUi = 0
    try {
      const bal = await connection.getTokenAccountBalance(buyerAta)
      balanceUi = bal?.value?.uiAmount ?? 0
    } catch {
      throw new Error(
        `No PEGD token account in this wallet. Get ~${fmtPegd(pegdAmount)} first via Swap XRP→PEGD on pegd.`
      )
    }

    if (!Number.isFinite(balanceUi) || balanceUi < pegdAmount) {
      throw new Error(
        `Insufficient PEGD: have ~${fmtPegd(balanceUi)}, need ~${fmtPegd(pegdAmount)}. Use Swap XRP→PEGD on pegd.`
      )
    }
  }

  async function confirmSignature(signature) {
    for (let i = 0; i < 45; i++) {
      const res = await fetch(RPC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignatureStatuses',
          params: [[signature], { searchTransactionHistory: true }],
        }),
      })
      const data = await res.json().catch(() => ({}))
      const status = data?.result?.value?.[0]
      if (status?.err) throw new Error('Transaction failed on Solana')
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return true
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error('Payment confirmation timed out')
  }

  async function sendPegdPayment(buyer, pegdAmount) {
    const libs = await loadSolanaLibs()
    const { Connection, PublicKey, Transaction } = libs
    const {
      getAssociatedTokenAddress,
      createAssociatedTokenAccountInstruction,
      createTransferCheckedInstruction,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      getMint,
    } = libs

    const provider = getPhantomProvider()
    if (!provider) throw new Error('Phantom not available — open in Phantom app')
    const connection = new Connection(rpcUrl(), 'confirmed')
    const mintPk = new PublicKey(PEGD_MINT)
    const buyerPk = new PublicKey(buyer)
    const treasuryPk = new PublicKey(TREASURY)

    const mintInfo = await getMint(connection, mintPk)
    const decimals = mintInfo.decimals
    const scale = 10 ** decimals
    const rawAmount = BigInt(Math.ceil(Number(pegdAmount.toFixed(6)) * scale))

    const buyerAta = await getAssociatedTokenAddress(mintPk, buyerPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    const treasuryAta = await getAssociatedTokenAddress(
      mintPk,
      treasuryPk,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    const tx = new Transaction()
    const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta)
    if (!treasuryAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          buyerPk,
          treasuryAta,
          treasuryPk,
          mintPk,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
    }

    tx.add(
      createTransferCheckedInstruction(
        buyerAta,
        mintPk,
        treasuryAta,
        buyerPk,
        rawAmount,
        decimals,
        [],
        TOKEN_PROGRAM_ID
      )
    )

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.feePayer = buyerPk

    try {
      const { signature } = await provider.signAndSendTransaction(tx)
      return signature
    } catch (err) {
      throw new Error(mapPhantomError(err))
    }
  }

  async function logPendingOrder({ listingId, buyerAddress, signature }) {
    const body = {
      listingId,
      buyerAddress,
      payloadUuid: signature,
      network: 'solana',
    }
    const bases = ['', 'https://pegd.pages.dev']
    let lastError = 'Order log failed'
    for (const base of bases) {
      try {
        const url = base ? `${base}/api/market/log-pending` : '/api/market/log-pending'
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok || data?.deduped) return data
        lastError = data?.error || lastError
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError
      }
    }
    throw new Error(lastError)
  }

  async function startPegdCheckout(opts) {
    ensureModal().classList.add('open')

    if (!hasRealPhantom()) {
      showOpenInPhantom(opts.listingId || null)
      return
    }

    setMsg('Connecting Phantom…', '')

    let buyer
    try {
      buyer = await ensurePhantom({ listingId: opts.listingId })
    } catch (err) {
      if (err instanceof Error && err.message === 'OPEN_IN_PHANTOM') return
      setMsg(err instanceof Error ? err.message : 'Phantom connect failed', 'err')
      return
    }

    let usd = opts.usd
    let title = opts.title || 'PEGD payment'
    if (opts.listingId && !usd) {
      try {
        const listing = await fetchListingUsd(opts.listingId)
        usd = listing.usd
        title = opts.title || listing.title
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Listing load failed', 'err')
        return
      }
    }

    if (!Number.isFinite(usd) || usd <= 0) {
      setMsg('Invalid price', 'err')
      return
    }

    let pegdUsd
    let pegdAmount
    try {
      pegdUsd = await fetchPegdUsd()
      pegdAmount = usd / pegdUsd
      if (!Number.isFinite(pegdAmount) || pegdAmount <= 0) throw new Error('Quote failed')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'PEGD quote failed', 'err')
      return
    }

    ensureModal().querySelector('#xrpeg-pay-title').textContent = title || 'Pay with PEGD'
    ensureModal().querySelector('#xrpeg-pay-sub').textContent =
      'Preferred rail — SPL transfer to XRPEGGED treasury in Phantom.'
    ensureModal().querySelector('#xrpeg-pay-usd').textContent = fmtUsd(usd)
    ensureModal().querySelector('#xrpeg-pay-token-label').textContent = 'PEGD (live quote)'
    ensureModal().querySelector('#xrpeg-pay-xrp').textContent = fmtPegd(pegdAmount)
    ensureModal().querySelector('#xrpeg-pay-dest').textContent = TREASURY

    const openBtn = ensureModal().querySelector('#xrpeg-pay-open')
    openBtn.onclick = () => startPegdCheckout(opts)

    setMsg('Checking SOL + PEGD balance…', '')
    try {
      await checkSolBalance(buyer)
      await checkPegdBalance(buyer, pegdAmount)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Balance check failed', 'err')
      return
    }

    setMsg(
      'Phantom may show a red “new site” warning — pegd.org is ours. Approve only if you see a PEGD transfer to treasury fWi4mx4b…',
      ''
    )
    try {
      const signature = await sendPegdPayment(buyer, pegdAmount)
      setMsg('Confirming on Solana…', '')
      await confirmSignature(signature)

      if (opts.listingId) {
        let logNote = ''
        try {
          await logPendingOrder({ listingId: opts.listingId, buyerAddress: buyer, signature })
        } catch (logErr) {
          logNote =
            ' Payment confirmed on-chain; order log delayed — still submit shipping. Tx: ' +
            signature.slice(0, 12) +
            '…'
        }
        showShippingForm({
          payloadUuid: signature,
          buyer,
          txHash: signature,
          listingId: opts.listingId,
          title: title || opts.title,
        })
        setMsg('Payment received. Submit shipping below.' + logNote, 'ok')
      } else {
        setMsg(`Payment sent. Tx: ${signature.slice(0, 12)}…`, 'ok')
      }
    } catch (err) {
      setMsg(mapPhantomError(err), 'err')
    }
  }

  window.XrpegCheckout = window.XrpegCheckout || {}
  window.XrpegCheckout.payListing = (listing) =>
    startPegdCheckout({
      listingId: listing.id,
      title: listing.title,
    })
  window.XrpegCheckout.payWithPegd = (opts) => startPegdCheckout(opts)
  window.XrpegCheckout.getBuyer = getBuyer
  window.XrpegCheckout.openInPhantom = (listingId) => showOpenInPhantom(listingId)
  window.XrpegCheckout.hasRealPhantom = hasRealPhantom
  window.XrpegCheckout.redirectToPhantom = (listingId) => openPhantomApp(listingId)

  function resumePayFromUrl() {
    const hash = window.location.hash || ''
    const match = hash.match(/[?&]pay=([a-f0-9-]+)/i)
    const listingId = match?.[1]
    if (!listingId) return

    const key = `xrpeg-pay-resumed-${listingId}`
    if (sessionStorage.getItem(key)) return

    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    let attempts = 0
    const tryResume = () => {
      if (hasRealPhantom()) {
        sessionStorage.setItem(key, '1')
        startPegdCheckout({ listingId })
        return
      }
      if (attempts++ < 40) {
        setTimeout(tryResume, 250)
      }
    }
    tryResume()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resumePayFromUrl)
  } else {
    resumePayFromUrl()
  }
})()