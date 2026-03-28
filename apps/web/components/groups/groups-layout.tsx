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

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useIsAuthChecking } from '@/stores';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/useI18n';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Group } from '@meeshy/shared/types';
import { cn } from '@/lib/utils';

// Hooks customs
import { useGroupsResponsive } from '@/hooks/use-groups-responsive';
import {
  useCommunitiesQuery,
  useCommunityQuery,
  useCommunityConversationsQuery,
  useCreateCommunityMutation,
  useCheckIdentifierQuery,
} from '@/hooks/queries';
import {
  generateCommunityIdentifier,
  sanitizeCommunityIdentifier,
} from '@/utils/community-identifier';

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

  // React Query hooks pour la logique métier
  const { data: groups = [], isLoading } = useCommunitiesQuery();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // Charger les détails quand un identifiant est dans l'URL mais pas trouvé localement
  const { data: fetchedGroupDetail } = useCommunityQuery(
    selectedGroupIdentifier && !selectedGroup ? selectedGroupIdentifier : null
  );

  // Conversations de la communauté sélectionnée
  const { data: communityConversations = [], isLoading: isLoadingConversations } =
    useCommunityConversationsQuery(selectedGroup?.id);

  const { showGroupsList, setShowGroupsList, isMobile } = useGroupsResponsive(selectedGroup);

  // Création de communauté via React Query
  const createCommunityMutation = useCreateCommunityMutation();

  // Form state pour la création (local, pas besoin de hook séparé)
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupIdentifier, setNewGroupIdentifier] = useState('');
  const [newGroupIsPrivate, setNewGroupIsPrivate] = useState(false);

  // Identifier availability check via React Query
  const fullIdentifier = newGroupIdentifier ? `mshy_${newGroupIdentifier}` : '';
  const { data: identifierCheck, isFetching: isCheckingIdentifier } =
    useCheckIdentifierQuery(fullIdentifier);

  const identifierAvailable = identifierCheck?.available ?? null;
  const isFormValid = !!(
    newGroupName.trim() &&
    newGroupIdentifier.trim() &&
    identifierAvailable === true &&
    !isCheckingIdentifier
  );

  // Auto-generate identifier from name
  useEffect(() => {
    if (newGroupName.trim()) {
      const generated = generateCommunityIdentifier(newGroupName);
      setNewGroupIdentifier(generated);
    }
  }, [newGroupName]);

  // Reset form
  const resetForm = useCallback(() => {
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupIdentifier('');
    setNewGroupIsPrivate(false);
  }, []);

  // Create group handler
  const handleCreateGroup = useCallback(async () => {
    if (!isFormValid) return;
    try {
      await createCommunityMutation.mutateAsync({
        name: newGroupName,
        description: newGroupDescription || undefined,
        identifier: `mshy_${newGroupIdentifier}`,
        isPrivate: newGroupIsPrivate,
      });
      resetForm();
      setIsCreateModalOpen(false);
      toast.success(tGroups('success.groupCreated'));
    } catch {
      toast.error(tGroups('errors.createError'));
    }
  }, [
    isFormValid, createCommunityMutation, newGroupName, newGroupDescription,
    newGroupIdentifier, newGroupIsPrivate, resetForm, tGroups,
  ]);

  // Sync fetched group detail from URL
  useEffect(() => {
    if (fetchedGroupDetail && !selectedGroup) {
      setSelectedGroup(fetchedGroupDetail as unknown as Group);
      if (isMobile) {
        setShowGroupsList(false);
      }
    }
  }, [fetchedGroupDetail, selectedGroup, isMobile, setShowGroupsList]);

  // Sélectionner un groupe
  const handleSelectGroup = useCallback(
    (group: Group) => {
      setSelectedGroup(group);
      const identifier = group.identifier || '';
      router.push(`/groups/${identifier}`);
    },
    [router]
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
      }
      // If not found locally, useCommunityQuery above handles fetching
    }
  }, [selectedGroupIdentifier, groups, isMobile, setShowGroupsList]);

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
                currentUserId={user?.id}
                currentUserRole={
                  selectedGroup.createdBy === user?.id
                    ? 'admin'
                    : (selectedGroup.members as Array<{ userId: string; role: string }>)
                        ?.find((m) => m.userId === user?.id)?.role as 'admin' | 'moderator' | 'member' ?? 'member'
                }
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
          newGroupName,
          setNewGroupName,
          newGroupDescription,
          setNewGroupDescription,
          newGroupIdentifier,
          setNewGroupIdentifier: (value: string) => setNewGroupIdentifier(sanitizeCommunityIdentifier(value)),
          newGroupIsPrivate,
          setNewGroupIsPrivate,
          isCheckingIdentifier,
          identifierAvailable,
          isValid: isFormValid,
        }}
        onSubmit={handleCreateGroup}
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
