'use client';

import {
  MessageSquare,
  Shield,
  Image,
  FileText,
  Eye,
  Users,
  Settings,
  UserPlus,
  Calendar,
  Globe
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/useI18n';
import { DURATION_OPTIONS } from '../../constants';
import { SUPPORTED_LANGUAGES } from '@/types';
import type { Conversation } from '@meeshy/shared/types';
import type { NewConversationData } from '../../types';

interface SummaryDetailsProps {
  createNewConversation: boolean;
  newConversationData: NewConversationData;
  conversations: Conversation[];
  selectedConversationId: string | null;
  expirationDays: number;
  maxUses: number | undefined;
  description: string;
  allowAnonymousMessages: boolean;
  allowAnonymousImages: boolean;
  allowAnonymousFiles: boolean;
  allowViewHistory: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireAccount: boolean;
  requireBirthday: boolean;
  allowedLanguages: string[];
}

export function SummaryDetails({
  createNewConversation,
  newConversationData,
  conversations,
  selectedConversationId,
  expirationDays,
  maxUses,
  description,
  allowAnonymousMessages,
  allowAnonymousImages,
  allowAnonymousFiles,
  allowViewHistory,
  requireNickname,
  requireEmail,
  requireAccount,
  requireBirthday,
  allowedLanguages
}: SummaryDetailsProps) {
  const { t, locale } = useI18n('modals');
  const { t: tCommon } = useI18n('common');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="font-semibold text-base flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          {t('summary.basicInfo')}
        </h4>

        <div className="col-span-2 p-3 bg-muted/30 rounded-lg">
          <h5 className="font-medium text-sm text-muted-foreground mb-1">
            {t('summary.conversation')}
          </h5>
          <p className="font-medium">
            {createNewConversation
              ? `Nouvelle: ${newConversationData.title}`
              : conversations.find((c) => c.id === selectedConversationId)?.title ||
                'Non sélectionnée'}
          </p>
          {createNewConversation && newConversationData.description && (
            <p className="text-sm text-muted-foreground mt-1">{newConversationData.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-muted/30 rounded-lg">
            <h5 className="font-medium text-sm text-muted-foreground mb-1">
              {t('summary.usageLimit')}
            </h5>
            <p className="font-medium">
              {maxUses ? t('summary.usageCount', { count: maxUses }) : t('summary.unlimited')}
            </p>
            {maxUses && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('summary.linkDisabledAfter', { count: maxUses })}
              </p>
            )}
          </div>

          <div className="p-3 bg-muted/30 rounded-lg">
            <h5 className="font-medium text-sm text-muted-foreground mb-1">
              {t('summary.validityDuration')}
            </h5>
            <p className="font-medium">
              {DURATION_OPTIONS.find((d) => d.value === expirationDays)
                ? t(DURATION_OPTIONS.find((d) => d.value === expirationDays)!.labelKey)
                : `${expirationDays} jours`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('summary.expiresOn', {
                date: new Date(
                  Date.now() + expirationDays * 24 * 60 * 60 * 1000
                ).toLocaleDateString(locale)
              })}
            </p>
          </div>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg">
          <h5 className="font-medium text-sm text-muted-foreground mb-1">
            {t('summary.welcomeMessage')}
          </h5>
          <p className="font-medium whitespace-pre-wrap">
            {description || t('summary.noCustomMessage')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('summary.welcomeMessageDescription')}
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-semibold text-base flex items-center">
          <Shield className="h-4 w-4 mr-2" />
          {t('summary.permissionsGranted')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PermissionCard
            allowed={allowAnonymousMessages}
            icon={<MessageSquare className="h-4 w-4" />}
            label={t('summary.messages')}
            allowedText={t('summary.guestsCanSendMessages')}
            deniedText={t('summary.guestsCannotSendMessages')}
          />

          <PermissionCard
            allowed={allowAnonymousImages}
            icon={<Image className="h-4 w-4" />}
            label={t('summary.images')}
            allowedText={t('summary.guestsCanShareImages')}
            deniedText={t('summary.guestsCannotShareImages')}
          />

          <PermissionCard
            allowed={allowAnonymousFiles}
            icon={<FileText className="h-4 w-4" />}
            label={t('summary.files')}
            allowedText={t('summary.guestsCanShareFiles')}
            deniedText={t('summary.guestsCannotShareFiles')}
          />

          <PermissionCard
            allowed={allowViewHistory}
            icon={<Eye className="h-4 w-4" />}
            label={t('summary.history')}
            allowedText={t('summary.guestsCanViewHistory')}
            deniedText={t('summary.guestsCannotViewHistory')}
            allowedBadge={t('summary.visible')}
            deniedBadge={t('summary.hidden')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <RequirementCard
            required={requireNickname}
            icon={<Users className="h-4 w-4" />}
            label={t('summary.nicknameRequired')}
            requiredText={t('summary.guestsMustEnterNickname')}
            notRequiredText={t('summary.guestsCanStayAnonymous')}
          />

          <RequirementCard
            required={requireEmail}
            icon={<Settings className="h-4 w-4" />}
            label={t('summary.emailRequired')}
            requiredText={t('summary.guestsMustEnterEmail')}
            notRequiredText={t('summary.guestsCanStayAnonymous')}
          />

          <RequirementCard
            required={requireAccount}
            icon={<UserPlus className="h-4 w-4" />}
            label={t('summary.accountRequired')}
            requiredText={t('summary.guestsMustHaveAccount')}
            notRequiredText={t('summary.guestsCanJoinWithoutAccount')}
          />

          <RequirementCard
            required={requireBirthday}
            icon={<Calendar className="h-4 w-4" />}
            label={t('summary.birthdayRequired')}
            requiredText={t('summary.guestsMustProvideBirthday')}
            notRequiredText={t('summary.guestsCanOmitBirthday')}
          />
        </div>
      </div>

      {allowedLanguages.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h4 className="font-semibold text-base flex items-center">
              <Globe className="h-4 w-4 mr-2" />
              {t('summary.allowedLanguages')}
            </h4>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <h5 className="font-medium text-sm text-orange-800 mb-2">
                {t('summary.selectedLanguages')}
              </h5>
              <div className="flex flex-wrap gap-1">
                {allowedLanguages.map((lang) => {
                  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
                  return (
                    <Badge key={lang} variant="outline" className="text-xs">
                      {langInfo?.flag} {langInfo?.name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PermissionCard({
  allowed,
  icon,
  label,
  allowedText,
  deniedText,
  allowedBadge,
  deniedBadge
}: {
  allowed: boolean;
  icon: React.ReactNode;
  label: string;
  allowedText: string;
  deniedText: string;
  allowedBadge?: string;
  deniedBadge?: string;
}) {
  const { t } = useI18n('modals');
  return (
    <div
      className={`p-3 rounded-lg border-2 ${
        allowed
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
      }`}
    >
      <div className="flex items-center space-x-2">
        <div
          className={`${
            allowed
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {icon}
        </div>
        <span className="font-medium text-sm dark:text-gray-200">{label}</span>
        <Badge variant={allowed ? 'default' : 'destructive'} className="text-xs">
          {allowedBadge && deniedBadge
            ? allowed
              ? allowedBadge
              : deniedBadge
            : allowed
            ? t('summary.allowed')
            : t('summary.forbidden')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
        {allowed ? allowedText : deniedText}
      </p>
    </div>
  );
}

function RequirementCard({
  required,
  icon,
  label,
  requiredText,
  notRequiredText
}: {
  required: boolean;
  icon: React.ReactNode;
  label: string;
  requiredText: string;
  notRequiredText: string;
}) {
  const { t } = useI18n('modals');
  return (
    <div
      className={`p-3 rounded-lg border-2 ${
        required
          ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
      }`}
    >
      <div className="flex items-center space-x-2">
        <div
          className={`${
            required
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {icon}
        </div>
        <span className="font-medium text-sm dark:text-gray-200">{label}</span>
        <Badge variant={required ? 'secondary' : 'outline'} className="text-xs">
          {required ? t('summary.yes') : t('summary.no')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
        {required ? requiredText : notRequiredText}
      </p>
    </div>
  );
}
