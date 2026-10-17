import {deploymentDatabase} from '../src/vercel/database.js';
const env=process.env,problems=[];
for(const name of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','SHOP_ADMIN_EMAIL'])if(!env[name])problems.push('Missing '+name);
if(env.AUTH_SECRET && env.AUTH_SECRET.length<32)problems.push('AUTH_SECRET must be at least 32 random characters');
if(env.COMMERCE_MODE!=='test')problems.push('COMMERCE_MODE must be test; live payments are not implemented');
if(env.SHOP_ADMIN_EMAIL && !/^\S+@\S+\.\S+$/.test(env.SHOP_ADMIN_EMAIL))problems.push('SHOP_ADMIN_EMAIL must be a valid Google account email');
if(!problems.length) {
  try {
    const db=deploymentDatabase(env);
    const row=await db.prepare('SELECT COUNT(*) n FROM _seqlyn_migrations').first();
    if(row.n<4)problems.push('Apply all database migrations with npm run db:migrate');
    await db.prepare('SELECT (SELECT COUNT(*) FROM custom_products), (SELECT COUNT(*) FROM order_events)').first();
  } catch {problems.push('Database connection/schema check failed; verify credentials and run migrations');}
}
if(problems.length){for(const problem of problems)console.error(problem);process.exitCode=1;}
else console.log('Test-store environment and database are ready. Confirm Google OAuth callback and hosted smoke tests before launch.');
