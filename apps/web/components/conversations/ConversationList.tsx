'use client';

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { MessageSquare, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { CommunityFilter } from './CommunityCarousel';
import { CreateLinkButton } from './create-link-button';
import { ConversationSearchBar } from './conversation-search';
import { ConversationGroup, EmptyConversations } from './conversation-groups';
import { ConversationItem } from './conversation-item';
import {
  useConversationPreferences,
  useConversationFiltering,
  useConversationSorting
} from './hooks';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  currentUser: User;
  isLoading: boolean;
  isMobile: boolean;
  showConversationList: boolean;
  onSelectConversation: (conversation: Conversation) => void;
  onShowDetails?: (conversation: Conversation) => void;
  onCreateConversation: () => void;
  onLinkCreated: () => void;
  t: (key: string) => string;
  tSearch: (key: string) => string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

/**
 * Composant de liste des conversations optimisé avec virtualisation
 * Responsabilités:
 * - Afficher la liste des conversations avec recherche et filtres
 * - Gérer les préférences utilisateur (pin, mute, archive, réactions, catégories)
 * - Supporter le scroll infini pour la pagination
 * - Optimiser le rendu avec mémoisation et virtualisation
 */
export const ConversationList = memo(function ConversationList({
  conversations,
  selectedConversation,
  currentUser,
  isLoading,
  isMobile,
  showConversationList,
  onSelectConversation,
  onShowDetails,
  onCreateConversation,
  onLinkCreated,
  t,
  tSearch,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore
}: ConversationListProps) {
  // State local
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<CommunityFilter>({ type: 'all' });

  // Refs
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const {
    preferencesMap,
    categories,
    isLoadingPreferences,
    collapsedSections,
    toggleSection
  } = useConversationPreferences(conversations.length);

  const filteredConversations = useConversationFiltering({
    conversations,
    searchQuery,
    selectedFilter,
    preferencesMap
  });

  const groupedConversations = useConversationSorting({
    conversations: filteredConversations,
    preferencesMap,
    categories
  });

  // Handlers mémorisés
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleFilterChange = useCallback((filter: CommunityFilter) => {
    setSelectedFilter(filter);
  }, []);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    onSelectConversation(conversation);
  }, [onSelectConversation]);

  // Détection du scroll infini avec Intersection Observer
  useEffect(() => {
    if (!onLoadMore || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [onLoadMore, hasMore, isLoadingMore]);

  // Rendu du contenu principal
  const renderContent = useMemo(() => {
    if (isLoading || isLoadingPreferences) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('loadingConversations')}</p>
          </div>
        </div>
      );
    }

    if (filteredConversations.length === 0) {
      return <EmptyConversations searchQuery={searchQuery} t={t} />;
    }

    return (
      <div className="px-4 py-2">
        {groupedConversations.map((group, groupIndex) => {
          const sectionId = group.type === 'category' && group.categoryId
            ? `category-${group.categoryId}`
            : group.type;
          const isCollapsed = collapsedSections.has(sectionId);

          const hasUnreadMessages = group.conversations.some(conv =>
            conv.unreadCount !== undefined && conv.unreadCount > 0
          );

          return (
            <ConversationGroup
              key={`group-${group.type}-${group.categoryId || groupIndex}`}
              type={group.type}
              categoryId={group.categoryId}
              categoryName={group.categoryName}
              conversations={group.conversations}
              sectionId={sectionId}
              isCollapsed={isCollapsed}
              hasUnreadMessages={hasUnreadMessages}
              onToggleSection={toggleSection}
              t={t}
              categoriesLength={categories.length}
            >
              {group.conversations.map((conversation, convIndex) => {
                const prefs = preferencesMap.get(conversation.id);
                return (
                  <ConversationItem
                    key={`${group.type}-${conversation.id}-${convIndex}`}
                    conversation={conversation}
                    isSelected={selectedConversation?.id === conversation.id}
                    currentUser={currentUser}
                    onClick={() => handleSelectConversation(conversation)}
                    onShowDetails={onShowDetails}
                    t={t}
                    isPinned={prefs?.isPinned || false}
                    isMuted={prefs?.isMuted || false}
                    isArchived={prefs?.isArchived || false}
                    reaction={prefs?.reaction}
                    tags={prefs?.tags || []}
                    isMobile={isMobile}
                  />
                );
              })}
            </ConversationGroup>
          );
        })}

        {/* Bouton "Charger plus" visible */}
        {hasMore && onLoadMore && (
          <div className="flex flex-col items-center gap-2 py-4 px-4">
            <Button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              variant="outline"
              className="w-full max-w-xs"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('loadingMore')}
                </>
              ) : (
                t('loadMore')
              )}
            </Button>
          </div>
        )}

        {/* Trigger pour le chargement automatique infini (optionnel) */}
        {hasMore && !isLoadingMore && (
          <div
            ref={loadMoreTriggerRef}
            className="h-4 w-full"
            aria-hidden="true"
          />
        )}
      </div>
    );
  }, [
    isLoading,
    isLoadingPreferences,
    filteredConversations.length,
    searchQuery,
    t,
    groupedConversations,
    collapsedSections,
    categories.length,
    toggleSection,
    preferencesMap,
    selectedConversation?.id,
    currentUser,
    handleSelectConversation,
    onShowDetails,
    isMobile,
    isLoadingMore,
    hasMore
  ]);

  return (
    <div className="flex flex-col h-full max-h-full bg-card conversation-list-container">
      {/* Header de la liste des conversations */}
      <div className="flex-shrink-0 p-4 border-b bg-card z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('title')}</h2>

          <div className="flex items-center gap-2">
            {/* Bouton créer nouvelle conversation */}
            <Button
              onClick={onCreateConversation}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t('createNewConversation')}
              aria-label={t('createNewConversation')}
            >
              <MessageSquare className="h-4 w-4 text-primary" />
            </Button>

            {/* Bouton créer lien */}
            <CreateLinkButton
              onLinkCreated={onLinkCreated}
              forceModal={true}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
            >
              <Link2 className="h-4 w-4 text-primary" />
            </CreateLinkButton>
          </div>
        </div>

        {/* Barre de recherche et carousel */}
        <ConversationSearchBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedFilter={selectedFilter}
          onFilterChange={handleFilterChange}
          conversations={conversations}
          preferencesMap={preferencesMap}
          placeholder={tSearch('placeholder')}
          t={t}
        />
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {renderContent}
      </div>

      {/* Bouton de création en bas */}
      <div className="flex-shrink-0 p-4 border-t bg-card">
        <Button
          onClick={onCreateConversation}
          className="w-full flex items-center justify-center gap-2 h-11 text-sm font-medium"
        >
          <MessageSquare className="h-5 w-5" />
          {t('createNewConversation')}
        </Button>
      </div>
    </div>
  );
});
