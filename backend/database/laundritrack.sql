CREATE DATABASE IF NOT EXISTS laundritrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE laundritrack;

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS admin_users;

CREATE TABLE admin_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','staff') NOT NULL DEFAULT 'admin',
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  title VARCHAR(50) NULL,
  gender VARCHAR(50) NULL,
  pronouns VARCHAR(50) NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL DEFAULT 'Uncategorized',
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  safety_stock INT NOT NULL DEFAULT 0,
  alt_text VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (price > 0),
  CHECK (stock >= 0),
  CHECK (safety_stock >= 0)
) ENGINE=InnoDB;

CREATE TABLE product_variants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  variant_name VARCHAR(100) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NULL,
  items_count INT NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('Pending','Processing','Shipped','Delivered','Refunded') NOT NULL DEFAULT 'Pending',
  payment_status ENUM('Pending','Paid','Refunded') NOT NULL DEFAULT 'Pending',
  tracking_number VARCHAR(80) NULL,
  address VARCHAR(255) NULL,
  return_status ENUM('None','Requested','Refunded') NOT NULL DEFAULT 'None',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO customers (full_name,email,phone,address) VALUES
('Maria Santos','maria@example.com','09171234567','Polangui, Albay'),
('Juan Dela Cruz','juan@example.com','09181234567','Polangui, Albay'),
('Alex Reyes','alex@example.com','09191234567','Polangui, Albay'),
('Sam Garcia','sam@example.com','09201234567','Polangui, Albay'),
('Jamie Cruz','jamie@example.com','09211234567','Polangui, Albay');

INSERT INTO products (name,sku,category,price,stock,safety_stock,alt_text) VALUES
('Wash & Fold - Regular','LT-WF-REG','Wash & Fold',180,32,10,'Folded clean laundry in a basket'),
('Wash & Fold - Express','LT-WF-EXP','Wash & Fold',250,7,10,'Freshly folded laundry ready for express service'),
('Dry Cleaning - Shirt','LT-DC-SHT','Dry Cleaning',120,15,5,'Clean pressed shirt on a hanger'),
('Laundry Bag','LT-BAG-001','Supplies',95,4,8,'Reusable laundry bag for customer orders');

INSERT INTO product_variants(product_id,variant_name) VALUES
(1,'Regular'),(2,'Express'),(3,'Small'),(3,'Medium'),(3,'Large'),(4,'Yellow'),(4,'Navy');

INSERT INTO orders(order_number,customer_id,items_count,total,status,payment_status,tracking_number,address,return_status) VALUES
('LT-1001',1,3,540,'Pending','Paid',NULL,'Polangui, Albay','None'),
('LT-1002',2,2,430,'Processing','Paid',NULL,'Polangui, Albay','None'),
('LT-1003',3,4,760,'Shipped','Paid','LTX-884392','Polangui, Albay','None'),
('LT-1004',4,1,250,'Delivered','Paid','LTX-883210','Polangui, Albay','None'),
('LT-1005',5,2,360,'Refunded','Refunded',NULL,'Polangui, Albay','Refunded');
