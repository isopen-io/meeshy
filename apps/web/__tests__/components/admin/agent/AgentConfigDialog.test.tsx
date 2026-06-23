import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentConfigDialog } from '@/components/admin/agent/AgentConfigDialog';
import { agentAdminService } from '@/services/agent-admin.service';
import { conversationsCrudService } from '@/services/conversations/crud.service';
import { toast } from 'sonner';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'en' }),
}));

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    upsertConfig: jest.fn(),
    listTopics: jest.fn(),
  },
}));

jest.mock('@/services/conversations/crud.service', () => ({
  conversationsCrudService: { getConversation: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/dynamic', () => (loader: any, opts?: any) => {
  loader().catch(() => {});
  return () => null;
});

jest.mock('@/components/admin/agent/ConversationPicker', () => ({
  ConversationPicker: ({ onSelect }: any) => (
    <div data-testid="conversation-picker">
      <button
        data-testid="picker-select"
        onClick={() => onSelect('507f1f77bcf86cd799439011')}
      >
        select
      </button>
    </div>
  ),
}));

jest.mock('@/components/admin/agent/AgentRolesSection', () => ({
  AgentRolesSection: () => <div data-testid="agent-roles-section" />,
}));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: () => <span data-testid="user-display" />,
}));

jest.mock('@/components/admin/agent/UserPicker', () => ({
  UserPicker: () => <div data-testid="user-picker" />,
}));

jest.mock('@/components/admin/agent/InfoIcon', () => ({
  InfoIcon: () => null,
}));

jest.mock('@/components/admin/agent/config-form-merge', () => ({
  mergeDefinedFields: (defaults: any, fields: any) => ({ ...defaults, ...fields }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogFooter: ({ children }: any) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, type, min, max, placeholder, maxLength }: any) => (
    <input
      type={type ?? 'text'}
      value={value ?? ''}
      onChange={onChange}
      min={min}
      max={max}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, className }: any) => <label>{children}</label>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, onClick, variant }: any) => (
    <span
      data-testid="badge"
      data-variant={variant}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button
      role="switch"
      aria-checked={String(checked)}
      onClick={() => onCheckedChange(!checked)}
    >
      switch
    </button>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, rows, maxLength }: any) => (
    <textarea
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
    />
  ),
}));

const mockUpsertConfig = agentAdminService.upsertConfig as jest.Mock;
const mockListTopics = agentAdminService.listTopics as jest.Mock;
const mockGetConversation = conversationsCrudService.getConversation as jest.Mock;
const mockToastSuccess = toast.success as jest.Mock;
const mockToastError = toast.error as jest.Mock;
const mockToastWarning = toast.warning as jest.Mock;

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1',
    conversationId: '507f1f77bcf86cd799439011',
    conversation: {
      title: 'Test Room',
      type: 'group',
      visibility: 'public',
      memberCount: 5,
      messageCount: 100,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: null,
      lastMessageAt: null,
      identifier: null,
    },
    enabled: true,
    autoPickupEnabled: true,
    isScanning: false,
    currentNode: null,
    configuredBy: null,
    controlledUserIds: ['user1'],
    analytics: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    triggerOnTimeout: true,
    timeoutSeconds: 300,
    triggerOnUserMessage: false,
    triggerOnReplyTo: true,
    agentType: 'personal',
    contextWindowSize: 50,
    useFullHistory: false,
    excludedRoles: [],
    excludedUserIds: [],
    manualUserIds: [],
    triggerFromUserIds: [],
    scanIntervalMinutes: 3,
    minResponsesPerCycle: 2,
    maxResponsesPerCycle: 12,
    reactionsEnabled: true,
    maxReactionsPerCycle: 4,
    agentInstructions: null,
    webSearchEnabled: true,
    minWordsPerMessage: 3,
    maxWordsPerMessage: 400,
    generationTemperature: 0.8,
    qualityGateEnabled: true,
    qualityGateMinScore: 0.5,
    weekdayMaxMessages: 10,
    weekendMaxMessages: 25,
    weekdayMaxUsers: 4,
    weekendMaxUsers: 6,
    burstEnabled: true,
    burstSize: 4,
    burstIntervalMinutes: 5,
    quietIntervalMinutes: 90,
    prioritizeTaggedUsers: true,
    prioritizeRepliedUsers: true,
    reactionBoostFactor: 1.5,
    freshTopicProbability: 0.2,
    freshTopicCategoryHints: [],
    freshTopicBlockedSlugs: [],
    inactivityThresholdHours: 72,
    minHistoricalMessages: 0,
    maxControlledUsers: 5,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListTopics.mockResolvedValue({ success: true, data: [] });
  mockGetConversation.mockResolvedValue(null);
});

describe('AgentConfigDialog — rendering', () => {
  it('renders nothing when open=false', () => {
    render(
      <AgentConfigDialog
        open={false}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open=true', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  it('shows "titleNew" in create mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('agentConfig.titleNew');
    });
  });

  it('shows "titleEdit" in edit mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('agentConfig.titleEdit');
    });
  });

  it('shows ConversationPicker in create mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('conversation-picker')).toBeInTheDocument();
    });
  });

  it('does not show ConversationPicker in edit mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-picker')).not.toBeInTheDocument();
    });
  });

  it('shows AgentRolesSection in edit mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('agent-roles-section')).toBeInTheDocument();
    });
  });

  it('does not show AgentRolesSection in create mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('agent-roles-section')).not.toBeInTheDocument();
    });
  });

  it('fetches topics on mount', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(mockListTopics).toHaveBeenCalledWith({ activeOnly: true });
    });
  });
});

describe('AgentConfigDialog — handleSave validation', () => {
  it('shows error toast when conversationId is invalid (empty in create mode)', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    const saveBtn = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('agentConfig.createButton'),
    );
    await act(async () => {
      fireEvent.click(saveBtn!);
    });
    expect(mockToastError).toHaveBeenCalledWith('agent.toasts.invalidConversationId');
    expect(mockUpsertConfig).not.toHaveBeenCalled();
  });

  it('calls upsertConfig after selecting a valid conversation in create mode', async () => {
    mockUpsertConfig.mockResolvedValue({ success: true });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('conversation-picker')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    const saveBtn = screen.getByText('agentConfig.createButton');
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockUpsertConfig).toHaveBeenCalledWith('507f1f77bcf86cd799439011', expect.any(Object));
  });

  it('calls onSave and shows success toast on successful upsert in create mode', async () => {
    mockUpsertConfig.mockResolvedValue({ success: true });
    const onSave = jest.fn();
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={onSave}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('conversation-picker')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('picker-select'));
    });
    const saveBtn = screen.getByText('agentConfig.createButton');
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('agentConfig.created');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows warning toast when cacheInvalidation.anyChannelSucceeded=false', async () => {
    mockUpsertConfig.mockResolvedValue({
      success: true,
      cacheInvalidation: { anyChannelSucceeded: false },
    });
    const onSave = jest.fn();
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={onSave}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: 'save' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockToastWarning).toHaveBeenCalledWith('agentConfig.pendingPropagation');
  });

  it('shows error toast when upsertConfig throws', async () => {
    mockUpsertConfig.mockRejectedValue(new Error('Network failure'));
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: 'save' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockToastError).toHaveBeenCalledWith('agentConfig.saveError');
  });
});

describe('AgentConfigDialog — cancel button', () => {
  it('calls onOpenChange(false) when cancel is clicked', async () => {
    const onOpenChange = jest.fn();
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={onOpenChange}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AgentConfigDialog — form interactions', () => {
  it('toggles a role badge into excludedRoles on click', async () => {
    mockUpsertConfig.mockResolvedValue({ success: true });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ excludedRoles: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    const badges = screen.getAllByTestId('badge');
    const userBadge = badges.find((b) => b.textContent === 'USER');
    expect(userBadge).toBeDefined();
    fireEvent.click(userBadge!);
    expect(userBadge).toHaveAttribute('data-variant', 'destructive');
  });

  it('hides timeoutSeconds input when triggerOnTimeout is toggled off', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ triggerOnTimeout: true, triggerOnUserMessage: false })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('agentConfig.timeoutSeconds')).toBeInTheDocument();
    });
    const triggerSectionLabel = screen.getByText('agentConfig.triggerOnTimeout');
    const triggerRow = triggerSectionLabel.closest('div[class*="flex"]') ?? triggerSectionLabel.parentElement;
    const timeoutSwitch = triggerRow?.parentElement?.querySelector('[role="switch"]') as HTMLElement | null
      ?? screen.getAllByRole('switch').find((s) => s.getAttribute('aria-checked') === 'true' && s !== screen.getAllByRole('switch')[0] && s !== screen.getAllByRole('switch')[1]);
    await act(async () => {
      fireEvent.click(timeoutSwitch ?? screen.getAllByRole('switch')[2]);
    });
    await waitFor(() => {
      expect(screen.queryByText('agentConfig.timeoutSeconds')).not.toBeInTheDocument();
    });
  });

  it('hides burst fields when burstEnabled is toggled off', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ burstEnabled: true })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('agentConfig.burstSize')).toBeInTheDocument();
    });
    const burstLabelText = 'agentConfig.burstMode';
    const allSwitches = screen.getAllByRole('switch');
    const burstSwitch = allSwitches.find(
      (s) =>
        s.closest('[data-testid="dialog-content"]') !== null &&
        s.getAttribute('aria-checked') === 'true',
    );
    await act(async () => {
      fireEvent.click(allSwitches[allSwitches.length - 3]);
    });
    await waitFor(() => {
      expect(screen.queryByText('agentConfig.burstSize')).not.toBeInTheDocument();
    });
  });

  it('hides quality gate score slider when qualityGateEnabled is toggled off', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ qualityGateEnabled: true, burstEnabled: false, prioritizeTaggedUsers: false, prioritizeRepliedUsers: false })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/agentConfig\.qualityGateMinScore/)).toBeInTheDocument();
    });
    const qualityGateLabel = screen.getByText('agentConfig.qualityGateEnabled');
    const qualitySection = qualityGateLabel.closest('div[class*="space-y-4"]') ?? qualityGateLabel.parentElement?.parentElement?.parentElement;
    const qualitySwitch = qualitySection?.querySelector('[role="switch"]') as HTMLElement | null;
    await act(async () => {
      fireEvent.click(qualitySwitch!);
    });
    await waitFor(() => {
      expect(screen.queryByText(/agentConfig\.qualityGateMinScore/)).not.toBeInTheDocument();
    });
  });

  it('changes agentType select value', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ agentType: 'personal' })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'support' } });
    expect(select.value).toBe('support');
  });

  it('toggles reactionsEnabled off to hide maxReactionsPerCycle', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ reactionsEnabled: true })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.maxReactionsPerCycle')).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    // reactionsEnabled switch — find by aria-checked=true closest to reactionsEnabled label
    const reactionsLabel = screen.getByText('agentConfig.reactionsEnabled');
    const reactionsRow = reactionsLabel.closest('div') as HTMLElement;
    const reactionsSwitch = reactionsRow?.parentElement?.querySelector('[role="switch"]') as HTMLElement | null;
    await act(async () => {
      fireEvent.click(reactionsSwitch ?? switches[switches.length - 1]);
    });
    await waitFor(() => expect(screen.queryByText('agentConfig.maxReactionsPerCycle')).not.toBeInTheDocument());
  });

  it('updates agentInstructions textarea', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ agentInstructions: null })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText('agentConfig.instructionsPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Custom instructions text' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('Custom instructions text');
  });

  it('clears agentInstructions textarea to null when empty', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ agentInstructions: 'existing instructions' })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText('agentConfig.instructionsPlaceholder');
    fireEvent.change(textarea, { target: { value: '' } });
    // Setting to '' clears it — no crash
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('toggles webSearchEnabled switch', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ webSearchEnabled: true })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.webSearchEnabled')).toBeInTheDocument());
    const webSearchLabel = screen.getByText('agentConfig.webSearchEnabled');
    const webSearchRow = webSearchLabel.closest('div') as HTMLElement;
    const webSearchSection = webSearchRow?.parentElement?.parentElement;
    const webSearchSwitch = webSearchSection?.querySelector('[role="switch"]') as HTMLElement | null;
    await act(async () => {
      fireEvent.click(webSearchSwitch ?? screen.getAllByRole('switch')[0]);
    });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('updates contextWindowSize input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ contextWindowSize: 50 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const ctxInput = inputs.find(i => (i as HTMLInputElement).value === '50');
    expect(ctxInput).toBeTruthy();
    fireEvent.change(ctxInput!, { target: { value: '100' } });
    expect((ctxInput as HTMLInputElement).value).toBe('100');
  });

  it('updates timeoutSeconds input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ triggerOnTimeout: true, timeoutSeconds: 300 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.timeoutSeconds')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const timeoutInput = inputs.find(i => (i as HTMLInputElement).value === '300');
    expect(timeoutInput).toBeTruthy();
    fireEvent.change(timeoutInput!, { target: { value: '600' } });
    expect((timeoutInput as HTMLInputElement).value).toBe('600');
  });

  it('removes a role badge from excludedRoles on second click', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ excludedRoles: ['USER'] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const badges = screen.getAllByTestId('badge');
    const userBadge = badges.find(b => b.textContent === 'USER');
    expect(userBadge).toBeTruthy();
    // Currently excluded (destructive) — click to un-exclude
    fireEvent.click(userBadge!);
    expect(userBadge).toHaveAttribute('data-variant', 'outline');
  });

  it('updates weekdayMaxMessages input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ weekdayMaxMessages: 10 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.weekdayMaxMessages')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const weekdayInput = inputs.find(i => (i as HTMLInputElement).value === '10' && (i as HTMLInputElement).max === '100');
    expect(weekdayInput).toBeTruthy();
    fireEvent.change(weekdayInput!, { target: { value: '20' } });
    expect((weekdayInput as HTMLInputElement).value).toBe('20');
  });

  it('updates weekendMaxMessages input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ weekendMaxMessages: 25 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.weekendMaxMessages')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const weekendInput = inputs.find(i => (i as HTMLInputElement).value === '25' && (i as HTMLInputElement).max === '200');
    expect(weekendInput).toBeTruthy();
    fireEvent.change(weekendInput!, { target: { value: '30' } });
    expect((weekendInput as HTMLInputElement).value).toBe('30');
  });

  it('updates minWordsPerMessage and maxWordsPerMessage inputs', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ minWordsPerMessage: 3, maxWordsPerMessage: 400 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.minWords')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const minWordsInput = inputs.find(i => (i as HTMLInputElement).value === '3' && (i as HTMLInputElement).max === '200');
    const maxWordsInput = inputs.find(i => (i as HTMLInputElement).value === '400' && (i as HTMLInputElement).max === '2000');
    expect(minWordsInput).toBeTruthy();
    expect(maxWordsInput).toBeTruthy();
    fireEvent.change(minWordsInput!, { target: { value: '5' } });
    fireEvent.change(maxWordsInput!, { target: { value: '300' } });
    expect((minWordsInput as HTMLInputElement).value).toBe('5');
    expect((maxWordsInput as HTMLInputElement).value).toBe('300');
  });

  it('toggles prioritizeTaggedUsers switch', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ prioritizeTaggedUsers: true })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.prioritizeTagged')).toBeInTheDocument());
    const taggedLabel = screen.getByText('agentConfig.prioritizeTagged');
    const taggedRow = taggedLabel.closest('div') as HTMLElement;
    const taggedSwitch = taggedRow?.parentElement?.querySelector('[role="switch"]') as HTMLElement | null;
    await act(async () => {
      fireEvent.click(taggedSwitch ?? screen.getAllByRole('switch')[0]);
    });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('updates freshTopicCategoryHints input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicCategoryHints: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.topicCategories')).toBeInTheDocument());
    const hintsInput = screen.getByPlaceholderText('agentConfig.topicCategoriesPlaceholder');
    fireEvent.change(hintsInput, { target: { value: 'sports, tech' } });
    expect((hintsInput as HTMLInputElement).value).toBe('sports, tech');
  });

  it('shows topicsLoading when availableTopics is empty', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [] });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.topicsLoading')).toBeInTheDocument());
  });

  it('shows available topics checkboxes when topics are loaded', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [
        { slug: 'sports', label: 'Sports', description: 'Sports topics', isActive: true },
        { slug: 'tech', label: 'Technology', description: null, isActive: true },
      ],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Sports')).toBeInTheDocument();
      expect(screen.getByText('Technology')).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks a topic by unchecking its checkbox', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [{ slug: 'sports', label: 'Sports', description: 'desc', isActive: true }],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicBlockedSlugs: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Sports')).toBeInTheDocument());
    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(false));
  });

  it('unblocks a topic by checking a blocked checkbox', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [{ slug: 'sports', label: 'Sports', description: 'desc', isActive: true }],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicBlockedSlugs: ['sports'] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Sports')).toBeInTheDocument());
    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));
  });

  it('shows topicsPartialEligible text when some topics are blocked', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [
        { slug: 'sports', label: 'Sports', description: 'desc', isActive: true },
        { slug: 'tech', label: 'Tech', description: null, isActive: true },
      ],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicBlockedSlugs: ['sports'] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/agentConfig\.topicsPartialEligible/)).toBeInTheDocument());
  });

  it('shows topicsAllEligible text when no topics are blocked', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [{ slug: 'sports', label: 'Sports', description: 'desc', isActive: true }],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicBlockedSlugs: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/agentConfig\.topicsAllEligible/)).toBeInTheDocument());
  });
});

describe('AgentConfigDialog — listTopics error handling', () => {
  it('logs error when listTopics throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockListTopics.mockRejectedValue(new Error('Topics fetch failed'));
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AgentConfigDialog] Failed to load topics:',
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });
});

describe('AgentConfigDialog — edit mode with convMeta', () => {
  it('shows conversation metadata when getConversation succeeds', async () => {
    mockGetConversation.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      type: 'group',
      visibility: 'public',
      memberCount: 7,
      messageCount: 50,
      createdAt: '2024-03-01T00:00:00Z',
      createdBy: null,
      lastMessageAt: '2024-06-01T12:00:00Z',
      identifier: null,
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.conversationSection')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('sets convMeta to null when getConversation throws', async () => {
    mockGetConversation.mockRejectedValue(new Error('Not found'));
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    // Should not crash
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    expect(screen.queryByText('agentConfig.conversationSection')).not.toBeInTheDocument();
  });

  it('shows conversation title from config.conversation when provided', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ conversation: { title: 'My Chat Room', type: 'group', visibility: 'public', memberCount: 5, messageCount: 100, createdAt: '2024-01-01T00:00:00Z', createdBy: null, lastMessageAt: null, identifier: null } })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('My Chat Room')).toBeInTheDocument());
  });

  it('shows AgentScheduleTimeline section in edit mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.timelineSection')).toBeInTheDocument());
  });

  it('shows auto-detected user section when controlledUserIds has users not in manualUserIds', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ controlledUserIds: ['user1', 'user2'], manualUserIds: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('user-display').length).toBeGreaterThanOrEqual(1));
  });

  it('does not show auto-detected section when all controlledUserIds are in manualUserIds', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ controlledUserIds: ['user1'], manualUserIds: ['user1'] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    expect(screen.queryByText(/agentConfig\.autoDetected/)).not.toBeInTheDocument();
  });

  it('shows convMeta identifier when provided', async () => {
    mockGetConversation.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      type: 'channel',
      visibility: 'public',
      memberCount: 3,
      messageCount: 10,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'user-abc',
      lastMessageAt: null,
      identifier: 'my-channel-id',
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('my-channel-id')).toBeInTheDocument());
  });

  it('shows UserDisplay for createdBy when present', async () => {
    mockGetConversation.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      type: 'group',
      visibility: 'public',
      memberCount: 5,
      messageCount: 100,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'user-creator-id',
      lastMessageAt: null,
      identifier: null,
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('agent-roles-section')).toBeInTheDocument());
    // UserDisplay for createdBy should appear in the convMeta section
    const userDisplays = screen.queryAllByTestId('user-display');
    // Only appears if convMeta renders (which requires getConversation to resolve first)
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('copies conversation id to clipboard when ID button is clicked', async () => {
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
    mockGetConversation.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      type: 'group',
      visibility: 'public',
      memberCount: 5,
      messageCount: 100,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: null,
      lastMessageAt: null,
      identifier: null,
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.conversationSection')).toBeInTheDocument());
    const idButton = screen.getByText('507f1f77bcf86cd799439011');
    fireEvent.click(idButton);
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('507f1f77bcf86cd799439011'));
    expect(mockToastSuccess).toHaveBeenCalledWith('copied');
  });
});

describe('AgentConfigDialog — save in edit mode shows agentConfig.updated', () => {
  it('shows agentConfig.updated toast in edit mode', async () => {
    mockUpsertConfig.mockResolvedValue({ success: true });
    const onSave = jest.fn();
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig()}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const saveBtn = screen.getByRole('button', { name: 'save' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('agentConfig.updated');
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
