import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * TOUT ÉCRAN PLEIN-CADRE PORTE SON ENCOCHE HAUTE (#5604, revue-correction).
 *
 * LE DÉFAUT QUE CE TÉMOIN INTERDIT, et qui a réellement été livré : la
 * coquille (`body`) portait `padding-top: env(safe-area-inset-top)` pendant que
 * les écrans plein-cadre sont des `h-dvh` (= 100dvh, la hauteur visible
 * ENTIÈRE). Le document valait alors `100dvh + inset-haut` et l'excès partait
 * SOUS le bord bas : la barre de recherche et le composeur, pourtant
 * correctement repliés en bas, étaient poussés hors du cadre. Mesuré au
 * simulateur : `scrollHeight` 936 pour `innerHeight` 874, sur un inset de 62.
 *
 * POURQUOI UN TÉMOIN DE SOURCE ICI, alors qu'un témoin de source prouve
 * seulement qu'une ligne EXISTE : ce qu'il garde n'est pas un comportement mais
 * une CONVENTION D'ÉCRITURE — « la racine plein-cadre porte l'inset, la
 * coquille n'en porte aucun ». Que la classe PEIGNE est prouvé ailleurs, et par
 * une autre mécanique : `check-utilities.mjs` oppose chaque classe employée à
 * la feuille RÉELLEMENT produite, donc un `pt-safe` qui n'émettrait plus de
 * règle y rougirait. Les deux ensemble couvrent l'écriture et le rendu ; le
 * troisième étage est la recette simulateur, qui mesure `scrollHeight`.
 *
 * Ce témoin vaut surtout pour les QUARANTE surfaces iOS qui restent à porter :
 * le défaut ci-dessus est invisible sur un navigateur de bureau (inset nul) et
 * ne se voit qu'en coque — chaque écran neuf le rejouerait en silence.
 */

const ROUTES = dirname(fileURLToPath(import.meta.url));

/** La marque d'un écran plein-cadre : il occupe la hauteur visible entière. */
const FULL_FRAME = /\b(?:min-)?h-dvh\b/;

/**
 * Les racines plein-cadre qui n'ont PAS à porter l'inset, et pourquoi. Une
 * liste d'exceptions sans motif redevient un tapis sous lequel on pousse les
 * vraies (même discipline que `ALLOWED` dans `check-utilities.mjs`).
 */
const EXEMPT = new Map<string, string>([
  [
    'components/shell.tsx',
    "la COQUILLE, justement : c'est elle qui ne doit porter AUCUN inset — " +
      "l'écran plein-cadre le porte lui-même. La garder hors exception ferait " +
      'rougir le témoin sur la règle qu’il défend.',
  ],
]);

/**
 * DEUX dossiers, parce qu'une racine plein-cadre n'habite pas forcément
 * `routes/` (#5816). `/auth/magic-link` monte `MagicLinkFlow` et
 * `MagicLinkValidation` — c'est le COMPOSANT qui porte `h-dvh`, la route ne
 * fait que choisir lequel des deux selon `?token=`. Scanner `routes/` seul
 * laissait ces écrans, et tout écran écrit de la même façon, hors du témoin :
 * l'énumération affirmait « tout écran plein-cadre », son balayage n'en voyait
 * qu'un dossier.
 */
const SCANNED = [
  { dir: ROUTES, prefix: '' },
  { dir: join(ROUTES, '..', 'components'), prefix: 'components/' },
];

const screenFiles = () =>
  SCANNED.flatMap(({ dir, prefix }) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
      .map((e) => ({ name: `${prefix}${e.name}`, path: join(dir, e.name) })),
  );

describe('les écrans plein-cadre portent eux-mêmes l’encoche haute', () => {
  test('la liste des écrans scannés n’est pas vide — sinon ce témoin ne garde rien', () => {
    const withFrame = screenFiles().filter((f) => FULL_FRAME.test(readFileSync(f.path, 'utf8')));
    expect(withFrame.length > 0).toBe(true);
  });

  test('les DEUX dossiers rendent des écrans plein-cadre — un balayage borgne se verrait ici', () => {
    const pleinCadre = screenFiles().filter((f) => FULL_FRAME.test(readFileSync(f.path, 'utf8')));
    /* `prefix` vaut '' pour `routes/` : compter par `startsWith` y compterait
       TOUT, et le témoin passerait au vert sur un balayage borgne. On compte
       donc les noms QUALIFIÉS d'un côté, les nus de l'autre. */
    const dansComposants = pleinCadre.filter((f) => f.name.startsWith('components/')).length;
    const dansRoutes = pleinCadre.filter((f) => !f.name.includes('/')).length;
    expect(dansRoutes > 0 && dansComposants > 0).toBe(true);
  });

  for (const file of screenFiles()) {
    const source = readFileSync(file.path, 'utf8');
    if (!FULL_FRAME.test(source)) continue;
    const reason = EXEMPT.get(file.name);

    test(`${file.name} — sa racine h-dvh porte pt-safe${reason === undefined ? '' : ' (exempté)'}`, () => {
      if (reason !== undefined) {
        expect(reason.length > 0).toBe(true);
        return;
      }
      expect(source.includes('pt-safe')).toBe(true);
    });
  }
});

describe('la coquille ne porte plus AUCUN inset', () => {
  test('app.css ne pose ni padding-top ni padding-bottom env(safe-area-*) sur body', () => {
    const css = readFileSync(join(ROUTES, '..', 'styles', 'app.css'), 'utf8');
    const opening = css.indexOf('\n  body {');
    expect(opening >= 0).toBe(true);
    /* Les COMMENTAIRES sont ôtés avant de chercher : le bloc `body` explique
       justement, en prose, la règle qu'il n'applique plus — sans cette ligne le
       témoin rougissait sur sa propre documentation. */
    const body = css.slice(opening, css.indexOf('\n  }', opening)).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/padding-(?:top|bottom)\s*:\s*(?:max\()?env\(safe-area/.test(body)).toBe(false);
  });
});
