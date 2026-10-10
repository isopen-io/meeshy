/**
 * CE QU'UN GESTE DÉPENSE OU EXIGE (#9705) — montré AVANT le geste, jamais
 * découvert après : ce qu'on a, ce que le geste coûte, ce qui restera — ou,
 * quand le solde ne suffit pas, ce qui manque. Une exigence (un niveau requis)
 * se lit de la même façon : où l'on en est, le seuil, l'écart.
 *
 * Pur et sans prix : le prix et le seuil viennent de la loi du geste (la frappe,
 * la Flamme, la saison, les missions, la ligue, le duo, le Prestige) ou du bloc
 * servi. Les clients le montrent, le serveur reste juge à l'écriture.
 *
 * `spendable` distingue le SOLDE de la PART qui peut payer : une frappe se
 * retranche des points en poche, mais seuls les points convertibles la paient
 * (`computeMeeshMintPlan`). Absente, toute la mise paie.
 */

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

export type SpendPreview = {
  readonly held: number;
  readonly cost: number;
  /** Le solde après le geste ; égal à `held` quand le geste n'est pas possible. */
  readonly after: number;
  /** `0` quand le geste est possible. */
  readonly missing: number;
  readonly affordable: boolean;
};

export function spendPreview(params: { readonly held: number; readonly cost: number; readonly spendable?: number }): SpendPreview {
  const held = count(params.held);
  const cost = count(params.cost);
  const spendable = params.spendable === undefined ? held : Number.isNaN(params.spendable) ? 0 : Math.max(0, params.spendable);
  const affordable = spendable >= cost;
  return {
    held,
    cost,
    after: affordable ? Math.max(0, held - cost) : held,
    missing: affordable ? 0 : Math.ceil(cost - spendable),
    affordable,
  };
}

export type RequirementPreview = {
  readonly current: number;
  readonly required: number;
  /** `0` quand l'exigence est remplie. */
  readonly missing: number;
  readonly met: boolean;
};

export function requirementPreview(params: { readonly current: number; readonly required: number }): RequirementPreview {
  const current = count(params.current);
  const required = count(params.required);
  const met = current >= required;
  return { current, required, missing: met ? 0 : required - current, met };
}
