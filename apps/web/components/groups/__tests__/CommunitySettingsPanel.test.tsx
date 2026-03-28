import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommunitySettingsPanel } from '../CommunitySettingsPanel';

const mockUseUpdateCommunityMutation = jest.fn();
const mockUseDeleteCommunityMutation = jest.fn();
const mockUseCheckIdentifierQuery = jest.fn();

jest.mock('@/hooks/queries', () => ({
  useUpdateCommunityMutation: () => mockUseUpdateCommunityMutation(),
  useDeleteCommunityMutation: () => mockUseDeleteCommunityMutation(),
  useCheckIdentifierQuery: (...args: unknown[]) => mockUseCheckIdentifierQuery(...args),
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

describe('CommunitySettingsPanel', () => {
  const defaultProps = {
    community: {
      id: 'c1',
      identifier: 'mshy_test-comm',
      name: 'Test Community',
      description: 'A test community',
      isPrivate: false,
      createdBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    onClose: jest.fn(),
    onDeleted: jest.fn(),
    t: (key: string) => key,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUpdateCommunityMutation.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
    });
    mockUseDeleteCommunityMutation.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
    });
    mockUseCheckIdentifierQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
    });
  });

  it('renders with community data', () => {
    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByDisplayValue('Test Community')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A test community')).toBeInTheDocument();
  });

  it('renders name, description, and privacy fields', () => {
    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByLabelText('settings.nameLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('settings.descriptionLabel')).toBeInTheDocument();
  });

  it('enables save button when form is modified', () => {
    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    const nameInput = screen.getByDisplayValue('Test Community');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    const saveButton = screen.getByText('settings.save');
    expect(saveButton).not.toBeDisabled();
  });

  it('calls update mutation on save', async () => {
    const mockMutate = jest.fn().mockResolvedValue({});
    mockUseUpdateCommunityMutation.mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    });

    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    const nameInput = screen.getByDisplayValue('Test Community');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    const saveButton = screen.getByText('settings.save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        id: 'c1',
        data: expect.objectContaining({ name: 'Updated Name' }),
      });
    });
  });

  it('shows delete confirmation section', () => {
    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('settings.dangerZone')).toBeInTheDocument();
    expect(screen.getByText('settings.deleteCommunity')).toBeInTheDocument();
  });

  it('requires confirmation text before enabling delete', () => {
    render(<CommunitySettingsPanel {...defaultProps} />, { wrapper: createWrapper() });

    const deleteButton = screen.getByText('settings.confirmDelete');
    expect(deleteButton).toBeDisabled();
  });
});
