/**
 * Tests unitaires pour useRegisterForm hook
 * Démontre la testabilité améliorée après refactorisation
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRegisterForm, validateUsername } from '@/hooks/use-register-form';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// Mock dependencies
jest.mock('@/hooks/use-auth');
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
jest.mock('sonner');
jest.mock('@/hooks/use-bot-protection', () => ({
  useBotProtection: () => ({
    honeypotProps: { type: 'hidden', name: 'website' },
    validateSubmission: () => ({ isHuman: true, botError: null }),
  }),
}));
jest.mock('@/stores/auth-form-store', () => ({
  useAuthFormStore: () => ({
    identifier: '',
    setIdentifier: jest.fn(),
  }),
}));

global.fetch = jest.fn();

describe('useRegisterForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      login: jest.fn(),
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(validateUsername('john_doe')).toBe(true);
      expect(validateUsername('user123')).toBe(true);
      expect(validateUsername('test-user')).toBe(true);
      expect(validateUsername('ab')).toBe(true); // Minimum 2 chars
    });

    it('should reject invalid usernames', () => {
      expect(validateUsername('a')).toBe(false); // Too short
      expect(validateUsername('12345678901234567')).toBe(false); // Too long
      expect(validateUsername('user@name')).toBe(false); // Invalid chars
      expect(validateUsername('user name')).toBe(false); // Spaces
      expect(validateUsername('user.name')).toBe(false); // Dots
    });
  });

  describe('form state management', () => {
    it('should initialize with empty form data', () => {
      const { result } = renderHook(() => useRegisterForm());

      expect(result.current.formData).toEqual({
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        systemLanguage: 'fr',
        regionalLanguage: 'en',
      });
    });

    it('should update form data', () => {
      const { result } = renderHook(() => useRegisterForm());

      act(() => {
        result.current.updateFormData({ username: 'testuser' });
      });

      expect(result.current.formData.username).toBe('testuser');
    });

    it('should toggle password visibility', () => {
      const { result } = renderHook(() => useRegisterForm());

      expect(result.current.showPassword).toBe(false);

      act(() => {
        result.current.togglePasswordVisibility();
      });

      expect(result.current.showPassword).toBe(true);
    });
  });

  describe('form submission', () => {
    it('should handle successful registration', async () => {
      const mockLogin = jest.fn();
      (useAuth as jest.Mock).mockReturnValue({ login: mockLogin });

      const mockResponse = {
        success: true,
        data: {
          user: { id: '1', username: 'testuser' },
          token: 'test-token',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useRegisterForm());

      act(() => {
        result.current.updateFormData({
          username: 'testuser',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phoneNumber: '+33612345678',
        });
      });

      const mockEvent = { preventDefault: jest.fn() } as any;

      await act(async () => {
        await result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          mockResponse.data.user,
          mockResponse.data.token
        );
      });
    });

    it('should show error for missing required fields', async () => {
      const { result } = renderHook(() => useRegisterForm());

      const mockEvent = { preventDefault: jest.fn() } as any;

      await act(async () => {
        await result.current.handleSubmit(mockEvent);
      });

      expect(toast.error).toHaveBeenCalledWith('register.fillRequiredFields');
    });

    it('should show error for invalid username', async () => {
      const { result } = renderHook(() => useRegisterForm());

      act(() => {
        result.current.updateFormData({
          username: 'a', // Too short
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phoneNumber: '+33612345678',
        });
      });

      const mockEvent = { preventDefault: jest.fn() } as any;

      await act(async () => {
        await result.current.handleSubmit(mockEvent);
      });

      expect(toast.error).toHaveBeenCalledWith('register.validation.usernameInvalid');
    });
  });

  describe('linkId mode', () => {
    it('should not require username in linkId mode', async () => {
      const mockOnJoinSuccess = jest.fn();

      const mockResponse = {
        success: true,
        data: { conversation: { id: '1' } },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() =>
        useRegisterForm({
          linkId: 'test-link-id',
          onJoinSuccess: mockOnJoinSuccess,
        })
      );

      act(() => {
        result.current.updateFormData({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          password: 'password123',
          phoneNumber: '+33612345678',
        });
      });

      const mockEvent = { preventDefault: jest.fn() } as any;

      await act(async () => {
        await result.current.handleSubmit(mockEvent);
      });

      await waitFor(() => {
        expect(mockOnJoinSuccess).toHaveBeenCalledWith(mockResponse);
      });
    });
  });
});
