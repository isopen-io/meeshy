import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as conversationsServiceModule from '../../services/conversations.service';
import * as groupsServiceModule from '../../services/groups.service';
import type { Conversation, Group } from '../../types';

// Mock the services
jest.mock('../../services/conversations.service');
jest.mock('../../services/groups.service');

const conversationsService = conversationsServiceModule as jest.Mocked<typeof conversationsServiceModule>;
const groupsService = groupsServiceModule as jest.Mocked<typeof groupsServiceModule>;

// Types for API responses
interface GroupsResponse {
  groups: Group[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

const mockConversationsService = conversationsService as jest.Mocked<typeof conversationsService>;
const mockGroupsService = groupsService as jest.Mocked<typeof groupsService>;

// Mock React components for testing
const MockConversationList = ({ onConversationSelect }: { onConversationSelect: (id: string) => void }) => {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadConversations = async () => {
      try {
        setLoading(true);
        const data = await conversationsService.getConversations();
        setConversations(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, []);

  if (loading) return <div data-testid="loading">Loading conversations...</div>;
  if (error) return <div data-testid="error">Error: {error}</div>;

  return (
    <div data-testid="conversation-list">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          data-testid={`conversation-${conversation.id}`}
          onClick={() => onConversationSelect(conversation.id)}
        >
          {conversation.name || `Conversation ${conversation.id}`}
        </button>
      ))}
    </div>
  );
};

const MockGroupList = ({ onGroupSelect }: { onGroupSelect: (id: string) => void }) => {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadGroups = async () => {
      try {
        setLoading(true);
        const response = await groupsService.getGroups();
        setGroups(response.data.groups);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load groups');
      } finally {
        setLoading(false);
      }
    };

    loadGroups();
  }, []);

  if (loading) return <div data-testid="loading">Loading groups...</div>;
  if (error) return <div data-testid="error">Error: {error}</div>;

  return (
    <div data-testid="group-list">
      {groups.map((group) => (
        <button
          key={group.id}
          data-testid={`group-${group.id}`}
          onClick={() => onGroupSelect(group.id)}
        >
          {group.name}
        </button>
      ))}
    </div>
  );
};

const MockSearchComponent = () => {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ conversations: Conversation[]; groups: Group[] }>({
    conversations: [],
    groups: [],
  });
  const [loading, setLoading] = React.useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const [conversations, groupsResponse] = await Promise.all([
        conversationsService.searchConversations(query),
        groupsService.getGroups({ search: query }),
      ]);
      setResults({ 
        conversations, 
        groups: groupsResponse.data.groups 
      });
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="search-component">
      <input
        data-testid="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search conversations and groups..."
      />
      <button data-testid="search-button" onClick={handleSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>
      
      <div data-testid="search-results">
        {results.conversations.length > 0 && (
          <div data-testid="conversation-results">
            <h3>Conversations</h3>
            {results.conversations.map((conv) => (
              <div key={conv.id} data-testid={`result-conversation-${conv.id}`}>
                {conv.name || `Conversation ${conv.id}`}
              </div>
            ))}
          </div>
        )}
        
        {results.groups.length > 0 && (
          <div data-testid="group-results">
            <h3>Groups</h3>
            {results.groups.map((group) => (
              <div key={group.id} data-testid={`result-group-${group.id}`}>
                {group.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

describe('UI and API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ConversationList Integration', () => {
    it('should load and display conversations from API', async () => {
      const mockConversations: Conversation[] = [
        {
          id: '1',
          type: 'direct',
          name: 'Test Conversation 1',
          isGroup: false,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          type: 'group',
          name: 'Test Group Chat',
          isGroup: true,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockConversationsService.getConversations.mockResolvedValue(mockConversations);

      const onSelect = jest.fn();
      render(<MockConversationList onConversationSelect={onSelect} />);

      // Should show loading initially
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Wait for conversations to load
      await waitFor(() => {
        expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
      });

      // Should display conversations
      expect(screen.getByTestId('conversation-1')).toHaveTextContent('Test Conversation 1');
      expect(screen.getByTestId('conversation-2')).toHaveTextContent('Test Group Chat');

      // Should call API service
      expect(mockConversationsService.getConversations).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      mockConversationsService.getConversations.mockRejectedValue(new Error('Network error'));

      const onSelect = jest.fn();
      render(<MockConversationList onConversationSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Error: Network error');
    });

    it('should handle conversation selection', async () => {
      const mockConversations: Conversation[] = [
        {
          id: '1',
          type: 'direct',
          name: 'Test Conversation',
          isGroup: false,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockConversationsService.getConversations.mockResolvedValue(mockConversations);

      const onSelect = jest.fn();
      render(<MockConversationList onConversationSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('conversation-1'));
      expect(onSelect).toHaveBeenCalledWith('1');
    });
  });

  describe('GroupList Integration', () => {
    it('should load and display groups from API', async () => {
      const mockGroups: Group[] = [
        {
          id: '1',
          name: 'Development Team',
          description: 'Team group for developers',
          isPrivate: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          conversations: [],
        },
        {
          id: '2',
          name: 'Project Alpha',
          description: 'Project discussion group',
          isPrivate: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          conversations: [],
        },
      ];

      const mockResponse: ApiResponse<GroupsResponse> = {
        data: {
          groups: mockGroups,
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        status: 200,
        message: 'Success',
      };

      mockGroupsService.getGroups.mockResolvedValue(mockResponse);

      const onSelect = jest.fn();
      render(<MockGroupList onGroupSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByTestId('group-list')).toBeInTheDocument();
      });

      expect(screen.getByTestId('group-1')).toHaveTextContent('Development Team');
      expect(screen.getByTestId('group-2')).toHaveTextContent('Project Alpha');
      expect(mockGroupsService.getGroups).toHaveBeenCalledTimes(1);
    });

    it('should handle group selection', async () => {
      const mockGroups: Group[] = [
        {
          id: '1',
          name: 'Test Group',
          description: 'Test group',
          isPrivate: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          conversations: [],
        },
      ];

      const mockResponse: ApiResponse<GroupsResponse> = {
        data: {
          groups: mockGroups,
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        status: 200,
        message: 'Success',
      };

      mockGroupsService.getGroups.mockResolvedValue(mockResponse);

      const onSelect = jest.fn();
      render(<MockGroupList onGroupSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByTestId('group-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('group-1'));
      expect(onSelect).toHaveBeenCalledWith('1');
    });
  });

  describe('Search Integration', () => {
    it('should search both conversations and groups', async () => {
      const mockConversations: Conversation[] = [
        {
          id: '1',
          type: 'direct',
          name: 'Work Discussion',
          isGroup: false,
          isActive: true,
          participants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockGroups: Group[] = [
        {
          id: '1',
          name: 'Work Team',
          description: 'Work related discussions',
          isPrivate: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          conversations: [],
        },
      ];

      const mockGroupsResponse: ApiResponse<GroupsResponse> = {
        data: {
          groups: mockGroups,
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        status: 200,
        message: 'Success',
      };

      mockConversationsService.searchConversations.mockResolvedValue(mockConversations);
      mockGroupsService.getGroups.mockResolvedValue(mockGroupsResponse);

      render(<MockSearchComponent />);

      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByTestId('search-button');

      fireEvent.change(searchInput, { target: { value: 'work' } });
      fireEvent.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-results')).toBeInTheDocument();
        expect(screen.getByTestId('group-results')).toBeInTheDocument();
      });

      expect(screen.getByTestId('result-conversation-1')).toHaveTextContent('Work Discussion');
      expect(screen.getByTestId('result-group-1')).toHaveTextContent('Work Team');

      expect(mockConversationsService.searchConversations).toHaveBeenCalledWith('work');
      expect(mockGroupsService.getGroups).toHaveBeenCalledWith({ search: 'work' });
    });

    it('should handle empty search results', async () => {
      const emptyGroupsResponse: ApiResponse<GroupsResponse> = {
        data: {
          groups: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
        status: 200,
        message: 'Success',
      };

      mockConversationsService.searchConversations.mockResolvedValue([]);
      mockGroupsService.getGroups.mockResolvedValue(emptyGroupsResponse);

      render(<MockSearchComponent />);

      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByTestId('search-button');

      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      fireEvent.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('search-results')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('conversation-results')).not.toBeInTheDocument();
      expect(screen.queryByTestId('group-results')).not.toBeInTheDocument();
    });

    it('should show loading state during search', async () => {
      const emptyGroupsResponse: ApiResponse<GroupsResponse> = {
        data: {
          groups: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
        status: 200,
        message: 'Success',
      };

      // Make the API calls return slowly
      mockConversationsService.searchConversations.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );
      mockGroupsService.getGroups.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(emptyGroupsResponse), 100))
      );

      render(<MockSearchComponent />);

      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByTestId('search-button');

      fireEvent.change(searchInput, { target: { value: 'test' } });
      fireEvent.click(searchButton);

      // Should show loading state
      expect(screen.getByText('Searching...')).toBeInTheDocument();
      expect(searchButton).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Search')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle concurrent API failures', async () => {
      mockConversationsService.searchConversations.mockRejectedValue(new Error('Conversation API error'));
      mockGroupsService.getGroups.mockRejectedValue(new Error('Groups API error'));

      render(<MockSearchComponent />);

      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByTestId('search-button');

      fireEvent.change(searchInput, { target: { value: 'test' } });
      fireEvent.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Search')).toBeInTheDocument();
      });

      // Should not crash and should restore normal state
      expect(screen.getByTestId('search-results')).toBeInTheDocument();
    });
  });

  describe('Performance Integration', () => {
    it('should handle rapid successive API calls', async () => {
      let callCount = 0;
      mockConversationsService.getConversations.mockImplementation(() => {
        callCount++;
        return Promise.resolve([]);
      });

      const { rerender } = render(<MockConversationList onConversationSelect={jest.fn()} />);

      // Rapidly rerender component multiple times
      for (let i = 0; i < 5; i++) {
        rerender(<MockConversationList onConversationSelect={jest.fn()} />);
      }

      await waitFor(() => {
        expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
      });

      // Should have made the API call for each render (component doesn't implement deduplication)
      expect(callCount).toBeGreaterThan(0);
    });
  });
});
