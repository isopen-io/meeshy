'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  LanguageOrb,
  MessageBubble,
  MessageComposer,
  MessageTimestamp,
  ReplyPreview,
  ImageGallery,
  AudioPlayer,
  VideoPlayer,
  Tooltip,
  theme,
  ConversationDrawer,
  useSplitView,
} from '@/components/v2';
import type { TagItem } from '@/components/v2';
import { useConversationsV2, useMessagesV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';
import type { User, Message } from '@meeshy/shared/types';

// ============================================================================
// Types
// ============================================================================

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface FailedMessage {
  tempId: string;
  content: string;
  replyToId?: string;
  timestamp: Date;
}

// ============================================================================
// Demo Messages with Media
// ============================================================================

interface DemoMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  originalLanguage: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file';
  sender: { displayName: string; username: string };
  attachments?: Array<{
    type: 'image' | 'audio' | 'video' | 'file';
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
    duration?: number;
  }>;
  translations?: Array<{ language: string; content: string }>;
  isEdited?: boolean;
  readCount?: number;
  deliveredCount?: number;
  replyToId?: string;
}

const DEMO_USER_ID = 'demo-user';
const DEMO_OTHER_USER_ID = 'demo-other';

const mockDemoMessages: DemoMessage[] = [
  {
    id: 'demo-msg-1',
    senderId: DEMO_OTHER_USER_ID,
    content: 'Salut ! Regarde ces photos de mon voyage en Italie, c\'est magnifique !',
    createdAt: new Date(Date.now() - 3600000 * 2),
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { displayName: 'Marie Dupont', username: 'marie_d' },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-2',
    senderId: DEMO_OTHER_USER_ID,
    content: '',
    createdAt: new Date(Date.now() - 3600000 * 1.9),
    originalLanguage: 'fr',
    messageType: 'image',
    sender: { displayName: 'Marie Dupont', username: 'marie_d' },
    attachments: [
      { type: 'image', url: 'https://picsum.photos/seed/italy1/400/300', name: 'colisee.jpg', mimeType: 'image/jpeg' },
      { type: 'image', url: 'https://picsum.photos/seed/italy2/400/300', name: 'venise.jpg', mimeType: 'image/jpeg' },
    ],
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-3',
    senderId: DEMO_USER_ID,
    content: 'Wow, c\'est superbe ! Tu as de la chance !',
    createdAt: new Date(Date.now() - 3600000 * 1.5),
    originalLanguage: 'fr',
    messageType: 'text',
    sender: { displayName: 'Moi', username: 'me' },
    deliveredCount: 1,
    readCount: 1,
  },
];

// ============================================================================
// Components
// ============================================================================

function MessageStatusIndicator({ status }: { status: MessageStatus }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />;
      case 'sent':
        return (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'read':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gp-jade-green)' }}>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gp-error)' }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return <span className="inline-flex items-center ml-1 text-[var(--gp-text-muted)]">{getStatusIcon()}</span>;
}

function MessagesSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : ''} animate-pulse`}>
          <div className="w-8 h-8 rounded-full bg-[var(--gp-parchment)]" />
          <div className={`max-w-[60%] space-y-2 ${i % 2 === 0 ? 'items-end' : ''}`}>
            <div className="h-16 bg-[var(--gp-parchment)] rounded-2xl w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageAttachments({ attachments, isSent }: { attachments: any[]; isSent: boolean }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const videos = attachments.filter((a) => a.type === 'video' || a.mimeType?.startsWith('video/'));
  const audio = attachments.filter((a) => a.type === 'audio' || a.mimeType?.startsWith('audio/'));
  const files = attachments.filter((a) =>
    a.type === 'file' || (a.mimeType && !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('audio/') && !a.mimeType.startsWith('video/'))
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <ImageGallery images={images.map((img) => ({ url: img.url || img.path, alt: img.name || 'Image' }))} maxVisible={4} />
      )}
      {videos.map((video, index) => (
        <div key={`video-${index}`} className="max-w-[320px]">
          <VideoPlayer src={video.url || video.path} poster={video.thumbnail} duration={video.duration} />
        </div>
      ))}
      {audio.map((aud, index) => (
        <AudioPlayer key={`audio-${index}`} src={aud.url || aud.path} duration={aud.duration} />
      ))}
      {files.map((file, index) => (
        <a
          key={`file-${index}`}
          href={file.url || file.path}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
            isSent ? 'bg-white/10 hover:bg-white/20' : 'bg-[var(--gp-parchment)] hover:bg-[var(--gp-hover)]'
          }`}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: isSent ? 'rgba(255,255,255,0.2)' : 'var(--gp-deep-teal)' }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isSent ? 'text-white' : 'text-[var(--gp-text-primary)]'}`}>
              {file.name || 'Fichier'}
            </p>
            <p className={`text-xs ${isSent ? 'text-white/60' : 'text-[var(--gp-text-muted)]'}`}>
              {file.size ? formatFileSize(file.size) : 'Document'}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--gp-background)]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[var(--gp-parchment)]">
          <svg className="w-8 h-8 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-[var(--gp-text-muted)]">Selectionnez une conversation</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function V2ChatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { goBackToList, isMobile, showRightPanel } = useSplitView();

  // Get selected conversation from URL
  const selectedConversationId = searchParams.get('id');

  // State
  const [message, setMessage] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<string, string[]>>>({});

  // Drawer state
  const [drawerNotifications, setDrawerNotifications] = useState<'all' | 'mentions' | 'none'>('all');
  const [drawerTheme, setDrawerTheme] = useState(theme.colors.terracotta);
  const [drawerCategoryId, setDrawerCategoryId] = useState<string | undefined>();
  const [drawerTagIds, setDrawerTagIds] = useState<string[]>([]);

  const mockCategories: TagItem[] = [
    { id: 'work', name: 'Travail', color: theme.colors.deepTeal },
    { id: 'personal', name: 'Personnel', color: theme.colors.royalIndigo },
  ];

  const mockTags: TagItem[] = [
    { id: 'urgent', name: 'Urgent', color: '#EF4444' },
    { id: 'important', name: 'Important', color: theme.colors.goldAccent },
  ];

  const availableThemeColors = [
    theme.colors.terracotta,
    theme.colors.deepTeal,
    theme.colors.jadeGreen,
    theme.colors.royalIndigo,
    theme.colors.goldAccent,
  ];

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<{ focus: () => void } | null>(null);

  // Conversations hook for getting current conversation details
  const {
    currentConversation,
    isConnected: conversationsConnected,
    selectConversation,
  } = useConversationsV2(selectedConversationId, {
    enabled: isAuthenticated,
    currentUserId: currentUser?.id,
  });

  // Messages hook
  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    isSending,
    hasMore: hasMoreMessages,
    loadMore: loadMoreMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    typingUsers: messageTypingUsers,
    startTyping,
    stopTyping,
    isConnected: messagesConnected,
  } = useMessagesV2(selectedConversationId, currentUser as User | null, {
    enabled: !!selectedConversationId && isAuthenticated,
    containerRef: messagesContainerRef,
  });

  // Select conversation when ID changes
  useEffect(() => {
    if (selectedConversationId) {
      selectConversation(selectedConversationId);
    }
  }, [selectedConversationId, selectConversation]);

  // Display messages (with demo fallback)
  const displayMessages = useMemo(() => {
    if (messages.length > 0) return messages;
    if (selectedConversationId && !isLoadingMessages) {
      return mockDemoMessages.map((demoMsg) => ({
        ...demoMsg,
        conversationId: selectedConversationId,
        senderId: demoMsg.senderId === DEMO_USER_ID ? (currentUser?.id || DEMO_USER_ID) : demoMsg.senderId,
      })) as unknown as Message[];
    }
    return messages;
  }, [messages, selectedConversationId, isLoadingMessages, currentUser?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current && displayMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayMessages.length]);

  // Typing users
  const currentTypingUsers = useMemo(() => {
    return Array.from(messageTypingUsers).filter((id) => id !== currentUser?.id);
  }, [messageTypingUsers, currentUser?.id]);

  // Handlers
  const handleMessageChange = useCallback((value: string) => {
    setMessage(value);
    if (value.trim()) startTyping();
    else stopTyping();
  }, [startTyping, stopTyping]);

  const handleSend = useCallback(async (content: string, _attachments: any[], languageCode: string) => {
    if (!content.trim()) return;
    stopTyping();

    const options: { language: string; replyToId?: string } = { language: languageCode };
    if (replyToMessage) options.replyToId = replyToMessage.id;

    const success = await sendMessage(content, options);
    if (success) {
      setMessage('');
      setReplyToMessage(null);
    } else {
      setFailedMessages((prev) => [...prev, { tempId: `failed-${Date.now()}`, content, replyToId: replyToMessage?.id, timestamp: new Date() }]);
    }
  }, [sendMessage, stopTyping, replyToMessage]);

  const handleReply = useCallback((msg: Message) => {
    setReplyToMessage(msg);
    composerRef.current?.focus();
  }, []);

  const handleReaction = useCallback((messageId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const msgReactions = prev[messageId] || {};
      const emojiUsers = msgReactions[emoji] || [];
      const userId = currentUser?.id || '';

      if (emojiUsers.includes(userId)) {
        return { ...prev, [messageId]: { ...msgReactions, [emoji]: emojiUsers.filter((id) => id !== userId) } };
      } else {
        return { ...prev, [messageId]: { ...msgReactions, [emoji]: [...emojiUsers, userId] } };
      }
    });
  }, [currentUser?.id]);

  const getMessageStatus = useCallback((msg: Message): MessageStatus => {
    if (msg.id.startsWith('temp-')) return 'sending';
    if (msg.readCount && msg.readCount > 0) return 'read';
    if (msg.deliveredCount && msg.deliveredCount > 0) return 'delivered';
    return 'sent';
  }, []);

  // If no conversation selected, show empty state
  if (!selectedConversationId) {
    return <EmptyConversation />;
  }

  return (
    <div className="h-full flex flex-col bg-[var(--gp-background)] transition-colors duration-300">
      {/* Chat Header */}
      <div className="p-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)] flex items-center justify-between transition-colors duration-300">
        <div className="flex items-center gap-3">
          {isMobile && showRightPanel && (
            <button
              onClick={goBackToList}
              className="p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {currentConversation?.isGroup || currentConversation?.type === 'group' ? (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.royalIndigo})` }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          ) : (
            <LanguageOrb code={currentConversation?.members?.[0]?.user?.systemLanguage || 'fr'} size="md" pulse={false} />
          )}

          <div>
            <h2 className="font-semibold text-[var(--gp-text-primary)]">{currentConversation?.title || 'Conversation'}</h2>
            <span className="text-sm text-[var(--gp-text-muted)]">
              {currentTypingUsers.length > 0
                ? 'Quelqu\'un ecrit...'
                : currentConversation?.type === 'group'
                ? `${currentConversation.members?.length || 0} participants`
                : 'En ligne'}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Tooltip content="Appel audio">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </Button>
          </Tooltip>
          <Tooltip content="Options">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[var(--gp-background)] transition-colors duration-300">
        {hasMoreMessages && (
          <button
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            className="self-center px-4 py-2 text-sm rounded-full transition-colors disabled:opacity-50 bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]"
          >
            {isLoadingMore ? 'Chargement...' : 'Charger plus de messages'}
          </button>
        )}

        {isLoadingMessages ? (
          <MessagesSkeleton />
        ) : displayMessages.length === 0 && failedMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[var(--gp-text-muted)]">Aucun message dans cette conversation</p>
              <p className="text-sm mt-2 text-[var(--gp-text-muted)]">Envoyez le premier message !</p>
            </div>
          </div>
        ) : (
          displayMessages.map((msg, index) => {
            const isSent = msg.senderId === currentUser?.id;
            const showTimestamp = index === 0 || new Date(msg.createdAt).toDateString() !== new Date(displayMessages[index - 1].createdAt).toDateString();
            const status = isSent ? getMessageStatus(msg) : undefined;
            const reactions = messageReactions[msg.id] || {};
            const repliedMessage = msg.replyToId ? displayMessages.find((m) => m.id === msg.replyToId) : null;

            return (
              <div key={msg.id}>
                {showTimestamp && <MessageTimestamp timestamp={msg.createdAt.toString()} format="date" showSeparators />}

                <div className="group relative">
                  {repliedMessage && (
                    <div className={`mb-1 ${isSent ? 'flex justify-end' : ''}`}>
                      <div className="max-w-[60%] opacity-80">
                        <ReplyPreview
                          authorName={(repliedMessage.sender as any)?.displayName || 'Unknown'}
                          content={repliedMessage.content}
                          contentType="text"
                          languageCode={repliedMessage.originalLanguage || 'fr'}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className={`mb-2 ${isSent ? 'flex justify-end' : ''}`}>
                      <div className="max-w-[75%]">
                        <MessageAttachments attachments={msg.attachments} isSent={isSent} />
                      </div>
                    </div>
                  )}

                  <MessageBubble
                    isSent={isSent}
                    languageCode={msg.originalLanguage || 'fr'}
                    languageName={msg.originalLanguage || 'Francais'}
                    content={msg.content}
                    translations={msg.translations?.filter((t) => t.language && t.content).map((t) => ({
                      languageCode: t.language,
                      languageName: t.language,
                      content: t.content,
                    })) || []}
                    sender={!isSent ? (msg.sender as any)?.displayName || (msg.sender as any)?.username : undefined}
                    timestamp={
                      <span className="inline-flex items-center gap-1">
                        {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {msg.isEdited && <span className="text-[10px]">(modifie)</span>}
                        {status && <MessageStatusIndicator status={status} />}
                      </span>
                    }
                  />

                  <div className={`absolute top-0 ${isSent ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                    <Tooltip content="Repondre">
                      <button
                        onClick={() => handleReply(msg)}
                        className="p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors text-[var(--gp-text-muted)]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip content="Reagir">
                      <button
                        onClick={() => handleReaction(msg.id, '👍')}
                        className="p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors text-[var(--gp-text-muted)]"
                      >
                        <span className="text-sm">👍</span>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {currentTypingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-[var(--gp-text-muted)]">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Quelqu'un ecrit...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Bar */}
      {replyToMessage && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]">
          <div className="flex-1 min-w-0">
            <ReplyPreview
              authorName={(replyToMessage.sender as any)?.displayName || 'Unknown'}
              content={replyToMessage.content}
              contentType="text"
              languageCode={replyToMessage.originalLanguage || 'fr'}
            />
          </div>
          <button onClick={() => setReplyToMessage(null)} className="p-2 rounded-full hover:bg-[var(--gp-hover)] transition-colors text-[var(--gp-text-muted)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Message Composer */}
      <MessageComposer
        ref={composerRef}
        value={message}
        onChange={handleMessageChange}
        onSend={handleSend}
        placeholder={replyToMessage ? 'Repondre...' : 'Ecrivez votre message...'}
        selectedLanguage={currentUser?.systemLanguage || 'fr'}
        disabled={isSending || !messagesConnected}
        showVoice={true}
        showLocation={true}
        showAttachment={true}
      />

      {/* Drawer */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversationName={currentConversation?.title || ''}
        onNameChange={() => {}}
        notificationLevel={drawerNotifications}
        onNotificationChange={setDrawerNotifications}
        themeColor={drawerTheme}
        availableColors={availableThemeColors}
        onThemeChange={setDrawerTheme}
        categories={mockCategories}
        selectedCategoryId={drawerCategoryId}
        onCategorySelect={setDrawerCategoryId}
        onCategoryCreate={() => {}}
        onCategoryDelete={() => {}}
        tags={mockTags}
        selectedTagIds={drawerTagIds}
        onTagSelect={(id) => setDrawerTagIds((prev) => [...prev, id])}
        onTagDeselect={(id) => setDrawerTagIds((prev) => prev.filter((t) => t !== id))}
        onTagCreate={() => {}}
        onTagDelete={() => {}}
        onSettingsClick={() => { router.push('/v2/settings'); setDrawerOpen(false); }}
        onProfileClick={() => { router.push('/v2/me'); setDrawerOpen(false); }}
        onSearchClick={() => setDrawerOpen(false)}
        onBlockClick={() => setDrawerOpen(false)}
        onReportClick={() => setDrawerOpen(false)}
      />
    </div>
  );
}
