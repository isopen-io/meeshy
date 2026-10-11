import { createContext } from 'react';

import { GlobalUserRole, globalRoleLevel } from '@meeshy/shared/types/role-types';

import { WORLD_IDENTIFIER } from '../lens/world-pin';

/**
 * **QUI TOUCHE UN AUTEUR DE WORLD WIDE POUR LIRE SA FICHE** (#10102, décision
 * porteur du 2026-10-11).
 *
 * Dans World Wide, un utilisateur ordinaire et un invité n'ouvrent aucun
 * profil, et c'est voulu. Un compte dont le rôle de PLATEFORME est au-delà de
 * USER (ANALYST, AUDIT, MODERATOR, ADMIN, BIGBOSS) touche n'importe quel
 * auteur, anonyme compris, et lit sa fiche de modération.
 *
 * `mayOpenWorldParticipantCard` est la JUMELLE GARDÉE de
 * `mayReadWorldParticipantCard` (`@meeshy/shared/types/world-participant-card`) :
 * ce module partagé construit ses schémas Zod au niveau module, et l'importer
 * depuis le fil ferait entrer `zod` complet dans le chunk de l'écran pour une
 * comparaison de rangs. `world-participant-card.test.ts` les confronte rôle par
 * rôle. La passerelle reste l'autorité : cette loi ne décide que de ce que
 * l'écran OFFRE.
 */
export function mayOpenWorldParticipantCard(role: string | null | undefined): boolean {
  if (typeof role !== 'string' || role.length === 0) return false;
  return globalRoleLevel(role) > globalRoleLevel(GlobalUserRole.USER);
}

export function opensWorldParticipantCards(params: {
  readonly conversationIdentifier: string | null | undefined;
  readonly role: string | null | undefined;
}): boolean {
  return params.conversationIdentifier === WORLD_IDENTIFIER && mayOpenWorldParticipantCard(params.role);
}

/**
 * Ce que le fil remet à chaque auteur quand la porte est ouverte : ouvrir la
 * fiche d'un participant (`senderId`), et NOMMER ce geste pour le lecteur
 * d'écran.
 */
export type WorldParticipantCardOpener = {
  readonly open: (participantId: string) => void;
  readonly labelFor: (name: string) => string;
};

/**
 * Posé par l'hôte du fil (`components/world-participant-card-host.tsx`), lu par
 * l'avatar et le nom de chaque auteur (`AuthorAvatar`, `PersonName`). `null` —
 * hors World Wide, ou lecteur qui n'est pas de l'équipe — : rien ne change, un
 * anonyme reste muet et un compte mène à son profil.
 */
export const WorldParticipantCardContext = createContext<WorldParticipantCardOpener | null>(null);
