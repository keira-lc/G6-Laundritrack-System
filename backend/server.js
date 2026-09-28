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

app.get('/api/health', async (req,res)=>{
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'LaundriTrack Admin API',database:'MySQL/XAMPP'}); }
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
  try { const [rows]=await pool.query(`SELECT o.*, COALESCE(c.full_name,'Walk-in Customer') customer FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.id DESC`); res.json(rows.map(o=>({...o,id:'LT-'+o.order_number.replace(/^LT-/,'')}))); }
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
  try { await pool.query('SELECT 1'); await ensureAdmin(); app.listen(PORT,()=>console.log(`LaundriTrack API running on http://localhost:${PORT}`)); }
  catch(e){ console.error('MySQL connection failed:',e.message); console.error('Make sure XAMPP MySQL is running and laundritrack.sql has been imported.'); process.exit(1); }
}
start();
