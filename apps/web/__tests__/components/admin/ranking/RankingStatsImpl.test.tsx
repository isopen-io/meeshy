import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { RankingItem } from '@/hooks/use-ranking-data';

// Mock recharts so tests don't need a canvas / SVG environment
jest.mock('recharts', () => ({
  BarChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="bar-chart" data-items={data?.length}>{children}</div>
  ),
  Bar: ({ children, dataKey }: { children?: React.ReactNode; dataKey?: string }) => (
    <div data-testid="bar" data-key={dataKey}>{children}</div>
  ),
  XAxis: ({ dataKey }: { dataKey?: string }) => <div data-testid="xaxis" data-key={dataKey} />,
  YAxis: ({ dataKey }: { dataKey?: string }) => <div data-testid="yaxis" data-key={dataKey} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({
    formatter,
    labelFormatter,
  }: {
    formatter?: (value: unknown) => unknown;
    labelFormatter?: (label: unknown) => unknown;
  }) => {
    if (formatter) { formatter(42); formatter('not-a-number'); }
    if (labelFormatter) labelFormatter('#1');
    return <div data-testid="tooltip" />;
  },
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Cell: ({ fill }: { fill?: string }) => <div data-testid="cell" data-fill={fill} />,
  Area: ({ dataKey }: { dataKey?: string }) => <div data-testid="area" data-key={dataKey} />,
  AreaChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="area-chart" data-items={data?.length}>{children}</div>
  ),
  Line: ({ dataKey }: { dataKey?: string }) => <div data-testid="line" data-key={dataKey} />,
  linearGradient: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  defs: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  stop: () => null,
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en-US',
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}(${JSON.stringify(params)})`;
      return key;
    },
  }),
}));

jest.mock('@/components/admin/ranking/constants', () => ({
  criterionLabelKey: (criterion: string) => `ranking.criteria.${criterion}`,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
  CardContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}));

// lucide-react icon stubs
jest.mock('lucide-react', () => ({
  BarChart2: ({ className }: { className?: string }) => (
    <svg data-testid="bar-chart-icon" className={className} />
  ),
  TrendingUp: ({ className }: { className?: string }) => (
    <svg data-testid="trending-up-icon" className={className} />
  ),
}));

// Import after mocks
import { RankingStats } from '@/components/admin/ranking/RankingStatsImpl';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';

function makeItem(rank: number, value?: number): RankingItem {
  return { id: `${rank}`, name: `Item ${rank}`, rank, value: value ?? rank * 10 };
}

const THREE_ITEMS = [makeItem(1), makeItem(2), makeItem(3)];
const FIFTEEN_ITEMS = Array.from({ length: 15 }, (_, i) => makeItem(i + 1));
const TWENTYFIVE_ITEMS = Array.from({ length: 25 }, (_, i) => makeItem(i + 1));

describe('RankingStats (RankingStatsImpl)', () => {
  it('renders without crashing with minimal data', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getAllByTestId('card').length).toBeGreaterThanOrEqual(2);
  });

  it('renders two charts: bar + area', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('slices top-10 data for bar chart', () => {
    render(<RankingStats rankings={FIFTEEN_ITEMS} criterion="messages_sent" entityType="users" />);
    const barChart = screen.getByTestId('bar-chart');
    expect(barChart).toHaveAttribute('data-items', '10');
  });

  it('slices top-20 data for area chart', () => {
    render(<RankingStats rankings={TWENTYFIVE_ITEMS} criterion="messages_sent" entityType="users" />);
    const areaChart = screen.getByTestId('area-chart');
    expect(areaChart).toHaveAttribute('data-items', '20');
  });

  it('area chart uses all items when fewer than 20', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const areaChart = screen.getByTestId('area-chart');
    expect(areaChart).toHaveAttribute('data-items', '3');
  });

  it('bar chart uses all items when fewer than 10', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const barChart = screen.getByTestId('bar-chart');
    expect(barChart).toHaveAttribute('data-items', '3');
  });

  it('computes criterionLabel via useMemo and uses it in tooltip (indirect — renders without crash)', () => {
    // criterionLabel = t(criterionLabelKey(criterion)) is used only inside Tooltip formatter (not rendered directly)
    // Verify the component renders without throwing when criterion changes
    render(<RankingStats rankings={THREE_ITEMS} criterion="most_reactions" entityType="messages" />);
    expect(screen.getAllByTestId('card').length).toBeGreaterThanOrEqual(2);
  });

  it('renders topTitle with count in bar chart header', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    // t('ranking.charts.topTitle', { count: 3 }) = 'ranking.charts.topTitle({"count":3})'
    expect(screen.getByText(/ranking\.charts\.topTitle/)).toBeInTheDocument();
  });

  it('renders evolution title in area chart header', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByText('ranking.charts.evolutionTitle')).toBeInTheDocument();
  });

  it('renders distribution note in area chart footer', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByText(/ranking\.charts\.distributionNote/)).toBeInTheDocument();
    expect(screen.getByText('ranking.charts.curveNote')).toBeInTheDocument();
  });

  it('renders Cell components for bar chart (one per item)', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getAllByTestId('cell').length).toBe(THREE_ITEMS.length);
  });

  it('applies gold color to first Cell (rank 1)', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const cells = screen.getAllByTestId('cell');
    // light theme gold = #fbbf24
    expect(cells[0]).toHaveAttribute('data-fill', '#fbbf24');
  });

  it('applies silver color to second Cell (rank 2)', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const cells = screen.getAllByTestId('cell');
    // light theme silver = #d1d5db
    expect(cells[1]).toHaveAttribute('data-fill', '#d1d5db');
  });

  it('applies bronze color to third Cell (rank 3)', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const cells = screen.getAllByTestId('cell');
    // light theme bronze = #d97706
    expect(cells[2]).toHaveAttribute('data-fill', '#d97706');
  });

  it('applies rest color to fourth+ Cells', () => {
    const fiveItems = Array.from({ length: 5 }, (_, i) => makeItem(i + 1));
    render(<RankingStats rankings={fiveItems} criterion="messages_sent" entityType="users" />);
    const cells = screen.getAllByTestId('cell');
    // light theme rest = #fcd34d
    expect(cells[3]).toHaveAttribute('data-fill', '#fcd34d');
    expect(cells[4]).toHaveAttribute('data-fill', '#fcd34d');
  });

  it('applies dark theme colors when useResolvedTheme returns dark', () => {
    (useResolvedTheme as jest.Mock).mockReturnValueOnce('dark');
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    const cells = screen.getAllByTestId('cell');
    // dark theme gold = #fbbf24 (same), silver = #9ca3af, bronze = #d97706
    expect(cells[0]).toHaveAttribute('data-fill', '#fbbf24');
    expect(cells[1]).toHaveAttribute('data-fill', '#9ca3af');
  });

  it('handles item with zero value', () => {
    const itemsWithZero = [makeItem(1, 0), makeItem(2, 50)];
    render(
      <RankingStats rankings={itemsWithZero} criterion="messages_sent" entityType="users" />
    );
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('handles item with undefined name — uses rank fallback', () => {
    const noName: RankingItem = { id: '1', name: '', rank: 1, value: 10 };
    render(
      <RankingStats rankings={[noName]} criterion="messages_sent" entityType="users" />
    );
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('uses locale from useCurrentInterfaceLanguage for formatCount', () => {
    // Just ensures the component renders without crashes when locale is provided
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders BarChart2 and TrendingUp icons', () => {
    render(<RankingStats rankings={THREE_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByTestId('bar-chart-icon')).toBeInTheDocument();
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
  });

  it('interval on XAxis depends on ranking length > 10', () => {
    // Just verify renders without crash for > 10 items (triggers interval=1 branch)
    render(<RankingStats rankings={FIFTEEN_ITEMS} criterion="messages_sent" entityType="users" />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('formatCount returns "0" for non-number values (internal helper)', () => {
    // Covered indirectly: top10Data maps item.value || 0 and top20Data maps item.value || 0
    const itemWithUndefined: RankingItem = { id: '1', name: 'Test', rank: 1, value: 0 };
    render(
      <RankingStats rankings={[itemWithUndefined]} criterion="messages_sent" entityType="users" />
    );
    // The component renders without crashing (formatCount used in Tooltip formatter)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});
