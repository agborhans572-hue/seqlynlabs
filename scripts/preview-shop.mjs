import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
await fs.mkdir('.sites-runtime',{recursive:true});
const previewPort=Number(process.env.PREVIEW_PORT||4173);
const sqlite=new DatabaseSync(process.env.PREVIEW_DATABASE||'.sites-runtime/preview.sqlite');if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='carts'").get())sqlite.exec(await fs.readFile('drizzle/0000_shop.sql','utf8'));
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='request_limits'").get())sqlite.exec(await fs.readFile('drizzle/0001_request_limits.sql','utf8'));
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='coupons'").get())sqlite.exec(await fs.readFile('drizzle/0002_commerce.sql','utf8'));
// PREVIEW_UI_FIXTURE=1 renders isolated local UI test fixtures without the consent popup.
// Production never uses this script or these synthetic identity/verification headers.

const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return sqlite.prepare(sql).run(...this.args);}};},async batch(stmts){sqlite.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='custom_products'").get())sqlite.exec(await fs.readFile('drizzle/0003_catalog.sql','utf8'));
const fixture=process.env.PREVIEW_UI_FIXTURE==='1';
const root=path.resolve('dist/client'),types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf'};
const ASSETS={async fetch(req){try{const u=new URL(req.url);let p=path.join(root,decodeURIComponent(u.pathname));if(p!==root&&!p.startsWith(root+path.sep))return new Response('Not found',{status:404});if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');let content=await fs.readFile(p);if(fixture&&path.extname(p)==='.html'){let html=content.toString().replace('<html lang="en">','<html lang="en" class="rgate-ok">');const start=html.indexOf('<div class="rgate-overlay">');if(start>=0)html=html.slice(0,start)+'</body></html>';content=Buffer.from(html);}return new Response(content,{headers:{'Content-Type':types[path.extname(p)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};
http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:{...req.headers,...(fixture?{cookie:'shop_cart=00000000-0000-4000-8000-000000000001; shop_verified=1','oai-authenticated-user-id':'preview-admin','oai-authenticated-user-email':'local-admin@example.test'}:{}),...(req.headers.cookie?.includes('preview_admin=1')?{'oai-authenticated-user-id':'preview-admin','oai-authenticated-user-email':'local-admin@example.test'}:{})},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),response=await worker.fetch(request,{DB,ASSETS,COMMERCE_MODE:'test',SHOP_ADMIN_EMAIL:'local-admin@example.test'});res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,k==='set-cookie'?v.replace('; Secure',''):v));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.statusCode=500;res.end('Preview error');}}).listen(previewPort,'127.0.0.1',()=>console.log('Standalone preview http://localhost:'+previewPort));
