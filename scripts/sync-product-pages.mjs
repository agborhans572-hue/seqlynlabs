import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import catalog from '../src/catalog.js';
import {parsePricePage} from './price-parser.mjs';

const origin='https://phbiolabs.com';
const cache='.sites-runtime/source-products';
await fs.mkdir(cache,{recursive:true});
await fs.mkdir('src/product-pages',{recursive:true});
const report={source:origin,checkedAt:new Date().toISOString(),products:[],errors:[],assetErrors:[]};
const resources=new Map();
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,20);
async function asset(raw,base=origin){
  if(!raw||/^(?:data:|#|about:)/.test(raw))return raw;
  const url=new URL(raw,base).href;
  if(!resources.has(url))resources.set(url,(async()=>{
    const extension=path.extname(new URL(url).pathname)||'.css';
    const local='/assets/source-'+hash(url)+extension;
    const target='dist/client'+local;
    try{if((await fs.stat(target)).size>0)return local;}catch{}
    const response=await fetch(url,{signal:AbortSignal.timeout(40000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    let bytes=Buffer.from(await response.arrayBuffer());
    if(extension==='.css'||response.headers.get('content-type')?.includes('text/css')){
      bytes=Buffer.from(await cssUrls(bytes.toString(),url));
    }
    await fs.writeFile(target,bytes);
    return local;
  })().catch(error=>{report.assetErrors.push({url,error:error.message});return url;}));
  return resources.get(url);
}
async function cssUrls(css,base){
  const matches=[...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)];
  const replacements=await Promise.all(matches.map(async m=>[m[0],`url("${await asset(m[2],base)}")`]));
  for(const [before,after] of replacements)css=css.replaceAll(before,after);
  return css;
}
const home=await fs.readFile('dist/client/index.html','utf8');
const gate=home.match(/<div class="rgate-overlay">[\s\S]*?<div class="rgate-welcome"/)[0].replace(/<div class="rgate-welcome"$/,'');
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<catalog.length){
    const p=catalog[cursor++];
    try{
      let html;
      if(process.argv.includes('--cached'))html=await fs.readFile(`${cache}/${p.id}.html`,'utf8');
      else{
        const response=await fetch(origin+p.path,{signal:AbortSignal.timeout(40000)});
        if(!response.ok||new URL(response.url).pathname!==p.path)throw Error('Unexpected product response: '+response.status+' '+response.url);
        html=await response.text();
        await fs.writeFile(`${cache}/${p.id}.html`,html);
      }
      const $=load(html);
      const name=$('h1.product_title').text().trim();
      const sourcePrice=parsePricePage(html,p.variable);
      const gallery=$('.wc-gallery-main-img').first();
      const image=gallery.attr('data-full-src')||gallery.attr('src');
      if(!name||!image||!$('[data-elementor-type="product"]').length)throw Error('Missing product identity or layout');
      const sourceVariants=JSON.parse($('form.cart').first().attr('data-product_variations')||'[]');
      const previous={name:p.name,image:p.image,description:p.description,price:p.price};
      p.name=name;
      p.description=($('.short-desc-readmore-wrap p').first().text()||$('meta[name="description"]').attr('content')||'').replace(/\s+/g,' ').trim();
      if(!p.description)throw Error('Missing short description');
      p.price=sourcePrice.price;
      p.sourceId=$('form.cart').first().attr('data-product_id')||$('button[name="add-to-cart"]').attr('value')||p.sourceId;
      p.image=await asset(image);
      p.sourceImage=image;
      if(p.variable){
        p.variants=sourceVariants.filter(v=>v.variation_is_visible!==false).map(v=>({id:p.id+'--'+v.variation_id,sourceId:String(v.variation_id),label:Object.values(v.attributes).filter(Boolean).join(' / '),attributes:v.attributes,price:Math.round(v.display_price*100),regularPrice:Math.round(v.display_regular_price*100),sourceImage:v.image?.full_src||v.image?.url||image,stock:v.is_in_stock?null:0,active:v.variation_is_active&&v.is_purchasable&&v.is_in_stock?1:0}));
        for(const v of p.variants)v.image=await asset(v.sourceImage);
      }
      p.certificates=[...new Set($('.phbio-overview-tabs a[href]').map((_,el)=>$(el).attr('href')).get().filter(u=>/\.pdf(?:[?#]|$)/i.test(u)))];
      const overview=$('.phbio-tab-panel[data-panel="0"]').first().text().replace(/\s+/g,' ').trim();
      if(!overview)throw Error('Missing product overview');
      const entry={id:p.id,path:p.path,name,sourceId:p.sourceId,sourceImage:image,description:p.description,price:p.price,variants:(p.variants||[]).map(v=>({id:v.id,label:v.label,price:v.price,sourceImage:v.sourceImage})),certificates:p.certificates,overview,previous,sha256:hash(html)};

      // Retain the original page's markup and styling, with local commerce only.
      $('script,noscript,iframe,template,link[rel="preload"],link[rel="preconnect"],link[rel="dns-prefetch"],link[rel="alternate"],meta[http-equiv="refresh"]').remove();
      $('.rgate-overlay,.rgate-welcome,#cookie-notice,#fb-pixel,#fkcart-modal,.fkcart-modal').remove();
      $('*').each((_,el)=>{for(const key of Object.keys(el.attribs||{}))if(/^on/i.test(key))$(el).removeAttr(key);});
      $('[srcset],[data-thumb-srcset]').removeAttr('srcset').removeAttr('data-thumb-srcset');
      $('body').attr('data-clone-product',p.id);
      $('form.cart').attr('action',p.path).removeAttr('data-product_variations');
      // The source badge has no document behind it for several products.
      // Keep only actual per-product certificate links, never a guessed COA.
      $('.wc-gallery-main-img').first().attr('src',p.image).attr('data-full-src',p.image).attr('data-default-src',p.image).attr('alt',p.name);
      await Promise.all($('img[src],link[rel="stylesheet"][href],link[rel="icon"][href]').toArray().map(async el=>{
        const key=el.tagName==='img'?'src':'href',raw=$(el).attr(key);
        if(/facebook|pinterest|tiktok|doubleclick|googleadservices/i.test(raw)){$(el).remove();return;}
        if(raw.startsWith('/assets/'))return;
        $(el).attr(key,await asset(raw,origin+p.path));
      }));
      await Promise.all($('style').toArray().map(async el=>$(el).text(await cssUrls($(el).text(),origin+p.path))));
      await Promise.all($('[style]').toArray().map(async el=>$(el).attr('style',await cssUrls($(el).attr('style'),origin+p.path))));
      await Promise.all($('a[href]').toArray().map(async el=>{
        const raw=$(el).attr('href');
        if(!raw||raw.startsWith('#')||/^(?:tel:|mailto:)/.test(raw))return;
        const url=new URL(raw,origin+p.path);
        if(/\.pdf$/i.test(url.pathname)){
          // Use the exact original PDF linked on this product.
          const local='/certificates/'+path.basename(url.pathname);
          try{await fs.access('dist/client'+local);$(el).attr('href',local);}catch{$(el).attr('href',await asset(url.href));}
        }else if(url.hostname==='phbiolabs.com'){
          $(el).attr('href',url.pathname+url.hash);
          if(url.searchParams.has('add-to-cart'))$(el).attr('data-clone-add',url.searchParams.get('add-to-cart'));
        }
      }));
      $('[data-product_variations]').removeAttr('data-product_variations');
      $('input[name="_wpnonce"],input[name="_wp_http_referer"]').remove();
      // Native local controllers replace the source's tracking and checkout scripts.
      $('head').append('<link rel="stylesheet" href="/shop.css?v=5"><link rel="stylesheet" href="/product-clone.css?v=1"><script defer src="/shop.js?v=5"></script><script defer src="/verification.js?v=5"></script>');
      $('body').append(gate);
      await fs.writeFile('src/product-pages/'+p.id+'.html',$.html());
      report.products.push(entry);
      console.log('Verified '+report.products.length+'/'+catalog.length+': '+p.id);
    }catch(error){report.errors.push({id:p.id,error:error.message});console.log('FAILED '+p.id+': '+error.message);}
  }
}));
report.products.sort((a,b)=>a.id.localeCompare(b.id));
await fs.writeFile('reports/product-fidelity-audit.json',JSON.stringify(report,null,2)+'\n');
if(report.errors.length||report.assetErrors.length){console.log(JSON.stringify({errors:report.errors,assetErrors:report.assetErrors}));process.exitCode=1;}
else{
  await fs.writeFile('src/catalog.js','export default '+JSON.stringify(catalog,null,2)+';\n');
  console.log(`Verified ${report.products.length} products, ${resources.size} local assets.`);
}
