import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentTopicRegexTester } from '@/components/admin/agent/AgentTopicRegexTester';
import { agentAdminService } from '@/services/agent-admin.service';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/services/agent-admin.service', () => ({
  agentAdminService: {
    testTopicRegex: jest.fn(),
  },
}));

const mockTestTopicRegex = agentAdminService.testTopicRegex as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function typeText(text: string) {
  fireEvent.change(screen.getByPlaceholderText('regexTester.placeholder'), {
    target: { value: text },
  });
}

describe('AgentTopicRegexTester — structure', () => {
  it('renders title', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    expect(screen.getByText('regexTester.title')).toBeInTheDocument();
  });

  it('renders FlaskConical icon', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    expect(screen.getByTestId('flaskconical-icon')).toBeInTheDocument();
  });

  it('renders textarea with placeholder', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    expect(screen.getByPlaceholderText('regexTester.placeholder')).toBeInTheDocument();
  });

  it('button is disabled when textarea is empty', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button is enabled when textarea has non-whitespace text', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello world');
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('button is disabled for whitespace-only text', () => {
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('   ');
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('AgentTopicRegexTester — handleTest', () => {
  it('calls testTopicRegex with topicId and sampleText', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: true, data: { matches: {} } });
    render(<AgentTopicRegexTester topicId="topic-42" />);
    typeText('hello world');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(mockTestTopicRegex).toHaveBeenCalledWith('topic-42', 'hello world')
    );
  });

  it('shows noPatterns message when matches is empty object', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: true, data: { matches: {} } });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByText('regexTester.noPatterns')).toBeInTheDocument()
    );
  });

  it('shows match entries when matches is non-empty', async () => {
    mockTestTopicRegex.mockResolvedValue({
      success: true,
      data: { matches: { 'hello+': 3 } },
    });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('hello+')).toBeInTheDocument());
  });

  it('shows error message when res.success is false with error string', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: false, error: 'Server error' });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });

  it('shows "Erreur" fallback when res.error is null/undefined', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: false, error: undefined });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Erreur')).toBeInTheDocument());
  });

  it('shows Error message when an Error is thrown', async () => {
    mockTestTopicRegex.mockRejectedValue(new Error('Network failure'));
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Network failure')).toBeInTheDocument());
  });

  it('shows "Erreur inconnue" when a non-Error is thrown', async () => {
    mockTestTopicRegex.mockRejectedValue('string error');
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('hello');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Erreur inconnue')).toBeInTheDocument());
  });

  it('uses res.data.matches from response data', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: true, data: { matches: { pat: 2 } } });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('test');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('pat')).toBeInTheDocument());
  });

  it('falls back to empty object when data.matches is absent', async () => {
    mockTestTopicRegex.mockResolvedValue({ success: true, data: {} });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('test');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByText('regexTester.noPatterns')).toBeInTheDocument()
    );
  });
});

describe('AgentTopicRegexTester — match count display', () => {
  async function renderWithMatches(matches: Record<string, number>) {
    mockTestTopicRegex.mockResolvedValue({ success: true, data: { matches } });
    render(<AgentTopicRegexTester topicId="t1" />);
    typeText('test');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.queryByTestId('loader2-icon')).not.toBeInTheDocument());
  }

  it('shows count > 0 with emerald class', async () => {
    await renderWithMatches({ 'pat': 5 });
    const countEl = screen.getByText('5 regexTester.matches');
    expect(countEl).toHaveClass('text-emerald-600');
  });

  it('shows count === 0 with slate class', async () => {
    await renderWithMatches({ 'pat': 0 });
    const countEl = screen.getByText('0 regexTester.matches');
    expect(countEl).toHaveClass('text-slate-400');
  });

  it('shows singular "match" when count === 1', async () => {
    await renderWithMatches({ 'pat': 1 });
    expect(screen.getByText('1 regexTester.match')).toBeInTheDocument();
  });

  it('shows plural "matches" when count === 2', async () => {
    await renderWithMatches({ 'pat': 2 });
    expect(screen.getByText('2 regexTester.matches')).toBeInTheDocument();
  });

  it('shows "invalidRegex" for count < 0', async () => {
    await renderWithMatches({ 'bad[': -1 });
    expect(screen.getByText('regexTester.invalidRegex')).toBeInTheDocument();
  });
});
