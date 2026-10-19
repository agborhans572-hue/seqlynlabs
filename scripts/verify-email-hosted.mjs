// Sends three clearly labeled setup-test emails to the owner only. No payment/shipment.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://www.seqlynlabs.com',email=process.env.EMAIL_TEST_RECIPIENT;
if(email!=='info@seqlynlabs.com')throw Error('Set EMAIL_TEST_RECIPIENT to the owner mailbox info@seqlynlabs.com before running.');
const cookies=new Map(),checks=[];
async function call(path,data){
 const response=await fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:data?JSON.stringify(data):undefined});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 const result=await response.json();checks.push({path:path.split('?')[0],status:response.status});assert.ok(response.ok,JSON.stringify({path,status:response.status,error:result.error}));return result;
}
assert.equal((await call('/health')).mode,'test');
await call('/api/verification',{age:true,researcher:true});
const products=(await call('/api/products')).products;
const product=products.find(p=>!p.variable&&(p.stock===null||p.stock===undefined||p.stock>0));assert.ok(product);
await call('/api/cart',{action:'add',id:product.id,quantity:1});
const checkout={key:crypto.randomUUID(),email,age:true,researcher:true,shipping:{name:'Seqlyn Email Setup Test',address:'1 Test Street',city:'Boston',state:'MA',postal:'02101',country:'US'}};
const order=await call('/api/checkout',checkout);assert.equal(order.status,'test');assert.equal((await call('/api/checkout',checkout)).id,order.id);
const receipt=await call('/api/orders/'+order.id+'?token='+order.token);assert.equal(receipt.total,order.total);
await call('/api/orders/'+order.id+'/cancel?token='+order.token,{});
await call('/api/submissions',{kind:'contact',email,message:'EMAIL SETUP TEST — owner-requested delivery verification for Seqlyn Labs. This is a synthetic contact request; no reply or shipment is needed.'});
await call('/api/submissions',{kind:'newsletter',email,message:''});
const report={date:new Date().toISOString(),origin,recipient:email,testOrderId:order.id,testOrderCancelled:true,checkoutRetryReturnedSameOrder:true,checks,newsletter:'Confirmation requested only; no subscription or campaign was activated by this script.',delivery:'Verify final delivery in the connected Resend dashboard; API responses alone do not prove inbox delivery.'};
await fs.mkdir('reports/setup',{recursive:true});await fs.writeFile('reports/setup/email-hosted-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({testOrderId:order.id,cancelled:true,checks:checks.length,message:'Requested order, contact and newsletter-confirmation test emails. Check Resend for delivery.'}));
