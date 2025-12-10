/**
 * ONGOING CALL BANNER
 * Shows a banner when a call is active in the conversation
 * Allows users to join or dismiss
 */

'use client';

import React from 'react';
import { Phone, PhoneOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OngoingCallBannerProps {
  callId: string;
  participantCount: number;
  duration: number;
  onJoin: () => void;
  onDismiss: () => void;
  className?: string;
}

export function OngoingCallBanner({
  callId,
  participantCount,
  duration,
  onJoin,
  onDismiss,
  className,
}: OngoingCallBannerProps) {
  // Format duration MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'relative w-full bg-gradient-to-r from-green-600 to-green-700',
        'border-b border-green-800 shadow-lg',
        'animate-in slide-in-from-top duration-300',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Call Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            {/* Pulsing indicator */}
            <div className="absolute inset-0 bg-white/40 rounded-full animate-ping" />
          </div>

          <div className="flex flex-col">
            <p className="text-white font-semibold text-sm">
              Call in progress
            </p>
            <p className="text-white/80 text-xs">
              {participantCount} participant{participantCount !== 1 ? 's' : ''} • {formatDuration(duration)}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onJoin}
            className="bg-white text-green-700 hover:bg-green-50 font-semibold"
          >
            <Phone className="w-4 h-4 mr-1" />
            Join
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={onDismiss}
            className="text-white hover:bg-white/10 w-8 h-8"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
