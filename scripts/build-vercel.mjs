if(!process.argv.includes('--package-only'))await import('./build-shop.mjs');
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {repairLegacy} from './vercel-legacy.mjs';

const root=path.resolve('dist/client'),output=path.resolve('.vercel/output');
// Never remove the tracked storefront snapshots that the existing build needs.
if(output!==path.join(process.cwd(),'.vercel','output'))throw Error('Unexpected output directory');
await fs.rm(output,{recursive:true,force:true});
const staticRoot=path.join(output,'static'),functionRoot=path.join(output,'functions','shop.func');
await fs.mkdir(staticRoot,{recursive:true});
await fs.mkdir(path.join(functionRoot,'templates'),{recursive:true});

const missing=new Set(),repairs=[];
for(const url of JSON.parse(await fs.readFile('mirror-report.json','utf8')).missing) {
  try{if((await fs.stat(path.join(root,url))).size===0)missing.add(url);}catch{missing.add(url);}
}
let origin='';
if(process.env.PUBLIC_SITE_URL) {
  const url=new URL(process.env.PUBLIC_SITE_URL);
  if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw Error('PUBLIC_SITE_URL must be an HTTPS origin without a path');
  origin=url.origin;
}
const transform=(content,file)=>{
  let text=repairLegacy(content,file,missing,repairs).replaceAll('Sign in with ChatGPT','Sign in with Google')
    .replaceAll('/signin-with-chatgpt','/auth/signin').replaceAll('/signout-with-chatgpt','/auth/signout');
  if(file.endsWith('.html') && origin) {
    const route='/'+file.replace(/index\.html$/,'');
    text=text.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'').replace(/<meta\b[^>]*property="og:url"[^>]*>/gi,'')
      .replace('</head>',`<link rel="canonical" href="${origin+route}"><meta property="og:url" content="${origin+route}"></head>`)
      .replace(/(<meta\b[^>]*(?:property="og:image"|name="twitter:image")[^>]*content=")\/(?!\/)/gi,'$1'+origin+'/');
  }
  return text;
};
async function files(dir) {
  const list=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())list.push(...await files(p));else list.push(p);
  }
  return list;
}
const sourceFiles=await files(root),texts=new Map();
for(const file of sourceFiles)if(/\.(html|css|js|json|svg)$/i.test(file))texts.set(file,await fs.readFile(file,'utf8'));
const references=[...texts.values(),await fs.readFile('src/catalog.js','utf8'),...Object.values(JSON.parse(await fs.readFile('src/brand-assets.json','utf8')))].join('\n');
let bytes=0,count=0,omitted=0;
for(const file of sourceFiles) {
  const relative=path.relative(root,file).split(path.sep).join('/');
  // Keep source snapshots locally; omit unused legacy raster copies from deployment.
  if(/\.(png|jpe?g|webp|gif|avif|ico)$/i.test(file) && !relative.startsWith('certificates/') && !relative.startsWith('assets/seqlyn/') && !references.includes(path.basename(file))) {omitted++;continue;}
  const target=path.join(staticRoot,relative);
  await fs.mkdir(path.dirname(target),{recursive:true});
  if(texts.has(file))await fs.writeFile(target,transform(texts.get(file),relative));else await fs.copyFile(file,target);
  bytes+=(await fs.stat(target)).size;count++;
}
for(const name of ['product','admin'])await fs.copyFile(path.join(staticRoot,name,'index.html'),path.join(functionRoot,'templates',name+'.html'));
await fs.copyFile('src/vercel/legacy-forms.js',path.join(staticRoot,'deployment-forms.js'));
count++;bytes+=(await fs.stat(path.join(staticRoot,'deployment-forms.js'))).size;
await build({entryPoints:['src/vercel/handler.js'],outfile:path.join(functionRoot,'index.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',minify:true,
  banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});
await fs.writeFile(path.join(functionRoot,'.vc-config.json'),JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:30},null,2));
const config={version:3,routes:[
  {src:'^/(.*)$',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"connect-src 'self'; object-src 'none'; base-uri 'self'"},continue:true},
  {src:'^/(?:api(?:/.*)?|health|auth/(?:signin|signout)/?|sign(?:in|out)-with-chatgpt|admin(?:/index\\.html)?/?|product(?:/index\\.html)?/?)$',dest:'/shop'},
  {handle:'filesystem'},
  {src:'^/$',dest:'/index.html'},
  // Preserve directory routes without a single-page-app fallback for unknown pages.
  {src:'^/(.*)/$',dest:'/$1/index.html'},
  {src:'^/(.*)$',dest:'/$1/index.html'}
]};
await fs.writeFile(path.join(output,'config.json'),JSON.stringify(config,null,2));
const summary={files:count,staticBytes:bytes,omittedUnusedImages:omitted,functionBytes:(await fs.stat(path.join(functionRoot,'index.mjs'))).size,origin:origin||null};
await fs.mkdir('reports/deployment',{recursive:true});
await fs.writeFile('reports/deployment/build.json',JSON.stringify(summary,null,2));
await fs.writeFile('reports/deployment/legacy-repairs.json',JSON.stringify(repairs,null,2));
console.log('Vercel Build Output API bundle:',JSON.stringify(summary));
