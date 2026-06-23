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
});
