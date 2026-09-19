import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { GroupedSection } from '@/components/grouped-section';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { authorPostsInfiniteOptions, flattenAuthorPosts } from '@/lib/api/author-posts';
import { blockedUsersQueryOptions, flattenBlockedUsers } from '@/lib/api/blocks';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { createDirectConversation } from '@/lib/api/conversations';
import {
  performBlock,
  performRespondToRequest,
  performSendRequest,
  performUnblock,
  type FriendActionDeps,
  type FriendActionOutcome,
} from '@/lib/api/friend-actions';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { publicProfileQueryOptions } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { filterPosts, toggledFilter, type ProfilePostsFilter, type ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { actionsFor, bucketNeededFor, relationFromServed, type ProfileActionKind } from '@/lib/profile/relation';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Link, href, navigate } from '@/routes/route-table';
import {
  ProfileBlockedCard,
  ProfileHero,
  ProfileNotice,
  ProfileOfflineBanner,
  ProfilePostsEmpty,
  ProfilePostsError,
  ProfileRelationSection,
  ProfileSkeleton,
  ProfileStatsBand,
  ProfileStatsSection,
} from '@/routes/user-profile-sections';

/**
 * **LE PROFIL PUBLIC DE QUELQU'UN** (#7032, complété par #7083) — `/u/$username`,
 * l'adresse que chaque mention vise. Elle porte la nomenclature du LEGACY
 * (`apps/web/app/u/`, D-5) : un lien déjà partagé, un signet, une notification
 * qui la nomme doivent continuer de s'ouvrir après la bascule.
 *
 * **CE QU'ELLE RÉPOND MAINTENANT**, et que le lot d'ouverture avait différé :
 * ce que la personne PUBLIE, COMMENT lui écrire ou entrer en contact, et ce que
 * ses compteurs PUBLICS disent. L'audience est quelqu'un qui vient de lire une
 * `@mention` dans un message et touche le nom.
 *
 * **UN ALLER-RETOUR POUR L'IDENTITÉ, LES COMPTEURS ET LA RELATION** —
 * `?expand=stats,relation` (`lib/api/public-profile.ts`). La liste des
 * publications en DÉPEND : `authorId` est un `User.id`, jamais un pseudo
 * (`PostFeedService.ts:869`), et elle est donc gardée par `enabled` plutôt que
 * lancée sur un identifiant fabriqué depuis l'adresse.
 *
 * **ZÉRO REQUÊTE DE PLUS DANS LE CAS NOMINAL** : le panier des demandes n'est
 * chargé que si la relation est EN ATTENTE (`bucketNeededFor`) — la passerelle
 * ne sert pas l'identifiant de la demande, et Accepter / Refuser / Annuler en
 * ont besoin. Issue gateway compagnon : `relationRequestId` sur
 * `expand=relation`.
 *
 * **MÊME CARTE QUE LE FIL, MÊME MODÈLE** — `resolveFeedCardModel` et
 * `FeedPostCard`, jamais une seconde peau : le Prisme, l'accent et la géométrie
 * d'une publication ne se recalculent pas par écran (D-14, D-1).
 *
 * **403 ET 404 SE CONFONDENT** (D-6, même doctrine que `PostDetailRefused`) :
 * rien du compte ne doit transparaître — pas même son existence. Une 429, en
 * revanche, dit autre chose et se rend autrement : un débit n'est pas une
 * absence.
 */

const isRefusal = (error: unknown): boolean => error instanceof ApiError && (error.status === 403 || error.status === 404);
const isThrottled = (error: unknown): boolean => error instanceof ApiError && error.status === 429;

/**
 * L'ISSUE D'UN GESTE, DITE À VOIX HAUTE — les clés de « Découvrir » sont
 * réutilisées telles quelles (même geste, même mot), `userProfile.announce.*`
 * ne portant que ce qui est propre à cet écran.
 */
const ANNOUNCE = {
  add: { done: 'discover.announce.sent', failed: 'discover.announce.sendFailed' },
  accept: { done: 'discover.announce.accepted', failed: 'discover.announce.acceptFailed' },
  reject: { done: 'discover.announce.rejected', failed: 'discover.announce.rejectFailed' },
  cancel: { done: 'discover.announce.cancelled', failed: 'discover.announce.cancelFailed' },
  block: { done: 'userProfile.announce.blocked', failed: 'userProfile.announce.blockFailed' },
  unblock: { done: 'discover.announce.unblocked', failed: 'discover.announce.unblockFailed' },
  write: { done: 'discover.announce.sent', failed: 'userProfile.announce.writeFailed' },
} as const satisfies Readonly<Record<ProfileActionKind, { readonly done: InterfaceCatalogKey; readonly failed: InterfaceCatalogKey }>>;

function ProfileHeaderBar({ title }: { readonly title: string }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <Link
        to="list"
        aria-label="Retour aux conversations"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="truncate text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </h1>
    </header>
  );
}

export default function UserProfileScreen() {
  const { username } = useParams<'/u/$username'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const minute = useMinute();
  const { languages: readerLanguages } = useReaderLanguages();
  const { announcement: gestureAnnouncement, onGesture, onShare } = usePostGesture();
  const { text: actionAnnouncement, announce } = useLiveAnnouncer();
  const [filter, setFilter] = useState<ProfilePostsFilter>('all');
  const [busy, setBusy] = useState(false);

  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  /* Sous fixtures il n'y a pas de session : les gestes y restent mesurables,
     exactement comme `/me` le fait (`profile.tsx:132`). */
  const signedIn = apiDeps.source === 'fixtures' || viewerId !== null;

  const view = useQuery(publicProfileQueryOptions({ ...apiDeps, handle: username }), appQueryClient);
  const person = view.data?.profile;
  const served = view.data?.relation ?? 'none';

  /* LE BLOCAGE N'EST PAS SUR LE FIL : `relationAvec` n'a pas de valeur
     `blocked` (`routes/directory/person.ts:72-93`). Il se lit dans le panier
     des bloqués — la MÊME source que « Découvrir », que `performBlock` et
     `performUnblock` écrivent au geste. */
  const blockedList = useInfiniteQuery({ ...blockedUsersQueryOptions(apiDeps), enabled: signedIn }, appQueryClient);
  const blocked = useMemo(
    () => (person === undefined ? false : flattenBlockedUsers(blockedList.data).some((row) => row.id === person.id)),
    [blockedList.data, person],
  );

  const bucket = bucketNeededFor(served);
  const requests = useInfiniteQuery(
    { ...friendRequestsQueryOptions(apiDeps, bucket ?? 'received'), enabled: signedIn && bucket !== null },
    appQueryClient,
  );
  const pendingRequest = useMemo(() => {
    if (person === undefined || bucket === null) return null;
    const rows = flattenFriendRequests(requests.data);
    return rows.find((row) => (bucket === 'received' ? row.senderId === person.id : row.receiverId === person.id)) ?? null;
  }, [bucket, person, requests.data]);

  const relation = relationFromServed({ served, blocked, request: pendingRequest });
  const actions = actionsFor(relation);
  const showsContent = relation.kind !== 'blocked';

  const posts = useInfiniteQuery(
    {
      ...authorPostsInfiniteOptions({ ...apiDeps, authorId: person?.id ?? '' }),
      enabled: person !== undefined && showsContent,
    },
    appQueryClient,
  );

  const models = useMemo(
    () =>
      filterPosts(flattenAuthorPosts(posts.data), filter).map((post) =>
        resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() }),
      ),
    // `minute` réévalue `new Date()` — même motif que `feed.tsx` et `hashtag.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts.data, filter, readerLanguages, minute],
  );

  const name = person?.displayName ?? person?.username ?? `@${username}`;
  const accent = person === undefined ? 'var(--color-ios-brand)' : authorAccentColor(person.id, name);

  const deps: FriendActionDeps = useMemo(
    () => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId }),
    [viewerId],
  );

  const report = useCallback(
    (kind: ProfileActionKind, outcome: FriendActionOutcome) =>
      announce(translate(language, outcome === 'done' ? ANNOUNCE[kind].done : outcome === 'offline' ? 'discover.announce.offline' : ANNOUNCE[kind].failed)),
    [announce, language],
  );

  const onAction = useCallback(
    (kind: ProfileActionKind) => {
      if (person === undefined || busy) return;
      const summary: PersonSummary = { id: person.id, username: person.username, displayName: person.displayName, avatar: person.avatar };
      setBusy(true);
      const settle = (outcome: FriendActionOutcome) => {
        setBusy(false);
        report(kind, outcome);
      };
      if (kind === 'write') {
        if (!navigator.onLine) return settle('offline');
        void createDirectConversation(apiDeps, person.id).then((result) => {
          if (!result.ok) return settle('failed');
          setBusy(false);
          navigate(href('thread', { conversation: result.data.id }));
        });
        return;
      }
      if (kind === 'add') return void performSendRequest({ person: summary, deps }).then(settle);
      if (kind === 'block') return void performBlock({ person: summary, deps }).then(settle);
      if (kind === 'unblock') return void performUnblock({ person: summary, deps }).then(settle);
      /* Accepter, refuser, annuler ont besoin de la LIGNE : sans elle, le
         bouton est désactivé et la bannière de contexte le dit — jamais un
         geste qui part dans le vide. */
      if (pendingRequest === null) return settle('failed');
      const action = kind === 'accept' ? 'accept' : kind === 'reject' ? 'reject' : 'cancel';
      void performRespondToRequest({ request: pendingRequest, action, deps }).then(settle);
    },
    [busy, deps, pendingRequest, person, report],
  );

  const onFilter = useCallback((tap: ProfilePostsFilterTap) => setFilter((current) => toggledFilter(current, tap)), []);
  const onSignIn = useCallback(() => navigate(href('login')), []);

  const awaitingRequest = bucket !== null && pendingRequest === null;

  return (
    <div data-user-profile={username} className="flex h-dvh flex-col overflow-hidden pt-safe">
      <ProfileHeaderBar title={person === undefined ? translate(language, 'userProfile.title') : name} />
      <p role="status" aria-live="polite" data-profile-announce className="sr-only">
        {actionAnnouncement === '' ? gestureAnnouncement : actionAnnouncement}
      </p>
      <main id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-4 pb-safe">
        {person !== undefined ? (
          <div className="mx-auto grid w-full max-w-xl gap-6 pb-12 pt-2">
            {online ? null : <ProfileOfflineBanner language={language} />}
            <ProfileHero profile={person} name={name} accent={accent} />
            {relation.kind === 'blocked' ? (
              <ProfileBlockedCard language={language} name={name} online={online} busy={busy} onAction={onAction} />
            ) : (
              <>
                {view.data?.isSelf === true ? null : (
                  <ProfileRelationSection
                    language={language}
                    relation={relation}
                    actions={actions}
                    name={name}
                    signedIn={signedIn}
                    online={online}
                    awaitingRequest={awaitingRequest}
                    busy={busy}
                    onAction={onAction}
                    onSignIn={onSignIn}
                  />
                )}
                <GroupedSection
                  id="user-profile-posts"
                  title={translate(language, 'userProfile.section.publications')}
                  icon={<GlyphSvg glyph={PROFILE_GLYPHS.quotes} size={12} />}
                  card={false}
                >
                  <div data-profile-posts className="grid gap-3">
                    <ProfileStatsBand language={language} stats={view.data?.stats ?? null} filter={filter} onFilter={onFilter} />
                    {posts.isError ? (
                      <ProfilePostsError language={language} onRetry={() => void posts.refetch()} />
                    ) : posts.isPending ? (
                      <span aria-busy="true" aria-label={translate(language, 'userProfile.posts.loading')} className="block rounded-card" style={{ height: 140, backgroundColor: 'var(--color-ios-card)' }} />
                    ) : models.length === 0 ? (
                      <ProfilePostsEmpty language={language} />
                    ) : (
                      models.map((model) => (
                        <FeedPostCard key={model.id} model={model} onGesture={onGesture} onShare={onShare} preferredLanguages={readerLanguages} />
                      ))
                    )}
                    {posts.hasNextPage && filter === 'all' ? (
                      <button
                        type="button"
                        data-profile-posts-more
                        onClick={() => void posts.fetchNextPage()}
                        disabled={posts.isFetchingNextPage}
                        className="mx-auto grid place-items-center rounded-chip px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)', minHeight: 44 }}
                      >
                        {translate(language, posts.isFetchingNextPage ? 'userProfile.posts.loading' : 'userProfile.posts.loadMore')}
                      </button>
                    ) : null}
                  </div>
                </GroupedSection>
                <ProfileStatsSection
                  language={language}
                  stats={view.data?.stats ?? null}
                  createdAt={person.createdAt}
                  loading={view.isFetching}
                />
              </>
            )}
          </div>
        ) : isRefusal(view.error) ? (
          <ProfileNotice
            glyph="lock"
            tone="var(--color-ios-ink-3)"
            alert={false}
            title={translate(language, 'userProfile.refused.title')}
            detail={translate(language, 'userProfile.refused.body')}
          />
        ) : isThrottled(view.error) ? (
          <ProfileNotice
            glyph="warningCircle"
            tone="var(--color-warning)"
            alert
            title={translate(language, 'userProfile.throttled.title')}
            detail={translate(language, 'userProfile.throttled.body')}
            action={{ label: translate(language, 'profile.retry'), onAction: () => void view.refetch() }}
          />
        ) : view.isError ? (
          <ProfileNotice
            glyph="warningCircle"
            tone={online ? 'var(--color-error)' : 'var(--color-warning)'}
            alert={online}
            title={translate(language, online ? 'userProfile.error.title' : 'profile.offline.title')}
            detail={translate(language, online ? 'userProfile.error.body' : 'userProfile.offline.body')}
            {...(online ? { action: { label: translate(language, 'profile.retry'), onAction: () => void view.refetch() } } : {})}
          />
        ) : (
          <div className="mx-auto w-full max-w-xl pt-2">
            <ProfileSkeleton language={language} />
          </div>
        )}
      </main>
    </div>
  );
}
