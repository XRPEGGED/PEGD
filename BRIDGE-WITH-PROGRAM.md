# PEGD Bridge with Solana Program (Best of Both Worlds)

**Simple liquidity pool + trustless smart contract verification**

## Why This is Better

| Model | Trust Needed | Complexity | Security |
|-------|--------------|------------|----------|
| **Manual transfers** | High (trust relayer) | Low | Medium |
| **Wrapped tokens** | Low | High | High |
| **This approach** | **None** | **Medium** | **High** ✅ |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  XRPL Side                                               │
├─────────────────────────────────────────────────────────┤
│  User creates escrow → Guardian verifies → Signs        │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Solana Program (Smart Contract)                        │
├─────────────────────────────────────────────────────────┤
│  1. Verifies guardian signature on-chain                │
│  2. Checks XRPL escrow proof                            │
│  3. Releases PEGD from program pool → user              │
│  4. Prevents replay attacks                             │
└─────────────────────────────────────────────────────────┘
```

## How It Works

### **XRP → PEGD Flow (Trustless)**

```
1. User creates XRPL escrow: 10 XRP
   - Destination: Bridge address
   - Memo: Solana wallet address
   - CancelAfter: 1 hour

2. Guardian detects escrow on XRPL
   - Verifies it exists on-chain
   - Signs attestation: "Escrow X exists, release Y PEGD to Z"

3. Relayer calls Solana program with guardian signature
   - Program verifies signature on-chain (trustless!)
   - Program checks signature hasn't been used (no replay)
   - Program transfers PEGD from pool → user

4. Relayer finishes XRPL escrow
   - Claims 10 XRP to treasury

✅ User got PEGD (trustless - program verified)
✅ Bridge got XRP
```

### **PEGD → XRP Flow**

```
1. User calls Solana program:
   program.swap_pegd_to_xrp(30_PEGD, "rXRPLAddress...")

2. Program transfers PEGD from user → bridge pool
   - Creates withdrawal request on-chain

3. Relayer sees withdrawal request
   - Sends XRP on XRPL to user's address
   - Marks withdrawal as processed

✅ User got XRP
✅ Bridge got PEGD back
```

## The Solana Program

### **State:**

```rust
pub struct Bridge {
    authority: Pubkey,       // Bridge operator
    guardian: Pubkey,        // Guardian public key
    total_swapped: u64       // Stats
}

// Holds PEGD in program-controlled token account
```

### **Functions:**

**1. swap_xrp_to_pegd**
```rust
// User claims PEGD after creating XRPL escrow
pub fn swap_xrp_to_pegd(
    pegd_amount: u64,
    xrpl_tx_hash: String,
    xrpl_escrow_seq: u64,
    guardian_signature: [u8; 64],  // Proof!
) -> Result<()>
```

- ✅ Verifies guardian signature
- ✅ Checks escrow hasn't been used before
- ✅ Transfers PEGD from program → user
- ✅ Records swap on-chain

**2. swap_pegd_to_xrp**
```rust
// User locks PEGD, requests XRP
pub fn swap_pegd_to_xrp(
    pegd_amount: u64,
    xrpl_destination: String,
) -> Result<()>
```

- ✅ Transfers PEGD from user → program
- ✅ Creates withdrawal request
- ✅ Relayer processes off-chain

## Security Features

✅ **Guardian signature verification** - On-chain, can't be faked
✅ **Replay protection** - Each XRPL escrow can only be claimed once
✅ **No minting** - Just transfers from liquidity pool
✅ **Program-controlled** - PEGD can't be stolen by relayer
✅ **XRPL escrow safety** - User can cancel if program doesn't release

## Deployment

### **1. Build and Deploy Solana Program**

```bash
cd solana-bridge-program

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Get program ID
solana address -k target/deploy/pegd_simple_bridge-keypair.json

# Update in lib.rs declare_id!()
```

### **2. Initialize Program**

```bash
# Create bridge with guardian pubkey
anchor run initialize \
  --guardian-pubkey GuardianPubkeyHere...
```

### **3. Fund Program with PEGD**

```bash
# Transfer PEGD to program's token account
spl-token transfer \
  PEGD_MINT_ADDRESS \
  100000 \
  BRIDGE_PEGD_ACCOUNT \
  --fund-recipient
```

### **4. Deploy Cloudflare Services**

```bash
# Monitor, Guardian, Relayer (same as before)
npx wrangler deploy functions/api/bridge/monitor.ts
npx wrangler deploy functions/api/bridge/guardian.ts
npx wrangler deploy functions/api/bridge/relayer.ts

# Start monitoring
curl -X POST https://pegd.org/api/bridge/monitor/start
```

## Relayer Integration

The relayer now calls the Solana program instead of direct transfers:

```typescript
async function processSwap(attestation: any) {
  const { escrow, guardianSignature } = attestation

  // Call Solana program
  const tx = await program.methods
    .swapXrpToPegd(
      pegdAmount,
      escrow.xrplTxHash,
      escrow.escrowSequence,
      guardianSignature
    )
    .accounts({
      bridge: bridgePDA,
      bridgePegdAccount: bridgeTokenAccount,
      recipientPegdAccount: userTokenAccount,
      recipient: userWallet,
      swapRecord: swapRecordPDA,
      payer: relayerWallet,
    })
    .rpc()

  console.log('✅ PEGD released via program:', tx)

  // Now finish XRPL escrow
  await finishXRPLEscrow(escrow)
}
```

## User Experience

**Same simple flow:**

```
1. User visits pegd.org
2. Clicks "Bridge 10 XRP → PEGD"
3. Signs Xaman escrow

[Bridge processes automatically]

4. User receives PEGD in Phantom

Time: 10-30 seconds
```

**But now 100% trustless!**

## Comparison

### **Without Program:**
```
User → Trust relayer will send PEGD → Get PEGD
     ❌ Requires trust
```

### **With Program:**
```
User → Guardian signature verified on-chain → Get PEGD
     ✅ Trustless
```

## Cost

**Development:**
- Solana program: Simple (300 lines)
- Audit: ~$5k (recommended but not required for MVP)

**Deployment:**
- Solana program deploy: ~2 SOL ($100)
- Cloudflare Workers: $5/month

**Ongoing:**
- $5/month (Cloudflare)
- Transaction fees (minimal)

Total: ~$100 one-time + $5/month

## Is This Still Simple?

**Yes!** Compared to wrapped tokens:
- ✅ No minting/burning logic
- ✅ Just transfer from pool
- ✅ Simple verification (just signature check)
- ✅ 300 lines vs. 1000+ for wrapped model

## Benefits vs. Wrapped Tokens

| Feature | Wrapped Tokens | This Model |
|---------|----------------|------------|
| Complexity | High | Medium |
| Audit cost | $10k+ | $5k |
| Build time | 2-4 weeks | 3-5 days |
| Trustless | ✅ Yes | ✅ Yes |
| Simple UX | ✅ Yes | ✅ Yes |

## Ready to Build?

**Steps:**
1. Build Solana program (1 day)
2. Deploy to devnet (1 hour)
3. Test with real escrow (1 hour)
4. Audit (optional, 1 week)
5. Deploy to mainnet (1 hour)
6. Launch! 🚀

**Total: 3-5 days** (vs. weeks for wrapped tokens)

---

**This is the sweet spot: Simple + Trustless** 🎯
