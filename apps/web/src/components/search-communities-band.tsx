import { useInfiniteQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { communitiesQueryOptions, type CommunitySummary } from '@/lib/api/communities';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { communityAccent } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { bannerBackground } from '@/routes/communities-parts';
import { Link } from '@/routes/route-table';

/**
 * **LA BANDE DES COMMUNAUTÉS DE LA RECHERCHE** (#10924) — miroir
 * `ConversationSearchCommunitiesBand` (iOS) : au focus de « Rechercher… », la
 * liste montre SES communautés en petites cartes (130 × 110 ÷ 2, #10841), avec
 * « Voir tout ». Sans communauté, RIEN : un titre au-dessus d'une bande vide
 * est le défaut que le porteur a capturé. Les filtres de liste n'y figurent
 * pas — ils vivent en tête de liste, en continu.
 */

const CARD_WIDTH = 65;
const CARD_HEIGHT = 55;
const CARD_SCRIM = 'linear-gradient(to bottom, transparent 20%, var(--color-scrim-strong))';

export function drawsSearchCommunities(communities: readonly CommunitySummary[] | null): communities is readonly CommunitySummary[] {
  return communities !== null && communities.length > 0;
}

type StripProps = {
  readonly language: InterfaceLanguage;
  readonly communities: readonly CommunitySummary[] | null;
  readonly className?: string;
};

export function SearchCommunitiesStrip({ language, communities, className = '' }: StripProps) {
  if (!drawsSearchCommunities(communities)) return null;
  return (
    <section
      data-search-communities
      aria-label={translate(language, 'list.search.communities')}
      className={`grid gap-2 py-2 ${className}`}
      style={{ borderRadius: 22 }}
      onPointerDown={(event) => event.preventDefault()}
    >
      <header className="flex items-center justify-between px-4">
        <h2 className="text-body font-bold">{translate(language, 'list.search.communities')}</h2>
        <Link
          to="communities"
          aria-label={translate(language, 'list.search.communities.all.label')}
          className="grid min-h-11 place-items-center px-2 text-secondary font-semibold"
          style={{ color: 'var(--color-brand)' }}
        >
          {translate(language, 'list.search.communities.all')}
        </Link>
      </header>
      <ul className="scrollbar-none flex gap-2 overflow-x-auto px-4">
        {communities.map((community) => (
          <li key={community.id} className="shrink-0">
            <Link
              to="community"
              params={{ community: community.id }}
              data-search-community={community.id}
              className="relative block overflow-hidden rounded-lg"
              style={{ width: CARD_WIDTH, height: CARD_HEIGHT, background: bannerBackground(communityAccent(community.name)) }}
            >
              {community.banner === null ? null : (
                <img src={attachmentSrc(community.banner)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
              )}
              <span aria-hidden="true" className="absolute inset-0" style={{ background: CARD_SCRIM }} />
              <span className="absolute inset-x-0 bottom-0 line-clamp-2 p-1.5 text-[11px] leading-tight font-bold" style={{ color: 'var(--color-on-media)' }}>
                {community.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** La bande branchée : SES communautés (`GET /communities`), depuis le cache
 * persisté d'abord — le même que l'écran « Communautés ». */
export function SearchCommunitiesBand({ language, className }: { readonly language: InterfaceLanguage; readonly className?: string }) {
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useInfiniteQuery({ ...communitiesQueryOptions(apiDeps, ''), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  return <SearchCommunitiesStrip language={language} communities={list.data?.pages[0]?.communities ?? null} {...(className === undefined ? {} : { className })} />;
}
