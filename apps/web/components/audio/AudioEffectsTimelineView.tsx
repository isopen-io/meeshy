/**
 * AUDIO EFFECTS TIMELINE VIEW
 * Visualisation de la timeline des effets audio appliqués
 * Affiche les effets utilisés, leur durée, et les statistiques
 */

'use client';

import React from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { AudioEffectsTimeline, AudioEffectType } from '@meeshy/shared/types';
import { calculateEffectsStats } from '@meeshy/shared/types/audio-effects-timeline';
import { cn } from '@/lib/utils';

interface AudioEffectsTimelineViewProps {
  timeline: AudioEffectsTimeline;
}

// Mapping des effets vers leurs couleurs et icônes
const EFFECT_CONFIG: Record<AudioEffectType, { color: string; bgColor: string; icon: string }> = {
  'voice-coder': {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: '🎤',
  },
  'baby-voice': {
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    icon: '👶',
  },
  'demon-voice': {
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: '😈',
  },
  'back-sound': {
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: '🎼',
  },
};

export function AudioEffectsTimelineView({ timeline }: AudioEffectsTimelineViewProps) {
  const { t } = useI18n('audioEffects');

  // Calculer les statistiques
  const stats = calculateEffectsStats(timeline);

  // Formater la durée en mm:ss
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Formater la durée totale
  const totalDuration = formatDuration(timeline.duration);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="border-b border-white/10 pb-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-xl">🎭</span>
          {t('timeline.title')}
        </h3>
        <div className="mt-1 text-xs text-gray-400">
          {t('timeline.duration')}: <span className="text-white font-medium">{totalDuration}</span>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="text-xs text-gray-400 mb-1">{t('timeline.effectsUsed')}</div>
          <div className="text-2xl font-bold text-purple-400">
            {timeline.metadata?.totalEffectsUsed || 0}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="text-xs text-gray-400 mb-1">{t('timeline.stats.parameterChanges')}</div>
          <div className="text-2xl font-bold text-pink-400">
            {timeline.metadata?.totalParameterChanges || 0}
          </div>
        </div>
      </div>

      {/* Liste des effets utilisés */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-300">{t('timeline.stats.title')}</h4>

        {Object.entries(stats.byEffect).map(([effectType, effectStats]) => {
          const config = EFFECT_CONFIG[effectType as AudioEffectType];
          const effectName = t(`effects.${effectType}.name`);
          const durationMs = effectStats.totalDuration;
          const duration = formatDuration(durationMs);
          const percentage = ((durationMs / timeline.duration) * 100).toFixed(0);

          return (
            <div
              key={effectType}
              className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
                  <span className={cn('text-sm font-medium', config.color)}>
                    {effectName}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {duration} ({percentage}%)
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{t('timeline.stats.activations')}</span>
                  <span className="text-white font-medium">{effectStats.activationCount}</span>
                </div>

                {effectStats.parameterChanges > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{t('timeline.stats.parameterChanges')}</span>
                    <span className="text-white font-medium">{effectStats.parameterChanges}</span>
                  </div>
                )}

                {/* Barre de progression */}
                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', config.bgColor)}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline visuelle (optionnelle - version simplifiée) */}
      <div className="border-t border-white/10 pt-3">
        <h4 className="text-xs font-semibold text-gray-400 mb-2">Timeline</h4>
        <div className="relative h-12 bg-white/5 rounded-lg overflow-hidden">
          {timeline.events.map((event, idx) => {
            if (event.action !== 'activate') return null;

            const config = EFFECT_CONFIG[event.effectType];
            const position = (event.timestamp / timeline.duration) * 100;

            // Trouver l'événement de désactivation
            const deactivateEvent = timeline.events
              .slice(idx + 1)
              .find(e => e.effectType === event.effectType && e.action === 'deactivate');

            const endPosition = deactivateEvent
              ? (deactivateEvent.timestamp / timeline.duration) * 100
              : 100;

            const width = endPosition - position;

            return (
              <div
                key={`${event.effectType}-${idx}`}
                className={cn('absolute top-1/2 -translate-y-1/2 h-6 rounded', config.bgColor)}
                style={{
                  left: `${position}%`,
                  width: `${width}%`,
                }}
                title={`${t(`effects.${event.effectType}.shortName`)} - ${formatDuration(event.timestamp)}`}
              >
                <span className="text-xs px-1">{config.icon}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info version */}
      <div className="text-center text-[10px] text-gray-500 border-t border-white/5 pt-2">
        Timeline v{timeline.version} • {new Date(timeline.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
