/**
 * Iter 69w — a11y clavier (WCAG 2.1.1 / 4.1.2 / 4.1.2 aria-expanded) des en-têtes
 * de section repliables du modal de création de lien : `LanguagesSection` et
 * `PermissionsSection`. Avant : `CardHeader` souris-only (`onClick` sans
 * `role`/`tabIndex`/`onKeyDown`). Après : activables au clavier (Enter/Space) et
 * exposés comme `button` avec état `aria-expanded`.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { LanguagesSection } from '@/components/conversations/create-link-modal/steps/config-sections/LanguagesSection';
import { PermissionsSection } from '@/components/conversations/create-link-modal/steps/config-sections/PermissionsSection';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const buildLanguagesProps = (overrides = {}) => ({
  isLanguagesOpen: false,
  setIsLanguagesOpen: jest.fn(),
  allowedLanguages: [] as string[],
  setAllowedLanguages: jest.fn(),
  languageSearchQuery: '',
  setLanguageSearchQuery: jest.fn(),
  ...overrides,
});

const buildPermissionsProps = (overrides = {}) => ({
  isPermissionsOpen: false,
  setIsPermissionsOpen: jest.fn(),
  requireAccount: false,
  allowAnonymousMessages: true,
  setAllowAnonymousMessages: jest.fn(),
  allowAnonymousImages: true,
  setAllowAnonymousImages: jest.fn(),
  allowAnonymousFiles: true,
  setAllowAnonymousFiles: jest.fn(),
  allowViewHistory: true,
  setAllowViewHistory: jest.fn(),
  setRequireAccount: jest.fn(),
  requireNickname: false,
  setRequireNickname: jest.fn(),
  requireEmail: false,
  setRequireEmail: jest.fn(),
  requireBirthday: false,
  setRequireBirthday: jest.fn(),
  ...overrides,
});

describe('LanguagesSection collapsible header — keyboard a11y', () => {
  it('exposes the header as a focusable button reflecting collapsed state', () => {
    render(<LanguagesSection {...buildLanguagesProps({ isLanguagesOpen: false })} />);
    const header = screen.getByRole('button');
    expect(header).toHaveAttribute('tabindex', '0');
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('reflects expanded state via aria-expanded', () => {
    render(<LanguagesSection {...buildLanguagesProps({ isLanguagesOpen: true })} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles open on Enter key', () => {
    const setIsLanguagesOpen = jest.fn();
    render(<LanguagesSection {...buildLanguagesProps({ setIsLanguagesOpen })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(setIsLanguagesOpen).toHaveBeenCalledWith(true);
  });

  it('toggles open on Space key', () => {
    const setIsLanguagesOpen = jest.fn();
    render(<LanguagesSection {...buildLanguagesProps({ setIsLanguagesOpen })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(setIsLanguagesOpen).toHaveBeenCalledWith(true);
  });

  it('ignores neutral keys', () => {
    const setIsLanguagesOpen = jest.fn();
    render(<LanguagesSection {...buildLanguagesProps({ setIsLanguagesOpen })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(setIsLanguagesOpen).not.toHaveBeenCalled();
  });

  it('preserves mouse click toggle', () => {
    const setIsLanguagesOpen = jest.fn();
    render(<LanguagesSection {...buildLanguagesProps({ setIsLanguagesOpen })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(setIsLanguagesOpen).toHaveBeenCalledWith(true);
  });
});

describe('PermissionsSection collapsible header — keyboard a11y', () => {
  it('exposes the header as a focusable button reflecting collapsed state', () => {
    render(<PermissionsSection {...buildPermissionsProps({ isPermissionsOpen: false })} />);
    const header = screen.getByRole('button');
    expect(header).toHaveAttribute('tabindex', '0');
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles open on Enter key', () => {
    const setIsPermissionsOpen = jest.fn();
    render(<PermissionsSection {...buildPermissionsProps({ setIsPermissionsOpen })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(setIsPermissionsOpen).toHaveBeenCalledWith(true);
  });

  it('toggles open on Space key', () => {
    const setIsPermissionsOpen = jest.fn();
    render(<PermissionsSection {...buildPermissionsProps({ setIsPermissionsOpen })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(setIsPermissionsOpen).toHaveBeenCalledWith(true);
  });

  it('preserves mouse click toggle', () => {
    const setIsPermissionsOpen = jest.fn();
    render(<PermissionsSection {...buildPermissionsProps({ setIsPermissionsOpen })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(setIsPermissionsOpen).toHaveBeenCalledWith(true);
  });
});
