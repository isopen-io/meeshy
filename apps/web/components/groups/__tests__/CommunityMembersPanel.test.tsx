import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommunityMember } from '@meeshy/shared/types';
import { CommunityMembersPanel } from '../CommunityMembersPanel';

const mockUseCommunityMembersQuery = jest.fn();
const mockUseRemoveMemberMutation = jest.fn();
const mockUseUpdateMemberRoleMutation = jest.fn();

jest.mock('@/hooks/queries', () => ({
  useCommunityMembersQuery: (...args: unknown[]) => mockUseCommunityMembersQuery(...args),
  useRemoveMemberMutation: () => mockUseRemoveMemberMutation(),
  useUpdateMemberRoleMutation: () => mockUseUpdateMemberRoleMutation(),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

function makeMember(overrides: Partial<CommunityMember> & { id: string }): CommunityMember {
  return {
    communityId: 'c1',
    userId: 'u1',
    role: 'member' as never,
    joinedAt: new Date(),
    user: { id: 'u1', username: 'testuser', displayName: 'Test User' },
    ...overrides,
  } as CommunityMember;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('CommunityMembersPanel', () => {
  const defaultProps = {
    communityId: 'c1',
    currentUserId: 'current-user',
    currentUserRole: 'admin' as const,
    t: (key: string) => key,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRemoveMemberMutation.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    mockUseUpdateMemberRoleMutation.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  });

  it('renders loading skeleton when data is loading', () => {
    mockUseCommunityMembersQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByText('members.title')).toBeInTheDocument();
  });

  it('renders members list when data is loaded', () => {
    const members = [
      makeMember({ id: 'm1', userId: 'u1', user: { id: 'u1', username: 'alice', displayName: 'Alice' } }),
      makeMember({ id: 'm2', userId: 'u2', role: 'moderator' as never, user: { id: 'u2', username: 'bob', displayName: 'Bob' } }),
    ];

    mockUseCommunityMembersQuery.mockReturnValue({
      data: members,
      isLoading: false,
    });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows role badges for members', () => {
    const members = [
      makeMember({ id: 'm1', role: 'admin' as never, user: { id: 'u1', username: 'admin1', displayName: 'Admin User' } }),
      makeMember({ id: 'm2', role: 'member' as never, user: { id: 'u2', username: 'member1', displayName: 'Regular User' } }),
    ];

    mockUseCommunityMembersQuery.mockReturnValue({ data: members, isLoading: false });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
  });

  it('shows member count', () => {
    const members = [
      makeMember({ id: 'm1' }),
      makeMember({ id: 'm2', userId: 'u2' }),
    ];

    mockUseCommunityMembersQuery.mockReturnValue({ data: members, isLoading: false });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders empty state when no members', () => {
    mockUseCommunityMembersQuery.mockReturnValue({ data: [], isLoading: false });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('members.empty')).toBeInTheDocument();
  });

  it('filters members by search query', () => {
    const members = [
      makeMember({ id: 'm1', user: { id: 'u1', username: 'alice', displayName: 'Alice Wonder' } }),
      makeMember({ id: 'm2', userId: 'u2', user: { id: 'u2', username: 'bob', displayName: 'Bob Smith' } }),
    ];

    mockUseCommunityMembersQuery.mockReturnValue({ data: members, isLoading: false });

    render(<CommunityMembersPanel {...defaultProps} />, { wrapper: createWrapper() });

    const searchInput = screen.getByPlaceholderText('members.searchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('Alice Wonder')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('hides admin actions for non-admin users', () => {
    const members = [
      makeMember({ id: 'm1', user: { id: 'u1', username: 'alice', displayName: 'Alice' } }),
    ];

    mockUseCommunityMembersQuery.mockReturnValue({ data: members, isLoading: false });

    render(
      <CommunityMembersPanel {...defaultProps} currentUserRole="member" />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByLabelText('members.removeAction')).not.toBeInTheDocument();
  });
});
