import './finish-shop.mjs';
import fs from 'node:fs/promises';
await fs.mkdir('dist/server',{recursive:true});
let worker=await fs.readFile('src/worker.js','utf8');const catalog=await fs.readFile('src/catalog.js','utf8');worker=worker.replace("import catalog from './catalog.js';",()=>catalog.replace('export default','const catalog ='));
await fs.writeFile('dist/server/index.js',worker);
await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built standalone Worker');
