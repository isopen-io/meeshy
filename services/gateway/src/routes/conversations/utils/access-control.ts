import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { UnifiedAuthContext } from '../../../middleware/auth';
import { sendForbidden, sendUnauthorized } from '../../../utils/response';
import { unsetOrNull } from '../../../utils/prisma-unset';

/**
 * The two identities an auth context can name a `Participant` row with.
 *
 * `userId` is NOT a `User.id` for everyone: the anonymous branch of
 * `UnifiedAuthService` sets `userId: participant.id` (middleware/auth.ts), so a
 * shared-link guest carries a **Participant.id** in the field every route reads
 * as a user id. That is why `participantId` exists alongside it, and why it wins
 * whenever it is present.
 */
export interface CallerParticipantIdentity {
  readonly userId?: string;
  readonly participantId?: string;
}

/**
 * The caller's `Participant` row in this conversation — the one query that must
 * never be written by hand again.
 *
 * `canAccessConversation` below has resolved anonymous callers by
 * `authContext.participantId` since the `bannedAt` fix, but every route that
 * needed the participant's **id** (read cursors are keyed by `Participant.id`,
 * never by `User.id`) re-derived it with a hand-written
 * `findFirst({ where: { conversationId, userId, isActive: true } })`. For a
 * shared-link guest that `userId` IS a `Participant.id`, so the filter compared
 * a participant id against the `userId` column and matched nothing: the route
 * passed access control and then answered 403 to a participant that exists.
 *
 * The whole read/unread REST surface was in that state, which is the half of the
 * unread badge nobody could see: the server counts unread messages for an
 * accountless participant (`getUnreadCount` resolves `id` OR `userId`) and
 * pushes the count to their personal room (`ROOMS.user(userId ?? id)`, joined by
 * `AuthHandler` for anonymous sockets) — but every route that could CLEAR the
 * count refused them. A shared-link guest's badge could only ever go up.
 *
 * Precedence mirrors `canAccessConversation` exactly — `participantId` first,
 * `userId` second — because the two answers must not disagree about who the
 * caller is. Registered contexts never carry `participantId` (see the `type:
 * 'user'` branch of `UnifiedAuthService`), so the order is unambiguous rather
 * than merely conventional.
 */
export async function resolveCallerParticipant(
  prisma: Pick<PrismaClient, 'participant'>,
  authContext: CallerParticipantIdentity | null | undefined,
  conversationId: string
): Promise<{ id: string; role: string } | null> {
  const participantId = authContext?.participantId;
  if (participantId) {
    return prisma.participant.findFirst({
      where: {
        id: participantId,
        conversationId,
        isActive: true,
        ...unsetOrNull('bannedAt')
      },
      select: { id: true, role: true }
    });
  }

  const userId = authContext?.userId;
  if (!userId) return null;

  return prisma.participant.findFirst({
    where: { conversationId, userId, isActive: true },
    select: { id: true, role: true }
  });
}

/**
 * **UN BOOLÉEN NE PEUT PAS DIRE DEUX CHOSES** (#4792).
 *
 * `canAccessConversation` rendait `false` pour DEUX refus que rien ne
 * rapproche : « je ne sais pas qui tu es » (aucune session, ou une session
 * morte) et « je sais qui tu es, et cette conversation n'est pas pour toi ».
 * Chaque appelant traduisait donc l'unique `false` en un unique `sendForbidden`
 * — et les cinq routes montées en `optionalAuth`, une garde qui ne refuse RIEN,
 * répondaient **403 à une session absente**, là où la sémantique appelle un
 * **401**.
 *
 * CE QUE LE 403 COÛTE, MESURÉ CLIENT PAR CLIENT (identique à #4789, dont ce lot
 * est la suite sur les cinq routes que celui-là ne couvrait pas) :
 * `APIClient.mapUnauthorized` (`packages/MeeshySDK/.../APIClient.swift`) est le
 * site UNIQUE qui décide qu'une réponse veut dire « ta session est morte », et
 * seule la branche 401 l'atteint — un membre dont le jeton expirait en ouvrant
 * un fil voyait ses messages refusés, sans jamais déclencher de
 * rafraîchissement de session. `apps/web` rafraîchit sur 401 (`api.service.ts`)
 * et ne fait rien du 403 de ces routes. Android est NEUTRE — son
 * `AuthExpiryInterceptor.EXPIRY_CODES` contient déjà `{401, 403}`. `web-v3` ne
 * vise aucune de ces cinq adresses.
 *
 * ─── Pourquoi un VERDICT, et pas un booléen de plus ─────────────────────────
 *
 * `canAccessConversation` a DIX-HUIT sites d'appel de production répartis sur
 * quinze modules (mesuré). Changer son type de retour obligerait à les toucher
 * tous, dont onze n'ont rien à voir avec ce défaut. Le patron retenu est celui
 * de `participant-geste-verdict.ts` (#4713) et de `chargerPostsProches`
 * (#4346) : le NOYAU rend une valeur, et la fonction historique en devient une
 * PROJECTION d'une ligne. Il n'y a donc pas de jumelle à faire diverger — la
 * règle d'appartenance est écrite UNE fois, ici, et les dix-huit appelants
 * continuent de marcher sans être modifiés.
 *
 * ─── Trois genres, pas deux booléens ────────────────────────────────────────
 *
 * `sans-session` se prononce SANS aucune requête : c'est la propriété du
 * contexte, pas de la conversation. Les deux autres exigent la ligne
 * `Participant`.
 */
export type AccesAccorde = { readonly genre: 'ok' };
export type RefusSansSession = { readonly genre: 'sans-session' };
export type RefusNonMembre = { readonly genre: 'non-membre' };

/** Ce que le noyau REFUSE — le complément de `AccesAccorde`. */
export type RefusAccesConversation = RefusSansSession | RefusNonMembre;

export type VerdictAccesConversation = AccesAccorde | RefusAccesConversation;

const ACCES_ACCORDE: AccesAccorde = { genre: 'ok' };
const SANS_SESSION: RefusSansSession = { genre: 'sans-session' };
const NON_MEMBRE: RefusNonMembre = { genre: 'non-membre' };

/**
 * Le contexte tel que les dix-huit appelants le passent.
 *
 * `undefined` est admis parce qu'un appelant de production le passe déjà :
 * `appliquerDroitsDeParticipant` déclare `authContext: UnifiedAuthContext |
 * undefined` (`participant-rights-core.ts`). Le paramètre était typé `any`, ce
 * que le `CLAUDE.md` interdit, et cet `any` cachait exactement ça — sous lui,
 * un contexte absent faisait LEVER `authContext.isAuthenticated` (donc 500),
 * quand la seule lecture honnête d'une identité absente est « pas de session ».
 */
export type ContexteDAccesConversation = UnifiedAuthContext | null | undefined;

/**
 * Le NOYAU : qui est l'appelant, et cette conversation est-elle pour lui ?
 *
 * Corps INCHANGÉ depuis la version booléenne, à la seule substitution des
 * valeurs de retour près — c'est ce qui rend la projection ci-dessous
 * démontrablement équivalente pour les dix-huit appelants.
 */
export async function verdictAccesConversation(
  prisma: PrismaClient,
  authContext: ContexteDAccesConversation,
  conversationId: string,
  conversationIdentifier: string
): Promise<VerdictAccesConversation> {
  if (!authContext?.isAuthenticated) {
    return SANS_SESSION;
  }

  // Cas spécial : conversation globale "meeshy"
  if (conversationIdentifier === "meeshy" || conversationId === "meeshy") {
    if (authContext.isAnonymous) {
      return NON_MEMBRE;
    }

    const participant = await prisma.participant.findFirst({
      where: {
        conversationId: conversationId,
        userId: authContext.userId,
        isActive: true
      }
    });

    return participant ? ACCES_ACCORDE : NON_MEMBRE;
  }

  // Participant unifié : une seule requête pour tous les types
  //
  // `bannedAt: null` fermait cette porte à TOUT LE MONDE : aucun des créateurs de
  // `Participant` n'écrit la colonne, elle est donc absente du document de tout
  // participant jamais banni, et l'égalité à `null` n'appariait que les rares
  // lignes qu'un débannissement avait remises à zéro (`resolveUnbanWrite`). Les
  // anonymes venus par lien de partage — les seuls à porter un `participantId`
  // dans leur contexte d'auth — se voyaient refuser l'accès à leur propre
  // conversation. Voir `utils/prisma-unset.ts`.
  //
  // La garde reste porteuse malgré `isActive: true` : un bannissement écrit bien
  // `isActive: false`, mais une restauration de compte rallume `isActive` sans
  // regarder `bannedAt` (`routes/me/delete-account.ts`).
  if (authContext.participantId) {
    const participant = await prisma.participant.findFirst({
      where: {
        id: authContext.participantId,
        conversationId: conversationId,
        isActive: true,
        ...unsetOrNull('bannedAt')
      }
    });
    return participant ? ACCES_ACCORDE : NON_MEMBRE;
  }

  // Fallback: rechercher par userId (registered users)
  if (!authContext.isAnonymous && authContext.userId) {
    if (conversationIdentifier.startsWith('mshy_')) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          OR: [
            { id: conversationId },
            { identifier: conversationIdentifier }
          ]
        }
      });

      if (!conversation) {
        return NON_MEMBRE;
      }

      const participant = await prisma.participant.findFirst({
        where: {
          conversationId: conversation.id,
          userId: authContext.userId,
          isActive: true
        }
      });
      return participant ? ACCES_ACCORDE : NON_MEMBRE;
    }

    const participant = await prisma.participant.findFirst({
      where: {
        conversationId: conversationId,
        userId: authContext.userId,
        isActive: true
      }
    });
    return participant ? ACCES_ACCORDE : NON_MEMBRE;
  }

  // Authentifié, mais sans identité exploitable : ce n'est pas une absence de
  // session — c'est un appelant qu'on connaît et qu'on ne retrouve dans aucune
  // ligne `Participant`.
  return NON_MEMBRE;
}

/**
 * Vérifie si un utilisateur peut accéder à une conversation via le modèle Participant unifié
 *
 * PROJECTION du verdict ci-dessus, et rien d'autre : les dix-huit appelants qui
 * ne cherchent qu'un OUI/NON restent inchangés, et il n'existe qu'UNE source de
 * vérité pour l'appartenance.
 */
export async function canAccessConversation(
  prisma: PrismaClient,
  authContext: ContexteDAccesConversation,
  conversationId: string,
  conversationIdentifier: string
): Promise<boolean> {
  return (await verdictAccesConversation(prisma, authContext, conversationId, conversationIdentifier)).genre === 'ok';
}

/**
 * Le CODE machine d'un refus d'appartenance.
 *
 * Il est le seul signal qu'un client peut brancher : la prose anglaise du
 * `message` ne l'est pas, et c'est tout ce qui séparait les deux refus avant ce
 * lot. `UNAUTHORIZED` n'est pas inventé non plus — `ErrorCode.UNAUTHORIZED`
 * (`packages/shared/types/errors.ts`) le déclare, `ErrorStatusMap` le mappe sur
 * 401, et 49 des 84 modules qui appellent `sendUnauthorized` le servent déjà.
 */
export const CODE_SANS_SESSION = 'UNAUTHORIZED';
export const CODE_NON_MEMBRE = 'CONVERSATION_ACCESS_DENIED';

/** Ce que chaque route DIT de ses deux refus — la seule chose qui varie. */
export type MessagesDeRefusDAcces = {
  readonly sansSession: string;
  readonly nonMembre: string;
};

/**
 * La TRADUCTION du refus en réponse — site UNIQUE.
 *
 * Écrire `if (genre === 'sans-session') sendUnauthorized(…) else sendForbidden(…)`
 * à chaque site remettrait cinq exemplaires d'une même règle en circulation ;
 * « une règle qui doit être retapée à chaque site est une règle qu'un site
 * finira par ne pas avoir » (`services/gateway/CLAUDE.md`). Les MESSAGES restent
 * au site, parce qu'eux seuls dépendent de ce que la route servait.
 */
export function refuserAccesConversation(
  reply: FastifyReply,
  refus: RefusAccesConversation,
  messages: MessagesDeRefusDAcces
): void {
  if (refus.genre === 'sans-session') {
    return sendUnauthorized(reply, messages.sansSession, { code: CODE_SANS_SESSION });
  }

  return sendForbidden(reply, messages.nonMembre, { code: CODE_NON_MEMBRE });
}
