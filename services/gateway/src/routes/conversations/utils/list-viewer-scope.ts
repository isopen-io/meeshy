/**
 * Le PÉRIMÈTRE du lecteur dans `GET /conversations` — les clauses qui disent ce
 * que CE lecteur voit de la liste, extraites de `core-list.ts` (budget de taille).
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import { EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import { viewerRequestClause, type MessageRequestListMode } from '../../../services/messaging/messageRequests';

/**
 * Visibilité DM vide — Prisme design doc 2026-08-04. Posée APRÈS le bloc
 * `withUserId` (qui reconstruit `participants` / `AND`) pour ne jamais être
 * écrasée par lui : un OR à la racine se combine par ET implicite avec eux.
 *
 * `NOT: { firstMessageSentAt: null }` seul ne matche PAS les documents où le
 * champ est ABSENT sur le connecteur MongoDB de Prisma (il ne matche que
 * présent-et-non-nul) — il exclurait donc à tort tout DM legacy (créé avant
 * cette migration, jamais rattrapé). Les deux branches sont nécessaires : déjà
 * posé (message envoyé) OU absent (legacy) ⇒ visible. Aucun créateur
 * identifiable ⇒ comportement d'avant.
 */
export const emptyDirectVisibility = (userId: string): Prisma.ConversationWhereInput[] => [
  // #14644 — un groupe neuf est silencieux comme un tête-à-tête : `group` est
  // soumis à la même règle. Un groupe d'avant ce lot n'a pas le champ ⇒ visible.
  { type: { notIn: ['direct', 'group'] } },
  { OR: [{ NOT: { firstMessageSentAt: null } }, { firstMessageSentAt: { isSet: false } }] },
  { participants: { some: { userId, role: 'creator' } } },
  { participants: { none: { role: 'creator' } } },
];

/**
 * #14107 — la boîte de demandes : `exclude` = la liste principale, `only` /
 * `filtered` = les demandes du lecteur. Absent = tout, comme avant le lot (un
 * ancien client et le web ne perdent rien). Ajoutée au `AND` existant.
 */
export const withViewerRequests = (
  and: Prisma.ConversationWhereInput['AND'],
  userId: string,
  mode: MessageRequestListMode,
): Prisma.ConversationWhereInput['AND'] => {
  const existing = Array.isArray(and) ? and : and ? [and] : [];
  return [...existing, { participants: { some: { userId, isActive: true, ...viewerRequestClause(mode) } } }];
};

/**
 * #17117 / #9223 — une conversation `external` n'est servie qu'au client qui
 * annonce le jeton `external-conversations` : un client publié avant ce type
 * reçoit EXACTEMENT la liste d'avant. Ajoutée au `AND` existant ; `type` est
 * un champ requis, présent sur tout document, donc la négation n'écarte rien d'autre.
 */
export const withExternalVisibility = (
  and: Prisma.ConversationWhereInput['AND'],
  announcesExternal: boolean,
): Prisma.ConversationWhereInput['AND'] => {
  if (announcesExternal) return and;
  const existing = Array.isArray(and) ? and : and ? [and] : [];
  return [...existing, { type: { not: EXTERNAL_CONVERSATION_TYPE } }];
};
