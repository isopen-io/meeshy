'use client';

import { memo, useMemo } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Video, VideoOff } from 'lucide-react';
import type { ConversationType } from '@meeshy/shared/types';
import {
  formatCallDuration,
  formatCallDataSize,
  type CallSummaryMetadata,
  type CallNetworkQuality,
} from '@meeshy/shared/utils/call-summary';
import { useVideoCall } from '@/hooks/conversations/use-video-call';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

interface CallSystemMessageProps {
  metadata: CallSummaryMetadata;
  currentUserId: string;
  conversationId: string;
  conversationType?: ConversationType;
}

/**
 * Rich, actionable call-summary system message — web parity with the iOS
 * `BubbleCallNoticeView`. Distinct double-contour card, direction-aware icon
 * (outgoing/incoming/missed, audio vs video), a "duration · data · quality"
 * line, and a tap-to-call-back affordance (re-initiates the same media type
 * for direct conversations). Direction is resolved per viewer from
 * `metadata.initiatorId`.
 */
export const CallSystemMessage = memo(function CallSystemMessage({
  metadata,
  currentUserId,
  conversationId,
  conversationType,
}: CallSystemMessageProps) {
  const { t } = useI18n('bubbleStream');
  const isOutgoing = !!currentUserId && metadata.initiatorId === currentUserId;
  const isVideo = metadata.callType === 'video';

  // The hook only reads { id, type } from the conversation.
  const { startCall } = useVideoCall({
    conversation: { id: conversationId, type: conversationType } as never,
  });
  const canCallBack = conversationType === 'direct';

  const tint = TINT_BY_OUTCOME[metadata.outcome];

  const title = useMemo(() => {
    switch (metadata.outcome) {
      case 'completed':
        return isVideo
          ? t('callSystemMessage.callVideo', 'Appel vidéo')
          : t('callSystemMessage.callAudio', 'Appel audio');
      case 'missed':
        return isVideo
          ? t('callSystemMessage.callVideoMissed', 'Appel vidéo manqué')
          : t('callSystemMessage.callAudioMissed', 'Appel audio manqué');
      case 'rejected':
        return t('callSystemMessage.callRejected', 'Appel refusé');
      case 'failed':
        return isVideo
          ? t('callSystemMessage.callVideoFailed', 'Appel vidéo interrompu')
          : t('callSystemMessage.callAudioFailed', 'Appel audio interrompu');
    }
  }, [metadata.outcome, isVideo, t]);

  const durationLabel =
    metadata.outcome === 'completed' && metadata.durationSeconds > 0
      ? formatCallDuration(metadata.durationSeconds)
      : null;
  const dataLabel =
    metadata.bytesTotal && metadata.bytesTotal > 0
      ? (metadata.bytesEstimated ? '~' : '') + formatCallDataSize(metadata.bytesTotal)
      : null;
  const directionLabel = isOutgoing
    ? t('callSystemMessage.outgoing', 'Sortant')
    : t('callSystemMessage.incoming', 'Entrant');

  const Glyph = glyphFor(metadata.outcome, isVideo, isOutgoing);

  return (
    <div className="flex justify-center px-4 py-1">
      <div className={cn('rounded-2xl border-2 p-[3px] max-w-sm w-full', tint.outerBorder)}>
        <div className={cn('flex items-center gap-3 rounded-xl border p-2.5', tint.innerBorder, tint.bg)}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tint.iconBg)}>
            <Glyph className={cn('h-[18px] w-[18px]', tint.iconText)} aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {isOutgoing ? <PhoneOutgoing className="h-3 w-3" aria-hidden /> : <PhoneIncoming className="h-3 w-3" aria-hidden />}
                {directionLabel}
              </span>
              {durationLabel && (<><Dot />{durationLabel}</>)}
              {dataLabel && (<><Dot />{dataLabel}</>)}
              {metadata.networkQuality && (
                <>
                  <Dot />
                  <span className="inline-flex items-center gap-1">
                    <span className={cn('h-1.5 w-1.5 rounded-full', QUALITY_DOT[metadata.networkQuality])} />
                    {qualityLabel(metadata.networkQuality, t)}
                  </span>
                </>
              )}
            </div>
          </div>

          {canCallBack && (
            <button
              type="button"
              onClick={() => { void startCall(metadata.callType); }}
              aria-label={t('callSystemMessage.callBack', 'Rappeler')}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                tint.button,
              )}
            >
              <Phone className="h-4 w-4 text-white" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function Dot() {
  return <span className="text-muted-foreground/50">·</span>;
}

function glyphFor(outcome: CallSummaryMetadata['outcome'], isVideo: boolean, isOutgoing: boolean) {
  if (outcome === 'missed') return isVideo ? VideoOff : PhoneMissed;
  if (outcome === 'rejected') return PhoneMissed;
  if (outcome === 'failed') return isVideo ? VideoOff : PhoneOff;
  if (isVideo) return Video;
  return isOutgoing ? PhoneOutgoing : PhoneIncoming;
}

function qualityLabel(quality: CallNetworkQuality, t: (key: string, fallback?: string) => string): string {
  switch (quality) {
    case 'excellent': return t('callSystemMessage.qualityExcellent', 'Excellent');
    case 'good': return t('callSystemMessage.qualityGood', 'Bonne');
    case 'fair': return t('callSystemMessage.qualityFair', 'Moyenne');
    case 'poor': return t('callSystemMessage.qualityPoor', 'Faible');
  }
}

/** Static class maps (kept literal so Tailwind's JIT can see them). */
const TINT_BY_OUTCOME: Record<CallSummaryMetadata['outcome'], {
  outerBorder: string; innerBorder: string; bg: string; iconBg: string; iconText: string; button: string;
}> = {
  completed: {
    outerBorder: 'border-indigo-500/40', innerBorder: 'border-indigo-500/25',
    bg: 'bg-indigo-500/5', iconBg: 'bg-indigo-500/15', iconText: 'text-indigo-500',
    button: 'bg-indigo-500 hover:bg-indigo-600',
  },
  missed: {
    outerBorder: 'border-red-500/40', innerBorder: 'border-red-500/25',
    bg: 'bg-red-500/5', iconBg: 'bg-red-500/15', iconText: 'text-red-500',
    button: 'bg-indigo-500 hover:bg-indigo-600',
  },
  rejected: {
    outerBorder: 'border-red-500/40', innerBorder: 'border-red-500/25',
    bg: 'bg-red-500/5', iconBg: 'bg-red-500/15', iconText: 'text-red-500',
    button: 'bg-indigo-500 hover:bg-indigo-600',
  },
  failed: {
    outerBorder: 'border-amber-500/40', innerBorder: 'border-amber-500/25',
    bg: 'bg-amber-500/5', iconBg: 'bg-amber-500/15', iconText: 'text-amber-500',
    button: 'bg-indigo-500 hover:bg-indigo-600',
  },
};

const QUALITY_DOT: Record<CallNetworkQuality, string> = {
  excellent: 'bg-emerald-500',
  good: 'bg-indigo-400',
  fair: 'bg-amber-500',
  poor: 'bg-red-500',
};
