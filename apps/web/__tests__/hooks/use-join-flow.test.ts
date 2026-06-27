/**
 * Tests for hooks/use-join-flow.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useJoinFlow } from '@/hooks/use-join-flow';

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts in welcome mode', () => {
    const { result } = renderHook(() => useJoinFlow());
    expect(result.current.authMode).toBe('welcome');
  });

  it('anonymous form is not shown initially', () => {
    const { result } = renderHook(() => useJoinFlow());
    expect(result.current.showAnonymousForm).toBe(false);
  });

  it('anonymous form has correct defaults', () => {
    const { result } = renderHook(() => useJoinFlow());
    const { anonymousForm } = result.current;
    expect(anonymousForm.firstName).toBe('');
    expect(anonymousForm.lastName).toBe('');
    expect(anonymousForm.username).toBe('');
    expect(anonymousForm.email).toBe('');
    expect(anonymousForm.birthday).toBe('');
    expect(anonymousForm.language).toBe('fr');
  });
});

// ─── authMode ─────────────────────────────────────────────────────────────────

describe('setAuthMode', () => {
  it('updates authMode when setAuthMode is called', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.setAuthMode('login');
    });
    expect(result.current.authMode).toBe('login');
  });

  it('transitions to register mode', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.setAuthMode('register');
    });
    expect(result.current.authMode).toBe('register');
  });
});

// ─── showAnonymousForm ────────────────────────────────────────────────────────

describe('setShowAnonymousForm', () => {
  it('shows anonymous form when set to true', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.setShowAnonymousForm(true);
    });
    expect(result.current.showAnonymousForm).toBe(true);
  });

  it('hides anonymous form when set to false', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.setShowAnonymousForm(true);
    });
    act(() => {
      result.current.setShowAnonymousForm(false);
    });
    expect(result.current.showAnonymousForm).toBe(false);
  });
});

// ─── updateAnonymousForm ──────────────────────────────────────────────────────

describe('updateAnonymousForm', () => {
  it('updates a single field', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('email', 'alice@example.com');
    });
    expect(result.current.anonymousForm.email).toBe('alice@example.com');
  });

  it('updates language field', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('language', 'en');
    });
    expect(result.current.anonymousForm.language).toBe('en');
  });

  it('preserves other fields when one is updated', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('email', 'test@test.com');
    });
    act(() => {
      result.current.updateAnonymousForm('birthday', '1990-01-01');
    });
    expect(result.current.anonymousForm.email).toBe('test@test.com');
    expect(result.current.anonymousForm.birthday).toBe('1990-01-01');
  });

  it('auto-generates username when firstName and lastName are set and username is empty', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('firstName', 'Alice');
    });
    act(() => {
      result.current.updateAnonymousForm('lastName', 'Smith');
    });
    expect(result.current.anonymousForm.username).not.toBe('');
    expect(result.current.anonymousForm.username).toContain('alice');
    expect(result.current.anonymousForm.username).toContain('smith');
  });

  it('does not overwrite username when already set', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('username', 'my_custom_user');
    });
    act(() => {
      result.current.updateAnonymousForm('firstName', 'Bob');
    });
    act(() => {
      result.current.updateAnonymousForm('lastName', 'Jones');
    });
    // username should not be auto-overwritten since it was manually set
    expect(result.current.anonymousForm.username).toBe('my_custom_user');
  });
});

// ─── resetAnonymousForm ───────────────────────────────────────────────────────

describe('resetAnonymousForm', () => {
  it('resets all form fields to defaults', () => {
    const { result } = renderHook(() => useJoinFlow());
    act(() => {
      result.current.updateAnonymousForm('firstName', 'Alice');
      result.current.updateAnonymousForm('email', 'alice@test.com');
    });
    act(() => {
      result.current.resetAnonymousForm();
    });
    const { anonymousForm } = result.current;
    expect(anonymousForm.firstName).toBe('');
    expect(anonymousForm.lastName).toBe('');
    expect(anonymousForm.username).toBe('');
    expect(anonymousForm.email).toBe('');
    expect(anonymousForm.birthday).toBe('');
    expect(anonymousForm.language).toBe('fr');
  });
});

// ─── generateUsername ─────────────────────────────────────────────────────────

describe('generateUsername', () => {
  it('returns a string', () => {
    const { result } = renderHook(() => useJoinFlow());
    const username = result.current.generateUsername('Alice', 'Smith');
    expect(typeof username).toBe('string');
  });

  it('lowercases and uses first and last name', () => {
    const { result } = renderHook(() => useJoinFlow());
    const username = result.current.generateUsername('Alice', 'Smith');
    expect(username).toContain('alice');
    expect(username).toContain('smith');
  });

  it('strips non-alphabetic characters', () => {
    const { result } = renderHook(() => useJoinFlow());
    const username = result.current.generateUsername('Ál-ice', 'Sm1th!');
    // only a-z chars from each name
    expect(username).toMatch(/^[a-z_0-9]+$/);
  });

  it('appends a 3-digit numeric suffix', () => {
    const { result } = renderHook(() => useJoinFlow());
    const username = result.current.generateUsername('Alice', 'Smith');
    expect(username).toMatch(/\d{3}$/);
  });
});
