import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import catalog from '../src/catalog.js';
import {rebrandText} from '../src/brand.js';

const edits=JSON.parse(await fs.readFile('reports/rebrand/edits.json','utf8'));
const manifest=JSON.parse(await fs.readFile('src/brand-assets.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const byHash=new Map();
for(const edit of edits){
 const target='/assets/seqlyn/product-'+String(edit.index).padStart(3,'0')+'.png';
 await fs.copyFile(edit.generated,'dist/client'+target);
 manifest[edit.source]=target;
 byHash.set(hash(await fs.readFile('dist/client'+edit.source)),target);
 edit.target=target;
}
// Identical legacy copies share one edited asset without editing the originals.
for(const file of await fs.readdir('dist/client/assets')){
 if(!/\.(?:png|jpe?g|webp)$/i.test(file))continue;
 const target=byHash.get(hash(await fs.readFile('dist/client/assets/'+file)));
 if(target)manifest['/assets/'+file]=target;
}
const authoritativeImages=new Set();
for(const p of catalog){
 p.description=rebrandText(p.description);
 for(const row of [p,...p.variants||[]]){
  const target=manifest[row.image];
  if(target)row.image=target;
  if(row.sourceImage&&row.image.startsWith('/assets/seqlyn/product-')){manifest[row.sourceImage]=row.image;authoritativeImages.add(row.sourceImage);}
 }
}
const inventory=JSON.parse(await fs.readFile('reports/rebrand/inventory.json','utf8'));
for(const {source} of inventory.refs){
 if(!source.startsWith('https://phbiolabs.com/'))continue;
 if(authoritativeImages.has(source))continue;
 const normalized=source.replace(/-\d+x\d+(?=\.[^.?#]+(?:[?#]|$))/,'').split('?')[0];
 if(normalized!==source&&manifest[normalized]){manifest[source]=manifest[normalized];continue;}
 if(manifest[source]&&(await fs.stat('dist/client'+manifest[source]).catch(()=>({size:0}))).size>0)continue;
 const filename=createHash('sha256').update(source).digest('hex').slice(0,20)+path.extname(new URL(source).pathname);
 for(const prefix of ['','source-'])try{if(!(await fs.stat('dist/client/assets/'+prefix+filename)).size)continue;const local='/assets/'+prefix+filename;manifest[source]=manifest[local]||local;break;}catch{}
}
for(const key of Object.keys(manifest)){
 const seen=new Set([key]);let value=manifest[key];
 while(manifest[value]&&manifest[value]!==value){if(seen.has(value))throw Error('Cyclic brand asset mapping: '+key);seen.add(value);value=manifest[value];}
 manifest[key]=value;
}
await fs.writeFile('src/catalog.js','export default '+JSON.stringify(catalog,null,2)+';\n');
await fs.writeFile('src/brand-assets.json',JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile('reports/rebrand/edits.json',JSON.stringify(edits,null,2)+'\n');
console.log('Adopted '+edits.length+' distinct product image edits and identical legacy copies.');
