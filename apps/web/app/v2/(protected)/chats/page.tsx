'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Input,
  LanguageOrb,
  MessageBubble,
  MessageComposer,
  MessageTimestamp,
  ReplyPreview,
  ImageGallery,
  AudioPlayer,
  VideoPlayer,
  theme,
  useResizer,
  ConversationItem,
  CategoryHeader,
  CategoryIcons,
  CommunityCarousel,
  ConversationDrawer,
  ThemeToggle,
} from '@/components/v2';
import type { CommunityItem, TagItem, ConversationItemData } from '@/components/v2';
import { useConversationsV2, useMessagesV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';
import type { User, Message } from '@meeshy/shared/types';

// ============================================================================
// Types
// ============================================================================

// Conversation filter categories as specified by user:
// "Public, Groupe, Globale, Direct (Privée) Non lue"
type ConversationFilter = 'public' | 'groupe' | 'globale' | 'direct' | 'non_lue';

// Local storage key for filter persistence
const FILTER_STORAGE_KEY = 'meeshy_v2_conversation_filter';

// Message status type
type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

// Common emoji reactions
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Failed message interface
interface FailedMessage {
  tempId: string;
  content: string;
  replyToId?: string;
  timestamp: Date;
}

// ============================================================================
// Mock Data (to be replaced with real data later)
// ============================================================================

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

const mockCategories: TagItem[] = [
  { id: 'work', name: 'Travail', color: theme.colors.deepTeal },
  { id: 'personal', name: 'Personnel', color: theme.colors.royalIndigo },
  { id: 'clients', name: 'Clients', color: theme.colors.terracotta },
];

const mockTags: TagItem[] = [
  { id: 'urgent', name: 'Urgent', color: '#EF4444' },
  { id: 'important', name: 'Important', color: theme.colors.goldAccent },
  { id: 'follow', name: 'A suivre', color: theme.colors.jadeGreen },
];

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
  sender: {
    displayName: string;
    username: string;
  };
  attachments?: Array<{
    type: 'image' | 'audio' | 'video' | 'file';
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
    duration?: number;
  }>;
  translations?: Array<{
    language: string;
    content: string;
  }>;
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
    createdAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-2',
    senderId: DEMO_OTHER_USER_ID,
    content: '',
    createdAt: new Date(Date.now() - 3600000 * 1.9), // 1.9 hours ago
    originalLanguage: 'fr',
    messageType: 'image',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    attachments: [
      {
        type: 'image',
        url: 'https://picsum.photos/seed/italy1/400/300',
        name: 'colisee.jpg',
        mimeType: 'image/jpeg',
      },
      {
        type: 'image',
        url: 'https://picsum.photos/seed/italy2/400/300',
        name: 'venise.jpg',
        mimeType: 'image/jpeg',
      },
      {
        type: 'image',
        url: 'https://picsum.photos/seed/italy3/300/400',
        name: 'florence.jpg',
        mimeType: 'image/jpeg',
      },
      {
        type: 'image',
        url: 'https://picsum.photos/seed/italy4/400/300',
        name: 'pise.jpg',
        mimeType: 'image/jpeg',
      },
    ],
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-3',
    senderId: DEMO_USER_ID,
    content: 'Wow, c\'est superbe ! Tu as de la chance ! Voici un message vocal pour toi :',
    createdAt: new Date(Date.now() - 3600000 * 1.5), // 1.5 hours ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Moi',
      username: 'me',
    },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-4',
    senderId: DEMO_USER_ID,
    content: '',
    createdAt: new Date(Date.now() - 3600000 * 1.4), // 1.4 hours ago
    originalLanguage: 'fr',
    messageType: 'audio',
    sender: {
      displayName: 'Moi',
      username: 'me',
    },
    attachments: [
      {
        type: 'audio',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        name: 'message_vocal.mp3',
        mimeType: 'audio/mpeg',
        duration: 45,
      },
    ],
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-5',
    senderId: DEMO_OTHER_USER_ID,
    content: 'Merci ! Voici une petite video de la Fontaine de Trevi :',
    createdAt: new Date(Date.now() - 3600000), // 1 hour ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-6',
    senderId: DEMO_OTHER_USER_ID,
    content: '',
    createdAt: new Date(Date.now() - 3600000 * 0.9), // 0.9 hours ago
    originalLanguage: 'fr',
    messageType: 'video',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    attachments: [
      {
        type: 'video',
        url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
        name: 'fontaine_trevi.mp4',
        mimeType: 'video/mp4',
        duration: 30,
      },
    ],
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-7',
    senderId: DEMO_USER_ID,
    content: 'Incroyable ! Tu peux m\'envoyer ton itineraire ? Je planifie un voyage similaire.',
    createdAt: new Date(Date.now() - 1800000), // 30 min ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Moi',
      username: 'me',
    },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-8',
    senderId: DEMO_OTHER_USER_ID,
    content: 'Bien sur ! Voici le PDF avec tout mon itineraire detaille :',
    createdAt: new Date(Date.now() - 1200000), // 20 min ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-9',
    senderId: DEMO_OTHER_USER_ID,
    content: '',
    createdAt: new Date(Date.now() - 1100000), // 18 min ago
    originalLanguage: 'fr',
    messageType: 'file',
    sender: {
      displayName: 'Marie Dupont',
      username: 'marie_d',
    },
    attachments: [
      {
        type: 'file',
        url: '#',
        name: 'Itineraire_Italie_2024.pdf',
        mimeType: 'application/pdf',
        size: 2457600, // 2.4 MB
      },
    ],
    deliveredCount: 1,
    readCount: 1,
  },
  {
    id: 'demo-msg-10',
    senderId: DEMO_USER_ID,
    content: 'Super merci beaucoup ! Je vais regarder ca ce soir.',
    createdAt: new Date(Date.now() - 600000), // 10 min ago
    originalLanguage: 'fr',
    messageType: 'text',
    sender: {
      displayName: 'Moi',
      username: 'me',
    },
    deliveredCount: 1,
    readCount: 1,
  },
];

// ============================================================================
// Message Status Indicator
// ============================================================================

function MessageStatusIndicator({ status }: { status: MessageStatus }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'sending':
        return (
          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        );
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
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: theme.colors.jadeGreen }}>
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

  return (
    <span className="inline-flex items-center ml-1" style={{ color: 'var(--gp-text-muted)' }}>
      {getStatusIcon()}
    </span>
  );
}

// ============================================================================
// Message Context Menu
// ============================================================================

interface MessageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  isSent: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReact: (emoji: string) => void;
  onCopy: () => void;
}

function MessageContextMenu({
  isOpen,
  position,
  isSent,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onCopy,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] rounded-xl overflow-hidden shadow-lg border border-[var(--gp-border)] bg-[var(--gp-surface)]"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translateY(-50%)',
        }}
      >
        {/* Quick reactions row */}
        <div className="flex items-center justify-around p-2 border-b border-[var(--gp-border)]">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(emoji);
                onClose();
              }}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-full hover:bg-[var(--gp-hover)] transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="py-1">
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--gp-hover)] transition-colors"
            style={{ color: 'var(--gp-text-primary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            Repondre
          </button>

          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--gp-hover)] transition-colors"
            style={{ color: 'var(--gp-text-primary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copier
          </button>

          {isSent && onEdit && (
            <button
              onClick={() => {
                onEdit();
                onClose();
              }}
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--gp-hover)] transition-colors"
              style={{ color: 'var(--gp-text-primary)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier
            </button>
          )}

          {isSent && onDelete && (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-[var(--gp-hover)] transition-colors"
              style={{ color: 'var(--gp-error)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Supprimer
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Edit Message Modal
// ============================================================================

interface EditMessageModalProps {
  isOpen: boolean;
  originalContent: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

function EditMessageModal({ isOpen, originalContent, onClose, onSave }: EditMessageModalProps) {
  const [content, setContent] = useState(originalContent);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(originalContent);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, originalContent]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (content.trim() && content !== originalContent) {
      onSave(content.trim());
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6 rounded-2xl bg-[var(--gp-surface)] border border-[var(--gp-border)] shadow-xl">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--gp-text-primary)' }}>
          Modifier le message
        </h3>

        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-32 p-3 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-background)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gp-terracotta)]"
          style={{ color: 'var(--gp-text-primary)' }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={!content.trim() || content === originalContent}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Reply Bar (shown above composer when replying)
// ============================================================================

interface ReplyBarProps {
  message: Message;
  onCancel: () => void;
}

function ReplyBar({ message, onCancel }: ReplyBarProps) {
  const senderName = (message.sender as any)?.displayName || (message.sender as any)?.username || 'Unknown';

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b border-[var(--gp-border)] bg-[var(--gp-surface)]"
    >
      <div className="flex-1 min-w-0">
        <ReplyPreview
          authorName={senderName}
          content={message.content}
          contentType={message.messageType === 'image' ? 'image' : message.messageType === 'audio' ? 'audio' : 'text'}
          languageCode={message.originalLanguage || 'fr'}
        />
      </div>
      <button
        onClick={onCancel}
        className="p-2 rounded-full hover:bg-[var(--gp-hover)] transition-colors"
        style={{ color: 'var(--gp-text-muted)' }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// Failed Message Retry Component
// ============================================================================

interface FailedMessageProps {
  message: FailedMessage;
  onRetry: () => void;
  onDelete: () => void;
}

function FailedMessageComponent({ message, onRetry, onDelete }: FailedMessageProps) {
  return (
    <div className="flex flex-row-reverse gap-2">
      <div
        className="max-w-[75%] rounded-2xl rounded-br-md p-4 relative"
        style={{
          background: 'color-mix(in srgb, var(--gp-error) 15%, var(--gp-surface))',
          border: '1px solid var(--gp-error)',
        }}
      >
        <p className="text-[0.95rem] leading-relaxed" style={{ color: 'var(--gp-text-primary)' }}>
          {message.content}
        </p>

        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--gp-error)' }}>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--gp-error)' }}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            Echec de l'envoi
          </span>

          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="text-xs font-medium px-2 py-1 rounded hover:bg-[var(--gp-hover)] transition-colors"
              style={{ color: theme.colors.terracotta }}
            >
              Reessayer
            </button>
            <button
              onClick={onDelete}
              className="text-xs font-medium px-2 py-1 rounded hover:bg-[var(--gp-hover)] transition-colors"
              style={{ color: 'var(--gp-text-muted)' }}
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Message Reactions Display
// ============================================================================

interface MessageReactionsProps {
  reactions: Record<string, string[]>; // emoji -> userIds
  currentUserId?: string;
  onReactionClick: (emoji: string) => void;
}

function MessageReactions({ reactions, currentUserId, onReactionClick }: MessageReactionsProps) {
  const reactionEntries = Object.entries(reactions).filter(([_, users]) => users.length > 0);

  if (reactionEntries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactionEntries.map(([emoji, userIds]) => {
        const hasReacted = currentUserId && userIds.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => onReactionClick(emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
              hasReacted ? 'ring-1 ring-[var(--gp-terracotta)]' : ''
            }`}
            style={{
              background: hasReacted ? 'color-mix(in srgb, var(--gp-terracotta) 15%, transparent)' : 'var(--gp-parchment)',
            }}
          >
            <span>{emoji}</span>
            <span style={{ color: 'var(--gp-text-secondary)' }}>{userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Message Attachments Display
// ============================================================================

interface MessageAttachmentsProps {
  attachments: any[];
  isSent: boolean;
}

function MessageAttachments({ attachments, isSent }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const videos = attachments.filter((a) => a.type === 'video' || a.mimeType?.startsWith('video/'));
  const audio = attachments.filter((a) => a.type === 'audio' || a.mimeType?.startsWith('audio/'));
  const files = attachments.filter((a) =>
    a.type === 'file' ||
    (a.mimeType && !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('audio/') && !a.mimeType.startsWith('video/'))
  );

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  // Helper to get file icon based on mime type
  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.includes('pdf')) {
      return (
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9.5c0 .83-.67 1.5-1.5 1.5H7v2H5.5v-6H8.5c.83 0 1.5.67 1.5 1.5v1zm5 .5c0 1.11-.89 2-2 2h-1v2h-1.5v-6H13c1.11 0 2 .89 2 2v1zm5-1h-1.5v1h1v1.5h-1v1H17v1.5h-1.5v-6H19v1.5z"/>
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  return (
    <div className="space-y-3">
      {/* Images */}
      {images.length > 0 && (
        <ImageGallery
          images={images.map((img) => ({
            url: img.url || img.path,
            alt: img.name || 'Image',
          }))}
          maxVisible={4}
        />
      )}

      {/* Videos */}
      {videos.map((video, index) => (
        <div key={`video-${index}`} className="max-w-[320px]">
          <VideoPlayer
            src={video.url || video.path}
            poster={video.thumbnail}
            duration={video.duration}
          />
        </div>
      ))}

      {/* Audio */}
      {audio.map((aud, index) => (
        <AudioPlayer
          key={`audio-${index}`}
          src={aud.url || aud.path}
          duration={aud.duration}
        />
      ))}

      {/* Files (Documents) */}
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
            style={{ background: isSent ? 'rgba(255,255,255,0.2)' : theme.colors.deepTeal }}
          >
            {getFileIcon(file.mimeType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isSent ? 'text-white' : ''}`} style={!isSent ? { color: 'var(--gp-text-primary)' } : undefined}>
              {file.name || 'Fichier'}
            </p>
            <p className={`text-xs ${isSent ? 'text-white/60' : ''}`} style={!isSent ? { color: 'var(--gp-text-muted)' } : undefined}>
              {file.size ? formatFileSize(file.size) : 'Document'}
            </p>
          </div>
          <svg className={`w-5 h-5 flex-shrink-0 ${isSent ? 'text-white/60' : ''}`} style={!isSent ? { color: 'var(--gp-text-muted)' } : undefined} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      ))}
    </div>
  );
}

// ============================================================================
// Filter Tabs Component (under CommunityCarousel)
// ============================================================================

// Filter counts matching user categories: Public, Groupe, Globale, Direct (Privée), Non lue
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
  // Categories as specified by user: "Public, Groupe, Globale, Direct (Privée) Non lue"
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
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
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
              className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 border ${
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

// ============================================================================
// Infinite Scroll Trigger
// ============================================================================

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

// ============================================================================
// Loading States
// ============================================================================

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

// ============================================================================
// Main Component
// ============================================================================

export default function V2ChatsPage() {
  // Router for navigation
  const router = useRouter();

  // Auth
  const { user: currentUser, isAuthenticated } = useAuth();

  // State with localStorage persistence for filter
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>(() => {
    // Load from localStorage on initial render
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      // Validate against user-specified categories: public, groupe, globale, direct, non_lue
      if (saved && ['public', 'groupe', 'globale', 'direct', 'non_lue'].includes(saved)) {
        return saved as ConversationFilter;
      }
    }
    return 'direct'; // Default to Direct (private) conversations
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [categories] = useState(mockCategories);
  const [tags] = useState(mockTags);

  // Drawer state
  const [drawerNotifications, setDrawerNotifications] = useState<'all' | 'mentions' | 'none'>('all');
  const [drawerTheme, setDrawerTheme] = useState(theme.colors.terracotta);
  const [drawerCategoryId, setDrawerCategoryId] = useState<string | undefined>();
  const [drawerTagIds, setDrawerTagIds] = useState<string[]>([]);

  // Local state for conversation customizations (demo purposes)
  const [customConversationNames, setCustomConversationNames] = useState<Record<string, string>>({});
  const [pinnedConversationIds, setPinnedConversationIds] = useState<Set<string>>(new Set());
  const [mutedConversationIds, setMutedConversationIds] = useState<Set<string>>(new Set());

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Resizer for desktop
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useResizer(30, 10, 50);

  // Conversations hook
  const {
    conversationItems,
    currentConversation,
    pinnedConversations,
    uncategorizedConversations,
    isLoading: isLoadingConversations,
    isLoadingMore: isLoadingMoreConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    isConnected: conversationsConnected,
    error: conversationsError,
    selectConversation: handleSelectConversation,
    refreshConversations,
    typingUsers: conversationTypingUsers,
    onlineUsers,
  } = useConversationsV2(selectedConversationId, {
    enabled: isAuthenticated,
    currentUserId: currentUser?.id,
  });

  // Filter and search conversations
  const filteredConversations = useMemo(() => {
    let filtered = [...conversationItems];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conv) =>
          conv.name.toLowerCase().includes(query) ||
          conv.lastMessage.content.toLowerCase().includes(query) ||
          conv.customName?.toLowerCase().includes(query)
      );
    }

    // Apply category filter based on user-specified categories:
    // Public, Groupe, Globale, Direct (Privée), Non lue
    switch (activeFilter) {
      case 'public':
        // Public conversations (visible to everyone)
        filtered = filtered.filter(
          (conv) => conv.isGroup && (conv as any).visibility === 'public'
        );
        break;
      case 'groupe':
        // Groupe conversations (multi-participant but not public)
        filtered = filtered.filter(
          (conv) => conv.isGroup && (conv as any).visibility !== 'public'
        );
        break;
      case 'globale':
        // Globale/broadcast conversations
        filtered = filtered.filter(
          (conv) => (conv as any).type === 'global' || (conv as any).type === 'broadcast'
        );
        break;
      case 'direct':
        // Direct/Privée 1-to-1 conversations
        filtered = filtered.filter((conv) => !conv.isGroup);
        break;
      case 'non_lue':
        // Non lue (unread) conversations
        filtered = filtered.filter((conv) => conv.unreadCount > 0);
        break;
    }

    // Apply community filter
    if (selectedCommunityId) {
      // TODO: Filter by community when community data is available
    }

    return filtered;
  }, [conversationItems, searchQuery, activeFilter, selectedCommunityId]);

  // Separate pinned and unpinned from filtered list
  const filteredPinned = useMemo(
    () => filteredConversations.filter((conv) => conv.isPinned),
    [filteredConversations]
  );

  const filteredUnpinned = useMemo(
    () => filteredConversations.filter((conv) => !conv.isPinned),
    [filteredConversations]
  );

  // Count stats for filter tabs
  // Count stats for filter tabs - using user-specified categories:
  // Public, Groupe, Globale, Direct (Privée), Non lue
  const filterCounts = useMemo<FilterCounts>(() => {
    return {
      // Public conversations (visible to everyone, e.g., community channels)
      public: conversationItems.filter((conv) =>
        conv.isGroup && (conv as any).visibility === 'public'
      ).length,
      // Groupe conversations (multi-participant but not public)
      groupe: conversationItems.filter((conv) =>
        conv.isGroup && (conv as any).visibility !== 'public'
      ).length,
      // Globale conversations (broadcast, system-wide)
      globale: conversationItems.filter((conv) =>
        (conv as any).type === 'global' || (conv as any).type === 'broadcast'
      ).length,
      // Direct/Privée conversations (1-to-1)
      direct: conversationItems.filter((conv) => !conv.isGroup).length,
      // Non lue (unread conversations)
      non_lue: conversationItems.filter((conv) => conv.unreadCount > 0).length,
    };
  }, [conversationItems]);

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
    error: messagesError,
  } = useMessagesV2(selectedConversationId, currentUser as User | null, {
    enabled: !!selectedConversationId && isAuthenticated,
    containerRef: messagesContainerRef,
  });

  // Use demo messages as fallback when no real messages exist
  // This provides example media messages for demonstration purposes
  const displayMessages = useMemo(() => {
    // If we have real messages from the API, use them
    if (messages.length > 0) {
      return messages;
    }
    // If a conversation is selected but has no messages, show demo messages
    if (selectedConversationId && !isLoadingMessages) {
      // Map demo messages to match the Message type structure
      return mockDemoMessages.map((demoMsg) => ({
        ...demoMsg,
        conversationId: selectedConversationId,
        // Use current user ID for "sent" messages in demo
        senderId: demoMsg.senderId === DEMO_USER_ID ? (currentUser?.id || DEMO_USER_ID) : demoMsg.senderId,
      })) as unknown as Message[];
    }
    return messages;
  }, [messages, selectedConversationId, isLoadingMessages, currentUser?.id]);

  // Reply state
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    message: Message | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, message: null });

  // Failed messages state
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);

  // Message reactions state (temporary - should come from backend)
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<string, string[]>>>({});

  // Combined connection status
  const isConnected = conversationsConnected && messagesConnected;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && displayMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayMessages.length]);

  // Handle conversation selection
  const selectConversation = useCallback((id: string | null) => {
    setSelectedConversationId(id);
    if (id) {
      handleSelectConversation(id);
    }
  }, [handleSelectConversation]);

  // Handle message input change with typing indicator
  const handleMessageChange = useCallback((value: string) => {
    setMessage(value);
    if (value.trim()) {
      startTyping();
    } else {
      stopTyping();
    }
  }, [startTyping, stopTyping]);

  // Handle send message
  const handleSend = useCallback(async (
    content: string,
    _attachments: any[],
    languageCode: string
  ) => {
    if (!content.trim()) return;

    stopTyping();

    const options: { language: string; replyToId?: string } = { language: languageCode };
    if (replyToMessage) {
      options.replyToId = replyToMessage.id;
    }

    const success = await sendMessage(content, options);

    if (success) {
      setMessage('');
      setReplyToMessage(null);
    } else {
      // Add to failed messages
      setFailedMessages((prev) => [
        ...prev,
        {
          tempId: `failed-${Date.now()}`,
          content,
          replyToId: replyToMessage?.id,
          timestamp: new Date(),
        },
      ]);
    }
  }, [sendMessage, stopTyping, replyToMessage]);

  // Handle message context menu
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      message: msg,
    });
  }, []);

  // Handle reply
  const handleReply = useCallback((msg: Message) => {
    setReplyToMessage(msg);
    composerRef.current?.focus();
  }, []);

  // Handle edit
  const handleEdit = useCallback((msg: Message) => {
    setEditingMessage(msg);
  }, []);

  // Handle save edit
  const handleSaveEdit = useCallback(async (content: string) => {
    if (!editingMessage) return;
    await editMessage(editingMessage.id, content);
    setEditingMessage(null);
  }, [editMessage, editingMessage]);

  // Handle delete
  const handleDelete = useCallback(async (msg: Message) => {
    if (confirm('Voulez-vous vraiment supprimer ce message ?')) {
      await deleteMessage(msg.id);
    }
  }, [deleteMessage]);

  // Handle reaction
  const handleReaction = useCallback((messageId: string, emoji: string) => {
    setMessageReactions((prev) => {
      const msgReactions = prev[messageId] || {};
      const emojiUsers = msgReactions[emoji] || [];
      const userId = currentUser?.id || '';

      if (emojiUsers.includes(userId)) {
        // Remove reaction
        return {
          ...prev,
          [messageId]: {
            ...msgReactions,
            [emoji]: emojiUsers.filter((id) => id !== userId),
          },
        };
      } else {
        // Add reaction
        return {
          ...prev,
          [messageId]: {
            ...msgReactions,
            [emoji]: [...emojiUsers, userId],
          },
        };
      }
    });
    // TODO: Call API to persist reaction
  }, [currentUser?.id]);

  // Handle copy message
  const handleCopyMessage = useCallback((msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    // TODO: Show toast notification
  }, []);

  // Handle retry failed message
  const handleRetryFailedMessage = useCallback(async (failedMsg: FailedMessage) => {
    setFailedMessages((prev) => prev.filter((m) => m.tempId !== failedMsg.tempId));

    const success = await sendMessage(failedMsg.content, {
      language: currentUser?.systemLanguage || 'fr',
      replyToId: failedMsg.replyToId,
    });

    if (!success) {
      // Re-add to failed messages
      setFailedMessages((prev) => [...prev, failedMsg]);
    }
  }, [sendMessage, currentUser?.systemLanguage]);

  // Handle delete failed message
  const handleDeleteFailedMessage = useCallback((tempId: string) => {
    setFailedMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  // Get message status
  const getMessageStatus = useCallback((msg: Message): MessageStatus => {
    if (msg.id.startsWith('temp-')) return 'sending';
    if (msg.readCount && msg.readCount > 0) return 'read';
    if (msg.deliveredCount && msg.deliveredCount > 0) return 'delivered';
    return 'sent';
  }, []);

  // Get current typing users (exclude self)
  const currentTypingUsers = useMemo(() => {
    const users = Array.from(messageTypingUsers).filter(id => id !== currentUser?.id);
    return users;
  }, [messageTypingUsers, currentUser?.id]);

  // Mobile view logic
  const showMobileChat = selectedConversationId !== null;

  // Handle conversation actions
  const handleConversationAction = useCallback((id: string, action: string) => {
    switch (action) {
      case 'pin':
        setPinnedConversationIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        break;
      case 'mute':
        setMutedConversationIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        break;
      case 'archive':
      case 'delete':
      case 'read':
      case 'important':
      case 'add-tag':
      case 'call':
        // TODO: Implement these actions via API
        console.log('Conversation action:', id, action);
        break;
      default:
        console.log('Unknown conversation action:', id, action);
    }
  }, []);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Handle filter change with localStorage persistence
  const handleFilterChange = useCallback((filter: ConversationFilter) => {
    setActiveFilter(filter);
    // Save to localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem(FILTER_STORAGE_KEY, filter);
    }
  }, []);

  return (
    <div className="h-screen flex relative bg-[var(--gp-background)] text-[var(--gp-text-primary)] transition-colors duration-300">
      {/* Sidebar */}
      <div
        className={`
          sidebar-container border-r flex-col relative
          ${showMobileChat ? 'hidden md:flex' : 'flex'}
          w-full
          bg-[var(--gp-surface)] border-[var(--gp-border)]
          transition-colors duration-300
        `}
        style={{
          '--sidebar-width': `${sidebarWidth}%`,
        } as React.CSSProperties}
      >
        <style>{`
          @media (min-width: 768px) {
            .sidebar-container {
              min-width: 280px;
              max-width: 50%;
              width: var(--sidebar-width);
            }
          }
        `}</style>

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
              <span className="font-semibold text-[var(--gp-text-primary)]">
                Messages
              </span>
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
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>
            {/* Active filter indicator (visible when not searching) */}
            {!searchFocused && (
              <button
                onClick={() => setSearchFocused(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-full border transition-colors hover:border-[var(--gp-terracotta)]"
                style={{
                  background: 'var(--gp-surface)',
                  borderColor: 'var(--gp-border)',
                  color: 'var(--gp-text-secondary)',
                }}
                title="Cliquez pour changer le filtre"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                </svg>
                {{
                  public: 'Public',
                  groupe: 'Groupe',
                  globale: 'Globale',
                  direct: 'Direct',
                  non_lue: 'Non lue',
                }[activeFilter]}
              </button>
            )}
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--gp-hover)] transition-colors"
              style={{ color: 'var(--gp-text-muted)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Communities Carousel + Filter Tabs (appears on search focus) */}
        <CommunityCarousel
          communities={mockCommunities}
          isVisible={searchFocused}
          onCommunityClick={(id) => {
            setSelectedCommunityId(id === '__all__' ? null : id);
          }}
          totalConversations={conversationItems.length}
          archivedConversations={0}
          selectedId={selectedCommunityId}
        />

        {/* Filter Tabs - integrated under CommunityCarousel, visible on search focus */}
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
          {isLoadingConversations ? (
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
                  : (() => {
                      const filterLabels: Record<ConversationFilter, string> = {
                        public: 'publique',
                        groupe: 'de groupe',
                        globale: 'globale',
                        direct: 'privee',
                        non_lue: 'non lue',
                      };
                      return `Aucune conversation ${filterLabels[activeFilter]}`;
                    })()}
              </p>
              {!searchQuery && activeFilter === 'direct' && (
                <p className="text-sm mt-2" style={{ color: 'var(--gp-text-muted)' }}>
                  Commencez une nouvelle conversation
                </p>
              )}
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="mt-3"
                >
                  Effacer la recherche
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Pinned Conversations */}
              {filteredPinned.length > 0 && (
                <div>
                  <CategoryHeader
                    id="pinned"
                    name="Epinglees"
                    icon={CategoryIcons.pinned}
                    count={filteredPinned.length}
                  />
                  {filteredPinned.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedConversationId === conv.id}
                      onClick={() => selectConversation(conv.id)}
                      onArchive={() => handleConversationAction(conv.id, 'archive')}
                      onDelete={() => handleConversationAction(conv.id, 'delete')}
                      onMarkRead={() => handleConversationAction(conv.id, 'read')}
                      onMute={() => handleConversationAction(conv.id, 'mute')}
                      onPin={() => handleConversationAction(conv.id, 'pin')}
                      onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                      onAddTag={() => handleConversationAction(conv.id, 'add-tag')}
                      onCall={() => handleConversationAction(conv.id, 'call')}
                      onOptionsClick={() => setDrawerOpen(true)}
                    />
                  ))}
                </div>
              )}

              {/* Section header for unpinned when there are pinned */}
              {filteredPinned.length > 0 && filteredUnpinned.length > 0 && (
                <CategoryHeader
                  id="all"
                  name="Conversations"
                  icon={CategoryIcons.all}
                  count={filteredUnpinned.length}
                />
              )}

              {/* Unpinned Conversations */}
              {filteredUnpinned.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedConversationId === conv.id}
                  onClick={() => selectConversation(conv.id)}
                  onArchive={() => handleConversationAction(conv.id, 'archive')}
                  onDelete={() => handleConversationAction(conv.id, 'delete')}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => handleConversationAction(conv.id, 'add-tag')}
                  onCall={() => handleConversationAction(conv.id, 'call')}
                  onOptionsClick={() => setDrawerOpen(true)}
                />
              ))}

              {/* Infinite scroll trigger */}
              <InfiniteScrollTrigger
                hasMore={hasMoreConversations}
                isLoading={isLoadingMoreConversations}
                onLoadMore={loadMoreConversations}
              />
            </>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="p-2 border-t flex justify-around" style={{ borderColor: 'var(--gp-parchment)' }}>
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
          <Link href="/v2/me">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Button>
          </Link>
        </div>
      </div>

      {/* Resizer (desktop only) */}
      <div
        className="hidden md:block w-1 cursor-ew-resize hover:bg-terracotta/50 active:bg-terracotta transition-colors relative group"
        style={{ background: 'var(--gp-parchment)' }}
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
      <div
        className={`
          flex-1 flex-col
          ${showMobileChat ? 'flex' : 'hidden md:flex'}
          w-full md:flex-1
        `}
      >
        {currentConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-[var(--gp-border)] bg-[var(--gp-surface)] flex items-center justify-between transition-colors duration-300">
              <div className="flex items-center gap-3">
                {/* Back button (mobile) */}
                <button
                  onClick={() => selectConversation(null)}
                  className="md:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {currentConversation.isGroup || currentConversation.type === 'group' ? (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.royalIndigo})` }}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                ) : (
                  <LanguageOrb
                    code={currentConversation.members?.[0]?.user?.systemLanguage || 'fr'}
                    size="md"
                    pulse={false}
                  />
                )}

                <div>
                  <h2 className="font-semibold text-[var(--gp-text-primary)]">
                    {currentConversation.title || 'Conversation'}
                  </h2>
                  <span className="text-sm" style={{ color: 'var(--gp-text-muted)' }}>
                    {currentTypingUsers.length > 0
                      ? 'Quelqu\'un ecrit...'
                      : currentConversation.type === 'group'
                      ? `${currentConversation.members?.length || 0} participants`
                      : 'En ligne'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" title="Creer un lien">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Appel audio">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[var(--gp-background)] transition-colors duration-300"
            >
              {/* Load more button */}
              {hasMoreMessages && (
                <button
                  onClick={loadMoreMessages}
                  disabled={isLoadingMore}
                  className="self-center px-4 py-2 text-sm rounded-full transition-colors disabled:opacity-50"
                  style={{
                    background: 'var(--gp-parchment)',
                    color: 'var(--gp-text-secondary)',
                  }}
                >
                  {isLoadingMore ? 'Chargement...' : 'Charger plus de messages'}
                </button>
              )}

              {isLoadingMessages ? (
                <MessagesSkeleton />
              ) : displayMessages.length === 0 && failedMessages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p style={{ color: 'var(--gp-text-muted)' }}>
                      Aucun message dans cette conversation
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'var(--gp-text-muted)' }}>
                      Envoyez le premier message !
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {displayMessages.map((msg, index) => {
                    const isSent = msg.senderId === currentUser?.id;
                    const showTimestamp = index === 0 ||
                      new Date(msg.createdAt).toDateString() !==
                      new Date(displayMessages[index - 1].createdAt).toDateString();
                    const status = isSent ? getMessageStatus(msg) : undefined;
                    const reactions = messageReactions[msg.id] || {};

                    // Find replied message
                    const repliedMessage = msg.replyToId
                      ? displayMessages.find((m) => m.id === msg.replyToId)
                      : null;

                    return (
                      <div key={msg.id}>
                        {showTimestamp && (
                          <MessageTimestamp timestamp={msg.createdAt.toString()} format="date" showSeparators />
                        )}

                        {/* Message container with context menu trigger */}
                        <div
                          className="group relative"
                          onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                        >
                          {/* Reply preview if this message is a reply */}
                          {repliedMessage && (
                            <div className={`mb-1 ${isSent ? 'flex justify-end' : ''}`}>
                              <div className="max-w-[60%] opacity-80">
                                <ReplyPreview
                                  authorName={(repliedMessage.sender as any)?.displayName || (repliedMessage.sender as any)?.username || 'Unknown'}
                                  content={repliedMessage.content}
                                  contentType="text"
                                  languageCode={repliedMessage.originalLanguage || 'fr'}
                                  className="text-xs"
                                />
                              </div>
                            </div>
                          )}

                          {/* Attachments (if any) */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`mb-2 ${isSent ? 'flex justify-end' : ''}`}>
                              <div className="max-w-[75%]">
                                <MessageAttachments attachments={msg.attachments} isSent={isSent} />
                              </div>
                            </div>
                          )}

                          {/* Message bubble */}
                          <MessageBubble
                            isSent={isSent}
                            languageCode={msg.originalLanguage || 'fr'}
                            languageName={msg.originalLanguage || 'Francais'}
                            content={msg.content}
                            translations={msg.translations?.filter(t => t.language && t.content).map(t => ({
                              languageCode: t.language,
                              languageName: t.language,
                              content: t.content,
                            })) || []}
                            sender={!isSent ? (msg.sender as any)?.displayName || (msg.sender as any)?.username : undefined}
                            timestamp={
                              <span className="inline-flex items-center gap-1">
                                {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {msg.isEdited && (
                                  <span className="text-[10px]">(modifie)</span>
                                )}
                                {status && <MessageStatusIndicator status={status} />}
                              </span>
                            }
                          />

                          {/* Reactions */}
                          <div className={`mt-1 ${isSent ? 'flex justify-end' : ''}`}>
                            <MessageReactions
                              reactions={reactions}
                              currentUserId={currentUser?.id}
                              onReactionClick={(emoji) => handleReaction(msg.id, emoji)}
                            />
                          </div>

                          {/* Quick action buttons (visible on hover) */}
                          <div
                            className={`absolute top-0 ${isSent ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}
                          >
                            <button
                              onClick={() => handleReply(msg)}
                              className="p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors"
                              style={{ color: 'var(--gp-text-muted)' }}
                              title="Repondre"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleReaction(msg.id, '👍')}
                              className="p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors"
                              style={{ color: 'var(--gp-text-muted)' }}
                              title="Reagir"
                            >
                              <span className="text-sm">👍</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Failed messages */}
                  {failedMessages.map((failedMsg) => (
                    <FailedMessageComponent
                      key={failedMsg.tempId}
                      message={failedMsg}
                      onRetry={() => handleRetryFailedMessage(failedMsg)}
                      onDelete={() => handleDeleteFailedMessage(failedMsg.tempId)}
                    />
                  ))}
                </>
              )}

              {/* Typing indicator */}
              {currentTypingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--gp-text-muted)' }}>
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
              <ReplyBar
                message={replyToMessage}
                onCancel={() => setReplyToMessage(null)}
              />
            )}

            {/* Message Composer */}
            <MessageComposer
              ref={composerRef}
              value={message}
              onChange={handleMessageChange}
              onSend={handleSend}
              placeholder={replyToMessage ? 'Repondre...' : 'Ecrivez votre message...'}
              selectedLanguage={currentUser?.systemLanguage || 'fr'}
              disabled={isSending || !isConnected}
              showVoice={true}
              showLocation={true}
              showAttachment={true}
            />
          </>
        ) : (
          // No conversation selected
          <div className="flex-1 flex items-center justify-center bg-[var(--gp-background)]">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--gp-parchment)' }}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gp-text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p style={{ color: 'var(--gp-text-muted)' }}>Selectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversationName={
          selectedConversationId && customConversationNames[selectedConversationId]
            ? customConversationNames[selectedConversationId]
            : currentConversation?.title || ''
        }
        onNameChange={(name) => {
          // Update local custom name for the conversation
          if (selectedConversationId) {
            setCustomConversationNames((prev) => ({
              ...prev,
              [selectedConversationId]: name,
            }));
          }
        }}
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
        onSettingsClick={() => {
          // Navigate to settings
          router.push('/v2/settings');
          setDrawerOpen(false);
        }}
        onProfileClick={() => {
          // Navigate to profile - either own profile or other user's profile for 1-to-1 chat
          if (currentConversation && !currentConversation.isGroup && currentConversation.type !== 'group') {
            // 1-to-1 chat: navigate to the other user's profile
            const otherMember = currentConversation.members?.find(
              (member: any) => member.userId !== currentUser?.id
            );
            if (otherMember?.userId) {
              router.push(`/v2/profile/${otherMember.userId}`);
            } else {
              // Fallback to own profile if no other member found
              router.push('/v2/me');
            }
          } else {
            // Group chat or no conversation: navigate to own profile
            router.push('/v2/me');
          }
          setDrawerOpen(false);
        }}
        onSearchClick={() => {
          // Focus the search input
          setDrawerOpen(false);
          // Small delay to ensure drawer closes before focusing
          setTimeout(() => {
            searchInputRef.current?.focus();
            setSearchFocused(true);
          }, 100);
        }}
        onBlockClick={() => {
          // Show confirmation dialog
          const confirmed = window.confirm(
            'Etes-vous sur de vouloir bloquer cet utilisateur ? Il ne pourra plus vous envoyer de messages.'
          );
          if (confirmed) {
            // TODO: Call API to block user
            console.log('Block user confirmed for conversation:', selectedConversationId);
            setDrawerOpen(false);
          }
        }}
        onReportClick={() => {
          // Show confirmation dialog
          const confirmed = window.confirm(
            'Etes-vous sur de vouloir signaler cette conversation ? Notre equipe examinera votre signalement.'
          );
          if (confirmed) {
            // TODO: Call API to report conversation
            console.log('Report conversation confirmed:', selectedConversationId);
            setDrawerOpen(false);
          }
        }}
      />

      {/* Message Context Menu */}
      <MessageContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        isSent={contextMenu.message?.senderId === currentUser?.id}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, message: null })}
        onReply={() => contextMenu.message && handleReply(contextMenu.message)}
        onEdit={contextMenu.message?.senderId === currentUser?.id ? () => contextMenu.message && handleEdit(contextMenu.message) : undefined}
        onDelete={contextMenu.message?.senderId === currentUser?.id ? () => contextMenu.message && handleDelete(contextMenu.message) : undefined}
        onReact={(emoji) => contextMenu.message && handleReaction(contextMenu.message.id, emoji)}
        onCopy={() => contextMenu.message && handleCopyMessage(contextMenu.message)}
      />

      {/* Edit Message Modal */}
      <EditMessageModal
        isOpen={!!editingMessage}
        originalContent={editingMessage?.content || ''}
        onClose={() => setEditingMessage(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
