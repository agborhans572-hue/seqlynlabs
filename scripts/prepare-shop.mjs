import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist'),client=path.join(root,'client');
await fs.mkdir(client,{recursive:true});
for(const e of await fs.readdir(root)){if(['client','server','.openai'].includes(e))continue;await fs.rename(path.join(root,e),path.join(client,e));}
const home=await fs.readFile(path.join(client,'index.html'),'utf8');
const clean=s=>s.replace(/<[^>]+>/g,'').replace(/&#36;/g,'$').replace(/&amp;/g,'&').replace(/&#8211;|&ndash;/g,'–').replace(/&#8217;/g,"'").trim();
const products=[];
for(const m of home.matchAll(/<div class="phbio-card">([\s\S]*?)(?=<div class="phbio-card">|<div class="phbio-sentinel")/g)){
const h=m[1],link=h.match(/<h3>[\s\S]*?<a href="([^"]+)">([\s\S]*?)<\/a>/),price=h.match(/<bdi>[\s\S]*?<\/span>([\d.,]+)/),image=h.match(/<img\s+[\s\S]*?src="([^"]+)"/);
if(!link||!price)continue;
const slug=link[1].split('/').filter(Boolean).pop();
products.push({id:slug,slug,name:clean(link[2]),path:link[1],image:image?.[1]||'',price:Math.round(Number(price[1].replaceAll(',',''))*100),categories:[...h.matchAll(/class="tg" data-cat="([^"]+)"/g)].map(x=>x[1]),variable:/product_type_variable|Price range/.test(h),sourceId:h.match(/data-product_id="(\d+)"/)?.[1]||null});
}
await fs.mkdir('src',{recursive:true});await fs.writeFile('src/catalog.js','export default '+JSON.stringify(products,null,2)+';\n');
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){await walk(p);continue;}if(!p.endsWith('.html'))continue;let h=await fs.readFile(p,'utf8');h=h.replace(/<style id="preview-gate-removal">[\s\S]*?<\/style>/g,'').replace(/<script(?: defer)? src="\/clone-interactions.js"><\/script>/g,'');h=h.replace('</head>','<script defer src="/shop.js"></script><link rel="stylesheet" href="/shop.css"></head>');h=h.replace(/\bhref=(["'])https:\/\/phbiolabs.com([^"']*)\1/g,(m,q,u)=>`href=${q}${u||'/'}${q}`);await fs.writeFile(p,h);}}
await walk(client);
console.log('Prepared standalone catalog:',products.length,'products');
