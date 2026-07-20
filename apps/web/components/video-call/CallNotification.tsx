/**
 * CALL NOTIFICATION COMPONENT
 * Displays incoming call notification with caller avatar, ringing animation, and accept/reject buttons
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useI18n } from '@/hooks/useI18n';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';
import { getInitials } from '@/utils/initials';

interface CallNotificationProps {
  call: CallInitiatedEvent;
  onAccept: () => void;
  onReject: () => void;
}

export function CallNotification({ call, onAccept, onReject }: CallNotificationProps) {
  const { t } = useI18n('calls');
  const ringtoneRef = useRef<import('@/utils/ringtone').Ringtone | null>(null);

  // Play ringtone on mount
  useEffect(() => {
    // Dynamically import ringtone utility
    import('@/utils/ringtone').then(({ getRingtone }) => {
      ringtoneRef.current = getRingtone();
      ringtoneRef.current.play();
    }).catch((error) => {
      console.warn('[CallNotification] Could not play ringtone:', error);
    });

    // Cleanup on unmount
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:max-w-[360px] z-[9999] bg-white dark:bg-gray-800 p-4 md:p-6 rounded-2xl shadow-2xl border-2 border-green-500 dark:border-green-600 animate-in slide-in-from-top-5"
      role="alertdialog"
      aria-labelledby="call-notification-title"
      aria-describedby="call-notification-description"
      aria-live="assertive"
    >
      {/* Ringing animation overlay */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-green-500/10 dark:bg-green-600/10 animate-ping" style={{ animationDuration: '2s' }} />
      </div>

      <div className="relative flex flex-col items-center gap-4">
        {/* Caller Avatar with pulsing ring */}
        <div className="relative">
          <div className="absolute -inset-2 bg-green-500/20 dark:bg-green-600/20 rounded-full animate-pulse" />
          <Avatar className="w-20 h-20 border-4 border-white dark:border-gray-800 relative z-10">
            <AvatarImage
              src={call.initiator.avatar || undefined}
              alt={call.initiator.username}
            />
            <AvatarFallback className="bg-gradient-to-br from-green-400 to-green-600 text-white text-2xl font-bold">
              {getInitials(call.initiator.username)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Call type icon — the actual media type (audio/video), never assumed */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {call.type === 'video' ? (
            <Video className="w-5 h-5 text-green-600 dark:text-green-400 animate-pulse" />
          ) : (
            <Mic className="w-5 h-5 text-green-600 dark:text-green-400 animate-pulse" />
          )}
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            {call.type === 'video' ? t('calls.incoming.videoCall') : t('calls.incoming.audioCall')}
          </span>
        </div>

        {/* Caller info */}
        <div className="text-center">
          <h3
            id="call-notification-title"
            className="font-bold text-xl text-gray-900 dark:text-white mb-1"
          >
            {call.initiator.username}
          </h3>
          <p
            id="call-notification-description"
            className="text-sm text-gray-600 dark:text-gray-400 animate-pulse"
          >
            {t('calls.incoming.subtitle')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 w-full mt-2">
          <Button
            variant="destructive"
            size="lg"
            className="flex-1 gap-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
            onClick={onReject}
            aria-label={t('calls.incoming.declineLabel')}
          >
            <PhoneOff className="w-5 h-5" />
            {t('calls.incoming.decline')}
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1 gap-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white shadow-lg shadow-green-500/50"
            onClick={onAccept}
            aria-label={t('calls.incoming.acceptLabel')}
            autoFocus
          >
            <Phone className="w-5 h-5" />
            {t('calls.incoming.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
