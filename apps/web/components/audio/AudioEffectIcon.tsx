'use client';

import React, { memo } from 'react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { getEffectIcon } from '@/utils/audio-effects-config';

interface AudioEffectIconProps {
  effect: AudioEffectType;
  className?: string;
}

/**
 * Icône d'effet audio
 */
export const AudioEffectIcon = memo<AudioEffectIconProps>(({ effect, className = 'w-4 h-4' }) => {
  const Icon = getEffectIcon(effect);
  return <Icon className={className} />;
});

AudioEffectIcon.displayName = 'AudioEffectIcon';
