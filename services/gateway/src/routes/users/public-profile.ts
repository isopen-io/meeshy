import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { sendNotFound } from '../../utils/response';
import { gateProfilePresence } from './presence-gate';

/**
 * LA forme publique d'un profil — projection, schéma, composition, lecture.
 *
 * ## Pourquoi un module, et pas quatre exemplaires dans quatre routes
 *
 * Cinq routes lisaient le même profil sous TROIS formes de réponse : trois
 * portes dédiées partageant leur projection, `GET /users/:id` qui la recopiait
 * à la main, et `GET /u/:username` qui en servait une version plus courte. Les
 * trois défauts de #4161 se logeaient dans cet écart — six champs privés
 * sortant par un `additionalProperties: true`, un `autoTranslateEnabled` écrit
 * en dur, et aucun cache conditionnel.
 *
 * Ce module tient ENSEMBLE les quatre décisions qui doivent voyager ensemble :
 * ce qui est CHARGÉ (`publicUserSelect`), ce qui est DÉCLARÉ
 * (`publicProfileSchema`), ce qui est COMPOSÉ (`buildPublicProfile`) et
 * comment on le SERT (`servirProfilPublic`). Un champ ajouté à l'un sans
 * l'autre est soit chargé et supprimé, soit déclaré et absent.
 */

// Shared Prisma select fragment for a user's public voice profile.
// Selected via the `voiceModel` relation; `voicePublicAt` gates exposure.
export const voiceModelSelect = {
  voicePublicAt: true,
  referenceAudioUrl: true,
  totalDurationMs: true,
  qualityScore: true,
} as const;

export type VoiceModelFields = {
  voicePublicAt: Date | null;
  referenceAudioUrl: string | null;
  totalDurationMs: number | null;
  qualityScore: number | null;
};

export type PublicVoiceFields =
  | { voicePublic: false }
  | {
      voicePublic: true;
      voiceSampleUrl: string;
      voiceSampleDurationMs: number | null;
      voiceQuality: number | null;
    };

/**
 * Maps a user's (optional) voice model to public-safe voice fields and strips
 * the raw `voiceModel` relation so internal columns never leak.
 *
 * A voice profile is exposed only when the user opted in (`voicePublicAt`
 * non-null) AND a reference audio URL exists. Block-relationship ACL is a
 * documented follow-up (see CLAUDE task notes) — this gates purely on opt-in.
 */
export function deriveVoiceFields(voiceModel: VoiceModelFields | null | undefined): PublicVoiceFields {
  if (voiceModel && voiceModel.voicePublicAt != null && voiceModel.referenceAudioUrl) {
    return {
      voicePublic: true,
      voiceSampleUrl: voiceModel.referenceAudioUrl,
      voiceSampleDurationMs: voiceModel.totalDurationMs ?? null,
      voiceQuality: voiceModel.qualityScore ?? null,
    };
  }
  return { voicePublic: false };
}

export function withVoiceFields<T extends { voiceModel?: VoiceModelFields | null }>(
  user: T
): Omit<T, 'voiceModel'> & PublicVoiceFields {
  const { voiceModel, ...rest } = user;
  return { ...rest, ...deriveVoiceFields(voiceModel) };
}

// Shared Prisma select & profile builder for dedicated lookup endpoints
/**
 * La forme SERVIE d'un profil public — le miroir déclaré de `publicUserSelect`.
 *
 * Les deux vivent côte à côte pour que l'écart se voie : un champ ajouté à
 * l'un sans l'autre est soit chargé et supprimé (inutile), soit déclaré et
 * absent (menteur).
 */
export const publicProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    banner: { type: 'string', nullable: true },
    bio: { type: 'string', nullable: true },
    role: { type: 'string' },
    isOnline: { type: ['boolean', 'null'] },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    voicePublic: { type: 'boolean' },
    voiceSampleUrl: { type: 'string', nullable: true },
    voiceSampleDurationMs: { type: 'number', nullable: true },
    voiceQuality: { type: 'number', nullable: true },
    isAnonymous: { type: 'boolean' },
    isMeeshyer: { type: 'boolean' },
  },
} as const;

/**
 * Ce qu'un profil PUBLIC charge — et rien de plus (#4161).
 *
 * Il chargeait auparavant les TROIS langues du Prisme, `isActive`,
 * `deactivatedAt` et `updatedAt`, que les schémas laissaient sortir par un
 * `additionalProperties: true`. Mesuré en intégration : vingt-trois champs
 * servis à un appelant ANONYME, dont les préférences linguistiques d'un
 * inconnu et l'état de son compte.
 *
 * Le repli est à la SOURCE, pas au schéma : le dépôt l'écrit déjà — « compter
 * sur fast-json-stringify pour retenir une donnée personnelle est un piège
 * armé, pas une garde ». Ce qui ne sort pas de la base ne peut pas fuir par une
 * omission de déclaration, et la première personne qui ajoute le champ au
 * schéma ne publie alors rien.
 *
 * `isOnline` / `lastActiveAt` restent chargés : ils sont la MATIÈRE du gate de
 * présence (`gateProfilePresence`), qui décide ensuite s'ils sortent.
 */
export const publicUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  banner: true,
  bio: true,
  role: true,
  isOnline: true,
  lastActiveAt: true,
  // CHARGÉ, jamais SERVI — et c'est la distinction qui compte ici. Le retirer
  // du `select` en même temps que les cinq autres champs privés a paru juste
  // (il ne doit pas partir) et affaiblissait la garde : `gateProfilePresence`
  // le lit pour masquer la présence d'un compte DÉSACTIVÉ, et un `?? null`
  // rendait ce cas invisible. Un champ retiré d'une projection emporte tous
  // ses consommateurs, pas seulement celui qui le publiait.
  // Il ne sort pas : `publicProfileSchema` ne le déclare pas.
  deactivatedAt: true,
  createdAt: true,
  voiceModel: { select: voiceModelSelect }
} as const;

/**
 * La composition PUBLIQUE d'un profil — voix dérivée, drapeaux d'identité.
 *
 * GÉNÉRIQUE, comme `withVoiceFields`, et pour la même raison : un paramètre
 * `Record<string, unknown>` EFFACE la forme de ce qu'on lui passe. Les
 * appelants recomposent ensuite le résultat avec des gardes qui, elles,
 * exigent des champs nommés (`gateProfilePresence` veut `id`, `isOnline`,
 * `lastActiveAt`) — et l'effacement les leur retire au moment précis où elles
 * en ont besoin. Un cast au site d'appel ferait taire l'erreur en rendant la
 * garde inopérante au typage.
 */
export function buildPublicProfile<T extends { voiceModel?: VoiceModelFields | null }>(user: T) {
  // `autoTranslateEnabled: true` était écrit EN DUR — un champ de contrat qui
  // ne disait rien de vrai, et qu'un client pouvait croire refléter la
  // préférence de la personne. `email: ''` et `phoneNumber: undefined`
  // prétendaient masquer ce qu'il suffit de ne pas charger. Les trois sont
  // retirés (#4161).
  return {
    ...withVoiceFields(user),
    isAnonymous: false,
    isMeeshyer: true,
  };
}

/**
 * Lire UN profil public, à partir d'un `handle` — identifiant ou pseudo.
 *
 * ## Pourquoi une fonction, et non quatre handlers
 *
 * `GET /directory/people/:handle` est l'adresse canonique ; `GET /users/:id`,
 * `GET /users/id/:id` et `GET /u/:username` en sont des ALIAS qui restent
 * servis tant que des versions iOS installées les appellent — un profil
 * s'ouvre depuis un lien partagé, et la queue est longue (#4161, critère 9).
 *
 * Un alias qui REDIRIGE en HTTP casserait ces clients (aucun ne suit une 302
 * sur une lecture JSON) ; un alias qui recopie le handler rouvre l'écart qu'on
 * vient de fermer. Un appel de fonction est la seule forme qui donne quatre
 * adresses à UNE implémentation.
 *
 * La détection identifiant/pseudo est celle de `/users/:id` — `isValidObjectId`
 * — donc aucune sémantique nouvelle.
 *
 * Rend `null` quand la personne n'existe pas ET a déjà répondu 404 : l'appelant
 * n'a plus qu'à propager.
 */
export async function servirProfilPublic(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  handle: string
): Promise<Record<string, unknown> | null> {
  const user = await fastify.prisma.user.findFirst({
    where: isValidObjectId(handle)
      ? { id: handle }
      : { username: { equals: handle, mode: 'insensitive' } },
    select: publicUserSelect,
  });

  if (!user) {
    sendNotFound(reply, 'User not found');
    return null;
  }

  // Garder D'ABORD, composer ensuite : la garde lit `isOnline`,
  // `lastActiveAt` et `deactivatedAt` sur la ligne chargée.
  return buildPublicProfile(await gateProfilePresence(fastify, request, user)) as unknown as Record<string, unknown>;
}
