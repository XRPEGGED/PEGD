# PEGD Multi-Sig Bridge - Solana Program

Multi-signature bridge program for trustless XRP ↔ PEGD swaps.

## Architecture

- **3 Guardians**: Independent entities that validate bridge operations
- **2-of-3 Threshold**: Requires signatures from at least 2 guardians
- **No Minting**: Uses liquidity pool model (just transfers)
- **Replay Protection**: Each XRPL escrow can only be claimed once

## Guardian Keypairs

Generated via `scripts/generate-guardians.js`:

```
Guardian 1: 21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa
Guardian 2: 9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6
Guardian 3: 8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam
```

Secret keys stored in `.guardian-keys/` directory (gitignored).

## Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.22/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1

# Install Node dependencies
cd solana-program
npm install
```

## Build

```bash
cd solana-program

# Build program
anchor build

# Get program ID
solana address -k target/deploy/pegd_bridge-keypair.json
```

Copy the program ID and update:
1. `Anchor.toml` → `[programs.devnet]` and `[programs.mainnet]`
2. `programs/pegd-bridge/src/lib.rs` → `declare_id!("...")`

Rebuild after updating:
```bash
anchor build
```

## Deploy to Devnet

```bash
# Configure Solana to use devnet
solana config set --url https://api.devnet.solana.com

# Airdrop SOL for deployment (repeat if needed)
solana airdrop 2

# Deploy
anchor deploy

# Verify deployment
solana program show <PROGRAM_ID>
```

## Initialize Bridge

```bash
# Create initialization script
cat > scripts/initialize-bridge.ts << 'EOF'
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { PegdBridge } from "../target/types/pegd_bridge";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PegdBridge as Program<PegdBridge>;

  // Guardian public keys (from generate-guardians.js)
  const guardian1 = new PublicKey("21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa");
  const guardian2 = new PublicKey("9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6");
  const guardian3 = new PublicKey("8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam");

  const [bridge] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge")],
    program.programId
  );

  console.log("Initializing bridge with guardians...");
  console.log("Bridge PDA:", bridge.toBase58());

  const tx = await program.methods
    .initialize(guardian1, guardian2, guardian3)
    .accounts({
      bridge,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Bridge initialized!");
  console.log("Transaction:", tx);
  console.log("\nBridge Account:", bridge.toBase58());

  const bridgeAccount = await program.account.bridge.fetch(bridge);
  console.log("Guardians:", bridgeAccount.guardians.map(g => g.toBase58()));
  console.log("Threshold:", bridgeAccount.threshold);
}

main().catch(console.error);
EOF

# Run initialization
npx ts-node scripts/initialize-bridge.ts
```

## Fund Bridge with PEGD

```bash
# Create PEGD token account for bridge
spl-token create-account <PEGD_MINT_ADDRESS> --owner <BRIDGE_PDA>

# Transfer PEGD to bridge (example: 100,000 PEGD)
spl-token transfer <PEGD_MINT_ADDRESS> 100000 <BRIDGE_TOKEN_ACCOUNT>
```

## Test

```bash
# Run tests against localnet
anchor test

# Test against devnet
anchor test --provider.cluster devnet
```

## Program Functions

### 1. `initialize`
Sets up bridge with 3 guardians and 2-of-3 threshold.

### 2. `swap_xrp_to_pegd`
Releases PEGD to user after verifying guardian signatures for XRPL escrow.

**Parameters:**
- `pegd_amount`: Amount of PEGD to release
- `xrpl_tx_hash`: XRPL transaction hash
- `xrpl_escrow_seq`: XRPL escrow sequence number
- `signatures`: Array of guardian signatures (need 2-of-3)

### 3. `swap_pegd_to_xrp`
Locks PEGD and creates withdrawal request for XRP.

**Parameters:**
- `pegd_amount`: Amount of PEGD to lock
- `xrpl_destination`: XRPL address to receive XRP

### 4. `update_guardians`
Updates guardian set (authority only).

## Security

- ✅ Multi-sig verification (2-of-3 guardians required)
- ✅ Replay protection (each escrow can only be claimed once)
- ✅ Ed25519 signature verification on-chain
- ✅ Program-controlled token accounts (no direct relayer access)
- ✅ Authority-only guardian updates

## Deployment Checklist

- [ ] Build program
- [ ] Deploy to devnet
- [ ] Initialize with guardian pubkeys
- [ ] Create bridge token account
- [ ] Fund with PEGD liquidity
- [ ] Test XRP → PEGD flow
- [ ] Test PEGD → XRP flow
- [ ] Audit code (recommended)
- [ ] Deploy to mainnet
- [ ] Monitor first 100 swaps

## Program Address

**Devnet:** (will be generated on first deploy)
**Mainnet:** (will be deployed after testing)

## Next Steps

After deploying the Solana program:
1. Deploy 3 guardian agents to Cloudflare (Step 3)
2. Deploy multi-sig relayer (Step 4)
3. End-to-end test on devnet (Step 5)
