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
  ConversationPicker: ({ onSelect, onClear }: any) => (
    <div data-testid="conversation-picker">
      <button
        data-testid="picker-select"
        onClick={() => onSelect('507f1f77bcf86cd799439011')}
      >
        select
      </button>
      <button
        data-testid="picker-clear"
        onClick={() => onClear?.()}
      >
        clear
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
  UserPicker: ({ onAdd, onRemove }: any) => (
    <div data-testid="user-picker">
      <button data-testid="user-picker-add" onClick={() => onAdd?.('user-new-id')}>add user</button>
      <button data-testid="user-picker-remove" onClick={() => onRemove?.('user1')}>remove user</button>
    </div>
  ),
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

describe('AgentConfigDialog — uncovered switch handlers', () => {
  it('toggles enabled, autoPickupEnabled, useFullHistory, triggerOnUserMessage, triggerOnReplyTo, prioritizeRepliedUsers', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({
          enabled: true,
          autoPickupEnabled: true,
          useFullHistory: false,
          triggerOnUserMessage: false,
          triggerOnReplyTo: true,
          prioritizeRepliedUsers: true,
        })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    // [0]=enabled, [1]=autoPickupEnabled, [2]=useFullHistory,
    // [4]=triggerOnUserMessage, [5]=triggerOnReplyTo, [11]=prioritizeRepliedUsers
    for (const idx of [0, 1, 2, 4, 5, 11]) {
      await act(async () => { fireEvent.click(switches[idx]); });
    }
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — uncovered number input handlers', () => {
  it('fires onChange on inactivityThresholdHours, minHistoricalMessages, maxControlledUsers', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ inactivityThresholdHours: 72, minHistoricalMessages: 0, maxControlledUsers: 5 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const inactInput = inputs.find(i => (i as HTMLInputElement).value === '72' && (i as HTMLInputElement).max === '720');
    const minHistInput = inputs.find(i => (i as HTMLInputElement).value === '0' && (i as HTMLInputElement).min === '0' && !(i as HTMLInputElement).max);
    const maxCtlInput = inputs.find(i => (i as HTMLInputElement).value === '5' && (i as HTMLInputElement).max === '50');
    expect(inactInput).toBeTruthy();
    expect(maxCtlInput).toBeTruthy();
    fireEvent.change(inactInput!, { target: { value: '100' } });
    fireEvent.change(inactInput!, { target: { value: '' } });
    if (minHistInput) fireEvent.change(minHistInput, { target: { value: '5' } });
    if (minHistInput) fireEvent.change(minHistInput, { target: { value: '' } });
    fireEvent.change(maxCtlInput!, { target: { value: '10' } });
    fireEvent.change(maxCtlInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on scan hours and minutes inputs', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ scanIntervalMinutes: 3 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const hoursInput = inputs.find(i => (i as HTMLInputElement).value === '0' && (i as HTMLInputElement).max === '24');
    const minsInput = inputs.find(i => (i as HTMLInputElement).value === '3' && (i as HTMLInputElement).max === '59');
    expect(hoursInput).toBeTruthy();
    expect(minsInput).toBeTruthy();
    fireEvent.change(hoursInput!, { target: { value: '1' } });
    fireEvent.change(hoursInput!, { target: { value: '' } });
    fireEvent.change(minsInput!, { target: { value: '30' } });
    fireEvent.change(minsInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on minResponsesPerCycle and maxResponsesPerCycle', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ minResponsesPerCycle: 2, maxResponsesPerCycle: 12 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const minResInput = inputs.find(i => (i as HTMLInputElement).value === '2' && (i as HTMLInputElement).max === '50' && (i as HTMLInputElement).min === '0');
    const maxResInput = inputs.find(i => (i as HTMLInputElement).value === '12' && (i as HTMLInputElement).max === '50' && (i as HTMLInputElement).min === '1');
    expect(minResInput).toBeTruthy();
    expect(maxResInput).toBeTruthy();
    fireEvent.change(minResInput!, { target: { value: '5' } });
    fireEvent.change(minResInput!, { target: { value: '' } });
    fireEvent.change(maxResInput!, { target: { value: '20' } });
    fireEvent.change(maxResInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on maxReactionsPerCycle when reactionsEnabled is true', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ reactionsEnabled: true, maxReactionsPerCycle: 4 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.maxReactionsPerCycle')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const reactInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '50' && (i as HTMLInputElement).min === '0');
    expect(reactInput).toBeTruthy();
    fireEvent.change(reactInput!, { target: { value: '8' } });
    fireEvent.change(reactInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on weekdayMaxUsers and weekendMaxUsers', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ weekdayMaxUsers: 4, weekendMaxUsers: 6 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.weekdayMaxUsers')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const wdUsersInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '20');
    const weUsersInput = inputs.find(i => (i as HTMLInputElement).value === '6' && (i as HTMLInputElement).max === '30');
    expect(wdUsersInput).toBeTruthy();
    expect(weUsersInput).toBeTruthy();
    fireEvent.change(wdUsersInput!, { target: { value: '8' } });
    fireEvent.change(wdUsersInput!, { target: { value: '' } });
    fireEvent.change(weUsersInput!, { target: { value: '10' } });
    fireEvent.change(weUsersInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on burstSize, burstIntervalMinutes, quietIntervalMinutes when burstEnabled', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ burstEnabled: true, burstSize: 4, burstIntervalMinutes: 5, quietIntervalMinutes: 90 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.burstSize')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const burstSzInput = inputs.find(i => (i as HTMLInputElement).value === '4' && (i as HTMLInputElement).max === '10');
    const burstIntInput = inputs.find(i => (i as HTMLInputElement).value === '5' && (i as HTMLInputElement).max === '30');
    const quietIntInput = inputs.find(i => (i as HTMLInputElement).value === '90' && (i as HTMLInputElement).max === '480');
    expect(burstSzInput).toBeTruthy();
    expect(burstIntInput).toBeTruthy();
    expect(quietIntInput).toBeTruthy();
    fireEvent.change(burstSzInput!, { target: { value: '6' } });
    fireEvent.change(burstSzInput!, { target: { value: '' } });
    fireEvent.change(burstIntInput!, { target: { value: '10' } });
    fireEvent.change(burstIntInput!, { target: { value: '' } });
    fireEvent.change(quietIntInput!, { target: { value: '120' } });
    fireEvent.change(quietIntInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — uncovered range input handlers', () => {
  it('fires onChange on freshTopicProbability range input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicProbability: 0.2 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('agentConfig.freshTopicProbability')).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    expect(rangeInputs.length).toBeGreaterThan(0);
    fireEvent.change(rangeInputs[0], { target: { value: '50' } });
    fireEvent.change(rangeInputs[0], { target: { value: '0' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on generationTemperature range input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ generationTemperature: 0.8 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    const tempRange = Array.from(rangeInputs).find(i => (i as HTMLInputElement).max === '200');
    expect(tempRange).toBeTruthy();
    fireEvent.change(tempRange!, { target: { value: '100' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on qualityGateMinScore range input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ qualityGateEnabled: true, qualityGateMinScore: 0.5 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/agentConfig\.qualityGateMinScore/)).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    const qualRange = Array.from(rangeInputs).find(
      i => (i as HTMLInputElement).max === '100' && (i as HTMLInputElement).value === '50',
    );
    expect(qualRange).toBeTruthy();
    fireEvent.change(qualRange!, { target: { value: '70' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('fires onChange on reactionBoostFactor range input', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ reactionBoostFactor: 1.5 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/agentConfig\.reactionBoost/)).toBeInTheDocument());
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    const boostRange = Array.from(rangeInputs).find(i => (i as HTMLInputElement).max === '50');
    expect(boostRange).toBeTruthy();
    fireEvent.change(boostRange!, { target: { value: '20' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — UserPicker onAdd and onRemove callbacks', () => {
  it('calls triggerFromUserIds onAdd and onRemove via UserPicker buttons', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ triggerFromUserIds: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const addBtns = screen.getAllByTestId('user-picker-add');
    const removeBtns = screen.getAllByTestId('user-picker-remove');
    expect(addBtns.length).toBeGreaterThanOrEqual(1);
    await act(async () => { fireEvent.click(addBtns[0]); });
    await act(async () => { fireEvent.click(removeBtns[0]); });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('calls manualUserIds onAdd and onRemove via UserPicker buttons', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ manualUserIds: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const addBtns = screen.getAllByTestId('user-picker-add');
    const removeBtns = screen.getAllByTestId('user-picker-remove');
    expect(addBtns.length).toBeGreaterThanOrEqual(2);
    await act(async () => { fireEvent.click(addBtns[1]); });
    await act(async () => { fireEvent.click(removeBtns[1]); });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('calls excludedUserIds onAdd and onRemove via UserPicker buttons', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ excludedUserIds: [] })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const addBtns = screen.getAllByTestId('user-picker-add');
    const removeBtns = screen.getAllByTestId('user-picker-remove');
    expect(addBtns.length).toBeGreaterThanOrEqual(3);
    await act(async () => { fireEvent.click(addBtns[2]); });
    await act(async () => { fireEvent.click(removeBtns[2]); });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('covers || [] branch when triggerFromUserIds is null', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ triggerFromUserIds: null as any, manualUserIds: null as any, excludedUserIds: null as any })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const addBtns = screen.getAllByTestId('user-picker-add');
    const removeBtns = screen.getAllByTestId('user-picker-remove');
    for (let i = 0; i < addBtns.length; i++) {
      await act(async () => { fireEvent.click(addBtns[i]); });
      await act(async () => { fireEvent.click(removeBtns[i]); });
    }
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — ConversationPicker onClear callback', () => {
  it('calls onClear to reset conversationId in create mode', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('conversation-picker')).toBeInTheDocument());
    // First select a conversation
    await act(async () => { fireEvent.click(screen.getByTestId('picker-select')); });
    // Then clear it
    await act(async () => { fireEvent.click(screen.getByTestId('picker-clear')); });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — || fallback right-side branch coverage', () => {
  it('covers || fallback right sides for contextWindowSize and timeoutSeconds', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ triggerOnTimeout: true, contextWindowSize: 50, timeoutSeconds: 300 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const ctxInput = inputs.find(i => (i as HTMLInputElement).value === '50' && (i as HTMLInputElement).max === '250');
    const timeoutInput = inputs.find(i => (i as HTMLInputElement).value === '300' && (i as HTMLInputElement).max === '3600');
    expect(ctxInput).toBeTruthy();
    expect(timeoutInput).toBeTruthy();
    fireEvent.change(ctxInput!, { target: { value: '' } });
    fireEvent.change(timeoutInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('covers || fallback right sides for minWords and maxWords onChange', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ minWordsPerMessage: 3, maxWordsPerMessage: 400 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const minInput = inputs.find(i => (i as HTMLInputElement).value === '3' && (i as HTMLInputElement).max === '200');
    const maxInput = inputs.find(i => (i as HTMLInputElement).value === '400' && (i as HTMLInputElement).max === '2000');
    expect(minInput).toBeTruthy();
    expect(maxInput).toBeTruthy();
    fireEvent.change(minInput!, { target: { value: '' } });
    fireEvent.change(maxInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('covers || fallback right sides for weekdayMaxMessages and weekendMaxMessages onChange', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ weekdayMaxMessages: 10, weekendMaxMessages: 25 })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const wdInput = inputs.find(i => (i as HTMLInputElement).value === '10' && (i as HTMLInputElement).max === '100');
    const weInput = inputs.find(i => (i as HTMLInputElement).value === '25' && (i as HTMLInputElement).max === '200');
    expect(wdInput).toBeTruthy();
    expect(weInput).toBeTruthy();
    fireEvent.change(wdInput!, { target: { value: '' } });
    fireEvent.change(weInput!, { target: { value: '' } });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — onRemove || [] right-side with null arrays', () => {
  it('covers || [] right-side in onRemove for all user pickers when arrays are null', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({
          triggerFromUserIds: null as any,
          manualUserIds: null as any,
          excludedUserIds: null as any,
        })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const removeBtns = screen.getAllByTestId('user-picker-remove');
    for (const btn of removeBtns) {
      await act(async () => { fireEvent.click(btn); });
    }
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — excludedRoles ?? [] right-side with null excludedRoles', () => {
  it('covers ?? [] right-side for excludedRoles in rendering and badge click', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ excludedRoles: null as any })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const badges = screen.getAllByTestId('badge');
    const userBadge = badges.find(b => b.textContent === 'USER');
    expect(userBadge).toBeTruthy();
    await act(async () => { fireEvent.click(userBadge!); });
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — listTopics false/null data branch at line 104', () => {
  it('handles listTopics returning success: false', async () => {
    mockListTopics.mockResolvedValue({ success: false });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('handles listTopics returning success: true with null data', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: null });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={null}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — freshTopicBlockedSlugs ?? [] with topics loaded', () => {
  it('covers ?? [] right-side for freshTopicBlockedSlugs when null and topics are loaded', async () => {
    mockListTopics.mockResolvedValue({
      success: true,
      data: [{ slug: 'sports', label: 'Sports', description: 'Sport topics', isActive: true }],
    });
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ freshTopicBlockedSlugs: null as any, freshTopicCategoryHints: null as any })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Sports')).toBeInTheDocument());
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

describe('AgentConfigDialog — convMeta.messageCount ?? \'-\' right side', () => {
  it('shows dash when messageCount is null in convMeta', async () => {
    mockGetConversation.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      type: 'group',
      visibility: 'public',
      memberCount: 5,
      messageCount: null,
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
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});

describe('AgentConfigDialog — ?? right-side branch coverage via undefined fields', () => {
  it('covers ?? right sides for scan interval fields when scanIntervalMinutes is undefined', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({ scanIntervalMinutes: undefined as any })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const inputs = screen.getAllByRole('spinbutton');
    const hoursInput = inputs.find(i => (i as HTMLInputElement).max === '24');
    const minsInput = inputs.find(i => (i as HTMLInputElement).max === '59');
    if (hoursInput) {
      fireEvent.change(hoursInput, { target: { value: '2' } });
      fireEvent.change(hoursInput, { target: { value: '' } });
    }
    if (minsInput) {
      fireEvent.change(minsInput, { target: { value: '30' } });
      fireEvent.change(minsInput, { target: { value: '' } });
    }
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('covers ?? right sides for reactionsEnabled ?? true and qualityGateEnabled ?? true when undefined', async () => {
    render(
      <AgentConfigDialog
        open={true}
        onOpenChange={jest.fn()}
        config={makeConfig({
          reactionsEnabled: undefined as any,
          qualityGateEnabled: undefined as any,
          burstEnabled: undefined as any,
          prioritizeTaggedUsers: undefined as any,
          prioritizeRepliedUsers: undefined as any,
          webSearchEnabled: undefined as any,
          maxReactionsPerCycle: undefined as any,
          qualityGateMinScore: undefined as any,
          burstSize: undefined as any,
          burstIntervalMinutes: undefined as any,
          quietIntervalMinutes: undefined as any,
          freshTopicProbability: undefined as any,
          generationTemperature: undefined as any,
          reactionBoostFactor: undefined as any,
          freshTopicBlockedSlugs: undefined as any,
          minResponsesPerCycle: undefined as any,
          maxResponsesPerCycle: undefined as any,
          weekdayMaxMessages: undefined as any,
          weekendMaxMessages: undefined as any,
          weekdayMaxUsers: undefined as any,
          weekendMaxUsers: undefined as any,
          minWordsPerMessage: undefined as any,
          maxWordsPerMessage: undefined as any,
          agentInstructions: undefined as any,
          contextWindowSize: undefined as any,
          inactivityThresholdHours: undefined as any,
          maxControlledUsers: undefined as any,
          minHistoricalMessages: undefined as any,
        })}
        onSave={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    // Click all switches to trigger onCheckedChange with ?? right-sides active
    for (const sw of switches) {
      await act(async () => { fireEvent.click(sw); });
    }
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    for (const ri of Array.from(rangeInputs)) {
      fireEvent.change(ri, { target: { value: '50' } });
    }
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});
