import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../middleware/auth';
import { SequenceService } from '../services/SequenceService';
import { computeETag, ifNoneMatchMatches } from '../utils/etag';
import { loadPersonalHistoryHidingByConversation } from '../services/personalHistoryFilter';
import {
  historyFloorClause,
  loadShareLinkHistoryFloorsOrFail,
} from '../services/shareLinkHistoryFloor';
import { Prisma } from '@meeshy/shared/prisma/client';
import { attachmentMediaSelect } from '../services/attachments/attachmentIncludes';
import { messageSenderUserSelect } from './conversations/utils/message-sender-select';
import { serializeAttachmentForSocket } from '../socketio/serializeAttachmentForSocket';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../utils/translation-transformer';
import {
  messageAttachmentSchema,
  messageTranslationSchema,
} from '@meeshy/shared/types/api-schemas';
import { logger } from '../utils/logger';

/**
 * SyncEngine unifié (spec §7, sous-tâche A3.1) — endpoint delta `/sync`
 * read-only, collection PILOTE `messages`.
 *
 * A3.1 a livré : validation Zod, la collection `messages` (added / modified /
 * deleted par watermark `since`, cap 1000, tri ASC), `hasGap` exact via
 * `SequenceService.currentSeq` (A1), ETag/304, RLS participant-only.
 *
 * A3.2 ajoute la PAGINATION CURSOR : keyset composite `(updatedAt, id)` (resp.
 * `(deletedAt, id)`) — pas un cursor id-only, car `updatedAt` n'est PAS monotone
 * avec l'id (un vieux message ré-édité a un updatedAt récent mais un id ancien).
 * Le tiebreaker `id` garantit qu'une page reprend EXACTEMENT après la précédente,
 * même sur des `updatedAt` égaux (que le watermark temporel raterait). Le token
 * est opaque (base64url d'un JSON versionné) et encode la position des DEUX
 * streams ; un stream épuisé conserve sa clé (report) pour ne rien re-livrer.
 */

/**
 * Retrait appliqué au `checkpoint` rendu au client, en millisecondes.
 *
 * `checkpoint` est un WATERMARK : le client le renvoie en `since` au tour
 * suivant, et la borne serveur est STRICTE (`updatedAt > since`). Tout ce qui
 * n'est pas dans CETTE réponse mais porte un `updatedAt` antérieur au
 * checkpoint tombe donc dans un trou DÉFINITIF — le client ne le redemandera
 * jamais.
 *
 * Deux fenêtres produisent exactement cela, et le retrait couvre les deux :
 *
 * 1. Le checkpoint était pris APRÈS les lectures : toute ligne écrite entre la
 *    requête et l'horodatage était invisible ici et exclue du tour suivant.
 *    Corrigé en ancrant le checkpoint au DÉBUT du handler.
 * 2. `@updatedAt` est estampillé par Prisma à la CONSTRUCTION de l'écriture,
 *    pas à son commit. Une ligne estampillée T peut n'être visible qu'à T+δ :
 *    un checkpoint pris même avant nos lectures laisserait passer les
 *    écritures en vol. Seul un retrait ferme cette seconde fenêtre.
 *
 * Le coût est une RELECTURE bornée (les changements des dernières secondes
 * reviennent une fois de plus), que le client déduplique par `id`. C'est la
 * seule direction sûre, et c'est la règle que le SDK iOS documente déjà côté
 * client (`SyncWatermark` : « la fenêtre ne saute jamais une mise à jour
 * réelle, au pire elle en relit »).
 */
export const SYNC_CHECKPOINT_LAG_MS = 5_000;

const MAX_ITEMS_PER_COLLECTION = 1000;

/**
 * Plafond de POIDS d'une page `/sync`, en octets, appliqué au stream `changed`.
 *
 * Le cap de 1000 est un plafond de LIGNES, et il a suffi tant qu'une ligne
 * pesait ses six champs scalaires. Depuis que `syncMessageSelect` rend un
 * message RENDABLE, la ligne porte `translations` (une copie du contenu PAR
 * langue du Prisme), `metadata`, `reactionSummary`, le bloc expéditeur, et ses
 * pièces jointes avec leurs propres `transcription`/`translations`. Toutes ces
 * tailles sont écrites par l'utilisateur, aucune par le schéma : le poids d'une
 * page n'a donc plus AUCUNE borne, et 1000 lignes peuvent faire quelques
 * kilo-octets comme plusieurs dizaines de mégaoctets.
 *
 * La conséquence n'est pas seulement de la bande passante. `/sync` est le canal
 * de RATTRAPAGE : il est appelé au retour de veille, en cellulaire, par un
 * appareil qui vient de se reconnecter — c'est-à-dire dans le pire contexte
 * réseau que l'application connaisse. Et la réponse est matérialisée trois fois
 * côté serveur (les lignes Prisma, le `JSON.stringify` de l'ETag, la
 * sérialisation Fastify) avant de partir.
 *
 * Le mécanisme d'arrêt anticipé, lui, existe déjà et n'attendait qu'un second
 * critère : `truncated: true` + `nextCursor` + watermark tenu à `since`. Le
 * budget ne fait que l'armer sur le poids en plus du nombre.
 *
 * 512 Ko de JSON non compressé — de l'ordre de 50 à 100 Ko sur le fil après
 * gzip. La borne est délibérément prise sur le JSON NON compressé : c'est la
 * grandeur que le serveur peut mesurer sans sérialiser deux fois, et c'est
 * aussi celle qui gouverne la mémoire du client au décodage.
 */
export const SYNC_MAX_PAGE_BYTES = 512 * 1024;

const GAP_THRESHOLD = 10_000;
const SUPPORTED_COLLECTIONS = ['messages'] as const;

type CursorKey = { u: string; i: string };
/**
 * Position keyset des TROIS streams de la collection `messages` :
 * `c` = modifiés, `d` = supprimés pour TOUS, `h` = masqués pour CE lecteur.
 *
 * `h` est resté absent longtemps, et son absence n'était pas un oubli de
 * pagination : le stream lui-même n'existait pas. Voir `syncHiddenTombstones`.
 */
export type SyncCursor = { c?: CursorKey; d?: CursorKey; h?: CursorKey };

/** Encode une position keyset en token opaque (base64url JSON versionné). */
export function encodeSyncCursor(cursor: SyncCursor): string {
  const payload: Record<string, unknown> = { v: 1 };
  if (cursor.c) payload.c = cursor.c;
  if (cursor.d) payload.d = cursor.d;
  if (cursor.h) payload.h = cursor.h;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Décode un token opaque ; jette sur version/forme/date invalide (→ 400).
 *
 * `h` reste FACULTATIF sous la même version 1 : un client déjà en vol porte un
 * token sans lui, et le rejeter ferait repartir sa fenêtre de zéro pour un
 * champ purement additif. Un `h` absent démarre simplement son stream au
 * plancher `since`, ce qui est la position correcte pour un client qui n'avait
 * jamais rien reçu de ce stream.
 */
export function decodeSyncCursor(token: string): SyncCursor {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    v?: unknown;
    c?: unknown;
    d?: unknown;
    h?: unknown;
  };
  if (parsed.v !== 1) throw new Error('unsupported cursor version');
  const key = (v: unknown): CursorKey | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'object' || v === null) throw new Error('malformed cursor key');
    const { u, i } = v as Record<string, unknown>;
    if (typeof u !== 'string' || typeof i !== 'string') throw new Error('malformed cursor key');
    if (Number.isNaN(new Date(u).getTime())) throw new Error('malformed cursor date');
    return { u, i };
  };
  const out: SyncCursor = {};
  const c = key(parsed.c);
  const d = key(parsed.d);
  const h = key(parsed.h);
  if (c) out.c = c;
  if (d) out.d = d;
  if (h) out.h = h;
  return out;
}

const syncQuerySchema = z.object({
  since: z.string().datetime({ offset: true }),
  collections: z.string().min(1),
  seq: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(MAX_ITEMS_PER_COLLECTION).optional(),
  scope: z.string().optional(),
  cursor: z.string().optional(),
});

type DeletedRef = { id: string; conversationId: string; deletedAt: Date };

/**
 * Ce que le client DOIT recevoir pour pouvoir écrire une ligne rendable dans sa
 * base locale.
 *
 * Le select de `/sync` s'est longtemps limité à six champs (`id`,
 * `conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`). Un client
 * qui appliquerait `added`/`modified` sur cette base écrirait des lignes qu'il
 * ne peut pas afficher : sans `translations` ni `originalLanguage`, la
 * résolution du Prisme Linguistique n'a RIEN à résoudre et le message
 * s'affiche dans la langue de l'expéditeur ; sans `attachments`, la bulle perd
 * sa pièce jointe ; sans `clientMessageId`, la réconciliation optimiste ne peut
 * pas apparier sa ligne et duplique la bulle.
 *
 * Cette liste est le contrat, et le témoin de forme l'oppose au select réel :
 * une projection amaigrie pour économiser de la bande passante doit d'abord
 * faire rougir un test plutôt que rendre le rattrapage inapplicable en silence.
 */
export const SYNC_MESSAGE_RENDERABLE_KEYS = [
  'id',
  'conversationId',
  'senderId',
  'content',
  'clientMessageId',
  'originalLanguage',
  'translations',
  'messageType',
  'metadata',
  'isEdited',
  'editedAt',
  'replyToId',
  'reactionSummary',
  'reactionCount',
  'attachments',
  'sender',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Projection du stream `changed`. `Prisma.validator` fait échouer le BUILD sur
 * un nom de champ périmé, là où un objet nu échouerait à l'exécution.
 *
 * `attachments` et le bloc `user` de l'expéditeur reprennent les formes
 * canoniques du dépôt (`attachmentMediaSelect`, `messageSenderUserSelect`)
 * plutôt que d'en recopier une variante — c'est exactement la dérive que
 * `attachmentIncludes.ts` documente en tête de fichier.
 */
export const syncMessageSelect = Prisma.validator<Prisma.MessageSelect>()({
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  clientMessageId: true,
  originalLanguage: true,
  translations: true,
  messageType: true,
  messageSource: true,
  metadata: true,
  isEdited: true,
  editedAt: true,
  replyToId: true,
  reactionSummary: true,
  reactionCount: true,
  validatedMentions: true,
  createdAt: true,
  updatedAt: true,
  attachments: { select: attachmentMediaSelect },
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      role: true,
      language: true,
      user: { select: messageSenderUserSelect },
    },
  },
});

type SyncMessage = Prisma.MessageGetPayload<{ select: typeof syncMessageSelect }>;

/**
 * QUI demande le rattrapage — et la seule forme qui rende l'erreur du correctif
 * naïf inexprimable.
 *
 * `authContext.userId` porte un `User.id` pour un compte et un `Participant.id`
 * pour une session anonyme : la MÊME variable, deux colonnes différentes. La
 * RLS de `/sync` filtre `Participant.userId`, qui est NULL pour tout anonyme —
 * ouvrir la route sans toucher à la clause aurait rendu des streams vides, sans
 * erreur ni log, c'est-à-dire un rattrapage qui ne rattrape rien. Une union
 * discriminée oblige chaque lecteur à dire laquelle des deux colonnes il
 * interroge.
 */
type SyncIdentity =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'anonymous'; readonly participantId: string };

/**
 * Ce que la ligne Prisma devient sur le fil.
 *
 * Deux champs du `select` ne portent PAS, en base, la forme que les clients
 * décodent — et aucun des deux n'est une particularité de `/sync` : ce sont les
 * deux transformations que tout transport de message applique déjà, ici
 * réemployées plutôt que recopiées.
 *
 * 1. **`translations` est une CARTE en base** (`Json?`, « map: langue →
 *    données ») et un TABLEAU dans le contrat. `transformTranslationsToArray`
 *    est le sérialiseur du dépôt pour ce passage — le même que la liste de
 *    messages, l'édition, la suppression et le chemin ZMQ. La distinction
 *    n'est pas cosmétique côté client : `APIMessage.translations` se décode
 *    avec un `try` NON tolérant, donc une carte y fait échouer le décodage du
 *    message ENTIER, pas seulement de ses traductions.
 *
 * 2. **`attachments[].reactions` est la relation BRUTE** (`{emoji,
 *    participantId}`) que `attachmentMediaSelect` charge, quand le contrat de
 *    fil est `reactionSummary` + `currentUserReactions`.
 *    `serializeAttachmentForSocket` miroite exactement ce select et fait
 *    l'agrégation ; son nom dit « socket » et sa documentation dit la vérité
 *    plus large — « use this helper everywhere a Message attachment is
 *    broadcast to clients so payloads stay at parity with the REST payload ».
 *    Servir la relation brute ne se contentait pas d'être indécodable : elle
 *    publiait QUI a réagi, là où le contrat n'expose qu'un compte et les
 *    emojis du lecteur.
 *
 * `readerParticipantId` est l'id du lecteur DANS CETTE conversation, et pas un
 * id global : `Participant` est une ligne par conversation, donc le même
 * utilisateur y porte autant d'ids que de fils. Sans lui, `currentUserReactions`
 * serait vide partout — c'est-à-dire « je n'ai réagi à rien », affirmé à qui a
 * réagi.
 */
function serializeSyncMessage(
  message: SyncMessage,
  readerParticipantId: string | undefined,
): Record<string, unknown> {
  return {
    ...message,
    translations: transformTranslationsToArray(
      message.id,
      message.translations as unknown as Record<string, MessageTranslationJSON> | null,
    ),
    attachments: message.attachments.map((attachment) =>
      serializeAttachmentForSocket(
        attachment as unknown as Record<string, unknown>,
        readerParticipantId,
      ),
    ),
  };
}

/**
 * Le message tel qu'il part — composé depuis les schémas canoniques du dépôt,
 * jamais depuis une variante recopiée.
 *
 * Ce schéma ne réutilise PAS `messageSchema` en bloc, et le refus est la leçon
 * du cycle 94 bis : « la réutilisation naïve du schéma partagé perdait ici CINQ
 * choses ». Un schéma de réponse doit être apparié au PRODUCTEUR de la route —
 * ici `syncMessageSelect` — et non au schéma du voisin le plus ressemblant.
 * Les clés sont donc relevées mécaniquement depuis la projection ; seules les
 * FEUILLES (une traduction, une pièce jointe) reprennent les schémas partagés,
 * parce que la forme d'une pièce jointe, elle, ne dépend pas de la route.
 */
const syncMessageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    senderId: { type: 'string', nullable: true },
    content: { type: 'string' },
    clientMessageId: { type: 'string', nullable: true },
    originalLanguage: { type: 'string' },
    translations: { type: 'array', items: messageTranslationSchema },
    messageType: { type: 'string' },
    messageSource: { type: 'string' },
    // `additionalProperties: true` — sans lui, fast-json-stringify vide le
    // contenu de l'objet en SILENCE. Même piège que `messageSchema.metadata`,
    // et il coûte ici la citation de post, le lieu partagé et les faits
    // d'appel de toute bulle rattrapée hors ligne.
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    isEdited: { type: 'boolean' },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    replyToId: { type: 'string', nullable: true },
    reactionSummary: { type: 'object', nullable: true, additionalProperties: true },
    reactionCount: { type: 'integer' },
    validatedMentions: { type: 'array', items: { type: 'string' } },
    attachments: { type: 'array', items: messageAttachmentSchema },
    sender: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        userId: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        type: { type: 'string' },
        role: { type: 'string', nullable: true },
        language: { type: 'string', nullable: true },
        user: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            displayName: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
          },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

/** Une disparition : trois scalaires, et `deletedAt` en est le seul contenu —
 *  un client qui le perd sait qu'une bulle est partie sans savoir quand. */
const syncTombstoneSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    deletedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const syncCollectionSchema = {
  type: 'object',
  properties: {
    added: { type: 'array', items: syncMessageSchema },
    modified: { type: 'array', items: syncMessageSchema },
    deleted: { type: 'array', items: syncTombstoneSchema },
    truncated: { type: 'boolean' },
    nextCursor: { type: 'string', nullable: true },
  },
} as const;

/**
 * L'enveloppe delta.
 *
 * `collections` déclare ses collections NOMMÉMENT plutôt qu'en carte ouverte,
 * et c'est délibéré : `SUPPORTED_COLLECTIONS` n'en porte qu'une, et le jour où
 * A6 en ajoutera une seconde, c'est ce schéma qui doit la déclarer. Une carte
 * `additionalProperties` laisserait entrer la collection neuve NON gouvernée —
 * exactement l'état que ce lot est en train de quitter.
 */
export const syncResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        checkpoint: { type: 'string', format: 'date-time' },
        checkpointSeq: { type: 'integer' },
        collections: {
          type: 'object',
          properties: { messages: syncCollectionSchema },
        },
        hasMore: { type: 'boolean' },
        nextCursor: { type: 'string', nullable: true },
        hasGap: { type: 'boolean' },
        gapAction: { type: 'string', nullable: true },
      },
    },
  },
} as const;

const syncErrorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  const sequenceService = new SequenceService(prisma);
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: true,
  });

  fastify.get('/sync', {
    schema: {
      description: 'Delta sync — collection pilote `messages` (added / modified / deleted depuis `since`)',
      tags: ['sync'],
      summary: 'Delta sync',
      response: {
        200: { description: 'Page delta', ...syncResponseSchema },
        400: { description: 'Requête invalide', ...syncErrorResponseSchema },
        401: { description: 'Authentification requise', ...syncErrorResponseSchema },
        // Un 304 n'a PAS de corps, et le déclarer `null` est ce qui le dit.
        // L'omettre laisserait la route servir un statut non gouverné — le
        // point de départ de ce lot — et, plus prosaïquement, empêcherait
        // `reply.status(304)` de typer.
        304: { description: 'Non modifié — l’ETag correspond', type: 'null' },
      },
    },
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    const parsed = syncQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: parsed.error.issues[0]?.message ?? 'Invalid query' },
      });
    }
    const { since, collections, seq, limit, scope, cursor } = parsed.data;

    const requested = collections.split(',').map((c) => c.trim()).filter(Boolean);
    const unknown = requested.filter(
      (c) => !(SUPPORTED_COLLECTIONS as readonly string[]).includes(c),
    );
    if (unknown.length > 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'UNSUPPORTED_COLLECTION', message: `Unsupported collections: ${unknown.join(', ')}` },
      });
    }

    // Décodage strict du cursor (opaque) AVANT toute requête — un token corrompu
    // est un bug client, on le surface en 400 plutôt que de repartir de zéro.
    let syncCursor: SyncCursor | undefined;
    if (cursor !== undefined) {
      try {
        syncCursor = decodeSyncCursor(cursor);
      } catch {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CURSOR', message: 'Malformed cursor' },
        });
      }
    }

    const authRequest = request as unknown as UnifiedAuthRequest;
    const authContext = authRequest.authContext;
    const userId = authContext.userId;

    // Une session anonyme SANS `participantId` n'a pas d'identité interrogeable
    // ici. Retomber sur la branche `userId` lui servirait des streams vides —
    // une réponse 200 qui affirme « rien n'a changé » à qui n'a rien pu être
    // demandé. Le middleware pose toujours ce champ ; c'est précisément
    // pourquoi son absence est un refus et non un cas nominal.
    if (authContext.type === 'anonymous' && !authContext.participantId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }
    const identity: SyncIdentity = authContext.type === 'anonymous'
      ? { kind: 'anonymous', participantId: authContext.participantId as string }
      : { kind: 'user', userId: userId as string };

    const sinceDate = new Date(since);
    const cap = Math.min(limit ?? MAX_ITEMS_PER_COLLECTION, MAX_ITEMS_PER_COLLECTION);

    // Watermark rendu au client — voir SYNC_CHECKPOINT_LAG_MS. Ancré AVANT
    // toute lecture puis retiré du lag, et jamais RECULÉ sous le `since` déjà
    // acquitté : un watermark qui régresse rejouerait sans fin une fenêtre
    // déjà livrée à un client qui interroge plus souvent que le lag.
    const checkpoint = new Date(
      Math.max(sinceDate.getTime(), Date.now() - SYNC_CHECKPOINT_LAG_MS)
    );

    // Gap detection EXACTE (A1) : le client annonce le dernier `_seq` vu ; si
    // le serveur a émis > GAP_THRESHOLD events depuis, le delta temporel ne
    // suffit plus → full resync requis.
    //
    // Une session anonyme n'a pas de curseur à lire : `UserEventSeq` est
    // INDEXÉE par `User.id` (`@id @db.ObjectId`, alimentée par `emitWithSeq`
    // sur la room personnelle d'un compte), et un `Participant.id` n'y désigne
    // rien. La requête ne planterait pas — un id de participant est un ObjectId
    // valide — elle poserait une question dont la réponse est connue d'avance,
    // sur le chemin appelé au retour de veille. `checkpointSeq = 0` rend
    // `hasGap` faux, ce qu'il serait de toute façon.
    const checkpointSeq = identity.kind === 'anonymous'
      ? 0
      : await sequenceService.currentSeq(identity.userId);
    const hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD;

    const collectionsResult: Record<string, unknown> = {};
    if (requested.includes('messages')) {
      collectionsResult.messages = hasGap
        ? { added: [], modified: [], deleted: [], truncated: false, nextCursor: null }
        : await syncMessages({ prisma, identity, sinceDate, cap, scope, cursor: syncCursor });
    }

    const messagesCol = collectionsResult.messages as { nextCursor?: string | null } | undefined;

    const hasMore = Object.values(collectionsResult).some(
      (c) => (c as { truncated?: boolean }).truncated === true,
    );

    // Le checkpoint AFFIRME une couverture — « tout ce qui a changé jusqu'ici
    // t'a été livré » — et le client la croit sur parole : il le renvoie en
    // `since`, où la borne serveur est STRICTE. Une affirmation non démontrée
    // creuse donc un trou DÉFINITIF (docblock de `SYNC_CHECKPOINT_LAG_MS`).
    //
    // Il n'est avançable que par une réponse qui a démontré cette couverture,
    // et il y a TROIS façons de ne pas la démontrer. Une seule était vérifiée :
    //
    // 1. `hasMore` — page TRONQUÉE : le reste est un ARRIÉRÉ dont les
    //    `updatedAt` sont ANTÉRIEURS au checkpoint. La suite se réclame par
    //    `nextCursor`, et seule la page qui CLÔT le parcours est adoptable.
    // 2. `hasGap` — le serveur a REFUSÉ de calculer le delta et court-circuité
    //    la requête : la fenêtre n'a pas été partiellement livrée, elle n'a pas
    //    été LUE. C'est le maximum exact du cas que (1) protège, et il avançait
    //    le watermark. `gapAction: 'full_resync_required'` ne rattrape rien :
    //    c'est une INSTRUCTION, et une réponse ne peut pas dépendre de ce que
    //    son destinataire en fera pour rester sûre — la resync peut être
    //    différée, échouer hors ligne, ou n'être lue par personne (`hasGap` n'a
    //    aujourd'hui aucun consommateur sur les trois clients).
    // 3. Aucune collection servie — `collections=','` franchit le
    //    `z.string().min(1)`, se réduit à `[]`, ne lève aucun
    //    `UNSUPPORTED_COLLECTION`, et `hasMore` sur zéro collection vaut
    //    `false`. Rien n'a été lu, et le watermark avançait quand même.
    //
    // Retenir le watermark ne coûte qu'une RELECTURE bornée ; l'avancer à tort
    // est irréversible. La règle est donc écrite en POSITIF — une nouvelle
    // façon de ne rien couvrir doit s'ajouter ici, pas s'oublier. Même règle
    // que `SyncWatermark.advancedAfterDeltaPage` côté SDK iOS.
    const coveredTheWindow = !hasMore && !hasGap && Object.keys(collectionsResult).length > 0;

    const payload = {
      checkpoint: (coveredTheWindow ? checkpoint : sinceDate).toISOString(),
      checkpointSeq,
      collections: collectionsResult,
      hasMore,
      // Pilote mono-collection : le token top-level EST celui de `messages`.
      // Multi-collection (A6) le namespacera par collection.
      nextCursor: messagesCol?.nextCursor ?? null,
      hasGap,
      gapAction: hasGap ? 'full_resync_required' : null,
    };

    // ETag déterministe (§7.3 : sha256 de userId + checkpointSeq +
    // collectionsHash) — EXCLUT le `checkpoint` wall-clock pour rester stable
    // entre deux appels identiques (sinon un 304 ne pourrait jamais matcher).
    // Cache-Control no-store : le contenu (collections) est capturé par le
    // hash, donc un 304 ne sert jamais de périmé.
    const etag = computeETag({ userId, checkpointSeq, collections: collectionsResult, hasGap });
    reply.header('Cache-Control', 'no-store');
    reply.header('ETag', etag);
    if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
      return reply.status(304).send();
    }
    return reply.send({ success: true, data: payload });
  });
}

/**
 * Le stream des disparitions PERSONNELLES — `UserMessageDeletion`, c'est-à-dire
 * « supprimer pour moi ».
 *
 * Pourquoi un TROISIÈME stream et pas un `where` de plus. Le stream `changed`
 * applique déjà le masquage : un message masqué en est simplement RETIRÉ. Or un
 * retrait ne dit rien — c'est la leçon 234, une lecture plus bas. Le client qui
 * détient déjà la bulle ne re-lit pas la fenêtre où elle n'apparaît plus ; il
 * ne la re-lit jamais, et la bulle reste. Le filtre de lecture ne peut que
 * rétrécir ce qu'une NOUVELLE requête rend, il n'a aucune prise sur une ligne
 * déjà écrite chez le client. La disparition avait donc besoin d'un vocabulaire
 * à elle, exactement comme les tombstones de la liste de conversations.
 *
 * Deux détails que le tri et la pagination rendent non négociables :
 *
 * - **La table interrogée n'est pas `Message`.** Un `delete-for-me` n'écrit QUE
 *   la ligne `UserMessageDeletion` ; `Message.updatedAt` ne bouge pas. Un
 *   stream qui interrogerait le MESSAGE ne verrait jamais ces disparitions —
 *   c'est le corollaire « chercher quelle TABLE l'événement a touchée » de la
 *   leçon 234, et il s'applique ici mot pour mot.
 * - **L'id SERVI et l'id du CURSEUR sont deux ids différents.** Le client
 *   indexe par message, donc la tombstone porte `messageId`. Le keyset, lui,
 *   ordonne les lignes de `UserMessageDeletion` et doit donc départager par
 *   l'id de CETTE table : deux masquages estampillés à la même milliseconde
 *   (un lot de 100 en écrit exactement autant) se départagent par la ligne, pas
 *   par le message qu'elle désigne.
 *
 * Ce que ce stream ne portera JAMAIS : le retour en vue (`restore-for-me`). Il
 * SUPPRIME la ligne, donc il ne reste rien à interroger « depuis `since` », et
 * le client qui avait retiré la bulle n'en détient plus le contenu de toute
 * façon. Une apparition ne s'écrit pas comme une tombstone inversée : elle
 * voyage en temps réel (`MESSAGE_RESTORED_FOR_ME`, une ADRESSE à relire), et un
 * appareil hors ligne au moment du restore la retrouve à sa prochaine lecture
 * du fil — où le filtre de `personalHistoryFilter` ne la masque plus.
 */
async function syncHiddenTombstones(opts: {
  prisma: FastifyInstance['prisma'];
  userId: string;
  sinceDate: Date;
  conversationIds: readonly string[];
  cap: number;
  cursor?: CursorKey;
}): Promise<{ tombstones: DeletedRef[]; truncated: boolean; nextKey: CursorKey | undefined }> {
  const { prisma, userId, sinceDate, conversationIds, cap, cursor } = opts;

  try {
    const rows = await prisma.userMessageDeletion.findMany({
      where: {
        userId,
        message: { conversationId: { in: [...conversationIds] } },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { gt: new Date(cursor.u) } },
                { deletedAt: new Date(cursor.u), id: { gt: cursor.i } },
              ],
            }
          : { deletedAt: { gt: sinceDate } }),
      },
      select: {
        id: true,
        deletedAt: true,
        messageId: true,
        message: { select: { conversationId: true } },
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: cap + 1,
    });

    const truncated = rows.length > cap;
    const page = truncated ? rows.slice(0, cap) : rows;
    const last = page[page.length - 1];

    return {
      tombstones: page.map((row) => ({
        id: row.messageId,
        conversationId: row.message.conversationId,
        deletedAt: row.deletedAt,
      })),
      truncated,
      nextKey: last ? { u: last.deletedAt.toISOString(), i: last.id } : cursor,
    };
  } catch (error) {
    // Même posture que les tombstones de la liste de conversations : servir le
    // rattrapage reste le produit, en retirer une bulle est une courtoisie. On
    // ne fait donc PAS échouer `/sync` — on rend « je ne peux pas affirmer
    // l'exhaustivité » (`truncated`), ce que le client traduit par « redemande
    // depuis la même position », et le curseur reste où il était pour que la
    // reprise ne saute rien.
    logger.warn('[sync] personal hiding tombstones unavailable, page announced truncated', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { tombstones: [], truncated: true, nextKey: cursor };
  }
}

/**
 * Coupe `rows` au plus long préfixe qui tient dans `maxBytes`.
 *
 * Trois propriétés, et aucune n'est décorative :
 *
 * - **Un préfixe, jamais une sélection.** Les lignes sont déjà triées par le
 *   keyset `(updatedAt, id)`. Ne garder qu'un PRÉFIXE est ce qui permet au
 *   curseur de reprendre exactement derrière la dernière ligne livrée ; écarter
 *   une ligne lourde « au milieu » pour en faire tenir deux légères ferait un
 *   trou qu'aucune position keyset ne saurait réclamer.
 *
 * - **Au moins une ligne, TOUJOURS.** Un message plus lourd à lui seul que le
 *   budget rendrait sinon une page vide accompagnée de `truncated: true` et
 *   d'un curseur inchangé — c'est-à-dire la même requête, indéfiniment. Le
 *   rattrapage ne progresserait plus jamais, et le seul symptôme côté client
 *   serait une synchronisation qui tourne sans rien appliquer. Dépasser le
 *   budget d'une ligne est le moindre mal ; ne plus avancer n'en est pas un.
 *
 * - **La ligne qui franchit la borne est EXCLUE, pas incluse.** Autrement le
 *   budget serait un plancher déguisé.
 *
 * Le coût de mesure est borné par le budget lui-même : on s'arrête au premier
 * dépassement, donc on ne sérialise jamais plus de `maxBytes` + une ligne —
 * là où la page entière représentait, elle, un `JSON.stringify` non borné.
 * La mesure porte sur la ligne Prisma et non sur les octets finaux du fil
 * (`fast-json-stringify` applique encore le schéma de réponse par-dessus) :
 * c'est une approximation par excès du même ordre de grandeur, ce qu'un budget
 * demande, là où une comptabilité exacte imposerait de sérialiser deux fois.
 */
function trimToByteBudget<T>(
  rows: readonly T[],
  maxBytes: number,
): { page: T[]; truncated: boolean } {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    total += Buffer.byteLength(JSON.stringify(rows[i]), 'utf8');
    if (total <= maxBytes) continue;
    const kept = Math.max(i, 1);
    return { page: rows.slice(0, kept), truncated: kept < rows.length };
  }
  return { page: [...rows], truncated: false };
}

async function syncMessages(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
}): Promise<{
  added: Record<string, unknown>[];
  modified: Record<string, unknown>[];
  deleted: DeletedRef[];
  truncated: boolean;
  nextCursor: string | null;
}> {
  const { prisma, identity, sinceDate, cap, scope, cursor } = opts;

  // RLS : uniquement les conversations où le demandeur est participant actif —
  // par `Participant.userId` pour un compte, par `Participant.id` pour une
  // session anonyme, dont c'est la SEULE clé (son `userId` est null). Le `scope`
  // reste une INTERSECTION dans les deux cas : il rétrécit l'appartenance, il ne
  // la remplace jamais.
  //
  // `joinedAt` et `shareLinkId` sont lus dans la même passe parce que c'est la
  // ligne participant qui porte le plancher d'historique du lien de partage —
  // les redemander plus bas ferait un aller-retour de plus sur le chemin de
  // rattrapage.
  //
  // `permissions` et `anonymousSession` s'y ajoutent pour la même raison : le
  // droit de voir l'avant-jointure est FIGÉ sur cette ligne, et la surcharge de
  // l'hôte y vit aussi. Sans eux dans le `select`, `historyFloorFor` ne voit
  // rien de figé et retombe sur le lien — donc /sync appliquerait une règle
  // différente de GET messages pour le même lecteur.
  const memberships = await prisma.participant.findMany({
    where: identity.kind === 'anonymous'
      ? { id: identity.participantId, isActive: true, ...(scope ? { conversationId: scope } : {}) }
      : { userId: identity.userId, isActive: true, ...(scope ? { conversationId: scope } : {}) },
    select: {
      // L'id de la LIGNE participant, et pas seulement sa conversation : c'est
      // lui qui dit « cette réaction de pièce jointe est la mienne ». Un
      // utilisateur porte un `Participant.id` DIFFÉRENT par conversation, donc
      // la reconnaissance ne peut se faire qu'ici, où la ligne est déjà lue —
      // le champ ne coûte pas un aller-retour de plus.
      id: true,
      conversationId: true,
      joinedAt: true,
      shareLinkId: true,
      permissions: true,
      anonymousSession: true,
    },
  });
  if (memberships.length === 0) {
    return { added: [], modified: [], deleted: [], truncated: false, nextCursor: null };
  }

  // Ce que le lien d'entrée interdit de relire. La lecture est un CONTRÔLE
  // D'ACCÈS : quand elle échoue, les conversations concernées sortent de
  // l'ensemble plutôt que d'être servies sans borne.
  //
  // Mais un retrait SILENCIEUX serait un trou définitif, et pour la raison que
  // documente `SYNC_CHECKPOINT_LAG_MS` : une page non tronquée fait adopter le
  // checkpoint, et la borne serveur est stricte — la fenêtre écartée ne serait
  // jamais redemandée. La conversation retirée fait donc de la page une page
  // INCOMPLÈTE (`truncated`), ce que le client traduit par « redemande depuis
  // la même position ». C'est la posture du stream des masquages, pour la même
  // raison, et elle ne se confond pas avec le budget de poids : ici on ne
  // reprendra pas « plus loin », on reprendra AU MÊME endroit jusqu'à ce que la
  // lecture du plancher redevienne possible.
  const { floors, unreadableConversationIds } = await loadShareLinkHistoryFloorsOrFail(
    prisma,
    memberships,
  );
  const dropped = new Set(unreadableConversationIds);
  const conversationIds = memberships
    .map((m) => m.conversationId)
    .filter((id) => !dropped.has(id));
  if (conversationIds.length === 0) {
    return {
      added: [],
      modified: [],
      deleted: [],
      truncated: dropped.size > 0,
      nextCursor: dropped.size > 0 ? encodeSyncCursor(cursor ?? {}) : null,
    };
  }
  const historyFloor = historyFloorClause(conversationIds, floors);

  // CHANGED — non supprimés modifiés depuis `since`. Keyset `(updatedAt, id)` :
  // à la 1re page on part du floor `since` ; ensuite on reprend STRICTEMENT après
  // la position du cursor (le tiebreaker `id` évite trou/doublon sur updatedAt égal).
  const changedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      deletedAt: null,
      ...historyFloor,
      ...(cursor?.c
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.c.u) } },
              { updatedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { updatedAt: { gt: sinceDate } }),
    },
    select: syncMessageSelect,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const capTruncated = changedRows.length > cap;
  const cappedRows = capTruncated ? changedRows.slice(0, cap) : changedRows;

  // Le POIDS est le second critère d'arrêt de la page, et il s'applique ICI :
  // après le plafond de lignes (dont `cap + 1` est la sonde), avant le masquage
  // personnel. L'ordre n'est pas indifférent — voir la note du masquage juste
  // en dessous : une ligne écartée par le BUDGET n'a pas été livrée et le
  // curseur ne doit surtout pas passer derrière elle, là où une ligne masquée,
  // elle, est livrée-comme-absente et doit faire avancer la position. Les deux
  // retraits se ressemblent et ont des conséquences opposées sur le curseur ;
  // c'est le fait de trancher AVANT que `changedPage` soit figée qui les garde
  // distincts, `changedPage` étant précisément ce sur quoi le curseur s'ancre.
  const budgeted = trimToByteBudget(cappedRows, SYNC_MAX_PAGE_BYTES);
  const changedPage = budgeted.page;
  const changedTruncated = capTruncated || budgeted.truncated;

  // Le masquage personnel s'applique APRÈS le keyset, jamais dedans : le
  // curseur `(updatedAt, id)` doit rester ancré sur la dernière ligne LUE,
  // sinon une page entièrement masquée ferait reculer la position et la
  // synchronisation boucherait sur place. Filtrer la livraison suffit — c'est
  // le seul stream où un message masqué reviendrait sans que l'utilisateur ait
  // rien demandé, la synchronisation étant déclenchée par l'app, pas par lui.
  // `UserMessageDeletion` et `UserConversationPreferences` sont attachées à
  // `User` (relation obligatoire côté schéma) : une session anonyme n'y a ni
  // ligne ni moyen d'en écrire une. Passer `null` — l'idiome exact de
  // `GET /conversations/:id/messages` — court-circuite les deux lectures plutôt
  // que de les interroger avec un `Participant.id`, qui est une faute de
  // catégorie avant d'être une requête inutile.
  const hidingByConversation = await loadPersonalHistoryHidingByConversation(prisma, {
    userId: identity.kind === 'user' ? identity.userId : null,
    conversationIds,
  });
  const visible = hidingByConversation.size === 0
    ? changedPage
    : changedPage.filter((m) => {
        const hiding = hidingByConversation.get(m.conversationId);
        if (!hiding) return true;
        if (hiding.hiddenMessageIds.includes(m.id)) return false;
        return hiding.clearHistoryBefore === null || m.createdAt >= hiding.clearHistoryBefore;
      });

  // La sérialisation s'applique APRÈS le masquage et APRÈS le budget, sur les
  // seules lignes réellement LIVRÉES : transformer une ligne qu'on va écarter
  // serait payer l'agrégation des réactions d'une pièce jointe que personne ne
  // recevra. Le keyset, lui, reste ancré sur la ligne PRISMA (`changedPage`) —
  // la position de reprise se lit sur ce qu'a rendu la requête, jamais sur ce
  // qu'en a fait le sérialiseur.
  const readerParticipantIdByConversation = new Map(
    memberships.map((m) => [m.conversationId, m.id] as const),
  );
  const serialize = (m: SyncMessage): Record<string, unknown> =>
    serializeSyncMessage(m, readerParticipantIdByConversation.get(m.conversationId));

  // added = créé après `since` ; modified = pré-existant mais modifié.
  const added = visible.filter((m) => m.createdAt > sinceDate).map(serialize);
  const modified = visible.filter((m) => m.createdAt <= sinceDate).map(serialize);

  // DELETED — tombstones supprimés depuis `since`. Même keyset `(deletedAt, id)`
  // avec cap+1 : le stream tombstones est désormais paginé (A3.1 le tronquait
  // silencieusement à `cap` sans signal — trou corrigé).
  //
  // Ce stream n'est PAS soumis au budget d'octets, et l'exemption est de
  // nature, pas de commodité : sa ligne est faite de trois scalaires de taille
  // fixe (deux ObjectId et une date), donc le plafond de LIGNES y est déjà un
  // plafond de poids — une page pleine pèse de l'ordre de la centaine de
  // kilo-octets, et elle le pèsera toujours. C'est exactement la propriété que
  // le stream `changed` a perdue en devenant rendable, et c'est elle qui décide
  // où le budget doit mordre. Le stream des disparitions personnelles, servi
  // dans le même tableau, tient de lui la même forme et la même exemption.
  const deletedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      // Le plancher d'historique vaut aussi ICI. Une tombstone ne porte pas de
      // contenu, mais elle atteste qu'un message a EXISTÉ à un instant donné —
      // exactement ce qu'un lien `allowViewHistory: false` retire à qui entre
      // par lui. Le stream le plus maigre est celui qu'on oublie de border.
      ...historyFloor,
      ...(cursor?.d
        ? {
            OR: [
              { deletedAt: { gt: new Date(cursor.d.u) } },
              { deletedAt: new Date(cursor.d.u), id: { gt: cursor.d.i } },
            ],
          }
        : { deletedAt: { gt: sinceDate } }),
    },
    select: { id: true, conversationId: true, deletedAt: true },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const deletedTruncated = deletedRows.length > cap;
  const deletedPage = deletedTruncated ? deletedRows.slice(0, cap) : deletedRows;
  const globalTombstones: DeletedRef[] = deletedPage.map((d) => ({
    id: d.id,
    conversationId: d.conversationId,
    deletedAt: d.deletedAt as Date,
  }));

  // HIDDEN — disparitions PERSONNELLES. Servies dans le MÊME tableau que les
  // suppressions globales : côté client le geste est identique (retirer la
  // bulle), et deux tableaux auraient obligé chaque client à écrire deux fois
  // le même retrait. La distinction reste lisible sur le serveur, où elle porte
  // — deux tables, deux keysets.
  //
  // Une session anonyme n'a pas ce stream, et son absence n'est PAS une
  // exhaustivité en défaut : il n'y a rien à énumérer, donc `truncated` reste
  // faux. C'est la distinction que la posture d'échec de `syncHiddenTombstones`
  // rend importante — « je n'ai pas pu lire » et « il n'y a rien à lire » se
  // ressemblent dans le résultat et s'opposent dans ce qu'elles demandent au
  // client.
  const hidden = identity.kind === 'user'
    ? await syncHiddenTombstones({
        prisma,
        userId: identity.userId,
        sinceDate,
        conversationIds,
        cap,
        cursor: cursor?.h,
      })
    : { tombstones: [] as DeletedRef[], truncated: false, nextKey: cursor?.h };

  // Un message peut être masqué pour moi PUIS supprimé pour tous : il sort des
  // deux streams. Dédupliquer par message évite d'annoncer deux fois la même
  // disparition, la première rencontrée (la plus ancienne après tri) gagnant.
  //
  // Le `Set` n'est pas de la coquetterie : les deux streams sont cappés à 1000
  // chacun, et un `findIndex` par élément ferait 4 millions de comparaisons de
  // chaînes sur une page pleine.
  const seenDeleted = new Set<string>();
  const deleted: DeletedRef[] = [...globalTombstones, ...hidden.tombstones]
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || a.id.localeCompare(b.id))
    .filter((ref) => {
      if (seenDeleted.has(ref.id)) return false;
      seenDeleted.add(ref.id);
      return true;
    });

  // `dropped.size` compte ici au même titre que les trois autres : une
  // conversation écartée faute de pouvoir lire son plancher n'a rien livré, et
  // la page ne peut donc pas se déclarer complète.
  const truncated = changedTruncated || deletedTruncated || hidden.truncated || dropped.size > 0;

  // Report par stream : on avance la clé si cette page a livré des items, sinon
  // on conserve la clé entrante — un stream épuisé reste sur sa dernière position
  // pour que la requête keyset suivante ne re-livre ni ne saute rien.
  const lastChanged = changedPage[changedPage.length - 1];
  const lastDeleted = deletedPage[deletedPage.length - 1];
  const cKey: CursorKey | undefined = lastChanged
    ? { u: lastChanged.updatedAt.toISOString(), i: lastChanged.id }
    : cursor?.c;
  const dKey: CursorKey | undefined = lastDeleted
    ? { u: (lastDeleted.deletedAt as Date).toISOString(), i: lastDeleted.id }
    : cursor?.d;
  const nextKey: SyncCursor = {};
  if (cKey) nextKey.c = cKey;
  if (dKey) nextKey.d = dKey;
  if (hidden.nextKey) nextKey.h = hidden.nextKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted, truncated, nextCursor };
}

// Fastify request typing helper for tests / callers that need the query shape.
export type SyncRequest = FastifyRequest<{
  Querystring: z.infer<typeof syncQuerySchema>;
}>;
