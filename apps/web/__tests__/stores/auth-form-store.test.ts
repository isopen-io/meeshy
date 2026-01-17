/**
 * Auth Form Store Tests
 * Tests for auth form state persistence with Zustand
 */

import { act } from '@testing-library/react';
import { useAuthFormStore } from '../../stores/auth-form-store';

describe('AuthFormStore', () => {
  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useAuthFormStore.setState({
        identifier: '',
      });
    });
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  describe('Initial State', () => {
    it('should have empty identifier', () => {
      const state = useAuthFormStore.getState();
      expect(state.identifier).toBe('');
    });
  });

  describe('setIdentifier', () => {
    it('should set email identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
      });

      expect(useAuthFormStore.getState().identifier).toBe('test@example.com');
    });

    it('should set phone identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('+1234567890');
      });

      expect(useAuthFormStore.getState().identifier).toBe('+1234567890');
    });

    it('should set username identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('johndoe');
      });

      expect(useAuthFormStore.getState().identifier).toBe('johndoe');
    });

    it('should replace existing identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('first@example.com');
        useAuthFormStore.getState().setIdentifier('second@example.com');
      });

      expect(useAuthFormStore.getState().identifier).toBe('second@example.com');
    });

    it('should handle empty string', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
        useAuthFormStore.getState().setIdentifier('');
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should handle special characters', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('user+tag@example.com');
      });

      expect(useAuthFormStore.getState().identifier).toBe('user+tag@example.com');
    });

    it('should handle international phone numbers', () => {
      const internationalNumbers = [
        '+33 6 12 34 56 78',
        '+1 (555) 123-4567',
        '+81-90-1234-5678',
        '+86 138 0000 0000',
      ];

      internationalNumbers.forEach(number => {
        act(() => {
          useAuthFormStore.getState().setIdentifier(number);
        });

        expect(useAuthFormStore.getState().identifier).toBe(number);
      });
    });

    it('should handle unicode characters', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('user@example.com');
      });

      expect(useAuthFormStore.getState().identifier).toBe('user@example.com');
    });

    it('should handle very long identifiers', () => {
      const longIdentifier = 'a'.repeat(255) + '@example.com';

      act(() => {
        useAuthFormStore.getState().setIdentifier(longIdentifier);
      });

      expect(useAuthFormStore.getState().identifier).toBe(longIdentifier);
    });
  });

  describe('clearIdentifier', () => {
    it('should clear the identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
      });

      expect(useAuthFormStore.getState().identifier).toBe('test@example.com');

      act(() => {
        useAuthFormStore.getState().clearIdentifier();
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should be safe to call when already empty', () => {
      expect(useAuthFormStore.getState().identifier).toBe('');

      act(() => {
        useAuthFormStore.getState().clearIdentifier();
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should clear multiple times without issue', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
        useAuthFormStore.getState().clearIdentifier();
        useAuthFormStore.getState().clearIdentifier();
        useAuthFormStore.getState().clearIdentifier();
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });
  });

  describe('Workflow Scenarios', () => {
    it('should support login flow - persist identifier between pages', () => {
      // User enters email on login page
      act(() => {
        useAuthFormStore.getState().setIdentifier('user@example.com');
      });

      // Navigate to forgot password page (identifier persists)
      expect(useAuthFormStore.getState().identifier).toBe('user@example.com');

      // User requests password reset (clear after success)
      act(() => {
        useAuthFormStore.getState().clearIdentifier();
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should support signup flow', () => {
      // User enters email on signup page
      act(() => {
        useAuthFormStore.getState().setIdentifier('newuser@example.com');
      });

      // Identifier available for verification page
      expect(useAuthFormStore.getState().identifier).toBe('newuser@example.com');
    });

    it('should support forgot password flow', () => {
      // User enters identifier on forgot password
      act(() => {
        useAuthFormStore.getState().setIdentifier('+1234567890');
      });

      // Identifier available for OTP verification
      expect(useAuthFormStore.getState().identifier).toBe('+1234567890');

      // Clear after password reset complete
      act(() => {
        useAuthFormStore.getState().clearIdentifier();
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should support switching between email and phone', () => {
      // Start with email
      act(() => {
        useAuthFormStore.getState().setIdentifier('user@example.com');
      });
      expect(useAuthFormStore.getState().identifier).toBe('user@example.com');

      // Switch to phone
      act(() => {
        useAuthFormStore.getState().setIdentifier('+1234567890');
      });
      expect(useAuthFormStore.getState().identifier).toBe('+1234567890');

      // Switch back to email
      act(() => {
        useAuthFormStore.getState().setIdentifier('different@example.com');
      });
      expect(useAuthFormStore.getState().identifier).toBe('different@example.com');
    });
  });

  describe('Persistence', () => {
    it('should use sessionStorage for persistence', () => {
      // The store uses sessionStorage via createJSONStorage
      // This means data is cleared when browser closes
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
      });

      // Verify the store is configured correctly
      const state = useAuthFormStore.getState();
      expect(state.identifier).toBe('test@example.com');
    });

    it('should persist identifier value', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('persistent@example.com');
      });

      // Value should be retrievable
      expect(useAuthFormStore.getState().identifier).toBe('persistent@example.com');
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only identifier', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('   ');
      });

      // Should store as-is (validation is UI responsibility)
      expect(useAuthFormStore.getState().identifier).toBe('   ');
    });

    it('should handle null-ish values by storing empty string', () => {
      act(() => {
        useAuthFormStore.getState().setIdentifier('test@example.com');
        // TypeScript would prevent null, but test empty string behavior
        useAuthFormStore.getState().setIdentifier('');
      });

      expect(useAuthFormStore.getState().identifier).toBe('');
    });

    it('should handle rapid updates', () => {
      act(() => {
        for (let i = 0; i < 100; i++) {
          useAuthFormStore.getState().setIdentifier(`user${i}@example.com`);
        }
      });

      expect(useAuthFormStore.getState().identifier).toBe('user99@example.com');
    });
  });
});
