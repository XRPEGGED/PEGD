(() => {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  function renderList(container, list, items, canMove) {
    if (!container) return
    container.innerHTML = items
      .map((item, idx) => {
        const label = list === 'sprint' ? item.text : `<strong>${esc(item.id)}</strong> ${esc(item.task)}${item.owner ? ' · ' + esc(item.owner) : ''}`
        const controls = canMove
          ? `<span class="dir-controls">
              <button type="button" class="dir-btn" data-list="${list}" data-key="${esc(item.key)}" data-dir="up" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button type="button" class="dir-btn" data-list="${list}" data-key="${esc(item.key)}" data-dir="down" ${idx === items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </span>`
          : ''
        return `<li class="dir-item" data-key="${esc(item.key)}">${controls}<span class="dir-label">${label}</span></li>`
      })
      .join('')
  }

  async function load(root) {
    const res = await fetch('/api/portal/directives', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) {
      renderList(root.querySelector('[data-directives-sprint]'), 'sprint', [], false)
      renderList(root.querySelector('[data-directives-backlog]'), 'backlog', [], false)
      const meta = root.querySelector('[data-directives-meta]')
      if (meta) meta.textContent = 'Directives are holder-gated — sign in to view or move'
      root.dataset.canMove = '0'
      return data
    }
    if (!data.success) throw new Error(data.error || 'Failed to load directives')
    const session = window.XrpegPortal?.getSession?.()
    const canMove = Boolean(session && (session.role === 'holder' || session.role === 'chairman'))
    renderList(root.querySelector('[data-directives-sprint]'), 'sprint', data.sprint || [], canMove)
    renderList(root.querySelector('[data-directives-backlog]'), 'backlog', data.backlog || [], canMove)
    const meta = root.querySelector('[data-directives-meta]')
    if (meta) {
      const parts = []
      if (data.meta?.updatedAt) {
        parts.push('Last moved ' + new Date(data.meta.updatedAt).toLocaleString())
      }
      if (data.meta?.minPegdLabel) parts.push(`Bar: ${data.meta.minPegdLabel} (treasury parity)`)
      if (canMove) parts.push('You can reprioritize — Chairman ratifies treasury')
      else parts.push('Sign in with Phantom at or above the treasury PEGD bar to move items')
      meta.textContent = parts.join(' · ')
    }
    root.dataset.canMove = canMove ? '1' : '0'
    return data
  }

  async function move(root, list, key, direction) {
    const res = await fetch('/api/portal/directives', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, key, direction }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Move failed')
    }
    const canMove = root.dataset.canMove === '1'
    renderList(root.querySelector('[data-directives-sprint]'), 'sprint', data.sprint || [], canMove)
    renderList(root.querySelector('[data-directives-backlog]'), 'backlog', data.backlog || [], canMove)
    const meta = root.querySelector('[data-directives-meta]')
    if (meta && data.meta?.updatedAt) {
      meta.textContent = 'Last moved ' + new Date(data.meta.updatedAt).toLocaleString() + ' · You can reprioritize — Chairman ratifies treasury'
    }
  }

  function bind(root) {
    if (!root || root.dataset.bound) return
    root.dataset.bound = '1'
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.dir-btn')
      if (!btn || root.dataset.canMove !== '1') return
      btn.disabled = true
      try {
        await move(root, btn.dataset.list, btn.dataset.key, btn.dataset.dir)
      } catch (err) {
        const meta = root.querySelector('[data-directives-meta]')
        if (meta) meta.textContent = err instanceof Error ? err.message : 'Move failed'
      } finally {
        btn.disabled = false
        load(root).catch(() => {})
      }
    })
    window.addEventListener('xrpeg-portal-auth', () => load(root).catch(() => {}))
    window.addEventListener('xrpeg-portal-logout', () => load(root).catch(() => {}))
  }

  window.XrpegDirectives = {
    mount(root) {
      if (!root) return
      bind(root)
      return load(root)
    },
    async signInHolder() {
      const provider = window.solana
      if (!provider?.isPhantom) {
        window.open('https://phantom.app/', '_blank', 'noopener')
        throw new Error('Install Phantom to sign in as PEGD holder')
      }
      const { publicKey } = await provider.connect()
      const address = publicKey.toString()
      const ch = await fetch('/api/portal/challenge')
      const { timestamp, nonce } = await ch.json()
      const message = `XRPEGGED portal\nAddress: ${address}\nTime: ${timestamp}\nNonce: ${nonce}`
      const encoded = new TextEncoder().encode(message)
      const { signature } = await provider.signMessage(encoded, 'utf8')
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      const res = await fetch('/api/portal/verify-holder-phantom', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature: sigB64 }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Holder sign-in failed')
      }
      if (window.XrpegPortal?.checkSession) {
        await window.XrpegPortal.checkSession()
      } else {
        window.dispatchEvent(new CustomEvent('xrpeg-portal-auth', { detail: { rail: 'solana', address, role: 'holder' } }))
      }
      return data
    },
  }
})()