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
 * `$ifNull`, en UNE commande atomique chacune. Un crédit écrit le MÊME montant
 * au compteur et à la poche ; une reprise retire à la poche ce que les
 * compteurs ont rendu. Mais la frappe débite la poche sans toucher aucun
 * compteur (#10846) : `User.engagementScore == Σ(EngagementCounter.points)`
 * n'est PAS un invariant depuis les étincelles. Celui de la poche (#10892) :
 * `sparksEarnedLifetime − engagementScore + sparksDebt == Σ(prix des frappes au registre) + Σ(poches vidées au Prestige)`.
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
 * Et sur des lignes semées en `NumberLong` — la norme en production, 616 lignes
 * sur 675 — avec des opérandes Int32 :
 *
 *     `$gte` / `$gt` Int32 contre un `long` stocké  ->  comparaison numérique, juste
 *     `$add` / `$subtract` `long` ± Int32            ->  la colonne RESTE `long`
 *     `$max: [0, …]` qui retombe à zéro              ->  la colonne devient `int` (le 0 littéral)
 *     colonne `null` créditée                        ->  `int`
 *     la valeur rendue par la commande               ->  un nombre nu, `long` compris
 *
 * `int`, `long` et `double` se relisent tous par Prisma (`Int`) : le type BSON
 * d'une colonne peut changer à zéro sans que rien ne le voie.
 *
 * Les deux lignes sur la transaction sont ce qui permet à `creditGamePoints` et à la
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

import { rawCommandNumber } from './rawCommandNumber';

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

/**
 * La ligne que la commande rend. Ses colonnes se lisent par `rawCommandNumber` :
 * un `long` peut revenir en `{ $numberLong }`, et le lire zéro détruirait des
 * points. `null` et l'absence d'une colonne valent zéro — c'est l'état fautif
 * que ce module répare, pas une valeur illisible.
 */
const stateOf = (result: unknown): EngagementCounterState | null => {
  const value = (result as FindAndModifyResult | null | undefined)?.value;
  if (value === null || value === undefined) return null;
  return { count: rawCommandNumber(value.count) ?? 0, points: rawCommandNumber(value.points) ?? 0 };
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
 * Reprend JUSQU'À `points` à la ligne, et `actions` actions (une pour le
 * compteur du contenu retiré, zéro pour un compteur qui ne fait que payer un
 * reliquat — voir `takeBackAcrossEngagementCounters`).
 *
 * Rend ce que la ligne a RÉELLEMENT rendu. Une ligne entamée rend ce qui lui
 * reste ; une ligne vide, `null` ou absente ne rend rien et n'est pas touchée,
 * pas même son compte d'actions. Jamais de négatif.
 *
 * Le montant se lit dans l'image d'AVANT que la même commande rend (`new:
 * false`) : une seule écriture, aucune fenêtre entre la lecture et le débit.
 */
export async function takeBackFromEngagementCounter(
  db: EngagementCounterDb,
  reclaim: EngagementCounterKey & { readonly points: number; readonly actions: 0 | 1 },
): Promise<number> {
  if (!(reclaim.points > 0)) return 0;
  const result = await db.$runCommandRaw({
    findAndModify: COUNTER_COLLECTION,
    query: { ...rowQuery(reclaim), points: { $gt: 0 } },
    update: [
      {
        $set: {
          ...(reclaim.actions > 0 ? { count: { $max: [0, { $subtract: [held('count'), reclaim.actions] }] } } : {}),
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

/** Ce qu'une reprise a rendu, et ce qui l'a interrompue si un compteur a failli. */
export type EngagementTakeBack = {
  readonly taken: number;
  readonly failure?: unknown;
};

/**
 * Reprend `points` au COMPTE : d'abord au compteur du contenu retiré, qui perd
 * une action, puis — s'il rend moins — le reliquat aux compteurs de
 * `fallbackAxes`, dans l'ordre donné, sans leur retirer d'action.
 *
 * ## Pourquoi le reliquat va chercher ailleurs
 *
 * La frappe retire au score le PRIX d'une Meesh, pas les points d'un contenu :
 * elle les prend au rang le plus renouvelable qui en tient, donc souvent sur le
 * compteur même du contenu qu'on supprimera ensuite. Borner la reprise à ce
 * seul compteur laissait au compte ce que la frappe y avait pris : deux réels
 * publiés (2 000), une frappe (1 221), les deux réels supprimés — le score
 * gardait 1 221 points d'un contenu disparu, soit une Meesh gratuite, rejouable
 * chaque jour (audit du 2026-10-13). Le reliquat se prend donc là où la frappe
 * l'aurait pris : l'appelant passe l'ordre de débit (`MEESH_DEBIT_ORDER`).
 *
 * Les autres compteurs ne perdent que des POINTS : leurs actions tiennent leurs
 * badges, et le contenu retiré n'en était pas une chez eux.
 *
 * ## Ce que l'appelant fait du résultat
 *
 * `taken` est la somme RÉELLEMENT reprise, à retirer de la poche (ce qu'elle
 * ne peut rendre devient une dette). Un compte qui n'a plus rien nulle part
 * rend ce qui existe, jamais plus.
 *
 * **Pas de transaction.** Chaque compteur est débité par sa propre commande
 * atomique. Si l'une d'elles échoue en route, la fonction s'arrête et rend ce
 * qu'elle a déjà repris, avec `failure` : l'appelant retire CE montant du score
 * avant de relancer l'erreur, pour que les compteurs déjà débités ne restent
 * pas sans leur débit de score.
 */
export async function takeBackAcrossEngagementCounters(
  db: EngagementCounterDb,
  reclaim: EngagementCounterKey & { readonly points: number; readonly fallbackAxes: readonly string[] },
): Promise<EngagementTakeBack> {
  const steps: readonly { readonly axisKey: string; readonly actions: 0 | 1 }[] = [
    { axisKey: reclaim.axisKey, actions: 1 },
    ...reclaim.fallbackAxes.filter((axisKey) => axisKey !== reclaim.axisKey).map((axisKey) => ({ axisKey, actions: 0 as const })),
  ];
  let taken = 0;
  for (const step of steps) {
    const remaining = reclaim.points - taken;
    if (remaining <= 0) break;
    try {
      taken += await takeBackFromEngagementCounter(db, { userId: reclaim.userId, axisKey: step.axisKey, points: remaining, actions: step.actions });
    } catch (failure) {
      return { taken, failure };
    }
  }
  return { taken };
}

/**
 * RELÈVE `count` de `from` à `to` — le rattrapage des badges d'axe (#10845), JAMAIS un incrément.
 *
 * L'écriture est GARDÉE par la valeur lue : la colonne doit valoir encore `from` (un zéro lu couvre aussi `null` et
 * l'absence, que Prisma relit `0`, #6428), sinon rien n'est écrit et `false` revient — un geste concurrent s'est
 * glissé, et le rattrapage, idempotent, se relance. `from: null` : la ligne n'existe pas, elle est créée (si un
 * crédit la crée entre-temps, l'index unique `(userId, axisKey)` refuse et `false` revient).
 *
 * Écrite par commande brute et sans `updatedAt` : l'élan (#5749) lit `updatedAt` comme la date du dernier geste sur
 * l'axe, et un rattrapage ne doit pas faire croire à une activité d'aujourd'hui. `points` n'est jamais touché.
 */
export async function raiseEngagementCounterCount(
  db: EngagementCounterDb,
  raise: EngagementCounterKey & { readonly from: number | null; readonly to: number },
): Promise<boolean> {
  if (raise.from !== null && !(raise.to > raise.from)) return false;
  const guard =
    raise.from === null
      ? { count: { $exists: false } }
      : raise.from === 0
        ? { $or: [{ count: { $in: [0, null] } }, { count: { $exists: false } }] }
        : { count: raise.from };
  try {
    const result = await db.$runCommandRaw({
      findAndModify: COUNTER_COLLECTION,
      query: { ...rowQuery(raise), ...guard },
      update: [{ $set: { count: raise.to } }],
      upsert: raise.from === null,
      new: true,
      fields: { count: 1 },
    });
    return stateOf(result) !== null;
  } catch (err) {
    // Une ligne créée entre la lecture et l'écriture : l'index unique a tranché, le rattrapage se relance.
    if (raise.from === null && typeof err === 'object' && err !== null && /E11000|duplicate key/i.test(String((err as { message?: unknown }).message))) {
      return false;
    }
    throw err;
  }
}
