import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createClient} from '@libsql/client';
import {handleRequest} from '../src/vercel/handler.js';
import {databaseAdapter} from '../src/vercel/database.js';
import {migrate} from './migrate-turso.mjs';

// Local-only durable database; Vercel itself always uses the remote database.
await fs.mkdir('.sites-runtime',{recursive:true});
const client=createClient({url:'file:.sites-runtime/vercel-preview.sqlite'});
await migrate(client);
const DB=databaseAdapter(client),root=path.resolve('.vercel/output/static');
await fs.access(path.join(root,'index.html'));
const securityHeaders=JSON.parse(await fs.readFile('.vercel/output/config.json','utf8')).routes[0].headers;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.woff2':'font/woff2'};
const ASSETS={async fetch(req) {
  try {
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url).pathname));
    if(file!==root&&!file.startsWith(root+path.sep))return new Response('Not found',{status:404});
    if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
    return new Response(await fs.readFile(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});
  } catch {return new Response('Not found',{status:404});}
}};
http.createServer(async(req,res)=>{
  try {
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const route=new URL(request.url).pathname;
    const response=/^\/(?:api(?:\/|$)|health$|auth\/|sign(?:in|out)-with-chatgpt|admin(?:\/|$)|product(?:\/|$))/.test(route)
      ?await handleRequest(request,{...process.env,VERCEL:'0',COMMERCE_MODE:'test'},{DB,ASSETS}):await ASSETS.fetch(request);
    res.statusCode=response.status;
    for(const [name,value]of Object.entries(securityHeaders))res.setHeader(name,value);
    for(const [name,value]of response.headers)if(name!=='set-cookie')res.setHeader(name,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies.map(c=>c.replace(/; Secure/gi,'')));
    res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  } catch(error){console.error(error.message);res.statusCode=503;res.end('Preview unavailable');}
}).listen(4175,'127.0.0.1',()=>console.log('Vercel storefront preview: http://localhost:4175 (separate local data, no synthetic sign-in)'));
