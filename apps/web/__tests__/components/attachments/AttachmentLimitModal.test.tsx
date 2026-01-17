/**
 * Tests for AttachmentLimitModal component
 * Displays a warning when attachment limit is reached or exceeded
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentLimitModal } from '@/components/attachments/AttachmentLimitModal';

// Mock i18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: (namespace: string) => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'attachmentLimit.partialMessage': `You have ${params?.current} of ${params?.max} attachments. You can add ${params?.remaining} more.`,
        'attachmentLimit.fullMessage': `Maximum ${params?.max} attachments allowed.`,
        'attachmentLimit.suggestion': 'Send current message and start a new one for more files.',
        'understood': 'Understood',
      };
      return translations[key] || key;
    },
  }),
}));

describe('AttachmentLimitModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    currentCount: 5,
    maxCount: 10,
    remainingSlots: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <AttachmentLimitModal {...defaultProps} isOpen={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders modal content when isOpen is true', () => {
      const { container } = render(<AttachmentLimitModal {...defaultProps} />);

      // Should display the alert triangle icon
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('displays partial message when remainingSlots > 0', () => {
      render(<AttachmentLimitModal {...defaultProps} />);

      expect(screen.getByText(/You have 5 of 10 attachments/)).toBeInTheDocument();
      expect(screen.getByText(/You can add 5 more/)).toBeInTheDocument();
    });

    it('displays full message when remainingSlots is 0', () => {
      render(
        <AttachmentLimitModal
          {...defaultProps}
          currentCount={10}
          remainingSlots={0}
        />
      );

      expect(screen.getByText(/Maximum 10 attachments allowed/)).toBeInTheDocument();
    });

    it('displays suggestion text', () => {
      render(<AttachmentLimitModal {...defaultProps} />);

      expect(screen.getByText(/Send current message and start a new one/)).toBeInTheDocument();
    });

    it('displays current count', () => {
      render(<AttachmentLimitModal {...defaultProps} />);

      const countElement = screen.getByText('5');
      expect(countElement).toBeInTheDocument();
    });

    it('displays max count', () => {
      render(<AttachmentLimitModal {...defaultProps} />);

      expect(screen.getByText(/\/ 10/)).toBeInTheDocument();
    });

    it('displays Understood button', () => {
      render(<AttachmentLimitModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /understood/i })).toBeInTheDocument();
    });
  });

  describe('Counter Styling', () => {
    it('shows orange color when under limit', () => {
      const { container } = render(
        <AttachmentLimitModal {...defaultProps} currentCount={5} maxCount={10} />
      );

      const countElement = screen.getByText('5');
      expect(countElement).toHaveClass('text-orange-600');
    });

    it('shows red color when at limit', () => {
      render(
        <AttachmentLimitModal
          {...defaultProps}
          currentCount={10}
          maxCount={10}
          remainingSlots={0}
        />
      );

      const countElement = screen.getByText('10');
      expect(countElement).toHaveClass('text-red-600');
    });
  });

  describe('Interactions', () => {
    it('calls onClose when Understood button is clicked', () => {
      const onClose = jest.fn();
      render(<AttachmentLimitModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: /understood/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles zero current count', () => {
      render(
        <AttachmentLimitModal
          {...defaultProps}
          currentCount={0}
          remainingSlots={10}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      render(
        <AttachmentLimitModal
          {...defaultProps}
          currentCount={999}
          maxCount={1000}
          remainingSlots={1}
        />
      );

      expect(screen.getByText('999')).toBeInTheDocument();
      expect(screen.getByText(/\/ 1000/)).toBeInTheDocument();
    });
  });
});
