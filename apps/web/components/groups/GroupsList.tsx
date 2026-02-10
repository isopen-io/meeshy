/**
 * Composant liste des groupes avec filtrage et tabs
 * Suit les Vercel React Best Practices: rendering-hoist-jsx
 */

import { memo, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Plus, Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Group } from '@meeshy/shared/types';
import { GroupCard } from './GroupCard';

interface GroupsListProps {
  groups: Group[];
  selectedGroup: Group | null;
  activeTab: string;
  searchFilter: string;
  copiedIdentifier: string | null;
  isMobile: boolean;
  showGroupsList: boolean;
  isLoading: boolean;
  onTabChange: (tab: string) => void;
  onSearchChange: (search: string) => void;
  onSelectGroup: (group: Group) => void;
  onCopyIdentifier: (identifier: string, e: React.MouseEvent) => void;
  onCreateClick: () => void;
  tGroups: (key: string) => string;
}

export const GroupsList = memo(function GroupsList({
  groups,
  selectedGroup,
  activeTab,
  searchFilter,
  copiedIdentifier,
  isMobile,
  showGroupsList,
  isLoading,
  onTabChange,
  onSearchChange,
  onSelectGroup,
  onCopyIdentifier,
  onCreateClick,
  tGroups
}: GroupsListProps) {
  // Filtrer les groupes par tab et recherche
  const filteredGroups = useMemo(() => {
    let filtered = groups;

    if (activeTab === 'private') {
      filtered = filtered.filter(group => group.isPrivate);
    } else {
      filtered = filtered.filter(group => !group.isPrivate);
    }

    if (searchFilter.trim()) {
      filtered = filtered.filter(group =>
        group.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (group.identifier && group.identifier.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (group.description && group.description.toLowerCase().includes(searchFilter.toLowerCase()))
      );
    }

    return filtered;
  }, [groups, activeTab, searchFilter]);

  // Calcul des comptes pour les badges
  const publicCount = useMemo(() => groups.filter(g => !g.isPrivate).length, [groups]);
  const privateCount = useMemo(() => groups.filter(g => g.isPrivate).length, [groups]);

  return (
    <div
      className={cn(
        "flex flex-col bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-l-2xl border border-border/50 shadow-lg",
        isMobile ? (showGroupsList ? "w-full" : "hidden") : "w-96"
      )}
    >
      {/* Header fixe */}
      <div className="flex-shrink-0 p-4 border-b border-border/30 dark:border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{tGroups('list.communities')}</h2>
          </div>
          <div className="relative">
            <Users className="h-6 w-6 text-primary" />
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4">
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="public" className="flex items-center space-x-2">
                <Globe className="h-4 w-4" />
                <span>{tGroups('visibility.public')}</span>
                <Badge variant="secondary">{publicCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="private" className="flex items-center space-x-2">
                <Lock className="h-4 w-4" />
                <span>{tGroups('visibility.private')}</span>
                <Badge variant="secondary">{privateCount}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Champ de filtrage */}
        <div className="mb-2">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {tGroups('list.filterPlaceholder')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={tGroups('list.filterLabel')}
              className="w-full h-8 text-sm px-3 py-2 border border-border/30 dark:border-border/50 rounded-lg
                       bg-background/50 dark:bg-background/70 text-foreground
                       placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/30
                       transition-colors outline-none"
            />
          </div>
        </div>
      </div>

      {/* Liste scrollable */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <EmptyState
            icon={<Users className="h-16 w-16 text-muted-foreground/50 mb-4" />}
            title={isLoading ? tGroups('list.loading') : tGroups('list.noCommunityFound')}
            description={
              isLoading ? tGroups('list.loadingInProgress') : tGroups('noGroupsDescription')
            }
          />
        ) : filteredGroups.length === 0 ? (
          <EmptyState
            icon={<Users className="h-16 w-16 text-muted-foreground/50 mb-4" />}
            title={`${tGroups('list.noCommunityFound')} ${activeTab === 'private' ? tGroups('visibility.private').toLowerCase() : tGroups('visibility.public').toLowerCase()}`}
            description={
              searchFilter.trim()
                ? tGroups('list.noCommunityForSearch')
                : `${tGroups('list.noCommunityFound')} ${activeTab === 'private' ? tGroups('visibility.private').toLowerCase() : tGroups('visibility.public').toLowerCase()}`
            }
          />
        ) : (
          <div className="p-2">
            <div className="space-y-2">
              {filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  isSelected={selectedGroup?.id === group.id}
                  onSelect={onSelectGroup}
                  onCopyIdentifier={onCopyIdentifier}
                  copiedIdentifier={copiedIdentifier}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer fixe */}
      <div className="flex-shrink-0 p-4 border-t border-border/30 dark:border-border/50 bg-background/50 dark:bg-background/70">
        <div className="flex flex-col gap-3">
          <Button
            className="w-full rounded-2xl h-12 bg-primary/10 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/30 border-0 text-primary font-semibold"
            onClick={onCreateClick}
          >
            <Plus className="h-5 w-5 mr-2" />
            {tGroups('list.newCommunity')}
          </Button>
        </div>
      </div>
    </div>
  );
});

// Composant EmptyState extrait (rendering-hoist-jsx)
const EmptyState = memo(function EmptyState({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      {icon}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6">{description}</p>
    </div>
  );
});
