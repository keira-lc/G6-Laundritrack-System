# LaundriTrack Admin Panel 

A functional admin-laundry management prototype using the yellow/cream/navy LaundriTrack design. 

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL through XAMPP / phpMyAdmin
- Database driver: mysql2
- Authentication: JWT + bcrypt + simulated MFA
- Styling: custom CSS

## Database structure
The SQL file is here:

`backend/database/laundritrack.sql`

Tables:
- `admin_users` — administrator accounts, roles, MFA flag, bcrypt password hash
- `customers` — inclusive customer profile fields
- `products` — SKU, category, price, stock, safety stock, alt text
- `product_variants` — product sizes/colors/variants
- `orders` — order lifecycle, payment, tracking, returns/refunds
- `order_items` — products and quantities belonging to orders

## STEP 1 — Start XAMPP
1. Open **XAMPP Control Panel**.
2. Start **Apache**.
3. Start **MySQL**.
4. Make sure MySQL shows **Running**.

## STEP 2 — Create the database in phpMyAdmin
1. Open `http://localhost/phpmyadmin`.
2. Click **Import**.
3. Select:
   `backend/database/laundritrack.sql`
4. Click **Import** / **Go**.
5. You should see a database named `laundritrack`.

The SQL creates the tables and sample products/orders/customers.

## STEP 3 — Configure the backend
Use:

```env
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=laundritrack
DB_USER=root
DB_PASSWORD=
JWT_SECRET=replace_with_a_long_random_secret
```

For the normal XAMPP setup, `root` has a blank password. If you configured a MySQL root password, put it after `DB_PASSWORD=`.

## STEP 4 — Install and run backend
Open a terminal inside `backend`:

npm install
npm run dev
```
`LaundriTrack API running on http://localhost:5000`

Test:
`http://localhost:5000/api/health`

It should report MySQL/XAMPP as the database.

## STEP 5 — Run frontend
Open another terminal:

cd frontend
npm install
npm run dev
```
Open the Vite URL, normally:

`http://localhost:5173`

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

FIGMA DESIGN
 https://www.figma.com/design/C8zutWCvlHY76zX1TMNxh3/LaundriTrack?node-id=0-1&t=mauTTZJrkpHnb7uq-0 