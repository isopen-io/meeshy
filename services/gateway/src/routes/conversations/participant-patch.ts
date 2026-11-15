import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationParticipantSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { viewerFromRequest } from '../users/presence-gate';
import { PARTICIPANT_RIGHT_NAMES } from '../../services/participantRights';
import { appliquerDroitsDeParticipant } from './participant-rights-core';
import { changerRangDeParticipant } from './participant-role-core';
import { bannirParticipant, leverBannissementDeParticipant } from './participant-ban-core';
import { resolveTargetParticipant } from './utils/target-participant';
import { repondreAuRefus } from './utils/participant-geste-reponse';
import { lireGesteDeParticipant, type GesteDeParticipant } from './utils/participant-patch-champs';
import type { VerdictDeGeste } from './utils/participant-geste-verdict';

const logger = enhancedLogger.child({ module: 'ConversationParticipantPatchRoute' });

/**
 * **`PATCH /conversations/:id/participants/:participantKey`** — l'adresse
 * UNIQUE où le rôle, les droits, le plancher d'historique et le bannissement
 * d'un participant se changent (#4176, critères 1, 2, 3 et 6).
 *
 * Quatre routes le faisaient : `…/rights`, `…/role`, `…/ban`, `…/unban`. Elles
 * restent en ALIAS — l'issue leur donne deux versions clientes — et rien ici ne
 * les modifie.
 *
 * ─── Ce que la fusion corrige, et qu'aucun alias ne pouvait corriger ────────
 *
 * Le segment d'URL portait DEUX natures d'identifiant selon la route :
 * `:participantId` un `Participant.id` (`/rights`), `:userId` un `User.id`
 * (`/role`). Seul le NOM du paramètre disait la différence. Conséquence
 * mesurée : `/role` était **incapable d'atteindre un visiteur sans compte**,
 * qui n'a aucune ligne `User` et que `/ban` et `DELETE` résolvaient, eux, sous
 * les deux colonnes.
 *
 * `:participantKey` résout les DEUX, par `resolveTargetParticipant` — le même
 * résolveur que `/ban` et `DELETE …/participants/:key`. Les deux identifiants
 * ne sont jamais ambigus : ce sont deux ObjectId de COLLECTIONS différentes.
 *
 * ─── Pourquoi cette route DISPATCHE au lieu de réimplémenter ────────────────
 *
 * Les quatre gestes portent des effets de bord que le critère 3 exige de
 * conserver CHAMP PAR CHAMP : `rights.*` diffuse à deux audiences avec charge
 * réduite en salle (#3898/#4009) ; `historyVisibleFrom` n'est jamais diffusé en
 * salle ; `role` diffuse en salle seule, sans présence ; `bannedAt` ferme le
 * lien d'entrée et appelle `endConversationMembership` ; `bannedAt: null`
 * re-`join` les sockets.
 *
 * > **Une fusion qui perd une diffusion est pire que quatre routes qui
 * > marchent.** Ce gestionnaire n'écrit donc AUCUNE de ces règles : il appelle
 * > les quatre noyaux que #4713 a extraits (`participant-rights-core`,
 * > `participant-role-core`, `participant-ban-core`), ceux-là mêmes que les
 * > quatre alias appellent. Il n'existe pas de seconde implémentation qui
 * > puisse diverger — et le témoin de PARITÉ
 * > (`__tests__/unit/routes/conversations/participant-patch.test.ts`) mesure
 * > que la charge servie est identique à celle de l'alias, geste par geste.
 *
 * ─── L'autorité, par CHAMP ──────────────────────────────────────────────────
 *
 * | Champ | Rang exigé |
 * |---|---|
 * | `rights.*` (8 booléens) | MODERATOR |
 * | `historyVisibleFrom` | ADMIN |
 * | `role` | ADMIN **et** rang > cible **et** cible ≠ créateur |
 * | `bannedAt: <date>` | MODERATOR **et** rang > cible |
 * | `bannedAt: null` | MODERATOR **et** rang > cible |
 *
 * Chaque ligne est opposée par le NOYAU qui l'écrit, jamais retapée ici : la
 * comparaison de rang est `participantActionRefusal`
 * (`utils/participant-authority.ts`), site unique des quatre gestes.
 *
 * Les deux dernières lignes ne sont plus « strictement supérieur » d'un côté et
 * « ADMIN » de l'autre : la décision porteur du 2026-08-29 a supprimé
 * l'asymétrie — **on lève un bannissement qu'on aurait pu poser** — et le
 * tableau de l'issue, écrit avant, décrit l'état d'alors.
 *
 * Un corps qui mêle deux GESTES est refusé EN BLOC (`400 MIXED_AUTHORITY`) :
 * voir `utils/participant-patch-champs.ts` pour ce que « mêler » veut dire, et
 * pourquoi `{ rights.*, historyVisibleFrom }` — un seul geste, deux planchers
 * déjà opposés séparément — n'en est pas.
 */

/**
 * L'instant de bannissement reçu, validé sans être ÉCRIT.
 *
 * `participant-ban-core.ts` pose `new Date()` : l'horloge du serveur fait foi,
 * et c'est une garde, pas un oubli — une date fournie par l'appelant serait
 * antidatable. Le champ dit « bannis » ; sa valeur ne dit rien de plus. On la
 * valide quand même, pour qu'une chaîne mal formée soit refusée plutôt que lue
 * comme une intention de bannir.
 */
const BANNED_AT_BODY = z.iso.datetime({
  offset: true,
  error: 'bannedAt must be an ISO 8601 date-time (the server clock is authoritative) or null',
});

/**
 * Ce qu'un geste sert. UNION des quatre formes de `donnees` rendues par les
 * noyaux — relevée sur leurs types, pas sur ce qu'on croit servi :
 * `DroitsDeParticipantServis`, `RangDeParticipantServi`, `BannissementServi`,
 * `LeveeServie`.
 */
type ChargeDeGeste = Record<string, unknown>;

/**
 * Le schéma de la réponse 200, UNION des quatre charges.
 *
 * `fast-json-stringify` supprime EN SILENCE tout ce qu'un schéma ne déclare
 * pas : une clé oubliée ici ne produit aucune erreur, elle produit un corps
 * amputé. Les clés ci-dessous sont donc relevées une par une sur les quatre
 * `accorder(...)` des noyaux, et le témoin de parité les vérifie
 * MÉCANIQUEMENT contre la charge servie par l'alias correspondant.
 *
 * Une clé absente de la charge d'un geste donné disparaît naturellement du
 * corps — c'est le comportement voulu : chaque geste sert SA forme, et rien
 * d'autre ne s'y ajoute.
 */
const participantPatchDataSchema = {
  type: 'object',
  properties: {
    // Les quatre gestes : le seul champ TOUJOURS servi.
    participantId: { type: 'string', description: 'Participant row the change applied to' },
    // `role`, `ban`, `unban`. Déclare un `User.id` : NUL pour un visiteur sans
    // compte, jamais son `Participant.id`.
    userId: { type: 'string', nullable: true, description: 'User ID of the target, null for a no-account visitor' },
    // `rights`
    conversationId: { type: 'string' },
    rights: {
      type: 'object',
      description: 'Resolved rights after the write — a state, not the delta',
      properties: Object.fromEntries(PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])),
    },
    historyVisibleFrom: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'The history grant by date now in force (null = none)',
    },
    // `role`
    message: { type: 'string', example: 'Rôle du participant mis à jour avec succès' },
    role: { type: 'string', description: 'The role now in force' },
    participant: conversationParticipantSchema,
    // `ban`
    bannedAt: { type: 'string', format: 'date-time', description: 'Server instant the ban was recorded at' },
    closedShareLinkId: { type: 'string', nullable: true, description: 'The entry link closed by the ban, when there was one' },
  },
} as const;

/**
 * Le corps admis. `additionalProperties: false` en fait une liste FERMÉE — donc
 * un champ que la loi (`CHAMP_VERS_FAMILLE`) connaît et qui manquerait ici
 * serait REFUSÉ par Fastify avant d'atteindre le moindre gate, sans qu'aucune
 * erreur ne nomme la cause. Les deux listes doivent donc coïncider exactement,
 * et le témoin `le corps admis déclare EXACTEMENT les champs de la loi`
 * (`__tests__/unit/routes/conversations/participant-patch.test.ts`) le mesure —
 * `PARTICIPANT_RIGHT_NAMES` alimentant les deux, un droit ajouté au dépôt les
 * fait bouger ensemble ou fait tomber le témoin.
 */
export const participantPatchBodySchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(PARTICIPANT_RIGHT_NAMES.map((name) => [name, { type: 'boolean' }])),
    historyVisibleFrom: {
      type: ['string', 'null'],
      description: 'ISO 8601 instant from which this participant may read the history; null revokes the grant. Must not be in the future. Conversation admins only.',
    },
    role: {
      type: 'string',
      enum: ['admin', 'moderator', 'member'],
      description: 'New conversation role. Admins only, and only on a target strictly below them; the creator cannot be demoted.',
    },
    bannedAt: {
      type: ['string', 'null'],
      description: 'An ISO 8601 instant bans the participant, null lifts the ban. The instant WRITTEN is the server\'s — a caller-supplied one would be back-datable.',
    },
  },
} as const;

export function registerParticipantPatchRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  fastify.patch<{
    Params: { id: string; participantKey: string };
    Body: Record<string, unknown>;
  }>('/conversations/:id/participants/:participantKey', {
    schema: {
      description:
        'Change a participant: entry rights, history grant by date, conversation role, or ban state. Replaces PATCH …/rights, …/role, …/ban and …/unban. `participantKey` accepts a User ID **or** a Participant ID — the latter is the only identity a no-account visitor has. A body naming fields of two different gestures is refused in one block (400 MIXED_AUTHORITY): a mutation is never judged on its least-guarded field.',
      tags: ['conversations', 'participants'],
      summary: 'Update a participant',
      params: {
        type: 'object',
        required: ['id', 'participantKey'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          participantKey: { type: 'string', description: 'User ID — or Participant ID, the only identity of a no-account visitor' },
        },
      },
      body: participantPatchBodySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: participantPatchDataSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    const authRequest = request as UnifiedAuthRequest;
    const lecture = lireGesteDeParticipant(request.body);

    // Le mélange est opposé AVANT toute lecture de la conversation ou de la
    // cible : c'est un refus sur la FORME de la requête, il ne coûte aucune
    // requête et n'apprend rien à l'appelant sur ce qui existe.
    if (lecture.genre === 'melange') {
      return sendBadRequest(
        reply,
        `A single request may not mix ${lecture.familles.join(' and ')} changes: ${lecture.champs.join(', ')}`,
        { code: 'MIXED_AUTHORITY' },
      );
    }

    // `minProperties: 1` refuse déjà le corps vide ; ceci attrape le corps qui
    // ne nomme QUE des clés hors table — impossible tant que le schéma pose
    // `additionalProperties: false`, et qui le resterait en silence le jour où
    // quelqu'un l'ouvrirait.
    if (lecture.genre === 'aucun') {
      return sendBadRequest(reply, 'No known participant field named in the request body', { code: 'NO_FIELD_NAMED' });
    }

    if (lecture.geste === 'ban') {
      const instant = BANNED_AT_BODY.safeParse(request.body.bannedAt);
      if (!instant.success) {
        return sendBadRequest(
          reply,
          instant.error.issues[0]?.message ?? 'bannedAt must be an ISO 8601 date-time or null',
          { code: 'INVALID_BANNED_AT' },
        );
      }
    }

    // Une panne rend 500 sur les QUATRE gestes. Les alias divergent sur ce
    // point — `/rights` et `/role` enveloppent, `ban.ts` laisse remonter au
    // gestionnaire d'erreurs global (décision écrite : « une extraction ne
    // change pas le CORPS servi sur panne ») —, et une adresse NEUVE n'hérite
    // d'aucun de ces contrats. Un seul comportement, déclaré par le `500` du
    // schéma, vaut mieux que quatre selon le champ nommé.
    try {
      const verdict = await executerGeste(request, authRequest, lecture.geste);

      if (verdict.genre === 'refus') return repondreAuRefus(reply, verdict);

      return sendSuccess(reply, verdict.donnees);
    } catch (error) {
      logger.error('Error patching participant', error as Error, { geste: lecture.geste });
      return sendInternalError(reply, 'Internal server error');
    }
  });

  /**
   * Le DISPATCH, et rien d'autre. Chaque branche remet au noyau exactement ce
   * que son alias lui remet — le viewer de présence lu sur la REQUÊTE pour le
   * rang, le contexte d'authentification pour les droits (qui admettent un
   * acteur anonyme), le rôle de PLATEFORME pour le bannissement.
   */
  async function executerGeste(
    request: FastifyRequest<{ Params: { id: string; participantKey: string }; Body: Record<string, unknown> }>,
    authRequest: UnifiedAuthRequest,
    geste: GesteDeParticipant,
  ): Promise<VerdictDeGeste<ChargeDeGeste>> {
    const conversationIdentifier = request.params.id;
    const targetKey = request.params.participantKey;

    if (geste === 'rights') {
      return appliquerDroitsDeParticipant({
        prisma,
        conversationIdentifier,
        // Le noyau des droits lit sa cible par `Participant.id` SEUL — c'est
        // le contrat de son alias, dont le segment s'appelle `:participantId`.
        // La clé unifiée accepte les deux colonnes : on la résout ICI, et on
        // laisse passer la clé BRUTE quand rien ne répond, pour que le 404 du
        // noyau reste le sien, au mot près.
        participantId: await resoudreClePourDroits(conversationIdentifier, targetKey),
        authContext: authRequest.authContext,
        body: request.body,
        socketIO: fastify.socketIOHandler,
      });
    }

    if (geste === 'role') {
      return changerRangDeParticipant({
        prisma,
        conversationIdentifier,
        targetKey,
        role: String(request.body.role),
        currentUserId: authRequest.authContext.userId,
        viewer: viewerFromRequest(request),
        socketIO: fastify.socketIOHandler,
        notifications: fastify.notificationService,
      });
    }

    const demande = {
      prisma,
      conversationIdentifier,
      targetKey,
      currentUserId: authRequest.authContext.userId,
      platformRole: authRequest.authContext.registeredUser?.role,
      socketIO: fastify.socketIOHandler,
    };
    return geste === 'ban' ? bannirParticipant(demande) : leverBannissementDeParticipant(demande);
  }

  async function resoudreClePourDroits(conversationIdentifier: string, key: string): Promise<string> {
    const conversationId = await resolveConversationId(prisma, conversationIdentifier);
    if (!conversationId) return key;
    const cible = await resolveTargetParticipant(prisma, conversationId, key);
    return cible?.id ?? key;
  }
}
