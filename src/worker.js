import catalog from './catalog.js';
import {brand,presentProduct} from './brand.js';
const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers}});
const fail = (message, status = 400) => {throw Object.assign(new Error(message), {status});};
const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2,'0')).join('');
const cookie = (req,k) => req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(k+'='))?.slice(k.length+1);
const user = req => ({id:req.headers.get('oai-authenticated-user-id'),email:req.headers.get('oai-authenticated-user-email')});
const admin = (req,env) => Boolean(env.SHOP_ADMIN_EMAIL && user(req).id && user(req).email?.toLowerCase() === env.SHOP_ADMIN_EMAIL.toLowerCase());
const knownProducts = new Set(catalog.flatMap(p => [p.id,...(p.variants||[]).map(v=>v.id)]));
const requireUser = req => {const u=user(req);if(!u.id) fail('Sign in to use this feature',401);return u;};
const cents = n => Number.isInteger(n) && n >= 0 && n <= 10000000;
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const shippingValid = s => s && ['name','address','city','postal','country'].every(k=>typeof s[k]==='string' && s[k].trim() && s[k].length<=200) && s.country==='US' && (s.state===undefined || typeof s.state==='string' && states.has(s.state.trim().toUpperCase()));
const cleanShipping = s => ({...Object.fromEntries(['name','address','city','postal','country'].map(k=>[k,s[k].trim()])),...(s.state?{state:s.state.trim().toUpperCase()}: {})});
const defaults = {shipping:0,freeShipping:15000,taxBasisPoints:0};
const tokenFor = (cartId,id) => hash('order:'+cartId+':'+id);
async function body(req) {
  if(Number(req.headers.get('content-length')||0)>20000) fail('Request too large',413);
  const reader=req.body?.getReader();if(!reader) fail('Invalid request');
  let bytes=0,text='',decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>20000){await reader.cancel();fail('Request too large',413);}text+=decoder.decode(value,{stream:true});}
  try{return JSON.parse(text+decoder.decode());}catch{fail('Invalid request');}
}
async function products(db) {
  const overrides=(await db.prepare('SELECT * FROM product_settings').all()).results;
  const custom=(await db.prepare('SELECT data FROM custom_products').all()).results.map(r=>JSON.parse(r.data));
  const rows=[...catalog,...custom].flatMap(p=>[p,...(p.variants||[]).map(v=>({...p,...v,image:v.image||p.image,parentId:p.id,variants:[],variable:false,name:p.name+' — '+v.label}))]).map(p=>({...p,...overrides.find(o=>o.id===p.id),active:overrides.find(o=>o.id===p.id)?.active??p.active??1}));
  for(const p of rows)if(p.parentId&&!rows.find(parent=>parent.id===p.parentId)?.active)p.active=0;
  return rows.map(p=>p.parentId?p:{...p,variants:rows.filter(v=>v.parentId===p.id)});
}
async function settings(db) {const row=await db.prepare("SELECT data FROM store_settings WHERE id='commerce'").first();return {...defaults,...(row?JSON.parse(row.data):{})};}
async function session(req,db) {
  let id=cookie(req,'shop_cart'),fresh=false;
  if(!/^[a-f0-9-]{36}$/.test(id||'')){id=crypto.randomUUID();fresh=true;}
  await db.prepare('INSERT OR IGNORE INTO carts(id) VALUES (?)').bind(id).run();
  const row=await db.prepare('SELECT * FROM carts WHERE id=?').bind(id).first();
  return {id,items:JSON.parse(row.items),coupon:row.coupon,headers:fresh?{'Set-Cookie':`shop_cart=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`}:{}};
}
function expanded(items,ps) {
  return items.map(i=>{const p=ps.find(p=>p.id===i.id);if(!p||!p.active)fail('A product in your cart is no longer available. Remove it before checkout.',409);return {id:p.id,name:p.name,path:p.path,image:p.image,price:p.price,quantity:i.quantity,stock:p.stock??null,variable:p.variable};});
}
async function quote(db,items,code,strict=false,state='') {
  const config=await settings(db),subtotal=items.reduce((t,i)=>t+i.price*i.quantity,0);
  let discount=0,coupon='',couponError='',offer=null;
  if(code){
    offer=await db.prepare('SELECT * FROM coupons WHERE code=?').bind(code).first();
    if(!offer?.active || offer.expires && offer.expires <= new Date().toISOString() || offer.max_uses && offer.uses >= offer.max_uses)couponError='This discount code is unavailable or expired.';
    else if(subtotal < offer.minimum)couponError='Your cart does not meet this code’s minimum spend.';
    else {discount=Math.min(subtotal,offer.kind==='percent'?Math.floor(subtotal*offer.amount/100):offer.amount);coupon=code;}
    if(couponError && strict)fail(couponError,409);
  }
  const shipping=items.length && !(config.freeShipping>0 && subtotal>=config.freeShipping && !['AK','HI'].includes(state.toUpperCase()))?config.shipping:0;
  const tax=Math.round((subtotal-discount+shipping)*config.taxBasisPoints/10000);
  return {subtotal,discount,shipping,tax,total:subtotal-discount+shipping+tax,coupon,couponError,mode:'test'};
}
async function orderAccess(req,db,id,url) {
  const row=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if(!row || !(user(req).id && row.customer_id===user(req).id) && await hash(url.searchParams.get('token')||'')!==row.token_hash)fail('Order not found',404);
  return row;
}
const orderData = row => ({id:row.id,status:row.status,fulfillment:row.fulfillment,carrier:row.carrier,tracking:row.tracking,email:row.email,shippingAddress:JSON.parse(row.shipping),items:JSON.parse(row.items).map(presentProduct),subtotal:row.subtotal||JSON.parse(row.items).reduce((n,i)=>n+i.price*i.quantity,0),discount:row.discount,shipping:row.shipping_total,tax:row.tax,coupon:row.coupon,total:row.total,createdAt:row.created_at,mode:'test'});
const event = (db,id,actor,action,data) => db.prepare('INSERT INTO order_events(id,order_id,actor,action,data) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,actor,action,JSON.stringify(data));
async function administration(req,env,url) {
  if(!admin(req,env))fail('Administrator sign-in required',403);
  const db=env.DB,route=url.pathname;
  if(route==='/api/admin/overview' && req.method==='GET'){
    const stats=await db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN fulfillment != 'cancelled' THEN total ELSE 0 END),0) value, SUM(CASE WHEN fulfillment='pending' THEN 1 ELSE 0 END) pending FROM orders").first();
    const ps=await products(db);return json({...stats,products:ps.filter(p=>!p.parentId).length,lowStock:ps.filter(p=>!p.variable && p.active && p.stock!==null && p.stock!==undefined && p.stock<=5).length,requests:(await db.prepare('SELECT COUNT(*) n FROM submissions').first()).n,mode:'test'});
  }
  if(route==='/api/admin/orders' && req.method==='GET'){
    const offset=Math.max(0,parseInt(url.searchParams.get('offset'))||0),state=url.searchParams.get('state')||'',q=(url.searchParams.get('q')||'').slice(0,200);
    const orders=(await db.prepare("SELECT * FROM orders WHERE (?='' OR fulfillment=?) AND (?='' OR email LIKE ? OR id LIKE ?) ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?").bind(state,state,q,'%'+q+'%','%'+q+'%',offset).all()).results;
    return json({orders:orders.slice(0,50),next:orders.length>50?offset+50:null});
  }
  if(route==='/api/admin/orders' && req.method==='POST'){
    const b=await body(req),row=await db.prepare('SELECT * FROM orders WHERE id=?').bind(b.id).first();if(!row)fail('Order not found',404);
    if(row.status!=='test')fail('Live order updates require the payment and fulfillment integration',409);
    const next={pending:['processing','cancelled'],processing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
    if(typeof b.fulfillment!=='string' || b.fulfillment!==row.fulfillment && !next[row.fulfillment]?.includes(b.fulfillment))fail('This order status change is not allowed',409);
    if(['carrier','tracking','notes'].some(k=>typeof b[k]!=='string'||b[k].length>(k==='notes'?2000:200)))fail('Invalid order details');
    if(b.fulfillment==='shipped' && (!b.carrier.trim()||!b.tracking.trim()))fail('Add a carrier and tracking reference for the test shipment');
    const marker=crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO order_events(id,order_id,actor,action,data) SELECT ?,id,?,?,? FROM orders WHERE id=? AND fulfillment=?').bind(marker,user(req).id,'admin-update',JSON.stringify({...b,previous:row.fulfillment}),row.id,row.fulfillment),
      db.prepare('UPDATE orders SET fulfillment=?,carrier=?,tracking=?,notes=? WHERE id=? AND EXISTS(SELECT 1 FROM order_events WHERE id=?)').bind(b.fulfillment,b.carrier.trim(),b.tracking.trim(),b.notes.trim(),row.id,marker)
    ]);
    if(!await db.prepare('SELECT id FROM order_events WHERE id=?').bind(marker).first())fail('The order changed. Refresh and try again.',409);
    return json({saved:true});
  }
  if(route==='/api/admin/submissions' && req.method==='GET')return json({submissions:(await db.prepare('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 100').all()).results});
  if(route==='/api/admin/products' && req.method==='GET')return json({products:await products(db)});
  if(route==='/api/admin/products' && req.method==='POST'){
    const b=await body(req);if(!(await products(db)).some(p=>p.id===b.id)||!cents(b.price)||!(b.stock===null||Number.isInteger(b.stock)&&b.stock>=0&&b.stock<=10000000)||![0,1].includes(b.active))fail('Invalid product settings');
    await db.prepare('INSERT INTO product_settings(id,price,stock,active) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET price=excluded.price,stock=excluded.stock,active=excluded.active').bind(b.id,b.price,b.stock,b.active).run();return json({saved:true});
  }
  if(route==='/api/admin/catalog' && req.method==='POST'){
    const b=await body(req),id=String(b.id||'').trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)||knownProducts.has(id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>200||typeof b.description!=='string'||b.description.length>3000||!['vials','capsules','sprays','serums','oral-sprays','uncategorized'].includes(b.category)||!cents(b.price)||!(b.stock===null||Number.isInteger(b.stock)&&b.stock>=0&&b.stock<=10000000))fail('Enter valid product details');
    let image;try{image=new URL(b.image);if(image.protocol!=='https:'||image.username||image.password||b.image.length>2048)fail('Use an HTTPS product image URL');}catch{fail('Use an HTTPS product image URL');}
    const data={id,name:b.name.trim(),description:b.description.trim(),image:image.href,price:b.price,stock:b.stock,active:1,variable:false,variants:[],categories:[b.category],path:'/product/?id='+id,custom:true};
    await db.batch([db.prepare('INSERT INTO custom_products(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,JSON.stringify(data)),db.prepare('INSERT INTO product_settings(id,price,stock,active) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET price=excluded.price,stock=excluded.stock').bind(id,b.price,b.stock)]);
    return json({saved:true,id});
  }
  if(route==='/api/admin/settings' && req.method==='GET')return json(await settings(db));
  if(route==='/api/admin/settings' && req.method==='POST'){
    const b=await body(req);if(!cents(b.shipping)||!cents(b.freeShipping)||!Number.isInteger(b.taxBasisPoints)||b.taxBasisPoints<0||b.taxBasisPoints>10000)fail('Enter valid shipping and test tax rates');
    const data={shipping:b.shipping,freeShipping:b.freeShipping,taxBasisPoints:b.taxBasisPoints};
    await db.prepare("INSERT INTO store_settings(id,data) VALUES ('commerce',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(JSON.stringify(data)).run();return json({saved:true});
  }
  if(route==='/api/admin/coupons' && req.method==='GET')return json({coupons:(await db.prepare('SELECT * FROM coupons ORDER BY code').all()).results});
  if(route==='/api/admin/coupons' && req.method==='POST'){
    const b=await body(req),code=String(b.code||'').trim().toUpperCase();
    if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!['percent','fixed'].includes(b.kind)||!Number.isInteger(b.amount)||b.amount<=0||b.amount>(b.kind==='percent'?100:10000000)||!cents(b.minimum)||![0,1].includes(b.active)||!Number.isInteger(b.max_uses)||b.max_uses<0||b.max_uses>10000000||typeof b.expires!=='string'||b.expires!==''&&(!/^\d{4}-\d{2}-\d{2}T/.test(b.expires)||!Number.isFinite(Date.parse(b.expires))))fail('Enter a valid discount code and limits');
    const exists=await db.prepare('SELECT code FROM coupons WHERE code=?').bind(code).first();
    if(exists)await db.prepare('UPDATE coupons SET active=? WHERE code=?').bind(b.active,code).run();
    else await db.prepare('INSERT INTO coupons(code,kind,amount,minimum,active,expires,max_uses) VALUES (?,?,?,?,?,?,?)').bind(code,b.kind,b.amount,b.minimum,b.active,b.expires,b.max_uses).run();
    return json({saved:true});
  }
  if(route==='/api/admin/events' && req.method==='GET')return json({events:(await db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY created_at,id').bind(url.searchParams.get('id')||'').all()).results});
  fail('Not found',404);
}
async function api(req,env) {
  const url=new URL(req.url),route=url.pathname,db=env.DB;
  if(req.method!=='GET' && req.headers.get('origin')!==url.origin)fail('Request origin rejected',403);
  if(route==='/api/verification' && req.method==='POST'){
    const b=await body(req);if(b.age!==true||b.researcher!==true)fail('Both confirmations are required');
    return json({accepted:true},200,{'Set-Cookie':'shop_verified=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000'});
  }
  if(!db)fail('Store database is unavailable',503);
  if(!['GET','POST'].includes(req.method))fail('Method not allowed',405);
  if(req.method==='POST'){
    const window=Math.floor(Date.now()/600000),actor=req.headers.get('cf-connecting-ip')||user(req).id||cookie(req,'shop_cart')||'anonymous',key=await hash(route+':'+actor);
    const rate=await db.prepare('INSERT INTO request_limits(id,window,hits) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET hits=CASE WHEN request_limits.window=excluded.window THEN request_limits.hits+1 ELSE 1 END,window=excluded.window RETURNING hits').bind(key,window).first();
    if(rate.hits>(route.startsWith('/api/admin/')?300:40))fail('Too many requests. Try again in a few minutes.',429);
  }
  if(route.startsWith('/api/admin/'))return administration(req,env,url);
  if(route==='/api/products' && req.method==='GET'){
    const ps=await products(db),q=(url.searchParams.get('q')||'').toLowerCase(),cat=url.searchParams.get('category');
    return json({products:ps.filter(p=>!p.parentId&&p.active&&(!q||p.name.toLowerCase().includes(q))&&(!cat||p.categories.includes(cat))),mode:'test'});
  }
  if(route==='/api/store' && req.method==='GET')return json({...(await settings(db)),mode:env.COMMERCE_MODE==='test'?'test':'disabled',country:'US',currency:'USD'});
  if(route==='/api/account' && req.method==='GET'){
    const u=user(req);if(!u.id)return json({signedIn:false});
    const orders=(await db.prepare('SELECT id,total,status,fulfillment,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100').bind(u.id).all()).results;
    const profile=await db.prepare('SELECT shipping FROM customer_profiles WHERE customer_id=?').bind(u.id).first();
    return json({signedIn:true,email:u.email,orders,shipping:profile?JSON.parse(profile.shipping):{},admin:admin(req,env)});
  }
  if(route==='/api/account/address' && req.method==='POST'){
    const u=requireUser(req),b=await body(req);if(!shippingValid(b.shipping))fail('Complete a valid U.S. shipping address');
    await db.prepare('INSERT INTO customer_profiles(customer_id,shipping) VALUES (?,?) ON CONFLICT(customer_id) DO UPDATE SET shipping=excluded.shipping').bind(u.id,JSON.stringify(cleanShipping(b.shipping))).run();return json({saved:true});
  }
  if(route==='/api/wishlist'){
    const u=requireUser(req);
    if(req.method==='POST'){const b=await body(req);if(!(await products(db)).some(p=>!p.parentId&&p.id===b.id)||typeof b.saved!=='boolean')fail('Invalid saved product');await db.prepare(b.saved?'INSERT OR IGNORE INTO wishlist(customer_id,product_id) VALUES (?,?)':'DELETE FROM wishlist WHERE customer_id=? AND product_id=?').bind(u.id,b.id).run();}
    return json({ids:(await db.prepare('SELECT product_id FROM wishlist WHERE customer_id=?').bind(u.id).all()).results.map(r=>r.product_id)});
  }
  if(route==='/api/submissions' && req.method==='POST'){
    const b=await body(req);if(!['contact','newsletter','wholesale','white-label'].includes(b.kind)||typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>254||typeof b.message!=='string'||b.message.length>5000)fail('Enter a valid email and message');
    await db.prepare('INSERT INTO submissions(id,kind,data) VALUES (?,?,?)').bind(crypto.randomUUID(),b.kind,JSON.stringify({email:b.email,message:b.message})).run();
    return json({saved:true,message:b.kind==='newsletter'?'Your interest has been recorded. Newsletter delivery is not enabled yet.':'Your request has been recorded for the store administrator.'},201);
  }
  if(route.startsWith('/api/orders/')){
    const parts=route.split('/'),row=await orderAccess(req,db,parts[3],url);
    if(req.method==='GET' && parts.length===4)return json(orderData(row));
    if(req.method==='POST' && parts[4]==='cancel'){
      if(row.status!=='test'||row.fulfillment!=='pending')fail('Only pending test orders can be cancelled here',409);
      const marker=crypto.randomUUID();await db.batch([
        db.prepare("INSERT INTO order_events(id,order_id,actor,action,data) SELECT ?,id,?,'customer-cancel','{}' FROM orders WHERE id=? AND fulfillment='pending'").bind(marker,user(req).id||'guest',row.id),
        db.prepare("UPDATE orders SET fulfillment='cancelled' WHERE id=? AND EXISTS(SELECT 1 FROM order_events WHERE id=?)").bind(row.id,marker)
      ]);if(!await db.prepare('SELECT id FROM order_events WHERE id=?').bind(marker).first())fail('The order changed. Refresh and try again.',409);return json({cancelled:true});
    }
    if(req.method==='POST' && parts[4]==='reorder'){
      if(cookie(req,'shop_verified')!=='1')fail('Complete researcher verification first',403);
      const s=await session(req,db),ps=await products(db),items=[...s.items];
      for(const i of JSON.parse(row.items)){const p=ps.find(p=>p.id===i.id),old=items.find(v=>v.id===i.id),quantity=(old?.quantity||0)+i.quantity;if(!p?.active||p.variable||quantity>99||p.stock!==null&&p.stock!==undefined&&quantity>p.stock)fail('Some products cannot be reordered. Add available items individually.',409);if(old)old.quantity=quantity;else items.push({id:i.id,quantity});}
      await db.prepare('UPDATE carts SET items=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(items),s.id).run();return json({saved:true},200,s.headers);
    }
    fail('Not found',404);
  }
  if(!['/api/cart','/api/checkout'].includes(route))fail('Not found',404);
  const s=await session(req,db),ps=await products(db);
  if(route==='/api/cart' && req.method==='GET'){
    // Keep removed/unpublished items visible so the customer can remove them.
    const items=s.items.map(i=>{const p=ps.find(p=>p.id===i.id);return {id:i.id,name:p?.name||'Unavailable product',path:p?.path||'/shop-all-peptides/',image:p?.image||'',price:p?.price||0,quantity:i.quantity,stock:p?.stock??null,unavailable:!p?.active};});
    return json({items,appliedCoupon:s.coupon,...await quote(db,items,s.coupon,false,url.searchParams.get('state')||'')},200,s.headers);
  }
  if(req.method!=='POST')fail('Method not allowed',405);
  const b=await body(req);
  if(route==='/api/cart'){
    if(cookie(req,'shop_verified')!=='1')fail('Complete researcher verification first',403);
    if(!['set','add','clear','coupon'].includes(b.action))fail('Invalid cart action');
    let items=s.items,code=s.coupon;
    if(b.action==='coupon'){code=String(b.code||'').trim().toUpperCase();if(code.length>30)fail('Invalid discount code');await quote(db,expanded(items,ps),code,true);}
    else if(b.action==='clear'){items=[];code='';}
    else {
      if(!Number.isInteger(b.quantity)||b.quantity<0||b.quantity>99)fail('Quantity must be between 0 and 99');
      if(b.action==='set' && b.quantity===0)items=items.filter(i=>i.id!==b.id);
      else {const p=ps.find(p=>p.id===b.id);if(!p?.active)fail('Product unavailable',404);if(p.variable)fail('Choose a product size first',409);const old=items.find(i=>i.id===b.id),quantity=b.action==='add'?(old?.quantity||0)+b.quantity:b.quantity;if(quantity>99||p.stock!==null&&p.stock!==undefined&&quantity>p.stock)fail('Requested quantity is unavailable',409);items=items.filter(i=>i.id!==b.id);if(quantity)items.push({id:b.id,quantity});}
    }
    await db.prepare('UPDATE carts SET items=?,coupon=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(items),code,s.id).run();
    const rows=items.filter(i=>ps.find(p=>p.id===i.id)?.active).map(i=>{const p=ps.find(p=>p.id===i.id);return {...i,price:p.price};});
    return json({saved:true,items:rows,...await quote(db,rows,code)},200,s.headers);
  }
  if(env.COMMERCE_MODE!=='test')fail('Live payments have not been configured',503);
  if(cookie(req,'shop_verified')!=='1'||b.age!==true||b.researcher!==true)fail('Researcher verification is required',403);
  if(typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>254||!shippingValid(b.shipping))fail('Complete a valid U.S. shipping address');
  if(!/^[a-f0-9-]{36}$/.test(b.key||''))fail('Invalid checkout identifier');
  const existing=await db.prepare('SELECT * FROM orders WHERE cart_id=? AND idempotency_key=?').bind(s.id,b.key).first();
  if(existing)return json({...orderData(existing),token:await tokenFor(s.id,existing.id),repeated:true},200,s.headers);
  const items=expanded(s.items,ps);if(!items.length)fail('Your cart is empty');if(items.some(i=>i.variable||i.stock!==null&&i.quantity>i.stock))fail('Some items are unavailable',409);
  const totals=await quote(db,items,s.coupon,true,b.shipping.state||''),id=crypto.randomUUID(),token=await tokenFor(s.id,id);
  const insert=db.prepare(`INSERT INTO orders(id,cart_id,idempotency_key,customer_id,email,shipping,items,total,token_hash,subtotal,discount,shipping_total,tax,coupon)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (?='' OR EXISTS(SELECT 1 FROM coupons WHERE code=? AND active=1 AND (max_uses=0 OR uses<max_uses) AND (expires='' OR expires>?))) AND EXISTS(SELECT 1 FROM carts WHERE id=? AND items=? AND coupon=?)`).bind(id,s.id,b.key,user(req).id,b.email.trim(),JSON.stringify(cleanShipping(b.shipping)),JSON.stringify(items),totals.total,await hash(token),totals.subtotal,totals.discount,totals.shipping,totals.tax,totals.coupon,totals.coupon,totals.coupon,new Date().toISOString(),s.id,JSON.stringify(s.items),s.coupon);
  try {
    await db.batch([
      insert,
      db.prepare('UPDATE coupons SET uses=uses+1 WHERE code=? AND EXISTS(SELECT 1 FROM orders WHERE id=?)').bind(totals.coupon,id),
      db.prepare("UPDATE carts SET items='[]',coupon='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=?)").bind(s.id,id),
      db.prepare("INSERT INTO order_events(id,order_id,actor,action,data) SELECT ?,id,?,'created',? FROM orders WHERE id=?").bind(crypto.randomUUID(),user(req).id||'guest',JSON.stringify({mode:'test'}),id)
    ]);
  } catch(error){
    const duplicate=await db.prepare('SELECT * FROM orders WHERE cart_id=? AND idempotency_key=?').bind(s.id,b.key).first();if(duplicate)return json({...orderData(duplicate),token:await tokenFor(s.id,duplicate.id),repeated:true},200,s.headers);throw error;
  }
  if(!await db.prepare('SELECT id FROM orders WHERE id=?').bind(id).first())fail('Your cart or discount changed during checkout. Refresh your cart and try again.',409);
  return json({id,token,status:'test',fulfillment:'pending',...totals,message:'Test order saved. No payment was collected and no shipment will be made.'},201,s.headers);
}
export default {async fetch(req,env){try{
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/'))return await api(req,env);
  if(url.pathname==='/health')return json({ok:true,mode:env.COMMERCE_MODE||'disabled'});
  if(url.pathname==='/admin/'&&!user(req).id)return Response.redirect(url.origin+(env.AUTH_SIGNIN_PATH||'/signin-with-chatgpt')+'?return_to=%2Fadmin%2F',302);
  const assetRequest=new Request(req);if(url.pathname==='/product/'){assetRequest.headers.delete('If-None-Match');assetRequest.headers.delete('If-Modified-Since');}
  const response=await env.ASSETS.fetch(assetRequest),headers=new Headers(response.headers);
  if(url.pathname==='/product/'&&req.method==='GET'&&env.DB){
    const row=await env.DB.prepare('SELECT data FROM custom_products WHERE id=?').bind(url.searchParams.get('id')||'').first();
    if(row){const p=JSON.parse(row.data),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let html=await response.text();html=html.replace(/<title>[\s\S]*?<\/title>/,()=>'<title>'+escape(p.name)+' | '+escape(brand.name)+' Shop</title>').replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g,(_,prefix)=>prefix+escape(p.description)).replace(/(<meta property="og:title" content=")[^"]*/g,(_,prefix)=>prefix+escape(p.name+' | '+brand.name+' Shop')).replace('</head>',()=>'<meta property="og:image" content="'+escape(p.image)+'"></head>');headers.delete('Content-Length');headers.delete('ETag');headers.set('Cache-Control','no-cache');headers.set('Referrer-Policy','same-origin');return new Response(html,{status:response.status,headers});}
  }
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
  if(url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||headers.get('Content-Type')?.includes('text/html'))headers.set('Cache-Control','no-cache');
  return new Response(response.body,{status:response.status,headers});
}catch(e){if(!e.status)console.error('Store request failed',e.message);return json({error:e.status?e.message:'Store temporarily unavailable. Please try again.'},e.status||503);}}};
