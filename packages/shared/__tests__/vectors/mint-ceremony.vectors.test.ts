/**
 * Les vecteurs de la CÉRÉMONIE DE LA FRAPPE (#11177) — `fixtures/reading-modes/mint-ceremony.vectors.json`.
 *
 * Un fichier À PART de `game.vectors.json` : celui-ci est rejoué à l'identique par iOS (`GameLawVectorTests`), dont
 * le test exige la liste EXACTE de ses lois. Le miroir Swift de la cérémonie (lot E, partie iOS) rejoue CE fichier :
 * les instants de chaque phase, les coups et leurs frappeurs, les particules, le refus et le fondu. `expected` est
 * la sortie de la loi TypeScript (`utils/game/mint-ceremony.ts`) : sur divergence, c'est le TS qui a raison.
 *
 * Régénération voulue : `UPDATE_MINT_CEREMONY_VECTORS=1 npx vitest run __tests__/vectors/mint-ceremony.vectors.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MeeshEdition } from '../../utils/game/mint.js';
import { mintCeremonyPlan, mintCeremonySkip, mintRefusalReason, type MintCeremonyMode } from '../../utils/game/mint-ceremony.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'reading-modes', 'mint-ceremony.vectors.json');

type Input =
  | { readonly law: 'mint-ceremony-plan'; readonly edition: MeeshEdition; readonly mode: MintCeremonyMode; readonly answeredAtMs?: number; readonly modest?: boolean }
  | { readonly law: 'mint-ceremony-skip'; readonly edition: MeeshEdition; readonly mode: MintCeremonyMode; readonly answeredAtMs?: number; readonly atMs: number }
  | { readonly law: 'mint-refusal-reason'; readonly code: string | null };

const evaluate = (input: Input): unknown => {
  switch (input.law) {
    case 'mint-ceremony-plan': {
      const { law: _law, ...rest } = input;
      return mintCeremonyPlan(rest);
    }
    case 'mint-ceremony-skip': {
      const { law: _law, atMs, ...rest } = input;
      return { toMs: mintCeremonySkip(mintCeremonyPlan(rest), atMs) };
    }
    case 'mint-refusal-reason':
      return { reason: mintRefusalReason(input.code) };
  }
};

const EDITIONS = ['silver', 'gold', 'prism'] as const;

const CASES: readonly { readonly _label: string; readonly input: Input }[] = [
  ...EDITIONS.map((edition) => ({ _label: `${edition} : la passerelle répond à temps`, input: { law: 'mint-ceremony-plan', edition, mode: 'normal' } as Input })),
  ...EDITIONS.map((edition) => ({ _label: `${edition} : la passerelle répond à 6,3 s, le marteau reste levé`, input: { law: 'mint-ceremony-plan', edition, mode: 'normal', answeredAtMs: 6300 } as Input })),
  { _label: 'prisme sur un appareil modeste : moitié moins de particules', input: { law: 'mint-ceremony-plan', edition: 'prism', mode: 'normal', modest: true } },
  { _label: 'argent : une réponse avant le marteau ne change rien', input: { law: 'mint-ceremony-plan', edition: 'silver', mode: 'normal', answeredAtMs: 420 } },
  { _label: 'refus rapide : l’Ombre se dit au plus tôt à 1,5 s', input: { law: 'mint-ceremony-plan', edition: 'silver', mode: 'refused', answeredAtMs: 300 } },
  { _label: 'refus pendant la poussière', input: { law: 'mint-ceremony-plan', edition: 'gold', mode: 'refused', answeredAtMs: 2600 } },
  { _label: 'refus tardif, marteau levé : le flan se dénoue aussi', input: { law: 'mint-ceremony-plan', edition: 'prism', mode: 'refused', answeredAtMs: 6000 } },
  ...EDITIONS.map((edition) => ({ _label: `${edition} : animations réduites, un fondu`, input: { law: 'mint-ceremony-plan', edition, mode: 'reduced' } as Input })),
  { _label: 'animations réduites : la pièce attend la réponse', input: { law: 'mint-ceremony-plan', edition: 'silver', mode: 'reduced', answeredAtMs: 900 } },
  { _label: 'toucher pendant le tissage : l’état final', input: { law: 'mint-ceremony-skip', edition: 'gold', mode: 'normal', atMs: 1200 } },
  { _label: 'toucher après la fin : rien ne recule', input: { law: 'mint-ceremony-skip', edition: 'silver', mode: 'normal', atMs: 9000 } },
  { _label: 'toucher pendant un refus', input: { law: 'mint-ceremony-skip', edition: 'silver', mode: 'refused', answeredAtMs: 2000, atMs: 2500 } },
  ...['MINT_BLOCKED_BY_DEBT', 'TREASURY_LOCKED', 'INSUFFICIENT_POINTS', 'NETWORK', 'PRICE_CHANGED', null].map((code) => ({
    _label: `refus ${code ?? 'sans code'}`,
    input: { law: 'mint-refusal-reason', code } as Input,
  })),
];

const FORMAT =
  '{ law, ...paramètres } — la loi de la cérémonie de la frappe (mint-ceremony-plan, mint-ceremony-skip, mint-refusal-reason). Instants en millisecondes entières depuis le toucher. `expected` est la sortie de la loi TypeScript (utils/game/mint-ceremony.ts).';

const render = (): string => `${JSON.stringify({ $format: FORMAT, vectors: CASES.map((c) => ({ ...c, expected: JSON.parse(JSON.stringify(evaluate(c.input))) })) }, null, 2)}\n`;

if (process.env.UPDATE_MINT_CEREMONY_VECTORS === '1') writeFileSync(FILE, render());

describe('mint-ceremony.vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(JSON.parse(render()));
  });

  it('couvre chaque loi, chaque édition et chaque mode', () => {
    expect([...new Set(CASES.map((c) => c.input.law))].sort()).toEqual(['mint-ceremony-plan', 'mint-ceremony-skip', 'mint-refusal-reason']);
    const plans = CASES.flatMap((c) => (c.input.law === 'mint-ceremony-plan' ? [`${c.input.edition}/${c.input.mode}`] : []));
    for (const edition of EDITIONS) for (const mode of ['normal', 'reduced', 'refused'] as const) expect(plans).toContain(`${edition}/${mode}`);
  });

  it('chaque cas rejoue sa sortie attendue', () => {
    const file = JSON.parse(readFileSync(FILE, 'utf-8')) as { vectors: { input: Input; expected: unknown }[] };
    expect(file.vectors.length).toBeGreaterThan(0);
    for (const vector of file.vectors) expect(JSON.parse(JSON.stringify(evaluate(vector.input)))).toEqual(vector.expected);
  });
});
