'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export interface TrackedLinkClicksChartProps {
  data: Array<Record<string, string | number>>;
  totalClicksKey: string;
  uniqueClicksKey: string;
  avgTotalKey: string;
  avgUniqueKey: string;
}

export function TrackedLinkClicksChart({
  data,
  totalClicksKey,
  uniqueClicksKey,
  avgTotalKey,
  avgUniqueKey
}: TrackedLinkClicksChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
          dataKey="date"
          angle={-45}
          textAnchor="end"
          height={80}
          className="text-xs"
        />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            border: 'none',
            borderRadius: '8px',
            color: 'white'
          }}
        />
        <Legend />
        <Bar
          dataKey={totalClicksKey}
          fill="#3b82f6"
          radius={[8, 8, 0, 0]}
        />
        <Bar
          dataKey={uniqueClicksKey}
          fill="#10b981"
          radius={[8, 8, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey={avgTotalKey}
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey={avgUniqueKey}
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
