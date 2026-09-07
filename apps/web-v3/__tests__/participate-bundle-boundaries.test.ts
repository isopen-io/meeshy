import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SOURCES } from '../scripts/build-participate.mjs';

/**
 * RÉGRESSION (#5475, #5478, 2026-09-07) — `lib/contenu/story-neuve.ts`
 * (atteint depuis `/feed` : `feed.ts` → `publication.ts` →
 * `contenu/partage.ts` → `contenu/story.ts` → `contenu/story-neuve.ts`)
 * important `OCTETS_MAX_PAR_MEDIA` DEPUIS `./composer` pour une seule phrase
 * d'aide, `feed.js` embarquait `COMPOSER` — le texte ENTIER de l'écran
 * `/composer` — sans qu'aucun lecteur de `/feed` n'en ait besoin (+414 o
 * gzip, mesuré). `bun build` tree-shake un export non lu, mais PAS un
 * MODULE entier dès qu'une seule de ses valeurs est importée : le témoin
 * porte donc sur le MODULE atteint depuis `/feed`, jamais sur un chiffre
 * de poids qu'un `--mesure` ultérieur pourrait avaler en silence.
 */
describe('les modules de participation ne se paient pas les uns les autres', () => {
  const RACINE = join(__dirname, '..');
  const feed = SOURCES.find((source) => source.base === 'feed');
  if (feed === undefined) throw new Error('module `feed` introuvable dans SOURCES');

  it("feed.js ne porte pas le texte de l'écran /composer", () => {
    const dossier = mkdtempSync(join(tmpdir(), 'meeshy-v3-bundle-'));
    const sortie = join(dossier, 'feed.js');
    try {
      execFileSync(
        'bun',
        ['build', feed.chemin, '--format=esm', '--target=browser', '--minify', `--outfile=${sortie}`],
        { cwd: RACINE, stdio: ['ignore', 'ignore', 'inherit'] },
      );
      const code = readFileSync(sortie, 'utf8');
      // `COMPOSER.humeurTextePlaceholder` (`lib/contenu/composer.ts`) — une
      // chaîne qu'aucun lecteur de `/feed` n'a de raison de télécharger.
      expect(code).not.toContain('Café et revue de mars');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
