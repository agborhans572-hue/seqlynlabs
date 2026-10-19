import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import worker from '../src/worker.js';
import catalog from '../src/catalog.js';
import {dispatchEmails,queueEmail,newsletterSignup,queueCampaign} from '../src/email.js';
import {postgresAdapter} from '../src/vercel/postgres.js';

const admin={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'info@seqlynlabs.com'};
function harness(){
 const sqlite=new DatabaseSync(':memory:');for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const DB={prepare(sql){return {args:[],bind(...args){return {...this,args};},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return sqlite.prepare(sql).run(...this.args);}};},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const sent=[];const env={DB,COMMERCE_MODE:'test',SHOP_ADMIN_EMAIL:'info@seqlynlabs.com',PUBLIC_SITE_URL:'https://shop.test',RESEND_API_KEY:'synthetic',EMAIL_FROM:'Seqlyn Labs <info@seqlynlabs.com>',NEWSLETTER_POSTAL_ADDRESS:'Synthetic test address',CRON_SECRET:'synthetic-cron',EMAIL_FETCH:async(url,options)=>{sent.push({url,...options,body:JSON.parse(options.body)});return Response.json({id:crypto.randomUUID()});}};
 let cookies={};
 return {sqlite,env,sent,async call(path,data,identity={}){const response=await worker.fetch(new Request('https://shop.test'+path,{method:data?'POST':'GET',headers:{Origin:'https://shop.test',Cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; '),...identity,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),env);for(const cookie of response.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');cookies[key]=value;}const content=response.headers.get('Content-Type');return {status:response.status,data:content?.includes('application/json')?await response.json():await response.text()};}};
}
test('checkout commits one private test confirmation with authoritative totals, including retries',async()=>{
 const h=harness(),p=catalog.find(p=>!p.variable);await h.call('/api/verification',{age:true,researcher:true});await h.call('/api/cart',{action:'add',id:p.id,quantity:2});
 const b={key:crypto.randomUUID(),email:'customer@example.test',shipping:{name:'Test',address:'1 Test St',city:'Boston',postal:'02101',country:'US'},age:true,researcher:true,total:1};
 const order=await h.call('/api/checkout',b);assert.equal(order.status,201);assert.equal(h.sent.length,1);assert.match(h.sent[0].body.subject,/TEST/);assert.match(h.sent[0].body.text,/No payment was collected/);
 assert.ok(h.sent[0].body.text.includes('/order-tracking/?id='+order.data.id+'&token='+order.data.token));assert.ok(h.sent[0].body.text.includes((p.price*2/100).toFixed(2)));
 assert.equal((await h.call('/api/checkout',b)).data.id,order.data.id);assert.equal(h.sent.length,1);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);
 assert.equal((await h.call('/api/admin/email')).status,403);const status=(await h.call('/api/admin/email',undefined,admin)).data;assert.equal(status.messages[0].status,'accepted');assert.equal(status.messages[0].payload,undefined);
});
test('contact notifications escape content and use the customer only as reply-to',async()=>{
 const h=harness();const saved=await h.call('/api/submissions',{kind:'contact',email:'lab@example.test',message:'<script>bad()</script>'});assert.equal(saved.status,201);
 assert.deepEqual(h.sent[0].body.to,['info@seqlynlabs.com']);assert.equal(h.sent[0].body.reply_to,'lab@example.test');assert.ok(h.sent[0].body.html.includes('&lt;script&gt;'));assert.ok(!h.sent[0].body.html.includes('<script>'));
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM newsletter_subscribers').get().n,0);
 assert.equal((await h.call('/api/submissions',{kind:'contact',email:'a@example.test\r\nBcc:x@example.test',message:'x'})).status,400);
});
test('provider failures retain submissions and retry with the same idempotency key',async()=>{
 const h=harness();h.env.EMAIL_FETCH=async()=>new Response('unavailable',{status:503});
 assert.equal((await h.call('/api/submissions',{kind:'wholesale',email:'lab@example.test',message:'Test request'})).status,201);
 const row=h.sqlite.prepare('SELECT * FROM email_outbox').get();assert.equal(row.status,'queued');assert.equal(row.attempts,1);assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
 h.sqlite.prepare('UPDATE email_outbox SET next_attempt=0').run();const sent=[];await dispatchEmails(h.env,{fetcher:async(_,o)=>{sent.push(o);return Response.json({id:'retried'});},pause:async()=>{}});
 assert.equal(sent[0].headers['Idempotency-Key'],row.id);assert.equal(h.sqlite.prepare('SELECT status FROM email_outbox').get().status,'accepted');
});
test('confirmation requires a live POST; signup is throttled and campaigns exclude unconfirmed or unsubscribed users',async()=>{
 const h=harness(),signup={kind:'newsletter',email:'newsletter@example.test',message:''};await h.call('/api/submissions',signup);await h.call('/api/submissions',signup);assert.equal(h.sent.length,1);
 const token=h.sqlite.prepare('SELECT token FROM newsletter_subscribers').get().token,path='/api/newsletter/confirm?token='+token;
 assert.equal((await h.call(path)).status,200);assert.equal(h.sqlite.prepare('SELECT status FROM newsletter_subscribers').get().status,'pending');
 const noSubscribers=await queueCampaign(h.env.DB,h.env,{id:crypto.randomUUID(),subject:'Test',message:'No recipients'});assert.equal(noSubscribers.queued,0);
 await h.call(path,{});assert.equal(h.sqlite.prepare('SELECT status FROM newsletter_subscribers').get().status,'subscribed');
 const b={id:crypto.randomUUID(),subject:'Updates',message:'A research newsletter'};assert.equal((await queueCampaign(h.env.DB,h.env,b)).queued,1);assert.equal((await queueCampaign(h.env.DB,h.env,b)).repeated,true);
 const unsub='/api/newsletter/unsubscribe?token='+token;await h.call(unsub);assert.equal(h.sqlite.prepare('SELECT status FROM newsletter_subscribers').get().status,'subscribed');
 await h.call(unsub,{});await dispatchEmails(h.env,{pause:async()=>{}});assert.equal(h.sent.length,1);assert.equal(h.sqlite.prepare("SELECT status FROM email_outbox WHERE kind='newsletter'").get().status,'suppressed');
});
test('newsletter messages include the footer and one-click unsubscribe; admin campaign writes are protected',async()=>{
 const h=harness();await newsletterSignup(h.env.DB,h.env,'subscriber@example.test');const token=h.sqlite.prepare('SELECT token FROM newsletter_subscribers').get().token;await h.call('/api/newsletter/confirm?token='+token,{});
 const b={id:crypto.randomUUID(),subject:'Research updates',message:'Plain text <content>'};assert.equal((await h.call('/api/admin/newsletters',b)).status,403);assert.equal((await h.call('/api/admin/newsletters',b,admin)).status,201);
 const sent=h.sent.find(s=>s.body.subject===b.subject);assert.ok(sent.body.text.includes(h.env.NEWSLETTER_POSTAL_ADDRESS));assert.match(sent.body.headers['List-Unsubscribe'],/unsubscribe\?token=/);assert.equal(sent.body.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.ok(sent.body.html.includes('&lt;content&gt;'));
 delete h.env.NEWSLETTER_POSTAL_ADDRESS;assert.equal((await h.call('/api/admin/newsletters',{...b,id:crypto.randomUUID()},admin)).status,409);
 assert.equal((await h.call('/api/email/dispatch')).status,404);
});
test('expired confirmations, provider errors and expired retry windows fail safely',async()=>{
 const h=harness();await newsletterSignup(h.env.DB,h.env,'expired@example.test');h.sqlite.prepare('UPDATE newsletter_subscribers SET requested_at=?').run(Date.now()-173000000);const token=h.sqlite.prepare('SELECT token FROM newsletter_subscribers').get().token;await h.call('/api/newsletter/confirm?token='+token,{});assert.equal(h.sqlite.prepare('SELECT status FROM newsletter_subscribers').get().status,'pending');
 await queueEmail(h.env.DB,'failed','contact','info@seqlynlabs.com',{subject:'Test',text:'Test'}).run();await dispatchEmails(h.env,{fetcher:async()=>Response.json({error:'rejected'},{status:403}),pause:async()=>{}});assert.equal(h.sqlite.prepare("SELECT status FROM email_outbox WHERE id='failed'").get().status,'failed');
 await queueEmail(h.env.DB,'expired','contact','info@seqlynlabs.com',{subject:'Test',text:'Test'}).run();h.sqlite.prepare("UPDATE email_outbox SET first_attempt=? WHERE id='expired'").run(Date.now()-24*3600000);let sent=false;await dispatchEmails(h.env,{fetcher:async()=>{sent=true;return Response.json({id:'no'});},pause:async()=>{}});assert.equal(sent,false);assert.equal(h.sqlite.prepare("SELECT status FROM email_outbox WHERE id='expired'").get().status,'failed');
});
test('concurrent dispatchers claim each queued message once',async()=>{
 const h=harness();await queueEmail(h.env.DB,'concurrent','contact','info@seqlynlabs.com',{subject:'Test',text:'Test'}).run();await Promise.all([dispatchEmails(h.env),dispatchEmails(h.env)]);assert.equal(h.sent.length,1);
});
test('Postgres email migration is private, repeatable and supports transactional queue and subscription writes',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for(const name of fs.readdirSync('supabase/migrations').sort())await pg.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/202610190001_email.sql','utf8'));
 const client={unsafe:async(sql,args=[])=>(await pg.query(sql,args)).rows,begin:async(_,operation)=>pg.transaction(async tx=>operation({unsafe:async(sql,args=[])=>(await tx.query(sql,args)).rows}))};
 const DB=postgresAdapter(client),env={...harness().env,DB};await newsletterSignup(DB,env,'pg@example.test');await DB.prepare("UPDATE newsletter_subscribers SET status='subscribed' WHERE email=?").bind('pg@example.test').run();
 assert.equal((await queueCampaign(DB,env,{id:crypto.randomUUID(),subject:'PG',message:'Postgres test'})).queued,1);
 assert.equal((await dispatchEmails(env,{pause:async()=>{}})).accepted,1);
 assert.equal((await pg.query("SELECT has_table_privilege('anon','seqlyn.email_outbox','SELECT') access")).rows[0].access,false);
 assert.equal((await pg.query("SELECT has_table_privilege('authenticated','seqlyn.newsletter_subscribers','SELECT') access")).rows[0].access,false);
});
