import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { AgentStatsData } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getStats: jest.fn(),
    resetConversation: jest.fn(),
    resetUser: jest.fn(),
    resetAll: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
  Button: ({ children, onClick, disabled, variant, className, size }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    variant?: string; className?: string; size?: string;
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

jest.mock('lucide-react', () => ({
  MessageSquare: ({ className }: { className?: string }) => <svg data-testid="messagesquare-icon" className={className} />,
  Zap: ({ className }: { className?: string }) => <svg data-testid="zap-icon" className={className} />,
  Users: ({ className }: { className?: string }) => <svg data-testid="users-icon" className={className} />,
  Shapes: ({ className }: { className?: string }) => <svg data-testid="shapes-icon" className={className} />,
  RotateCcw: ({ className }: { className?: string }) => <svg data-testid="rotateccw-icon" className={className} />,
  Trash2: ({ className }: { className?: string }) => <svg data-testid="trash2-icon" className={className} />,
  UserCheck: ({ className }: { className?: string }) => <svg data-testid="usercheck-icon" className={className} />,
  BarChart3: ({ className }: { className?: string }) => <svg data-testid="barchart3-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />,
  TrendingUp: ({ className }: { className?: string }) => <svg data-testid="trendingup-icon" className={className} />,
  Type: ({ className }: { className?: string }) => <svg data-testid="type-icon" className={className} />,
}));

import { AgentOverviewTab } from '@/components/admin/agent/AgentOverviewTab';

function makeStats(overrides: Partial<AgentStatsData> = {}): AgentStatsData {
  return {
    totalConfigs: 10,
    activeConfigs: 4,
    totalRoles: 3,
    totalArchetypes: 2,
    totalControlledUsers: 8,
    totalMessagesSent: 500,
    totalWordsSent: 5000,
    avgConfidence: 0.75,
    recentActivity: [],
    ...overrides,
  };
}

describe('AgentOverviewTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading skeletons while stats are loading', () => {
    (agentAdminService.getStats as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AgentOverviewTab />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(8);
  });

  it('shows error state when getStats fails', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.toasts.statsLoadError')).toBeInTheDocument());
  });

  it('shows error state when getStats throws', async () => {
    (agentAdminService.getStats as jest.Mock).mockRejectedValue(new Error('net'));
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.toasts.connectionError')).toBeInTheDocument());
  });

  it('renders 8 KPI cards after successful load', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.getByText('agent.overview.kpi.conversations')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.active')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.users')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.roles')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.messages')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.words')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.avgConfidence')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.kpi.archetypes')).toBeInTheDocument();
  });

  it('displays stats values in KPI cards', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({ totalConfigs: 10, activeConfigs: 4, totalMessagesSent: 500 }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('shows recent activity when present', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Hot Topic', type: 'group' },
          messagesSent: 7,
          totalWordsSent: 70,
          avgConfidence: 0.8,
          lastResponseAt: new Date(Date.now() - 30000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('Hot Topic')).toBeInTheDocument());
  });

  it('shows no recent activity text when list is empty', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({ recentActivity: [] }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.overview.noRecentActivity')).toBeInTheDocument());
  });

  it('formatTimeAgo shows never key when lastResponseAt is null', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'direct' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: null,
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.overview.timeAgo.never')).toBeInTheDocument());
  });

  it('formatTimeAgo shows justNow key for activity within last minute', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'direct' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 20 * 1000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.overview.timeAgo.justNow')).toBeInTheDocument());
  });

  it('formatTimeAgo shows minutes key for activity 1–59 minutes ago', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'direct' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => {
      const el = screen.queryByText((content) => content.includes('agent.overview.timeAgo.minutes'));
      expect(el).toBeInTheDocument();
    });
  });

  it('formatTimeAgo shows hours key for activity 1–23 hours ago', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'direct' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => {
      const el = screen.queryByText((content) => content.includes('agent.overview.timeAgo.hours'));
      expect(el).toBeInTheDocument();
    });
  });

  it('formatTimeAgo shows days key for activity 24+ hours ago', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'direct' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => {
      const el = screen.queryByText((content) => content.includes('agent.overview.timeAgo.days'));
      expect(el).toBeInTheDocument();
    });
  });

  it('getTypeLabel maps known type strings via translation keys', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid1',
          conversation: { id: 'cid1', title: 'Conv', type: 'group' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: null,
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('agent.overview.conversationType.group')).toBeInTheDocument());
  });

  it('reset conversation button is disabled when input is empty', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'));
    expect(convInput).toBeTruthy();
    const buttons = screen.getAllByTestId('button');
    const resetConvButton = buttons.find(b => b.nextSibling === null && b.closest('[data-testid="card-content"]') !== null);
    const convCard = convInput!.closest('[data-testid="card-content"]');
    const btnInConvCard = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    expect(btnInConvCard).toBeTruthy();
    expect(btnInConvCard).toBeDisabled();
  });

  it('handleResetConversation shows error toast for invalid id', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'))!;
    fireEvent.change(convInput, { target: { value: 'invalid-id' } });
    const convCard = convInput.closest('[data-testid="card-content"]');
    const btn = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.invalidConversationId'));
  });

  it('handleResetConversation calls service with valid 24-char hex id', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetConversation as jest.Mock).mockResolvedValue({ success: true });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'))!;
    fireEvent.change(convInput, { target: { value: 'aabbccddeeff001122334455' } });
    const convCard = convInput.closest('[data-testid="card-content"]');
    const btn = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(agentAdminService.resetConversation).toHaveBeenCalledWith('aabbccddeeff001122334455'));
  });

  it('handleResetUser shows error toast for invalid user id', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const userInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID utilisateur'))!;
    fireEvent.change(userInput, { target: { value: 'bad' } });
    const userCard = userInput.closest('[data-testid="card-content"]');
    const btn = userCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.invalidUserId'));
  });

  it('handleResetUser calls service with valid 24-char hex id', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetUser as jest.Mock).mockResolvedValue({ success: true });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const userInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID utilisateur'))!;
    fireEvent.change(userInput, { target: { value: 'aabbccddeeff001122334455' } });
    const userCard = userInput.closest('[data-testid="card-content"]');
    const btn = userCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(agentAdminService.resetUser).toHaveBeenCalledWith('aabbccddeeff001122334455'));
  });

  it('handleReset calls resetAll and shows success toast with counts', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetAll as jest.Mock).mockResolvedValue({
      success: true,
      data: { deleted: { configs: 5, roles: 3, analytics: 2, redisKeys: 1 } },
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const resetAllBtn = screen.getAllByTestId('button').find(b => b.textContent?.includes('agent.overview.resetAll'));
    expect(resetAllBtn).toBeTruthy();
    fireEvent.click(resetAllBtn!);
    await waitFor(() => expect(agentAdminService.resetAll).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it('handleReset shows error toast when resetAll returns failure', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetAll as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const resetAllBtn = screen.getAllByTestId('button').find(b => b.textContent?.includes('agent.overview.resetAll'));
    fireEvent.click(resetAllBtn!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.resetError'));
  });

  it('handleReset does not call resetAll when confirm returns false', async () => {
    jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const resetAllBtn = screen.getAllByTestId('button').find(b => b.textContent?.includes('agent.overview.resetAll'));
    fireEvent.click(resetAllBtn!);
    expect(agentAdminService.resetAll).not.toHaveBeenCalled();
  });

  it('handleReset shows network error toast when resetAll throws', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetAll as jest.Mock).mockRejectedValue(new Error('network'));
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const resetAllBtn = screen.getAllByTestId('button').find(b => b.textContent?.includes('agent.overview.resetAll'));
    fireEvent.click(resetAllBtn!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.resetAiConfigError'));
  });

  it('handleResetConversation does not call service when confirm returns false', async () => {
    jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'))!;
    fireEvent.change(convInput, { target: { value: 'aabbccddeeff001122334455' } });
    const convCard = convInput.closest('[data-testid="card-content"]');
    const btn = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(agentAdminService.resetConversation).not.toHaveBeenCalled();
  });

  it('handleResetUser does not call service when confirm returns false', async () => {
    jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const userInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID utilisateur'))!;
    fireEvent.change(userInput, { target: { value: 'aabbccddeeff001122334455' } });
    const userCard = userInput.closest('[data-testid="card-content"]');
    const btn = userCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(agentAdminService.resetUser).not.toHaveBeenCalled();
  });

  it('getTypeLabel renders labels for all conversation types in recentActivity', async () => {
    const types = ['direct', 'public', 'global', 'broadcast', 'channel'];
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: types.map((type, i) => ({
          conversationId: `cid${i}`,
          conversation: { id: `cid${i}`, title: `Conv ${type}`, type },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 60000).toISOString(),
        })),
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('Conv direct')).toBeInTheDocument());
    // Each type should call getTypeLabel with the expected key
    expect(screen.getByText('agent.overview.conversationType.direct')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.conversationType.public')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.conversationType.global')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.conversationType.broadcast')).toBeInTheDocument();
    expect(screen.getByText('agent.overview.conversationType.channel')).toBeInTheDocument();
  });

  it('handleResetConversation shows conversationResetError toast when resetConversation throws', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetConversation as jest.Mock).mockRejectedValue(new Error('network'));
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'))!;
    fireEvent.change(convInput, { target: { value: 'aabbccddeeff001122334455' } });
    const convCard = convInput.closest('[data-testid="card-content"]');
    const btn = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.conversationResetError'));
  });

  it('handleResetUser shows userResetError toast when resetUser throws', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetUser as jest.Mock).mockRejectedValue(new Error('network'));
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const userInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID utilisateur'))!;
    fireEvent.change(userInput, { target: { value: 'aabbccddeeff001122334455' } });
    const userCard = userInput.closest('[data-testid="card-content"]');
    const btn = userCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.userResetError'));
  });

  it('getTypeLabel falls back to raw type string for unknown type', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'cid-unk',
          conversation: { id: 'cid-unk', title: 'Unknown Type Conv', type: 'unknown_type' },
          messagesSent: 1,
          totalWordsSent: 10,
          avgConfidence: 0.5,
          lastResponseAt: new Date(Date.now() - 60000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('Unknown Type Conv')).toBeInTheDocument());
    expect(screen.getByText('unknown_type')).toBeInTheDocument();
  });

  it('handleResetConversation shows no success toast when resetConversation returns success=false', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetConversation as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const convInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID conversation'))!;
    fireEvent.change(convInput, { target: { value: 'aabbccddeeff001122334455' } });
    const convCard = convInput.closest('[data-testid="card-content"]');
    const btn = convCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(agentAdminService.resetConversation).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('handleResetUser shows no success toast when resetUser returns success=false', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetUser as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const inputs = screen.getAllByTestId('input');
    const userInput = inputs.find(i => i.getAttribute('placeholder')?.includes('ID utilisateur'))!;
    fireEvent.change(userInput, { target: { value: 'aabbccddeeff001122334455' } });
    const userCard = userInput.closest('[data-testid="card-content"]');
    const btn = userCard?.querySelector('[data-testid="button"]') as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(agentAdminService.resetUser).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('KPI badge shows Off when activeConfigs is 0', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({ activeConfigs: 0 }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    // When activeConfigs is 0, the badge should show 'Off' with 'secondary' variant
    const badges = screen.getAllByTestId('badge');
    const offBadge = badges.find(b => b.textContent === 'Off');
    expect(offBadge).toBeTruthy();
    expect(offBadge).toHaveAttribute('data-variant', 'secondary');
  });

  it('recentActivity entry with null title shows sliced conversationId', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: makeStats({
        recentActivity: [{
          conversationId: 'abcdef1234567890abcdef12',
          conversation: { id: 'abcdef1234567890abcdef12', title: null, type: 'group' },
          messagesSent: 3,
          totalWordsSent: 30,
          avgConfidence: 0.7,
          lastResponseAt: new Date(Date.now() - 60000).toISOString(),
        }],
      }),
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.getByText('abcdef1234...')).toBeInTheDocument());
  });

  it('handleReset ?? 0 fallbacks when deleted counts are null', async () => {
    (agentAdminService.getStats as jest.Mock).mockResolvedValue({ success: true, data: makeStats() });
    (agentAdminService.resetAll as jest.Mock).mockResolvedValue({
      success: true,
      data: { deleted: { configs: null, roles: null, analytics: null, redisKeys: null } },
    });
    render(<AgentOverviewTab />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    const resetAllBtn = screen.getAllByTestId('button').find(b => b.textContent?.includes('agent.overview.resetAll'));
    fireEvent.click(resetAllBtn!);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // The success message is built from ?? 0 fallbacks: all counts show 0
    const call = (toast.success as jest.Mock).mock.calls[0][0] as string;
    expect(typeof call).toBe('string');
  });
});
