'use client';

import { CheckCircle, FileText, Copy, Link2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/hooks/useI18n';
import { DURATION_OPTIONS } from '../constants';
import type { Conversation } from '@meeshy/shared/types';
import type { NewConversationData } from '../types';

interface SuccessViewProps {
  generatedLink: string;
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
  copyLink: () => void;
  handleClose: () => void;
}

export function SuccessView({
  generatedLink,
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
  copyLink,
  handleClose
}: SuccessViewProps) {
  const { t } = useI18n('modals');
  const { t: tCommon } = useI18n('common');

  return (
    <div className="space-y-6">
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl text-green-700 dark:text-green-400">
            {t('createLinkModal.success.linkCreated')}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            {t('summary.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-sm text-muted-foreground mb-2">
                {t('summary.conversation')}
              </h4>
              <p className="font-medium">
                {createNewConversation
                  ? `${tCommon('new')}: ${newConversationData.title}`
                  : conversations.find((c) => c.id === selectedConversationId)?.title ||
                    tCommon('notSelected')}
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-sm text-muted-foreground mb-2">
                {t('summary.validityDuration')}
              </h4>
              <p className="font-medium">
                {DURATION_OPTIONS.find((d) => d.value === expirationDays)
                  ? t(DURATION_OPTIONS.find((d) => d.value === expirationDays)!.labelKey)
                  : `${expirationDays} ${tCommon('days')}`}
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-sm text-muted-foreground mb-2">
                {t('summary.usageLimit')}
              </h4>
              <p className="font-medium">
                {maxUses
                  ? `${maxUses} ${t('summary.usageCount', { count: maxUses })}`
                  : t('summary.unlimited')}
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium text-sm text-muted-foreground mb-2">
                {t('summary.permissions')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {allowAnonymousMessages && (
                  <Badge variant="outline" className="text-xs">
                    {t('summary.messages')}
                  </Badge>
                )}
                {allowAnonymousImages && (
                  <Badge variant="outline" className="text-xs">
                    {t('summary.images')}
                  </Badge>
                )}
                {allowAnonymousFiles && (
                  <Badge variant="outline" className="text-xs">
                    {t('summary.files')}
                  </Badge>
                )}
                {allowViewHistory && (
                  <Badge variant="outline" className="text-xs">
                    {t('summary.history')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Link2 className="h-5 w-5 mr-2" />
            {t('createLinkButton.generatedLink')}
          </CardTitle>
          <CardDescription>{t('linkSummaryModal.shareLink')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-white dark:bg-gray-900 border rounded-lg">
            <Input
              value={generatedLink}
              readOnly
              className="w-full text-sm bg-white dark:bg-gray-800 dark:text-gray-100 font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
        <Button onClick={copyLink} size="lg" className="w-full sm:w-auto">
          <Copy className="mr-2 h-4 w-4" />
          {t('createLinkModal.actions.copyLink')}
        </Button>
        <Button onClick={handleClose} variant="outline" size="lg" className="w-full sm:w-auto">
          {t('createLinkModal.actions.close')}
        </Button>
      </div>
    </div>
  );
}
