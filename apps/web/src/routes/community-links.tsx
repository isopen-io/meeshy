import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useStore } from 'zustand/react';

import { PullIndicator } from '@/components/pull-indicator';
import { communityLinksQueryOptions, communityLinkUrl, summarizeCommunityLinks, type CommunityLink } from '@/lib/api/community-links';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { useOnline } from '@/lib/net/online';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { COMMUNITY_TINT, CopyRowAction, FamilyDisc, FamilyEmpty, FamilyRow, FamilySection, FamilySkeleton, FamilyStats, SEPARATOR } from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice } from '@/routes/links-parts';

/**
 * **LES LIENS DE SES COMMUNAUTÉS** (#6410) — miroir `CommunityLinksView.swift` :
 * agrégats (communautés, publiques, membres), puis une ligne par communauté
 * qu'il administre ou modère — copier son adresse, ou ouvrir son détail.
 * Le « + » d'iOS ouvre la création d'une communauté : ici aussi.
 *
 * **Cache d'abord** : la liste est persistée et se revalide en fond.
 */

export const membersLabel = (language: InterfaceLanguage, count: number): string =>
  translateLinkFamilies(language, count === 1 ? 'linkFamilies.community.members.one' : 'linkFamilies.community.members.other', { count: new Intl.NumberFormat(language).format(count) });

export const roleLabel = (language: InterfaceLanguage, link: CommunityLink): string =>
  translateLinkFamilies(language, link.role === 'admin' ? 'linkFamilies.community.role.admin' : 'linkFamilies.community.role.moderator');

export const visibilityLabel = (language: InterfaceLanguage, link: CommunityLink): string =>
  translateLinkFamilies(language, link.isPrivate ? 'linkFamilies.community.private' : 'linkFamilies.community.public');

export function CommunityLinkRow({ language, link, copied, onCopy }: { readonly language: InterfaceLanguage; readonly link: CommunityLink; readonly copied: boolean; readonly onCopy: () => void }) {
  const facts = [...(link.memberCount === null ? [] : [membersLabel(language, link.memberCount)]), roleLabel(language, link), visibilityLabel(language, link)];
  const label = new Intl.ListFormat(language, { type: 'unit', style: 'short' }).format([link.name, ...facts]);
  return (
    <FamilyRow
      rowId={link.id}
      target={{ to: 'communityLink', params: { community: link.id } }}
      label={label}
      disc={<FamilyDisc tint={COMMUNITY_TINT} active glyph={<LinksGlyph name="usersThree" size={18} />} size={40} />}
      title={link.name}
      meta={facts.join(SEPARATOR)}
      actions={<CopyRowAction language={language} label={translate(language, 'links.share.copy')} tint={COMMUNITY_TINT} copied={copied} onCopy={onCopy} />}
    />
  );
}

export default function CommunityLinksScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useQuery({ ...communityLinksQueryOptions(apiDeps), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  const sharing = useUrlSharing(language);
  const frame = useRef<HTMLDivElement | null>(null);
  const { refetch } = list;
  const onRefresh = useCallback(() => refetch().then(() => undefined), [refetch]);
  const pull = usePullToRefresh({ root: frame, onRefresh, threshold: PULL_THRESHOLD });

  const links = list.data ?? null;
  const summary = links === null ? null : summarizeCommunityLinks(links);
  const body =
    links === null ? (
      <li>{list.isError ? <LinksLoadError language={language} onRetry={() => void list.refetch()} /> : <FamilySkeleton label={translate(language, 'links.share.loading')} rows={2} />}</li>
    ) : links.length === 0 ? (
      <li>
        <FamilyEmpty
          family="community"
          glyph={<LinksGlyph name="usersThree" size={48} />}
          title={translateLinkFamilies(language, 'linkFamilies.community.empty.title')}
          subtitle={translateLinkFamilies(language, 'linkFamilies.community.empty.subtitle')}
          cta={{ to: 'communityNew', label: translateLinkFamilies(language, 'linkFamilies.community.empty.create') }}
        />
      </li>
    ) : (
      links.map((link) => {
        const url = communityLinkUrl(sharing.origin, link.identifier);
        return <CommunityLinkRow key={link.id} language={language} link={link} copied={sharing.copiedId === link.id} onCopy={() => sharing.copy(link.id, url)} />;
      })
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader
        language={language}
        back="links"
        backLabel={translate(language, 'links.share.back')}
        title={translateLinkFamilies(language, 'links.hub.community.title')}
        createLabel={translateLinkFamilies(language, 'linkFamilies.community.empty.create')}
        createTo="communityNew"
      />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <div
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex-1 overflow-y-auto px-4 pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(links === null && !list.isError ? { 'aria-busy': true } : {})}
      >
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {summary === null || summary.communities === 0 ? null : (
            <FamilyStats
              language={language}
              tint={COMMUNITY_TINT}
              items={[
                {
                  stat: 'communities',
                  glyph: <LinksGlyph name="usersThree" size={18} />,
                  value: summary.communities,
                  label: translateLinkFamilies(language, 'linkFamilies.community.stats.communities'),
                },
                { stat: 'public', glyph: <LinksGlyph name="globe" size={18} />, value: summary.publicCommunities, label: translateLinkFamilies(language, 'linkFamilies.community.stats.public') },
                { stat: 'members', glyph: <LinksGlyph name="userCheck" size={18} />, value: summary.members, label: translateLinkFamilies(language, 'linkFamilies.community.stats.members') },
              ]}
            />
          )}
          <FamilySection id="community-links-title" title={translateLinkFamilies(language, 'linkFamilies.community.section')}>
            <ul data-community-links className="grid gap-2">
              {body}
            </ul>
          </FamilySection>
        </div>
      </div>
      <LinksAnnouncement text={sharing.announcer.text} />
    </main>
  );
}
