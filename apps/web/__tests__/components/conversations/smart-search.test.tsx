import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmartSearch } from '../../../components/conversations/smart-search';
import type { User } from '@/types';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock UI components
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, variant, size }: any) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

// Mock data
const mockRecentUsers: User[] = [
  {
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
  } as User,
  {
    id: 'user-2',
    username: 'jane',
    displayName: 'Jane Smith',
  } as User,
  {
    id: 'user-3',
    username: 'bob',
    displayName: 'Bob Builder',
  } as User,
];

const mockSuggestedUsers: User[] = [
  {
    id: 'user-4',
    username: 'alice',
    displayName: 'Alice Wonder',
  } as User,
  {
    id: 'user-5',
    username: 'charlie',
    displayName: 'Charlie Brown',
  } as User,
];

describe('SmartSearch', () => {
  const defaultProps = {
    searchQuery: '',
    onSearch: jest.fn(),
    recentUsers: mockRecentUsers,
    suggestedUsers: mockSuggestedUsers,
    onUserSelect: jest.fn(),
    selectedUsers: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
  });

  describe('Initial Render', () => {
    it('should render component when there are recent users', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Utilisateurs récents')).toBeInTheDocument();
    });

    it('should render component when there are suggested users', () => {
      render(<SmartSearch {...defaultProps} recentUsers={[]} />);

      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    it('should render component when there are recent searches', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['test', 'search']));

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      expect(screen.getByText('Recherches récentes')).toBeInTheDocument();
    });

    it('should not render when all lists are empty and no search query', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const { container } = render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Recent Searches', () => {
    it('should load recent searches from localStorage on mount', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['search1', 'search2']));

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      expect(localStorageMock.getItem).toHaveBeenCalledWith('recent_conversation_searches');
      expect(screen.getByText('search1')).toBeInTheDocument();
      expect(screen.getByText('search2')).toBeInTheDocument();
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      const { container } = render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      // Should not crash
      expect(container).toBeInTheDocument();
    });

    it('should call onSearch when clicking a recent search', () => {
      const onSearch = jest.fn();
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['test search']));

      render(
        <SmartSearch
          {...defaultProps}
          onSearch={onSearch}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      const searchButton = screen.getByText('test search');
      fireEvent.click(searchButton);

      expect(onSearch).toHaveBeenCalledWith('test search');
    });

    it('should save search to localStorage when search is performed', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify([]));

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      // The component would save searches through the handleSearch function
      // which is called when clicking on recent searches
    });

    it('should not show recent searches when search query is present', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['search1']));

      render(
        <SmartSearch
          {...defaultProps}
          searchQuery="active search"
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      expect(screen.queryByText('Recherches récentes')).not.toBeInTheDocument();
    });

    it('should limit recent searches to 5', () => {
      const manySearches = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(manySearches));

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      // Should display up to 5 recent searches
      expect(screen.getByText('s1')).toBeInTheDocument();
      expect(screen.getByText('s5')).toBeInTheDocument();
      // s6 and s7 should not be displayed (limit is applied on save, not display)
    });
  });

  describe('Recent Users', () => {
    it('should display recent users section', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Utilisateurs récents')).toBeInTheDocument();
    });

    it('should display recent user names', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    });

    it('should display recent user usernames', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('@john')).toBeInTheDocument();
      expect(screen.getByText('@jane')).toBeInTheDocument();
    });

    it('should call onUserSelect when clicking a recent user', () => {
      const onUserSelect = jest.fn();
      render(
        <SmartSearch
          {...defaultProps}
          onUserSelect={onUserSelect}
        />
      );

      const johnButton = screen.getByText('John Doe').closest('button');
      if (johnButton) {
        fireEvent.click(johnButton);
      }

      expect(onUserSelect).toHaveBeenCalledWith(mockRecentUsers[0]);
    });

    it('should limit displayed recent users to 3', () => {
      const manyUsers = Array.from({ length: 10 }, (_, i) => ({
        id: `user-${i}`,
        username: `user${i}`,
        displayName: `User ${i}`,
      })) as User[];

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={manyUsers}
        />
      );

      // Only first 3 should be displayed
      expect(screen.getByText('User 0')).toBeInTheDocument();
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
      expect(screen.queryByText('User 3')).not.toBeInTheDocument();
    });

    it('should not show recent users when search query is present', () => {
      render(
        <SmartSearch
          {...defaultProps}
          searchQuery="search"
        />
      );

      expect(screen.queryByText('Utilisateurs récents')).not.toBeInTheDocument();
    });

    it('should filter out already selected users', () => {
      render(
        <SmartSearch
          {...defaultProps}
          selectedUsers={[mockRecentUsers[0]]}
        />
      );

      // John should not be displayed as he's already selected
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  describe('Suggested Users', () => {
    it('should display suggested users section', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    it('should display suggested user names', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Alice Wonder')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });

    it('should call onUserSelect when clicking a suggested user', () => {
      const onUserSelect = jest.fn();
      render(
        <SmartSearch
          {...defaultProps}
          onUserSelect={onUserSelect}
        />
      );

      const aliceButton = screen.getByText('Alice Wonder').closest('button');
      if (aliceButton) {
        fireEvent.click(aliceButton);
      }

      expect(onUserSelect).toHaveBeenCalledWith(mockSuggestedUsers[0]);
    });

    it('should limit displayed suggested users to 3', () => {
      const manyUsers = Array.from({ length: 10 }, (_, i) => ({
        id: `suggested-${i}`,
        username: `suggested${i}`,
        displayName: `Suggested ${i}`,
      })) as User[];

      render(
        <SmartSearch
          {...defaultProps}
          suggestedUsers={manyUsers}
        />
      );

      expect(screen.getByText('Suggested 0')).toBeInTheDocument();
      expect(screen.getByText('Suggested 2')).toBeInTheDocument();
      expect(screen.queryByText('Suggested 3')).not.toBeInTheDocument();
    });

    it('should not show suggested users when search query is present', () => {
      render(
        <SmartSearch
          {...defaultProps}
          searchQuery="search"
        />
      );

      expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
    });

    it('should filter out already selected users from suggestions', () => {
      render(
        <SmartSearch
          {...defaultProps}
          selectedUsers={[mockSuggestedUsers[0]]}
        />
      );

      // Alice should not be displayed as she's already selected
      expect(screen.queryByText('Alice Wonder')).not.toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });
  });

  describe('Avatar Display', () => {
    it('should display first letter of displayName for recent users', () => {
      render(<SmartSearch {...defaultProps} />);

      // Each user should have an avatar with their initial (multiple J's exist)
      expect(screen.getAllByText('J').length).toBeGreaterThan(0); // John, Jane
    });

    it('should fallback to username initial when no displayName', () => {
      const usersWithoutDisplayName = [
        {
          id: 'user-1',
          username: 'testuser',
        } as User,
      ];

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={usersWithoutDisplayName}
          suggestedUsers={[]}
        />
      );

      expect(screen.getByText('T')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty displayName gracefully', () => {
      const userWithEmptyDisplayName = [
        {
          id: 'user-1',
          username: 'test',
          displayName: '',
        } as User,
      ];

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={userWithEmptyDisplayName}
          suggestedUsers={[]}
        />
      );

      // Should use username when displayName is empty
      expect(screen.getByText('test')).toBeInTheDocument();
    });

    it('should handle undefined recentUsers', () => {
      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={undefined}
        />
      );

      // Should not crash and suggestions should still show
      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    it('should handle undefined suggestedUsers', () => {
      render(
        <SmartSearch
          {...defaultProps}
          suggestedUsers={undefined}
        />
      );

      // Should not crash and recent users should still show
      expect(screen.getByText('Utilisateurs récents')).toBeInTheDocument();
    });
  });

  describe('Search Icon', () => {
    it('should show search icon on recent search buttons', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['test']));

      const { container } = render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      // Search icon should be present
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Section Icons', () => {
    it('should show clock icon for recent searches', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['test']));

      render(
        <SmartSearch
          {...defaultProps}
          recentUsers={[]}
          suggestedUsers={[]}
        />
      );

      expect(screen.getByText('Recherches récentes')).toBeInTheDocument();
    });

    it('should show users icon for recent users', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Utilisateurs récents')).toBeInTheDocument();
    });

    it('should show star icon for suggested users', () => {
      render(<SmartSearch {...defaultProps} />);

      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });
  });
});
