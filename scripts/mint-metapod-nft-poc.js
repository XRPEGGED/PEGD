#!/usr/bin/env node
/**
 * Metapod Order #1 PoC — Manual XRPL NFT Mint for Immediate Digital Twin
 * 
 * Chairman (buyer for PoC): Run this locally with your issuer seed.
 * 
 * 1. Update the metadata JSON first with REAL photo URL (replace placeholder).
 *    - Later update animation_url with real GLB when Tier-1 is generated from your photo.
 *    - The pointer URL stays the same; metadata content can be updated without re-minting.
 * 
 * 2. Deploy pegd-site so https://pegd.pages.dev/data/metapod-nft-metadata.json is live
 *    (or temporarily host the JSON raw on a gist/paste and update the URI below).
 * 
 * 3. Set env: XRPL_ISSUER_SEED=yourseed (for the issuer account, e.g. treasury or your r-addr)
 * 
 * 4. node Desktop/pegd-site/scripts/mint-metapod-nft-poc.js
 * 
 * 5. Copy the output nftId and tx hash.
 * 
 * 6. Run the SQL in Supabase Editor to record on the order (so buyer page shows it):
 *    UPDATE market_orders 
 *    SET buyer_nft_token_id = 'THE_NFTOKENID',
 *        buyer_nft_mint_tx_hash = 'THE_TX_HASH'
 *    WHERE listing_id = 'a0c775db-0bee-43d6-86af-bd6ae6504a3b';
 * 
 * 7. Physical ship the card with etched QR to rmetapod1GUWECKJdcQQNLVuqNbx895xV 
 *    (links to order-status for phygital verification).
 * 
 * URI hex (pointer to metadata): 68747470733a2f2f706567642e70616765732e6465762f646174612f6d657461706f642d6e66742d6d657461646174612e6a736f6e
 * Recipient (PoC buyer proof addr): rmetapod1GUWECKJdcQQNLVuqNbx895xV
 * 
 * This is the "one click" — run the script, sign in your wallet if prompted, done.
 */

const { Client, Wallet, NFTokenMint } = require('xrpl');

async function main() {
  const seed = process.env.XRPL_ISSUER_SEED;
  if (!seed) {
    console.error('Set XRPL_ISSUER_SEED env var with your issuer seed (e.g. the treasury account or your r-addr for PoC).');
    console.error('Example: XRPL_ISSUER_SEED=sEd... node ...');
    process.exit(1);
  }

  const client = new Client('wss://xrplcluster.com'); // or wss://s1.ripple.com for mainnet
  await client.connect();

  const wallet = Wallet.fromSeed(seed);

  const uriHex = '68747470733a2f2f706567642e70616765732e6465762f646174612f6d657461706f642d6e66742d6d657461646174612e6a736f6e';

  const mintTx = {
    TransactionType: 'NFTokenMint',
    Account: wallet.address,
    Destination: 'rmetapod1GUWECKJdcQQNLVuqNbx895xV', // PoC buyer proof addr (phygital QR)
    URI: uriHex,
    Flags: 8, // Transferable
    NFTokenTaxon: 1, // Proof taxon
    TransferFee: 0
  };

  console.log('Preparing NFTokenMint for Metapod PoC...');
  const prepared = await client.autofill(mintTx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  console.log('=== NFT MINT RESULT ===');
  console.log('Transaction Hash:', result.result.hash);
  console.log('NFToken ID (use in SQL and buyer page):', result.result.meta?.nft_id || result.result.meta?.AffectedNodes?.find(n => n.ModifiedNode?.LedgerEntryType === 'NFToken')?.ModifiedNode?.FinalFields?.NFTokenID);
  console.log('Full result (save this):', JSON.stringify(result.result, null, 2));
  console.log('');
  console.log('Next:');
  console.log('1. Copy the NFToken ID and tx hash above.');
  console.log('2. Run the UPDATE SQL on Supabase for the order (see comment in this script).');
  console.log('3. Refresh the buyer order-status page — it will show the NFT proof section.');
  console.log('4. Ship the physical card with etched QR to rmetapod1GUWECKJdcQQNLVuqNbx895xV (links to the buyer page for phygital verification).');
  console.log('5. Later: update the metadata JSON with real GLB URL + your photo, redeploy site. The NFT stays the same.');

  await client.disconnect();
}

main().catch(console.error);