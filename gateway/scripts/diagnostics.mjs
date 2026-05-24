/**
 * CLI diagnostics — same checks as GET /api/test/all
 * Requires unified backend running: npm run start
 */
import { runSystemChecks } from '../lib/system-check.mjs';
import { parseEnvFile } from '../lib/eufy-camera.mjs';

const env = parseEnvFile();
const skipCamera = process.argv.includes('--relay-only');

function pass(msg) {
  console.log(`  OK  ${msg}`);
}
function fail(msg) {
  console.log(`  FAIL ${msg}`);
}

async function main() {
  console.log('=== Tumbler diagnostics ===');
  const base = env.PUBLIC_BASE_URL || `http://127.0.0.1:${env.PORT || 8080}`;
  console.log(`Expect backend at ${base}\n`);

  const report = await runSystemChecks({
    includeCamera: !skipCamera,
    assumeGatewayUp: false,
    publicBaseUrl: env.PUBLIC_BASE_URL,
  });

  for (const row of report.checks) {
    const fn = row.ok ? pass : fail;
    fn(`${row.label}: ${row.detail}`);
  }

  console.log('\n=== Summary ===');
  if (report.ok) {
    console.log('All checks passed.');
    process.exit(0);
  }
  if (!report.checks.find((c) => c.id === 'gateway')?.ok) {
    console.log('Start unified backend: npm run start  (leave that terminal open)');
  }
  process.exit(1);
}

main();
