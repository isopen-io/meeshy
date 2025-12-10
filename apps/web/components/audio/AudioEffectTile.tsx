/**
 * AUDIO EFFECT TILE
 * Tuile interactive pour un effet audio
 *
 * Features:
 * - Clic sur la tuile ouvre la configuration
 * - Toggle ON/OFF visible et utilisable
 * - Indicateur visuel de l'état actif/inactif
 * - Traductions i18n complètes
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ChevronRight, Sparkles } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AudioEffectTileProps {
  effectType: AudioEffectType;
  enabled: boolean;
  onToggle: () => void;
  onConfigure?: () => void;
  configurationComponent?: React.ReactNode;
  className?: string;
}

// Configuration visuelle pour chaque effet
const EFFECT_VISUALS: Record<
  AudioEffectType,
  {
    gradient: string;
    borderColor: string;
    activeGlow: string;
  }
> = {
  'voice-coder': {
    gradient: 'from-blue-500/20 to-blue-600/10',
    borderColor: 'border-blue-500/30',
    activeGlow: 'shadow-lg shadow-blue-500/30',
  },
  'baby-voice': {
    gradient: 'from-pink-500/20 to-pink-600/10',
    borderColor: 'border-pink-500/30',
    activeGlow: 'shadow-lg shadow-pink-500/30',
  },
  'demon-voice': {
    gradient: 'from-red-500/20 to-red-600/10',
    borderColor: 'border-red-500/30',
    activeGlow: 'shadow-lg shadow-red-500/30',
  },
  'back-sound': {
    gradient: 'from-green-500/20 to-green-600/10',
    borderColor: 'border-green-500/30',
    activeGlow: 'shadow-lg shadow-green-500/30',
  },
};

export function AudioEffectTile({
  effectType,
  enabled,
  onToggle,
  configurationComponent,
  className,
}: AudioEffectTileProps) {
  const { t } = useI18n('audioEffects');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const visuals = EFFECT_VISUALS[effectType];
  const effectName = t(`effects.${effectType}.name`);
  const effectDescription = t(`effects.${effectType}.description`);
  const effectIcon = t(`effects.${effectType}.icon`);

  // Gestionnaire de clic sur la tuile (pas sur le toggle)
  const handleTileClick = (e: React.MouseEvent) => {
    // Ne pas ouvrir si on clique sur le toggle
    const target = e.target as HTMLElement;
    if (target.closest('[role="switch"]')) {
      return;
    }

    setIsConfigOpen(true);
  };

  return (
    <>
      <Card
        className={cn(
          'relative overflow-hidden cursor-pointer transition-all duration-300',
          'hover:scale-[1.02] hover:shadow-lg',
          `bg-gradient-to-br ${visuals.gradient}`,
          visuals.borderColor,
          enabled && visuals.activeGlow,
          enabled && 'ring-2 ring-white/20',
          className
        )}
        onClick={handleTileClick}
      >
        {/* Indicateur actif - Animation brillante */}
        {enabled && (
          <div className="absolute top-0 right-0 p-2">
            <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
          </div>
        )}

        <div className="p-4">
          {/* Header avec icône et toggle */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{effectIcon}</span>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">
                  {effectName}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
                  {effectDescription}
                </p>
              </div>
            </div>

            {/* Toggle - cliquable indépendamment */}
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={enabled}
                onCheckedChange={onToggle}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </div>

          {/* État et action */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span
              className={cn(
                'text-xs font-medium',
                enabled ? 'text-green-400' : 'text-gray-500'
              )}
            >
              {enabled ? t('status.on') : t('status.off')}
            </span>

            <button
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              onClick={handleTileClick}
            >
              <span>{t('configure')}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </Card>

      {/* Dialog de configuration */}
      {configurationComponent && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent className="max-w-2xl bg-gray-900/95 backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <span className="text-2xl">{effectIcon}</span>
                <span>{effectName}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4">
              {configurationComponent}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
