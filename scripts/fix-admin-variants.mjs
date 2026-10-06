import fs from 'node:fs/promises';
const p='src/worker.js',s=await fs.readFile(p,'utf8');await fs.writeFile(p,s.replace('!catalog.some(p=>p.id===b.id)','!knownProducts.has(b.id)'));
