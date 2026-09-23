<?php
require_once __DIR__ . '/config.php';

$view = $_GET['view'] ?? (is_admin() ? 'dashboard' : 'login');
$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'login') {
            verify_csrf();
            $email = trim($_POST['email'] ?? '');
            $password = $_POST['password'] ?? '';

            $stmt = db()->prepare('SELECT * FROM admins WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $admin = $stmt->fetch();

            if (!$admin || !password_verify($password, $admin['password_hash'])) {
                throw new RuntimeException('Invalid email or password.');
            }

            session_regenerate_id(true);
            $_SESSION['pending_admin_id'] = (int)$admin['id'];
            $_SESSION['mfa_code'] = (string)random_int(100000, 999999);
            $_SESSION['mfa_expires'] = time() + 300;
            $view = 'mfa';
            $message = 'MFA code generated for this prototype. In production, send it through an authenticator or approved second factor.';
        }

        if ($action === 'verify_mfa') {
            verify_csrf();
            $code = trim($_POST['mfa_code'] ?? '');
            if (empty($_SESSION['pending_admin_id']) || time() > ($_SESSION['mfa_expires'] ?? 0)) {
                throw new RuntimeException('MFA session expired. Please sign in again.');
            }
            if (!hash_equals((string)$_SESSION['mfa_code'], $code)) {
                throw new RuntimeException('Incorrect MFA code.');
            }

            $_SESSION['admin_id'] = $_SESSION['pending_admin_id'];
            $_SESSION['mfa_verified'] = true;
            unset($_SESSION['pending_admin_id'], $_SESSION['mfa_code'], $_SESSION['mfa_expires']);
            header('Location: index.php?view=dashboard');
            exit;
        }

        if (!is_admin()) {
            throw new RuntimeException('Please sign in first.');
        }

        if ($action === 'save_service') {
            verify_csrf();
            $id = (int)($_POST['id'] ?? 0);
            $sku = trim($_POST['sku'] ?? '');
            $name = trim($_POST['name'] ?? '');
            $category = trim($_POST['category'] ?? '');
            $variant = trim($_POST['variant'] ?? '');
            $price = (float)($_POST['price'] ?? 0);
            $stock = (int)($_POST['stock_level'] ?? 0);
            $safety = (int)($_POST['safety_stock'] ?? 0);
            $alt = trim($_POST['alt_text'] ?? '');

            if ($sku === '') throw new RuntimeException('SKU is required.');
            if ($price <= 0) throw new RuntimeException('Price must be a positive number.');
            if ($stock < 0 || $safety < 0) throw new RuntimeException('Stock values cannot be negative.');
            if ($alt === '') throw new RuntimeException('Descriptive alt text is required.');

            if ($id) {
                $stmt = db()->prepare('UPDATE services SET sku=?, name=?, category=?, variant=?, price=?, stock_level=?, safety_stock=?, alt_text=? WHERE id=?');
                $stmt->execute([$sku,$name,$category,$variant,$price,$stock,$safety,$alt,$id]);
                $message = 'Service updated successfully.';
            } else {
                $stmt = db()->prepare('INSERT INTO services (sku,name,category,variant,price,stock_level,safety_stock,alt_text) VALUES (?,?,?,?,?,?,?,?)');
                $stmt->execute([$sku,$name,$category,$variant,$price,$stock,$safety,$alt]);
                $message = 'Service added successfully.';
            }
            $view = 'services';
        }

        if ($action === 'delete_service') {
            verify_csrf();
            $id = (int)($_POST['id'] ?? 0);
            db()->prepare('DELETE FROM services WHERE id=?')->execute([$id]);
            $message = 'Service deleted.';
            $view = 'services';
        }

        if ($action === 'update_order') {
            verify_csrf();
            $id = (int)$_POST['id'];
            $status = $_POST['status'] ?? 'Pending';
            $tracking = trim($_POST['tracking_no'] ?? '');
            $payment = $_POST['payment_status'] ?? 'Unpaid';

            $allowedStatus = ['Pending','Processing','Ready for Pickup','Shipped','Delivered','Refunded'];
            $allowedPayment = ['Unpaid','Paid','Failed','Refunded'];
            if (!in_array($status, $allowedStatus, true)) throw new RuntimeException('Invalid order status.');
            if (!in_array($payment, $allowedPayment, true)) throw new RuntimeException('Invalid payment status.');

            db()->prepare('UPDATE orders SET status=?, tracking_no=?, payment_status=? WHERE id=?')
               ->execute([$status, $tracking ?: null, $payment, $id]);

            $message = 'Order updated. Shipping label/tracking simulation is ready for this prototype.';
            $view = 'orders';
        }

        if ($action === 'refund_order') {
            verify_csrf();
            $id = (int)$_POST['id'];
            $reason = trim($_POST['return_reason'] ?? '');
            db()->prepare("UPDATE orders SET status='Refunded', payment_status='Refunded', return_reason=? WHERE id=?")
               ->execute([$reason ?: 'Customer return/refund request', $id]);
            $message = 'Return/refund simulated and recorded.';
            $view = 'orders';
        }

        if ($action === 'save_customer') {
            verify_csrf();
            $id = (int)($_POST['id'] ?? 0);
            $full = trim($_POST['full_name'] ?? '');
            $title = trim($_POST['title'] ?? '');
            $gender = trim($_POST['gender'] ?? '');
            $email = trim($_POST['email'] ?? '');
            $phone = trim($_POST['phone'] ?? '');
            $address = trim($_POST['address'] ?? '');

            if ($full === '') throw new RuntimeException('Full Name is required.');
            if ($id) {
                db()->prepare('UPDATE customers SET full_name=?, title=?, gender=?, email=?, phone=?, address=? WHERE id=?')
                    ->execute([$full,$title,$gender,$email,$phone,$address,$id]);
            } else {
                db()->prepare('INSERT INTO customers (full_name,title,gender,email,phone,address) VALUES (?,?,?,?,?,?)')
                    ->execute([$full,$title,$gender,$email,$phone,$address]);
            }
            $message = 'Customer profile saved.';
            $view = 'customers';
        }
    } catch (Throwable $ex) {
        $error = $ex->getMessage();
    }
}

if ($view === 'logout') {
    session_unset();
    session_destroy();
    header('Location: index.php?view=login');
    exit;
}

if (!is_admin() && !in_array($view, ['login','mfa'], true)) {
    $view = 'login';
}

$stats = [];
$services = [];
$orders = [];
$customers = [];

if (is_admin()) {
    $stats['orders'] = (int)db()->query('SELECT COUNT(*) FROM orders')->fetchColumn();
    $stats['pending'] = (int)db()->query("SELECT COUNT(*) FROM orders WHERE status='Pending'")->fetchColumn();
    $stats['revenue'] = (float)db()->query("SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='Paid'")->fetchColumn();
    $stats['low_stock'] = (int)db()->query('SELECT COUNT(*) FROM services WHERE stock_level <= safety_stock')->fetchColumn();

    $services = db()->query('SELECT * FROM services ORDER BY id DESC')->fetchAll();
    $orders = db()->query('SELECT o.*, c.full_name, s.name AS service_name FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN services s ON s.id=o.service_id ORDER BY o.created_at DESC')->fetchAll();
    $customers = db()->query('SELECT * FROM customers ORDER BY id DESC')->fetchAll();
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LaundriTrack Admin</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="<?= is_admin() ? 'admin-body' : 'auth-body' ?>">
<?php if (is_admin()): ?>
<aside class="sidebar" aria-label="Main navigation">
    <div class="brand"><span class="brand-mark">L</span><span>LaundriTrack</span></div>
    <div class="sidebar-label">ADMIN PANEL</div>
    <nav>
        <a class="<?= $view==='dashboard'?'active':'' ?>" href="?view=dashboard">Dashboard</a>
        <a class="<?= $view==='orders'?'active':'' ?>" href="?view=orders">Orders</a>
        <a class="<?= $view==='services'?'active':'' ?>" href="?view=services">Services & Inventory</a>
        <a class="<?= $view==='customers'?'active':'' ?>" href="?view=customers">Customers</a>
        <a class="<?= $view==='reports'?'active':'' ?>" href="?view=reports">Reports</a>
        <a class="<?= $view==='settings'?'active':'' ?>" href="?view=settings">Settings</a>
    </nav>
    <div class="sidebar-bottom">
        <a href="?view=logout">Sign out</a>
    </div>
</aside>

<main class="main" id="main-content">
<header class="topbar">
    <div>
        <p class="eyebrow">ADMINISTRATION</p>
        <h1><?= e(ucwords(str_replace('-', ' ', $view))) ?></h1>
    </div>
    <div class="top-actions">
        <span class="role-chip">Administrator</span>
        <span class="avatar" aria-label="Administrator profile">LT</span>
    </div>
</header>

<?php if ($message): ?><div class="alert success" role="status"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert error" role="alert"><?= e($error) ?></div><?php endif; ?>

<?php if ($view === 'dashboard'): ?>
<section class="hero-card">
    <div>
        <p class="eyebrow">LAUNDRY OPERATIONS</p>
        <h2>Keep every laundry order on track.</h2>
        <p>Monitor billing, order tracking, customer records, and inventory from one accessible workspace.</p>
        <div class="hero-actions">
            <a class="btn primary" href="?view=orders">View Orders</a>
            <a class="btn secondary" href="?view=services">Manage Services</a>
        </div>
    </div>
    <div class="hero-icon" aria-hidden="true">◌</div>
</section>

<div class="stats-grid">
    <article class="stat-card"><span>Total Orders</span><strong><?= $stats['orders'] ?></strong><small>All recorded orders</small></article>
    <article class="stat-card"><span>Pending</span><strong><?= $stats['pending'] ?></strong><small>Needs attention</small></article>
    <article class="stat-card"><span>Paid Revenue</span><strong>₱<?= number_format($stats['revenue'],2) ?></strong><small>Recorded paid orders</small></article>
    <article class="stat-card warning"><span>Low Stock</span><strong><?= $stats['low_stock'] ?></strong><small>At or below safety stock</small></article>
</div>

<div class="two-col">
    <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">ORDER LIFECYCLE</p><h2>Recent orders</h2></div><a href="?view=orders" class="text-link">View all</a></div>
        <div class="table-wrap">
        <table>
            <caption class="sr-only">Recent laundry orders</caption>
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($orders,0,5) as $o): ?>
            <tr>
                <td><strong><?= e($o['order_no']) ?></strong><br><small><?= e($o['service_name'] ?? 'Laundry service') ?></small></td>
                <td><?= e($o['full_name']) ?></td>
                <td><span class="status <?= strtolower(str_replace(' ','-',$o['status'])) ?>"><?= e($o['status']) ?></span></td>
                <td>₱<?= number_format((float)$o['total'],2) ?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </section>

    <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">SAFETY STOCK</p><h2>Inventory alerts</h2></div></div>
        <?php foreach ($services as $s): if ((int)$s['stock_level'] <= (int)$s['safety_stock']): ?>
            <div class="alert-row"><div><strong><?= e($s['name']) ?></strong><small><?= e($s['sku']) ?></small></div><span class="status low">Low stock: <?= (int)$s['stock_level'] ?></span></div>
        <?php endif; endforeach; ?>
        <?php if ($stats['low_stock'] === 0): ?><p class="muted">No services are below safety stock.</p><?php endif; ?>
    </section>
</div>
<?php endif; ?>

<?php if ($view === 'services'): ?>
<section class="panel">
<div class="panel-head">
    <div><p class="eyebrow">CATALOG & INVENTORY</p><h2>Services</h2><p class="muted">Manage SKU, price, variants, categories, stock, and descriptive alt text.</p></div>
    <button class="btn primary" type="button" onclick="openServiceModal()">+ Add service</button>
</div>
<div class="table-wrap">
<table>
<caption class="sr-only">Laundry service catalog and inventory</caption>
<thead><tr><th>Service</th><th>SKU</th><th>Category</th><th>Variant</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
<tbody>
<?php foreach ($services as $s): $low=(int)$s['stock_level'] <= (int)$s['safety_stock']; ?>
<tr>
<td><strong><?= e($s['name']) ?></strong><br><small><?= e($s['alt_text']) ?></small></td>
<td><?= e($s['sku']) ?></td><td><?= e($s['category']) ?></td><td><?= e($s['variant']) ?></td>
<td>₱<?= number_format((float)$s['price'],2) ?></td><td><?= (int)$s['stock_level'] ?></td>
<td><span class="status <?= $low?'low':'in-stock' ?>"><?= $low?'Low Stock':'In Stock' ?></span></td>
<td class="actions">
<button class="btn small" type="button" onclick='editService(<?= json_encode($s, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?>)'>Edit</button>
<form method="post" onsubmit="return confirm('Delete this service?')">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="delete_service"><input type="hidden" name="id" value="<?= (int)$s['id'] ?>">
<button class="btn small danger-outline" type="submit">Delete</button>
</form>
</td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
</div>
</section>

<div class="modal" id="serviceModal" hidden>
<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="serviceTitle">
<button class="modal-close" type="button" onclick="closeModal('serviceModal')" aria-label="Close">×</button>
<h2 id="serviceTitle">Add service</h2>
<form method="post" class="form-grid" id="serviceForm">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="save_service"><input type="hidden" name="id" id="service_id">
<label>Service name<input name="name" id="service_name" required></label>
<label>SKU<input name="sku" id="service_sku" required aria-describedby="skuHelp"><small id="skuHelp">SKU must be unique.</small></label>
<label>Category<select name="category" id="service_category"><option>Laundry Service</option><option>Add-on Service</option><option>Logistics</option><option>Corporate</option></select></label>
<label>Variant<input name="variant" id="service_variant" placeholder="e.g., Standard / per kg"></label>
<label>Price (₱)<input type="number" name="price" id="service_price" min="0.01" step="0.01" required></label>
<label>Stock level<input type="number" name="stock_level" id="service_stock" min="0" required></label>
<label>Safety stock<input type="number" name="safety_stock" id="service_safety" min="0" required></label>
<label class="full">Descriptive alt text<input name="alt_text" id="service_alt" required placeholder="Describe the service image for screen readers"></label>
<div class="form-actions full"><button class="btn secondary" type="button" onclick="closeModal('serviceModal')">Cancel</button><button class="btn primary" type="submit">Save service</button></div>
</form>
</div></div>
<?php endif; ?>

<?php if ($view === 'orders'): ?>
<section class="panel">
<div class="panel-head"><div><p class="eyebrow">ORDER LIFECYCLE</p><h2>Customer orders</h2><p class="muted">Track pending, processing, pickup, delivery, and refund states.</p></div></div>
<div class="table-wrap">
<table>
<caption class="sr-only">Customer order lifecycle</caption>
<thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Total</th><th>Status</th><th>Payment</th><th>Tracking</th><th>Actions</th></tr></thead>
<tbody>
<?php foreach ($orders as $o): ?>
<tr>
<td><strong><?= e($o['order_no']) ?></strong><br><small><?= e($o['created_at']) ?></small></td>
<td><?= e($o['full_name']) ?></td><td><?= e($o['service_name'] ?? '—') ?></td>
<td>₱<?= number_format((float)$o['total'],2) ?></td>
<td><span class="status <?= strtolower(str_replace(' ','-',$o['status'])) ?>"><?= e($o['status']) ?></span></td>
<td><span class="status payment-<?= strtolower($o['payment_status']) ?>"><?= e($o['payment_status']) ?></span></td>
<td><?= e($o['tracking_no'] ?: '—') ?></td>
<td><button class="btn small" type="button" onclick='editOrder(<?= json_encode($o, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?>)'>Manage</button></td>
</tr>
<?php endforeach; ?>
</tbody></table>
</div></section>

<div class="modal" id="orderModal" hidden>
<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="orderTitle">
<button class="modal-close" type="button" onclick="closeModal('orderModal')" aria-label="Close">×</button>
<h2 id="orderTitle">Manage order</h2>
<form method="post" class="form-grid">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="update_order"><input type="hidden" name="id" id="order_id">
<label>Status<select name="status" id="order_status"><option>Pending</option><option>Processing</option><option>Ready for Pickup</option><option>Shipped</option><option>Delivered</option><option>Refunded</option></select></label>
<label>Payment status<select name="payment_status" id="order_payment"><option>Unpaid</option><option>Paid</option><option>Failed</option><option>Refunded</option></select></label>
<label class="full">Tracking number<input name="tracking_no" id="order_tracking" placeholder="Generate or assign tracking number"></label>
<div class="form-actions full"><button class="btn secondary" type="button" onclick="closeModal('orderModal')">Cancel</button><button class="btn primary" type="submit">Save & simulate label</button></div>
</form>
<hr>
<form method="post" class="refund-form">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="refund_order"><input type="hidden" name="id" id="refund_id">
<label>Return / refund reason<textarea name="return_reason" placeholder="Reason for return or refund"></textarea></label>
<button class="btn danger" type="submit">Process Return / Refund</button>
</form>
</div></div>
<?php endif; ?>

<?php if ($view === 'customers'): ?>
<section class="panel">
<div class="panel-head"><div><p class="eyebrow">CUSTOMER RECORDS</p><h2>Customer profiles</h2><p class="muted">Inclusive profile fields support a single Full Name field, flexible titles, and gender choices.</p></div><button class="btn primary" type="button" onclick="openCustomerModal()">+ Add customer</button></div>
<div class="table-wrap">
<table><caption class="sr-only">Customer profiles</caption>
<thead><tr><th>Full Name</th><th>Title</th><th>Gender</th><th>Email</th><th>Phone</th><th>Address</th><th>Action</th></tr></thead>
<tbody>
<?php foreach ($customers as $c): ?>
<tr><td><strong><?= e($c['full_name']) ?></strong></td><td><?= e($c['title'] ?: '—') ?></td><td><?= e($c['gender'] ?: 'Prefer not to say') ?></td><td><?= e($c['email'] ?: '—') ?></td><td><?= e($c['phone'] ?: '—') ?></td><td><?= e($c['address'] ?: '—') ?></td><td><button class="btn small" type="button" onclick='editCustomer(<?= json_encode($c, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?>)'>Edit</button></td></tr>
<?php endforeach; ?>
</tbody></table></div></section>

<div class="modal" id="customerModal" hidden>
<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="customerTitle">
<button class="modal-close" type="button" onclick="closeModal('customerModal')" aria-label="Close">×</button>
<h2 id="customerTitle">Add customer</h2>
<form method="post" class="form-grid">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="save_customer"><input type="hidden" name="id" id="customer_id">
<label class="full">Full Name<input name="full_name" id="customer_full" required></label>
<label>Title<select name="title" id="customer_title"><option value="">No title</option><option>Mr.</option><option>Ms.</option><option>Mx.</option><option>Dr.</option><option>Prof.</option><option>Other / self-describe</option></select></label>
<label>Gender<select name="gender" id="customer_gender"><option value="">Prefer not to say</option><option>Woman</option><option>Man</option><option>Non-binary</option><option>Other / self-describe</option></select></label>
<label>Email<input type="email" name="email" id="customer_email"></label>
<label>Phone<input name="phone" id="customer_phone"></label>
<label class="full">Address<textarea name="address" id="customer_address"></textarea></label>
<div class="form-actions full"><button class="btn secondary" type="button" onclick="closeModal('customerModal')">Cancel</button><button class="btn primary" type="submit">Save customer</button></div>
</form>
</div></div>
<?php endif; ?>

<?php if ($view === 'reports'): ?>
<div class="stats-grid">
<article class="stat-card"><span>Total Customers</span><strong><?= count($customers) ?></strong><small>Customer records</small></article>
<article class="stat-card"><span>Services</span><strong><?= count($services) ?></strong><small>Catalog items</small></article>
<article class="stat-card"><span>Paid Revenue</span><strong>₱<?= number_format($stats['revenue'],2) ?></strong><small>From paid orders</small></article>
<article class="stat-card warning"><span>Low Stock</span><strong><?= $stats['low_stock'] ?></strong><small>Safety stock alerts</small></article>
</div>
<section class="panel"><div class="panel-head"><div><p class="eyebrow">OPERATIONS</p><h2>System summary</h2></div></div>
<p>LaundriTrack supports organized laundry operations through order tracking, billing, customer communication, record keeping, and service management.</p>
</section>
<?php endif; ?>

<?php if ($view === 'settings'): ?>
<section class="panel">
<p class="eyebrow">INFRASTRUCTURE & SECURITY</p>
<h2>Prototype technical controls</h2>
<div class="info-grid">
<div><h3>Stack</h3><p>Custom web application using PHP, MySQL/MariaDB, HTML5, CSS3 and JavaScript.</p></div>
<div><h3>Authentication</h3><p>Session-based login, bcrypt password verification, CSRF protection, session regeneration, and simulated MFA.</p></div>
<div><h3>Database</h3><p>Transactional records are stored in MySQL/MariaDB with foreign keys and prepared statements.</p></div>
<div><h3>Accessibility</h3><p>Semantic landmarks, keyboard-visible focus, text-based status labels, descriptive alt-text fields, and inline validation messages.</p></div>
</div>
</section>
<?php endif; ?>

</main>
<?php else: ?>
<main class="auth-shell">
<section class="auth-card">
<div class="brand centered"><span class="brand-mark">L</span><span>LaundriTrack</span></div>
<?php if ($view === 'login'): ?>
<p class="eyebrow">ADMIN ACCESS</p><h1>Welcome back.</h1><p class="muted">Sign in to manage laundry services, orders, inventory, and customer records.</p>
<form method="post" class="auth-form">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="login">
<label>Email<input type="email" name="email" autocomplete="username" required></label>
<label>Password<input type="password" name="password" autocomplete="current-password" required></label>
<button class="btn primary full-btn" type="submit">Continue to MFA</button>
</form>
<div class="demo-note"><strong>Prototype account</strong><br>admin@laundritrack.local<br>Admin@12345</div>
<?php else: ?>
<p class="eyebrow">MULTI-FACTOR AUTHENTICATION</p><h1>Verify your sign-in.</h1><p class="muted"><?= e($message ?: 'Enter the six-digit verification code.') ?></p>
<form method="post" class="auth-form">
<input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="verify_mfa">
<label>6-digit MFA code<input inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="mfa_code" required autofocus></label>
<div class="demo-code">Demo MFA code: <strong><?= e($_SESSION['mfa_code'] ?? 'expired') ?></strong></div>
<button class="btn primary full-btn" type="submit">Verify & enter admin</button>
</form>
<a class="text-link" href="?view=login">Back to login</a>
<?php endif; ?>
</section>
</main>
<?php endif; ?>
<script src="assets/app.js"></script>
</body>
</html>
