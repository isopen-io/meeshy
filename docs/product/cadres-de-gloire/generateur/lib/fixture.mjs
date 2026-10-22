// La photo FIXTURE des cibles de fidélité (prompt § 8.3) : libre de droits parce que dessinée ici, sans aucun visage,
// au format d'une photo développée par l'app (1 440 px de grand côté, JPEG q0,85, § 5.14). Un paysage de fin de
// jour — ciel, soleil bas et décentré, collines, eau — assez structuré pour qu'un recadrage ou un décalage de la
// photo dans la fenêtre se voie. Usage : node lib/fixture.mjs [fixture/photo.jpg]
import fs from 'node:fs';
import path from 'node:path';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const FIXTURE = path.join(HERE, '../fixture/photo.jpg');
const W = 1080;
const H = 1440;

const hill = (y, amp, phase, fill) => {
  const points = Array.from({ length: 25 }, (_, i) => {
    const x = (i / 24) * W;
    return `${x.toFixed(1)},${(y + amp * Math.sin(phase + (i / 24) * Math.PI * 2.6) + amp * 0.4 * Math.sin(phase * 2 + (i / 24) * Math.PI * 7)).toFixed(1)}`;
  });
  return `<polygon points="0,${H} ${points.join(' ')} ${W},${H}" fill="${fill}"/>`;
};

const ripples = Array.from({ length: 14 }, (_, i) => {
  const y = 1010 + i * 28;
  const w = 90 + ((i * 37) % 160);
  const x = 330 + ((i * 53) % 220) - w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="#FFD9A0" opacity="${(0.32 - i * 0.018).toFixed(3)}"/>`;
}).join('');

export const scene = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2550"/><stop offset="0.45" stop-color="#5A4A86"/><stop offset="0.72" stop-color="#E88A5C"/><stop offset="0.9" stop-color="#FFC98A"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E3905F"/><stop offset="1" stop-color="#2A2A52"/></linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFF4D6"/><stop offset="0.55" stop-color="#FFD37A"/><stop offset="1" stop-color="#FFB15A" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="700" cy="960" r="150" fill="url(#sun)"/>
<circle cx="700" cy="960" r="84" fill="#FFF0C4"/>
${hill(960, 34, 0.4, '#5B3F7A')}
${hill(1000, 40, 2.1, '#3E2C5E')}
<rect x="0" y="1000" width="${W}" height="${H - 1000}" fill="url(#water)"/>
${ripples}
${hill(1250, 30, 1.3, '#17132B')}
</svg>`;

export async function writeFixture(file = FIXTURE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const jpeg = await sharp(Buffer.from(scene())).jpeg({ quality: 85, chromaSubsampling: '4:2:0' }).toBuffer();
  fs.writeFileSync(file, jpeg);
  return jpeg;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const jpeg = await writeFixture(process.argv[2] ? path.resolve(process.argv[2]) : FIXTURE);
  console.log(`fixture : ${W}×${H}, ${(jpeg.length / 1024).toFixed(0)} Ko`);
}
