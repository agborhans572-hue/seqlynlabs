import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';
const root=path.resolve('.vercel/output/static'),missing=new Map(),external=new Map();
let pages=0;
async function check(raw,base,source) {
  if(!raw || /^(data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw))return;
  let url;try{url=new URL(raw.replaceAll('&amp;','&'),base);}catch{return;}
  const record=(map,key)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(source);};
  if(url.origin!=='https://local.invalid'){record(external,url.href);return;}
  let filename;try{filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch{return;}
  if(filename!==root&&!filename.startsWith(root+path.sep)){record(missing,url.pathname);return;}
  try{const stat=await fs.stat(filename);if(!stat.isFile() || stat.size===0)record(missing,url.pathname);}catch{record(missing,url.pathname);}
}
async function visit(dir) {
  for(const item of await fs.readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);if(item.isDirectory()){await visit(file);continue;}
    const source=path.relative(root,file).replaceAll('\\','/'),base='https://local.invalid/'+source;
    if(item.name.endsWith('.html')) {
      pages++;const $=load(await fs.readFile(file,'utf8'));
      for(const node of $('img[src],script[src],link[rel="stylesheet"],link[rel="icon"],link[rel="preload"],video[poster]').toArray())await check($(node).attr('src')||$(node).attr('href')||$(node).attr('poster'),base,source);
      for(const node of $('[srcset]').toArray())for(const part of ($(node).attr('srcset')||'').split(','))await check(part.trim().split(/\s+/)[0],base,source);
      for(const node of $('[style],style').toArray())for(const match of (($(node).attr('style')||'')+($(node).is('style')?$(node).text():'')).matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))await check(match[1],base,source);
    } else if(item.name.endsWith('.css')) {
      const text=(await fs.readFile(file,'utf8')).replace(/\/\*[\s\S]*?\*\//g,'');
      for(const match of text.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))await check(match[1],base,source);
    }
  }
}
await visit(root);
const list=map=>[...map].map(([url,sources])=>({url,pages:[...sources]}));
const inherited=new Set(JSON.parse(await fs.readFile('mirror-report.json','utf8')).missing);
const unexpectedMissing=list(missing).filter(item=>!inherited.has(item.url));
const report={pages,missing:list(missing),inheritedMissing:list(missing).filter(item=>inherited.has(item.url)),unexpectedMissing,externalResources:list(external)};
await fs.mkdir('reports/deployment',{recursive:true});
await fs.writeFile('reports/deployment/assets.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pages,inheritedMissing:report.inheritedMissing.length,unexpectedMissing:unexpectedMissing.length,externalResources:external.size}));
if(unexpectedMissing.length)process.exitCode=1;
