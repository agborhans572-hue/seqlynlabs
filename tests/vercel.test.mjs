import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {encode} from '@auth/core/jwt';
import {databaseAdapter,deploymentDatabase} from '../src/vercel/database.js';
import {handleRequest} from '../src/vercel/handler.js';
import {authConfig} from '../src/vercel/auth.js';
import {migrate} from '../scripts/migrate-turso.mjs';
import catalog from '../src/catalog.js';

const env={AUTH_SECRET:'synthetic-test-secret-at-least-32-characters',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test',SHOP_ADMIN_EMAIL:'owner@example.test',COMMERCE_MODE:'test'};
const request=(url,options={})=>new Request('https://shop.example.test'+url,options);
const cookieName='__Secure-authjs.session-token';
const session=async(email='owner@example.test',extra={})=>cookieName+'='+await encode({secret:env.AUTH_SECRET,salt:cookieName,token:{sub:'google:123',email,emailVerified:true,...extra}});
async function harness(t) {
  const client=createClient({url:'file::memory:'});t.after(()=>client.close());await migrate(client);
  return {client,DB:databaseAdapter(client),ASSETS:{fetch:async()=>new Response('<html>shell</html>',{headers:{'Content-Type':'text/html'}})}};
}

test('libSQL migrations repeat safely and checkout batches roll back on failure',async t=>{
  const h=await harness(t);await migrate(h.client);
  assert.equal((await h.DB.prepare('SELECT COUNT(*) n FROM _seqlyn_migrations').first()).n,5);
  await assert.rejects(h.DB.batch([
    h.DB.prepare('INSERT INTO carts(id) VALUES (?)').bind('rollback'),
    h.DB.prepare('INSERT INTO missing_table(id) VALUES (?)').bind('failure')
  ]));
  assert.equal(await h.DB.prepare('SELECT id FROM carts WHERE id=?').bind('rollback').first(),null);
});

test('migration runner rejects edits to an applied migration',async t=>{
  const h=await harness(t),dir=await fs.mkdtemp(path.join(os.tmpdir(),'seqlyn-migrations-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'0000_shop.sql'),'SELECT 1;');
  await assert.rejects(migrate(h.client,dir),/Applied migration was changed/);
});

test('Vercel rejects forged identity headers, preview cookies and forged sessions',async t=>{
  const h=await harness(t);
  for(const headers of [
    {'oai-authenticated-user-id':'owner','oai-authenticated-user-email':env.SHOP_ADMIN_EMAIL,cookie:'preview_admin=1'},
    {cookie:cookieName+'=forged'},
    {cookie:await session(env.SHOP_ADMIN_EMAIL,{emailVerified:false})}
  ]) {
    assert.equal((await handleRequest(request('/api/admin/overview',{headers}),env,h)).status,403);
    assert.equal((await (await handleRequest(request('/api/account',{headers}),env,h)).json()).signedIn,false);
  }
  const headers={cookie:await session()};
  assert.equal((await handleRequest(request('/api/admin/overview',{headers}),env,h)).status,200);
  assert.equal((await handleRequest(request('/api/admin/overview',{headers:{cookie:await session('customer@example.test')}}),env,h)).status,403);
});

test('Google sign-in requires verified email and blocks external callback redirects',async()=>{
  const config=authConfig(env);
  assert.equal(await config.callbacks.signIn({account:{provider:'google'},profile:{email_verified:false}}),false);
  assert.equal(await config.callbacks.signIn({account:{provider:'google'},profile:{email_verified:true}}),true);
  const r=await handleRequest(request('/auth/signin?return_to=https://evil.example/'),env);
  assert.equal(new URL(r.headers.get('location')).searchParams.get('callbackUrl'),'https://shop.example.test/my-account/');
  assert.equal((await handleRequest(request('/api/auth/signin'),{})).status,503);
  const page=await handleRequest(request('/api/auth/signin'),env);
  assert.equal(page.status,200);assert.match(await page.text(),/Google/);
});

test('guest test checkout works through the Vercel adapter with persistent cookies',async t=>{
  const h=await harness(t),cookies=new Map();
  async function call(route,data) {
    const response=await handleRequest(request(route,{method:data?'POST':'GET',headers:{Origin:'https://shop.example.test','Content-Type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:data?JSON.stringify(data):undefined}),env,h);
    for(const cookie of response.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');cookies.set(part.slice(0,i),part.slice(i+1));}
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    return {status:response.status,data:await response.json()};
  }
  assert.equal((await call('/api/verification',{age:true,researcher:true})).status,200);
  assert.equal((await call('/api/cart',{action:'add',id:catalog.find(p=>!p.variable).id,quantity:1})).status,200);
  const data={key:crypto.randomUUID(),email:'test@example.test',age:true,researcher:true,shipping:{name:'Test',address:'123 Test Street',city:'Boston',postal:'02101',country:'US'}};
  const order=await call('/api/checkout',data);assert.equal(order.status,201);assert.equal(order.data.status,'test');
  assert.equal((await call('/api/orders/'+order.data.id+'?token='+order.data.token)).status,200);
  assert.equal((await call('/api/cart')).data.items.length,0);
});

test('deployment health fails closed without a database and origin checks remain enforced',async t=>{
  assert.equal((await handleRequest(request('/health'),{})).status,503);
  const h=await harness(t);
  assert.equal((await handleRequest(request('/health'),env,h)).status,200);
  assert.equal((await handleRequest(request('/api/cart',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),env,h)).status,403);
  assert.equal((await handleRequest(request('/admin'),env,h)).headers.get('location'),'https://shop.example.test/admin/');
  assert.match((await handleRequest(request('/admin/'),env,h)).headers.get('location'),/\/auth\/signin/);
  assert.throws(()=>deploymentDatabase({TURSO_DATABASE_URL:'file:local.sqlite',TURSO_AUTH_TOKEN:'test'}),/remote encrypted/);
});
