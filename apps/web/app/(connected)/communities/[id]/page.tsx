'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Badge, useToast, PageHeader } from '@/components/v2';
import {
  useCommunityQuery,
  useCommunityConversationsQuery,
  useCommunityMembersQuery,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
} from '@/hooks/queries';
import { CommunityPreferencesMenu } from '@/components/groups/CommunityPreferencesMenu';
import { useI18n } from '@/hooks/useI18n';
import type { CommunityMember } from '@meeshy/shared/types';

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const { t, locale } = useI18n('groups');
  const { t: tCommon } = useI18n('common');
  const communityId = params.id as string;

  const { data: community, isLoading: isLoadingCommunity } = useCommunityQuery(communityId);
  const { data: conversations = [] } = useCommunityConversationsQuery(communityId);
  const { data: members = [] } = useCommunityMembersQuery(communityId);

  const joinMutation = useJoinCommunityMutation();
  const leaveMutation = useLeaveCommunityMutation();

  const isMember = members.length > 0;
  const memberCount = community?._count?.members ?? members.length;

  const handleToggleJoin = async () => {
    if (!community) return;
    try {
      if (isMember) {
        await leaveMutation.mutateAsync(community.id);
        addToast(t('community.leftToast', { name: community.name }), 'info');
      } else {
        await joinMutation.mutateAsync(community.id);
        addToast(t('community.joinedToast', { name: community.name }), 'success');
      }
    } catch {
      addToast(t('community.actionError'), 'error');
    }
  };

  if (isLoadingCommunity) {
    return (
      <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
        <PageHeader
          title=""
          actionButtons={
            <Button variant="ghost" size="sm" onClick={() => router.push('/communities')}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {tCommon('back')}
            </Button>
          }
        />
        <main className="max-w-2xl mx-auto px-6 py-8">
          <Card variant="default" hover={false} className="p-6 animate-pulse">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--gp-border-subtle)]" />
              <div className="flex-1 space-y-3">
                <div className="h-6 w-48 bg-[var(--gp-border-subtle)] rounded" />
                <div className="h-4 w-32 bg-[var(--gp-border-subtle)] rounded" />
              </div>
            </div>
            <div className="h-20 w-full bg-[var(--gp-border-subtle)] rounded" />
          </Card>
        </main>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--gp-background)]">
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--gp-text-primary)] mb-2">{t('community.notFound')}</p>
          <Button variant="outline" onClick={() => router.push('/communities')}>
            {t('community.backToCommunities')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title={community.name}
        actionButtons={
          <Button variant="ghost" size="sm" onClick={() => router.push('/communities')}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {tCommon('back')}
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Community Header */}
        <Card variant="default" hover={false} className="p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-[var(--gp-text-primary)]"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--gp-terracotta) 30%, transparent), color-mix(in srgb, var(--gp-deep-teal) 30%, transparent))' }}
            >
              {community.name[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-[var(--gp-text-primary)]">{community.name}</h1>
                {isMember && <Badge variant="teal" size="sm">{t('member')}</Badge>}
                {community.isPrivate && <Badge variant="default" size="sm">{t('visibility.private')}</Badge>}
              </div>
              {community.identifier && (
                <p className="text-xs text-[var(--gp-text-muted)] font-mono">
                  {community.identifier.replace(/^mshy_/, '')}
                </p>
              )}
            </div>
          </div>

          {community.description && (
            <p className="text-[var(--gp-text-secondary)] mb-4">{community.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-[var(--gp-text-muted)]">{t('community.membersCount', { count: memberCount.toLocaleString() })}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm text-[var(--gp-text-muted)]">{t('community.conversationsCount', { count: conversations.length })}</span>
            </div>
            {community.createdAt && (
              <span className="text-sm text-[var(--gp-text-muted)]">
                {t('details.createdOn')} {new Date(community.createdAt).toLocaleDateString(locale)}
              </span>
            )}
          </div>

          <Button
            variant={isMember ? 'ghost' : 'primary'}
            className="w-full"
            onClick={handleToggleJoin}
            disabled={joinMutation.isPending || leaveMutation.isPending}
          >
            {isMember ? t('community.leave') : t('community.join')}
          </Button>
        </Card>

        {/* Preferences (only for members) */}
        {isMember && (
          <Card variant="default" hover={false} className="p-4 mb-6">
            <h3 className="text-xs font-semibold uppercase text-[var(--gp-text-muted)] mb-3">{t('preferences.title')}</h3>
            <CommunityPreferencesMenu communityId={community.id} t={t} />
          </Card>
        )}

        {/* Members */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase mb-4 px-1 text-[var(--gp-text-muted)]">
            {t('community.membersTitle')} ({members.length})
          </h2>
          {members.length === 0 ? (
            <Card variant="default" hover={false} className="p-8 text-center">
              <p className="text-[var(--gp-text-muted)]">{t('community.noMembers')}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {members.slice(0, 20).map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
              {members.length > 20 && (
                <p className="text-center text-sm text-[var(--gp-text-muted)] py-2">
                  {t('community.moreMembers', { count: members.length - 20 })}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Conversations */}
        <section>
          <h2 className="text-sm font-semibold uppercase mb-4 px-1 text-[var(--gp-text-muted)]">
            {t('community.conversationsTitle')} ({conversations.length})
          </h2>
          {conversations.length === 0 ? (
            <Card variant="default" hover={false} className="p-8 text-center">
              <p className="text-[var(--gp-text-muted)]">{t('community.noConversations')}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <Card
                  key={conv.id}
                  variant="default"
                  hover
                  className="p-3 cursor-pointer"
                  onClick={() => router.push(`/conversations/${conv.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--gp-parchment)] flex items-center justify-center text-sm">
                      #
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[var(--gp-text-primary)] truncate">
                        {conv.title ?? t('community.untitled')}
                      </h4>
                      <p className="text-xs text-[var(--gp-text-muted)]">{conv.type}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function MemberCard({ member }: { member: CommunityMember }) {
  const { t } = useI18n('groups');
  const displayName = member.user?.displayName ?? member.user?.username ?? t('community.unknownMember');
  const roleStr = String(member.role);

  return (
    <Card variant="default" hover={false} className="p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--gp-parchment)] flex items-center justify-center text-sm font-semibold text-[var(--gp-text-primary)]">
          {displayName.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-[var(--gp-text-primary)] truncate block">{displayName}</span>
          {member.user?.username && (
            <span className="text-xs text-[var(--gp-text-muted)]">@{member.user.username}</span>
          )}
        </div>
        <Badge variant={roleStr === 'admin' ? 'teal' : 'default'} size="sm">
          {roleStr}
        </Badge>
      </div>
    </Card>
  );
}
