/**
 * Create NFT listing
 * POST /api/nft/list
 */

import { json } from '../../_lib/json.js'
import { createListing } from '../../_lib/supabase-admin.js'

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()

    const {
      itemType,        // 'nft_xrpl' or 'nft_solana'
      sellerWallet,
      title,
      description,
      priceUsd,

      // XRPL NFT
      nftTokenId,
      nftIssuer,

      // Solana NFT
      nftMintAddress,

      // Common
      nftImageUrl,
      nftCollection,
      nftBlockchain
    } = body

    // Validation
    if (!itemType || !['nft_xrpl', 'nft_solana'].includes(itemType)) {
      return json(request, { error: 'Invalid item type' }, 400)
    }

    if (!sellerWallet || !title || !priceUsd) {
      return json(request, { error: 'Missing required fields' }, 400)
    }

    if (itemType === 'nft_xrpl' && !nftTokenId) {
      return json(request, { error: 'XRPL NFT requires nftTokenId' }, 400)
    }

    if (itemType === 'nft_solana' && !nftMintAddress) {
      return json(request, { error: 'Solana NFT requires nftMintAddress' }, 400)
    }

    // Create listing
    const listing = await createListing(env, {
      item_type: itemType,
      seller_wallet: sellerWallet,
      title,
      description,
      price_usd: parseFloat(priceUsd),
      status: 'active',

      // NFT specific
      nft_token_id: nftTokenId || null,
      nft_issuer: nftIssuer || null,
      nft_mint_address: nftMintAddress || null,
      nft_image_url: nftImageUrl || null,
      nft_collection: nftCollection || null,
      nft_blockchain: nftBlockchain || itemType.replace('nft_', ''),
      nft_transferred: false,

      created_at: new Date().toISOString()
    })

    return json(request, {
      success: true,
      listing
    })

  } catch (err) {
    console.error('NFT listing error:', err)
    return json(request, { error: err.message }, 500)
  }
}
