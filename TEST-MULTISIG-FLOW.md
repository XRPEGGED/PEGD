# End-to-End Multi-Sig Bridge Testing on Devnet

## Test Flow Overview

```
1. User creates XRPL escrow → 10 XRP
2. Monitor detects escrow
3. Monitor notifies all 3 guardians
4. Guardian 1 validates → signs → submits signature to relayer
5. Guardian 2 validates → signs → submits signature to relayer
6. Relayer receives 2-of-3 signatures (threshold reached!)
7. Relayer calls Solana program with multi-sig
8. Solana program verifies signatures on-chain
9. Solana program releases PEGD to user
10. Relayer finishes XRPL escrow
11. Bridge receives 10 XRP
```

## Prerequisites

Before testing, ensure all components are deployed:

- [x] **Step 1:** 3 Guardian keypairs generated
- [x] **Step 2:** Solana multi-sig program deployed to devnet
- [x] **Step 3:** 3 Guardian agents deployed and initialized
- [x] **Step 4:** Multi-sig relayer deployed

## Setup Test Environment

### 1. Deploy All Components to Devnet

```bash
cd /home/cube/Desktop/pegd-site

# Deploy guardians
npx wrangler deploy --config wrangler-guardians.toml

# Initialize guardians
npx ts-node scripts/init-guardians.ts

# Deploy relayer
npx wrangler deploy --config wrangler-relayer.toml

# Verify all deployed
curl https://pegd.org/api/bridge/guardian1/status
curl https://pegd.org/api/bridge/guardian2/status
curl https://pegd.org/api/bridge/guardian3/status
curl https://pegd.org/api/bridge/relayer/status
```

### 2. Deploy Solana Program

```bash
# Option 1: Via Solana Playground (fastest)
# 1. Go to https://beta.solpg.io
# 2. Upload programs/pegd-bridge/src/lib.rs
# 3. Build and deploy
# 4. Note Program ID

# Option 2: Local deployment
cd solana-program
anchor build
anchor deploy --provider.cluster devnet
```

### 3. Initialize Solana Bridge

```bash
# Run initialization script
npx ts-node solana-program/scripts/initialize-bridge.ts

# Expected output:
# ✅ Bridge initialized!
# Bridge Account: BridgePDAAddressHere...
# Guardians: [21njt4S..., 9g9mYwH..., 8Mad2Zs...]
# Threshold: 2
```

### 4. Fund Bridge with PEGD

```bash
# Get bridge PDA
BRIDGE_PDA="<from initialization output>"

# Create token account for bridge
spl-token create-account <PEGD_MINT> --owner $BRIDGE_PDA

# Transfer 100,000 PEGD to bridge
spl-token transfer <PEGD_MINT> 100000 <BRIDGE_TOKEN_ACCOUNT>
```

## Test 1: Simulated Guardian Signatures

**Test signing and aggregation without XRPL**

```bash
# Simulate escrow data
ESCROW_DATA='{
  "xrplTxHash": "TEST_TX_001",
  "escrowSequence": 12345,
  "xrplAddress": "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq",
  "solanaAddress": "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
  "amount": 10000000,
  "memos": []
}'

# Send to Guardian 1
echo $ESCROW_DATA | curl -X POST \
  https://pegd.org/api/bridge/guardian1/attest \
  -H "Content-Type: application/json" \
  -d @-

# Expected response:
# {
#   "valid": false,
#   "error": "Escrow not found or invalid"
# }
# (Expected to fail since escrow doesn't exist on XRPL yet)
```

## Test 2: Real XRPL Escrow → PEGD

**Full end-to-end test with real XRPL escrow**

### Step 1: Create XRPL Escrow

```javascript
// Use Xaman wallet or xrpl.js

const xrpl = require('xrpl')

async function createTestEscrow() {
  const client = new xrpl.Client('wss://s.devnet.rippletest.net:51233')
  await client.connect()

  const wallet = xrpl.Wallet.fromSeed('sYourTestnetWalletSeed')

  const escrowTx = {
    TransactionType: 'EscrowCreate',
    Account: wallet.address,
    Destination: 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78', // Bridge address
    Amount: '10000000', // 10 XRP in drops
    FinishAfter: Math.floor(Date.now() / 1000) + 60, // Can finish in 1 min
    CancelAfter: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
    DestinationTag: 999, // Bridge identifier
    Memos: [{
      Memo: {
        MemoData: Buffer.from('solana:5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG').toString('hex')
      }
    }]
  }

  const prepared = await client.autofill(escrowTx)
  const signed = wallet.sign(prepared)
  const result = await client.submitAndWait(signed.tx_blob)

  console.log('✅ Escrow created!')
  console.log('TX Hash:', result.result.hash)
  console.log('Sequence:', result.result.Sequence)

  await client.disconnect()
}

createTestEscrow()
```

### Step 2: Monitor Detects Escrow

The monitor should automatically detect the escrow and notify guardians.

Check monitor logs:
```
🔍 New escrow detected:
   TX: <hash>
   Amount: 10 XRP
   Solana: 5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG

📢 Notifying 3 guardians...
```

### Step 3: Guardians Validate and Sign

Check guardian logs (should happen automatically):

**Guardian 1:**
```
🔍 Guardian 1 validating escrow:
   XRPL TX: <hash>
   Amount: 10000000 drops
   ✅ Escrow verified on-chain
   ✍️ Signed attestation
   PEGD Amount: 5.0 PEGD
   📤 Signature submitted to relayer: OK
```

**Guardian 2:**
```
🔍 Guardian 2 validating escrow:
   XRPL TX: <hash>
   Amount: 10000000 drops
   ✅ Escrow verified on-chain
   ✍️ Signed attestation
   PEGD Amount: 5.0 PEGD
   📤 Signature submitted to relayer: OK
```

**Guardian 3:**
```
🔍 Guardian 3 validating escrow:
   XRPL TX: <hash>
   Amount: 10000000 drops
   ✅ Escrow verified on-chain
   ✍️ Signed attestation
   PEGD Amount: 5.0 PEGD
   📤 Signature submitted to relayer: OK
```

### Step 4: Relayer Aggregates Signatures

Check relayer logs:

```
📝 Signature 1/3 received for <hash>:12345
📝 Signature 2/3 received for <hash>:12345
✅ Threshold reached (2/2)
⚡ Processing multi-sig swap: <hash>
🏗️ Calling Solana program with multi-sig...
📤 Submitting to Solana with 2 guardian signatures
✅ Solana transaction submitted: <signature>
🔓 Finishing XRPL escrow...
✅ Multi-sig swap complete
```

### Step 5: Verify on Solana

```bash
# Check user received PEGD
spl-token accounts <PEGD_MINT> --owner 5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG

# Expected output:
# Token Account: ...
# Balance: 5.0
```

### Step 6: Verify on XRPL

```bash
# Check escrow was finished
xrpl-cli account rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78

# Expected: Bridge received 10 XRP
```

## Test 3: Guardian Failure Scenario

**Test that bridge still works if 1 guardian goes offline**

```bash
# Temporarily stop Guardian 3
# Guardian 1 signs ✅
# Guardian 2 signs ✅
# Guardian 3 offline ❌
# → Still works! (2-of-3 threshold)
```

## Test 4: Invalid Escrow Rejection

**Test that guardians reject invalid escrows**

```javascript
// Create escrow with WRONG destination
const badEscrow = {
  ...escrowTx,
  Destination: 'rWrongAddress123...' // Not bridge address
}

// Expected: All guardians reject
// No signatures submitted
// Swap does not process
```

## Verification Checklist

After running tests, verify:

- [ ] Guardian 1 initialized with correct pubkey
- [ ] Guardian 2 initialized with correct pubkey
- [ ] Guardian 3 initialized with correct pubkey
- [ ] Relayer receives signatures from guardians
- [ ] Relayer aggregates 2-of-3 signatures
- [ ] Solana program verifies signatures on-chain
- [ ] PEGD released from bridge to user
- [ ] XRP escrow finished and claimed by bridge
- [ ] Swap record created on Solana (no replay possible)
- [ ] Works with 1 guardian offline (2-of-3)
- [ ] Rejects invalid escrows (wrong destination, amount mismatch)

## Success Criteria

✅ **Test passes if:**
1. User creates 10 XRP escrow on XRPL
2. Monitor detects and notifies guardians
3. At least 2 guardians sign
4. Relayer submits multi-sig to Solana
5. Solana program verifies signatures
6. User receives ~5 PEGD on Solana
7. Bridge receives 10 XRP on XRPL
8. Total time: < 30 seconds

## Debugging

**If test fails, check:**

1. **Guardian logs:** Are guardians receiving attestation requests?
2. **XRPL verification:** Does escrow exist with correct details?
3. **Signature format:** Are Ed25519 signatures valid?
4. **Relayer logs:** Is relayer receiving signatures?
5. **Solana program:** Are guardian pubkeys correctly initialized?
6. **Bridge liquidity:** Does bridge have enough PEGD?

## Common Issues

**"Escrow not found on XRPL"**
- Ensure escrow was successfully created
- Check `BRIDGE_XRPL_ADDRESS` matches escrow destination
- Wait for XRPL ledger to close (3-5 seconds)

**"Insufficient signatures"**
- Check all guardians are running and initialized
- Verify `RELAYER_URL` is correct in guardian config
- Check relayer logs for incoming signatures

**"Solana transaction failed"**
- Verify bridge program is deployed and initialized
- Check bridge has PEGD liquidity
- Ensure relayer has SOL for transaction fees
- Verify guardian pubkeys match Solana program

**"Signature verification failed"**
- Check message format matches Solana program expectation
- Verify guardian keypairs are Ed25519
- Ensure signature encoding is correct (hex)

## Next Steps

After successful devnet testing:

- **Step 6:** Deploy to mainnet and fund liquidity
- **Step 7:** Apply for Allbridge listing
- **Step 8:** Integrate Wormhole for multi-chain

## Monitoring Dashboard (Optional)

Create simple dashboard to track bridge activity:

```typescript
// /app/api/bridge/stats/route.ts
export async function GET() {
  return json({
    totalSwaps: 0,
    pendingAttestations: 0,
    guardian1Status: 'active',
    guardian2Status: 'active',
    guardian3Status: 'active',
    bridgeLiquidity: 100000,
  })
}
```

Access at: `https://pegd.org/api/bridge/stats`
