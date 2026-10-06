import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import worker from '../src/worker.js';
const source = fs.readFileSync('src/verification.js', 'utf8');
function fixture(fetch) {
  const checks = [{checked:false,focus(){}},{checked:false,focus(){}}];
  const button = {disabled:true,textContent:'Enter PH Bio Labs →',addEventListener(_,fn){this.click=fn;}};
  const overlay = {style:{display:'flex'}};
  let message;
  const form = {querySelector:()=>button,querySelectorAll:()=>checks,append:p=>message=p,addEventListener(){}};
  const doc = {cookie:'',querySelector:s=>s==='.rgate-form'?form:overlay,createElement:()=>({setAttribute(){},style:{}}),documentElement:{classList:{add(){}}},body:{style:{overflow:'hidden'}}};
  vm.runInNewContext(source,{document:doc,fetch,location:{protocol:'https:'},AbortSignal});
  return {checks,button,overlay,doc,get message(){return message;},click:()=>button.click({preventDefault(){},stopImmediatePropagation(){}})};
}
test('Enter is clickable, requires both boxes, then saves and closes the popup',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return {ok:true,json:async()=>({accepted:true})};});
  assert.equal(f.button.disabled,false);
  await f.click();assert.equal(calls,0);assert.match(f.message.textContent,/both confirmations/);
  f.checks[0].checked=true;await f.click();assert.equal(calls,0);
  f.checks[1].checked=true;await f.click();assert.equal(calls,1);
  assert.equal(f.overlay.style.display,'none');assert.match(f.doc.cookie,/rgate_ack=1/);
});
test('failed confirmation stays visible and can be retried',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;if(calls===1)throw Error('Connection failed');return {ok:true,json:async()=>({accepted:true})};});
  f.checks.forEach(c=>c.checked=true);await f.click();
  assert.equal(f.overlay.style.display,'flex');assert.equal(f.button.disabled,false);assert.equal(f.message.textContent,'Connection failed');
  await f.click();assert.equal(f.overlay.style.display,'none');
});
test('verification works without the commerce database and still rejects incomplete or cross-origin confirmations',async()=>{
  const send=(data,origin='https://shop.test')=>worker.fetch(new Request('https://shop.test/api/verification',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)}),{});
  assert.equal((await send({age:true,researcher:true})).status,200);
  assert.equal((await send({age:true,researcher:false})).status,400);
  assert.equal((await send({age:true,researcher:true},'https://other.test')).status,403);
});
