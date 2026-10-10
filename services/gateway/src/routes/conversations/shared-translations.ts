/**
 * Surface TRADUCTIONS PARTAGÉES (#9899) — `POST` et `GET /conversations/:id/shared-translations`.
 *
 * Décision porteur du 2026-10-10 : c'est l'appareil de chaque membre qui traduit
 * vers SA langue, puis partage sa traduction aux autres. Le serveur ne traduit
 * pas : il garde et relaie une enveloppe SCELLÉE
 * (`packages/shared/types/shared-translation.ts`), qu'il ne déchiffre, n'analyse
 * ni ne transforme jamais. Elle est scellée pour qui détient le texte du
 * message : dans une conversation dont le serveur lit les messages, elle ne le
 * protège PAS de lui — il ne l'ouvre pas, mais il le pourrait. Seule la
 * dérivation `message-secret`, refusée tant que le message chiffré qui la
 * transporte n'existe pas (#9959), l'en protégera.
 *
 * | geste | ce que la route fait |
 * |---|---|
 * | `POST` | range l'enveloppe (le PREMIER partage gagne) puis la diffuse |
 * | `GET`  | rend, par message demandé, la traduction de sa version COURANTE dans la première langue du prisme du lecteur qu'un membre a partagée |
 *
 * ─── L'ORDRE DES REFUS (POST) ───────────────────────────────────────────────
 *
 * Le corps (400), la conversation (404), la participation (403), ce que la
 * conversation admet de lui (410, 403), son droit personnel d'écrire (403), ses
 * accusés de lecture coupés (403), le message et le droit de le LIRE (404),
 * puis ce qu'il EST : protégé (422), langue non normalisée (400), même langue
 * (422), dérivation refusée (422), version quittée (409) ; enfin le budget du
 * compte (429). Une fois la ligne rangée, la relecture du message la retire
 * encore s'il a disparu (404), s'est fait protéger (422) ou a changé (409) : voir
 * la course avec les écrivains.
 *
 * Le droit de LIRE le message précède tout verdict qui en dirait quelque chose :
 * un 422 « message protégé », « même langue », « dérivation refusée » ou un 409
 * « version quittée » apprendrait à un membre qu'un message qu'il ne lit pas
 * (antérieur à son plancher d'historique, retiré de sa vue) existe et ce qu'il
 * est. Tous les refus qui précèdent sont donc un même 404 — la loi de lecture
 * est `messageReadAccess.ts`, la même que celle du favori et du transfert,
 * jamais une seconde écriture. Elle est jugée avec `'refuse'` : un masquage
 * personnel illisible n'autorise rien.
 *
 * ─── QUI NE PEUT PAS ÉCRIRE ICI NE PARTAGE PAS ──────────────────────────────
 *
 * Un partage fait afficher une ligne sous le message d'un autre, à tous les
 * membres. La conversation l'admet donc comme un envoi
 * (`admitDerivedConversationWrite`) : close, elle refuse (410) sans dispense ;
 * un canal d'annonces ou un plancher `defaultWriteRole` refuse qui n'a pas le
 * rang (403) ; Global refuse un mineur déclaré (403 `GLOBAL_ADULTS_ONLY`). Les
 * deux débits d'envoi (mode lent, nouveaux comptes) mesurent des MESSAGES et ne
 * s'appliquent pas : le partage a les siens, ci-dessous. Le droit PERSONNEL
 * d'écrire (`canSendMessages`, avec la surcharge que l'hôte pose sur un invité)
 * s'applique comme à l'envoi : seul un refus explicite bloque (403
 * `WRITE_NOT_PERMITTED`).
 *
 * ─── UN PARTAGE EST UN ACCUSÉ DE LECTURE ────────────────────────────────────
 *
 * L'appareil traduit ce qu'il AFFICHE, et la diffusion nomme qui partage et
 * quand : partager dit aux autres « X a ce message sous les yeux », même dans une
 * conversation à deux où `sharedBy` serait tu. Qui a coupé ses accusés de lecture
 * (`showReadReceipts`) ne partage donc pas : 403 `SHARED_TRANSLATION_READ_RECEIPTS_OFF`,
 * jugé avant le message parce qu'il dit ce que fait le COMPTE. Sa traduction reste
 * sur son appareil ; les autres traduisent sur le leur.
 *
 * ─── LA VERSION TRADUITE ────────────────────────────────────────────────────
 *
 * L'appareil dit quelle version il a traduite (`sourceVersion` : `editedAt`, ou
 * `"original"`). Si le message a été modifié depuis, la traduction ne traduit
 * plus ce que les autres lisent, et rangée sous la version courante elle
 * prendrait la place de la bonne sans jamais s'ouvrir : 409
 * `SHARED_TRANSLATION_STALE_SOURCE`, et l'appareil traduit la nouvelle version.
 * L'instant se compare à la milliseconde près (`namesCurrentVersion`), et la
 * ligne se range toujours sous la version du SERVEUR.
 *
 * ─── LE PREMIER PARTAGE GAGNE ───────────────────────────────────────────────
 *
 * Une traduction par `(messageId, targetLanguage, sourceVersion)`. La route
 * écrit d'abord et ne relit que sur la violation d'unicité : lire avant d'écrire
 * laisserait deux membres passer ensemble. Une édition change la version :
 * l'ancienne ligne n'est plus servie, et un nouveau partage redevient possible.
 * Un partage perdu rend la traduction gagnante (`created: false`) : l'appareil
 * la prend, il n'a pas à retenter.
 *
 * L'arbitre est l'index unique, que Prisma ne crée pas sur MongoDB : il se pose à
 * la main (`packages/shared/prisma/migrations/2026-10-10-shared-translation-indexes.mongodb.js`).
 * Tant qu'il manque, la création ne lève jamais ; le `GET` tient alors la même loi
 * à la lecture (la première partagée), mais deux partages simultanés se
 * diffusent tous deux.
 *
 * ─── LA COURSE AVEC LES ÉCRIVAINS ───────────────────────────────────────────
 *
 * Qui supprime, modifie, anonymise ou purge un message efface ses traductions
 * partagées APRÈS son écriture (`sharedTranslationErasure`). Un partage validé
 * avant cette écriture et rangé après cet effacement y survivrait : la ligne d'un
 * message supprimé resterait en base pour toujours. La route relit donc le message
 * une fois sa ligne rangée, et la retire sans la diffuser quand il a disparu, s'est
 * fait protéger ou a quitté la version traduite. Tout entrelacement est couvert :
 * ou l'effacement passe après le rangement et emporte la ligne, ou la relecture
 * passe après l'écriture et la voit. Seul un arrêt du processus entre les deux
 * laisse une ligne, qu'aucune lecture ne sert (une version quittée ne se lit plus,
 * un message supprimé non plus).
 *
 * ─── CE QU'UN COMPTE PEUT RANGER ────────────────────────────────────────────
 *
 * Deux plafonds par COMPTE, en plus du limiteur global par adresse. Le premier
 * compte les REQUÊTES (`SHARED_TRANSLATION_SHARE_RATE_LIMIT`, 120 par minute) ;
 * le second ce qu'elles RANGENT (`SHARED_TRANSLATION_SHARE_BUDGET`, en caractères
 * d'enveloppe, par heure et par jour), parce qu'une requête porte jusqu'à
 * 40 Kio. Le budget n'est débité qu'une fois tous les refus passés — un partage
 * refusé pour ce qu'il est n'entame rien —, et un partage perdu dans la course
 * l'est aussi : la course se tranche à l'écriture, après le budget. Un partage
 * retiré par la relecture d'après rangement l'a entamé aussi.
 *
 * ─── LA DIFFUSION ───────────────────────────────────────────────────────────
 *
 * `message:translation-shared` part à l'audience de `message:translation`
 * (`translationReaders`) : la room de la conversation, ou les seules rooms
 * personnelles de ceux que leur plancher d'historique laisse lire le message.
 * Seule une enveloppe d'au plus `SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD`
 * caractères part en direct : une room n'a pas à porter 40 Kio à chaque socket,
 * et la traduction d'un long message reste servie par le `GET`. Aucune file hors
 * ligne : c'est une amélioration de lecture, et le `GET` est le rattrapage de
 * qui rouvre la conversation. Une diffusion qui échoue ne fait jamais échouer le
 * partage — la ligne est rangée, le `GET` la sert.
 *
 * ─── LA LECTURE ─────────────────────────────────────────────────────────────
 *
 * Le `GET` exige le prisme du lecteur (`languages`, dans son ordre) et rend au
 * plus UNE traduction par message : celle de la première de ses langues qu'un
 * membre a partagée. Il lit d'abord QUI a partagé quoi, sans les enveloppes, en
 * une requête ordonnée et bornée ; puis les seules enveloppes qu'il sert — au
 * plus cent, de 40 Kio chacune. Il a son propre plafond par compte
 * (`SHARED_TRANSLATION_READ_RATE_LIMIT`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import {
  SHARED_TRANSLATION_ALGORITHM,
  SHARED_TRANSLATION_ERROR_CODES,
  SHARED_TRANSLATION_KDFS,
  SHARED_TRANSLATION_LIMITS,
  acceptedSharedTranslationKdfs,
  shareTranslationBodyJsonSchema,
  shareTranslationBodySchema,
  sharedTranslationsQuerySchema,
  type SharedTranslation,
} from '@meeshy/shared/types/shared-translation';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SUPPORTED_LANGUAGE_CODES } from '@meeshy/shared/utils/language-codes';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { messageProtection, type MessageProtectionInput } from '@meeshy/shared/utils/message-protection';
import { SHARED_TRANSLATION_ORIGINAL_SOURCE } from '@meeshy/shared/utils/shared-translation-eligibility';

import { PRIVACY_PREFERENCES_DEFAULTS } from '../../config/user-preferences-defaults';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { historyReaderFromAuthContext, type HistoryReader } from '../../services/historyFloor';
import {
  admitDerivedConversationWrite,
  describeConversationWriteRefusal,
  isConversationWriteRefused,
  writeRefusalHttpResponse,
} from '../../services/messaging/conversationWriteAdmission';
import { readerMayReadMessage, readerMayReadMessages } from '../../services/messaging/messageReadAccess';
import { resolveParticipantRights, type ParticipantRightsOverride } from '../../services/participantRights';
import { loadPrivacyPreferencesCached } from '../../services/preferences/privacy-cache';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { translationReaders } from '../../socketio/translationReaders';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response.js';
import { MESSAGE_PROTECTION_SELECT } from './messageProtectionProjection';
import { logger } from './messages-shared';
import { resolveCallerParticipant } from './utils/access-control';

/**
 * Ce qu'un COMPTE peut ranger, en caractères d'enveloppe. Un message ordinaire
 * se scelle en quelques centaines de caractères, le plus long qu'un appareil
 * traduise (4 000 caractères sur iOS) en une dizaine de milliers : l'heure
 * laisse partager quelques milliers de messages ordinaires ou une centaine de
 * longs, la journée quatre fois plus. Au-delà, la traduction reste sur
 * l'appareil — le lecteur la voit, les autres traduisent eux-mêmes.
 */
export type SharedTranslationShareBudget = { readonly perHour: number; readonly perDay: number };

export const SHARED_TRANSLATION_SHARE_BUDGET: SharedTranslationShareBudget = { perHour: 1_000_000, perDay: 4_000_000 };

/** Au-delà, l'enveloppe est rangée et servie par le `GET`, jamais diffusée à la room (voir l'en-tête). */
export const SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD = 8_192;

export type SharedTranslationRouteOptions = {
  readonly now?: () => Date;
  readonly shareBudget?: SharedTranslationShareBudget;
};

/**
 * Un plafond par COMPTE et par minute, pour `@fastify/rate-limit`.
 *
 * `hook: 'preHandler'` : l'identité est posée en `preValidation`, une phase plus
 * tardive que l'`onRequest` par défaut du plugin, qui compterait l'adresse.
 * `skipOnError: false` : la config de route hérite sinon du `skipOnError: true`
 * du limiteur global, et une panne du magasin de compteurs ouvrirait le plafond.
 */
const perAccountRateLimit = (params: { readonly max: number; readonly gesture: string; readonly error: string }) => ({
  max: params.max,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    return `shared-translations:${params.gesture}:${authContext?.userId ?? `ip:${request.ip}`}`;
  },
  errorResponseBuilder: () => ({ success: false, error: params.error, statusCode: 429 }),
});

/**
 * Le plafond des partages. Un appareil partage au plus une traduction par
 * message reçu de sa fenêtre récente (quarante sur iOS) : cent vingt laissent
 * ouvrir plusieurs conversations d'affilée.
 */
export const SHARED_TRANSLATION_SHARE_RATE_LIMIT = perAccountRateLimit({
  max: 120,
  gesture: 'share',
  error: 'Too many shared translations. Please slow down.',
});

/**
 * Le plafond des lectures. Un appareil lit les traductions partagées en ouvrant
 * une conversation, par lots de cent messages, et deux fois au plus par
 * message : soixante laissent parcourir plusieurs conversations à la minute.
 */
export const SHARED_TRANSLATION_READ_RATE_LIMIT = perAccountRateLimit({
  max: 60,
  gesture: 'read',
  error: 'Too many shared translation reads. Please slow down.',
});

/** Ce qu'il faut du message pour juger le droit de lire, la protection, la langue, la dérivation et la version. */
const SHARED_TRANSLATION_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deletedAt: true,
  originalLanguage: true,
  editedAt: true,
  isEncrypted: true,
  encryptionMode: true,
  ...MESSAGE_PROTECTION_SELECT,
} as const;

/** Ce qu'il faut de la conversation pour l'admission d'un acte dérivé et pour la dérivation. */
const SHARED_TRANSLATION_CONVERSATION_SELECT = {
  type: true,
  isActive: true,
  closedAt: true,
  isAnnouncementChannel: true,
  defaultWriteRole: true,
  encryptionMode: true,
} as const;

/** Ce qu'il faut du partageur : son rang et son compte (admission), ses droits (écriture personnelle). */
const SHARER_SELECT = {
  role: true,
  permissions: true,
  anonymousSession: true,
  user: { select: { role: true, birthDate: true } },
} as const;

type SharerRow = {
  readonly role?: string | null;
  readonly permissions?: ParticipantPermissions | null;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
  readonly user?: { readonly role?: string | null; readonly birthDate?: Date | null } | null;
};

/**
 * Une enveloppe se range sous un code du catalogue, jamais sous un code inventé :
 * le catalogue borne le nombre d'enveloppes qu'un même message peut porter
 * (une par langue et par version), là où « deux ou trois lettres » en ouvrait
 * dix-huit mille.
 */
const CATALOG_LANGUAGES: ReadonlySet<string> = new Set(SUPPORTED_LANGUAGE_CODES.map((code) => code.toLowerCase()));

const isCatalogLanguage = (language: string): boolean =>
  normalizeLanguageForDedup(language) === language && CATALOG_LANGUAGES.has(language);

/** La version du message que les appareils traduisent MAINTENANT — la seule dont une traduction est rangée ou servie. */
const currentSourceVersion = (message: { readonly editedAt: Date | null }): string =>
  message.editedAt ? message.editedAt.toISOString() : SHARED_TRANSLATION_ORIGINAL_SOURCE;

/**
 * L'appareil nomme-t-il la version courante ? À la milliseconde près : iOS range
 * ses dates dans une colonne texte à la milliseconde, et relit parfois
 * `…05:00.000` en `…04:59.999`. Deux modifications ne tombent pas dans la même
 * milliseconde, et l'enveloppe lie l'empreinte du texte qu'elle traduit — l'écart
 * ne peut faire passer la traduction d'un autre texte. `original` ne se lit pas
 * comme un instant (`NaN` ne s'approche de rien) : il ne s'accorde qu'avec lui-même.
 */
const SOURCE_VERSION_TOLERANCE_MS = 1;

const namesCurrentVersion = (named: string, current: string): boolean =>
  named === current || Math.abs(Date.parse(named) - Date.parse(current)) <= SOURCE_VERSION_TOLERANCE_MS;

/**
 * Éphémère, à vue unique ou flouté : une traduction partagée survivrait au
 * contenu qu'elle reprend, et ne serait jamais MOINS durable que lui. Le
 * chiffrement de bout en bout n'en est pas une — il choisit la dérivation.
 */
const isProtectedMessage = (message: MessageProtectionInput): boolean => {
  const { ephemeral, viewOnce, blurred } = messageProtection(message);
  return ephemeral || viewOnce || blurred;
};

/**
 * Le partageur montre-t-il ses accusés de lecture ? Voir l'en-tête : un partage en
 * est un. La loi des préférences, jamais une seconde lecture — document `privacy`,
 * puis lignes de janvier (`loadPrivacyPreferencesCached`).
 *
 * Rien de réglé n'est pas un refus (`!== false`). Un invité de lien partagé est
 * servi par les défauts, sans base : son identifiant est un `Participant.id`.
 * Une lecture qui échoue LÈVE, et la route répond 500 sans rien ranger — le repli
 * RESTRICTIF de `privacy-cache.ts` : un partage refait plus tard ne coûte qu'une
 * traduction, une lecture révélée ne se reprend pas.
 */
async function sharerShowsReadReceipts(prisma: PrismaClient, reader: HistoryReader): Promise<boolean> {
  if (reader.kind === 'anonymous') return PRIVACY_PREFERENCES_DEFAULTS.showReadReceipts;
  const stored = await loadPrivacyPreferencesCached(prisma, [reader.userId]);
  return stored.get(reader.userId)?.showReadReceipts !== false;
}

/**
 * Le droit PERSONNEL d'écrire, comme à l'envoi (`MessagingService`, 3.7) : la
 * loi des droits avec la surcharge de l'hôte, et seul un refus explicite bloque
 * — une ligne sans `permissions` est permissive.
 */
const sharerMayWrite = (sharer: SharerRow | null): boolean => {
  if (!sharer?.permissions) return true;
  const rights = resolveParticipantRights({ permissions: sharer.permissions, anonymousSession: sharer.anonymousSession });
  return rights.canSendMessages !== false;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ShareBuckets = { readonly hour: RateLimiter; readonly day: RateLimiter };

/**
 * UN jeu de seaux par SERVEUR, créé au premier partage : Redis est décoré sur
 * l'instance après l'enregistrement des routes, et sans lui chaque limiteur a
 * son magasin mémoire.
 */
const SHARE_BUCKETS = new WeakMap<object, ShareBuckets>();

function shareBuckets(fastify: FastifyInstance, budget: SharedTranslationShareBudget): ShareBuckets {
  const existing = SHARE_BUCKETS.get(fastify.server);
  if (existing) return existing;
  const redis = fastify.redis ?? undefined;
  const created: ShareBuckets = {
    hour: createCustomRateLimiter({ max: budget.perHour, windowMs: HOUR_MS, keyPrefix: 'shared-translations:chars:h' }, redis),
    day: createCustomRateLimiter({ max: budget.perDay, windowMs: DAY_MS, keyPrefix: 'shared-translations:chars:d' }, redis),
  };
  SHARE_BUCKETS.set(fastify.server, created);
  return created;
}

/**
 * Débite l'enveloppe sur les deux fenêtres du compte, et rend l'attente avant le
 * prochain partage possible — `0` quand celui-ci passe. Les deux fenêtres sont
 * débitées ensemble : un partage refusé par l'une a été reçu. Une panne du
 * magasin laisse passer, comme le budget des contacts : le plafond par minute,
 * lui, refuse sur la même panne.
 */
async function spendShareBudget(buckets: ShareBuckets, account: string, cost: number): Promise<number> {
  const key = `account:${account}`;
  const verdicts = await Promise.all([buckets.hour.consume(key, cost), buckets.day.consume(key, cost)]);
  const waits = verdicts.flatMap((info) => (info?.retryAfter !== undefined ? [info.retryAfter] : []));
  return waits.length === 0 ? 0 : Math.max(1, ...waits);
}

function refuseShareBudget(reply: FastifyReply, retryAfter: number) {
  reply.header('Retry-After', String(retryAfter));
  return sendError(reply, 429, 'Too many translations shared from this account: they stay on this device for now', {
    code: SHARED_TRANSLATION_ERROR_CODES.budgetExceeded,
  });
}

/** Les colonnes de `SharedTranslation` que le fil sert. */
type SharedTranslationRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly kdf: string;
  readonly payload: string;
  readonly sharedById: string;
  readonly createdAt: Date;
};

const SHARED_TRANSLATION_WIRE_SELECT = {
  id: true,
  conversationId: true,
  messageId: true,
  targetLanguage: true,
  kdf: true,
  payload: true,
  sharedById: true,
  createdAt: true,
} as const;

/** Ce que la lecture regarde avant de choisir : qui a partagé quoi, sans l'enveloppe. */
const SHARED_TRANSLATION_INVENTORY_SELECT = {
  id: true,
  messageId: true,
  targetLanguage: true,
  createdAt: true,
} as const;

type SharedTranslationInventoryRow = Pick<SharedTranslationRow, 'id' | 'messageId' | 'targetLanguage' | 'createdAt'>;

/**
 * Le SEUL sérialiseur : le REST (`POST`, `GET`) et l'événement temps réel servent
 * exactement cette forme. `null` quand la ligne porte une dérivation que le
 * contrat ne connaît pas — la colonne est une chaîne, et une ligne qu'on ne sait
 * pas décrire ne se sert pas.
 */
export function serializeSharedTranslation(row: SharedTranslationRow): SharedTranslation | null {
  const kdf = SHARED_TRANSLATION_KDFS.find((known) => known === row.kdf);
  if (!kdf) return null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    targetLanguage: row.targetLanguage,
    envelope: { v: 1, alg: SHARED_TRANSLATION_ALGORITHM, kdf, payload: row.payload },
    sharedBy: row.sharedById,
    sharedAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

type SharedTranslationDraft = Omit<SharedTranslationRow, 'id' | 'createdAt'> & { readonly sourceVersion: string };

/** Créer, et relire sur une violation d'unicité — jamais lire avant d'écrire (voir l'en-tête). */
async function placeSharedTranslation(
  prisma: PrismaClient,
  draft: SharedTranslationDraft,
): Promise<{ readonly row: SharedTranslationRow; readonly created: boolean }> {
  try {
    return { row: await prisma.sharedTranslation.create({ data: draft }), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.sharedTranslation.findUnique({
      where: {
        messageId_targetLanguage_sourceVersion: {
          messageId: draft.messageId,
          targetLanguage: draft.targetLanguage,
          sourceVersion: draft.sourceVersion,
        },
      },
    });
    if (!existing) throw error;
    return { row: existing, created: false };
  }
}

const refuseProtectedMessage = (reply: FastifyReply) =>
  sendError(reply, 422, 'A protected message cannot carry a shared translation', {
    code: SHARED_TRANSLATION_ERROR_CODES.protectedMessage,
  });

const refuseStaleSource = (reply: FastifyReply) =>
  sendError(reply, 409, 'The message changed since it was translated', {
    code: SHARED_TRANSLATION_ERROR_CODES.staleSource,
  });

type PlacementRefusal = 'gone' | 'protected' | 'stale';

const PLACEMENT_REFUSALS: Readonly<Record<PlacementRefusal, (reply: FastifyReply) => unknown>> = {
  gone: (reply) => sendNotFound(reply, 'Message not found'),
  protected: refuseProtectedMessage,
  stale: refuseStaleSource,
};

/** Le message relu après le rangement porte-t-il encore la ligne ? Voir la course avec les écrivains. */
const refusalAfterPlacement = (
  message: (MessageProtectionInput & { readonly deletedAt: Date | null; readonly editedAt: Date | null }) | null,
  version: string,
): PlacementRefusal | null => {
  if (!message || message.deletedAt) return 'gone';
  if (isProtectedMessage(message)) return 'protected';
  return currentSourceVersion(message) === version ? null : 'stale';
};

/**
 * Retire la ligne qu'on vient de ranger. Best-effort : l'écriture de l'autre est
 * committée, et une ligne laissée là ne se sert pas. `deleteMany`, parce que
 * l'effacement de l'écrivain a pu passer après le rangement et l'avoir déjà
 * emportée.
 */
async function withdrawSharedTranslation(prisma: PrismaClient, id: string): Promise<void> {
  try {
    await prisma.sharedTranslation.deleteMany({ where: { id } });
  } catch (error) {
    logger.warn('shared translation withdrawal failed (best-effort)', { sharedTranslationId: id, error });
  }
}

/**
 * Best-effort : la ligne est rangée, le `GET` la sert. Même audience que celle
 * dont `deliverTextTranslation` livre la traduction d'un message par le serveur.
 */
async function broadcastSharedTranslation(params: {
  readonly io: ServerEmitIO | null | undefined;
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly messageCreatedAt: Date;
  readonly sharedTranslation: SharedTranslation;
  readonly now: Date;
}): Promise<void> {
  const { io, prisma, conversationId, messageCreatedAt, sharedTranslation, now } = params;
  if (!io) return;
  try {
    const readers = await translationReaders(prisma, conversationId, messageCreatedAt, now);
    if (readers.kind === 'room') {
      io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, sharedTranslation);
      return;
    }
    if (readers.rooms.length === 0) return;
    io.to([...readers.rooms]).emit(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, sharedTranslation);
  } catch (error) {
    logger.warn('shared translation broadcast failed (best-effort)', {
      conversationId,
      messageId: sharedTranslation.messageId,
      error,
    });
  }
}

const sharedTranslationResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    messageId: { type: 'string' },
    targetLanguage: { type: 'string' },
    envelope: shareTranslationBodyJsonSchema.properties.envelope,
    sharedBy: { type: 'string' },
    sharedAt: { type: 'string' },
  },
} as const;

const shareResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: { sharedTranslation: sharedTranslationResponseSchema, created: { type: 'boolean' } },
    },
  },
} as const;

const listResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: { sharedTranslations: { type: 'array', items: sharedTranslationResponseSchema } },
    },
  },
} as const;

const conversationParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
} as const;

/** Le prisme du lecteur, normalisé comme les clés stockées, dans SON ordre et sans doublon. */
const readerPrism = (languages: readonly string[]): readonly string[] => [...new Set(languages.map(normalizeLanguageForDedup))];

/** La première partagée d'abord : un ordre stable, que le contrôle de version de la réponse peut reconnaître. */
const byFirstShared = (a: SharedTranslationRow, b: SharedTranslationRow): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

const slotKey = (messageId: string, language: string): string => `${messageId}|${language}`;

/**
 * UNE traduction par message : celle de la première langue du prisme qu'un
 * membre a partagée, et, dans cette langue, la PREMIÈRE partagée. L'inventaire
 * arrive dans l'ordre de partage, donc la première ligne d'un emplacement est la
 * bonne. L'index unique l'impose déjà à l'écriture, mais Prisma ne le crée pas
 * sur MongoDB : une passerelle peut servir avant qu'il soit posé, et deux
 * partages simultanés être rangés tous deux — la lecture tient la même loi.
 */
function preferredPerMessage(
  inventory: readonly SharedTranslationInventoryRow[],
  prism: readonly string[],
): readonly SharedTranslationInventoryRow[] {
  const firstShared = inventory.reduce(
    (slots, row) => (slots.has(slotKey(row.messageId, row.targetLanguage)) ? slots : slots.set(slotKey(row.messageId, row.targetLanguage), row)),
    new Map<string, SharedTranslationInventoryRow>(),
  );
  return [...new Set(inventory.map((row) => row.messageId))].flatMap((messageId) => {
    const language = prism.find((candidate) => firstShared.has(slotKey(messageId, candidate)));
    return language === undefined ? [] : [firstShared.get(slotKey(messageId, language))];
  });
}

export function registerSharedTranslationRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: unknown,
  options: SharedTranslationRouteOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const shareBudget = options.shareBudget ?? SHARED_TRANSLATION_SHARE_BUDGET;

  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/conversations/:id/shared-translations', {
    schema: {
      description: 'Traduction partagée (#9899) : un membre partage aux autres la traduction qu’il a faite sur son appareil, scellée — le premier partage gagne',
      tags: ['conversations', 'messages'],
      summary: 'Share the translation of a message with the other members',
      params: conversationParams,
      body: shareTranslationBodyJsonSchema,
      response: {
        200: shareResponseSchema,
        201: shareResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
        410: errorResponseSchema,
        422: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    config: { rateLimit: SHARED_TRANSLATION_SHARE_RATE_LIMIT },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const body = shareTranslationBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendBadRequest(reply, 'Invalid shared translation');
      }
      const { messageId, targetLanguage, sourceVersion, envelope } = body.data;

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const caller = await resolveCallerParticipant(prisma, authContext, conversationId);
      const reader = historyReaderFromAuthContext(authContext);
      if (!caller || !reader) {
        return sendForbidden(reply, 'Not a participant');
      }

      const [conversation, sharer] = await Promise.all([
        prisma.conversation.findUnique({ where: { id: conversationId }, select: SHARED_TRANSLATION_CONVERSATION_SELECT }),
        prisma.participant.findUnique({ where: { id: caller.id }, select: SHARER_SELECT }) as Promise<SharerRow | null>,
      ]);
      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const admission = admitDerivedConversationWrite({ conversation, sender: sharer, now: now() });
      if (isConversationWriteRefused(admission)) {
        const refusal = writeRefusalHttpResponse(admission);
        return sendError(reply, refusal.status, describeConversationWriteRefusal(admission), 'code' in refusal ? { code: refusal.code } : {});
      }

      if (!sharerMayWrite(sharer)) {
        return sendForbidden(reply, 'Writing in this conversation is not permitted', { code: 'WRITE_NOT_PERMITTED' });
      }

      if (!(await sharerShowsReadReceipts(prisma, reader))) {
        return sendForbidden(reply, 'Read receipts are off: translations stay on this device', {
          code: SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff,
        });
      }

      const message = await prisma.message.findUnique({ where: { id: messageId }, select: SHARED_TRANSLATION_MESSAGE_SELECT });
      if (!message || message.conversationId !== conversationId) {
        return sendNotFound(reply, 'Message not found');
      }

      const mayRead = await readerMayReadMessage(prisma, {
        reader,
        message,
        now: now(),
        whenHidingUnreadable: 'refuse',
      });
      if (!mayRead) {
        return sendNotFound(reply, 'Message not found');
      }

      if (isProtectedMessage(message)) {
        return refuseProtectedMessage(reply);
      }

      if (!isCatalogLanguage(targetLanguage)) {
        return sendBadRequest(reply, 'Target language must be a normalized language code of the catalog', {
          code: SHARED_TRANSLATION_ERROR_CODES.unnormalizedLanguage,
        });
      }

      if (normalizeLanguageForDedup(message.originalLanguage ?? '') === targetLanguage) {
        return sendError(reply, 422, 'The target language is the language of the message', {
          code: SHARED_TRANSLATION_ERROR_CODES.sameLanguage,
        });
      }

      const accepted = acceptedSharedTranslationKdfs({
        conversationEncryptionMode: conversation.encryptionMode,
        messageIsEncrypted: message.isEncrypted,
        messageEncryptionMode: message.encryptionMode,
      });
      if (!accepted.includes(envelope.kdf)) {
        return sendError(reply, 422, 'This key derivation is refused for this message', {
          code: SHARED_TRANSLATION_ERROR_CODES.kdfRefused,
        });
      }

      const version = currentSourceVersion(message);
      if (!namesCurrentVersion(sourceVersion, version)) {
        return refuseStaleSource(reply);
      }

      const retryAfter = await spendShareBudget(shareBuckets(fastify, shareBudget), authContext.userId, envelope.payload.length);
      if (retryAfter > 0) {
        return refuseShareBudget(reply, retryAfter);
      }

      const placed = await placeSharedTranslation(prisma, {
        conversationId,
        messageId: message.id,
        targetLanguage,
        sourceVersion: version,
        kdf: envelope.kdf,
        payload: envelope.payload,
        sharedById: caller.id,
      });
      if (placed.created) {
        const reread = await prisma.message.findUnique({ where: { id: message.id }, select: SHARED_TRANSLATION_MESSAGE_SELECT });
        const refusal = refusalAfterPlacement(reread, version);
        if (refusal) {
          await withdrawSharedTranslation(prisma, placed.row.id);
          return PLACEMENT_REFUSALS[refusal](reply);
        }
      }
      const sharedTranslation = serializeSharedTranslation(placed.row);
      if (!sharedTranslation) {
        throw new Error(`Shared translation ${placed.row.id} carries an unknown key derivation`);
      }

      if (placed.created && placed.row.payload.length <= SHARED_TRANSLATION_BROADCAST_MAX_PAYLOAD) {
        await broadcastSharedTranslation({
          io: fastify.socketIOHandler?.getManager()?.getIO(),
          prisma,
          conversationId,
          messageCreatedAt: message.createdAt,
          sharedTranslation,
          now: now(),
        });
      }

      return sendSuccess(reply, { sharedTranslation, created: placed.created }, { statusCode: placed.created ? 201 : 200 });
    } catch (error) {
      logger.error('Error sharing a translation', error);
      return sendInternalError(reply, 'Error sharing a translation');
    }
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { messageIds: string; languages: string };
  }>('/conversations/:id/shared-translations', {
    schema: {
      description: 'Traductions partagées (#9899) : par message demandé, celle de sa version courante dans la première langue du prisme du lecteur qu’un membre a partagée, scellée — seuls les messages que l’appelant lit',
      tags: ['conversations', 'messages'],
      summary: 'List the translations shared by members for some messages',
      params: conversationParams,
      querystring: {
        type: 'object',
        required: ['messageIds', 'languages'],
        properties: {
          messageIds: {
            type: 'string',
            description: `Message ids, comma-separated (1 to ${SHARED_TRANSLATION_LIMITS.messageIdsMaxCount})`,
          },
          languages: {
            type: 'string',
            description: `The reader's languages in order of preference, comma-separated (1 to ${SHARED_TRANSLATION_LIMITS.languagesMaxCount}); at most one translation per message, the first of these languages shared`,
          },
        },
      },
      response: {
        200: listResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    config: { rateLimit: SHARED_TRANSLATION_READ_RATE_LIMIT },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const query = sharedTranslationsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid shared translations query');
      }

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const caller = await resolveCallerParticipant(prisma, authContext, conversationId);
      const reader = historyReaderFromAuthContext(authContext);
      if (!caller || !reader) {
        return sendForbidden(reply, 'Not a participant');
      }

      const messages = await prisma.message.findMany({
        where: { id: { in: [...query.data.messageIds] }, conversationId },
        select: SHARED_TRANSLATION_MESSAGE_SELECT,
        take: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount,
      });
      const unprotected = messages.filter((message) => !isProtectedMessage(message));
      const readable = await readerMayReadMessages(prisma, {
        reader,
        conversationId,
        messages: unprotected,
        now: now(),
        whenHidingUnreadable: 'refuse',
      });
      const served = unprotected.filter((message) => readable.has(message.id));
      if (served.length === 0) {
        return sendSuccess(reply, { sharedTranslations: [] });
      }

      // D'abord QUI a partagé quoi, sans les enveloppes : le prisme et la version
      // courante partent dans la requête, l'ordre de partage aussi, et la borne
      // (un emplacement par message et par langue demandée) ne coupe qu'une
      // base sans index unique — en gardant les premières partagées. La clé
      // stockée est normalisée par construction (le `POST` refuse le reste),
      // donc `in` sur le prisme normalisé est exact.
      const prism = readerPrism(query.data.languages);
      const inventory: readonly SharedTranslationInventoryRow[] = await prisma.sharedTranslation.findMany({
        where: {
          conversationId,
          OR: served.map((message) => ({ messageId: message.id, sourceVersion: currentSourceVersion(message) })),
          targetLanguage: { in: [...prism] },
        },
        select: SHARED_TRANSLATION_INVENTORY_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount * SHARED_TRANSLATION_LIMITS.languagesMaxCount,
      });
      const chosen = preferredPerMessage(inventory, prism);
      if (chosen.length === 0) {
        return sendSuccess(reply, { sharedTranslations: [] });
      }

      // Puis les seules enveloppes servies : au plus une par message demandé.
      const rows: readonly SharedTranslationRow[] = await prisma.sharedTranslation.findMany({
        where: { id: { in: chosen.map((row) => row.id) }, conversationId },
        select: SHARED_TRANSLATION_WIRE_SELECT,
        take: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount,
      });
      const sharedTranslations = [...rows].sort(byFirstShared).flatMap((row) => serializeSharedTranslation(row) ?? []);
      return sendSuccess(reply, { sharedTranslations });
    } catch (error) {
      logger.error('Error reading shared translations', error);
      return sendInternalError(reply, 'Error reading shared translations');
    }
  });
}
