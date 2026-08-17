/**
 * REV-4/B3 — behaviour-matrix:L07.
 *
 * Verdict de la porte V2 : « drapeau ON ⇒ les 6 actions historiques du ⋮ de
 * rang (épingler, sourdine, archiver…) inatteignables » — le ⋮ de
 * `LentillePeek` montait le menu de MODE de lecture, et lui seul ; le
 * dropdown historique (`ConversationItemActions`) n'est câblé que par
 * `ConversationItem`, que le drapeau ON ne rend plus.
 *
 * Ce que ces témoins verrouillent : le ⋮ Lentille monte, dans LA MÊME
 * instance de menu, les MÊMES entrées d'action que le rang historique
 * (`ConversationActionMenuItems`, extrait de `ConversationItemActions` et
 * partagé par les deux chemins) branchées sur LES MÊMES handlers
 * (`useConversationItemActions`, extrait de `ConversationItem`) — donc sur
 * le même magasin de préférences, avec les mêmes toasts et les mêmes
 * bascules. Aucune copie : la garde `lentille-actions-not-duplicated.test.ts`
 * le prouve structurellement.
 *
 * Le miroir iOS du même id décrit le geste inverse (« le menu gagnant le
 * sous-menu Mode de lecture ») : c'est la MÊME union — un seul menu qui
 * porte les actions du rang ET le catalogue de modes.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

const togglePinMock = jest.fn().mockResolvedValue(undefined);
const toggleMuteMock = jest.fn().mockResolvedValue(undefined);
const toggleArchiveMock = jest.fn().mockResolvedValue(undefined);
const setReactionMock = jest.fn().mockResolvedValue(undefined);
let storePrefs: Record<string, unknown> | undefined;

jest.mock('@/stores/conversation-preferences-store', () => ({
  useConversationPreference: () => storePrefs,
  useConversationPreferencesActions: () => ({
    togglePin: togglePinMock,
    toggleMute: toggleMuteMock,
    toggleArchive: toggleArchiveMock,
    setReaction: setReactionMock,
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const copyToClipboardMock = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => copyToClipboardMock(text),
}));

// Double du menu déroulant : le MÊME idiome que `LentillePeek.test.tsx`,
// étendu aux primitives qu'utilisent les entrées d'action historiques
// (`DropdownMenuItem`, `DropdownMenuSub*`).
jest.mock('@/components/ui/dropdown-menu', () => {
  const ReactLib = require('react');
  const Ctx = ReactLib.createContext({
    open: false,
    onOpenChange: (_open: boolean) => {},
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
    DropdownMenuItem: ({ children, onClick }: any) => (
      <button type="button" role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
    DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
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

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentillePeek } from '../LentillePeek';
import { LentilleRow } from '../LentilleRow';

const t = (key: string) => key;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'conv-1',
    type: 'group',
    title: 'Équipe produit',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  }) as unknown as Conversation;

function openRowMenu(peekProps: Partial<React.ComponentProps<typeof LentillePeek>> = {}) {
  const rowOnClick = jest.fn();
  render(
    <div role="button" tabIndex={0} onClick={rowOnClick} data-testid="row-root">
      <LentillePeek conversation={makeConversation()} t={t} {...peekProps}>
        <span>contenu du rang</span>
      </LentillePeek>
    </div>
  );
  fireEvent.click(screen.getByTestId('lentille-peek-more-trigger'));
  return rowOnClick;
}

beforeEach(() => {
  storePrefs = undefined;
  setReadingModeMock.mockClear();
  togglePinMock.mockClear();
  toggleMuteMock.mockClear();
  toggleArchiveMock.mockClear();
  setReactionMock.mockClear();
  copyToClipboardMock.mockClear();
});

describe('LentillePeek — les 6 actions historiques du ⋮ (B3, behaviour-matrix:L07)', () => {
  it('le ⋮ expose les SIX actions du rang historique, drapeau ON', () => {
    openRowMenu();

    expect(screen.getByText('conversationHeader.settings')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.pin')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.mute')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.archive')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.share')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.reactions')).toBeInTheDocument();
  });

  it('épingler écrit dans le MÊME magasin de préférences que le rang historique', () => {
    openRowMenu();
    fireEvent.click(screen.getByText('conversationHeader.pin'));
    expect(togglePinMock).toHaveBeenCalledWith('conv-1', true);
  });

  it('la bascule suit l\'état courant du magasin (déjà épinglé ⇒ désépingler)', () => {
    storePrefs = { isPinned: true, isMuted: false, isArchived: false };
    openRowMenu();
    expect(screen.getByText('conversationHeader.unpin')).toBeInTheDocument();
    fireEvent.click(screen.getByText('conversationHeader.unpin'));
    expect(togglePinMock).toHaveBeenCalledWith('conv-1', false);
  });

  it('mettre en sourdine écrit dans le MÊME magasin', () => {
    openRowMenu();
    fireEvent.click(screen.getByText('conversationHeader.mute'));
    expect(toggleMuteMock).toHaveBeenCalledWith('conv-1', true);
  });

  it('archiver écrit dans le MÊME magasin', () => {
    openRowMenu();
    fireEvent.click(screen.getByText('conversationHeader.archive'));
    expect(toggleArchiveMock).toHaveBeenCalledWith('conv-1', true);
  });

  it('une réaction écrit dans le MÊME magasin, avec l\'emoji choisi', () => {
    openRowMenu();
    fireEvent.click(screen.getByText('❤️'));
    expect(setReactionMock).toHaveBeenCalledWith('conv-1', '❤️');
  });

  it('les réglages remontent la conversation à l\'appelant (onShowDetails)', () => {
    const onShowDetails = jest.fn();
    openRowMenu({ onShowDetails });
    fireEvent.click(screen.getByText('conversationHeader.settings'));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
    expect(onShowDetails.mock.calls[0][0]).toMatchObject({ id: 'conv-1' });
  });

  it('le partage passe par le presse-papier quand navigator.share est absent', async () => {
    openRowMenu();
    fireEvent.click(screen.getByText('conversationHeader.share'));
    await Promise.resolve();
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
    expect(copyToClipboardMock.mock.calls[0][0]).toContain('conv-1');
  });

  it("aucune action n'ouvre la conversation : le clic reste confiné au menu", () => {
    const rowOnClick = openRowMenu();
    fireEvent.click(screen.getByText('conversationHeader.pin'));
    expect(rowOnClick).not.toHaveBeenCalled();
  });

  it('le catalogue de modes reste dans LE MÊME menu — une instance, pas deux', () => {
    openRowMenu();
    expect(screen.getAllByTestId('lentille-peek-menu')).toHaveLength(1);
    expect(screen.getByTestId('reading-mode-item-auto')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reading-mode-item-focal'));
    expect(setReadingModeMock).toHaveBeenCalledWith('conv-1', 'focal');
  });

  it("l'aperçu (clic droit) ouvre le MÊME menu, actions comprises", () => {
    render(
      <div role="button" tabIndex={0} onClick={jest.fn()}>
        <LentillePeek conversation={makeConversation()} t={t} data-testid="peek-wrapper">
          <span>contenu du rang</span>
        </LentillePeek>
      </div>
    );

    fireEvent.contextMenu(screen.getByTestId('peek-wrapper'));
    expect(screen.getByText('conversationHeader.pin')).toBeInTheDocument();
    expect(screen.getByTestId('reading-mode-item-auto')).toBeInTheDocument();
  });

  /**
   * R5-2 — troisième déclencheur (WL-108, l'encoche de la focus card),
   * jusque-là non prouvé PAR CE FICHIER jusqu'aux actions du rang : les deux
   * autres (⋮ ci-dessus, clic droit ci-dessus) le sont déjà. « Trois points
   * d'entrée, UNE préférence » (LentillePeek.tsx) — même magasin, même
   * `togglePin`, que le geste soit ⋮, clic droit OU encoche.
   */
  it("l'encoche (troisième déclencheur) ouvre le MÊME menu — épingler écrit dans le magasin partagé", () => {
    render(
      <div role="button" tabIndex={0} onClick={jest.fn()}>
        <LentillePeek conversation={makeConversation()} t={t} isFocused>
          <span>contenu du rang</span>
        </LentillePeek>
      </div>
    );

    fireEvent.click(screen.getByTestId('lentille-focus-card-notch'));
    fireEvent.click(screen.getByText('conversationHeader.pin'));

    expect(togglePinMock).toHaveBeenCalledWith('conv-1', true);
  });
});

/**
 * La CHAÎNE complète, drapeau ON — REV-4/B3.
 *
 * Le menu ne vaut que s'il est atteignable depuis le rang réel : ces témoins
 * partent de `LentilleRow` (le rang que le drapeau monte à la place du rang
 * historique) et vont jusqu'aux handlers du magasin, sans double de
 * `LentillePeek`.
 */
describe('LentilleRow — les actions du rang sont atteignables depuis le rang Lentille (B3)', () => {
  const currentUser = { id: 'user-1', username: 'alice', displayName: 'Alice', role: 'USER' } as never;

  function renderRow(props: Partial<React.ComponentProps<typeof LentilleRow>> = {}) {
    render(
      <LentilleRow
        conversation={makeConversation()}
        currentUser={currentUser}
        isSelected={false}
        onSelect={jest.fn()}
        t={t}
        {...props}
      />
    );
    fireEvent.click(screen.getByTestId('lentille-peek-more-trigger'));
  }

  it('le ⋮ du rang Lentille ouvre les six actions historiques', () => {
    renderRow();
    expect(screen.getByText('conversationHeader.settings')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.pin')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.mute')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.archive')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.share')).toBeInTheDocument();
    expect(screen.getByText('conversationHeader.reactions')).toBeInTheDocument();
  });

  it('une action déclenchée depuis le rang écrit dans le magasin partagé', () => {
    renderRow();
    fireEvent.click(screen.getByText('conversationHeader.archive'));
    expect(toggleArchiveMock).toHaveBeenCalledWith('conv-1', true);
  });

  it("le rang transmet `onShowDetails` jusqu'à l'entrée « réglages »", () => {
    const onShowDetails = jest.fn();
    renderRow({ onShowDetails });
    fireEvent.click(screen.getByText('conversationHeader.settings'));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
    expect(onShowDetails.mock.calls[0][0]).toMatchObject({ id: 'conv-1' });
  });

  it("ouvrir le menu depuis le rang n'ouvre pas la conversation", () => {
    const onSelect = jest.fn();
    renderRow({ onSelect });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
