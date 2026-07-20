import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UserDisplay } from '@/components/admin/agent/UserDisplay';
import { usersService } from '@/services/users.service';

jest.mock('@/services/users.service', () => ({
  usersService: {
    getUserProfile: jest.fn(),
    getDisplayName: jest.fn((user: { displayName?: string; username?: string }) =>
      user.displayName ?? user.username ?? 'Unknown'
    ),
  },
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

const mockGetUserProfile = usersService.getUserProfile as jest.Mock;

const mockUser = {
  id: 'user-1',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@test.com',
  displayName: 'Alice Smith',
  role: 'USER',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserProfile.mockResolvedValue({ success: false });
});

describe('UserDisplay — loading state', () => {
  it('shows skeleton while loading', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('hides username skeleton when showUsername is false', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" showUsername={false} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.every((s) => !s.className.includes('w-12'))).toBe(true);
  });

  it('shows username skeleton when showUsername is true (default)', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" showUsername={true} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.some((s) => s.className.includes('w-12'))).toBe(true);
  });

  it('resolves to user display after fetch succeeds', async () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" />);
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
  });

  it('applies sm size to skeleton', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" size="sm" />);
    const avatarSkeleton = screen.getAllByTestId('skeleton')[0];
    expect(avatarSkeleton).toHaveClass('h-6');
  });

  it('applies md size to skeleton', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" size="md" />);
    const avatarSkeleton = screen.getAllByTestId('skeleton')[0];
    expect(avatarSkeleton).toHaveClass('h-8');
  });

  it('applies lg size to skeleton', () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: mockUser });
    render(<UserDisplay userId="abc123" size="lg" />);
    const avatarSkeleton = screen.getAllByTestId('skeleton')[0];
    expect(avatarSkeleton).toHaveClass('h-10');
  });
});

describe('UserDisplay — userId provided but no user found', () => {
  it('shows "?" fallback after fetch returns no data', async () => {
    mockGetUserProfile.mockResolvedValue({ success: false });
    render(<UserDisplay userId="abc12345" />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows sliced userId as text', async () => {
    mockGetUserProfile.mockResolvedValue({ success: false });
    render(<UserDisplay userId="abc12345xyz" />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.getByText('abc12345...')).toBeInTheDocument();
  });
});

describe('UserDisplay — fetch rejection', () => {
  it('logs error and shows fallback when getUserProfile rejects', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUserProfile.mockRejectedValue(new Error('Network error'));
    render(<UserDisplay userId="abc12345" />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching user profile:', expect.any(Error));
    expect(screen.getByText('?')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});

describe('UserDisplay — fallback Avatar size', () => {
  it('applies sm size to Avatar in fallback path', async () => {
    mockGetUserProfile.mockResolvedValue({ success: false });
    render(<UserDisplay userId="abc12345" size="sm" />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.getByTestId('avatar')).toHaveClass('h-6');
  });

  it('applies lg size to Avatar in fallback path', async () => {
    mockGetUserProfile.mockResolvedValue({ success: false });
    render(<UserDisplay userId="abc12345" size="lg" />);
    await waitFor(() => expect(screen.queryAllByTestId('skeleton')).toHaveLength(0));
    expect(screen.getByTestId('avatar')).toHaveClass('h-10');
  });
});

describe('UserDisplay — no userId and no user', () => {
  it('returns null', () => {
    const { container } = render(<UserDisplay />);
    expect(container.firstChild).toBeNull();
  });
});

describe('UserDisplay — initial user provided', () => {
  it('renders without fetching', () => {
    render(<UserDisplay user={mockUser} />);
    expect(mockGetUserProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows @username when showUsername is true', () => {
    render(<UserDisplay user={mockUser} showUsername={true} />);
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });

  it('hides @username when showUsername is false', () => {
    render(<UserDisplay user={mockUser} showUsername={false} />);
    expect(screen.queryByText('@alice')).not.toBeInTheDocument();
  });

  it('shows two-letter initials from displayName', () => {
    render(<UserDisplay user={mockUser} />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('AS');
  });

  it('shows single initial when displayName has one word', () => {
    render(<UserDisplay user={{ ...mockUser, displayName: 'Alice' }} />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('A');
  });

  it('applies sm size to Avatar', () => {
    render(<UserDisplay user={mockUser} size="sm" />);
    expect(screen.getByTestId('avatar')).toHaveClass('h-6');
  });

  it('applies md size to Avatar', () => {
    render(<UserDisplay user={mockUser} size="md" />);
    expect(screen.getByTestId('avatar')).toHaveClass('h-8');
  });

  it('applies lg size to Avatar', () => {
    render(<UserDisplay user={mockUser} size="lg" />);
    expect(screen.getByTestId('avatar')).toHaveClass('h-10');
  });
});
