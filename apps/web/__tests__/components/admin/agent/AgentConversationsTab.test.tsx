import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentConversationsTab } from '@/components/admin/agent/AgentConversationsTab';
import { agentAdminService } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getConfigs: jest.fn(),
    upsertConfig: jest.fn(),
    deleteConfig: jest.fn(),
    triggerScan: jest.fn(),
    stopScan: jest.fn(),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('use-debounce', () => ({
  useDebounce: (v: unknown) => [v],
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/dynamic', () => (loader: () => Promise<unknown>) => {
  loader().catch(() => {});
  return () => null;
});

jest.mock('@/components/admin/agent/AgentConfigDialog', () => ({
  AgentConfigDialog: ({
    open,
    onOpenChange,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    config: unknown;
    onSave: () => void;
  }) =>
    open ? (
      <div data-testid="agent-config-dialog" data-open={String(open)}>
        <button onClick={() => onOpenChange(false)}>close-dialog</button>
        <button onClick={() => onSave()}>save-dialog</button>
      </div>
    ) : null,
}));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({ userId }: { userId: string }) => (
    <span data-testid="user-display" data-userid={userId} />
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: () => void;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onCheckedChange}
      data-testid="switch"
    />
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value: number }) => (
    <div data-testid="progress" data-value={value} />
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    onKeyDown,
    placeholder,
  }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
    />
  ),
}));

function makeConfig(overrides = {}) {
  return {
    id: 'cfg-1',
    conversationId: 'abc123def456ghijklmn0001',
    conversation: { title: 'Test Room', type: 'group' },
    enabled: true,
    isScanning: false,
    currentNode: null,
    triggerOnTimeout: true,
    triggerOnUserMessage: false,
    triggerOnReplyTo: true,
    controlledUserIds: [],
    maxControlledUsers: 5,
    analytics: null,
    ...overrides,
  };
}

function makeSuccessResponse(data: unknown[], total = 0, hasMore = false) {
  return {
    success: true,
    data,
    pagination: { total, hasMore },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
    makeSuccessResponse([], 0, false)
  );
});

describe('AgentConversationsTab', () => {
  describe('Loading state', () => {
    it('renders 5 skeleton elements while loading with no configs', async () => {
      (agentAdminService.getConfigs as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      render(<AgentConversationsTab />);

      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons).toHaveLength(5);
    });
  });

  describe('After loading', () => {
    it('renders config list after data loads', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText('Test Room')).toBeInTheDocument();
      });
    });

    it('renders empty state when no configs after load', async () => {
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([], 0, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.conversationsTab.empty')
        ).toBeInTheDocument();
      });
    });
  });

  describe('conversationLabel', () => {
    it('uses conversation title when available', async () => {
      const config = makeConfig({ conversation: { title: 'My Room', type: 'group' } });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText('My Room')).toBeInTheDocument();
      });
    });

    it('uses sliced conversationId when title is absent', async () => {
      const config = makeConfig({
        conversationId: 'abcd1234xyz99999',
        conversation: { title: null, type: 'group' },
      });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText('abcd1234...')).toBeInTheDocument();
      });
    });
  });

  describe('formatTimeAgo', () => {
    it('returns "-" for null analytics lastResponseAt', async () => {
      const config = makeConfig({ analytics: null });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('returns justNow key for dates less than 1 minute ago', async () => {
      const now = new Date(Date.now() - 30 * 1000).toISOString();
      const config = makeConfig({
        analytics: {
          messagesSent: 0,
          totalWordsSent: 0,
          avgConfidence: 0,
          lastResponseAt: now,
        },
      });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.overview.timeAgo.justNow')
        ).toBeInTheDocument();
      });
    });

    it('returns minutes key for dates between 1 and 59 minutes ago', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const config = makeConfig({
        analytics: {
          messagesSent: 0,
          totalWordsSent: 0,
          avgConfidence: 0,
          lastResponseAt: fiveMinutesAgo,
        },
      });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.overview.timeAgo.minutes')
        ).toBeInTheDocument();
      });
    });

    it('returns hours key for dates between 1 and 23 hours ago', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const config = makeConfig({
        analytics: {
          messagesSent: 0,
          totalWordsSent: 0,
          avgConfidence: 0,
          lastResponseAt: twoHoursAgo,
        },
      });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.overview.timeAgo.hours')
        ).toBeInTheDocument();
      });
    });

    it('returns days key for dates 1 day or more ago', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const config = makeConfig({
        analytics: {
          messagesSent: 0,
          totalWordsSent: 0,
          avgConfidence: 0,
          lastResponseAt: twoDaysAgo,
        },
      });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.overview.timeAgo.days')
        ).toBeInTheDocument();
      });
    });
  });

  describe('handleToggle', () => {
    it('calls upsertConfig with toggled enabled value and shows success toast', async () => {
      const config = makeConfig({ enabled: true });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      (agentAdminService.upsertConfig as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByRole('switch')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('switch'));

      await waitFor(() => {
        expect(agentAdminService.upsertConfig).toHaveBeenCalledWith(
          config.conversationId,
          { enabled: false }
        );
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('optimistically updates local state after toggle', async () => {
      const config = makeConfig({ enabled: true });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      (agentAdminService.upsertConfig as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByRole('switch')).toBeInTheDocument();
      });

      const switchEl = screen.getByRole('switch');
      expect(switchEl).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(switchEl);

      await waitFor(() => {
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      });
    });
  });

  describe('handleDelete', () => {
    it('calls deleteConfig and removes config from state when confirm returns true', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      (agentAdminService.deleteConfig as jest.Mock).mockResolvedValue({
        success: true,
      });
      window.confirm = jest.fn().mockReturnValue(true);

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByLabelText('Delete configuration')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Delete configuration'));

      await waitFor(() => {
        expect(agentAdminService.deleteConfig).toHaveBeenCalledWith(
          config.conversationId
        );
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('does not call deleteConfig when confirm returns false', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      window.confirm = jest.fn().mockReturnValue(false);

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByLabelText('Delete configuration')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Delete configuration'));

      await waitFor(() => {
        expect(agentAdminService.deleteConfig).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleTrigger', () => {
    it('calls triggerScan when config is not scanning', async () => {
      jest.useFakeTimers();
      const config = makeConfig({ isScanning: false });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      (agentAdminService.triggerScan as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText('Play')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Play'));

      await waitFor(() => {
        expect(agentAdminService.triggerScan).toHaveBeenCalledWith(
          config.conversationId
        );
        expect(toast.success).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    it('calls stopScan when config is scanning', async () => {
      jest.useFakeTimers();
      const config = makeConfig({ isScanning: true });
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );
      (agentAdminService.stopScan as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Stop'));

      await waitFor(() => {
        expect(agentAdminService.stopScan).toHaveBeenCalledWith(
          config.conversationId
        );
        expect(toast.success).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });
  });

  describe('handleCreate', () => {
    it('opens dialog with no config when clicking create button', async () => {
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([], 0, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByText('agent.conversationsTab.empty')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByText('agent.conversationsTab.configure')
      );

      expect(screen.getByTestId('agent-config-dialog')).toBeInTheDocument();
    });
  });

  describe('handleEdit', () => {
    it('opens dialog with selected config when clicking edit button', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.getByLabelText('Edit agent configuration')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Edit agent configuration'));

      expect(screen.getByTestId('agent-config-dialog')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('does not show pagination when total is 20 or fewer', async () => {
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([], 20, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(
          screen.queryByText(/Page \d+ sur \d+/)
        ).not.toBeInTheDocument();
      });
    });

    it('shows pagination when total exceeds 20', async () => {
      const configs = Array.from({ length: 20 }, (_, i) =>
        makeConfig({ id: `cfg-${i}`, conversationId: `conv${i}pad000000000000` })
      );
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse(configs, 21, true)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 sur 2/)).toBeInTheDocument();
      });
    });
  });

  describe('Search input', () => {
    it('updates search term when typing in the input', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('search-input'), {
        target: { value: 'hello' },
      });

      expect(screen.getByTestId('search-input')).toHaveValue('hello');
    });

    it('calls fetchConfigs on Enter key press', async () => {
      const config = makeConfig();
      (agentAdminService.getConfigs as jest.Mock).mockResolvedValue(
        makeSuccessResponse([config], 1, false)
      );

      render(<AgentConversationsTab />);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      const callCountBefore = (agentAdminService.getConfigs as jest.Mock).mock
        .calls.length;

      fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });

      await waitFor(() => {
        expect(
          (agentAdminService.getConfigs as jest.Mock).mock.calls.length
        ).toBeGreaterThan(callCountBefore);
      });
    });
  });
});
