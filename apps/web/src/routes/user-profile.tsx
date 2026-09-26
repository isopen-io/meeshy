import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';


import { FeedPostCard } from '@/components/feed-post-card';
import { LiveAnnouncement } from '@/components/live-announcement';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { GroupedSection } from '@/components/grouped-section';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { authorPostsInfiniteOptions, flattenAuthorPosts } from '@/lib/api/author-posts';
import { apiDeps } from '@/lib/api/deps';
import { sharedConversationsQueryOptions } from '@/lib/api/shared-conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { profileFailureOf } from '@/lib/profile/failure';
import { filterPosts, showsEmptyState, toggledFilter, type ProfilePostsFilter, type ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { useParams } from '@/lib/router';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Link, href, navigate } from '@/routes/route-table';
import { ReportSheet } from '@/components/report-sheet';
import { ProfileCall } from '@/routes/user-profile-call';
import { ProfileConversationsSection } from '@/routes/user-profile-conversations';
import { useProfileController } from '@/routes/user-profile-controller';
import { ProfileHero } from '@/routes/user-profile-header';
import {
  ProfileBlockedCard,
  ProfileRelationSection,
  ProfileSelfSection,
  ProfileStatsBand,
  ProfileStatsSection,
} from '@/routes/user-profile-sections';
import {
  ProfileFailureNotice,
  ProfileOfflineBanner,
  ProfilePostsEmpty,
  ProfilePostsError,
  ProfilePostsMore,
  ProfileSkeleton,
} from '@/routes/user-profile-states';

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
 * **PLUS AUCUN PANIER DERRIÈRE CETTE FICHE** (#7125 puis #7122). Le panier des
 * BLOQUÉS avait disparu le premier — `blockedByViewer` arrive sur le fil de
 * l'identité. Celui des DEMANDES a suivi : `relationRequestId` porte
 * l'identifiant qu'Accepter / Refuser / Annuler doivent envoyer, si bien que
 * les trois gestes sont armés au premier rendu au lieu d'attendre une ligne.
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
  /* COMMENTER UNE PUBLICATION DE LA FICHE (#7188, #7113) — le MÊME hôte que
     le Flux, jamais une seconde mécanique : `onComment` conduit à la page de
     la publication, à son ancre de commentaires. L'adresse vivait ici en
     copie ; elle vit désormais avec les deux autres gestes de la rangée. */
  const {
    announcement: gestureAnnouncement,
    onGesture,
    onShare,
    onComment,
    onRepost,
    repostConfirm,
    menu,
  } = usePostGesture();
  const {
    view,
    person,
    name,
    accent,
    relation,
    actions,
    signedIn,
    busy,
    onAction,
    reporting,
    closeReport,
    onPickReason,
    announce,
    announcement: actionAnnouncement,
    announcementTone: actionTone,
  } = useProfileController(username, language);
  const [filter, setFilter] = useState<ProfilePostsFilter>('all');

  /**
   * **LE LECTEUR DE LA LIGNE, PAS CELUI DU GESTE** (#7124). `titleOf` a besoin
   * d'un identifiant pour savoir QUI est « l'autre » dans un direct ; lui
   * passer la chaîne vide fait de la première partie l'autre. `resolveViewer`
   * est le site UNIQUE qui rend cette identité, fixtures comprises. `viewerId`
   * reste l'identité de COMPTE, qui gouverne les gestes.
   */
  const session = useStore(sessionStore, (state) => state.session);
  const rowViewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';
  const showsContent = relation.kind !== 'blocked';

  const posts = useInfiniteQuery(
    {
      ...authorPostsInfiniteOptions({ ...apiDeps, authorId: person?.id ?? '' }),
      enabled: person !== undefined && showsContent,
    },
    appQueryClient,
  );

  /**
   * **CE QUE VOUS PARTAGEZ DÉJÀ** (#7124) — `?withUserId=<id>`, le filtre que
   * la passerelle sert depuis le premier jour d'iOS
   * (`listSharedWith`, `UserProfileSheet.swift:325`). La question porte le
   * SUJET : elle est gardée par `enabled` comme le listing des publications,
   * parce qu'elle prend un `User.id` et non le pseudo de l'adresse.
   *
   * **Elle ne part PAS pour un lecteur sans session** (la route est en
   * authentification requise pour le scope du lecteur) ni **sur sa propre
   * fiche** — « les conversations en commun avec soi-même » n'est pas une
   * question — ni **sur un compte bloqué**, dont la fiche ne rend aucun
   * contenu.
   */
  const shared = useQuery(
    {
      ...sharedConversationsQueryOptions({ ...apiDeps, userId: person?.id ?? '' }),
      enabled: person !== undefined && showsContent && signedIn && view.data?.isSelf !== true,
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

  const onFilter = useCallback((tap: ProfilePostsFilterTap) => setFilter((current) => toggledFilter(current, tap)), []);
  const onSignIn = useCallback(() => navigate(href('login')), []);
  const onCallFailed = useCallback((message: string) => announce(message, 'error'), [announce]);
  const callPerson = useMemo(
    () => ({ id: person?.id ?? '', name, avatar: person?.avatar ?? null }),
    [person?.id, person?.avatar, name],
  );

  /**
   * **« CHARGER PLUS » RENDAIT LE FOCUS AU NÉANT ET N'ANNONÇAIT RIEN**
   * (revue #7083, défaut majeur 6) — mesuré : `Enter` sur le bouton, puis
   * `focus = BODY (perdu)`, `annonce = ''`, deux cartes arrivées. Le bouton
   * DISPARAÎT quand la dernière page entre, et l'utilisateur au clavier devait
   * re-tabuler depuis le début de la page pour revenir où il en était
   * (dimension 5). La région `aria-live` existait pourtant et servait déjà les
   * gestes relationnels : elle n'était branchée qu'au seul geste qui ne change
   * PAS la longueur de la liste.
   *
   * **LE COMPTE SE PREND SUR LE DOM, pas sur `models`** : ce qui a « bougé »
   * pour le lecteur est ce qui est RENDU, et le filtre client peut très bien
   * ne laisser passer aucune des lignes de la page neuve — auquel cas rien
   * n'est arrivé À L'ÉCRAN, et c'est cela qu'il faut dire.
   *
   * **L'ATTERRISSAGE EST LA PREMIÈRE CARTE NEUVE**, rendue focalisable par
   * `tabIndex = -1` : le lecteur reprend là où le contenu commence, et la
   * tabulation suivante le ramène naturellement vers le bouton s'il survit.
   * À défaut de carte neuve, le focus retombe sur le bloc des publications —
   * jamais sur `document.body`.
   */
  const postsRef = useRef<HTMLDivElement | null>(null);
  const pendingMore = useRef<number | null>(null);

  const cardsNow = useCallback(
    (): readonly HTMLElement[] => [...(postsRef.current?.querySelectorAll<HTMLElement>('[data-feed-card-id]') ?? [])],
    [],
  );

  /* `posts.fetchNextPage` est STABLE ; `posts` ne l'est pas — refermer le
     rappel sur l'objet de requête en fabriquerait un neuf à chaque rendu, et
     le bouton se redessinerait pour rien (Zero Unnecessary Re-render). */
  const { fetchNextPage: fetchMorePosts } = posts;
  const onMore = useCallback(() => {
    pendingMore.current = cardsNow().length;
    void fetchMorePosts();
  }, [cardsNow, fetchMorePosts]);

  useEffect(() => {
    const before = pendingMore.current;
    if (before === null || posts.isFetchingNextPage) return;
    pendingMore.current = null;
    const cards = cardsNow();
    const added = cards.length - before;
    announce(
      added > 0
        ? translate(language, 'userProfile.posts.loaded', { count: String(added) })
        : translate(language, 'userProfile.posts.loadedNone'),
    );
    const landing = cards[before] ?? postsRef.current;
    if (landing === null || landing === undefined) return;
    landing.tabIndex = -1;
    landing.focus();
    /* `models` referme l'effet sur le rendu qui a POSÉ les cartes neuves :
       `fetchNextPage().then()` résout une image trop tôt, le DOM n'en porte
       alors aucune. */
  }, [announce, cardsNow, language, models, posts.isFetchingNextPage]);

  return (
    /* L'ATTRIBUT NE PORTE QUE CE QUI EST SERVI (#7083, D-6) — il portait le
       handle DEMANDÉ, donc un profil refusé le répétait dans le document :
       « ce compte n'existe pas » et son pseudo à côté, c'est exactement ce que
       le refus indistinct doit taire. Vide sur un refus ; `check-rich-text.mjs`
       y trouve toujours son point d'accroche. */
    /* `relative` PORTE la pastille d'annonce : elle est posée `absolute` au
       bas de son hôte, exactement comme sur « Découvrir ». */
    <div data-user-profile={person?.username ?? ''} className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <ProfileHeaderBar title={person === undefined ? translate(language, 'userProfile.title') : name} />
      <main id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-4 pb-safe">
        {person !== undefined ? (
          <div className="mx-auto grid w-full max-w-xl gap-6 pb-12 pt-2">
            {online ? null : <ProfileOfflineBanner language={language} />}
            <ProfileHero profile={person} name={name} accent={accent} />
            {relation.kind === 'blocked' ? (
              <ProfileBlockedCard language={language} name={name} online={online} busy={busy} onAction={onAction} />
            ) : (
              <>
                {view.data?.isSelf === true ? (
                  /* SA PROPRE FICHE N'OFFRAIT AUCUN GESTE (#7188). Masquer les
                     actions relationnelles sur soi est juste — miroir iOS
                     (`UserProfileSheet+DetailsTab.swift:23`) — mais rien
                     n'était mis à la place : aucun chemin vers `/me` depuis
                     cette adresse, donc aucune façon d'éditer ce qu'on y voit.
                     Un écran qui montre son propre profil sans mener à son
                     édition est un cul-de-sac. */
                  <ProfileSelfSection language={language} />
                ) : (
                  <ProfileRelationSection
                    language={language}
                    relation={relation}
                    actions={actions}
                    name={name}
                    signedIn={signedIn}
                    online={online}
                    busy={busy}
                    onAction={onAction}
                    onSignIn={onSignIn}
                  />
                )}
                {view.data?.isSelf === true || !signedIn ? null : (
                  <ProfileCall language={language} person={callPerson} online={online} onFailed={onCallFailed} />
                )}
                <GroupedSection
                  id="user-profile-posts"
                  title={translate(language, 'userProfile.section.publications')}
                  icon={<GlyphSvg glyph={PROFILE_GLYPHS.quotes} size={12} />}
                  card={false}
                >
                  <div data-profile-posts ref={postsRef} className="grid gap-3">
                    <ProfileStatsBand language={language} stats={view.data?.stats ?? null} filter={filter} onFilter={onFilter} />
                    {posts.isError ? (
                      <ProfilePostsError language={language} onRetry={() => void posts.refetch()} />
                    ) : posts.isPending ? (
                      <span aria-busy="true" aria-label={translate(language, 'userProfile.posts.loading')} className="block rounded-card" style={{ height: 140, backgroundColor: 'var(--color-ios-card)' }} />
                    ) : /* UNE ABSENCE NE S'AFFIRME QUE QUAND PLUS RIEN N'EST À
                          LIRE (revue #7083) — sous un filtre, tant qu'une page
                          reste à lire, « Aucun réel » est démenti au même
                          instant par la tuile « 2 Réels » au-dessus et par
                          « Charger plus » en dessous. La loi est pure
                          (`showsEmptyState`) parce que c'est la COEXISTENCE de
                          ces deux branches disjointes qui casse, et qu'un gate
                          mesurant chacune séparément ne la voit jamais.
                          Miroir de `ProfileUserPostsList.swift:497-510`. */
                    showsEmptyState({ visible: models.length, filter, hasNextPage: posts.hasNextPage }) ? (
                      <ProfilePostsEmpty language={language} filter={filter} />
                    ) : models.length === 0 ? null : (
                      models.map((model) => (
                        <FeedPostCard
                          key={model.id}
                          model={model}
                          onGesture={onGesture}
                          onShare={onShare}
                          onComment={onComment}
                          onRepost={onRepost}
                          menu={menu}
                          preferredLanguages={readerLanguages}
                        />
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
                      <ProfilePostsMore language={language} loading={posts.isFetchingNextPage} online={online} onMore={onMore} />
                    ) : null}
                  </div>
                </GroupedSection>
                {view.data?.isSelf === true || !signedIn ? null : (
                  <ProfileConversationsSection
                    language={language}
                    conversations={shared.data ?? []}
                    viewerId={rowViewerId}
                    loading={shared.isPending}
                    failed={shared.isError}
                    onRetry={() => void shared.refetch()}
                  />
                )}
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
      {/* L'ISSUE D'UN GESTE SE VOIT (revue #7083) — la région était `sr-only`
          INCONDITIONNELLE : un refus de la passerelle défaisait l'état
          optimiste et ne laissait aucune trace pour un utilisateur voyant.
          Même composant, même loi que « Découvrir » (dimension 6). */}
      <LiveAnnouncement
        text={actionAnnouncement === '' ? gestureAnnouncement : actionAnnouncement}
        tone={actionAnnouncement === '' ? 'neutral' : actionTone}
        marker="profile"
      />
      {reporting && person !== undefined ? (
        <ReportSheet name={name} busy={busy} onPick={onPickReason} onClose={closeReport} />
      ) : null}
      {repostConfirm}
    </div>
  );
}
