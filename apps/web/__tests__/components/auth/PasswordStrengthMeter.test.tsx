/**
 * PasswordStrengthMeter Component Tests
 *
 * Tests the password strength indicator including:
 * - Empty password handling
 * - Strength score calculation
 * - Visual indicator rendering
 * - Segment display
 * - Translations
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PasswordStrengthMeter } from '../../../components/auth/PasswordStrengthMeter';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'resetPassword.strength.title': 'Password Strength',
        'resetPassword.strength.weak': 'Weak',
        'resetPassword.strength.fair': 'Fair',
        'resetPassword.strength.strong': 'Strong',
        'resetPassword.strength.veryStrong': 'Very Strong',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock password reset service
const mockCalculatePasswordStrength = jest.fn();
const mockGetPasswordStrengthLabel = jest.fn();
const mockGetPasswordStrengthColor = jest.fn();

jest.mock('@/services/password-reset.service', () => ({
  passwordResetService: {
    calculatePasswordStrength: (...args: any[]) => mockCalculatePasswordStrength(...args),
    getPasswordStrengthLabel: (...args: any[]) => mockGetPasswordStrengthLabel(...args),
    getPasswordStrengthColor: (...args: any[]) => mockGetPasswordStrengthColor(...args),
  },
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

describe('PasswordStrengthMeter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty Password', () => {
    it('returns null when password is empty', () => {
      const { container } = render(<PasswordStrengthMeter password="" />);

      expect(container.firstChild).toBeNull();
    });

    it('does not call strength calculation for empty password', () => {
      render(<PasswordStrengthMeter password="" />);

      expect(mockCalculatePasswordStrength).not.toHaveBeenCalled();
    });
  });

  describe('Weak Password', () => {
    beforeEach(() => {
      mockCalculatePasswordStrength.mockReturnValue(1);
      mockGetPasswordStrengthLabel.mockReturnValue('Weak');
      mockGetPasswordStrengthColor.mockReturnValue('bg-red-600');
    });

    it('displays weak strength label', () => {
      render(<PasswordStrengthMeter password="abc" />);

      expect(screen.getByText('Weak')).toBeInTheDocument();
    });

    it('displays strength title', () => {
      render(<PasswordStrengthMeter password="abc" />);

      expect(screen.getByText(/Password Strength/i)).toBeInTheDocument();
    });

    it('fills one segment', () => {
      const { container } = render(<PasswordStrengthMeter password="abc" />);

      const segments = container.querySelectorAll('.grid > div');
      expect(segments).toHaveLength(4);

      // First segment should have color
      expect(segments[0]).toHaveClass('bg-red-600');
      // Rest should be gray
      expect(segments[1]).toHaveClass('bg-gray-200');
      expect(segments[2]).toHaveClass('bg-gray-200');
      expect(segments[3]).toHaveClass('bg-gray-200');
    });

    it('sets correct width percentage (25%)', () => {
      const { container } = render(<PasswordStrengthMeter password="abc" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveStyle('width: 25%');
    });
  });

  describe('Fair Password', () => {
    beforeEach(() => {
      mockCalculatePasswordStrength.mockReturnValue(2);
      mockGetPasswordStrengthLabel.mockReturnValue('Fair');
      mockGetPasswordStrengthColor.mockReturnValue('bg-yellow-600');
    });

    it('displays fair strength label', () => {
      render(<PasswordStrengthMeter password="password" />);

      expect(screen.getByText('Fair')).toBeInTheDocument();
    });

    it('fills two segments', () => {
      const { container } = render(<PasswordStrengthMeter password="password" />);

      const segments = container.querySelectorAll('.grid > div');
      expect(segments[0]).toHaveClass('bg-yellow-600');
      expect(segments[1]).toHaveClass('bg-yellow-600');
      expect(segments[2]).toHaveClass('bg-gray-200');
      expect(segments[3]).toHaveClass('bg-gray-200');
    });

    it('sets correct width percentage (50%)', () => {
      const { container } = render(<PasswordStrengthMeter password="password" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveStyle('width: 50%');
    });
  });

  describe('Strong Password', () => {
    beforeEach(() => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');
    });

    it('displays strong strength label', () => {
      render(<PasswordStrengthMeter password="Password123" />);

      expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    it('fills three segments', () => {
      const { container } = render(<PasswordStrengthMeter password="Password123" />);

      const segments = container.querySelectorAll('.grid > div');
      expect(segments[0]).toHaveClass('bg-blue-600');
      expect(segments[1]).toHaveClass('bg-blue-600');
      expect(segments[2]).toHaveClass('bg-blue-600');
      expect(segments[3]).toHaveClass('bg-gray-200');
    });

    it('sets correct width percentage (75%)', () => {
      const { container } = render(<PasswordStrengthMeter password="Password123" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveStyle('width: 75%');
    });
  });

  describe('Very Strong Password', () => {
    beforeEach(() => {
      mockCalculatePasswordStrength.mockReturnValue(4);
      mockGetPasswordStrengthLabel.mockReturnValue('Very Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-green-600');
    });

    it('displays very strong strength label', () => {
      render(<PasswordStrengthMeter password="VeryStr0ng!P@ssw0rd" />);

      expect(screen.getByText('Very Strong')).toBeInTheDocument();
    });

    it('fills all four segments', () => {
      const { container } = render(<PasswordStrengthMeter password="VeryStr0ng!P@ssw0rd" />);

      const segments = container.querySelectorAll('.grid > div');
      expect(segments[0]).toHaveClass('bg-green-600');
      expect(segments[1]).toHaveClass('bg-green-600');
      expect(segments[2]).toHaveClass('bg-green-600');
      expect(segments[3]).toHaveClass('bg-green-600');
    });

    it('sets correct width percentage (100%)', () => {
      const { container } = render(<PasswordStrengthMeter password="VeryStr0ng!P@ssw0rd" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveStyle('width: 100%');
    });
  });

  describe('Color Classes', () => {
    it('applies correct color for score 1', () => {
      mockCalculatePasswordStrength.mockReturnValue(1);
      mockGetPasswordStrengthLabel.mockReturnValue('Weak');
      mockGetPasswordStrengthColor.mockReturnValue('bg-red-600');

      render(<PasswordStrengthMeter password="weak" />);

      const label = screen.getByText('Weak');
      expect(label).toHaveClass('text-red-600');
    });

    it('applies correct color for score 2', () => {
      mockCalculatePasswordStrength.mockReturnValue(2);
      mockGetPasswordStrengthLabel.mockReturnValue('Fair');
      mockGetPasswordStrengthColor.mockReturnValue('bg-yellow-600');

      render(<PasswordStrengthMeter password="medium" />);

      const label = screen.getByText('Fair');
      expect(label).toHaveClass('text-yellow-600');
    });

    it('applies correct color for score 3', () => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      render(<PasswordStrengthMeter password="stronger" />);

      const label = screen.getByText('Strong');
      expect(label).toHaveClass('text-blue-600');
    });

    it('applies correct color for score 4', () => {
      mockCalculatePasswordStrength.mockReturnValue(4);
      mockGetPasswordStrengthLabel.mockReturnValue('Very Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-green-600');

      render(<PasswordStrengthMeter password="strongest!" />);

      const label = screen.getByText('Very Strong');
      expect(label).toHaveClass('text-green-600');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      const { container } = render(
        <PasswordStrengthMeter password="password" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Translation Mapping', () => {
    it('translates Weak label', () => {
      mockCalculatePasswordStrength.mockReturnValue(1);
      mockGetPasswordStrengthLabel.mockReturnValue('Weak');
      mockGetPasswordStrengthColor.mockReturnValue('bg-red-600');

      render(<PasswordStrengthMeter password="w" />);

      expect(screen.getByText('Weak')).toBeInTheDocument();
    });

    it('translates Fair label', () => {
      mockCalculatePasswordStrength.mockReturnValue(2);
      mockGetPasswordStrengthLabel.mockReturnValue('Fair');
      mockGetPasswordStrengthColor.mockReturnValue('bg-yellow-600');

      render(<PasswordStrengthMeter password="fair" />);

      expect(screen.getByText('Fair')).toBeInTheDocument();
    });

    it('translates Strong label', () => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      render(<PasswordStrengthMeter password="strong" />);

      expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    it('translates Very Strong label', () => {
      mockCalculatePasswordStrength.mockReturnValue(4);
      mockGetPasswordStrengthLabel.mockReturnValue('Very Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-green-600');

      render(<PasswordStrengthMeter password="verystrong" />);

      expect(screen.getByText('Very Strong')).toBeInTheDocument();
    });

    it('uses original label if no translation exists', () => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Unknown');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      render(<PasswordStrengthMeter password="test" />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('Progress Bar Animation', () => {
    it('has transition classes on progress bar', () => {
      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      const { container } = render(<PasswordStrengthMeter password="password" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveClass('transition-all');
      expect(progressBar).toHaveClass('duration-300');
    });
  });

  describe('Segment Animation', () => {
    it('has transition classes on segments', () => {
      mockCalculatePasswordStrength.mockReturnValue(2);
      mockGetPasswordStrengthLabel.mockReturnValue('Fair');
      mockGetPasswordStrengthColor.mockReturnValue('bg-yellow-600');

      const { container } = render(<PasswordStrengthMeter password="test" />);

      const segments = container.querySelectorAll('.grid > div');
      segments.forEach((segment) => {
        expect(segment).toHaveClass('transition-all');
        expect(segment).toHaveClass('duration-300');
      });
    });
  });

  describe('Password Changes', () => {
    it('updates when password changes from empty', () => {
      mockCalculatePasswordStrength.mockReturnValue(0);

      const { container, rerender } = render(<PasswordStrengthMeter password="" />);

      expect(container.firstChild).toBeNull();

      mockCalculatePasswordStrength.mockReturnValue(3);
      mockGetPasswordStrengthLabel.mockReturnValue('Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-blue-600');

      rerender(<PasswordStrengthMeter password="newpassword" />);

      expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    it('updates when password strength changes', () => {
      mockCalculatePasswordStrength.mockReturnValue(2);
      mockGetPasswordStrengthLabel.mockReturnValue('Fair');
      mockGetPasswordStrengthColor.mockReturnValue('bg-yellow-600');

      const { rerender } = render(<PasswordStrengthMeter password="weak" />);

      expect(screen.getByText('Fair')).toBeInTheDocument();

      mockCalculatePasswordStrength.mockReturnValue(4);
      mockGetPasswordStrengthLabel.mockReturnValue('Very Strong');
      mockGetPasswordStrengthColor.mockReturnValue('bg-green-600');

      rerender(<PasswordStrengthMeter password="VeryStr0ng!P@ss" />);

      expect(screen.getByText('Very Strong')).toBeInTheDocument();
    });
  });

  describe('Zero Score', () => {
    it('handles zero score correctly', () => {
      mockCalculatePasswordStrength.mockReturnValue(0);
      mockGetPasswordStrengthLabel.mockReturnValue('');
      mockGetPasswordStrengthColor.mockReturnValue('bg-gray-200');

      const { container } = render(<PasswordStrengthMeter password="a" />);

      const progressBar = container.querySelector('.h-2 > div');
      expect(progressBar).toHaveStyle('width: 0%');
    });
  });
});
