/**
 * Régression #5167 — le drapeau original/traduit et la coche du menu de
 * langue de `MessageActionsBar` doivent canonicaliser la comparaison de
 * langue (SSOT `isSameLanguage`), pas comparer les codes verbatim en `===`.
 *
 * Scénario de preuve de l'issue : lecteur dont la langue affichée est `'en'`,
 * message dont `originalLanguage` est région-tagué `'en-US'` (cas des messages
 * écrits avant la canonicalisation à l'écriture). `'en' === 'en-US'` est
 * `false`, mais les deux désignent la même langue — le drapeau doit se
 * comporter comme si l'original était affiché.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageActionsBar } from '@/components/common/bubble-message/MessageActionsBar';
import type { Message } from '@meeshy/shared/types/conversation';

jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: (namespace?: string) => ({
    t: (key: string) => `${namespace ? `${namespace}.` : ''}${key}`,
  }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, onTouchEnd, ...props }: any) => (
    <button onClick={onClick} onTouchEnd={onTouchEnd} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <>{children}</>,
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <div onClick={onClick} data-testid="dropdown-item">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
}));

const getLanguageInfo = (code: string) => {
  const langs: Record<string, { name: string; flag: string; code: string }> = {
    en: { code: 'en', name: 'English', flag: '🇬🇧' },
    'en-US': { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    fr: { code: 'fr', name: 'French', flag: '🇫🇷' },
  };
  return langs[code] ?? { code, name: code, flag: '?' };
};

const baseMessage = { id: 'm1', content: 'Bonjour', attachments: [] } as unknown as Message;

const noop = () => {};

function renderBar(overrides: Partial<React.ComponentProps<typeof MessageActionsBar>> = {}) {
  return render(
    <MessageActionsBar
      message={baseMessage}
      isOwnMessage={false}
      canReportMessage={false}
      canEditMessage={false}
      canDeleteMessage={false}
      onReaction={noop}
      onCopy={noop}
      t={((key: string) => key) as any}
      tReport={(key: string) => key}
      currentDisplayLanguage="en"
      originalLanguage="en-US"
      userLanguage="fr"
      availableVersions={[
        { language: 'en-US', content: 'Original text', isOriginal: true },
        { language: 'fr', content: 'Texte traduit', isOriginal: false },
      ]}
      onLanguageSwitch={noop}
      getLanguageInfo={getLanguageInfo}
      {...overrides}
    />
  );
}

describe('MessageActionsBar — canonicalisation du Prisme (#5167)', () => {
  it('highlights the flag as "showing original" when displayed language only differs by region tag', () => {
    renderBar();
    expect(screen.getByLabelText('showInUserLanguage')).toBeInTheDocument();
    expect(screen.queryByLabelText('showOriginal')).not.toBeInTheDocument();
  });

  it('toggles to the user language (not back to a differently-tagged original) when the flag is clicked', () => {
    const onLanguageSwitch = jest.fn();
    renderBar({ onLanguageSwitch });
    fireEvent.click(screen.getByLabelText('showInUserLanguage'));
    expect(onLanguageSwitch).toHaveBeenCalledWith('fr');
  });

  it('marks the original row of the language menu as currently displayed', () => {
    renderBar();
    const originalLabel = screen.getByText('English (US)').closest('button');
    expect(originalLabel).not.toBeNull();
    // The "currently displayed" checkmark is the CheckCircle2 icon, rendered
    // as an svg sibling only on the row matching currentDisplayLanguage.
    expect(originalLabel!.querySelector('svg')).toBeInTheDocument();
  });

  it('does not mark a translation row as displayed when it is not the displayed language', () => {
    renderBar();
    const frenchLabel = screen.getByText('French').closest('button');
    expect(frenchLabel).not.toBeNull();
    expect(frenchLabel!.querySelector('svg')).not.toBeInTheDocument();
  });

  it('falls back to "showOriginal" when the displayed language genuinely differs', () => {
    renderBar({ currentDisplayLanguage: 'fr' });
    expect(screen.getByLabelText('showOriginal')).toBeInTheDocument();
  });
});
