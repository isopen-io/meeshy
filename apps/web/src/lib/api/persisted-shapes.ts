import type { InfiniteData } from '@tanstack/react-query';

import type { authorPostsInfiniteOptions } from './author-posts';
import type { bookmarkedPostsInfiniteOptions } from './bookmarked-posts';
import type { callHistoryQueryOptions } from './calls';
import type { repliesInfiniteOptions } from './comment-replies';
import type { communityMembersQueryOptions } from './community-members';
import type { communityPostsInfiniteOptions } from './community-posts';
import type { mediaHubInfiniteOptions } from './conversation-media-hub';
import type { conversationMembersQueryOptions } from './conversation-members';
import type { conversationQuery, conversationsInfiniteOptions } from './conversations';
import type { feedInfiniteOptions } from './feed';
import type { friendRequestsQueryOptions } from './friend-requests';
import type { hashtagInfiniteOptions } from './hashtag-posts';
import type { messagesInfiniteOptions } from './messages';
import type { notificationsInfiniteOptions } from './notifications';
import type { myProfileQueryOptions } from './profile';
import type { commentsInfiniteOptions } from './publication-comments';
import type { reelsInfiniteOptions } from './reels';
import type { starredListInfiniteOptions } from './starred-messages-list';

/**
 * **LES FORMES QUE LE CACHE PERSISTÉ RANGE SUR LE DISQUE** (#18923).
 *
 * Le cache du lecteur survit désormais aux versions de l'application : seul
 * `CACHE_SCHEMA` (`query-client.ts`) le purge. Une forme rangée qui change sans
 * incrément serait relue, au premier démarrage qui suit, par un code qui en
 * attend une autre — une `select` qui lève sur un `.pages` absent, un écran
 * blanc chez le seul lecteur qui avait déjà un cache (#6195, #6972).
 *
 * Ce registre DÉRIVE chaque forme de la fabrique de requête qui la produit —
 * jamais une copie écrite à la main, qui dériverait en silence. Son empreinte
 * structurelle est enregistrée dans `persisted-shapes.lock.json` sous le
 * `CACHE_SCHEMA` courant ; `persisted-shapes.test.ts` rougit quand elle change
 * sans incrément (changement incompatible) ou sans réenregistrement
 * (changement compatible), et `scripts/record-persisted-shapes.mjs` la
 * réenregistre — en refusant un changement incompatible sous le même schéma.
 *
 * La frontière de la garde est écrite dans `decisions.md` (D-82, révision #18923) : les formes
 * que le WEB déclare (conteneurs de pages, pagination, types décodés par le
 * client) sont décrites en entier ; un type servi par la passerelle et déclaré
 * par `@meeshy/shared` (`Conversation`, `Message`…) n'est nommé que par son
 * nom, sa rétrocompatibilité relevant de la règle de production (#9223,
 * #9231) : un client lit un ancien serveur, donc un ancien cache du même type.
 *
 * Toute famille persistée dont le web déclare la forme s'inscrit ici.
 */
type QueryFactory = (...args: never[]) => { readonly queryFn: (...args: never[]) => unknown };

type Fetched<F extends QueryFactory> = Awaited<ReturnType<ReturnType<F>['queryFn']>>;

/** Une fabrique INFINIE range des pages et leurs curseurs ; une autre, sa réponse. */
type CachedBy<F extends QueryFactory> = ReturnType<F> extends { readonly initialPageParam: infer PageParam }
  ? InfiniteData<Fetched<F>, PageParam>
  : Fetched<F>;

export type PersistedShapes = {
  readonly 'conversations': CachedBy<typeof conversationsInfiniteOptions>;
  readonly 'conversations/:id': CachedBy<typeof conversationQuery>;
  readonly 'conversations/:id/messages': CachedBy<typeof messagesInfiniteOptions>;
  readonly 'conversations/:id/members': CachedBy<typeof conversationMembersQueryOptions>;
  readonly 'conversations/:id/media': CachedBy<typeof mediaHubInfiniteOptions>;
  readonly 'starred': CachedBy<typeof starredListInfiniteOptions>;
  readonly 'me/profile': CachedBy<typeof myProfileQueryOptions>;
  readonly 'notifications/:category': CachedBy<typeof notificationsInfiniteOptions>;
  readonly 'calls/history': CachedBy<typeof callHistoryQueryOptions>;
  readonly 'friend-requests/:bucket': CachedBy<typeof friendRequestsQueryOptions>;
  readonly 'feed': CachedBy<typeof feedInfiniteOptions>;
  readonly 'reels': CachedBy<typeof reelsInfiniteOptions>;
  readonly 'posts/:id/comments': CachedBy<typeof commentsInfiniteOptions>;
  readonly 'posts/:id/comments/:id/replies': CachedBy<typeof repliesInfiniteOptions>;
  readonly 'users/:id/posts': CachedBy<typeof authorPostsInfiniteOptions>;
  readonly 'bookmarks': CachedBy<typeof bookmarkedPostsInfiniteOptions>;
  readonly 'hashtags/:tag': CachedBy<typeof hashtagInfiniteOptions>;
  readonly 'communities/:id/posts': CachedBy<typeof communityPostsInfiniteOptions>;
  readonly 'communities/:id/members': CachedBy<typeof communityMembersQueryOptions>;
};
