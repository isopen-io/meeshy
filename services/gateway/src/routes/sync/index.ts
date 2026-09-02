import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUnifiedAuthMiddleware, type UnifiedAuthRequest } from '../../middleware/auth';
import { SequenceService } from '../../services/SequenceService';
import { computeETag, ifNoneMatchMatches } from '../../utils/etag';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { decodeSyncCursor, type SyncCursor } from './cursor';
import { resolveSyncIdentity } from './identity';
import { SUPPORTED_COLLECTIONS, MAX_ITEMS_PER_COLLECTION, GAP_THRESHOLD, type SyncCollectionName } from './budget';
import { syncMessages, syncMessageCollectionSchema, SYNC_MESSAGE_SERVED_FIELDS } from './messages';
import { syncConversations, syncConversationCollectionSchema, SYNC_CONVERSATION_SERVED_FIELDS } from './conversations';
import { syncReactions, syncReactionCollectionSchema, SYNC_REACTION_SERVED_FIELDS } from './reactions';
import { syncParticipants, syncParticipantCollectionSchema, SYNC_PARTICIPANT_SERVED_FIELDS } from './participants';
import type { SyncCollectionResult } from './schema-shared';
import { parseStrictTokenList, parseScopedFieldList, type FieldSet } from '../../utils/sparse-fieldset';

/**
 * SyncEngine unifié (spec §7) — endpoint delta `/sync` read-only.
 *
 * A3.1 a livré : validation Zod, la collection `messages` (added / modified /
 * deleted par watermark `since`, cap 1000, tri ASC), `hasGap` exact via
 * `SequenceService.currentSeq` (A1), ETag/304, RLS participant-only.
 * A3.2 a ajouté la pagination cursor keyset composite `(updatedAt, id)`.
 *
 * Issue #4171 élargit `SUPPORTED_COLLECTIONS` à `conversations`, `reactions`
 * et `participants` (§ leurs modules respectifs), compte le débit PAR COMPTE
 * plutôt que par IP, et valide `scope` comme ObjectId — additif : `messages`
 * garde exactement son comportement A3.1/A3.2, rien n'est retiré ni renommé
 * (critère 6 — `/sync` n'a aujourd'hui aucun appelant, vérifié par grep sur
 * les quatre clients).
 *
 * Ce fichier orchestre ; chaque collection vit dans son propre module
 * (`routes/sync/{messages,conversations,reactions,participants}.ts`),
 * extraction faite AVANT d'ajouter (`routes/sync.ts` était à 1035/1100
 * lignes — budget du dépôt, § CLAUDE.md racine).
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

/**
 * Exporté pour `routes/sync.ts` (la coquille de ré-export) qui en dérive
 * `SyncRequest` — le seul consommateur de ce type, aujourd'hui aucun
 * (grep : ni `services/gateway`, ni les trois clients), conservé pour la même
 * raison que le reste de la coquille : ce lot n'est retirer/renommer rien.
 */
export const syncQuerySchema = z.object({
  since: z.string().datetime({ offset: true }),
  collections: z.string().min(1),
  seq: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(MAX_ITEMS_PER_COLLECTION).optional(),
  // Issue #4171, critère 2 : `scope` était `z.string().optional()` — une
  // valeur malformée (pas 24 hex) atteignait Prisma tel quel et remontait une
  // erreur MOTEUR (`Malformed ObjectID`) au lieu d'un 400 explicite. Le
  // prédicat est `isValidMongoId` (`@meeshy/shared`), la MÊME source que
  // `utils/object-id.ts` — jamais une regex recomposée localement.
  scope: z.string().refine((v) => isValidMongoId(v), { message: 'Invalid scope ID format' }).optional(),
  cursor: z.string().optional(),
  /**
   * `?fields=collection.champ,…` (#4173). AUCUN `default` — Fastify n'applique
   * pas AJV ici (la validation est Zod), mais la règle du dépôt vaut pour les
   * deux : un défaut ÉCRIT la valeur, et le gestionnaire ne pourrait plus
   * distinguer « absent » de « demandé ». L'absence VAUT le profil par défaut,
   * et elle appartient au gestionnaire.
   */
  fields: z.string().optional(),
});

/**
 * Le vocabulaire FERMÉ de `?fields=`, une entrée par collection (#4173).
 *
 * Il vit ICI, chez l'orchestrateur, et pas dans `budget.ts` avec les autres
 * constantes partagées : les quatre listes appartiennent aux quatre modules de
 * collection (chacune est déclarée À CÔTÉ du `select` qu'elle projette, comme
 * `utils/sparse-fieldset.ts` le prescrit), et `budget.ts` est importé PAR ces
 * modules — l'y poser fermerait un cycle.
 */
const SYNC_FIELD_VOCABULARY: Readonly<Record<SyncCollectionName, readonly string[]>> = {
  conversations: SYNC_CONVERSATION_SERVED_FIELDS,
  messages: SYNC_MESSAGE_SERVED_FIELDS,
  reactions: SYNC_REACTION_SERVED_FIELDS,
  participants: SYNC_PARTICIPANT_SERVED_FIELDS,
};

/**
 * La projection sous la forme que l'ETag doit hasher.
 *
 * TRIÉE aux deux niveaux : une projection est un ENSEMBLE, pas une liste, et
 * `?fields=messages.id,messages.content` désigne exactement la même page que
 * son miroir. Sans le tri, deux appels identiques rendraient deux validateurs
 * différents et aucun 304 ne pourrait jamais tomber.
 */
function projectionForETag(byScope: ReadonlyMap<string, FieldSet>): Record<string, readonly string[]> {
  return Object.fromEntries(
    [...byScope.entries()]
      .map(([portee, champs]) => [portee, [...(champs ?? [])].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

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

/**
 * Le 429 a un PRODUCTEUR différent des 400/401 ci-dessus : `RateLimiter.middleware()`
 * (`utils/rate-limiter.ts`) envoie `{success, message, error, retryAfter, limit}`
 * où `error` est une CHAÎNE (`'RATE_LIMIT_EXCEEDED'`) — pas l'objet `{code,message}`
 * que le reste de `/sync` compose à la main. Une déclaration n'est juste que
 * contre SON producteur (`services/gateway/CLAUDE.md` § schémas de réponse) :
 * réutiliser `syncErrorResponseSchema` ici aurait déclaré `error` en OBJET sur
 * une charge qui l'envoie en CHAÎNE, et fast-json-stringify aurait COERCÉ la
 * chaîne en `{}` — silencieusement, sans qu'aucun test de statut ne le voie.
 * `errorResponseSchema` (`@meeshy/shared/types/api-schemas`) est le schéma
 * partagé qui déclare déjà `error` en chaîne ; `retryAfter`/`limit` s'y
 * ajoutent EN PLUS, exactement comme son propre doc-comment le prescrit pour
 * tout champ qu'une route pose par-dessus le superset commun.
 */
const syncRateLimitResponseSchema = {
  type: 'object',
  properties: {
    ...errorResponseSchema.properties,
    retryAfter: { type: 'number' },
    limit: { type: 'number' },
  },
} as const;

/**
 * L'enveloppe delta. `collections` déclare ses QUATRE collections NOMMÉMENT
 * plutôt qu'en carte ouverte — une carte `additionalProperties` laisserait
 * entrer une collection neuve non gouvernée, l'état que ce lot referme.
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
          properties: {
            messages: syncMessageCollectionSchema,
            conversations: syncConversationCollectionSchema,
            reactions: syncReactionCollectionSchema,
            participants: syncParticipantCollectionSchema,
          },
        },
        hasMore: { type: 'boolean' },
        nextCursor: { type: 'string', nullable: true },
        hasGap: { type: 'boolean' },
        gapAction: { type: 'string', nullable: true },
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

  // Issue #4171, critère 3 — débit PAR COMPTE, jamais par IP.
  //
  // `/sync` est le canal de RATTRAPAGE au réveil : tous les appareils d'un
  // même foyer/bureau y arrivent ensemble au retour de connectivité, derrière
  // la MÊME IP de sortie NAT. Un seau par IP (`global:${request.ip}`, le
  // plafond plateforme actuel) punit donc un bureau entier pour l'usage
  // NOMINAL — exactement l'inverse de ce qu'un rate-limit doit faire.
  //
  // `callerRateKey` (`utils/client-rate-key.ts`) est LA primitive du dépôt
  // pour « un compte, authentifié ou non » : elle lit `authContext.userId`,
  // qui porte un `User.id` pour un compte ET un `Participant.id` pour une
  // session anonyme (`middleware/auth.ts` — jamais `'anonymous'` littéral une
  // fois passé la garde `requireAuth: true` de `requiredAuth` ci-dessus, qui
  // s'exécute en `preValidation`, donc AVANT ce `preHandler` dans le cycle de
  // vie Fastify — `authContext` est déjà posé par le temps que la clé se lit).
  // Un seul format de clé (`user:${id}`) couvre donc les DEUX cas sans
  // distinguo — inventer un second préfixe `participant:` n'ajouterait rien
  // que ce format ne couvre déjà : deux `ObjectId` Mongo ne collisionnent
  // jamais entre eux, compte ou participant.
  const syncRateLimiter = createCustomRateLimiter(
    {
      max: 60,
      windowMs: 60 * 1000,
      keyPrefix: 'sync',
      message: 'Trop de requêtes de synchronisation. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined,
  );

  fastify.get('/sync', {
    schema: {
      description: 'Delta sync — conversations, messages, reactions, participants (added / modified / deleted depuis `since`). `?fields=collection.champ,…` restreint la projection PAR COLLECTION (liste blanche fermée ; un nom non déclaré rend 400). Absent = le profil par défaut de chaque collection.',
      tags: ['sync'],
      summary: 'Delta sync',
      response: {
        200: { description: 'Page delta', ...syncResponseSchema },
        400: { description: 'Requête invalide', ...syncErrorResponseSchema },
        401: { description: 'Authentification requise', ...syncErrorResponseSchema },
        429: { description: 'Débit dépassé', ...syncRateLimitResponseSchema },
        // Un 304 n'a PAS de corps, et le déclarer `null` est ce qui le dit.
        304: { description: 'Non modifié — l’ETag correspond', type: 'null' },
      },
    },
    preValidation: [requiredAuth],
    preHandler: [syncRateLimiter.middleware()],
  }, async (request, reply) => {
    const parsed = syncQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: parsed.error.issues[0]?.message ?? 'Invalid query' },
      });
    }
    const { since, collections, seq, limit, scope, cursor, fields } = parsed.data;

    // Le DÉCOUPAGE de `collections=` passe par la loi partagée
    // (`utils/sparse-fieldset.ts`, #4356/#4173) plutôt que par un `split` écrit
    // ici : c'est un vocabulaire FERMÉ à jeton unique, exactement ce que
    // `parseStrictTokenList` tient. Le refus et son code sont INCHANGÉS.
    const collectionsDemandees = parseStrictTokenList(collections, SUPPORTED_COLLECTIONS);
    if (collectionsDemandees.ok === false) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_COLLECTION',
          message: `Unsupported collections: ${collectionsDemandees.unknown.join(', ')}`,
        },
      });
    }
    const requested: readonly string[] = collectionsDemandees.tokens;

    /**
     * `?fields=` est résolu AVANT toute lecture, et refusé avant elle : une
     * projection qu'on ne peut pas honorer ne doit pas coûter une requête
     * (#4173, critère 1).
     *
     * Les TROIS refus ne se réparent pas de la même façon, d'où trois codes :
     * un jeton sans portée ne peut même pas être rangé, une portée inconnue
     * rend son second niveau ininterprétable, un champ inconnu est la faute la
     * plus fine. Le quatrième — une portée VALIDE mais absente de
     * `collections=` — est une CONTRADICTION entre deux paramètres, refusée
     * plutôt qu'arbitrée : aucun arbitrage n'est celui que l'appelant voulait
     * (même posture que `?categories=`/`?fields=` des préférences).
     */
    const projection = parseScopedFieldList(fields, SYNC_FIELD_VOCABULARY);
    if (projection.ok === false) {
      const { kind, tokens } = projection.failure;
      const refus = {
        unscoped: { code: 'UNSCOPED_FIELD', message: `Fields must name their collection: ${tokens.join(', ')}` },
        'unknown-scope': { code: 'UNSUPPORTED_COLLECTION', message: `Unsupported collections: ${tokens.join(', ')}` },
        'unknown-field': { code: 'UNKNOWN_FIELD', message: `Unknown field(s): ${tokens.join(', ')}` },
      }[kind];
      return reply.status(400).send({ success: false, error: refus });
    }
    const horsPerimetre = [...projection.byScope.keys()].filter((c) => !requested.includes(c));
    if (horsPerimetre.length > 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'FIELD_OUTSIDE_COLLECTIONS',
          message: `Fields name collections absent from collections: ${horsPerimetre.join(', ')}`,
        },
      });
    }
    const champsDe = (collection: SyncCollectionName): FieldSet => projection.byScope.get(collection) ?? null;

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

    const identity = resolveSyncIdentity(authContext);
    if (!identity) {
      return reply.status(401).send({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }

    const sinceDate = new Date(since);
    const cap = Math.min(limit ?? MAX_ITEMS_PER_COLLECTION, MAX_ITEMS_PER_COLLECTION);

    // Watermark rendu au client — voir SYNC_CHECKPOINT_LAG_MS. Ancré AVANT
    // toute lecture puis retiré du lag, et jamais RECULÉ sous le `since` déjà
    // acquitté.
    const checkpoint = new Date(
      Math.max(sinceDate.getTime(), Date.now() - SYNC_CHECKPOINT_LAG_MS)
    );

    // Gap detection EXACTE (A1) : le client annonce le dernier `_seq` vu ; si
    // le serveur a émis > GAP_THRESHOLD events depuis, le delta temporel ne
    // suffit plus → full resync requis. `_seq` est un curseur GLOBAL par
    // compte (`emitWithSeq`, toutes familles d'évènements confondues) : le
    // gap gouverne donc les QUATRE collections identiquement, pas seulement
    // `messages` — calculer un delta partiel pendant qu'un gap est ouvert
    // servirait un rattrapage que le client croira complet.
    //
    // Une session anonyme n'a pas de curseur à lire : `UserEventSeq` est
    // INDEXÉE par `User.id`, et un `Participant.id` n'y désigne rien.
    const checkpointSeq = identity.kind === 'anonymous'
      ? 0
      : await sequenceService.currentSeq(identity.userId);
    const hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD;

    const emptyOnGap: SyncCollectionResult<never> = {
      added: [], modified: [], deleted: [], truncated: false, nextCursor: null,
    };

    const collectionsResult: Record<string, SyncCollectionResult<Record<string, unknown>>> = {};
    if (requested.includes('conversations')) {
      collectionsResult.conversations = hasGap
        ? emptyOnGap
        : await syncConversations({ prisma, identity, sinceDate, cap, scope, cursor: syncCursor, fields: champsDe('conversations') });
    }
    if (requested.includes('messages')) {
      collectionsResult.messages = hasGap
        ? emptyOnGap
        : await syncMessages({ prisma, identity, sinceDate, cap, scope, cursor: syncCursor, fields: champsDe('messages') });
    }
    if (requested.includes('reactions')) {
      collectionsResult.reactions = hasGap
        ? emptyOnGap
        : await syncReactions({ prisma, identity, sinceDate, cap, scope, cursor: syncCursor, fields: champsDe('reactions') });
    }
    if (requested.includes('participants')) {
      collectionsResult.participants = hasGap
        ? emptyOnGap
        : await syncParticipants({ prisma, identity, authContext, sinceDate, cap, scope, cursor: syncCursor, fields: champsDe('participants') });
    }

    const hasMore = Object.values(collectionsResult).some((c) => c.truncated === true);

    // Le checkpoint AFFIRME une couverture — « tout ce qui a changé jusqu'ici
    // t'a été livré » — et le client la croit sur parole (docblock de
    // `SYNC_CHECKPOINT_LAG_MS`). Il n'est avançable que quand la réponse a
    // démontré cette couverture : ni tronquée (`hasMore`), ni court-circuitée
    // par un gap, ni vide de toute collection demandée.
    const coveredTheWindow = !hasMore && !hasGap && Object.keys(collectionsResult).length > 0;

    // `nextCursor` top-level — un MIROIR pour un appelant mono-collection,
    // quelle que soit la collection choisie (pas seulement `messages`, comme
    // avant l'élargissement de cette issue : mirer TOUJOURS `messages` aurait
    // rendu `null` pour `collections=conversations` tronqué, alors même que
    // `data.collections.conversations.nextCursor` porte la vraie position).
    // Namespacer ce champ par collection pour un appel VRAIMENT
    // multi-collection reste un suivi non traité ici (`restant` du rapport de
    // lot) : rien n'exerce ce cas aujourd'hui (critère 6, aucun appelant), et
    // le commentaire historique de ce champ le nommait déjà comme travail
    // d'une itération future (« A6 »).
    const requestedNames = Object.keys(collectionsResult);
    const soloNextCursor = requestedNames.length === 1
      ? collectionsResult[requestedNames[0] as string]?.nextCursor ?? null
      : null;

    const payload = {
      checkpoint: (coveredTheWindow ? checkpoint : sinceDate).toISOString(),
      checkpointSeq,
      collections: collectionsResult,
      hasMore,
      nextCursor: soloNextCursor,
      hasGap,
      gapAction: hasGap ? 'full_resync_required' : null,
    };

    // ETag déterministe — EXCLUT le `checkpoint` wall-clock pour rester stable
    // entre deux appels identiques (sinon un 304 ne pourrait jamais matcher).
    // `collections: collectionsResult` fait déjà entrer le JEU de collections
    // demandé dans le hash : les clés de `collectionsResult` sont NOMMÉES par
    // collection (`{conversations:{...}}` ≠ `{messages:{...}}`), donc
    // `JSON.stringify` — sur lequel `computeETag` hash — diverge par
    // construction entre deux jeux différents, y compris quand les DEUX
    // rendent une page vide (les clés de premier niveau diffèrent). Preuve :
    // `__tests__/unit/routes/sync-etag-and-validation.test.ts`.
    const etag = computeETag({
      userId: authContext.userId,
      checkpointSeq,
      collections: collectionsResult,
      // La PROJECTION entre EXPLICITEMENT dans la clé (#4173, critère 6), et
      // pas par le contenu servi. Le contenu suffisait pour `collections` —
      // ses clés de premier niveau diffèrent même sur deux pages vides — mais
      // pas ici : deux projections différentes d'une page VIDE rendent le MÊME
      // `collectionsResult` mot pour mot, donc le même hash. Un 304 servirait
      // alors à un appelant qui vient de changer de projection le validateur
      // d'une autre — « il se présente comme une synchronisation réussie »,
      // le défaut que #4171 nomme comme pire que l'absence de cache.
      fields: projectionForETag(projection.byScope),
      hasGap,
    });
    reply.header('Cache-Control', 'no-store');
    reply.header('ETag', etag);
    if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
      return reply.status(304).send();
    }
    return reply.send({ success: true, data: payload });
  });
}
