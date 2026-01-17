'use client';

import {
  MessageSquare,
  Link2,
  Shield,
  Globe,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/useI18n';
import type { Conversation, User } from '@meeshy/shared/types';
import type { NewConversationData } from '../types';
import { ConversationSection } from './config-sections/ConversationSection';
import { LinkSettingsSection } from './config-sections/LinkSettingsSection';
import { PermissionsSection } from './config-sections/PermissionsSection';
import { LanguagesSection } from './config-sections/LanguagesSection';

interface LinkConfigStepProps {
  createNewConversation: boolean;
  selectedConversationId: string | null;
  conversations: Conversation[];
  newConversationData: NewConversationData;
  setNewConversationData: (data: NewConversationData | ((prev: NewConversationData) => NewConversationData)) => void;
  filteredUsers: User[];
  userSearchQuery: string;
  setUserSearchQuery: (query: string) => void;
  isLoadingUsers: boolean;
  expirationDays: number;
  setExpirationDays: (days: number) => void;
  maxUses: number | undefined;
  setMaxUses: (uses: number | undefined) => void;
  requireAccount: boolean;
  setRequireAccount: (require: boolean) => void;
  allowAnonymousMessages: boolean;
  setAllowAnonymousMessages: (allow: boolean) => void;
  allowAnonymousFiles: boolean;
  setAllowAnonymousFiles: (allow: boolean) => void;
  allowAnonymousImages: boolean;
  setAllowAnonymousImages: (allow: boolean) => void;
  allowViewHistory: boolean;
  setAllowViewHistory: (allow: boolean) => void;
  requireNickname: boolean;
  setRequireNickname: (require: boolean) => void;
  requireEmail: boolean;
  setRequireEmail: (require: boolean) => void;
  requireBirthday: boolean;
  setRequireBirthday: (require: boolean) => void;
  allowedLanguages: string[];
  setAllowedLanguages: (languages: string[]) => void;
  isPermissionsOpen: boolean;
  setIsPermissionsOpen: (open: boolean) => void;
  isLanguagesOpen: boolean;
  setIsLanguagesOpen: (open: boolean) => void;
  languageSearchQuery: string;
  setLanguageSearchQuery: (query: string) => void;
}

export function LinkConfigStep(props: LinkConfigStepProps) {
  const { t } = useI18n('modals');

  return (
    <div className="space-y-8">
      <ConversationSection
        createNewConversation={props.createNewConversation}
        selectedConversationId={props.selectedConversationId}
        conversations={props.conversations}
        newConversationData={props.newConversationData}
        setNewConversationData={props.setNewConversationData}
        filteredUsers={props.filteredUsers}
        userSearchQuery={props.userSearchQuery}
        setUserSearchQuery={props.setUserSearchQuery}
        isLoadingUsers={props.isLoadingUsers}
      />

      <LinkSettingsSection
        expirationDays={props.expirationDays}
        setExpirationDays={props.setExpirationDays}
        maxUses={props.maxUses}
        setMaxUses={props.setMaxUses}
        requireAccount={props.requireAccount}
        setRequireAccount={props.setRequireAccount}
      />

      <PermissionsSection
        isPermissionsOpen={props.isPermissionsOpen}
        setIsPermissionsOpen={props.setIsPermissionsOpen}
        requireAccount={props.requireAccount}
        allowAnonymousMessages={props.allowAnonymousMessages}
        setAllowAnonymousMessages={props.setAllowAnonymousMessages}
        allowAnonymousImages={props.allowAnonymousImages}
        setAllowAnonymousImages={props.setAllowAnonymousImages}
        allowAnonymousFiles={props.allowAnonymousFiles}
        setAllowAnonymousFiles={props.setAllowAnonymousFiles}
        allowViewHistory={props.allowViewHistory}
        setAllowViewHistory={props.setAllowViewHistory}
        setRequireAccount={props.setRequireAccount}
        requireNickname={props.requireNickname}
        setRequireNickname={props.setRequireNickname}
        requireEmail={props.requireEmail}
        setRequireEmail={props.setRequireEmail}
        requireBirthday={props.requireBirthday}
        setRequireBirthday={props.setRequireBirthday}
      />

      <LanguagesSection
        isLanguagesOpen={props.isLanguagesOpen}
        setIsLanguagesOpen={props.setIsLanguagesOpen}
        allowedLanguages={props.allowedLanguages}
        setAllowedLanguages={props.setAllowedLanguages}
        languageSearchQuery={props.languageSearchQuery}
        setLanguageSearchQuery={props.setLanguageSearchQuery}
      />
    </div>
  );
}
