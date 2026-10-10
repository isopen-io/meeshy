import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { communityLinksQueryOptions, communityLinkUrl, findCommunityLink, type CommunityLink } from '@/lib/api/community-links';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { COMMUNITY_TINT, DetailActions, DetailHero, DetailSkeleton, FamilyRefused, FamilySection, InfoList, type InfoRow } from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice } from '@/routes/links-parts';
import { roleLabel, visibilityLabel } from '@/routes/community-links';
import { href, navigate } from '@/routes/route-table';

/**
 * **LE LIEN D'UNE COMMUNAUTÉ** (#6410) — miroir `CommunityLinkDetailView.swift` :
 * carte d'en-tête, barre d'actions (copier, partager, ouvrir la communauté),
 * puis les informations : identifiant, adresse, membres, rôle, visibilité.
 *
 * **La communauté se lit dans la liste de SES communautés administrées** :
 * une communauté dont il n'est que membre, ou celle d'un autre, rend le refus —
 * aucune lecture par identifiant n'est faite ici.
 */

export function communityInfoRows(language: InterfaceLanguage, link: CommunityLink, url: string): readonly InfoRow[] {
  return [
    { key: 'identifier', label: translate(language, 'links.detail.identifier'), value: link.identifier, ltr: true },
    { key: 'fullLink', label: translateLinkFamilies(language, 'linkFamilies.community.fullLink'), value: url, ltr: true },
    ...(link.memberCount === null ? [] : [{ key: 'members', label: translateLinkFamilies(language, 'linkFamilies.community.stats.members'), value: new Intl.NumberFormat(language).format(link.memberCount) }]),
    { key: 'role', label: translateLinkFamilies(language, 'linkFamilies.community.role'), value: roleLabel(language, link) },
    { key: 'visibility', label: translateLinkFamilies(language, 'linkFamilies.community.visibility'), value: visibilityLabel(language, link) },
    ...(link.createdAt === null
      ? []
      : [{ key: 'createdAt', label: translate(language, 'links.detail.createdAt'), value: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(link.createdAt)) }]),
  ];
}

export default function CommunityLinkScreen() {
  const { community } = useParams<'/links/communities/$community'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useQuery({ ...communityLinksQueryOptions(apiDeps), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  const sharing = useUrlSharing(language);
  const link = findCommunityLink(list.data, community);
  const title = link === undefined ? translateLinkFamilies(language, 'links.hub.community.title') : link.name;

  const content = (() => {
    if (link !== undefined) {
      const url = communityLinkUrl(sharing.origin, link.identifier);
      return (
        <>
          <DetailHero
            tint={COMMUNITY_TINT}
            active
            glyph={<LinksGlyph name="usersThree" size={28} />}
            title={link.name}
            address={url.replace(/^https?:\/\//u, '')}
            chips={[roleLabel(language, link), visibilityLabel(language, link)]}
            status={null}
          />
          <DetailActions
            actions={[
              {
                name: 'copy',
                label: translate(language, sharing.copiedId === link.id ? 'links.detail.copied' : 'links.detail.copy'),
                glyph: <LinksGlyph name="copy" size={20} />,
                tint: sharing.copiedId === link.id ? 'var(--color-success)' : COMMUNITY_TINT,
                onClick: () => sharing.copy(link.id, url),
              },
              { name: 'share', label: translate(language, 'links.detail.share'), glyph: <LinksGlyph name="export" size={20} />, tint: COMMUNITY_TINT, onClick: () => sharing.share(link.name, url) },
              {
                name: 'open',
                label: translateLinkFamilies(language, 'linkFamilies.community.open'),
                glyph: <LinksGlyph name="arrowSquareOut" size={20} />,
                tint: 'var(--ios-indigo-500)',
                onClick: () => navigate(href('community', { community: link.id })),
              },
            ]}
          />
          <FamilySection id="community-info-title" title={translate(language, 'links.detail.info')}>
            <InfoList rows={communityInfoRows(language, link, url)} />
          </FamilySection>
        </>
      );
    }
    if (list.data !== undefined) return <FamilyRefused language={language} back={{ to: 'communityLinks', label: translateLinkFamilies(language, 'linkFamilies.community.back') }} />;
    if (list.isError) return <LinksLoadError language={language} onRetry={() => void list.refetch()} />;
    return <DetailSkeleton label={translate(language, 'links.detail.loading')} />;
  })();

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <LinksHeader language={language} back="communityLinks" backLabel={translateLinkFamilies(language, 'linkFamilies.community.back')} title={title} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {content}
        </div>
      </main>
      <LinksAnnouncement text={sharing.announcer.text} />
    </div>
  );
}
