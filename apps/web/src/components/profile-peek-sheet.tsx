import { useCallback } from 'react';

import { LiveAnnouncement } from '@/components/live-announcement';
import { ReportSheet } from '@/components/report-sheet';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { profileFailureOf } from '@/lib/profile/failure';
import { Link, href, navigate } from '@/routes/route-table';
import { useProfileController } from '@/routes/user-profile-controller';
import { ProfileHero } from '@/routes/user-profile-header';
import { ProfileBlockedCard, ProfileRelationSection, ProfileSelfSection, ProfileStatsSection } from '@/routes/user-profile-sections';
import { ProfileFailureNotice, ProfileOfflineBanner, ProfileSkeleton } from '@/routes/user-profile-states';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { Sheet } from './sheet';

/**
 * **LE PROFIL, PAR-DESSUS L'ÉCRAN OÙ L'ON EST** — miroir de
 * `UserProfileSheet` (`packages/MeeshySDK/Sources/MeeshyUI/Profile/`), que
 * iOS présente dès qu'on touche l'avatar ou le nom d'un auteur : dans un fil,
 * une story, un commentaire, une publication. On y lit QUI est la personne et
 * on y agit (Écrire, Ajouter, Accepter, Bloquer, Signaler) sans quitter ce
 * qu'on lisait ; « Ouvrir le profil complet » mène à `/u/$username`, où
 * vivent ses publications et les conversations en commun.
 *
 * L'identité et les gestes sont ceux de la page, par le MÊME contrôleur
 * (`useProfileController`) — jamais une seconde mécanique.
 */
export function ProfilePeekSheet({ username, onClose }: { readonly username: string; readonly onClose: () => void }) {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const profile = useProfileController(username, language);
  const { view, person, name, accent, relation, actions, signedIn, busy, onAction } = profile;
  const onSignIn = useCallback(() => navigate(href('login')), []);

  return (
    <Sheet title={person === undefined ? translate(language, 'userProfile.title') : name} bodyAs="div" onClose={onClose}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div data-profile-peek={person?.username ?? ''} className="min-h-0 flex-1 overflow-y-auto px-4">
          {person !== undefined ? (
            <div className="mx-auto grid w-full max-w-xl gap-6 pb-12 pt-2">
              {online ? null : <ProfileOfflineBanner language={language} />}
              <ProfileHero profile={person} name={name} accent={accent} />
              {relation.kind === 'blocked' ? (
                <ProfileBlockedCard language={language} name={name} online={online} busy={busy} onAction={onAction} />
              ) : view.data?.isSelf === true ? (
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
              {relation.kind === 'blocked' ? null : (
                <ProfileStatsSection language={language} stats={view.data?.stats ?? null} createdAt={person.createdAt} loading={view.isFetching} />
              )}
              <Link
                to="userProfile"
                params={{ username: person.username }}
                data-profile-peek-open-page
                className="flex items-center justify-center gap-2 rounded-[14px] px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  minHeight: 44,
                  backgroundColor: 'var(--color-ios-card)',
                  color: 'var(--color-ios-brand)',
                  outlineColor: 'var(--color-ios-brand)',
                }}
              >
                {translate(language, 'userProfile.peek.openPage')}
                <GlyphSvg glyph={FEED_GLYPHS.caretRight} size={16} />
              </Link>
            </div>
          ) : view.isError ? (
            <ProfileFailureNotice language={language} failure={profileFailureOf(view.error, online)} onRetry={() => void view.refetch()} />
          ) : (
            <div className="mx-auto w-full max-w-xl pt-2">
              <ProfileSkeleton language={language} />
            </div>
          )}
        </div>
        <LiveAnnouncement text={profile.announcement} tone={profile.announcementTone} marker="profilePeek" />
      </div>
      {profile.reporting && person !== undefined ? <ReportSheet name={name} busy={busy} onPick={profile.onPickReason} onClose={profile.closeReport} /> : null}
    </Sheet>
  );
}
