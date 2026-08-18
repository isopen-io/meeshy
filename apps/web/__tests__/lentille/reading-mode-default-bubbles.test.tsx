/**
 * « BULLES PAR DÉFAUT » — décision produit PROVISOIRE du 2026-08-17.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER FIGE, ET CE QU'IL NE FIGE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 * La décision : sans choix explicite du lecteur, le fil ouvert rend la vue à
 * BULLES — y compris drapeau ON, là où l'orchestrateur résolvait jusqu'ici
 * `auto → focal`. Le point de décision est UN SEUL :
 * `hooks/lentille/use-thread-reading-mode.ts` (`PROVISIONAL_DEFAULT_RENDER`).
 * Aucune loi partagée n'a été amendée : `resolveOrchestratorDecision` répond
 * exactement ce qu'elle répondait hier, et le témoin (c) ci-dessous le PROUVE
 * en la rejouant directement.
 *
 * Les deux témoins que la directive demande :
 *   (a) SANS CHOIX ⇒ BULLES — la décision elle-même ;
 *   (b) UN CHOIX EXPLICITE GARDE SON POUVOIR — `focal`, `script`, `riviere`
 *       (et `resume`, et `bulles`) continuent d'être résolus par la loi.
 *
 * Et deux garde-fous que la décision ne doit pas emporter avec elle :
 *   (c) la LOI n'a pas bougé (elle dit toujours `focal` pour `auto`) ;
 *   (d) le DÉFAUT N'ÉCRIT RIEN — le magasin répond toujours `auto` après un
 *       rendu, sinon « défaut » deviendrait « préférence », et la Lentille
 *       afficherait un choix que personne n'a fait.
 *
 * QUAND CE FICHIER DOIT TOMBER : le jour où la décision est retirée (elle est
 * provisoire et datée). Il tombera sur (a) et (d) restera vrai — c'est le
 * signal attendu, pas une surprise.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Message, SocketIOUser as User } from '@meeshy/shared/types';

Element.prototype.scrollTo = jest.fn();

let mockFocalActive = false;
jest.mock('@/hooks/lentille/use-reading-modes-flag', () => ({
  useReadingModesFlag: () => ({ active: mockFocalActive }),
}));

jest.mock('@/components/conversations/focal/FocalThread', () => ({
  FocalThread: (props: { density?: string }) => (
    <div data-testid="focal-thread-mount" data-density={props.density} />
  ),
}));

jest.mock('next/dynamic', () => {
  return function dynamic(importFn: () => Promise<unknown>) {
    function DynamicWrapper(props: object) {
      const [Comp, setComp] = React.useState<React.ComponentType<unknown> | null>(null);
      React.useEffect(() => {
        let mounted = true;
        importFn().then((mod: unknown) => {
          if (!mounted) return;
          const resolved =
            typeof mod === 'function'
              ? mod
              : (mod as Record<string, unknown>).default ||
                Object.values(mod as Record<string, unknown>)[0];
          setComp(() => resolved as React.ComponentType<unknown>);
        });
        return () => {
          mounted = false;
        };
      }, []);
      if (!Comp) return null;
      const Resolved = Comp;
      return <Resolved {...props} />;
    }
    DynamicWrapper.displayName = 'DynamicComponent';
    return DynamicWrapper;
  };
});

jest.mock('@/hooks/use-fix-z-index', () => ({ useFixRadixZIndex: jest.fn() }));
jest.mock('@/components/common/messages-display', () => ({
  MessagesDisplay: (props: { readingMode?: string }) => (
    <div data-testid="messages-display" data-reading-mode={props.readingMode} />
  ),
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...props}>{children as React.ReactNode}</button>
  ),
}));
jest.mock('@meeshy/shared/utils/sender-identity', () => ({
  getSenderUserId: (sender: { id?: string } | null | undefined) => sender?.id,
}));
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    setGetMessageByIdCallback: jest.fn(),
    onStatusChange: jest.fn(() => () => {}),
  },
}));

import { resolveOrchestratorDecision } from '@meeshy/shared/utils/reading-modes';
import { ConversationMessages } from '@/components/conversations/ConversationMessages';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';
import { useReadingModeStore } from '@/stores/reading-mode-store';
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';

const CONVERSATION_ID = 'conv-1';

function createMockUser(): User {
  return { id: 'user-1', username: 'testuser', displayName: 'Test User' } as User;
}

function createMockMessage(id: string): Message {
  const now = new Date();
  return {
    id,
    conversationId: CONVERSATION_ID,
    senderId: 'user-2',
    content: `Message ${id}`,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isEncrypted: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    createdAt: now,
    updatedAt: now,
    timestamp: now,
    translations: [],
    sender: { id: 'user-2', username: 'sender', displayName: 'Sender' },
  } as unknown as Message;
}

const defaultProps = {
  messages: [createMockMessage('msg-1')],
  translatedMessages: [],
  isLoadingMessages: false,
  isLoadingMore: false,
  hasMore: false,
  currentUser: createMockUser(),
  userLanguage: 'en',
  usedLanguages: ['en'],
  isMobile: false,
  userRole: 'USER',
  conversationId: CONVERSATION_ID,
  addTranslatingState: jest.fn(),
  isTranslating: jest.fn(() => false),
  onEditMessage: jest.fn(),
  onDeleteMessage: jest.fn(),
  onLoadMore: jest.fn(),
  t: (key: string) => key,
  tCommon: (key: string) => key,
};

const chooseExplicitly = async (value: ReadingModePreference) => {
  await act(async () => {
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_ID, value);
  });
};

beforeEach(() => {
  mockFocalActive = false;
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
});

// ---------------------------------------------------------------------------
// (a) LA DÉCISION — sans choix ⇒ Bulles
// ---------------------------------------------------------------------------

describe('décision produit provisoire 2026-08-17 — sans choix, le fil rend « Bulles »', () => {
  it('drapeau ON, aucune préférence mémorisée ⇒ vue à bulles, PAS le fil plat', async () => {
    mockFocalActive = true;

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    const historical = await screen.findByTestId('messages-display');
    expect(historical).toHaveAttribute('data-reading-mode', 'bubble');
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  it('la lentille est nommée EXPLICITEMENT `bubble` — pas déduite de la prop du parent', async () => {
    mockFocalActive = true;

    // Le parent porte encore `focal` (la façade traduit `auto → focal`) :
    // sans lentille explicite, la vue historique monterait la rangée PLATE du
    // tronc, et « Bulles par défaut » n'aurait rendu aucune bulle.
    render(<ConversationMessages {...defaultProps} reverseOrder readingMode="focal" />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
  });

  it('un fil SANS identité de conversation obéit au même défaut', async () => {
    mockFocalActive = true;

    render(<ConversationMessages {...defaultProps} conversationId={undefined} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
  });
});

// ---------------------------------------------------------------------------
// (b) LE TÉMOIN INVERSE — un choix explicite garde son pouvoir
// ---------------------------------------------------------------------------

describe('décision produit provisoire 2026-08-17 — un choix explicite garde tout son pouvoir', () => {
  it('« Focal » choisi ⇒ le fil plat en densité focal, malgré le défaut', async () => {
    mockFocalActive = true;
    await chooseExplicitly('focal');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'focal'
    );
  });

  it('« Script » choisi ⇒ le fil plat en densité script', async () => {
    mockFocalActive = true;
    await chooseExplicitly('script');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'script'
    );
  });

  it('« Rivière » choisie ⇒ le rabat de la LOI (focal), pas le défaut de rendu', async () => {
    mockFocalActive = true;
    await chooseExplicitly('riviere');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    // La distinction compte : `riviere` est un CHOIX, donc il passe par
    // `clampToCapabilities` et finit `focal`. S'il finissait « bulles », le
    // défaut aurait mangé la décision du lecteur.
    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'focal'
    );
    expect(screen.queryByTestId('messages-display')).not.toBeInTheDocument();
  });

  it('revenir à « Auto » RE-DONNE les bulles — le défaut n’est pas un aller simple', async () => {
    mockFocalActive = true;
    await chooseExplicitly('script');
    await chooseExplicitly('auto');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
  });

  /**
   * Q-142 / réserve REV-5 **R6-4** — « Bulles » ON n'est plus SANS EFFET.
   *
   * `LensSwitcher` (l'en-tête du fil, monté SANS drapeau par
   * `ConversationView.tsx:326`) offre trois entrées : Focal, Script, Bulles.
   * Drapeau ON, la troisième était MORTE : `bulles` → `'bubbles'` →
   * `clampToCapabilities` sur un catalogue d'écran `['focal','script']` →
   * `focal`/`clamped-unavailable`. Un choix visible, réversible d'un tap, et
   * sans aucun effet.
   *
   * Ce que ce témoin oppose au clamp : le fil SAIT monter les bulles — la
   * décision produit du 2026-08-17 le lui fait faire tous les jours, pour la
   * branche `auto`. Le catalogue de l'écran DISAIT le contraire ; c'est le
   * catalogue qui avait tort, pas le lecteur.
   */
  it('R6-4 — « Bulles » choisi EXPLICITEMENT ⇒ le fil rend les bulles, pas un rabat sur Focal', async () => {
    mockFocalActive = true;
    await chooseExplicitly('bulles');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  /**
   * R6-4, DISCRIMINATION — ouvrir le catalogue de l'écran à `bubbles` ne doit
   * ouvrir QUE cela. Les deux autres modes hors catalogue (`resume` →
   * `'summary'`, `riviere` → `'river'`) restent rabattus sur `focal` : leurs
   * écrans, eux, ne sont toujours pas montés. Sans ce témoin, un catalogue
   * élargi trop largement passerait pour un catalogue élargi juste.
   */
  it('R6-4 — discrimination : `resume` et `riviere` restent rabattus sur Focal, eux', async () => {
    mockFocalActive = true;

    await chooseExplicitly('resume');
    const first = render(<ConversationMessages {...defaultProps} reverseOrder />);
    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute('data-density', 'focal');
    expect(screen.queryByTestId('messages-display')).not.toBeInTheDocument();
    first.unmount();

    await chooseExplicitly('riviere');
    render(<ConversationMessages {...defaultProps} reverseOrder />);
    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute('data-density', 'focal');
    expect(screen.queryByTestId('messages-display')).not.toBeInTheDocument();
  });

  /**
   * R6-4 — LE CHEMIN COMPLET, depuis le geste du lecteur. Les témoins
   * ci-dessus écrivent la préférence directement dans le magasin ; celui-ci
   * part de l'API que `LensSwitcher` appelle réellement
   * (`useReadingModeStore(state => state.setMode)`, la façade REV-4bis/B2)
   * avec SA valeur de lentille (`'bubble'`), et prouve que le fil suit. Sans
   * ce témoin, la traduction `bubble → bulles` resterait supposée.
   */
  it('R6-4 — le geste RÉEL du sélecteur (`setMode(\'bubble\')`) fait rendre les bulles', async () => {
    mockFocalActive = true;
    await act(async () => {
      useReadingModeStore.getState().setMode(CONVERSATION_ID, 'bubble');
    });

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
  });
});

// ---------------------------------------------------------------------------
// (c) et (d) — CE QUE LA DÉCISION NE FAIT PAS
// ---------------------------------------------------------------------------

describe('décision produit provisoire 2026-08-17 — ce qu’elle ne touche pas', () => {
  it('la LOI PARTAGÉE est intacte : `auto` y vaut toujours `focal`', () => {
    const decision = resolveOrchestratorDecision({
      unreadCount: 0,
      lastOpenedAt: null,
      now: 0,
      stickyChoice: 'auto',
      capabilities: {
        availableModes: ['focal', 'script'] as const,
        riverEligible: false,
        riverEligibilityReason: { threshold: 0, current: null, riverReason: 'belowThreshold' },
      },
      isFlagEnabled: true,
    });

    // La décision produit vit au-dessus de la loi, pas dedans. Si ce témoin
    // tombe, c'est que quelqu'un a amendé la loi partagée en silence — ce que
    // la directive interdisait explicitement.
    expect(decision.mode).toBe('focal');
  });

  it('le défaut N’ÉCRIT RIEN : après rendu, le magasin répond toujours `auto`', async () => {
    mockFocalActive = true;

    render(<ConversationMessages {...defaultProps} reverseOrder />);
    await screen.findByTestId('messages-display');

    expect(useReadingModePreferenceStore.getState().getReadingMode(CONVERSATION_ID)).toBe('auto');
    // Défaut ≠ préférence : rien n'a été persisté non plus.
    expect(window.localStorage.length).toBe(0);
  });

  it('drapeau ÉTEINT : le mux n’a aucune opinion, la prop du parent passe VERBATIM', async () => {
    render(<ConversationMessages {...defaultProps} reverseOrder readingMode="script" />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'script'
    );
  });
});
