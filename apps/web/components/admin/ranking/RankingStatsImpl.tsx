import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Area, AreaChart, Line } from 'recharts';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { useI18n } from '@/hooks/useI18n';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';

export interface RankingStatsProps {
  rankings: RankingItem[];
  criterion: string;
  entityType: 'users' | 'conversations' | 'messages' | 'links';
}

function formatCount(count: unknown, locale: string) {
  if (typeof count !== 'number') return '0';
  return count.toLocaleString(locale);
}

const CHART_THEMES = {
  light: {
    grid: '#fef3c7',
    axis: '#d97706',
    tooltipBg: '#fffbeb',
    tooltipBorder: '#fbbf24',
    tooltipText: '#92400e',
  },
  dark: {
    grid: '#78350f',
    axis: '#fbbf24',
    tooltipBg: '#1c1917',
    tooltipBorder: '#b45309',
    tooltipText: '#fcd34d',
  },
} as const;

export function RankingStats({ rankings, criterion, entityType }: RankingStatsProps) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const chartTheme = CHART_THEMES[useResolvedTheme()];
  const currentCriterion = React.useMemo(() => {
    return RANKING_CRITERIA[entityType].find(c => c.value === criterion);
  }, [entityType, criterion]);

  const top10Data = rankings.slice(0, 10).map((item, index) => ({
    name: item.name || `#${index + 1}`,
    value: item.value || 0,
    rank: index + 1
  }));

  const top20Data = rankings.slice(0, 20).map((item, index) => ({
    position: `#${index + 1}`,
    value: item.value || 0,
    rank: index + 1
  }));

  return (
    <>
      <Card className="border-yellow-200 dark:border-yellow-800">
        <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
          <CardTitle className="flex items-center space-x-2">
            <BarChart2 className="h-5 w-5 text-yellow-600" />
            <span>{t('ranking.statsTopTitle', { count: Math.min(10, rankings.length) })}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={top10Data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis type="number" stroke={chartTheme.axis} />
              <YAxis
                dataKey="name"
                type="category"
                width={150}
                stroke={chartTheme.axis}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartTheme.tooltipBg,
                  border: `2px solid ${chartTheme.tooltipBorder}`,
                  borderRadius: '8px',
                  color: chartTheme.tooltipText
                }}
                formatter={(value: unknown) => [formatCount(value, locale), currentCriterion?.label]}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {top10Data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      index === 0
                        ? '#fbbf24'
                        : index === 1
                        ? '#d1d5db'
                        : index === 2
                        ? '#d97706'
                        : '#fcd34d'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-yellow-200 dark:border-yellow-800">
        <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-yellow-600" />
            <span>{t('ranking.statsDistributionTitle')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart
              data={top20Data}
              margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis
                dataKey="position"
                stroke={chartTheme.axis}
                tick={{ fontSize: 11 }}
                interval={rankings.length > 10 ? 1 : 0}
              />
              <YAxis
                stroke={chartTheme.axis}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartTheme.tooltipBg,
                  border: `2px solid ${chartTheme.tooltipBorder}`,
                  borderRadius: '8px',
                  color: chartTheme.tooltipText
                }}
                formatter={(value: unknown) => [formatCount(value, locale), currentCriterion?.label]}
                labelFormatter={(label) => t('ranking.statsPositionLabel', { label: String(label) })}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorValue)"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ fill: '#fbbf24', r: 4 }}
                activeDot={{ r: 6, fill: '#f59e0b' }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>{t('ranking.statsDistributionDesc', { count: Math.min(20, rankings.length) })}</p>
            <p className="text-xs mt-1">{t('ranking.statsDistributionHint')}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
