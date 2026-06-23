import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { AgentScheduleData } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getSchedule: jest.fn(),
    triggerScan: jest.fn(),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'fr' }),
}));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('lucide-react', () => ({
  Zap: ({ className }: { className?: string }) => <svg data-testid="zap-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />,
  PauseCircle: ({ className }: { className?: string }) => <svg data-testid="pausecircle-icon" className={className} />,
  AlertTriangle: ({ className }: { className?: string }) => <svg data-testid="alerttriangle-icon" className={className} />,
}));

import AgentScheduleTimeline from '@/components/admin/agent/AgentScheduleTimeline';

function makeSchedule(overrides: Partial<AgentScheduleData> = {}): AgentScheduleData {
  const now = Date.now();
  return {
    conversationId: 'conv-123',
    scanIntervalMinutes: 30,
    lastScan: now - 10 * 60 * 1000,
    nextScan: now + 30 * 60 * 1000,
    upcomingScans: [now + 30 * 60 * 1000, now + 60 * 60 * 1000],
    budget: {
      messagesUsed: 5,
      messagesMax: 20,
      remaining: 15,
      isWeekend: false,
    },
    burst: {
      enabled: true,
      lastBurst: 0,
      cooldownEndsAt: 0,
      cooldownActive: false,
      quietIntervalMinutes: 10,
    },
    ...overrides,
  };
}

describe('AgentScheduleTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows animate-pulse container with 3 child divs while loading', () => {
    (agentAdminService.getSchedule as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    const pulsingContainer = document.querySelector('.animate-pulse');
    expect(pulsingContainer).toBeInTheDocument();
    const childDivs = pulsingContainer?.querySelectorAll(':scope > div');
    expect(childDivs?.length).toBeGreaterThanOrEqual(3);
  });

  it('shows AlertTriangle and schedule unavailable text when getSchedule returns no data', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByTestId('alerttriangle-icon')).toBeInTheDocument());
    expect(screen.getByText('Schedule non disponible')).toBeInTheDocument();
  });

  it('shows AlertTriangle when getSchedule returns success but null data', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({ success: true, data: null });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByTestId('alerttriangle-icon')).toBeInTheDocument());
  });

  it('renders timeline when schedule data is available', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    expect(screen.getByText('Prochain scan')).toBeInTheDocument();
  });

  it('shows scan interval in timeline header', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ scanIntervalMinutes: 45 }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText(/toutes les 45min/)).toBeInTheDocument());
  });

  it('formatDuration shows Xmin for durations under 60 minutes', async () => {
    const now = Date.now();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ upcomingScans: [now + 25 * 60 * 1000] }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      const durationBadge = badges.find(b => /\d+min/.test(b.textContent ?? ''));
      expect(durationBadge).toBeTruthy();
    });
  });

  it('formatDuration shows Xh for exactly 60-minute durations', async () => {
    const now = Date.now();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ upcomingScans: [now + 60 * 60 * 1000] }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      const durationBadge = badges.find(b => /^\d+h$/.test((b.textContent ?? '').trim()));
      expect(durationBadge).toBeTruthy();
    });
  });

  it('formatDuration shows XhMM for durations with leftover minutes (e.g. 1h30)', async () => {
    const now = Date.now();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ upcomingScans: [now + 90 * 60 * 1000] }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      const durationBadge = badges.find(b => /1h30/.test(b.textContent ?? ''));
      expect(durationBadge).toBeTruthy();
    });
  });

  it('budgetColor applies emerald class when ratio > 0.6', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        budget: { messagesUsed: 2, messagesMax: 10, remaining: 8, isWeekend: false },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    const greenBars = document.querySelectorAll('.bg-emerald-500');
    expect(greenBars.length).toBeGreaterThanOrEqual(1);
  });

  it('budgetColor applies amber class when ratio is between 0.3 and 0.6', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        budget: { messagesUsed: 6, messagesMax: 10, remaining: 4, isWeekend: false },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    const amberBars = document.querySelectorAll('.bg-amber-400');
    expect(amberBars.length).toBeGreaterThanOrEqual(1);
  });

  it('budgetColor applies red class when ratio <= 0.3', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        budget: { messagesUsed: 8, messagesMax: 10, remaining: 2, isWeekend: false },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    const redBars = document.querySelectorAll('.bg-red-500');
    expect(redBars.length).toBeGreaterThanOrEqual(1);
  });

  it('handleTrigger calls agentAdminService.triggerScan on button click', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({ success: true });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Trigger'));
    await waitFor(() => expect(agentAdminService.triggerScan).toHaveBeenCalledWith('conv-123'));
  });

  it('handleTrigger shows success toast on success', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({ success: true });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => screen.getByText('Trigger'));
    fireEvent.click(screen.getByText('Trigger'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('agent.toasts.scanTriggered'));
  });

  it('handleTrigger shows error toast when triggerScan returns failure', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({ success: false });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => screen.getByText('Trigger'));
    fireEvent.click(screen.getByText('Trigger'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.scanTriggerError'));
  });

  it('handleTrigger shows network error toast when triggerScan throws', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    (agentAdminService.triggerScan as jest.Mock).mockRejectedValue(new Error('fail'));
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => screen.getByText('Trigger'));
    fireEvent.click(screen.getByText('Trigger'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.networkError'));
  });

  it('auto-refresh: fetches schedule again after 120s interval', async () => {
    jest.useFakeTimers();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await act(async () => {
      await Promise.resolve();
    });
    const callsBefore = (agentAdminService.getSchedule as jest.Mock).mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect((agentAdminService.getSchedule as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('renders WE badge when budget.isWeekend is true', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        budget: { messagesUsed: 2, messagesMax: 10, remaining: 8, isWeekend: true },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('WE')).toBeInTheDocument());
  });

  it('does not render WE badge when budget.isWeekend is false', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        budget: { messagesUsed: 2, messagesMax: 10, remaining: 8, isWeekend: false },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    expect(screen.queryByText('WE')).not.toBeInTheDocument();
  });

  it('shows burst disabled badge (Off) when burst.enabled is false', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        burst: { enabled: false, lastBurst: 0, cooldownEndsAt: 0, cooldownActive: false, quietIntervalMinutes: 10 },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Off')).toBeInTheDocument());
  });

  it('shows Prêt badge when burst is enabled and cooldown is not active', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        burst: { enabled: true, lastBurst: 0, cooldownEndsAt: 0, cooldownActive: false, quietIntervalMinutes: 10 },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText('Prêt')).toBeInTheDocument());
  });

  it('shows cooldown badge when burst is enabled and cooldown is active', async () => {
    const now = Date.now();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({
        burst: {
          enabled: true,
          lastBurst: now - 5 * 60 * 1000,
          cooldownEndsAt: now + 5 * 60 * 1000,
          cooldownActive: true,
          quietIntervalMinutes: 10,
        },
      }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getAllByTestId('pausecircle-icon').length).toBeGreaterThanOrEqual(1));
  });

  it('shows -- badge when no upcoming scans (timeUntilNext is null)', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ upcomingScans: [] }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('badge');
      const dashBadge = badges.find(b => b.textContent === '--');
      expect(dashBadge).toBeTruthy();
    });
  });

  it('handleVisibility updates component when document becomes visible', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule(),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => screen.getByText('Trigger'));

    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Component should still render without crashing
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });

  it('does not render last scan info when lastScan is 0', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ lastScan: 0 }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => screen.getByText('Trigger'));
    expect(screen.queryByText(/Dernier scan/)).not.toBeInTheDocument();
  });

  it('renders last scan info when lastScan is non-zero', async () => {
    const now = Date.now();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({
      success: true,
      data: makeSchedule({ lastScan: now - 10 * 60 * 1000 }),
    });
    render(<AgentScheduleTimeline conversationId="conv-123" />);
    await waitFor(() => expect(screen.getByText(/Dernier scan/)).toBeInTheDocument());
  });
});
