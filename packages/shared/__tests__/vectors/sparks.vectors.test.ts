/**
 * Les vecteurs des ÉTINCELLES (#10846, #10847, #10848) — `fixtures/reading-modes/sparks.vectors.json`.
 *
 * Un fichier À PART de `game.vectors.json` : celui-ci est rejoué à l'identique par iOS (`GameLawVectorTests`), dont le test exige
 * la liste EXACTE de ses lois. Les lois neuves ne s'y glissent qu'avec leur miroir Swift (lot iOS) ; en attendant, ce fichier est la
 * référence que les lots SDK, iOS et web rejouent. `expected` est la sortie de la loi TypeScript : sur divergence, c'est le TS qui a raison.
 *
 * Régénération voulue : `UPDATE_SPARKS_VECTORS=1 npx vitest run __tests__/vectors/sparks.vectors.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gloryLadder } from '../../utils/game/glory.js';
import { levelThreshold } from '../../utils/game/levels.js';
import { effectiveMeeshPrice, mintCostFactorPermille, previewSparksMint, sparksOf } from '../../utils/game/sparks.js';
import { treasuryLockFor, treasuryReserveAccess } from '../../utils/game/treasury.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'reading-modes', 'sparks.vectors.json');

type Input =
  | { readonly law: 'mint-cost-factor'; readonly level: number }
  | { readonly law: 'mint-price'; readonly number: number; readonly level: number }
  | { readonly law: 'sparks-of'; readonly engagementScore?: number | null; readonly sparksSincePrestige?: number | null; readonly sparksEarnedLifetime?: number | null }
  | {
      readonly law: 'sparks-mint-preview';
      readonly sparks: number;
      readonly cycle: number;
      readonly mintedLifetime: number;
      readonly held: number;
      readonly glory: number;
      readonly levelCap: number | null;
    }
  | { readonly law: 'treasury-access'; readonly glory: number; readonly mythic?: boolean }
  | { readonly law: 'treasury-lock'; readonly held: number; readonly glory: number };

const evaluate = (input: Input): unknown => {
  switch (input.law) {
    case 'mint-cost-factor':
      return { permille: mintCostFactorPermille(input.level) };
    case 'mint-price':
      return { price: effectiveMeeshPrice(input.number, input.level) };
    case 'sparks-of':
      return sparksOf(input);
    case 'sparks-mint-preview': {
      const { levelCap, ...rest } = input;
      return previewSparksMint({ ...rest, levelCap, steps: null });
    }
    case 'treasury-access':
      return treasuryReserveAccess(input);
    case 'treasury-lock':
      return { lock: treasuryLockFor(input) };
  }
};

const minGlory = (rank: string, division5: number): number => gloryLadder().find((s) => s.rank === rank && s.division5 === division5)!.minGlory;

const CASES: readonly { readonly _label: string; readonly input: Input }[] = [
  ...[0, 1, 10, 50, 99, 100, 101, 500].map((level) => ({ _label: `facteur de coût au niveau ${level}`, input: { law: 'mint-cost-factor', level } as Input })),
  { _label: 'prix de la 1re pièce au niveau 1', input: { law: 'mint-price', number: 1, level: 1 } },
  { _label: 'prix de la 1re pièce au niveau 100', input: { law: 'mint-price', number: 1, level: 100 } },
  { _label: 'prix de la 11e pièce au niveau 50', input: { law: 'mint-price', number: 11, level: 50 } },
  { _label: 'prix de la 101e pièce au niveau 1 (plafond de rang)', input: { law: 'mint-price', number: 101, level: 1 } },
  { _label: 'prix de la 101e pièce au niveau 100 (plafond de rang)', input: { law: 'mint-price', number: 101, level: 100 } },
  { _label: 'étincelles d\'un compte à jour', input: { law: 'sparks-of', engagementScore: 200, sparksSincePrestige: 9000, sparksEarnedLifetime: 12_000 } },
  { _label: 'étincelles d\'un compte d\'avant le rattrapage', input: { law: 'sparks-of', engagementScore: 800 } },
  { _label: 'étincelles au-delà d\'un Int32', input: { law: 'sparks-of', engagementScore: 10, sparksSincePrestige: 2_147_483_700, sparksEarnedLifetime: 4_000_000_000 } },
  { _label: 'frappe : poche suffisante, niveau 9', input: { law: 'sparks-mint-preview', sparks: 5000, cycle: levelThreshold(9) + 100, mintedLifetime: 0, held: 0, glory: 0, levelCap: 499 } },
  { _label: 'frappe : poche vide, le niveau ne baisse pas', input: { law: 'sparks-mint-preview', sparks: 0, cycle: levelThreshold(9) + 100, mintedLifetime: 0, held: 0, glory: 0, levelCap: 499 } },
  { _label: 'frappe : la 100e pièce entre au Coffre sans le rang', input: { law: 'sparks-mint-preview', sparks: 90_000, cycle: levelThreshold(9), mintedLifetime: 99, held: 99, glory: 500, levelCap: 499 } },
  { _label: 'frappe : la 100e pièce entre au Coffre avec Voix I', input: { law: 'sparks-mint-preview', sparks: 90_000, cycle: levelThreshold(9), mintedLifetime: 99, held: 99, glory: minGlory('voix', 1), levelCap: 499 } },
  { _label: 'frappe : numéro indépendant de la bourse', input: { law: 'sparks-mint-preview', sparks: 90_000, cycle: levelThreshold(9), mintedLifetime: 7, held: 3, glory: 0, levelCap: 499 } },
  { _label: 'réserves sans rang', input: { law: 'treasury-access', glory: 0 } },
  { _label: 'réserves à Voix II (n\'ouvre pas le Coffre)', input: { law: 'treasury-access', glory: minGlory('voix', 2) } },
  { _label: 'réserves à Voix I (ouvre le Coffre)', input: { law: 'treasury-access', glory: minGlory('voix', 1) } },
  { _label: 'réserves à Polyglotte III (ouvre le Trésor)', input: { law: 'treasury-access', glory: minGlory('polyglotte', 3) } },
  { _label: 'réserves à Ambassadeur IV (ne rouvre pas la Réserve)', input: { law: 'treasury-access', glory: minGlory('ambassadeur', 4) } },
  { _label: 'réserves à Ambassadeur III (ouvre la Réserve)', input: { law: 'treasury-access', glory: minGlory('ambassadeur', 3) } },
  { _label: 'réserves du Mythe', input: { law: 'treasury-access', glory: 0, mythic: true } },
  { _label: 'verrou : la 99e est libre', input: { law: 'treasury-lock', held: 98, glory: 0 } },
  { _label: 'verrou : la 100e sans rang', input: { law: 'treasury-lock', held: 99, glory: 0 } },
  { _label: 'verrou : la 500e sous Polyglotte III', input: { law: 'treasury-lock', held: 499, glory: minGlory('voix', 1) } },
  { _label: 'verrou : la 1000e sous Ambassadeur III', input: { law: 'treasury-lock', held: 999, glory: minGlory('polyglotte', 3) } },
  { _label: 'verrou : la 1000e avec Ambassadeur III', input: { law: 'treasury-lock', held: 999, glory: minGlory('ambassadeur', 3) } },
];

const FORMAT = '{ law, ...paramètres } — la loi des étincelles (mint-cost-factor, mint-price, sparks-of, sparks-mint-preview, treasury-access, treasury-lock). `expected` est la sortie de la loi TypeScript (utils/game/sparks.ts, treasury.ts).';

const render = (): string =>
  `${JSON.stringify({ $format: FORMAT, vectors: CASES.map((c) => ({ ...c, expected: JSON.parse(JSON.stringify(evaluate(c.input))) })) }, null, 2)}\n`;

if (process.env.UPDATE_SPARKS_VECTORS === '1') writeFileSync(FILE, render());

describe('sparks.vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(JSON.parse(render()));
  });

  it('couvre chaque loi par au moins un cas', () => {
    expect([...new Set(CASES.map((c) => c.input.law))].sort()).toEqual(
      ['mint-cost-factor', 'mint-price', 'sparks-mint-preview', 'sparks-of', 'treasury-access', 'treasury-lock'].sort(),
    );
  });

  it('chaque cas rejoue sa sortie attendue', () => {
    const file = JSON.parse(readFileSync(FILE, 'utf-8')) as { vectors: { input: Input; expected: unknown }[] };
    for (const vector of file.vectors) expect(JSON.parse(JSON.stringify(evaluate(vector.input)))).toEqual(vector.expected);
  });
});
