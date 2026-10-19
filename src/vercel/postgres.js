import postgres from 'postgres';
import {databaseTls} from './database-tls.js';

const tables=new Set(['product_settings','carts','orders','submissions','request_limits','customer_profiles','wishlist','coupons','store_settings','order_events','custom_products','schema_migrations','email_outbox','newsletter_subscribers','newsletter_campaigns']);

// Translate only the small SQL dialect used by the shared commerce Worker.
// Values remain bound parameters, and table names are pinned to a private schema.
export function postgresQuery(sql) {
  const ignore=/^\s*INSERT OR IGNORE\b/i.test(sql);
  sql=sql.replace(/^\s*INSERT OR IGNORE\b/i,'INSERT');
  let parameter=0,tableNext=false;
  sql=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\b[a-z_][a-z_0-9]*\b|\?/gi,token=>{
    if(token.startsWith("'") || token.startsWith('"'))return token;
    if(token==='?')return '$'+(++parameter);
    const lower=token.toLowerCase(),qualify=tableNext&&tables.has(lower);
    tableNext=/^(from|join|into|update)$/.test(lower);
    if(qualify)return 'seqlyn."'+lower+'"';
    if(lower==='window')return '"window"';
    if(lower==='like')return 'ILIKE';
    return token;
  });
  return sql+(ignore?' ON CONFLICT DO NOTHING':'');
}

export function postgresAdapter(client) {
  const query=(sql,args)=>({sql:postgresQuery(sql),args:args.map(value=>value===undefined?null:value)});
  return {
    prepare(sql) {
      return {sql,args:[],bind(...args){return {...this,args};},
        async first(){const q=query(this.sql,this.args);return (await client.unsafe(q.sql,q.args))[0]||null;},
        async all(){const q=query(this.sql,this.args);return {results:await client.unsafe(q.sql,q.args)};},
        async run(){const q=query(this.sql,this.args);return client.unsafe(q.sql,q.args);}
      };
    },
    async batch(statements) {
      // SQLite serialized writes. SERIALIZABLE plus retries preserves the same
      // cart/coupon race guarantees when multiple Vercel instances use Postgres.
      for(let attempt=0;attempt<3;attempt++) {
        try {return await client.begin('isolation level serializable',async transaction=>{
          const results=[];
          for(const statement of statements){const q=query(statement.sql,statement.args);results.push(await transaction.unsafe(q.sql,q.args));}
          return results;
        });} catch(error){if(!['40001','40P01'].includes(error.code)||attempt===2)throw error;}
      }
    }
  };
}

let cached;
export function supabaseDatabase(env) {
  const connection=env.SUPABASE_DB_URL||env.POSTGRES_URL;
  if(!connection)return undefined;
  const url=new URL(connection);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.password)throw Error('A complete PostgreSQL connection string is required');
  if(url.searchParams.get('sslmode')==='disable')throw Error('Database TLS must stay enabled');
  if(cached?.connection!==connection) {
    const client=postgres(connection,{prepare:false,max:2,max_pipeline:1,idle_timeout:20,connect_timeout:10,ssl:databaseTls(url.hostname),
      types:{bigint:{to:20,from:[20],serialize:value=>String(value),parse:value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Database integer exceeds safe range');return n;}}}});
    cached={connection,db:postgresAdapter(client)};
  }
  return cached.db;
}
