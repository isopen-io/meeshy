import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ScanControlPanel from '@/components/admin/agent/ScanControlPanel';
import { agentAdminService } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getGlobalConfig: jest.fn(),
    updateGlobalConfig: jest.fn(),
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
  },
}));

jest.mock('@/components/admin/agent/ConversationPicker', () => ({
  ConversationPicker: ({ onSelect }: any) => (
    <div data-testid="conversation-picker">
      <button data-testid="picker-select" onClick={() => onSelect('abc123def456ghijklmn0001')}>
        select
      </button>
    </div>
  ),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/admin/agent/InfoIcon', () => ({
  InfoIcon: () => null,
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <h2 data-testid="card-title">{children}</h2>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, type, min, max }: any) => (
    <input type={type} value={value} onChange={onChange} min={min} max={max} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, className }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      switch
    </button>
  ),
}));

const mockGetGlobalConfig = agentAdminService.getGlobalConfig as jest.Mock;
const mockUpdateGlobalConfig = agentAdminService.updateGlobalConfig as jest.Mock;
const mockGetConfig = agentAdminService.getConfig as jest.Mock;
const mockUpsertConfig = agentAdminService.upsertConfig as jest.Mock;
const mockToastSuccess = toast.success as jest.Mock;
const mockToastError = toast.error as jest.Mock;

function makeGlobalConfig(overrides = {}) {
  return {
    maxConversationsPerCycle: 10,
    messageFreshnessHours: 22,
    eligibleConversationTypes: ['group', 'public'],
    ...overrides,
  };
}

function makeConvConfig(overrides = {}) {
  return {
    enabled: true,
    scanIntervalMinutes: 3,
    minResponsesPerCycle: 2,
    maxResponsesPerCycle: 12,
    maxReactionsPerCycle: 4,
    reactionsEnabled: true,
    burstEnabled: true,
    burstSize: 4,
    burstIntervalMinutes: 5,
    quietIntervalMinutes: 90,
    maxControlledUsers: 5,
    autoPickupEnabled: true,
    weekdayMaxMessages: 10,
    weekendMaxMessages: 25,
    weekdayMaxUsers: 4,
    weekendMaxUsers: 6,
    inactivityThresholdHours: 72,
    inactivityDaysThreshold: 3,
    minDelayMinutes: 1,
    maxDelayMinutes: 360,
    spreadOverDayEnabled: true,
    maxMessagesPerUserPer10Min: 4,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGlobalConfig.mockResolvedValue({ success: true, data: makeGlobalConfig() });
});

describe('ScanControlPanel — global scope', () => {
  it('fetches global config on mount', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(mockGetGlobalConfig).toHaveBeenCalledTimes(1);
    });
  });

  it('renders maxConversationsPerCycle field in global scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
  });

  it('renders messageFreshnessHours range slider in global scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText(/agent\.scanControl\.freshnessLabel/)).toBeInTheDocument();
    });
  });

  it('renders eligible conversation type toggle chips', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('group')).toBeInTheDocument();
      expect(screen.getByText('direct')).toBeInTheDocument();
      expect(screen.getByText('channel')).toBeInTheDocument();
    });
  });

  it('save button is enabled in global scope without conversation selected', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    const saveBtn = screen.getByText('agent.scanControl.apply').closest('button');
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls updateGlobalConfig and shows success toast on save', async () => {
    mockUpdateGlobalConfig.mockResolvedValue({ success: true });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockUpdateGlobalConfig).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('agent.toasts.globalConfigUpdated');
  });

  it('shows error toast when updateGlobalConfig returns success=false', async () => {
    mockUpdateGlobalConfig.mockResolvedValue({ success: false });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockToastError).toHaveBeenCalledWith('agent.toasts.globalConfigUpdateError');
  });

  it('shows network error toast when updateGlobalConfig throws', async () => {
    mockUpdateGlobalConfig.mockRejectedValue(new Error('Network error'));
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockToastError).toHaveBeenCalledWith('agent.toasts.networkError');
  });
});

describe('ScanControlPanel — conversation scope', () => {
  it('shows ConversationPicker when switching to conversation scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    expect(screen.getByTestId('conversation-picker')).toBeInTheDocument();
  });

  it('save button is disabled when no conversation is selected', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    const saveBtn = screen.getByText('agent.scanControl.apply').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('loads conversation config when conversation is selected', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(mockGetConfig).toHaveBeenCalledWith('abc123def456ghijklmn0001');
    });
  });

  it('shows cadence section after conversation config is loaded', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument();
    });
  });

  it('shows burst fields when burstEnabled is true', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ burstEnabled: true }) });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument();
    });
  });

  it('hides burst fields when burstEnabled is toggled off', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ burstEnabled: true }) });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument();
    });
    const burstSwitches = screen.getAllByRole('switch');
    const burstSwitch = burstSwitches.find(
      (s) => s.getAttribute('aria-checked') === 'true',
    );
    expect(burstSwitch).toBeDefined();
    await act(async () => {
      fireEvent.click(burstSwitches[1]);
    });
    await waitFor(() => {
      expect(screen.queryByText('agent.scanControl.burstSize')).not.toBeInTheDocument();
    });
  });

  it('calls upsertConfig on save with selected conversation', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    mockUpsertConfig.mockResolvedValue({ success: true });
    render(<ScanControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockUpsertConfig).toHaveBeenCalledWith('abc123def456ghijklmn0001', expect.any(Object));
    expect(mockToastSuccess).toHaveBeenCalledWith('agent.toasts.conversationConfigUpdated');
  });
});
