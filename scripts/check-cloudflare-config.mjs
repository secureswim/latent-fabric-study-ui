import { readFileSync } from 'node:fs';

const placeholder = '00000000-0000-4000-8000-000000000000';
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const database = config.d1_databases?.find((entry) => entry.binding === 'DB');

if (!database) {
  throw new Error('wrangler.jsonc must contain a D1 database binding named DB.');
}

if (!database.database_id || database.database_id === placeholder) {
  throw new Error(
    'Create latent-fabric-study-db with Wrangler, then replace the all-zero database_id in wrangler.jsonc before migrating or deploying.',
  );
}

console.log(`Cloudflare configuration ready for D1 database ${database.database_name}.`);
