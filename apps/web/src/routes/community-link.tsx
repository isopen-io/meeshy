import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { performSetCommunityJoinLinkPaused, type CommunityJoinLinkDeps } from '@/lib/api/community-join-link';
import { communityLinksQueryOptions, communityLinkUrl, findCommunityLink, type CommunityLink } from '@/lib/api/community-links';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { LinkFamilyOutcome } from '@/lib/api/link-family-actions';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { COMMUNITY_TINT, DetailActions, DetailHero, DetailSkeleton, FamilyRefused, FamilySection, InfoList, type DetailAction, type InfoRow } from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice, statusLabel } from '@/routes/links-parts';
import { useTapGate } from '@/lib/view/tap-gate';
import { roleLabel, visibilityLabel } from '@/routes/community-links';
import { href, navigate } from '@/routes/route-table';

/**
 * **LE LIEN D'UNE COMMUNAUTÉ** (#6410) — miroir `CommunityLinkDetailView.swift` :
 * carte d'en-tête, barre d'actions (copier, partager, ouvrir la communauté),
 * puis les informations que l'en-tête ne porte pas déjà : membres, création.
 *
 * **Le lien d'entrée se met en pause** (#20255, passerelle #19661) : quand la
 * liste sert `joinLinkPaused`, l'en-tête dit « Actif » ou « Inactif » et la
 * barre porte la bascule, optimiste avec retour arrière — même geste que la
 * fiche d'un lien de suivi. Seules les arrivées PAR LE LIEN s'arrêtent ; la
 * communauté et ses membres n'en dépendent pas. Une passerelle qui ne sert pas
 * l'état n'offre aucune bascule (rien n'est inventé).
 *
 * **La communauté se lit dans la liste de SES communautés administrées** :
 * une communauté dont il n'est que membre, ou celle d'un autre, rend le refus —
 * aucune lecture par identifiant n'est faite ici.
 */

export function communityInfoRows(language: InterfaceLanguage, link: CommunityLink): readonly InfoRow[] {
  return [
    ...(link.memberCount === null ? [] : [{ key: 'members', label: translateLinkFamilies(language, 'linkFamilies.community.stats.members'), value: new Intl.NumberFormat(language).format(link.memberCount) }]),
    ...(link.createdAt === null
      ? []
      : [{ key: 'createdAt', label: translate(language, 'links.detail.createdAt'), value: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(link.createdAt)) }]),
  ];
}

const TOGGLE_FAILURE: Readonly<Record<Exclude<LinkFamilyOutcome, 'done' | 'busy'>, InterfaceCatalogKey>> = {
  offline: 'links.announce.offline',
  failed: 'links.announce.toggleFailed',
};

export function joinLinkToggleAction(language: InterfaceLanguage, link: CommunityLink, onToggle: () => void): readonly DetailAction[] {
  if (link.joinLinkPaused === null) return [];
  const active = !link.joinLinkPaused;
  return [
    {
      name: 'toggle',
      label: translate(language, active ? 'links.detail.disable' : 'links.detail.activate'),
      glyph: <LinksGlyph name={active ? 'pauseCircle' : 'playCircle'} size={20} />,
      tint: active ? 'var(--color-warning)' : 'var(--color-success)',
      onClick: onToggle,
    },
  ];
}

export default function CommunityLinkScreen() {
  const { community } = useParams<'/links/communities/$community'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useQuery({ ...communityLinksQueryOptions(apiDeps), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  const sharing = useUrlSharing(language);
  const { announce } = sharing.announcer;
  const link = findCommunityLink(list.data, community);
  const deps: CommunityJoinLinkDeps = useMemo(() => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine }), []);
  const admitTap = useTapGate();
  const toggle = useCallback(
    (current: CommunityLink) => {
      if (!admitTap() || current.joinLinkPaused === null) return;
      const paused = !current.joinLinkPaused;
      void performSetCommunityJoinLinkPaused({ link: current, paused, deps }).then((outcome) => {
        if (outcome === 'busy') return;
        announce(translate(language, outcome === 'done' ? (paused ? 'links.announce.disabled' : 'links.announce.activated') : TOGGLE_FAILURE[outcome]));
      });
    },
    [admitTap, announce, deps, language],
  );
  const title = link === undefined ? translateLinkFamilies(language, 'links.hub.community.title') : link.name;

  const content = (() => {
    if (link !== undefined) {
      const url = communityLinkUrl(sharing.origin, link.identifier);
      const infoRows = communityInfoRows(language, link);
      return (
        <>
          <DetailHero
            tint={COMMUNITY_TINT}
            active={link.joinLinkPaused !== true}
            glyph={<LinksGlyph name="usersThree" size={28} />}
            title={link.name}
            address={url.replace(/^https?:\/\//u, '')}
            chips={[roleLabel(language, link), visibilityLabel(language, link)]}
            status={link.joinLinkPaused === null ? null : statusLabel(language, !link.joinLinkPaused)}
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
              ...joinLinkToggleAction(language, link, () => toggle(link)),
            ]}
          />
          {infoRows.length === 0 ? null : (
            <FamilySection id="community-info-title" title={translate(language, 'links.detail.info')}>
              <InfoList rows={infoRows} />
            </FamilySection>
          )}
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
