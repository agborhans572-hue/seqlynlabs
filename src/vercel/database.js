import {createClient} from '@libsql/client/web';
import {supabaseDatabase} from './postgres.js';

// Preserve the Worker's D1 interface and, critically, its atomic checkout batches.
export function databaseAdapter(client) {
  return {
    prepare(sql) {
      return {
        sql, args: [],
        bind(...args) { return {...this, args:args.map(v=>v===undefined?null:v)}; },
        async first() { return (await client.execute({sql:this.sql,args:this.args})).rows[0]||null; },
        async all() { return {results:(await client.execute({sql:this.sql,args:this.args})).rows}; },
        async run() { return client.execute({sql:this.sql,args:this.args}); }
      };
    },
    async batch(statements) {
      return client.batch(statements.map(({sql,args})=>({sql,args})), 'write');
    }
  };
}

let cached;
export function deploymentDatabase(env) {
  if(env.SUPABASE_DB_URL || env.POSTGRES_URL || env.AUTH_PROVIDER==='supabase')return supabaseDatabase(env);
  if(!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return undefined;
  const url=new URL(env.TURSO_DATABASE_URL);
  if(!['libsql:','https:'].includes(url.protocol) || url.searchParams.get('tls')==='0') throw Error('A remote encrypted database URL is required');
  const key=env.TURSO_DATABASE_URL+'\n'+env.TURSO_AUTH_TOKEN;
  if(cached?.key!==key) cached={key,db:databaseAdapter(createClient({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN,intMode:'number'}))};
  return cached.db;
}
