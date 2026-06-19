# Deploy Multi-Sig Bridge (2-of-3 Guardians)

**Decentralized from day 1 with 3 independent guardians**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Guardian Network (3 independent agents)                 │
├─────────────────────────────────────────────────────────┤
│  Guardian 1 (You - Cloudflare DO)                       │
│  Guardian 2 (Partner - Cloudflare DO or VPS)            │
│  Guardian 3 (Community - VPS or Cloudflare)             │
│                                                          │
│  Each watches XRPL independently                        │
│  Each verifies escrows independently                    │
│  Each signs independently                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Signature Aggregator (Relayer)                         │
├─────────────────────────────────────────────────────────┤
│  Collects signatures from all 3 guardians              │
│  Waits for 2-of-3 threshold                            │
│  Submits to Solana program when ready                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Solana Program                                          │
├─────────────────────────────────────────────────────────┤
│  Verifies 2-of-3 guardian signatures on-chain          │
│  Releases PEGD if valid                                 │
│  Prevents replay attacks                                │
└─────────────────────────────────────────────────────────┘
```

## Step 1: Generate Guardian Keypairs

```bash
# Generate 3 Ed25519 keypairs (one per guardian)

# Guardian 1 (you)
solana-keygen new -o guardian1.json
GUARDIAN1_PUBKEY=$(solana-keygen pubkey guardian1.json)

# Guardian 2 (partner)
solana-keygen new -o guardian2.json
GUARDIAN2_PUBKEY=$(solana-keygen pubkey guardian2.json)

# Guardian 3 (community)
solana-keygen new -o guardian3.json
GUARDIAN3_PUBKEY=$(solana-keygen pubkey guardian3.json)

echo "Guardian 1: $GUARDIAN1_PUBKEY"
echo "Guardian 2: $GUARDIAN2_PUBKEY"
echo "Guardian 3: $GUARDIAN3_PUBKEY"
```

## Step 2: Deploy Solana Program

```bash
cd solana-bridge-program

# Use the multi-sig version
cp src/lib-multisig.rs src/lib.rs

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/pegd_multisig_bridge-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Update in lib.rs declare_id!()
```

## Step 3: Initialize Bridge with 3 Guardians

```bash
# Initialize with all 3 guardian pubkeys
anchor run initialize \
  --guardian1 $GUARDIAN1_PUBKEY \
  --guardian2 $GUARDIAN2_PUBKEY \
  --guardian3 $GUARDIAN3_PUBKEY
```

## Step 4: Deploy Guardian Agents

### Guardian 1 (Your Cloudflare DO)

```bash
# Deploy to Cloudflare
npx wrangler deploy functions/api/bridge/guardian.ts \
  --name pegd-guardian-1 \
  --durable-objects Guardian

# Set secret key
cat guardian1.json | \
  npx wrangler secret put GUARDIAN_SECRET_KEY --name pegd-guardian-1
```

### Guardian 2 (Partner's Infrastructure)

**Option A: Cloudflare (same as yours)**
```bash
# Partner runs:
npx wrangler deploy functions/api/bridge/guardian.ts \
  --name pegd-guardian-2 \
  --durable-objects Guardian

cat guardian2.json | \
  npx wrangler secret put GUARDIAN_SECRET_KEY --name pegd-guardian-2
```

**Option B: VPS (DigitalOcean/AWS)**
```bash
# On partner's server
git clone https://github.com/yourrepo/pegd-bridge
cd pegd-bridge/services/guardian

# Install deps
npm install

# Set env
export GUARDIAN_SECRET_KEY="$(cat guardian2.json)"
export GUARDIAN_PORT=3001

# Run
npm run start

# Keep alive with PM2
pm2 start index.js --name guardian2
```

### Guardian 3 (Community Member)

Same as Guardian 2 - either Cloudflare or VPS

## Step 5: Deploy Multi-Sig Relayer

```bash
# Deploy signature aggregator
npx wrangler deploy functions/api/bridge/relayer-multisig.ts \
  --name pegd-relayer-multisig \
  --durable-objects MultiSigRelayer

# Configure guardian endpoints
npx wrangler secret put GUARDIAN1_URL # https://pegd.org/api/bridge/guardian1
npx wrangler secret put GUARDIAN2_URL # https://partner.com/guardian
npx wrangler secret put GUARDIAN3_URL # https://community.com/guardian
```

## Step 6: Deploy Monitor

```bash
# Monitor watches XRPL and notifies all 3 guardians
npx wrangler deploy functions/api/bridge/monitor.ts \
  --name pegd-monitor \
  --durable-objects XRPLMonitor

# Configure
npx wrangler secret put GUARDIAN_ENDPOINTS \
  --value '["https://pegd.org/api/guardian1", "https://partner.com/guardian", "https://community.com/guardian"]'
```

## Step 7: Fund Bridge with PEGD

```bash
# Transfer PEGD to bridge program's token account
spl-token transfer \
  PEGD_MINT_ADDRESS \
  100000 \
  BRIDGE_TOKEN_ACCOUNT \
  --fund-recipient

echo "Bridge funded with 100,000 PEGD"
```

## Step 8: Test Multi-Sig Flow

### Create test escrow on XRPL testnet

```bash
# Use Xaman to create escrow:
# - Destination: rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78
# - DestinationTag: 999
# - Amount: 10 XRP (10,000,000 drops)
# - Memo: Your Solana address (base58)
# - CancelAfter: +1 hour
```

### Watch the flow

```bash
# Terminal 1: Guardian 1 logs
npx wrangler tail pegd-guardian-1

# Terminal 2: Guardian 2 logs
npx wrangler tail pegd-guardian-2

# Terminal 3: Guardian 3 logs
npx wrangler tail pegd-guardian-3

# Terminal 4: Relayer logs
npx wrangler tail pegd-relayer-multisig
```

**Expected output:**
```
Guardian 1: "🛡️ Verifying escrow ABC123..."
Guardian 1: "✅ Valid! Signing attestation..."
Guardian 1: "📤 Signature sent to relayer"

Guardian 2: "🛡️ Verifying escrow ABC123..."
Guardian 2: "✅ Valid! Signing attestation..."
Guardian 2: "📤 Signature sent to relayer"

Relayer: "📝 Signature 1/3 received"
Relayer: "📝 Signature 2/3 received"
Relayer: "✅ Threshold reached (2/3)!"
Relayer: "⚡ Calling Solana program with multi-sig..."
Relayer: "✅ PEGD released to user"
Relayer: "🔓 Finishing XRPL escrow..."
Relayer: "✅ Multi-sig swap complete!"
```

### Verify on Solana

```bash
# Check user received PEGD
spl-token accounts --owner USER_SOLANA_ADDRESS

# Should show ~30 PEGD received
```

## Guardian Responsibilities

### Guardian 1 (You)
- ✅ Monitor XRPL 24/7
- ✅ Verify escrows independently
- ✅ Sign valid attestations
- ✅ Maintain uptime

### Guardian 2 (Partner)
- ✅ Run independent guardian service
- ✅ Verify escrows (don't trust Guardian 1)
- ✅ Sign independently
- ✅ Maintain uptime

### Guardian 3 (Community)
- ✅ Run independent guardian service
- ✅ Act as tiebreaker (2-of-3)
- ✅ Community oversight
- ✅ Maintain uptime

## Fault Tolerance

**If 1 guardian goes offline:**
- ✅ Bridge still works (2 remaining = threshold met)
- ⚠️ Log warning, notify team

**If 2 guardians offline:**
- ❌ Bridge stops (can't reach 2-of-3 threshold)
- 🚨 Emergency: restart guardians ASAP

**If malicious guardian:**
- ✅ Can't attack alone (need 2-of-3)
- ✅ Other guardians verify independently
- ✅ Governance can replace malicious guardian

## Costs

**Cloudflare (Guardian 1):**
- $5/month (Workers plan)

**Partner/Community (Guardians 2 & 3):**
- Cloudflare: $5/month each
- OR VPS: $10/month each

**Solana transactions:**
- ~$0.0005 per swap

**Total: $15-30/month** depending on guardian infrastructure

## Security Model

**Attack scenarios:**

❌ **Compromise 1 guardian** → Can't attack (need 2-of-3)
❌ **Compromise relayer** → Can't mint fake PEGD (guardians verify)
❌ **Fake XRPL escrow** → Guardians verify on-chain, reject
✅ **All systems secure** → Need to compromise 2-of-3 guardians

## Governance: Changing Guardians

```bash
# If need to replace a guardian
anchor run update-guardians \
  --new-guardian1 $NEW_PUBKEY1 \
  --new-guardian2 $GUARDIAN2_PUBKEY \  # Keep
  --new-guardian3 $GUARDIAN3_PUBKEY \  # Keep
  --threshold 2
```

## Going Live

**Checklist:**
- [ ] All 3 guardians deployed and tested
- [ ] Multi-sig flow tested on devnet
- [ ] Guardian keys stored securely (not in code!)
- [ ] Monitoring set up (Sentry/Datadog)
- [ ] Alert system configured (Discord/Slack)
- [ ] Emergency contacts exchanged
- [ ] Governance process documented
- [ ] Audit completed (recommended)
- [ ] Deploy to Solana mainnet
- [ ] Fund bridge with PEGD liquidity
- [ ] Soft launch (invite only)
- [ ] Public launch 🚀

## Maintenance

**Weekly:**
- Check all 3 guardians are online
- Verify no failed attestations
- Review swap volumes

**Monthly:**
- Rebalance PEGD liquidity if needed
- Review guardian performance
- Update dependencies

**As needed:**
- Replace offline guardian
- Adjust threshold if adding guardians
- Update guardian keys (rotate)

---

**Multi-sig from day 1 = Maximum trust and decentralization** 🛡️
