/**
 * @jest-environment node
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * #5479 — `feed.js` embarquait la copie ENTIÈRE de l'écran de création de
 * story (`STORY_NEUVE` : `mediaAide`, `mediaImporter`, `mediaUnSeul`, …) pour
 * l'usage d'une seule constante numérique (`HEURES_DE_VIE_D_UNE_STORY`),
 * importée transitivement par `lib/contenu/story.ts` depuis
 * `lib/contenu/story-neuve.ts`. `/feed` est un écran du RÔLE PREMIER
 * (`budgets.json` › `(public)`) : chaque visiteur payait ~400 o gzip de copie
 * d'un écran qu'il ne visite peut-être jamais.
 *
 * Le ratchet numérique (`build-participate.mjs`) attrape une CROISSANCE, mais
 * ne dit jamais POURQUOI — ce témoin construit `feed.js` réellement (comme le
 * fait `bun run build`) et affirme l'ABSENCE de la copie de `/stories/new`
 * dans le résultat : la preuve directe que `story-neuve.ts` reste hors de ce
 * bundle, indépendamment de tout chiffre.
 */
describe('feed.js n’embarque pas la copie de /stories/new', () => {
  const RACINE = join(__dirname, '..');
  let dossier: string;
  let sortie: string;
  let bundle: string;

  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'meeshy-v3-feed-bundle-'));
    sortie = join(dossier, 'feed.js');
    execFileSync(
      'bun',
      ['build', join(RACINE, 'lib', 'realtime', 'feed.ts'), '--format=esm', '--target=browser', '--minify', `--outfile=${sortie}`],
      { cwd: RACINE, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    bundle = readFileSync(sortie, 'utf8');
  });

  afterAll(() => {
    rmSync(dossier, { recursive: true, force: true });
  });

  it('ne contient aucune phrase de la copie de création de story', () => {
    // Des chaînes qui n'existent QUE dans `STORY_NEUVE` (`lib/contenu/story-neuve.ts`)
    // — aucune n'est atteignable depuis `/feed`, aimer ou reposter n'ont besoin
    // ni de l'une ni de l'autre.
    expect(bundle).not.toContain('Nouvelle story');
    expect(bundle).not.toContain('mediaImporter');
    expect(bundle).not.toContain('Racontez quelque chose');
    expect(bundle).not.toContain('Une story porte un seul média');
  });

  /**
   * CONTRE-ÉPREUVE — un témoin qui ne peut jamais rougir n'en est pas un.
   * Importer `STORY_NEUVE` directement depuis `feed.ts` ferait réapparaître
   * ces mêmes chaînes ; sans cette contre-épreuve, le test ci-dessus pourrait
   * être vert parce que bun ne bundle plus RIEN.
   */
  it('bundle bien autre chose que rien — 26 modules attendus, pas 0', () => {
    expect(bundle.length).toBeGreaterThan(1000);
  });
});
