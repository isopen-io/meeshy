import type { FastifyInstance, FastifyRequest } from 'fastify';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { AVATAR_RING_COLUMN, servedPerson } from '../../services/appearance/authorProfileDecor';


/**
 * Ce qu'un profil de demande porte — le minimum pour dessiner une ligne, PLUS
 * la présence.
 *
 * Les TROIS clients déclarent `isOnline` / `lastActiveAt` sur la partie d'une
 * demande — `FriendRequestUser` (iOS, `FriendModels.swift`), le même type porté
 * en Kotlin (`core/model/.../Friend.kt`), et `FriendRequest.sender?: User` côté
 * web. Aucun ne les recevait : la projection ne les chargeait pas. Le coût
 * n'était pas seulement une pastille absente — `FriendListAggregator.aggregate`
 * (iOS) TRIE la liste de contacts sur `isOnline` puis `lastActiveAt`, et
 * `useContactsV2` en dérive son ensemble `onlineUserIds` initial : deux tris
 * sur des champs toujours nuls, donc un ordre arbitraire jusqu'à ce qu'un
 * `user:status` arrive par socket — pour ceux qui en reçoivent un.
 *
 * Ces deux colonnes ne sortent JAMAIS brutes : {@link servirParties} est le
 * site unique par lequel toute ligne de demande quitte ce module.
 */
const PROJECTION_PARTIE = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastActiveAt: true,
  // #10945 — le contour équipé, résolu en `profileDecor` par `servirParties`.
  ...AVATAR_RING_COLUMN,
} as const;

export const INCLUDE_PARTIES = {
  sender: { select: PROJECTION_PARTIE },
  receiver: { select: PROJECTION_PARTIE },
} as const;

/** Les deux clés d'une demande qui portent une personne — et donc une présence. */
const CLES_PARTIES = ['sender', 'receiver'] as const;

type PartieAvecPresence = {
  readonly id: string;
  readonly isOnline: boolean | null;
  readonly lastActiveAt?: Date | null;
  readonly equippedAvatarRing?: string | null;
};

/**
 * Un REFUS ne se voit pas (RG-07, #13933) : l'ÉMETTEUR continue de lire sa demande
 * « en attente ». Le statut `rejected` n'est servi qu'à celui qui a refusé ; la
 * date de réponse, qui dirait le refus à son tour, part avec lui. Appliqué ICI,
 * au site unique de sortie d'une ligne, pour que l'alias déprécié en bénéficie
 * sans le savoir.
 */
function masquerRefus<T extends Record<string, unknown>>(demande: T, acteurId: string | undefined): T {
  if (demande.status !== 'rejected' || !acteurId || demande.senderId !== acteurId) return demande;
  return { ...demande, status: 'pending', respondedAt: null };
}

/**
 * La LOI DE VISIBILITÉ DE LA PRÉSENCE appliquée aux deux parties d'une demande
 * — le site UNIQUE par lequel une ligne de demande sort de ce module.
 *
 * ## Pourquoi ici, et pas dans la route de listing
 *
 * Trois producteurs rendent une ligne portant `INCLUDE_PARTIES` : l'ENVOI, la
 * RÉPONSE et le LISTING. Le premier s'adresse à un INCONNU par définition —
 * envoyer une demande à quelqu'un qu'on ne connaît pas ne doit pas apprendre
 * s'il est en ligne, ni quand il l'était. Un gate posé sur le seul listing
 * aurait donc laissé la fuite exactement là où elle est la plus grave, et
 * `routes/friends.ts` — l'alias historique de l'envoi, qui appelle le même
 * cœur — l'aurait servie sans que rien ne le signale.
 *
 * Directive du 2026-08-25 : hors amitié ACCEPTÉE (ou soi-même, ou ADMIN+), ni
 * `isOnline` ni `lastActiveAt` ne sont servis. La loi n'est pas réécrite ici :
 * `resolveForTargets` la résout par VIEWER, `applyPresenceVisibilityAsOffline`
 * l'applique, et une entrée absente de la carte est masquée
 * (`presenceMissingEntryPolicy`) — fail-closed.
 *
 * L'acceptation est servie APRÈS l'écriture du statut : la loi lit alors une
 * amitié acceptée et rend la présence du nouvel ami, sans cas particulier.
 */
export async function servirParties<T extends Record<string, unknown>>(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demandes: readonly T[]
): Promise<T[]> {
  const viewer = viewerFromRequest(request);
  const acteurId = (request as FastifyRequest & { user?: { userId?: string } }).user?.userId;

  const identifiants = demandes.flatMap((demande) =>
    CLES_PARTIES.flatMap((cle) => {
      const partie = demande[cle] as PartieAvecPresence | null | undefined;
      return partie?.id ? [partie.id] : [];
    })
  );

  if (identifiants.length === 0) return demandes.map((demande) => masquerRefus(demande, acteurId));

  const carte = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(viewer, identifiants);
  const surEntreeAbsente = presenceMissingEntryPolicy(viewer);

  return demandes.map((demande) => {
    const servie: Record<string, unknown> = { ...masquerRefus(demande, acteurId) };
    for (const cle of CLES_PARTIES) {
      const partie = servie[cle] as (PartieAvecPresence & Record<string, unknown>) | null | undefined;
      if (!partie?.id) continue;
      servie[cle] = servedPerson(applyPresenceVisibilityAsOffline(partie, carte.get(partie.id), {
        onMissingEntry: surEntreeAbsente,
      }));
    }
    return servie as T;
  });
}

export type ClauseHorsBlocage = {
  readonly senderId?: { notIn: string[] };
  readonly receiverId?: { notIn: string[] };
};

/**
 * La clause qui retire d'une liste de demandes toute ligne dont l'AUTRE partie
 * est en relation de blocage avec `acteurId`, dans un sens ou dans l'autre
 * (#13298). Le blocage ne touche pas la `FriendRequest` en base (rompre
 * l'amitié est une décision produit ouverte) : c'est la LECTURE qui le rejoue,
 * et c'est la seule loi des quatre listes (`listerDemandes`, les deux alias de
 * `routes/friends.ts`, `GET /users/friend-requests`).
 *
 * Posée dans le `where`, jamais après la lecture : la page, son curseur et son
 * `total` comptent ce qui est SERVI. Le coût est borné par la relation de
 * blocage elle-même (`getBlockRelatedUserIds`), vide pour presque tout le
 * monde — auquel cas la clause est vide. L'acteur n'est jamais dans
 * l'ensemble, donc borner les DEUX colonnes ne retire que l'autre partie.
 */
export async function clauseHorsBlocage(
  fastify: FastifyInstance,
  acteurId: string
): Promise<ClauseHorsBlocage> {
  const lies = [...(await getBlockRelatedUserIds(fastify.prisma, acteurId))];
  return lies.length === 0 ? {} : { senderId: { notIn: lies }, receiverId: { notIn: lies } };
}

export type Refus = { code: number; message: string; codeMetier?: string };
export type Resultat<T> = { valeur: T } | { refus: Refus };
