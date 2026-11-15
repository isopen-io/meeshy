/**
 * Les vecteurs de l'ÉDITION DESSINÉE d'une Meesh (#11483) — `fixtures/reading-modes/meesh-display-edition.vectors.json`.
 *
 * Le porteur, le 2026-10-21 : « Le n° 247 dessiné en or ». La LOI (`meeshEdition`) décide de la frappe — un coup,
 * trois coups et les aïeux, la nuit du prisme ; le DESSIN (`meeshDisplayEdition`) est la plus haute édition atteinte.
 * Un fichier À PART de `game.vectors.json`, dont iOS (`GameLawVectorTests`) exige la liste EXACTE des lois : le
 * miroir du SDK rejoue CE fichier. Une valeur illisible s'écrit en chaîne (`"NaN"`, `"Infinity"`, `"-Infinity"`),
 * que chaque miroir relit en nombre. `expected` est la sortie de la loi TypeScript : sur divergence, le TS a raison.
 *
 * Régénération voulue : `UPDATE_MEESH_DISPLAY_EDITION_VECTORS=1 npx vitest run __tests__/vectors/meesh-display-edition.vectors.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meeshDisplayEdition, meeshEdition, type MeeshEdition } from '../../utils/game/mint.js';
import { mintCeremonyPlan, type MintCeremonyMode } from '../../utils/game/mint-ceremony.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'reading-modes', 'meesh-display-edition.vectors.json');

type Unreadable = 'NaN' | 'Infinity' | '-Infinity';
type Input =
  | { readonly law: 'meesh-display-edition'; readonly n: number | Unreadable }
  | { readonly law: 'mint-ceremony-plan'; readonly edition: MeeshEdition; readonly look: MeeshEdition; readonly mode: MintCeremonyMode; readonly answeredAtMs?: number };

const numberOf = (n: number | Unreadable): number => (typeof n === 'number' ? n : Number(n));

const evaluate = (input: Input): unknown => {
  switch (input.law) {
    case 'meesh-display-edition':
      return { edition: meeshEdition(numberOf(input.n)), displayEdition: meeshDisplayEdition(numberOf(input.n)) };
    case 'mint-ceremony-plan': {
      const { law: _law, ...rest } = input;
      return JSON.parse(JSON.stringify(mintCeremonyPlan(rest)));
    }
  }
};

const NUMBERS: readonly { readonly n: number | Unreadable; readonly _label: string }[] = [
  { n: 0, _label: 'aucune pièce : le flan d’argent' },
  { n: 1, _label: 'la première : argent' },
  { n: 99, _label: 'la dernière avant l’or : argent' },
  { n: 100, _label: 'la première d’or : or' },
  { n: 101, _label: 'après l’or, une pièce ordinaire se dessine en or' },
  { n: 247, _label: 'le n° 247 dessiné en or (porteur, 2026-10-21)' },
  { n: 999, _label: 'la dernière avant le prisme : or' },
  { n: 1000, _label: 'la première prisme : prisme' },
  { n: 1001, _label: 'après le prisme, une pièce ordinaire se dessine en prisme' },
  { n: 1999, _label: 'une pièce ordinaire du deuxième millier : prisme' },
  { n: 2000, _label: 'le deuxième millième : prisme' },
  { n: 247.9, _label: 'illisible : un numéro fractionnaire se tronque' },
  { n: -1, _label: 'illisible : négatif, comme la loi' },
  { n: -150, _label: 'illisible : négatif au-delà de cent, comme la loi' },
  { n: 'NaN', _label: 'illisible : NaN, comme la loi' },
  { n: 'Infinity', _label: 'illisible : l’infini, comme la loi' },
  { n: '-Infinity', _label: 'illisible : moins l’infini, comme la loi' },
];

const CEREMONIES: readonly { readonly _label: string; readonly input: Input }[] = [
  { _label: 'le n° 247 : un coup d’argent, des poussières d’or', input: { law: 'mint-ceremony-plan', edition: 'silver', look: 'gold', mode: 'normal' } },
  { _label: 'le n° 1001 : un coup d’argent, l’or et le diamant', input: { law: 'mint-ceremony-plan', edition: 'silver', look: 'prism', mode: 'normal' } },
  { _label: 'le n° 1100 : trois coups d’or et les aïeux, l’or et le diamant', input: { law: 'mint-ceremony-plan', edition: 'gold', look: 'prism', mode: 'normal' } },
  { _label: 'le n° 247 refusé : la poussière d’or se dénoue', input: { law: 'mint-ceremony-plan', edition: 'silver', look: 'gold', mode: 'refused', answeredAtMs: 2600 } },
  { _label: 'le n° 247 en animations réduites : un fondu', input: { law: 'mint-ceremony-plan', edition: 'silver', look: 'gold', mode: 'reduced' } },
];

const CASES: readonly { readonly _label: string; readonly input: Input }[] = [
  ...NUMBERS.map(({ n, _label }): { readonly _label: string; readonly input: Input } => ({ _label, input: { law: 'meesh-display-edition', n } })),
  ...CEREMONIES,
];

const FORMAT =
  '{ law, ...paramètres } — meesh-display-edition { n } : `edition` est la LOI de la frappe (meeshEdition), `displayEdition` le DESSIN (meeshDisplayEdition, la plus haute édition atteinte) ; une valeur illisible s’écrit en chaîne ("NaN", "Infinity", "-Infinity"). mint-ceremony-plan { edition, look, mode } : la cérémonie d’une pièce dont la LOI (`edition`) règle les coups et les aïeux et le DESSIN (`look`) les poussières. `expected` est la sortie des lois TypeScript (utils/game/mint.ts, utils/game/mint-ceremony.ts).';

const render = (): string => `${JSON.stringify({ $format: FORMAT, vectors: CASES.map((c) => ({ ...c, expected: evaluate(c.input) })) }, null, 2)}\n`;

if (process.env.UPDATE_MEESH_DISPLAY_EDITION_VECTORS === '1') writeFileSync(FILE, render());

describe('meesh-display-edition.vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(JSON.parse(render()));
  });

  it('chaque cas rejoue sa sortie attendue', () => {
    const file = JSON.parse(readFileSync(FILE, 'utf-8')) as { vectors: { input: Input; expected: unknown }[] };
    expect(file.vectors.length).toBe(CASES.length);
    for (const vector of file.vectors) expect(evaluate(vector.input)).toEqual(vector.expected);
  });

  it('frappe le n° 247 d’un seul coup, dans la poussière d’or', () => {
    const plan = mintCeremonyPlan({ edition: 'silver', look: 'gold', mode: 'normal' });
    expect(plan.strikes).toHaveLength(1);
    expect(plan.grand).toBe(false);
    expect(plan.phases.ancestors).toBeNull();
    expect(plan.particles.dust).toEqual(mintCeremonyPlan({ edition: 'gold', mode: 'normal' }).particles.dust);
  });

  it('sans dessin, la cérémonie reste celle de sa loi', () => {
    for (const edition of ['silver', 'gold', 'prism'] as const) expect(mintCeremonyPlan({ edition, look: edition, mode: 'normal' })).toEqual(mintCeremonyPlan({ edition, mode: 'normal' }));
  });

  it('dessine le n° 247 en or sous une loi d’argent', () => {
    expect(evaluate({ law: 'meesh-display-edition', n: 247 })).toEqual({ edition: 'silver', displayEdition: 'gold' });
  });
});
