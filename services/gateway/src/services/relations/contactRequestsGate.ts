/**
 * « Accepter les demandes de connexion » (`privacy.allowContactRequests`, #19362) :
 * la passerelle APPORTE le réglage stocké de la cible et le niveau effectif de la
 * paire à la loi partagée (`contactRequestsOpen`), sans la réécrire. Deux sites la
 * lisent ici : le refus de l'envoi (`friend-requests-core`) et l'annonce sur la
 * fiche (`routes/directory/person`, `acceptsRequests`).
 *
 * Aucune erreur n'est rattrapée : l'envoi échoue et se refera plutôt que de
 * laisser passer une demande que la cible a fermée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { contactRequestsOpen } from '@meeshy/shared/utils/relation-request';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';

export async function targetAcceptsRequests(
  prisma: PrismaClient,
  params: { readonly targetId: string; readonly currentLevel: RelationLevel },
): Promise<boolean> {
  const stored = await loadPrivacyPreferencesCached(prisma, [params.targetId]);
  return contactRequestsOpen({
    allowContactRequests: stored.get(params.targetId)?.allowContactRequests,
    currentLevel: params.currentLevel,
  });
}
