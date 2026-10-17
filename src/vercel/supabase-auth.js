import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';

export const supabaseAuthConfigured=env=>Boolean(env.SUPABASE_GOOGLE_ENABLED==='true' && (env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL) && (env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
const storageKey='seqlyn-supabase-auth';
const safePath=(raw,origin)=>{try{const url=new URL(raw||'/my-account/',origin);if(url.origin===origin&&!url.pathname.startsWith('/api/auth/'))return url.pathname+url.search;}catch{}return '/my-account/';};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function verifiedSupabaseIdentity(user) {
  if(!user?.id || !user.email || !user.email_confirmed_at || !(user.app_metadata?.provider==='google' || user.identities?.some(identity=>identity.provider==='google')))return null;
  return {id:'supabase:'+user.id,email:user.email};
}

// All session state belongs to this request; warm Vercel instances must never
// share a Supabase auth client between different visitors.
export function createSupabaseAuth(request,env,factory=createServerClient) {
  const url=new URL(request.url),cookies=parseCookieHeader(request.headers.get('cookie')||''),headers=new Headers();
  const options={path:'/',httpOnly:true,secure:url.protocol==='https:',sameSite:'lax',maxAge:60*60*24*7};
  const write=(name,value,extra={})=>headers.append('Set-Cookie',serializeCookieHeader(name,value,{...options,...extra}));
  const read=name=>cookies.find(cookie=>cookie.name===name)?.value;
  const client=supabaseAuthConfigured(env)?factory(env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
    cookieOptions:{...options,name:storageKey},
    cookies:{getAll:()=>cookies,setAll(values,cacheHeaders={}){for(const value of values)write(value.name,value.value,value.options);for(const [key,value]of Object.entries(cacheHeaders))headers.set(key,value);}}
  }):null;
  function finish(response){const result=new Headers(response.headers);for(const [key,value]of headers)if(key!=='set-cookie')result.set(key,value);for(const cookie of headers.getSetCookie())result.append('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers:result});}
  const failure=(message,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
  return {
    finish,
    async user(){
      if(!client || !cookies.some(cookie=>cookie.name.startsWith(storageKey)))return null;
      const {data,error}=await client.auth.getUser();
      return error?null:verifiedSupabaseIdentity(data.user);
    },
    async handle(){
      if(!client)return failure('Supabase sign-in is not configured yet.',503);
      const path=url.pathname;
      if(path==='/api/auth/signin' && request.method==='GET') {
        const next=safePath(url.searchParams.get('callbackUrl'),url.origin);
        write('seqlyn-auth-return',next,{maxAge:600});
        const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:url.origin+'/api/auth/callback/supabase',skipBrowserRedirect:true}});
        if(error||!data.url)return failure('Google sign-in is unavailable. Please contact our team.',503);
        return Response.redirect(data.url,302);
      }
      if(path==='/api/auth/callback/supabase' && request.method==='GET') {
        const code=url.searchParams.get('code');
        if(!code || code.length>4096)return failure('Sign-in could not be completed. Please try again.');
        const {error}=await client.auth.exchangeCodeForSession(code);
        if(error)return failure('Sign-in could not be completed. Please try again.');
        const target=safePath(read('seqlyn-auth-return'),url.origin);write('seqlyn-auth-return','',{maxAge:0});
        return Response.redirect(url.origin+target,302);
      }
      if(path==='/api/auth/signout' && request.method==='GET') {
        const nonce=crypto.randomUUID();write('seqlyn-signout-csrf',nonce,{maxAge:600});
        const target=safePath(url.searchParams.get('callbackUrl'),url.origin);
        return new Response('<!doctype html><html><head><title>Sign out | Seqlyn Labs</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shop.css"></head><body><main class="shop-shell"><img src="/assets/seqlyn/logo-light.png" width="220" alt="Seqlyn Labs"><h1>Sign out</h1><form method="post"><input type="hidden" name="csrf" value="'+nonce+'"><input type="hidden" name="returnTo" value="'+escape(target)+'"><button>Sign out</button></form></main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      if(path==='/api/auth/signout' && request.method==='POST') {
        if(request.headers.get('origin')!==url.origin)return failure('Request origin rejected',403);
        const text=await request.text();if(text.length>4096)return failure('Request too large',413);
        const fields=new URLSearchParams(text);
        if(!read('seqlyn-signout-csrf')||fields.get('csrf')!==read('seqlyn-signout-csrf'))return failure('Please confirm sign-out again.',403);
        const {error}=await client.auth.signOut({scope:'local'});
        if(error)return failure('Sign-out could not be completed. Please try again.',503);
        write('seqlyn-signout-csrf','',{maxAge:0});
        return Response.redirect(url.origin+safePath(fields.get('returnTo'),url.origin),303);
      }
      return failure('Not found',404);
    }
  };
}
