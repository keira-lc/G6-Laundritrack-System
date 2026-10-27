-- Run this only if you already imported laundritrack.sql before adding the customer web store.
-- It adds the optional selected variant to order line items.
USE laundritrack;
ALTER TABLE order_items ADD COLUMN variant_name VARCHAR(100) NULL AFTER product_name;
