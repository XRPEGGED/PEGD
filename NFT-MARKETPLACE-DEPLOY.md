# NFT Marketplace - Quick Deploy Guide

## 🚀 Get This Live Tonight!

### Step 1: Update Database (2 minutes)

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project (`tmaeezonwjyydkxwpeug`)
3. Click **SQL Editor** in the sidebar
4. Open the file `/home/cube/Desktop/pegd-site/sql/add-nft-support.sql`
5. Copy the entire SQL content
6. Paste into Supabase SQL editor
7. Click **Run** button
8. You should see: "Success. No rows returned"

### Step 2: Deploy NFT Listing API (3 minutes)

The API endpoint is already created at:
`functions/api/nft/list.js`

If you're using Cloudflare Pages, it will auto-deploy with your next push.

Or manually deploy:
```bash
cd /home/cube/Desktop/pegd-site
npx wrangler pages deploy . --project-name=xrpegged-market
```

### Step 3: Upload NFT Listing Page (1 minute)

The page is at: `nft-list.html`

Already in your project - will deploy with your site.

### Step 4: Test It! (5 minutes)

1. Go to: `https://pegd.org/nft-list.html`
2. Fill out the form:
   - Select XRPL or Solana
   - Enter NFT Token ID / Mint Address
   - Add your wallet address
   - Set title, description, price
   - Add image URL
3. Click **List NFT**
4. Check your marketplace: `https://pegd.org/#shop`
5. You should see your NFT listed!

## Example NFT Listings

### XRPL NFT Example

```
Blockchain: XRPL NFT
NFT Token ID: 000B0539FB51E8D8EFA7F2F23F5B2F97F4CEE7BB91A7D4AC000001E8
Issuer: rNCFjv8Ek5oDrNiMJ3pw6eLLFtMjZLJnf2
Seller Wallet: rN7n7otQDd6FczFgLdlqtyMVUbmxUvLdSq
Title: Cool XRP Punk #1234
Description: Rare punk with laser eyes
Price: 499.99
Image URL: https://xrpnft.art/image/1234.png
Collection: XRP Punks
```

### Solana NFT Example

```
Blockchain: Solana NFT
NFT Mint Address: 7ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG
Seller Wallet: 5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG
Title: DeGods #5678
Description: Legendary DeGod NFT
Price: 1999.99
Image URL: https://metadata.degods.com/5678.png
Collection: DeGods
```

## What's Working Now

✅ **List NFTs** - Both XRPL and Solana
✅ **Show in Marketplace** - NFTs appear with badge
✅ **NFT Images** - Display NFT artwork
✅ **Collection Tagging** - Group by collection
✅ **USD Pricing** - Accept PEGD, XRP, or SOL
✅ **Purchase Flow** - Same as physical items

## What Happens After Purchase

When someone buys an NFT:

1. **Payment verified** (same as physical items)
2. **Order created** in database
3. **Seller notified** (via order status page)
4. **Seller transfers NFT** manually to buyer's wallet
5. **Seller marks as transferred** (update order status)

## Coming Soon (Not Tonight)

- Auto-fetch NFTs from wallet
- Automatic NFT transfer via smart contract
- NFT escrow (hold in program until sold)
- Offer/bid system
- Royalties support

## Troubleshooting

**"Column does not exist" error:**
- You need to run the SQL migration in Step 1

**NFT not showing up:**
- Check browser console for errors
- Verify API endpoint is deployed
- Check Supabase database - is the row there?

**Image not loading:**
- Use direct image URLs (not IPFS gateway timeouts)
- Try: `https://gateway.pinata.cloud/ipfs/...` for IPFS

## Database Schema

After running the migration, `market_listings` has these new fields:

```sql
item_type          VARCHAR(20)   -- 'physical', 'nft_xrpl', 'nft_solana'
nft_token_id       VARCHAR(100)  -- XRPL NFTokenID
nft_issuer         VARCHAR(100)  -- XRPL issuer address
nft_mint_address   VARCHAR(100)  -- Solana mint address
nft_image_url      TEXT          -- NFT image URL
nft_collection     VARCHAR(200)  -- Collection name
nft_blockchain     VARCHAR(20)   -- 'xrpl' or 'solana'
nft_transferred    BOOLEAN       -- Transfer status
nft_transfer_tx    VARCHAR(100)  -- Transfer transaction hash
```

## Next Features to Build

**Tomorrow:**
1. NFT detail page (show full metadata)
2. Seller dashboard (manage your NFT listings)
3. Transfer tracking (verify NFT was sent)

**This Week:**
4. Auto-fetch NFTs from connected wallet
5. Bulk listing (list multiple NFTs at once)
6. Collection pages (browse by collection)

**This Month:**
7. Offers/bids system
8. NFT escrow (smart contract holds NFT)
9. Royalties (auto-pay creators)
10. Analytics (most viewed, trending)

---

## 🎉 You're Live!

Your NFT marketplace is now operational. You can:
- List any XRPL or Solana NFT
- Set USD prices
- Accept PEGD, XRP, or SOL payments
- Buyers see NFTs in the main marketplace

**Start listing tonight!** 🚀
