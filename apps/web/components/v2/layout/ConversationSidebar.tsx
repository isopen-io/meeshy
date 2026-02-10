'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Button,
  Input,
  theme,
  ConversationItem,
  CategoryHeader,
  CategoryIcons,
  CommunityCarousel,
  ThemeToggle,
} from '@/components/v2';
import type { CommunityItem, TagItem, ConversationItemData } from '@/components/v2';
import { useConversationsV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';
import { useSplitView } from './SplitViewContext';

// Conversation filter categories
type ConversationFilter = 'public' | 'groupe' | 'globale' | 'direct' | 'non_lue';

const FILTER_STORAGE_KEY = 'meeshy_v2_conversation_filter';

// Mock data for communities
const mockCommunities: CommunityItem[] = [
  {
    id: '1',
    name: 'Tech Polyglots',
    banner: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=200&fit=crop',
    memberCount: 1243,
    conversationCount: 89,
    color: theme.colors.deepTeal,
  },
  {
    id: '2',
    name: 'Language Learners',
    banner: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=300&h=200&fit=crop',
    memberCount: 892,
    conversationCount: 156,
    color: theme.colors.royalIndigo,
  },
];

interface FilterCounts {
  public: number;
  groupe: number;
  globale: number;
  direct: number;
  non_lue: number;
}

function FilterTabs({
  activeFilter,
  onFilterChange,
  counts,
  isVisible,
}: {
  activeFilter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  counts: FilterCounts;
  isVisible: boolean;
}) {
  const filters: { id: ConversationFilter; label: string; count?: number; icon?: React.ReactNode }[] = [
    {
      id: 'public',
      label: 'Public',
      count: counts.public,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'groupe',
      label: 'Groupe',
      count: counts.groupe,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'globale',
      label: 'Globale',
      count: counts.globale,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
    },
    {
      id: 'direct',
      label: 'Direct',
      count: counts.direct,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      id: 'non_lue',
      label: 'Non lue',
      count: counts.non_lue,
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="6" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
        isVisible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-[var(--gp-border)]">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => onFilterChange(filter.id)}
              className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors duration-200 flex items-center gap-1.5 border ${
                isActive
                  ? 'font-medium border-transparent'
                  : 'border-[var(--gp-border)] hover:border-[var(--gp-terracotta)] hover:bg-[var(--gp-hover)]'
              }`}
              style={{
                background: isActive ? theme.colors.terracotta : 'var(--gp-surface)',
                color: isActive ? 'white' : 'var(--gp-text-secondary)',
              }}
            >
              {filter.icon}
              {filter.label}
              {filter.count !== undefined && filter.count > 0 && (
                <span
                  className={`min-w-[16px] h-[16px] px-1 rounded-full text-[10px] flex items-center justify-center font-medium ${
                    isActive ? 'bg-white/25 text-white' : ''
                  }`}
                  style={{
                    background: !isActive ? 'var(--gp-parchment)' : undefined,
                    color: !isActive ? 'var(--gp-text-muted)' : undefined,
                  }}
                >
                  {filter.count > 99 ? '99+' : filter.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-[var(--gp-parchment)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--gp-parchment)] rounded w-3/4" />
            <div className="h-3 bg-[var(--gp-parchment)] rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
  if (isConnected) return null;

  return (
    <div
      className="px-4 py-2 text-sm flex items-center gap-2"
      style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}
    >
      <div className="w-2 h-2 rounded-full bg-[var(--gp-error)] animate-pulse" />
      <span style={{ color: 'var(--gp-error)' }}>Reconnexion en cours...</span>
    </div>
  );
}

function InfiniteScrollTrigger({
  hasMore,
  isLoading,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const trigger = triggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [hasMore, isLoading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={triggerRef} className="py-4 flex justify-center">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--gp-text-muted)' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Chargement...</span>
        </div>
      ) : (
        <button
          onClick={onLoadMore}
          className="px-4 py-2 text-sm rounded-lg transition-colors hover:bg-[var(--gp-hover)]"
          style={{ color: 'var(--gp-text-secondary)' }}
        >
          Charger plus de conversations
        </button>
      )}
    </div>
  );
}

// Navigation item component for bottom nav
function NavItem({
  href,
  icon,
  isActive,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  isActive: boolean;
  badge?: number;
}) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        style={{ color: isActive ? theme.colors.terracotta : undefined }}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center font-medium text-white"
            style={{ background: theme.colors.terracotta }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Button>
    </Link>
  );
}

export function ConversationSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { sidebarWidth, setSidebarWidth, showRightPanel, isMobile, setShowRightPanel } = useSplitView();

  // Get selected conversation from URL
  const selectedConversationId = searchParams.get('id') || null;

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved && ['public', 'groupe', 'globale', 'direct', 'non_lue'].includes(saved)) {
        return saved as ConversationFilter;
      }
    }
    return 'direct';
  });
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Conversations hook
  const {
    conversationItems,
    isLoading: isLoadingConversations,
    isLoadingMore: isLoadingMoreConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    isConnected,
    selectConversation: handleSelectConversation,
  } = useConversationsV2(selectedConversationId, {
    enabled: isAuthenticated,
    currentUserId: currentUser?.id,
  });

  // Filter conversations
  const filteredConversations = useMemo(() => {
    let filtered = [...conversationItems];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conv) =>
          conv.name.toLowerCase().includes(query) ||
          conv.lastMessage.content.toLowerCase().includes(query) ||
          conv.customName?.toLowerCase().includes(query)
      );
    }

    switch (activeFilter) {
      case 'public':
        filtered = filtered.filter((conv) => conv.isGroup && (conv as any).visibility === 'public');
        break;
      case 'groupe':
        filtered = filtered.filter((conv) => conv.isGroup && (conv as any).visibility !== 'public');
        break;
      case 'globale':
        filtered = filtered.filter((conv) => (conv as any).type === 'global' || (conv as any).type === 'broadcast');
        break;
      case 'direct':
        filtered = filtered.filter((conv) => !conv.isGroup);
        break;
      case 'non_lue':
        filtered = filtered.filter((conv) => conv.unreadCount > 0);
        break;
    }

    return filtered;
  }, [conversationItems, searchQuery, activeFilter]);

  const filteredPinned = useMemo(() => filteredConversations.filter((conv) => conv.isPinned), [filteredConversations]);
  const filteredUnpinned = useMemo(() => filteredConversations.filter((conv) => !conv.isPinned), [filteredConversations]);

  // Filter counts
  const filterCounts = useMemo<FilterCounts>(() => ({
    public: conversationItems.filter((conv) => conv.isGroup && (conv as any).visibility === 'public').length,
    groupe: conversationItems.filter((conv) => conv.isGroup && (conv as any).visibility !== 'public').length,
    globale: conversationItems.filter((conv) => (conv as any).type === 'global' || (conv as any).type === 'broadcast').length,
    direct: conversationItems.filter((conv) => !conv.isGroup).length,
    non_lue: conversationItems.filter((conv) => conv.unreadCount > 0).length,
  }), [conversationItems]);

  // Handle conversation selection
  const selectConversation = useCallback((id: string) => {
    handleSelectConversation(id);
    router.push(`/v2/chats?id=${id}`);
    if (isMobile) {
      setShowRightPanel(true);
    }
  }, [handleSelectConversation, router, isMobile, setShowRightPanel]);

  // Handle filter change
  const handleFilterChange = useCallback((filter: ConversationFilter) => {
    setActiveFilter(filter);
    if (typeof window !== 'undefined') {
      localStorage.setItem(FILTER_STORAGE_KEY, filter);
    }
  }, []);

  // Check if a nav item is active
  const isNavActive = (path: string) => pathname.startsWith(path);

  // On mobile, hide sidebar when right panel is shown
  if (isMobile && showRightPanel) {
    return null;
  }

  return (
    <div
      className="relative h-full w-full flex flex-col bg-[var(--gp-surface)] border-r border-[var(--gp-border)] transition-colors duration-300"
    >
      {/* Header */}
      <div className="p-4 border-b border-[var(--gp-border)] transition-colors duration-300">
        <div className="flex items-center justify-between mb-4">
          <Link href="/v2/landing" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
            >
              M
            </div>
            <span className="font-semibold text-[var(--gp-text-primary)]">Messages</span>
          </Link>
          <div className="flex gap-1 items-center">
            <ThemeToggle size="sm" showModeSelector />
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
            <Link href="/v2/settings">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              ref={searchInputRef}
              placeholder="Rechercher une conversation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>
          {!searchFocused && (
            <button
              onClick={() => setSearchFocused(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-full border transition-colors hover:border-[var(--gp-terracotta)]"
              style={{
                background: 'var(--gp-surface)',
                borderColor: 'var(--gp-border)',
                color: 'var(--gp-text-secondary)',
              }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
              </svg>
              {{ public: 'Public', groupe: 'Groupe', globale: 'Globale', direct: 'Direct', non_lue: 'Non lue' }[activeFilter]}
            </button>
          )}
        </div>
      </div>

      {/* Communities Carousel + Filter Tabs */}
      <CommunityCarousel
        communities={mockCommunities}
        isVisible={searchFocused}
        onCommunityClick={(id) => setSelectedCommunityId(id === '__all__' ? null : id)}
        totalConversations={conversationItems.length}
        archivedConversations={0}
        selectedId={selectedCommunityId}
      />

      <FilterTabs
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        counts={filterCounts}
        isVisible={searchFocused}
      />

      {/* Connection Status */}
      <ConnectionStatus isConnected={isConnected} />

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversations && conversationItems.length === 0 ? (
          <ConversationsSkeleton />
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div
              className="w-16 h-16 rounded-full mb-4 flex items-center justify-center"
              style={{ background: 'var(--gp-parchment)' }}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gp-text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p style={{ color: 'var(--gp-text-muted)' }}>
              {searchQuery
                ? 'Aucun resultat pour cette recherche'
                : `Aucune conversation ${({ public: 'publique', groupe: 'de groupe', globale: 'globale', direct: 'privee', non_lue: 'non lue' } as const)[activeFilter]}`}
            </p>
          </div>
        ) : (
          <>
            {filteredPinned.length > 0 && (
              <div>
                <CategoryHeader id="pinned" name="Epinglees" icon={CategoryIcons.pinned} count={filteredPinned.length} />
                {filteredPinned.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedConversationId === conv.id}
                    onClick={selectConversation}
                  />
                ))}
              </div>
            )}

            {filteredPinned.length > 0 && filteredUnpinned.length > 0 && (
              <CategoryHeader id="all" name="Conversations" icon={CategoryIcons.all} count={filteredUnpinned.length} />
            )}

            {filteredUnpinned.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedConversationId === conv.id}
                onClick={selectConversation}
              />
            ))}

            <InfiniteScrollTrigger
              hasMore={hasMoreConversations}
              isLoading={isLoadingMoreConversations}
              onLoadMore={loadMoreConversations}
            />
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="p-2 border-t border-[var(--gp-border)] flex justify-around">
        <NavItem
          href="/v2/chats"
          isActive={isNavActive('/v2/chats')}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
          badge={filterCounts.non_lue}
        />
        <NavItem
          href="/v2/feeds"
          isActive={isNavActive('/v2/feeds')}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          }
        />
        <NavItem
          href="/v2/communities"
          isActive={isNavActive('/v2/communities')}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <NavItem
          href="/v2/me"
          isActive={isNavActive('/v2/me') || isNavActive('/v2/settings') || isNavActive('/v2/contacts') || isNavActive('/v2/notifications') || isNavActive('/v2/links')}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>

      {/* Resizer (desktop only) */}
      {!isMobile && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-[var(--gp-terracotta)]/50 active:bg-[var(--gp-terracotta)] transition-colors group z-10"
          style={{ background: 'var(--gp-border)' }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;

            const handleMouseMove = (e: MouseEvent) => {
              const deltaX = e.clientX - startX;
              const containerWidth = window.innerWidth;
              const deltaPercent = (deltaX / containerWidth) * 100;
              const newWidth = Math.max(15, Math.min(50, startWidth + deltaPercent));
              setSidebarWidth(newWidth);
            };

            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = '';
            };

            document.body.style.cursor = 'ew-resize';
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: theme.colors.terracotta }}
          />
        </div>
      )}
    </div>
  );
}
