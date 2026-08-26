import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import {
  applyPresenceVisibility,
  resolvePresenceVisibility,
  type PresenceMissingEntryPolicy,
  type PresenceVisibility,
} from '@meeshy/shared/utils/presence-visibility';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createUnifiedAuthMiddleware } from '../../middleware/auth';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';

type ProfilePresenceAuthContext =
  | {
      type?: string;
      userId?: string;
      registeredUser?: { role?: string } | null;
    }
  | undefined;

/**
 * Construit le viewer de présence à partir de l'authContext.
 * Seul un utilisateur enregistré (avec rôle) compte ; anonyme/non-auth → null
 * (présence masquée sur les canaux à critère strict).
 */
export function viewerFromAuthContext(authContext: ProfilePresenceAuthContext): PresenceViewer {
  const role = authContext?.registeredUser?.role;
  if (authContext?.type === 'user' && authContext.userId && role) {
    return { userId: authContext.userId, role: role as GlobalUserRoleType };
  }
  return null;
}

/**
 * Même chose depuis la requête. `AuthenticatedRequest` (`routes/users/types.ts`)
 * type `registeredUser` en `boolean`, ce que la production ne respecte pas — le
 * viewer se lit donc sur la forme RÉELLE de l'authContext, jamais sur ce type-là.
 */
export function viewerFromRequest(request: FastifyRequest): PresenceViewer {
  return viewerFromAuthContext(
    (request as FastifyRequest & { authContext?: ProfilePresenceAuthContext }).authContext,
  );
}

/**
 * Rang auquel la loi juge un lecteur SANS viewer (anonyme / non authentifié).
 * La loi ne connaît pas de « sans rôle » ; aucune amitié n'existe sans compte,
 * et aucun rang ordinaire n'ouvre une présence sans amitié — le rang standard
 * rend donc exactement ce que la directive du 2026-08-25 réserve à l'anonyme :
 * rien.
 */
const VIEWERLESS_STANDING: GlobalUserRoleType = 'USER';

/**
 * Visibilité d'une entrée ABSENTE de la carte rendue par `resolveForTargets`.
 * Le résolveur rend UNE entrée par id passé ; une entrée absente désigne donc
 * une cible SANS COMPTE (participant anonyme, pas de `userId`) — ou une
 * anomalie (id inscrit non résolu). Les deux reçoivent la MÊME réponse.
 *
 * Le repli n'est pas une constante locale : c'est la loi partagée
 * (`resolvePresenceVisibility`) appliquée à l'entrée qu'elle aurait reçue pour
 * une cible qu'elle n'a pas pu résoudre — aucune relation, préférences par
 * défaut, viewer tel quel. Elle rend tout à ADMIN/BIGBOSS, rien sinon (le
 * régime strict de `PresenceMissingEntryPolicy`, MODERATOR compris).
 */
const missingEntryVisibility = (viewer: PresenceViewer): PresenceVisibility =>
  resolvePresenceVisibility({
    isSelf: false,
    viewerRole: viewer?.role ?? VIEWERLESS_STANDING,
    areConnected: false,
    targetShowOnlineStatus: true,
    targetShowLastSeen: true,
    targetIsDeactivated: false,
    isBlockedEitherWay: false,
  });

/**
 * Sort d'une entrée ABSENTE, sous la forme que `applyPresenceVisibilityAsOffline`
 * attend (`onMissingEntry`) : `'reveal'` pour un viewer ADMIN/BIGBOSS, `'hide'`
 * sinon. UN site pour toutes les portes du gateway — trois copies divergeaient
 * (core / participants / messages), et `core.ts` laissait passer un `undefined`
 * pour un inscrit non résolu, donc le révélait à tout le monde.
 */
export function presenceMissingEntryPolicy(viewer: PresenceViewer): PresenceMissingEntryPolicy {
  return missingEntryVisibility(viewer).showOnline ? 'reveal' : 'hide';
}

/**
 * Visibilité servie pour `userId` : l'entrée de la carte si elle existe, sinon
 * le repli de {@link presenceMissingEntryPolicy}. Pour les sites qui lisent les
 * deux drapeaux eux-mêmes (fusion avec la présence LIVE du `presenceChecker`) ;
 * les projections « hors ligne » passent par `applyPresenceVisibilityAsOffline`.
 * Ne rend JAMAIS `undefined` : un `?.showOnline === false` laissé en aval
 * révélerait l'inconnu.
 */
export function presenceFor(
  viewer: PresenceViewer,
  visibility: ReadonlyMap<string, PresenceVisibility>,
  userId: string | null | undefined,
): PresenceVisibility {
  const entry = userId ? visibility.get(userId) : undefined;
  return entry ?? missingEntryVisibility(viewer);
}

/**
 * Applique le gate de présence sur un objet profil, en masquant
 * `isOnline`/`lastActiveAt` selon la visibilité résolue par VIEWER
 * (`resolveForTarget`) : servie à soi-même et à ADMIN/BIGBOSS, à un ami
 * ACCEPTÉ selon les préférences de la cible, masquée à tout autre lecteur —
 * MODERATOR compris (aucun bypass), affiliation/parrainage jamais comptés,
 * anonyme/non authentifié (viewer `null`) masqué.
 */
export async function gateProfilePresence<
  T extends { id: string; isOnline: boolean | null; lastActiveAt: Date | null; deactivatedAt?: Date | null },
>(fastify: FastifyInstance, request: FastifyRequest, profile: T) {
  const authContext = (request as FastifyRequest & { authContext?: ProfilePresenceAuthContext }).authContext;
  const visibility = await getPresenceVisibilityService(fastify.prisma).resolveForTarget(
    viewerFromAuthContext(authContext),
    { id: profile.id, deactivatedAt: profile.deactivatedAt ?? null },
  );
  return applyPresenceVisibility(profile, visibility);
}

let optionalAuthMiddleware: ReturnType<typeof createUnifiedAuthMiddleware> | null = null;

/**
 * Middleware d'auth optionnelle (attache authContext même pour anonyme/non-auth,
 * sans rejeter) — nécessaire pour identifier le viewer sur les routes profil publiques.
 */
export function getOptionalAuth(prisma: PrismaClient): ReturnType<typeof createUnifiedAuthMiddleware> {
  if (!optionalAuthMiddleware) {
    optionalAuthMiddleware = createUnifiedAuthMiddleware(prisma, { requireAuth: false, allowAnonymous: true });
  }
  return optionalAuthMiddleware;
}

// ─── Ordonnancement : une POSITION obéit à la loi du CHAMP ────────────────────

/**
 * Qui peut demander à la base un tri « en ligne d'abord » ?
 *
 * Trier sur `isOnline` en base, puis masquer le champ à la sortie, laisse lire
 * la présence dans la POSITION : un inconnu en ligne arrive en tête, masqué
 * `false`, et sa place dit ce que le champ tait. Une SÉLECTION ou un ORDRE qui
 * dépend de la présence révèle autant que le champ (directive du 2026-08-25).
 *
 * Seul le viewer que la loi sert FULL — jusqu'à une cible qu'elle ne sait pas
 * résoudre, {@link presenceMissingEntryPolicy} `'reveal'` — peut classer par la
 * présence brute : pour lui, la position n'apprend rien que le champ ne dise
 * déjà. C'est exactement ADMIN/BIGBOSS (`isGlobalAdmin`), dérivé de la loi
 * plutôt que redéclaré ici. Tout autre viewer lit une page triée SANS clé de
 * présence, puis stabilisée sur ce qui est SERVI par {@link servedOnlineFirst}.
 */
export function mayOrderByRawPresence(viewer: PresenceViewer): boolean {
  return presenceMissingEntryPolicy(viewer) === 'reveal';
}

/**
 * Comparateur STABLE « présence servie d'abord », à appliquer APRÈS la porte,
 * sur une page lue sans clé de présence : `[...page].sort(servedOnlineFirst)`.
 * Il ne renverse deux lignes que sur `isOnline === true` tel que SERVI — jamais
 * sur autre chose : l'ordre de la base (nom, ancienneté) reste celui des lignes
 * qu'il ne départage pas. Un ami en ligne remonte donc pour celui qui a le
 * DROIT de le voir, et la position ne dit rien d'autre.
 */
export function servedOnlineFirst(
  a: { readonly isOnline: boolean | null },
  b: { readonly isOnline: boolean | null },
): number {
  return Number(b.isOnline === true) - Number(a.isOnline === true);
}
