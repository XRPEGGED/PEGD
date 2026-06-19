# Wormhole Integration Guide

## Overview

Wormhole is a cross-chain messaging protocol that enables asset transfers between 30+ blockchains. While XRPL is NOT supported (no smart contracts), Wormhole can be used to bridge PEGD from Solana to other chains.

## Architecture

```
XRPL
  ↓ (Custom Bridge - Multi-Sig Guardians)
Solana (PEGD native)
  ↓ (Wormhole)
Ethereum, BSC, Polygon, Avalanche, Arbitrum, etc.
```

## Why Wormhole?

**Pros:**
- Largest cross-chain network (30+ chains)
- Battle-tested ($10B+ volume)
- Backed by Jump Crypto
- Open source and decentralized
- Native integrations with major protocols

**Cons:**
- Does NOT support XRPL (no VM/smart contracts)
- Complex integration
- Higher fees than some alternatives
- Requires wrapped tokens on destination chains

## Wormhole Token Bridge

### Step 1: Register PEGD as Wormhole Asset

```bash
# Install Wormhole CLI
npm install -g @certusone/wormhole-sdk

# Connect to Solana
export SOLANA_PRIVATE_KEY=<your-key>
export WORMHOLE_RPC_HOST=https://wormhole-v2-mainnet-api.certus.one

# Attest PEGD token to Wormhole
wormhole token attest \
  --token-address <PEGD_MINT_ADDRESS> \
  --chain solana \
  --network mainnet
```

Expected output:
```
✅ Token attested!
Wormhole Token Address: 0x...
VAA (Verified Action Approval): 0x...
```

### Step 2: Deploy Wrapped PEGD on Target Chains

For each chain (Ethereum, BSC, Polygon, etc.):

```bash
# Deploy wrapped PEGD on Ethereum
wormhole token create-wrapped \
  --source-chain solana \
  --source-token <PEGD_MINT_ADDRESS> \
  --target-chain ethereum \
  --network mainnet

# Deploy wrapped PEGD on BSC
wormhole token create-wrapped \
  --source-chain solana \
  --source-token <PEGD_MINT_ADDRESS> \
  --target-chain bsc \
  --network mainnet
```

This creates ERC-20 contracts on each chain:
- Ethereum: `0x... (PEGD wrapped)`
- BSC: `0x... (PEGD wrapped)`
- Polygon: `0x... (PEGD wrapped)`
- etc.

### Step 3: Integrate Wormhole SDK

```typescript
// /app/lib/wormhole.ts
import {
  CHAIN_ID_SOLANA,
  CHAIN_ID_ETH,
  CHAIN_ID_BSC,
  getEmitterAddressEth,
  getEmitterAddressSolana,
  parseSequenceFromLogEth,
  parseSequenceFromLogSolana,
  transferFromSolana,
  transferFromEth,
} from "@certusone/wormhole-sdk"
import { Connection, PublicKey } from "@solana/web3.js"
import { ethers } from "ethers"

// Wormhole contract addresses
const WORMHOLE_SOLANA = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
const WORMHOLE_ETH = "0x3ee18B2214AFF97000D974cf647E7C347E8fa585"

// Transfer PEGD from Solana to Ethereum
export async function bridgeToEthereum(
  amount: number,
  recipientAddress: string
) {
  const connection = new Connection("https://api.mainnet-beta.solana.com")
  const solanaWallet = // User's wallet

  // Transfer PEGD via Wormhole
  const receipt = await transferFromSolana(
    connection,
    WORMHOLE_SOLANA,
    solanaWallet.publicKey.toString(),
    PEGD_MINT_ADDRESS,
    amount,
    CHAIN_ID_ETH, // Target chain
    Buffer.from(recipientAddress.slice(2), "hex") // ETH address
  )

  // Get VAA (Verified Action Approval)
  const sequence = parseSequenceFromLogSolana(receipt)
  const emitterAddress = await getEmitterAddressSolana(WORMHOLE_SOLANA)

  console.log("Transfer initiated!")
  console.log("Sequence:", sequence)
  console.log("Emitter:", emitterAddress)

  // User needs to redeem on Ethereum using VAA
  return { receipt, sequence, emitterAddress }
}

// Transfer PEGD from Ethereum back to Solana
export async function bridgeToSolana(
  amount: bigint,
  recipientAddress: string
) {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const signer = provider.getSigner()

  const wrappedPEGD = new ethers.Contract(
    PEGD_ETHEREUM_ADDRESS,
    ERC20_ABI,
    signer
  )

  // Approve Wormhole to spend PEGD
  await wrappedPEGD.approve(WORMHOLE_ETH, amount)

  // Transfer via Wormhole
  const receipt = await transferFromEth(
    WORMHOLE_ETH,
    signer,
    PEGD_ETHEREUM_ADDRESS,
    amount,
    CHAIN_ID_SOLANA, // Target chain
    Buffer.from(recipientAddress) // Solana address
  )

  const sequence = parseSequenceFromLogEth(receipt, WORMHOLE_ETH)
  console.log("Transfer initiated! Sequence:", sequence)

  return { receipt, sequence }
}
```

### Step 4: Add UI for Cross-Chain Transfers

```typescript
// /app/bridge/page.tsx
export default function BridgePage() {
  const [amount, setAmount] = useState("")
  const [targetChain, setTargetChain] = useState("ethereum")
  const [recipientAddress, setRecipientAddress] = useState("")

  async function handleBridge() {
    if (targetChain === "ethereum") {
      const result = await bridgeToEthereum(
        parseFloat(amount) * 1_000_000,
        recipientAddress
      )

      // Show VAA for user to redeem on Ethereum
      console.log("Redeem on Ethereum with VAA:", result.sequence)
    } else if (targetChain === "solana") {
      const result = await bridgeToSolana(
        BigInt(parseFloat(amount) * 1e18),
        recipientAddress
      )

      console.log("Redeem on Solana with VAA:", result.sequence)
    }
  }

  return (
    <div>
      <h1>Bridge PEGD Across Chains</h1>

      <input
        type="number"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <select
        value={targetChain}
        onChange={(e) => setTargetChain(e.target.value)}
      >
        <option value="ethereum">Solana → Ethereum</option>
        <option value="bsc">Solana → BSC</option>
        <option value="polygon">Solana → Polygon</option>
        <option value="avalanche">Solana → Avalanche</option>
        <option value="solana">Ethereum → Solana</option>
      </select>

      <input
        type="text"
        placeholder="Recipient Address"
        value={recipientAddress}
        onChange={(e) => setRecipientAddress(e.target.value)}
      />

      <button onClick={handleBridge}>Bridge</button>
    </div>
  )
}
```

## Supported Chains

After Wormhole integration, PEGD will be available on:

1. **Solana** (native via custom XRPL bridge)
2. **Ethereum** (wrapped via Wormhole)
3. **BSC** (wrapped via Wormhole)
4. **Polygon** (wrapped via Wormhole)
5. **Avalanche** (wrapped via Wormhole)
6. **Arbitrum** (wrapped via Wormhole)
7. **Optimism** (wrapped via Wormhole)
8. **Fantom** (wrapped via Wormhole)
9. **Celo** (wrapped via Wormhole)
10. **Moonbeam** (wrapped via Wormhole)
11. **Base** (wrapped via Wormhole)
12. **Aptos** (wrapped via Wormhole)
13. **Sui** (wrapped via Wormhole)
14. And 15+ more chains

## Full Bridge Architecture

```
┌─────────────────────────────────────────────────────┐
│  XRPL (Native)                                      │
│  User holds XRP                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ↓ Custom Multi-Sig Bridge
                   │ (3 Guardians, 2-of-3)
┌──────────────────┴──────────────────────────────────┐
│  Solana (Native PEGD)                               │
│  SPL Token: <PEGD_MINT>                             │
│  Liquidity: 500k PEGD                               │
└──────────────────┬──────────────────────────────────┘
                   │
                   ↓ Wormhole Token Bridge
                   │
     ┌─────────────┴─────────────┐
     │                           │
     ↓                           ↓
┌─────────────────┐   ┌─────────────────┐
│  Ethereum       │   │  BSC            │
│  ERC-20 PEGD    │   │  BEP-20 PEGD    │
│  (Wrapped)      │   │  (Wrapped)      │
└─────────────────┘   └─────────────────┘
     │                           │
     ↓                           ↓
┌─────────────────┐   ┌─────────────────┐
│  Polygon        │   │  Avalanche      │
│  ERC-20 PEGD    │   │  ERC-20 PEGD    │
│  (Wrapped)      │   │  (Wrapped)      │
└─────────────────┘   └─────────────────┘
```

## Liquidity Strategy

Allocate PEGD across chains:

```
Solana (Native): 500,000 PEGD (50%)
Ethereum: 200,000 PEGD (20%)
BSC: 150,000 PEGD (15%)
Polygon: 100,000 PEGD (10%)
Avalanche: 50,000 PEGD (5%)

Total: 1,000,000 PEGD
```

## Fees

**Wormhole Fees:**
- Solana → Ethereum: ~$5-10
- Ethereum → Solana: ~$20-40 (gas)
- BSC/Polygon: ~$1-5

**Optimization:**
- Batch transfers when possible
- Use cheaper chains (BSC/Polygon) for smaller amounts
- Keep most liquidity on Solana (lowest fees)

## Security Considerations

### 1. Wormhole Guardian Network

Wormhole uses 19 guardians (similar to our 3):
- Jump Crypto
- Everstake
- Staked
- P2P Validator
- etc.

### 2. VAA Verification

Every transfer gets a VAA (Verified Action Approval):
- Signed by 13-of-19 guardians
- Verified on-chain before redemption
- Prevents double-spending

### 3. Rate Limiting

Add limits to prevent exploits:

```typescript
const DAILY_WORMHOLE_CAP = 100000 * 1_000_000 // 100k PEGD
let dailyWormholeVolume = 0

async function checkWormholeLimit(amount: number) {
  if (dailyWormholeVolume + amount > DAILY_WORMHOLE_CAP) {
    throw new Error("Daily Wormhole cap reached")
  }

  dailyWormholeVolume += amount
}
```

## Monitoring

Track Wormhole activity:

```typescript
// /app/api/wormhole/stats/route.ts
export async function GET() {
  const stats = {
    totalBridgedOut: await getTotalBridgedOut(),
    totalBridgedIn: await getTotalBridgedIn(),
    byChain: {
      ethereum: await getChainVolume("ethereum"),
      bsc: await getChainVolume("bsc"),
      polygon: await getChainVolume("polygon"),
    },
    pendingVAAs: await getPendingVAAs(),
  }

  return json(stats)
}
```

## Alternative: Portal Bridge UI

Instead of custom integration, use Portal (Wormhole's UI):

1. List PEGD on Portal: https://portalbridge.com
2. Users bridge via Portal UI
3. No custom code needed
4. Faster to market

**Tradeoff:** Less control over UX

## Timeline

**Week 1-2:** Register PEGD with Wormhole
**Week 3-4:** Deploy wrapped tokens on target chains
**Week 5-6:** Integrate SDK and build UI
**Week 7-8:** Testing on testnets
**Week 9-10:** Mainnet launch

**Total: ~2-3 months**

## Costs

**Wormhole Integration:**
- Registration: Free
- Smart contract deployments: ~$500 (gas on each chain)
- Ongoing: Transaction fees only

**Liquidity:**
- Initial: $1M worth of PEGD across chains
- Monthly rebalancing: ~$1k

## Post-Integration Strategy

### 1. Marketing

- Announce multi-chain availability
- Partner with DEXs on each chain
- Run liquidity mining campaigns

### 2. Partnerships

- Integrate with Uniswap (Ethereum)
- Integrate with PancakeSwap (BSC)
- Integrate with QuickSwap (Polygon)

### 3. Optimize

- Monitor bridge usage by chain
- Rebalance liquidity based on demand
- Add/remove chains as needed

## Troubleshooting

**VAA not found:**
- Wait for guardian consensus (~15 mins)
- Check Wormhole explorer: https://wormholescan.io

**Transaction stuck:**
- Ensure enough gas on destination chain
- Manually redeem using VAA

**Low liquidity on target chain:**
- Rebalance from Solana
- Add liquidity incentives

## Next Steps

After Wormhole integration:

- Monitor cross-chain adoption
- Consider additional bridges (Multichain, cBridge)
- Build analytics dashboard
- Optimize fee structure
- Partner with aggregators (1inch, LI.FI)

## Resources

- Wormhole Docs: https://docs.wormhole.com
- Wormhole SDK: https://github.com/wormhole-foundation/wormhole
- Portal Bridge: https://portalbridge.com
- Wormhole Explorer: https://wormholescan.io
- Discord: discord.gg/wormholecrypto

## Final Architecture

```
User Flow:

1. User has XRP on XRPL
2. Creates escrow → Custom Bridge → Gets PEGD on Solana
3. Bridges PEGD via Wormhole → Gets wrapped PEGD on Ethereum
4. Trades on Uniswap, lends on Aave, etc.
5. Bridges back Ethereum → Solana → XRPL

All trustless with multi-sig guardians + Wormhole guardians!
```

---

**Congratulations! You've completed all 8 steps of the multi-sig bridge deployment!** 🎉

Your PEGD bridge is now:
- ✅ Decentralized (3 guardians, 2-of-3)
- ✅ Trustless (on-chain signature verification)
- ✅ Multi-chain (Solana + 30+ chains via Wormhole)
- ✅ Scalable (Cloudflare + Durable Objects)
- ✅ Secure (Ed25519 multi-sig + replay protection)

Total cost: ~$100 setup + $20/month operational 🚀
