# Quick Deployment Guide

## Option 1: Deploy via Solana Playground (Fastest - No Local Setup)

**Perfect for testing on devnet without installing anything locally.**

### Steps:

1. Go to https://beta.solpg.io

2. Create new Anchor project:
   - Click "Create a new project"
   - Name: `pegd-bridge`
   - Template: Anchor (Rust)

3. Replace `lib.rs` with our code:
   - Copy contents from `solana-program/programs/pegd-bridge/src/lib.rs`
   - Paste into Solpg editor

4. Update `Cargo.toml`:
   - Copy contents from `solana-program/programs/pegd-bridge/Cargo.toml`

5. Build:
   - Click "Build" button (hammer icon)
   - Wait for compilation (~30 seconds)

6. Deploy to Devnet:
   - Click "Deploy" button
   - Solpg will auto-generate a program keypair
   - Note the Program ID displayed

7. Update program ID:
   - Copy the generated Program ID
   - Update `declare_id!()` in lib.rs
   - Rebuild

8. Initialize bridge:
   - Use Solpg's "Test" feature
   - Call `initialize` with guardian pubkeys:
     ```
     Guardian 1: 21njt4SVgFxwSD9miWYFcF5FRzJHmvYqYtwHjEcwxXFa
     Guardian 2: 9g9mYwHk4B1zU5uTw4mqey48ZBLF4j8s4x5p7JqmkVe6
     Guardian 3: 8Mad2ZsECjQybmS5WH76DSDTPd6QFMKVjkLwVeRcCnam
     ```

**Done!** Your program is deployed on devnet.

---

## Option 2: Local Deployment (Requires Setup)

### Prerequisites

```bash
# Install Solana CLI (if not already running)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.22/install)"
export PATH="/home/cube/.local/share/solana/install/active_release/bin:$PATH"

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

### Build

```bash
cd /home/cube/Desktop/pegd-site/solana-program

# Build program
anchor build

# Get program ID
solana address -k target/deploy/pegd_bridge-keypair.json
# Example output: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS
```

### Update Program ID

Edit `programs/pegd-bridge/src/lib.rs`:
```rust
declare_id!("YOUR_PROGRAM_ID_HERE");
```

Then rebuild:
```bash
anchor build
```

### Deploy to Devnet

```bash
# Configure for devnet
solana config set --url https://api.devnet.solana.com

# Request airdrop
solana airdrop 2

# Deploy
anchor deploy

# Verify
solana program show <YOUR_PROGRAM_ID>
```

### Initialize Bridge

```bash
# Install dependencies
npm install

# Run initialization script
npx ts-node scripts/initialize-bridge.ts
```

---

## Option 3: Docker Deployment (Isolated Environment)

```bash
# Use Solana Docker image
docker run --rm -v $(pwd):/workspace \
  solanalabs/solana:v1.18.22 \
  bash -c "cd /workspace && anchor build && anchor deploy --provider.cluster devnet"
```

---

## Post-Deployment Checklist

After deploying via any method:

- [ ] Save Program ID to `.env`:
  ```bash
  SOLANA_BRIDGE_PROGRAM_ID=<YOUR_PROGRAM_ID>
  ```

- [ ] Initialize bridge with 3 guardians

- [ ] Create bridge token account for PEGD

- [ ] Fund bridge with initial PEGD liquidity

- [ ] Test XRP → PEGD flow on devnet

- [ ] Test PEGD → XRP flow on devnet

---

## Next Steps

**Step 3:** Deploy Guardian Agents to Cloudflare
**Step 4:** Deploy Multi-Sig Relayer
**Step 5:** End-to-end testing on devnet
**Step 6:** Deploy to mainnet

---

## Troubleshooting

**"Program ID mismatch"**
- Make sure `declare_id!()` in lib.rs matches deployed program ID
- Rebuild after updating

**"Insufficient funds"**
- Request another airdrop: `solana airdrop 2`

**"Anchor not found"**
- Add to PATH: `export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"`

**"Transaction too large"**
- Your program compiled successfully but is too large
- This shouldn't happen with our program (~8KB), but if it does, optimize or split into multiple instructions
