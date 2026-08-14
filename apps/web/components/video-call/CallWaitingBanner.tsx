/**
 * CALL WAITING BANNER
 *
 * Shown when a SECOND incoming call arrives while the user is already in an
 * active call (busy-path). Parity with iOS (`showCallWaitingBanner` +
 * `endCurrentAndAnswerPending`) and Android (`onIncomingOffer` +
 * `acceptWaitingSwap` / `rejectWaiting`).
 *
 * Compact and non-intrusive — it overlays a live call, so it does NOT play a
 * full ringtone (the call audio is already playing) and uses the warning/amber
 * accent to read as "waiting", distinct from the green fresh-incoming
 * `CallNotification`. Two actions:
 *   - Decline: reject the waiting call (frees the caller), keep the active call.
 *   - End & answer: hang up the active call, then answer the waiting one (swap).
 */

'use client';

import React from 'react';
import { PhoneOff, PhoneForwarded, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useI18n } from '@/hooks/useI18n';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';
import { getInitials } from '@/utils/initials';

interface CallWaitingBannerProps {
  call: CallInitiatedEvent;
  onReject: () => void;
  onEndAndAnswer: () => void;
}

export function CallWaitingBanner({ call, onReject, onEndAndAnswer }: CallWaitingBannerProps) {
  const { t } = useI18n('calls');

  return (
    <div
      className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:max-w-[340px] z-[10000] bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl shadow-2xl border-2 border-amber-500 dark:border-amber-600 animate-in slide-in-from-top-5"
      role="alertdialog"
      aria-labelledby="call-waiting-title"
      aria-live="assertive"
      data-testid="call-waiting-banner"
    >
      <div className="flex items-center gap-3">
        <Avatar className="w-12 h-12 border-2 border-amber-300 dark:border-amber-700 shrink-0">
          <AvatarImage src={call.initiator.avatar || undefined} alt={call.initiator.username} />
          <AvatarFallback className="bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold">
            {getInitials(call.initiator.username)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            {call.type === 'video' ? <Video className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span id="call-waiting-title" className="text-xs font-semibold uppercase tracking-wide">
              {t('callWaiting.title')}
            </span>
          </div>
          <p className="font-bold text-gray-900 dark:text-white truncate">
            {call.initiator.username}
          </p>
          {call.conversationType === 'group' && (
            <p
              data-testid="call-waiting-group-context"
              className="text-xs font-medium text-amber-700/80 dark:text-amber-400/80 truncate"
            >
              {t('incoming.groupCall')}
              {call.conversationTitle ? ` · ${call.conversationTitle}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 w-full mt-3">
        <Button
          variant="destructive"
          size="sm"
          className="flex-1 gap-1.5 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
          onClick={onReject}
          aria-label={t('callWaiting.rejectLabel')}
        >
          <PhoneOff className="w-4 h-4" />
          {t('callWaiting.reject')}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white"
          onClick={onEndAndAnswer}
          aria-label={t('callWaiting.endAndAnswerLabel')}
        >
          <PhoneForwarded className="w-4 h-4" />
          {t('callWaiting.endAndAnswer')}
        </Button>
      </div>
    </div>
  );
}
