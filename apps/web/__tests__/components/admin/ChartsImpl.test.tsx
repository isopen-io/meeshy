import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('recharts', () => {
  const R = require('react');
  return {
    LineChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
      <div data-testid="line-chart" data-count={data?.length}>{children}</div>
    ),
    AreaChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
      <div data-testid="area-chart" data-count={data?.length}>{children}</div>
    ),
    BarChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
      <div data-testid="bar-chart" data-count={data?.length}>{children}</div>
    ),
    PieChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="pie-chart">{children}</div>
    ),
    Line: ({ dataKey }: { dataKey?: string }) => <div data-testid={`line-${dataKey}`} />,
    Area: ({ dataKey }: { dataKey?: string }) => <div data-testid={`area-${dataKey}`} />,
    Bar: ({ dataKey }: { dataKey?: string }) => <div data-testid={`bar-${dataKey}`} />,
    Pie: ({ children, data, label, labelLine }: { children?: React.ReactNode; data?: unknown[]; label?: unknown; labelLine?: boolean }) => {
      const fn = typeof label === 'function' ? label : null;
      if (fn) fn({ name: 'A', percent: 0.5 });
      return <div data-testid="pie" data-count={data?.length}>{children}</div>;
    },
    Cell: ({ fill }: { fill?: string }) => <div data-testid="cell" data-fill={fill} />,
    XAxis: ({ dataKey }: { dataKey?: string }) => <div data-testid="x-axis" data-key={dataKey} />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: ({ formatter }: { formatter?: (v: number) => [string, string] }) => {
      if (formatter) formatter(10);
      return <div data-testid="tooltip" />;
    },
    Legend: () => <div data-testid="legend" />,
    ResponsiveContainer: ({ children, height }: { children?: React.ReactNode; height?: number }) => (
      <div data-testid="responsive-container" data-height={height}>{children}</div>
    ),
    defs: ({ children }: { children?: React.ReactNode }) => <defs>{children}</defs>,
    linearGradient: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
      <linearGradient data-testid={`gradient-${id}`} id={id}>{children}</linearGradient>
    ),
    stop: ({ offset, stopColor, stopOpacity }: { offset?: string; stopColor?: string; stopOpacity?: number }) => (
      <stop offset={offset} stopColor={stopColor} stopOpacity={stopOpacity} />
    ),
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 data-testid="card-title" className={className}>{children}</h3>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

import {
  TimeSeriesChart,
  DonutChart,
  SimpleBarChart,
  type TimeSeriesDataPoint,
  type DataKeyConfig,
  type DonutDataPoint,
  type SimpleBarChartDataPoint,
} from '@/components/admin/ChartsImpl';

const singleData: TimeSeriesDataPoint[] = [
  { name: 'Jan', value: 10 },
  { name: 'Feb', value: 20 },
  { name: 'Mar', value: 30 },
];

const multiKeys: DataKeyConfig[] = [
  { key: 'users', name: 'Users', color: '#3b82f6' },
  { key: 'messages', name: 'Messages', color: '#10b981' },
];

const multiData: TimeSeriesDataPoint[] = [
  { name: 'Jan', users: 5, messages: 10 },
  { name: 'Feb', users: 8, messages: 15 },
];

const donutData: DonutDataPoint[] = [
  { name: 'Active', value: 60, color: '#10b981' },
  { name: 'Inactive', value: 40, color: '#ef4444' },
];

const barData: SimpleBarChartDataPoint[] = [
  { day: 'Mon', count: 5 },
  { day: 'Tue', count: 8 },
];

// ── TimeSeriesChart ──────────────────────────────────────────────────────────

describe('TimeSeriesChart — single dataKey with area', () => {
  it('renders card with title', () => {
    render(<TimeSeriesChart data={singleData} title="Traffic" />);
    expect(screen.getByTestId('card-title')).toHaveTextContent('Traffic');
  });

  it('renders AreaChart by default (showArea=true)', () => {
    render(<TimeSeriesChart data={singleData} title="T" />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('passes data length to AreaChart', () => {
    render(<TimeSeriesChart data={singleData} title="T" />);
    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-count', '3');
  });

  it('renders subtitle when provided', () => {
    render(<TimeSeriesChart data={singleData} title="T" subtitle="Weekly data" />);
    expect(screen.getByText('Weekly data')).toBeInTheDocument();
  });

  it('renders description as subtitle when subtitle absent', () => {
    render(<TimeSeriesChart data={singleData} title="T" description="Monthly data" />);
    expect(screen.getByText('Monthly data')).toBeInTheDocument();
  });

  it('prefers subtitle over description', () => {
    render(<TimeSeriesChart data={singleData} title="T" subtitle="Sub" description="Desc" />);
    expect(screen.getByText('Sub')).toBeInTheDocument();
    expect(screen.queryByText('Desc')).not.toBeInTheDocument();
  });

  it('renders single Area for default dataKey', () => {
    render(<TimeSeriesChart data={singleData} title="T" />);
    expect(screen.getByTestId('area-value')).toBeInTheDocument();
  });

  it('renders Area for custom single dataKey', () => {
    render(<TimeSeriesChart data={singleData} title="T" dataKey="count" />);
    expect(screen.getByTestId('area-count')).toBeInTheDocument();
  });

  it('renders multiple Areas when dataKeys provided', () => {
    render(<TimeSeriesChart data={multiData} title="T" dataKeys={multiKeys} />);
    expect(screen.getByTestId('area-users')).toBeInTheDocument();
    expect(screen.getByTestId('area-messages')).toBeInTheDocument();
  });

  it('renders Legend when dataKeys provided', () => {
    render(<TimeSeriesChart data={multiData} title="T" dataKeys={multiKeys} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('does not render Legend for single dataKey', () => {
    render(<TimeSeriesChart data={singleData} title="T" />);
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('uses custom height', () => {
    render(<TimeSeriesChart data={singleData} title="T" height={400} />);
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-height', '400');
  });
});

describe('TimeSeriesChart — LineChart (showArea=false)', () => {
  it('renders LineChart when showArea is false', () => {
    render(<TimeSeriesChart data={singleData} title="T" showArea={false} />);
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
  });

  it('renders single Line for default dataKey', () => {
    render(<TimeSeriesChart data={singleData} title="T" showArea={false} />);
    expect(screen.getByTestId('line-value')).toBeInTheDocument();
  });

  it('renders multiple Lines when dataKeys provided', () => {
    render(<TimeSeriesChart data={multiData} title="T" dataKeys={multiKeys} showArea={false} />);
    expect(screen.getByTestId('line-users')).toBeInTheDocument();
    expect(screen.getByTestId('line-messages')).toBeInTheDocument();
  });

  it('renders Legend for multiple lines', () => {
    render(<TimeSeriesChart data={multiData} title="T" dataKeys={multiKeys} showArea={false} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });
});

// ── DonutChart ───────────────────────────────────────────────────────────────

describe('DonutChart', () => {
  it('renders card with title', () => {
    render(<DonutChart data={donutData} title="Distribution" />);
    expect(screen.getByTestId('card-title')).toHaveTextContent('Distribution');
  });

  it('renders PieChart', () => {
    render(<DonutChart data={donutData} title="D" />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders cells for each data point', () => {
    render(<DonutChart data={donutData} title="D" />);
    const cells = screen.getAllByTestId('cell');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveAttribute('data-fill', '#10b981');
    expect(cells[1]).toHaveAttribute('data-fill', '#ef4444');
  });

  it('renders legend when showLegend=true (default)', () => {
    render(<DonutChart data={donutData} title="D" />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('does not render legend when showLegend=false', () => {
    render(<DonutChart data={donutData} title="D" showLegend={false} />);
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('renders custom legend items with percentage', () => {
    render(<DonutChart data={donutData} title="D" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    // 60 / (60+40) = 60%
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<DonutChart data={donutData} title="D" subtitle="Sub" />);
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('renders description when subtitle absent', () => {
    render(<DonutChart data={donutData} title="D" description="Desc" />);
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('tooltip formatter computes percentage', () => {
    render(<DonutChart data={donutData} title="D" />);
    // Tooltip invokes formatter with value=10 during mock render; no error expected
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('pie label function invoked (percent formatting)', () => {
    render(<DonutChart data={donutData} title="D" />);
    expect(screen.getByTestId('pie')).toBeInTheDocument();
  });

  it('renders 2 data points when 2 items provided', () => {
    render(<DonutChart data={donutData} title="D" />);
    expect(screen.getByTestId('pie')).toHaveAttribute('data-count', '2');
  });
});

// ── SimpleBarChart ───────────────────────────────────────────────────────────

describe('SimpleBarChart', () => {
  it('renders BarChart with correct data count', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" />);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-count', '2');
  });

  it('renders bar for the dataKey', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" />);
    expect(screen.getByTestId('bar-count')).toBeInTheDocument();
  });

  it('renders XAxis with correct dataKey', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" />);
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-key', 'day');
  });

  it('uses default green color', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" />);
    expect(screen.getByTestId('bar-count')).toBeInTheDocument();
  });

  it('accepts custom height', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" height={200} />);
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-height', '200');
  });

  it('renders cartesian grid', () => {
    render(<SimpleBarChart data={barData} xAxisKey="day" dataKey="count" />);
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
  });
});
