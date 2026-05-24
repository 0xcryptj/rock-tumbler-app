import { parseEnvFile } from '../lib/eufy-camera.mjs';

const key = process.argv[2];
if (!key) process.exit(0);
console.log(parseEnvFile()[key] || '');
