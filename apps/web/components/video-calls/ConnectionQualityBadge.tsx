/**
 * CONNECTION QUALITY BADGE
 * Displays connection quality indicator with detailed stats
 *
 * Features:
 * - Color-coded quality level
 * - Tooltip with detailed stats
 * - Only shows if quality < excellent
 */

'use client';

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import {
  getQualityColor,
  getQualityIcon,
  getQualityLabel,
} from '@/hooks/use-call-quality';
import { useI18n } from '@/hooks/useI18n';

interface ConnectionQualityBadgeProps {
  stats: ConnectionQualityStats | null;
  className?: string;
  showAlways?: boolean; // Show even if excellent
}

export function ConnectionQualityBadge({
  stats,
  className,
  showAlways = false,
}: ConnectionQualityBadgeProps) {
  const { t } = useI18n('calls');

  if (!stats) return null;
  if (!showAlways && stats.level === 'excellent') return null;

  const qualityColor = getQualityColor(stats.level);
  const qualityIcon = getQualityIcon(stats.level);
  const qualityLabel = getQualityLabel(stats.level);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg',
              'bg-black/60 backdrop-blur-sm',
              'transition-colors duration-300',
              className
            )}
          >
            <span className="text-lg">{qualityIcon}</span>
            <span className={cn('text-sm font-medium', qualityColor)}>
              {qualityLabel}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="bg-gray-900 border-gray-700 text-white p-4 max-w-xs"
        >
          <div className="space-y-2">
            <div className="font-semibold mb-2">{t('calls.quality.details')}</div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">{t('calls.quality.quality')}</div>
              <div className={qualityColor}>{qualityLabel}</div>

              <div className="text-gray-400">{t('calls.quality.packetLoss')}</div>
              <div>{stats.packetLoss.toFixed(2)}%</div>

              <div className="text-gray-400">{t('calls.quality.latency')}</div>
              <div>{stats.rtt}ms</div>

              <div className="text-gray-400">{t('calls.quality.jitter')}</div>
              <div>{stats.jitter.toFixed(2)}ms</div>

              <div className="text-gray-400">{t('calls.quality.audioBitrate')}</div>
              <div>{stats.bitrate.audio} kbps</div>

              <div className="text-gray-400">{t('calls.quality.videoBitrate')}</div>
              <div>{stats.bitrate.video} kbps</div>
            </div>

            <div className="pt-2 mt-2 border-t border-gray-700 text-xs text-gray-400">
              {t('calls.quality.updated')} {new Date(stats.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for smaller displays
 */
export function ConnectionQualityBadgeCompact({
  stats,
  className,
}: ConnectionQualityBadgeProps) {
  if (!stats || stats.level === 'excellent') return null;

  const qualityIcon = getQualityIcon(stats.level);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full',
              'bg-black/60 backdrop-blur-sm',
              className
            )}
          >
            <span className="text-base">{qualityIcon}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-gray-900 border-gray-700 text-white text-sm">
          <div>{getQualityLabel(stats.level)} connection</div>
          <div className="text-xs text-gray-400 mt-1">
            {stats.packetLoss.toFixed(1)}% loss, {stats.rtt}ms latency
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
