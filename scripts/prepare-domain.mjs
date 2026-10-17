import fs from 'node:fs/promises';
import {brand} from '../src/brand.js';
const origin=brand.publicOrigin;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function visit(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())await visit(path);else if(entry.name.endsWith('.html')){
 let html=await fs.readFile(path,'utf8');
 const route=path.slice('dist/client'.length).replace(/index\.html$/,'');
 const canonical=origin+route;
 html=html.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'').replace(/<meta\b[^>]*property="og:url"[^>]*>/gi,'');
 if(origin)html=html.replace(/(<meta\b[^>]*property="og:image"[^>]*content=")\/(?!\/)([^"<>]*)(")/gi,(_,prefix,value,end)=>prefix+origin+'/'+value+end);
 if(origin)html=html.replace('</head>',()=>`<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}"></head>`);
 await fs.writeFile(path,html);
}}}
await visit('dist/client');
console.log(origin?'Prepared configured brand origin.':'Canonical origin omitted until a Seqlyn Labs domain is configured.');
