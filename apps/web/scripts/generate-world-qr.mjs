#!/usr/bin/env node
/**
 * LE QR CODE DE LA LANDING VERS /world (#10784).
 *
 * Directive porteur du 2026-10-16 : on n'entre plus dans World Wide sans compte
 * en un clic depuis meeshy.me, seulement en FLASHANT ce code, qui mène à
 * `https://meeshy.me/world`. Le SVG est STATIQUE et versionné
 * (`public/world-qr.svg`) : la landing le sert comme une image, sans une ligne
 * de script, et aucune dépendance n'entre dans `apps/web` — le paquet `qrcode`
 * est celui de la passerelle, résolu depuis son `package.json`.
 *
 * Modules sombres sur fond BLANC posé dans le SVG lui-même, marge de 4 modules :
 * tout lecteur le lit, thème sombre compris. Régénérer :
 * `node apps/web/scripts/generate-world-qr.mjs`. Le témoin
 * (`src/landing/landing-static.test.ts`) régénère et compare au fichier.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const WORLD_QR_URL = 'https://meeshy.me/world';
export const WORLD_QR_FILE = fileURLToPath(new URL('../public/world-qr.svg', import.meta.url));

const qrcode = createRequire(new URL('../../../services/gateway/package.json', import.meta.url))('qrcode');

export const worldQrOptions = {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#0b1020ff', light: '#ffffffff' },
};

export function worldQrSvg(url = WORLD_QR_URL) {
  return qrcode.toString(url, worldQrOptions);
}

export function worldQrModules(url = WORLD_QR_URL) {
  return qrcode.create(url, { errorCorrectionLevel: worldQrOptions.errorCorrectionLevel }).modules;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(WORLD_QR_FILE, await worldQrSvg());
  console.log(`world-qr.svg écrit (${WORLD_QR_URL})`);
}
