# Updated LaundriTrack Prototype

A PHP + MySQL/MariaDB admin prototype based on the direction in the UI/UX figma LaundriTrack design board.

## What is implemented

- Admin login + simulated MFA second step
- Dashboard with orders, paid revenue and low-stock alerts
- Catalog/service CRUD:
  - SKU
  - price
  - stock
  - safety stock
  - category
  - variants
  - descriptive alt text
- Order lifecycle management:
  - Pending
  - Processing
  - Ready for Pickup
  - Shipped
  - Delivered
  - Refunded
- Tracking number / shipping-label simulation
- Return/refund simulation
- Inclusive customer profile form:
  - one Full Name field
  - flexible title choices including Mx.
  - inclusive gender choices
  - Other / self-describe
- Semantic HTML tables, labels, buttons, landmarks and visible keyboard focus
- Text-based status labels so status is not communicated by color alone
- Prepared SQL statements, password_hash/password_verify, CSRF token, session regeneration

## Stack

Custom web application: PHP 8+, MySQL/MariaDB, HTML5, CSS3 and vanilla JavaScript.

## XAMPP setup

1. Copy the `LaundriTrack_Admin` folder into:
   `C:\xampp\htdocs\`
2. Start Apache and MySQL in XAMPP.
3. Open phpMyAdmin.
4. Import `database.sql`.
5. Visit:
   `http://localhost/LaundriTrack_Admin/`
6. Demo admin:
   - Email: `admin@laundritrack.local`
   - Password: `Admin@12345`
7. After login, the prototype generates a six-digit MFA code on screen. This is intentionally simulated for classroom demonstration; production should use a real authenticator, email/SMS provider, or identity platform.

## Security note

This is a prototype. For production, also use HTTPS, secure/HttpOnly/SameSite cookies, a real MFA provider, server-side rate limiting and lockout, secret management outside source control, audit logs, least-privilege database accounts, backups, and encryption at rest where required.

figma ui/ux design
https://www.figma.com/design/C8zutWCvlHY76zX1TMNxh3/LaundriTrack?node-id=0-1&t=mauTTZJrkpHnb7uq-0 