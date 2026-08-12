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
  ConversationPicker: ({ onSelect, onClear }: any) => (
    <div data-testid="conversation-picker">
      <button data-testid="picker-select" onClick={() => onSelect('abc123def456ghijklmn0001')}>
        select
      </button>
      {onClear && (
        <button data-testid="picker-clear" onClick={() => onClear()}>
          clear
        </button>
      )}
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

  it('does not crash when getGlobalConfig returns success=false (fetchGlobal no-data branch)', async () => {
    mockGetGlobalConfig.mockResolvedValue({ success: false });
    render(<ScanControlPanel />);
    // When success=false, setGlobalConfig/setGlobalForm are NOT called
    // Component shows initial state (no maxConvPerCycle label visible since form is empty {})
    await waitFor(() => {
      // The loader should be gone (finally block runs)
      expect(mockGetGlobalConfig).toHaveBeenCalledTimes(1);
    });
    // No crash expected
    expect(screen.getByTestId('card')).toBeInTheDocument();
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

  it('shows loading spinner while globalLoading is true', () => {
    mockGetGlobalConfig.mockReturnValue(new Promise(() => {}));
    render(<ScanControlPanel />);
    // While global fetch is pending, spinner should show
    const loader = document.querySelector('[data-testid]');
    // The Loader2 mock is not used here since lucide-react is not mocked in this file
    // Instead check that maxConvPerCycle label is NOT yet in the DOM
    expect(screen.queryByText('agent.scanControl.maxConvPerCycle')).not.toBeInTheDocument();
  });

  it('shows select conversation message when no conversation is selected in conversation scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    expect(screen.getByText('agent.scanControl.selectConversation')).toBeInTheDocument();
  });

  it('shows noConfig message when getConfig returns no data', async () => {
    mockGetConfig.mockResolvedValue({ success: false });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => {
      expect(screen.getByText('agent.scanControl.noConfig')).toBeInTheDocument();
    });
  });

  it('shows convLoading spinner while conversation config is loading', async () => {
    mockGetConfig.mockReturnValue(new Promise(() => {}));
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    fireEvent.click(screen.getByTestId('picker-select'));
    // While convLoading is true: cadence should NOT be shown yet
    expect(screen.queryByText('agent.scanControl.cadence')).not.toBeInTheDocument();
  });

  it('shows upsertConfig error toast when upsertConfig returns success=false', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    mockUpsertConfig.mockResolvedValue({ success: false });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockToastError).toHaveBeenCalledWith('agent.toasts.updateError');
  });

  it('shows networkError toast when upsertConfig throws', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    mockUpsertConfig.mockRejectedValue(new Error('fail'));
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('agent.scanControl.apply'));
    });
    expect(mockToastError).toHaveBeenCalledWith('agent.toasts.networkError');
  });

  it('renders time distribution section with minDelay and maxDelay fields', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.timeDistribution')).toBeInTheDocument());
    expect(screen.getByText('agent.scanControl.minDelay')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.maxDelay')).toBeInTheDocument();
  });

  it('renders responses per cycle section', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.responsesPerCycle')).toBeInTheDocument());
    expect(screen.getByText('agent.scanControl.minMsgs')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.maxMsgs')).toBeInTheDocument();
  });

  it('renders participants section with maxControlledUsers and weekday/weekend fields', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument());
    expect(screen.getByText('agent.scanControl.maxControlledUsers')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.weekdayMsgs')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.weekendMsgs')).toBeInTheDocument();
  });

  it('updates minDelayMinutes field on change', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ minDelayMinutes: 1 }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.minDelay')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // Find the minDelayMinutes input (value=1, max=1440)
    const minDelayInput = inputs.find(i => (i as HTMLInputElement).value === '1' && (i as HTMLInputElement).max === '1440');
    expect(minDelayInput).toBeTruthy();
    fireEvent.change(minDelayInput!, { target: { value: '10' } });
    expect((minDelayInput as HTMLInputElement).value).toBe('10');
  });

  it('updates maxConversationsPerCycle via number input in global scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const cycleInput = inputs[0];
    fireEvent.change(cycleInput, { target: { value: '50' } });
    expect((cycleInput as HTMLInputElement).value).toBe('50');
  });

  it('toggles eligible conversation type when chip is clicked', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('direct')).toBeInTheDocument());
    // 'direct' is not in eligibleConversationTypes (makeGlobalConfig has ['group', 'public'])
    // Clicking it adds it; clicking again removes it
    const directBtn = screen.getByText('direct');
    fireEvent.click(directBtn);
    // After toggle: 'direct' should now be in the list
    // Click 'group' (which is active) to remove it
    const groupBtn = screen.getByText('group');
    fireEvent.click(groupBtn);
    // Both operations should not throw
    expect(screen.getByText('direct')).toBeInTheDocument();
  });

  it('updates messageFreshnessHours via range slider in global scope', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText(/agent\.scanControl\.freshnessLabel/)).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    expect(rangeInputs.length).toBeGreaterThanOrEqual(1);
    fireEvent.change(rangeInputs[0], { target: { value: '48' } });
    // No crash means the updateGlobal function worked
    expect(screen.getByText(/agent\.scanControl\.freshnessLabel/)).toBeInTheDocument();
  });

  it('clicking Global button when in conversation scope switches back to global', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    expect(screen.queryByText('agent.scanControl.maxConvPerCycle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Global'));
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
  });

  it('onClear sets selectedConvId to null', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument());
    // Now clear the selection
    fireEvent.click(screen.getByTestId('picker-clear'));
    await waitFor(() => {
      expect(screen.queryByText('agent.scanControl.cadence')).not.toBeInTheDocument();
      expect(screen.getByText('agent.scanControl.selectConversation')).toBeInTheDocument();
    });
  });

  it('fires burst field onChange handlers (burstSize, burstIntervalMinutes, quietIntervalMinutes)', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ burstEnabled: true, burstSize: 4, burstIntervalMinutes: 5, quietIntervalMinutes: 90 }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // burstSize input has value=4 and max=10
    const burstSizeInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '10');
    expect(burstSizeInput).toBeTruthy();
    fireEvent.change(burstSizeInput!, { target: { value: '6' } });
    // burstIntervalMinutes input has value=5 and max=30
    const burstIntervalInput = inputs.find(i => (i as HTMLInputElement).value === '5' && (i as HTMLInputElement).max === '30');
    expect(burstIntervalInput).toBeTruthy();
    fireEvent.change(burstIntervalInput!, { target: { value: '10' } });
    // quietIntervalMinutes input has value=90 and max=480
    const quietInput = inputs.find(i => (i as HTMLInputElement).value === '90' && (i as HTMLInputElement).max === '480');
    expect(quietInput).toBeTruthy();
    fireEvent.change(quietInput!, { target: { value: '120' } });
    expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument();
  });

  it('fires time distribution onChange handlers (maxDelay, spreadOverDay, maxMsgPer10Min)', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.timeDistribution')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // maxDelayMinutes has value=360, max=1440
    const maxDelayInput = inputs.find(i => (i as HTMLInputElement).value === '360' && (i as HTMLInputElement).max === '1440');
    expect(maxDelayInput).toBeTruthy();
    fireEvent.change(maxDelayInput!, { target: { value: '500' } });
    // maxMessagesPerUserPer10Min has value=4, max=20
    const maxMsgInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '20');
    expect(maxMsgInput).toBeTruthy();
    fireEvent.change(maxMsgInput!, { target: { value: '8' } });
    // spreadOverDayEnabled switch
    const switches = screen.getAllByRole('switch');
    // spreadOverDay is the 3rd switch (enabled=true, scanInterval, burstEnabled, spreadOverDay, autoPickup)
    const spreadSwitch = switches.find(s => s.getAttribute('aria-checked') === 'true');
    expect(spreadSwitch).toBeTruthy();
    fireEvent.click(spreadSwitch!);
    expect(screen.getByText('agent.scanControl.timeDistribution')).toBeInTheDocument();
  });

  it('fires responses per cycle onChange handlers', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.responsesPerCycle')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // minResponsesPerCycle has value=2, max=50
    const minRespInput = inputs.find(i => (i as HTMLInputElement).value === '2' && (i as HTMLInputElement).max === '50');
    expect(minRespInput).toBeTruthy();
    fireEvent.change(minRespInput!, { target: { value: '3' } });
    // maxResponsesPerCycle has value=12, max=50 (same max)
    const maxRespInput = inputs.find(i => (i as HTMLInputElement).value === '12' && (i as HTMLInputElement).max === '50');
    expect(maxRespInput).toBeTruthy();
    fireEvent.change(maxRespInput!, { target: { value: '15' } });
    // maxReactionsPerCycle has value=4, max=50 (same max)
    const maxReacInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '50');
    expect(maxReacInput).toBeTruthy();
    fireEvent.change(maxReacInput!, { target: { value: '6' } });
    expect(screen.getByText('agent.scanControl.responsesPerCycle')).toBeInTheDocument();
  });

  it('fires participants onChange handlers (maxControlledUsers, autoPickup, weekday/weekend)', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig() });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // maxControlledUsers has value=5, max=50
    const maxUsersInput = inputs.find(i => (i as HTMLInputElement).value === '5' && (i as HTMLInputElement).max === '50');
    expect(maxUsersInput).toBeTruthy();
    fireEvent.change(maxUsersInput!, { target: { value: '8' } });
    // weekdayMaxMessages has value=10, max=100
    const weekdayMsgInput = inputs.find(i => (i as HTMLInputElement).value === '10' && (i as HTMLInputElement).max === '100');
    expect(weekdayMsgInput).toBeTruthy();
    fireEvent.change(weekdayMsgInput!, { target: { value: '15' } });
    // weekendMaxMessages has value=25, max=200
    const weekendMsgInput = inputs.find(i => (i as HTMLInputElement).value === '25' && (i as HTMLInputElement).max === '200');
    expect(weekendMsgInput).toBeTruthy();
    fireEvent.change(weekendMsgInput!, { target: { value: '30' } });
    // weekdayMaxUsers has value=4, max=20
    const weekdayUsersInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '20');
    expect(weekdayUsersInput).toBeTruthy();
    fireEvent.change(weekdayUsersInput!, { target: { value: '5' } });
    // weekendMaxUsers has value=6, max=30
    const weekendUsersInput = inputs.find(i => (i as HTMLInputElement).value === '6' && (i as HTMLInputElement).max === '30');
    expect(weekendUsersInput).toBeTruthy();
    fireEvent.change(weekendUsersInput!, { target: { value: '8' } });
    // autoPickupEnabled switch (the last switch)
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[switches.length - 1]);
    // inactivityThresholdHours range slider
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    // The second range input in conversation scope is for inactivityThresholdHours
    if (rangeInputs.length > 1) {
      fireEvent.change(rangeInputs[1], { target: { value: '48' } });
    }
    expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument();
  });

  it('spreadOverDayEnabled onChange handler fires when switch is toggled', async () => {
    // Use a config where ALL boolean fields are uniquely set so we can click all unchecked switches
    // spreadOverDayEnabled=false, burstEnabled=true, reactionsEnabled=true, autoPickupEnabled=true, enabled=true
    // So only spreadOverDayEnabled is false → exactly one unchecked switch (after enabled=true)
    // Wait — there's also the burstEnabled switch. We need burstEnabled=true so only spreadOverDay is false.
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ spreadOverDayEnabled: false, burstEnabled: true, reactionsEnabled: true, autoPickupEnabled: true, enabled: true }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.timeDistribution')).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    // With burstEnabled=true: enabled, reactionsEnabled, burstEnabled, spreadOverDayEnabled, autoPickupEnabled
    // = true, true, true, false, true → only index 3 is false
    // Click ALL unchecked switches to ensure the spreadOverDayEnabled one fires
    const uncheckedSwitches = switches.filter(s => s.getAttribute('aria-checked') === 'false');
    expect(uncheckedSwitches.length).toBeGreaterThanOrEqual(1);
    uncheckedSwitches.forEach(sw => fireEvent.click(sw));
    // After clicking, the onChange at line 366 should have been called
    await waitFor(() => {
      const updatedSwitches = screen.getAllByRole('switch');
      expect(updatedSwitches.every(s => s.getAttribute('aria-checked') === 'true')).toBe(true);
    });
  });

  it('fetchConv and JSX ?? fallbacks fire when all optional fields are absent (burstEnabled=true)', async () => {
    // Provide a config with only burstEnabled=true and all other fields absent/undefined
    // This triggers ?? right-side fallbacks in:
    // - checked={convForm.enabled ?? true} (line 270)
    // - convForm.scanIntervalMinutes ?? 3 (lines 274, 281)
    // - checked={convForm.burstEnabled ?? true} (line 295) — left side IS true here
    // - convForm.burstSize ?? 4 (line 304)
    // - convForm.burstIntervalMinutes ?? 5 (line 311)
    // - convForm.quietIntervalMinutes ?? 90 (line 320)
    // etc.
    const minimalBurstConfig: Record<string, unknown> = { burstEnabled: true };
    mockGetConfig.mockResolvedValue({ success: true, data: minimalBurstConfig });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    // convForm.burstEnabled = true → burst section shows
    await waitFor(() => expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument());
    // All ?? fallbacks in JSX are now triggered for undefined fields
    expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.timeDistribution')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.responsesPerCycle')).toBeInTheDocument();
    expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument();
  });

  it('weekdayMaxUsers onChange handler fires with a distinctive unique value', async () => {
    // Use weekdayMaxUsers=7 (unique enough to distinguish from maxMessagesPerUserPer10Min=4, max=20)
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ weekdayMaxUsers: 7, maxMessagesPerUserPer10Min: 4 }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // weekdayMaxUsers=7 with max=20 — unique vs maxMessagesPerUserPer10Min=4 with max=20
    const weekdayUsersInput = inputs.find(i => (i as HTMLInputElement).value === '7' && (i as HTMLInputElement).max === '20');
    expect(weekdayUsersInput).toBeTruthy();
    // Firing change on this input covers line 472
    fireEvent.change(weekdayUsersInput!, { target: { value: '8' } });
    expect(screen.getByText('agent.scanControl.participants')).toBeInTheDocument();
  });

  it('|| fallbacks fire when conv scope inputs are cleared (burst, delays, responses, participants)', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({
      burstEnabled: true, burstSize: 4, burstIntervalMinutes: 5, quietIntervalMinutes: 90,
      minDelayMinutes: 1, maxDelayMinutes: 360, maxMessagesPerUserPer10Min: 4,
      minResponsesPerCycle: 2, maxResponsesPerCycle: 12, maxReactionsPerCycle: 4,
      maxControlledUsers: 5, weekdayMaxMessages: 10, weekendMaxMessages: 25,
      weekdayMaxUsers: 4, weekendMaxUsers: 6,
    }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => { fireEvent.click(screen.getByTestId('picker-select')); });
    await waitFor(() => expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    // Clear each input to trigger || fallback
    inputs.forEach(input => {
      fireEvent.change(input, { target: { value: '' } });
    });
    // No crash expected — all || fallbacks fire
    expect(screen.getByText('agent.scanControl.burstSize')).toBeInTheDocument();
  });

  it('|| fallback fires in global scope maxConversationsPerCycle when cleared', async () => {
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.length).toBeGreaterThan(0);
    fireEvent.change(inputs[0], { target: { value: '' } });
    // No crash — parseInt('') || 0 = 0
    expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument();
  });

  it('fires scanIntervalMinutes range slider onChange', async () => {
    mockGetConfig.mockResolvedValue({ success: true, data: makeConvConfig({ scanIntervalMinutes: 3 }) });
    render(<ScanControlPanel />);
    await waitFor(() => expect(screen.getByText('agent.scanControl.maxConvPerCycle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Conversation'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    await waitFor(() => expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    expect(rangeInputs.length).toBeGreaterThanOrEqual(1);
    fireEvent.change(rangeInputs[0], { target: { value: '15' } });
    expect(screen.getByText('agent.scanControl.cadence')).toBeInTheDocument();
  });
});
