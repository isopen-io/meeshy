import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommunityPreferencesMenu } from '../CommunityPreferencesMenu';

const mockUseCommunityPreferencesQuery = jest.fn();
const mockUseUpdateCommunityPreferencesMutation = jest.fn();

jest.mock('@/hooks/queries', () => ({
  useCommunityPreferencesQuery: (...args: unknown[]) => mockUseCommunityPreferencesQuery(...args),
  useUpdateCommunityPreferencesMutation: () => mockUseUpdateCommunityPreferencesMutation(),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('CommunityPreferencesMenu', () => {
  const defaultProps = {
    communityId: 'c1',
    t: (key: string) => key,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUpdateCommunityPreferencesMutation.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
    });
  });

  it('renders preference toggles', () => {
    mockUseCommunityPreferencesQuery.mockReturnValue({
      data: { isPinned: false, isMuted: false, isArchived: false, notificationLevel: 'all' },
      isLoading: false,
    });

    render(<CommunityPreferencesMenu {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('preferences.pin')).toBeInTheDocument();
    expect(screen.getByText('preferences.mute')).toBeInTheDocument();
    expect(screen.getByText('preferences.archive')).toBeInTheDocument();
  });

  it('shows active state for pinned community', () => {
    mockUseCommunityPreferencesQuery.mockReturnValue({
      data: { isPinned: true, isMuted: false, isArchived: false, notificationLevel: 'all' },
      isLoading: false,
    });

    render(<CommunityPreferencesMenu {...defaultProps} />, { wrapper: createWrapper() });

    const pinButton = screen.getByText('preferences.pin').closest('button');
    expect(pinButton).toHaveClass('bg-primary/10');
  });

  it('calls update mutation when toggling pin', async () => {
    const mockMutate = jest.fn().mockResolvedValue({});
    mockUseUpdateCommunityPreferencesMutation.mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    });
    mockUseCommunityPreferencesQuery.mockReturnValue({
      data: { isPinned: false, isMuted: false, isArchived: false, notificationLevel: 'all' },
      isLoading: false,
    });

    render(<CommunityPreferencesMenu {...defaultProps} />, { wrapper: createWrapper() });

    const pinButton = screen.getByText('preferences.pin').closest('button');
    fireEvent.click(pinButton!);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        communityId: 'c1',
        data: { isPinned: true },
      });
    });
  });

  it('renders notification level selector', () => {
    mockUseCommunityPreferencesQuery.mockReturnValue({
      data: { isPinned: false, isMuted: false, isArchived: false, notificationLevel: 'all' },
      isLoading: false,
    });

    render(<CommunityPreferencesMenu {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('preferences.notifications')).toBeInTheDocument();
  });

  it('renders default state when no preferences exist', () => {
    mockUseCommunityPreferencesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<CommunityPreferencesMenu {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('preferences.pin')).toBeInTheDocument();
  });
});
