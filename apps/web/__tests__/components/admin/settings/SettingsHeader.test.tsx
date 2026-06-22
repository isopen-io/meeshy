import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsHeader } from '@/components/admin/settings/SettingsHeader';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe('SettingsHeader', () => {
  const defaultProps = {
    hasChanges: false,
    isSaving: false,
    onSave: jest.fn(),
    onReset: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('save button', () => {
    it('is disabled when hasChanges=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={false} />);
      const saveBtn = screen.getByRole('button', { name: /adminSettings.header.save/ });
      expect(saveBtn).toBeDisabled();
    });

    it('is disabled when isSaving=true regardless of hasChanges', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={true} />);
      const saveBtn = screen.getByRole('button', { name: /adminSettings.header.saving/ });
      expect(saveBtn).toBeDisabled();
    });

    it('is enabled when hasChanges=true and isSaving=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={false} />);
      const saveBtn = screen.getByRole('button', { name: /adminSettings.header.save/ });
      expect(saveBtn).not.toBeDisabled();
    });

    it('calls onSave when clicked', () => {
      const onSave = jest.fn();
      render(<SettingsHeader {...defaultProps} hasChanges={true} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: /adminSettings.header.save/ }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('shows saving label when isSaving=true', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={true} />);
      expect(screen.getByText('adminSettings.header.saving')).toBeInTheDocument();
    });

    it('shows save label when isSaving=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={false} />);
      expect(screen.getByText('adminSettings.header.save')).toBeInTheDocument();
    });
  });

  describe('reset button', () => {
    it('is disabled when hasChanges=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={false} />);
      const resetBtn = screen.getByRole('button', { name: /adminSettings.header.reset/ });
      expect(resetBtn).toBeDisabled();
    });

    it('is disabled when isSaving=true', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={true} />);
      const resetBtn = screen.getByRole('button', { name: /adminSettings.header.reset/ });
      expect(resetBtn).toBeDisabled();
    });

    it('is enabled when hasChanges=true and isSaving=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} isSaving={false} />);
      const resetBtn = screen.getByRole('button', { name: /adminSettings.header.reset/ });
      expect(resetBtn).not.toBeDisabled();
    });

    it('calls onReset when clicked', () => {
      const onReset = jest.fn();
      render(<SettingsHeader {...defaultProps} hasChanges={true} onReset={onReset} />);
      fireEvent.click(screen.getByRole('button', { name: /adminSettings.header.reset/ }));
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsaved changes badge', () => {
    it('shows the badge when hasChanges=true', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={true} />);
      expect(screen.getByText('adminSettings.header.unsavedChanges')).toBeInTheDocument();
    });

    it('hides the badge when hasChanges=false', () => {
      render(<SettingsHeader {...defaultProps} hasChanges={false} />);
      expect(screen.queryByText('adminSettings.header.unsavedChanges')).not.toBeInTheDocument();
    });
  });

  describe('back button', () => {
    it('navigates to /admin when clicked', () => {
      const mockPush = jest.fn();
      jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({
        push: mockPush,
        replace: jest.fn(),
        prefetch: jest.fn(),
        back: jest.fn(),
      });

      render(<SettingsHeader {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /adminSettings.header.back/ }));
      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });
});
