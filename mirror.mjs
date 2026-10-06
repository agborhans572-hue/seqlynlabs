import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const origin='https://phbiolabs.com';
const root=path.resolve('dist');
await fs.mkdir(root,{recursive:true});
const pages=new Map(), assets=new Map(), failures=[];
const decode=s=>s.replace(/&amp;|&#038;/g,'&');
function pageUrl(raw,base=origin){try{const u=new URL(decode(raw),base);if(u.hostname!=='phbiolabs.com'||u.search||/\.(?:jpg|png|webp|svg|pdf|css|js|xml|zip)$/i.test(u.pathname)||/^\/(wp-|feed|comments)/.test(u.pathname))return null;u.hash='';return u.href;}catch{return null;}}
function fileFor(u){const p=new URL(u).pathname;return path.join(root,decodeURIComponent(p),p.endsWith('/')?'index.html':'index.html');}
function localAsset(u){return '/assets/'+crypto.createHash('sha256').update(u).digest('hex').slice(0,20)+(path.extname(new URL(u).pathname)||'.bin');}
async function get(u){const {stdout}=await run('curl.exe',['-f','-L','-sS','--max-time','12',u],{encoding:'buffer',maxBuffer:25000000});return {body:stdout,type:/\.css(?:\?|$)/i.test(u)?'text/css':stdout.subarray(0,100).toString().includes('<')?'text/html':''};}
function queueAsset(raw,base){try{const u=new URL(decode(raw),base);if(!/^https?:$/.test(u.protocol))return null;const value=u.href;if(!assets.has(value))assets.set(value,{local:localAsset(value),done:false});return assets.get(value).local;}catch{return null;}}
function discover(html,base){for(const m of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)){const u=pageUrl(m[1],base);if(u&&!pages.has(u))pages.set(u,null);}}
pages.set(origin+'/',await fs.readFile('../reference.html','utf8'));
discover(pages.get(origin+'/'),origin);
for(let round=0;round<4;round++){
const pending=[...pages].filter(([,v])=>v===null).map(([u])=>u);
if(!pending.length)break;
let cursor=0;await Promise.all(Array.from({length:8},async()=>{while(cursor<pending.length){const u=pending[cursor++];try{const r=await get(u);if(!r.type.includes('html')){pages.delete(u);continue;}const h=r.body.toString();pages.set(u,h);discover(h,u);}catch(e){pages.delete(u);failures.push({url:u,error:String(e)});}}}));
console.log('Pages fetched',pages.size,'round',round+1);
}
function transform(html,base){
// Disable trackers and live commerce requests; preserve layout and local interactive scripts.
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,s=>/googletagmanager|facebook\.net|fbevents|clarity\.ms|pinterest|google-analytics|gtag\(|fbq\(/i.test(s)?'':s);
html=html.replace(/\b(src|href|poster)\s*=\s*(["'])([^"']+)\2/gi,(m,attr,q,raw)=>{
const value=decode(raw);let u;try{u=new URL(value,base);}catch{return m;}
if(value.startsWith('#'))return m;
if((attr==='src'||attr==='poster'||/\.(css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|pdf)(?:\?|$)/i.test(u.href))&&/^https?:$/.test(u.protocol)){const local=queueAsset(u.href,base);return `${attr}=${q}${local}${q}`;}
if(attr==='href'&&u.hostname==='phbiolabs.com'){if(u.search.includes('add-to-cart'))return `href=${q}#${q} data-clone-add=${q}${u.searchParams.get('add-to-cart')}${q}`;if(pages.has(pageUrl(u.href)))return `href=${q}${u.pathname}${u.hash}${q}`;}
return m;});
html=html.replace(/\bsrcset\s*=\s*(["'])(.*?)\1/gi,(m,q,v)=>`srcset=${q}${v.split(',').map(p=>{const parts=p.trim().split(/\s+/);return [queueAsset(parts[0],base)||parts[0],...parts.slice(1)].join(' ');}).join(', ')}${q}`);
html=html.replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi,(m,q,u)=>u.startsWith('data:')||u.startsWith('#')?m:`url(${q}${queueAsset(u,base)||u}${q})`);
return html.replace('</body>','<script src="/clone-interactions.js"></script></body>');}
for(const [u,h] of pages){if(!h)continue;const dest=fileFor(u);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,transform(h,u));}
let count=0;
while([...assets.values()].some(a=>!a.done)){
const pending=[...assets].filter(([,v])=>!v.done);let cursor=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<pending.length){const [u,a]=pending[cursor++];a.done=true;try{const dest=path.join(root,a.local);try{const stat=await fs.stat(dest);if(stat.size>0){count++;continue;}}catch{}const r=await get(u);let body=r.body;if(body.length>300000){a.remote=true;continue;}if(r.type.includes('css'))body=Buffer.from(body.toString().replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi,(m,q,v)=>v.startsWith('data:')?m:`url(${q}${queueAsset(v,u)||v}${q})`).replace(/@import\s+(["'])(.*?)\1/g,(m,q,v)=>`@import ${q}${queueAsset(v,u)}${q}`));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,body);count++;}catch(e){a.remote=true;failures.push({url:u,error:String(e)});}}}));console.log('Assets downloaded',count);
}
async function repair(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory()){await repair(p);continue;}if(!/\.(html|css)$/.test(p))continue;let s=await fs.readFile(p,'utf8');for(const [u,a] of assets)if(a.remote)s=s.replaceAll(a.local,u);s=s.replaceAll('https://phbiolabs.com/wp-admin/admin-ajax.php','/preview-unavailable').replaceAll('https:\\/\\/phbiolabs.com\\/wp-admin\\/admin-ajax.php','/preview-unavailable');await fs.writeFile(p,s);}}
await repair(root);
await fs.writeFile('mirror-report.json',JSON.stringify({pages:[...pages.keys()],assets:count,failures},null,2));
await fs.writeFile(path.join(root,'clone-interactions.js'),`document.addEventListener('click',e=>{const a=e.target.closest('[data-clone-add],.add_to_cart_button');if(a){e.preventDefault();e.stopImmediatePropagation();alert('Preview only: checkout is not connected.');}},true);document.addEventListener('submit',e=>{e.preventDefault();alert('Preview only: this form is not connected to a service.');},true);`);
console.log('Complete',pages.size,'pages',count,'assets',failures.length,'failures');
