(() => {
  const params = new URLSearchParams(window.location.search)
  const wallet = (params.get('wallet') || '').trim()
  const tx = (params.get('tx') || '').trim()
  const isNew = params.get('new') === '1'
  const titleParam = (params.get('title') || '').trim()
  const listingId = (params.get('listing') || '').trim()
  const proof = (params.get('proof') || '').trim()
  const repeat = params.get('repeat') === '1'

  const $ = (id) => document.getElementById(id)

  const STEPS = [
    { key: 'paid', label: 'Payment confirmed', hint: 'PEGD received at treasury' },
    { key: 'shipping_submitted', label: 'Shipping secured', hint: 'Encrypted address on file' },
    { key: 'shipped', label: 'Shipped', hint: 'Carrier has your package' },
    { key: 'delivered', label: 'Delivered', hint: 'Fulfillment complete' },
  ]

  const ORDER = ['awaiting_payment', 'paid', 'shipping_submitted', 'shipped', 'delivered', 'cancelled']

  function stepIndex(status) {
    const idx = ORDER.indexOf(status || 'awaiting_payment')
    return idx < 0 ? 0 : idx
  }

  function statusHeadline(status) {
    const map = {
      awaiting_payment: 'Awaiting payment',
      paid: 'Paid — add shipping',
      shipping_submitted: 'Preparing shipment',
      shipped: 'On the way',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    }
    return map[status] || 'Processing'
  }

  function pillClass(status) {
    if (status === 'shipped' || status === 'delivered') return 'pill-ok'
    if (status === 'shipping_submitted' || status === 'paid') return 'pill-warn'
    return 'pill-muted'
  }

  function trackingUrl(num) {
    if (!num) return null
    const t = num.trim()
    if (/^1Z/i.test(t)) {
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`
    }
    if (/^94\d{18,22}$/.test(t) || /^\d{20,22}$/.test(t)) {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`
    }
    if (/^\d{12,15}$/.test(t)) {
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${t} package tracking`)}`
  }

  function shortWallet(w) {
    if (!w || w.length < 12) return w || '—'
    return `${w.slice(0, 4)}…${w.slice(-4)}`
  }

  function shortTx(h) {
    if (!h || h.length < 16) return h || '—'
    return `${h.slice(0, 8)}…${h.slice(-8)}`
  }

  function showCongrats() {
    if (!isNew) return
    $('congrats-banner')?.classList.remove('hidden')
    if (repeat) {
      $('congrats-lead').textContent =
        'Shipping was already on file — your order is still secured. Track updates below.'
    }
    if (proof) {
      const note = document.createElement('p')
      note.className = 'footnote'
      note.style.marginTop = '12px'
      note.textContent = `Reference ${proof.slice(0, 16)}… — include in support emails if needed.`
      $('congrats-banner')?.appendChild(note)
    }
  }

  function showError(msg) {
    $('state-loading').classList.add('hidden')
    $('state-order').classList.add('hidden')
    $('state-error').classList.remove('hidden')
    $('error-msg').textContent = msg
  }

  function renderTimeline(current) {
    const cur = stepIndex(current)
    const cancelled = current === 'cancelled'
    const html = STEPS.map((step, i) => {
      const stepIdx = stepIndex(step.key)
      let dotClass = 'step-dot'
      if (cancelled) dotClass += ''
      else if (stepIdx < cur) dotClass += ' done'
      else if (stepIdx === cur) dotClass += ' active'
      const icon = stepIdx < cur && !cancelled ? '✓' : String(i + 1)
      return `<li>
        <div class="${dotClass}">${icon}</div>
        <div class="step-body">
          <strong>${step.label}</strong>
          <span>${step.hint}</span>
        </div>
      </li>`
    }).join('')
    $('timeline').innerHTML = html
  }

  function renderOrder(data) {
    $('state-loading').classList.add('hidden')
    $('state-error').classList.add('hidden')
    $('state-order').classList.remove('hidden')

    const status = data.fulfillmentStatus || 'shipping_submitted'
    const displayTitle = data.listingTitle || titleParam || 'Proof of Worth order'
    $('listing-title').textContent = displayTitle
    $('order-meta').textContent = `Order ${shortTx(data.orderId || tx)} · Wallet ${shortWallet(wallet)}`
    const pill = $('status-pill')
    pill.textContent = statusHeadline(status)
    pill.className = `pill ${pillClass(status)}`

    renderTimeline(status)

    const tracking = (data.trackingNumber || '').trim()
    const trackCard = $('tracking-card')
    if (tracking) {
      trackCard.classList.remove('hidden')
      $('tracking-num').textContent = tracking
      const url = trackingUrl(tracking)
      const link = $('track-link')
      link.href = url
      let label = 'Track package'
      try {
        if (/tools\.usps/i.test(new URL(url).hostname)) label = 'Track on USPS'
      } catch {
        /* ignore */
      }
      link.textContent = label
    } else {
      trackCard.classList.add('hidden')
    }

    // NFT proof removed - no longer issuing NFTs after fulfillment
  }

  async function fetchListingTitle() {
    if (!listingId || titleParam) return titleParam
    const bases = ['', 'https://pegd.pages.dev']
    for (const base of bases) {
      try {
        const res = await fetch(base ? `${base}/api/market/listings` : '/api/market/listings')
        const data = await res.json()
        const item = (data.listings || []).find((l) => l.id === listingId)
        if (item?.title) return item.title
        break
      } catch {
        /* try fallback */
      }
    }
    return titleParam
  }

  async function fetchStatus() {
    if (!wallet || !tx) {
      showError('Missing wallet or payment transaction in the link. Use the URL from your checkout confirmation.')
      return
    }
    $('state-loading').classList.remove('hidden')
    $('state-error').classList.add('hidden')

    const bases = ['', 'https://pegd.pages.dev']
    let lastErr = 'Order not found'
    for (const base of bases) {
      try {
        const path = `/api/market/order-status?wallet=${encodeURIComponent(wallet)}&tx=${encodeURIComponent(tx)}`
        const res = await fetch(base ? `${base}${path}` : path)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) {
          lastErr = data.error || lastErr
          continue
        }
        if (!data.listingTitle && titleParam) data.listingTitle = titleParam
        renderOrder(data)
        return
      } catch {
        /* try fallback */
      }
    }

    if (isNew && (titleParam || listingId)) {
      const title = await fetchListingTitle()
      renderOrder({
        listingTitle: title,
        fulfillmentStatus: 'shipping_submitted',
        orderId: tx,
      })
      return
    }

    showError(lastErr)
  }

  $('refresh-btn')?.addEventListener('click', () => {
    $('state-order').classList.add('hidden')
    fetchStatus()
  })

  $('copy-link')?.addEventListener('click', async () => {
    const link = new URL(window.location.href)
    link.searchParams.delete('new')
    link.searchParams.delete('title')
    link.searchParams.delete('listing')
    link.searchParams.delete('proof')
    link.searchParams.delete('repeat')
    try {
      await navigator.clipboard.writeText(link.toString())
      $('copy-link').textContent = 'Copied!'
      setTimeout(() => { $('copy-link').textContent = 'Copy status link' }, 2000)
    } catch {
      /* ignore */
    }
  })

  $('copy-track')?.addEventListener('click', async () => {
    const num = $('tracking-num')?.textContent
    if (!num) return
    try {
      await navigator.clipboard.writeText(num)
      $('copy-track').textContent = 'Copied!'
      setTimeout(() => { $('copy-track').textContent = 'Copy tracking' }, 2000)
    } catch {
      /* ignore */
    }
  })

  showCongrats()
  fetchStatus()
})()