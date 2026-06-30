import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getGlobalConfig: jest.fn(),
    updateGlobalConfig: jest.fn(),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string, p?: Record<string, unknown>) => p ? `${key}(${JSON.stringify(p)})` : key }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/components/admin/agent/InfoIcon', () => ({
  InfoIcon: () => null,
}));

jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <svg data-testid="icon-loader2" className={className} />,
  Save: ({ className }: { className?: string }) => <svg data-testid="icon-save" className={className} />,
  Shield: ({ className }: { className?: string }) => <svg data-testid="icon-shield" className={className} />,
  LayoutGrid: ({ className }: { className?: string }) => <svg data-testid="icon-layoutgrid" className={className} />,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div data-testid="card-title">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button data-testid="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, type, ...rest }: { value?: unknown; onChange?: React.ChangeEventHandler<HTMLInputElement>; type?: string; [key: string]: unknown }) => (
    <input data-testid="input" value={value as string | number} onChange={onChange} type={type} {...rest} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children?: React.ReactNode }) => <label data-testid="label">{children}</label>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, onClick, variant, className, ...rest }: { children?: React.ReactNode; onClick?: () => void; variant?: string; className?: string; [key: string]: unknown }) => (
    <span data-testid="badge" data-variant={variant} className={className} onClick={onClick} {...rest}>{children}</span>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (v: boolean) => void }) => (
    <input
      data-testid="switch"
      type="checkbox"
      checked={checked}
      onChange={e => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, maxLength }: { value?: string; onChange?: React.ChangeEventHandler<HTMLTextAreaElement>; placeholder?: string; maxLength?: number }) => (
    <textarea data-testid="textarea" value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength} />
  ),
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step }: { value?: number[]; onValueChange?: (v: number[]) => void; min?: number; max?: number; step?: number }) => (
    <input type="range" data-testid="slider" value={value?.[0]} min={min} max={max} step={step} onChange={e => onValueChange?.([parseFloat(e.target.value)])} />
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }) => (
    <select data-testid="select" value={value} onChange={e => onValueChange?.(e.target.value)}>{children}</select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { agentAdminService } from '@/services/agent-admin.service';
import { AgentGlobalConfigTab } from '@/components/admin/agent/AgentGlobalConfigTab';

function makeGlobalConfig(overrides: Record<string, unknown> = {}) {
  return {
    systemPrompt: 'You are a helpful assistant.',
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    fallbackProvider: null,
    fallbackModel: null,
    globalDailyBudgetUsd: 15,
    maxConcurrentCalls: 3,
    eligibleConversationTypes: ['group', 'public'],
    messageFreshnessHours: 20,
    maxConversationsPerCycle: 10,
    weekdayMaxConversations: 60,
    weekendMaxConversations: 120,
    globalScanEnabled: false,
    globalScanMinInterval: 90,
    globalScanMaxInterval: 360,
    ...overrides,
  };
}

describe('AgentGlobalConfigTab', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows loader while fetching', () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<AgentGlobalConfigTab />);
      expect(screen.getByTestId('icon-loader2')).toBeInTheDocument();
    });

    it('hides loader after data is fetched', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => expect(screen.queryByTestId('icon-loader2')).not.toBeInTheDocument());
    });
  });

  describe('successful load', () => {
    it('renders card title after load', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => expect(screen.getByText('globalConfig.cardTitle')).toBeInTheDocument());
    });

    it('populates system prompt textarea with loaded data', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ systemPrompt: 'Hello from server' }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => {
        const textarea = screen.getByTestId('textarea');
        expect(textarea).toHaveValue('Hello from server');
      });
    });

    it('shows enabled switch checked when config.enabled is true', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ enabled: true }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => {
        const switches = screen.getAllByTestId('switch');
        expect(switches[0]).toBeChecked();
      });
    });

    it('shows disabled switch when config.enabled is false', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ enabled: false }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => {
        const switches = screen.getAllByTestId('switch');
        expect(switches[0]).not.toBeChecked();
      });
    });
  });

  describe('enabled switch toggle', () => {
    it('toggling switch changes badge variant from default to destructive', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ enabled: true }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const switches = screen.getAllByTestId('switch');
      fireEvent.click(switches[0]);
      await waitFor(() => {
        const badge = screen.getAllByTestId('badge').find(b => b.getAttribute('data-variant') === 'destructive');
        expect(badge).toBeInTheDocument();
      });
    });
  });

  describe('conversation type badges', () => {
    it('renders all five conversation type badges', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const types = ['group', 'channel', 'public', 'global', 'broadcast'];
      types.forEach(type => {
        expect(screen.getByText(`agent.overview.conversationType.${type}`)).toBeInTheDocument();
      });
    });

    it('clicking an inactive type badge adds it to eligibleConversationTypes', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group'] }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const channelBadge = screen.getByText('agent.overview.conversationType.channel');
      expect(channelBadge.closest('[data-testid="badge"]')).toHaveAttribute('data-variant', 'outline');
      fireEvent.click(channelBadge);
      await waitFor(() => {
        expect(channelBadge.closest('[data-testid="badge"]')).toHaveAttribute('data-variant', 'default');
      });
    });

    it('clicking an active type badge removes it from eligibleConversationTypes', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group', 'channel'] }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const groupBadge = screen.getByText('agent.overview.conversationType.group');
      expect(groupBadge.closest('[data-testid="badge"]')).toHaveAttribute('data-variant', 'default');
      fireEvent.click(groupBadge);
      await waitFor(() => {
        expect(groupBadge.closest('[data-testid="badge"]')).toHaveAttribute('data-variant', 'outline');
      });
    });

    it('exposes each type badge as a keyboard-operable toggle button', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group'] }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const groupBadge = screen.getByText('agent.overview.conversationType.group').closest('[data-testid="badge"]');
      const channelBadge = screen.getByText('agent.overview.conversationType.channel').closest('[data-testid="badge"]');
      expect(groupBadge).toHaveAttribute('role', 'button');
      expect(groupBadge).toHaveAttribute('tabindex', '0');
      expect(groupBadge).toHaveAttribute('aria-pressed', 'true');
      expect(channelBadge).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles a type via the Enter key', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group'] }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const channelBadge = screen.getByText('agent.overview.conversationType.channel').closest('[data-testid="badge"]')!;
      fireEvent.keyDown(channelBadge, { key: 'Enter' });
      await waitFor(() => {
        expect(channelBadge).toHaveAttribute('data-variant', 'default');
        expect(channelBadge).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('toggles a type via the Space key', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group', 'channel'] }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const channelBadge = screen.getByText('agent.overview.conversationType.channel').closest('[data-testid="badge"]')!;
      fireEvent.keyDown(channelBadge, { key: ' ' });
      await waitFor(() => {
        expect(channelBadge).toHaveAttribute('data-variant', 'outline');
        expect(channelBadge).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('ignores neutral keys on a type badge', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: ['group'] }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const channelBadge = screen.getByText('agent.overview.conversationType.channel').closest('[data-testid="badge"]')!;
      fireEvent.keyDown(channelBadge, { key: 'Tab' });
      expect(channelBadge).toHaveAttribute('data-variant', 'outline');
      expect(channelBadge).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('save action', () => {
    it('calls updateGlobalConfig on save button click', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(agentAdminService.updateGlobalConfig).toHaveBeenCalled());
    });

    it('shows toast.success on successful save', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('agent.toasts.globalConfigUpdated'));
    });

    it('shows toast.warning when cacheInvalidation.anyChannelSucceeded is false', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        cacheInvalidation: { anyChannelSucceeded: false },
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('agent.toasts.globalConfigSavedPending'));
    });

    it('shows toast.error when save response has success=false', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: false });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.globalConfigUpdateError'));
    });

    it('shows toast.error when updateGlobalConfig throws', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig() });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockRejectedValue(new Error('network'));
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.globalConfigConnectionError'));
    });
  });

  describe('provider and model fields', () => {
    it('changing defaultProvider select updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ defaultProvider: 'openai' }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      // The provider select is a native select (not mocked)
      const selects = document.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
      fireEvent.change(selects[0], { target: { value: 'anthropic' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.defaultProvider).toBe('anthropic');
      });
    });

    it('changing defaultModel input updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ defaultModel: 'gpt-4o-mini' }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      // defaultModel is the first input (non-number)
      const modelInput = inputs.find(i => (i as HTMLInputElement).value === 'gpt-4o-mini');
      expect(modelInput).toBeTruthy();
      fireEvent.change(modelInput!, { target: { value: 'gpt-4o' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.defaultModel).toBe('gpt-4o');
      });
    });

    it('changing fallbackProvider input to empty string sets null in form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ fallbackProvider: 'anthropic' }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const fallbackProviderInput = inputs.find(i => (i as HTMLInputElement).value === 'anthropic');
      expect(fallbackProviderInput).toBeTruthy();
      fireEvent.change(fallbackProviderInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.fallbackProvider).toBeNull();
      });
    });

    it('changing fallbackModel input to empty string sets null in form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ fallbackModel: 'claude-opus' }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const fallbackModelInput = inputs.find(i => (i as HTMLInputElement).value === 'claude-opus');
      expect(fallbackModelInput).toBeTruthy();
      fireEvent.change(fallbackModelInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.fallbackModel).toBeNull();
      });
    });
  });

  describe('budget and concurrency fields', () => {
    it('changing globalDailyBudgetUsd updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ globalDailyBudgetUsd: 15 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const budgetInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '15');
      expect(budgetInput).toBeTruthy();
      fireEvent.change(budgetInput!, { target: { value: '30' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalDailyBudgetUsd).toBe(30);
      });
    });

    it('changing maxConcurrentCalls updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ maxConcurrentCalls: 3 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const concurrentInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '3');
      expect(concurrentInput).toBeTruthy();
      fireEvent.change(concurrentInput!, { target: { value: '8' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxConcurrentCalls).toBe(8);
      });
    });
  });

  describe('scan settings fields', () => {
    it('toggling globalScanEnabled switch updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ globalScanEnabled: false }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const switches = screen.getAllByTestId('switch');
      // Second switch is globalScanEnabled
      const globalScanSwitch = switches[1];
      expect(globalScanSwitch).not.toBeChecked();
      fireEvent.click(globalScanSwitch);
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalScanEnabled).toBe(true);
      });
    });

    it('changing globalScanMinInterval updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ globalScanMinInterval: 90 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const minIntervalInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '90');
      expect(minIntervalInput).toBeTruthy();
      fireEvent.change(minIntervalInput!, { target: { value: '120' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalScanMinInterval).toBe(120);
      });
    });

    it('changing globalScanMaxInterval updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ globalScanMaxInterval: 360 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const maxIntervalInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '360');
      expect(maxIntervalInput).toBeTruthy();
      fireEvent.change(maxIntervalInput!, { target: { value: '480' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalScanMaxInterval).toBe(480);
      });
    });

    it('changing messageFreshnessHours updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ messageFreshnessHours: 20 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const freshnessInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '20');
      expect(freshnessInput).toBeTruthy();
      fireEvent.change(freshnessInput!, { target: { value: '48' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.messageFreshnessHours).toBe(48);
      });
    });

    it('changing maxConversationsPerCycle updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ maxConversationsPerCycle: 10 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const maxConvInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '10');
      expect(maxConvInput).toBeTruthy();
      fireEvent.change(maxConvInput!, { target: { value: '20' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxConversationsPerCycle).toBe(20);
      });
    });

    it('changing weekdayMaxConversations updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ weekdayMaxConversations: 60 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const weekdayInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '60');
      expect(weekdayInput).toBeTruthy();
      fireEvent.change(weekdayInput!, { target: { value: '80' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekdayMaxConversations).toBe(80);
      });
    });

    it('changing weekendMaxConversations updates form', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: makeGlobalConfig({ weekendMaxConversations: 120 }) });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const weekendInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '120');
      expect(weekendInput).toBeTruthy();
      fireEvent.change(weekendInput!, { target: { value: '150' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekendMaxConversations).toBe(150);
      });
    });
  });

  describe('load with success=true but no data', () => {
    it('does not crash when res.success=true but res.data is null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({ success: true, data: null });
      render(<AgentGlobalConfigTab />);
      // Loading resolves but no setForm called — component shows default form
      await waitFor(() => expect(screen.queryByTestId('icon-loader2')).not.toBeInTheDocument());
      // Component renders without crash (uses initial state)
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('load error', () => {
    it('calls toast.error when getGlobalConfig throws', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getGlobalConfig as jest.Mock).mockRejectedValue(new Error('fail'));
      render(<AgentGlobalConfigTab />);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.globalConfigLoadError'));
    });

    it('hides loader after load error', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockRejectedValue(new Error('fail'));
      render(<AgentGlobalConfigTab />);
      await waitFor(() => expect(screen.queryByTestId('icon-loader2')).not.toBeInTheDocument());
    });
  });

  describe('systemPrompt textarea onChange', () => {
    it('updates systemPrompt when textarea changes', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ systemPrompt: 'Original prompt' }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => expect(screen.getByTestId('textarea')).toBeInTheDocument());
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveValue('Original prompt');
      fireEvent.change(textarea, { target: { value: 'Updated system prompt text' } });
      expect(textarea).toHaveValue('Updated system prompt text');
    });
  });

  describe('?? fallbacks when server returns null for nullable fields', () => {
    it('uses default globalScanEnabled=false when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ globalScanEnabled: null, globalScanMinInterval: null, globalScanMaxInterval: null }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const switches = screen.getAllByTestId('switch');
      // globalScanEnabled ?? false → false → unchecked
      expect(switches[1]).not.toBeChecked();
    });

    it('uses default eligibleConversationTypes when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: null }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      // Should render all type badges without crash
      expect(screen.getByText('agent.overview.conversationType.group')).toBeInTheDocument();
    });

    it('toggleConversationType with null eligibleConversationTypes uses ?? [] fallback', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ eligibleConversationTypes: null }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      // Click a badge to trigger toggleConversationType — hits the ?? [] branch
      const channelBadge = screen.getByText('agent.overview.conversationType.channel');
      fireEvent.click(channelBadge);
      // No crash expected
      expect(screen.getByText('agent.overview.conversationType.channel')).toBeInTheDocument();
    });

    it('uses default messageFreshnessHours=22 when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ messageFreshnessHours: null }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.messageFreshnessHours).toBe(22);
      });
    });

    it('uses default maxConversationsPerCycle=0 when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ maxConversationsPerCycle: null }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxConversationsPerCycle).toBe(0);
      });
    });

    it('maxConversationsPerCycle onChange falls back to 0 when cleared (parseInt NaN || 0)', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ maxConversationsPerCycle: 10 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const maxConvInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '10' && i.getAttribute('min') === '0' && !i.getAttribute('max'));
      expect(maxConvInput).toBeTruthy();
      fireEvent.change(maxConvInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxConversationsPerCycle).toBe(0);
      });
    });

    it('uses default weekdayMaxConversations=50 when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ weekdayMaxConversations: null }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekdayMaxConversations).toBe(50);
      });
    });

    it('uses default weekendMaxConversations=100 when server returns null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ weekendMaxConversations: null }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekendMaxConversations).toBe(100);
      });
    });

    it('badge shows disabled when form.enabled is false', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ enabled: false }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      expect(screen.getByText('globalConfig.disabled')).toBeInTheDocument();
    });
  });

  describe('|| fallbacks when onChange inputs are cleared', () => {
    it('globalDailyBudgetUsd falls back to 10 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ globalDailyBudgetUsd: 15 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const budgetInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '15');
      expect(budgetInput).toBeTruthy();
      fireEvent.change(budgetInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalDailyBudgetUsd).toBe(10);
      });
    });

    it('maxConcurrentCalls falls back to 5 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ maxConcurrentCalls: 3 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const concurrentInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '3');
      expect(concurrentInput).toBeTruthy();
      fireEvent.change(concurrentInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxConcurrentCalls).toBe(5);
      });
    });

    it('globalScanMinInterval falls back to 60 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ globalScanMinInterval: 90 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const minIntervalInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '90');
      expect(minIntervalInput).toBeTruthy();
      fireEvent.change(minIntervalInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalScanMinInterval).toBe(60);
      });
    });

    it('globalScanMaxInterval falls back to 300 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ globalScanMaxInterval: 360 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const maxIntervalInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '360');
      expect(maxIntervalInput).toBeTruthy();
      fireEvent.change(maxIntervalInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.globalScanMaxInterval).toBe(300);
      });
    });

    it('messageFreshnessHours falls back to 22 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ messageFreshnessHours: 20 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const freshnessInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '20');
      expect(freshnessInput).toBeTruthy();
      fireEvent.change(freshnessInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.messageFreshnessHours).toBe(22);
      });
    });

    it('weekdayMaxConversations falls back to 50 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ weekdayMaxConversations: 60 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const weekdayInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '60');
      expect(weekdayInput).toBeTruthy();
      fireEvent.change(weekdayInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekdayMaxConversations).toBe(50);
      });
    });

    it('weekendMaxConversations falls back to 100 when cleared', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ weekendMaxConversations: 120 }),
      });
      (agentAdminService.updateGlobalConfig as jest.Mock).mockResolvedValue({ success: true });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      const inputs = screen.getAllByTestId('input');
      const weekendInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '120');
      expect(weekendInput).toBeTruthy();
      fireEvent.change(weekendInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateGlobalConfig as jest.Mock).mock.calls[0][0];
        expect(payload.weekendMaxConversations).toBe(100);
      });
    });

    it('defaultProvider ?? openai is used when form.defaultProvider is null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ defaultProvider: null }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      // defaultProvider null renders without crash; select shows openai as fallback
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
    });

    it('defaultModel ?? gpt-4o-mini is used when form.defaultModel is null', async () => {
      (agentAdminService.getGlobalConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeGlobalConfig({ defaultModel: null }),
      });
      render(<AgentGlobalConfigTab />);
      await waitFor(() => screen.getByTestId('card-title'));
      // Should render without crash
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
    });
  });
});
