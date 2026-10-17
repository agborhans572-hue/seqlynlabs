import fs from 'node:fs/promises';
import {load} from 'cheerio';
import catalog from '../src/catalog.js';
import library from '../src/certificates.json' with {type:'json'};

const audit=JSON.parse(await fs.readFile('reports/certificate-product-audit.json','utf8'));
for(const p of catalog){
 const file='dist/client'+p.path+'index.html';
 const $=load(await fs.readFile(file,'utf8'));
 const records=audit.certificates.filter(c=>c.productId===p.id);
 $('body').attr('data-clone-certificates',JSON.stringify(records.map(c=>({url:c.localPdf,strength:c.strength,variants:c.variantIds,available:c.classification==='exact'}))));
 $('.phbio-coa-view').each((_,el)=>{
  const view=$(el),link=view.find('.phbio-coa-thumb');
  const record=records.find(c=>c.localPdf===link.attr('href'));
  if(!record)throw Error('Unverified certificate on '+p.id+': '+link.attr('href'));
  view.attr('data-certificate-url',record.localPdf);
  link.empty().append($('<img>').attr({src:record.preview,alt:p.name+' — '+record.strength+' certificate',loading:'lazy',class:'clone-certificate-preview'}));
  view.find('.phbio-coa-side').prepend($('<span>').addClass('clone-certificate-label').text(record.strength+(record.classification==='exact'?'':' · not currently offered')));
 });
 if(records.length)$('.phbio-coa-list').prepend('<p class="clone-coa-status" role="status"></p><button type="button" class="clone-show-all-coas">Show all product certificates</button>');
 await fs.writeFile(file,$.html());
}

// Keep category and home thumbnails consistent with their destination product.
async function thumbnails(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const file=dir+'/'+e.name;if(e.isDirectory())await thumbnails(file);else if(e.name.endsWith('.html')){
  let html=await fs.readFile(file,'utf8');
  html=html.replace(/<div class="phbio-card">[\s\S]*?(?=<div class="phbio-card">|<div class="phbio-sentinel"|$)/g,block=>{
   const route=block.match(/<h3>[\s\S]*?<a href="([^"]+)"/)?.[1],p=catalog.find(p=>p.path===route);
   return p?block.replace(/(<img\s[^>]*?src=")[^"]+"/,(_,prefix)=>prefix+p.image+'"'):block;
  });
  await fs.writeFile(file,html);
 }
}}
await thumbnails('dist/client');

const file='dist/client/coa-library/index.html',$=load(await fs.readFile(file,'utf8'));
$('.coa-card').each((i,el)=>{
 const entry=library[i],card=$(el);
 const records=entry.certificates.map(url=>audit.certificates.find(c=>c.filename===url.split('/').pop()));
 if(records.some(c=>!c))throw Error('Unmapped library certificate');
 const ordered=entry.title.includes('60 mg')?[records.find(c=>c.strength==='60mg'),...records.filter(c=>c.strength!=='60mg')]:records;
 card.attr('data-fulls',JSON.stringify(ordered.map(c=>c.localPdf)));
 card.find('.coa-pdf-preview').attr('src',ordered[0].preview);
 card.find('.coa-certificate-sizes').remove();
 card.append($('<div>').addClass('coa-certificate-sizes').append(ordered.map(c=>$('<a>').attr({href:c.localPdf,target:'_blank',rel:'noopener'}).text(c.strength+(c.classification==='exact'?'':' (not offered)')))));
});
await fs.writeFile(file,$.html());
console.log('Matched all product and certificate previews to their exact product and strength.');
