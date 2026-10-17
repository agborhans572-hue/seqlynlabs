import {deploymentDatabase} from '../src/vercel/database.js';
const env=process.env,problems=[];
const supabase=env.AUTH_PROVIDER==='supabase',postgres=supabase||Boolean(env.SUPABASE_DB_URL||env.POSTGRES_URL);
if(postgres&&!env.SUPABASE_DB_URL&&!env.POSTGRES_URL)problems.push('Missing SUPABASE_DB_URL or POSTGRES_URL');
const required=[...(postgres?[]:['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN']),...(supabase?['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY']:['AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET'])];
for(const name of required)if(!env[name])problems.push('Missing '+name);
if(!supabase && env.AUTH_SECRET && env.AUTH_SECRET.length<32)problems.push('AUTH_SECRET must be at least 32 random characters');
if(env.COMMERCE_MODE!=='test')problems.push('COMMERCE_MODE must be test; live payments are not implemented');
if(env.SHOP_ADMIN_EMAIL && !/^\S+@\S+\.\S+$/.test(env.SHOP_ADMIN_EMAIL))problems.push('SHOP_ADMIN_EMAIL must be a valid Google account email');
if(!problems.length) {
  try {
    const db=deploymentDatabase(env);
    if(postgres){if(!await db.prepare('SELECT version FROM schema_migrations WHERE version=?').bind('202610180001').first())problems.push('Apply the Supabase SQL migration');}
    else {const row=await db.prepare('SELECT COUNT(*) n FROM _seqlyn_migrations').first();if(row.n<4)problems.push('Apply all database migrations with npm run db:migrate');}
    await db.prepare('SELECT (SELECT COUNT(*) FROM custom_products), (SELECT COUNT(*) FROM order_events)').first();
  } catch {problems.push('Database connection/schema check failed; verify credentials and run migrations');}
}
if(problems.length){for(const problem of problems)console.error(problem);process.exitCode=1;}
else console.log('Test-store environment and database are ready. Confirm Google OAuth callback and hosted smoke tests before launch.'+(supabase&&env.SUPABASE_GOOGLE_ENABLED!=='true'?' Google sign-in remains disabled pending provider setup.':'')+(env.SHOP_ADMIN_EMAIL?'':' Administrator access remains disabled until SHOP_ADMIN_EMAIL is configured.'));
