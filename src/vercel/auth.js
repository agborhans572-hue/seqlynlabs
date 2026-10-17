import {Auth} from '@auth/core';
import Google from '@auth/core/providers/google';
import {getToken} from '@auth/core/jwt';
import {supabaseAuthConfigured} from './supabase-auth.js';

export const authConfigured=env=>env.AUTH_PROVIDER==='supabase'?supabaseAuthConfigured(env):Boolean(env.AUTH_SECRET?.length>=32 && env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

export function authConfig(env) {
  return {
    basePath:'/api/auth', trustHost:true, secret:env.AUTH_SECRET,
    session:{strategy:'jwt',maxAge:60*60*24*7},
    providers:[Google({clientId:env.AUTH_GOOGLE_ID,clientSecret:env.AUTH_GOOGLE_SECRET})],
    callbacks:{
      async signIn({account,profile}) { return account?.provider==='google' && profile?.email_verified===true; },
      async jwt({token,account,profile}) {
        if(account && profile) {
          token.sub='google:'+profile.sub;
          token.email=profile.email;
          token.emailVerified=profile.email_verified===true;
        }
        return token;
      },
      async session({session,token}) {
        if(session.user) session.user.id=token.sub;
        return session;
      },
      async redirect({url,baseUrl}) {
        try { const target=new URL(url,baseUrl);if(target.origin===baseUrl)return target.href; } catch {}
        return baseUrl+'/my-account/';
      }
    },
    theme:{brandColor:'#ad7047',logo:'/assets/seqlyn/logo-light.png'}
  };
}

export async function authenticatedUser(req,env) {
  if(env.AUTH_PROVIDER==='supabase')return null;
  if(!authConfigured(env)) return null;
  // Accept our encrypted session cookie only; never a caller-supplied identity header.
  const headers=new Headers({cookie:req.headers.get('cookie')||''});
  const token=await getToken({req:{headers},secret:env.AUTH_SECRET,secureCookie:new URL(req.url).protocol==='https:'});
  return token?.emailVerified===true && token.sub?.startsWith('google:') && typeof token.email==='string'
    ? {id:token.sub,email:token.email}:null;
}

export function authentication(req,env) {
  if(!authConfigured(env)) return Response.json({error:'Google sign-in is not configured yet.'},{status:503,headers:{'Cache-Control':'no-store'}});
  return Auth(req,authConfig(env));
}
