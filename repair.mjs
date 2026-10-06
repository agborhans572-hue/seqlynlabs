import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve('dist'),mapping=new Map();
function add(u){try{u=u.replaceAll('&amp;','&').replaceAll('&#038;','&');new URL(u);const local='/assets/'+crypto.createHash('sha256').update(u).digest('hex').slice(0,20)+(path.extname(new URL(u).pathname)||'.bin');mapping.set(local,u);}catch{}}
function collect(h){h=h.replaceAll('\\/','/');for(const m of h.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)){add(m[0]);if(/\.(png|jpg|jpeg|webp)$/i.test(m[0]))for(const size of ['100x100','150x150','200x200','300x300','300x200','300x150','600x600','768x768','1024x1024','768x384','1024x512','600x300'])add(m[0].replace(/\.(png|jpg|jpeg|webp)$/i,`-${size}.$1`));}}
collect(await fs.readFile('../reference.html','utf8'));
const files=[];async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else if(/\.(html|css)$/.test(p)){files.push(p);collect(await fs.readFile(p,'utf8'));}}}await walk(root);
let repaired=0,missing=new Set();for(const p of files){let s=await fs.readFile(p,'utf8');for(const m of s.matchAll(/\/assets\/[a-f0-9]+\.[a-z0-9]+/g)){let exists=false;try{exists=(await fs.stat(path.join(root,m[0]))).size>0;}catch{}if(!exists){const u=mapping.get(m[0]);if(u){s=s.replaceAll(m[0],u);repaired++;}else missing.add(m[0]);}}s=s.replace(/\bhref=(["'])https:\/\/phbiolabs.com([^"']*)\1/g,(m,q,url)=>`href=${q}${url||'/'}${q}`);await fs.writeFile(p,s);}await fs.writeFile('mirror-report.json',JSON.stringify({pages:files.filter(p=>p.endsWith('.html')).length,repaired,missing:[...missing]},null,2));console.log({repaired,missing:[...missing]});
