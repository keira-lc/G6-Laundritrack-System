function openModal(id){const el=document.getElementById(id); if(el){el.hidden=false; const first=el.querySelector('input,select,textarea,button'); if(first) first.focus();}}
function closeModal(id){const el=document.getElementById(id); if(el){el.hidden=true;}}
document.addEventListener('keydown',e=>{if(e.key==='Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m=>m.hidden=true);});
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;}));

function openServiceModal(){
  document.getElementById('serviceForm')?.reset();
  document.getElementById('service_id').value='';
  document.getElementById('serviceTitle').textContent='Add service';
  openModal('serviceModal');
}
function editService(s){
  openModal('serviceModal');
  document.getElementById('serviceTitle').textContent='Edit service';
  document.getElementById('service_id').value=s.id;
  document.getElementById('service_name').value=s.name;
  document.getElementById('service_sku').value=s.sku;
  document.getElementById('service_category').value=s.category;
  document.getElementById('service_variant').value=s.variant || '';
  document.getElementById('service_price').value=s.price;
  document.getElementById('service_stock').value=s.stock_level;
  document.getElementById('service_safety').value=s.safety_stock;
  document.getElementById('service_alt').value=s.alt_text;
}
function editOrder(o){
  openModal('orderModal');
  document.getElementById('order_id').value=o.id;
  document.getElementById('refund_id').value=o.id;
  document.getElementById('order_status').value=o.status;
  document.getElementById('order_payment').value=o.payment_status;
  document.getElementById('order_tracking').value=o.tracking_no || '';
  document.getElementById('orderTitle').textContent='Manage ' + o.order_no;
}
function openCustomerModal(){
  document.querySelector('#customerModal form')?.reset();
  document.getElementById('customer_id').value='';
  document.getElementById('customerTitle').textContent='Add customer';
  openModal('customerModal');
}
function editCustomer(c){
  openModal('customerModal');
  document.getElementById('customerTitle').textContent='Edit customer';
  document.getElementById('customer_id').value=c.id;
  document.getElementById('customer_full').value=c.full_name;
  document.getElementById('customer_title').value=c.title || '';
  document.getElementById('customer_gender').value=c.gender || '';
  document.getElementById('customer_email').value=c.email || '';
  document.getElementById('customer_phone').value=c.phone || '';
  document.getElementById('customer_address').value=c.address || '';
}
