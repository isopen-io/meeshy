/**
 * Échafaudage PARTAGÉ des suites d'interactions de post (#4605, lot 3).
 *
 * `interactions.test.ts` portait 1798 lignes — 215 d'échafaudage et 105 blocs
 * `describe` — bien au-delà du plafond de 1000. Il est découpé par
 * RESPONSABILITÉ, jamais par tranche :
 *
 *   interactions.reactions.test.ts   like · unlike · bookmark
 *   interactions.views.test.ts       view · anonymous-view · impression · les deux batch
 *   interactions.sharing.test.ts     share · pin · listes de vues · repost
 *
 * ## Pourquoi les `jest.mock` restent chez les appelants
 *
 * `jest.mock(...)` est HISSÉ au sommet du module qui l'écrit et n'a d'effet que
 * là : le déménager ici ne mockerait rien pour personne. Ce module exporte donc
 * les FABRIQUES, et chaque suite écrit son `jest.mock(chemin, fabrique)` — trois
 * lignes au lieu de soixante-dix.
 *
 * ## Et pourquoi l'import de la route peut être au sommet ICI
 *
 * Le hissage place les `jest.mock` de la suite AVANT tous ses imports, donc
 * avant celui de ce module. Quand `registerInteractionRoutes` est résolu plus
 * bas, `PostService` et consorts sont déjà remplacés. Un `require` paresseux
 * serait une précaution contre un ordre qui ne peut pas se produire.
 *
 * ## Les doubles sont NEUFS par suite, et c'est un gain
 *
 * Chaque fichier de test a son propre registre de modules : les compteurs
 * d'appels ne traversent plus les 105 blocs. Le fichier d'origine s'en
 * protégeait par des `mockClear()` posés à la main, cinq fois — ils restent où
 * ils étaient, la découpe ne les rend pas faux.
 */

import { jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Doubles de `PostService` ─────────────────────────────────────────────────

export const mockLikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
// `unlikePost` rend une enveloppe : le post ET la réaction réellement retirée.
export const mockUnlikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} } });
export const mockBookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 1 });
export const mockUnbookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 0 });
export const mockRecordView = jest.fn<any>().mockResolvedValue(true);
export const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', viewCount: 1 });
export const mockRecordAnonymousOpen = jest.fn<any>().mockResolvedValue(true);
export const mockSharePost = jest.fn<any>().mockResolvedValue({ shareCount: 5 });
export const mockShareWithTrackingLink = jest.fn<any>().mockResolvedValue({ shareCount: 5, token: 'abc123', shortUrl: 'https://app.example.com/l/abc123' });
export const mockGetPostShareLink = jest.fn<any>().mockResolvedValue({ token: 'abc123', shortUrl: 'https://app.example.com/l/abc123', clickCount: 3 });
export const mockPinPost = jest.fn<any>().mockResolvedValue({ id: 'post-001' });
export const mockUnpinPost = jest.fn<any>().mockResolvedValue({ id: 'post-001' });
export const mockGetPostViews = jest.fn<any>().mockResolvedValue({ items: [], total: 0, hasMore: false });
export const mockGetPostInteractions = jest.fn<any>().mockResolvedValue({ viewers: [], total: 0, hasMore: false });
export const mockRepostPost = jest.fn<any>().mockResolvedValue({ id: 'repost-001', repostOfId: 'post-001', type: 'POST', authorId: 'user-001' });
export const mockRecordEngagementBatch = jest.fn<any>().mockResolvedValue(2);

// ─── Fabriques de modules, à passer à `jest.mock` ─────────────────────────────

export const postServiceModule = () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
    bookmarkPost: (...args: any[]) => mockBookmarkPost(...args),
    unbookmarkPost: (...args: any[]) => mockUnbookmarkPost(...args),
    recordView: (...args: any[]) => mockRecordView(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    recordAnonymousOpen: (...args: any[]) => mockRecordAnonymousOpen(...args),
    sharePost: (...args: any[]) => mockSharePost(...args),
    shareWithTrackingLink: (...args: any[]) => mockShareWithTrackingLink(...args),
    getPostShareLink: (...args: any[]) => mockGetPostShareLink(...args),
    pinPost: (...args: any[]) => mockPinPost(...args),
    unpinPost: (...args: any[]) => mockUnpinPost(...args),
    getPostViews: (...args: any[]) => mockGetPostViews(...args),
    getPostInteractions: (...args: any[]) => mockGetPostInteractions(...args),
    repostPost: (...args: any[]) => mockRepostPost(...args),
    recordEngagementBatch: (...args: any[]) => mockRecordEngagementBatch(...args),
  })),
});

export const mediaServiceModule = () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
});

export const mentionServiceModule = () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
});

export const trackingLinkServiceModule = () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
});

export const rateLimiterModule = () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
});

/**
 * Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE dont
 * les routes font `instanceof`, et `withMutationOutcome` est le chemin réel du
 * repost. Une usine qui ne rendait que `withMutationLog` les laissait à
 * `undefined` — `instanceof undefined` lève un TypeError qui se déguise en 500
 * sur des chemins d'erreur sans rapport.
 *
 * Le `jest.requireActual` reste chez l'APPELANT : son chemin est résolu depuis
 * le fichier qui l'écrit, et son résultat arrive ici en paramètre.
 */
export const withMutationLogModule = (reel: object) => ({
  ...reel,
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
});

/**
 * #4147 — `POST /posts`, `from-attachment` et `repost` tirent leur plafond de
 * création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
 * (`createSharedWriteRateLimitPreHandler`, `routes/posts/socialRateLimit.ts`) :
 * sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
 * (aucun `REDIS_URL`) et CHAQUE écriture de ce type serait refusée avant
 * d'atteindre ce que ces fichiers vérifient — détail complet dans
 * `core.test.ts`, premier fichier de la série à le poser. `incr` répond toujours
 * « premier appel » : ces suites ne testent PAS le plafond (son témoin dédié vit
 * dans `social-write-rate-limit.test.ts`) — juste un Redis DISPONIBLE.
 */
export const cacheStoreModule = () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
});

// ─── Constantes ───────────────────────────────────────────────────────────────

export const USER_ID = '507f1f77bcf86cd799439011';
export const POST_ID = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

/**
 * Tranche ACL d'un post PUBLIC — ce que `loadPostAcl` rend au verdict
 * d'audience posé sur le favori, l'impression et le partage (issue #4146).
 */
export const publicAcl = (id: string) => ({
  id, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] as string[], expiresAt: null,
});

/**
 * `post.findMany` répond désormais à DEUX questions : la passe d'audience du
 * lot d'impressions (`where.id.in`) et la résolution des racines de repost
 * (`where.repostOfId`). Ce double branche sur la seconde et rend, pour la
 * première, un post PUBLIC par id demandé — l'audience elle-même est le sujet
 * de `interactions-consumption-audience.test.ts`, pas de ces fichiers.
 */
export function aclAwareFindMany(repostRows: unknown[] = []) {
  return jest.fn<any>().mockImplementation(({ where }: any) => {
    if (where?.repostOfId !== undefined) return Promise.resolve(repostRows);
    return Promise.resolve(((where?.id?.in ?? []) as string[]).map(publicAcl));
  });
}

export const aclAwareFindFirst = () =>
  jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve(publicAcl(where.id)));

export async function buildApp(opts: {
  authenticated?: boolean;
  withNotifications?: boolean;
  withSocialEvents?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, withNotifications = false, withSocialEvents = false, prisma: prismaOverride } = opts;

  const prisma = prismaOverride ?? {
    postImpression: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
    },
    post: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
      // Audience déclarée PUBLIC : aimer consulte désormais `Post.visibility`
      // via `loadPostAcl`. Le droit de voir est couvert par
      // `interactions-audience.test.ts`.
      findFirst: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      // Résolution repostOfId/originalRepostOfId pour le crédit de racine du
      // batch d'impressions (chantier reposts cohérents, tâche 1). Défaut :
      // aucun repost dans le batch — même comportement qu'avant. L'unitaire
      // replie sa résolution dans le `select` de `update` (Important #2,
      // revue), aucun `findUnique` séparé n'est plus nécessaire. Le même
      // délégué porte la passe d'audience du lot (#4146).
      findMany: aclAwareFindMany(),
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  if (withNotifications) {
    app.decorate('notificationService', {
      createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
      createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
  } else {
    app.decorate('notificationService', null as any);
  }

  if (withSocialEvents) {
    app.decorate('socialEvents', {
      broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  const requiredAuth = makePreValidationAuth(authenticated);
  registerInteractionRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}
