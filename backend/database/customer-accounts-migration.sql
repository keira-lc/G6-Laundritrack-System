USE laundritrack;

-- Run once on an existing database before using customer sign-up/sign-in.
-- Existing customers remain available; accounts created through the storefront get a bcrypt password hash.
ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;

-- Existing sample/customer emails should be unique. Check for duplicates before adding this index.
-- If this index fails, run the duplicate check in the comments below and resolve duplicates first.
ALTER TABLE customers ADD UNIQUE KEY uq_customers_email (email);

-- Duplicate check if needed:
-- SELECT LOWER(email) AS normalized_email, COUNT(*) AS total
-- FROM customers WHERE email IS NOT NULL AND email <> ''
-- GROUP BY LOWER(email) HAVING COUNT(*) > 1;
