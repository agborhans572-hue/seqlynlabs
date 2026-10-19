import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import worker from '../src/worker.js';
import catalog from '../src/catalog.js';
import {postgresAdapter} from '../src/vercel/postgres.js';
import {dispatchEmails} from '../src/email.js';

const admin={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'info@seqlynlabs.com'};
const product=catalog.find(p=>!p.variable);
const config={enabled:true,methods:['crypto','apple_pay','paypal'].map(id=>({id,enabled:true,instructions:''}))};
const checkout=method=>({key:crypto.randomUUID(),paymentMethod:method,email:'researcher@example.test',age:true,researcher:true,shipping:{name:'Synthetic Researcher',address:'123 Test Street',city:'Boston',state:'MA',postal:'02101',country:'US'}});
async function harness(t,postgres=false){
 let DB;
 if(postgres){
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const name of (await fs.readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await fs.readFile('supabase/migrations/'+name,'utf8'));
  const client={unsafe:async(sql,args=[])=>(await pg.query(sql,args)).rows};client.begin=async(_,fn)=>pg.transaction(tx=>fn({unsafe:async(sql,args=[])=>(await tx.query(sql,args)).rows}));DB=postgresAdapter(client);
 }else{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await fs.readFile('drizzle/'+name,'utf8'));
  DB={prepare(sql){return {args:[],bind(...args){return {...this,args};},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return sqlite.prepare(sql).run(...this.args);}};},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 }
 const sent=[],env={DB,COMMERCE_MODE:'test',SHOP_ADMIN_EMAIL:'info@seqlynlabs.com',PUBLIC_SITE_URL:'https://shop.test',RESEND_API_KEY:'synthetic',EMAIL_FROM:'Seqlyn Labs <info@seqlynlabs.com>',EMAIL_FETCH:async(url,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:crypto.randomUUID()});}};
 const cookies=new Map();
 async function call(path,data,identity={},browser='default'){
  const jar=cookies.get(browser)||{};
  const r=await worker.fetch(new Request('https://shop.test'+path,{method:data?'POST':'GET',headers:{Origin:'https://shop.test','Content-Type':'application/json',Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...identity},body:data?JSON.stringify(data):undefined}),env);
  for(const value of r.headers.getSetCookie()){const [key,v]=value.split(';')[0].split('=');jar[key]=v;}cookies.set(browser,jar);return {status:r.status,data:await r.json()};
 }
 async function fill(browser='default'){await call('/api/verification',{age:true,researcher:true},{},browser);await call('/api/cart',{action:'add',id:product.id,quantity:1},{},browser);}
 return {DB,env,sent,call,fill};
}

for(const postgres of [false,true])test((postgres?'Postgres':'SQLite')+' manual orders persist payment choices, send both emails once, reserve stock and require verified payment before fulfillment',async t=>{
 const h=await harness(t,postgres);
 assert.equal((await h.call('/api/admin/payments',config)).status,403);
 assert.equal((await h.call('/api/admin/payments',config,admin)).status,200);
 assert.equal((await h.call('/api/admin/products',{id:product.id,price:product.price,stock:5,active:1},admin)).status,200);
 const publicConfig=(await h.call('/api/store')).data;assert.equal(publicConfig.mode,'manual');assert.equal(publicConfig.paymentMethods.length,3);assert.equal(publicConfig.paymentMethods[0].instructions,undefined);
 for(const method of ['crypto','apple_pay','paypal']){
  await h.fill();const b=checkout(method);
  assert.equal((await h.call('/api/checkout',{...b,paymentMethod:'wire'})).status,400);
  const order=await h.call('/api/checkout',b);assert.equal(order.status,201,JSON.stringify(order.data));assert.equal(order.data.status,'awaiting_payment');assert.equal(order.data.mode,'manual');assert.equal(order.data.total,product.price);
  const before=h.sent.length;assert.equal((await h.call('/api/checkout',b)).data.id,order.data.id);assert.equal(h.sent.length,before);
  const customer=h.sent.find(m=>m.to[0]===b.email&&m.text.includes(order.data.id)),owner=h.sent.find(m=>m.to[0]==='info@seqlynlabs.com'&&m.text.includes(order.data.id));
  assert.ok(customer);assert.ok(owner);assert.doesNotMatch(customer.subject,/TEST/);assert.match(customer.text,/review your order and email/);assert.match(customer.text,/No payment has been collected/);assert.equal(owner.reply_to,b.email);assert.ok(owner.text.includes(order.data.payment.label));assert.match(owner.text,/Boston/);
  assert.equal((await h.call('/api/orders/'+order.data.id)).status,404);
  const path='/api/orders/'+order.data.id+'?token='+order.data.token,receipt=(await h.call(path)).data;assert.equal(receipt.payment.id,method);
  const update={id:order.data.id,fulfillment:'processing',carrier:'',tracking:'',notes:''};assert.equal((await h.call('/api/admin/orders',update,admin)).status,409);
  if(method==='crypto'){
   assert.equal((await h.call('/api/admin/orders/payment',{id:order.data.id,reference:'TX-SYNTHETIC'})).status,403);
   assert.equal((await h.call('/api/admin/orders/payment',{id:order.data.id,reference:''},admin)).status,400);
   assert.equal((await h.call('/api/admin/orders/payment',{id:order.data.id,reference:'TX-SYNTHETIC'},admin)).status,200);
   assert.equal((await h.call('/api/admin/orders/payment',{id:order.data.id,reference:'TX-SYNTHETIC'},admin)).status,409);
   assert.equal((await h.call('/api/orders/'+order.data.id+'/cancel?token='+order.data.token,{})).status,409);
   assert.equal((await h.call('/api/admin/orders',update,admin)).status,200);assert.equal((await h.call(path)).data.status,'paid');
  }else{
   assert.equal((await h.call('/api/orders/'+order.data.id+'/cancel?token='+order.data.token,{})).status,200);
   assert.equal((await h.call('/api/orders/'+order.data.id+'/cancel?token='+order.data.token,{})).status,409);
  }
 }
 assert.equal((await h.DB.prepare('SELECT stock FROM product_settings WHERE id=?').bind(product.id).first()).stock,4);
 assert.equal((await h.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n,3);assert.equal(h.sent.length,6);
});

test('unavailable email configuration cannot activate orders; failed sends preserve orders and retry their original queue entries',async t=>{
 const h=await harness(t),key=h.env.RESEND_API_KEY;delete h.env.RESEND_API_KEY;assert.equal((await h.call('/api/admin/payments',config,admin)).status,409);h.env.RESEND_API_KEY=key;
 await h.call('/api/admin/payments',config,admin);await h.fill();h.env.EMAIL_FETCH=async()=>Response.json({error:'temporary'},{status:503});
 const order=await h.call('/api/checkout',checkout('paypal'));assert.equal(order.status,201);assert.equal(order.data.emailStatus,'queued');assert.equal((await h.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n,1);
 await h.DB.prepare('UPDATE email_outbox SET next_attempt=0').run();const sent=[];await dispatchEmails(h.env,{pause:async()=>{},fetcher:async(_,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:crypto.randomUUID()});}});assert.equal(sent.length,2);
 assert.equal((await h.DB.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='accepted'").first()).n,2);
});

test('stock changes during checkout leave the cart, coupon, email queue and orders untouched',async t=>{
 const h=await harness(t);await h.call('/api/admin/payments',config,admin);await h.call('/api/admin/products',{id:product.id,price:product.price,stock:1,active:1},admin);await h.fill();
 const batch=h.DB.batch.bind(h.DB);h.DB.batch=async statements=>{await h.DB.prepare('UPDATE product_settings SET stock=0 WHERE id=?').bind(product.id).run();h.DB.batch=batch;return batch(statements);};
 assert.equal((await h.call('/api/checkout',checkout('crypto'))).status,409);assert.equal((await h.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n,0);assert.equal((await h.DB.prepare('SELECT COUNT(*) n FROM email_outbox').first()).n,0);assert.equal((await h.call('/api/cart')).data.items.length,1);
});
