/**
 * Generates PWA icon sizes from assets/logo.png into public/icons/
 */
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'logo.png');
const outDir = path.join(root, 'public', 'icons');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  await access(src);
  await mkdir(outDir, { recursive: true });

  for (const { name, size } of sizes) {
    const dest = path.join(outDir, name);
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: '#3A6EA5' })
      .png()
      .toFile(dest);
    console.log(`Wrote ${dest}`);
  }

  await sharp(src)
    .resize(32, 32, { fit: 'contain', background: '#3A6EA5' })
    .png()
    .toFile(path.join(root, 'public', 'favicon.png'));
  console.log('Wrote public/favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
