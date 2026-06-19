/**
 * Guardian Agent - Independent XRPL Escrow Validator
 * Each guardian runs independently and signs valid escrows
 *
 * Deployment: 3 separate instances with different keypairs
 * - Guardian 1: Your Cloudflare (primary)
 * - Guardian 2: Partner server
 * - Guardian 3: Community member
 */

import { Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';

export class Guardian {
  state: DurableObjectState;
  env: any;
  guardianNumber: number;
  guardianKeypair: Keypair | null = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    // Extract guardian number from DO name
    this.guardianNumber = 1; // Will be set dynamically
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // Initialize guardian with keypair
    if (url.pathname === '/init' && request.method === 'POST') {
      return this.handleInit(request);
    }

    // Receive attestation request from monitor
    if (url.pathname === '/attest' && request.method === 'POST') {
      return this.handleAttestation(request);
    }

    // Get guardian status/public key
    if (url.pathname === '/status') {
      return this.handleStatus();
    }

    return new Response('Not found', { status: 404 });
  }

  async handleInit(request: Request) {
    const { secretKey } = await request.json();

    // Load guardian keypair from secret key array
    const uint8Array = new Uint8Array(secretKey);
    this.guardianKeypair = Keypair.fromSecretKey(uint8Array);

    // Store in Durable Object storage
    await this.state.storage.put('guardianSecretKey', secretKey);
    await this.state.storage.put('guardianPublicKey', this.guardianKeypair.publicKey.toBase58());

    console.log(`🔐 Guardian ${this.guardianNumber} initialized`);
    console.log(`   Public Key: ${this.guardianKeypair.publicKey.toBase58()}`);

    return Response.json({
      success: true,
      publicKey: this.guardianKeypair.publicKey.toBase58(),
    });
  }

  async handleAttestation(request: Request) {
    // Load keypair if not in memory
    if (!this.guardianKeypair) {
      const secretKey = await this.state.storage.get('guardianSecretKey');
      if (!secretKey) {
        return Response.json({ error: 'Guardian not initialized' }, { status: 400 });
      }
      this.guardianKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    }

    const escrow = await request.json();

    console.log(`\n🔍 Guardian ${this.guardianNumber} validating escrow:`);
    console.log(`   XRPL TX: ${escrow.xrplTxHash}`);
    console.log(`   Sequence: ${escrow.escrowSequence}`);
    console.log(`   Amount: ${escrow.amount} drops`);

    // Step 1: Verify escrow exists on XRPL
    const isValid = await this.verifyEscrowOnChain(escrow);

    if (!isValid) {
      console.log(`   ❌ Escrow verification failed`);
      return Response.json({
        valid: false,
        error: 'Escrow not found or invalid',
      });
    }

    console.log(`   ✅ Escrow verified on-chain`);

    // Step 2: Calculate PEGD amount
    const pegdAmount = await this.calculatePEGDAmount(escrow.amount);

    // Step 3: Create signature message
    const message = this.createAttestationMessage(escrow, pegdAmount);

    // Step 4: Sign with guardian keypair (Ed25519)
    const signature = this.signMessage(message);

    console.log(`   ✍️  Signed attestation`);
    console.log(`   PEGD Amount: ${pegdAmount / 1_000_000} PEGD`);

    // Step 5: Submit signature to relayer
    await this.submitSignatureToRelayer(escrow, signature);

    return Response.json({
      valid: true,
      signature: Buffer.from(signature).toString('hex'),
      guardianPubkey: this.guardianKeypair.publicKey.toBase58(),
      pegdAmount,
      message,
    });
  }

  async verifyEscrowOnChain(escrow: any): Promise<boolean> {
    try {
      // Query XRPL to verify escrow exists
      const response = await fetch('https://xrplcluster.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'account_objects',
          params: [{
            account: escrow.xrplAddress,
            ledger_index: 'validated',
            type: 'escrow',
          }],
        }),
      });

      const data = await response.json();

      if (!data.result || !data.result.account_objects) {
        return false;
      }

      // Find matching escrow
      const matchingEscrow = data.result.account_objects.find((obj: any) =>
        obj.Destination === this.env.BRIDGE_XRPL_ADDRESS &&
        obj.Amount === escrow.amount.toString()
      );

      if (!matchingEscrow) {
        return false;
      }

      // Verify Solana address in memo
      const memo = escrow.memos?.[0]?.Memo?.MemoData;
      if (memo) {
        const decodedMemo = Buffer.from(memo, 'hex').toString('utf8');
        const solanaAddress = decodedMemo.match(/solana:([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];

        if (solanaAddress !== escrow.solanaAddress) {
          console.log(`   ⚠️  Solana address mismatch in memo`);
          return false;
        }
      }

      // All checks passed
      return true;

    } catch (error) {
      console.error('   ❌ XRPL verification error:', error);
      return false;
    }
  }

  async calculatePEGDAmount(xrpDrops: number): Promise<number> {
    // Convert drops to XRP
    const xrpAmount = xrpDrops / 1_000_000;

    // Get live prices
    const response = await fetch('https://pegd.org/api/market/prices');
    const data = await response.json();

    const xrpPrice = data.pricesUsd.XRP || 0.50; // Fallback price
    const pegdPrice = data.pricesUsd.PEGD || 1.0;

    // Calculate PEGD equivalent
    const usdValue = xrpAmount * xrpPrice;
    const pegdAmount = usdValue / pegdPrice;

    // Return in base units (6 decimals)
    return Math.floor(pegdAmount * 1_000_000);
  }

  createAttestationMessage(escrow: any, pegdAmount: number): string {
    // Message format matches what Solana program expects
    return `${escrow.xrplTxHash}:${escrow.escrowSequence}:${pegdAmount}:${escrow.solanaAddress}`;
  }

  signMessage(message: string): Uint8Array {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.guardianKeypair!.secretKey);
    return signature;
  }

  async submitSignatureToRelayer(escrow: any, signature: Uint8Array) {
    try {
      const response = await fetch(`${this.env.RELAYER_URL}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrow,
          signature: Buffer.from(signature).toString('hex'),
          guardianPubkey: this.guardianKeypair!.publicKey.toBase58(),
        }),
      });

      const result = await response.json();
      console.log(`   📤 Signature submitted to relayer:`, result.success ? 'OK' : 'Failed');

    } catch (error) {
      console.error('   ❌ Failed to submit signature to relayer:', error);
    }
  }

  async handleStatus() {
    const publicKey = await this.state.storage.get('guardianPublicKey');

    return Response.json({
      guardianNumber: this.guardianNumber,
      publicKey: publicKey || 'Not initialized',
      initialized: !!publicKey,
    });
  }
}

// Worker entry points - 3 separate DO classes for each guardian

export class Guardian1 extends Guardian {
  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.guardianNumber = 1;
  }
}

export class Guardian2 extends Guardian {
  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.guardianNumber = 2;
  }
}

export class Guardian3 extends Guardian {
  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.guardianNumber = 3;
  }
}

// HTTP endpoints for each guardian
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // Route to appropriate guardian based on path
    if (url.pathname.startsWith('/guardian1')) {
      const id = env.GUARDIAN1.idFromName('guardian-1');
      const stub = env.GUARDIAN1.get(id);
      const newUrl = new URL(request.url);
      newUrl.pathname = newUrl.pathname.replace('/guardian1', '');
      return stub.fetch(new Request(newUrl, request));
    }

    if (url.pathname.startsWith('/guardian2')) {
      const id = env.GUARDIAN2.idFromName('guardian-2');
      const stub = env.GUARDIAN2.get(id);
      const newUrl = new URL(request.url);
      newUrl.pathname = newUrl.pathname.replace('/guardian2', '');
      return stub.fetch(new Request(newUrl, request));
    }

    if (url.pathname.startsWith('/guardian3')) {
      const id = env.GUARDIAN3.idFromName('guardian-3');
      const stub = env.GUARDIAN3.get(id);
      const newUrl = new URL(request.url);
      newUrl.pathname = newUrl.pathname.replace('/guardian3', '');
      return stub.fetch(new Request(newUrl, request));
    }

    return new Response('Guardian not found', { status: 404 });
  },
};
