'use client';

import { memo, useState, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, ShieldAlert, UserMinus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCommunityMembersQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@/hooks/queries';
import type { CommunityMember, CommunityRole } from '@meeshy/shared/types';
import { toast } from 'sonner';

interface CommunityMembersPanelProps {
  communityId: string;
  currentUserId: string;
  currentUserRole: 'admin' | 'moderator' | 'member';
  t: (key: string) => string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  moderator: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  member: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300',
};

export const CommunityMembersPanel = memo(function CommunityMembersPanel({
  communityId,
  currentUserId,
  currentUserRole,
  t,
}: CommunityMembersPanelProps) {
  const { data: members = [], isLoading } = useCommunityMembersQuery(communityId);
  const removeMutation = useRemoveMemberMutation();
  const updateRoleMutation = useUpdateMemberRoleMutation();

  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = currentUserRole === 'admin';

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.toLowerCase();
    return members.filter((m) => {
      const name = m.user?.displayName ?? m.user?.username ?? '';
      return name.toLowerCase().includes(query);
    });
  }, [members, searchQuery]);

  const handleRemoveMember = async (member: CommunityMember) => {
    if (member.userId === currentUserId) return;
    try {
      await removeMutation.mutateAsync({ communityId, memberId: member.id });
      toast.success(t('members.removed'));
    } catch {
      toast.error(t('members.removeError'));
    }
  };

  const handleRoleChange = async (member: CommunityMember, newRole: CommunityRole) => {
    try {
      await updateRoleMutation.mutateAsync({
        communityId,
        memberId: member.id,
        data: { role: newRole },
      });
      toast.success(t('members.roleUpdated'));
    } catch {
      toast.error(t('members.roleUpdateError'));
    }
  };

  return (
    <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">{t('members.title')}</h3>
          <Badge variant="secondary" className="text-xs">
            {members.length}
          </Badge>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('members.searchPlaceholder')}
          className="w-full h-9 pl-9 pr-3 text-sm border border-border/30 rounded-lg bg-background/50 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredMembers.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">{t('members.empty')}</p>
      ) : (
        <div className="space-y-1">
          {filteredMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.userId === currentUserId}
              isAdmin={isAdmin}
              onRemove={handleRemoveMember}
              onRoleChange={handleRoleChange}
              isRemoving={removeMutation.isPending}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
});

interface MemberRowProps {
  member: CommunityMember;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onRemove: (member: CommunityMember) => void;
  onRoleChange: (member: CommunityMember, role: CommunityRole) => void;
  isRemoving: boolean;
  t: (key: string) => string;
}

const MemberRow = memo(function MemberRow({
  member,
  isCurrentUser,
  isAdmin,
  onRemove,
  isRemoving,
  t,
}: MemberRowProps) {
  const displayName = member.user?.displayName ?? member.user?.username ?? 'Unknown';
  const username = member.user?.username ?? '';
  const roleStr = String(member.role);

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition-colors',
        'hover:bg-accent/30 dark:hover:bg-accent/20'
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={member.user?.avatar ?? undefined} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
          {displayName.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">{displayName}</span>
          {isCurrentUser && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {t('members.you')}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">@{username}</span>
      </div>

      <Badge className={cn('text-xs capitalize', ROLE_COLORS[roleStr] ?? ROLE_COLORS.member)}>
        {roleStr === 'admin' && <Shield className="h-3 w-3 mr-1" />}
        {roleStr === 'moderator' && <ShieldAlert className="h-3 w-3 mr-1" />}
        {roleStr}
      </Badge>

      {isAdmin && !isCurrentUser && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(member)}
          disabled={isRemoving}
          aria-label={t('members.removeAction')}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
});
