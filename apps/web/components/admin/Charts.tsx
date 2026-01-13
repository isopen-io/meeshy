'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

// ======================
// StatsGrid Components
// ======================

export interface StatItem {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
}

interface StatCardProps {
  stat: StatItem;
}

export function StatCard({ stat }: StatCardProps) {
  const Icon = stat.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {stat.title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${stat.iconBgColor}`}>
          <Icon className={`h-4 w-4 ${stat.iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stat.value}
          </span>
          {stat.badge && (
            <Badge variant={stat.badge.variant || 'default'} className="text-xs">
              {stat.badge.text}
            </Badge>
          )}
        </div>
        {stat.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stat.description}
          </p>
        )}
        {stat.trend && (
          <div className="flex items-center mt-2">
            {stat.trend.isPositive ? (
              <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400 mr-1" />
            )}
            <Badge
              variant="outline"
              className={`text-xs ${
                stat.trend.isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {stat.trend.isPositive ? '+' : ''}
              {stat.trend.value}%
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
}

export function StatsGrid({ stats, columns = 4 }: StatsGridProps) {
  const gridColsClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4'
  };

  return (
    <div className={`grid ${gridColsClass[columns]} gap-4`}>
      {stats.map((stat, index) => (
        <StatCard key={index} stat={stat} />
      ))}
    </div>
  );
}

// ======================
// TimeSeriesChart Component
// ======================

export interface TimeSeriesDataPoint {
  [key: string]: string | number;
}

export interface DataKeyConfig {
  key: string;
  name: string;
  color: string;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  title: string;
  subtitle?: string;
  description?: string;
  dataKey?: string;
  dataKeys?: DataKeyConfig[];
  xAxisKey?: string;
  color?: string;
  height?: number;
  showArea?: boolean;
}

export function TimeSeriesChart({
  data,
  title,
  subtitle,
  description,
  dataKey = 'value',
  dataKeys,
  xAxisKey = 'name',
  color = '#3b82f6',
  height = 300,
  showArea = true
}: TimeSeriesChartProps) {
  const displayDescription = subtitle || description;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </CardTitle>
        {displayDescription && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{displayDescription}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {showArea ? (
            <AreaChart data={data}>
              <defs>
                {dataKeys ? (
                  dataKeys.map((dk) => (
                    <linearGradient key={dk.key} id={`colorGradient-${dk.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={dk.color} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={dk.color} stopOpacity={0.1} />
                    </linearGradient>
                  ))
                ) : (
                  <linearGradient id={`colorGradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey={xAxisKey}
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
              />
              {dataKeys ? (
                dataKeys.map((dk) => (
                  <Area
                    key={dk.key}
                    type="monotone"
                    dataKey={dk.key}
                    name={dk.name}
                    stroke={dk.color}
                    strokeWidth={2}
                    fill={`url(#colorGradient-${dk.key})`}
                  />
                ))
              ) : (
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#colorGradient-${dataKey})`}
                />
              )}
              {dataKeys && <Legend />}
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey={xAxisKey}
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis
                className="text-xs text-gray-600 dark:text-gray-400"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
              />
              {dataKeys ? (
                dataKeys.map((dk) => (
                  <Line
                    key={dk.key}
                    type="monotone"
                    dataKey={dk.key}
                    name={dk.name}
                    stroke={dk.color}
                    strokeWidth={2}
                    dot={{ fill: dk.color, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))
              ) : (
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ fill: color, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              )}
              {dataKeys && <Legend />}
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ======================
// DonutChart Component
// ======================

export interface DonutDataPoint {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutDataPoint[];
  title: string;
  subtitle?: string;
  description?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

export function DonutChart({
  data,
  title,
  subtitle,
  description,
  height = 300,
  innerRadius = 60,
  outerRadius = 80,
  showLegend = true
}: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const displayDescription = subtitle || description;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </CardTitle>
        {displayDescription && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{displayDescription}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem'
              }}
              formatter={(value: number) => [
                `${value} (${((value / total) * 100).toFixed(1)}%)`,
                ''
              ]}
            />
            {showLegend && <Legend />}
          </PieChart>
        </ResponsiveContainer>

        {/* Légende personnalisée */}
        <div className="mt-4 space-y-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {item.value}
                </span>
                <Badge variant="outline" className="text-xs">
                  {((item.value / total) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Export all components
export default {
  StatsGrid,
  StatCard,
  TimeSeriesChart,
  DonutChart
};
