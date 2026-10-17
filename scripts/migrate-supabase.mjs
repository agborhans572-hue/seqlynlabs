import fs from 'node:fs/promises';
import postgres from 'postgres';
const connection=process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL;
if(!connection)throw Error('Set SUPABASE_DB_URL to the Supabase transaction pooler URI');
const url=new URL(connection);
if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.searchParams.get('sslmode')==='disable')throw Error('A PostgreSQL connection with TLS and a password is required');
const sql=postgres(connection,{prepare:false,max:1,ssl:'verify-full',connect_timeout:10});
try {
  await sql.unsafe(await fs.readFile('supabase/migrations/202610180001_seqlyn_shop.sql','utf8'));
  console.log('Supabase commerce schema is ready.');
} catch(error) {console.error('Supabase migration failed:',error.code||error.name);process.exitCode=1;} finally {await sql.end();}
