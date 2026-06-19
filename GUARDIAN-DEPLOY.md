# Guardian Deployment Guide

## Overview

Deploy 3 independent guardian agents that validate XRPL escrows and sign attestations for the multi-sig bridge.

## Architecture

```
┌─────────────────────────────────────────┐
│  Guardian 1 (Your Cloudflare)          │
│  - Validates escrow on XRPL             │
│  - Signs attestation                    │
│  - Submits signature to relayer         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Guardian 2 (Partner server)            │
│  - Independent validation               │
│  - Signs independently                  │
│  - Submits signature to relayer         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Guardian 3 (Community member)          │
│  - Independent validation               │
│  - Signs independently                  │
│  - Submits signature to relayer         │
└─────────────────────────────────────────┘

                ↓ (2-of-3 signatures)

┌─────────────────────────────────────────┐
│  Multi-Sig Relayer                      │
│  - Collects signatures                  │
│  - Submits to Solana when threshold met │
└─────────────────────────────────────────┘
```

## Generated Guardian Keypairs

From Step 1 (`scripts/generate-guardians.js`):

```
Guardian 1: 21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa
Guardian 2: 9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6
Guardian 3: 8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam
```

Secret keys stored in `.guardian-keys/` (gitignored).

## Deployment Steps

### 1. Deploy Guardian Durable Objects

```bash
cd /home/cube/Desktop/pegd-site

# Deploy guardians to Cloudflare
npx wrangler deploy --config wrangler-guardians.toml

# Verify deployment
curl https://pegd.org/api/bridge/guardian1/status
curl https://pegd.org/api/bridge/guardian2/status
curl https://pegd.org/api/bridge/guardian3/status
```

Expected response (before initialization):
```json
{
  "guardianNumber": 1,
  "publicKey": "Not initialized",
  "initialized": false
}
```

### 2. Initialize Guardians with Keypairs

```bash
# Run initialization script
npx ts-node scripts/init-guardians.ts
```

This will:
- Load secret keys from `.guardian-keys/`
- POST to each guardian's `/init` endpoint
- Store keypairs in Durable Object storage

Expected output:
```
🔑 Initializing 3 Guardian Durable Objects...

Guardian 1:
  Loading keypair from .guardian-keys/guardian1.json
  ✅ Initialized
  Public Key: 21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa

Guardian 2:
  Loading keypair from .guardian-keys/guardian2.json
  ✅ Initialized
  Public Key: 9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6

Guardian 3:
  Loading keypair from .guardian-keys/guardian3.json
  ✅ Initialized
  Public Key: 8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam

✅ All guardians initialized!
```

### 3. Verify Guardians

```bash
# Check status
curl https://pegd.org/api/bridge/guardian1/status
curl https://pegd.org/api/bridge/guardian2/status
curl https://pegd.org/api/bridge/guardian3/status
```

Expected response (after initialization):
```json
{
  "guardianNumber": 1,
  "publicKey": "21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa",
  "initialized": true
}
```

### 4. Test Guardian Attestation

```bash
# Send test escrow to Guardian 1
curl -X POST https://pegd.org/api/bridge/guardian1/attest \
  -H "Content-Type: application/json" \
  -d '{
    "xrplTxHash": "ABC123DEF456",
    "escrowSequence": 12345,
    "xrplAddress": "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq",
    "solanaAddress": "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
    "amount": 10000000,
    "memos": []
  }'
```

Expected response (if escrow exists on XRPL):
```json
{
  "valid": true,
  "signature": "a1b2c3d4...",
  "guardianPubkey": "21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa",
  "pegdAmount": 5000000,
  "message": "ABC123DEF456:12345:5000000:5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG"
}
```

## Guardian Configuration

Each guardian is configured in `wrangler-guardians.toml`:

```toml
# Guardian Durable Object bindings
[[durable_objects.bindings]]
name = "GUARDIAN1"
class_name = "Guardian1"

[[durable_objects.bindings]]
name = "GUARDIAN2"
class_name = "Guardian2"

[[durable_objects.bindings]]
name = "GUARDIAN3"
class_name = "Guardian3"

[vars]
BRIDGE_XRPL_ADDRESS = "rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78"
RELAYER_URL = "https://pegd.org/api/bridge/relayer"
```

## Guardian Workflow

When a guardian receives an `/attest` request:

1. **Verify escrow on-chain** - Query XRPL to confirm escrow exists
2. **Calculate PEGD amount** - Get live XRP/PEGD prices
3. **Create attestation message** - Format: `txHash:seq:pegdAmount:solanaAddr`
4. **Sign with Ed25519** - Use guardian's secret key
5. **Submit to relayer** - POST signature to multi-sig relayer

## Security Features

- ✅ Each guardian independently validates escrows on XRPL
- ✅ Ed25519 signatures verified on-chain by Solana program
- ✅ Secret keys stored in Durable Object encrypted storage
- ✅ No single guardian can complete a swap (need 2-of-3)
- ✅ Replay protection (each escrow can only be attested once)

## Distributing Guardians

For true decentralization, distribute guardians across different entities:

**Guardian 1 (You):**
- Already deployed to your Cloudflare account
- Full control

**Guardian 2 (Partner):**
1. Share guardian2.json keypair securely
2. Provide them with guardian.ts code
3. They deploy to their own infrastructure
4. Configure RELAYER_URL to point to your relayer

**Guardian 3 (Community):**
1. Community member elected by DAO
2. Share guardian3.json keypair
3. Same deployment process
4. Can audit code before running

## Monitoring

Check guardian logs in Cloudflare dashboard:
```
Workers & Pages → pegd-guardians → Logs
```

Look for:
- `🔐 Guardian X initialized`
- `🔍 Guardian X validating escrow`
- `✅ Escrow verified on-chain`
- `✍️ Signed attestation`
- `📤 Signature submitted to relayer`

## Troubleshooting

**Guardian not initialized:**
- Run `npx ts-node scripts/init-guardians.ts` again
- Check that `.guardian-keys/guardianX.json` exists

**Attestation verification failing:**
- Verify XRPL escrow actually exists on-chain
- Check `BRIDGE_XRPL_ADDRESS` matches escrow destination
- Ensure Solana address in memo matches request

**Signature not reaching relayer:**
- Check `RELAYER_URL` is correct in wrangler-guardians.toml
- Verify relayer is deployed and running

## Next Steps

- **Step 4:** Deploy Multi-Sig Relayer
- **Step 5:** End-to-end test on devnet
- **Step 6:** Deploy to mainnet
