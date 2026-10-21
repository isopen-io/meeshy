/**
 * L'HISTORIQUE D'UN AXE — le total RÉEL derrière un badge (#10845, décision du porteur 2026-10-16).
 *
 * `EngagementCounter.count` est parti de 0 le 2026-09-07 sans rattrapage de l'historique : un compte aux milliers de
 * messages voyait « 🏆 Palier 3 atteint — Messages texte : 50 ». Un badge d'axe dit le TOTAL RÉEL et ne se notifie
 * jamais deux fois. Ce module dit, par axe, d'où le total réel se lit — et grave en silence les paliers passés.
 *
 * ## Les axes couverts, et ceux qui ne le sont pas
 *
 * Seul un axe dont l'historique se reconstruit SANS DOUTE figure ici :
 *
 *  - `content.text_message` — les `Message` des `Participant` de l'utilisateur (`senderId` ∈ participantIds),
 *    `messageSource: 'user'`, `deletedAt: null`, `messageType: 'text'` : la même lecture que le succès
 *    « messages envoyés » (`GlobalAchievements.ts`).
 *
 * Ne SE reconstruisent PAS, et restent donc sur leur compteur (le rattrapage ne les touche pas) :
 *
 *  - les axes d'**outils** (`tool.*` : réactions, stickers, pièces jointes, éditions…) : ni registre ni trace des
 *    gestes, seulement leur effet ;
 *  - `content.audio_message`, `comment.*`, `content.post|story|reel` : la suppression d'un contenu l'efface (aucun
 *    horodatage de suppression, aucune trace du geste), et la forme d'un message vocal ou d'un repost ne se
 *    déduit pas avec certitude — compter risquerait de SUR-attribuer, ce que le porteur refuse (un badge qui ment
 *    vers le haut). À rouvrir avec une source gravée ;
 *  - `conversation.*` : l'axe est crédité une fois par conversation distincte (`EngagementConversationCredit`),
 *    registre né le même jour que le compteur ;
 *  - `social.*` : invitations, liens, amitiés — des faits d'AUTRES comptes, non rejoués ici.
 *
 * Un axe sans source rend `null` — jamais `0`, qui dirait « rien à rattraper ».
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BADGE_THRESHOLDS, badgeMilestoneKey, type EngagementAxisKey } from '@meeshy/shared/types/engagement';

/** Les axes dont le total réel se lit à la source. */
export const AXES_WITH_HISTORY = ['content.text_message'] as const;

type HistoryDb = Pick<PrismaClient, 'participant' | 'message'>;

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/** Le total réel de l'axe pour ce compte, ou `null` quand aucune source fiable n'existe. */
export async function historyCountFor(db: HistoryDb, userId: string, axisKey: string): Promise<number | null> {
  if (axisKey !== 'content.text_message') return null;
  const participants = await db.participant.findMany({ where: { userId }, select: { id: true } });
  if (participants.length === 0) return 0;
  return db.message.count({
    where: {
      senderId: { in: participants.map((p) => p.id) },
      messageSource: 'user',
      deletedAt: null,
      messageType: 'text',
    },
  });
}

/**
 * Grave EN SILENCE les paliers de badge couverts par `upTo` : une ligne `EngagementMilestone` par palier, P2002 ignoré
 * (déjà gravé), AUCUNE notification. Rend les seuils effectivement gravés par cet appel.
 */
export async function engraveBadgesSilently(
  db: Pick<PrismaClient, 'engagementMilestone'>,
  userId: string,
  axisKey: EngagementAxisKey,
  upTo: number,
): Promise<number[]> {
  const engraved: number[] = [];
  for (const threshold of BADGE_THRESHOLDS.filter((t) => t <= upTo)) {
    try {
      await db.engagementMilestone.create({ data: { userId, milestoneType: 'badge', milestoneKey: badgeMilestoneKey(axisKey, threshold) } });
      engraved.push(threshold);
    } catch (err) {
      if (!isP2002(err)) throw err;
    }
  }
  return engraved;
}
