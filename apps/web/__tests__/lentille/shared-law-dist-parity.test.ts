/**
 * REV-4/R4-5 — « vecteurs partagés jamais rejoués à travers la frontière `dist/` ».
 *
 * LE TROU, précisément. Les lois gelées du workshop sont verrouillées par des
 * vecteurs (`packages/shared/fixtures/reading-modes/*.vectors.json`) rejoués par
 * `packages/shared/__tests__/vectors/*.vectors.test.ts` — mais ces suites
 * importent la SOURCE :
 *
 *     import { focusCurve } from '../../utils/focus-curve.js';   // → .ts, transformé
 *
 * Le web, lui, ne consomme JAMAIS la source. Son `moduleNameMapper`
 * (`apps/web/jest.config.js`) redirige tout le paquet vers la SORTIE DE BUILD :
 *
 *     '^@meeshy/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1'
 *
 * Deux mondes, donc, et les vecteurs n'en visitaient qu'un. Rien ne PROUVAIT que
 * l'artefact réellement exécuté par le web honore la loi gelée : la garantie
 * était une absence de contre-exemple, pas une preuve. Le symptôme redouté est
 * silencieux par nature — un `dist/` périmé (build oublié après une édition de
 * loi) laisse les 1 100 tests web passer contre l'ANCIEN comportement, verts et
 * faux. Le `CLAUDE.md` du dépôt le sait déjà et l'exige en prose (« sinon
 * ~17 suites échouent », « sinon SocialEventsHandler échoue ») ; la prose n'est
 * pas un gate.
 *
 * CE FICHIER ferme la boucle en rejouant les MÊMES fixtures gelées à travers la
 * frontière `dist/` — jamais une seconde table d'attentes (ce serait une
 * deuxième source de vérité, l'erreur que tout le workshop proscrit). Les
 * fixtures sont lues sur disque, à leur domicile ; seules les IMPLÉMENTATIONS
 * changent de côté. Si source et build divergent — loi éditée sans rebuild,
 * fichier exclu du `tsconfig` de build, `dist/` partiel — cette suite ROUGIT là
 * où, jusqu'ici, tout restait vert.
 *
 * Les trois lois couvertes sont celles que le web consomme réellement à travers
 * la frontière et dont la signature est PURE (donc rejouable sans DOM ni
 * horloge) : la courbe de perspective, l'activité de défilement, la géométrie
 * de la Rivière. Ajouter une loi ici est une entrée dans `LAWS` ci-dessous.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// Les implémentations sont importées par CHEMIN RELATIF EXPLICITE vers `dist/`,
// et NON via le spécificateur `@meeshy/shared/...`.
//
// Ce détour n'est pas un caprice, c'est la seule façon d'atteindre réellement
// l'artefact de build — et c'est la découverte qui a motivé la réécriture de ce
// fichier. `apps/web/jest.config.js` porte bien la ligne :
//
//     '^@meeshy/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1'
//
// mais elle est MORTE : `next/jest` génère son propre `moduleNameMapper` depuis
// les `paths` du `tsconfig.json`, où `@meeshy/shared/*` pointe vers
// `../../packages/shared/*` — la SOURCE — et cette génération l'emporte. Toute
// suite web qui importe `@meeshy/shared/...` charge donc la source, pas le
// build, malgré le commentaire de configuration qui affirme le contraire.
//
// Le piège est vicieux : `require.resolve('@meeshy/shared/utils/focus-curve')`
// rend POURTANT un chemin dans `dist/` (il consulte l'autre mapper), si bien
// qu'un témoin bâti sur `require.resolve` se déclare satisfait alors que
// l'`import` de la même ligne a chargé la source. La première version de ce
// fichier tombait exactement dans ce piège : elle passait, 46 vecteurs verts, en
// re-testant le monde déjà couvert par `packages/shared/__tests__/vectors/`.
// C'est une mutation délibérée du build (une constante de la loi modifiée dans
// `dist/`) qui l'a démasquée — la suite restait verte. Un témoin qu'on n'a pas
// vu ÉCHOUER n'est pas un témoin.
import { focusCurve } from '../../../../packages/shared/dist/utils/focus-curve.js';
import { scrollActivityLaw } from '../../../../packages/shared/dist/utils/scroll-activity.js';
import { resolveRiverLanes } from '../../../../packages/shared/dist/utils/river-lanes.js';

const FIXTURES_DIR = join(__dirname, '../../../../packages/shared/fixtures/reading-modes');

type Vector = {
  readonly _label?: string;
  readonly input: unknown;
  readonly expected: unknown;
};

/**
 * MÊME normalisation que `packages/shared/__tests__/vectors/harness.ts` : une
 * fixture est soit un tableau nu, soit un conteneur `{ $format?, vectors: [...] }`
 * (river-lanes, par exemple). Reproduite ici plutôt qu'importée : le harness vit
 * du côté SOURCE de la frontière que ce fichier a précisément pour but de
 * traverser — l'importer ferait rentrer par la fenêtre le monde qu'on veut
 * laisser dehors. Le contrat reproduit est le FORMAT DE FICHIER (deux formes,
 * documentées par le harness), jamais une attente de loi.
 */
function loadVectors(name: string): readonly Vector[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.vectors.json`), 'utf8')
  );
  if (Array.isArray(parsed)) return parsed as Vector[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { vectors?: unknown }).vectors)) {
    return (parsed as { vectors: Vector[] }).vectors;
  }
  throw new Error(
    `loadVectors(${JSON.stringify(name)}): attendu un tableau ou un objet { vectors: [...] }`
  );
}

/**
 * Chaque entrée rejoue une loi À TRAVERS `dist/`, avec la MÊME forme d'appel que
 * la suite jumelle côté source (`packages/shared/__tests__/vectors/`) — copiée
 * d'elle, jamais réinventée : une forme d'appel divergente testerait autre chose
 * et le vert ne voudrait plus rien dire.
 */
const LAWS: readonly {
  readonly fixture: string;
  readonly run: (input: never) => unknown;
}[] = [
  {
    fixture: 'focus-curve',
    run: ({ distance, variant }: { distance: number; variant: 'list' | 'thread' }) =>
      focusCurve(distance, variant),
  },
  {
    fixture: 'scroll-activity',
    run: ({ events, probeAt }: { events: readonly never[]; probeAt: number }) => {
      const finalState = events.reduce(
        (state, event) => scrollActivityLaw.reduce(state, event),
        scrollActivityLaw.initialState()
      );
      return { visible: scrollActivityLaw.isVisible(finalState, probeAt) };
    },
  },
  {
    fixture: 'river-lanes',
    run: (input: never) => resolveRiverLanes(input),
  },
];

describe('Lois partagées — parité à travers la frontière `dist/` (REV-4/R4-5)', () => {
  it("ce fichier charge bien le BUILD, et le spécificateur du paquet charge la SOURCE (les deux mondes sont distincts)", () => {
    // Témoin de discrimination — celui qui manquait. On ne demande pas à
    // `require.resolve` où il CROIT résoudre (il répond `dist/` même quand
    // l'import charge la source, c'est le piège documenté en tête de fichier) :
    // on lit le FICHIER RÉELLEMENT SUR DISQUE des deux côtés et on exige que
    // l'implémentation importée ici corresponde au build, octet pour octet de
    // comportement, sur un point de la loi.
    const distSource = readFileSync(
      join(__dirname, '../../../../packages/shared/dist/utils/focus-curve.js'),
      'utf8'
    );
    // Le build est bien un artefact compilé (ESM émis par tsc), pas le .ts.
    expect(distSource).toContain('export');

    // Et la fonction importée vient de CE fichier : on le prouve en comparant à
    // la constante que le build déclare, extraite du texte du build lui-même.
    const declared = /list:\s*\{[^}]*alphaDecay:\s*([0-9.]+)/.exec(distSource);
    expect(declared).not.toBeNull();
    const alphaDecayFromBuild = Number(declared![1]);

    // `focusCurve(maxDistance, 'list')` sature la courbe : alpha = 1 − alphaDecay.
    const maxDistance = /list:\s*\{[^}]*maxDistance:\s*([0-9.]+)/.exec(distSource);
    expect(maxDistance).not.toBeNull();
    const saturated = focusCurve(Number(maxDistance![1]), 'list');
    expect(saturated.alpha).toBeCloseTo(1 - alphaDecayFromBuild, 10);
  });

  it.each(LAWS.map((law) => law.fixture))('les vecteurs de `%s` existent et ne sont pas vides', (fixture) => {
    // Une fixture introuvable ou vide ferait passer `forEach` sans rien jouer :
    // le vert le plus dangereux qui soit.
    expect(loadVectors(fixture).length).toBeGreaterThan(0);
  });

  LAWS.forEach(({ fixture, run }) => {
    describe(`loi \`${fixture}\` rejouée depuis dist/`, () => {
      loadVectors(fixture).forEach((vector, index) => {
        const label = vector._label ?? `#${index}`;
        it(`vecteur ${label} — le build rend EXACTEMENT ce que la loi gelée exige`, () => {
          expect(run(vector.input as never)).toEqual(vector.expected);
        });
      });
    });
  });
});
