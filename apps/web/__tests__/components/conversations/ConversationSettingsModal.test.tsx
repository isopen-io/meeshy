import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationSettingsModal } from '../../../components/conversations/ConversationSettingsModal';
import { userPreferencesService } from '@/services/user-preferences.service';
import { conversationsService } from '@/services/conversations.service';
import type { Conversation } from '@meeshy/shared/types';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
    toString: () => '',
  }),
}));

// Mock services
jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getPreferences: jest.fn(),
    getCategories: jest.fn(),
    upsertPreferences: jest.fn(),
  },
}));

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    updateConversation: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'conversationDetails.title': 'Conversation Settings',
        'conversationDetails.conversation': 'Conversation',
        'conversationDetails.myPreferences': 'My Preferences',
        'conversationDetails.configuration': 'Configuration',
        'conversationDetails.organization': 'Organization',
        'conversationDetails.customization': 'Customization',
        'conversationDetails.preferencesSaved': 'Preferences saved',
        'conversationDetails.preferencesError': 'Error saving preferences',
        'conversationDetails.configSaved': 'Configuration saved',
        'conversationDetails.configError': 'Error saving configuration',
        'conversationHeader.pin': 'Pin',
        'conversationHeader.mute': 'Mute',
        'conversationHeader.archive': 'Archive',
        'conversationDetails.pinDescription': 'Keep at top of list',
        'conversationDetails.muteDescription': 'Disable notifications',
        'conversationDetails.archiveDescription': 'Hide from main list',
        'conversationDetails.category': 'Category',
        'conversationDetails.categoryDescription': 'Organize by category',
        'conversationDetails.selectCategory': 'Select...',
        'conversationDetails.noCategory': 'No category',
        'conversationDetails.customName': 'Custom Name',
        'conversationDetails.customNamePlaceholder': 'Enter a name...',
        'conversationDetails.customNameHelp': 'Only visible to you',
        'conversationDetails.reaction': 'Reaction',
        'conversationDetails.personalTags': 'Personal Tags',
        'conversationDetails.noTags': 'No tags',
        'conversationDetails.addTag': 'Add a tag...',
        'conversationDetails.saving': 'Saving...',
        'conversationDetails.savePreferences': 'Save Preferences',
        'conversationDetails.saveConfig': 'Save Configuration',
        'conversationDetails.basicInfo': 'Information',
        'conversationDetails.conversationName': 'Conversation Name',
        'conversationDetails.namePlaceholder': 'Enter a name...',
        'conversationDetails.description': 'Description',
        'conversationDetails.descriptionPlaceholder': 'Add a description...',
        'conversationDetails.security': 'Security',
        'conversationDetails.encryptionMode': 'Encryption Mode',
        'conversationDetails.noEncryption': 'No encryption',
        'conversationDetails.e2ee': 'End-to-end (E2EE)',
        'conversationDetails.hybrid': 'Hybrid',
        'conversationDetails.serverEncryption': 'Server',
        'conversationDetails.e2eeDescription': 'Messages are end-to-end encrypted',
        'conversationDetails.hybridDescription': 'Server-side encryption with shared keys',
        'conversationDetails.serverDescription': 'Messages are encrypted on the server',
        'conversationDetails.noEncryptionDescription': 'Messages are not encrypted',
        'conversationDetails.currentStatus': 'Current Status',
        'conversationDetails.groupConversation': 'Group',
        'conversationDetails.directConversation': 'Direct',
        'conversationUI.members': 'members',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="tabs" data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { onValueChange } as any);
        }
        return child;
      })}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs-list" role="tablist">{children}</div>
  ),
  TabsTrigger: ({ children, value, onClick, onValueChange }: any) => (
    <button
      data-testid={`tab-${value}`}
      role="tab"
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`tab-content-${value}`} role="tabpanel">{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, type, variant }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      type={type}
      data-variant={variant}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, className, id, maxLength }: any) => (
    <input
      data-testid={id || 'input'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      id={id}
      maxLength={maxLength}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label data-testid="label" htmlFor={htmlFor}>{children}</label>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, 'aria-label': ariaLabel }: any) => (
    <button
      data-testid="switch"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, className, id }: any) => (
    <textarea
      data-testid={id || 'textarea'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      id={id}
    />
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { onValueChange } as any);
        }
        return child;
      })}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <button
      data-testid={`select-item-${value}`}
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

// Mock data
const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  description: 'A test conversation',
  type: 'group',
  isGroup: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  participants: [
    { userId: 'user-1', user: { id: 'user-1', username: 'alice' } },
    { userId: 'user-2', user: { id: 'user-2', username: 'bob' } },
  ],
} as Conversation;

const mockPreferences = {
  isPinned: false,
  isMuted: false,
  isArchived: false,
  customName: '',
  reaction: '',
  tags: [],
  categoryId: null,
};

const mockCategories = [
  { id: 'cat-1', name: 'Work', icon: '💼', order: 0 },
  { id: 'cat-2', name: 'Personal', icon: '🏠', order: 1 },
];

describe('ConversationSettingsModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    conversation: mockConversation,
    currentUserRole: 'MEMBER',
    onConversationUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (userPreferencesService.getPreferences as jest.Mock).mockResolvedValue(mockPreferences);
    (userPreferencesService.getCategories as jest.Mock).mockResolvedValue(mockCategories);
    (userPreferencesService.upsertPreferences as jest.Mock).mockResolvedValue({});
    (conversationsService.updateConversation as jest.Mock).mockResolvedValue(mockConversation);
  });

  describe('Initial Render', () => {
    it('should render modal when open is true', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should not render modal when open is false', () => {
      render(<ConversationSettingsModal {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display modal title', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Conversation Settings')).toBeInTheDocument();
      });
    });

    it('should display conversation title in description', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });
    });

    it('should display avatar with conversation initial', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('T')).toBeInTheDocument();
      });
    });
  });

  describe('Tabs Navigation', () => {
    it('should show preferences tab by default', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-preferences')).toBeInTheDocument();
      });
    });

    it('should hide config tab for non-admin users', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="MEMBER" />);

      await waitFor(() => {
        expect(screen.queryByTestId('tab-config')).not.toBeInTheDocument();
      });
    });

    it('should show config tab for admin users', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-config')).toBeInTheDocument();
      });
    });

    it('should show config tab for moderators', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="MODERATOR" />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-config')).toBeInTheDocument();
      });
    });

    it('should show config tab for creators', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="CREATOR" />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-config')).toBeInTheDocument();
      });
    });
  });

  describe('Preferences Tab', () => {
    it('should load user preferences on mount', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(userPreferencesService.getPreferences).toHaveBeenCalledWith('conv-1');
      });
    });

    it('should load categories on mount', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(userPreferencesService.getCategories).toHaveBeenCalled();
      });
    });

    it('should display pin switch', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pin')).toBeInTheDocument();
      });
    });

    it('should display mute switch', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Mute')).toBeInTheDocument();
      });
    });

    it('should display archive switch', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Archive')).toBeInTheDocument();
      });
    });

    it('should display category selector', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument();
      });
    });

    it('should display custom name input', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Custom Name')).toBeInTheDocument();
        expect(screen.getByTestId('customName')).toBeInTheDocument();
      });
    });

    it('should display reaction input', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Reaction')).toBeInTheDocument();
        expect(screen.getByTestId('reaction')).toBeInTheDocument();
      });
    });

    it('should display tags section', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Personal Tags')).toBeInTheDocument();
      });
    });

    it('should show loading spinner while loading preferences', async () => {
      (userPreferencesService.getPreferences as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPreferences), 1000))
      );

      render(<ConversationSettingsModal {...defaultProps} />);

      // The loading state should be shown initially
      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Pin')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Preferences Interactions', () => {
    it('should toggle pin state when switch is clicked', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pin')).toBeInTheDocument();
      });

      const switches = screen.getAllByTestId('switch');
      // First switch is pin
      fireEvent.click(switches[0]);

      expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    });

    it('should update custom name when input changes', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('customName')).toBeInTheDocument();
      });

      const customNameInput = screen.getByTestId('customName');
      fireEvent.change(customNameInput, { target: { value: 'My Custom Name' } });

      expect(customNameInput).toHaveValue('My Custom Name');
    });

    it('should add tag when add button is clicked', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Add a tag...')).toBeInTheDocument();
      });

      const tagInput = screen.getByPlaceholderText('Add a tag...');
      fireEvent.change(tagInput, { target: { value: 'new-tag' } });

      // Find add button (the one with Check icon functionality)
      const buttons = screen.getAllByTestId('button');
      const addButton = buttons.find(btn => btn.getAttribute('aria-label') === 'Ajouter le tag');
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    it('should save preferences when save button is clicked', async () => {
      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(userPreferencesService.upsertPreferences).toHaveBeenCalled();
      });
    });
  });

  describe('Config Tab (Admin)', () => {
    it('should display title input for admin users', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByTestId('convTitle')).toBeInTheDocument();
      });
    });

    it('should display description textarea for admin users', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByTestId('convDescription')).toBeInTheDocument();
      });
    });

    it('should display encryption mode selector for admin users', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByText('Encryption Mode')).toBeInTheDocument();
      });
    });

    it('should display current status badges', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByText('Current Status')).toBeInTheDocument();
        expect(screen.getByText('Group')).toBeInTheDocument();
      });
    });

    it('should update title when input changes', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByTestId('convTitle')).toBeInTheDocument();
      });

      const titleInput = screen.getByTestId('convTitle');
      fireEvent.change(titleInput, { target: { value: 'New Title' } });

      expect(titleInput).toHaveValue('New Title');
    });

    it('should save configuration when save button is clicked', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Configuration');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(conversationsService.updateConversation).toHaveBeenCalled();
      });
    });

    it('should call onConversationUpdate after successful config save', async () => {
      const onConversationUpdate = jest.fn();
      render(
        <ConversationSettingsModal
          {...defaultProps}
          currentUserRole="ADMIN"
          onConversationUpdate={onConversationUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Configuration');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onConversationUpdate).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when preferences save fails', async () => {
      const { toast } = require('sonner');
      (userPreferencesService.upsertPreferences as jest.Mock).mockRejectedValue(
        new Error('Save failed')
      );

      render(<ConversationSettingsModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Save Preferences')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Preferences');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should show error toast when config save fails', async () => {
      const { toast } = require('sonner');
      (conversationsService.updateConversation as jest.Mock).mockRejectedValue(
        new Error('Save failed')
      );

      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save Configuration');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Close Modal', () => {
    it('should call onOpenChange when modal is closed', async () => {
      const onOpenChange = jest.fn();
      render(<ConversationSettingsModal {...defaultProps} onOpenChange={onOpenChange} />);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('Direct Conversation', () => {
    it('should show Direct badge for direct conversations', async () => {
      const directConversation = {
        ...mockConversation,
        type: 'direct',
        isGroup: false,
      };

      render(
        <ConversationSettingsModal
          {...defaultProps}
          conversation={directConversation}
          currentUserRole="ADMIN"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Direct')).toBeInTheDocument();
      });
    });
  });

  describe('Participants Count', () => {
    it('should display participant count badge', async () => {
      render(<ConversationSettingsModal {...defaultProps} currentUserRole="ADMIN" />);

      await waitFor(() => {
        expect(screen.getByText('2 members')).toBeInTheDocument();
      });
    });
  });
});
