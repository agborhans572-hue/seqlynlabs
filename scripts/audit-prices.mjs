import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import catalog from '../src/catalog.js';
import {parsePricePage,decodeHtml} from './price-parser.mjs';
const report={source:'https://phbiolabs.com',currency:'USD',startedAt:new Date().toISOString(),products:[],errors:[]};
let cursor=0;
async function inspect(){while(cursor<catalog.length){const product=catalog[cursor++],url=report.source+product.path;try{
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if(!response.ok||new URL(response.url).hostname!=='phbiolabs.com')throw Error('Public page returned '+response.status);
  const html=await response.text(),source=parsePricePage(html,product.variable),changes=[];
  if(product.price!==source.price)changes.push({id:product.id,previous:product.price,price:source.price});
  for(const variant of product.variants||[]){const fresh=source.variants.find(v=>v.sourceId===variant.sourceId);if(!fresh)throw Error('Size could not be confirmed: '+variant.label);if(variant.price!==fresh.price)changes.push({id:variant.id,label:variant.label,previous:variant.price,price:fresh.price});}
  const newSizes=source.variants.filter(v=>!product.variants?.some(old=>old.sourceId===v.sourceId));
  if(newSizes.length)throw Error('New public sizes need catalog review: '+newSizes.map(v=>v.sourceId).join(', '));
  const text=value=>decodeHtml(value.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
  const publicName=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  const publicDescription=text(html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i)?.[1]||'');
  const contentDifferences=[];
  if(publicName!==text(product.name))contentDifferences.push('Product name');
  if(publicDescription!==text(product.description||''))contentDifferences.push('Short description');
  for(const v of product.variants||[]){const fresh=source.variants.find(row=>row.sourceId===v.sourceId);if(Object.keys({...v.attributes,...fresh.attributes}).some(k=>v.attributes[k]!==fresh.attributes[k]))contentDifferences.push('Size attributes: '+v.label);}
  report.products.push({id:product.id,name:product.name,publicName,publicDescription,contentDifferences,url:response.url,checkedAt:new Date().toISOString(),htmlSha256:createHash('sha256').update(html).digest('hex'),price:source.price,variants:source.variants,changes});
}catch(error){report.errors.push({id:product.id,url,error:error.message});}}}
await Promise.all(Array.from({length:4},inspect));
report.products.sort((a,b)=>a.id.localeCompare(b.id));report.completedAt=new Date().toISOString();
report.summary={products:report.products.length,variants:report.products.reduce((n,p)=>n+p.variants.length,0),changedPrices:report.products.reduce((n,p)=>n+p.changes.length,0),contentDifferences:report.products.filter(p=>p.contentDifferences.length).length,unconfirmed:report.errors.length};
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/price-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,changes:report.products.flatMap(p=>p.changes),errors:report.errors}));
if(report.errors.length)process.exitCode=1;
