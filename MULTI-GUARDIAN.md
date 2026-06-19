# Multi-Guardian Architecture (Decentralized)

**Multiple autonomous guardian agents instead of one**

## Why Multiple Guardians

| Single Guardian | Multi-Guardian |
|----------------|----------------|
| You control it | Community controlled |
| Single point of failure | Redundant |
| Less trusted | More trusted |
| Centralized | Decentralized |

## Architecture

```
Bridge Request
     ↓
┌────────────────────────────────────────┐
│  Guardian Network                      │
├────────────────────────────────────────┤
│  Guardian 1 (You)    → Signs ✅        │
│  Guardian 2 (Partner) → Signs ✅        │
│  Guardian 3 (Community) → Signs ✅      │
└────────────────────────────────────────┘
     ↓
Collect signatures (need 2-of-3)
     ↓
Solana Program verifies 2-of-3 signatures
     ↓
Release PEGD ✅
```

## Solana Program Changes

```rust
pub fn swap_xrp_to_pegd(
    ctx: Context<SwapXrpToPegd>,
    pegd_amount: u64,
    xrpl_tx_hash: String,
    guardian_signatures: Vec<GuardianSignature>, // Multiple!
) -> Result<()> {
    let bridge = &ctx.accounts.bridge;

    // Verify we have at least 2-of-3 signatures
    require!(
        guardian_signatures.len() >= 2,
        BridgeError::InsufficientSignatures
    );

    // Verify each signature is from valid guardian
    let mut valid_count = 0;
    for sig in guardian_signatures {
        if bridge.guardians.contains(&sig.pubkey) {
            if verify_signature(&sig) {
                valid_count += 1;
            }
        }
    }

    require!(
        valid_count >= 2,
        BridgeError::InsufficientValidSignatures
    );

    // All checks passed, release PEGD
    token::transfer(ctx, pegd_amount)?;

    Ok(())
}

#[account]
pub struct Bridge {
    pub authority: Pubkey,
    pub guardians: Vec<Pubkey>,  // Multiple guardian pubkeys
    pub threshold: u8,            // Need 2-of-3
}
```

## Guardian Agent Setup

Each guardian runs independently:

```
Guardian 1 (Your Cloudflare DO)
├── Watches XRPL for escrows
├── Verifies on-chain
├── Signs if valid
└── Publishes signature

Guardian 2 (Partner's server)
├── Independent verification
├── Signs independently
└── Publishes signature

Guardian 3 (Community member)
├── Independent verification
├── Signs independently
└── Publishes signature
```

## Signature Collection

```typescript
class SignatureAggregator {
  async collectSignatures(escrow: any) {
    // Call all 3 guardians in parallel
    const [sig1, sig2, sig3] = await Promise.all([
      fetch('https://guardian1.example.com/attest', {
        method: 'POST',
        body: JSON.stringify(escrow)
      }),
      fetch('https://guardian2.example.com/attest', {
        method: 'POST',
        body: JSON.stringify(escrow)
      }),
      fetch('https://guardian3.example.com/attest', {
        method: 'POST',
        body: JSON.stringify(escrow)
      })
    ])

    // Collect valid signatures
    const validSigs = [sig1, sig2, sig3].filter(s => s.valid)

    if (validSigs.length < 2) {
      throw new Error('Insufficient signatures')
    }

    return validSigs
  }
}
```

## Benefits

✅ **Decentralized** - No single point of control
✅ **Fault tolerant** - 1 guardian can go offline
✅ **More trusted** - Community can verify
✅ **Attack resistant** - Need to compromise 2-of-3

## Tradeoffs

**Pros:**
- More decentralized
- More secure
- More trusted by users

**Cons:**
- More complex setup
- Need to coordinate guardians
- Slower (wait for multiple signatures)

## Start Simple, Upgrade Later

**Phase 1 (MVP):**
- Single guardian (you control)
- Fast to build
- Launch quickly

**Phase 2 (Decentralized):**
- Add 2 more guardians
- Update Solana program
- Fully decentralized

## Guardian Selection

**Good guardians:**
- ✅ Trusted community members
- ✅ Organizations with reputation
- ✅ Geographic diversity
- ✅ Independent infrastructure

**Example setup:**
```
Guardian 1: You (Cloudflare)
Guardian 2: XRPL Foundation (if partnered)
Guardian 3: Community DAO member (elected)
```

## Like Wormhole But Simpler

**Wormhole:** 19 guardians (Jump Crypto, etc.)
**Your bridge:** 3 guardians (2-of-3 threshold)

Same model, smaller scale!

---

**Recommendation:** Start with 1 guardian (faster), upgrade to 3 later (more decentralized)
