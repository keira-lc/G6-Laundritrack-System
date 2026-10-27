const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'laundritrack',
  waitForConnections: true,
  connectionLimit: 10
});

async function ensureAdmin() {
  const [rows] = await pool.query('SELECT id FROM admin_users WHERE email=? LIMIT 1', ['admin@laundritrack.local']);
  if (!rows.length) {
    const hash = await bcrypt.hash('Admin@12345', 12);
    await pool.query('INSERT INTO admin_users(full_name,email,password_hash,role,mfa_enabled) VALUES (?,?,?,?,?)', ['LaundriTrack Admin','admin@laundritrack.local',hash,'admin',1]);
  }
}

function auth(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token) return res.status(401).json({message:'Authentication required.'});
  try { req.user=jwt.verify(token,JWT_SECRET); next(); }
  catch { return res.status(401).json({message:'Invalid or expired token.'}); }
}
function adminOnly(req,res,next){
  if(req.user?.role!=='admin') return res.status(403).json({message:'Admin role required.'});
  next();
}
function customerOnly(req,res,next){
  if(req.user?.role!=='customer') return res.status(403).json({message:'Customer account required.'});
  next();
}

app.get('/api/health', async (req,res)=>{
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'GARDEN Laundry Hub API',database:'MySQL/XAMPP'}); }
  catch(e){ res.status(503).json({ok:false,message:'Database connection failed.',error:e.message}); }
});

app.post('/api/auth/login', async (req,res)=>{
  try {
    const {email,password}=req.body;
    const [rows]=await pool.query('SELECT * FROM admin_users WHERE email=? LIMIT 1',[email]);
    const user=rows[0];
    if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({message:'Invalid email or password.'});
    const challenge=jwt.sign({sub:user.id,type:'mfa'},JWT_SECRET,{expiresIn:'5m'});
    res.json({mfaRequired:true,challenge});
  } catch(e){ res.status(500).json({message:'Login failed.',error:e.message}); }
});

app.post('/api/auth/mfa', async (req,res)=>{
  try {
    const {challenge,code}=req.body;
    const c=jwt.verify(challenge,JWT_SECRET);
    if(c.type!=='mfa'||code!=='123456') throw new Error('Invalid MFA');
    const [rows]=await pool.query('SELECT id,full_name,email,role,mfa_enabled FROM admin_users WHERE id=? LIMIT 1',[c.sub]);
    const user=rows[0];
    if(!user) throw new Error('User not found');
    const token=jwt.sign({sub:user.id,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'4h'});
    res.json({token,user:{id:user.id,name:user.full_name,email:user.email,role:user.role,mfaEnabled:!!user.mfa_enabled}});
  } catch { res.status(401).json({message:'Invalid MFA code or expired challenge.'}); }
});

// Customer account API for the storefront. Passwords are stored as bcrypt hashes.
app.post('/api/store/auth/signup', async (req,res)=>{
  const fullName=String(req.body.fullName||'').trim();
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  if(!fullName || !email || !password) return res.status(400).json({message:'Name, email, and password are required.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({message:'Enter a valid email address.'});
  if(password.length<8) return res.status(400).json({message:'Password must be at least 8 characters.'});
  try {
    const [existing]=await pool.query('SELECT id,password_hash,full_name,phone,address FROM customers WHERE LOWER(email)=? LIMIT 1',[email]);
    const passwordHash=await bcrypt.hash(password,12);
    let customerId, phone='', address='';
    if(existing.length) {
      if(existing[0].password_hash) return res.status(409).json({message:'An account with this email already exists. Please sign in.'});
      customerId=existing[0].id; phone=existing[0].phone||''; address=existing[0].address||'';
      await pool.query('UPDATE customers SET full_name=?,password_hash=? WHERE id=?',[fullName,passwordHash,customerId]);
    } else {
      const [created]=await pool.query('INSERT INTO customers(full_name,email,password_hash) VALUES (?,?,?)',[fullName,email,passwordHash]);
      customerId=created.insertId;
    }
    const token=jwt.sign({sub:customerId,email,role:'customer'},JWT_SECRET,{expiresIn:'7d'});
    res.status(201).json({token,user:{id:customerId,fullName,email,phone,address}});
  } catch(e){ res.status(500).json({message:'Could not create your account. Check the database migration and try again.'}); }
});

app.post('/api/store/auth/login', async (req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  try {
    const [rows]=await pool.query('SELECT id,full_name,email,phone,address,password_hash FROM customers WHERE LOWER(email)=? LIMIT 1',[email]);
    const user=rows[0];
    if(!user || !user.password_hash || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({message:'Invalid email or password.'});
    const token=jwt.sign({sub:user.id,email:user.email,role:'customer'},JWT_SECRET,{expiresIn:'7d'});
    res.json({token,user:{id:user.id,fullName:user.full_name,email:user.email,phone:user.phone||'',address:user.address||''}});
  } catch(e){ res.status(500).json({message:'Sign-in failed. Please try again.'}); }
});

app.get('/api/store/auth/me',auth,customerOnly,async(req,res)=>{
  try {
    const [rows]=await pool.query('SELECT id,full_name fullName,email,phone,address,created_at createdAt FROM customers WHERE id=? LIMIT 1',[req.user.sub]);
    if(!rows.length) return res.status(404).json({message:'Customer account not found.'});
    res.json(rows[0]);
  } catch(e){res.status(500).json({message:'Could not load your profile.'});}
});

app.put('/api/store/auth/profile',auth,customerOnly,async(req,res)=>{
  const fullName=String(req.body.fullName||'').trim();
  const phone=String(req.body.phone||'').trim();
  const address=String(req.body.address||'').trim();
  if(!fullName) return res.status(400).json({message:'Full name is required.'});
  try {
    await pool.query('UPDATE customers SET full_name=?,phone=?,address=? WHERE id=?',[fullName,phone||null,address||null,req.user.sub]);
    const [rows]=await pool.query('SELECT id,full_name fullName,email,phone,address,created_at createdAt FROM customers WHERE id=?',[req.user.sub]);
    res.json(rows[0]);
  } catch(e){res.status(500).json({message:'Could not save your profile.'});}
});

app.get('/api/store/orders/mine',auth,customerOnly,async(req,res)=>{
  try {
    const [orders]=await pool.query('SELECT id,order_number orderNumber,items_count items,total,status,payment_status paymentStatus,tracking_number trackingNumber,address,created_at createdAt FROM orders WHERE customer_id=? ORDER BY id DESC',[req.user.sub]);
    for(const order of orders){
      const [items]=await pool.query('SELECT product_name name,variant_name variant,quantity,unit_price unitPrice,subtotal FROM order_items WHERE order_id=? ORDER BY id',[order.id]);
      order.total=Number(order.total); order.items=Number(order.items); order.lines=items.map(i=>({...i,quantity:Number(i.quantity),unitPrice:Number(i.unitPrice),subtotal:Number(i.subtotal)}));
    }
    res.json(orders);
  } catch(e){res.status(500).json({message:'Could not load your order history.'});}
});

// Public customer-facing M-Commerce API. These routes use the SAME MySQL database as the admin panel.
app.get('/api/store/products', async (req,res)=>{
  try {
    const [products] = await pool.query('SELECT id,name,sku,category,price,stock,safety_stock,alt_text FROM products WHERE stock > 0 ORDER BY category,name');
    for (const p of products) {
      const [variants] = await pool.query('SELECT variant_name FROM product_variants WHERE product_id=? ORDER BY id',[p.id]);
      p.id = Number(p.id); p.price = Number(p.price); p.stock = Number(p.stock);
      p.variants = variants.map(v=>v.variant_name);
    }
    res.json(products);
  } catch(e) { res.status(500).json({message:'Unable to load the product catalog.'}); }
});

app.get('/api/store/categories', async (req,res)=>{
  try { const [rows] = await pool.query('SELECT DISTINCT category FROM products WHERE stock > 0 ORDER BY category'); res.json(rows.map(r=>r.category)); }
  catch(e) { res.status(500).json({message:'Unable to load categories.'}); }
});

app.post('/api/store/orders', auth, customerOnly, async (req,res)=>{
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  let customer = {};
  try {
    const [profileRows]=await pool.query('SELECT id,full_name fullName,email,phone,address FROM customers WHERE id=? LIMIT 1',[req.user.sub]);
    if(!profileRows.length) return res.status(401).json({message:'Please sign in again before checking out.'});
    customer={...profileRows[0],phone:String(req.body.phone||profileRows[0].phone||'').trim(),address:String(req.body.address||profileRows[0].address||'').trim()};
  } catch(e){ return res.status(500).json({message:'Could not load your customer profile.'}); }
  if (!customer.fullName?.trim() || !customer.email?.trim() || !customer.phone?.trim() || !customer.address?.trim())
    return res.status(400).json({message:'Full name, email, phone, and delivery address are required.'});
  if (!items.length) return res.status(400).json({message:'Your cart is empty.'});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const checked = [];
    for (const item of items) {
      const productId = Number(item.productId), quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Object.assign(new Error('Each item must have a valid product and quantity.'),{status:400});
      const [rows] = await conn.query('SELECT id,name,price,stock FROM products WHERE id=? FOR UPDATE',[productId]);
      const product = rows[0];
      if (!product) throw Object.assign(new Error('A product in your cart is no longer available.'),{status:409});
      if (Number(product.stock) < quantity) throw Object.assign(new Error(`Not enough stock for ${product.name}. Please update your cart.`),{status:409});
      const variant = String(item.variant || '').trim();
      if (variant) {
        const [v] = await conn.query('SELECT id FROM product_variants WHERE product_id=? AND variant_name=? LIMIT 1',[productId,variant]);
        if (!v.length) throw Object.assign(new Error(`The selected variant for ${product.name} is no longer available.`),{status:409});
      }
      const unitPrice = Number(product.price);
      total += unitPrice * quantity;
      checked.push({productId,productName:product.name,quantity,unitPrice,subtotal:unitPrice*quantity,variant});
    }
    const customerId=Number(req.user.sub);
    await conn.query('UPDATE customers SET full_name=?,phone=?,address=? WHERE id=?',[customer.fullName.trim(),customer.phone.trim(),customer.address.trim(),customerId]);
    const orderNumber = 'LT-' + Date.now().toString().slice(-8) + Math.floor(10 + Math.random()*90);
    const itemCount = checked.reduce((sum,item)=>sum+item.quantity,0);
    const [order] = await conn.query("INSERT INTO orders(order_number,customer_id,items_count,total,status,payment_status,address) VALUES (?,?,?,?,'Pending','Pending',?)",[orderNumber,customerId,itemCount,total,customer.address.trim()]);
    for (const item of checked) {
      await conn.query('INSERT INTO order_items(order_id,product_id,product_name,variant_name,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?,?)',[order.insertId,item.productId,item.productName,item.variant,item.quantity,item.unitPrice,item.subtotal]);
      const [updated] = await conn.query('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?',[item.quantity,item.productId,item.quantity]);
      if (!updated.affectedRows) throw Object.assign(new Error(`Stock changed while placing your order for ${item.productName}. Please try again.`),{status:409});
    }
    await conn.commit();
    res.status(201).json({ok:true,orderNumber,status:'Pending',items:itemCount,total:Number(total.toFixed(2)),message:'Your order was placed successfully.'});
  } catch(e) {
    await conn.rollback();
    res.status(e.status || 500).json({message:e.status ? e.message : 'We could not place your order. Please try again.'});
  } finally { conn.release(); }
});

app.get('/api/dashboard',auth,adminOnly,async(req,res)=>{
  try {
    const [[rev]] = await pool.query("SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE payment_status='Paid'");
    const [[counts]] = await pool.query("SELECT COUNT(*) orders, SUM(status='Pending') pending, SUM(return_status<>'None') returns FROM orders");
    const [[low]] = await pool.query('SELECT COUNT(*) lowStock FROM products WHERE stock<=safety_stock');
    res.json({revenue:Number(rev.revenue),orders:Number(counts.orders),pending:Number(counts.pending||0),lowStock:Number(low.lowStock),returns:Number(counts.returns||0)});
  } catch(e){res.status(500).json({message:e.message});}
});

app.get('/api/products',auth,adminOnly,async(req,res)=>{
  try {
    const [products]=await pool.query('SELECT * FROM products ORDER BY id DESC');
    for(const p of products){ const [v]=await pool.query('SELECT variant_name FROM product_variants WHERE product_id=? ORDER BY id',[p.id]); p.variants=v.map(x=>x.variant_name); p.price=Number(p.price); }
    res.json(products);
  } catch(e){res.status(500).json({message:e.message});}
});

app.post('/api/products',auth,adminOnly,async(req,res)=>{
  const p=req.body;
  if(!p.name||!p.sku||Number(p.price)<=0) return res.status(400).json({message:'Name, unique SKU, and a positive price are required.'});
  try {
    const [r]=await pool.query('INSERT INTO products(name,sku,category,price,stock,safety_stock,alt_text) VALUES (?,?,?,?,?,?,?)',[p.name,p.sku,p.category||'Uncategorized',Number(p.price),Number(p.stock||0),Number(p.safetyStock||0),p.altText||'']);
    for(const variant of (p.variants||[])) await pool.query('INSERT INTO product_variants(product_id,variant_name) VALUES (?,?)',[r.insertId,variant]);
    res.status(201).json({...p,id:r.insertId,price:Number(p.price),stock:Number(p.stock||0),safetyStock:Number(p.safetyStock||0)});
  } catch(e){ if(e.code==='ER_DUP_ENTRY') return res.status(409).json({message:'SKU must be unique.'}); res.status(500).json({message:e.message}); }
});

app.put('/api/products/:id',auth,adminOnly,async(req,res)=>{
  const p=req.body;
  if(!p.name||!p.sku||Number(p.price)<=0)return res.status(400).json({message:'Name, SKU, and a positive price are required.'});
  try {
    await pool.query('UPDATE products SET name=?,sku=?,category=?,price=?,stock=?,safety_stock=?,alt_text=? WHERE id=?',[p.name,p.sku,p.category||'Uncategorized',Number(p.price),Number(p.stock||0),Number(p.safetyStock||0),p.altText||'',req.params.id]);
    await pool.query('DELETE FROM product_variants WHERE product_id=?',[req.params.id]);
    for(const variant of (p.variants||[])) await pool.query('INSERT INTO product_variants(product_id,variant_name) VALUES (?,?)',[req.params.id,variant]);
    const [rows]=await pool.query('SELECT * FROM products WHERE id=?',[req.params.id]);
    if(!rows.length)return res.status(404).json({message:'Product not found.'});
    const [v]=await pool.query('SELECT variant_name FROM product_variants WHERE product_id=? ORDER BY id',[req.params.id]);
    res.json({...rows[0],id:Number(rows[0].id),price:Number(rows[0].price),stock:Number(rows[0].stock),safetyStock:Number(rows[0].safety_stock),variants:v.map(x=>x.variant_name),altText:rows[0].alt_text});
  } catch(e){ if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'SKU must be unique.'}); res.status(500).json({message:e.message}); }
});

app.delete('/api/products/:id',auth,adminOnly,async(req,res)=>{try{const[r]=await pool.query('DELETE FROM products WHERE id=?',[req.params.id]);if(!r.affectedRows)return res.status(404).json({message:'Product not found.'});res.json({ok:true});}catch(e){res.status(500).json({message:e.message});}});

app.get('/api/orders',auth,adminOnly,async(req,res)=>{
  try { const [rows]=await pool.query(`SELECT o.*, COALESCE(c.full_name,'Walk-in Customer') customer FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.id DESC`); res.json(rows.map(o=>({...o,id:o.order_number,items:o.items_count,payment:o.payment_status,tracking:o.tracking_number,total:Number(o.total),address:o.address}))); }
  catch(e){res.status(500).json({message:e.message});}
});

app.patch('/api/orders/:id/status',auth,adminOnly,async(req,res)=>{
  const allowed=['Pending','Processing','Shipped','Delivered','Refunded'];
  if(!allowed.includes(req.body.status))return res.status(400).json({message:'Invalid order status.'});
  const dbId=String(req.params.id);
  try{const[r]=await pool.query("UPDATE orders SET status=?,payment_status=IF(?='Refunded','Refunded',payment_status),return_status=IF(?='Refunded','Refunded',return_status) WHERE order_number=?",[req.body.status,req.body.status,req.body.status,dbId]);if(!r.affectedRows)return res.status(404).json({message:'Order not found.'});const[rows]=await pool.query('SELECT * FROM orders WHERE order_number=?',[dbId]);res.json(rows[0]);}catch(e){res.status(500).json({message:e.message});}
});

app.post('/api/orders/:id/shipping',auth,adminOnly,async(req,res)=>{
  const dbId=String(req.params.id); const tracking=req.body.tracking||('LTX-'+Math.floor(100000+Math.random()*899999));
  try{const[r]=await pool.query("UPDATE orders SET tracking_number=?,status=IF(status IN ('Pending','Processing'),'Shipped',status) WHERE order_number=?",[tracking,dbId]);if(!r.affectedRows)return res.status(404).json({message:'Order not found.'});const[rows]=await pool.query('SELECT * FROM orders WHERE order_number=?',[dbId]);res.json(rows[0]);}catch(e){res.status(500).json({message:e.message});}
});

app.post('/api/orders/:id/refund',auth,adminOnly,async(req,res)=>{const dbId=String(req.params.id);try{const[r]=await pool.query("UPDATE orders SET status='Refunded',payment_status='Refunded',return_status='Refunded' WHERE order_number=?",[dbId]);if(!r.affectedRows)return res.status(404).json({message:'Order not found.'});const[rows]=await pool.query('SELECT * FROM orders WHERE order_number=?',[dbId]);res.json(rows[0]);}catch(e){res.status(500).json({message:e.message});}});

app.get('/api/admin/users',auth,adminOnly,async(req,res)=>{try{const[rows]=await pool.query('SELECT id,full_name name,email,role,mfa_enabled mfaEnabled FROM admin_users ORDER BY id');res.json(rows);}catch(e){res.status(500).json({message:e.message});}});
app.post('/api/admin/customers',auth,adminOnly,async(req,res)=>{if(!req.body.fullName)return res.status(400).json({message:'Full Name is required.'});try{const[r]=await pool.query('INSERT INTO customers(full_name,title,gender,pronouns,email,phone,address) VALUES (?,?,?,?,?,?,?)',[req.body.fullName,req.body.title||null,req.body.gender||null,req.body.pronouns||null,req.body.email||null,req.body.phone||null,req.body.address||null]);res.status(201).json({ok:true,message:'Customer profile saved.',customer:{id:r.insertId,...req.body}});}catch(e){res.status(500).json({message:e.message});}});

async function start(){
  try { await pool.query('SELECT 1'); await ensureAdmin(); app.listen(PORT,()=>console.log(`GARDEN Laundry Hub API running on http://localhost:${PORT}`)); }
  catch(e){ console.error('MySQL connection failed:',e.message); console.error('Make sure XAMPP MySQL is running and laundritrack.sql has been imported.'); process.exit(1); }
}
start();
