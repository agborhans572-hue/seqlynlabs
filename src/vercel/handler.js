import fs from 'node:fs/promises';
import {Readable} from 'node:stream';
import worker from '../worker.js';
import {deploymentDatabase} from './database.js';
import {authentication,authenticatedUser,authConfigured} from './auth.js';
import {createSupabaseAuth} from './supabase-auth.js';

function safeReturn(value,origin) {
  try { const url=new URL(value||'/my-account/',origin);if(url.origin===origin)return url.href; } catch {}
  return origin+'/my-account/';
}

export async function handleRequest(req,env=process.env,dependencies={}) {
  const url=new URL(req.url);
  const supabase=env.AUTH_PROVIDER==='supabase'?createSupabaseAuth(req,env,dependencies.authFactory):null;
  let response;
  if(/^\/(admin|product)(?:\/index\.html)?$/.test(url.pathname) || /^\/(admin|product)\/index\.html$/.test(url.pathname)) {
    url.pathname='/'+url.pathname.split('/')[1]+'/';
    return Response.redirect(url.href,308);
  }
  if(/^\/(?:auth\/(?:signin|signout)|sign(?:in|out)-with-chatgpt)\/?$/.test(url.pathname)) {
    const action=url.pathname.includes('signout')?'signout':'signin';
    const target=new URL('/api/auth/'+action,url.origin);
    target.searchParams.set('callbackUrl',safeReturn(url.searchParams.get('return_to'),url.origin));
    response=Response.redirect(target.href,302);
  } else if(url.pathname.startsWith('/api/auth/')) {
    response=supabase?await supabase.handle():await authentication(req,env);
  } else {
    const headers=new Headers(req.headers);
    for(const name of [...headers.keys()]) if(name.startsWith('oai-') || name==='cf-connecting-ip') headers.delete(name);
    // Vercel overwrites X-Forwarded-For at the edge. Local preview never trusts it.
    if(env.VERCEL==='1' && req.headers.get('x-forwarded-for')) headers.set('cf-connecting-ip',req.headers.get('x-forwarded-for').split(',')[0].trim());
    const identity=supabase?await supabase.user():await authenticatedUser(req,env);
    if(identity) {
      headers.set('oai-authenticated-user-id',identity.id);
      headers.set('oai-authenticated-user-email',identity.email);
    }
    const db=dependencies.DB||deploymentDatabase(env);
    if(url.pathname==='/health') {
      let database=false;
      try { database=Boolean(db && await db.prepare('SELECT (SELECT COUNT(*) FROM custom_products) products, (SELECT COUNT(*) FROM order_events) events, (SELECT COUNT(*) FROM store_settings) settings').first()); } catch {}
      response=Response.json({ok:database,mode:env.COMMERCE_MODE||'disabled',database:database?'ready':'unavailable',authentication:authConfigured(env)?'configured':'unconfigured'},{status:database?200:503});
    } else {
      const ASSETS=dependencies.ASSETS||{async fetch(request) {
        const pathname=new URL(request.url).pathname;
        // Only these two dynamic HTML shells belong in the function bundle.
        if(!['/product/','/admin/'].includes(pathname)) return new Response('Not found',{status:404});
        const html=await fs.readFile(new URL('./templates/'+(pathname==='/product/'?'product':'admin')+'.html',import.meta.url));
        return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }};
      response=await worker.fetch(new Request(req,{headers}),{DB:db,ASSETS,COMMERCE_MODE:env.COMMERCE_MODE,SHOP_ADMIN_EMAIL:env.SHOP_ADMIN_EMAIL,AUTH_SIGNIN_PATH:'/auth/signin',
        PUBLIC_SITE_URL:env.PUBLIC_SITE_URL,RESEND_API_KEY:env.RESEND_API_KEY,EMAIL_FROM:env.EMAIL_FROM,EMAIL_REPLY_TO:env.EMAIL_REPLY_TO,CRON_SECRET:env.CRON_SECRET,NEWSLETTER_POSTAL_ADDRESS:env.NEWSLETTER_POSTAL_ADDRESS});
    }
  }
  if(supabase)response=supabase.finish(response);
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','same-origin');
  return new Response(response.body,{status:response.status,headers});
}

// Node launcher for the Vercel Build Output API; also exercised by local preview.
export default async function handler(req,res) {
  try {
    const protocol=process.env.VERCEL==='1'?'https':'http';
    const origin=protocol+'://'+req.headers.host;
    const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,
      ...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await handleRequest(request);
    res.statusCode=response.status;
    for(const [name,value] of response.headers) if(name!=='set-cookie')res.setHeader(name,value);
    const cookies=response.headers.getSetCookie();
    if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  } catch(error) {
    console.error('Vercel request failed',error.name);
    res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({error:'Store temporarily unavailable. Please try again.'}));
  }
}
