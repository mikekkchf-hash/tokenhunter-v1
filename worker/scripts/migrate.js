// scripts/migrate.js
// Requires: wrangler CLI installed and logged in
const { execSync } = require('child_process');

function run(cmd){
  console.log('> ', cmd);
  try {
    const out = execSync(cmd, { stdio: 'inherit' });
  } catch(e) {
    console.error('Command failed:', e.message);
    process.exit(1);
  }
}

console.log('Creating KV namespaces (you will see printed IDs) ...');
run('wrangler kv:namespace create "KV_CANDIDATES"');
run('wrangler kv:namespace create "KV_CONFIG"');
console.log('If successful, copy the returned namespace IDs into worker/wrangler.toml.');
