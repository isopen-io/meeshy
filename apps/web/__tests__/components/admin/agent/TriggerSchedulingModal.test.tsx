import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { AgentScheduleData } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getSchedule: jest.fn(),
    getLiveState: jest.fn(),
    triggerScan: jest.fn(),
    stopScan: jest.fn(),
    upsertConfig: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'fr' }),
}));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

jest.mock('next/dynamic', () => (loader: () => Promise<unknown>, _opts?: unknown) => {
  loader().catch(() => {});
  return () => null;
});

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <h2 data-testid="dialog-title" className={className}>{children}</h2>
  ),
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: { children?: React.ReactNode; defaultValue?: string }) => (
    <div data-testid="tabs" data-default={defaultValue}>{children}</div>
  ),
  TabsList: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="tabs-list" className={className}>{children}</div>
  ),
  TabsTrigger: ({ children, value, className }: { children?: React.ReactNode; value?: string; className?: string }) => (
    <button data-testid={`tab-trigger-${value}`} data-value={value} className={className}>{children}</button>
  ),
  TabsContent: ({ children, value, className }: { children?: React.ReactNode; value?: string; className?: string }) => (
    <div data-testid={`tab-content-${value}`} className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, size, 'aria-label': ariaLabel }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    variant?: string; className?: string; size?: string; 'aria-label'?: string;
  }) => (
    <button
      data-testid="button"
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ type, value, onChange, placeholder, className, min, max }: {
    type?: string; value?: string | number; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; className?: string; min?: number; max?: number;
  }) => (
    <input
      data-testid="input"
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      min={min}
      max={max}
    />
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  Zap: ({ className }: { className?: string }) => <svg data-testid="zap-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />,
  PauseCircle: ({ className }: { className?: string }) => <svg data-testid="pausecircle-icon" className={className} />,
  AlertTriangle: ({ className }: { className?: string }) => <svg data-testid="alerttriangle-icon" className={className} />,
  Timer: ({ className }: { className?: string }) => <svg data-testid="timer-icon" className={className} />,
  CalendarClock: ({ className }: { className?: string }) => <svg data-testid="calendarclock-icon" className={className} />,
  RotateCcw: ({ className }: { className?: string }) => <svg data-testid="rotateccw-icon" className={className} />,
  X: ({ className }: { className?: string }) => <svg data-testid="x-icon" className={className} />,
  History: ({ className }: { className?: string }) => <svg data-testid="history-icon" className={className} />,
  BarChart3: ({ className }: { className?: string }) => <svg data-testid="barchart3-icon" className={className} />,
  Square: ({ className }: { className?: string }) => <svg data-testid="square-icon" className={className} />,
}));

import TriggerSchedulingModal from '@/components/admin/agent/TriggerSchedulingModal';

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

function makeLiveState(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-123',
    summary: '',
    toneProfiles: {},
    cachedMessageCount: 0,
    isScanning: false,
    currentNode: null,
    analytics: null,
    summaryRecord: null,
    controlledUsers: [],
    ...overrides,
  };
}

function renderModal(props: Partial<{ conversationId: string; conversationTitle: string; open: boolean; onOpenChange: (v: boolean) => void }> = {}) {
  const defaults = {
    conversationId: 'conv-123',
    conversationTitle: 'Test Chat',
    open: true,
    onOpenChange: jest.fn(),
  };
  return render(<TriggerSchedulingModal {...defaults} {...props} />);
}

describe('TriggerSchedulingModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({ success: true, data: makeSchedule() });
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({ success: true, data: makeLiveState() });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render dialog when open is false', () => {
    render(
      <TriggerSchedulingModal
        conversationId="conv-123"
        conversationTitle="Chat"
        open={false}
        onOpenChange={jest.fn()}
      />
    );
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('shows loading spinner while fetching data', () => {
    (agentAdminService.getSchedule as jest.Mock).mockReturnValue(new Promise(() => {}));
    (agentAdminService.getLiveState as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });

  it('fetches both getSchedule and getLiveState when opened', async () => {
    renderModal();
    await waitFor(() => {
      expect(agentAdminService.getSchedule).toHaveBeenCalledWith('conv-123');
      expect(agentAdminService.getLiveState).toHaveBeenCalledWith('conv-123');
    });
  });

  it('renders timeline and history tabs after loading', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    expect(screen.getByTestId('tab-trigger-history')).toBeInTheDocument();
  });

  it('renders conversation title in dialog title', async () => {
    renderModal({ conversationTitle: 'My Chat Room' });
    await waitFor(() => expect(screen.getByTestId('dialog-title')).toHaveTextContent('My Chat Room'));
  });

  it('handleTriggerNow calls triggerScan when not currently scanning', async () => {
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ isScanning: false }),
    });
    (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({ success: true });
    renderModal();
    await waitFor(() => expect(screen.getByText('agent.scheduling.triggerNow')).toBeInTheDocument());
    fireEvent.click(screen.getByText('agent.scheduling.triggerNow'));
    await waitFor(() => expect(agentAdminService.triggerScan).toHaveBeenCalledWith('conv-123'));
  });

  it('handleTriggerNow calls stopScan when currently scanning', async () => {
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ isScanning: true, currentNode: 'node-A' }),
    });
    (agentAdminService.stopScan as jest.Mock).mockResolvedValue({ success: true });
    renderModal();
    await waitFor(() => expect(screen.getByText('agent.scheduling.stop')).toBeInTheDocument());
    fireEvent.click(screen.getByText('agent.scheduling.stop'));
    await waitFor(() => expect(agentAdminService.stopScan).toHaveBeenCalledWith('conv-123'));
  });

  it('shows success toast after successful triggerScan', async () => {
    (agentAdminService.getLiveState as jest.Mock).mockResolvedValue({
      success: true,
      data: makeLiveState({ isScanning: false }),
    });
    (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({ success: true });
    renderModal();
    await waitFor(() => screen.getByText('agent.scheduling.triggerNow'));
    fireEvent.click(screen.getByText('agent.scheduling.triggerNow'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('agent.toasts.scanTriggered'));
  });

  it('handleScheduleAtTime sets scheduledTimer banner when time input is filled', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-23T10:00:00.000Z'));
    renderModal();
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const timeInput = screen.getAllByTestId('input').find(i => i.getAttribute('type') === 'time');
    expect(timeInput).toBeTruthy();
    fireEvent.change(timeInput!, { target: { value: '14:30' } });
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    expect(okButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(okButtons[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getAllByTestId('timer-icon').some(el => (el.getAttribute('class') ?? '').includes('animate-pulse'))).toBe(true);
  });

  it('handleScheduleDelay sets scheduledTimer banner with delay in minutes', async () => {
    jest.useFakeTimers();
    renderModal();
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const numberInputs = screen.getAllByTestId('input').filter(i => i.getAttribute('type') === 'number');
    expect(numberInputs.length).toBeGreaterThanOrEqual(1);
    const delayInput = numberInputs[0];
    fireEvent.change(delayInput, { target: { value: '30' } });
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    fireEvent.click(okButtons[1]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getAllByTestId('timer-icon').some(el => (el.getAttribute('class') ?? '').includes('animate-pulse'))).toBe(true);
  });

  it('handleCancelSchedule clears scheduled timer when cancel button clicked', async () => {
    jest.useFakeTimers();
    renderModal();
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const numberInputs = screen.getAllByTestId('input').filter(i => i.getAttribute('type') === 'number');
    fireEvent.change(numberInputs[0], { target: { value: '5' } });
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    fireEvent.click(okButtons[1]);
    await waitFor(() => expect(screen.getAllByTestId('timer-icon').some(el => (el.getAttribute('class') ?? '').includes('animate-pulse'))).toBe(true));
    const cancelBtn = screen.getByLabelText('Cancel scheduled trigger');
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(screen.getAllByTestId('timer-icon').some(el => (el.getAttribute('class') ?? '').includes('animate-pulse'))).toBe(false));
    expect(toast.info).toHaveBeenCalledWith('agent.toasts.triggerCancelled');
  });

  it('handleSaveFrequency calls upsertConfig with total minutes from freqHours + freqMinutes', async () => {
    (agentAdminService.upsertConfig as jest.Mock).mockResolvedValue({ success: true });
    renderModal();
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const numberInputs = screen.getAllByTestId('input').filter(i => i.getAttribute('type') === 'number');
    const hoursInputs = numberInputs.filter(i => Number(i.getAttribute('max')) === 24);
    const minutesInputs = numberInputs.filter(i => Number(i.getAttribute('max')) === 59);
    expect(hoursInputs.length).toBeGreaterThanOrEqual(1);
    expect(minutesInputs.length).toBeGreaterThanOrEqual(1);
    fireEvent.change(hoursInputs[0], { target: { value: '1' } });
    fireEvent.change(minutesInputs[0], { target: { value: '30' } });
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    fireEvent.click(okButtons[okButtons.length - 1]);
    await waitFor(() => expect(agentAdminService.upsertConfig).toHaveBeenCalledWith('conv-123', { scanIntervalMinutes: 90 }));
  });

  it('handleSaveFrequency shows success toast on successful save', async () => {
    (agentAdminService.upsertConfig as jest.Mock).mockResolvedValue({ success: true });
    renderModal();
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    fireEvent.click(okButtons[okButtons.length - 1]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('handleSaveFrequency shows error toast when upsertConfig returns failure', async () => {
    (agentAdminService.upsertConfig as jest.Mock).mockResolvedValue({ success: false });
    renderModal();
    await waitFor(() => expect(screen.getByTestId('tab-trigger-timeline')).toBeInTheDocument());
    const okButtons = screen.getAllByTestId('button').filter(b => b.textContent === 'OK');
    fireEvent.click(okButtons[okButtons.length - 1]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.updateError'));
  });

  it('shows schedule not available alert when schedule fetch fails', async () => {
    (agentAdminService.getSchedule as jest.Mock).mockResolvedValue({ success: false });
    renderModal();
    await waitFor(() => expect(screen.getByText('agent.scheduling.notAvailable')).toBeInTheDocument());
  });

  it('shows budget usage in timeline when schedule data is present', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('5/20')).toBeInTheDocument());
  });
});
