#!/usr/bin/env bash
# build-verus-wasm.sh
# Compiles VerusHash 2.2 to WASM and patches mine.html.
# Run once: bash build-verus-wasm.sh
# Requires: git, python3. Emscripten will be installed automatically if missing.
set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="/tmp/vrsc-wasm-build"
EMSDK_DIR="$HOME/emsdk"
OUT_JS="$SITE_DIR/verus_hash.js"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  VerusHash 2.2 WASM Builder for PEGD     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Emscripten ─────────────────────────────────────────────────────────────
if ! command -v emcc &>/dev/null; then
  echo "[1/5] Emscripten not found — installing..."
  if [ ! -d "$EMSDK_DIR" ]; then
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
  fi
  cd "$EMSDK_DIR"
  ./emsdk install latest
  ./emsdk activate latest
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh"
  cd "$SITE_DIR"
else
  echo "[1/5] Emscripten: $(emcc --version 2>&1 | head -1)"
fi

# Re-source in case this is a fresh shell after install
if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh"
fi

# ── 2. Clone verushash-node source ────────────────────────────────────────────
echo "[2/5] Cloning VerusCoin/verushash-node..."
cd "$SITE_DIR"   # leave BUILD_DIR before wiping it
if [ -d "$BUILD_DIR/vrsc/crypto" ]; then
  echo "      Using existing clone at $BUILD_DIR/vrsc"
else
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  git clone --depth=1 https://github.com/VerusCoin/verushash-node.git "$BUILD_DIR/vrsc"
fi
cd "$BUILD_DIR/vrsc"

# ── 3. Write C++ WASM wrapper ─────────────────────────────────────────────────
echo "[3/5] Writing verus_wasm_wrap.cpp..."
cat > verus_wasm_wrap.cpp << 'CPPEOF'
/*
 * verus_wasm_wrap.cpp — Emscripten export for VerusHash 2.2 (WASM)
 *
 * Mirrors exactly what verushash-node's verusHashV2b2 does in Node.js:
 *   CVerusHashV2::init()
 *   CVerusHashV2 vh(SOLUTION_VERUSHHASH_V2_2)
 *   vh.Write(blob, len)
 *   vh.Finalize2b(out32)
 *
 * haraka.c and verus_clhash.cpp (AES-NI / CLMUL) are NOT compiled for WASM.
 * IsCPUVerusOptimized() always returns false via our cpuid.h stub, so only the
 * _port variants are ever called. The hardware-path stubs below satisfy the
 * linker for the dead code branches in the if(IsCPUVerusOptimized()) blocks.
 */
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <emscripten.h>
#include "verus_hash.h"   // CVerusHashV2, SOLUTION_VERUSHHASH_V2_2

// ── Globals owned by verus_clhash.cpp (not compiled) ────────────────────────
int __cpuverusoptimized = 0x80;  // 0x80 = unchecked; CPUID stub returns 0 → false

// Thread-local key storage used by verusclhasher constructor.
// Defined in verus_clhash.cpp (excluded), so we provide them here.
thread_local thread_specific_ptr verusclhasher_key;
thread_local thread_specific_ptr verusclhasher_descr;

// Aligned allocation used by verusclhasher constructor.
extern "C" void *alloc_aligned_buffer(uint64_t bufSize)
{
    void *p = NULL;
    posix_memalign(&p, sizeof(__m128i) * 2, bufSize);
    return p;
}

// ── Dead-code stubs: hardware path from haraka.c (not compiled) ──────────────
extern "C" {
    void load_constants()                                                    {}
    void haraka512_zero(unsigned char*, const unsigned char*)                {}
    void haraka512    (unsigned char*, const unsigned char*)                 {}
    void haraka512_keyed(unsigned char*, const unsigned char*,
                         const __m128i*)                                     {}
    void haraka256    (unsigned char*, const unsigned char*)                 {}
}

// ── Dead-code stubs: hardware path from verus_clhash.cpp (not compiled) ──────
uint64_t verusclhash(void*, const unsigned char*, uint64_t, __m128i**)          { return 0; }
uint64_t verusclhash_sv2_1(void*, const unsigned char*, uint64_t, __m128i**)    { return 0; }
uint64_t verusclhash_sv2_2(void*, const unsigned char*, uint64_t, __m128i**)    { return 0; }
__m128i __verusclmulwithoutreduction64alignedrepeat(
    __m128i*, const __m128i*, uint64_t, __m128i**) { return _mm_setzero_si128(); }
__m128i __verusclmulwithoutreduction64alignedrepeat_sv2_1(
    __m128i*, const __m128i*, uint64_t, __m128i**) { return _mm_setzero_si128(); }
__m128i __verusclmulwithoutreduction64alignedrepeat_sv2_2(
    __m128i*, const __m128i*, uint64_t, __m128i**) { return _mm_setzero_si128(); }

// ── Module singleton ─────────────────────────────────────────────────────────
static CVerusHashV2* vh2b2 = nullptr;

static void ensure_init()
{
    if (!vh2b2) {
        CVerusHash::init();
        CVerusHashV2::init();
        vh2b2 = new CVerusHashV2(SOLUTION_VERUSHHASH_V2_2);
    }
}

// ── Exported hash function ────────────────────────────────────────────────────
extern "C" {

/*
 * verus_hash — compute VerusHash 2.2 of a VRSC stratum blob.
 *
 * blob     full stratum blob (header 140 B + solution variable B)
 * blob_len byte length of blob
 * nonce    32-bit nonce, injected little-endian at byte offset 108
 * out32    caller-allocated 32-byte output buffer
 */
EMSCRIPTEN_KEEPALIVE
void verus_hash(const uint8_t* blob, uint32_t blob_len,
                uint32_t nonce, uint8_t* out32)
{
    if (blob_len < 140) { memset(out32, 0, 32); return; }

    uint8_t* buf = (uint8_t*)malloc(blob_len);
    if (!buf)           { memset(out32, 0, 32); return; }
    memcpy(buf, blob, blob_len);

    buf[108] = (nonce)       & 0xFF;
    buf[109] = (nonce >>  8) & 0xFF;
    buf[110] = (nonce >> 16) & 0xFF;
    buf[111] = (nonce >> 24) & 0xFF;

    ensure_init();
    vh2b2->Reset();
    vh2b2->Write(buf, blob_len);
    vh2b2->Finalize2b(out32);

    free(buf);
}

} // extern "C"
CPPEOF

# ── 4. Compile with Emscripten ────────────────────────────────────────────────
echo "[4/5] Compiling (takes 2–5 minutes on first run)..."

# ── 4a. Create stub headers ───────────────────────────────────────────────────
# verus_clhash.h unconditionally includes <cpuid.h> and <x86intrin.h>.
# haraka_portable.h includes "immintrin.h".
# These stubs (placed first in -I path) replace the x86-only system headers.
mkdir -p "$BUILD_DIR/stubs"

cat > "$BUILD_DIR/stubs/cpuid.h" << 'STUB'
/* WASM stub: CPUID unavailable. __get_cpuid returns 0 → no HW features
   → IsCPUVerusOptimized() returns false → portable code path always used. */
#pragma once
static inline int __get_cpuid(unsigned int l,
    unsigned int *a, unsigned int *b,
    unsigned int *c, unsigned int *d)
{ *a = *b = *c = *d = 0; return 0; }
static inline int __get_cpuid_count(unsigned int l, unsigned int s,
    unsigned int *a, unsigned int *b,
    unsigned int *c, unsigned int *d)
{ *a = *b = *c = *d = 0; return 0; }
#define bit_AES    0x02000000u
#define bit_PCLMUL 0x00000002u
#define bit_AVX    0x10000000u
#define bit_AVX2   0x00000020u
STUB

cat > "$BUILD_DIR/stubs/x86intrin.h" << 'STUB'
/* WASM stub: x86 intrinsics not available. emmintrin.h (SSE2) provides __m128i. */
#pragma once
/* u_char is a POSIX type missing from Emscripten's wasm32 sys/types.h */
typedef unsigned char u_char;
STUB

cat > "$BUILD_DIR/stubs/immintrin.h" << 'STUB'
/* WASM stub: only SSE2 subset. */
#pragma once
#include <emmintrin.h>
STUB

# ── 4b. Source file selection ─────────────────────────────────────────────────
# haraka.c      → AES-NI (x86 only), excluded; haraka_portable.c replaces it
# verus_clhash.cpp → CLMUL (x86 only), excluded; verus_clhash_portable.cpp replaces it
mapfile -t C_SOURCES < <(
  find . -name "*.c" |
  grep -v "node_modules" |
  grep -v "/haraka\.c$" \
  | sort
)
mapfile -t CXX_SOURCES < <(
  find . -name "*.cpp" |
  grep -v "node_modules" |
  grep -v "/verus_clhash\.cpp$" \
  | sort
)

echo "      C sources:   ${C_SOURCES[*]}"
echo "      C++ sources: ${CXX_SOURCES[*]}"

# Restore verus_hash.h in case a prior run patched it (it must keep #include "haraka.h")
git restore crypto/verus_hash.h 2>/dev/null || true

# Replace haraka.h with a WASM-safe stub.
# The original pulls in AES-NI headers we can't compile; this stub provides:
#   • portable declarations (via haraka_portable.h)
#   • HW-path declarations that are stubbed in verus_wasm_wrap.cpp (dead code in WASM)
echo "      writing WASM-safe crypto/haraka.h stub..."
cat > ./crypto/haraka.h << 'HARAKASTUB'
/* crypto/haraka.h — WASM stub replacing the AES-NI original.
 * Included inside extern "C" {} by verus_hash.h, so no extern "C" here. */
#pragma once
#include "haraka_portable.h"

/* HW-path declarations; stubs in verus_wasm_wrap.cpp, never called in WASM */
void load_constants(void);
void haraka512_zero(unsigned char *out, const unsigned char *in);
void haraka512(unsigned char *out, const unsigned char *in);
void haraka512_keyed(unsigned char *out, const unsigned char *in, const u128 *rc);
void haraka256(unsigned char *out, const unsigned char *in);
HARAKASTUB

# Stubs dir first so our cpuid.h/x86intrin.h/immintrin.h shadow system headers
COMMON_FLAGS="-I$BUILD_DIR/stubs -I. -Icrypto -DUSE_PORTABLE_HARAKA=1 -DUSE_PORTABLE=1 -msse2 -msimd128 -include emmintrin.h -O2"
OBJECTS=()

# Compile each .c file (no C++ standard flag)
for src in "${C_SOURCES[@]}"; do
  obj="${src%.c}.o"
  echo "      cc  $src"
  # shellcheck disable=SC2086
  emcc -c "$src" $COMMON_FLAGS -o "$obj"
  OBJECTS+=("$obj")
done

# Compile each .cpp file with C++14
for src in "${CXX_SOURCES[@]}"; do
  obj="${src%.cpp}.o"
  echo "      c++ $src"
  # shellcheck disable=SC2086
  emcc -c "$src" $COMMON_FLAGS -std=c++14 -o "$obj"
  OBJECTS+=("$obj")
done

# Link all objects into final WASM
echo "      linking..."
emcc "${OBJECTS[@]}" \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=VerusHashModule \
  -s ENVIRONMENT=worker \
  -s EXPORTED_FUNCTIONS='["_verus_hash","_malloc","_free"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s NO_EXIT_RUNTIME=1 \
  -s SINGLE_FILE=1 \
  --no-entry \
  -o "$OUT_JS"

echo ""
echo "      ✓ Compiled → $OUT_JS"
ls -lh "$OUT_JS"

# ── 5. Patch mine.html ────────────────────────────────────────────────────────
echo "[5/5] Patching mine.html..."
python3 "$SITE_DIR/patch-mine.py" "$SITE_DIR/mine.html"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Done!                                   ║"
echo "║                                          ║"
echo "║  Deploy:                                 ║"
echo "║  git add verus_hash.js mine.html         ║"
echo "║  git commit -m 'feat: VerusHash WASM'    ║"
echo "║  wrangler pages deploy .                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "NOTE: If the compile fails with missing symbols, open"
echo "  $BUILD_DIR/vrsc/hash.h"
echo "and check the exact constant name for VerusHash 2.2."
echo "It may be named SOLUTION_VERUSHHASH_V2_2 or similar."
echo "Update verus_wasm_wrap.cpp and rerun from step 4."
