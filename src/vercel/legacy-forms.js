// Connect imported information-page forms to the same store inbox as /contact/.
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('form.elementor-form'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!form.reportValidity() || form.dataset.submitting==='1')return;
  let status=form.querySelector('[data-store-status]');
  if(!status){status=document.createElement('p');status.dataset.storeStatus='';status.setAttribute('role','status');form.append(status);}
  const fields=new FormData(form),email=fields.get('form_fields[email]');
  if(!email){status.textContent='Please use the contact page to send your request.';return;}
  const message=[fields.get('form_fields[name]')?'Name: '+fields.get('form_fields[name]'):'',fields.get('form_fields[field_1c33487]')?'Phone: '+fields.get('form_fields[field_1c33487]'):'',fields.get('form_fields[message]')||''].filter(Boolean).join('\n');
  const button=form.querySelector('[type=submit]');
  form.dataset.submitting='1';if(button)button.disabled=true;status.textContent='Saving your request…';
  fetch('/api/submissions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'contact',email,message}),signal:AbortSignal.timeout(15000)})
    .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Please try again.');status.textContent=data.message;form.reset();})
    .catch(error=>{status.textContent=error.name==='TimeoutError'?'The request timed out. Please try again.':error.message;})
    .finally(()=>{form.dataset.submitting='0';if(button)button.disabled=false;});
},true);
