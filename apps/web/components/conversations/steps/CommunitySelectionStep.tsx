'use client';

import React, { memo, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Building2, Globe, Lock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface Community {
  id: string;
  name: string;
  description?: string;
  identifier?: string;
  isPrivate: boolean;
  members: Array<{
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  }>;
  _count: {
    members: number;
    Conversation: number;
  };
}

interface CommunitySelectionStepProps {
  showCommunitySection: boolean;
  onToggleSection: (show: boolean) => void;
  communities: Community[];
  communitySearchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCommunity: string;
  onCommunitySelect: (communityId: string) => void;
  isLoadingCommunities: boolean;
}

const CommunitySelectionStepComponent: React.FC<CommunitySelectionStepProps> = ({
  showCommunitySection,
  onToggleSection,
  communities,
  communitySearchQuery,
  onSearchChange,
  selectedCommunity,
  onCommunitySelect,
  isLoadingCommunities
}) => {
  const { t } = useI18n('modals');

  const handleToggleSection = useCallback((checked: boolean) => {
    onToggleSection(checked);
  }, [onToggleSection]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const handleCommunitySelect = useCallback((communityId: string) => {
    onCommunitySelect(communityId === selectedCommunity ? '' : communityId);
  }, [selectedCommunity, onCommunitySelect]);

  const filteredCommunities = useMemo(() => {
    if (!communitySearchQuery.trim()) return communities;
    return communities.filter(community =>
      community.name.toLowerCase().includes(communitySearchQuery.toLowerCase()) ||
      (community.description && community.description.toLowerCase().includes(communitySearchQuery.toLowerCase()))
    );
  }, [communities, communitySearchQuery]);

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          <Label htmlFor="community-toggle" className="text-sm font-medium cursor-pointer">
            {t('createConversationModal.community.addToCommunity')}
          </Label>
        </div>
        <Switch
          id="community-toggle"
          checked={showCommunitySection}
          onCheckedChange={handleToggleSection}
        />
      </div>

      {showCommunitySection && (
        <div className="space-y-3 pt-3 border-t">
          <Input
            placeholder={t('createConversationModal.community.searchPlaceholder')}
            value={communitySearchQuery}
            onChange={handleSearchChange}
            className="w-full"
            aria-label={t('createConversationModal.community.searchPlaceholder')}
          />

          {communitySearchQuery.length >= 2 && (
            <div className="mt-2 border rounded-lg bg-background shadow-sm max-h-48 overflow-y-auto">
              {isLoadingCommunities ? (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  {t('createConversationModal.community.loading')}
                </div>
              ) : filteredCommunities.length > 0 ? (
                <div className="p-1">
                  {filteredCommunities.map((community) => (
                    <div
                      key={community.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        selectedCommunity === community.id && "bg-primary/10 border border-primary/20"
                      )}
                      onClick={() => handleCommunitySelect(community.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleCommunitySelect(community.id);
                        }
                      }}
                      aria-pressed={selectedCommunity === community.id}
                      aria-label={`${selectedCommunity === community.id ? 'Désélectionner' : 'Sélectionner'} ${community.name}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{community.name}</span>
                          {community.isPrivate ? (
                            <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('createConversationModal.community.membersCount', {
                            count: community._count.members,
                            conversations: community._count.Conversation
                          })}
                        </p>
                      </div>
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedCommunity === community.id ? "opacity-100 text-primary" : "opacity-0"
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  {t('createConversationModal.community.noCommunitiesFound')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const CommunitySelectionStep = memo(CommunitySelectionStepComponent);
