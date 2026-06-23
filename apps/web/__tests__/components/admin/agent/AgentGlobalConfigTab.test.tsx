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
  Badge: ({ children, onClick, variant, className }: { children?: React.ReactNode; onClick?: () => void; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className} onClick={onClick}>{children}</span>
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
});
