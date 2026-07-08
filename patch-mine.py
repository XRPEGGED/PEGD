#!/usr/bin/env python3
"""
patch-mine.py  —  patches mine.html to replace the placeholder hash
with a real VerusHash 2.2 WASM call.

Called by build-verus-wasm.sh, or manually:
  python3 patch-mine.py mine.html
"""
import sys, re

path = sys.argv[1] if len(sys.argv) > 1 else "mine.html"
with open(path, encoding="utf-8") as f:
    html = f.read()

changed = False

# ── Patch 1: WASM_URL constant ───────────────────────────────────────────────
OLD_COIN = "const MINE_COIN     = 'VRSC'  // VerusCoin — CPU-optimized, phones compete with GPUs"
NEW_COIN = (
    "const MINE_COIN     = 'VRSC'  // VerusCoin — CPU-optimized, phones compete with GPUs\n"
    "const WASM_URL      = window.location.origin + '/verus_hash.js'"
)
if "WASM_URL" not in html:
    if OLD_COIN in html:
        html = html.replace(OLD_COIN, NEW_COIN)
        print("  ✓ Added WASM_URL constant")
        changed = True
    else:
        print("  ✗ Could not find MINE_COIN line — add WASM_URL manually near line 687")
else:
    print("  ⏭  WASM_URL already present")

# ── Patch 2: wasmUrl binding before workerCode ───────────────────────────────
OLD_CODE_START = "  const workerCode = `"
NEW_CODE_START = "  const wasmUrl = WASM_URL\n  const workerCode = `"
if "const wasmUrl = WASM_URL" not in html:
    if OLD_CODE_START in html:
        html = html.replace(OLD_CODE_START, NEW_CODE_START)
        print("  ✓ Added wasmUrl binding")
        changed = True
    else:
        print("  ✗ Could not find 'const workerCode' line")
else:
    print("  ⏭  wasmUrl already present")

# ── Patch 3: WASM init block at top of worker code ───────────────────────────
OLD_WORKER_HEADER = (
    "// ── Stratum miner over WebSocket proxy ───────────────────────────────────────\n"
    "// Connects browser → pegd-compute WS proxy → Unmineable TCP stratum\n"
    "// Implements JSON-RPC stratum protocol (login → job → mine → submit)\n"
    "\n"
    "let ws, running = true, currentJob = null"
)
NEW_WORKER_HEADER = (
    "// ── VerusHash 2.2 WASM ───────────────────────────────────────────────────────\n"
    "importScripts('${wasmUrl}')\n"
    "let WASM = null\n"
    "VerusHashModule().then(m => {\n"
    "  WASM = m\n"
    "  postMessage({ type: 'log', msg: 'VerusHash 2.2 WASM ready', cls: 'ok' })\n"
    "}).catch(e => {\n"
    "  postMessage({ type: 'log', msg: 'WASM load failed: ' + e.message, cls: 'err' })\n"
    "})\n"
    "\n"
    "// ── Stratum miner over WebSocket proxy ───────────────────────────────────────\n"
    "// Connects browser → pegd-compute WS proxy → Unmineable TCP stratum\n"
    "// Implements JSON-RPC stratum protocol (login → job → mine → submit)\n"
    "\n"
    "let ws, running = true, currentJob = null"
)
if "importScripts" not in html:
    if OLD_WORKER_HEADER in html:
        html = html.replace(OLD_WORKER_HEADER, NEW_WORKER_HEADER)
        print("  ✓ Added WASM init block")
        changed = True
    else:
        print("  ✗ Could not find worker header comment block")
else:
    print("  ⏭  importScripts already present")

# ── Patch 4: Replace mineJob() ───────────────────────────────────────────────
# Match from the section comment through the closing brace of the function.
# We use a pattern that captures the whole mineJob block.
MINE_FN_PATTERN = re.compile(
    r"// ── Simple mining loop.*?^}(?=\n\n// ── WebSocket)",
    re.DOTALL | re.MULTILINE
)

NEW_MINE_FN = """\
// ── Mining loop — VerusHash 2.2 via WASM ────────────────────────────────────
// Each "thread" is a separate setTimeout loop with its own nonce range and
// its own malloc'd WASM buffers. Parallelism comes from the caller spawning
// multiple Workers; threads here adds interleaved loops within one Worker.
function mineJob(job) {
  if (!WASM) { setTimeout(() => mineJob(job), 200); return }

  const blobBytes = new Uint8Array(job.blob.match(/.{2}/g).map(h => parseInt(h, 16)))

  // VerusCoin target: full 256-bit little-endian comparison.
  // Pool sends compact target; pad to 64 hex chars (32 bytes big-endian).
  const target = BigInt('0x' + job.target.padStart(64, '0'))

  for (let t = 0; t < ${threads}; t++) {
    // Each thread starts in a different 16M nonce region to avoid duplicates
    let nonce     = (Math.floor(Math.random() * 0xFFFFFFFF) + t * 0x1000000) >>> 0
    const blobPtr = WASM._malloc(blobBytes.length)
    const outPtr  = WASM._malloc(32)
    WASM.HEAPU8.set(blobBytes, blobPtr)

    const tick = () => {
      if (!running || !currentJob || currentJob.job_id !== job.job_id) {
        WASM._free(blobPtr)
        WASM._free(outPtr)
        return
      }

      for (let i = 0; i < 100; i++) {
        nonce = (nonce + 1) >>> 0
        totalHash++

        // Real VerusHash 2.2 — nonce injected inside the WASM wrapper at offset 108
        WASM._verus_hash(blobPtr, blobBytes.length, nonce, outPtr)

        // VRSC compares hash as little-endian uint256: reverse bytes for BigInt
        const h = WASM.HEAPU8.subarray(outPtr, outPtr + 32)
        let hexBE = ''
        for (let j = 31; j >= 0; j--) hexBE += h[j].toString(16).padStart(2, '0')

        if (BigInt('0x' + hexBE) <= target) {
          const resultHex = Array.from(h).map(b => b.toString(16).padStart(2, '0')).join('')
          submitShare(job.job_id, nonce.toString(16).padStart(8, '0'), resultHex)
        }
      }

      if (totalHash % 2000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        postMessage({ type: 'hashrate', hs: Math.round(totalHash / elapsed) })
      }

      setTimeout(tick, 0)
    }

    setTimeout(tick, t * 10)
  }
}"""

if "WASM._verus_hash" not in html:
    m = MINE_FN_PATTERN.search(html)
    if m:
        html = html[:m.start()] + NEW_MINE_FN + html[m.end():]
        print("  ✓ Replaced mineJob() with WASM version")
        changed = True
    else:
        print("  ✗ Could not find mineJob() block via regex")
        print("    Replace it manually — see the NEW_MINE_FN string in this script")
else:
    print("  ⏭  mineJob() already uses WASM")

# ── Write output ─────────────────────────────────────────────────────────────
if changed:
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n  ✓ Wrote {path}")
else:
    print("\n  ℹ  No changes needed — mine.html already patched")
