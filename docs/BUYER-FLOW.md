# XRPEGGED Buyer Flow

**Surface:** [pegd.org](https://pegd.org) · **Rail:** PEGD via Phantom (preferred)

---

## The journey (4 steps)

```
Shop → Pay → Ship → Track
```

| Step | What happens | Buyer sees |
|------|----------------|------------|
| **1. Shop** | Browse listings on pegd.org | Item + USD price |
| **2. Pay** | Phantom connects; PEGD sent to Solana treasury | Wallet signature |
| **3. Ship** | Encrypted address form after payment | Modal → redirect |
| **4. Track** | One bookmarkable order page | `/order-status.html` |

No address on-chain. Shipping is encrypted and seller-only.

---

## After checkout

Checkout redirects to:

```
/order-status.html?new=1&wallet=…&tx=…
```

- **`new=1`** — first-visit confirmation banner (drops from copied links)
- **`wallet` + `tx`** — proof of payment; required to load status
- Optional: `title`, `listing`, `proof`, `repeat`

Buyers bookmark the status URL (without `new=1`) to check shipment updates. Email notifications fire when tracking is added.

---

## Fulfillment states

| Status | Meaning |
|--------|---------|
| `paid` | Payment confirmed; shipping not yet submitted |
| `shipping_submitted` | Address on file; preparing shipment |
| `shipped` | Tracking available on order page + email |
| `delivered` | Fulfillment complete |

---

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/market/order-status?wallet=&tx=` | Buyer status (Pages proxy → market worker) |
| `POST /api/market/orders/shipping` | Encrypted ship-to after pay |

---

## Ops (not buyer-facing)

Chairman portal: decrypt shipping, add tracking, mark shipped → triggers buyer email.

**North star:** Metapod $4.99 · listing `a0c775db-0bee-43d6-86af-bd6ae6504a3b`