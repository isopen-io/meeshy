'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Button,
  Input,
  Badge,
  LanguageOrb,
  MessageBubble,
  theme,
  useResizer,
  ConversationItem,
  ConversationItemData,
  CategoryHeader,
  CategoryIcons,
  CommunityCarousel,
  CommunityItem,
  ConversationDrawer,
  TagItem,
} from '@/components/v2';

// Données de démonstration
const mockCategories: TagItem[] = [
  { id: 'work', name: 'Travail', color: theme.colors.deepTeal },
  { id: 'personal', name: 'Personnel', color: theme.colors.royalIndigo },
  { id: 'clients', name: 'Clients', color: theme.colors.terracotta },
];

const mockTags: TagItem[] = [
  { id: 'urgent', name: 'Urgent', color: '#EF4444' },
  { id: 'important', name: 'Important', color: theme.colors.goldAccent },
  { id: 'follow', name: 'À suivre', color: theme.colors.jadeGreen },
];

const mockCommunities: CommunityItem[] = [
  { id: '1', name: 'Tech Polyglots', memberCount: 1243, color: theme.colors.deepTeal },
  { id: '2', name: 'Language Learners', memberCount: 892, color: theme.colors.royalIndigo },
  { id: '3', name: 'Global Travelers', memberCount: 2156, color: theme.colors.terracotta },
  { id: '4', name: 'Manga & Anime', memberCount: 3421, color: theme.colors.sakuraPink },
];

const mockConversations: ConversationItemData[] = [
  {
    id: '1',
    name: 'Yuki Tanaka',
    languageCode: 'ja',
    isOnline: true,
    isAnonymous: false,
    isPinned: true,
    isImportant: false,
    isMuted: false,
    tags: [{ id: 'urgent', name: 'Urgent', color: '#EF4444' }],
    unreadCount: 2,
    lastMessage: { content: 'À demain pour la réunion !', type: 'text', timestamp: '10:34' },
    isTyping: false,
  },
  {
    id: '2',
    name: 'Carlos García',
    languageCode: 'es',
    isOnline: false,
    isAnonymous: true,
    isPinned: true,
    isImportant: true,
    isMuted: false,
    tags: [{ id: 'important', name: 'Important', color: theme.colors.goldAccent }],
    unreadCount: 0,
    lastMessage: { content: '¡Gracias por tu ayuda!', type: 'text', timestamp: '09:15' },
    isTyping: true,
  },
  {
    id: '3',
    name: 'Emma Wilson',
    languageCode: 'en',
    isOnline: true,
    isAnonymous: false,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '', type: 'photo', attachmentCount: 3, timestamp: 'Hier' },
    draft: 'Je voulais te dire que...',
    isTyping: false,
    categoryId: 'work',
  },
  {
    id: '4',
    name: 'Ahmed Hassan',
    languageCode: 'ar',
    isOnline: false,
    isAnonymous: false,
    isPinned: false,
    isImportant: false,
    isMuted: true,
    tags: [{ id: 'follow', name: 'À suivre', color: theme.colors.jadeGreen }],
    unreadCount: 5,
    lastMessage: { content: 'مرحبا، كيف حالك؟', type: 'text', timestamp: 'Hier' },
    isTyping: false,
    categoryId: 'work',
  },
  {
    id: '5',
    name: 'Li Wei',
    languageCode: 'zh',
    isOnline: true,
    isAnonymous: false,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '项目进展如何？', type: 'text', timestamp: 'Lun' },
    isTyping: false,
  },
  {
    id: '6',
    name: 'Sophie Martin',
    languageCode: 'fr',
    isOnline: false,
    isAnonymous: true,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '', type: 'voice', timestamp: 'Lun' },
    isTyping: false,
  },
];

export default function V2ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>('1');
  const [message, setMessage] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [conversations, setConversations] = useState(mockConversations);
  const [categories] = useState(mockCategories);
  const [tags] = useState(mockTags);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Resizer pour desktop
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useResizer(30, 10, 50);

  // Grouper les conversations par catégorie
  const pinnedConversations = conversations.filter((c) => c.isPinned);
  const categorizedConversations = conversations.filter((c) => !c.isPinned && c.categoryId);
  const uncategorizedConversations = conversations.filter((c) => !c.isPinned && !c.categoryId);

  // Catégories avec conversations
  const categoriesWithConversations = categories.filter((cat) =>
    conversations.some((c) => c.categoryId === cat.id && !c.isPinned)
  );

  // Conversation sélectionnée
  const selectedConversation = conversations.find((c) => c.id === selectedChat);

  // Handlers
  const handleConversationAction = useCallback((id: string, action: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        switch (action) {
          case 'pin':
            return { ...c, isPinned: !c.isPinned };
          case 'mute':
            return { ...c, isMuted: !c.isMuted };
          case 'important':
            return { ...c, isImportant: !c.isImportant };
          case 'read':
            return { ...c, unreadCount: 0 };
          default:
            return c;
        }
      })
    );
  }, []);

  const handleCategoryDrop = useCallback((conversationId: string, categoryId: string | null) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, categoryId: categoryId || undefined } : c
      )
    );
  }, []);

  // Drawer state
  const [drawerNotifications, setDrawerNotifications] = useState<'all' | 'mentions' | 'none'>('all');
  const [drawerTheme, setDrawerTheme] = useState(theme.colors.terracotta);
  const [drawerCategoryId, setDrawerCategoryId] = useState<string | undefined>();
  const [drawerTagIds, setDrawerTagIds] = useState<string[]>([]);

  const availableThemeColors = [
    theme.colors.terracotta,
    theme.colors.deepTeal,
    theme.colors.jadeGreen,
    theme.colors.royalIndigo,
    theme.colors.goldAccent,
  ];

  return (
    <div className="h-screen flex relative" style={{ background: theme.colors.warmCanvas }}>
      {/* Sidebar */}
      <div
        className="border-r flex flex-col relative"
        style={{
          width: `${sidebarWidth}%`,
          minWidth: '280px',
          borderColor: theme.colors.parchment,
          background: 'white',
        }}
      >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: theme.colors.parchment }}>
          <div className="flex items-center justify-between mb-4">
            <Link href="/v2/landing" className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
              >
                M
              </div>
              <span className="font-semibold" style={{ color: theme.colors.charcoal }}>
                Messages
              </span>
            </Link>
            <div className="flex gap-1">
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
          <Input
            placeholder="Rechercher..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        {/* Carrousel communautés */}
        <CommunityCarousel
          communities={mockCommunities}
          isVisible={searchFocused}
          onCommunityClick={(id) => console.log('Community clicked:', id)}
        />

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {/* Épinglées */}
          {pinnedConversations.length > 0 && (
            <div>
              <CategoryHeader
                id="pinned"
                name="Épinglées"
                icon={CategoryIcons.pinned}
                count={pinnedConversations.length}
                onDrop={(convId) => handleConversationAction(convId, 'pin')}
              />
              {pinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </div>
          )}

          {/* Catégories personnalisées */}
          {categoriesWithConversations.map((category) => {
            const catConversations = conversations.filter(
              (c) => c.categoryId === category.id && !c.isPinned
            );
            return (
              <div key={category.id}>
                <CategoryHeader
                  id={category.id}
                  name={category.name}
                  count={catConversations.length}
                  color={category.color}
                  onDrop={(convId) => handleCategoryDrop(convId, category.id)}
                />
                {catConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedChat === conv.id}
                    onClick={() => setSelectedChat(conv.id)}
                    onArchive={() => console.log('archive', conv.id)}
                    onDelete={() => console.log('delete', conv.id)}
                    onMarkRead={() => handleConversationAction(conv.id, 'read')}
                    onMute={() => handleConversationAction(conv.id, 'mute')}
                    onPin={() => handleConversationAction(conv.id, 'pin')}
                    onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                    onAddTag={() => console.log('add tag', conv.id)}
                    onCall={() => console.log('call', conv.id)}
                    onOptionsClick={() => setDrawerOpen(true)}
                    onDragStart={() => console.log('drag start', conv.id)}
                  />
                ))}
              </div>
            );
          })}

          {/* Non catégorisées */}
          {uncategorizedConversations.length > 0 && (pinnedConversations.length > 0 || categorizedConversations.length > 0) && (
            <div>
              <CategoryHeader
                id="uncategorized"
                name="Non catégorisées"
                icon={CategoryIcons.uncategorized}
                count={uncategorizedConversations.length}
                onDrop={(convId) => handleCategoryDrop(convId, null)}
              />
              {uncategorizedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </div>
          )}

          {/* Si pas de catégories, afficher toutes les conversations */}
          {pinnedConversations.length === 0 && categorizedConversations.length === 0 && (
            <>
              {uncategorizedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </>
          )}
        </div>

        {/* Nav */}
        <div className="p-2 border-t flex justify-around" style={{ borderColor: theme.colors.parchment }}>
          <Link href="/v2/chats">
            <Button variant="ghost" size="sm" style={{ color: theme.colors.terracotta }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/feeds">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/communities">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/u">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Button>
          </Link>
        </div>
      </div>

      {/* Resizer */}
      <div
        className="w-1 cursor-ew-resize hover:bg-terracotta/50 active:bg-terracotta transition-colors relative group"
        style={{ background: theme.colors.parchment }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = sidebarWidth;

          const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startX;
            const containerWidth = window.innerWidth;
            const deltaPercent = (deltaX / containerWidth) * 100;
            const newWidth = Math.max(10, Math.min(50, startWidth + deltaPercent));
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col" style={{ width: `${100 - sidebarWidth}%` }}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: theme.colors.parchment, background: 'white' }}
            >
              <div className="flex items-center gap-3">
                <LanguageOrb code={selectedConversation.languageCode} size="md" pulse={false} />
                <div>
                  <h2 className="font-semibold" style={{ color: theme.colors.charcoal }}>
                    {selectedConversation.customName || selectedConversation.name}
                  </h2>
                  <span
                    className="text-sm"
                    style={{ color: selectedConversation.isOnline ? theme.colors.jadeGreen : theme.colors.textMuted }}
                  >
                    {selectedConversation.isOnline ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" title="Créer un lien">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Appel audio">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Appel vidéo">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Options" onClick={() => setDrawerOpen(true)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{ background: '#FAFAFA' }}>
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="こんにちは！今日の会議の準備はできていますか？"
                translation="Bonjour ! Es-tu prête pour la réunion d'aujourd'hui ?"
                translationLanguage="français"
                sender="Yuki"
                timestamp="10:32"
              />
              <MessageBubble
                isSent
                languageCode="fr"
                languageName="Français"
                content="Oui, tout est prêt ! J'ai terminé la présentation hier soir."
                translation="はい、準備万端です！昨夜プレゼンを完成させました。"
                translationLanguage="japonais"
                timestamp="10:33"
              />
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="素晴らしい！楽しみにしています 🎉"
                translation="Super ! J'ai hâte d'y être 🎉"
                translationLanguage="français"
                sender="Yuki"
                timestamp="10:34"
              />
            </div>

            {/* Input */}
            <div className="p-4 border-t" style={{ borderColor: theme.colors.parchment, background: 'white' }}>
              <div className="flex gap-3">
                <Button variant="ghost" size="sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </Button>
                <Input
                  placeholder="Tapez votre message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1"
                />
                <Button variant="primary" size="sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ background: '#FAFAFA' }}>
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: theme.colors.parchment }}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: theme.colors.textMuted }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p style={{ color: theme.colors.textMuted }}>Sélectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversationName={selectedConversation?.customName || selectedConversation?.name || ''}
        onNameChange={(name) => console.log('Name changed:', name)}
        notificationLevel={drawerNotifications}
        onNotificationChange={setDrawerNotifications}
        themeColor={drawerTheme}
        availableColors={availableThemeColors}
        onThemeChange={setDrawerTheme}
        categories={categories}
        selectedCategoryId={drawerCategoryId}
        onCategorySelect={setDrawerCategoryId}
        onCategoryCreate={(name) => console.log('Create category:', name)}
        onCategoryDelete={(id) => console.log('Delete category:', id)}
        tags={tags}
        selectedTagIds={drawerTagIds}
        onTagSelect={(id) => setDrawerTagIds((prev) => [...prev, id])}
        onTagDeselect={(id) => setDrawerTagIds((prev) => prev.filter((t) => t !== id))}
        onTagCreate={(name) => console.log('Create tag:', name)}
        onTagDelete={(id) => console.log('Delete tag:', id)}
        onSettingsClick={() => console.log('Settings clicked')}
        onProfileClick={() => console.log('Profile clicked')}
        onSearchClick={() => console.log('Search clicked')}
        onBlockClick={() => console.log('Block clicked')}
        onReportClick={() => console.log('Report clicked')}
      />

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
