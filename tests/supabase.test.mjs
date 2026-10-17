import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {postgresAdapter,postgresQuery} from '../src/vercel/postgres.js';
import {createSupabaseAuth,verifiedSupabaseIdentity} from '../src/vercel/supabase-auth.js';
import {handleRequest} from '../src/vercel/handler.js';
import catalog from '../src/catalog.js';

const migration=await fs.readFile('supabase/migrations/202610180001_seqlyn_shop.sql','utf8');
function pgClient(pg) {
  const connection={unsafe:async(sql,args=[])=>(await pg.query(sql,args)).rows};
  connection.begin=async(_,operation)=>pg.transaction(async tx=>operation({unsafe:async(sql,args=[])=>(await tx.query(sql,args)).rows}));
  return connection;
}
const env={AUTH_PROVIDER:'supabase',SUPABASE_GOOGLE_ENABLED:'true',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',COMMERCE_MODE:'test',SHOP_ADMIN_EMAIL:'owner@example.test'};
const request=(path,options={})=>new Request('https://www.seqlynlabs.com'+path,options);
const verified={id:'user-123',email:'owner@example.test',email_confirmed_at:'2026-10-18T00:00:00Z',app_metadata:{provider:'google'}};
const fakeAuth=(user=verified)=>()=>({auth:{getUser:async()=>({data:{user},error:null})}});

test('PostgreSQL commerce schema preserves checkout, discounts, admin data and rollback',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await pg.exec(migration);await pg.exec(migration);
  const DB=postgresAdapter(pgClient(pg)),cookieJar=new Map();
  async function call(path,data,owner=false) {
    const response=await handleRequest(request(path,{method:data?'POST':'GET',headers:{Origin:'https://www.seqlynlabs.com','Content-Type':'application/json',cookie:[...cookieJar].map(([k,v])=>k+'='+v).join('; ')+(owner?'; seqlyn-supabase-auth=synthetic':'')},body:data?JSON.stringify(data):undefined}),env,{DB,authFactory:fakeAuth()});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookieJar.set(pair.slice(0,i),pair.slice(i+1));}
    const result=await response.json();assert.notEqual(response.status,503,JSON.stringify(result));return {status:response.status,data:result};
  }
  assert.equal((await call('/api/products')).data.products.length,81);
  assert.equal((await call('/api/admin/overview')).status,403);
  assert.equal((await call('/api/admin/overview',undefined,true)).status,200);
  assert.equal((await call('/api/admin/coupons',{code:'PGTEST',kind:'percent',amount:10,minimum:0,active:1,expires:'',max_uses:1},true)).status,200);
  assert.equal((await call('/api/verification',{age:true,researcher:true})).status,200);
  assert.equal((await call('/api/cart',{action:'add',id:catalog.find(p=>!p.variable).id,quantity:1})).status,200);
  await call('/api/cart',{action:'coupon',code:'PGTEST'});
  const checkout={key:crypto.randomUUID(),email:'guest@example.test',age:true,researcher:true,shipping:{name:'Test Researcher',address:'123 Test St',city:'Boston',postal:'02101',country:'US'}};
  const order=await call('/api/checkout',checkout);assert.equal(order.status,201);assert.ok(order.data.discount>0);
  assert.equal((await call('/api/checkout',checkout)).data.id,order.data.id);
  const receipt=await call('/api/orders/'+order.data.id+'?token='+order.data.token);assert.equal(receipt.status,200);
  assert.equal((await call('/api/cart')).data.items.length,0);
  await assert.rejects(DB.batch([DB.prepare('INSERT INTO carts(id) VALUES (?)').bind('rollback'),DB.prepare('INSERT INTO missing_table(id) VALUES (?)').bind('fail')]));
  assert.equal(await DB.prepare('SELECT id FROM carts WHERE id=?').bind('rollback').first(),null);
  const secured=(await pg.query("SELECT COUNT(*)::int n FROM pg_tables WHERE schemaname='seqlyn' AND rowsecurity")).rows[0].n;assert.equal(secured,12);
  assert.equal((await pg.query("SELECT has_schema_privilege('anon','seqlyn','USAGE') access")).rows[0].access,false);
  assert.equal((await pg.query("SELECT has_table_privilege('authenticated','seqlyn.orders','SELECT') access")).rows[0].access,false);
});

test('PostgreSQL translation preserves quoted text and keeps arguments separate',()=>{
  assert.equal(postgresQuery("SELECT '?' FROM orders WHERE id=?"),"SELECT '?' FROM seqlyn.\"orders\" WHERE id=$1");
  assert.equal(postgresQuery('INSERT OR IGNORE INTO carts(id) VALUES (?)'),'INSERT INTO seqlyn."carts"(id) VALUES ($1) ON CONFLICT DO NOTHING');
  assert.match(postgresQuery('SELECT COUNT(*) orders FROM orders'),/COUNT\(\*\) orders FROM seqlyn\."orders"/);
});

test('Supabase identity is server-verified, Google-backed and email-confirmed',async()=>{
  assert.deepEqual(verifiedSupabaseIdentity(verified),{id:'supabase:user-123',email:verified.email});
  assert.equal(verifiedSupabaseIdentity({...verified,email_confirmed_at:null}),null);
  assert.equal(verifiedSupabaseIdentity({...verified,app_metadata:{provider:'email'}}),null);
  const auth=createSupabaseAuth(request('/api/account',{headers:{cookie:'seqlyn-supabase-auth=forged'}}),env,()=>({auth:{getUser:async()=>({data:{user:null},error:{message:'invalid'}})}}));
  assert.equal(await auth.user(),null);
});

test('Supabase OAuth keeps PKCE cookies, blocks external returns and isolates refresh cookies',async()=>{
  let options;
  const auth=createSupabaseAuth(request('/api/auth/signin?callbackUrl=https://evil.example'),env,(_,__,config)=>{options=config;return {auth:{signInWithOAuth:async()=>{config.cookies.setAll([{name:'seqlyn-supabase-auth-code-verifier',value:'synthetic-verifier',options:{}}]);return {data:{url:'https://test.supabase.co/auth/v1/authorize?provider=google'},error:null};}}};});
  const response=auth.finish(await auth.handle());assert.equal(response.status,302);
  assert.ok(response.headers.getSetCookie().some(cookie=>cookie.includes('synthetic-verifier')&&cookie.includes('HttpOnly')&&cookie.includes('Secure')));
  assert.ok(response.headers.getSetCookie().some(cookie=>cookie.startsWith('seqlyn-auth-return=%2Fmy-account%2F')));
  assert.equal(options.cookieOptions.sameSite,'lax');
  const unrelated=createSupabaseAuth(request('/api/account'),env,fakeAuth());assert.equal(unrelated.finish(new Response('ok')).headers.getSetCookie().length,0);
});

test('Supabase callback rejects missing code and sign-out requires same-origin CSRF',async()=>{
  assert.equal((await createSupabaseAuth(request('/api/auth/callback/supabase'),env,fakeAuth()).handle()).status,400);
  const bad=createSupabaseAuth(request('/api/auth/signout',{method:'POST',headers:{Origin:'https://evil.example'},body:'csrf=x'}),env,fakeAuth());assert.equal((await bad.handle()).status,403);
  const badToken=createSupabaseAuth(request('/api/auth/signout',{method:'POST',headers:{Origin:'https://www.seqlynlabs.com',cookie:'seqlyn-signout-csrf=one'},body:'csrf=two'}),env,fakeAuth());assert.equal((await badToken.handle()).status,403);
});
