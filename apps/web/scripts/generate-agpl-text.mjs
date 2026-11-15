#!/usr/bin/env node
/* Écrit `src/lib/licences/agpl-3.0-text.ts` depuis `LICENSES/AGPL-3.0.txt` (#14628) :
   le texte de la licence voyage DANS le bundle de l'écran Licences, jamais téléchargé. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = readFileSync(join(web, '..', '..', 'LICENSES', 'AGPL-3.0.txt'), 'utf8');
writeFileSync(
  join(web, 'src', 'lib', 'licences', 'agpl-3.0-text.ts'),
  `/* GÉNÉRÉ depuis LICENSES/AGPL-3.0.txt (texte officiel de la FSF) — ne pas éditer à la main.\n   Régénérer : node apps/web/scripts/generate-agpl-text.mjs. Garde : agpl-3.0-text.test.ts. */\nexport const AGPL_3_0_TEXT =\n  ${JSON.stringify(text)};\n`,
);
