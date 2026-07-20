import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScanLogDetail from '@/components/admin/agent/ScanLogDetail';
import { agentAdminService } from '@/services/agent-admin.service';
import type {
  ScanLogDetail as ScanLogDetailType,
  ScanLogNodeResult,
} from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getScanLogDetail: jest.fn(),
  },
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }) => (
    <div data-testid="dialog">
      <button data-testid="dialog-close" onClick={() => onOpenChange?.(false)} />
      <button data-testid="dialog-reopen" onClick={() => onOpenChange?.(true)} />
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 data-testid="dialog-title" className={className}>{children}</h2>
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

jest.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    className,
    style,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div data-testid="card" className={className} style={style}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

const mockGetScanLogDetail = agentAdminService.getScanLogDetail as jest.Mock;

function makeNodeResult(overrides: Partial<ScanLogNodeResult> = {}): ScanLogNodeResult {
  return {
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    model: 'claude-haiku',
    costUsd: 0.001,
    extra: {},
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ScanLogDetailType> = {}): ScanLogDetailType {
  return {
    id: 'log-1',
    conversationId: 'conv1234567890ab',
    trigger: 'auto',
    startedAt: '2024-01-15T10:00:00Z',
    durationMs: 1200,
    outcome: 'messages_sent',
    messagesSent: 2,
    reactionsSent: 0,
    messagesRejected: 0,
    userIdsUsed: ['u1'],
    totalInputTokens: 100,
    totalOutputTokens: 50,
    estimatedCostUsd: 0.002,
    conversation: { id: 'c1', title: 'General Chat', type: 'channel' },
    triggeredBy: null,
    completedAt: '2024-01-15T10:00:01.2Z',
    activityScore: 0.75,
    messagesInWindow: 10,
    budgetBefore: null,
    controlledUserIds: ['u2'],
    configSnapshot: null,
    nodeResults: null,
    configChangedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetScanLogDetail.mockResolvedValue({ success: false });
});

describe('ScanLogDetail — loading state', () => {
  it('shows loading spinner initially', () => {
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });
});

describe('ScanLogDetail — not found', () => {
  it('shows "Scan log introuvable" when fetch returns no data', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: false });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Scan log introuvable')).toBeInTheDocument()
    );
  });

  it('shows "Scan log introuvable" when fetch rejects', async () => {
    mockGetScanLogDetail.mockRejectedValue(new Error('Network error'));
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Scan log introuvable')).toBeInTheDocument();
  });
});

describe('ScanLogDetail — log display', () => {
  it('shows conversation title in dialog title', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail() });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('dialog-title').textContent).toContain('General Chat')
    );
  });

  it('shows conversationId slice in title when conversation has no title', async () => {
    // conversationId 'conv1234567890ab' → slice(0,12) → 'conv12345678'
    const detail = makeDetail({ conversation: { id: 'c1', title: null, type: 'channel' } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('dialog-title').textContent).toContain('conv12345678')
    );
  });

  it('shows trigger and outcome badges', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail() });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('auto')).toBeInTheDocument());
    expect(screen.getByText('messages sent')).toBeInTheDocument();
  });

  it('shows activityScore and messagesInWindow', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail() });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('0.75')).toBeInTheDocument());
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('ScanLogDetail — budgetBefore', () => {
  it('shows budget when budgetBefore is present', async () => {
    const detail = makeDetail({
      budgetBefore: { messagesUsed: 5, messagesMax: 100, usersActive: 2, maxUsers: 10 },
    });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('5/100')).toBeInTheDocument());
  });

  it('hides budget when budgetBefore is null', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail({ budgetBefore: null }) });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });
});

describe('ScanLogDetail — configSnapshot', () => {
  it('shows config snapshot section when present', async () => {
    const detail = makeDetail({ configSnapshot: { temperature: 0.7 } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Config Snapshot')).toBeInTheDocument());
  });

  it('hides config snapshot section when null', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail({ configSnapshot: null }) });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Config Snapshot')).not.toBeInTheDocument();
  });
});

describe('ScanLogDetail — nodeResults', () => {
  it('shows Pipeline section when nodeResults is present', async () => {
    const detail = makeDetail({ nodeResults: { observe: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Pipeline')).toBeInTheDocument());
  });

  it('hides Pipeline section when nodeResults is null', async () => {
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail({ nodeResults: null }) });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Pipeline')).not.toBeInTheDocument();
  });

  it('shows "Observer" label for observe node', async () => {
    const detail = makeDetail({ nodeResults: { observe: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Observer')).toBeInTheDocument());
  });

  it('shows "Strategist" label for strategist node', async () => {
    const detail = makeDetail({ nodeResults: { strategist: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Strategist')).toBeInTheDocument());
  });

  it('shows "Generator" label for generator node', async () => {
    const detail = makeDetail({ nodeResults: { generator: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Generator')).toBeInTheDocument());
  });

  it('shows "Quality Gate" label for qualityGate node', async () => {
    const detail = makeDetail({ nodeResults: { qualityGate: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Quality Gate')).toBeInTheDocument());
  });

  it('shows ArrowRight between pipeline nodes (i > 0)', async () => {
    const detail = makeDetail({
      nodeResults: {
        observe: makeNodeResult(),
        strategist: makeNodeResult(),
      },
    });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Observer')).toBeInTheDocument());
    expect(screen.getByTestId('arrowright-icon')).toBeInTheDocument();
  });

  it('does not show ArrowRight for first node only (i=0)', async () => {
    const detail = makeDetail({ nodeResults: { observe: makeNodeResult() } });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Observer')).toBeInTheDocument());
    expect(screen.queryByTestId('arrowright-icon')).not.toBeInTheDocument();
  });
});

describe('ScanLogDetail — NodeCard extra data', () => {
  it('shows pre block when extra has keys', async () => {
    const detail = makeDetail({
      nodeResults: { observe: makeNodeResult({ extra: { decision: 'respond' } }) },
    });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/decision/)).toBeInTheDocument());
  });

  it('hides pre block when extra is empty', async () => {
    const detail = makeDetail({
      nodeResults: { observe: makeNodeResult({ extra: {} }) },
    });
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: detail });
    render(<ScanLogDetail logId="log-1" onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Observer')).toBeInTheDocument());
    expect(screen.queryByRole('code')).not.toBeInTheDocument();
  });
});

describe('ScanLogDetail — onClose', () => {
  it('does not call onClose when onOpenChange is triggered with open=true', () => {
    const onClose = jest.fn();
    render(<ScanLogDetail logId="log-1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dialog-reopen'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when dialog triggers onOpenChange(false)', async () => {
    const onClose = jest.fn();
    mockGetScanLogDetail.mockResolvedValue({ success: true, data: makeDetail() });
    render(<ScanLogDetail logId="log-1" onClose={onClose} />);
    // Wait for log to load (spinner disappears)
    await waitFor(() =>
      expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('dialog-title').textContent).toContain('General Chat');
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
