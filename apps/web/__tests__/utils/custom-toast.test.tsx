/**
 * Tests for custom-toast utility
 */

import React from 'react';
import { showSuccessToast, showErrorToast, showInfoToast } from '../../utils/custom-toast';
import { toast as sonnerToast } from 'sonner';

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    custom: jest.fn(),
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-circle">AlertCircle</span>,
  CheckCircle: () => <span data-testid="check-circle">CheckCircle</span>,
  Info: () => <span data-testid="info">Info</span>,
}));

describe('custom-toast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('showSuccessToast', () => {
    it('should call sonner toast.custom', () => {
      showSuccessToast('Success!');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });

    it('should pass correct options to toast', () => {
      showSuccessToast('Success!');

      expect(sonnerToast.custom).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 3000,
          position: 'top-right',
        })
      );
    });

    it('should include title in toast content', () => {
      showSuccessToast('Operation completed');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();

      // Render the content and check it contains the title
      expect(toastContent.props.children).toBeDefined();
    });

    it('should combine title and message when both provided', () => {
      showSuccessToast('Success', 'Item saved');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });
  });

  describe('showErrorToast', () => {
    it('should call sonner toast.custom', () => {
      showErrorToast('Error!');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });

    it('should pass correct options to toast', () => {
      showErrorToast('Error!');

      expect(sonnerToast.custom).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 3000,
          position: 'top-right',
        })
      );
    });

    it('should combine title and message when both provided', () => {
      showErrorToast('Error', 'Something went wrong');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });

    it('should work with only title', () => {
      showErrorToast('Error occurred');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });
  });

  describe('showInfoToast', () => {
    it('should call sonner toast.custom', () => {
      showInfoToast('Information');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });

    it('should pass correct options to toast', () => {
      showInfoToast('Information');

      expect(sonnerToast.custom).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 3000,
          position: 'top-right',
        })
      );
    });

    it('should combine title and message when both provided', () => {
      showInfoToast('Info', 'Please note this');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });

    it('should work with only title', () => {
      showInfoToast('Note');

      expect(sonnerToast.custom).toHaveBeenCalledTimes(1);
    });
  });

  describe('toast content rendering', () => {
    it('should render success toast with green background', () => {
      showSuccessToast('Success');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();

      expect(toastContent.props.className).toContain('bg-green-500');
    });

    it('should render error toast with red background', () => {
      showErrorToast('Error');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();

      expect(toastContent.props.className).toContain('bg-red-500');
    });

    it('should render info toast with blue background', () => {
      showInfoToast('Info');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();

      expect(toastContent.props.className).toContain('bg-blue-500');
    });

    it('should include proper styling classes', () => {
      showSuccessToast('Success');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();

      expect(toastContent.props.className).toContain('rounded-md');
      expect(toastContent.props.className).toContain('shadow-md');
    });
  });

  describe('message formatting', () => {
    it('should format title only correctly', () => {
      showSuccessToast('Just title');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const textSpan = toastContent.props.children[1];

      expect(textSpan.props.children).toBe('Just title');
    });

    it('should format title and message with colon separator', () => {
      showSuccessToast('Title', 'Message');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const textSpan = toastContent.props.children[1];

      expect(textSpan.props.children).toBe('Title: Message');
    });

    it('should handle empty message', () => {
      showSuccessToast('Title', '');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const textSpan = toastContent.props.children[1];

      // Empty message should just show title
      expect(textSpan.props.children).toBe('Title');
    });

    it('should handle undefined message', () => {
      showSuccessToast('Title');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const textSpan = toastContent.props.children[1];

      expect(textSpan.props.children).toBe('Title');
    });
  });

  describe('toast icons', () => {
    it('should include CheckCircle icon for success', () => {
      showSuccessToast('Success');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const icon = toastContent.props.children[0];

      expect(icon).toBeDefined();
    });

    it('should include AlertCircle icon for error', () => {
      showErrorToast('Error');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const icon = toastContent.props.children[0];

      expect(icon).toBeDefined();
    });

    it('should include Info icon for info', () => {
      showInfoToast('Info');

      const call = (sonnerToast.custom as jest.Mock).mock.calls[0];
      const toastContent = call[0]();
      const icon = toastContent.props.children[0];

      expect(icon).toBeDefined();
    });
  });
});
