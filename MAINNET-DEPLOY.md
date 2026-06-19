# Mainnet Deployment Guide

## Pre-Deployment Checklist

Before deploying to mainnet, ensure:

- [x] **Devnet testing complete** - All flows tested successfully
- [x] **Guardian keypairs secured** - Backed up in multiple locations
- [ ] **Code audit** - Security review completed (recommended but optional for MVP)
- [ ] **Insurance fund** - Reserve PEGD/XRP for potential issues
- [ ] **Monitoring setup** - Alerts configured
- [ ] **Emergency procedures** - Plan for pausing bridge if needed

## Deployment Steps

### 1. Deploy Solana Program to Mainnet

```bash
cd solana-program

# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Ensure deployment wallet has SOL
solana balance
# Need ~3 SOL for deployment

# Build for mainnet
anchor build

# Deploy
anchor deploy --provider.cluster mainnet

# Get program ID
solana program show <PROGRAM_ID>
```

**Save Program ID:**
```
SOLANA_BRIDGE_PROGRAM_ID=<program-id>
```

### 2. Initialize Bridge on Mainnet

```bash
# Update guardian pubkeys in initialization script
# (Same keys from devnet)

npx ts-node solana-program/scripts/initialize-bridge.ts \
  --cluster mainnet \
  --guardian1 21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa \
  --guardian2 9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6 \
  --guardian3 8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam
```

**Save Bridge Addresses:**
```
BRIDGE_PDA=<bridge-pda-address>
BRIDGE_PEGD_ACCOUNT=<bridge-token-account>
```

### 3. Fund Bridge with PEGD Liquidity

```bash
# Create bridge token account
spl-token create-account <PEGD_MINT> --owner $BRIDGE_PDA

# Transfer initial liquidity (100,000 PEGD)
spl-token transfer <PEGD_MINT> 100000 $BRIDGE_PEGD_ACCOUNT \
  --fund-recipient \
  --allow-unfunded-recipient

# Verify balance
spl-token balance <PEGD_MINT> --address $BRIDGE_PEGD_ACCOUNT
# Expected: 100000
```

### 4. Deploy Guardians to Production

```bash
# Update wrangler-guardians.toml for production
[env.production]
name = "pegd-guardians"
route = "pegd.org/api/bridge/guardian*"

[env.production.vars]
BRIDGE_XRPL_ADDRESS = "rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78"
RELAYER_URL = "https://pegd.org/api/bridge/relayer"

# Deploy
npx wrangler deploy --config wrangler-guardians.toml --env production

# Initialize with keypairs
npx ts-node scripts/init-guardians.ts --env production
```

### 5. Deploy Relayer to Production

```bash
# Update wrangler-relayer.toml for production
[env.production]
name = "pegd-relayer"
route = "pegd.org/api/bridge/relayer*"

[env.production.vars]
SOLANA_BRIDGE_PROGRAM_ID = "<mainnet-program-id>"
SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"

# Deploy
npx wrangler deploy --config wrangler-relayer.toml --env production

# Set production secrets
npx wrangler secret put RELAYER_KEYPAIR --env production
npx wrangler secret put BRIDGE_PEGD_ACCOUNT --env production
npx wrangler secret put BRIDGE_PDA --env production
```

### 6. Deploy Monitor to Production

```bash
# Deploy monitor
npx wrangler deploy --config wrangler-monitor.toml --env production

# Start monitoring mainnet XRPL
curl -X POST https://pegd.org/api/bridge/monitor/start
```

## Mainnet Configuration

### XRPL Mainnet

```javascript
// Monitor connects to XRPL mainnet
const XRPL_MAINNET = 'wss://xrplcluster.com'

// Bridge wallet address
const BRIDGE_XRPL_ADDRESS = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'

// Destination tag for bridge
const BRIDGE_DESTINATION_TAG = 999
```

### Solana Mainnet

```bash
# RPC endpoint
SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"

# Or use dedicated RPC (recommended for production)
# Helius: https://mainnet.helius-rpc.com/?api-key=<your-key>
# QuickNode: https://your-endpoint.quiknode.pro/
```

## Initial Liquidity Recommendations

### Conservative Launch (Recommended)

```
PEGD Liquidity: 100,000 PEGD
XRP Reserve: 0 XRP (bridge claims from escrows)
Daily Volume Cap: 10,000 PEGD
Max Single Swap: 1,000 PEGD
```

### Standard Launch

```
PEGD Liquidity: 500,000 PEGD
XRP Reserve: 0 XRP
Daily Volume Cap: 50,000 PEGD
Max Single Swap: 5,000 PEGD
```

### Aggressive Launch

```
PEGD Liquidity: 1,000,000 PEGD
XRP Reserve: 0 XRP
Daily Volume Cap: 100,000 PEGD
Max Single Swap: 10,000 PEGD
```

## Security Measures

### 1. Rate Limiting

Add to guardians and relayer:

```typescript
// In guardian.ts
const RATE_LIMIT = 10 // Max 10 attestations per minute
const rateLimitMap = new Map()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const requests = rateLimitMap.get(ip) || []
  const recentRequests = requests.filter(t => now - t < 60000)

  if (recentRequests.length >= RATE_LIMIT) {
    return false
  }

  rateLimitMap.set(ip, [...recentRequests, now])
  return true
}
```

### 2. Daily Volume Limits

```typescript
// In relayer.ts
let dailyVolume = 0
const DAILY_CAP = 100000 * 1_000_000 // 100k PEGD

async function processSwap(state: AttestationState) {
  const pegdAmount = await calculatePEGD(...)

  if (dailyVolume + pegdAmount > DAILY_CAP) {
    throw new Error('Daily volume cap reached')
  }

  dailyVolume += pegdAmount
  // Reset at midnight
}
```

### 3. Emergency Pause

Add pause mechanism:

```rust
// In lib-multisig.rs
#[account]
pub struct Bridge {
    pub authority: Pubkey,
    pub guardians: Vec<Pubkey>,
    pub threshold: u8,
    pub total_swapped: u64,
    pub paused: bool, // NEW
}

pub fn pause_bridge(ctx: Context<PauseBridge>) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.bridge.authority,
        BridgeError::Unauthorized
    );

    ctx.accounts.bridge.paused = true;
    msg!("🛑 Bridge paused");
    Ok(())
}

pub fn swap_xrp_to_pegd(...) -> Result<()> {
    require!(!ctx.accounts.bridge.paused, BridgeError::BridgePaused);
    // ... rest of function
}
```

## Monitoring & Alerts

### 1. Setup Alerts

```typescript
// /app/api/bridge/alerts/route.ts
async function checkBridgeHealth() {
  const checks = [
    { name: 'Guardian 1', url: '/api/bridge/guardian1/status' },
    { name: 'Guardian 2', url: '/api/bridge/guardian2/status' },
    { name: 'Guardian 3', url: '/api/bridge/guardian3/status' },
    { name: 'Relayer', url: '/api/bridge/relayer/status' },
    { name: 'Monitor', url: '/api/bridge/monitor/status' },
  ]

  for (const check of checks) {
    const response = await fetch(`https://pegd.org${check.url}`)
    if (!response.ok) {
      await sendAlert(`${check.name} is down!`)
    }
  }

  // Check liquidity
  const balance = await getBridgePEGDBalance()
  if (balance < 10000 * 1_000_000) {
    await sendAlert(`Low PEGD liquidity: ${balance / 1_000_000} PEGD`)
  }
}

// Run every 5 minutes
setInterval(checkBridgeHealth, 5 * 60 * 1000)
```

### 2. Dashboard Metrics

```typescript
// /app/api/bridge/metrics/route.ts
export async function GET() {
  return json({
    totalSwaps: await getTotalSwaps(),
    totalVolume: await getTotalVolume(),
    bridgeLiquidity: await getBridgeLiquidity(),
    guardianStatus: {
      guardian1: await getGuardianStatus(1),
      guardian2: await getGuardianStatus(2),
      guardian3: await getGuardianStatus(3),
    },
    last24h: {
      swaps: await getSwapsLast24h(),
      volume: await getVolumeLast24h(),
    },
  })
}
```

## Post-Deployment Checklist

- [ ] All components deployed to production
- [ ] Bridge initialized with guardian pubkeys
- [ ] Bridge funded with initial PEGD liquidity
- [ ] Test swap: XRP → PEGD (small amount)
- [ ] Test swap: PEGD → XRP (small amount)
- [ ] Monitoring dashboard live
- [ ] Alerts configured
- [ ] Emergency contacts notified
- [ ] Announce on Twitter/Discord
- [ ] Update documentation with mainnet addresses

## First Production Swap

**Test with small amount first:**

```javascript
// Create 1 XRP escrow on mainnet
const testEscrow = {
  TransactionType: 'EscrowCreate',
  Account: 'rYourWallet...',
  Destination: 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78',
  Amount: '1000000', // 1 XRP
  FinishAfter: Math.floor(Date.now() / 1000) + 60,
  CancelAfter: Math.floor(Date.now() / 1000) + 3600,
  DestinationTag: 999,
  Memos: [{
    Memo: {
      MemoData: Buffer.from('solana:YourSolanaAddress...').toString('hex')
    }
  }]
}

// Submit and monitor
// Expected: Receive ~0.5 PEGD on Solana
```

## Gradual Rollout Plan

### Week 1: Soft Launch
- Invite-only testing
- Max 100 PEGD per swap
- Daily cap: 1,000 PEGD
- Monitor closely

### Week 2-3: Beta Launch
- Public announcement
- Max 1,000 PEGD per swap
- Daily cap: 10,000 PEGD
- Add more liquidity if needed

### Week 4+: Full Launch
- Remove caps (or set high)
- Standard liquidity: 500k+ PEGD
- Apply for Allbridge listing

## Emergency Procedures

### If Guardian Goes Down

1. Check logs to identify issue
2. If >1 hour downtime, consider rotating guardian
3. Bridge continues with 2-of-3 (no action needed)

### If Relayer Goes Down

1. Restart relayer immediately
2. Check pending attestations
3. Manually process if needed

### If Solana Program Has Bug

1. Pause bridge via `pause_bridge` instruction
2. Notify users
3. Deploy fix
4. Resume bridge

### If XRPL Escrow Stuck

1. Check escrow status on XRPL
2. Manually finish via `EscrowFinish` transaction
3. Investigate why relayer didn't finish

## Cost Estimates

**Monthly Costs:**
- Cloudflare Workers: $5/month
- Solana transaction fees: ~$10/month (1000 swaps)
- XRPL transaction fees: ~$1/month
- Dedicated RPC (optional): $50/month
- **Total: $16-66/month**

## Success Metrics

Track after 30 days:
- Total swaps processed
- Total volume bridged
- Average swap time
- Guardian uptime
- Zero security incidents
- User feedback

## Next Steps

After successful mainnet launch:

- **Step 7:** Apply for Allbridge listing
- **Step 8:** Integrate Wormhole for multi-chain
- Monitor and optimize
- Consider adding more guardians (3-of-5, 5-of-9)
- Build frontend UI for bridge
