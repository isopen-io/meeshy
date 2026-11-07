import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from '@/components/chrome-action';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Glyph } from '@/components/glyph';
import { ApiError } from '@/lib/api/client';
import { COMMUNITIES_QUERY_PREFIX, communityQueryOptions, type CommunityPage } from '@/lib/api/communities';
import { performChangeMemberRole, performRemoveMember, type MemberGestureOutcome } from '@/lib/api/community-member-actions';
import { communityMembersQueryOptions, memberGesturesOf, memberSectionsOf, type CommunityMember, type CommunityMemberRole } from '@/lib/api/community-members';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { findCachedCommunity } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import { translateMembership } from '@/lib/i18n-community-membership-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { COMMUNITIES_HEADER_HEIGHT, CommunitiesOfflineNotice, CommunityRefused } from '@/routes/communities-parts';
import { MemberRow, MemberSection, MembersEmpty, MembersLoadError, MembersSkeleton } from '@/routes/community-members-parts';
import { Link } from '@/routes/route-table';

/**
 * **LES MEMBRES D'UNE COMMUNAUTÉ** (#6375) — miroir `Route.communityMembers`
 * (`CommunityMembersView` → `CommunityMembersScreen`, iOS) : les membres
 * ACTIFS, rangés par rôle, paginés au défilement ; un administrateur change le
 * rôle d'un membre ou le retire.
 *
 * **Cache d'abord.** La fiche vient du cache (le détail ou la liste qui y a
 * mené) et le titre se peint aussitôt ; la liste se lit de son propre cache
 * persisté, revalidée en fond. Le squelette n'apparaît que sur un cache vide.
 *
 * **Ce que le lecteur peut faire se lit dans ce que la passerelle SERT** : son
 * rôle (`currentUserRole` du détail, #6378), jamais une ligne qu'il aurait
 * trouvée dans la page chargée (iOS le déduisait ainsi, et un administrateur
 * arrivé en 31e position perdait son menu). Les gestes sont optimistes, avec
 * retour arrière (`community-member-actions.ts`) ; le retrait est confirmé.
 *
 * 403 et 404 rendent le MÊME refus que le détail (D-6).
 */

const ERROR_INK = 'var(--color-error)';

const FAILURE_KEY = {
  refused: 'community.members.refused',
  offline: 'community.membership.offline',
  error: 'community.membership.error',
} as const;

type GestureFailure = keyof typeof FAILURE_KEY;

const failureOf = (outcome: MemberGestureOutcome): GestureFailure | null =>
  outcome.status === 'refused' || outcome.status === 'offline' || outcome.status === 'error' ? outcome.status : null;

export default function CommunityMembersScreen() {
  const { community: communityId } = useParams<'/communities/$community/members'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<GestureFailure | null>(null);
  const [removing, setRemoving] = useState<CommunityMember | null>(null);

  const detail = useQuery(
    {
      ...communityQueryOptions(apiDeps, communityId),
      enabled,
      initialData: () =>
        findCachedCommunity(
          appQueryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: [...COMMUNITIES_QUERY_PREFIX, 'list'] }).map(([, data]) => data),
          communityId,
        ),
    },
    appQueryClient,
  );
  const community = detail.data;

  const members = useInfiniteQuery(
    { ...communityMembersQueryOptions(apiDeps, community?.id ?? communityId), enabled: enabled && community !== undefined },
    appQueryClient,
  );

  const scroller = useRef<HTMLElement | null>(null);
  const rows = members.data?.pages.flatMap((page) => page.members) ?? null;
  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 240px 0px',
    enabled: members.hasNextPage && !members.isFetchingNextPage && !members.isFetchNextPageError,
    onReach: () => void members.fetchNextPage(),
  });

  const actionDeps = { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine };

  const settle = (outcome: MemberGestureOutcome) => {
    setPending(null);
    setFailure(failureOf(outcome));
    if (failureOf(outcome) === null) setExpanded(null);
  };

  const changeRole = async (member: CommunityMember, role: CommunityMemberRole) => {
    if (community === undefined || pending !== null) return;
    setPending(member.id);
    setFailure(null);
    settle(await performChangeMemberRole({ community, member, role, deps: actionDeps }));
  };

  const remove = async (member: CommunityMember) => {
    if (community === undefined || pending !== null) return;
    setRemoving(null);
    setPending(member.id);
    setFailure(null);
    settle(await performRemoveMember({ community, member, deps: actionDeps }));
  };

  const refused =
    (detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404)) ||
    (members.error instanceof ApiError && (members.error.status === 403 || members.error.status === 404));

  const body =
    rows === null ? (
      members.isError || (community === undefined && detail.isError) ? (
        <MembersLoadError language={language} onRetry={() => void (community === undefined ? detail.refetch() : members.refetch())} />
      ) : (
        <MembersSkeleton language={language} />
      )
    ) : rows.length === 0 ? (
      <MembersEmpty language={language} />
    ) : (
      <div className="grid gap-5">
        {memberSectionsOf(rows).map((section) => (
          <MemberSection key={section.role} language={language} role={section.role} count={section.members.length}>
            {section.members.map((member, index) => (
              <MemberRow
                key={member.id}
                language={language}
                member={member}
                first={index === 0}
                isViewer={member.userId === viewerId}
                gestures={memberGesturesOf({ member, viewerRole: community?.viewerRole, viewerId, createdBy: community?.createdBy ?? null })}
                expanded={expanded === member.id}
                pending={pending === member.id || !online}
                onToggle={() => setExpanded((open) => (open === member.id ? null : member.id))}
                onRole={(role) => void changeRole(member, role)}
                onRemove={() => setRemoving(member)}
              />
            ))}
          </MemberSection>
        ))}
        {members.hasNextPage ? <div ref={sentinel.observe} aria-hidden="true" style={{ height: 1 }} /> : null}
      </div>
    );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 px-2 pt-safe">
        <div className="flex items-center gap-2" style={{ height: COMMUNITIES_HEADER_HEIGHT }}>
          <Link
            to="community"
            params={{ community: communityId }}
            aria-label={translate(language, 'community.detail.back')}
            data-community-members-back
            className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
            style={{ color: 'var(--color-ios-brand)' }}
          >
            <ChromeActionDisc>
              <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
            </ChromeActionDisc>
          </Link>
          <h1 className="grid min-w-0 text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            <span>{translateMembership(language, 'community.members.title')}</span>
            {community === undefined ? null : (
              <span className="truncate text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
                {community.name}
              </span>
            )}
          </h1>
        </div>
      </header>
      <main id="contenu" ref={scroller} className="flex-1 overflow-y-auto pb-safe">
        <div className="mx-auto grid max-w-xl gap-4 px-4 pb-24 pt-2">
          {online ? null : <CommunitiesOfflineNotice language={language} />}
          {failure === null ? null : (
            <p
              role={failure === 'offline' ? 'status' : 'alert'}
              data-community-members-failure={failure}
              className="text-center text-caption"
              style={{ color: failure === 'offline' ? undefined : ERROR_INK }}
            >
              {translateMembership(language, FAILURE_KEY[failure])}
            </p>
          )}
          {refused ? <CommunityRefused language={language} /> : body}
        </div>
      </main>
      {removing === null ? null : (
        <ConfirmDialog
          name="community-member-remove"
          title={translateMembership(language, 'community.members.remove.confirm.title', { name: removing.name })}
          body={translateMembership(language, 'community.members.remove.confirm.body', { name: removing.name })}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={translateMembership(language, 'community.members.remove.confirm.action')}
          tone="destructive"
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      )}
    </div>
  );
}
