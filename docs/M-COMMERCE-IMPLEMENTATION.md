# GARDEN Laundry Hub 

## Overview
The customer-facing web store follows the supplied mobile-client design language (cream surfaces, warm yellow accents, dark navy panels, compact product cards, category filters, cart, checkout, and order confirmation) while expanding responsively for phones, tablets, laptops, desktops, and etc.

## Architecture
- Customer storefront: React + Vite in `customer-web/`.
- Admin dashboard: React + Vite in `frontend/`.
- API: Node.js + Express in `backend/`.
- Database: shared MySQL database managed by XAMPP/phpMyAdmin (`laundritrack`).

## Customer flow
1. Load live product catalog and categories from `GET /api/store/products` and `GET /api/store/categories`.
2. Select a product variant and add it to the cart.
3. Register or sign in through `POST /api/store/auth/signup` or `POST /api/store/auth/login`. Customer passwords are stored as bcrypt hashes and sessions use signed JWTs.
4. Manage full name, phone, and default address in the customer profile (`GET /api/store/auth/me`, `PUT /api/store/auth/profile`).
5. Review customer order history through `GET /api/store/orders/mine`.
6. Checkout requires a customer JWT. `POST /api/store/orders` validates stock and variants, creates a Pending order associated with the signed-in customer, and decrements inventory transactionally.
7. The customer receives an order confirmation; the admin dashboard reads the same database and the order appears in customer order history.

### Customer account database migration
For an existing database, run `backend/database/customer-accounts-migration.sql` once after the mobile-commerce migration. It adds the nullable `password_hash` field and unique customer email index. Existing customer rows without a password may claim their email record during sign-up. The unique index requires non-duplicate email values.

## Account and security scope
The storefront includes customer sign-up/sign-in, protected checkout, a profile page, sign-out, and order history. Passwords are hashed with bcrypt and customer API routes require a customer-role JWT. The profile security panel reports that passkeys/device biometrics are **not yet implemented**; it does not claim biometric authentication is enabled.

## Responsive layout
- Small phones: two-column product grid and compact controls.
- Tablets: three columns.
- Laptops/desktops: four to five columns and expanded content width.
- Large TV/ultrawide screens: six-column catalog with scalable typography and spacing.
- Keyboard focus indicators, semantic form labels, text-based stock/order states, and reduced-motion support are included.

## Run the apps
Start XAMPP MySQL, then start the API from `backend/` using `npm install` and `npm run dev`. Start the admin dashboard in `frontend/` and the customer storefront in `customer-web/`, each in its own terminal. Vite will print the exact local URL for each app; use that URL rather than assuming a port.

## Configuration
Copy `customer-web/.env.example` to `customer-web/.env` if you need to override `VITE_API_URL`. The default API is `http://localhost:5000/api`. Do not put database passwords or private secrets in Vite environment variables.
