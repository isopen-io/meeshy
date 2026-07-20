import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScanLogTable from '@/components/admin/agent/ScanLogTable';
import { agentAdminService } from '@/services/agent-admin.service';
import type { ScanLogSummary } from '@/services/agent-admin.service';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getScanLogs: jest.fn(),
  },
}));

jest.mock('next/dynamic', () => {
  return function dynamic(
    loader: () => Promise<unknown>,
    _opts?: { loading?: () => React.ReactNode }
  ) {
    loader().catch(() => {});
    return function DynamicScanLogDetail(props: Record<string, unknown>) {
      return (
        <div data-testid="scan-log-detail" data-log-id={String(props.logId)}>
          <button
            data-testid="detail-close"
            onClick={() => (props.onClose as () => void)?.()}
          >
            close
          </button>
        </div>
      );
    };
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
    variant,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockGetScanLogs = agentAdminService.getScanLogs as jest.Mock;

function makeLog(overrides: Partial<ScanLogSummary> = {}): ScanLogSummary {
  return {
    id: 'log-1',
    conversationId: 'conv1234567890',
    trigger: 'auto',
    startedAt: new Date().toISOString(),
    durationMs: 500,
    outcome: 'messages_sent',
    messagesSent: 0,
    reactionsSent: 0,
    messagesRejected: 0,
    userIdsUsed: [],
    totalInputTokens: 100,
    totalOutputTokens: 50,
    estimatedCostUsd: 0,
    conversation: null,
    ...overrides,
  };
}

const emptyResponse = { success: true, data: [], pagination: { total: 0 } };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetScanLogs.mockResolvedValue(emptyResponse);
});

describe('ScanLogTable — states', () => {
  it('shows loading spinner initially', () => {
    render(<ScanLogTable />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });

  it('shows empty message after fetch returns no logs', async () => {
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.getByText('scanLog.empty')).toBeInTheDocument()
    );
  });

  it('renders log rows after successful fetch', async () => {
    const log = makeLog({ conversation: { id: 'c1', title: 'My Channel', type: 'channel' } });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('My Channel')).toBeInTheDocument());
  });

  it('shows conversationId slice when conversation is null', async () => {
    const log = makeLog({ conversationId: 'abc123456789xyz', conversation: null });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('abc123456789')).toBeInTheDocument());
  });
});

describe('ScanLogTable — fetch failure handling', () => {
  it('shows empty state when fetch returns success:false', async () => {
    mockGetScanLogs.mockResolvedValue({ success: false });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.getByText('scanLog.empty')).toBeInTheDocument()
    );
  });
});

describe('ScanLogTable — formatTimeAgo', () => {
  async function renderLogWithStartedAt(startedAt: string) {
    const log = makeLog({ startedAt });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
  }

  it('shows "timeAgo.now" for timestamps < 1 minute ago', async () => {
    await renderLogWithStartedAt(new Date(Date.now() - 10_000).toISOString());
    expect(screen.getByText('timeAgo.now')).toBeInTheDocument();
  });

  it('shows minutes for timestamps 1–59 minutes ago', async () => {
    await renderLogWithStartedAt(new Date(Date.now() - 30 * 60_000).toISOString());
    expect(screen.getByText('30timeAgo.minutes')).toBeInTheDocument();
  });

  it('shows hours for timestamps 1–23 hours ago', async () => {
    await renderLogWithStartedAt(new Date(Date.now() - 5 * 3_600_000).toISOString());
    expect(screen.getByText('5timeAgo.hours')).toBeInTheDocument();
  });

  it('shows days for timestamps 1+ days ago', async () => {
    await renderLogWithStartedAt(new Date(Date.now() - 3 * 86_400_000).toISOString());
    expect(screen.getByText('3timeAgo.days')).toBeInTheDocument();
  });
});

describe('ScanLogTable — getTriggerLabel', () => {
  async function renderLogWithTrigger(trigger: string) {
    const log = makeLog({ trigger });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
  }

  it('translates known trigger "auto"', async () => {
    await renderLogWithTrigger('auto');
    expect(screen.getByText('trigger.auto')).toBeInTheDocument();
  });

  it('translates known trigger "manual"', async () => {
    await renderLogWithTrigger('manual');
    expect(screen.getByText('trigger.manual')).toBeInTheDocument();
  });

  it('returns trigger string as-is for unknown triggers', async () => {
    await renderLogWithTrigger('webhook');
    expect(screen.getByText('webhook')).toBeInTheDocument();
  });
});

describe('ScanLogTable — outcome badge styles', () => {
  it('applies emerald class for messages_sent outcome', async () => {
    const log = makeLog({ outcome: 'messages_sent' });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('messages sent')).toBeInTheDocument());
    expect(screen.getByText('messages sent')).toHaveClass('text-emerald-700');
  });

  it('falls back to skipped style for unknown outcome', async () => {
    const log = makeLog({ outcome: 'unknown_outcome' });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('unknown outcome')).toBeInTheDocument());
    expect(screen.getByText('unknown outcome')).toHaveClass('text-slate-500');
  });
});

describe('ScanLogTable — optional metric display', () => {
  it('shows messagesSent count when > 0', async () => {
    const log = makeLog({ messagesSent: 3 });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('3msg')).toBeInTheDocument());
  });

  it('hides messagesSent when === 0', async () => {
    const log = makeLog({ messagesSent: 0 });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/msg/)).not.toBeInTheDocument();
  });

  it('shows reactionsSent when > 0', async () => {
    const log = makeLog({ reactionsSent: 2 });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('2rx')).toBeInTheDocument());
  });

  it('shows estimatedCostUsd when > 0', async () => {
    const log = makeLog({ estimatedCostUsd: 0.0012 });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() => expect(screen.getByText('$0.0012')).toBeInTheDocument());
  });
});

describe('ScanLogTable — pagination', () => {
  it('shows pagination when total > limit (15)', async () => {
    const logs = Array.from({ length: 15 }, (_, i) => makeLog({ id: `log-${i}` }));
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 30 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('chevronright-icon')).toBeInTheDocument();
  });

  it('hides pagination when total <= limit', async () => {
    const log = makeLog();
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 5 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId('chevronright-icon')).not.toBeInTheDocument();
  });

  it('uses total=0 when pagination is absent in response', async () => {
    const log = makeLog();
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log] });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    // Total is 0, which is <= 15, so no pagination
    expect(screen.queryByTestId('chevronright-icon')).not.toBeInTheDocument();
  });
});

describe('ScanLogTable — filter buttons', () => {
  it('renders all 4 filter buttons', async () => {
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.getByText('filter.all')).toBeInTheDocument();
    expect(screen.getByText('filter.sent')).toBeInTheDocument();
    expect(screen.getByText('filter.skip')).toBeInTheDocument();
    expect(screen.getByText('filter.error')).toBeInTheDocument();
  });

  it('clicking a filter button refetches with outcome filter', async () => {
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    mockGetScanLogs.mockClear();
    mockGetScanLogs.mockResolvedValue(emptyResponse);
    fireEvent.click(screen.getByText('filter.sent'));
    await waitFor(() =>
      expect(mockGetScanLogs).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'messages_sent' })
      )
    );
  });
});

describe('ScanLogTable — pagination interactions', () => {
  it('clicking next button fetches page 2', async () => {
    const logs = Array.from({ length: 15 }, (_, i) => makeLog({ id: `log-${i}` }));
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 30 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    mockGetScanLogs.mockClear();
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 30 } });
    const nextBtn = screen.getByTestId('chevronright-icon').closest('button')!;
    fireEvent.click(nextBtn);
    await waitFor(() =>
      expect(mockGetScanLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
    );
  });

  it('prev button is disabled on first page', async () => {
    const logs = Array.from({ length: 15 }, (_, i) => makeLog({ id: `log-${i}` }));
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 30 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    const prevBtn = screen.getByTestId('chevronleft-icon').closest('button')!;
    expect(prevBtn).toBeDisabled();
  });

  it('clicking prev on page 2 goes back to page 1', async () => {
    const logs = Array.from({ length: 15 }, (_, i) => makeLog({ id: `log-${i}` }));
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 45 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    // Navigate to page 2
    mockGetScanLogs.mockClear();
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 45 } });
    fireEvent.click(screen.getByTestId('chevronright-icon').closest('button')!);
    await waitFor(() =>
      expect(mockGetScanLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
    );
    // Navigate back to page 1
    mockGetScanLogs.mockClear();
    mockGetScanLogs.mockResolvedValue({ success: true, data: logs, pagination: { total: 45 } });
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('chevronleft-icon').closest('button')!);
    await waitFor(() =>
      expect(mockGetScanLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    );
  });
});

describe('ScanLogTable — ScanLogDetail', () => {
  it('shows ScanLogDetail when a log row is clicked', async () => {
    const log = makeLog({ id: 'log-42' });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    // conversationId 'conv1234567890' → slice(0,12) → 'conv12345678'
    const logRow = screen.getByText('conv12345678').closest('button')!;
    fireEvent.click(logRow);
    const detail = screen.getByTestId('scan-log-detail');
    expect(detail).toHaveAttribute('data-log-id', 'log-42');
  });

  it('hides ScanLogDetail when its onClose is called', async () => {
    const log = makeLog({ id: 'log-42' });
    mockGetScanLogs.mockResolvedValue({ success: true, data: [log], pagination: { total: 1 } });
    render(<ScanLogTable />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByText('conv12345678').closest('button')!);
    expect(screen.getByTestId('scan-log-detail')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('detail-close'));
    expect(screen.queryByTestId('scan-log-detail')).not.toBeInTheDocument();
  });
});
