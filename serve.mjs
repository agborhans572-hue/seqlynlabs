import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.pdf':'application/pdf','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{try{let p=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)&&p!==root)throw Error();const stat=await fs.stat(p);if(stat.isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.statusCode=404;res.end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('Preview http://127.0.0.1:4173'));
