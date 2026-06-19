(() => {
  const XRP_TREASURY = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
  const MIN_XRP = 1
  const MAX_XRP = 5000

  const fmtNum = (n, max = 6) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: max })

  function mount(root) {
    if (!root || root.dataset.mounted === '1') return
    root.dataset.mounted = '1'

    root.innerHTML = `
      <div class="xrp-pegd-swap">
        <h3>⚡ XRP → PEGD (onsite)</h3>
        <p class="xrp-pegd-sub">Cross-chain treasury swap — live USD quote. Not a DEX; not 1:1 redemption. PEGD lands in Phantom after XRP confirms.</p>
        <p class="xrp-pegd-hint">💡 Connect both wallets: <strong>Xaman</strong> (to send XRP) and <strong>Phantom</strong> (to receive PEGD)</p>
        <div class="xrp-pegd-wallets">
          <div><span class="lbl">✓ Xaman (send XRP)</span><code id="xps-xrpl">—</code></div>
          <div><span class="lbl">✓ Phantom (receive PEGD)</span><code id="xps-sol">—</code></div>
        </div>
        <label class="xrp-pegd-label">You send (XRP)</label>
        <input type="number" id="xps-xrp-in" min="${MIN_XRP}" step="0.1" placeholder="10" class="xrp-pegd-input">
        <label class="xrp-pegd-label">You receive (~PEGD at spot)</label>
        <output id="xps-pegd-out" class="xrp-pegd-output">—</output>
        <p class="xrp-pegd-note" id="xps-quote-note">Quote refreshes from live prices.</p>
        <div class="xrp-pegd-actions">
          <button type="button" class="xrp-pegd-btn xaman" id="xps-connect-xaman">Connect Xaman</button>
          <button type="button" class="xrp-pegd-btn phantom" id="xps-connect-phantom">Connect Phantom</button>
          <button type="button" class="xrp-pegd-btn primary" id="xps-swap-btn" disabled>Swap XRP → PEGD</button>
        </div>
        <img id="xps-qr" class="xrp-pegd-qr hidden" alt="Xaman QR" width="200" height="200">
        <p id="xps-msg" class="xrp-pegd-msg"></p>
        <p class="xrp-pegd-foot">Treasury: <code>${XRP_TREASURY}</code> · PROOF↔PEGD 1:1 on <a href="https://xrpegged-market.xrpegged.workers.dev/swap" target="_blank" rel="noopener">market swap</a></p>
      </div>`

    const xrplEl = root.querySelector('#xps-xrpl')
    const solEl = root.querySelector('#xps-sol')
    const xrpIn = root.querySelector('#xps-xrp-in')
    const pegdOut = root.querySelector('#xps-pegd-out')
    const quoteNote = root.querySelector('#xps-quote-note')
    const swapBtn = root.querySelector('#xps-swap-btn')
    const qr = root.querySelector('#xps-qr')
    const msg = root.querySelector('#xps-msg')

    let xrplAddr = null
    let solAddr = null
    let prices = { XRP: null, PEGD: null }

    function setMsg(text, kind) {
      msg.textContent = text || ''
      msg.className = 'xrp-pegd-msg' + (kind ? ` ${kind}` : '')
    }

    function updateReady() {
      const xrp = Number(xrpIn.value)
      const ok =
        xrplAddr &&
        solAddr &&
        Number.isFinite(xrp) &&
        xrp >= MIN_XRP &&
        xrp <= MAX_XRP &&
        prices.XRP > 0 &&
        prices.PEGD > 0
      swapBtn.disabled = !ok
    }

    function refreshQuote() {
      const xrp = Number(xrpIn.value)
      if (!Number.isFinite(xrp) || xrp <= 0 || !prices.XRP || !prices.PEGD) {
        pegdOut.textContent = '—'
        updateReady()
        return
      }
      const usd = xrp * prices.XRP
      const pegd = usd / prices.PEGD
      pegdOut.textContent = `~${fmtNum(pegd)} PEGD`
      quoteNote.textContent = `~$${fmtNum(usd, 2)} USD · XRP $${fmtNum(prices.XRP, 4)} · PEGD $${prices.PEGD < 0.01 ? prices.PEGD.toExponential(2) : fmtNum(prices.PEGD, 6)}`
      updateReady()
    }

    async function loadPrices() {
      try {
        const res = await fetch('/api/market/prices')
        const data = await res.json()
        prices.XRP = data?.pricesUsd?.XRP ?? null
        prices.PEGD = data?.pricesUsd?.PEGD ?? null
        refreshQuote()
      } catch {
        quoteNote.textContent = 'Price feed unavailable — retry shortly.'
      }
    }

    async function pollXumm(uuid) {
      for (let i = 0; i < 90; i++) {
        const res = await fetch('/api/xumm/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payloadId: uuid }),
        })
        const data = await res.json().catch(() => ({}))
        if (data?.signed && data?.account) return data.account
        if (data?.cancelled) throw new Error('Xaman sign-in cancelled')
        await new Promise((r) => setTimeout(r, 2000))
      }
      throw new Error('Xaman timed out')
    }

    root.querySelector('#xps-connect-xaman').addEventListener('click', async () => {
      setMsg('Opening Xaman…', '')
      qr.classList.add('hidden')
      try {
        const res = await fetch('/api/xumm/auth', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || 'Xaman auth failed')
        if (data.qr) {
          qr.src = data.qr
          qr.classList.remove('hidden')
        }
        setMsg('Scan QR or approve in Xaman…', '')
        const account = await pollXumm(data.uuid)
        xrplAddr = account
        xrplEl.textContent = account
        setMsg('Xaman connected.', 'ok')
        qr.classList.add('hidden')
        updateReady()
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Xaman failed', 'err')
      }
    })

    root.querySelector('#xps-connect-phantom').addEventListener('click', async () => {
      setMsg('Connecting Phantom…', '')
      try {
        const provider = window.solana
        if (!provider?.isPhantom) {
          window.open('https://phantom.app/', '_blank', 'noopener')
          throw new Error('Install Phantom first')
        }
        const { publicKey } = await provider.connect()
        solAddr = publicKey.toString()
        solEl.textContent = solAddr
        setMsg('Phantom connected.', 'ok')
        updateReady()
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Phantom failed', 'err')
      }
    })

    xrpIn.addEventListener('input', refreshQuote)

    swapBtn.addEventListener('click', async () => {
      const xrpAmount = Number(xrpIn.value)
      const pegdEstimate = (xrpAmount * prices.XRP) / prices.PEGD
      setMsg('Creating Xaman payment…', '')
      qr.classList.add('hidden')
      swapBtn.disabled = true
      try {
        const res = await fetch('/api/market/xrp-pegd-swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerAddress: xrplAddr,
            phantomAddress: solAddr,
            xrpAmount,
            pegdEstimate,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data?.success) throw new Error(data?.error || 'Swap payload failed')
        if (data.qr) {
          qr.src = data.qr
          qr.classList.remove('hidden')
        }
        if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')
        setMsg(
          `Approve ~${fmtNum(xrpAmount, 4)} XRP to treasury. PEGD (~${fmtNum(pegdEstimate)}) will be sent to your Phantom after confirmation. Email xrpegged@proton.me with tx hash if delayed.`,
          'ok'
        )
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Swap failed', 'err')
      } finally {
        updateReady()
      }
    })

    loadPrices()
    setInterval(loadPrices, 60_000)
  }

  document.addEventListener('DOMContentLoaded', () => {
    mount(document.getElementById('xrp-pegd-swap-root'))
  })

  window.XrpegXrpPegdSwap = { mount }
})()