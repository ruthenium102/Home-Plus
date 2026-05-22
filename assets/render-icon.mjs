import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(join(dir, 'icon.svg'));
const png = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer();
await writeFile(join(dir, 'icon.png'), png);
console.log('wrote', join(dir, 'icon.png'), png.length, 'bytes');
