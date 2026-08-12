import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Provide a stub ChartsImpl so the loader functions inside dynamic() can be invoked
jest.mock('@/components/admin/ChartsImpl', () => ({
  TimeSeriesChart: () => <div data-testid="timeseries-impl" />,
  DonutChart: () => <div data-testid="donut-impl" />,
  SimpleBarChart: () => <div data-testid="simplebar-impl" />,
}));

// Mock next/dynamic: invoke the loader synchronously and also render loading skeleton
jest.mock('next/dynamic', () => {
  return function dynamic(
    loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>,
    opts?: { loading?: () => React.ReactNode }
  ) {
    // Invoke the loader (covers the arrow fn lines) — result is ignored for sync rendering
    loader().catch(() => {});
    return function DynamicComponent() {
      return opts?.loading ? <>{opts.loading()}</> : null;
    };
  };
});

import { StatCard, StatsGrid, type StatItem } from '@/components/admin/Charts';

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

const FakeIcon = () => <svg data-testid="stat-icon" />;

function makeStat(overrides: Partial<StatItem> = {}): StatItem {
  return {
    title: 'Total Users',
    value: 42,
    icon: FakeIcon,
    iconColor: 'text-blue-600',
    iconBgColor: 'bg-blue-100',
    ...overrides,
  };
}

describe('StatCard', () => {
  it('renders the stat title', () => {
    render(<StatCard stat={makeStat({ title: 'Active Users' })} />);
    expect(screen.getByText('Active Users')).toBeInTheDocument();
  });

  it('renders the stat value', () => {
    render(<StatCard stat={makeStat({ value: 1234 })} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('renders a string value', () => {
    render(<StatCard stat={makeStat({ value: '99%' })} />);
    expect(screen.getByText('99%')).toBeInTheDocument();
  });

  it('renders the icon', () => {
    render(<StatCard stat={makeStat()} />);
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  describe('optional description', () => {
    it('shows description when provided', () => {
      render(<StatCard stat={makeStat({ description: 'Last 30 days' })} />);
      expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    });

    it('omits description when not provided', () => {
      render(<StatCard stat={makeStat()} />);
      expect(screen.queryByText('Last 30 days')).not.toBeInTheDocument();
    });
  });

  describe('optional badge', () => {
    it('shows badge text when badge is provided', () => {
      render(<StatCard stat={makeStat({ badge: { text: '↑ 12%' } })} />);
      expect(screen.getByTestId('badge')).toHaveTextContent('↑ 12%');
    });

    it('uses badge.variant when provided', () => {
      render(
        <StatCard stat={makeStat({ badge: { text: 'new', variant: 'secondary' } })} />
      );
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'secondary');
    });

    it('falls back to "default" badge variant when not specified', () => {
      render(<StatCard stat={makeStat({ badge: { text: 'x' } })} />);
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'default');
    });

    it('omits badge when not provided', () => {
      render(<StatCard stat={makeStat()} />);
      // No badge rendered
      expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
    });
  });

  describe('optional trend', () => {
    it('shows "+" prefix and TrendingUp icon for positive trend', () => {
      render(<StatCard stat={makeStat({ trend: { value: 5, isPositive: true } })} />);
      const badges = screen.getAllByTestId('badge');
      const trendBadge = badges.find((b) => b.textContent?.includes('+'));
      expect(trendBadge).toHaveTextContent('+5%');
      expect(screen.getByTestId('trendingup-icon')).toBeInTheDocument();
    });

    it('shows no "+" prefix and TrendingDown icon for negative trend', () => {
      render(<StatCard stat={makeStat({ trend: { value: 3, isPositive: false } })} />);
      const badges = screen.getAllByTestId('badge');
      const trendBadge = badges.find((b) => b.textContent?.includes('3%'));
      expect(trendBadge).toHaveTextContent('3%');
      expect(screen.getByTestId('trendingdown-icon')).toBeInTheDocument();
    });

    it('omits trend section when trend is not provided', () => {
      render(<StatCard stat={makeStat()} />);
      expect(screen.queryByTestId('trendingup-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('trendingdown-icon')).not.toBeInTheDocument();
    });
  });
});

describe('dynamic chart loading skeletons', () => {
  it('TimeSeriesChart renders a skeleton while loading', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TimeSeriesChart } = require('@/components/admin/Charts');
    const { container } = render(<TimeSeriesChart />);
    expect(container.firstChild).not.toBeNull();
  });

  it('DonutChart renders a skeleton while loading', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DonutChart } = require('@/components/admin/Charts');
    const { container } = render(<DonutChart />);
    expect(container.firstChild).not.toBeNull();
  });

  it('SimpleBarChart renders a skeleton div while loading', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SimpleBarChart } = require('@/components/admin/Charts');
    const { container } = render(<SimpleBarChart />);
    expect(container.firstChild).not.toBeNull();
  });
});

describe('StatsGrid', () => {
  const stats = [
    makeStat({ title: 'A', value: 1 }),
    makeStat({ title: 'B', value: 2 }),
  ];

  it('renders all stats', () => {
    render(<StatsGrid stats={stats} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('uses 4-column grid by default', () => {
    const { container } = render(<StatsGrid stats={stats} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-2 lg:grid-cols-4');
  });

  it('uses 2-column grid when columns=2', () => {
    const { container } = render(<StatsGrid stats={stats} columns={2} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-1 md:grid-cols-2');
  });

  it('uses 3-column grid when columns=3', () => {
    const { container } = render(<StatsGrid stats={stats} columns={3} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-1 md:grid-cols-2 lg:grid-cols-3');
  });

  it('renders an empty grid without crashing', () => {
    expect(() => render(<StatsGrid stats={[]} />)).not.toThrow();
  });
});
