/**
 * Tests for hooks/use-registration-wizard.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useRegistrationWizard, WIZARD_STEPS } from '@/hooks/use-registration-wizard';

jest.mock('@/stores/auth-form-store', () => ({
  useAuthFormStore: jest.fn(),
}));

import { useAuthFormStore } from '@/stores/auth-form-store';
const mockUseAuthFormStore = useAuthFormStore as jest.Mock;

const STORAGE_KEY = 'meeshy_signup_wizard_temp_data';

beforeEach(() => {
  mockUseAuthFormStore.mockReturnValue({ identifier: '' });
  localStorage.clear();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts at step 0', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.currentStep).toBe(0);
  });

  it('isFirstStep is true initially', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.isFirstStep).toBe(true);
  });

  it('isLastStep is false initially', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.isLastStep).toBe(false);
  });

  it('direction starts at 1', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.direction).toBe(1);
  });

  it('initializes formData with empty strings and default languages', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.username).toBe('');
    expect(result.current.formData.password).toBe('');
    expect(result.current.formData.systemLanguage).toBe('fr');
    expect(result.current.formData.regionalLanguage).toBe('en');
  });

  it('includes all 5 steps when no linkId is provided', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.activeSteps).toHaveLength(5);
  });
});

// ─── linkId skips username step ───────────────────────────────────────────────

describe('when linkId is provided', () => {
  it('removes the username step', () => {
    const { result } = renderHook(() => useRegistrationWizard({ linkId: 'some-link' }));
    expect(result.current.totalSteps).toBe(4);
    expect(result.current.activeSteps.some(s => s.id === 'username')).toBe(false);
  });
});

// ─── shared identifier pre-fill ───────────────────────────────────────────────

describe('shared identifier pre-fill', () => {
  it('pre-fills email when identifier contains @', () => {
    mockUseAuthFormStore.mockReturnValue({ identifier: 'alice@example.com' });
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.email).toBe('alice@example.com');
    expect(result.current.formData.phoneNumber).toBe('');
  });

  it('pre-fills phone when identifier starts with +digit', () => {
    mockUseAuthFormStore.mockReturnValue({ identifier: '+33612345678' });
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.phoneNumber).toBe('+33612345678');
    expect(result.current.formData.email).toBe('');
  });

  it('leaves both empty when identifier is a plain username', () => {
    mockUseAuthFormStore.mockReturnValue({ identifier: 'alice' });
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.email).toBe('');
    expect(result.current.formData.phoneNumber).toBe('');
  });
});

// ─── navigation ───────────────────────────────────────────────────────────────

describe('nextStep', () => {
  it('advances to step 1', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.nextStep(); });
    expect(result.current.currentStep).toBe(1);
  });

  it('sets direction to 1', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.nextStep(); });
    expect(result.current.direction).toBe(1);
  });

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    // Advance to the last step (index 4)
    for (let i = 0; i < 4; i++) {
      act(() => { result.current.nextStep(); });
    }
    expect(result.current.isLastStep).toBe(true);
    act(() => { result.current.nextStep(); });
    expect(result.current.currentStep).toBe(4);
  });

  it('calls onStepChange with the new step index', () => {
    const onStepChange = jest.fn();
    const { result } = renderHook(() => useRegistrationWizard({ onStepChange }));
    act(() => { result.current.nextStep(); });
    expect(onStepChange).toHaveBeenCalledWith(1);
  });
});

describe('prevStep', () => {
  it('goes back to step 0 from step 1', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.nextStep(); });
    act(() => { result.current.prevStep(); });
    expect(result.current.currentStep).toBe(0);
  });

  it('sets direction to -1', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.nextStep(); });
    act(() => { result.current.prevStep(); });
    expect(result.current.direction).toBe(-1);
  });

  it('does not go below step 0', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.prevStep(); });
    expect(result.current.currentStep).toBe(0);
  });
});

describe('goToStep', () => {
  it('can navigate to a previously visited step', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.nextStep(); });
    act(() => { result.current.nextStep(); });
    act(() => { result.current.goToStep(0); });
    expect(result.current.currentStep).toBe(0);
  });

  it('does not navigate forward beyond current step', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.goToStep(3); });
    expect(result.current.currentStep).toBe(0);
  });

  it('does not navigate to negative step', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.goToStep(-1); });
    expect(result.current.currentStep).toBe(0);
  });
});

// ─── updateFormData ───────────────────────────────────────────────────────────

describe('updateFormData', () => {
  it('merges partial updates into formData', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.updateFormData({ username: 'alice' }); });
    expect(result.current.formData.username).toBe('alice');
    expect(result.current.formData.password).toBe('');
  });

  it('persists form data to localStorage without password', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => {
      result.current.updateFormData({ username: 'bob', password: 'secret' });
    });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(saved.username).toBe('bob');
    expect(saved.password).toBeUndefined();
  });
});

// ─── localStorage restore ─────────────────────────────────────────────────────

describe('localStorage restore', () => {
  it('restores saved form data on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'restored', email: 'r@test.com' }));
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.username).toBe('restored');
  });

  it('does not restore password from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: 'alice', password: 'stored-pass' }));
    const { result } = renderHook(() => useRegistrationWizard());
    expect(result.current.formData.password).toBe('');
  });

  it('clears corrupted storage and continues with defaults', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json{{{');
    const { result } = renderHook(() => useRegistrationWizard());
    // Corrupted data is removed; the hook continues with default values
    expect(result.current.formData.username).toBe('');
    expect(result.current.formData.systemLanguage).toBe('fr');
  });
});

// ─── clearFormStorage ─────────────────────────────────────────────────────────

describe('clearFormStorage', () => {
  it('removes the storage key', () => {
    const { result } = renderHook(() => useRegistrationWizard());
    act(() => { result.current.updateFormData({ username: 'alice' }); });
    act(() => { result.current.clearFormStorage(); });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ─── WIZARD_STEPS export ──────────────────────────────────────────────────────

describe('WIZARD_STEPS', () => {
  it('has 5 steps', () => {
    expect(WIZARD_STEPS).toHaveLength(5);
  });

  it('contains contact, identity, username, security, preferences in order', () => {
    const ids = WIZARD_STEPS.map(s => s.id);
    expect(ids).toEqual(['contact', 'identity', 'username', 'security', 'preferences']);
  });
});
