/**
 * Type definitions for Create Link Modal
 */

export interface NewConversationData {
  title: string;
  description: string;
  memberIds: string[];
}

export interface LinkSettings {
  linkTitle: string;
  linkIdentifier: string;
  description: string;
  expirationDays: number;
  maxUses: number | undefined;
  maxConcurrentUsers: number | undefined;
  maxUniqueSessions: number | undefined;
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  allowViewHistory: boolean;
  requireAccount: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireBirthday: boolean;
  allowedLanguages: string[];
}

export interface CreateLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkCreated: () => void;
  preGeneratedLink?: string;
  preGeneratedToken?: string;
}

export type LinkIdentifierStatus = 'idle' | 'checking' | 'available' | 'taken';

export interface SelectableSquareProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface InfoIconProps {
  content: string;
}
