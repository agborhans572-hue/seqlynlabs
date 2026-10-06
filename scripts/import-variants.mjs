import fs from 'node:fs/promises';
import catalog from '../src/catalog.js';
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
let total=0,missing=[];
for(const p of catalog){if(!p.variable)continue;try{const h=await fs.readFile('dist/client'+p.path+'index.html','utf8'),m=h.match(/data-product_variations="([\s\S]*?)"/);if(!m)throw Error();const values=JSON.parse(decode(m[1]));p.variants=values.filter(v=>v.variation_is_active&&v.variation_is_visible&&v.is_purchasable&&Number.isFinite(v.display_price)).map(v=>({id:p.id+'--'+v.variation_id,sourceId:String(v.variation_id),label:Object.values(v.attributes).filter(Boolean).join(' / '),attributes:v.attributes,price:Math.round(v.display_price*100),image:p.image,stock:v.is_in_stock?null:0,active:v.is_in_stock?1:0}));total+=p.variants.length;if(!p.variants.length)missing.push(p.id);}catch{missing.push(p.id);}}
await fs.writeFile('src/catalog.js','export default '+JSON.stringify(catalog,null,2)+';\n');console.log(JSON.stringify({variantsImported:total,unconfiguredProducts:missing}));
