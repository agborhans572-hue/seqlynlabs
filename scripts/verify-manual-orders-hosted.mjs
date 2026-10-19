// Creates and cancels one clearly labeled owner-only setup order. No payment.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://www.seqlynlabs.com',email=process.env.EMAIL_TEST_RECIPIENT;
if(email!=='info@seqlynlabs.com')throw Error('Set EMAIL_TEST_RECIPIENT to the owner mailbox before running');
const cookies=new Map(),checks=[];
async function call(path,data){
 const response=await fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:data?JSON.stringify(data):undefined});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 const result=await response.json();checks.push({path:path.split('?')[0],status:response.status});assert.ok(response.ok,JSON.stringify({status:response.status,error:result.error}));return result;
}
assert.equal((await call('/health')).mode,'manual');
const config=await call('/api/store');assert.equal(config.mode,'manual');assert.deepEqual(config.paymentMethods.map(m=>m.id).sort(),['apple_pay','crypto','paypal']);
await call('/api/verification',{age:true,researcher:true});
const product=(await call('/api/products')).products.find(p=>!p.variable&&(p.stock===null||p.stock===undefined||p.stock>0));assert.ok(product);
await call('/api/cart',{action:'add',id:product.id,quantity:1});
const data={key:crypto.randomUUID(),email,paymentMethod:'paypal',age:true,researcher:true,shipping:{name:'SETUP CHECK - CANCELLED - DO NOT FULFILL',address:'1 Synthetic Test Street',city:'Boston',state:'MA',postal:'02101',country:'US'}};
const order=await call('/api/checkout',data);assert.equal(order.status,'awaiting_payment');assert.equal(order.mode,'manual');assert.equal(order.payment.id,'paypal');
try{
 assert.equal((await call('/api/checkout',data)).id,order.id);
 const receipt=await call('/api/orders/'+order.id+'?token='+order.token);assert.equal(receipt.total,order.total);assert.equal(receipt.payment.id,'paypal');
 assert.equal((await call('/api/cart')).items.length,0);
}finally{await call('/api/orders/'+order.id+'/cancel?token='+order.token,{});}
const report={date:new Date().toISOString(),origin,recipient:email,orderId:order.id,status:order.status,paymentMethod:'paypal',emailStatus:order.emailStatus,cancelled:true,noPaymentCollected:true,methods:config.paymentMethods,checks,delivery:'Provider acceptance is not proof of inbox delivery; verify customer and admin messages in Resend.'};
await fs.mkdir('reports/setup',{recursive:true});await fs.writeFile('reports/setup/manual-orders-hosted.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({orderId:order.id,cancelled:true,emailStatus:order.emailStatus,checks:checks.length}));
