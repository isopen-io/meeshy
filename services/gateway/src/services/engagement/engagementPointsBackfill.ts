/**
 * LE REMPLISSAGE DES POINTS HISTORIQUES — #6434, option B du porteur (2026-09-14).
 *
 * ## Le défaut
 *
 * La frappe d'une Meesh se décide sur `Σ EngagementCounter.points` ; l'écran
 * « Progression » montre `User.engagementScore`. La colonne `points` est née
 * avec #5743 (2026-09-08) : tout compteur antérieur porte des ACTIONS
 * (`count > 0`) et aucun point. Mesuré sur staging le 2026-09-14 : un compte
 * affiche 1222 points, en a 35 débitables, et ne voit jamais le bouton.
 *
 * ## La loi (option B)
 *
 * 1. **Remplir** `points = count × poids` sur chaque ligne à zéro d'un axe du
 *    catalogue. Conservateur par construction : l'élan (#5749) n'est jamais
 *    appliqué rétroactivement, donc rien n'est sur-crédité.
 *
 *    **Jamais sur un axe qu'une frappe a débité** : la frappe laisse
 *    légitimement une ligne à zéro point avec des actions restantes (et les
 *    axes de conversation sont débités en points seulement). Remplir cette
 *    ligne rendrait des points déjà dépensés — une Meesh gratuite.
 *
 * 2. **Rétablir l'invariant** `engagementScore == Σ points`, que la frappe
 *    suppose (elle débite les deux du même montant) :
 *    - reste POSITIF (le score a été crédité avec l'élan, les vieilles lignes
 *      non) : il est réparti sur les lignes qui portent déjà des points, AU
 *      PRORATA, en entiers (méthode du plus fort reste) — ni point perdu, ni
 *      point créé. Le score, lui, ne bouge pas : c'est le chiffre que
 *      l'utilisateur connaît ;
 *    - reste NÉGATIF (le remplissage dépasse un score crédité sous l'ancien
 *      poids) : les points restent, le score S'ALIGNE sur Σ points. Retirer
 *      des points gagnés serait pire que monter un score ;
 *    - reste positif sans aucune ligne pour le porter : rien n'est écrit, le
 *      reste est SIGNALÉ (`undistributed`) plutôt qu'inventé sur un axe.
 *
 * 3. **Graver en silence** les paliers de niveau que le score final a franchis
 *    sans les avoir gravés — même doctrine que #5742 : une bannière « Niveau 4
 *    atteint » des semaines après le fait ne veut rien dire.
 *
 * 4. **Éteindre** les paliers de niveau gravés AU-DESSUS du score final (#6465).
 *    Une frappe antérieure au correctif débitait le score sans retirer ces
 *    lignes ; le niveau les comptait pendant que la barre lisait le score
 *    (« Niveau 3 · 1 point · encore 9 points avant le niveau 4 », staging,
 *    2026-09-14). Le score ne descend que par une frappe : un palier au-dessus
 *    de lui ne peut venir que de là.
 *
 * La loi est IDEMPOTENTE : rejouée sur l'état qu'elle a produit, elle n'écrit
 * plus rien. Un passage interrompu se termine donc en le relançant.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { levelMilestoneKey } from '@meeshy/shared/types/engagement';

export type PointsBackfillStatus = 'simulated' | 'applied' | 'unchanged' | 'moved';

export type PointsBackfillAccountReport = {
  readonly role: string | null;
  readonly status: PointsBackfillStatus;
  readonly plan: PointsBackfillPlan;
};

export type PointsBackfillTotals = {
  readonly accounts: number;
  readonly accountsWithWrites: number;
  readonly counterWrites: number;
  readonly filledPoints: number;
  readonly distributedPoints: number;
  readonly scoresAligned: number;
  readonly levelsToEngrave: number;
  readonly levelsToErase: number;
  readonly undistributedAccounts: number;
  readonly canMintBefore: number;
  readonly canMintAfter: number;
  readonly moved: number;
};

export type PointsBackfillReport = {
  readonly accounts: readonly PointsBackfillAccountReport[];
  readonly totals: PointsBackfillTotals;
};

const estP2002 = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * La garde d'une écriture : la valeur en base doit être TOUJOURS celle qu'on a
 * lue. Un zéro lu couvre aussi `null` et l'absence, que Prisma relit `0` sur
 * MongoDB (mesuré, #6428) — sans quoi la garde ne trouverait jamais les lignes
 * mêmes qu'elle doit remplir.
 */
const garde = (champ: string, lu: number): Record<string, unknown> =>
  lu === 0 ? { $or: [{ [champ]: { $in: [0, null] } }, { [champ]: { $exists: false } }] } : { [champ]: lu };

/**
 * Une écriture par COMMANDE BRUTE, jamais par `update` Prisma : celui-ci pose
 * `updatedAt`, et l'élan (#5749) lit l'`updatedAt` d'un compteur comme la date
 * du dernier geste sur l'axe. Remplir en passant par Prisma ferait croire à
 * chaque compte rempli qu'il a été actif sur toutes ses familles aujourd'hui.
 */
async function ecrireSiInchange(
  prisma: PrismaClient,
  collection: string,
  id: string,
  champ: string,
  lu: number,
  valeur: number,
): Promise<boolean> {
  const resultat = (await prisma.$runCommandRaw({
    update: collection,
    updates: [{ q: { _id: { $oid: id }, ...garde(champ, lu) }, u: { $set: { [champ]: valeur } } }],
  } as never)) as unknown as { n?: unknown };
  return Number(resultat?.n ?? 0) > 0;
}

/**
 * Applique le plan d'UN compte. S'arrête à la première garde qui ne trouve
 * rien : le compte a bougé (un crédit est passé entre la lecture et
 * l'écriture), et la loi étant idempotente, le relancer termine le travail.
 */
async function appliquerCompte(prisma: PrismaClient, userId: string, plan: PointsBackfillPlan): Promise<boolean> {
  for (const ecriture of plan.counterWrites) {
    const ecrit = await ecrireSiInchange(prisma, 'EngagementCounter', ecriture.counterId, 'points', ecriture.from, ecriture.to);
    if (!ecrit) return false;
  }
  if (plan.score) {
    const ecrit = await ecrireSiInchange(prisma, 'User', userId, 'engagementScore', plan.score.from, plan.score.to);
    if (!ecrit) return false;
  }
  for (const seuil of plan.levelsToEngrave) {
    try {
      await prisma.engagementMilestone.create({
        data: { userId, milestoneType: 'level', milestoneKey: levelMilestoneKey(seuil) },
      });
    } catch (err) {
      // Gravé entre-temps : l'anti-rejeu a joué, rien à faire.
      if (!estP2002(err)) throw err;
    }
  }
  if (plan.levelsToErase.length > 0) {
    await prisma.engagementMilestone.deleteMany({
      where: { userId, milestoneType: 'level', milestoneKey: { in: plan.levelsToErase.map(levelMilestoneKey) } },
    });
  }
  return true;
}

/** Vrai si le plan écrit quoi que ce soit — la même question pour le statut et pour les totaux. */
const aDesEcritures = (plan: PointsBackfillPlan): boolean =>
  plan.counterWrites.length > 0 || plan.score !== null || plan.levelsToEngrave.length > 0 || plan.levelsToErase.length > 0;

/** Les axes qu'une frappe a débités, lus dans `MeeshLedger.meta.debits` — un `Json`, donc lu défensivement. */
const axesDebites = (meta: unknown): string[] => {
  const debits = (meta as { debits?: unknown } | null)?.debits;
  if (!Array.isArray(debits)) return [];
  return debits
    .map((d) => (d as { axisKey?: unknown } | null)?.axisKey)
    .filter((axe): axe is string => typeof axe === 'string');
};

/**
 * Le PASSAGE : lit, planifie compte par compte, et n'écrit que si `apply`.
 * Le rapport ne porte aucun identifiant de compte — il se colle dans une issue.
 */
export async function backfillEngagementPoints(
  prisma: PrismaClient,
  rules: PointsBackfillRules,
  options: { readonly apply: boolean },
): Promise<PointsBackfillReport> {
  const compteurs = await prisma.engagementCounter.findMany({
    select: { id: true, userId: true, axisKey: true, count: true, points: true },
  });
  const ids = [...new Set(compteurs.map((c) => c.userId))];
  const [comptes, frappes, paliers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, engagementScore: true, role: true } }),
    prisma.meeshLedger.findMany({ where: { reason: 'mint', userId: { in: ids } }, select: { userId: true, meta: true } }),
    prisma.engagementMilestone.findMany({
      where: { milestoneType: 'level', userId: { in: ids } },
      select: { userId: true, milestoneKey: true },
    }),
  ]);

  const accounts: PointsBackfillAccountReport[] = [];
  for (const compte of comptes) {
    const plan = planEngagementPointsBackfill(
      {
        score: compte.engagementScore ?? 0,
        counters: compteurs
          .filter((c) => c.userId === compte.id)
          .map((c) => ({ id: c.id, axisKey: c.axisKey, count: c.count ?? 0, points: c.points ?? 0 })),
        mintedAxes: frappes.filter((f) => f.userId === compte.id).flatMap((f) => axesDebites(f.meta)),
        engravedLevelKeys: paliers.filter((p) => p.userId === compte.id).map((p) => p.milestoneKey),
      },
      rules,
    );
    const status: PointsBackfillStatus = !options.apply
      ? 'simulated'
      : !aDesEcritures(plan)
        ? 'unchanged'
        : (await appliquerCompte(prisma, compte.id, plan))
          ? 'applied'
          : 'moved';
    accounts.push({ role: compte.role ?? null, status, plan });
  }

  const compter = (predicat: (a: PointsBackfillAccountReport) => boolean): number => accounts.filter(predicat).length;
  const additionner = (valeur: (a: PointsBackfillAccountReport) => number): number =>
    accounts.reduce((s, a) => s + valeur(a), 0);

  return {
    accounts,
    totals: {
      accounts: accounts.length,
      accountsWithWrites: compter(({ plan }) => aDesEcritures(plan)),
      counterWrites: additionner(({ plan }) => plan.counterWrites.length),
      filledPoints: additionner(({ plan }) => plan.filledPoints),
      distributedPoints: additionner(({ plan }) => plan.distributedPoints),
      scoresAligned: compter(({ plan }) => plan.score !== null),
      levelsToEngrave: additionner(({ plan }) => plan.levelsToEngrave.length),
      levelsToErase: additionner(({ plan }) => plan.levelsToErase.length),
      undistributedAccounts: compter(({ plan }) => plan.undistributed > 0),
      canMintBefore: compter(({ plan }) => plan.canMintBefore),
      canMintAfter: compter(({ plan }) => plan.canMintAfter),
      moved: compter(({ status }) => status === 'moved'),
    },
  };
}

export type PointsBackfillCounter = {
  readonly id: string;
  readonly axisKey: string;
  readonly count: number;
  readonly points: number;
};

export type PointsBackfillAccount = {
  readonly score: number;
  readonly counters: readonly PointsBackfillCounter[];
  /** Les axes qu'une frappe a débités (`MeeshLedger.meta.debits`). */
  readonly mintedAxes: readonly string[];
  readonly engravedLevelKeys: readonly string[];
};

export type PointsBackfillRules = {
  readonly weights: Readonly<Record<string, number>>;
  readonly levelThresholds: readonly number[];
  readonly mintCost: number;
};

export type PointsBackfillCounterWrite = {
  readonly counterId: string;
  readonly axisKey: string;
  readonly from: number;
  readonly to: number;
  readonly filled: boolean;
};

export type PointsBackfillPlan = {
  readonly counterWrites: readonly PointsBackfillCounterWrite[];
  readonly score: { readonly from: number; readonly to: number } | null;
  readonly levelsToEngrave: readonly number[];
  /** Les paliers de niveau gravés au-dessus du score final — à éteindre (#6465). */
  readonly levelsToErase: readonly number[];
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly pointsBefore: number;
  readonly pointsAfter: number;
  readonly filledPoints: number;
  readonly distributedPoints: number;
  readonly undistributed: number;
  readonly canMintBefore: boolean;
  readonly canMintAfter: boolean;
};

type Ligne = PointsBackfillCounter & { readonly lu: number; readonly filled: boolean };

const somme = (valeurs: readonly number[]): number => valeurs.reduce((s, v) => s + v, 0);

/**
 * Répartit `reste` en entiers au prorata des points de chaque ligne. Les unités
 * que l'arrondi inférieur laisse vont aux plus fortes parts fractionnaires,
 * puis aux lignes les plus lourdes, puis dans l'ordre des axes : la répartition
 * est DÉTERMINISTE, donc une simulation et son application écrivent la même chose.
 */
function repartir(reste: number, lignes: readonly Ligne[]): ReadonlyMap<string, number> {
  const porteuses = lignes.filter((l) => l.points > 0);
  const total = somme(porteuses.map((l) => l.points));
  if (total === 0) return new Map();

  const parts = porteuses.map((l) => {
    const exacte = (reste * l.points) / total;
    return { ligne: l, entiere: Math.floor(exacte), fraction: exacte - Math.floor(exacte) };
  });
  const unites = reste - somme(parts.map((p) => p.entiere));
  const ordre = [...parts].sort(
    (a, b) =>
      b.fraction - a.fraction ||
      b.ligne.points - a.ligne.points ||
      a.ligne.axisKey.localeCompare(b.ligne.axisKey),
  );
  const bonus = new Set(ordre.slice(0, unites).map((p) => p.ligne.id));
  return new Map(parts.map((p) => [p.ligne.id, p.entiere + (bonus.has(p.ligne.id) ? 1 : 0)]));
}

export function planEngagementPointsBackfill(
  account: PointsBackfillAccount,
  rules: PointsBackfillRules,
): PointsBackfillPlan {
  const debites = new Set(account.mintedAxes);
  const catalogue = account.counters.filter((c) => Object.prototype.hasOwnProperty.call(rules.weights, c.axisKey));

  const remplies: readonly Ligne[] = catalogue.map((c) => {
    const filled = c.count > 0 && c.points === 0 && !debites.has(c.axisKey);
    return { ...c, lu: c.points, filled, points: filled ? c.count * (rules.weights[c.axisKey] ?? 0) : c.points };
  });

  const pointsBefore = somme(catalogue.map((c) => c.points));
  const pointsRemplis = somme(remplies.map((l) => l.points));
  const ecart = account.score - pointsRemplis;

  const repartition = ecart > 0 ? repartir(ecart, remplies) : new Map<string, number>();
  const distributedPoints = somme([...repartition.values()]);
  const finales = remplies.map((l) => ({ ...l, points: l.points + (repartition.get(l.id) ?? 0) }));
  const pointsAfter = somme(finales.map((l) => l.points));

  const scoreAfter = ecart < 0 ? pointsRemplis : account.score;
  const graves = new Set(account.engravedLevelKeys);

  return {
    counterWrites: finales
      .filter((l) => l.points !== l.lu)
      .map((l) => ({ counterId: l.id, axisKey: l.axisKey, from: l.lu, to: l.points, filled: l.filled })),
    score: ecart < 0 ? { from: account.score, to: scoreAfter } : null,
    levelsToEngrave: rules.levelThresholds.filter((seuil) => seuil <= scoreAfter && !graves.has(levelMilestoneKey(seuil))),
    levelsToErase: rules.levelThresholds.filter((seuil) => seuil > scoreAfter && graves.has(levelMilestoneKey(seuil))),
    scoreBefore: account.score,
    scoreAfter,
    pointsBefore,
    pointsAfter,
    filledPoints: pointsRemplis - pointsBefore,
    distributedPoints,
    undistributed: ecart > 0 ? ecart - distributedPoints : 0,
    canMintBefore: pointsBefore >= rules.mintCost,
    canMintAfter: pointsAfter >= rules.mintCost,
  };
}
