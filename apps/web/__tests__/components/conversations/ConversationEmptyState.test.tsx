import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationEmptyState } from '../../../components/conversations/ConversationEmptyState';

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className} data-testid="button">
      {children}
    </button>
  ),
}));

jest.mock('../../../components/conversations/create-link-button', () => ({
  CreateLinkButton: ({ children, onLinkCreated, className, variant }: any) => (
    <button
      onClick={() => onLinkCreated?.()}
      className={className}
      data-testid="create-link-button"
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

// Mock translation function
const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'chooseConversation': 'Choose a conversation',
    'chooseConversationDescription': 'Select a conversation from the list to start chatting',
    'welcome': 'Welcome to Meeshy',
    'welcomeDescription': 'Start by creating a new conversation or generating a share link',
    'createConversation': 'New Conversation',
    'createLink': 'Create Link',
  };
  return translations[key] || key;
};

describe('ConversationEmptyState', () => {
  const defaultProps = {
    conversationsCount: 0,
    onCreateConversation: jest.fn(),
    onLinkCreated: jest.fn(),
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the component', () => {
      render(<ConversationEmptyState {...defaultProps} />);

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
      expect(screen.getByText('Create Link')).toBeInTheDocument();
    });

    it('should render the message icon', () => {
      const { container } = render(<ConversationEmptyState {...defaultProps} />);

      // Check for the icon container
      const iconContainer = container.querySelector('.w-24.h-24');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Empty State - No Conversations', () => {
    it('should show welcome message when no conversations exist', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={0} />);

      expect(screen.getByText('Welcome to Meeshy')).toBeInTheDocument();
      expect(screen.getByText('Start by creating a new conversation or generating a share link')).toBeInTheDocument();
    });
  });

  describe('Empty State - With Conversations', () => {
    it('should show choose conversation message when conversations exist', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={5} />);

      expect(screen.getByText('Choose a conversation')).toBeInTheDocument();
      expect(screen.getByText('Select a conversation from the list to start chatting')).toBeInTheDocument();
    });

    it('should not show welcome message when conversations exist', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={5} />);

      expect(screen.queryByText('Welcome to Meeshy')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onCreateConversation when clicking new conversation button', () => {
      const onCreateConversation = jest.fn();
      render(
        <ConversationEmptyState
          {...defaultProps}
          onCreateConversation={onCreateConversation}
        />
      );

      const createButton = screen.getByText('New Conversation');
      fireEvent.click(createButton);

      expect(onCreateConversation).toHaveBeenCalledTimes(1);
    });

    it('should call onLinkCreated when link is created', () => {
      const onLinkCreated = jest.fn();
      render(
        <ConversationEmptyState
          {...defaultProps}
          onLinkCreated={onLinkCreated}
        />
      );

      const createLinkButton = screen.getByTestId('create-link-button');
      fireEvent.click(createLinkButton);

      expect(onLinkCreated).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button Styling', () => {
    it('should render create conversation button with primary styling', () => {
      const { container } = render(<ConversationEmptyState {...defaultProps} />);

      const buttons = container.querySelectorAll('button');
      // First button should be the create conversation button
      const createConvButton = Array.from(buttons).find(btn =>
        btn.textContent?.includes('New Conversation')
      );
      expect(createConvButton?.className).toContain('bg-primary');
    });

    it('should render create link button with outline variant', () => {
      render(<ConversationEmptyState {...defaultProps} />);

      const createLinkButton = screen.getByTestId('create-link-button');
      expect(createLinkButton).toHaveAttribute('data-variant', 'outline');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button text', () => {
      render(<ConversationEmptyState {...defaultProps} />);

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
      expect(screen.getByText('Create Link')).toBeInTheDocument();
    });

    it('should render headings at appropriate level', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={0} />);

      const heading = screen.getByText('Welcome to Meeshy');
      expect(heading.tagName).toBe('H3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle conversationsCount of 1', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={1} />);

      expect(screen.getByText('Choose a conversation')).toBeInTheDocument();
    });

    it('should handle large conversationsCount', () => {
      render(<ConversationEmptyState {...defaultProps} conversationsCount={1000} />);

      expect(screen.getByText('Choose a conversation')).toBeInTheDocument();
    });

    it('should handle missing translation keys gracefully', () => {
      const incompleteT = (key: string) => key;
      render(
        <ConversationEmptyState
          {...defaultProps}
          t={incompleteT}
        />
      );

      // Should render with raw keys
      expect(screen.getByText('welcome')).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('should render buttons in a flex container', () => {
      const { container } = render(<ConversationEmptyState {...defaultProps} />);

      const buttonContainer = container.querySelector('.flex.gap-4');
      expect(buttonContainer).toBeInTheDocument();
    });

    it('should center the content', () => {
      const { container } = render(<ConversationEmptyState {...defaultProps} />);

      const mainContainer = container.firstChild;
      expect(mainContainer).toHaveClass('flex-1', 'flex', 'flex-col', 'items-center', 'justify-center');
    });
  });
});
