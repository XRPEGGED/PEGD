/**
 * XRPL Monitor as Cloudflare Durable Object
 * Maintains persistent WebSocket connection to XRPL
 */

export class XRPLMonitor {
  state: DurableObjectState
  env: any
  websocket: WebSocket | null = null
  pendingEscrows: Map<string, any> = new Map()

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    // Start monitoring XRPL
    if (url.pathname === '/start') {
      await this.startMonitoring()
      return new Response('Monitor started', { status: 200 })
    }

    // Get pending escrows
    if (url.pathname === '/pending') {
      const escrows = Array.from(this.pendingEscrows.values())
      return Response.json({ escrows })
    }

    return new Response('Not found', { status: 404 })
  }

  async startMonitoring() {
    if (this.websocket) {
      console.log('Already monitoring')
      return
    }

    console.log('🔍 Starting XRPL monitor...')

    // Connect to XRPL
    this.websocket = new WebSocket('wss://xrplcluster.com')

    this.websocket.addEventListener('open', () => {
      console.log('✅ Connected to XRPL')

      // Subscribe to bridge account
      this.websocket!.send(JSON.stringify({
        command: 'subscribe',
        accounts: ['rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78']
      }))
    })

    this.websocket.addEventListener('message', (event) => {
      this.handleXRPLMessage(event.data)
    })

    this.websocket.addEventListener('close', () => {
      console.log('❌ XRPL connection closed, reconnecting...')
      this.websocket = null
      setTimeout(() => this.startMonitoring(), 5000)
    })

    this.websocket.addEventListener('error', (err) => {
      console.error('XRPL error:', err)
    })
  }

  async handleXRPLMessage(data: string) {
    try {
      const message = JSON.parse(data)

      // Only process transactions
      if (message.type !== 'transaction') return

      const tx = message.transaction

      // Only EscrowCreate to bridge address with tag 999
      if (
        tx.TransactionType !== 'EscrowCreate' ||
        tx.Destination !== 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78' ||
        tx.DestinationTag !== 999
      ) {
        return
      }

      console.log('🎯 Bridge escrow detected:', tx.hash)

      // Parse Solana address from memo
      const solanaAddress = this.parseSolanaAddress(tx.Memos)
      if (!solanaAddress) {
        console.error('No Solana address in memo')
        return
      }

      const escrow = {
        xrplTxHash: tx.hash,
        xrplAddress: tx.Account,
        solanaAddress,
        amount: parseInt(tx.Amount),
        escrowSequence: tx.Sequence,
        timestamp: Date.now()
      }

      // Store in durable storage
      await this.state.storage.put(`escrow:${tx.hash}`, escrow)
      this.pendingEscrows.set(tx.hash, escrow)

      // Trigger guardian attestation
      await this.requestAttestation(escrow)

    } catch (err) {
      console.error('Error handling XRPL message:', err)
    }
  }

  parseSolanaAddress(memos?: any[]): string | null {
    if (!memos || memos.length === 0) return null

    try {
      const memoData = memos[0].Memo.MemoData
      return Buffer.from(memoData, 'hex').toString('utf-8').trim()
    } catch {
      return null
    }
  }

  async requestAttestation(escrow: any) {
    // Call guardian DO
    const id = this.env.GUARDIAN.idFromName('guardian-1')
    const stub = this.env.GUARDIAN.get(id)

    await stub.fetch('https://dummy/attest', {
      method: 'POST',
      body: JSON.stringify(escrow)
    })
  }

  async alarm() {
    // Periodic health check
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.log('Websocket not connected, reconnecting...')
      await this.startMonitoring()
    }

    // Schedule next check in 30 seconds
    await this.state.storage.setAlarm(Date.now() + 30000)
  }
}

// Worker entry point to access Durable Object
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const id = env.XRPL_MONITOR.idFromName('monitor-1')
    const stub = env.XRPL_MONITOR.get(id)
    return stub.fetch(request)
  }
}
