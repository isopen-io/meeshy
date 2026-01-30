/**
 * Global Pulse Design System - V2 Components
 *
 * A distinctive design system for Meeshy that celebrates
 * global connectivity and cultural diversity.
 */

// Theme
export { theme, cssVariables, getLanguageColor } from './theme';
export type { Theme, ThemeColor, LanguageCode } from './theme';

// Components
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Card, CardHeader, CardContent, CardTitle, CardDescription } from './Card';
export type { CardProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { Input } from './Input';
export type { InputProps } from './Input';

export { LanguageOrb } from './LanguageOrb';
export type { LanguageOrbProps } from './LanguageOrb';

export { MessageBubble } from './MessageBubble';
export type { MessageBubbleProps, Translation } from './MessageBubble';

export { TypingIndicator } from './TypingIndicator';
export type { TypingIndicatorProps } from './TypingIndicator';

export { GhostBadge, GhostIcon } from './GhostBadge';
export type { GhostBadgeProps } from './GhostBadge';

export { TagInput } from './TagInput';
export type { TagInputProps, TagItem } from './TagInput';

export { SwipeableRow, SwipeIcons, SwipeColors } from './SwipeableRow';
export type { SwipeableRowProps, SwipeAction } from './SwipeableRow';

export { ConversationItem } from './ConversationItem';
export type { ConversationItemProps, ConversationItemData, ConversationTag } from './ConversationItem';

export { CategoryHeader, CategoryIcons } from './CategoryHeader';
export type { CategoryHeaderProps } from './CategoryHeader';

export { CommunityCarousel } from './CommunityCarousel';
export type { CommunityCarouselProps, CommunityItem } from './CommunityCarousel';

export { Resizer, useResizer } from './Resizer';
export type { ResizerProps } from './Resizer';

export { ConversationDrawer } from './ConversationDrawer';
export type { ConversationDrawerProps } from './ConversationDrawer';

export { ConversationSettings } from './ConversationSettings';
export type { ConversationSettingsProps, Participant, ConversationStats } from './ConversationSettings';

export { MessageComposer } from './MessageComposer';
export type { MessageComposerProps, Attachment, LanguageOption } from './MessageComposer';
