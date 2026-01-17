/**
 * Password Reset Store Tests
 * Tests for password reset flow state management with Zustand
 */

import { act } from '@testing-library/react';
import { usePasswordResetStore, MaskedUserInfo, PhoneResetStep } from '../../stores/password-reset-store';

describe('PasswordResetStore', () => {
  const mockMaskedUserInfo: MaskedUserInfo = {
    displayName: 'J*** D**',
    username: 'j***doe',
    email: 'j***@e***.com',
    avatarUrl: 'https://example.com/avatar.png',
  };

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      usePasswordResetStore.getState().reset();
    });
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = usePasswordResetStore.getState();

      // Email flow state
      expect(state.email).toBe('');
      expect(state.token).toBe('');
      expect(state.isRequestingReset).toBe(false);
      expect(state.isResettingPassword).toBe(false);
      expect(state.isVerifyingToken).toBe(false);
      expect(state.error).toBeNull();
      expect(state.successMessage).toBeNull();
      expect(state.resetRequested).toBe(false);
      expect(state.passwordReset).toBe(false);
      expect(state.requires2FA).toBe(false);

      // Phone flow state
      expect(state.phoneResetStep).toBe('phone_input');
      expect(state.phoneNumber).toBe('');
      expect(state.phoneCountryCode).toBe('');
      expect(state.phoneResetTokenId).toBe('');
      expect(state.maskedUserInfo).toBeNull();
      expect(state.isPhoneLookupLoading).toBe(false);
      expect(state.isIdentityVerifying).toBe(false);
      expect(state.isCodeVerifying).toBe(false);
      expect(state.identityAttemptsRemaining).toBeNull();
    });
  });

  describe('Email Flow Actions', () => {
    describe('setEmail', () => {
      it('should set email', () => {
        act(() => {
          usePasswordResetStore.getState().setEmail('user@example.com');
        });

        expect(usePasswordResetStore.getState().email).toBe('user@example.com');
      });

      it('should replace existing email', () => {
        act(() => {
          usePasswordResetStore.getState().setEmail('first@example.com');
          usePasswordResetStore.getState().setEmail('second@example.com');
        });

        expect(usePasswordResetStore.getState().email).toBe('second@example.com');
      });
    });

    describe('setToken', () => {
      it('should set reset token', () => {
        act(() => {
          usePasswordResetStore.getState().setToken('abc123token');
        });

        expect(usePasswordResetStore.getState().token).toBe('abc123token');
      });
    });

    describe('setError', () => {
      it('should set error and clear success message', () => {
        act(() => {
          usePasswordResetStore.getState().setSuccessMessage('Previous success');
          usePasswordResetStore.getState().setError('Something went wrong');
        });

        const state = usePasswordResetStore.getState();
        expect(state.error).toBe('Something went wrong');
        expect(state.successMessage).toBeNull();
      });
    });

    describe('setSuccessMessage', () => {
      it('should set success message and clear error', () => {
        act(() => {
          usePasswordResetStore.getState().setError('Previous error');
          usePasswordResetStore.getState().setSuccessMessage('Operation successful');
        });

        const state = usePasswordResetStore.getState();
        expect(state.successMessage).toBe('Operation successful');
        expect(state.error).toBeNull();
      });
    });

    describe('clearError', () => {
      it('should clear error', () => {
        act(() => {
          usePasswordResetStore.getState().setError('Some error');
          usePasswordResetStore.getState().clearError();
        });

        expect(usePasswordResetStore.getState().error).toBeNull();
      });
    });

    describe('clearSuccess', () => {
      it('should clear success message', () => {
        act(() => {
          usePasswordResetStore.getState().setSuccessMessage('Some success');
          usePasswordResetStore.getState().clearSuccess();
        });

        expect(usePasswordResetStore.getState().successMessage).toBeNull();
      });
    });

    describe('Loading States', () => {
      it('should set isRequestingReset', () => {
        act(() => {
          usePasswordResetStore.getState().setIsRequestingReset(true);
        });
        expect(usePasswordResetStore.getState().isRequestingReset).toBe(true);

        act(() => {
          usePasswordResetStore.getState().setIsRequestingReset(false);
        });
        expect(usePasswordResetStore.getState().isRequestingReset).toBe(false);
      });

      it('should set isResettingPassword', () => {
        act(() => {
          usePasswordResetStore.getState().setIsResettingPassword(true);
        });
        expect(usePasswordResetStore.getState().isResettingPassword).toBe(true);
      });

      it('should set isVerifyingToken', () => {
        act(() => {
          usePasswordResetStore.getState().setIsVerifyingToken(true);
        });
        expect(usePasswordResetStore.getState().isVerifyingToken).toBe(true);
      });
    });

    describe('Status Flags', () => {
      it('should set resetRequested', () => {
        act(() => {
          usePasswordResetStore.getState().setResetRequested(true);
        });
        expect(usePasswordResetStore.getState().resetRequested).toBe(true);
      });

      it('should set passwordReset', () => {
        act(() => {
          usePasswordResetStore.getState().setPasswordReset(true);
        });
        expect(usePasswordResetStore.getState().passwordReset).toBe(true);
      });

      it('should set requires2FA', () => {
        act(() => {
          usePasswordResetStore.getState().setRequires2FA(true);
        });
        expect(usePasswordResetStore.getState().requires2FA).toBe(true);
      });
    });
  });

  describe('Phone Flow Actions', () => {
    describe('setPhoneResetStep', () => {
      it('should set phone reset step', () => {
        const steps: PhoneResetStep[] = ['phone_input', 'identity_verification', 'code_entry', 'completed'];

        steps.forEach(step => {
          act(() => {
            usePasswordResetStore.getState().setPhoneResetStep(step);
          });
          expect(usePasswordResetStore.getState().phoneResetStep).toBe(step);
        });
      });
    });

    describe('setPhoneNumber', () => {
      it('should set phone number', () => {
        act(() => {
          usePasswordResetStore.getState().setPhoneNumber('+1234567890');
        });
        expect(usePasswordResetStore.getState().phoneNumber).toBe('+1234567890');
      });
    });

    describe('setPhoneCountryCode', () => {
      it('should set phone country code', () => {
        act(() => {
          usePasswordResetStore.getState().setPhoneCountryCode('US');
        });
        expect(usePasswordResetStore.getState().phoneCountryCode).toBe('US');
      });

      it('should handle various country codes', () => {
        const countryCodes = ['US', 'FR', 'DE', 'JP', 'CN', 'BR'];

        countryCodes.forEach(code => {
          act(() => {
            usePasswordResetStore.getState().setPhoneCountryCode(code);
          });
          expect(usePasswordResetStore.getState().phoneCountryCode).toBe(code);
        });
      });
    });

    describe('setPhoneResetTokenId', () => {
      it('should set phone reset token ID', () => {
        act(() => {
          usePasswordResetStore.getState().setPhoneResetTokenId('token-abc-123');
        });
        expect(usePasswordResetStore.getState().phoneResetTokenId).toBe('token-abc-123');
      });
    });

    describe('setMaskedUserInfo', () => {
      it('should set masked user info', () => {
        act(() => {
          usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
        });

        const info = usePasswordResetStore.getState().maskedUserInfo;
        expect(info).toEqual(mockMaskedUserInfo);
        expect(info?.displayName).toBe('J*** D**');
        expect(info?.email).toBe('j***@e***.com');
      });

      it('should clear masked user info when set to null', () => {
        act(() => {
          usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
          usePasswordResetStore.getState().setMaskedUserInfo(null);
        });

        expect(usePasswordResetStore.getState().maskedUserInfo).toBeNull();
      });
    });

    describe('Phone Loading States', () => {
      it('should set isPhoneLookupLoading', () => {
        act(() => {
          usePasswordResetStore.getState().setIsPhoneLookupLoading(true);
        });
        expect(usePasswordResetStore.getState().isPhoneLookupLoading).toBe(true);
      });

      it('should set isIdentityVerifying', () => {
        act(() => {
          usePasswordResetStore.getState().setIsIdentityVerifying(true);
        });
        expect(usePasswordResetStore.getState().isIdentityVerifying).toBe(true);
      });

      it('should set isCodeVerifying', () => {
        act(() => {
          usePasswordResetStore.getState().setIsCodeVerifying(true);
        });
        expect(usePasswordResetStore.getState().isCodeVerifying).toBe(true);
      });
    });

    describe('setIdentityAttemptsRemaining', () => {
      it('should set identity attempts remaining', () => {
        act(() => {
          usePasswordResetStore.getState().setIdentityAttemptsRemaining(3);
        });
        expect(usePasswordResetStore.getState().identityAttemptsRemaining).toBe(3);
      });

      it('should allow setting to 0', () => {
        act(() => {
          usePasswordResetStore.getState().setIdentityAttemptsRemaining(0);
        });
        expect(usePasswordResetStore.getState().identityAttemptsRemaining).toBe(0);
      });

      it('should allow clearing (null)', () => {
        act(() => {
          usePasswordResetStore.getState().setIdentityAttemptsRemaining(3);
          usePasswordResetStore.getState().setIdentityAttemptsRemaining(null);
        });
        expect(usePasswordResetStore.getState().identityAttemptsRemaining).toBeNull();
      });
    });

    describe('resetPhoneFlow', () => {
      it('should reset all phone flow state', () => {
        // Set up phone flow state
        act(() => {
          usePasswordResetStore.getState().setPhoneResetStep('code_entry');
          usePasswordResetStore.getState().setPhoneNumber('+1234567890');
          usePasswordResetStore.getState().setPhoneCountryCode('US');
          usePasswordResetStore.getState().setPhoneResetTokenId('token-123');
          usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
          usePasswordResetStore.getState().setIsPhoneLookupLoading(true);
          usePasswordResetStore.getState().setIsIdentityVerifying(true);
          usePasswordResetStore.getState().setIsCodeVerifying(true);
          usePasswordResetStore.getState().setIdentityAttemptsRemaining(2);
          usePasswordResetStore.getState().setError('Some error');
        });

        // Reset phone flow
        act(() => {
          usePasswordResetStore.getState().resetPhoneFlow();
        });

        const state = usePasswordResetStore.getState();
        expect(state.phoneResetStep).toBe('phone_input');
        expect(state.phoneNumber).toBe('');
        expect(state.phoneCountryCode).toBe('');
        expect(state.phoneResetTokenId).toBe('');
        expect(state.maskedUserInfo).toBeNull();
        expect(state.isPhoneLookupLoading).toBe(false);
        expect(state.isIdentityVerifying).toBe(false);
        expect(state.isCodeVerifying).toBe(false);
        expect(state.identityAttemptsRemaining).toBeNull();
        expect(state.error).toBeNull();
      });

      it('should not affect email flow state', () => {
        act(() => {
          usePasswordResetStore.getState().setEmail('test@example.com');
          usePasswordResetStore.getState().setResetRequested(true);
          usePasswordResetStore.getState().resetPhoneFlow();
        });

        const state = usePasswordResetStore.getState();
        expect(state.email).toBe('test@example.com');
        expect(state.resetRequested).toBe(true);
      });
    });
  });

  describe('Global Reset', () => {
    describe('reset', () => {
      it('should reset all state to initial values', () => {
        // Set up various state
        act(() => {
          usePasswordResetStore.getState().setEmail('test@example.com');
          usePasswordResetStore.getState().setToken('token-123');
          usePasswordResetStore.getState().setResetRequested(true);
          usePasswordResetStore.getState().setPasswordReset(true);
          usePasswordResetStore.getState().setPhoneResetStep('code_entry');
          usePasswordResetStore.getState().setPhoneNumber('+1234567890');
          usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
          usePasswordResetStore.getState().setError('Error');
          usePasswordResetStore.getState().setSuccessMessage('Success');
        });

        // Reset all
        act(() => {
          usePasswordResetStore.getState().reset();
        });

        const state = usePasswordResetStore.getState();

        // Email flow
        expect(state.email).toBe('');
        expect(state.token).toBe('');
        expect(state.resetRequested).toBe(false);
        expect(state.passwordReset).toBe(false);
        expect(state.error).toBeNull();
        expect(state.successMessage).toBeNull();

        // Phone flow
        expect(state.phoneResetStep).toBe('phone_input');
        expect(state.phoneNumber).toBe('');
        expect(state.maskedUserInfo).toBeNull();
      });
    });
  });

  describe('Workflow Scenarios', () => {
    it('should support email reset flow', () => {
      // Step 1: Enter email
      act(() => {
        usePasswordResetStore.getState().setEmail('user@example.com');
      });

      // Step 2: Request reset
      act(() => {
        usePasswordResetStore.getState().setIsRequestingReset(true);
      });

      // Step 3: Reset requested successfully
      act(() => {
        usePasswordResetStore.getState().setIsRequestingReset(false);
        usePasswordResetStore.getState().setResetRequested(true);
        usePasswordResetStore.getState().setSuccessMessage('Check your email');
      });

      expect(usePasswordResetStore.getState().resetRequested).toBe(true);
      expect(usePasswordResetStore.getState().successMessage).toBe('Check your email');

      // Step 4: User clicks link with token
      act(() => {
        usePasswordResetStore.getState().setToken('reset-token-from-email');
        usePasswordResetStore.getState().setIsVerifyingToken(true);
      });

      // Step 5: Token verified, reset password
      act(() => {
        usePasswordResetStore.getState().setIsVerifyingToken(false);
        usePasswordResetStore.getState().setIsResettingPassword(true);
      });

      // Step 6: Password reset complete
      act(() => {
        usePasswordResetStore.getState().setIsResettingPassword(false);
        usePasswordResetStore.getState().setPasswordReset(true);
      });

      expect(usePasswordResetStore.getState().passwordReset).toBe(true);
    });

    it('should support phone reset flow', () => {
      // Step 1: Enter phone
      act(() => {
        usePasswordResetStore.getState().setPhoneNumber('+1234567890');
        usePasswordResetStore.getState().setPhoneCountryCode('US');
      });

      // Step 2: Lookup phone
      act(() => {
        usePasswordResetStore.getState().setIsPhoneLookupLoading(true);
      });

      // Step 3: Phone found, show identity verification
      act(() => {
        usePasswordResetStore.getState().setIsPhoneLookupLoading(false);
        usePasswordResetStore.getState().setPhoneResetTokenId('token-123');
        usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
        usePasswordResetStore.getState().setIdentityAttemptsRemaining(3);
        usePasswordResetStore.getState().setPhoneResetStep('identity_verification');
      });

      expect(usePasswordResetStore.getState().phoneResetStep).toBe('identity_verification');
      expect(usePasswordResetStore.getState().maskedUserInfo).toEqual(mockMaskedUserInfo);

      // Step 4: Identity verified
      act(() => {
        usePasswordResetStore.getState().setIsIdentityVerifying(true);
      });

      act(() => {
        usePasswordResetStore.getState().setIsIdentityVerifying(false);
        usePasswordResetStore.getState().setPhoneResetStep('code_entry');
      });

      // Step 5: Enter code and verify
      act(() => {
        usePasswordResetStore.getState().setIsCodeVerifying(true);
      });

      // Step 6: Complete
      act(() => {
        usePasswordResetStore.getState().setIsCodeVerifying(false);
        usePasswordResetStore.getState().setPhoneResetStep('completed');
      });

      expect(usePasswordResetStore.getState().phoneResetStep).toBe('completed');
    });

    it('should handle failed identity verification', () => {
      act(() => {
        usePasswordResetStore.getState().setIdentityAttemptsRemaining(3);
        usePasswordResetStore.getState().setPhoneResetStep('identity_verification');
      });

      // Failed attempt
      act(() => {
        usePasswordResetStore.getState().setIdentityAttemptsRemaining(2);
        usePasswordResetStore.getState().setError('Incorrect answer');
      });

      expect(usePasswordResetStore.getState().identityAttemptsRemaining).toBe(2);
      expect(usePasswordResetStore.getState().error).toBe('Incorrect answer');
    });
  });

  describe('Persistence', () => {
    it('should persist email flow state', () => {
      act(() => {
        usePasswordResetStore.getState().setEmail('test@example.com');
        usePasswordResetStore.getState().setResetRequested(true);
      });

      const state = usePasswordResetStore.getState();
      expect(state.email).toBe('test@example.com');
      expect(state.resetRequested).toBe(true);
    });

    it('should persist phone flow state', () => {
      act(() => {
        usePasswordResetStore.getState().setPhoneNumber('+1234567890');
        usePasswordResetStore.getState().setPhoneCountryCode('US');
        usePasswordResetStore.getState().setPhoneResetStep('identity_verification');
        usePasswordResetStore.getState().setPhoneResetTokenId('token-123');
        usePasswordResetStore.getState().setMaskedUserInfo(mockMaskedUserInfo);
      });

      const state = usePasswordResetStore.getState();
      expect(state.phoneNumber).toBe('+1234567890');
      expect(state.phoneResetStep).toBe('identity_verification');
      expect(state.maskedUserInfo).toEqual(mockMaskedUserInfo);
    });
  });
});
