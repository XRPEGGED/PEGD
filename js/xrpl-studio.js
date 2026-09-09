(() => {
  const TREASURY = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
  const SESSION_KEY = 'pegd_xrpl_studio'
  const CLASSIC = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

  const TX_TYPES = [
    'Payment',
    'TrustSet',
    'AccountSet',
    'OfferCreate',
    'OfferCancel',
    'EscrowCreate',
    'EscrowFinish',
    'EscrowCancel',
    'NFTokenMint',
    'NFTokenBurn',
    'NFTokenCreateOffer',
    'NFTokenAcceptOffer',
    'NFTokenCancelOffer',
  ]

  const $ = (id) => document.getElementById(id)
  const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a || '')
  const dropsToXrp = (d) => (Number(d) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })
  const xrpToDrops = (x) => String(Math.round(Number(x) * 1e6))

  let state = { address: null, mode: null, balance: null }
  let pollTimer = null

  function saveSession() {
    try {
      if (state.address) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ address: state.address, mode: state.mode }))
      } else localStorage.removeItem(SESSION_KEY)
    } catch {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async function xrplRpc(method, params) {
    const res = await fetch('/api/xrpl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        method === 'fee'
          ? { method: 'fee', params: [{}] }
          : method === 'account_info' && params?.[0]?.account && !params[0].limit
            ? { method: 'account_info', account: params[0].account }
            : { method, params }
      ),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'XRPL request failed')
    if (data.error && !data.result) {
      throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'XRPL error')
    }
    return data
  }

  function setStatus(el, text, kind) {
    if (!el) return
    el.textContent = text || ''
    el.className = 'studio-status' + (kind ? ' ' + kind : '')
  }

  function showQr(url) {
    const img = $('xaman-qr')
    const wrap = $('xaman-qr-wrap')
    if (!img || !wrap) return
    if (url) {
      img.src = url
      wrap.classList.remove('hidden')
    } else {
      img.removeAttribute('src')
      wrap.classList.add('hidden')
    }
  }

  function updateConnectUi() {
    const badge = $('wallet-badge')
    const acct = $('account-panel')
    const connectBtn = $('btn-connect-xaman')
    const disconnectBtn = $('btn-disconnect')

    if (state.address) {
      if (badge) {
        badge.textContent = 'Xaman · ' + shortAddr(state.address)
        badge.classList.remove('hidden')
      }
      acct?.classList.remove('hidden')
      const addrEl = $('acct-address')
      if (addrEl) {
        addrEl.textContent = state.address
        addrEl.href = 'https://bithomp.com/explorer/' + state.address
      }
      const balEl = $('acct-balance')
      if (balEl) balEl.textContent = state.balance == null ? '…' : dropsToXrp(state.balance) + ' XRP'
      const modeEl = $('acct-mode')
      if (modeEl) modeEl.textContent = 'Connected via Xaman — keys stay in your wallet'
      connectBtn?.classList.add('hidden')
      disconnectBtn?.classList.remove('hidden')
      $('readonly-row')?.classList.add('hidden')
    } else {
      badge?.classList.add('hidden')
      if (badge) badge.textContent = ''
      acct?.classList.add('hidden')
      connectBtn?.classList.remove('hidden')
      disconnectBtn?.classList.add('hidden')
      $('readonly-row')?.classList.remove('hidden')
    }
  }

  async function refreshAccount(address) {
    const data = await xrplRpc('account_info', [{ account: address, ledger_index: 'validated' }])
    state.balance = data?.result?.account_data?.Balance ?? null
    updateConnectUi()
    return data?.result?.account_data || null
  }

  async function pollXumm(payloadId) {
    for (let i = 0; i < 90; i++) {
      const res = await fetch('/api/xumm/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Xaman poll failed')
      if (data.pending) {
        await new Promise((r) => {
          pollTimer = setTimeout(r, 2000)
        })
        continue
      }
      return data
    }
    throw new Error('Xaman timed out')
  }

  async function connectXaman() {
    setStatus($('connect-status'), 'Opening Xaman…', '')
    showQr(null)
    try {
      const res = await fetch('/api/xumm/auth', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503 || data?.error === 'Xumm not configured on host') {
        setStatus($('connect-status'), 'Xaman connect unavailable', 'err')
        $('xaman-unavailable')?.classList.remove('hidden')
        return
      }
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Xaman auth failed')

      if (data.qr) showQr(data.qr)
      if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')
      setStatus($('connect-status'), 'Approve SignIn in Xaman…', '')

      const result = await pollXumm(data.uuid)
      if (!result.signed || !result.account) throw new Error('Xaman sign-in cancelled')
      if (!CLASSIC.test(result.account)) throw new Error('Invalid account from Xaman')

      state.address = result.account
      state.mode = 'xaman'
      saveSession()
      showQr(null)
      await refreshAccount(state.address)
      setStatus($('connect-status'), 'Connected with Xaman.', 'ok')
      loadRecentTx()
    } catch (err) {
      showQr(null)
      setStatus($('connect-status'), err?.message || 'Xaman connect failed', 'err')
    }
  }

  function connectReadonly() {
    const address = ($('readonly-address')?.value || '').trim()
    if (!CLASSIC.test(address)) {
      setStatus($('connect-status'), 'Enter a valid classic address (r…)', 'err')
      return
    }
    state.address = address
    state.mode = 'readonly'
    saveSession()
    setStatus($('connect-status'), 'Read-only session set (signing still needs Xaman).', 'ok')
    refreshAccount(address).then(loadRecentTx).catch((e) => setStatus($('connect-status'), e.message, 'err'))
  }

  function disconnect() {
    if (pollTimer) clearTimeout(pollTimer)
    state = { address: null, mode: null, balance: null }
    saveSession()
    showQr(null)
    updateConnectUi()
    setStatus($('connect-status'), 'Disconnected.', '')
  }

  async function loadTreasury() {
    const balEl = $('treasury-balance')
    const txEl = $('treasury-tx')
    try {
      const info = await xrplRpc('account_info', [{ account: TREASURY, ledger_index: 'validated' }])
      const bal = info?.result?.account_data?.Balance
      if (balEl) balEl.textContent = bal != null ? dropsToXrp(bal) + ' XRP' : 'Unavailable'
    } catch {
      if (balEl) balEl.textContent = 'Unavailable'
    }
    try {
      const tx = await xrplRpc('account_tx', [
        { account: TREASURY, limit: 8, ledger_index_min: -1, ledger_index_max: -1 },
      ])
      const rows = tx?.result?.transactions || []
      if (!txEl) return
      if (!rows.length) {
        txEl.innerHTML = '<li class="muted">No recent transactions</li>'
        return
      }
      txEl.innerHTML = rows
        .map((row) => {
          const t = row.tx || row.tx_json || {}
          const hash = row.hash || t.hash || ''
          const type = t.TransactionType || 'Tx'
          const when = row.date ? new Date((row.date + 946684800) * 1000).toLocaleString() : ''
          const link = hash
            ? `<a href="https://bithomp.com/explorer/${hash}" target="_blank" rel="noopener">${shortAddr(hash)}</a>`
            : ''
          return `<li><span class="pill">${type}</span> ${link} <span class="muted">${when}</span></li>`
        })
        .join('')
    } catch {
      if (txEl) txEl.innerHTML = '<li class="muted">Recent payments unavailable</li>'
    }
  }

  async function loadRecentTx() {
    if (!state.address) return
    const el = $('acct-tx')
    if (!el) return
    try {
      const tx = await xrplRpc('account_tx', [
        { account: state.address, limit: 6, ledger_index_min: -1, ledger_index_max: -1 },
      ])
      const rows = tx?.result?.transactions || []
      el.innerHTML = rows.length
        ? rows
            .map((row) => {
              const t = row.tx || row.tx_json || {}
              const hash = row.hash || t.hash || ''
              return `<li><span class="pill">${t.TransactionType || 'Tx'}</span> ${
                hash
                  ? `<a href="https://bithomp.com/explorer/${hash}" target="_blank" rel="noopener">${shortAddr(hash)}</a>`
                  : ''
              }</li>`
            })
            .join('')
        : '<li class="muted">No recent transactions</li>'
    } catch {
      el.innerHTML = '<li class="muted">Could not load account history</li>'
    }
  }

  function showFieldsForType(type) {
    document.querySelectorAll('[data-tx-fields]').forEach((el) => {
      el.classList.toggle('hidden', el.getAttribute('data-tx-fields') !== type)
    })
  }

  function parseIssuedAmount(value, currency, issuer) {
    const v = (value || '').trim()
    if (!v || !currency || !issuer) return null
    return { currency: currency.trim(), issuer: issuer.trim(), value: v }
  }

  function buildFromForm() {
    const type = $('tx-type')?.value || 'Payment'
    if (!state.address) throw new Error('Connect with Xaman (or read-only address) first')
    const tx = { TransactionType: type, Account: state.address }

    const fee = ($('tx-fee')?.value || '').trim()
    if (fee) tx.Fee = /^\d+$/.test(fee) ? fee : xrpToDrops(fee)

    const memos = ($('tx-memo')?.value || '').trim()
    if (memos) {
      const hex = Array.from(new TextEncoder().encode(memos))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      tx.Memos = [{ Memo: { MemoData: hex } }]
    }

    if (type === 'Payment') {
      const dest = ($('pay-dest')?.value || '').trim()
      if (!CLASSIC.test(dest)) throw new Error('Valid Destination required')
      tx.Destination = dest
      const tag = ($('pay-tag')?.value || '').trim()
      if (tag !== '') tx.DestinationTag = Number(tag)
      const cur = ($('pay-currency')?.value || 'XRP').trim()
      const amt = ($('pay-amount')?.value || '').trim()
      if (!amt) throw new Error('Amount required')
      if (cur === 'XRP' || cur === '') tx.Amount = xrpToDrops(amt)
      else {
        const issued = parseIssuedAmount(amt, cur, ($('pay-issuer')?.value || '').trim())
        if (!issued) throw new Error('Issued Amount needs currency + issuer')
        tx.Amount = issued
      }
      const sendMax = ($('pay-sendmax')?.value || '').trim()
      if (sendMax) {
        const smCur = ($('pay-sendmax-currency')?.value || 'XRP').trim()
        if (smCur === 'XRP') tx.SendMax = xrpToDrops(sendMax)
        else tx.SendMax = parseIssuedAmount(sendMax, smCur, ($('pay-sendmax-issuer')?.value || '').trim())
      }
    }

    if (type === 'TrustSet') {
      const issued = parseIssuedAmount(
        ($('trust-limit')?.value || '0').trim(),
        ($('trust-currency')?.value || '').trim(),
        ($('trust-issuer')?.value || '').trim()
      )
      if (!issued) throw new Error('TrustSet needs LimitAmount currency + issuer')
      tx.LimitAmount = issued
      const flags = ($('trust-flags')?.value || '').trim()
      if (flags !== '') tx.Flags = Number(flags)
    }

    if (type === 'AccountSet') {
      const domain = ($('aset-domain')?.value || '').trim()
      if (domain) {
        tx.Domain = Array.from(new TextEncoder().encode(domain))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      }
      const email = ($('aset-email')?.value || '').trim()
      if (email) tx.EmailHash = email.replace(/^0x/i, '')
      const tf = ($('aset-setflag')?.value || '').trim()
      if (tf !== '') tx.SetFlag = Number(tf)
      const cf = ($('aset-clearflag')?.value || '').trim()
      if (cf !== '') tx.ClearFlag = Number(cf)
      const transfer = ($('aset-transferrate')?.value || '').trim()
      if (transfer !== '') tx.TransferRate = Number(transfer)
    }

    if (type === 'OfferCreate') {
      const getsAmt = ($('offer-gets')?.value || '').trim()
      const paysAmt = ($('offer-pays')?.value || '').trim()
      if (!getsAmt || !paysAmt) throw new Error('OfferCreate needs TakerGets and TakerPays')
      tx.TakerGets = $('offer-gets-xrp')?.checked
        ? xrpToDrops(getsAmt)
        : parseIssuedAmount(getsAmt, $('offer-gets-cur')?.value, $('offer-gets-iss')?.value)
      tx.TakerPays = $('offer-pays-xrp')?.checked
        ? xrpToDrops(paysAmt)
        : parseIssuedAmount(paysAmt, $('offer-pays-cur')?.value, $('offer-pays-iss')?.value)
      if (!tx.TakerGets || !tx.TakerPays) throw new Error('Invalid offer amounts')
      const flags = ($('offer-flags')?.value || '').trim()
      if (flags !== '') tx.Flags = Number(flags)
    }

    if (type === 'OfferCancel') {
      const seq = ($('offer-cancel-seq')?.value || '').trim()
      if (!seq) throw new Error('OfferSequence required')
      tx.OfferSequence = Number(seq)
    }

    if (type === 'EscrowCreate') {
      const dest = ($('esc-dest')?.value || '').trim()
      const amt = ($('esc-amount')?.value || '').trim()
      if (!CLASSIC.test(dest) || !amt) throw new Error('EscrowCreate needs Destination + Amount (XRP)')
      tx.Destination = dest
      tx.Amount = xrpToDrops(amt)
      const finish = ($('esc-finish')?.value || '').trim()
      const cancel = ($('esc-cancel')?.value || '').trim()
      if (finish) tx.FinishAfter = Number(finish)
      if (cancel) tx.CancelAfter = Number(cancel)
      const cond = ($('esc-condition')?.value || '').trim()
      if (cond) tx.Condition = cond
    }

    if (type === 'EscrowFinish') {
      const owner = ($('escf-owner')?.value || '').trim()
      const seq = ($('escf-seq')?.value || '').trim()
      if (!CLASSIC.test(owner) || !seq) throw new Error('Owner + OfferSequence required')
      tx.Owner = owner
      tx.OfferSequence = Number(seq)
      const fulf = ($('escf-fulfillment')?.value || '').trim()
      if (fulf) tx.Fulfillment = fulf
      const cond = ($('escf-condition')?.value || '').trim()
      if (cond) tx.Condition = cond
    }

    if (type === 'EscrowCancel') {
      const owner = ($('escc-owner')?.value || '').trim()
      const seq = ($('escc-seq')?.value || '').trim()
      if (!CLASSIC.test(owner) || !seq) throw new Error('Owner + OfferSequence required')
      tx.Owner = owner
      tx.OfferSequence = Number(seq)
    }

    if (type === 'NFTokenMint') {
      tx.NFTokenTaxon = Number(($('nft-taxon')?.value || '0').trim())
      const uri = ($('nft-uri')?.value || '').trim()
      if (uri) {
        tx.URI = Array.from(new TextEncoder().encode(uri))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      }
      const flags = ($('nft-flags')?.value || '').trim()
      if (flags !== '') tx.Flags = Number(flags)
      const transfer = ($('nft-transferfee')?.value || '').trim()
      if (transfer !== '') tx.TransferFee = Number(transfer)
      const issuer = ($('nft-issuer')?.value || '').trim()
      if (issuer) tx.Issuer = issuer
    }

    if (type === 'NFTokenBurn') {
      const id = ($('nft-burn-id')?.value || '').trim()
      if (!id) throw new Error('NFTokenID required')
      tx.NFTokenID = id
      const owner = ($('nft-burn-owner')?.value || '').trim()
      if (owner) tx.Owner = owner
    }

    if (type === 'NFTokenCreateOffer') {
      const id = ($('nft-co-id')?.value || '').trim()
      const amt = ($('nft-co-amount')?.value || '').trim()
      if (!id || amt === '') throw new Error('NFTokenID + Amount required')
      tx.NFTokenID = id
      const cur = ($('nft-co-currency')?.value || 'XRP').trim()
      tx.Amount = cur === 'XRP' ? xrpToDrops(amt) : parseIssuedAmount(amt, cur, $('nft-co-issuer')?.value)
      const dest = ($('nft-co-dest')?.value || '').trim()
      if (dest) tx.Destination = dest
      const owner = ($('nft-co-owner')?.value || '').trim()
      if (owner) tx.Owner = owner
      const flags = ($('nft-co-flags')?.value || '').trim()
      if (flags !== '') tx.Flags = Number(flags)
      const exp = ($('nft-co-exp')?.value || '').trim()
      if (exp) tx.Expiration = Number(exp)
    }

    if (type === 'NFTokenAcceptOffer') {
      const sell = ($('nft-ao-sell')?.value || '').trim()
      const buy = ($('nft-ao-buy')?.value || '').trim()
      if (!sell && !buy) throw new Error('Provide NFTokenSellOffer and/or NFTokenBuyOffer')
      if (sell) tx.NFTokenSellOffer = sell
      if (buy) tx.NFTokenBuyOffer = buy
      const broker = ($('nft-ao-broker')?.value || '').trim()
      if (broker) {
        const cur = ($('nft-ao-broker-cur')?.value || 'XRP').trim()
        tx.NFTokenBrokerFee =
          cur === 'XRP' ? xrpToDrops(broker) : parseIssuedAmount(broker, cur, $('nft-ao-broker-iss')?.value)
      }
    }

    if (type === 'NFTokenCancelOffer') {
      const ids = ($('nft-cancel-ids')?.value || '')
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (!ids.length) throw new Error('Provide one or more NFTokenOfferIDs')
      tx.NFTokenOffers = ids
    }

    return tx
  }

  function getPreviewTx() {
    if ($('mode-raw')?.checked) {
      let tx
      try {
        tx = JSON.parse($('raw-json')?.value || '')
      } catch {
        throw new Error('Raw JSON is invalid')
      }
      if (!tx || typeof tx !== 'object' || Array.isArray(tx)) throw new Error('tx must be an object')
      if (!tx.TransactionType) throw new Error('TransactionType required')
      if (!tx.Account && state.address) tx.Account = state.address
      return tx
    }
    return buildFromForm()
  }

  function refreshPreview() {
    const pre = $('tx-preview')
    try {
      const tx = getPreviewTx()
      if (pre) pre.textContent = JSON.stringify(tx, null, 2)
      setStatus($('builder-status'), '', '')
      return tx
    } catch (err) {
      if (pre) pre.textContent = '// ' + (err.message || 'Incomplete form')
      return null
    }
  }

  async function signWithXaman() {
    setStatus($('builder-status'), 'Building transaction…', '')
    showQr(null)
    let tx
    try {
      tx = getPreviewTx()
    } catch (err) {
      setStatus($('builder-status'), err.message, 'err')
      return
    }
    if (!state.address) {
      setStatus($('builder-status'), 'Connect with Xaman first', 'err')
      return
    }
    tx = { ...tx, Account: state.address }
    delete tx.SigningPubKey
    delete tx.TxnSignature
    delete tx.Sequence
    delete tx.LastLedgerSequence

    try {
      const res = await fetch('/api/xumm/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txjson: tx }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setStatus($('builder-status'), 'Xaman connect unavailable', 'err')
        $('xaman-unavailable')?.classList.remove('hidden')
        return
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Sign payload failed')

      if (data.qr) showQr(data.qr)
      if (data.deeplink) window.open(data.deeplink, '_blank', 'noopener')
      setStatus($('builder-status'), 'Approve in Xaman… Signing is irreversible once validated.', '')

      const result = await pollXumm(data.uuid)
      showQr(null)
      if (!result.signed) throw new Error('Signing cancelled in Xaman')

      const hash = result.txid || null
      if (hash) {
        $('result-hash').innerHTML = `<a href="https://bithomp.com/explorer/${hash}" target="_blank" rel="noopener">${hash}</a>`
        $('result-panel')?.classList.remove('hidden')
        setStatus($('builder-status'), 'Signed & submitted via Xaman.', 'ok')
      } else {
        setStatus($('builder-status'), 'Signed in Xaman (no hash returned yet — check wallet history).', 'ok')
      }
      refreshAccount(state.address)
      loadRecentTx()
    } catch (err) {
      showQr(null)
      setStatus($('builder-status'), err?.message || 'Sign failed', 'err')
    }
  }

  function exportJson() {
    try {
      const tx = getPreviewTx()
      $('raw-json').value = JSON.stringify(tx, null, 2)
      $('mode-raw').checked = true
      toggleMode()
      setStatus($('builder-status'), 'Exported to Raw JSON.', 'ok')
    } catch (err) {
      setStatus($('builder-status'), err.message, 'err')
    }
  }

  function toggleMode() {
    const raw = $('mode-raw')?.checked
    $('form-builder')?.classList.toggle('hidden', raw)
    $('raw-builder')?.classList.toggle('hidden', !raw)
    refreshPreview()
  }

  function wire() {
    const typeSel = $('tx-type')
    if (typeSel) {
      TX_TYPES.forEach((t) => {
        const opt = document.createElement('option')
        opt.value = t
        opt.textContent = t
        typeSel.appendChild(opt)
      })
      typeSel.addEventListener('change', () => {
        showFieldsForType(typeSel.value)
        refreshPreview()
      })
      showFieldsForType(typeSel.value)
    }

    $('btn-connect-xaman')?.addEventListener('click', connectXaman)
    $('btn-readonly')?.addEventListener('click', connectReadonly)
    $('btn-disconnect')?.addEventListener('click', disconnect)
    $('btn-refresh-acct')?.addEventListener('click', () => {
      if (state.address) refreshAccount(state.address).then(loadRecentTx)
    })
    $('btn-refresh-treasury')?.addEventListener('click', loadTreasury)
    $('mode-form')?.addEventListener('change', toggleMode)
    $('mode-raw')?.addEventListener('change', toggleMode)
    $('btn-preview')?.addEventListener('click', refreshPreview)
    $('btn-sign-xaman')?.addEventListener('click', signWithXaman)
    $('btn-export-json')?.addEventListener('click', exportJson)
    $('raw-json')?.addEventListener('input', refreshPreview)
    document.querySelectorAll('#form-builder input, #form-builder select, #form-builder textarea').forEach((el) => {
      el.addEventListener('input', refreshPreview)
      el.addEventListener('change', refreshPreview)
    })

    const cached = loadSession()
    if (cached?.address && CLASSIC.test(cached.address)) {
      state.address = cached.address
      state.mode = cached.mode === 'xaman' ? 'xaman' : 'readonly'
      updateConnectUi()
      refreshAccount(state.address).then(loadRecentTx).catch(() => {})
    } else updateConnectUi()

    loadTreasury()
    toggleMode()
    refreshPreview()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire)
  else wire()
})()
