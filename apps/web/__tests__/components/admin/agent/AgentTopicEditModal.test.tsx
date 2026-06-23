import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AgentTopicEditModal } from '@/components/admin/agent/AgentTopicEditModal';
import { agentAdminService } from '@/services/agent-admin.service';
import { toast } from 'sonner';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    createTopic: jest.fn(),
    updateTopic: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/hooks/use-accessibility', () => ({
  useFocusTrap: jest.fn().mockReturnValue(null),
}));

jest.mock('@/components/admin/agent/AgentTopicRegexTester', () => ({
  AgentTopicRegexTester: () => <div data-testid="regex-tester" />,
}));

const mockCreateTopic = agentAdminService.createTopic as jest.Mock;
const mockUpdateTopic = agentAdminService.updateTopic as jest.Mock;
const mockToastSuccess = toast.success as jest.Mock;
const mockToastError = toast.error as jest.Mock;

function makeTopic(overrides = {}) {
  return {
    id: 'topic-1',
    slug: 'astronomy',
    label: 'Astronomy',
    description: 'Space topics',
    keywordPatterns: ['\\bastronomy\\b', '\\bspace\\b'],
    instructionTemplate: 'You are an astronomy expert with deep knowledge of celestial bodies.',
    searchHintTemplate: 'astronomy news',
    examples: [],
    cooldownMinutes: 60,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AgentTopicEditModal — create mode (topic=null)', () => {
  it('renders modal title for new topic', () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(screen.getByText('agent.topicEditModal.titleNew')).toBeInTheDocument();
  });

  it('renders slug input as enabled in create mode', () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    const slugInput = screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug');
    expect(slugInput).not.toBeDisabled();
  });

  it('does not show regex tester in create mode', () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(screen.queryByTestId('regex-tester')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = jest.fn();
    render(
      <AgentTopicEditModal topic={null} onClose={onClose} onSaved={jest.fn()} />,
    );
    fireEvent.click(screen.getByText('agent.topicEditModal.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows validation error when slug is invalid', async () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'Invalid Slug!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(screen.getByText('agent.topicEditModal.errorSlugFormat')).toBeInTheDocument();
  });

  it('shows validation error when keywordPatterns is empty', async () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'valid-slug' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(screen.getByText('agent.topicEditModal.errorNoPatterns')).toBeInTheDocument();
  });

  it('shows validation error when instructionTemplate is too short', async () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'valid-slug' },
    });
    const textareas = screen.getAllByRole('textbox');
    const patternsTextarea = textareas[3];
    fireEvent.change(patternsTextarea, { target: { value: '\\btest\\b' } });
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderInstruction'), {
      target: { value: 'too short' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(screen.getByText('agent.topicEditModal.errorTemplateTooShort')).toBeInTheDocument();
  });

  it('shows validation error for invalid regex pattern', async () => {
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'valid-slug' },
    });
    const textareas = screen.getAllByRole('textbox');
    const patternsTextarea = textareas[3];
    fireEvent.change(patternsTextarea, { target: { value: '[invalid-regex' } });
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderInstruction'), {
      target: { value: 'This is a valid instruction template longer than 20 chars' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(screen.getByText(/agent\.topicEditModal\.errorInvalidRegex/)).toBeInTheDocument();
  });

  it('calls createTopic with form data on valid submission', async () => {
    mockCreateTopic.mockResolvedValue({ success: true });
    const onSaved = jest.fn();
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={onSaved} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'valid-slug' },
    });
    const textareas = screen.getAllByRole('textbox');
    const patternsTextarea = textareas[3];
    fireEvent.change(patternsTextarea, { target: { value: '\\btest\\b' } });
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderInstruction'), {
      target: { value: 'This is a valid instruction template with enough characters.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(mockCreateTopic).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('shows error when createTopic returns success=false', async () => {
    mockCreateTopic.mockResolvedValue({ success: false, error: 'Server error' });
    render(
      <AgentTopicEditModal topic={null} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderSlug'), {
      target: { value: 'valid-slug' },
    });
    const textareas = screen.getAllByRole('textbox');
    const patternsTextarea = textareas[3];
    fireEvent.change(patternsTextarea, { target: { value: '\\btest\\b' } });
    fireEvent.change(screen.getByPlaceholderText('agent.topicEditModal.placeholderInstruction'), {
      target: { value: 'This is a valid instruction template with enough characters.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('closes modal on Escape key when not saving', async () => {
    const onClose = jest.fn();
    render(
      <AgentTopicEditModal topic={null} onClose={onClose} onSaved={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AgentTopicEditModal — edit mode (topic provided)', () => {
  it('renders edit title with topic label', () => {
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(
      screen.getByText('agent.topicEditModal.titleEdit'),
    ).toBeInTheDocument();
  });

  it('renders slug input as disabled in edit mode', () => {
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    const slugInput = screen.getByDisplayValue('astronomy');
    expect(slugInput).toBeDisabled();
  });

  it('shows regex tester in edit mode', () => {
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(screen.getByTestId('regex-tester')).toBeInTheDocument();
  });

  it('pre-fills form fields from topic', () => {
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(screen.getByDisplayValue('Astronomy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('You are an astronomy expert with deep knowledge of celestial bodies.')).toBeInTheDocument();
  });

  it('calls updateTopic on valid save in edit mode', async () => {
    mockUpdateTopic.mockResolvedValue({ success: true });
    const onSaved = jest.fn();
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={jest.fn()} onSaved={onSaved} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    });
    expect(mockUpdateTopic).toHaveBeenCalledWith('topic-1', expect.any(Object));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when saving', async () => {
    mockUpdateTopic.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();
    render(
      <AgentTopicEditModal topic={makeTopic()} onClose={onClose} onSaved={jest.fn()} />,
    );
    fireEvent.click(screen.getByText('agent.topicEditModal.save'));
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
