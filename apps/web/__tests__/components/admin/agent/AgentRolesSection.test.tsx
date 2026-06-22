import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { AgentRoleData, ArchetypeData } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    getRoles: jest.fn(),
    getArchetypes: jest.fn(),
    assignArchetype: jest.fn(),
    unlockRole: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, fallbackOrParams?: string | Record<string, unknown>) => {
      if (typeof fallbackOrParams === 'string') return fallbackOrParams;
      return key;
    },
  }),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({ userId }: { userId: string }) => <span data-testid="user-display">{userId}</span>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    variant?: string; size?: string; className?: string;
  }) => (
    <button data-testid="button" data-variant={variant} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: { value?: number; className?: string }) => (
    <div data-testid="progress" data-value={value} className={className} />
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, disabled, defaultValue }: {
    children?: React.ReactNode;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    defaultValue?: string;
  }) => (
    <div data-testid="select" data-disabled={disabled}>
      <button data-testid="select-trigger" disabled={disabled} onClick={() => onValueChange?.('arch-2')}>
        select
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="select-trigger-inner" className={className}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

jest.mock('lucide-react', () => ({
  Lock: () => <svg data-testid="lock-icon" />,
  Unlock: () => <svg data-testid="unlock-icon" />,
}));

import { AgentRolesSection } from '@/components/admin/agent/AgentRolesSection';

const mockGetRoles = agentAdminService.getRoles as jest.Mock;
const mockGetArchetypes = agentAdminService.getArchetypes as jest.Mock;
const mockAssignArchetype = agentAdminService.assignArchetype as jest.Mock;
const mockUnlockRole = agentAdminService.unlockRole as jest.Mock;

function makeRole(overrides: Partial<AgentRoleData> = {}): AgentRoleData {
  return {
    id: 'role-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    origin: 'observed',
    archetypeId: null,
    personaSummary: 'A helpful user.',
    tone: 'friendly',
    vocabularyLevel: 'simple',
    typicalLength: 'medium',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    topicsAvoided: [],
    catchphrases: [],
    responseTriggers: [],
    silenceTriggers: [],
    relationshipMap: {},
    overrideTone: null,
    overrideVocabularyLevel: null,
    overrideTypicalLength: null,
    overrideEmojiUsage: null,
    messagesAnalyzed: 42,
    confidence: 0.85,
    locked: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeArchetype(id: string, name: string): ArchetypeData {
  return {
    id,
    name,
    personaSummary: 'summary',
    tone: 'amical',
    vocabularyLevel: 'simple',
    typicalLength: 'medium',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    responseTriggers: [],
    silenceTriggers: [],
    catchphrases: [],
    confidence: 0.9,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetArchetypes.mockResolvedValue({ success: true, data: [makeArchetype('arch-1', 'Friendly')] });
});

describe('AgentRolesSection — loading', () => {
  it('shows 3 loading skeletons while fetching', () => {
    mockGetRoles.mockReturnValue(new Promise(() => {}));
    render(<AgentRolesSection conversationId="conv-1" />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
  });
});

describe('AgentRolesSection — empty', () => {
  it('shows empty state when roles array is empty', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() =>
      expect(screen.getByText('No role observed for this conversation')).toBeInTheDocument()
    );
  });

  it('shows empty state when roles data is null', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: null });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() =>
      expect(screen.getByText('No role observed for this conversation')).toBeInTheDocument()
    );
  });
});

describe('AgentRolesSection — roles render', () => {
  it('renders role with UserDisplay and tone', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByTestId('user-display')).toBeInTheDocument());
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('friendly')).toBeInTheDocument();
  });

  it('shows confidence progress bar', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ confidence: 0.85 })] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('progress'));
    expect(screen.getByTestId('progress')).toHaveAttribute('data-value', '85');
  });

  it('shows locked badge when role.locked is true', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: true })] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('Locked')).toBeInTheDocument());
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('does not show locked badge when role.locked is false', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: false })] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('user-display'));
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
  });

  it('shows Unlock button only when role is locked', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: true })] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText('Unlock')).toBeInTheDocument());
    expect(screen.getByTestId('unlock-icon')).toBeInTheDocument();
  });
});

describe('AgentRolesSection — originLabel', () => {
  it.each([
    ['observed', 'Observed'],
    ['archetype', 'Archetype'],
    ['hybrid', 'Hybrid'],
    ['custom', 'custom'],
  ])('translates origin "%s" to "%s"', async (origin, expected) => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ origin })] });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('user-display'));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('AgentRolesSection — non-array data fallback', () => {
  it('falls back to empty roles when rolesRes.data is non-array truthy', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: {} });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() =>
      expect(screen.getByText('No role observed for this conversation')).toBeInTheDocument()
    );
  });

  it('falls back to empty archetypes when archetypesRes.data is non-array truthy', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    mockGetArchetypes.mockResolvedValue({ success: true, data: {} });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('user-display'));
    expect(screen.queryByText('Friendly')).not.toBeInTheDocument();
  });

  it('skips archetypes block when archetypesRes.success is false', async () => {
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    mockGetArchetypes.mockResolvedValue({ success: false });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('user-display'));
    expect(screen.queryByText('Friendly')).not.toBeInTheDocument();
  });
});

describe('AgentRolesSection — map ternary false branch', () => {
  it('covers non-matching role in assign ternary (2 roles, 1 updated)', async () => {
    const { toast } = require('sonner');
    const role1 = makeRole({ id: 'role-1', userId: 'user-1' });
    const role2 = makeRole({ id: 'role-2', userId: 'user-2' });
    const updatedRole1 = makeRole({ id: 'role-1', userId: 'user-1', archetypeId: 'arch-2' });
    mockGetRoles.mockResolvedValue({ success: true, data: [role1, role2] });
    mockAssignArchetype.mockResolvedValue({ success: true, data: updatedRole1 });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => expect(screen.getAllByTestId('user-display')).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId('select-trigger')[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('covers non-matching role in unlock ternary (2 roles, 1 unlocked)', async () => {
    const { toast } = require('sonner');
    const role1 = makeRole({ id: 'role-1', userId: 'user-1', locked: true });
    const role2 = makeRole({ id: 'role-2', userId: 'user-2' });
    const unlockedRole1 = makeRole({ id: 'role-1', userId: 'user-1', locked: false });
    mockGetRoles.mockResolvedValue({ success: true, data: [role1, role2] });
    mockUnlockRole.mockResolvedValue({ success: true, data: unlockedRole1 });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByText('Unlock'));
    fireEvent.click(screen.getByText('Unlock'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});

describe('AgentRolesSection — actions', () => {
  it('calls toast.error on load failure', async () => {
    const { toast } = require('sonner');
    mockGetRoles.mockRejectedValue(new Error('network'));
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('calls assignArchetype and shows toast.success', async () => {
    const { toast } = require('sonner');
    const updatedRole = makeRole({ archetypeId: 'arch-2' });
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    mockAssignArchetype.mockResolvedValue({ success: true, data: updatedRole });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('select-trigger'));
    fireEvent.click(screen.getByTestId('select-trigger'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(mockAssignArchetype).toHaveBeenCalledWith('conv-1', 'user-1', 'arch-2');
  });

  it('calls toast.error when assign fails', async () => {
    const { toast } = require('sonner');
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    mockAssignArchetype.mockRejectedValue(new Error('assign error'));
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('select-trigger'));
    fireEvent.click(screen.getByTestId('select-trigger'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('calls unlockRole and shows toast.success', async () => {
    const { toast } = require('sonner');
    const unlockedRole = makeRole({ locked: false });
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: true })] });
    mockUnlockRole.mockResolvedValue({ success: true, data: unlockedRole });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByText('Unlock'));
    fireEvent.click(screen.getByText('Unlock'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(mockUnlockRole).toHaveBeenCalledWith('conv-1', 'user-1');
  });

  it('calls toast.error when unlock fails', async () => {
    const { toast } = require('sonner');
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: true })] });
    mockUnlockRole.mockRejectedValue(new Error('unlock error'));
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByText('Unlock'));
    fireEvent.click(screen.getByText('Unlock'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('does nothing when assignArchetype returns success=false', async () => {
    const { toast } = require('sonner');
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole()] });
    mockAssignArchetype.mockResolvedValue({ success: false });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByTestId('select-trigger'));
    fireEvent.click(screen.getByTestId('select-trigger'));
    await waitFor(() => expect(mockAssignArchetype).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does nothing when unlockRole returns success=false', async () => {
    const { toast } = require('sonner');
    mockGetRoles.mockResolvedValue({ success: true, data: [makeRole({ locked: true })] });
    mockUnlockRole.mockResolvedValue({ success: false });
    render(<AgentRolesSection conversationId="conv-1" />);
    await waitFor(() => screen.getByText('Unlock'));
    fireEvent.click(screen.getByText('Unlock'));
    await waitFor(() => expect(mockUnlockRole).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
