'use client';

import { MessageSquare, Users } from 'lucide-react';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useI18n } from '@/hooks/useI18n';

interface JoinHeaderProps {
  conversationType?: string;
  conversationTitle?: string;
  description?: string;
  creatorName?: string;
}

export function JoinHeader({
  conversationType,
  conversationTitle,
  description,
  creatorName
}: JoinHeaderProps) {
  const { t } = useI18n('joinPage');

  return (
    <>
      <CardHeader className="text-center">
        <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          {conversationType === 'group' ? (
            <Users className="h-8 w-8 text-blue-600" />
          ) : (
            <MessageSquare className="h-8 w-8 text-blue-600" />
          )}
        </div>

        <CardTitle className="text-2xl">
          {t('title')}
        </CardTitle>
        <CardDescription className="text-lg">
          {t('invitedTo')} &quot;{conversationTitle || t('conversationWithoutName')}&quot;
        </CardDescription>
      </CardHeader>

      {description && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mx-6 mb-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <MessageSquare className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
                {description}
              </p>
              {creatorName && (
                <p className="text-xs text-blue-600 mt-2">
                  — {creatorName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
