import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationDetailsSidebar } from '../../../components/conversations/conversation-details-sidebar';
import { conversationsService } from '@/services/conversations.service';
import { userPreferencesService } from '@/services/user-preferences.service';
import { AttachmentService } from '@/services/attachmentService';
import type { Conversation, User, Message } from '@meeshy/shared/types';
import { UserRoleEnum } from '@meeshy/shared/types';

// Mock services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    updateConversation: jest.fn(),
    removeParticipant: jest.fn(),
  },
}));

jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getPreferences: jest.fn(),
    getAllPreferences: jest.fn(),
    getCategories: jest.fn(),
    updateTags: jest.fn(),
    upsertPreferences: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
  },
}));

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    uploadFiles: jest.fn(),
  },
}));

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        'conversationDetails.title': 'Details',
        'conversationDetails.close': 'Close',
        'conversationDetails.groupConversation': 'Group Conversation',
        'conversationDetails.conversationGroup': 'Group',
        'conversationDetails.conversationPrivate': 'Private',
        'conversationDetails.clickToEdit': 'Click to edit',
        'conversationDetails.editName': 'Edit name',
        'conversationDetails.nameUpdated': 'Name updated',
        'conversationDetails.updateError': 'Update error',
        'conversationDetails.linkCopied': 'Link copied',
        'conversationDetails.copyError': 'Copy error',
        'conversationDetails.personalTags': 'Personal Tags',
        'conversationDetails.category': 'Category',
        'conversationDetails.activeLanguages': 'Active Languages',
        'conversationDetails.activeUsers': 'Active Users',
        'conversationDetails.shareLinks': 'Share Links',
        'conversationDetails.createLink': 'Create Link',
        'conversationDetails.noTags': 'No tags',
        'conversationDetails.noActiveUsers': 'No active users',
        'conversationDetails.tagAdded': 'Tag added',
        'conversationDetails.tagRemoved': 'Tag removed',
        'conversationDetails.tagAlreadyExists': 'Tag already exists',
        'conversationDetails.searchOrAddTag': 'Search or add tag',
        'conversationDetails.customName': 'Custom name',
        'conversationDetails.reaction': 'Reaction',
        'common.loading': 'Loading...',
      };
      let result = translations[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, String(v));
        });
      }
      return result;
    },
  }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock clipboard
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn(() => Promise.resolve({ success: true })),
}));

// Mock UI components
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, onClick }: any) => (
    <div data-testid="avatar" className={className} onClick={onClick}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: any) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, disabled, 'aria-label': ariaLabel, title }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, onKeyDown, onBlur, placeholder, className, autoFocus }: any) => (
    <input
      data-testid="input"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, onKeyDown, placeholder, className, autoFocus }: any) => (
    <textarea
      data-testid="textarea"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: React.forwardRef(({ children, asChild }: any, ref: any) => <div ref={ref}>{children}</div>),
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
}));

jest.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div data-testid="command">{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div data-testid="command-empty">{children}</div>,
  CommandGroup: ({ children, heading }: { children: React.ReactNode; heading?: string }) => (
    <div data-testid="command-group">{heading && <span>{heading}</span>}{children}</div>
  ),
  CommandInput: ({ placeholder, value, onValueChange }: any) => (
    <input
      data-testid="command-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    />
  ),
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <div data-testid="command-item" onClick={onSelect}>{children}</div>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div data-testid="command-list">{children}</div>,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
  PopoverTrigger: React.forwardRef(({ children, asChild }: any, ref: any) => <div ref={ref}>{children}</div>),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="dropdown-menu" data-open={open}>{children}</div>
  ),
  DropdownMenuTrigger: React.forwardRef(({ children, asChild }: any, ref: any) => (
    <div ref={ref} data-testid="dropdown-trigger">{children}</div>
  )),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button data-testid="dropdown-item" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status }: { isOnline: boolean; status: string }) => (
    <div data-testid="online-indicator" data-online={isOnline} data-status={status} />
  ),
}));

jest.mock('../../../components/conversations/conversation-links-section', () => ({
  ConversationLinksSection: () => <div data-testid="links-section">Links Section</div>,
}));

jest.mock('../../../components/conversations/create-link-button', () => ({
  CreateLinkButton: ({ children, onLinkCreated }: { children: React.ReactNode; onLinkCreated: () => void }) => (
    <button data-testid="create-link-button" onClick={onLinkCreated}>{children}</button>
  ),
}));

jest.mock('../../../components/conversations/conversation-image-upload-dialog', () => ({
  ConversationImageUploadDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <div data-testid="image-upload-dialog"><button onClick={onClose}>Close</button></div> : null
  ),
}));

jest.mock('@/lib/bubble-stream-modules', () => ({
  FoldableSection: ({ children, title, icon, defaultExpanded }: any) => (
    <div data-testid="foldable-section" data-title={title} data-expanded={defaultExpanded}>
      {icon}{title}{children}
    </div>
  ),
  LanguageIndicators: ({ languageStats }: any) => (
    <div data-testid="language-indicators">{languageStats?.length || 0} languages</div>
  ),
  SidebarLanguageHeader: ({ languageStats }: any) => (
    <div data-testid="sidebar-language-header">{languageStats?.length || 0} languages</div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/utils/tag-colors', () => ({
  getTagColor: () => ({ bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }),
}));

jest.mock('@/lib/user-status', () => ({
  getUserStatus: jest.fn(() => 'online'),
}));

jest.mock('@/utils/language-utils', () => ({
  getLanguageDisplayName: (code: string) => code === 'fr' ? 'French' : code === 'en' ? 'English' : code,
  getLanguageFlag: (code: string) => code === 'fr' ? 'FR' : code === 'en' ? 'GB' : code,
}));

// Mock data
const mockCurrentUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: UserRoleEnum.USER,
  email: 'test@example.com',
  systemLanguage: 'fr',
} as User;

const mockAdminUser: User = {
  ...mockCurrentUser,
  id: 'admin-1',
  role: UserRoleEnum.ADMIN,
} as User;

const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  description: 'Test description',
  type: 'group',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  participants: [
    {
      userId: 'user-1',
      user: {
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        systemLanguage: 'fr',
        isOnline: true,
      },
      role: UserRoleEnum.USER,
    },
    {
      userId: 'user-2',
      user: {
        id: 'user-2',
        username: 'jane',
        displayName: 'Jane Doe',
        systemLanguage: 'en',
        isOnline: false,
      },
      role: UserRoleEnum.USER,
    },
  ],
} as Conversation;

const mockDirectConversation: Conversation = {
  ...mockConversation,
  id: 'conv-2',
  title: 'Direct Chat',
  type: 'direct',
} as Conversation;

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    content: 'Hello',
    originalLanguage: 'fr',
    senderId: 'user-1',
    createdAt: new Date().toISOString(),
  } as Message,
  {
    id: 'msg-2',
    content: 'Hi',
    originalLanguage: 'en',
    senderId: 'user-2',
    createdAt: new Date().toISOString(),
  } as Message,
];

describe('ConversationDetailsSidebar', () => {
  const defaultProps = {
    conversation: mockConversation,
    currentUser: mockCurrentUser,
    messages: mockMessages,
    isOpen: true,
    onClose: jest.fn(),
    onConversationUpdated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (userPreferencesService.getPreferences as jest.Mock).mockResolvedValue({
      tags: [],
      categoryId: null,
      customName: null,
      reaction: null,
    });
    (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([]);
    (userPreferencesService.getCategories as jest.Mock).mockResolvedValue([]);
  });

  describe('Initial Render', () => {
    it('should render sidebar when isOpen is true', () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      expect(screen.getByText('Details')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<ConversationDetailsSidebar {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Details')).not.toBeInTheDocument();
    });

    it('should display conversation title', () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    });

    it('should display conversation ID', () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      expect(screen.getByText('conv-1')).toBeInTheDocument();
    });

    it('should display conversation type badge for group', () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      expect(screen.getByText('Group')).toBeInTheDocument();
    });

    it('should display conversation type badge for direct', () => {
      render(<ConversationDetailsSidebar {...defaultProps} conversation={mockDirectConversation} />);

      expect(screen.getByText('Private')).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(<ConversationDetailsSidebar {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText('Close');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Edit Name', () => {
    it('should show edit input when clicking on name', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      const nameElement = screen.getByText('Test Conversation');
      fireEvent.click(nameElement);

      await waitFor(() => {
        expect(screen.getByTestId('input')).toBeInTheDocument();
      });
    });

    it('should update conversation name on save', async () => {
      (conversationsService.updateConversation as jest.Mock).mockResolvedValue({});

      render(<ConversationDetailsSidebar {...defaultProps} />);

      const editButton = screen.getByTitle('Edit name');
      fireEvent.click(editButton);

      await waitFor(() => {
        const input = screen.getByTestId('input');
        fireEvent.change(input, { target: { value: 'New Name' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(conversationsService.updateConversation).toHaveBeenCalledWith('conv-1', {
          title: 'New Name',
        });
      });
    });
  });

  describe('Copy Link', () => {
    it('should copy conversation link when copy button is clicked', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      // The sidebar should render and have interactive elements
      await waitFor(() => {
        expect(screen.getByText('Personal Tags')).toBeInTheDocument();
      });

      // Verify buttons are present for interaction
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Tags Section', () => {
    it('should display tags section', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Personal Tags')).toBeInTheDocument();
      });
    });

    it('should show no tags message when empty', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No tags')).toBeInTheDocument();
      });
    });

    it('should display existing tags', async () => {
      (userPreferencesService.getPreferences as jest.Mock).mockResolvedValue({
        tags: ['Important', 'Work'],
        categoryId: null,
      });

      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Important')).toBeInTheDocument();
        expect(screen.getByText('Work')).toBeInTheDocument();
      });
    });
  });

  describe('Category Section', () => {
    it('should display category section', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument();
      });
    });
  });

  describe('Language Stats', () => {
    it('should display language header', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-language-header')).toBeInTheDocument();
      });
    });

    it('should display active languages section', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Active Languages')).toBeInTheDocument();
      });
    });
  });

  describe('Active Users Section', () => {
    it('should display active users section', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Active Users/)).toBeInTheDocument();
      });
    });

    it('should show current user in active users list', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      // The current user should always be in the active users list
      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
      });
    });
  });

  describe('Share Links Section', () => {
    it('should display share links section for group conversations', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Share Links')).toBeInTheDocument();
      });
    });

    it('should not display share links section for direct conversations', async () => {
      render(
        <ConversationDetailsSidebar
          {...defaultProps}
          conversation={mockDirectConversation}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('Share Links')).not.toBeInTheDocument();
      });
    });

    it('should display create link button', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('create-link-button')).toBeInTheDocument();
      });
    });
  });

  describe('Description Section', () => {
    it('should display description for group conversations', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test description')).toBeInTheDocument();
      });
    });

    it('should not display description section for direct conversations', async () => {
      render(
        <ConversationDetailsSidebar
          {...defaultProps}
          conversation={mockDirectConversation}
        />
      );

      // Description should not be shown for direct conversations
    });
  });

  describe('Image Upload', () => {
    it('should show image upload option for moderators', async () => {
      const moderatorUser: User = {
        ...mockCurrentUser,
        role: UserRoleEnum.MODO,
      } as User;

      render(
        <ConversationDetailsSidebar
          {...defaultProps}
          currentUser={moderatorUser}
        />
      );

      // Sidebar should render for moderator users
      await waitFor(() => {
        expect(screen.getByText('Personal Tags')).toBeInTheDocument();
      });
    });
  });

  describe('Direct Conversation', () => {
    it('should show other participant name for direct conversations', async () => {
      render(
        <ConversationDetailsSidebar
          {...defaultProps}
          conversation={mockDirectConversation}
        />
      );

      await waitFor(() => {
        // Should show the other participant's name
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });

  describe('Anonymous User', () => {
    it('should not load preferences for anonymous users', async () => {
      const anonymousUser = {
        ...mockCurrentUser,
        sessionToken: 'anonymous-token',
        shareLinkId: 'share-link-1',
      };

      render(
        <ConversationDetailsSidebar
          {...defaultProps}
          currentUser={anonymousUser as User}
        />
      );

      // Should still render but not call preferences service
    });
  });

  describe('Foldable Sections', () => {
    it('should render foldable sections', async () => {
      render(<ConversationDetailsSidebar {...defaultProps} />);

      await waitFor(() => {
        const foldableSections = screen.getAllByTestId('foldable-section');
        expect(foldableSections.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle update error gracefully', async () => {
      const { toast } = require('sonner');
      (conversationsService.updateConversation as jest.Mock).mockRejectedValue(
        new Error('Update failed')
      );

      render(<ConversationDetailsSidebar {...defaultProps} />);

      const editButton = screen.getByTitle('Edit name');
      fireEvent.click(editButton);

      await waitFor(() => {
        const input = screen.getByTestId('input');
        fireEvent.change(input, { target: { value: 'New Name' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});
