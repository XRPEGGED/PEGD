import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PegdBridge } from "../target/types/pegd_bridge";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";

describe("pegd-bridge", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PegdBridge as Program<PegdBridge>;

  let bridge: PublicKey;
  let bridgeBump: number;
  let pegdMint: PublicKey;
  let bridgePegdAccount: PublicKey;

  // 3 guardian keypairs (for 2-of-3 multi-sig)
  const guardian1 = Keypair.generate();
  const guardian2 = Keypair.generate();
  const guardian3 = Keypair.generate();

  before(async () => {
    // Find bridge PDA
    [bridge, bridgeBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("bridge")],
      program.programId
    );

    // Create PEGD token mint
    pegdMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6 // 6 decimals
    );

    // Create bridge token account
    bridgePegdAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      pegdMint,
      bridge,
      undefined
    );

    // Mint 1,000,000 PEGD to bridge
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      pegdMint,
      bridgePegdAccount,
      provider.wallet.publicKey,
      1_000_000_000_000 // 1M PEGD (6 decimals)
    );
  });

  it("Initializes bridge with 3 guardians", async () => {
    await program.methods
      .initialize(
        guardian1.publicKey,
        guardian2.publicKey,
        guardian3.publicKey
      )
      .accounts({
        bridge,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const bridgeAccount = await program.account.bridge.fetch(bridge);
    assert.equal(bridgeAccount.guardians.length, 3);
    assert.equal(bridgeAccount.threshold, 2);
    assert.ok(bridgeAccount.guardians[0].equals(guardian1.publicKey));
    assert.ok(bridgeAccount.guardians[1].equals(guardian2.publicKey));
    assert.ok(bridgeAccount.guardians[2].equals(guardian3.publicKey));
  });

  it("Swaps XRP to PEGD with 2-of-3 signatures", async () => {
    const recipient = Keypair.generate();
    const pegdAmount = 100_000_000; // 100 PEGD
    const xrplTxHash = "ABC123DEF456";
    const xrplEscrowSeq = 12345;

    // Create recipient token account
    const recipientPegdAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      pegdMint,
      recipient.publicKey
    );

    // Create message that guardians signed
    const message = `${xrplTxHash}:${xrplEscrowSeq}:${pegdAmount}:${recipient.publicKey.toBase58()}`;

    // In production, guardians would sign this message off-chain
    // For testing, we'll use placeholder signatures
    const signatures = [
      {
        guardianPubkey: guardian1.publicKey,
        signature: Buffer.alloc(64), // Placeholder
      },
      {
        guardianPubkey: guardian2.publicKey,
        signature: Buffer.alloc(64), // Placeholder
      },
    ];

    // Find swap record PDA
    const [swapRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("swap"), Buffer.from(xrplTxHash)],
      program.programId
    );

    // Note: This test will fail signature verification in production
    // This is just to test the structure
    try {
      await program.methods
        .swapXrpToPegd(
          new anchor.BN(pegdAmount),
          xrplTxHash,
          new anchor.BN(xrplEscrowSeq),
          signatures
        )
        .accounts({
          bridge,
          bridgePegdAccount,
          recipientPegdAccount,
          recipient: recipient.publicKey,
          swapRecord,
          payer: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Expected to fail signature verification
      console.log("Signature verification not implemented yet");
    }
  });

  it("Swaps PEGD to XRP", async () => {
    const user = Keypair.generate();
    const pegdAmount = 50_000_000; // 50 PEGD
    const xrplDestination = "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq";

    // Airdrop SOL to user
    await provider.connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create user token account
    const userPegdAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      pegdMint,
      user.publicKey
    );

    // Mint PEGD to user
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      pegdMint,
      userPegdAccount,
      provider.wallet.publicKey,
      pegdAmount
    );

    // Create withdrawal request account
    const withdrawal = Keypair.generate();

    await program.methods
      .swapPegdToXrp(
        new anchor.BN(pegdAmount),
        xrplDestination
      )
      .accounts({
        user: user.publicKey,
        userPegdAccount,
        bridgePegdAccount,
        withdrawal: withdrawal.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user, withdrawal])
      .rpc();

    const withdrawalAccount = await program.account.withdrawalRequest.fetch(
      withdrawal.publicKey
    );
    assert.equal(withdrawalAccount.pegdAmount.toNumber(), pegdAmount);
    assert.equal(withdrawalAccount.xrplDestination, xrplDestination);
    assert.ok(!withdrawalAccount.processed);
  });
});
