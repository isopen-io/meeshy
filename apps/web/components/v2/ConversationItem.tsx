'use client';

import { Badge } from './Badge';
import { LanguageOrb } from './LanguageOrb';
import { TypingIndicator } from './TypingIndicator';
import { GhostBadge } from './GhostBadge';
import { SwipeableRow, SwipeIcons, SwipeColors, SwipeAction } from './SwipeableRow';

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

export interface ConversationItemData {
  id: string;
  name: string;
  customName?: string;
  avatar?: string;
  languageCode: string;
  isOnline: boolean;
  /** @deprecated Utiliser isGroup + hasAnonymousParticipants pour les groupes */
  isAnonymous?: boolean;
  isPinned: boolean;
  isImportant: boolean;
  isMuted: boolean;
  tags: ConversationTag[];
  unreadCount: number;
  lastMessage: {
    content: string;
    type: 'text' | 'photo' | 'file' | 'voice';
    attachmentCount?: number;
    timestamp: string;
    /** Nom de l'expéditeur (pour les groupes) */
    senderName?: string;
  };
  draft?: string;
  isTyping: boolean;
  /** Indique si c'est une conversation de groupe */
  isGroup?: boolean;
  /** Nombre de participants (groupes uniquement) */
  participantCount?: number;
  /** Indique si le groupe a des participants anonymes */
  hasAnonymousParticipants?: boolean;
  /** ID de la catégorie */
  categoryId?: string;
}

export interface ConversationItemProps {
  conversation: ConversationItemData;
  isSelected?: boolean;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMute: () => void;
  onPin: () => void;
  onMarkImportant: () => void;
  onAddTag: () => void;
  onCall: () => void;
  onOptionsClick: () => void;
  onDragStart?: () => void;
  className?: string;
}

export function ConversationItem({
  conversation,
  isSelected = false,
  onClick,
  onArchive,
  onDelete,
  onMarkRead,
  onMute,
  onPin,
  onMarkImportant,
  onAddTag,
  onCall,
  onOptionsClick,
  onDragStart,
  className = '',
}: ConversationItemProps): JSX.Element {
  const displayName = conversation.customName || conversation.name;

  // Actions swipe gauche
  const leftActions: SwipeAction[] = [
    {
      id: 'archive',
      icon: SwipeIcons.archive,
      label: 'Archiver',
      ...SwipeColors.archive,
      onClick: onArchive,
    },
    {
      id: 'delete',
      icon: SwipeIcons.delete,
      label: 'Supprimer',
      ...SwipeColors.delete,
      onClick: onDelete,
    },
    {
      id: 'read',
      icon: SwipeIcons.read,
      label: 'Lu',
      ...SwipeColors.read,
      onClick: onMarkRead,
    },
    {
      id: 'mute',
      icon: SwipeIcons.mute,
      label: conversation.isMuted ? 'Son' : 'Sourdine',
      ...SwipeColors.mute,
      onClick: onMute,
    },
  ];

  // Actions swipe droite
  const rightActions: SwipeAction[] = [
    {
      id: 'pin',
      icon: SwipeIcons.pin,
      label: conversation.isPinned ? 'Desepingler' : 'Epingler',
      ...SwipeColors.pin,
      onClick: onPin,
    },
    {
      id: 'important',
      icon: SwipeIcons.important,
      label: 'Important',
      ...SwipeColors.important,
      onClick: onMarkImportant,
    },
    {
      id: 'tag',
      icon: SwipeIcons.tag,
      label: 'Tag',
      ...SwipeColors.tag,
      onClick: onAddTag,
    },
    {
      id: 'call',
      icon: SwipeIcons.call,
      label: 'Appeler',
      ...SwipeColors.call,
      onClick: onCall,
    },
  ];

  // Rendu du dernier message
  function renderLastMessage(): JSX.Element {
    if (conversation.draft) {
      return (
        <span className="flex items-center gap-1">
          <span style={{ color: 'var(--gp-terracotta)' }}>&#9999;&#65039;</span>
          <span className="truncate" style={{ color: 'var(--gp-terracotta)' }}>
            {conversation.draft}
          </span>
        </span>
      );
    }

    const { lastMessage } = conversation;

    if (lastMessage.type === 'photo') {
      return (
        <span className="flex items-center gap-1" style={{ color: 'var(--gp-text-secondary)' }}>
          <span>&#128247;</span>
          <span>Photo</span>
          {lastMessage.attachmentCount && lastMessage.attachmentCount > 1 && (
            <span>+{lastMessage.attachmentCount - 1}</span>
          )}
        </span>
      );
    }

    if (lastMessage.type === 'file') {
      return (
        <span className="flex items-center gap-1" style={{ color: 'var(--gp-text-secondary)' }}>
          <span>&#128206;</span>
          <span>Fichier</span>
          {lastMessage.attachmentCount && lastMessage.attachmentCount > 1 && (
            <span>+{lastMessage.attachmentCount - 1}</span>
          )}
        </span>
      );
    }

    if (lastMessage.type === 'voice') {
      return (
        <span className="flex items-center gap-1" style={{ color: 'var(--gp-text-secondary)' }}>
          <span>&#127908;</span>
          <span>Message vocal</span>
        </span>
      );
    }

    // Ajouter le nom de l'expediteur pour les groupes
    const senderPrefix = conversation.isGroup && lastMessage.senderName ? (
      <span className="font-medium" style={{ color: 'var(--gp-text-primary)' }}>
        {lastMessage.senderName}:{' '}
      </span>
    ) : null;

    return (
      <span className="truncate" style={{ color: 'var(--gp-text-secondary)' }}>
        {senderPrefix}
        {lastMessage.content}
      </span>
    );
  }

  return (
    <SwipeableRow
      leftActions={leftActions}
      rightActions={rightActions}
      onLongPress={onDragStart}
      className={className}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={`w-full p-4 flex items-start gap-3 transition-colors duration-300 text-left cursor-pointer ${
          isSelected ? 'bg-[var(--gp-parchment)]' : 'hover:bg-[var(--gp-hover)]'
        }`}
        style={{ background: isSelected ? 'var(--gp-parchment)' : undefined }}
      >
        {/* Avatar avec indicateurs */}
        <div className="relative flex-shrink-0">
          {/* Badge anonyme en haut a gauche (uniquement pour les groupes avec participants anonymes) */}
          {conversation.isGroup && conversation.hasAnonymousParticipants && (
            <div className="absolute -top-1 -left-1 z-10">
              <GhostBadge size="sm" />
            </div>
          )}

          {/* Avatar / Language Orb / Icone groupe */}
          {conversation.isGroup ? (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--gp-deep-teal), var(--gp-royal-indigo))' }}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          ) : conversation.avatar ? (
            <img
              src={conversation.avatar}
              alt={displayName}
              width={48}
              height={48}
              loading="eager"
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <LanguageOrb code={conversation.languageCode} size="md" pulse={false} />
          )}

          {/* Indicateur en ligne (conversations directes uniquement) */}
          {!conversation.isGroup && conversation.isOnline && (
            <div
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 transition-colors duration-300"
              style={{ background: 'var(--gp-jade-green)', borderColor: 'var(--gp-surface)' }}
            />
          )}

          {/* Indicateur sourdine */}
          {conversation.isMuted && (
            <div
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300"
              style={{ background: 'var(--gp-text-muted)' }}
            >
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}

          {/* Badge nombre de participants (groupes) */}
          {conversation.isGroup && conversation.participantCount && (
            <div
              className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 transition-colors duration-300"
              style={{ background: 'var(--gp-deep-teal)', borderColor: 'var(--gp-surface)' }}
            >
              {conversation.participantCount > 99 ? '99+' : conversation.participantCount}
            </div>
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {/* Tags au-dessus du nom */}
          {conversation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {conversation.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors duration-300"
                  style={{ background: tag.color + '20', color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {conversation.tags.length > 3 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full transition-colors duration-300"
                  style={{ color: 'var(--gp-text-muted)' }}
                >
                  +{conversation.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Ligne du nom */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="font-medium truncate transition-colors duration-300"
                style={{ color: 'var(--gp-text-primary)' }}
              >
                {displayName}
              </span>
              {conversation.isPinned && (
                <span style={{ color: 'var(--gp-terracotta)' }}>&#128204;</span>
              )}
              {conversation.isImportant && (
                <span style={{ color: 'var(--gp-gold-accent)' }}>&#11088;</span>
              )}
            </div>
            <span className="text-xs flex-shrink-0 transition-colors duration-300" style={{ color: 'var(--gp-text-muted)' }}>
              {conversation.lastMessage.timestamp}
            </span>
          </div>

          {/* Dernier message */}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="text-sm truncate flex-1">{renderLastMessage()}</div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Badge non lu */}
              {conversation.unreadCount > 0 && (
                <Badge variant="terracotta" size="sm">
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </Badge>
              )}

              {/* Bouton options */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOptionsClick();
                }}
                className="p-1 rounded transition-colors duration-300 hover:bg-[var(--gp-hover)]"
                style={{ color: 'var(--gp-text-muted)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Indicateur de frappe */}
          {conversation.isTyping && (
            <div className="flex items-center gap-1 mt-1">
              <TypingIndicator />
              <span className="text-xs transition-colors duration-300" style={{ color: 'var(--gp-text-muted)' }}>
                ecrit...
              </span>
            </div>
          )}
        </div>
      </div>
    </SwipeableRow>
  );
}
