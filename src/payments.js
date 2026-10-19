export const paymentLabels={crypto:'Crypto',apple_pay:'Apple Pay',paypal:'PayPal'};
export async function paymentSettings(db){
 const row=await db.prepare("SELECT data FROM store_settings WHERE id='payments'").first();
 return row?JSON.parse(row.data):{enabled:false,methods:[]};
}
export function validatePaymentSettings(value){
 if(!value||typeof value.enabled!=='boolean'||!Array.isArray(value.methods)||value.methods.length>3)throw Error('Invalid payment settings');
 const seen=new Set();
 const methods=value.methods.map(method=>{
  if(!Object.hasOwn(paymentLabels,method.id)||seen.has(method.id)||typeof method.enabled!=='boolean'||typeof method.instructions!=='string'||method.instructions.length>4000)throw Error('Invalid payment method');
  seen.add(method.id);
  const instructions=method.instructions.trim();
  return {id:method.id,label:paymentLabels[method.id],enabled:method.enabled,instructions};
 });
 if(value.enabled&&!methods.some(m=>m.enabled))throw Error('Enable at least one configured payment method');
 return {enabled:value.enabled,methods};
}
export const paymentMode=(env,settings)=>settings.enabled?'manual':env.COMMERCE_MODE==='test'?'test':'disabled';
export async function orderPayment(db,row){
 if(row.status==='test')return null;
 const event=await db.prepare("SELECT data FROM order_events WHERE order_id=? AND action='created' ORDER BY created_at,id LIMIT 1").bind(row.id).first();
 return event?JSON.parse(event.data).payment||null:null;
}
