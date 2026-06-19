(() => {
  const CONFIG = {
    xrpTreasury: 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78',
    solTreasury: 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb',
    pegdMint: 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon',
    moonshotUrl: 'https://moon.it/token/BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon',
    marketApi: window.PEGD_MARKET_API
      || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : ''),
    marketPath: '/proof',
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
  const fmtUsd = (n) => '$' + fmt(n, n >= 1 ? 2 : 6);
  const fmtSupply = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return fmt(n, 0);
  };

  let prices = { XRP: null, SOL: null, PEGD: null, PROOF: null };

  async function xrplAccount(addr) {
    const res = await fetch('https://xrplcluster.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'account_info', params: [{ account: addr, ledger_index: 'current' }] }),
    });
    const data = await res.json();
    if (!data.result?.account_data) return null;
    return parseInt(data.result.account_data.Balance, 10) / 1_000_000;
  }

  const SOL_RPCS = [
    'https://rpc.ankr.com/solana',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://api.mainnet-beta.solana.com',
  ];

  async function solanaRpc(method, params) {
    for (const url of SOL_RPCS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const data = await res.json();
        if (data.result != null) return data.result;
      } catch { /* try next */ }
    }
    return null;
  }

  async function solTreasuryPegd() {
    const result = await solanaRpc('getTokenAccountsByOwner', [
      CONFIG.solTreasury,
      { mint: CONFIG.pegdMint },
      { encoding: 'jsonParsed' },
    ]);
    return (result?.value ?? []).reduce((sum, acct) => {
      return sum + (acct.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
    }, 0);
  }

  async function solBalance() {
    const result = await solanaRpc('getBalance', [CONFIG.solTreasury]);
    return (result?.value ?? 0) / 1e9;
  }

  async function fetchPrices() {
    try {
      const api = CONFIG.marketApi || '';
      const res = await fetch(`${api}/api/market/prices`);
      const data = await res.json();
      if (data?.pricesUsd) prices = { ...prices, ...data.pricesUsd };
    } catch {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple,solana&vs_currencies=usd');
      const data = await res.json();
      prices.XRP = data.ripple?.usd ?? prices.XRP;
      prices.SOL = data.solana?.usd ?? prices.SOL;
    }

    try {
      const dex = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CONFIG.pegdMint}`);
      const data = await dex.json();
      const p = data.pairs?.[0]?.priceUsd;
      if (p) prices.PEGD = parseFloat(p);
    } catch { /* moonshot may not be indexed yet */ }

    if (prices.PEGD != null) prices.PROOF = prices.PEGD;

    renderAssetBoard();
  }

  function renderAssetBoard() {
    const board = $('asset-board');
    if (!board) return;
    const rows = [
      { id: 'PEGD', label: 'PEGD', rail: 'Solana', link: CONFIG.moonshotUrl },
      { id: 'PROOF', label: 'PROOF', rail: 'XRPL (1:1 PEGD)' },
      { id: 'XRP', label: 'XRP', rail: 'XRPL' },
      { id: 'SOL', label: 'SOL', rail: 'Solana' },
    ];
    board.innerHTML = rows.map((row) => {
      const usd = prices[row.id];
      return `<div class="asset-card">
        <div class="asset-name">${row.label}</div>
        <div class="asset-usd">${usd != null ? fmtUsd(usd) : '…'}</div>
        <div class="asset-rail">${row.rail} rail</div>
        ${row.link ? `<a href="${row.link}" target="_blank" rel="noopener" class="asset-link">Trade on Moonshot →</a>` : ''}
      </div>`;
    }).join('');
  }

  function usdQuotes(usd) {
    if (usd == null) return '';
    return ['XRP', 'SOL', 'PEGD', 'PROOF'].map((asset) => {
      const p = prices[asset];
      if (!p) return `${asset}: —`;
      const amt = usd / p;
      const digits = asset === 'PEGD' || asset === 'PROOF' ? 0 : 6;
      return `${fmt(amt, digits)} ${asset}`;
    }).join(' · ');
  }

  function impliedPegdPrice(liquidUsd, totalSupply, treasuryPegd) {
    if (!liquidUsd || !totalSupply || totalSupply <= 0) return null;
    const circulating = Math.max(totalSupply - (treasuryPegd || 0), 1);
    return liquidUsd / circulating;
  }

  async function loadTreasury() {
    const [xrp, pegdTreasury, sol, supplyRes] = await Promise.all([
      xrplAccount(CONFIG.xrpTreasury),
      solTreasuryPegd(),
      solBalance(),
      solanaRpc('getTokenSupply', [CONFIG.pegdMint]),
    ]);

    const supply = supplyRes?.value?.uiAmount ?? null;
    const xrpUsd = xrp != null && prices.XRP ? xrp * prices.XRP : null;
    const solUsd = sol != null && prices.SOL ? sol * prices.SOL : null;
    const liquidUsd = [xrpUsd, solUsd].filter((v) => v != null).reduce((a, b) => a + b, 0);
    const implied = impliedPegdPrice(liquidUsd, supply, pegdTreasury);

    if ($('xrp-balance')) {
      $('xrp-balance').textContent = xrp != null
        ? fmt(xrp) + ' XRP' + (xrpUsd != null ? ` (${fmtUsd(xrpUsd)})` : '')
        : '—';
    }
    if ($('pegd-held')) {
      $('pegd-held').textContent = pegdTreasury != null && pegdTreasury > 0
        ? fmtSupply(pegdTreasury) + ' PEGD'
        : (pegdTreasury === 0 ? '0 PEGD' : '—');
    }
    if ($('sol-balance')) {
      $('sol-balance').textContent = sol != null
        ? fmt(sol, 4) + ' SOL' + (solUsd != null ? ` (${fmtUsd(solUsd)})` : '')
        : '—';
    }
    if (supply != null && $('stat-supply')) $('stat-supply').textContent = fmtSupply(supply);
    if (liquidUsd > 0) {
      if ($('treasury-usd')) $('treasury-usd').textContent = fmtUsd(liquidUsd);
      if ($('stat-treasury')) $('stat-treasury').textContent = fmtUsd(liquidUsd);
    }
    if ($('stat-pegd')) {
      $('stat-pegd').textContent = prices.PEGD != null ? fmtUsd(prices.PEGD) : (implied != null ? fmtUsd(implied) : '…');
    }
    if ($('stat-pegd-note')) {
      $('stat-pegd-note').textContent = prices.PEGD != null ? 'Market (Moonshot)' : (implied != null ? 'Implied backing' : 'Loading…');
    }
    if ($('stat-projected') && implied != null) {
      $('stat-projected').textContent = fmtUsd(implied);
    }
    if ($('projected-note') && implied != null && liquidUsd > 0) {
      $('projected-note').textContent =
        `Liquid reserves ${fmtUsd(liquidUsd)} ÷ ${fmtSupply(Math.max((supply || 0) - (pegdTreasury || 0), 1))} circulating PEGD`;
    }
    if (prices.XRP != null && $('stat-xrp')) $('stat-xrp').textContent = fmtUsd(prices.XRP);
  }

  async function loadMarket() {
    const grid = $('shop-grid');
    if (!grid) return;
    grid.innerHTML = '<p class="shop-loading">Loading market…</p>';
    try {
      const api = CONFIG.marketApi || '';
      const res = await fetch(`${api}/api/proof/listings?limit=12`);
      const data = await res.json();
      const listings = data.listings || [];
      if (!listings.length) {
        grid.innerHTML = `<div class="shop-card"><div class="shop-info"><h3>Market opening soon</h3><p>List Pokemon cards, collectibles, and merch priced in USD. Pay via XRP or Solana rails.</p><a href="${CONFIG.marketApi}${CONFIG.marketPath}" class="btn-shop">Open Market</a></div></div>`;
        return;
      }
      grid.innerHTML = listings.map((item) => {
        const code = (item.currency_code || 'USD').toUpperCase();
        const raw = Number(item.price_drops);
        let usd = null;
        if (code === 'USD') usd = raw / 100;
        else if (code === 'XRP') usd = prices.XRP ? (raw / 1e6) * prices.XRP : null;
        else if (prices[code]) usd = raw * prices[code];
        const img = item.media_uri
          ? `<img src="${item.media_uri}" alt="" class="shop-img-real">`
          : `<div class="shop-img">🛒</div>`;
        return `<div class="shop-card">${img}<div class="shop-info">
          <h3>${item.title}</h3>
          <p>${(item.description || '').slice(0, 90)}</p>
          <div class="shop-price">${usd != null ? fmtUsd(usd) : formatListingPrice(code, raw)}</div>
          <div class="shop-quote">${usd != null ? usdQuotes(usd) : ''}</div>
          <a href="${CONFIG.marketApi}${CONFIG.marketPath}" class="btn-shop">Buy in Market</a>
        </div></div>`;
      }).join('');
    } catch {
      grid.innerHTML = `<div class="shop-card"><div class="shop-info"><h3>XRP Market</h3><p>Start the market app locally or deploy it to sync live listings.</p><a href="${CONFIG.marketApi}${CONFIG.marketPath}" class="btn-shop">Open Market</a></div></div>`;
    }
  }

  function formatListingPrice(code, raw) {
    if (code === 'USD') return fmtUsd(raw / 100);
    if (code === 'XRP') return fmt(raw / 1e6, 6) + ' XRP';
    return fmt(raw, 6) + ' ' + code;
  }

  function initJupiter() {
    const target = $('jupiter-terminal');
    if (!target || !window.Jupiter) return;
    window.Jupiter.init({
      displayMode: 'integrated',
      integratedTargetId: 'jupiter-terminal',
      endpoint: 'https://api.mainnet-beta.solana.com',
      formProps: {
        initialOutputMint: CONFIG.pegdMint,
      },
    });
  }

  async function refresh() {
    await fetchPrices();
    await loadTreasury();
    await loadMarket();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('verify-btn')?.addEventListener('click', refresh);
    refresh();
    setInterval(fetchPrices, 60_000);
    const jup = document.createElement('script');
    jup.src = 'https://terminal.jup.ag/main-v2.js';
    jup.onload = initJupiter;
    document.head.appendChild(jup);
  });
})();