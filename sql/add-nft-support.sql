-- Add NFT support to market_listings table
-- Run this in Supabase SQL editor

ALTER TABLE market_listings
  -- Add item type (physical, nft_xrpl, nft_solana)
  ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'physical'
    CHECK (item_type IN ('physical', 'nft_xrpl', 'nft_solana')),

  -- XRPL NFT fields
  ADD COLUMN IF NOT EXISTS nft_token_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nft_issuer VARCHAR(100),

  -- Solana NFT fields
  ADD COLUMN IF NOT EXISTS nft_mint_address VARCHAR(100),

  -- NFT metadata (common to both)
  ADD COLUMN IF NOT EXISTS nft_image_url TEXT,
  ADD COLUMN IF NOT EXISTS nft_collection VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nft_blockchain VARCHAR(20),

  -- Transfer tracking
  ADD COLUMN IF NOT EXISTS nft_transferred BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nft_transfer_tx VARCHAR(100);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_market_listings_item_type
  ON market_listings(item_type);

CREATE INDEX IF NOT EXISTS idx_market_listings_nft_collection
  ON market_listings(nft_collection)
  WHERE nft_collection IS NOT NULL;

COMMENT ON COLUMN market_listings.item_type IS 'Type of item: physical, nft_xrpl, or nft_solana';
COMMENT ON COLUMN market_listings.nft_token_id IS 'XRPL NFTokenID';
COMMENT ON COLUMN market_listings.nft_mint_address IS 'Solana NFT mint address';
