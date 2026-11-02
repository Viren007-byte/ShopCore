# ShopCore

A multi-vendor marketplace for workspace and everyday essentials. Customers shop across independent businesses, sellers manage their own inventory and fulfillment, and administrators oversee the platform. Browse the catalog, save favorites, manage a bag, and place simulated orders. The storefront uses a warm neutral palette, custom CSS product illustrations, and responsive layouts rather than a stock dashboard template.

Built with React 18, Vite, Express, MongoDB, Mongoose, JWT, and bcrypt.

## Quick preview (no database)

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and select **Try the interactive demo**. This mode is explicitly labeled and stores sample stock and orders in your browser. Use **Sign in → Fill demo credentials** to try checkout. The browser demo includes separate customer, seller, and admin interfaces. Registration requires the real API. Switch back with **Connect to live store**.

## Run the full stack

Requires Node.js 20+ and MongoDB (locally or through Docker).

1. Run `docker compose up -d` from the project root, or start MongoDB yourself.
2. Copy `.env.example` to `backend/.env`. Replace `JWT_SECRET` with a long random secret.
3. In `backend`, run `npm install`, `npm run seed`, then `npm run dev`.
4. In another terminal, run `cd frontend`, `npm install`, then `npm run dev`.
5. Open http://localhost:5173. If browser demo mode was enabled, select **Connect to live store**.

On Windows PowerShell with script execution restrictions, use `npm.cmd` instead of `npm`.

### Local demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Customer | demo@shopcore.test | ShopCore@123 |
| Seller ? Form Studio | seller@shopcore.test | ShopCore@123 |
| Seller ? Slow Living Co. & Field Supply | seller2@shopcore.test | ShopCore@123 |
| Platform admin | admin@shopcore.test | ShopCore@123 |

These are public, fictional development accounts created by the seed script. Do not seed them into a public production database. Sign in as a seller or admin to open the dedicated management workspace automatically. Use ?View marketplace? to preview the customer storefront and ?Workspace? to return. Customers cannot open management endpoints. Sellers cannot edit products from other shops. Registration offers customer or seller accounts; admin accounts cannot be self-registered.

The seed command inserts eight products across three shops, four accounts, and a fulfilled sample order for the customer. It preserves existing records and does not reset passwords, replenish stock, or duplicate sample orders on repeated runs. Product fixtures live in `catalog.json` and are shared with the browser demo.

## What works

- JWT sign-in, registration, session restoration, and sign-out
- Category and shop filters, product search, price and rating sorting, minimum-rating and budget filters, and saved favorites
- Seller dashboard: shop creation, product creation/editing, visibility, stock, sales summary, and own-item fulfillment
- Admin dashboard: all-shop inventory, listing moderation, shop directory, platform orders and fulfillment
- Stock-aware bag quantities, item removal, and checkout
- Per-account order history with date, totals, items, and status
- Authenticated admin product and order API routes
- Clearly separated browser demo for reviewing the UI without services
- Mobile layouts, keyboard dialog controls, focus handling, and reduced-motion support

## Validation

```sh
cd frontend
npm run build
node --test tests/demo.test.mjs
```

The automated demo tests cover authentication, protected resources, out-of-stock checkout, totals, persisted order history, seller ownership and listing moderation.

For real API integration tests, start local MongoDB, then run in `backend`:

```powershell
$env:RUN_INTEGRATION="1"
node --test tests/marketplace.test.js
```

The integration test uses a unique temporary database and removes it afterward. It verifies seller registration, blocked admin self-registration, shop creation, cross-shop edit restrictions, listing moderation, mixed-shop checkout, seller subtotals, and per-shop fulfillment. An order becomes fulfilled after all shops fulfill their items. Run the full-stack walkthrough separately against MongoDB: seed, sign in as the customer, add products, place an order, refresh order history, and sign out. API health is at http://localhost:4102/api/health.

## API overview

| Route | Access | Purpose |
| --- | --- | --- |
| POST /api/auth/register | Public | Create customer |
| POST /api/auth/login | Public | Sign in |
| GET /api/auth/me | Signed in | Current user |
| GET /api/products | Public | Paginated active catalog |
| GET /api/shops | Public | Shop directory |
| POST /api/shops | Seller / admin | Open an owned shop |
| GET /api/manage/products | Seller / admin | Own inventory (all for admin) |
| POST /api/products | Seller / admin | Create product in an authorized shop |
| PATCH /api/products/:id | Owner / admin | Edit stock, product or visibility |
| GET /api/manage/orders | Seller / admin | Own items and subtotals (all for admin) |
| PATCH /api/manage/orders/:id/fulfill | Seller / admin | Fulfill authorized items |
| GET /api/orders | Signed in | Own orders |
| POST /api/orders | Signed in | Place order |
| GET /api/admin/orders | Admin | All orders |

Set `VITE_API_URL` in `frontend/.env` for a different API origin. The default is http://localhost:4102/api.

## Design and implementation notes

Product illustrations are rendered in CSS, so the catalog does not depend on remote stock photos. Google Fonts is optional; system fonts are used if unavailable. Saved favorites persist locally; the bag is session state. Browser demo data persists locally and is separate from MongoDB. Clear the `market-products-v1`, `market-orders-v1`, and `market-shops-v1` localStorage keys to reset the browser sample.

No payment gateway or shipping integration is connected. Prices are in INR. Stock is reserved atomically per product, with compensating updates if an item fails; production order processing should use multi-document transactions. Production deployment also needs HTTPS, operational monitoring, a deliberate token storage strategy, and private credentials. Keep `.env`, tokens, dependencies, and build output out of Git.

Product ratings and review counts in the sample catalog are fictional fixtures, labeled here for portfolio review. New products start unrated; customer review submission is not implemented. Sellers cannot assign their own ratings through product endpoints. Existing seeded catalog entries are linked to their shops on the next seed run without resetting stock or prices. Order values represent simulated sales rather than settled payouts.
