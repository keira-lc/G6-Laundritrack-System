CREATE DATABASE IF NOT EXISTS laundritrack
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE laundritrack;

CREATE TABLE IF NOT EXISTS admins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Administrator','Manager','Staff') NOT NULL DEFAULT 'Administrator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    variant VARCHAR(100) DEFAULT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock_level INT NOT NULL DEFAULT 0,
    safety_stock INT NOT NULL DEFAULT 5,
    alt_text VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    title VARCHAR(40) DEFAULT NULL,
    gender VARCHAR(60) DEFAULT NULL,
    email VARCHAR(190) DEFAULT NULL,
    phone VARCHAR(40) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(30) NOT NULL UNIQUE,
    customer_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('Pending','Processing','Ready for Pickup','Shipped','Delivered','Refunded') NOT NULL DEFAULT 'Pending',
    payment_status ENUM('Unpaid','Paid','Failed','Refunded') NOT NULL DEFAULT 'Unpaid',
    tracking_no VARCHAR(100) DEFAULT NULL,
    return_reason VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

INSERT IGNORE INTO admins (id, full_name, email, password_hash, role)
VALUES
(1, 'LaundriTrack Administrator', 'admin@laundritrack.local',
 '$2y$12$BIN4ZYklwIukdlynZTzJ7ui0bBTGtdMHfpOWevrNcij1eJFlTfT/u',
 'Administrator');

INSERT IGNORE INTO services
(id, sku, name, category, variant, price, stock_level, safety_stock, alt_text)
VALUES
(1,'LT-WDF-001','Wash, Dry & Fold','Laundry Service','Standard / per kg',65.00,25,10,'Clean folded laundry service'),
(2,'LT-IRN-001','Ironing Add-on','Add-on Service','Per kg',30.00,8,10,'Ironing service for cleaned clothes'),
(3,'LT-PUD-001','Pickup & Delivery','Logistics','Standard Area',50.00,12,5,'Laundry pickup and delivery service'),
(4,'LT-COR-001','Bulk / Corporate Laundry','Corporate','Business Package',1200.00,3,5,'Bulk laundry package for organizations');

INSERT IGNORE INTO customers
(id, full_name, title, gender, email, phone, address)
VALUES
(1,'Maria Santos','Ms.','Woman','maria@example.com','09171234567','Polangui, Albay'),
(2,'Alex Reyes','Mx.','Non-binary','alex@example.com','09181234567','Polangui, Albay'),
(3,'Juan Dela Cruz','Mr.','Man','juan@example.com','09191234567','Polangui, Albay');

INSERT IGNORE INTO orders
(id, order_no, customer_id, service_id, quantity, total, status, payment_status, tracking_no)
VALUES
(1,'LT-2026-0001',1,1,4,260.00,'Processing','Paid','LT-TRK-1001'),
(2,'LT-2026-0002',2,3,1,50.00,'Pending','Unpaid',NULL),
(3,'LT-2026-0003',3,4,1,1200.00,'Ready for Pickup','Paid','LT-TRK-1003');
