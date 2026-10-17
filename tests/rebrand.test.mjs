import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {rebrandHtml} from '../scripts/rebrand-shop.mjs';
import {brand,rebrandText} from '../src/brand.js';
import manifest from '../src/brand-assets.json' with {type:'json'};
import catalog from '../src/catalog.js';

async function pages(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())out.push(...await pages(f));else if(f.endsWith('.html'))out.push(f);}return out;}
test('all pages use Seqlyn branding, local contact links, and no old canonical origin',async()=>{
 const files=await pages('dist/client');assert.equal(files.length,112);
 for(const f of files){const $=load(await fs.readFile(f,'utf8'));$('script,style').remove();
  assert.doesNotMatch($.text(),/\bPH\s*BIO\s*LABS\b|@phbiolabs\.com|789.?8729|Gould\s*St|Sheridan,?\s*WY/i,f);
  assert.equal($('link[rel="canonical"],meta[property="og:url"]').length,0,f);
  assert.equal($('link[rel="icon"]').attr('href'),brand.icon,f);
  for(const el of $('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"]').toArray())assert.doesNotMatch($(el).attr('content')||'',/phbiolabs(?:shop)?\.com/i,f+' sharing image');
  $('.phbio-watermark').each((_,el)=>assert.equal($(el).text(),'SEQLYN',f));
  for(const el of $('a[href]').toArray())assert.doesNotMatch($(el).attr('href'),/^(?:mailto:.*phbiolabs|tel:.*8887898729|https?:\/\/(?:www\.)?phbiolabs(?:shop)?\.com)/i,f);
  for(const el of $('img').toArray())for(const k of ['src','srcset','data-src','data-full-src','data-default-src']){const v=$(el).attr(k);if(v){assert.doesNotMatch(v,/phbiolabs\.com/i,f+' '+k);assert.equal(Object.keys(manifest).some(old=>v.includes(old)),false,f+' '+k);}}
 }
});
test('rebranding is idempotent and preserves layout wrappers and internal selectors',()=>{
 assert.equal(rebrandText('PHBIO Labs / PH BIO LABS'),'Seqlyn Labs / Seqlyn Labs');
 assert.equal(rebrandText('Thank you for choosing PHBIO Labs.'),'Thank you for choosing Seqlyn Labs.');
 assert.equal(rebrandText('https://phbiolabs.com/source.pdf'),'https://phbiolabs.com/source.pdf');
 const html='<html><head><title>PH Bio Labs</title></head><body><div class="phbio-card" style="padding:12px"><a href="mailto:info@phbiolabs.com">info@phbiolabs.com</a><span>PH BIO LABS</span></div></body></html>';
 const once=rebrandHtml(html);assert.equal(rebrandHtml(once),once);
 const $=load(once);assert.equal($('.phbio-card').attr('style'),'padding:12px');assert.equal($('a').attr('href'),'/contact/');assert.equal($('span').text(),'Seqlyn Labs');
});
test('every original certificate and preview remains byte-for-byte unchanged',async()=>{
 const baseline=JSON.parse(await fs.readFile('reports/rebrand/certificate-hashes.json','utf8'));
 assert.equal(baseline.filter(x=>x.file.endsWith('.pdf')).length,38);
 for(const row of baseline)assert.equal(createHash('sha256').update(await fs.readFile('dist/client/certificates/'+row.file)).digest('hex'),row.sha256,row.file);
});
test('all catalog and variant photographs use local Seqlyn replacements',async()=>{
 for(const p of catalog)for(const row of [p,...p.variants||[]]){assert.match(row.image,/^\/assets\/seqlyn\//,row.id);assert.ok((await fs.stat('dist/client'+row.image)).size>1000,row.id);}
 for(const path of new Set(Object.values(manifest)))assert.ok((await fs.stat('dist/client'+path)).size>0,path);
});
