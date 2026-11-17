import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationLevelIfAtLeast } from '@meeshy/shared/types/relation';
import { ROOMS, SERVER_EVENTS, type UserProfileChangedEventData } from '@meeshy/shared/types/socketio-events';

import type { ServerEmitIO } from '../../socketio/serverEmit';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { getDistinctConversationPartnerUserIds } from '../../utils/conversation-partners';
import { logWarn } from '../../utils/logger';
import { resolveSocketIO } from '../../utils/socket-broadcast';
import { comptesLies } from '../friendship';

/**
 * **UNE FICHE OUVERTE SE REVALIDE QUAND SON SUJET LA CHANGE** (#19384, chantier #18857).
 *
 * `user:profile-changed` ne transporte RIEN de la fiche : la ville, les adresses et le
 * décor sont découpés par le cercle de chaque lecteur, aucune charge commune ne peut
 * donc les porter sans en donner trop à quelqu'un. Le lecteur reçoit le sujet et
 * l'horloge, puis relit SA fiche (`GET /directory/people/:handle`, `If-None-Match`).
 *
 * L'audience est celle qui peut tenir la fiche en cache et y voir quelque chose de
 * plus que l'inconnu : les comptes liés au niveau Connaissance ou plus (la loi des
 * niveaux, `comptesLies`), et les partenaires de conversation (ceux que
 * `user:updated` atteint déjà). Tout blocage, dans un sens ou dans l'autre, retire
 * le lecteur ; le sujet n'est jamais son propre lecteur (`profile:updated` sert ses
 * autres appareils). `user:updated` reste inchangé : ce signal s'y ajoute.
 */
const MIN_READER_LEVEL = 'ACQUAINTANCE' as const;

/**
 * Les champs de `PATCH /users/me` qui changent ce que sert la fiche d'un autre :
 * bio, ville et son cercle, les trois langues déclarées, la voix publique. Le nom,
 * la photo et la bannière ont déjà `user:updated` et sa charge publique.
 */
export const PROFILE_FICHE_BODY_FIELDS = [
  'bio',
  'city',
  'cityCircle',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'voicePublic',
] as const;

type ProfileFicheBody = Readonly<Partial<Record<string, unknown>>>;

export const touchesProfileFiche = (body: ProfileFicheBody): boolean =>
  PROFILE_FICHE_BODY_FIELDS.some((field) => body[field] !== undefined);

export async function profileChangedAudience(prisma: PrismaClient, userId: string): Promise<string[]> {
  const [liens, partenaires, bloques] = await Promise.all([
    comptesLies(prisma, userId),
    getDistinctConversationPartnerUserIds(prisma, userId),
    getBlockRelatedUserIds(prisma, userId),
  ]);
  const lecteursLies = liens.filter((lien) => relationLevelIfAtLeast(lien.niveau, MIN_READER_LEVEL) !== null).map((lien) => lien.id);
  return [...new Set([...lecteursLies, ...partenaires])].filter((id) => id && id !== userId && !bloques.has(id));
}

export async function emitProfileChanged(
  deps: { readonly io: ServerEmitIO; readonly prisma: PrismaClient },
  params: { readonly userId: string; readonly updatedAt: Date },
): Promise<void> {
  const readers = await profileChangedAudience(deps.prisma, params.userId);
  const payload: UserProfileChangedEventData = { userId: params.userId, updatedAt: params.updatedAt.toISOString() };
  readers.forEach((readerId) => deps.io.to(ROOMS.user(readerId)).emit(SERVER_EVENTS.USER_PROFILE_CHANGED, payload));
}

/**
 * Le geste des routes : un canal LATÉRAL. Sans Socket.IO, rien ; une lecture
 * d'audience qui échoue se journalise et l'écriture REST reste servie.
 */
export async function announceProfileChanged(
  fastify: FastifyInstance,
  params: { readonly userId: string; readonly updatedAt?: Date },
): Promise<void> {
  const io = resolveSocketIO(fastify);
  if (!io) return;
  try {
    await emitProfileChanged({ io, prisma: fastify.prisma }, { userId: params.userId, updatedAt: params.updatedAt ?? new Date() });
  } catch (error) {
    logWarn(fastify.log, `[PROFILE_CHANGED] emit failed (userId=${params.userId})`, error);
  }
}
