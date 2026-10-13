/**
 * LE SITE UNIQUE DES ÉCRITURES D'`EngagementCounter.points` ET `count` (#10541).
 *
 * ## Pourquoi une commande brute et non `increment`
 *
 * Prisma n'envoie pas `$inc` sur MongoDB : il traduit `{ increment: n }` et
 * `{ decrement: n }` en pipeline `$set: { champ: { $add: ['$champ', ±n] } }`, et
 * `$add` rend `null` dès qu'un opérande est absent ou `null` (#6428). L'écriture
 * RÉUSSIT, la colonne reste `null`, et Prisma la relit `0` : aucune erreur,
 * aucune ligne de journal.
 *
 * Le score a été sorti de ce piège en septembre (`updateEngagementScore`) ; le
 * compteur, non. Mesuré en production le 2026-10-13 : 24 lignes créées entre le
 * 2026-09-08 et le 2026-09-10 portent `points` à `null` (23) ou absent (1).
 * Chaque geste sur l'une d'elles montait le score et laissait le compteur à
 * `null` — 110 000 points de score que la frappe ne pouvait plus convertir,
 * dont 62 154 sur un seul compte. Le défaut restait ACTIF : quatorze de ces
 * lignes sont des `content.text_message`, l'axe le plus fréquent.
 *
 * Les trois écritures ci-dessous traitent `null` ET l'absence comme zéro par
 * `$ifNull`, en UNE commande atomique chacune. L'invariant qu'elles tiennent
 * avec le score : `User.engagementScore == Σ(EngagementCounter.points)`.
 *
 * ## Ce qui a été mesuré, et sur quoi
 *
 * Sur un MongoDB 8.0.4 jetable, avec le client Prisma du dépôt (2026-10-13) :
 *
 *     points ABSENT ou NULL + `{ increment: 5 }`   ->  null en base, relu 0
 *     points NULL + `{ decrement: 2 }`             ->  null en base
 *     `creditEngagementCounter` sur les deux       ->  le nombre attendu
 *     ligne inexistante                            ->  créée, relisible par Prisma
 *     quarante crédits simultanés d'une ligne neuve ->  une ligne, quarante actions
 *     la commande DANS une transaction annulée     ->  rien n'est écrit
 *     la commande en conflit dans une transaction  ->  P2034, comme une écriture typée
 *
 * Les deux dernières lignes sont ce qui permet à `creditGamePoints` et à la
 * frappe de passer par ici sans perdre leur atomicité : `tx.$runCommandRaw`
 * s'exécute dans la session de la transaction et se rejoue avec elle.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne RÉPARE aucune ligne existante. Une ligne à `null` repart de zéro au
 * prochain crédit ; les points que le score a reçus pendant qu'elle était à
 * `null` restent un écart, qu'une reprise de données décidée par le porteur
 * solde (#10541, option D). Une écriture en VALEUR (`data: { points: 0 }`, le
 * Prestige) n'a pas à passer par ici : poser un nombre ne fabrique jamais `null`.
 *
 * Garde de source : `__tests__/unit/engagement-counter-points-write-guard.test.ts`.
 */

/** `prisma` ou le client d'une transaction : les deux exécutent la commande dans leur session. */
export type EngagementCounterDb = {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
};

/** `@@map` absent du modèle : la collection porte le nom du modèle. */
const COUNTER_COLLECTION = 'EngagementCounter';

export type EngagementCounterKey = {
  readonly userId: string;
  /** La clé de l'opération créditée — un axe de « Progression » ou une opération du catalogue. */
  readonly axisKey: string;
};

/** Ce que la ligne porte après l'écriture : ses actions comptées et ses points. */
export type EngagementCounterState = {
  readonly count: number;
  readonly points: number;
};

type FindAndModifyResult = {
  readonly value?: { readonly count?: unknown; readonly points?: unknown } | null;
};

const rowQuery = ({ userId, axisKey }: EngagementCounterKey) => ({ userId: { $oid: userId }, axisKey });

/** La colonne telle qu'elle doit se lire : `null` et l'absence valent zéro. */
const held = (column: 'count' | 'points') => ({ $ifNull: [`$${column}`, 0] });

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stateOf = (result: unknown): EngagementCounterState | null => {
  const value = (result as FindAndModifyResult | null | undefined)?.value;
  if (value === null || value === undefined) return null;
  return { count: numberOr(value.count, 0), points: numberOr(value.points, 0) };
};

/**
 * Crédite `points` et `count` actions à la ligne, qu'elle existe ou non, que ses
 * colonnes soient des nombres, `null` ou absentes. Rend l'état NEUF : le compte
 * d'actions dont `credit` a besoin pour savoir quels badges ce geste franchit.
 *
 * `count: 0` crédite des points sans compter d'action — les points du jeu, qui
 * sont déjà le résultat d'un geste admis.
 *
 * La création passe par l'`upsert` de la commande : deux crédits simultanés
 * d'une ligne neuve se départagent sur l'index unique `(userId, axisKey)`, que le
 * serveur rejoue de lui-même hors transaction ; dans une transaction, le doublon
 * annule la tentative, que l'appelant rejoue en bloc.
 */
export async function creditEngagementCounter(
  db: EngagementCounterDb,
  credit: EngagementCounterKey & { readonly points: number; readonly count: number },
): Promise<EngagementCounterState> {
  const result = await db.$runCommandRaw({
    findAndModify: COUNTER_COLLECTION,
    query: rowQuery(credit),
    update: [
      {
        $set: {
          count: { $add: [held('count'), credit.count] },
          points: { $add: [held('points'), credit.points] },
          updatedAt: '$$NOW',
        },
      },
    ],
    upsert: true,
    new: true,
    fields: { count: 1, points: 1 },
  });
  return stateOf(result) ?? { count: credit.count, points: credit.points };
}

/**
 * Débite EXACTEMENT `points` et `count` actions, ou rien — la frappe.
 *
 * La couverture est une condition de la commande elle-même : une ligne qui ne
 * tient pas ce qu'on lui demande (elle a bougé depuis le plan, ou sa colonne est
 * `null`) n'est pas touchée, et l'appelant reçoit `null`. Un décrément nu y
 * aurait écrit un négatif, ou `null` sur `null`, pendant que le score perdait
 * le prix entier.
 *
 * Rend l'état RESTANT : le compte d'actions dit quels badges s'éteignent.
 */
export async function debitEngagementCounter(
  db: EngagementCounterDb,
  debit: EngagementCounterKey & { readonly points: number; readonly count: number },
): Promise<EngagementCounterState | null> {
  const result = await db.$runCommandRaw({
    findAndModify: COUNTER_COLLECTION,
    query: {
      ...rowQuery(debit),
      ...(debit.points > 0 ? { points: { $gte: debit.points } } : {}),
      ...(debit.count > 0 ? { count: { $gte: debit.count } } : {}),
    },
    update: [
      {
        $set: {
          count: { $subtract: [held('count'), debit.count] },
          points: { $subtract: [held('points'), debit.points] },
          updatedAt: '$$NOW',
        },
      },
    ],
    new: true,
    fields: { count: 1, points: 1 },
  });
  return stateOf(result);
}

/**
 * Reprend JUSQU'À `points` à la ligne, et une action — un contenu retiré.
 *
 * Rend ce que la ligne a RÉELLEMENT rendu, que l'appelant retire du score : pas
 * un point de plus. Une ligne qu'une frappe a déjà entamée rend ce qui lui
 * reste ; une ligne vide, `null` ou absente ne rend rien et n'est pas touchée.
 * C'est ce qui tient l'invariant dans ce sens-là : la version précédente
 * débitait le compteur sous condition et le score sans condition, donc une
 * reprise sur une ligne déjà convertie en Meesh faisait payer le score seul.
 *
 * Le montant se lit dans l'image d'AVANT que la même commande rend (`new:
 * false`) : une seule écriture, aucune fenêtre entre la lecture et le débit.
 */
export async function takeBackFromEngagementCounter(
  db: EngagementCounterDb,
  reclaim: EngagementCounterKey & { readonly points: number },
): Promise<number> {
  if (!(reclaim.points > 0)) return 0;
  const result = await db.$runCommandRaw({
    findAndModify: COUNTER_COLLECTION,
    query: { ...rowQuery(reclaim), points: { $gt: 0 } },
    update: [
      {
        $set: {
          count: { $max: [0, { $subtract: [held('count'), 1] }] },
          points: { $max: [0, { $subtract: [held('points'), reclaim.points] }] },
          updatedAt: '$$NOW',
        },
      },
    ],
    new: false,
    fields: { count: 1, points: 1 },
  });
  const before = stateOf(result);
  if (before === null) return 0;
  return Math.min(reclaim.points, Math.max(0, before.points));
}
