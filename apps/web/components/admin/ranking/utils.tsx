import React from 'react';
import { Medal } from 'lucide-react';
import { MEDAL_COLORS } from './constants';
import { getCurrentInterfaceLocale } from '@/stores/language-store';

export function formatCount(count: number | undefined, locale: string = getCurrentInterfaceLocale()): string {
  if (count === undefined) return '0';
  return count.toLocaleString(locale);
}

export function getRankBadge(rank: number) {
  if (rank === 1) {
    return <Medal className={`h-6 w-6 ${MEDAL_COLORS[0]}`} />;
  } else if (rank === 2) {
    return <Medal className={`h-6 w-6 ${MEDAL_COLORS[1]}`} />;
  } else if (rank === 3) {
    return <Medal className={`h-6 w-6 ${MEDAL_COLORS[2]}`} />;
  }
  return <span className="text-lg font-semibold text-gray-500">#{rank}</span>;
}

export function getTypeIcon(type: string | undefined): string {
  switch (type) {
    case 'direct': return '💬';
    case 'group': return '👥';
    case 'public': return '🌐';
    case 'broadcast': return '📢';
    default: return '💬';
  }
}

export function getTypeLabel(type: string | undefined, t: (key: string) => string): string {
  const mapped: Record<string, string> = {
    direct: t('ranking.conversationType.direct'),
    group: t('ranking.conversationType.group'),
    public: t('ranking.conversationType.public'),
    broadcast: t('ranking.conversationType.broadcast'),
  };
  return (type && mapped[type]) ?? type ?? t('ranking.conversationType.unknown');
}

export function getMessageTypeIcon(type: string | undefined): string {
  switch (type) {
    case 'text': return '📝';
    case 'image': return '🖼️';
    case 'video': return '🎥';
    case 'audio': return '🎵';
    case 'file': return '📎';
    default: return '📝';
  }
}
