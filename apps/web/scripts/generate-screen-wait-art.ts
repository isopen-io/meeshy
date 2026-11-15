/**
 * ÉCRIT LE DESSIN FIGÉ DE L'ATTENTE D'UN ÉCRAN (#10635).
 *
 *   bun run scripts/generate-screen-wait-art.ts
 *
 * Sortie : `src/components/screen-wait-art.ts`. Le témoin
 * `src/components/screen-wait.test.tsx` rougit si le fichier suivi diverge du
 * sticker `duo-on-danse` du catalogue : on relance ce script.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { screenWaitArtSource } from '../src/lib/mee/screen-wait-art-source';

const target = fileURLToPath(new URL('../src/components/screen-wait-art.ts', import.meta.url));
const header = `/**\n * GÉNÉRÉ par \`scripts/generate-screen-wait-art.ts\` — ne pas modifier à la main.\n * Mee et Meo qui dansent (sticker \`duo-on-danse\`), figés hors du catalogue\n * pour que l'attente d'un écran ne charge ni les stickers ni leur moteur (#10635).\n */\n`;
writeFileSync(target, `${header}export const SCREEN_WAIT_ART = ${JSON.stringify(screenWaitArtSource())};\n`);
console.log(`dessin écrit : ${target}`);
