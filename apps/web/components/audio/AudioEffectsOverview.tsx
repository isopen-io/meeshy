'use client';

import React, { memo, useMemo } from 'react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { AudioEffectIcon } from './AudioEffectIcon';
import { formatTime } from '@/utils/audio-formatters';
import { CURVE_COLORS, getParameterName, getEffectName } from '@/utils/audio-effects-config';

interface AudioEffectsOverviewProps {
  appliedEffects: AudioEffectType[];
  effectsConfigurations: Record<AudioEffectType, Array<{ timestamp: number; config: Record<string, number> }>>;
  totalDuration: number;
  visibleOverviewCurves: Record<string, boolean>;
  setVisibleOverviewCurves: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onSeekToTime: (time: number) => void;
}

/**
 * Vue d'ensemble fusionnée de tous les effets audio
 * Affiche toutes les courbes de paramètres sur un seul graphique
 */
export const AudioEffectsOverview = memo<AudioEffectsOverviewProps>(({
  appliedEffects,
  effectsConfigurations,
  totalDuration,
  visibleOverviewCurves,
  setVisibleOverviewCurves,
  onSeekToTime,
}) => {
  const width = 350;
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 40, left: 40 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Collecter toutes les courbes
  const allCurves = useMemo(() => {
    const curves: Array<{
      effectType: AudioEffectType;
      key: string;
      points: Array<{ timestamp: number; value: number }>;
      color: string;
    }> = [];

    let colorIndex = 0;

    appliedEffects.forEach(effect => {
      const configs = effectsConfigurations[effect] || [];
      if (configs.length === 0) return;

      const configKeys = Array.from(new Set(configs.flatMap(c =>
        Object.keys(c.config).filter(key => typeof c.config[key] === 'number')
      )));

      configKeys.forEach(key => {
        const points = configs
          .filter(c => typeof c.config[key] === 'number' && isFinite(c.config[key]))
          .map(c => ({
            timestamp: c.timestamp / 1000,
            value: c.config[key] as number,
          }));

        if (points.length > 0) {
          curves.push({
            effectType: effect,
            key,
            points,
            color: CURVE_COLORS[colorIndex % CURVE_COLORS.length],
          });
          colorIndex++;
        }
      });
    });

    return curves;
  }, [appliedEffects, effectsConfigurations]);

  // Calculer min/max pour les courbes visibles
  const { minValue, maxValue } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    allCurves.forEach(curve => {
      const curveKey = `${curve.effectType}-${curve.key}`;
      if (visibleOverviewCurves[curveKey] === false) return;

      curve.points.forEach(p => {
        min = Math.min(min, p.value);
        max = Math.max(max, p.value);
      });
    });

    // Ajouter une marge de 10%
    if (isFinite(min) && isFinite(max)) {
      const range = max - min;
      const margin = range * 0.1;
      min -= margin;
      max += margin;
    } else {
      min = 0;
      max = 1;
    }

    return { minValue: min, maxValue: max };
  }, [allCurves, visibleOverviewCurves]);

  const timeToX = (time: number) => (time / totalDuration) * graphWidth;
  const valueToY = (value: number) => graphHeight - ((value - minValue) / (maxValue - minValue)) * graphHeight;

  if (allCurves.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Graphique SVG */}
      <svg width={width} height={height} className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900">
        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="currentColor"
          className="text-gray-400"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="currentColor"
          className="text-gray-400"
          strokeWidth="1"
        />

        {/* Grille horizontale */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + graphHeight * ratio;
          const value = maxValue - (maxValue - minValue) * ratio;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
              <text
                x={padding.left - 5}
                y={y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="text-[8px] fill-gray-500 dark:fill-gray-400"
              >
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Grille verticale (temps) */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const x = padding.left + graphWidth * ratio;
          const time = totalDuration * ratio;
          return (
            <g key={i}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
              <text
                x={x}
                y={height - padding.bottom + 15}
                textAnchor="middle"
                className="text-[8px] fill-gray-500 dark:fill-gray-400"
              >
                {formatTime(time)}
              </text>
            </g>
          );
        })}

        {/* Toutes les courbes */}
        {allCurves.map((curve) => {
          const curveKey = `${curve.effectType}-${curve.key}`;
          if (visibleOverviewCurves[curveKey] === false) return null;

          const pointsData = curve.points.map(p => ({
            x: padding.left + timeToX(p.timestamp),
            y: padding.top + valueToY(p.value),
            timestamp: p.timestamp,
            value: p.value,
          }));

          if (pointsData.length === 0) return null;

          const pathData = pointsData.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

          return (
            <g key={curveKey}>
              <path
                d={pathData}
                fill="none"
                stroke={curve.color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
              {pointsData.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill={curve.color}
                  className="cursor-pointer transition-[r]"
                  onClick={() => onSeekToTime(p.timestamp)}
                  onMouseEnter={(e) => e.currentTarget.setAttribute('r', '5')}
                  onMouseLeave={(e) => e.currentTarget.setAttribute('r', '3')}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`${getEffectName(curve.effectType)} - ${curve.key}: ${p.value.toFixed(2)} à ${formatTime(p.timestamp)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Légende interactive */}
      <div className="flex flex-wrap gap-2 justify-center">
        {allCurves.map((curve) => {
          const curveKey = `${curve.effectType}-${curve.key}`;
          const isVisible = visibleOverviewCurves[curveKey] !== false;

          return (
            <button
              key={curveKey}
              onClick={() => {
                setVisibleOverviewCurves(prev => ({
                  ...prev,
                  [curveKey]: !isVisible,
                }));
              }}
              className={`px-2 py-0.5 md:py-1 text-xs rounded-full border transition-[background-color,border-color,opacity] ${
                isVisible
                  ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 opacity-50'
              }`}
              style={{
                borderColor: isVisible ? curve.color : undefined,
              }}
            >
              <span
                className="inline-block w-3 h-3 rounded-full mr-1"
                style={{ backgroundColor: curve.color }}
              />
              <AudioEffectIcon effect={curve.effectType} className="w-3 h-3 inline" />
              <span className="ml-1">{getParameterName(curve.key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

AudioEffectsOverview.displayName = 'AudioEffectsOverview';
