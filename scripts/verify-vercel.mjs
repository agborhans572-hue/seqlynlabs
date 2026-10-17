import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import catalog from '../src/catalog.js';
import manifest from '../src/brand-assets.json' with {type:'json'};

const root=path.resolve('.vercel/output');
const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
assert.equal(config.version,3);
const dynamic=config.routes.find(r=>r.dest==='/shop');
for(const route of ['/api/products','/api/auth/callback/google','/health','/admin/','/product/','/admin/index.html','/auth/signout'])assert.match(route,new RegExp(dynamic.src));
for(const route of ['/assets/seqlyn/hero.png','/my-account/','/products/bpc/','/product-clone.css','/admin.js'])assert.doesNotMatch(route,new RegExp(dynamic.src));
for(const value of new Set([...Object.values(manifest),...catalog.flatMap(p=>[p.image,...(p.variants||[]).map(v=>v.image)])]))assert.ok((await fs.stat(path.join(root,'static',value))).size>0,value);
// The ordinary certificate suite checks baseline hashes; packaging must also copy exactly.
for(const file of await fs.readdir('dist/client/certificates')) {
  const source=await fs.readFile('dist/client/certificates/'+file);
  assert.deepEqual(await fs.readFile(path.join(root,'static','certificates',file)),source);
}
const script=await fs.readFile(path.join(root,'static','shop.js'),'utf8');
assert.match(script,/Sign in with Google/);assert.doesNotMatch(script,/Sign in with ChatGPT/);
const {default:handler}=await import(pathToFileURL(path.join(root,'functions','shop.func','index.mjs')).href);
// Smoke-test the exact deployable bundle without remote secrets or real sign-in.
const saved={};for(const key of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','VERCEL']){saved[key]=process.env[key];delete process.env[key];}
const server=http.createServer(handler);
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  for(const [route,status] of [['/health',503],['/api/products',503],['/admin/',302],['/product/',200],['/api/auth/signin',503],['/auth/signin?return_to=%2Fadmin%2F',302]]) {
    const response=await fetch(base+route,{redirect:'manual'});
    assert.equal(response.status,status,route);assert.equal(response.headers.get('cache-control'),'private, no-store');await response.arrayBuffer();
  }
  Object.assign(process.env,{AUTH_SECRET:'synthetic-test-secret-at-least-32-characters',AUTH_GOOGLE_ID:'test',AUTH_GOOGLE_SECRET:'test'});
  const signin=await fetch(base+'/api/auth/signin');assert.equal(signin.status,200);assert.match(await signin.text(),/Google/);
} finally {
  await new Promise(resolve=>server.close(resolve));
  for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
}
console.log('Verified Vercel bundle routing, function launcher, Google sign-in page, all catalog/manifest assets, and unchanged certificate copies.');
await import('./audit-vercel.mjs');
