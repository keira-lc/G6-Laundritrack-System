import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'gardenCustomerToken';
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [page, setPage] = useState('Shop');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [orders, setOrders] = useState([]);
  const [authMode, setAuthMode] = useState('signin');
  const [returnAfterAuth, setReturnAfterAuth] = useState('Profile');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ fullName: '', email: '', password: '' });
  const [customer, setCustomer] = useState({ fullName: '', email: '', phone: '', address: '' });
  const [profileForm, setProfileForm] = useState({ fullName: '', email: '', phone: '', address: '' });

  const request = (url, options = {}, activeToken = token) => fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}), ...(options.headers || {}) }
  });

  const loadCatalog = async () => {
    setLoading(true); setError('');
    try {
      const [pr, cr] = await Promise.all([fetch(`${API}/store/products`), fetch(`${API}/store/categories`)]);
      const pd = await pr.json(); const cd = await cr.json();
      if (!pr.ok) throw new Error(pd.message || 'Could not load products.');
      if (!cr.ok) throw new Error(cd.message || 'Could not load categories.');
      setProducts(pd); setCategories(['All', ...cd]);
    } catch (e) { setError(`${e.message} Check that the XAMPP MySQL service and backend API are running.`); }
    finally { setLoading(false); }
  };

  const loadProfile = async activeToken => {
    const response = await request(`${API}/store/auth/me`, {}, activeToken);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load customer profile.');
    setUser(data); setCustomer({ fullName: data.fullName || '', email: data.email || '', phone: data.phone || '', address: data.address || '' });
    setProfileForm({ fullName: data.fullName || '', email: data.email || '', phone: data.phone || '', address: data.address || '' });
    return data;
  };

  const loadOrders = async activeToken => {
    const response = await request(`${API}/store/orders/mine`, {}, activeToken);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load your orders.');
    setOrders(data);
  };

  useEffect(() => {
    loadCatalog();
    if (token) loadProfile(token).then(() => loadOrders(token)).catch(() => {
      localStorage.removeItem(TOKEN_KEY); setToken(''); setUser(null);
    });
  }, []);

  const visibleProducts = useMemo(() => category === 'All' ? products : products.filter(p => p.category === category), [products, category]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const toast = message => { setNotice(message); window.setTimeout(() => setNotice(''), 2500); };
  const openAccountPage = destination => {
    if (!token || !user) { setReturnAfterAuth(destination); setAuthMode('signin'); setError(''); setPage('SignIn'); return; }
    setError(''); setPage(destination);
    if (destination === 'Orders') loadOrders(token).catch(e => setError(e.message));
    if (destination === 'Profile') loadProfile(token).catch(e => setError(e.message));
  };

  const addToCart = (product, variant) => {
    setCart(current => {
      const key = `${product.id}:${variant || ''}`;
      const found = current.find(i => i.key === key);
      if (found) return current.map(i => i.key === key ? { ...i, quantity: Math.min(i.quantity + 1, product.stock) } : i);
      return [...current, { key, productId: product.id, name: product.name, price: product.price, stock: product.stock, variant: variant || '', quantity: 1 }];
    });
    toast(`${product.name} added to cart.`);
  };
  const changeQuantity = (key, delta) => setCart(current => current.map(i => i.key === key ? { ...i, quantity: Math.max(1, Math.min(i.stock, i.quantity + delta)) } : i));
  const removeItem = key => setCart(current => current.filter(i => i.key !== key));
  const updateCustomer = e => setCustomer({ ...customer, [e.target.name]: e.target.value });
  const updateAuthForm = e => setAuthForm({ ...authForm, [e.target.name]: e.target.value });
  const updateProfileForm = e => setProfileForm({ ...profileForm, [e.target.name]: e.target.value });

  const submitAuth = async e => {
    e.preventDefault(); setAuthBusy(true); setError('');
    try {
      const endpoint = authMode === 'signup' ? 'signup' : 'login';
      const response = await fetch(`${API}/store/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authMode === 'signup' ? authForm : { email: authForm.email, password: authForm.password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not authenticate.');
      localStorage.setItem(TOKEN_KEY, data.token); setToken(data.token); setUser(data.user);
      const loaded = await loadProfile(data.token);
      await loadOrders(data.token).catch(() => setOrders([]));
      setAuthForm({ fullName: '', email: '', password: '' });
      setCustomer({ fullName: loaded.fullName || '', email: loaded.email || '', phone: loaded.phone || '', address: loaded.address || '' });
      setPage(returnAfterAuth); toast(authMode === 'signup' ? 'Your customer account has been created.' : 'Welcome back!');
    } catch (e2) { setError(e2.message); }
    finally { setAuthBusy(false); }
  };

  const saveProfile = async e => {
    e.preventDefault(); setProfileBusy(true); setError('');
    try {
      const response = await request(`${API}/store/auth/profile`, { method: 'PUT', body: JSON.stringify(profileForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not save your profile.');
      setUser(data); setCustomer({ fullName: data.fullName, email: data.email, phone: data.phone || '', address: data.address || '' });
      setProfileForm({ fullName: data.fullName, email: data.email, phone: data.phone || '', address: data.address || '' });
      toast('Profile saved successfully.');
    } catch (e) { setError(e.message); }
    finally { setProfileBusy(false); }
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY); setToken(''); setUser(null); setOrders([]);
    setCustomer({ fullName: '', email: '', phone: '', address: '' }); setPage('Shop'); toast('You have signed out.');
  };

  const startCheckout = () => {
    setError('');
    if (!cart.length) { setPage('Cart'); return; }
    if (!token || !user) { setReturnAfterAuth('Checkout'); setAuthMode('signin'); setPage('SignIn'); return; }
    setCustomer({ fullName: user.fullName || '', email: user.email || '', phone: user.phone || '', address: user.address || '' });
    setPage('Checkout');
  };

  const placeOrder = async e => {
    e.preventDefault(); setCheckoutBusy(true); setError('');
    try {
      const response = await request(`${API}/store/orders`, {
        method: 'POST', body: JSON.stringify({ phone: customer.phone, address: customer.address, items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, variant: i.variant })) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Order could not be placed.');
      setOrderResult(data); setCart([]); setPage('Confirmation'); await Promise.all([loadCatalog(), loadOrders(token)]);
    } catch (e2) { setError(e2.message); }
    finally { setCheckoutBusy(false); }
  };

  const pageTitle = { Shop: 'Shop', Cart: 'Cart', Checkout: 'Checkout', Orders: 'Orders', Profile: 'Profile', SignIn: 'Sign in', SignUp: 'Create account' };
  const navigateAuth = mode => { setAuthMode(mode); setError(''); setPage(mode === 'signup' ? 'SignUp' : 'SignIn'); };

  return <div className="mobile-shell">
    <header className="topbar">
      <button className="brand brand-button" onClick={() => setPage('Shop')} aria-label="GARDEN Laundry Hub home"><span className="brand-mark" aria-hidden="true">GH</span><span><b>GARDEN Laundry Hub</b><small>Wash....Dry....and Fold</small></span></button>
      <div className="top-actions"><button className="account-shortcut" onClick={() => openAccountPage('Profile')} aria-label={user ? 'Open profile' : 'Sign in'}><span aria-hidden="true">♙</span><span>{user ? 'My account' : 'Sign in'}</span></button><button className="refresh" onClick={loadCatalog} aria-label="Refresh product catalog" title="Refresh catalog">↻</button></div>
    </header>
    <main className="page-content">
      {page === 'Shop' && <>
        <section className="welcome"><span className="eyebrow">LAUNDRY CARE, SIMPLIFIED</span><h1>Wash....Dry....<br/><em>and Fold</em></h1><p>Fresh laundry, made simple. Explore our services and supplies, then place your order in just a few steps.</p><div className="welcome-pill"><span aria-hidden="true">✓</span> Stock checked from the live catalog</div></section>
        <div className="section-heading"><div><span className="eyebrow">OUR CATALOG</span><h2>Shop services & supplies</h2></div><span className="result-count">{visibleProducts.length} items</span></div>
        <div className="category-strip" role="group" aria-label="Filter by category">{categories.map(c => <button key={c} className={category === c ? 'category active' : 'category'} onClick={() => setCategory(c)}>{c}</button>)}</div>
        {loading ? <div className="state-card">Loading live catalog…</div> : error && !products.length ? <div className="state-card error-state" role="alert"><b>Catalog unavailable</b><p>{error}</p><button className="button secondary" onClick={loadCatalog}>Try again</button></div> : visibleProducts.length === 0 ? <div className="state-card">No in-stock items in this category right now.</div> : <div className="product-grid">{visibleProducts.map(p => <ProductCard key={p.id} product={p} onAdd={addToCart}/>)}</div>}
      </>}

      {page === 'Cart' && <>
        <div className="page-title"><span className="eyebrow">YOUR SELECTION</span><h1>Your cart</h1><p>Review quantities before checkout.</p></div>
        {cart.length === 0 ? <div className="state-card"><div className="empty-icon" aria-hidden="true">▱</div><h2>Your cart is empty</h2><p>Add a service or supply to get started.</p><button className="button primary" onClick={() => setPage('Shop')}>Browse catalog</button></div> : <>
          <div className="cart-list">{cart.map(i => <article className="cart-item" key={i.key}><div className="mini-art" aria-hidden="true">✦</div><div className="cart-info"><b>{i.name}</b>{i.variant && <small>Variant: {i.variant}</small>}<strong>{peso(i.price)}</strong><div className="quantity"><button onClick={() => changeQuantity(i.key, -1)} aria-label={`Decrease quantity of ${i.name}`}>−</button><span aria-live="polite">{i.quantity}</span><button onClick={() => changeQuantity(i.key, 1)} disabled={i.quantity >= i.stock} aria-label={`Increase quantity of ${i.name}`}>+</button></div></div><button className="remove" onClick={() => removeItem(i.key)} aria-label={`Remove ${i.name}`}>Remove</button></article>)}</div>
          <div className="summary-card"><div><span>Subtotal</span><b>{peso(total)}</b></div><small>Final total is calculated and validated by the server.</small><button className="button primary full" onClick={startCheckout}>Continue to checkout</button><p className="fine-print">Sign in is required so your orders are saved to your account.</p></div>
        </>}
      </>}

      {(page === 'SignIn' || page === 'SignUp') && <section className="auth-wrap">
        <button className="back-link" onClick={() => setPage('Shop')}>← Back to shop</button>
        <div className="page-title"><span className="eyebrow">GARDEN CUSTOMER ACCOUNT</span><h1>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h1><p>{authMode === 'signup' ? 'Save your details, track orders, and check out faster.' : 'Sign in to view your profile and order history.'}</p></div>
        <form className="checkout-form auth-form" onSubmit={submitAuth}>
          {authMode === 'signup' && <label>Full name<input name="fullName" autoComplete="name" value={authForm.fullName} onChange={updateAuthForm} required placeholder="Your full name"/></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" value={authForm.email} onChange={updateAuthForm} required placeholder="you@example.com"/></label>
          <label>Password<input name="password" type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={authForm.password} onChange={updateAuthForm} required minLength={authMode === 'signup' ? 8 : undefined} placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Enter your password'}/></label>
          {authMode === 'signup' && <p className="field-help">Use at least 8 characters. Your password is stored as a secure hash by the server.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="auth-switch">{authMode === 'signup' ? 'Already have an account?' : 'New to GARDEN Laundry Hub?'} <button onClick={() => navigateAuth(authMode === 'signup' ? 'signin' : 'signup')}>{authMode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>
      </section>}

      {page === 'Checkout' && <>
        <button className="back-link" onClick={() => setPage('Cart')}>← Back to cart</button><div className="page-title"><span className="eyebrow">SECURE ORDER DETAILS</span><h1>Checkout</h1><p>Confirm your delivery address before placing your order.</p></div>
        <div className="checkout-customer"><span className="avatar">{(user?.fullName || 'C').slice(0,1).toUpperCase()}</span><div><b>{user?.fullName}</b><small>{user?.email} · {user?.phone || 'Add a phone number in your profile'}</small></div><button className="text-button" onClick={() => openAccountPage('Profile')}>Edit profile</button></div>
        <div className="checkout-total"><span>{cartCount} item{cartCount === 1 ? '' : 's'} · Order total</span><b>{peso(total)}</b></div>
        <form className="checkout-form" onSubmit={placeOrder}>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" value={customer.phone} onChange={updateCustomer} required placeholder="09XX XXX XXXX"/></label>
          <label>Delivery address<input name="address" autoComplete="street-address" value={customer.address} onChange={updateCustomer} required placeholder="House, street, barangay, town"/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={checkoutBusy || cart.length === 0}>{checkoutBusy ? 'Placing order…' : `Place order · ${peso(total)}`}</button>
          <p className="fine-print">Your order will appear as Pending in the GARDEN Laundry Hub admin dashboard. Stock is checked and reduced by the server when the order is saved.</p>
        </form>
      </>}

      {page === 'Confirmation' && <section className="confirmation"><div className="success-icon" aria-hidden="true">✓</div><span className="eyebrow">ORDER RECEIVED</span><h1>Thank you!</h1><p>Your order was submitted successfully and is waiting for the team to process it.</p><div className="order-number"><small>ORDER NUMBER</small><b>{orderResult?.orderNumber}</b><span className="pending-chip">Pending</span></div><div className="confirmation-total"><span>Order total</span><b>{peso(orderResult?.total)}</b></div><button className="button primary full" onClick={() => openAccountPage('Orders')}>View my orders</button><button className="button secondary full continue-shop" onClick={() => { setPage('Shop'); setOrderResult(null); }}>Continue shopping</button></section>}

      {page === 'Orders' && <>
        <div className="page-title"><span className="eyebrow">YOUR PURCHASES</span><h1>Order history</h1><p>Track the status of orders placed with your account.</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {orders.length === 0 ? <div className="state-card"><div className="empty-icon" aria-hidden="true">▤</div><h2>No orders yet</h2><p>Your orders will appear here after you check out.</p><button className="button primary" onClick={() => setPage('Shop')}>Start shopping</button></div> : <div className="orders-list">{orders.map(o => <article className="order-card" key={o.id}><div className="order-card-head"><div><small>ORDER NUMBER</small><b>{o.orderNumber}</b></div><span className={`status-chip status-${String(o.status).toLowerCase()}`}>{o.status}</span></div><div className="order-lines">{o.lines.map((line,idx)=><div key={`${o.id}-${idx}`}><span>{line.name}{line.variant ? ` · ${line.variant}` : ''} × {line.quantity}</span><b>{peso(line.subtotal)}</b></div>)}</div><div className="order-card-foot"><span>{new Date(o.createdAt).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'})}{o.trackingNumber ? ` · Tracking: ${o.trackingNumber}` : ''}</span><b>{peso(o.total)}</b></div></article>)}</div>}
      </>}

      {page === 'Profile' && <>
        <div className="page-title"><span className="eyebrow">YOUR ACCOUNT</span><h1>My profile</h1><p>Manage your contact information, delivery details, and sign-in security.</p></div>
        <div className="profile-identity"><span className="profile-avatar">{(user?.fullName || 'C').slice(0,1).toUpperCase()}</span><div><h2>{user?.fullName}</h2><p>{user?.email}</p><small>Customer account</small></div></div>
        <form className="checkout-form profile-form" onSubmit={saveProfile}>
          <h2 className="form-section-title">Personal information</h2>
          <label>Full name<input name="fullName" autoComplete="name" value={profileForm.fullName} onChange={updateProfileForm} required/></label>
          <label>Email address<input name="email" type="email" value={profileForm.email} readOnly aria-describedby="email-note"/></label><small id="email-note" className="field-help">For account security, contact the store administrator if your email needs to change.</small>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" value={profileForm.phone} onChange={updateProfileForm} placeholder="09XX XXX XXXX"/></label>
          <label>Default delivery address<input name="address" autoComplete="street-address" value={profileForm.address} onChange={updateProfileForm} placeholder="House, street, barangay, town"/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button>
        </form>
        <section className="security-card"><div className="security-icon" aria-hidden="true">♧</div><div><h2>Sign-in security</h2><p>Your password is verified by the server and stored as a bcrypt hash. Keep it private and use a unique password.</p><div className="security-status"><span className="status-dot"></span> Password sign-in enabled</div><div className="biometric-note"><b>Device biometrics / passkeys</b><p>{window.isSecureContext && window.PublicKeyCredential ? 'This browser supports passkey features, but passkey registration and server verification are not configured in this project yet.' : 'Passkeys usually require a supported browser and a secure context (HTTPS or localhost). Passkey registration and server verification are not configured in this project yet.'}</p></div></div></section>
        <button className="button secondary full signout-button" onClick={signOut}>Sign out</button>
      </>}
    </main>
    <nav className="bottom-nav" aria-label="Customer navigation">
      <button className={page === 'Shop' ? 'bottom-item selected' : 'bottom-item'} onClick={() => setPage('Shop')}><span aria-hidden="true">⌂</span><small>Shop</small></button>
      <button className={page === 'Cart' || page === 'Checkout' ? 'bottom-item selected' : 'bottom-item'} onClick={() => setPage('Cart')}><span className="cart-symbol" aria-hidden="true">▱{cartCount > 0 && <i>{cartCount}</i>}</span><small>Cart</small></button>
      <button className={page === 'Orders' || page === 'Confirmation' ? 'bottom-item selected' : 'bottom-item'} onClick={() => openAccountPage('Orders')}><span aria-hidden="true">▤</span><small>Orders</small></button>
      <button className={page === 'Profile' ? 'bottom-item selected' : 'bottom-item'} onClick={() => openAccountPage('Profile')}><span aria-hidden="true">♙</span><small>{user ? 'Profile' : 'Sign in'}</small></button>
    </nav>
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

function ProductCard({ product, onAdd }) {
  const [variant, setVariant] = useState(product.variants?.[0] || '');
  const categoryIcon = product.category === 'Supplies' ? '✦' : product.category === 'Dry Cleaning' ? '♧' : '✧';
  return <article className="product-card"><div className="product-art"><span className="product-category">{product.category}</span><span className="product-symbol" role="img" aria-label={product.alt_text || product.name}>{categoryIcon}</span><span className="stock-tag">{product.stock} in stock</span></div><div className="product-details"><h3>{product.name}</h3><p className="sku">SKU {product.sku}</p>{product.variants?.length > 0 && <label className="variant-label">Option<select value={variant} onChange={e => setVariant(e.target.value)} aria-label={`Choose variant for ${product.name}`}>{product.variants.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}<div className="product-buy"><strong>{peso(product.price)}</strong><button className="add-button" onClick={() => onAdd(product, variant)} disabled={product.stock < 1} aria-label={`Add ${product.name} to cart`}>+ Add</button></div></div></article>;
}

createRoot(document.getElementById('root')).render(<App/>);
