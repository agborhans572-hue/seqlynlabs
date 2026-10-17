import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client/web';

export async function migrate(client,dir='drizzle') {
  await client.execute('CREATE TABLE IF NOT EXISTS _seqlyn_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for(const name of (await fs.readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) {
    const sql=(await fs.readFile(dir+'/'+name,'utf8')).replace(/\r\n/g,'\n'),sha256=createHash('sha256').update(sql).digest('hex');
    const tx=await client.transaction('write');
    try {
      const existing=(await tx.execute({sql:'SELECT sha256 FROM _seqlyn_migrations WHERE name=?',args:[name]})).rows[0];
      if(existing) {if(existing.sha256!==sha256)throw Error('Applied migration was changed: '+name);}
      else {
        // An existing untracked D1/preview database must be explicitly imported and baselined.
        await tx.executeMultiple(sql);
        await tx.execute({sql:'INSERT INTO _seqlyn_migrations(name,sha256) VALUES (?,?)',args:[name,sha256]});
      }
      await tx.commit();
      console.log(existing?'Already applied:':'Applied:',name);
    } catch(error) {await tx.rollback();throw error;} finally {tx.close();}
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:authToken}=process.env;
  if(!url || !authToken)throw Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before migrating');
  const parsed=new URL(url);
  if(!['libsql:','https:'].includes(parsed.protocol) || parsed.searchParams.get('tls')==='0')throw Error('Use a remote encrypted database URL');
  const client=createClient({url,authToken});
  try {await migrate(client);} finally {client.close();}
}
