/**
 * #6294 — un double de `utils/withMutationLog` qui ne rend QUE
 * `withMutationLog` laisse `withMutationOutcome` et `MutationResultGone` à
 * `undefined`. Appeler le premier lève un `TypeError` ; faire `instanceof`
 * sur la seconde en lève un autre — et dans une route, les deux se déguisent
 * en 500 sur des chemins d'erreur SANS RAPPORT avec le test qui les a posés.
 *
 * Le remède est connu et déjà appliqué à la majorité des sites :
 *
 * ```ts
 * jest.mock('<chemin>/utils/withMutationLog', () => ({
 *   ...jest.requireActual('<chemin>/utils/withMutationLog'),
 *   withMutationLog: jest.fn().mockImplementation(({ op }) => op()),
 * }));
 * ```
 *
 * ## Le chiffre de l'issue ne survit pas à un appariement d'accolades
 *
 * L'issue mesurait 42 doubles fautifs avec `grep -A4 … | grep -q
 * "requireActual"` — une fenêtre de QUATRE lignes après le `jest.mock(`. Le
 * patron du dépôt place le commentaire explicatif (ci-dessus) ENTRE l'accolade
 * ouvrante et le spread : sur tout double qui le porte, `requireActual` vit à
 * la ligne 6 ou 7, hors de la fenêtre — la mesure comptait donc des doubles
 * déjà CORRECTS. Un appariement d'accolades sur le corps ENTIER de la fabrique
 * (`scanUnspreadMocks` ci-dessous, patron `matchBrace` de
 * `bare-include-guard.test.ts`) ramène le compte réel à **5** — vérifié par
 * comparaison directe avant correction : `directory/blocks.test.ts`,
 * `posts/comment-notification-dedup.test.ts`,
 * `posts/core.moderated-delete-audience.test.ts`,
 * `posts/core.story-translation.test.ts`,
 * `posts/storyEffectsV3.negotiation.test.ts`. Les 41 autres fichiers que
 * l'issue nommait étaient déjà conformes.
 *
 * **Un chiffre mesuré par une fenêtre de lignes est une affirmation, comme un
 * compte ou un tri (`services/gateway/CLAUDE.md`, cycle 93/86 bis) : il se
 * recompte avant d'être corrigé, il ne s'hérite pas de l'issue qui l'a posé.**
 *
 * ## Portée : nommée, pas généralisée — et la raison est mesurée
 *
 * L'issue demande de mesurer, avant d'écrire le garde, si le motif dépasse ce
 * seul module (« tout module dont un test mocke une partie des exports porte
 * le même risque »). Mesuré : balayer `jest.mock('<chemin local>', () => ({…}))`
 * SANS `requireActual` sur tout `services/gateway/src` rend **397 modules
 * distincts, 2592 occurrences** — dont la quasi-totalité sont des doubles
 * TOTAUX voulus (`logger`, `logger-enhanced`, `CacheStore`… des modules à
 * surface simple, sans classe ni `instanceof`). Un garde sur le MOTIF nu
 * exigerait une liste d'exemptions de cet ordre de grandeur, que ce lot ne
 * peut pas écrire de façon sûre sans ouvrir individuellement chacun des 397
 * modules pour juger s'il porte le même risque que `withMutationLog`
 * (`MutationResultGone` en classe testée par `instanceof`, ce que
 * `logger.error` n'a pas). **Ce chantier est hors de ce lot — il devient sa
 * propre issue** (règle du `CLAUDE.md` racine : une dette découverte en
 * chemin est une issue, jamais une ligne ajoutée dans un fichier) plutôt
 * qu'un garde généralisé écrit sans l'avoir instruit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(__dirname, '../..');

/** Fin (inclusive) de l'objet ouvert par l'accolade à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

export type UnspreadMockSite = {
  readonly file: string;
};

/**
 * Chaque `jest.mock('<chemin>/utils/withMutationLog', () => ({ … }))` de
 * `source` dont le corps de la fabrique NE PORTE PAS `requireActual` — sur
 * la totalité du corps, accolades appariées, jamais une fenêtre de lignes
 * (§ tête de fichier : c'est exactement ce que la mesure de l'issue ratait).
 */
export function scanUnspreadMocks(source: string, file: string): ReadonlyArray<UnspreadMockSite> {
  const re = /jest\.mock\(\s*['"][^'"]*utils\/withMutationLog['"]\s*,\s*\(\)\s*=>\s*\(\{/g;
  const sites: UnspreadMockSite[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const openBrace = source.indexOf('{', m.index + m[0].length - 1);
    const close = matchBrace(source, openBrace);
    const body = source.slice(openBrace + 1, close);
    if (!body.includes('requireActual')) {
      sites.push({ file });
    }
  }

  return sites;
}

/**
 * Ce fichier-même est exclu du balayage : ses exemples « ce que le balayage
 * sait discriminer » citent, dans des gabarits de chaîne, la forme FAUTIVE du
 * motif recherché — un `jest.mock` sans `requireActual`. Sans cette
 * exclusion, le balayage se signale lui-même comme site fautif.
 */
const SELF = 'with-mutation-log-mock-completeness-guard.test.ts';

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && entry !== SELF) {
      acc.push(full);
    }
  }
  return acc;
}

export function sweepUnspreadMutationLogMocks(srcDir: string): ReadonlyArray<UnspreadMockSite> {
  return walk(srcDir).flatMap((full) => scanUnspreadMocks(readFileSync(full, 'utf8'), relative(srcDir, full)));
}

describe("Aucun double de test ne mocke withMutationLog sans étaler le module réel (#6294)", () => {
  it("l'inventaire est VIDE — les cinq sites mesurés fautifs sont corrigés, et aucun nouveau ne les remplace", () => {
    expect(sweepUnspreadMutationLogMocks(SRC_DIR)).toEqual([]);
  });
});

describe('Ce que le balayage sait discriminer', () => {
  it('signale un jest.mock qui ne rend que withMutationLog', () => {
    const source = `
      jest.mock('../../../utils/withMutationLog', () => ({
        withMutationLog: jest.fn(({ op }) => op()),
      }));`;

    expect(scanUnspreadMocks(source, 'x.test.ts')).toEqual([{ file: 'x.test.ts' }]);
  });

  it("ne signale rien quand la fabrique étale jest.requireActual, même avec un commentaire entre l'accolade et le spread", () => {
    // La forme réelle du dépôt : un commentaire de plusieurs lignes sépare
    // l'accolade ouvrante du spread. Un balayage en fenêtre de lignes (celui
    // de l'issue) le raterait ; l'appariement d'accolades sur le corps entier
    // ne le rate pas.
    const source = `
      jest.mock('../../../utils/withMutationLog', () => ({
        // Le module réel est ÉTALÉ d'abord : commentaire de plusieurs lignes
        // qui repousse requireActual hors d'une fenêtre de quatre lignes.
        // Une ligne de plus.
        // Encore une.
        ...(jest.requireActual('../../../utils/withMutationLog') as object),
        withMutationLog: jest.fn(({ op }) => op()),
      }));`;

    expect(scanUnspreadMocks(source, 'x.test.ts')).toEqual([]);
  });

  it('ne confond pas un mock de withMutationLog avec un mock voisin sans rapport', () => {
    const source = `
      jest.mock('../../../services/CacheStore', () => ({
        getCacheStore: () => ({ del: jest.fn() }),
      }));
      jest.mock('../../../utils/withMutationLog', () => ({
        ...jest.requireActual('../../../utils/withMutationLog'),
        withMutationLog: jest.fn(({ op }) => op()),
      }));`;

    expect(scanUnspreadMocks(source, 'x.test.ts')).toEqual([]);
  });

  it('distingue deux jest.mock de withMutationLog dans le même fichier — un fautif, un conforme', () => {
    const source = `
      jest.mock('../../../utils/withMutationLog', () => ({
        withMutationLog: jest.fn(({ op }) => op()),
      }));
      describe('autre suite', () => {
        jest.mock('../../../../utils/withMutationLog', () => ({
          ...jest.requireActual('../../../../utils/withMutationLog'),
          withMutationLog: jest.fn(({ op }) => op()),
        }));
      });`;

    expect(scanUnspreadMocks(source, 'x.test.ts')).toHaveLength(1);
  });
});

describe('Mutation — un double étroit réintroduit sur un fichier RÉEL fait tomber le balayage', () => {
  it('retirer le spread de directory/blocks.test.ts (déjà corrigé) refait rougir le balayage', () => {
    const target = join(SRC_DIR, '__tests__/unit/routes/directory/blocks.test.ts');
    const original = readFileSync(target, 'utf8');

    expect(scanUnspreadMocks(original, 'blocks.test.ts')).toEqual([]);

    const muté = original.replace(
      "...(jest.requireActual('../../../../utils/withMutationLog') as object),\n  ",
      ''
    );
    // La mutation doit avoir PRIS, sans quoi ce témoin passerait pour la
    // mauvaise raison (le texte ciblé aurait changé sans que ce test suive).
    expect(muté).not.toBe(original);

    expect(scanUnspreadMocks(muté, 'blocks.test.ts')).toEqual([{ file: 'blocks.test.ts' }]);
  });
});

describe('Le balayage LIT bien le répertoire — sans quoi il passerait au vert à vide', () => {
  it('trouve les sites conformes déjà connus, et le total mesuré ne descend pas sous lui', () => {
    // Une garde négative meurt en silence quand son terrain disparaît (même
    // leçon que `unbounded-findmany-guard.test.ts` / `bare-include-guard.test.ts`) :
    // un répertoire renommé rendrait `[]` des deux côtés et ce témoin serait
    // vert en ne mesurant plus rien. 46 sites conformes mesurés au moment
    // d'écrire ce garde (§ tête de fichier) — tout retrait de double de test
    // fait descendre ce compte, jamais une simple relecture.
    let conformes = 0;
    for (const full of walk(SRC_DIR)) {
      const source = readFileSync(full, 'utf8');
      if (/jest\.mock\(\s*['"][^'"]*utils\/withMutationLog['"]/.test(source)) {
        conformes += 1;
      }
    }
    expect(conformes).toBeGreaterThanOrEqual(46);
  });
});
