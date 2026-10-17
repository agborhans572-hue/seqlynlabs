import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {load} from 'cheerio';
import catalog from '../src/catalog.js';
import {rebrandText} from '../src/brand.js';
import imageManifest from '../src/brand-assets.json' with {type:'json'};

test('all 81 product routes retain their own original description, overview, photo and certificates',async()=>{
 const report=JSON.parse(await fs.readFile('reports/product-fidelity-audit.json','utf8'));
 assert.equal(report.errors.length,0);
 assert.equal(report.assetErrors.length,0);
 assert.equal(report.products.length,catalog.length);
 for(const p of catalog){
   const source=report.products.find(x=>x.id===p.id);
   const html=await fs.readFile('dist/client'+p.path+'index.html','utf8');
   const $=load(html);
   assert.equal($('body').attr('data-clone-product'),p.id,p.id);
   assert.equal($('h1.product_title').text().trim(),source.name,p.id);
   assert.equal($('.phbio-tab-panel[data-panel="0"]').first().text().replace(/\s+/g,' ').trim(),rebrandText(source.overview),p.id);
   assert.equal($('.wc-gallery-main-img').first().attr('src'),p.image,p.id);
   assert.equal(p.image,imageManifest[source.sourceImage],p.id+' approved photo replacement');
   for(const v of p.variants||[])assert.equal(v.image,imageManifest[source.variants.find(row=>row.id===v.id).sourceImage],v.id+' approved photo replacement');
   assert.equal(p.description,rebrandText(source.description),p.id);
   assert.equal(p.price,source.price,p.id);
   assert.deepEqual((p.variants||[]).map(v=>[v.id,v.label,v.price]),source.variants.map(v=>[v.id,v.label,v.price]),p.id);
   const pdfs=[...new Set($('.phbio-overview-tabs a[href]').map((_,el)=>$(el).attr('href')).get().filter(u=>/\.pdf(?:[?#]|$)/i.test(u)))];
   assert.deepEqual(pdfs.map(u=>u.split('/').pop()),source.certificates.map(u=>u.split('/').pop()),p.id+' certificate association');
   for(const el of $('img[src]').toArray()){
     const image=$(el).attr('src');
     if(image.startsWith('/assets/'))assert.ok((await fs.stat('dist/client'+image)).size>0,p.id+' '+image);
   }
   for(const image of [p.image,...(p.variants||[]).map(v=>v.image)])assert.ok((await fs.stat('dist/client'+image)).size>1000,image);
   assert.ok($('script[src]').toArray().every(el=>/^\/(?:shop|verification)\.js/.test($(el).attr('src'))),p.id+' unexpected original script');
   assert.equal($('script:not([src])').length,0,p.id+' original inline script');
   assert.ok($('form.cart').first().attr('action').startsWith('/'),p.id+' commerce destination');
 }
});
