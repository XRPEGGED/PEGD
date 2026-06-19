# NFT Marketplace Implementation Plan

## Overview

Add NFT listing and trading capabilities to the PEGD marketplace, supporting both XRPL NFTs and Solana NFTs.

## Database Schema Changes

### Update `market_listings` Table

```sql
ALTER TABLE market_listings
  -- Add item type
  ADD COLUMN item_type VARCHAR(20) DEFAULT 'physical' CHECK (item_type IN ('physical', 'nft_xrpl', 'nft_solana')),

  -- XRPL NFT fields
  ADD COLUMN nft_token_id VARCHAR(100),
  ADD COLUMN nft_issuer VARCHAR(100),
  ADD COLUMN nft_taxon BIGINT,

  -- Solana NFT fields
  ADD COLUMN nft_mint_address VARCHAR(100),
  ADD COLUMN nft_metadata_uri TEXT,

  -- NFT metadata (common)
  ADD COLUMN nft_name VARCHAR(200),
  ADD COLUMN nft_image_url TEXT,
  ADD COLUMN nft_collection VARCHAR(200),
  ADD COLUMN nft_traits JSONB,

  -- Transfer status
  ADD COLUMN nft_transferred BOOLEAN DEFAULT FALSE,
  ADD COLUMN nft_transfer_tx VARCHAR(100);

-- Index for NFT queries
CREATE INDEX idx_market_listings_item_type ON market_listings(item_type);
CREATE INDEX idx_market_listings_nft_collection ON market_listings(nft_collection);
```

## NFT Listing Flow

### For XRPL NFTs

```
1. User connects XRPL wallet (Xaman)
2. System fetches user's NFTs via XRPL API
3. User selects NFT to list
4. System verifies ownership
5. User sets price and lists
6. NFT remains in user's wallet (not escrowed)
7. After sale, user transfers NFT to buyer
```

### For Solana NFTs

```
1. User connects Solana wallet (Phantom)
2. System fetches user's NFTs via Metaplex API
3. User selects NFT to list
4. System verifies ownership
5. User sets price and lists
6. Optional: Create program-controlled escrow
7. After sale, transfer NFT to buyer
```

## API Endpoints

### 1. List User's NFTs

**Endpoint:** `GET /api/nft/wallet/:address`

```typescript
// Get NFTs from XRPL wallet
export async function getXRPLNFTs(address: string) {
  const response = await fetch('https://xrplcluster.com', {
    method: 'POST',
    body: JSON.stringify({
      method: 'account_nfts',
      params: [{ account: address }]
    })
  })

  const data = await response.json()
  return data.result.account_nfts.map(nft => ({
    tokenId: nft.NFTokenID,
    issuer: nft.Issuer,
    taxon: nft.NFTokenTaxon,
    uri: nft.URI,
    // Parse metadata from URI
  }))
}

// Get NFTs from Solana wallet
export async function getSolanaNFTs(address: string) {
  const response = await fetch(`https://api.mainnet-beta.solana.com`, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [address, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }]
    })
  })

  // Filter for NFTs (amount = 1, decimals = 0)
  // Fetch metadata from Metaplex
}
```

### 2. Create NFT Listing

**Endpoint:** `POST /api/nft/list`

```typescript
{
  "itemType": "nft_xrpl" | "nft_solana",
  "sellerWallet": "rXXX..." | "5ZWj...",
  "priceUsd": 99.99,

  // XRPL NFT
  "nftTokenId": "000...",
  "nftIssuer": "rXXX...",
  "nftTaxon": 0,

  // OR Solana NFT
  "nftMintAddress": "5ZWj...",
  "nftMetadataUri": "https://...",

  // Common
  "title": "Cool NFT",
  "description": "...",
  "nftImageUrl": "https://..."
}
```

### 3. Purchase NFT

**Endpoint:** `POST /api/nft/purchase`

```typescript
{
  "listingId": "uuid",
  "buyerWallet": "rXXX..." | "5ZWj...",
  "paymentMethod": "pegd" | "xrp" | "sol",
  "paymentTxHash": "..."
}
```

### 4. Transfer NFT

**Endpoint:** `POST /api/nft/transfer`

```typescript
// For XRPL
async function transferXRPLNFT(tokenId, fromWallet, toWallet) {
  // Create NFTokenCreateOffer (sell offer)
  const offerTx = {
    TransactionType: 'NFTokenCreateOffer',
    Account: fromWallet,
    NFTokenID: tokenId,
    Amount: '0', // Free transfer
    Destination: toWallet,
    Flags: 1 // tfSellNFToken
  }

  // Seller signs and submits
  // Buyer accepts offer
}

// For Solana
async function transferSolanaNFT(mintAddress, fromWallet, toWallet) {
  // Transfer NFT using SPL Token Transfer
  const tx = new Transaction().add(
    createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromWallet,
      1 // amount
    )
  )

  // Sign and send
}
```

## UI Components

### NFT Gallery

```typescript
// /app/nft/page.tsx
export default function NFTGallery() {
  const [nfts, setNfts] = useState([])
  const [filter, setFilter] = useState('all') // all, xrpl, solana

  return (
    <div>
      <h1>NFT Marketplace</h1>

      <FilterBar>
        <button onClick={() => setFilter('all')}>All NFTs</button>
        <button onClick={() => setFilter('xrpl')}>XRPL NFTs</button>
        <button onClick={() => setFilter('solana')}>Solana NFTs</button>
      </FilterBar>

      <NFTGrid>
        {nfts.map(nft => (
          <NFTCard key={nft.id}>
            <img src={nft.nft_image_url} />
            <h3>{nft.nft_name}</h3>
            <p>${nft.price_usd}</p>
            <Badge>{nft.item_type === 'nft_xrpl' ? 'XRPL' : 'Solana'}</Badge>
            <BuyButton listingId={nft.id} />
          </NFTCard>
        ))}
      </NFTGrid>
    </div>
  )
}
```

### List NFT Dialog

```typescript
// /app/nft/list/page.tsx
export default function ListNFT() {
  const [wallet, setWallet] = useState(null)
  const [myNFTs, setMyNFTs] = useState([])

  async function connectWallet(type: 'xrpl' | 'solana') {
    if (type === 'xrpl') {
      // Connect Xaman
      const wallet = await xaman.connect()
      const nfts = await fetch(`/api/nft/wallet/${wallet.address}?blockchain=xrpl`)
      setMyNFTs(await nfts.json())
    } else {
      // Connect Phantom
      const wallet = await window.solana.connect()
      const nfts = await fetch(`/api/nft/wallet/${wallet.publicKey}?blockchain=solana`)
      setMyNFTs(await nfts.json())
    }
  }

  return (
    <div>
      <h1>List Your NFT</h1>

      <WalletConnect>
        <button onClick={() => connectWallet('xrpl')}>Connect Xaman (XRPL)</button>
        <button onClick={() => connectWallet('solana')}>Connect Phantom (Solana)</button>
      </WalletConnect>

      {myNFTs.length > 0 && (
        <NFTSelection>
          <h2>Select NFT to List</h2>
          {myNFTs.map(nft => (
            <NFTOption key={nft.tokenId || nft.mintAddress}>
              <img src={nft.image} />
              <h3>{nft.name}</h3>
              <button onClick={() => selectNFT(nft)}>List This</button>
            </NFTOption>
          ))}
        </NFTSelection>
      )}

      {selectedNFT && (
        <ListingForm>
          <input type="number" placeholder="Price (USD)" />
          <input type="text" placeholder="Title" />
          <textarea placeholder="Description" />
          <button onClick={createListing}>Create Listing</button>
        </ListingForm>
      )}
    </div>
  )
}
```

## Purchase Flow

### XRPL NFT Purchase

```
1. Buyer sees NFT listing
2. Clicks "Buy Now"
3. Pays with PEGD/XRP/SOL → Treasury
4. Payment verified
5. System notifies seller
6. Seller creates NFTokenCreateOffer to buyer
7. Buyer accepts offer
8. NFT transferred
9. Listing marked as sold
```

### Solana NFT Purchase

```
1. Buyer sees NFT listing
2. Clicks "Buy Now"
3. Pays with PEGD/XRP/SOL → Treasury
4. Payment verified
5. System notifies seller
6. Seller transfers NFT via Phantom
7. System verifies transfer
8. Listing marked as sold
```

## Advantages of This Approach

✅ **No Escrow Required** - NFTs stay in seller's wallet until sold
✅ **Multi-Chain** - Support both XRPL and Solana NFTs
✅ **Flexible Payment** - Accept PEGD, XRP, or SOL
✅ **Low Fees** - No platform fee, just payment processing
✅ **Trustless** - Blockchain-verified transfers
✅ **Simple UX** - Familiar wallet connect flow

## Implementation Priority

**Phase 1 (Week 1):**
1. Database schema updates
2. API endpoint for fetching wallet NFTs
3. Basic NFT listing creation

**Phase 2 (Week 2):**
4. NFT gallery UI
5. Purchase flow
6. Transfer notifications

**Phase 3 (Week 3):**
7. Seller dashboard (manage listings)
8. NFT metadata caching
9. Collection filtering

**Phase 4 (Week 4):**
10. Advanced features (offers, auctions)
11. Royalties support
12. Analytics

## Example Listings

### XRPL NFT

```json
{
  "id": "uuid",
  "item_type": "nft_xrpl",
  "seller_wallet": "rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq",
  "nft_token_id": "000B0539FB51E8D8EFA7F2F23F5B2F97F4CEE7BB91A7D4AC000001E8",
  "nft_issuer": "rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2",
  "nft_taxon": 0,
  "nft_name": "XRP Punks #1234",
  "nft_image_url": "ipfs://...",
  "nft_collection": "XRP Punks",
  "title": "XRP Punks #1234",
  "description": "Rare punk with laser eyes",
  "price_usd": 499.99,
  "status": "active"
}
```

### Solana NFT

```json
{
  "id": "uuid",
  "item_type": "nft_solana",
  "seller_wallet": "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
  "nft_mint_address": "7ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG",
  "nft_metadata_uri": "https://arweave.net/...",
  "nft_name": "DeGods #5678",
  "nft_image_url": "https://...",
  "nft_collection": "DeGods",
  "title": "DeGods #5678",
  "description": "Legendary DeGod",
  "price_usd": 1999.99,
  "status": "active"
}
```

## Next Steps

Ready to implement? I can build:
1. Database migration
2. API endpoints for NFT listing/purchasing
3. UI for NFT gallery and listing creation
4. Transfer functions for both chains

Let me know if you want me to proceed!
