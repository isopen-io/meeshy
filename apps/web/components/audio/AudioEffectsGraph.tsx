'use client';

import React, { memo, useMemo } from 'react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { formatTime } from '@/utils/audio-formatters';
import { CURVE_COLORS, getParameterName } from '@/utils/audio-effects-config';

interface AudioEffectsGraphProps {
  effect: AudioEffectType;
  configurations: Array<{ timestamp: number; config: Record<string, number> }>;
  totalDuration: number;
  visibleCurves: Record<string, boolean>;
  onToggleCurve: (key: string) => void;
  onSeekToTime: (time: number) => void;
}

/**
 * Graphique SVG pour afficher l'évolution des paramètres d'un effet audio
 * Utilisé dans le panneau d'effets pour visualiser les changements
 */
export const AudioEffectsGraph = memo<AudioEffectsGraphProps>(({
  effect,
  configurations,
  totalDuration,
  visibleCurves,
  onToggleCurve,
  onSeekToTime,
}) => {
  const width = 350;
  const height = 150;
  const padding = { top: 10, right: 10, bottom: 40, left: 40 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Extraire les clés de configuration
  const configKeys = useMemo(() => {
    return Array.from(new Set(configurations.flatMap(c =>
      Object.keys(c.config).filter(key => typeof c.config[key] === 'number')
    )));
  }, [configurations]);

  // Calculer min/max pour les courbes visibles
  const { minValue, maxValue } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    configKeys.forEach(key => {
      if (visibleCurves[key] !== false) {
        configurations.forEach(c => {
          const value = c.config[key];
          if (typeof value === 'number' && isFinite(value)) {
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        });
      }
    });

    // Ajouter une marge de 10%
    if (isFinite(min) && isFinite(max) && min !== max) {
      const range = max - min;
      const margin = range * 0.1;
      min -= margin;
      max += margin;
    } else if (min === max && isFinite(min)) {
      min = min - 0.5;
      max = max + 0.5;
    } else {
      min = 0;
      max = 1;
    }

    // S'assurer que la plage n'est jamais nulle
    if (max - min === 0) {
      max = min + 1;
    }

    return { minValue: min, maxValue: max };
  }, [configKeys, configurations, visibleCurves]);

  // Fonctions de conversion
  const timeToX = (time: number) => {
    if (!isFinite(time) || !isFinite(totalDuration) || totalDuration <= 0) {
      return 0;
    }
    const result = (time / totalDuration) * graphWidth;
    return isFinite(result) ? result : 0;
  };

  const valueToY = (value: number) => {
    if (!isFinite(value) || !isFinite(minValue) || !isFinite(maxValue)) {
      return graphHeight / 2;
    }
    const range = maxValue - minValue;
    if (range === 0) {
      return graphHeight / 2;
    }
    const result = graphHeight - ((value - minValue) / range) * graphHeight;
    return isFinite(result) ? result : graphHeight / 2;
  };

  if (configurations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded">
        Aucune configuration disponible pour cet effet
      </div>
    );
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

        {/* Courbes */}
        {configKeys.map((key, idx) => {
          if (visibleCurves[key] === false) return null;

          const pointsData = configurations
            .filter(c =>
              typeof c.config[key] === 'number' &&
              isFinite(c.config[key]) &&
              typeof c.timestamp === 'number' &&
              isFinite(c.timestamp) &&
              c.timestamp >= 0
            )
            .map(c => {
              const timeInSeconds = c.timestamp / 1000;
              const x = padding.left + timeToX(timeInSeconds);
              const y = padding.top + valueToY(c.config[key] as number);
              return {
                x,
                y,
                timestamp: timeInSeconds,
                value: c.config[key] as number,
              };
            })
            .filter(p => isFinite(p.x) && isFinite(p.y) && isFinite(p.timestamp));

          if (pointsData.length === 0) return null;

          const pathData = pointsData
            .filter(p => isFinite(p.x) && isFinite(p.y))
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
            .join(' ');

          if (!pathData || pathData.length === 0) return null;

          return (
            <g key={key}>
              <path
                d={pathData}
                fill="none"
                stroke={CURVE_COLORS[idx % CURVE_COLORS.length]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pointsData
                .filter(p => isFinite(p.x) && isFinite(p.y) && isFinite(p.value) && isFinite(p.timestamp))
                .map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x.toFixed(2)}
                    cy={p.y.toFixed(2)}
                    r="4"
                    fill={CURVE_COLORS[idx % CURVE_COLORS.length]}
                    className="cursor-pointer transition-all"
                    onClick={() => onSeekToTime(p.timestamp)}
                    onMouseEnter={(e) => e.currentTarget.setAttribute('r', '6')}
                    onMouseLeave={(e) => e.currentTarget.setAttribute('r', '4')}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${key}: ${isFinite(p.value) ? p.value.toFixed(2) : 'N/A'} à ${formatTime(p.timestamp)} - Cliquez pour aller à ce moment`}</title>
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>

      {/* Légende interactive */}
      <div className="flex flex-wrap gap-2 justify-center">
        {configKeys.map((key, idx) => (
          <button
            key={key}
            onClick={() => onToggleCurve(key)}
            className={`px-2 py-0.5 md:py-1 text-xs rounded-full border transition-all ${
              visibleCurves[key] !== false
                ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 opacity-50'
            }`}
            style={{
              borderColor: visibleCurves[key] !== false ? CURVE_COLORS[idx % CURVE_COLORS.length] : undefined,
            }}
          >
            <span
              className="inline-block w-3 h-3 rounded-full mr-1"
              style={{ backgroundColor: CURVE_COLORS[idx % CURVE_COLORS.length] }}
            />
            {getParameterName(key)}
          </button>
        ))}
      </div>
    </div>
  );
});

AudioEffectsGraph.displayName = 'AudioEffectsGraph';
