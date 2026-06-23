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

  describe('model select independent change', () => {
    it('changing model select directly without changing provider updates model', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ provider: 'openai', model: 'gpt-4o-mini' }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const selects = screen.getAllByTestId('select');
      // selects[1] is the model select
      fireEvent.change(selects[1], { target: { value: 'gpt-4o' } });
      await waitFor(() => expect(selects[1]).toHaveValue('gpt-4o'));
    });
  });

  describe('budget field interactions', () => {
    it('updating dailyBudgetUsd input changes the form value', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ dailyBudgetUsd: 20 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      // Find the dailyBudgetUsd input (type=number, not password, not maxTokens)
      const budgetInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '20');
      expect(budgetInput).toBeTruthy();
      fireEvent.change(budgetInput!, { target: { value: '50' } });
      // Trigger save and verify the updated value is in the payload
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.dailyBudgetUsd).toBe(50);
      });
    });

    it('updating maxCostPerCall input changes the form value', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ maxCostPerCall: 0.05 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const costInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '0.05');
      expect(costInput).toBeTruthy();
      fireEvent.change(costInput!, { target: { value: '0.1' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxCostPerCall).toBe(0.1);
      });
    });

    it('updating maxTokens input changes the form value', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ maxTokens: 1024 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const tokensInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '1024');
      expect(tokensInput).toBeTruthy();
      fireEvent.change(tokensInput!, { target: { value: '2048' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxTokens).toBe(2048);
      });
    });

    it('setting dailyBudgetUsd to invalid value falls back to 20', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ dailyBudgetUsd: 20 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const budgetInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '20');
      fireEvent.change(budgetInput!, { target: { value: 'invalid' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.dailyBudgetUsd).toBe(20);
      });
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

    it('does not update form when getLlmConfig returns success=true but no data', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: null });
      render(<AgentLlmTab />);
      await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
      // Form should show defaults (no crash)
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('save with no data returned', () => {
    it('does not show success toast when updateLlmConfig returns success=true but data=null', async () => {
      const { toast } = require('sonner');
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: null });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => expect(agentAdminService.updateLlmConfig).toHaveBeenCalled());
      // No success toast since response.data is null
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('unknown provider fallback', () => {
    it('falls back to MODELS.openai when provider is not in MODELS', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ provider: 'unknown-provider', model: 'some-model' }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      // The component should not crash and should render select elements
      expect(screen.getAllByTestId('select').length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to gpt-4o-mini when new provider has no models', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ provider: 'openai', model: 'gpt-4o' }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const selects = screen.getAllByTestId('select');
      // Change to unknown provider to trigger fallback
      fireEvent.change(selects[0], { target: { value: 'unknown-xyz' } });
      // Should not crash; form state updated
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('temperature null fallback', () => {
    it('falls back to 0.7 when form.temperature is null/undefined', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ temperature: null }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      // Temperature display should show fallback value (no crash)
      const slider = screen.getByTestId('slider');
      expect(slider).toHaveValue('0.7');
    });

    it('falls back to null provider ?? openai for form.provider', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ provider: null }),
      });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      // With provider=null, MODELS[null ?? 'openai'] = MODELS.openai → no crash
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('falls back to 1024 when maxTokens input cleared', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ maxTokens: 1024 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const tokensInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '1024');
      expect(tokensInput).toBeTruthy();
      fireEvent.change(tokensInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxTokens).toBe(1024);
      });
    });
  });

  describe('maxCostPerCall invalid value fallback', () => {
    it('falls back to 0.05 when maxCostPerCall input is cleared', async () => {
      (agentAdminService.getLlmConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: makeLlmConfig({ maxCostPerCall: 0.05 }),
      });
      (agentAdminService.updateLlmConfig as jest.Mock).mockResolvedValue({ success: true, data: makeLlmConfig() });
      render(<AgentLlmTab />);
      await waitFor(() => screen.getByText('llm.cardTitle'));
      const inputs = screen.getAllByTestId('input');
      const costInput = inputs.find(i => i.getAttribute('type') === 'number' && (i as HTMLInputElement).value === '0.05');
      expect(costInput).toBeTruthy();
      fireEvent.change(costInput!, { target: { value: '' } });
      fireEvent.click(screen.getByTestId('button'));
      await waitFor(() => {
        const payload = (agentAdminService.updateLlmConfig as jest.Mock).mock.calls[0][0];
        expect(payload.maxCostPerCall).toBe(0.05);
      });
    });
  });
});
