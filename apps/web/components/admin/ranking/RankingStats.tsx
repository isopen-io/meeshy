import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Area, AreaChart, Line } from 'recharts';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';

interface RankingStatsProps {
  rankings: RankingItem[];
  criterion: string;
  entityType: 'users' | 'conversations' | 'messages' | 'links';
}

function formatCount(count: number | undefined) {
  if (count === undefined) return '0';
  return count.toLocaleString('fr-FR');
}

export function RankingStats({ rankings, criterion, entityType }: RankingStatsProps) {
  const currentCriterion = React.useMemo(() => {
    return RANKING_CRITERIA[entityType].find(c => c.value === criterion);
  }, [entityType, criterion]);

  if (criterion === 'recent_activity' || rankings.length === 0) {
    return null;
  }

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
            <span>Visualisation - Top {Math.min(10, rankings.length)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={top10Data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#fef3c7" />
              <XAxis type="number" stroke="#d97706" />
              <YAxis
                dataKey="name"
                type="category"
                width={150}
                stroke="#d97706"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fffbeb',
                  border: '2px solid #fbbf24',
                  borderRadius: '8px',
                  color: '#92400e'
                }}
                formatter={(value: any) => [formatCount(value), currentCriterion?.label]}
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
            <span>Évolution et distribution des performances</span>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#fef3c7" />
              <XAxis
                dataKey="position"
                stroke="#d97706"
                tick={{ fontSize: 11 }}
                interval={rankings.length > 10 ? 1 : 0}
              />
              <YAxis
                stroke="#d97706"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fffbeb',
                  border: '2px solid #fbbf24',
                  borderRadius: '8px',
                  color: '#92400e'
                }}
                formatter={(value: any) => [formatCount(value), currentCriterion?.label]}
                labelFormatter={(label) => `Position ${label}`}
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
            <p>Ce graphique montre la distribution des performances du top {Math.min(20, rankings.length)} classé par rang.</p>
            <p className="text-xs mt-1">La courbe descendante indique comment les valeurs diminuent à travers les positions.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
