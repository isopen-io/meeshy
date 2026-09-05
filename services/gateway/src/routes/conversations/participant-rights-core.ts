import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { hasMinimumMemberRole, memberRoleCasings, MemberRole } from '@meeshy/shared/types/role-types';
import type { UnifiedAuthContext } from '../../middleware/auth';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { participantUserRooms } from '../../socketio/emitToConversationParticipants';
import {
  disclosableEntryRights,
  resolveEntryRights,
  PARTICIPANT_RIGHT_NAMES,
  type ParticipantRightName,
} from '../../services/participantRights';
import { canAccessConversation } from './utils/access-control';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { accorder, refuser, type VerdictDeGeste } from './utils/participant-geste-verdict';
import type { PasserelleSocketDeConversation } from './utils/participant-geste-socket';

const logger = enhancedLogger.child({ module: 'ConversationParticipantRightsCore' });

/**
 * **Le NOYAU de `PATCH …/participants/:participantId/rights`** — extrait de
 * `participants-writes.ts` le 2026-09-01 (#4713).
 *
 * Ce qui décide vit ici : la résolution de la conversation, l'appartenance du
 * demandeur, les deux planchers d'autorité (modérateur pour les booléens,
 * administrateur pour l'octroi par DATE), la lecture de la cible, l'écriture du
 * delta, l'invalidation du cache et les trois éventails de diffusion. Le
 * gestionnaire ne garde que le schéma, l'authentification et la traduction du
 * verdict — patron de `chargerPostsProches` (`routes/posts/nearby.ts`, #4346).
 *
 * L'extraction est un DÉPLACEMENT : aucune règle n'a changé, aucun ordre
 * d'appel Prisma n'a bougé, aucun message ni code de refus n'a été reformulé.
 * Les onze appelants de production (web 3, iOS 5, Android 3) lisent la même
 * route, les mêmes statuts et la même forme de réponse qu'avant.
 */

/**
 * Les rangs qui font un HÔTE de la conversation, tels qu'un `where` Prisma peut
 * les matcher. DÉRIVÉS de la hiérarchie plutôt que retapés : un rang ajouté
 * au-dessus de `moderator` en fera partie sans qu'on ait à y penser, et le
 * dépôt n'a qu'UNE autorité sur « qui est au-dessus de qui »
 * (`hasMinimumMemberRole`).
 *
 * Les DEUX casses y figurent, et ce n'est pas une précaution : le filtre part
 * en BASE, où un `in` Prisma ne connaît pas `mode: 'insensitive'`.
 * `Participant.role` s'écrit en minuscules depuis #3875, mais les lignes
 * écrites AVANT portent encore `'ADMIN'`/`'CREATOR'` tant que
 * `scripts/migrations/normalize-participant-role-casing.ts` n'a pas tourné en
 * production — et le symptôme d'un filtre trop étroit est un administrateur
 * qui ne reçoit tout simplement PAS l'événement, en silence, sans erreur.
 * Deux lignes plus haut, la garde du demandeur replie déjà la casse
 * (`viewerRole.toLowerCase()`) : le filtre de base ne doit pas être le seul
 * endroit du fichier qui l'ignore.
 */
const CONVERSATION_HOST_ROLE_MATCHES: readonly string[] = memberRoleCasings(
  Object.values(MemberRole).filter((role) => hasMinimumMemberRole(role, MemberRole.MODERATOR)),
);

/**
 * `PATCH …/rights` : un instant ISO 8601 (décalage admis), `null` pour retirer,
 * absent pour ne rien dire.
 *
 * Borné au PRÉSENT. Le plancher est un `createdAt: { gte: date }` : une date à
 * venir n'exclut pas seulement le passé, elle exclut aussi les messages À
 * VENIR — y compris ceux que l'intéressé écrit lui-même. Sans cette borne,
 * « ouvrir l'historique depuis le 1er janvier prochain » rendait le participant
 * AVEUGLE à toute la conversation, silencieusement : un mute déguisé en octroi,
 * qu'aucune erreur ne signalait à l'administrateur qui venait de l'écrire.
 */
const HISTORY_VISIBLE_FROM_BODY = z.iso
  .datetime({ offset: true, error: 'historyVisibleFrom must be an ISO 8601 date-time or null' })
  .refine((value) => Date.parse(value) <= Date.now(), {
    error: 'historyVisibleFrom must not be in the future: a future floor hides every message, including the participant\'s own',
  })
  .nullable()
  .optional();

/**
 * Le corps, lu SANS assertion de type. Fastify l'a déjà validé contre le schéma
 * de la route (`additionalProperties: false`), mais le type déclaré par la
 * route ne porte aucune signature d'index : une garde rend ici ce qu'une
 * conversion `as Record<string, unknown>` rendait avant, sans en prendre le
 * risque. Sur tout corps que le schéma admet, les deux lectures sont
 * identiques ; sur un corps que le schéma refuse, les deux rendent `undefined`
 * à chaque nom de droit.
 */
const estObjetIndexable = (body: unknown): body is Readonly<Record<string, unknown>> =>
  typeof body === 'object' && body !== null && !Array.isArray(body);

const corpsIndexable = (body: unknown): Readonly<Record<string, unknown>> =>
  estObjetIndexable(body) ? body : {};

export type DroitsDeParticipantServis = {
  readonly participantId: string;
  readonly conversationId: string;
  readonly rights: Record<ParticipantRightName, boolean>;
  readonly historyVisibleFrom: string | null;
};

export type DemandeDeDroitsDeParticipant = {
  readonly prisma: PrismaClient;
  /** Le segment d'URL : un `Conversation.id` ou un identifiant lisible. */
  readonly conversationIdentifier: string;
  readonly participantId: string;
  readonly authContext: UnifiedAuthContext | undefined;
  readonly body: unknown;
  readonly socketIO: PasserelleSocketDeConversation | null | undefined;
};

export async function appliquerDroitsDeParticipant(
  demande: DemandeDeDroitsDeParticipant,
): Promise<VerdictDeGeste<DroitsDeParticipantServis>> {
  const { prisma, conversationIdentifier, participantId, authContext } = demande;
  const currentUserId = authContext?.userId;

  const conversationId = await resolveConversationId(prisma, conversationIdentifier);
  if (!conversationId) {
    return refuser(403, 'Unauthorized access to this conversation');
  }

  const canAccess = await canAccessConversation(prisma, authContext, conversationId, conversationIdentifier);
  if (!canAccess) {
    return refuser(403, 'Access denied: you are not a member of this conversation', 'CONVERSATION_ACCESS_DENIED');
  }

  // Le corps est filtré sur la liste des droits CONNUS avant tout le reste :
  // ce qui n'y figure pas ne doit jamais atteindre `anonymousSession.rights`,
  // où Prisma l'écrirait sans broncher — un type composite Mongo n'a pas de
  // colonne à violer.
  const body = corpsIndexable(demande.body);
  const requested = PARTICIPANT_RIGHT_NAMES
    .filter((name) => typeof body[name] === 'boolean')
    .map((name) => [name, body[name] as boolean] as const);

  // L'octroi par date : `undefined` = non nommé, `null` = retiré, sinon
  // une date. Validé ici parce que le schéma Fastify ne sait dire qu'une
  // chaîne ou `null` — pas qu'elle est un instant.
  const historyGrant = HISTORY_VISIBLE_FROM_BODY.safeParse(body.historyVisibleFrom);
  if (!historyGrant.success) {
    return refuser(
      400,
      historyGrant.error.issues[0]?.message ?? 'historyVisibleFrom must be an ISO 8601 date-time or null',
      'INVALID_HISTORY_VISIBLE_FROM',
    );
  }
  const historyVisibleFrom: Date | null | undefined =
    historyGrant.data === undefined ? undefined : historyGrant.data === null ? null : new Date(historyGrant.data);

  if (requested.length === 0 && historyVisibleFrom === undefined) {
    return refuser(400, 'No known right named in the request body');
  }

  const viewerRow = currentUserId
    ? await prisma.participant.findFirst({
        where: authContext?.isAnonymous
          ? { id: currentUserId, conversationId, isActive: true }
          : { userId: currentUserId, conversationId, isActive: true },
        select: { role: true }
      })
    : null;

  const viewerActor = {
    conversationRole: viewerRow?.role,
    platformRole: authContext?.registeredUser?.role,
  };
  if (!actorHasMinimumRole(viewerActor, MemberRole.MODERATOR)) {
    return refuser(403, 'Only conversation admins and moderators may change a visitor\'s rights');
  }

  // L'octroi par DATE n'est pas un droit d'entrée de plus : il OUVRE ce qui
  // précède l'arrivée, et la règle produit le réserve à un ADMINISTRATEUR de
  // la conversation. Un modérateur est lui-même BORNÉ par le plancher — le
  // rang 1 de `historyFloorFor` exige `admin`, pas `moderator` — donc écrire
  // ce champ lui donnait le moyen de se l'ouvrir À LUI-MÊME, sur sa propre
  // ligne. La garde porte sur le CHAMP, pas sur la route : les droits
  // booléens que ce même endpoint lui confie ne franchissent aucun plancher
  // et restent à sa portée.
  if (historyVisibleFrom !== undefined && !actorHasMinimumRole(viewerActor, MemberRole.ADMIN)) {
    return refuser(
      403,
      'Only conversation admins may grant or revoke history access by date',
      'HISTORY_GRANT_REQUIRES_ADMIN',
    );
  }

  const target = await prisma.participant.findFirst({
    where: { id: participantId, conversationId, isActive: true }
  });

  if (!target) {
    return refuser(404, 'Participant not found in this conversation');
  }

  // La surcharge BOOLÉENNE vit dans `anonymousSession`, qu'un participant
  // inscrit n'a pas. Refuser explicitement vaut mieux qu'écrire une session
  // anonyme sur quelqu'un qui a un compte. L'octroi par date, lui, est un
  // scalaire de la ligne participant et vaut pour tous.
  if (requested.length > 0 && target.type !== 'anonymous') {
    return refuser(400, 'Only no-account participants carry an entry-rights override', 'PARTICIPANT_HAS_ACCOUNT');
  }

  // La surcharge est un DELTA. Un droit ramené à sa valeur du join voit son
  // entrée EFFACÉE plutôt que réécrite à l'identique : une surcharge qui
  // recopie le join cesse de le suivre, et l'hôte perd tout moyen de revenir
  // en arrière.
  const priorRights = { ...(target.anonymousSession?.rights ?? {}) } as Record<string, boolean>;
  const joinPermissions = target.permissions as unknown as Record<string, boolean | undefined>;

  for (const [name, value] of requested) {
    if (joinPermissions?.[name] === value) {
      delete priorRights[name];
    } else {
      priorRights[name] = value;
    }
  }

  const updated = await prisma.participant.update({
    where: { id: target.id },
    data: {
      ...(requested.length > 0
        ? { anonymousSession: { ...target.anonymousSession, rights: priorRights } }
        : {}),
      ...(historyVisibleFrom !== undefined ? { historyVisibleFrom } : {})
    }
  });

  const rights = resolveEntryRights(updated ?? target, priorRights);
  const grantedFrom: Date | null =
    historyVisibleFrom !== undefined ? historyVisibleFrom : (target.historyVisibleFrom ?? null);

  await annoncerDroits({
    prisma,
    socketIO: demande.socketIO,
    conversationId,
    target: { id: target.id, userId: target.userId },
    updatedBy: currentUserId ?? '',
    rights,
    grantedFrom,
  });

  return accorder({
    participantId: target.id,
    conversationId,
    rights,
    historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
  });
}

/**
 * Deux audiences, DEUX charges — décision porteur #3898 (option b),
 * même patron que `presence-audience.ts` : `historyVisibleFrom` est un
 * fait de MODÉRATION (« l'hôte a octroyé l'historique à X depuis le
 * 3 mars »), pas un fait de conversation ordinaire. La room de
 * conversation entière ne le voit plus ; seuls les AUTRES HÔTES
 * (admin/moderator/creator) et l'INTÉRESSÉ lui-même le reçoivent, sur
 * leur room personnelle.
 *
 * Contrat client : un hôte connecté ET dans la room de conversation
 * reçoit DEUX événements pour le même changement, et **leur ordre ne se
 * suppose pas** — la charge réduite part d'ailleurs en PREMIER ici, une
 * lecture Prisma la séparant des rooms personnelles. Ce qui tient le
 * contrat n'est donc pas un rang mais la forme : la charge réduite
 * n'AFFIRME rien sur l'octroi (clé ABSENTE, jamais `null`), donc un
 * client qui discrimine sur la PRÉSENCE de la clé converge vers le même
 * état quel que soit l'ordre d'arrivée. Les deux consommateurs le font
 * (`carriesHistoryGrant` côté iOS, `!== undefined` côté web) ; Android
 * n'a pas de consommateur. Un client qui recopierait la valeur
 * INCONDITIONNELLEMENT effacerait l'octroi — c'est la règle du § « Un
 * champ que le client lit AUTORITATIVEMENT n'est plus optionnel pour
 * l'émetteur » (CLAUDE.md), appliquée ici.
 */
async function annoncerDroits(options: {
  readonly prisma: PrismaClient;
  readonly socketIO: PasserelleSocketDeConversation | null | undefined;
  readonly conversationId: string;
  readonly target: { readonly id: string; readonly userId: string | null };
  readonly updatedBy: string;
  readonly rights: Record<ParticipantRightName, boolean>;
  readonly grantedFrom: Date | null;
}): Promise<void> {
  const { prisma, conversationId, target, rights, grantedFrom } = options;
  const manager = options.socketIO?.getManager();
  const io = manager?.getIO();

  // Le middleware d'auth met en cache la ligne participant : sans
  // invalidation, le prochain envoi de ce visiteur serait arbitré sur ses
  // anciens droits pendant toute la durée du cache.
  //
  // Posée AVANT la diffusion, jamais après : l'écriture est acquise, et
  // tout ce qui suit est accessoire. La laisser derrière l'éventail la
  // rendait otage d'une lecture Prisma et d'un `.emit()` — dont le dépôt
  // dit lui-même qu'il LÈVE quand l'adaptateur ou l'encodeur est en défaut
  // (`emitWithSeq`). Même ordre que `_emitPresenceSnapshot`, qui place le
  // durable HORS de son `try`.
  manager?.invalidateParticipantCache?.(target.id, conversationId);
  // JUMELLE (#4855) — `MessagingService.handleMessage` tient son propre
  // cache de lookup (`utils/participant-lookup-cache.ts`), distinct de celui
  // du middleware d'auth ci-dessus : sans cette invalidation, un droit
  // retiré ici ne prendrait effet sur l'ENVOI qu'au bout de son TTL (30 s).
  invalidateParticipantLookup(target.id, conversationId);

  try {
    if (io) {
      const fullPayload = {
        conversationId,
        participantId: target.id,
        updatedBy: options.updatedBy,
        rights,
        historyVisibleFrom: grantedFrom ? grantedFrom.toISOString() : null
      };
      // La clé est ABSENTE, jamais `null` : `null` dirait « octroi
      // retiré », ce que la room de conversation n'a pas à savoir.
      //
      // `rights.canViewHistory` part avec lui (#4009, décision porteur
      // 2026-08-27) : c'est le MÊME fait de modération — « qui a le droit
      // de voir l'historique » — dit sous une autre forme. #3898 n'avait
      // nommé que la date, et le booléen voisin, dans le même objet, avait
      // continué son chemin vers la room entière.
      const { historyVisibleFrom: _omitted, rights: fullRights, ...rest } = fullPayload;
      // #4056 — la loi est partagée avec la fiche REST. La room n'héberge
      // pas : `viewerHostsTheRoom: false`.
      const roomPayload = { ...rest, rights: disclosableEntryRights(fullRights, false) };

      io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, roomPayload);

      // La room personnelle porte le `User.id` d'un inscrit et le
      // `Participant.id` d'un visiteur sans compte — même clé que
      // `participantUserRoomTargets`. L'intéressé reçoit toujours la charge
      // complète : c'est SA date.
      io.to(ROOMS.user(target.userId ?? target.id)).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);

      // Les AUTRES hôtes (admin/moderator/creator) de la conversation — pour
      // qu'ils voient le changement, sans l'exposer à la room entière. Un
      // hôte qui est AUSSI l'intéressé (rare : un admin octroie l'historique
      // à un autre admin) reçoit deux fois la même charge sur sa room —
      // idempotent, jamais faux.
      const hosts = await prisma.participant.findMany({
        where: { conversationId, isActive: true, role: { in: [...CONVERSATION_HOST_ROLE_MATCHES] } },
        select: { id: true, userId: true }
      });
      for (const room of participantUserRooms(hosts)) {
        io.to(room).emit(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, fullPayload);
      }
    }
  } catch (error) {
    // La diffusion est ACCESSOIRE : l'écriture est persistée et le cache
    // déjà invalidé. Rendre 500 ici annoncerait à l'hôte que son geste a
    // échoué alors qu'il a pris effet — et le ferait rejouer.
    logger.warn('participant rights broadcast failed', {
      conversationId,
      participantId: target.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
