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
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { failureMayRetry, profileFailureOf, type ProfileFailure } from '@/lib/profile/failure';
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
  ProfilePostsMore,
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

/** Le rendu d'un échec, par sa NATURE — la loi vit dans `lib/profile/failure.ts`,
 * pure, parce que « 403 et 404 rendent le même texte » ne se mesure qu'en
 * comparant deux chaînes. */
const FAILURE_NOTICE = {
  refused: { glyph: 'lock', tone: 'var(--color-ios-ink-3)', alert: false, title: 'userProfile.refused.title', body: 'userProfile.refused.body' },
  throttled: { glyph: 'warningCircle', tone: 'var(--color-warning)', alert: true, title: 'userProfile.throttled.title', body: 'userProfile.throttled.body' },
  offline: { glyph: 'warningCircle', tone: 'var(--color-warning)', alert: false, title: 'profile.offline.title', body: 'userProfile.offline.body' },
  error: { glyph: 'warningCircle', tone: 'var(--color-error)', alert: true, title: 'userProfile.error.title', body: 'userProfile.error.body' },
} as const satisfies Readonly<
  Record<ProfileFailure, { readonly glyph: 'lock' | 'warningCircle'; readonly tone: string; readonly alert: boolean; readonly title: InterfaceCatalogKey; readonly body: InterfaceCatalogKey }>
>;

/**
 * L'ISSUE D'UN GESTE, DITE À VOIX HAUTE — les clés de « Découvrir » sont
 * réutilisées telles quelles (même geste, même mot), `userProfile.announce.*`
 * ne portant que ce qui est propre à cet écran.
 *
 * **« Écrire » n'a PAS de `done`, et c'est délibéré** : un geste qui réussit
 * NAVIGUE, et l'écran d'après EST le retour. Lui coller « Demande envoyée »
 * par commodité de table aurait annoncé une autre action que celle posée — un
 * lecteur d'écran aurait entendu le mauvais mot avant de changer d'écran.
 */
const ANNOUNCE = {
  add: { done: 'discover.announce.sent', failed: 'discover.announce.sendFailed' },
  accept: { done: 'discover.announce.accepted', failed: 'discover.announce.acceptFailed' },
  reject: { done: 'discover.announce.rejected', failed: 'discover.announce.rejectFailed' },
  cancel: { done: 'discover.announce.cancelled', failed: 'discover.announce.cancelFailed' },
  block: { done: 'userProfile.announce.blocked', failed: 'userProfile.announce.blockFailed' },
  unblock: { done: 'discover.announce.unblocked', failed: 'discover.announce.unblockFailed' },
  write: { done: null, failed: 'userProfile.announce.writeFailed' },
} as const satisfies Readonly<Record<ProfileActionKind, { readonly done: InterfaceCatalogKey | null; readonly failed: InterfaceCatalogKey }>>;

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

function ProfileFailureNotice({
  language,
  failure,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly failure: ProfileFailure;
  readonly onRetry: () => void;
}) {
  const notice = FAILURE_NOTICE[failure];
  return (
    <ProfileNotice
      glyph={notice.glyph}
      tone={notice.tone}
      alert={notice.alert}
      title={translate(language, notice.title)}
      detail={translate(language, notice.body)}
      {...(failureMayRetry(failure) ? { action: { label: translate(language, 'profile.retry'), onAction: onRetry } } : {})}
    />
  );
}

/**
 * LA ROUTE LIT L'ADRESSE, LA VUE PREND SON SUJET EN PARAMÈTRE — deux
 * responsabilités, et la seconde est celle qui se mesure : `useParams()` exige
 * le contexte du routeur, et un témoin qui monterait le routeur entier
 * mesurerait surtout le chargement d'un chunk.
 */
export default function UserProfileScreen() {
  const { username } = useParams<'/u/$username'>();
  return <UserProfileView username={username} />;
}

export function UserProfileView({ username }: { readonly username: string }) {
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
    (kind: ProfileActionKind, outcome: FriendActionOutcome) => {
      if (outcome === 'offline') return announce(translate(language, 'discover.announce.offline'));
      if (outcome === 'failed') return announce(translate(language, ANNOUNCE[kind].failed));
      const done = ANNOUNCE[kind].done;
      if (done !== null) announce(translate(language, done));
    },
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
    /* L'ATTRIBUT NE PORTE QUE CE QUI EST SERVI (#7083, D-6) — il portait le
       handle DEMANDÉ, donc un profil refusé le répétait dans le document :
       « ce compte n'existe pas » et son pseudo à côté, c'est exactement ce que
       le refus indistinct doit taire. Vide sur un refus ; `check-rich-text.mjs`
       y trouve toujours son point d'accroche. */
    <div data-user-profile={person?.username ?? ''} className="flex h-dvh flex-col overflow-hidden pt-safe">
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
                      <ProfilePostsEmpty language={language} filter={filter} />
                    ) : (
                      models.map((model) => (
                        <FeedPostCard key={model.id} model={model} onGesture={onGesture} onShare={onShare} preferredLanguages={readerLanguages} />
                      ))
                    )}
                    {/* LA SUITE SE CHARGE SOUS UN FILTRE AUSSI (revue #7083) — le
                        filtre est CLIENT, sur les pages déjà lues, et la tuile
                        annonce un compte SERVEUR : la retirer ici faisait dire
                        « 2 Réels » à un bandeau au-dessus d'une liste d'UN, sans
                        aucun geste pour atteindre le second. iOS ne s'arrête pas
                        non plus — sa sentinelle de bas de liste est armée par
                        `hasMore`, jamais par le filtre
                        (`ProfileUserPostsList.swift:246-252`). */}
                    {posts.hasNextPage ? (
                      <ProfilePostsMore language={language} loading={posts.isFetchingNextPage} onMore={() => void posts.fetchNextPage()} />
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
        ) : view.isError ? (
          <ProfileFailureNotice language={language} failure={profileFailureOf(view.error, online)} onRetry={() => void view.refetch()} />
        ) : (
          <div className="mx-auto w-full max-w-xl pt-2">
            <ProfileSkeleton language={language} />
          </div>
        )}
      </main>
    </div>
  );
}
