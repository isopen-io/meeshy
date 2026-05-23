import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationEncryptionSection } from '@/components/conversations/ConversationEncryptionSection';
import { conversationsService } from '@/services/conversations.service';

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getEncryptionStatus: jest.fn(),
    enableEncryption: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) => {
      if (typeof params === 'object' && params) {
        return `${key}::${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('react');
  const stub = (tag: string) =>
    actual.forwardRef(({ children, ...props }: any, ref: any) =>
      actual.createElement(tag, { ref, ...props }, children),
    );
  return {
    motion: new Proxy({}, { get: (_, tag: string) => stub(tag) }),
  };
});

const mockedService = conversationsService as jest.Mocked<typeof conversationsService>;

describe('ConversationEncryptionSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the loading state while fetching status', async () => {
    mockedService.getEncryptionStatus.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    render(<ConversationEncryptionSection conversationId="c-1" canEnable />);

    expect(
      screen.getByText('conversationDetails.encryption.statusLoading'),
    ).toBeInTheDocument();
  });

  it('renders the active state when encryption is already enabled', async () => {
    mockedService.getEncryptionStatus.mockResolvedValue({
      isEncrypted: true,
      mode: 'server',
      enabledAt: '2026-01-15T10:00:00Z',
      enabledBy: 'user-1',
      canTranslate: true,
    });

    render(<ConversationEncryptionSection conversationId="c-1" canEnable />);

    expect(
      await screen.findByText('conversationDetails.encryption.activeLabel'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('conversationDetails.encryption.modes.serverLabel'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('conversationDetails.encryption.immutabilityNotice'),
    ).toBeInTheDocument();
  });

  it('renders the activation form when encryption is off and the user can enable', async () => {
    mockedService.getEncryptionStatus.mockResolvedValue({
      isEncrypted: false,
      mode: null,
      enabledAt: null,
      enabledBy: null,
      canTranslate: true,
    });

    render(<ConversationEncryptionSection conversationId="c-1" canEnable />);

    expect(
      await screen.findByText('conversationDetails.encryption.activate'),
    ).toBeInTheDocument();
  });

  it('hides the activation form and shows the cannot-enable notice when the user cannot enable', async () => {
    mockedService.getEncryptionStatus.mockResolvedValue({
      isEncrypted: false,
      mode: null,
      enabledAt: null,
      enabledBy: null,
      canTranslate: true,
    });

    render(<ConversationEncryptionSection conversationId="c-1" canEnable={false} />);

    expect(
      await screen.findByText('conversationDetails.encryption.cannotEnable'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('conversationDetails.encryption.activate'),
    ).not.toBeInTheDocument();
  });

  it('calls the service with selected mode and flips to active state on success', async () => {
    mockedService.getEncryptionStatus.mockResolvedValue({
      isEncrypted: false,
      mode: null,
      enabledAt: null,
      enabledBy: null,
      canTranslate: true,
    });
    mockedService.enableEncryption.mockResolvedValue({
      conversationId: 'c-1',
      mode: 'server',
      enabledAt: '2026-01-15T10:00:00Z',
      enabledBy: 'user-1',
    });

    render(<ConversationEncryptionSection conversationId="c-1" canEnable />);

    const activateButton = await screen.findByText(
      'conversationDetails.encryption.activate',
    );
    fireEvent.click(activateButton);

    await waitFor(() => {
      expect(mockedService.enableEncryption).toHaveBeenCalledWith('c-1', 'server');
    });

    expect(
      await screen.findByText('conversationDetails.encryption.activeLabel'),
    ).toBeInTheDocument();
  });

  it('does nothing destructive when getEncryptionStatus fails', async () => {
    mockedService.getEncryptionStatus.mockRejectedValue(new Error('boom'));

    const { container } = render(
      <ConversationEncryptionSection conversationId="c-1" canEnable />,
    );

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});
