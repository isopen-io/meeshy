/**
 * behaviour-matrix:L12 — « … press scale 0.90 déclenché à 0.4 s et
 * EXCLUSION AVATAR 70 pt … conservée ».
 *
 * `LentillePeek.test.tsx` couvrait déjà les DEUX chemins de long press (clic
 * droit, appui long 420 ms) et le « tap court jamais intercepté ». Il ne
 * couvrait PAS la zone d'exclusion : RE-PREUVE (2026-08-17, avant ce lot)
 * `handlePointerDown` armait le minuteur pour TOUT `pointerdown` du wrapper,
 * cible comprise, sans consulter `event.target`.
 *
 * La zone d'exclusion est portée par un MARQUEUR de données
 * (`data-lentille-press-exempt`) plutôt que par une géométrie de 70 pt : le
 * web n'a pas de cote de zone tactile à répliquer (l'avatar y fait 44 px et
 * porte son propre élément), et un marqueur suit l'élément quel que soit son
 * habillage — là où une mesure en pixels dériverait au premier changement de
 * gabarit. Même intention, exprimée dans la matière du web.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation } from '@meeshy/shared/types';

jest.mock('@/utils/auth', () => ({
  isCurrentUserAnonymous: jest.fn(() => false),
}));

jest.mock('@/stores/reading-mode-preference-store', () => ({
  useReadingModePreference: jest.fn(() => 'auto'),
  useReadingModePreferenceActions: () => ({
    getReadingMode: jest.fn(),
    setReadingMode: jest.fn().mockResolvedValue(undefined),
    applyReadingModeUpdate: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('@/stores/conversation-preferences-store', () => ({
  useConversationPreference: () => undefined,
  useConversationPreferencesActions: () => ({
    togglePin: jest.fn().mockResolvedValue(undefined),
    toggleMute: jest.fn().mockResolvedValue(undefined),
    toggleArchive: jest.fn().mockResolvedValue(undefined),
    setReaction: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/components/ui/dropdown-menu', () => {
  const ReactLib = require('react');
  const Ctx = ReactLib.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({
    open: false,
    onOpenChange: () => {},
  });

  return {
    DropdownMenu: ({ children, open, onOpenChange }: any) => (
      <Ctx.Provider value={{ open: !!open, onOpenChange: onOpenChange ?? (() => {}) }}>
        <div data-testid="dropdown-menu">{children}</div>
      </Ctx.Provider>
    ),
    DropdownMenuTrigger: ReactLib.forwardRef(({ children }: any, ref: any) => {
      const { onOpenChange } = ReactLib.useContext(Ctx);
      return ReactLib.cloneElement(children, {
        ref,
        onClick: (event: React.MouseEvent) => {
          children.props.onClick?.(event);
          onOpenChange(true);
        },
      });
    }),
    DropdownMenuContent: ({ children, ...rest }: any) => {
      const { open } = ReactLib.useContext(Ctx);
      return open ? <div data-testid="dropdown-content" {...rest}>{children}</div> : null;
    },
    DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({ children, onClick }: any) => (
      <button type="button" role="menuitem" onClick={onClick}>{children}</button>
    ),
    DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuRadioGroup: ({ children }: any) => <div>{children}</div>,
    DropdownMenuRadioItem: ({ children }: any) => <div>{children}</div>,
  };
});

import { LentillePeek } from '../LentillePeek';

const t = (key: string) => key;

/** Même utilitaire que `LentillePeek.test.tsx` — jsdom n'a pas de `PointerEvent`. */
function firePointerEvent(el: Element, type: string, props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  fireEvent(el, event as unknown as Event);
}

const conversation = {
  id: 'conv-1',
  type: 'group',
  title: 'Équipe produit',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-01'),
} as unknown as Conversation;

function renderPeek() {
  render(
    <div role="button" tabIndex={0} onClick={() => {}}>
      <LentillePeek conversation={conversation} t={t} data-testid="peek-wrapper">
        <a href="/u/bob" data-lentille-press-exempt="true" data-testid="exempt-zone">
          avatar
        </a>
        <span data-testid="ordinary-zone">contenu du rang</span>
      </LentillePeek>
    </div>
  );
}

describe("LentillePeek — zone d'exclusion d'appui long (behaviour-matrix:L12)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("un appui long DANS la zone exemptée n'ouvre pas l'aperçu", () => {
    jest.useFakeTimers();
    renderPeek();

    firePointerEvent(screen.getByTestId('exempt-zone'), 'pointerdown', {
      clientX: 10,
      clientY: 10,
      pointerType: 'touch',
    });
    act(() => {
      jest.advanceTimersByTime(420);
    });

    expect(screen.queryByTestId('lentille-peek-menu')).not.toBeInTheDocument();
  });

  it("contre-épreuve : le MÊME appui long hors de la zone ouvre bien l'aperçu", () => {
    jest.useFakeTimers();
    renderPeek();

    firePointerEvent(screen.getByTestId('ordinary-zone'), 'pointerdown', {
      clientX: 10,
      clientY: 10,
      pointerType: 'touch',
    });
    act(() => {
      jest.advanceTimersByTime(420);
    });

    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();
  });

  it("le clic droit DANS la zone exemptée laisse le menu contextuel natif du lien (aucun aperçu)", () => {
    renderPeek();

    fireEvent.contextMenu(screen.getByTestId('exempt-zone'));
    expect(screen.queryByTestId('lentille-peek-menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId('ordinary-zone'));
    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();
  });
});
