import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import certificates from '../src/certificates.json' with {type:'json'};
import catalog from '../src/catalog.js';

test('every COA card has a local preview and every batch has its original PDF',async()=>{
  const html=await fs.readFile('dist/client/coa-library/index.html','utf8');
  const previews=[...html.matchAll(/class="coa-pdf-preview"\s+src="([^"]+)"/g)].map(m=>m[1]);
  const groups=[...html.matchAll(/data-fulls="([^"]+)"/g)].map(m=>JSON.parse(m[1].replaceAll('&quot;','"')));
  assert.equal(previews.length,certificates.length);
  assert.deepEqual(groups.map(g=>[...g].sort()),certificates.map(c=>c.certificates.map(u=>'/certificates/'+path.basename(new URL(u).pathname)).sort()));
  assert.deepEqual(previews,groups.map(g=>g[0].replace(/\.pdf$/,'.jpg')));
  const rt=certificates.findIndex(c=>c.title.includes('60 mg'));
  assert.equal(groups[rt][0],'/certificates/COA5679-6_24_26.pdf');
  for(const url of [...previews,...groups.flat()]){
    assert.ok(url.startsWith('/certificates/'));
    const bytes=await fs.readFile('dist/client'+url);
    assert.ok(bytes.length>1000,url);
    if(url.endsWith('.pdf'))assert.equal(bytes.subarray(0,5).toString(),'%PDF-',url);
    else assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8',url);
  }
  assert.match(html,/\.coa-pdf-preview\{[^}]*object-fit:contain/);
});

test('certificate strengths belong to their exact product and never substitute for an unavailable size',async()=>{
  const audit=JSON.parse(await fs.readFile('reports/certificate-product-audit.json','utf8'));
  assert.equal(audit.certificates.length,38);
  for(const c of audit.certificates){
    const p=catalog.find(p=>p.id===c.productId);
    assert.ok(p,c.filename);
    assert.ok(p.certificates.includes(c.sourceUrl),c.filename+' source association');
    for(const id of c.variantIds)assert.ok(p.variants.some(v=>v.id===id),c.filename+' variant association');
    if(c.classification==='exact'&&p.variable)assert.ok(c.variantIds.length,c.filename+' exact strength');
    assert.equal((await fs.readFile('dist/client'+c.preview)).subarray(0,2).toString('hex'),'ffd8');
  }
  for(const missing of audit.unavailableVariants){
    assert.ok(!audit.certificates.some(c=>c.variantIds.includes(missing.variantId)),missing.variantId+' must not reuse another strength');
  }
});
