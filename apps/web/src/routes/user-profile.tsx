import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { LiveAnnouncement } from '@/components/live-announcement';
import { Glyph } from '@/components/glyph';
import { GameProfileOwnSlot, GameProfileVisitorSlot } from '@/components/game-profile-slots';
import { ProfileTabPanel, ProfileTabs, useProfileTab } from '@/components/profile-tabs';
import { ReportSheet } from '@/components/report-sheet';
import { apiDeps } from '@/lib/api/deps';
import { sharedConversationsQueryOptions } from '@/lib/api/shared-conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { profileFailureOf } from '@/lib/profile/failure';
import { userProfileTabs } from '@/lib/profile/tabs';
import { useParams } from '@/lib/router';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { Link, href, navigate } from '@/routes/route-table';
import { ProfileCall } from '@/routes/user-profile-call';
import { ProfileConversationsSection } from '@/routes/user-profile-conversations';
import { useProfileController } from '@/routes/user-profile-controller';
import { ProfileHero } from '@/routes/user-profile-header';
import { ProfilePostsPanel } from '@/routes/user-profile-posts';
import {
  ProfileBlockedCard,
  ProfileRelationSection,
  ProfileSelfSection,
  ProfileStatsSection,
} from '@/routes/user-profile-sections';
import { ProfileFailureNotice, ProfileOfflineBanner, ProfileSkeleton } from '@/routes/user-profile-states';

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
 * **UN ALLER-RETOUR POUR L’IDENTITÉ, LES COMPTEURS, LA RELATION ET LA PRÉSENCE** —
 * `?expand=stats,relation,presence` (`lib/api/public-profile.ts`). La liste des
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
        <Glyph name="caretLeft" size={20} className="rtl:-scale-x-100" />
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
  /* COMMENTER UNE PUBLICATION DE LA FICHE (#7188, #7113) — le MÊME hôte que
     le Flux, jamais une seconde mécanique : `onComment` conduit à la page de
     la publication, à son ancre de commentaires. */
  const {
    announcement: gestureAnnouncement,
    onGesture,
    onShare,
    onComment,
    onRepost,
    repostConfirm,
    menu,
  } = usePostGesture();
  const gestures = useMemo(() => ({ onGesture, onShare, onComment, onRepost, menu }), [onGesture, onShare, onComment, onRepost, menu]);
  const {
    view,
    person,
    name,
    accent,
    presence,
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

  /**
   * **LE LECTEUR DE LA LIGNE, PAS CELUI DU GESTE** (#7124). `titleOf` a besoin
   * d'un identifiant pour savoir QUI est « l'autre » dans un direct ;
   * `resolveViewer` est le site UNIQUE qui rend cette identité, fixtures
   * comprises. `viewerId` reste l'identité de COMPTE, qui gouverne les gestes.
   */
  const session = useStore(sessionStore, (state) => state.session);
  const rowViewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';
  const showsContent = relation.kind !== 'blocked';
  const isSelf = view.data?.isSelf === true;

  /**
   * **LES ONGLETS DE `UserProfileSheet`** (#6330) — Publications,
   * Conversations, Détails, Détails ouvert d'abord : l'essentiel (se
   * connecter, écrire, appeler, les compteurs) tient sur le premier écran,
   * et chaque liste longue a son onglet au lieu de pousser la suivante sous
   * la ligne de flottaison. « Conversations » n'existe que s'il y a une
   * question à poser : jamais sur sa propre fiche, jamais sans session.
   */
  const offered = useMemo(() => userProfileTabs({ conversations: signedIn && !isSelf }), [signedIn, isSelf]);
  const [tab, selectTab, tabBase] = useProfileTab({ offered, fallback: 'details' });

  /**
   * **CE QUE VOUS PARTAGEZ DÉJÀ** (#7124) — `?withUserId=<id>`, le filtre que
   * la passerelle sert depuis le premier jour d'iOS
   * (`listSharedWith`, `UserProfileSheet.swift:325`). Gardée par `enabled` :
   * elle prend un `User.id`, ne part ni sans session, ni sur sa propre fiche,
   * ni sur un compte bloqué. Elle part dès l'ouverture, pas au premier tap sur
   * l'onglet : l'onglet s'ouvre alors sur des lignes, pas sur un squelette.
   */
  const shared = useQuery(
    {
      ...sharedConversationsQueryOptions({ ...apiDeps, userId: person?.id ?? '' }),
      enabled: person !== undefined && showsContent && signedIn && !isSelf,
    },
    appQueryClient,
  );

  const onSignIn = useCallback(() => navigate(href('login')), []);
  const onCallFailed = useCallback((message: string) => announce(message, 'error'), [announce]);
  const onPostsAnnounce = useCallback((text: string) => announce(text), [announce]);
  const callPerson = useMemo(
    () => ({ id: person?.id ?? '', name, avatar: person?.avatar ?? null }),
    [person?.id, person?.avatar, name],
  );

  return (
    /* L'ATTRIBUT NE PORTE QUE CE QUI EST SERVI (#7083, D-6) — vide sur un
       refus ; `check-rich-text.mjs` y trouve toujours son point d'accroche.
       `relative` PORTE la pastille d'annonce, posée `absolute` au bas de son
       hôte, exactement comme sur « Découvrir ». */
    <div data-user-profile={person?.username ?? ''} className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <ProfileHeaderBar title={person === undefined ? translate(language, 'userProfile.title') : name} />
      <main id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-4 pb-safe">
        {person !== undefined ? (
          <div className="mx-auto grid w-full max-w-xl gap-6 pb-12 pt-2">
            {online ? null : <ProfileOfflineBanner language={language} />}
            <ProfileHero
              profile={person}
              name={name}
              accent={accent}
              presence={presence}
            />
            {relation.kind === 'blocked' ? (
              <ProfileBlockedCard language={language} name={name} online={online} busy={busy} onAction={onAction} />
            ) : (
              <>
                {/* LE JEU (#9481) — sur SA fiche, tout ; sur celle d'un autre, ce que SA visibilité autorise (la vitrine), rien sinon. */}
                {isSelf ? (
                  <GameProfileOwnSlot enabled={signedIn} />
                ) : signedIn ? (
                  <GameProfileVisitorSlot userId={person.id} name={name} enabled />
                ) : null}
                <ProfileTabs language={language} tabs={offered} active={tab} onChange={selectTab} idBase={tabBase} accent={accent} />
                <ProfileTabPanel idBase={tabBase} tab={tab}>
                  {tab === 'posts' ? (
                    <ProfilePostsPanel
                      language={language}
                      authorId={person.id}
                      stats={view.data?.stats ?? null}
                      online={online}
                      gestures={gestures}
                      announce={onPostsAnnounce}
                    />
                  ) : tab === 'conversations' ? (
                    <ProfileConversationsSection
                      language={language}
                      conversations={shared.data ?? []}
                      viewerId={rowViewerId}
                      loading={shared.isPending}
                      failed={shared.isError}
                      onRetry={() => void shared.refetch()}
                    />
                  ) : (
                    <>
                      {isSelf ? (
                        /* SA PROPRE FICHE MÈNE À SON ÉDITION (#7188) — miroir iOS
                           (`UserProfileSheet+DetailsTab.swift:23`) : pas de
                           geste relationnel sur soi, mais jamais un cul-de-sac. */
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
                      {isSelf || !signedIn ? null : (
                        <ProfileCall language={language} person={callPerson} online={online} onFailed={onCallFailed} />
                      )}
                      <ProfileStatsSection
                        language={language}
                        stats={view.data?.stats ?? null}
                        createdAt={person.createdAt}
                        loading={view.isFetching}
                      />
                    </>
                  )}
                </ProfileTabPanel>
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
      {/* L'ISSUE D'UN GESTE SE VOIT (revue #7083) — même composant, même loi
          que « Découvrir » (dimension 6). */}
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
