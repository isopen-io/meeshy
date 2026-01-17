/**
 * EmojiPicker Component Tests
 *
 * Tests the emoji picker including:
 * - Initial rendering
 * - Category navigation
 * - Search functionality
 * - Emoji selection
 * - Close button
 * - Keyboard navigation
 * - Accessibility
 * - localStorage for frequent emojis
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EmojiPicker } from '../../../components/common/emoji-picker';

// Mock useI18n hook
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'picker.categories.frequent': 'Frequent',
        'picker.categories.smileys': 'Smileys',
        'picker.categories.gestures': 'Gestures',
        'picker.categories.emotions': 'Emotions',
        'picker.categories.celebration': 'Celebration',
        'picker.categories.nature': 'Nature',
        'picker.categories.objects': 'Objects',
        'picker.categories.symbols': 'Symbols',
        'picker.categories.label': 'Emoji Categories',
        'picker.search': 'Search emojis...',
        'picker.clearSearch': 'Clear search',
        'picker.noResults': `No results for "${params?.query || ''}"`,
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
    button: React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }: any, ref: any) => (
      <button ref={ref} {...props}>{children}</button>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Mock UI components
jest.mock('@/components/ui/input', () => ({
  Input: React.forwardRef(({ className, ...props }: any, ref: any) => (
    <input ref={ref} className={className} {...props} />
  )),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className, style }: any) => (
    <div className={className} style={style}>{children}</div>
  ),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('EmojiPicker', () => {
  const defaultProps = {
    onEmojiSelect: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('Initial Rendering', () => {
    it('renders the emoji picker', () => {
      render(<EmojiPicker {...defaultProps} />);

      expect(screen.getByPlaceholderText('Search emojis...')).toBeInTheDocument();
    });

    it('renders category tabs', () => {
      render(<EmojiPicker {...defaultProps} />);

      expect(screen.getByText('Frequent')).toBeInTheDocument();
      expect(screen.getByText('Smileys')).toBeInTheDocument();
      expect(screen.getByText('Gestures')).toBeInTheDocument();
      expect(screen.getByText('Emotions')).toBeInTheDocument();
    });

    it('renders close button when onClose is provided', () => {
      render(<EmojiPicker {...defaultProps} />);

      // Look for button with "Fermer" aria-label
      const closeButtons = screen.getAllByRole('button', { name: /Fermer|close/i });
      expect(closeButtons.length).toBeGreaterThan(0);
    });

    it('does not render close button when onClose is not provided', () => {
      const { onClose, ...propsWithoutClose } = defaultProps;
      render(<EmojiPicker {...propsWithoutClose} />);

      // No close button outside of search clear
      const buttons = screen.queryAllByRole('button', { name: 'Fermer' });
      expect(buttons.length).toBe(0);
    });

    it('shows frequent emojis by default', () => {
      render(<EmojiPicker {...defaultProps} />);

      // Check for frequent emojis (first category is active by default)
      const frequentTab = screen.getByText('Frequent');
      expect(frequentTab).toHaveAttribute('aria-selected', 'true');
    });

    it('applies custom className', () => {
      const { container } = render(<EmojiPicker {...defaultProps} className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('applies custom maxHeight', () => {
      const { container } = render(<EmojiPicker {...defaultProps} maxHeight={300} />);

      expect(container.firstChild).toHaveStyle('max-height: 300px');
    });
  });

  describe('Category Navigation', () => {
    it('switches to smileys category when clicked', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const smileysTab = screen.getByText('Smileys');
      await user.click(smileysTab);

      expect(smileysTab).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to gestures category when clicked', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const gesturesTab = screen.getByText('Gestures');
      await user.click(gesturesTab);

      expect(gesturesTab).toHaveAttribute('aria-selected', 'true');
    });

    it('shows correct emojis for selected category', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      // Switch to gestures category
      const gesturesTab = screen.getByText('Gestures');
      await user.click(gesturesTab);

      // Should show hand wave emoji
      expect(screen.getByLabelText(/Sélectionner 👋/)).toBeInTheDocument();
    });

    it('has proper ARIA attributes for tabs', () => {
      render(<EmojiPicker {...defaultProps} />);

      const tabList = screen.getByRole('tablist', { name: /Emoji Categories/i });
      expect(tabList).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBeGreaterThan(0);
    });
  });

  describe('Emoji Selection', () => {
    it('calls onEmojiSelect when emoji is clicked', async () => {
      const user = userEvent.setup();
      const onEmojiSelect = jest.fn();
      render(<EmojiPicker {...defaultProps} onEmojiSelect={onEmojiSelect} />);

      // Click on thumbs up emoji (in frequent category)
      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      await user.click(thumbsUp);

      expect(onEmojiSelect).toHaveBeenCalledWith('👍');
    });

    it('saves selected emoji to localStorage frequent list', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      await user.click(thumbsUp);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'meeshy-frequent-emojis',
        expect.any(String)
      );
    });

    it('handles keyboard selection with Enter', async () => {
      const user = userEvent.setup();
      const onEmojiSelect = jest.fn();
      render(<EmojiPicker {...defaultProps} onEmojiSelect={onEmojiSelect} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      thumbsUp.focus();
      await user.keyboard('{Enter}');

      expect(onEmojiSelect).toHaveBeenCalledWith('👍');
    });

    it('handles keyboard selection with Space', async () => {
      const user = userEvent.setup();
      const onEmojiSelect = jest.fn();
      render(<EmojiPicker {...defaultProps} onEmojiSelect={onEmojiSelect} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      thumbsUp.focus();
      await user.keyboard(' ');

      expect(onEmojiSelect).toHaveBeenCalledWith('👍');
    });
  });

  describe('Search Functionality', () => {
    it('filters emojis when typing in search', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'smile');

      // Category tabs should be hidden during search
      expect(screen.queryByText('Frequent')).not.toBeVisible();
    });

    it('shows clear button when search has value', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'smile');

      // Look for clear search button
      const clearButton = screen.getByLabelText(/clear|Effacer/i);
      expect(clearButton).toBeInTheDocument();
    });

    it('clears search when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'smile');

      const clearButton = screen.getByLabelText(/clear|Effacer/i);
      await user.click(clearButton);

      expect(searchInput).toHaveValue('');
    });

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'xyznonexistent');

      expect(screen.getByText(/No results for/)).toBeInTheDocument();
    });

    it('finds emojis by keyword', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'love');

      // Should find heart emoji
      expect(screen.getByLabelText(/Sélectionner ❤️/)).toBeInTheDocument();
    });

    it('finds emojis by French keyword', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search emojis...');
      await user.type(searchInput, 'amour');

      // Should find love-related emojis
      await waitFor(() => {
        // At least one emoji should match
        const emojiButtons = screen.queryAllByRole('button', { name: /Sélectionner/ });
        expect(emojiButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<EmojiPicker {...defaultProps} onClose={onClose} />);

      const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
      await user.click(closeButtons[0]);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has search input with proper aria-label', () => {
      render(<EmojiPicker {...defaultProps} />);

      const searchInput = screen.getByRole('textbox', { name: /Search emojis/i });
      expect(searchInput).toBeInTheDocument();
    });

    it('emoji buttons have aria-labels', () => {
      render(<EmojiPicker {...defaultProps} />);

      const emojiButtons = screen.getAllByRole('button', { name: /Sélectionner/ });
      expect(emojiButtons.length).toBeGreaterThan(0);
    });

    it('tabs are keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<EmojiPicker {...defaultProps} />);

      const frequentTab = screen.getByText('Frequent');
      frequentTab.focus();

      // Should be focusable
      expect(document.activeElement).toBe(frequentTab);
    });

    it('has proper tab panel structure', () => {
      render(<EmojiPicker {...defaultProps} />);

      // Check for tabpanel role (might be grid role instead based on implementation)
      const grids = screen.getAllByRole('grid');
      expect(grids.length).toBeGreaterThan(0);
    });
  });

  describe('Frequent Emojis from localStorage', () => {
    it('updates frequent list when emoji is selected', async () => {
      const user = userEvent.setup();
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['😀', '😂']));

      render(<EmojiPicker {...defaultProps} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      await user.click(thumbsUp);

      const setItemCall = localStorageMock.setItem.mock.calls.find(
        (call: any[]) => call[0] === 'meeshy-frequent-emojis'
      );
      expect(setItemCall).toBeTruthy();

      const savedEmojis = JSON.parse(setItemCall[1]);
      expect(savedEmojis[0]).toBe('👍'); // Most recent first
    });

    it('limits frequent emojis to 8', async () => {
      const user = userEvent.setup();
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify(['😀', '😂', '❤️', '🔥', '⭐', '😮', '😢', '🎉'])
      );

      render(<EmojiPicker {...defaultProps} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      await user.click(thumbsUp);

      const setItemCall = localStorageMock.setItem.mock.calls.find(
        (call: any[]) => call[0] === 'meeshy-frequent-emojis'
      );
      const savedEmojis = JSON.parse(setItemCall[1]);
      expect(savedEmojis.length).toBeLessThanOrEqual(8);
    });

    it('handles localStorage error gracefully', async () => {
      const user = userEvent.setup();
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      // Should not throw
      render(<EmojiPicker {...defaultProps} />);

      const thumbsUp = screen.getByLabelText(/Sélectionner 👍/);
      await user.click(thumbsUp);

      // Should still call onEmojiSelect
      expect(defaultProps.onEmojiSelect).toHaveBeenCalledWith('👍');
    });
  });

  describe('Grid Layout', () => {
    it('renders emojis in a grid', () => {
      const { container } = render(<EmojiPicker {...defaultProps} />);

      const grids = container.querySelectorAll('.grid-cols-8');
      expect(grids.length).toBeGreaterThan(0);
    });

    it('emojis have consistent size', () => {
      render(<EmojiPicker {...defaultProps} />);

      const emojiButtons = screen.getAllByRole('button', { name: /Sélectionner/ });
      emojiButtons.forEach((button) => {
        expect(button).toHaveClass('w-9', 'h-9');
      });
    });
  });
});
