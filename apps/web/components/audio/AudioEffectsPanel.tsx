'use client';

import React, { memo } from 'react';
import { Sliders } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { AudioEffectIcon } from './AudioEffectIcon';
import { AudioEffectsGraph } from './AudioEffectsGraph';
import { AudioEffectsTimeline } from './AudioEffectsTimeline';
import { AudioEffectsOverview } from './AudioEffectsOverview';
import { getEffectName, EFFECT_TAB_CLASSES } from '@/utils/audio-effects-config';
import { formatTime } from '@/utils/audio-formatters';

interface AudioEffectsPanelProps {
  appliedEffects: AudioEffectType[];
  effectsTimeline: Array<{ effectType: AudioEffectType; startTime: number; endTime: number }>;
  effectsConfigurations: Record<AudioEffectType, Array<{ timestamp: number; config: Record<string, number> }>>;
  duration: number;
  attachmentDuration?: number;
  selectedEffectTab: AudioEffectType | 'overview';
  setSelectedEffectTab: (tab: AudioEffectType | 'overview') => void;
  visibleCurves: Record<string, Record<string, boolean>>;
  setVisibleCurves: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
  visibleOverviewCurves: Record<string, boolean>;
  setVisibleOverviewCurves: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSeekToTime: (time: number) => void;
}

/**
 * Panneau d'effets audio avec visualisations
 * Affiche la timeline et les graphiques des effets appliqués
 * Chargé dynamiquement pour optimiser le bundle
 */
export const AudioEffectsPanel = memo<AudioEffectsPanelProps>(({
  appliedEffects,
  effectsTimeline,
  effectsConfigurations,
  duration,
  attachmentDuration,
  selectedEffectTab,
  setSelectedEffectTab,
  visibleCurves,
  setVisibleCurves,
  visibleOverviewCurves,
  setVisibleOverviewCurves,
  isOpen,
  setIsOpen,
  onSeekToTime,
}) => {
  const totalDuration = duration || attachmentDuration || 1;

  // Handler pour toggle la visibilité d'une courbe
  const handleToggleCurve = (effect: AudioEffectType, key: string) => {
    setVisibleCurves(prev => ({
      ...prev,
      [effect]: {
        ...prev[effect],
        [key]: !(prev[effect]?.[key] ?? true),
      },
    }));
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors cursor-pointer"
            title={appliedEffects.length === 1 ? `Effet: ${appliedEffects[0]}` : `${appliedEffects.length} effets appliqués`}
          >
            {appliedEffects.length === 1 ? (
              <AudioEffectIcon effect={appliedEffects[0]} className="w-3 h-3" />
            ) : (
              <Sliders className="w-3 h-3" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-96 p-4 max-h-96 overflow-hidden" side="top" align="end">
          <Tabs value={selectedEffectTab} onValueChange={(value) => setSelectedEffectTab(value as AudioEffectType | 'overview')}>
            <TabsList
              className="grid w-full bg-gray-100 dark:bg-gray-800 p-1"
              style={{ gridTemplateColumns: `repeat(${appliedEffects.length + 1}, 1fr)` }}
            >
              <TabsTrigger value="overview" className={`flex items-center justify-center p-2 rounded-lg transition-colors ${EFFECT_TAB_CLASSES['overview']}`}>
                <Sliders className="w-5 h-5" />
              </TabsTrigger>
              {appliedEffects.map((effect) => (
                <TabsTrigger key={effect} value={effect} className={`flex items-center justify-center p-2 rounded-lg transition-colors ${EFFECT_TAB_CLASSES[effect]}`}>
                  <AudioEffectIcon effect={effect} className="w-5 h-5" />
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Tab Vue d'ensemble */}
            <TabsContent value="overview" className="mt-4 space-y-3 max-h-72 overflow-x-auto overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Timeline des effets</h3>

              {effectsTimeline.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded">
                  Aucune donnée de timeline disponible
                </div>
              ) : (
                <>
                  {/* Timeline */}
                  <AudioEffectsTimeline
                    appliedEffects={appliedEffects}
                    effectsTimeline={effectsTimeline}
                    totalDuration={totalDuration}
                    onSeekToTime={onSeekToTime}
                  />

                  {/* Légende du temps */}
                  <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                    <span>0:00</span>
                    <span>{formatTime(totalDuration)}</span>
                  </div>

                  {/* Graphe fusionné */}
                  {appliedEffects.some(effect => effectsConfigurations[effect]?.length > 0) && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Évolution de tous les paramètres</h4>
                      <AudioEffectsOverview
                        appliedEffects={appliedEffects}
                        effectsConfigurations={effectsConfigurations}
                        totalDuration={totalDuration}
                        visibleOverviewCurves={visibleOverviewCurves}
                        setVisibleOverviewCurves={setVisibleOverviewCurves}
                        onSeekToTime={onSeekToTime}
                      />
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Tabs individuels pour chaque effet */}
            {appliedEffects.map((effect) => {
              const segments = effectsTimeline.filter(s => s.effectType === effect);
              const configs = effectsConfigurations[effect] || [];

              return (
                <TabsContent key={effect} value={effect} className="mt-4 space-y-3 max-h-72 overflow-x-auto overflow-y-auto">
                  <div className="flex items-center gap-2">
                    <AudioEffectIcon effect={effect} className="w-5 h-5" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getEffectName(effect)}</h3>
                  </div>

                  {/* Informations sur l'effet */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Périodes d'activation:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{segments.length}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Temps total:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {formatTime(segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0) / 1000)}
                      </span>
                    </div>
                  </div>

                  {/* Graphique des configurations */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Évolution des paramètres</h4>
                    {configs.length > 0 ? (
                      <AudioEffectsGraph
                        effect={effect}
                        configurations={configs}
                        totalDuration={totalDuration}
                        visibleCurves={visibleCurves[effect] || {}}
                        onToggleCurve={(key) => handleToggleCurve(effect, key)}
                        onSeekToTime={onSeekToTime}
                      />
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded">
                        Aucune configuration disponible pour cet effet
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

AudioEffectsPanel.displayName = 'AudioEffectsPanel';
