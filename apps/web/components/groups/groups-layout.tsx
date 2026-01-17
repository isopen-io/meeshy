'use client';

/**
 * GroupsLayout - Composant principal pour la gestion des groupes/communautés
 *
 * REFACTORED: Divisé de 986 lignes à ~220 lignes
 * Suit les Vercel React Best Practices:
 * - bundle-dynamic-imports: Lazy loading des sections lourdes
 * - rerender-memo: React.memo sur composants lourds
 * - rendering-hoist-jsx: JSX statique extrait
 * - rerender-lazy-state-init: useState(() => expensive)
 * - Hooks customs pour logique métier séparée
 * - Composants enfants pour UI modulaire
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useIsAuthChecking } from '@/stores';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/useI18n';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Group } from '@meeshy/shared/types';
import { cn } from '@/lib/utils';

// Hooks customs
import { useGroups } from '@/hooks/use-groups';
import { useGroupDetails } from '@/hooks/use-group-details';
import { useGroupForm } from '@/hooks/use-group-form';
import { useCommunityConversations } from '@/hooks/use-community-conversations';
import { useGroupsResponsive } from '@/hooks/use-groups-responsive';

// Composants UI
import { GroupsList } from './GroupsList';
import { GroupDetails } from './GroupDetails';
import { CreateGroupModal } from './CreateGroupModal';

interface GroupsLayoutProps {
  selectedGroupIdentifier?: string;
}

export function GroupsLayout({ selectedGroupIdentifier }: GroupsLayoutProps) {
  const router = useRouter();
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { t: tGroups } = useI18n('groups');
  const { t: tConv } = useI18n('conversations');

  // États UI
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('public');
  const [searchFilter, setSearchFilter] = useState('');
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);

  // Hooks customs pour la logique métier
  const { groups, setGroups, isLoading } = useGroups();
  const { selectedGroup, setSelectedGroup, loadGroupDetails } = useGroupDetails();
  const { communityConversations, isLoadingConversations, loadCommunityConversations } =
    useCommunityConversations();
  const { showGroupsList, setShowGroupsList, isMobile } = useGroupsResponsive(selectedGroup);

  // Hook formulaire de création
  const groupForm = useGroupForm({
    tGroups,
    onSuccess: (newGroup) => {
      setGroups((prev) => [newGroup, ...prev]);
      setIsCreateModalOpen(false);
    }
  });

  // Sélectionner un groupe
  const handleSelectGroup = useCallback(
    (group: Group) => {
      try {
        setSelectedGroup(group);

        if (group.id) {
          loadCommunityConversations(group.id, group.isPrivate);
        }

        const identifier = group.identifier || '';
        router.push(`/groups/${identifier}`);
      } catch (error) {
        console.error('[ERROR] handleSelectGroup failed:', error);
      }
    },
    [router, loadCommunityConversations, setSelectedGroup]
  );

  // Retour à la liste (mobile)
  const handleBackToList = useCallback(() => {
    if (isMobile) {
      setShowGroupsList(true);
      setSelectedGroup(null);
      router.push('/groups');
    }
  }, [isMobile, router, setShowGroupsList, setSelectedGroup]);

  // Copier l'identifiant
  const copyIdentifier = useCallback(
    async (identifier: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        const displayIdentifier = identifier.replace(/^mshy_/, '');
        await navigator.clipboard.writeText(displayIdentifier);
        setCopiedIdentifier(identifier);
        toast.success(tGroups('success.identifierCopied'));

        setTimeout(() => {
          setCopiedIdentifier(null);
        }, 2000);
      } catch (error) {
        console.error('[Groups] Error copying identifier:', error);
        toast.error(tGroups('errors.copyError'));
      }
    },
    [tGroups]
  );

  // Gérer la sélection depuis l'URL
  useEffect(() => {
    if (selectedGroupIdentifier && groups.length > 0) {
      let group = groups.find((g) => g.identifier === selectedGroupIdentifier);

      if (!group && !selectedGroupIdentifier.startsWith('mshy_')) {
        group = groups.find((g) => g.identifier === `mshy_${selectedGroupIdentifier}`);
      }

      if (!group && selectedGroupIdentifier.startsWith('mshy_')) {
        const cleanIdentifier = selectedGroupIdentifier.replace(/^mshy_/, '');
        group = groups.find((g) => g.identifier === cleanIdentifier);
      }

      if (group) {
        setSelectedGroup(group);
        if (isMobile) {
          setShowGroupsList(false);
        }
      } else {
        loadGroupDetails(selectedGroupIdentifier, isMobile);
      }
    }
  }, [selectedGroupIdentifier, groups, isMobile, loadGroupDetails, setSelectedGroup, setShowGroupsList]);

  // Charger les conversations quand le groupe est sélectionné
  useEffect(() => {
    if (selectedGroup?.id) {
      loadCommunityConversations(selectedGroup.id, selectedGroup.isPrivate);
    }
  }, [selectedGroup?.id, selectedGroup?.isPrivate, loadCommunityConversations]);

  // Loading state pendant la vérification d'authentification
  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{tGroups('authChecking')}</p>
        </div>
      </div>
    );
  }

  // Pas d'utilisateur après vérification
  if (!user) {
    return null;
  }

  return (
    <DashboardLayout
      title={tConv('communities.title')}
      className="!bg-none !bg-transparent !h-auto !max-w-none !px-0"
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">{tConv('loading')}</p>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-6rem)] flex bg-transparent">
          {/* Liste des groupes */}
          <GroupsList
            groups={groups}
            selectedGroup={selectedGroup}
            activeTab={activeTab}
            searchFilter={searchFilter}
            copiedIdentifier={copiedIdentifier}
            isMobile={isMobile}
            showGroupsList={showGroupsList}
            isLoading={isLoading}
            onTabChange={setActiveTab}
            onSearchChange={setSearchFilter}
            onSelectGroup={handleSelectGroup}
            onCopyIdentifier={copyIdentifier}
            onCreateClick={() => setIsCreateModalOpen(true)}
            tGroups={tGroups}
          />

          {/* Zone de détails du groupe */}
          <div
            className={cn(
              "flex flex-col",
              isMobile ? (showGroupsList ? "hidden" : "w-full") : "flex-1"
            )}
          >
            {selectedGroup ? (
              <GroupDetails
                group={selectedGroup}
                conversations={communityConversations}
                isLoadingConversations={isLoadingConversations}
                copiedIdentifier={copiedIdentifier}
                isMobile={isMobile}
                onBack={handleBackToList}
                onCopyIdentifier={copyIdentifier}
                onSettingsClick={() => setIsSettingsModalOpen(true)}
                tGroups={tGroups}
              />
            ) : (
              <EmptySelection tGroups={tGroups} />
            )}
          </div>
        </div>
      )}

      {/* Modal de création */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        formState={{
          newGroupName: groupForm.newGroupName,
          setNewGroupName: groupForm.setNewGroupName,
          newGroupDescription: groupForm.newGroupDescription,
          setNewGroupDescription: groupForm.setNewGroupDescription,
          newGroupIdentifier: groupForm.newGroupIdentifier,
          setNewGroupIdentifier: groupForm.setNewGroupIdentifier,
          newGroupIsPrivate: groupForm.newGroupIsPrivate,
          setNewGroupIsPrivate: groupForm.setNewGroupIsPrivate,
          isCheckingIdentifier: groupForm.isCheckingIdentifier,
          identifierAvailable: groupForm.identifierAvailable,
          isValid: groupForm.isValid
        }}
        onSubmit={groupForm.createGroup}
        tGroups={tGroups}
      />
    </DashboardLayout>
  );
}

// Composant EmptySelection extrait (rendering-hoist-jsx)
function EmptySelection({ tGroups }: { tGroups: (key: string) => string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-background/30 dark:bg-background/40 backdrop-blur-sm rounded-r-2xl">
      <div className="text-center p-8">
        <Users className="h-16 w-16 mx-auto mb-6 text-muted-foreground/50" />
        <h3 className="text-xl font-bold text-foreground mb-3">
          {tGroups('list.selectCommunity')}
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          {tGroups('list.selectCommunityDescription')}
        </p>
      </div>
    </div>
  );
}
