/**
 * Le PÉRIMÈTRE du lecteur dans `GET /conversations` — les clauses qui disent ce
 * que CE lecteur voit de la liste, extraites de `core-list.ts` (budget de taille).
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import { EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import { viewerRequestClause, type MessageRequestListMode } from '../../../services/messaging/messageRequests';
import { PARTICIPATION_VIVANTE } from './access-control';

/**
 * LE PÉRIMÈTRE DE BASE : les conversations que CE lecteur a le droit d'ouvrir.
 *
 * Extraite de `core-list.ts` par #20209, et pas seulement pour le budget de
 * taille : tant que cette clause vivait dans un littéral inline, aucun témoin
 * ne pouvait la CAPTURER — il ne pouvait qu'en recopier la forme, et **un
 * verdict posé sur une copie décrit la LOI, pas le site**. Exportée, elle
 * s'exerce.
 *
 * Deux choses que cette clause doit tenir ensemble, et c'est pourquoi elle est
 * UNE fonction :
 *
 * 1. **La PARTICIPATION VIVANTE, par `AND` et JAMAIS par étalement.** La
 *    clause porte déjà une clé `OR` (le `deletedForMe` ci-dessous) :
 *    `...PARTICIPATION_VIVANTE` l'ÉCRASERAIT en silence — le seul piège
 *    d'`unsetOrNull` (`utils/prisma-unset.ts`) — et ferait disparaître de la
 *    liste toute conversation dont la ligne héritée ne porte pas le champ.
 *    Sous `isActive` nu, la conversation dont un membre est EXCLU figurait
 *    encore dans sa liste principale : quatrième genre de porte keyée sur
 *    l'appelant (#20155), l'appelant nommé dans un FILTRE DE RELATION, que le
 *    balayage des audiences ne traverse pas — par décision écrite, et juste
 *    pour ce qu'il mesure.
 * 2. **`deletedForMe` nul OU ABSENT.** Sans le `isSet: false` (filtre
 *    MongoDB-only de Prisma), les documents `Participant` hérités qui ne
 *    possèdent pas le champ du tout — créés avant l'introduction du concept,
 *    10 documents sur 716 dans l'instance de production du 2026-05-11 —
 *    étaient exclus de la liste, et les tête-à-tête correspondants
 *    disparaissaient même après un tiré-pour-rafraîchir. Un `NOT: { not: null }`
 *    ou un `deletedForMe: null` simple ont la même limite : ils ne matchent que
 *    les champs présents avec valeur nulle.
 */
export const conversationListScope = (userId: string): Prisma.ConversationWhereInput => ({
  participants: {
    some: {
      userId,
      AND: [PARTICIPATION_VIVANTE],
      OR: [{ deletedForMe: null }, { deletedForMe: { isSet: false } }],
    },
  },
  isActive: true,
});

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
export const externalVisibilityClauses = (announcesExternal: boolean): Prisma.ConversationWhereInput[] =>
  announcesExternal ? [] : [{ type: { not: EXTERNAL_CONVERSATION_TYPE } }];

export const withExternalVisibility = (
  and: Prisma.ConversationWhereInput['AND'],
  announcesExternal: boolean,
): Prisma.ConversationWhereInput['AND'] => {
  if (announcesExternal) return and;
  const existing = Array.isArray(and) ? and : and ? [and] : [];
  return [...existing, ...externalVisibilityClauses(announcesExternal)];
};
