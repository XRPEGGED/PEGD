# PEGD Bridge - Simplified (No Wrapped Tokens)

**Simple liquidity pool bridge - no minting/burning, just swaps**

## How It Works

```
Bridge Wallets:
├── Solana: Holds PEGD inventory
└── XRPL: Holds XRP inventory (treasury)

Users swap between them at live market rates
```

## User Flow: XRP → PEGD

```
1. User wants to buy from PEGD Market
2. User has 10 XRP, needs 30 PEGD
3. User creates escrow:
   - Locks 10 XRP
   - Memo: Phantom address
   - CancelAfter: 1 hour (safety)

[Bridge automatically processes]

4. Monitor detects escrow
5. Guardian verifies it's legit
6. Relayer:
   - Sends 30 PEGD from bridge wallet → user's Phantom
   - Finishes escrow (10 XRP → treasury)

7. User has 30 PEGD, shops on market
```

## User Flow: PEGD → XRP

```
1. User has PEGD, wants XRP
2. User sends PEGD to bridge Solana address
3. Memo includes: XRPL address to receive XRP

[Bridge automatically processes]

4. Monitor detects PEGD transfer
5. Guardian verifies
6. Relayer sends XRP from treasury → user's XRPL address

7. User has XRP
```

## Components Needed

### **1. Bridge Wallets**

```
Solana:
- Address: (your Phantom/Solflare wallet)
- Holds: PEGD inventory (e.g., 100,000 PEGD)

XRPL:
- Address: rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78
- Holds: XRP treasury
```

### **2. Monitor (Durable Object)**

Watches:
- ✅ XRPL for escrows to bridge address
- ✅ Solana for PEGD transfers to bridge wallet

### **3. Guardian (Durable Object)**

Verifies:
- ✅ Escrow amount matches
- ✅ Valid destination addresses
- ✅ No replay attacks

### **4. Relayer (Durable Object)**

Completes swaps:
- ✅ Transfers PEGD on Solana
- ✅ Finishes escrows / sends XRP on XRPL

## What You DON'T Need

❌ Solana smart contract (no minting)
❌ Wrapped tokens
❌ Complex token programs
❌ Audits for smart contracts

## What You DO Need

✅ Monitor service (Cloudflare DO)
✅ Guardian service (Cloudflare DO)
✅ Relayer service (Cloudflare DO)
✅ Initial PEGD liquidity on Solana
✅ XRP treasury on XRPL

## Liquidity Management

**Initial Setup:**
```
Bridge starts with:
- 100,000 PEGD on Solana
- 10,000 XRP on XRPL

At 1 XRP = 3 PEGD rate:
- Max swaps: ~33,333 XRP → PEGD
- Or: ~100,000 PEGD → XRP
```

**Rebalancing:**
```
If bridge gets low on PEGD:
- You buy PEGD from market
- Transfer to bridge wallet
- Keep accepting XRP

If bridge gets low on XRP:
- Sell PEGD for XRP
- Transfer to treasury
- Keep accepting PEGD
```

## Rate Calculation

```javascript
async function calculateSwap(xrpAmount) {
  // Get live prices
  const xrpPrice = await getXRPPrice()  // e.g., $2.50
  const pegdPrice = await getPEGDPrice() // e.g., $1.00

  // Convert
  const usdValue = xrpAmount * xrpPrice  // 10 XRP = $25
  const pegdAmount = usdValue / pegdPrice // $25 = 25 PEGD

  // Add 0.5% bridge fee (goes to you)
  const fee = pegdAmount * 0.005
  const userReceives = pegdAmount - fee

  return userReceives // User gets 24.875 PEGD
}
```

## Deployment

```bash
# 1. Deploy Cloudflare Durable Objects
npx wrangler deploy functions/api/bridge/monitor.ts
npx wrangler deploy functions/api/bridge/guardian.ts
npx wrangler deploy functions/api/bridge/relayer-simple.ts

# 2. Fund bridge wallets
# Solana: Send PEGD to bridge address
# XRPL: Already funded (treasury)

# 3. Start monitor
curl -X POST https://pegd.org/api/bridge/monitor/start

# Done!
```

## Cost

**Cloudflare Workers:** $5/month
**Liquidity:** Free (you already have PEGD and XRP)

Total: $5/month

## Security

✅ **Escrow protection** - Users can cancel if bridge fails
✅ **No smart contracts** - Less attack surface
✅ **Guardian verification** - Prevents fraud
✅ **Rate limits** - Prevents abuse

## Advantages

vs. Wrapped Tokens:
- ✅ Simpler (no minting/burning)
- ✅ Cheaper (no Solana program)
- ✅ Faster to build
- ✅ Easier to audit

vs. VPS Bridge:
- ✅ No server management
- ✅ Auto-scaling
- ✅ Cheaper

## This is What Allbridge Does

Allbridge is a liquidity pool bridge:
- Holds native tokens on each chain
- Users swap against the pools
- No wrapping/unwrapping

You're building the same model, just for PEGD!

## Ready to Deploy?

This is the simplest, fastest way to launch your bridge:

1. Deploy Durable Objects (10 minutes)
2. Fund Solana wallet with PEGD (5 minutes)
3. Start monitoring (1 command)
4. Test with real escrow
5. Launch! 🚀

**Total build time: ~1 day** (vs. weeks for wrapped token model)

---

**Simple is better. Let's build it!**
