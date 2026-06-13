import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Area, AreaChart, Line } from 'recharts';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { useI18n } from '@/hooks/useI18n';

export interface RankingStatsProps {
  rankings: RankingItem[];
  criterion: string;
  entityType: 'users' | 'conversations' | 'messages' | 'links';
}

function formatCount(count: unknown, locale: string) {
  if (typeof count !== 'number') return '0';
  return count.toLocaleString(locale);
}

export function RankingStats({ rankings, criterion, entityType }: RankingStatsProps) {
  const locale = useCurrentInterfaceLanguage();
  const { t } = useI18n('admin');
  const isDark = useResolvedTheme() === 'dark';
  const chartColors = isDark
    ? { grid: '#78350f', axis: '#fbbf24', tooltipBg: '#1c1917', tooltipBorder: '#d97706', tooltipText: '#fde68a', gold: '#fbbf24', silver: '#9ca3af', bronze: '#d97706', rest: '#b45309' }
    : { grid: '#fef3c7', axis: '#d97706', tooltipBg: '#fffbeb', tooltipBorder: '#fbbf24', tooltipText: '#92400e', gold: '#fbbf24', silver: '#d1d5db', bronze: '#d97706', rest: '#fcd34d' };
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
            <span>{t('ranking.charts.topTitle', { count: Math.min(10, rankings.length) })}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={top10Data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis type="number" stroke={chartColors.axis} />
              <YAxis
                dataKey="name"
                type="category"
                width={150}
                stroke={chartColors.axis}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `2px solid ${chartColors.tooltipBorder}`,
                  borderRadius: '8px',
                  color: chartColors.tooltipText
                }}
                formatter={(value: unknown) => [formatCount(value, locale), currentCriterion?.label]}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {top10Data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      index === 0
                        ? chartColors.gold
                        : index === 1
                        ? chartColors.silver
                        : index === 2
                        ? chartColors.bronze
                        : chartColors.rest
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
            <span>{t('ranking.charts.evolutionTitle')}</span>
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
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="position"
                stroke={chartColors.axis}
                tick={{ fontSize: 11 }}
                interval={rankings.length > 10 ? 1 : 0}
              />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `2px solid ${chartColors.tooltipBorder}`,
                  borderRadius: '8px',
                  color: chartColors.tooltipText
                }}
                formatter={(value: unknown) => [formatCount(value, locale), currentCriterion?.label]}
                labelFormatter={(label) => t('ranking.charts.position', { label: String(label) })}
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
            <p>{t('ranking.charts.distributionNote', { count: Math.min(20, rankings.length) })}</p>
            <p className="text-xs mt-1">{t('ranking.charts.curveNote')}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
