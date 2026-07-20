import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { agentAdminService } from '@/services/agent-admin.service';
import type { TopicCatalogItem } from '@/services/agent-admin.service';

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    listTopics: jest.fn(),
    deleteTopic: jest.fn(),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/hooks/admin/use-agent-admin-events', () => ({
  useAgentAdminEvents: jest.fn(),
}));

jest.mock('@/components/admin/agent/AgentTopicEditModal', () => ({
  AgentTopicEditModal: ({ topic, onClose, onSaved }: {
    topic: TopicCatalogItem | null;
    onClose: () => void;
    onSaved: () => void;
  }) => (
    <div data-testid="topic-edit-modal" data-topic-id={topic?.id ?? 'new'}>
      <button data-testid="modal-close" onClick={onClose}>close</button>
      <button data-testid="modal-save" onClick={onSaved}>save</button>
    </div>
  ),
}));

jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => <svg data-testid="loader2-icon" className={className} />,
  Plus: () => <svg data-testid="plus-icon" />,
  RefreshCw: ({ className }: { className?: string }) => <svg data-testid="refreshcw-icon" className={className} />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  EyeOff: () => <svg data-testid="eyeoff-icon" />,
  Trash2: () => <svg data-testid="trash2-icon" />,
}));

import { AgentTopicsTab } from '@/components/admin/agent/AgentTopicsTab';

const mockListTopics = agentAdminService.listTopics as jest.Mock;
const mockDeleteTopic = agentAdminService.deleteTopic as jest.Mock;

function makeTopic(overrides: Partial<TopicCatalogItem> = {}): TopicCatalogItem {
  return {
    id: 'topic-1',
    slug: 'greetings',
    label: 'Greetings',
    description: null,
    keywordPatterns: ['hello', 'hi'],
    instructionTemplate: 'Start with a greeting',
    searchHintTemplate: 'greeting hint',
    examples: [],
    cooldownMinutes: 60,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn().mockReturnValue(true);
  window.alert = jest.fn();
});

describe('AgentTopicsTab — loading', () => {
  it('shows loading spinner while fetching', () => {
    mockListTopics.mockReturnValue(new Promise(() => {}));
    render(<AgentTopicsTab />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });
});

describe('AgentTopicsTab — topics render', () => {
  it('renders topics table with slug and label', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('greetings')).toBeInTheDocument());
    expect(screen.getByText('Greetings')).toBeInTheDocument();
  });

  it('shows cooldown in minutes', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic({ cooldownMinutes: 120 })] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('120 min')).toBeInTheDocument());
  });

  it('shows keyword pattern count', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic({ keywordPatterns: ['a', 'b', 'c'] })] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('shows ✓ for active topic', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic({ isActive: true })] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('✓')).toBeInTheDocument());
  });

  it('shows ✗ for inactive topic', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic({ isActive: false })] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('✗')).toBeInTheDocument());
  });

  it('shows empty state row when no topics', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [] });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('agent.topics.emptyState')).toBeInTheDocument());
  });
});

describe('AgentTopicsTab — error state', () => {
  it('shows error message when listTopics returns success=false', async () => {
    mockListTopics.mockResolvedValue({ success: false, error: 'Server error' });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });

  it('shows error message when listTopics throws', async () => {
    mockListTopics.mockRejectedValue(new Error('Network failure'));
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('Network failure')).toBeInTheDocument());
  });

  it('shows fallback error when error field is absent', async () => {
    mockListTopics.mockResolvedValue({ success: false });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('Erreur chargement')).toBeInTheDocument());
  });
});

describe('AgentTopicsTab — handleDelete (soft)', () => {
  it('calls window.confirm with disable message for soft delete', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: true });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Disable topic'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Désactiver'));
  });

  it('calls deleteTopic with hard=false when soft delete confirmed', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: true });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Disable topic'));
    await waitFor(() => expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1', { hard: false }));
  });

  it('does not call deleteTopic when confirm returns false', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Disable topic'));
    expect(mockDeleteTopic).not.toHaveBeenCalled();
  });
});

describe('AgentTopicsTab — handleDelete (hard)', () => {
  it('calls window.confirm with hard delete message', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: true });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('DÉFINITIVEMENT'));
  });

  it('calls deleteTopic with hard=true when hard delete confirmed', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: true });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    await waitFor(() => expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1', { hard: true }));
  });

  it('calls window.alert on deleteTopic failure', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockRejectedValue(new Error('Delete failed'));
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Delete failed')));
  });
});

describe('AgentTopicsTab — modal', () => {
  it('opens AgentTopicEditModal when "New topic" clicked', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('agent.topics.emptyState'));
    fireEvent.click(screen.getByText('agent.topics.newTopic'));
    expect(screen.getByTestId('topic-edit-modal')).toBeInTheDocument();
  });

  it('opens AgentTopicEditModal with topic data when edit button clicked', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByTestId('pencil-icon'));
    fireEvent.click(screen.getByTestId('pencil-icon'));
    expect(screen.getByTestId('topic-edit-modal')).toHaveAttribute('data-topic-id', 'topic-1');
  });

  it('closes modal and resets creating on close', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('agent.topics.newTopic'));
    fireEvent.click(screen.getByText('agent.topics.newTopic'));
    expect(screen.getByTestId('topic-edit-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('topic-edit-modal')).not.toBeInTheDocument();
  });

  it('closes modal and calls reload on save', async () => {
    mockListTopics
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [makeTopic()] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('agent.topics.newTopic'));
    fireEvent.click(screen.getByText('agent.topics.newTopic'));
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => expect(mockListTopics).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('topic-edit-modal')).not.toBeInTheDocument();
  });
});

describe('AgentTopicsTab — refresh', () => {
  it('calls reload when refresh button clicked', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByText('agent.topics.reload'));
    await waitFor(() => expect(mockListTopics).toHaveBeenCalledTimes(2));
  });
});

describe('AgentTopicsTab — null data fallback', () => {
  it('shows empty state when listTopics returns data=null', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: null });
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('agent.topics.emptyState')).toBeInTheDocument());
  });
});

describe('AgentTopicsTab — reload non-Error catch branch', () => {
  it('shows Erreur inconnue when listTopics rejects with non-Error', async () => {
    mockListTopics.mockRejectedValue('string-error');
    render(<AgentTopicsTab />);
    await waitFor(() => expect(screen.getByText('Erreur inconnue')).toBeInTheDocument());
  });
});

describe('AgentTopicsTab — handleDelete service failure branches', () => {
  it('calls window.alert when deleteTopic returns success=false', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: false, error: 'Server error' });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Server error')));
  });

  it('uses Erreur fallback when deleteTopic returns success=false without error field', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockResolvedValue({ success: false });
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Erreur : Erreur'));
  });

  it('shows Inconnue in alert when deleteTopic rejects with non-Error', async () => {
    mockListTopics.mockResolvedValue({ success: true, data: [makeTopic()] });
    mockDeleteTopic.mockRejectedValue('string-error');
    render(<AgentTopicsTab />);
    await waitFor(() => screen.getByText('greetings'));
    fireEvent.click(screen.getByLabelText('Delete topic'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Erreur : Inconnue'));
  });
});
