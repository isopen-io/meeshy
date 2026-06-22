import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UserPicker } from '@/components/admin/agent/UserPicker';
import { useSearchUsersQuery } from '@/hooks/queries/use-users-query';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('use-debounce', () => ({
  useDebounce: (value: unknown) => [value],
}));

jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: jest.fn(),
}));

jest.mock('@/components/admin/agent/UserDisplay', () => ({
  UserDisplay: ({
    userId,
    user,
  }: {
    userId?: string;
    user?: { username?: string };
    size?: string;
    showUsername?: boolean;
    className?: string;
  }) => <span data-testid="user-display">{userId ?? user?.username ?? ''}</span>,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
  }) => <div data-testid="popover-content">{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    className?: string;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const mockUseSearchUsersQuery = useSearchUsersQuery as jest.Mock;

const mockUser = {
  id: 'user-1',
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  email: 'alice@test.com',
  role: 'USER',
};

const baseProps = {
  userIds: [] as string[],
  onAdd: jest.fn(),
  onRemove: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSearchUsersQuery.mockReturnValue({ data: [], isLoading: false });
});

describe('UserPicker — structure', () => {
  it('renders label when provided', () => {
    render(<UserPicker {...baseProps} label="Select Users" />);
    expect(screen.getByText('Select Users')).toBeInTheDocument();
  });

  it('does not render label element when label prop is absent', () => {
    const { container } = render(<UserPicker {...baseProps} />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('shows noneSelected text when userIds is empty', () => {
    render(<UserPicker {...baseProps} userIds={[]} />);
    expect(screen.getByText('agent.userPicker.noneSelected')).toBeInTheDocument();
  });

  it('does not show noneSelected when userIds is non-empty', () => {
    render(<UserPicker {...baseProps} userIds={['user-1']} />);
    expect(screen.queryByText('agent.userPicker.noneSelected')).not.toBeInTheDocument();
  });

  it('renders a UserDisplay for each selected userId', () => {
    render(<UserPicker {...baseProps} userIds={['user-1', 'user-2']} />);
    const displays = screen.getAllByTestId('user-display');
    const inSelectedArea = displays.filter(
      (d) => d.textContent === 'user-1' || d.textContent === 'user-2'
    );
    expect(inSelectedArea).toHaveLength(2);
  });

  it('calls onRemove with userId when remove button is clicked', () => {
    const onRemove = jest.fn();
    render(<UserPicker {...baseProps} userIds={['user-1']} onRemove={onRemove} />);
    const removeBtn = screen.getByTitle('agent.userPicker.remove');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('user-1');
  });
});

describe('UserPicker — search content', () => {
  it('shows minChars hint initially (empty searchTerm)', () => {
    render(<UserPicker {...baseProps} />);
    expect(screen.getByText('agent.userPicker.minChars')).toBeInTheDocument();
  });

  it('shows loading spinner when isLoading is true', () => {
    mockUseSearchUsersQuery.mockReturnValue({ data: [], isLoading: true });
    render(<UserPicker {...baseProps} />);
    expect(screen.getByTestId('loader2-icon')).toBeInTheDocument();
  });

  it('shows results when data is non-empty', () => {
    mockUseSearchUsersQuery.mockReturnValue({ data: [mockUser], isLoading: false });
    render(<UserPicker {...baseProps} />);
    // UserDisplay shown for the result user
    const displays = screen.getAllByTestId('user-display');
    expect(displays.some((d) => d.textContent === 'alice')).toBe(true);
  });

  it('shows noResults when searchTerm >= 2 chars and results empty', () => {
    render(<UserPicker {...baseProps} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'al' } });
    expect(screen.getByText('agent.userPicker.noResults')).toBeInTheDocument();
  });

  it('shows minChars when searchTerm < 2 chars', () => {
    render(<UserPicker {...baseProps} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
    expect(screen.getByText('agent.userPicker.minChars')).toBeInTheDocument();
  });

  it('calls onAdd when a result user button is clicked', () => {
    const onAdd = jest.fn();
    mockUseSearchUsersQuery.mockReturnValue({ data: [mockUser], isLoading: false });
    render(<UserPicker {...baseProps} onAdd={onAdd} />);
    // Find the result button containing alice (the UserDisplay + role badge area)
    const resultBtns = Array.from(
      screen.getByTestId('popover-content').querySelectorAll('button')
    ).filter((b) => !(b as HTMLButtonElement).title);
    const userBtn = resultBtns[0];
    fireEvent.click(userBtn!);
    expect(onAdd).toHaveBeenCalledWith('user-1');
  });

  it('shows "added" badge when user is already in userIds', () => {
    mockUseSearchUsersQuery.mockReturnValue({ data: [mockUser], isLoading: false });
    render(<UserPicker {...baseProps} userIds={['user-1']} />);
    expect(screen.getByText('agent.userPicker.added')).toBeInTheDocument();
  });

  it('disables result button when user is already in userIds', () => {
    mockUseSearchUsersQuery.mockReturnValue({ data: [mockUser], isLoading: false });
    render(<UserPicker {...baseProps} userIds={['user-1']} />);
    const resultBtns = Array.from(
      screen.getByTestId('popover-content').querySelectorAll('button')
    ).filter((b) => !(b as HTMLButtonElement).title);
    expect((resultBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses custom placeholder when provided', () => {
    render(<UserPicker {...baseProps} placeholder="Find a user" />);
    expect(screen.getByPlaceholderText('Find a user')).toBeInTheDocument();
  });

  it('uses default searchPlaceholder when no placeholder prop', () => {
    render(<UserPicker {...baseProps} />);
    expect(
      screen.getByPlaceholderText('agent.userPicker.searchPlaceholder')
    ).toBeInTheDocument();
  });

  it('defaults results to empty array when data is undefined from query', () => {
    mockUseSearchUsersQuery.mockReturnValue({ data: undefined, isLoading: false });
    render(<UserPicker {...baseProps} />);
    expect(screen.getByText('agent.userPicker.minChars')).toBeInTheDocument();
  });
});
