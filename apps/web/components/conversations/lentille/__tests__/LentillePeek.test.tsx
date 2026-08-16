/**
 * WL-107 (LWS-11) — `LentillePeek` : clic droit + appui long 420 ms annulé
 * par mouvement/scroll, tap court jamais intercepté, ⋮ au survol.
 *
 * behaviour-matrix:L12 — couverture WEB des deux chemins de long press
 * (preview/peek). iOS couvre le même id ailleurs (contexte natif) ; ce
 * fichier ne déclare PAS un id nouveau, il référence L12, déjà dans
 * `packages/shared/fixtures/conformance/behaviour-matrix.json`.
 *
 * NOTE D'ENVIRONNEMENT (re-prouvée) : ce jsdom n'implémente PAS le
 * constructeur `PointerEvent` (`typeof window.PointerEvent === 'undefined'`)
 * — `fireEvent.pointerDown/pointerMove/pointerUp` de `@testing-library/dom`
 * retombent alors sur un `Event` générique QUI IGNORE `clientX`/`clientY`/
 * `pointerType` passés en init dict (le constructeur `Event` natif ne les
 * reconnaît pas). D'où `firePointerEvent` ci-dessous : un `Event` brut avec
 * les propriétés assignées directement (`Object.assign`), lues par React de
 * la même façon qu'un vrai `PointerEvent` (React copie les propriétés
 * connues de l'événement natif, quel que soit son constructeur réel).
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation } from '@meeshy/shared/types';

jest.mock('@/utils/auth', () => ({
  isCurrentUserAnonymous: jest.fn(() => false),
}));

const setReadingModeMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@/stores/reading-mode-preference-store', () => ({
  useReadingModePreference: jest.fn(() => 'auto'),
  useReadingModePreferenceActions: () => ({
    getReadingMode: jest.fn(),
    setReadingMode: setReadingModeMock,
    applyReadingModeUpdate: jest.fn(),
    reset: jest.fn(),
  }),
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
      return open ? (
        <div data-testid="dropdown-content" {...rest}>
          {children}
        </div>
      ) : null;
    },
    DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuRadioGroup: ({ children, value, onValueChange }: any) =>
      ReactLib.Children.map(children, (child: any) =>
        ReactLib.cloneElement(child, { __groupValue: value, __onValueChange: onValueChange })
      ),
    DropdownMenuRadioItem: ({ children, value, disabled, __groupValue, __onValueChange, ...rest }: any) => (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={__groupValue === value}
        disabled={disabled}
        onClick={() => !disabled && __onValueChange?.(value)}
        {...rest}
      >
        {children}
      </button>
    ),
  };
});

import { LentillePeek } from '../LentillePeek';

const t = (key: string) => key;

/** Voir la note d'environnement en tête de fichier. */
function firePointerEvent(el: Element, type: string, props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  fireEvent(el, event as unknown as Event);
}

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  }) as unknown as Conversation;

/** Simule le rang parent : `role="button"` avec son propre `onClick`, exactement le contexte réel (`LentilleRow`). */
function renderInsideRow(rowOnClick: () => void, peekProps: Partial<React.ComponentProps<typeof LentillePeek>> = {}) {
  render(
    <div role="button" tabIndex={0} onClick={rowOnClick} data-testid="row-root">
      <LentillePeek conversation={makeConversation()} t={t} data-testid="peek-wrapper" {...peekProps}>
        <span>contenu du rang</span>
      </LentillePeek>
    </div>
  );
}

beforeEach(() => {
  setReadingModeMock.mockClear();
});

describe('LentillePeek — appui long 420 ms + clic droit, tap court jamais intercepté (WL-106/LWS-11)', () => {
  it('un tap court (pointerDown puis pointerUp avant 420 ms) laisse le clic atteindre le rang parent intact', () => {
    jest.useFakeTimers();
    const onRowClick = jest.fn();
    renderInsideRow(onRowClick);
    const wrapper = screen.getByTestId('peek-wrapper');

    firePointerEvent(wrapper, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    firePointerEvent(wrapper, 'pointerup', { clientX: 10, clientY: 10, pointerType: 'touch' });
    fireEvent.click(wrapper);

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('lentille-peek-menu')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('une pression de 420 ms ouvre le peek ET intercepte le clic de synthèse qui suit', () => {
    jest.useFakeTimers();
    const onRowClick = jest.fn();
    renderInsideRow(onRowClick);
    const wrapper = screen.getByTestId('peek-wrapper');

    firePointerEvent(wrapper, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => {
      jest.advanceTimersByTime(420);
    });

    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();

    fireEvent.click(wrapper);
    expect(onRowClick).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('annulé par un déplacement du pointeur de plus de quelques pixels avant le seuil', () => {
    jest.useFakeTimers();
    const onRowClick = jest.fn();
    renderInsideRow(onRowClick);
    const wrapper = screen.getByTestId('peek-wrapper');

    firePointerEvent(wrapper, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'touch' });
    firePointerEvent(wrapper, 'pointermove', { clientX: 40, clientY: 10, pointerType: 'touch' });
    act(() => {
      jest.advanceTimersByTime(420);
    });

    expect(screen.queryByTestId('lentille-peek-menu')).not.toBeInTheDocument();

    fireEvent.click(wrapper);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('annulé par un scroll pendant la pression', () => {
    jest.useFakeTimers();
    renderInsideRow(jest.fn());
    const wrapper = screen.getByTestId('peek-wrapper');

    firePointerEvent(wrapper, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      jest.advanceTimersByTime(420);
    });

    expect(screen.queryByTestId('lentille-peek-menu')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('un clic droit (onContextMenu) ouvre le peek immédiatement, sans attendre 420 ms', () => {
    renderInsideRow(jest.fn());
    const wrapper = screen.getByTestId('peek-wrapper');

    fireEvent.contextMenu(wrapper, { clientX: 5, clientY: 5 });

    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();
  });

  it('le ⋮ au survol ouvre le MÊME menu — clic direct sur le déclencheur', () => {
    renderInsideRow(jest.fn());
    const trigger = screen.getByTestId('lentille-peek-more-trigger');

    fireEvent.click(trigger);

    expect(screen.getByTestId('lentille-peek-menu')).toBeInTheDocument();
  });

  it("le clic sur le déclencheur ⋮ n'atteint jamais le onClick du rang parent (stopPropagation)", () => {
    const onRowClick = jest.fn();
    renderInsideRow(onRowClick);
    const trigger = screen.getByTestId('lentille-peek-more-trigger');

    fireEvent.click(trigger);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('un clic droit puis la sélection d\'un mode écrit UNE FOIS via setReadingMode — clic sur une entrée du menu jamais avalé par la suppression du peek', () => {
    renderInsideRow(jest.fn());
    fireEvent.contextMenu(screen.getByTestId('peek-wrapper'));

    fireEvent.click(screen.getByTestId('reading-mode-item-focal'));

    expect(setReadingModeMock).toHaveBeenCalledTimes(1);
    expect(setReadingModeMock).toHaveBeenCalledWith('conv-1', 'focal');
  });

  it('une pression longue complète puis la sélection d\'un mode écrit UNE FOIS (le clic suppressé est celui du gestionnaire de peek, jamais celui du menu)', () => {
    jest.useFakeTimers();
    renderInsideRow(jest.fn());
    const wrapper = screen.getByTestId('peek-wrapper');

    firePointerEvent(wrapper, 'pointerdown', { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => {
      jest.advanceTimersByTime(420);
    });
    // Le clic de synthèse qui suit le relâchement tactile — avalé (test dédié ci-dessus).
    fireEvent.click(wrapper);

    fireEvent.click(screen.getByTestId('reading-mode-item-script'));

    expect(setReadingModeMock).toHaveBeenCalledTimes(1);
    expect(setReadingModeMock).toHaveBeenCalledWith('conv-1', 'script');
    jest.useRealTimers();
  });
});
