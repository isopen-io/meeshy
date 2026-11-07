import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ApiError } from '@/lib/api/client';
import {
  COMMUNITIES_QUERY_PREFIX,
  communityConversationsQueryOptions,
  communityQueryOptions,
  type CommunityPage,
} from '@/lib/api/communities';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { performJoinCommunity, performLeaveCommunity } from '@/lib/api/community-actions';
import { canInviteOf } from '@/lib/api/community-invite';
import { sessionStore } from '@/lib/api/session';
import { findCachedCommunity, membershipActionOf } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import {
  BackLink,
  COMMUNITIES_HEADER_HEIGHT,
  CommunitiesLoadError,
  CommunitiesOfflineNotice,
  CommunityConversationRow,
  CommunityConversationsEmpty,
  CommunityConversationsSection,
  CommunityDetailSkeleton,
  CommunityHero,
  CommunityRefused,
  CommunityRowsSkeleton,
  CommunityStats,
} from '@/routes/communities-parts';
import { CommunityInviteButton, CommunityInviteSheet } from '@/routes/community-invite';
import { CommunityMembersLink } from '@/routes/community-members-parts';
import { CommunityMembershipAction, type MembershipFailure } from '@/routes/community-membership';
import { href, navigate } from '@/routes/route-table';

/**
 * **UNE COMMUNAUTÉ** (#6364) — miroir `CommunityDetailView.swift` : bannière et
 * avatar qui la chevauche, nom, description, confidentialité, compteurs, puis
 * ses conversations — chacune ouvre son fil, comme `onSelectConversation`.
 *
 * **Cache d'abord.** Ouverte depuis la liste, elle se peint AVEC la carte déjà
 * reçue (`initialData`) et se revalide en fond ; ouverte juste après sa
 * création, le geste a déjà écrit son détail. Le squelette n'est dessiné que
 * par un lien direct sur un cache vide.
 *
 * **Rejoindre / Quitter** (#6378) se posent sous les compteurs, selon le rôle
 * que le détail SERT au lecteur (`membershipActionOf`), optimistes avec retour
 * arrière (`community-actions.ts`). Quitter, confirmé, ramène à la liste —
 * comme iOS ferme l'écran — où la carte a déjà disparu.
 *
 * **« Membres »** (#6375) mène à la liste servie (`community-members.tsx`).
 *
 * **« Inviter »** (#6376) ouvre la feuille d'invitation (`community-invite.tsx`)
 * pour qui la passerelle l'accepte (`canInviteOf`) : un membre d'une
 * communauté publique, un administrateur ou un modérateur d'une privée.
 *
 * **Ce que l'écran ne montre pas, parce que le web ne le sert pas encore** —
 * loi 4, un contrôle n'existe que s'il a un effet : Réglages, l'onglet
 * Publications — #6377, #6379 (D-60). Le
 * cœur « Réagir à la communauté » d'iOS n'a aucun effet, là-bas non plus.
 *
 * 403 et 404 rendent le MÊME refus (D-6) : un identifiant ne dit pas si une
 * communauté privée existe.
 */

const ROW_SEPARATOR = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

export default function CommunityScreen() {
  const { community: communityId } = useParams<'/communities/$community'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const [membershipPending, setMembershipPending] = useState(false);
  const [membershipFailure, setMembershipFailure] = useState<MembershipFailure | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const enabled = apiDeps.source === 'fixtures' || signedIn;

  const detail = useQuery(
    {
      ...communityQueryOptions(apiDeps, communityId),
      enabled,
      staleTime: 0,
      initialData: () =>
        findCachedCommunity(
          appQueryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: [...COMMUNITIES_QUERY_PREFIX, 'list'] }).map(([, data]) => data),
          communityId,
        ),
    },
    appQueryClient,
  );
  const community = detail.data;

  const conversations = useInfiniteQuery(
    { ...communityConversationsQueryOptions(apiDeps, community?.id ?? communityId), enabled: enabled && community !== undefined },
    appQueryClient,
  );

  const scroller = useRef<HTMLElement | null>(null);
  const rows = conversations.data?.pages.flatMap((page) => page.conversations) ?? null;
  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 240px 0px',
    enabled: conversations.hasNextPage && !conversations.isFetchingNextPage && !conversations.isFetchNextPageError,
    onReach: () => void conversations.fetchNextPage(),
  });

  const actionDeps = { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine };
  const changeMembership = async (gesture: 'join' | 'leave') => {
    if (community === undefined || membershipPending) return;
    setMembershipPending(true);
    setMembershipFailure(null);
    if (gesture === 'join') {
      const outcome = await performJoinCommunity({ community, deps: actionDeps });
      setMembershipPending(false);
      if (outcome.status !== 'joined') setMembershipFailure(outcome.status === 'refused' ? 'refused' : outcome.status === 'offline' ? 'offline' : 'join');
      return;
    }
    const outcome = await performLeaveCommunity({ community, deps: actionDeps });
    setMembershipPending(false);
    if (outcome.status === 'left') {
      navigate(href('communities'), true);
      return;
    }
    setMembershipFailure(outcome.status === 'offline' ? 'offline' : 'leave');
  };

  const refused = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404);

  const conversationBody =
    rows === null ? (
      conversations.isError ? (
        <CommunitiesLoadError language={language} title="community.detail.error.title" onRetry={() => void conversations.refetch()} />
      ) : (
        <CommunityRowsSkeleton />
      )
    ) : rows.length === 0 ? (
      <CommunityConversationsEmpty language={language} />
    ) : (
      <ul>
        {rows.map((conversation, index) => (
          <li key={conversation.id} style={index === 0 ? undefined : { borderTop: ROW_SEPARATOR }}>
            <CommunityConversationRow language={language} conversation={conversation} />
          </li>
        ))}
        {conversations.hasNextPage ? <li ref={sentinel.observe} aria-hidden="true" style={{ height: 1 }} /> : null}
      </ul>
    );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <main id="contenu" ref={scroller} className="flex-1 overflow-y-auto pb-safe">
        {community === undefined ? (
          <div
            className="mx-auto grid max-w-xl gap-4 px-4 pb-24"
            style={{ paddingTop: `calc(env(safe-area-inset-top) + ${COMMUNITIES_HEADER_HEIGHT}px)` }}
          >
            {online ? null : <CommunitiesOfflineNotice language={language} />}
            {refused ? (
              <CommunityRefused language={language} />
            ) : detail.isError ? (
              <CommunitiesLoadError language={language} title="community.detail.error.title" onRetry={() => void detail.refetch()} />
            ) : (
              <CommunityDetailSkeleton language={language} />
            )}
          </div>
        ) : (
          <>
            <CommunityHero language={language} community={community} />
            <div className="mx-auto grid max-w-xl gap-5 px-4 pb-24 pt-5">
              {online ? null : <CommunitiesOfflineNotice language={language} />}
              <CommunityStats language={language} community={community} />
              <CommunityMembersLink language={language} communityId={community.id} />
              {canInviteOf(community) ? <CommunityInviteButton language={language} onOpen={() => setInviting(true)} /> : null}
              {inviteStatus === null ? null : (
                <p role="status" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-community-invite-status>
                  {inviteStatus}
                </p>
              )}
              <CommunityMembershipAction
                language={language}
                action={membershipActionOf(community, viewerId)}
                pending={membershipPending}
                online={online}
                failure={membershipFailure}
                onJoin={() => void changeMembership('join')}
                onLeave={() => void changeMembership('leave')}
              />
              <CommunityConversationsSection language={language}>{conversationBody}</CommunityConversationsSection>
            </div>
          </>
        )}
      </main>
      {inviting && community !== undefined ? (
        <CommunityInviteSheet
          community={community}
          viewerId={viewerId}
          deps={actionDeps}
          language={language}
          onClose={() => setInviting(false)}
          onDone={setInviteStatus}
        />
      ) : null}
      <div className="absolute start-0 top-0 px-2 pt-safe">
        <div className="pt-2.5">
          <BackLink to="communities" label={translate(language, 'community.detail.back')} overMedia={community !== undefined} />
        </div>
      </div>
    </div>
  );
}
