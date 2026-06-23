import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getLlmConfig: jest.fn(),
    updateLlmConfig: jest.fn(),
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
  Key: ({ className }: { className?: string }) => <svg data-testid="icon-key" className={className} />,
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
  Input: ({ value, onChange, type, placeholder, ...rest }: { value?: unknown; onChange?: React.ChangeEventHandler<HTMLInputElement>; type?: string; placeholder?: string; [key: string]: unknown }) => (
    <input data-testid="input" value={value as string | number} onChange={onChange} type={type} placeholder={placeholder} {...rest} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children?: React.ReactNode }) => <label data-testid="label">{children}</label>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: { children?: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

jest.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step }: { value?: number[]; onValueChange?: (v: number[]) => void; min?: number; max?: number; step?: number }) => (
    <input
      type="range"
      data-testid="slider"
      value={value?.[0]}
      min={min}
      max={max}
      step={step}
      onChange={e => onValueChange?.([parseFloat(e.target.value)])}
    />
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
import { AgentLlmTab } from '@/components/admin/agent/AgentLlmTab';

function makeLlmConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    hasApiKey: false,
    maxTokens: 1024,
    temperature: 0.7,
    dailyBudgetUsd: 20,
    maxCostPerCall: 0.05,
    fallbackProvider: null,
    fallbackModel: null,
    ...overrides,
  };
}

describe('AgentLlmTab', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows 6 skeleton elements while fetching', () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<AgentLlmTab />);
      expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
    });

    it('hides skeletons after load completes', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    });
  });

  describe('successful load', () => {
    it('renders card title after load', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => expect(screen.getByText('llm.cardTitle')).toBeInTheDocument());
    });

    it('does not show hasApiKey badge when config.hasApiKey is false', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ hasApiKey: false }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      expect(screen.queryByText('llm.keyConfigured')).not.toBeInTheDocument();
    });

    it('shows "Key configured" badge when config.hasApiKey is true', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ hasApiKey: true }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => expect(screen.getByText('llm.keyConfigured')).toBeInTheDocument());
    });

    it('shows placeholder "sk-..." when config.hasApiKey is false', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ hasApiKey: false }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const apiKeyInput = inputs.find(i => i.getAttribute('type') === 'password');
      expect(apiKeyInput).toHaveAttribute('placeholder', 'sk-...');
    });

    it('shows placeholder "********" when config.hasApiKey is true', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ hasApiKey: true }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const apiKeyInput = inputs.find(i => i.getAttribute('type') === 'password');
      expect(apiKeyInput).toHaveAttribute('placeholder', '********');
    });

    it('API key input type is password', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const apiKeyInput = inputs.find(i => i.getAttribute('type') === 'password');
      expect(apiKeyInput).toBeInTheDocument();
    });
  });

  describe('provider select', () => {
    it('changing provider to anthropic resets model to claude-sonnet-4-6', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig({ provider: 'openai', model: 'gpt-4o' }) });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const selects = screen.getAllByTestId('select');
      fireEvent.change(selects[0], { target: { value: 'anthropic' } });
      await waitFor(() => {
        expect(selects[0]).toHaveValue('anthropic');
        expect(selects[1]).toHaveValue('claude-sonnet-4-6');
      });
    });

    it('changing provider back to openai resets model to gpt-4o-mini', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6' }) });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const selects = screen.getAllByTestId('select');
      fireEvent.change(selects[0], { target: { value: 'openai' } });
      await waitFor(() => {
        expect(selects[0]).toHaveValue('openai');
        expect(selects[1]).toHaveValue('gpt-4o-mini');
      });
    });
  });

  describe('temperature slider', () => {
    it('updates temperature display when slider changes', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig({ temperature: 0.7 }) });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const slider = screen.getByTestId('slider');
      fireEvent.change(slider, { target: { value: '1.2' } });
      await waitFor(() => expect(screen.getByText('1.2')).toBeInTheDocument());
    });
  });

  describe('save action', () => {
    it('calls updateLlmConfig when save button is clicked', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(agentAdminService.updateLlmConfig).toHaveBeenCalled());
    });

    it('strips apiKeyEncrypted from payload when it is empty string', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload).not.toHaveProperty('apiKeyEncrypted');
      });
    });

    it('includes apiKeyEncrypted in payload when not empty', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const apiKeyInput = inputs.find(i => i.getAttribute('type') === 'password')!;
      fireEvent.change(apiKeyInput, { target: { value: 'sk-abc123' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.apiKeyEncrypted).toBe('sk-abc123');
      });
    });

    it('shows toast.success on successful save', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('agent.toasts.llmConfigUpdated'));
    });

    it('shows toast.warning when cacheInvalidation.anyChannelSucceeded is false', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig(),
        cacheInvalidation: { anyChannelSucceeded: false },
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('agent.toasts.llmConfigSavedPending'));
    });

    it('clears apiKeyEncrypted field after successful save', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const apiKeyInput = inputs.find(i => i.getAttribute('type') === 'password')!;
      fireEvent.change(apiKeyInput, { target: { value: 'sk-newkey' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(apiKeyInput).toHaveValue(''));
    });

    it('shows toast.error when updateLlmConfig throws', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockRejectedValue(new Error('network'));
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.llmConfigSaveError'));
    });
  });

  describe('load error', () => {
    it('calls toast.error when getLlmConfig throws', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getLlmConfig as jest.Mock).mockRejectedValue(new Error('fail'));
      render(<AgentLlmTab />);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('agent.toasts.llmConfigLoadError'));
    });

    it('hides skeletons after load error', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockRejectedValue(new Error('fail'));
      render(<AgentLlmTab />);
      await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    });
  });
});
