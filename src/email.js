import {brand,presentProduct} from './brand.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const randomToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export const validEmail=email=>typeof email==='string'&&email.length<=254&&/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(email);
export function emailConfigured(env){
 try {const origin=new URL(env.PUBLIC_SITE_URL);return Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM&&env.SHOP_ADMIN_EMAIL&&origin.protocol==='https:'&&origin.pathname==='/'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash);}catch{return false;}
}
export function queueEmail(db,id,kind,recipient,payload,condition='',args=[]){
 return db.prepare('INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload) SELECT ?,?,?,?'+(condition?' WHERE '+condition:''))
  .bind(id,kind,recipient,JSON.stringify(payload),...args);
}
export function orderEmail(db,env,row,token){
 const items=JSON.parse(row.items).map(presentProduct);
 const receipt=new URL('/order-tracking/',env.PUBLIC_SITE_URL);receipt.searchParams.set('id',row.id);receipt.searchParams.set('token',token);
 const live=row.status==='awaiting_payment';
 const text=[brand.name+(live?' — Order received':' — TEST order confirmation'),'Order '+row.id,live?'Your order has been submitted and is awaiting review and payment. No payment has been collected.':'This is a test order. No payment was collected and no shipment is scheduled.','',
  ...items.map(i=>i.name+' × '+i.quantity+' — '+money(i.price*i.quantity)),'',
  'Subtotal: '+money(row.subtotal),'Discount: '+money(row.discount),'Shipping: '+money(row.shipping_total),'Tax: '+money(row.tax),'Total: '+money(row.total),'',
  ...(live?['Selected payment method: '+row.payment.label,'Our team will review your order and email your '+row.payment.label+' payment details from '+env.SHOP_ADMIN_EMAIL+'. Wait for those details before paying.','Your order will be processed after payment is confirmed.','','Delivery details:',...Object.values(JSON.parse(row.shipping)),'']:[]),
  'Your private receipt: '+receipt.href,'Keep this link private. It provides access to your receipt.','Questions? Reply to this email.'].join('\n');
 return queueEmail(db,'order:'+row.id,'order',row.email,{subject:(live?'Order received — ':'TEST order confirmation — ')+row.id.slice(0,8).toUpperCase(),text},'EXISTS(SELECT 1 FROM orders WHERE id=?)',[row.id]);
}
export function orderAdminEmail(db,env,row){
 const text=['New order awaiting review and payment','Order '+row.id,'Customer: '+row.email,'Payment method: '+row.payment.label,'',
  ...JSON.parse(row.items).map(i=>i.name+' × '+i.quantity+' — '+money(i.price*i.quantity)),'','Total: '+money(row.total),'','Delivery:',...Object.values(JSON.parse(row.shipping)),'',
  'Review the order, then reply to this email to send the customer payment details for '+row.payment.label+'. No payment has been collected.','Manage orders: '+new URL('/admin/',env.PUBLIC_SITE_URL).href].join('\n');
 return queueEmail(db,'order-admin:'+row.id,'order-admin',env.SHOP_ADMIN_EMAIL,{subject:'New order — '+row.id.slice(0,8).toUpperCase()+' — '+row.payment.label,reply_to:row.email,text},'EXISTS(SELECT 1 FROM orders WHERE id=?)',[row.id]);
}
export function contactEmail(db,env,id,kind,email,message){
 return queueEmail(db,'submission:'+id,'contact',env.SHOP_ADMIN_EMAIL,{subject:brand.name+' — new '+kind+' request',reply_to:email,
  text:'New '+kind+' request\nFrom: '+email+'\nReference: '+id+'\n\n'+message+'\n\nView saved requests: '+new URL('/admin/',env.PUBLIC_SITE_URL).href});
}
export async function newsletterSignup(db,env,email){
 email=email.trim().toLowerCase();
 const existing=await db.prepare('SELECT * FROM newsletter_subscribers WHERE email=?').bind(email).first(),now=Date.now();
 if(existing?.status==='subscribed'||existing&&now-existing.requested_at<3600000)return;
 const token=randomToken();
 const subscriber=db.prepare("INSERT INTO newsletter_subscribers(email,token,requested_at,consent) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET status='pending',token=excluded.token,requested_at=excluded.requested_at,confirmed_at=0,consent=excluded.consent")
  .bind(email,token,now,'Requested Seqlyn Labs newsletter via the website; confirmation required.');
 const confirm=new URL('/api/newsletter/confirm',env.PUBLIC_SITE_URL);confirm.searchParams.set('token',token);
 await db.batch([subscriber,queueEmail(db,'newsletter-confirm:'+token,'newsletter-confirm',email,{subject:'Confirm your Seqlyn Labs newsletter subscription',token,
  text:'Confirm your email to receive the Seqlyn Labs newsletter.\n\n'+confirm.href+'\n\nThis link expires in 48 hours. If you did not request this, ignore this email. You will not be subscribed unless you confirm.'})]);
}
const page=(title,message,form='')=>new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+escape(title)+' | Seqlyn Labs</title><link rel="stylesheet" href="/shop.css"></head><body><main class="shop-shell"><h1>'+escape(title)+'</h1><p>'+escape(message)+'</p>'+form+'<p><a href="/">Return to Seqlyn Labs</a></p></main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
export async function newsletterAction(req,db){
 const url=new URL(req.url),token=url.searchParams.get('token'),confirm=url.pathname==='/api/newsletter/confirm';
 if(!['GET','POST'].includes(req.method))return new Response('Method not allowed',{status:405});
 if(!/^[a-f0-9]{64}$/.test(token||''))return page('Invalid link','Please request a new newsletter confirmation from the website.');
 const row=await db.prepare('SELECT * FROM newsletter_subscribers WHERE token=?').bind(token).first();
 if(!row||confirm&&row.status!=='subscribed'&&(row.status!=='pending'||Date.now()-row.requested_at>172800000))return page('Link unavailable','Please request a new newsletter confirmation from the website.');
 if(req.method==='GET')return page(confirm?'Confirm newsletter subscription':'Unsubscribe',confirm?'Confirm that you want to receive the Seqlyn Labs newsletter.':'Stop receiving the Seqlyn Labs newsletter.',
  '<form method="post"><button>'+(confirm?'Confirm subscription':'Unsubscribe')+'</button></form>');
 // No state changes on GET: email scanners cannot subscribe or unsubscribe people.
 if(confirm&&req.headers.get('origin')!==url.origin)return new Response('Request origin rejected',{status:403});
 if(!confirm&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return new Response('Request origin rejected',{status:403});
 if(confirm)await db.prepare("UPDATE newsletter_subscribers SET status='subscribed',confirmed_at=? WHERE token=? AND status='pending'").bind(Date.now(),token).run();
 else await db.prepare("UPDATE newsletter_subscribers SET status='unsubscribed',unsubscribed_at=? WHERE token=?").bind(Date.now(),token).run();
 return page(confirm?'Subscription confirmed':'Unsubscribed',confirm?'You will receive future Seqlyn Labs newsletters. Every message includes an unsubscribe link.':'You will no longer receive newsletter campaigns.');
}
export async function queueCampaign(db,env,b){
 if(!emailConfigured(env)||!env.NEWSLETTER_POSTAL_ADDRESS)throw Object.assign(Error('Configure email delivery and the business mailing address before sending newsletters.'),{status:409});
 if(!/^[a-f0-9-]{36}$/.test(b.id||'')||typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>150||/[\r\n]/.test(b.subject)||typeof b.message!=='string'||!b.message.trim()||b.message.length>10000)throw Object.assign(Error('Enter a subject and newsletter message.'),{status:400});
 const previous=await db.prepare('SELECT * FROM newsletter_campaigns WHERE id=?').bind(b.id).first();if(previous)return {queued:previous.recipients,repeated:true};
 const recipients=(await db.prepare("SELECT email,token FROM newsletter_subscribers WHERE status='subscribed' ORDER BY email LIMIT 501").all()).results;
 if(recipients.length>500)throw Object.assign(Error('This sender supports up to 500 recipients per campaign. Split larger lists using a dedicated campaign service.'),{status:409});
 const statements=[db.prepare('INSERT INTO newsletter_campaigns(id,subject,message,recipients) VALUES (?,?,?,?)').bind(b.id,b.subject.trim(),b.message.trim(),recipients.length)];
 for(const r of recipients){const unsubscribe=new URL('/api/newsletter/unsubscribe',env.PUBLIC_SITE_URL);unsubscribe.searchParams.set('token',r.token);
  statements.push(queueEmail(db,'campaign:'+b.id+':'+r.token,'newsletter',r.email,{subject:b.subject.trim(),token:r.token,
   text:b.message.trim()+'\n\n'+brand.name+'\n'+env.NEWSLETTER_POSTAL_ADDRESS+'\nYou confirmed your subscription on our website.\nUnsubscribe: '+unsubscribe.href,
   headers:{'List-Unsubscribe':'<'+unsubscribe.href+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}));
 }
 try{await db.batch(statements);}catch(error){const retry=await db.prepare('SELECT recipients FROM newsletter_campaigns WHERE id=?').bind(b.id).first();if(retry)return {queued:retry.recipients,repeated:true};throw error;}
 return {queued:recipients.length};
}
export async function dispatchEmails(env,{limit=3,budgetMs=12000,ids=null,fetcher=env.EMAIL_FETCH||fetch,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!emailConfigured(env))return {configured:false,accepted:0};
 const db=env.DB,start=now();let accepted=0,processed=0;
 const only=ids?.length?' AND id IN ('+ids.map(()=>'?').join(',')+')':'';
 const rows=(await db.prepare("SELECT * FROM email_outbox WHERE ((status='queued' AND next_attempt<=?) OR (status='sending' AND lease_until<?))"+only+" ORDER BY CASE WHEN kind='newsletter' THEN 1 ELSE 0 END,created_at,id LIMIT ?").bind(start,start,...(ids||[]),limit).all()).results;
 for(const row of rows){
  if(now()-start>budgetMs-5500)break;
  const lease=crypto.randomUUID();
  const claimed=await db.prepare("UPDATE email_outbox SET status='sending',lease=?,lease_until=?,attempts=attempts+1,first_attempt=CASE WHEN first_attempt=0 THEN ? ELSE first_attempt END WHERE id=? AND ((status='queued' AND next_attempt<=?) OR (status='sending' AND lease_until<?)) RETURNING id")
   .bind(lease,now()+120000,now(),row.id,now(),now()).first();if(!claimed)continue;
  processed++;
  const update=(status,provider='',error='',next=0)=>db.prepare('UPDATE email_outbox SET status=?,provider_id=?,error=?,next_attempt=?,lease_until=0 WHERE id=? AND lease=?').bind(status,provider,error,next,row.id,lease).run();
  // Resend retains deduplication keys for 24h. Never retry an uncertain send beyond it.
  if(row.first_attempt&&now()-row.first_attempt>=23*3600000){await update('failed','','Review provider logs before resending: retry window expired.');continue;}
  const payload=JSON.parse(row.payload);
  if(row.kind==='newsletter'||row.kind==='newsletter-confirm'){
   const subscriber=await db.prepare('SELECT status,token,requested_at FROM newsletter_subscribers WHERE email=?').bind(row.recipient).first();
   if(row.kind==='newsletter'&&(subscriber?.status!=='subscribed'||subscriber.token!==payload.token)||row.kind==='newsletter-confirm'&&(subscriber?.status!=='pending'||subscriber.token!==payload.token||now()-subscriber.requested_at>172800000)){await update('suppressed');continue;}
  }
  let status=0;
  try{
   const {token,...content}=payload;
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':row.id},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[row.recipient],reply_to:env.EMAIL_REPLY_TO||env.SHOP_ADMIN_EMAIL,...content,
     html:'<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222"><h2>'+escape(brand.name)+'</h2><div style="white-space:pre-wrap;line-height:1.6">'+escape(content.text).replace(/https:\/\/[^\s<]+/g,link=>'<a href="'+link+'">'+link+'</a>')+'</div></div>'}),signal:AbortSignal.timeout(5000)});
   status=response.status;const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.id)throw Error('Provider rejected the send');
   await update('accepted',data.id);accepted++;
  }catch{
   const permanent=status>=400&&status<500&&![408,429].includes(status),exhausted=row.attempts>=7;
   await update(permanent||exhausted?'failed':'queued','','Email provider '+(status||'timeout/network')+'; no message content logged.',now()+Math.min(3600000,30000*2**row.attempts));
  }
  if(processed<rows.length)await pause(600);
 }
 return {configured:true,accepted,processed};
}
export async function flushEmails(env,options){try{return await dispatchEmails(env,options);}catch{console.error('Email queue processing failed; messages remain stored.');return {configured:emailConfigured(env),accepted:0};}}
