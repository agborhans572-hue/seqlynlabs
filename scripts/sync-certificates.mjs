import fs from 'node:fs/promises';
import path from 'node:path';
import certificates from '../src/certificates.json' with {type:'json'};

// Keep the original laboratory documents and their existing previews together.
// This is an explicit asset refresh; ordinary builds work entirely offline.
const root='dist/client';
const directory=root+'/certificates';
await fs.mkdir(directory,{recursive:true});
const local=url=>'/certificates/'+path.basename(new URL(url).pathname);
const assets=[...new Set(certificates.flatMap(c=>[c.preview,...c.certificates]))];
let cursor=0;
await Promise.all(Array.from({length:6},async()=>{
  while(cursor<assets.length){
    const url=assets[cursor++];
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Certificate download failed (${response.status}): ${url}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    const pdf=url.endsWith('.pdf');
    if(pdf?bytes.subarray(0,5).toString()!=='%PDF-':bytes[0]!==0xff||bytes[1]!==0xd8)
      throw Error('Unexpected certificate asset format: '+url);
    await fs.writeFile(root+local(url),bytes);
  }
}));

const page=root+'/coa-library/index.html';
let html=await fs.readFile(page,'utf8');
let count=0;
html=html.replace(/class="coa-card"[\s\S]*?class="coa-pdf-preview"\s+src="[^"]+"/g,block=>{
  const urls=JSON.parse(block.match(/data-fulls="([^"]+)"/)[1].replaceAll('&quot;','"'));
  const entry=certificates.find(c=>c.certificates[0]===urls[0]||local(c.certificates[0])===urls[0]);
  if(!entry)throw Error('Unrecognized certificate card: '+urls[0]);
  count++;
  return block.replace(/data-fulls="[^"]+"/,'data-fulls="'+JSON.stringify(entry.certificates.map(local)).replaceAll('"','&quot;')+'"')
    .replace(/data-pdf="[^"]+"/,'data-pdf="'+local(entry.certificates[0])+'"')
    .replace(/(class="coa-pdf-preview"\s+src=")[^"]+"/,'$1'+local(entry.preview)+'"');
});
if(count!==certificates.length)throw Error(`Expected ${certificates.length} cards, found ${count}`);
// Show the complete document in each thumbnail, including the page edges.
html=html.replace(/(\.coa-card img\{[\s\S]*?object-fit:)cover/,'$1contain')
  .replace(/(\.coa-pdf-preview\{[\s\S]*?object-fit:)cover/,'$1contain');
await fs.writeFile(page,html);
console.log(`Restored ${count} certificate previews and ${assets.length-count} PDF documents.`);
