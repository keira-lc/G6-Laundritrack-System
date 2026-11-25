# GARDEN Laundry Hub — Admin + Customer Web 

A laundry operations admin dashboard and customer-facing responsive web storefront branded GARDEN Laundry Hub,“Wash....Dry....and Fold”. The storefront retains the supplied mobile-client design style and adapts across different displays.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL through XAMPP / phpMyAdmin
- Database driver: mysql2
- Authentication: admin JWT + bcrypt + simulated MFA; customer JWT + bcrypt password hashing
- Styling: custom CSS

## Database structure
The SQL file is here:

`backend/database/laundritrack.sql`

Tables:
- `admin_users` — administrator accounts, roles, MFA flag, bcrypt password hash
- `customers` — customer profile fields, unique email, and nullable bcrypt password hash for customer accounts
- `products` — SKU, category, price, **unit (kg / pc / pack)**, minimum order, stock, safety stock, **picture key**, alt text
- `product_variants` — product sizes/colors/variants
- `orders` — order lifecycle, payment method / status / reference, tracking, returns/refunds
- `order_items` — products, and units belonging to orders

```
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=laundritrack
DB_USER=root
DB_PASSWORD=
JWT_SECRET=9a8432beac2d194a45b4ac8a199811fadf2745c24bffc61c1fd88546f63470e
STORE_URL=http://localhost:5173
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
```

## Admin login
- Email: `admin@laundritrack.local`
- Password: `Admin@12345`
- MFA code: `123456`

The backend automatically creates this admin account with a bcrypt hash if it does not already exist.

## Admin functions
- Dashboard metrics
- Product add/edit/delete
- SKU uniqueness validation
- Stock and safety-stock warnings
- Product variants
- Product image alt text
- Order status lifecycle
- Shipping/tracking simulation
- Refund/return simulation
- Inclusive customer profile fields
- JWT authentication
- bcrypt password hashing
- MFA simulation
- Admin role protection

## Accessibility
The UI uses semantic controls, visible focus states, explicit status text, descriptive alt-text fields, visible labels, and specific validation messages. Status meaning is not dependent on red/green color alone.


## Customer-facing web store

The `customer-web/` folder contains the responsive customer storefront (React + Vite). It is a separate web app, based on the previously supplied mobile-client interface but designed for phones, tablets, laptops, desktops, and TV-sized screens. The storefront and admin dashboard use the same Express API and XAMPP MySQL database.

### Customer storefront functions
- Live catalog, category filters, current prices, SKU, variants, and available stock from MySQL.
- Customer **sign-up and sign-in** with email/password; passwords are stored as bcrypt hashes and customer sessions use JWTs.
- Customer **My Profile** page with editable full name, phone number, and default delivery address. Email is shown as read-only for account security.
- Customer **Order History** page with order number, item details, total, order status, date, and tracking number when available.
- Add items to cart, adjust quantities, remove items, and review the total.
- Checkout requires a signed-in customer, collects phone and delivery address, and saves the order against that customer's account.
- Successful checkout creates a **Pending** order in the admin Orders screen.
- A profile security panel explains password protection and the current passkey/biometrics status. **Device biometrics/passkeys are not yet implemented**; the UI does not pretend that this security feature is active.
- Checkout calculates prices on the server, validates current stock inside a database transaction, creates customer/order/order-item records, and deducts inventory. If stock is insufficient, the order is rejected with a message.
- Admin data refreshes automatically about every 5 seconds while the admin panel is open, so new orders and stock changes appear without manually reloading the page.


### Testing customer accounts and the sync loop
1. Open the admin panel and customer web store in separate browser tabs.
2. In the customer web store, open **Sign in** and create a customer account using an email that is not already registered, or claim an existing customer record that has no password set.
3. Open **Profile**, save a phone number and default delivery address, then sign out and sign back in to confirm the account works.
4. Add an in-stock item to the cart and complete checkout while signed in.
3. Confirm the customer app shows an order number and **Pending** status.
4. In the admin Orders screen, confirm the new order appears within the next refresh cycle.
5. Open **Orders** in the customer site to see the order history and current status.
6. Check Catalog / inventory; the stock quantity should have decreased by the purchased quantity.
7. Change the order status in the admin panel and confirm it remains saved in MySQL and appears in customer order history after refresh.

### Mobile UI and checkout usability
The customer website retains the supplied mobile-client design and uses a responsive card catalog, category chips, persistent bottom navigation, clear stock/price labels, visible form labels, keyboard focus indicators, and text labels for order status. The main purchase path is catalog → add to cart → sign in (if needed) → checkout → place order. Profile and order history are available from the bottom navigation. Product prices and stock are always validated by the backend during checkout; client-side cart totals are for preview only.

For testing on a physical phone connected to the same Wi-Fi, replace `localhost` in `customer-web/.env` with your computer's LAN IPv4 address and ensure Windows Firewall allows the Vite and API ports on your private network. Do not expose this development server to the public internet.


## Update: online payments

Add `STORE_URL`, `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` to `backend/.env` (see `backend/.env`).

### Online payments (Philippines only, PHP)
Methods: **GCash, Maya, GrabPay, credit/debit card (Visa/Mastercard)** and **cash on delivery**.
- Mobile numbers must be Philippine numbers (`09XXXXXXXXX` or `+639XXXXXXXXX`); all amounts are in PHP.
- **Live mode:** set `PAYMONGO_SECRET_KEY` (use the `sk_test_…` key first). The customer is redirected to PayMongo's hosted checkout, so card and wallet details never touch this system. When they return, the server asks PayMongo whether the payment succeeded and marks the order Paid. To also handle customers who close the tab after paying, add a PayMongo webhook to `https://YOUR-DOMAIN/api/webhooks/paymongo` for the event `checkout_session.payment.paid` and put its signing secret in `PAYMONGO_WEBHOOK_SECRET` (needs a public HTTPS address).
- **Test/sandbox mode (no key):** the storefront shows a clearly labelled simulated payment screen with “Simulate successful / failed payment”. No real money moves. The admin header shows **Payments: TEST mode** or **LIVE**.
- Unpaid or failed online orders show a **Pay now** button in the customer's order history.
- Cards: PayMongo accepts Visa/Mastercard; this project cannot restrict a card to Philippine-issued cards. Phone number, currency and merchant location are the Philippines-only controls.

### Admin updates
- Catalog: “Sold per” (kilo/piece/pack), price per unit, minimum order, picture picker with preview, category filter, thumbnails. Fixed edit and low-stock bugs (safety stock and alt text were not read correctly before).
- Orders: payment method and status, expandable item list with kilograms, search and status/payment filters, **Cash received / Mark paid** button, refund notice for online payments (refund the money itself in PayMongo).
- Dashboard: paid revenue by payment method, “Awaiting payment” count, payment mode badge. Administration: payment setup panel.


## Update: landing page, promos, and date booking
- **Existing Database:** It adds the booking date / promo columns, the `promos` table (12.12 Promo 12% off, Christmas Promo 25% off). New installs get all of this from `laundritrack.sql`.
- **Customer web:** new Home (landing) page with the GARDEN logo, services, how-it-works, phone and address. The old shop header is replaced by a promo banner. Wash & Dry (Regular / Express) is booked by choosing a visit date from a calendar; the rate per kilo (for example 1 kg = ₱250) is fixed on screen and the shop weighs the laundry on the visit date. Bookings are paid at the shop.
- **Promos:** apply automatically to Wash & Dry bookings whose visit date falls inside the promo dates (bigger discount wins). Manage them in Admin > Promos.
- **Admin:** Catalog > Service rates edits the price per kilo; Orders shows visit dates and lets you enter the real weight after weighing (total updates with the rate and promo).

