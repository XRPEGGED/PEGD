# Multi-Sig Relayer Deployment Guide

## Overview

The Multi-Sig Relayer collects signatures from 3 independent guardians and submits transactions to the Solana bridge program when the 2-of-3 threshold is reached.

## Architecture

```
Guardian 1 → Signs escrow → Submits signature ┐
                                               ├→ Multi-Sig Relayer
Guardian 2 → Signs escrow → Submits signature ├→ (Collects 2-of-3)
                                               │
Guardian 3 → Signs escrow → Submits signature ┘

                     ↓ (Threshold reached)

              Solana Bridge Program
              (Verifies signatures on-chain)

                     ↓

              Release PEGD to user
```

## Deployment Steps

### 1. Deploy Relayer Durable Object

```bash
cd /home/cube/Desktop/pegd-site

# Deploy relayer to Cloudflare
npx wrangler deploy --config wrangler-relayer.toml
```

### 2. Configure Secrets

The relayer needs access to:
- Solana relayer keypair (for paying tx fees)
- Bridge addresses and accounts

```bash
# Generate relayer keypair (or use existing)
solana-keygen new --outfile relayer-keypair.json

# Get relayer pubkey
solana-keygen pubkey relayer-keypair.json
# Example: RelayerPubkeyHere123...

# Fund relayer wallet (for transaction fees)
solana airdrop 2 RelayerPubkeyHere123... --url devnet

# Set secrets in Cloudflare
npx wrangler secret put RELAYER_KEYPAIR --config wrangler-relayer.toml
# Paste the JSON array from relayer-keypair.json

npx wrangler secret put BRIDGE_PEGD_ACCOUNT --config wrangler-relayer.toml
# Paste bridge's PEGD token account address

npx wrangler secret put BRIDGE_PDA --config wrangler-relayer.toml
# Paste bridge program derived address
```

### 3. Verify Deployment

```bash
# Check relayer status
curl https://pegd.org/api/bridge/relayer/status
```

Expected response:
```json
{
  "pending": 0
}
```

### 4. Test Signature Collection

Simulate guardian signatures:

```bash
# Send signature from Guardian 1
curl -X POST https://pegd.org/api/bridge/relayer/signature \
  -H "Content-Type: application/json" \
  -d '{
    "escrow": {
      "xrplTxHash": "TEST123",
      "escrowSequence": 99999,
      "xrplAddress": "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq",
      "solanaAddress": "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
      "amount": 10000000
    },
    "signature": "a1b2c3d4...",
    "guardianPubkey": "21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa"
  }'

# Send signature from Guardian 2
curl -X POST https://pegd.org/api/bridge/relayer/signature \
  -H "Content-Type: application/json" \
  -d '{
    "escrow": {
      "xrplTxHash": "TEST123",
      "escrowSequence": 99999,
      "xrplAddress": "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq",
      "solanaAddress": "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
      "amount": 10000000
    },
    "signature": "e5f6g7h8...",
    "guardianPubkey": "9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6"
  }'
```

After 2nd signature, relayer should:
1. Log: `✅ Threshold reached (2/2)`
2. Call Solana program with multi-sig
3. Finish XRPL escrow
4. Log: `✅ Multi-sig swap complete`

## Relayer Configuration

### Environment Variables (`wrangler-relayer.toml`)

```toml
[vars]
BRIDGE_XRPL_ADDRESS = "rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78"
SOLANA_BRIDGE_PROGRAM_ID = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
SOLANA_RPC_URL = "https://api.devnet.solana.com"
```

### Secrets (Encrypted)

Set via `npx wrangler secret put`:
- `RELAYER_KEYPAIR` - Solana private key for signing transactions
- `BRIDGE_PEGD_ACCOUNT` - Bridge's PEGD token account address
- `BRIDGE_PDA` - Bridge program derived address

## Relayer Workflow

When a signature is received via `/signature` endpoint:

1. **Extract escrow details** - Parse xrplTxHash, escrowSequence, etc.
2. **Check existing attestation state** - Get or create pending attestation
3. **Add signature** - Store guardian signature
4. **Check threshold** - If 2+ signatures, proceed
5. **Call Solana program** - Submit `swap_xrp_to_pegd` with multi-sig
6. **Finish XRPL escrow** - Release XRP to bridge treasury
7. **Clean up** - Remove from pending attestations

## Security Features

- ✅ Only processes swaps with 2-of-3 guardian signatures
- ✅ Duplicate signature prevention (same guardian can't sign twice)
- ✅ Automatic cleanup of expired attestations (1 hour timeout)
- ✅ On-chain signature verification by Solana program
- ✅ Relayer cannot forge signatures (guardians hold private keys)

## Monitoring

Check relayer logs in Cloudflare dashboard:
```
Workers & Pages → pegd-relayer → Logs
```

Look for:
- `📝 Signature 1/3 received`
- `📝 Signature 2/3 received`
- `✅ Threshold reached (2/2)`
- `🏗️ Calling Solana program with multi-sig`
- `📤 Submitting to Solana with 2 guardian signatures`
- `✅ Solana transaction submitted: <sig>`
- `🔓 Finishing XRPL escrow`
- `✅ Multi-sig swap complete`

## Alarm-Based Cleanup

The relayer runs an alarm every 60 seconds to clean up old attestations:

```typescript
async alarm() {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000

  for (const [key, state] of this.pendingAttestations.entries()) {
    if (now - state.createdAt > oneHour) {
      console.log(`🧹 Cleaning up expired attestation: ${key}`)
      this.pendingAttestations.delete(key)
    }
  }

  await this.state.storage.setAlarm(Date.now() + 60000)
}
```

This prevents memory leaks from attestations that never reach threshold.

## Integration with Guardians

Guardians submit signatures automatically after validation:

```typescript
// In guardian.ts
async submitSignatureToRelayer(escrow: any, signature: Uint8Array) {
  const response = await fetch('https://pegd.org/api/bridge/relayer/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      escrow,
      signature: Buffer.from(signature).toString('hex'),
      guardianPubkey: this.guardianKeypair!.publicKey.toBase58(),
    }),
  })
}
```

## Troubleshooting

**Signatures not aggregating:**
- Check guardian URLs in `RELAYER_URL` env var
- Verify guardians are initialized and running
- Check relayer logs for incoming signatures

**Solana transaction failing:**
- Verify `SOLANA_BRIDGE_PROGRAM_ID` matches deployed program
- Check relayer wallet has SOL for transaction fees
- Ensure bridge has PEGD liquidity

**XRPL escrow finish failing:**
- Verify `BRIDGE_XRPL_ADDRESS` has authority to finish escrow
- Check escrow hasn't already been finished or canceled

## Cost

**Cloudflare:**
- Durable Objects: ~$0.01 per 100 swaps (storage + compute)

**Solana:**
- Transaction fees: ~0.00001 SOL per swap (~$0.001)

**Total:** ~$0.02 per swap

## Next Steps

- **Step 5:** End-to-end testing on devnet
- **Step 6:** Deploy to mainnet and fund liquidity
- **Step 7:** Apply for Allbridge listing
- **Step 8:** Integrate Wormhole for multi-chain
