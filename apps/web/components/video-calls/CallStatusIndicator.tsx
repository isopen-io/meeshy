/**
 * CALL STATUS INDICATOR
 * Shows connection quality, call duration, and participant info
 */

'use client';

import React from 'react';
import { Signal, SignalHigh, SignalLow, SignalMedium, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface CallStatusIndicatorProps {
  connectionState: RTCPeerConnectionState;
  callDuration?: number;
  participantName?: string;
  connectionQuality?: 'excellent' | 'good' | 'poor' | 'offline';
}

export function CallStatusIndicator({
  connectionState,
  _callDuration = 0,
  participantName,
  connectionQuality,
}: CallStatusIndicatorProps) {
  const { t } = useI18n('calls');

  // Determine connection quality based on state if not provided
  const quality = connectionQuality || getQualityFromState(connectionState);

  // Get quality icon
  const QualityIcon = getQualityIcon(quality);

  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-col gap-2">
        {/* Connection Quality */}
        <div className="flex items-center gap-2">
          <QualityIcon
            className={cn(
              'w-4 h-4',
              quality === 'excellent' && 'text-green-500',
              quality === 'good' && 'text-yellow-500',
              quality === 'poor' && 'text-orange-500',
              quality === 'offline' && 'text-red-500'
            )}
          />
          <span className="text-white text-xs font-medium">
            {getQualityLabel(quality, connectionState, t)}
          </span>
        </div>

        {/* Participant Name */}
        {participantName && (
          <div className="text-white text-xs">
            {participantName}
          </div>
        )}
      </div>
    </div>
  );
}

function getQualityFromState(state: RTCPeerConnectionState): 'excellent' | 'good' | 'poor' | 'offline' {
  switch (state) {
    case 'connected':
      return 'excellent';
    case 'connecting':
      return 'good';
    case 'new':
      return 'good';
    case 'disconnected':
      return 'poor';
    case 'failed':
    case 'closed':
      return 'offline';
    default:
      return 'good';
  }
}

function getQualityIcon(quality: string) {
  switch (quality) {
    case 'excellent':
      return SignalHigh;
    case 'good':
      return SignalMedium;
    case 'poor':
      return SignalLow;
    case 'offline':
      return WifiOff;
    default:
      return Signal;
  }
}

function getQualityLabel(quality: string, state: RTCPeerConnectionState, t: (key: string) => string): string {
  if (state === 'connecting') return t('calls.status.connecting');
  if (state === 'new') return t('calls.status.starting');
  if (state === 'disconnected') return t('calls.status.reconnecting');
  if (state === 'failed') return t('calls.status.failed');
  if (state === 'closed') return t('calls.status.disconnected');

  switch (quality) {
    case 'excellent':
      return t('calls.status.quality.excellent');
    case 'good':
      return t('calls.status.quality.good');
    case 'poor':
      return t('calls.status.quality.poor');
    case 'offline':
      return t('calls.status.quality.offline');
    default:
      return t('calls.status.connected');
  }
}
