'use client';

import {
  Link2,
  RefreshCw,
  Check,
  X,
  CheckCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { InfoIcon } from '../components/InfoIcon';
import { SummaryDetails } from './summary-sections/SummaryDetails';
import type { Conversation } from '@meeshy/shared/types';
import type { NewConversationData, LinkIdentifierStatus } from '../types';

interface LinkSummaryStepProps {
  linkTitle: string;
  setLinkTitle: (title: string) => void;
  linkIdentifier: string;
  setLinkIdentifier: (identifier: string) => void;
  description: string;
  setDescription: (description: string) => void;
  linkIdentifierCheckStatus: LinkIdentifierStatus;
  generateIdentifier: (baseText: string) => string;
  createNewConversation: boolean;
  newConversationData: NewConversationData;
  conversations: Conversation[];
  selectedConversationId: string | null;
  expirationDays: number;
  maxUses: number | undefined;
  allowAnonymousMessages: boolean;
  allowAnonymousImages: boolean;
  allowAnonymousFiles: boolean;
  allowViewHistory: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireAccount: boolean;
  requireBirthday: boolean;
  allowedLanguages: string[];
  isSummaryOpen: boolean;
  setIsSummaryOpen: (open: boolean) => void;
}

export function LinkSummaryStep({
  linkTitle,
  setLinkTitle,
  linkIdentifier,
  setLinkIdentifier,
  description,
  setDescription,
  linkIdentifierCheckStatus,
  generateIdentifier,
  createNewConversation,
  newConversationData,
  conversations,
  selectedConversationId,
  expirationDays,
  maxUses,
  allowAnonymousMessages,
  allowAnonymousImages,
  allowAnonymousFiles,
  allowViewHistory,
  requireNickname,
  requireEmail,
  requireAccount,
  requireBirthday,
  allowedLanguages,
  isSummaryOpen,
  setIsSummaryOpen
}: LinkSummaryStepProps) {
  const { t } = useI18n('modals');

  const conversationTitle = createNewConversation
    ? newConversationData.title
    : conversations.find((c) => c.id === selectedConversationId)?.title;

  return (
    <div className="space-y-6">
      <Card className="border-2 border-dashed border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Link2 className="h-4 w-4 mr-2" />
            {t('createLinkModal.linkDetails.title')}
          </CardTitle>
          <CardDescription>{t('createLinkModal.linkDetails.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="linkName" className="text-sm font-medium">
                {t('createLinkModal.linkDetails.linkName')}
              </Label>
              <InfoIcon content={t('createLinkModal.linkDetails.linkNameInfo')} />
            </div>
            <Input
              id="linkName"
              value={
                linkTitle ||
                (conversationTitle
                  ? `${t('createLinkModal.linkDetails.linkNameDefaultPrefix')} ${conversationTitle}`
                  : '')
              }
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder={t('createLinkModal.linkDetails.linkNamePlaceholder')}
              className="text-lg"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="linkIdentifier" className="text-sm font-medium">
                {t('createLinkModal.linkDetails.linkIdentifier')}
              </Label>
              <InfoIcon content={t('createLinkModal.linkDetails.linkIdentifierInfo')} />
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Input
                  id="linkIdentifier"
                  value={
                    linkIdentifier ||
                    generateIdentifier(
                      linkTitle ||
                        (createNewConversation
                          ? newConversationData.title
                          : conversations.find((c) => c.id === selectedConversationId)?.title ||
                            'link')
                    )
                  }
                  onChange={(e) => setLinkIdentifier(e.target.value)}
                  className={cn(
                    'font-mono text-sm pr-10',
                    linkIdentifierCheckStatus === 'available' &&
                      'border-green-500 focus-visible:ring-green-500',
                    linkIdentifierCheckStatus === 'taken' &&
                      'border-red-500 focus-visible:ring-red-500'
                  )}
                  placeholder={t('linkIdentifier.placeholder')}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {linkIdentifierCheckStatus === 'checking' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  )}
                  {linkIdentifierCheckStatus === 'available' && (
                    <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-500">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {linkIdentifierCheckStatus === 'taken' && (
                    <div className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500">
                      <X className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const baseText =
                    linkTitle ||
                    (createNewConversation
                      ? newConversationData.title
                      : conversations.find((c) => c.id === selectedConversationId)?.title ||
                        'link');
                  setLinkIdentifier(generateIdentifier(baseText));
                }}
                title={t('createLinkModal.linkDetails.regenerateIdentifier')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {linkIdentifierCheckStatus === 'available' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Identifiant disponible
              </p>
            )}
            {linkIdentifierCheckStatus === 'taken' && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <X className="h-3 w-3" />
                Cet identifiant est déjà utilisé
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="welcomeMessage" className="text-sm font-medium">
                {t('createLinkModal.linkDetails.welcomeMessage')}
              </Label>
              <InfoIcon content={t('createLinkModal.linkDetails.welcomeMessageInfo')} />
            </div>
            <Textarea
              id="welcomeMessage"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createLinkModal.linkDetails.welcomeMessagePlaceholder')}
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsSummaryOpen(!isSummaryOpen)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
              <CardTitle className="text-lg">{t('summary.title')}</CardTitle>
            </div>
            {isSummaryOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
          <CardDescription>{t('summary.description')}</CardDescription>
        </CardHeader>
        {isSummaryOpen && (
          <CardContent>
            <SummaryDetails
              createNewConversation={createNewConversation}
              newConversationData={newConversationData}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              expirationDays={expirationDays}
              maxUses={maxUses}
              description={description}
              allowAnonymousMessages={allowAnonymousMessages}
              allowAnonymousImages={allowAnonymousImages}
              allowAnonymousFiles={allowAnonymousFiles}
              allowViewHistory={allowViewHistory}
              requireNickname={requireNickname}
              requireEmail={requireEmail}
              requireAccount={requireAccount}
              requireBirthday={requireBirthday}
              allowedLanguages={allowedLanguages}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
