# Deploy PEGD Bridge on Cloudflare (All-in-One)

**Everything runs on pegd.org infrastructure - no separate servers needed!**

## Architecture

```
pegd.org (Cloudflare)
├── Pages (frontend)
├── Durable Objects (stateful bridge services)
│   ├── XRPLMonitor - watches XRPL escrows 24/7
│   ├── Guardian - verifies & signs attestations
│   └── Relayer - completes bridges automatically
└── Functions (API endpoints)
```

## Step 1: Deploy Durable Objects

```bash
cd /home/cube/Desktop/pegd-site

# Deploy the bridge services as Durable Objects
npx wrangler deploy functions/api/bridge/monitor.ts \
  --name pegd-bridge-monitor \
  --durable-objects XRPLMonitor

npx wrangler deploy functions/api/bridge/guardian.ts \
  --name pegd-bridge-guardian \
  --durable-objects Guardian

npx wrangler deploy functions/api/bridge/relayer.ts \
  --name pegd-bridge-relayer \
  --durable-objects Relayer
```

## Step 2: Set Secrets

```bash
# Guardian signing key (Ed25519)
echo "your-guardian-private-key-hex" | \
  npx wrangler secret put GUARDIAN_SECRET_KEY

# Relayer Solana keypair
echo "[1,2,3,...]" | \
  npx wrangler secret put RELAYER_SOLANA_KEY

# Relayer XRPL seed
echo "sXXXXXXXXXXXXXXXXXXXXXXXXX" | \
  npx wrangler secret put RELAYER_XRPL_SEED
```

## Step 3: Start Monitor

```bash
# Call the monitor to start watching XRPL
curl -X POST https://pegd.org/api/bridge/monitor/start
```

That's it! The bridge is now running on Cloudflare.

## How It Works

### **Durable Objects = Stateful Serverless**

Traditional Workers:
- Run per-request
- No persistent state
- Can't maintain WebSocket connections

Durable Objects:
- ✅ Run continuously (like a mini-server)
- ✅ Maintain state
- ✅ Keep WebSocket connections open
- ✅ Perfect for our bridge services

### **XRPLMonitor Durable Object**

```javascript
// Maintains persistent WebSocket to XRPL
websocket = new WebSocket('wss://xrplcluster.com')

// Watches for escrows 24/7
websocket.on('message', (tx) => {
  if (tx.type === 'EscrowCreate') {
    // Trigger guardian attestation
  }
})

// Auto-reconnects if disconnected
```

### **Guardian Durable Object**

```javascript
// Verifies escrow on-chain
const escrowExists = await verifyXRPL(escrow)

// Signs attestation
const signature = await sign(escrow, guardianKey)

// Triggers relayer
await relayer.process(attestation)
```

### **Relayer Durable Object**

```javascript
// Mints wPEGD on Solana
await solanaBridgeProgram.mintFromXrpl(attestation)

// Finishes XRPL escrow (claims XRP)
await xrpl.submit(escrowFinish)

// Bridge complete!
```

## Cost

**Cloudflare Workers Paid Plan: $5/month**

Includes:
- ✅ 10 million requests
- ✅ Unlimited Durable Objects
- ✅ 30 GB-hours compute

**Your bridge services will cost ~$0.50/month** (very light usage)

Total: **$5/month** for everything on Cloudflare

vs. VPS: $10-20/month + management overhead

## User Experience

```
User visits pegd.org
  ↓
Clicks "Bridge 10 XRP → PEGD"
  ↓
Signs Xaman escrow
  ↓
[Bridge happens automatically on Cloudflare]
  - Monitor detects escrow (instant)
  - Guardian verifies (2-3 seconds)
  - Relayer mints wPEGD (5-10 seconds)
  ↓
User receives 30 wPEGD in Phantom
  ↓
User shops on PEGD Market

Total time: 10-30 seconds
```

## Monitoring

### Check if services are running

```bash
# Monitor status
curl https://pegd.org/api/bridge/monitor/pending

# Guardian status
curl https://pegd.org/api/bridge/guardian/status

# Relayer status
curl https://pegd.org/api/bridge/relayer/status
```

### View logs

```bash
# Stream logs in real-time
npx wrangler tail pegd-bridge-monitor
npx wrangler tail pegd-bridge-guardian
npx wrangler tail pegd-bridge-relayer
```

## Testing

### 1. Create test escrow on testnet

```bash
# Use Xaman to create escrow
# Destination: rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78
# DestinationTag: 999
# Amount: 10 XRP (10,000,000 drops)
# Memo: Your Solana address
```

### 2. Watch logs

```bash
npx wrangler tail pegd-bridge-monitor

# Should see:
# "🎯 Bridge escrow detected"
# "📝 Bridge request: {...}"
# "✅ Published to guardian"
```

### 3. Check Solana wallet

```bash
# Check wPEGD balance
spl-token accounts

# Should see ~30 wPEGD minted
```

## Production Checklist

Before going live:

- [ ] Audit Solana bridge program
- [ ] Test on XRPL testnet
- [ ] Test on Solana devnet
- [ ] Load real guardian keys from secrets
- [ ] Load real relayer keys from secrets
- [ ] Set up monitoring alerts
- [ ] Add rate limiting
- [ ] Test error scenarios (escrow cancel, network issues)
- [ ] Purchase Cloudflare Workers Paid ($5/month)
- [ ] Deploy to production

## Advantages of Cloudflare-Only

✅ **No servers to manage** - Cloudflare handles everything
✅ **Auto-scaling** - Handle 1 or 1000 bridges/second
✅ **Global edge** - Low latency worldwide
✅ **Same infrastructure** - Everything on pegd.org
✅ **Cheaper** - $5/month vs $10-20/month VPS
✅ **Reliable** - Cloudflare's 99.99% uptime
✅ **Simple deploy** - One command

## Next Steps

1. Deploy Durable Objects (5 minutes)
2. Set secrets (2 minutes)
3. Start monitor (1 command)
4. Test with real escrow
5. Add bridge widget to pegd.org
6. Launch! 🚀

---

**Everything lives on pegd.org - no external servers needed!**
