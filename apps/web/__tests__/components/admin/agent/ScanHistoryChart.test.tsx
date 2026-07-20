import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { ScanStatsBucket } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getScanStats: jest.fn(),
  },
}));

jest.mock('recharts', () => {
  const React = require('react');
  return {
    ComposedChart: ({ children, data }: { children?: React.ReactNode; data?: unknown[] }) => (
      <div data-testid="composed-chart" data-count={data?.length}>{children}</div>
    ),
    Area: ({ dataKey }: { dataKey?: string }) => <div data-testid={`area-${dataKey}`} />,
    Line: ({ dataKey }: { dataKey?: string }) => <div data-testid={`line-${dataKey}`} />,
    Bar: ({ dataKey }: { dataKey?: string }) => <div data-testid={`bar-${dataKey}`} />,
    XAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) => {
      const formatted = tickFormatter?.('2024-01-05');
      return <div data-testid="x-axis" data-formatted={formatted} />;
    },
    YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => {
      const formatted = tickFormatter?.(0.5);
      return <div data-testid="y-axis" data-formatted={formatted} />;
    },
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: ({ content }: { content?: React.ReactElement }) => {
      if (!content) return <div data-testid="tooltip" />;
      const mockPayloadWithChange = [{ payload: { date: '2024-01-05', scans: 5, conversations: 2, users: 1, messagesSent: 3, reactionsSent: 0, costUsd: 0.01, configChanges: 1, outcomes: {} } }];
      const withProps = React.cloneElement(content, { active: true, payload: mockPayloadWithChange, label: '2024-01-05' });
      const withInactive = React.cloneElement(content, { active: false, payload: [] });
      const withEmptyPayload = React.cloneElement(content, { active: true, payload: [] });
      return <div data-testid="tooltip">{withProps}{withInactive}{withEmptyPayload}</div>;
    },
    ResponsiveContainer: ({ children, width, height }: { children?: React.ReactNode; width?: string | number; height?: number }) => (
      <div data-testid="responsive-container" style={{ width: String(width), height }}>{children}</div>
    ),
    ReferenceLine: ({ x, yAxisId }: { x?: string; yAxisId?: string }) => (
      <div data-testid="reference-line" data-x={x} />
    ),
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="card-title" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }: {
    children?: React.ReactNode; onClick?: () => void; variant?: string;
    size?: string; className?: string; disabled?: boolean;
  }) => (
    <button data-testid="button" data-variant={variant} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  TrendingUp: () => <svg data-testid="trendingup-icon" />,
  DollarSign: () => <svg data-testid="dollarsign-icon" />,
  Zap: () => <svg data-testid="zap-icon" />,
}));

import ScanHistoryChart from '@/components/admin/agent/ScanHistoryChart';

const mockGetScanStats = agentAdminService.getScanStats as jest.Mock;

function makeBucket(overrides: Partial<ScanStatsBucket> = {}): ScanStatsBucket {
  return {
    date: '2024-01-15',
    scans: 10,
    conversations: 5,
    users: 3,
    messagesSent: 8,
    reactionsSent: 2,
    costUsd: 0.05,
    configChanges: 0,
    outcomes: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScanHistoryChart — loading', () => {
  it('shows loading spinner while fetching', () => {
    mockGetScanStats.mockReturnValue(new Promise(() => {}));
    render(<ScanHistoryChart />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });
});

describe('ScanHistoryChart — empty data', () => {
  it('shows empty state message when no data', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByText('Aucune donnee sur cette periode')).toBeInTheDocument());
  });

  it('does not render chart when data is empty', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByText('Aucune donnee sur cette periode'));
    expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
  });
});

describe('ScanHistoryChart — data render', () => {
  it('renders chart when buckets present', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [makeBucket(), makeBucket({ date: '2024-01-16' })] } });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByTestId('composed-chart')).toBeInTheDocument());
  });

  it('shows total scan count badge', async () => {
    mockGetScanStats.mockResolvedValue({
      success: true,
      data: { buckets: [makeBucket({ scans: 10 }), makeBucket({ scans: 5, date: '2024-01-16' })] },
    });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByText(/15 scans/)).toBeInTheDocument());
  });

  it('shows total cost badge', async () => {
    mockGetScanStats.mockResolvedValue({
      success: true,
      data: { buckets: [makeBucket({ costUsd: 0.1 }), makeBucket({ costUsd: 0.2, date: '2024-01-16' })] },
    });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByText(/\$0\.30/)).toBeInTheDocument());
  });

  it('shows header title', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByText('Historique des scans')).toBeInTheDocument());
  });

  it('renders ReferenceLine for buckets with configChanges > 0', async () => {
    mockGetScanStats.mockResolvedValue({
      success: true,
      data: { buckets: [makeBucket({ configChanges: 2, date: '2024-01-15' }), makeBucket({ date: '2024-01-16' })] },
    });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByTestId('composed-chart'));
    const refLines = screen.getAllByTestId('reference-line');
    expect(refLines).toHaveLength(1);
    expect(refLines[0]).toHaveAttribute('data-x', '2024-01-15');
  });

  it('does not render ReferenceLine when no config changes', async () => {
    mockGetScanStats.mockResolvedValue({
      success: true,
      data: { buckets: [makeBucket({ configChanges: 0 })] },
    });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByTestId('composed-chart'));
    expect(screen.queryByTestId('reference-line')).not.toBeInTheDocument();
  });
});

describe('ScanHistoryChart — month controls', () => {
  it('renders month buttons: 1m, 3m, 6m', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getAllByTestId('button'));
    expect(screen.getByText('1m')).toBeInTheDocument();
    expect(screen.getByText('3m')).toBeInTheDocument();
    expect(screen.getByText('6m')).toBeInTheDocument();
  });

  it('clicking 1m sets months=1 and re-fetches', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByText('1m'));
    fireEvent.click(screen.getByText('1m'));
    await waitFor(() => {
      const calls = mockGetScanStats.mock.calls;
      expect(calls.some((c: unknown[]) => (c[0] as { months?: number }).months === 1)).toBe(true);
    });
  });

  it('clicking 3m sets months=3 and re-fetches', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByText('3m'));
    fireEvent.click(screen.getByText('3m'));
    await waitFor(() => {
      const calls = mockGetScanStats.mock.calls;
      expect(calls.some((c: unknown[]) => (c[0] as { months?: number }).months === 3)).toBe(true);
    });
  });
});

describe('ScanHistoryChart — bucket controls', () => {
  it('renders bucket buttons: Jour and Semaine', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByText('Jour'));
    expect(screen.getByText('Semaine')).toBeInTheDocument();
  });

  it('clicking Semaine sets bucket=week and re-fetches', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => screen.getByText('Semaine'));
    fireEvent.click(screen.getByText('Semaine'));
    await waitFor(() => {
      const calls = mockGetScanStats.mock.calls;
      expect(calls.some((c: unknown[]) => (c[0] as { bucket?: string }).bucket === 'week')).toBe(true);
    });
  });
});

describe('ScanHistoryChart — fetch failure', () => {
  it('silently handles getScanStats failure (success=false)', async () => {
    mockGetScanStats.mockResolvedValue({ success: false });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(screen.getByText('Aucune donnee sur cette periode')).toBeInTheDocument());
  });
});

describe('ScanHistoryChart — with conversationId', () => {
  it('passes conversationId to getScanStats', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart conversationId="conv-123" />);
    await waitFor(() => expect(mockGetScanStats).toHaveBeenCalled());
    expect(mockGetScanStats).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-123' }));
  });

  it('works without conversationId prop', async () => {
    mockGetScanStats.mockResolvedValue({ success: true, data: { buckets: [] } });
    render(<ScanHistoryChart />);
    await waitFor(() => expect(mockGetScanStats).toHaveBeenCalled());
    expect(mockGetScanStats).toHaveBeenCalledWith(expect.objectContaining({ conversationId: undefined }));
  });
});
