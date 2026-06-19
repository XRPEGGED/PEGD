/**
 * Multi-Sig Relayer - Collects signatures from multiple guardians
 * Submits to Solana program only when threshold reached (2-of-3)
 */

export class MultiSigRelayer {
  state: DurableObjectState
  env: any
  pendingAttestations: Map<string, AttestationState> = new Map()

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    // Receive signature from a guardian
    if (url.pathname === '/signature' && request.method === 'POST') {
      const { escrow, signature, guardianPubkey } = await request.json()
      await this.addSignature(escrow, signature, guardianPubkey)
      return Response.json({ success: true })
    }

    // Check status
    if (url.pathname === '/status') {
      return Response.json({
        pending: this.pendingAttestations.size
      })
    }

    return new Response('Not found', { status: 404 })
  }

  async addSignature(escrow: any, signature: string, guardianPubkey: string) {
    const key = `${escrow.xrplTxHash}:${escrow.escrowSequence}`

    // Get or create attestation state
    let state = this.pendingAttestations.get(key)
    if (!state) {
      state = {
        escrow,
        signatures: [],
        threshold: 2, // Need 2-of-3
        createdAt: Date.now()
      }
      this.pendingAttestations.set(key, state)
    }

    // Add signature if not already present
    if (!state.signatures.find(s => s.guardianPubkey === guardianPubkey)) {
      state.signatures.push({ guardianPubkey, signature })
      console.log(`📝 Signature ${state.signatures.length}/3 received for ${key}`)
    }

    // Check if we have enough signatures
    if (state.signatures.length >= state.threshold) {
      console.log(`✅ Threshold reached (${state.signatures.length}/${state.threshold})`)
      await this.processSwap(state)
      this.pendingAttestations.delete(key)
    }
  }

  async processSwap(state: AttestationState) {
    const { escrow, signatures } = state

    console.log('⚡ Processing multi-sig swap:', escrow.xrplTxHash)

    // Calculate PEGD amount
    const xrpAmount = escrow.amount / 1_000_000
    const pegdAmount = await this.calculatePEGD(xrpAmount)

    // Call Solana program with multiple signatures
    await this.callSolanaProgram(escrow, pegdAmount, signatures)

    // Finish XRPL escrow
    await this.finishXRPLEscrow(escrow)

    console.log('✅ Multi-sig swap complete')
  }

  async calculatePEGD(xrpAmount: number): Promise<number> {
    // Get live prices from your API
    const response = await fetch('https://pegd.org/api/market/prices')
    const data = await response.json()

    const xrpPrice = data.pricesUsd.XRP
    const pegdPrice = data.pricesUsd.PEGD || 1.0

    const usdValue = xrpAmount * xrpPrice
    const pegdAmount = usdValue / pegdPrice

    return Math.floor(pegdAmount * 1_000_000) // 6 decimals
  }

  async callSolanaProgram(
    escrow: any,
    pegdAmount: number,
    signatures: GuardianSig[]
  ) {
    console.log('🏗️ Calling Solana program with multi-sig...')

    // Build transaction to call swap_xrp_to_pegd
    const guardianSignatures = signatures.map(s => ({
      guardian_pubkey: s.guardianPubkey,
      signature: Array.from(Buffer.from(s.signature, 'hex'))
    }))

    // Prepare Solana transaction
    const transaction = {
      programId: this.env.SOLANA_BRIDGE_PROGRAM_ID,
      instruction: 'swap_xrp_to_pegd',
      accounts: {
        bridge: await this.getBridgePDA(),
        bridgePegdAccount: this.env.BRIDGE_PEGD_ACCOUNT,
        recipientPegdAccount: await this.getOrCreateUserTokenAccount(escrow.solanaAddress),
        recipient: escrow.solanaAddress,
        swapRecord: await this.getSwapRecordPDA(escrow.xrplTxHash),
        payer: this.env.RELAYER_KEYPAIR_PUBKEY,
        tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        systemProgram: '11111111111111111111111111111111'
      },
      args: {
        pegd_amount: pegdAmount,
        xrpl_tx_hash: escrow.xrplTxHash,
        xrpl_escrow_seq: escrow.escrowSequence,
        signatures: guardianSignatures // Multi-sig!
      }
    }

    console.log(`📤 Submitting to Solana with ${signatures.length} guardian signatures`)

    try {
      // Call Solana RPC to submit transaction
      // In production, use @solana/web3.js
      const response = await fetch(this.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [transaction]
        })
      })

      const result = await response.json()

      if (result.result) {
        console.log(`✅ Solana transaction submitted:`, result.result)
        return result.result
      } else {
        console.error(`❌ Solana transaction failed:`, result.error)
        throw new Error('Solana transaction failed')
      }

    } catch (error) {
      console.error('❌ Failed to call Solana program:', error)
      throw error
    }
  }

  async getBridgePDA(): Promise<string> {
    // Calculate Bridge PDA: seeds = [b"bridge"]
    // For now, return from env
    return this.env.BRIDGE_PDA || 'BridgePDA'
  }

  async getSwapRecordPDA(xrplTxHash: string): Promise<string> {
    // Calculate SwapRecord PDA: seeds = [b"swap", xrpl_tx_hash]
    // For now, return placeholder
    return `SwapRecord_${xrplTxHash}`
  }

  async getOrCreateUserTokenAccount(solanaAddress: string): Promise<string> {
    // Get or create associated token account for user
    // For now, return placeholder
    return `UserTokenAccount_${solanaAddress}`
  }

  async finishXRPLEscrow(escrow: any) {
    console.log('🔓 Finishing XRPL escrow...')

    const finishTx = {
      TransactionType: 'EscrowFinish',
      Account: this.env.BRIDGE_XRPL_ADDRESS,
      Owner: escrow.xrplAddress,
      OfferSequence: escrow.escrowSequence
    }

    // Submit to XRPL
    console.log(`✅ Would finish escrow ${escrow.escrowSequence}`)
  }

  async alarm() {
    // Clean up old pending attestations (older than 1 hour)
    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    for (const [key, state] of this.pendingAttestations.entries()) {
      if (now - state.createdAt > oneHour) {
        console.log(`🧹 Cleaning up expired attestation: ${key}`)
        this.pendingAttestations.delete(key)
      }
    }

    // Schedule next cleanup
    await this.state.storage.setAlarm(Date.now() + 60000) // Every minute
  }
}

interface GuardianSig {
  guardianPubkey: string
  signature: string
}

interface AttestationState {
  escrow: any
  signatures: GuardianSig[]
  threshold: number
  createdAt: number
}

// Worker entry point
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const id = env.MULTISIG_RELAYER.idFromName('relayer-1')
    const stub = env.MULTISIG_RELAYER.get(id)
    return stub.fetch(request)
  }
}
