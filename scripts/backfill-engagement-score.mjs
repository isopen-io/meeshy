#!/usr/bin/env node
/**
 * BACKFILL du score d'engagement et des points par axe (#5742).
 *
 * ## Ce qu'il répare
 *
 * `updateEngagementScore` écrivait par `{ increment }`, c'est-à-dire par `$inc`.
 * Vérifié contre Mongo 8 :
 *
 *     champ ABSENT + $inc  ->  { s: 3 }
 *     champ NULL   + $inc  ->  ERREUR « Cannot apply $inc to a value of
 *                              non-numeric type »
 *
 * En production, `User.engagementScore` valait `null` — pas « absent » — sur
 * les 9 comptes ayant une activité. Chaque crédit échouait en silence, l'appel
 * étant le dernier de `recordActivity`. Trois mois de score mort, et un écran
 * « Progression » annonçant « Niveau 0 · 0 point » à un compte ayant produit
 * 140 points.
 *
 * Le code est corrigé (pipeline `$ifNull`, une écriture atomique). Ce script
 * rend aux comptes existants ce qu'ils avaient gagné.
 *
 * ## Ce qu'il écrit
 *
 *  - `EngagementCounter.points` = `count × poids` pour chaque ligne. L'élan
 *    (#5749) n'ayant jamais existé, la formule historique est exacte.
 *  - `User.engagementScore` = Σ(points) du compte.
 *  - `EngagementMilestone` de type `level` pour chaque palier que le score
 *    rétabli franchit, **SANS notifier** : une bannière « Niveau 1 atteint »
 *    trois mois après le fait ne veut rien dire, et neuf comptes recevant
 *    plusieurs bannières d'un coup liraient ça comme une panne. Le palier est
 *    gravé pour que l'anti-rejeu (§ 4) ne le re-notifie jamais plus tard.
 *
 * ## Usage
 *
 *   node scripts/backfill-engagement-score.mjs            # simulation, n'écrit RIEN
 *   node scripts/backfill-engagement-score.mjs --apply    # applique
 *
 * La simulation est le défaut DÉLIBÉRÉMENT : ce script touche le score de
 * comptes réels, il ne doit jamais s'exécuter par accident.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ENGAGEMENT_AXIS_WEIGHTS,
  LEVEL_THRESHOLDS,
  levelMilestoneKey,
} from '@meeshy/shared/types/engagement';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** Vrai si la valeur lue en base n'est PAS un nombre — `null`, absente, ou d'un autre type. */
const estNonNumerique = (value) => typeof value !== 'number' || !Number.isFinite(value);

async function main() {
  console.log(APPLY ? '== APPLICATION ==' : '== SIMULATION (aucune écriture) ==');

  const compteurs = await prisma.engagementCounter.findMany({
    select: { id: true, userId: true, axisKey: true, count: true, points: true },
  });

  /** userId -> points attendus, tous axes confondus. */
  const attenduParCompte = new Map();
  let pointsAEcrire = 0;

  for (const ligne of compteurs) {
    const poids = ENGAGEMENT_AXIS_WEIGHTS[ligne.axisKey];
    if (poids === undefined) {
      console.warn(`  axe inconnu, ignoré : ${ligne.axisKey} (compte ${ligne.userId})`);
      continue;
    }
    const points = ligne.count * poids;
    attenduParCompte.set(ligne.userId, (attenduParCompte.get(ligne.userId) ?? 0) + points);

    if (ligne.points !== points) {
      pointsAEcrire += 1;
      if (APPLY) {
        await prisma.engagementCounter.update({ where: { id: ligne.id }, data: { points } });
      }
    }
  }
  console.log(`compteurs : ${compteurs.length} lus, ${pointsAEcrire} à corriger`);

  let scoresAEcrire = 0;
  let paliersAGraver = 0;

  for (const [userId, attendu] of attenduParCompte) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, engagementScore: true },
    });
    if (!user) continue;

    const servi = user.engagementScore;
    const doitEcrire = estNonNumerique(servi) || servi !== attendu;
    console.log(
      `  ${String(user.username).padEnd(20)} score=${estNonNumerique(servi) ? 'NON NUMÉRIQUE' : servi}` +
        `  attendu=${attendu}${doitEcrire ? '  -> à écrire' : ''}`,
    );
    if (!doitEcrire) continue;
    scoresAEcrire += 1;

    // Les paliers que le score rétabli franchit et qui ne sont pas déjà gravés.
    const dejaGraves = await prisma.engagementMilestone.findMany({
      where: { userId, milestoneType: 'level' },
      select: { milestoneKey: true },
    });
    const connus = new Set(dejaGraves.map((m) => m.milestoneKey));
    const manquants = LEVEL_THRESHOLDS.filter(
      (seuil) => attendu >= seuil && !connus.has(levelMilestoneKey(seuil)),
    );
    paliersAGraver += manquants.length;
    if (manquants.length > 0) {
      console.log(`      paliers à graver (sans notifier) : ${manquants.join(', ')}`);
    }

    if (APPLY) {
      await prisma.user.update({ where: { id: userId }, data: { engagementScore: attendu } });
      for (const seuil of manquants) {
        try {
          await prisma.engagementMilestone.create({
            data: { userId, milestoneType: 'level', milestoneKey: levelMilestoneKey(seuil) },
          });
        } catch (err) {
          // P2002 : le palier a été gravé entre-temps — l'anti-rejeu a joué, rien à faire.
          if (!(err && typeof err === 'object' && 'code' in err && err.code === 'P2002')) throw err;
        }
      }
    }
  }

  console.log(
    `\nscores : ${scoresAEcrire} à écrire · paliers de niveau : ${paliersAGraver} à graver` +
      (APPLY ? '' : '\nRelancer avec --apply pour écrire.'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
