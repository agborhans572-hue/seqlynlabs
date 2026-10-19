import fs from 'node:fs/promises';
import postgres from 'postgres';
import {databaseTls} from '../src/vercel/database-tls.js';
const connection=process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL;
if(!connection)throw Error('Set SUPABASE_DB_URL to the Supabase transaction pooler URI');
const url=new URL(connection);
if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.searchParams.get('sslmode')==='disable')throw Error('A PostgreSQL connection with TLS and a password is required');
const sql=postgres(connection,{prepare:false,max:1,max_pipeline:1,ssl:databaseTls(url.hostname),connect_timeout:10});
try {
  for(const name of (await fs.readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort())await sql.unsafe(await fs.readFile('supabase/migrations/'+name,'utf8'));
  console.log('Supabase commerce schema is ready.');
} catch(error) {console.error('Supabase migration failed:',error.code||error.name);process.exitCode=1;} finally {await sql.end();}
