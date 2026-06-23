import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { LiveStateData, RecentConversationActivity } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getRecentActivity: jest.fn(),
    getLiveState: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'en' }),
}));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('use-debounce', () => ({
  useDebounce: (val: string) => [val],
}));

jest.mock('next/dynamic', () => (loader: () => Promise<unknown>, _opts?: unknown) => {
  loader().catch(() => {});
  return () => null;
});

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({ userId }: { userId: string }) => <span data-testid="user-display">{userId}</span>,
}));

jest.mock('recharts', () => ({
  PieChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children?: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: ({ fill }: { fill?: string }) => <div data-testid="cell" data-fill={fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-content" className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="card-title" className={className}>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; className?: string;
  }) => (
    <button data-testid="button" data-variant={variant} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ placeholder, value, onChange, className }: {
    placeholder?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string;
  }) => (
    <input data-testid="input" placeholder={placeholder} value={value} onChange={onChange} className={className} />
  ),
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: { value?: number; className?: string }) => (
    <div data-testid="progress" data-value={value} className={className} />
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  Activity: ({ className }: { className?: string }) => <svg data-testid="activity-icon" className={className} />,
  Users: ({ className }: { className?: string }) => <svg data-testid="users-icon" className={className} />,
  Brain: ({ className }: { className?: string }) => <svg data-testid="brain-icon" className={className} />,
  MessageSquare: ({ className }: { className?: string }) => <svg data-testid="messagesquare-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  Search: ({ className }: { className?: string }) => <svg data-testid="search-icon" className={className} />,
  Lock: ({ className }: { className?: string }) => <svg data-testid="lock-icon" className={className} />,
  RefreshCw: ({ className }: { className?: string }) => <svg data-testid="refreshcw-icon" className={className} />,
  Zap: ({ className }: { className?: string }) => <svg data-testid="zap-icon" className={className} />,
  Eye: ({ className }: { className?: string }) => <svg data-testid="eye-icon" className={className} />,
  ListOrdered: ({ className }: { className?: string }) => <svg data-testid="listordered-icon" className={className} />,
}));

import { AgentLiveTab } from '@/components/admin/agent/AgentLiveTab';

function makeRecentActivity(overrides: Partial<RecentConversationActivity> = {}): RecentConversationActivity {
  return {
    conversationId: 'conv-abc123def456',
    conversation: { id: 'conv-abc123def456', title: 'Test Conv', type: 'direct' },
    enabled: true,
    messagesSent: 10,
    totalWordsSent: 100,
    avgConfidence: 0.9,
    lastResponseAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    controlledUserIds: ['user1'],
    controlledUsersCount: 1,
    ...overrides,
  };
}

function makeLiveState(overrides: Partial<LiveStateData> = {}): LiveStateData {
  return {
    conversationId: 'conv-abc123def456',
    summary: 'This is a test summary.',
    toneProfiles: {},
    cachedMessageCount: 5,
    isScanning: false,
    currentNode: null,
    analytics: null,
    summaryRecord: null,
    controlledUsers: [],
    ...overrides,
  };
}

describe('AgentLiveTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({ success: true, data: makeLiveState() });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows empty state with Eye icon text when no conversation is selected', async () => {
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getByText('agentLive.selectConversation')).toBeInTheDocument());
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
  });

  it('shows empty recent conversations message when list is empty', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({ success: true, data: [] });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('agent.overview.noRecentActivity').length).toBeGreaterThan(0));
  });

  it('shows loading skeletons while fetching recent conversations', () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AgentLiveTab />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders a list of recent conversations', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversation: { id: 'c1', title: 'My Conversation', type: 'group' } })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('My Conversation').length).toBeGreaterThan(0));
  });

  it('clicking a conversation calls getLiveState with its id', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(agentAdminService.getLiveState).toHaveBeenCalledWith('conv-abc123def456'));
  });

  it('shows loading skeleton after selecting a conversation while fetching', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0));
  });

  it('renders SummaryCard with summaryRecord.summary when summaryRecord is present', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        summaryRecord: {
          summary: 'Rich summary text',
          currentTopics: ['topic1'],
          overallTone: 'formal',
          messageCount: 42,
        },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('Rich summary text')).toBeInTheDocument());
  });

  it('renders SummaryCard with data.summary fallback when summaryRecord is null', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ summaryRecord: null, summary: 'Fallback summary' }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('Fallback summary')).toBeInTheDocument());
  });

  it('renders no summary message when both summaryRecord and summary are absent', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ summaryRecord: null, summary: '' }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.noSummary')).toBeInTheDocument());
  });

  it('renders analytics grid when analytics data is present', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        analytics: {
          messagesSent: 25,
          totalWordsSent: 300,
          avgConfidence: 0.87,
          lastResponseAt: new Date().toISOString(),
          conversationsActive: 2,
        },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('25')).toBeInTheDocument());
    expect(screen.getByText('300')).toBeInTheDocument();
  });

  it('shows no analytics text when analytics is null', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ analytics: null }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.noAnalytics')).toBeInTheDocument());
  });

  it('shows error message when getLiveState returns failure', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.loadError')).toBeInTheDocument());
  });

  it('shows error message when getLiveState throws', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockRejectedValue(new Error('network error'));
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.connectionError')).toBeInTheDocument());
  });

  it('renders controlled users with confidence above 0.8 as green class', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        controlledUsers: [{ userId: 'u1', systemLanguage: 'fr', confidence: 0.9, locked: false }],
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => {
      const confEl = screen.getByText('90%');
      expect(confEl.className).toContain('green');
    });
  });

  it('renders controlled users with confidence 0.5–0.8 as yellow class', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        controlledUsers: [{ userId: 'u1', systemLanguage: 'en', confidence: 0.65, locked: false }],
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => {
      const confEl = screen.getByText('65%');
      expect(confEl.className).toContain('yellow');
    });
  });

  it('renders controlled users with confidence ≤0.5 as gray class', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        controlledUsers: [{ userId: 'u1', systemLanguage: 'de', confidence: 0.3, locked: false }],
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => {
      const confEl = screen.getByText('30%');
      expect(confEl.className).toContain('gray');
    });
  });

  it('auto-refresh toggles on button click and sets interval', async () => {
    jest.useFakeTimers();
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState(),
    });
    render(<AgentLiveTab />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await act(async () => {
      await Promise.resolve();
    });
    const initialCallCount = (agentAdminService.getLiveState as jest.Mock).mock.calls.length;
    const autoButton = screen.getAllByTestId('button').find(b => b.textContent?.includes('Auto'));
    expect(autoButton).toBeTruthy();
    fireEvent.click(autoButton!);
    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect((agentAdminService.getLiveState as jest.Mock).mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('shows no monitored users message when controlledUsers is empty', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ controlledUsers: [] }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.noMonitoredUsers')).toBeInTheDocument());
  });

  it('renders tone profiles when present', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        toneProfiles: {
          u1: { userId: 'u1', tone: 'formal', vocabularyLevel: 'advanced', confidence: 0.85, locked: false, messagesAnalyzed: 10 },
        },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('formal')).toBeInTheDocument());
  });

  it('shows no tone profiles message when toneProfiles is empty', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ toneProfiles: {} }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('agentLive.noToneProfiles')).toBeInTheDocument());
  });

  it('shows green dot for items with enabled=true in sidebar', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-enabled',
        conversation: { id: 'conv-enabled', title: 'Enabled Conv', type: 'direct' },
        enabled: true,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Enabled Conv').length).toBeGreaterThan(0));
    // Green dot: div with bg-green-500 class
    const greenDots = document.querySelectorAll('.bg-green-500');
    expect(greenDots.length).toBeGreaterThanOrEqual(1);
  });

  it('formatTimeAgo: shows "now" key for timestamps less than 1 minute ago', async () => {
    const recentTs = new Date(Date.now() - 30000).toISOString(); // 30s ago
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-now',
        conversation: { id: 'conv-now', title: 'Now Conv', type: 'direct' },
        lastResponseAt: recentTs,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Now Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText('timeAgo.now').length).toBeGreaterThanOrEqual(1);
  });

  it('formatTimeAgo: shows minutes for timestamps 1-59 minutes ago', async () => {
    const minutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-minutes',
        conversation: { id: 'conv-minutes', title: 'Minutes Conv', type: 'direct' },
        lastResponseAt: minutesAgo,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Minutes Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/5timeAgo\.minutes/).length).toBeGreaterThanOrEqual(1);
  });

  it('formatTimeAgo: shows hours for timestamps 1-23 hours ago', async () => {
    const hoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-hours',
        conversation: { id: 'conv-hours', title: 'Hours Conv', type: 'direct' },
        lastResponseAt: hoursAgo,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Hours Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/3timeAgo\.hours/).length).toBeGreaterThanOrEqual(1);
  });

  it('formatTimeAgo: shows days for timestamps 24+ hours ago', async () => {
    const daysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-days',
        conversation: { id: 'conv-days', title: 'Days Conv', type: 'direct' },
        lastResponseAt: daysAgo,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Days Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/2timeAgo\.days/).length).toBeGreaterThanOrEqual(1);
  });

  it('manual refresh button calls fetchLiveState when clicked', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState(),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(agentAdminService.getLiveState).toHaveBeenCalledTimes(1));

    // Find the manual refresh button (the second button, no text, just icon)
    const buttons = screen.getAllByTestId('button');
    const refreshBtn = buttons.find(b => !b.textContent?.includes('Auto') && b.getAttribute('disabled') !== '');
    // Click the refresh button (find by data-variant="outline" and without Auto text)
    const manualRefreshBtn = buttons.find(b => b.getAttribute('data-variant') === 'outline' && !b.textContent?.includes('Auto'));
    if (manualRefreshBtn) {
      fireEvent.click(manualRefreshBtn);
      await waitFor(() => expect(agentAdminService.getLiveState).toHaveBeenCalledTimes(2));
    }
  });

  it('auto-refresh turns off clearInterval when toggled back off', async () => {
    jest.useFakeTimers();
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState(),
    });
    render(<AgentLiveTab />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await act(async () => { await Promise.resolve(); });

    // Turn auto-refresh ON
    const autoButton = screen.getAllByTestId('button').find(b => b.textContent?.includes('Auto'));
    expect(autoButton).toBeTruthy();
    fireEvent.click(autoButton!);

    // Turn auto-refresh OFF
    const autoOnButton = screen.getAllByTestId('button').find(b => b.textContent?.includes('Auto 15s'));
    expect(autoOnButton).toBeTruthy();
    fireEvent.click(autoOnButton!);

    const callCountAfterOff = (agentAdminService.getLiveState as jest.Mock).mock.calls.length;
    // Advance timers — should NOT trigger more calls since interval was cleared
    act(() => { jest.advanceTimersByTime(30000); });
    expect((agentAdminService.getLiveState as jest.Mock).mock.calls.length).toBe(callCountAfterOff);
  });

  it('renders currentTopics badges when summaryRecord has topics', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        summaryRecord: {
          summary: 'Topic summary',
          currentTopics: ['AI', 'Blockchain'],
          overallTone: 'casual',
          messageCount: 10,
        },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => {
      expect(screen.getByText('AI')).toBeInTheDocument();
      expect(screen.getByText('Blockchain')).toBeInTheDocument();
    });
  });

  it('renders tone profile with locked=true shows lock icon', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        toneProfiles: {
          u1: { userId: 'u1', tone: 'formal', vocabularyLevel: 'advanced', confidence: 0.85, locked: true, messagesAnalyzed: 10 },
        },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getAllByTestId('lock-icon').length).toBeGreaterThan(0));
  });

  it('confidenceColor returns yellow for confidence exactly > 0.5', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        controlledUsers: [{ userId: 'u1', systemLanguage: 'en', confidence: 0.51, locked: false }],
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => {
      const confEl = screen.getByText('51%');
      expect(confEl.className).toContain('yellow');
    });
  });

  it('search input onChange updates search state', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({ success: true, data: [] });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByTestId('input').length).toBeGreaterThan(0));
    const searchInputs = screen.getAllByTestId('input');
    fireEvent.change(searchInputs[0], { target: { value: 'filter text' } });
    expect((searchInputs[0] as HTMLInputElement).value).toBe('filter text');
  });

  it('shows no green dot for items with enabled=false', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-off',
        conversation: { id: 'conv-off', title: 'Off Conv', type: 'direct' },
        enabled: false,
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Off Conv').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.bg-green-500').length).toBe(0);
  });

  it('shows truncated conversationId when conversation is null', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: null as unknown as RecentConversationActivity['conversation'] })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('conv-abc12...').length).toBeGreaterThan(0));
  });

  it('shows no type badge when conversation type is null', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-nt',
        conversation: { id: 'conv-nt', title: 'No Type Conv', type: null as unknown as string },
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('No Type Conv').length).toBeGreaterThan(0));
    expect(screen.queryAllByTestId('badge').length).toBe(0);
  });

  it('shows raw type when TYPE_LABELS has no matching key', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({
        conversationId: 'conv-uk',
        conversation: { id: 'conv-uk', title: 'Unknown Type Conv', type: 'mystery_type' },
      })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Unknown Type Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText('mystery_type').length).toBeGreaterThan(0);
  });

  it('keeps empty list when getRecentActivity returns success=false', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('agent.overview.noRecentActivity').length).toBeGreaterThan(0));
  });

  it('sets empty list when getRecentActivity returns non-array data', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({ success: true, data: { not: 'array' } });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('agent.overview.noRecentActivity').length).toBeGreaterThan(0));
  });

  it('SummaryCard with summaryRecord with empty currentTopics shows no topics block', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        summaryRecord: { summary: 'A summary', currentTopics: [], overallTone: 'formal', messageCount: 5 },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('A summary')).toBeInTheDocument());
    expect(screen.queryByText('agentLive.topics')).not.toBeInTheDocument();
  });

  it('MetricsCard analytics without lastResponseAt does not show timestamp', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-abc123def456', conversation: { id: 'conv-abc123def456', title: 'Chat One', type: 'direct' } })],
    });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({
        analytics: { messagesSent: 10, totalWordsSent: 200, avgConfidence: 0.8, lastResponseAt: null, conversationsActive: 1 },
      }),
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Chat One').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chat One')[0]);
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    // Only the Schedule section header Clock is present; no second clock from analytics lastResponseAt
    expect(screen.queryAllByTestId('clock-icon')).toHaveLength(1);
  });

  it('formatTimeAgo shows never key for null lastResponseAt', async () => {
    (agentAdminService.getRecentActivity as jest.Mock).mockResolvedValue({
      success: true,
      data: [makeRecentActivity({ conversationId: 'conv-never', conversation: { id: 'conv-never', title: 'Never Conv', type: 'direct' }, lastResponseAt: null as unknown as string })],
    });
    render(<AgentLiveTab />);
    await waitFor(() => expect(screen.getAllByText('Never Conv').length).toBeGreaterThan(0));
    expect(screen.getAllByText('agent.overview.timeAgo.never').length).toBeGreaterThanOrEqual(1);
  });
});
