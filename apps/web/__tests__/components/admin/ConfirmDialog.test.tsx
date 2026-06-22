import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

describe('ConfirmDialog', () => {
  const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete user?',
    description: 'This action cannot be undone.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders title and description when open', () => {
      render(<ConfirmDialog {...baseProps} />);
      expect(screen.getByText('Delete user?')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('does not render when open=false', () => {
      render(<ConfirmDialog {...baseProps} open={false} />);
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  describe('confirm button', () => {
    it('calls onConfirm when confirm button is clicked', () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
      fireEvent.click(screen.getByText('confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenChange(false) after confirm', () => {
      const onOpenChange = jest.fn();
      render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} />);
      fireEvent.click(screen.getByText('confirm'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('uses custom confirmText when provided', () => {
      render(<ConfirmDialog {...baseProps} confirmText="Yes, delete" />);
      expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    });

    it('falls back to t("confirm") when confirmText is not provided', () => {
      render(<ConfirmDialog {...baseProps} />);
      expect(screen.getByText('confirm')).toBeInTheDocument();
    });
  });

  describe('cancel button', () => {
    it('calls onOpenChange(false) when cancel button is clicked', () => {
      const onOpenChange = jest.fn();
      render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} />);
      fireEvent.click(screen.getByText('cancel'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('does not call onConfirm when cancel is clicked', () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
      fireEvent.click(screen.getByText('cancel'));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('uses custom cancelText when provided', () => {
      render(<ConfirmDialog {...baseProps} cancelText="No, keep" />);
      expect(screen.getByText('No, keep')).toBeInTheDocument();
    });

    it('falls back to t("cancel") when cancelText is not provided', () => {
      render(<ConfirmDialog {...baseProps} />);
      expect(screen.getByText('cancel')).toBeInTheDocument();
    });
  });

  describe('variant', () => {
    it('uses destructive variant by default', () => {
      render(<ConfirmDialog {...baseProps} />);
      const confirmBtn = screen.getByText('confirm');
      expect(confirmBtn).toHaveAttribute('data-variant', 'destructive');
    });

    it('uses default variant when variant="default"', () => {
      render(<ConfirmDialog {...baseProps} variant="default" />);
      const confirmBtn = screen.getByText('confirm');
      expect(confirmBtn).toHaveAttribute('data-variant', 'default');
    });
  });
});
