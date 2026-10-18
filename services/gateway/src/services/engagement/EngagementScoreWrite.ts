import { rawCommandNumber } from './rawCommandNumber';
import { gameRevisionPipelineSet } from '../game/GameRevision';

/** Ce que la commande du score rend : la poche neuve et les records, pour les paliers et la Gloire. */
export type ScoreWritten = {
  readonly pocket: number;
  readonly levelRecord: number | null;
  readonly levelMaxLifetime: number | null;
  /** Les étoiles lues avec la poche : un record de cycle ne s'écrit que sous elles (#10895). */
  readonly prestige: number;
};

type ScoreDb = { $runCommandRaw(command: never): Promise<unknown> };

/**
 * Ajoute `points` à la poche `User.engagementScore`, au cycle et au total à vie, et rend ce qu'il faut pour
 * notifier chaque palier `LEVEL_THRESHOLDS` franchi par CET incrément précis (§ 5, § 7).
 *
 * `points` est le poids de l'axe DÉJÀ multiplié par l'élan (#5749), calculé
 * une fois par `recordActivity` et partagé avec le compteur, qui reçoit le
 * même montant. La
 * méthode ne recalcule donc RIEN — lui passer un axe l'obligerait à
 * re-résoudre l'élan, avec le risque de tomber de l'autre côté de la
 * péremption du cache et de créditer deux montants pour un même geste.
 *
 * ## Pourquoi une commande brute et non `increment` (#5742)
 *
 * La version précédente écrivait par `{ increment: weight }`, en s'appuyant
 * sur ce doc-comment : « un `User` créé avant cette migration a le champ
 * ABSENT (pas à zéro), et Mongo traite `$inc` sur un champ absent comme un
 * départ à zéro ». L'affirmation est juste de `$inc`, mais **Prisma n'envoie
 * pas `$inc` sur MongoDB** : il traduit l'incrément en pipeline
 * `$set: { champ: { $add: ['$champ', n] } }` (journal de requêtes, base
 * jetable, 2026-09-14, #6428). Et `$add` rend `null` dès qu'un opérande est
 * absent ou `null` :
 *
 *     champ ABSENT + increment  ->  null en base, relu 0 par Prisma
 *     champ NULL   + increment  ->  null en base, relu 0 par Prisma
 *     champ 0      + increment  ->  1
 *
 * Mesuré en production le 2026-09-08 : `engagementScore` valait `null` sur
 * les 9 comptes ayant une activité, la somme pondérée de leurs compteurs
 * allant de 8 à 140. Chaque crédit se perdait en silence : l'écriture
 * RÉUSSISSAIT et laissait `null`, que la lecture rendait zéro. Aucune ligne
 * d'erreur, trois mois de score mort, et un écran « Progression » annonçant
 * « Niveau 0 · 0 point » à un compte qui avait produit 140 points. La même
 * cause a fait disparaître la première frappe de Meesh (#6428).
 *
 * Le pipeline d'agrégation `$ifNull` traite `null` ET l'absence comme zéro,
 * en UNE écriture atomique — strictement mieux qu'une normalisation suivie
 * d'un `$inc`, qui en demanderait deux. `findAndModify` rend en prime la
 * valeur NEUVE, nécessaire pour savoir quels paliers cet incrément franchit.
 *
 * Prisma ne sait pas exprimer une mise à jour par pipeline : d'où
 * `$runCommandRaw`, idiome déjà employé dans le dépôt (`routes/posts/nearby.ts`).
 */
export async function writeEngagementScore(prisma: ScoreDb, userId: string, points: number): Promise<ScoreWritten | null> {
  // UNE commande, trois colonnes (#10846) : la poche (la base du niveau, #10892), le cycle et le total à vie montent du même
  // montant. Le cycle ne passe jamais sous la poche, ni le total à vie sous le cycle (`$max`) : un compte d'avant le
  // rattrapage — champs absents — les voit posés sur sa poche. Les expressions lisent le document d'AVANT l'étape.
  const held = (field: string) => ({ $ifNull: [`$${field}`, 0] });
  const result = (await prisma.$runCommandRaw({
    findAndModify: 'User',
    query: { _id: { $oid: userId } },
    update: [
      {
        $set: {
          sparksEarnedLifetime: { $add: [{ $max: [held('sparksEarnedLifetime'), held('sparksSincePrestige'), held('engagementScore')] }, points] },
          sparksSincePrestige: { $add: [{ $max: [held('sparksSincePrestige'), held('engagementScore')] }, points] },
          // La DETTE se déduit d'abord des étincelles gagnées (porteur, 2026-10-16) : seul le reste va en poche, alors que le
          // cycle et le total à vie montent du gain ENTIER. `sparksDebt` s'écrit en dernier : les autres lisent l'ancienne dette.
          engagementScore: { $add: [held('engagementScore'), { $subtract: [points, { $min: [held('sparksDebt'), points] }] }] },
          sparksDebt: { $subtract: [held('sparksDebt'), { $min: [held('sparksDebt'), points] }] },
          // La révision de l'état du jeu (#10912), dans la MÊME commande atomique que la poche.
          ...gameRevisionPipelineSet(Date.now()),
        },
      },
    ],
    new: true,
    fields: { engagementScore: 1, levelRecord: 1, levelMaxLifetime: 1, prestige: 1 },
  } as never)) as unknown as {
    value?: { engagementScore?: unknown; levelRecord?: unknown; levelMaxLifetime?: unknown; prestige?: unknown } | null;
  };

  // Les valeurs se lisent par `rawCommandNumber` (#10541) : la colonne est un `long` sur la plupart des comptes,
  // qu'une commande brute peut rendre en `{ $numberLong }`.
  const newScore = rawCommandNumber(result?.value?.engagementScore);
  // Compte introuvable (supprimé entre l'activité et ce crédit) : rien à notifier, et surtout pas un palier
  // calculé sur `undefined`.
  if (newScore === null) return null;
  return {
    pocket: newScore,
    levelRecord: rawCommandNumber(result?.value?.levelRecord),
    levelMaxLifetime: rawCommandNumber(result?.value?.levelMaxLifetime),
    prestige: rawCommandNumber(result?.value?.prestige) ?? 0,
  };
}
