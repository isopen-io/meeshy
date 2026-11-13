/**
 * Le verdict à TROIS valeurs d'une lecture de plan de remise — déclaré UNE fois
 * (#17068, constat n°9 de l'audit de #17026).
 *
 * ─── Pourquoi trois, et pourquoi elles ne se collapsent pas ──────────────────
 *
 * | valeur | ce qu'elle dit | ce que l'appelant fait |
 * |---|---|---|
 * | un plan | « voici qui adresser, et comment signer pour lui » | remise par lecteur |
 * | `null` | « personne n'est à adresser par lecteur » | diffusion de room ordinaire |
 * | `'unavailable'` | « je ne SAIS pas adresser » | RIEN en direct, et la suite a lieu |
 *
 * `'unavailable'` n'est PAS `null`. Les confondre ferait retomber sur la
 * diffusion de room un message dont on vient d'établir qu'une pièce se lit PAR
 * LECTEUR : l'adresse nue d'une pièce peut-être protégée partirait à toute la
 * room. Et ce n'est pas non plus un `throw` : un `catch` de fin de méthode chez
 * l'appelant emporterait l'enfilage durable qui SUIT l'émission.
 *
 * ─── Pourquoi un module, et pas deux unions ──────────────────────────────────
 *
 * Elles étaient DEUX : `ReaderSignedPlanOutcome` et, écrite à la main,
 * `EditedReaderPlan | null | 'unavailable'`. La structure l'expliquait — le
 * second type est RÉDUIT à ce que son unité consomme — mais c'était la jumelle
 * d'un type dont **tout l'argument est qu'on ne doit pas collapser ses
 * valeurs** : si l'une gagne une QUATRIÈME valeur, l'autre ne la connaît pas, et
 * le site qui les relie compile.
 *
 * Avec un générique, on ne peut plus en élargir une seule. Ce que le générique
 * ne peut pas garder — une union RETAPÉE à la main ailleurs — l'est par
 * `__tests__/plan-outcome-single-declaration.test.ts`, même forme que la garde
 * de `server-emit-door-sweep` : une porte se ferme, puis se contourne.
 */

/**
 * La valeur, nommée. Un appelant compare `=== PLAN_UNAVAILABLE` plutôt que
 * `=== 'unavailable'` — ce qui rend le site FINDABLE et le fait participer au
 * renommage, au lieu de dépendre d'une chaîne recopiée.
 */
export const PLAN_UNAVAILABLE = 'unavailable' as const;

export type PlanOutcome<T> = T | null | typeof PLAN_UNAVAILABLE;

/**
 * Cliquet de TYPE, ici plutôt que dans un témoin : `tsconfig.json` EXCLUT
 * `__tests__`, donc une assertion posée là-bas ne serait jamais lue par `tsc`
 * — elle ne pourrait pas rougir. Même raison que `ServerEmitRatchet`, qui vit
 * dans `serverEmit.ts` et pas dans sa suite.
 *
 * Ce qu'il garde : les trois valeurs sont bien là, et `null` n'absorbe pas
 * `'unavailable'`.
 */
type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

export type PlanOutcomeRatchet = [
  Assert<Extends<null, PlanOutcome<{ a: 1 }>>>,
  Assert<Extends<typeof PLAN_UNAVAILABLE, PlanOutcome<{ a: 1 }>>>,
  Assert<Extends<{ a: 1 }, PlanOutcome<{ a: 1 }>>>,
  // `'unavailable'` n'est PAS assignable à un plan nullable : c'est la
  // troisième valeur, et cette ligne est ce qui le PROUVE.
  Assert<Extends<typeof PLAN_UNAVAILABLE, { a: 1 } | null> extends false ? true : false>,
];
