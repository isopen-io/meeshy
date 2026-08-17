/**
 * LE FIL OBÉIT — REV-4bis/B2, témoins (a) et (b).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE FICHIER FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * Le magasin unifié ne vaudrait rien si personne ne le LISAIT au point de
 * rendu. Avant ce lot, le mux du fil (`ConversationMessages`) montait
 * `FocalThread` dès que le drapeau était actif, sans jamais consulter le
 * moindre magasin : la Lentille écrivait dans le vide, et le sélecteur
 * `LensSwitcher` écrivait, lui, dans un magasin que la branche Focal ne
 * regardait pas. DEUX écritures mortes pour un seul écran.
 *
 * Ces témoins prennent le chemin par les deux bouts :
 *   (a) une écriture par l'action du menu Lentille
 *       (`useReadingModePreferenceActions().setReadingMode`, ce que
 *       `LentillePeek` branche sur `ReadingModeMenu.onSelect`) change ce que
 *       le fil rend ;
 *   (b) une écriture par le sélecteur historique
 *       (`useReadingModeStore().setMode`, ce que `ConversationView` branche
 *       sur `LensSwitcher.onModeChange`) produit EXACTEMENT le même rendu.
 *
 * Et deux invariants que le lot ne doit pas casser :
 *   - drapeau OFF ⇒ le mux n'a pas d'opinion, le rendu historique passe
 *     intact (le snapshot de `ConversationMessages.focal-mux.test.tsx` le
 *     fige par ailleurs) ;
 *   - préférence `riviere` ⇒ le fil rend `focal`, PAS la Rivière — R-135 a
 *     dégrisé l'entrée dans les MENUS, pas monté `RiverThread` dans le fil.
 *     Ce comportement est documenté, donc gardé.
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

/** Le double capture `density` — c'est LUI le témoin de « le fil obéit ». */
const focalDensitySpy = jest.fn();
jest.mock('@/components/conversations/focal/FocalThread', () => ({
  FocalThread: (props: { density?: string }) => {
    focalDensitySpy(props.density);
    return <div data-testid="focal-thread-mount" data-density={props.density} />;
  },
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

const writeFromLentilleMenu = async (value: Parameters<
  ReturnType<typeof useReadingModePreferenceStore.getState>['setReadingMode']
>[1]) => {
  await act(async () => {
    await useReadingModePreferenceStore.getState().setReadingMode(CONVERSATION_ID, value);
  });
};

beforeEach(() => {
  mockFocalActive = false;
  focalDensitySpy.mockClear();
  window.localStorage.clear();
  useReadingModePreferenceStore.getState().reset();
});

// ---------------------------------------------------------------------------
// TÉMOIN (a) — écrire depuis le menu Lentille change le fil OUVERT
// ---------------------------------------------------------------------------

describe('mux du fil — le menu Lentille gouverne le rendu', () => {
  /**
   * MIS À JOUR EXPRÈS — décision produit PROVISOIRE du 2026-08-17 : « mettre
   * le mode Bulle par défaut pour le moment ». Ce témoin affirmait
   * l'ancienne résolution `auto → focal` ; il affirme désormais le nouveau
   * défaut. La LOI partagée, elle, n'a pas bougé (elle dit toujours `focal`
   * pour `auto`) — la preuve en est rejouée dans
   * `reading-mode-default-bubbles.test.tsx`, qui possède cette décision.
   */
  it('préférence `auto` (rien de choisi) ⇒ le fil s’ouvre en BULLES (décision produit 2026-08-17)', async () => {
    mockFocalActive = true;
    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  it('« Script » choisi dans le menu Lentille ⇒ le fil rend la densité Script', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('script');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'script'
    );
  });

  /**
   * MIS À JOUR EXPRÈS (2026-08-17) : l'état de DÉPART n'est plus « Focal » mais
   * « Bulles » (le nouveau défaut). Ce que le témoin prouve est inchangé et
   * même renforcé : une écriture de préférence fait suivre le fil DÉJÀ MONTÉ,
   * y compris quand elle le fait basculer du rendu historique vers le fil plat.
   */
  it('un changement de préférence PENDANT que le fil est monté le fait suivre (départ : Bulles par défaut)', async () => {
    mockFocalActive = true;
    render(<ConversationMessages {...defaultProps} reverseOrder />);
    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );

    await writeFromLentilleMenu('script');

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'script'
    );
  });

  it('revenir sur « Focal » depuis « Script » ramène le fil en Focal (aller-retour complet)', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('script');
    await writeFromLentilleMenu('focal');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'focal'
    );
  });
});

// ---------------------------------------------------------------------------
// TÉMOIN (b) — le sélecteur historique écrit le MÊME magasin, MÊME rendu
// ---------------------------------------------------------------------------

describe('mux du fil — LensSwitcher et le menu Lentille sont indiscernables', () => {
  it('`setMode` (LensSwitcher) produit exactement le rendu de `setReadingMode` (Lentille)', async () => {
    mockFocalActive = true;
    act(() => {
      useReadingModeStore.getState().setMode(CONVERSATION_ID, 'script');
    });

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'script'
    );
  });

  /**
   * MIS À JOUR EXPRÈS (2026-08-17) : le fil part désormais en Bulles (défaut).
   * `Aa` reste un CHOIX explicite — la façade lit `auto`, le traduit en
   * `focal` et écrit `script` — donc il continue de gouverner, et le fait
   * ici SORTIR du défaut. C'est exactement la réversibilité que la décision
   * provisoire devait préserver.
   */
  it('`Aa` (bascule de densité) fait sortir le fil du défaut Bulles vers Script', async () => {
    mockFocalActive = true;
    render(<ConversationMessages {...defaultProps} reverseOrder />);
    await screen.findByTestId('messages-display');

    act(() => {
      useReadingModeStore.getState().toggleDensity(CONVERSATION_ID);
    });

    // `findBy` et non `getBy` : le module Focal est chargé par `next/dynamic`,
    // donc son premier montage — qui n'a plus lieu au rendu initial depuis le
    // défaut Bulles — passe par une résolution asynchrone.
    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'script'
    );
  });
});

// ---------------------------------------------------------------------------
// CE QUE LE MUX NE DOIT PAS FAIRE
// ---------------------------------------------------------------------------

describe('mux du fil — les bornes', () => {
  /**
   * R-135 a dégrisé la Rivière dans les MENUS (elle devient sélectionnable
   * quand le drapeau `riviere_mode` est on ET la conversation éligible), il
   * n'a PAS monté `RiverThread` dans le fil. La conséquence documentée est
   * qu'une préférence `riviere` finit `clamped-unavailable` ici. Ce témoin
   * garde ce comportement : le jour où `RiverThread` entrera au mux, il
   * tombera — et ce sera le signal, pas une surprise.
   */
  it('préférence `riviere` ⇒ le fil rend Focal (clamped-unavailable), jamais une Rivière absente', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('riviere');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'focal'
    );
  });

  it('préférence `resume` ⇒ Focal aussi : le Résumé Vivant n’est pas monté dans le fil', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('resume');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('focal-thread-mount')).toHaveAttribute(
      'data-density',
      'focal'
    );
  });

  /**
   * RETOURNÉ EXPRÈS le 2026-08-17 (Q-142, réserve REV-5 **R6-4**).
   *
   * Ce témoin gardait la phrase « `bubbles` n'est dans aucun catalogue
   * drapeau-on », donc « `bulles` ⇒ Focal ». Elle était vraie le jour où elle
   * a été écrite ; la décision produit « Bulles par défaut », prise le même
   * 2026-08-17, l'a rendue fausse en pratique — le mux monte la vue à bulles
   * pour la branche `auto`, drapeau ON. Un choix EXPLICITE de bulles était
   * donc rabattu là où l'ABSENCE de choix, elle, donnait les bulles :
   * l'entrée « Bulles » de `LensSwitcher` (`ConversationView.tsx:326`) était
   * un choix mort.
   *
   * Le catalogue du fil porte désormais `'bubbles'`
   * (`use-thread-reading-mode.ts`, où l'arbitrage complet est écrit) et ce
   * témoin dit l'inverse de ce qu'il disait. La BORNE, elle, n'a pas bougé
   * d'un pouce : les deux témoins juste au-dessus (`riviere`, `resume`)
   * restent rabattus sur Focal, et c'est eux qui prouvent que le catalogue a
   * été ouvert à UNE image, pas relâché.
   */
  it('préférence `bulles` drapeau ON ⇒ le fil rend les BULLES (R6-4) — le seul mode hors `FocalThread` que cet écran monte', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('bulles');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toHaveAttribute(
      'data-reading-mode',
      'bubble'
    );
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  /**
   * Le mux appelle la loi avec des entrées numériques NEUTRES (`unreadCount`
   * et `lastOpenedAt` ne sont pas connus de `ConversationMessages`). Ce n'est
   * défendable que si le résultat n'en dépend pas — ce témoin le PROUVE en
   * rejouant la loi elle-même sur toute la plage utile, plutôt que de croire
   * l'argument sur parole. Si une future branche numérique produisait autre
   * chose que `'summary'`, ce témoin tomberait, et il faudrait alors vraiment
   * transporter le compte de non-lus jusqu'ici.
   */
  it('les entrées numériques de la loi sont INERTES pour le catalogue du fil (démonstration rejouée)', () => {
    const threadCapabilities = {
      availableModes: ['focal', 'script'] as const,
      riverEligible: false,
      riverEligibilityReason: {
        threshold: 0,
        current: null,
        riverReason: 'belowThreshold' as const,
      },
    };

    const unreadCounts = [0, 9, 10, 25, 26, 1000];
    const lastOpenedAts = [null, 0, 1_000_000_000_000];

    unreadCounts.forEach((unreadCount) => {
      lastOpenedAts.forEach((lastOpenedAt) => {
        const decision = resolveOrchestratorDecision({
          unreadCount,
          lastOpenedAt,
          now: 1_000_000_000_000,
          stickyChoice: 'auto',
          capabilities: threadCapabilities,
          isFlagEnabled: true,
        });
        expect(decision.mode).toBe('focal');
      });
    });
  });

  it('drapeau OFF ⇒ le mux n’a AUCUNE opinion : rendu historique, `FocalThread` jamais monté', async () => {
    await writeFromLentilleMenu('script');

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toBeInTheDocument();
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
    expect(focalDensitySpy).not.toHaveBeenCalled();
  });

  it('drapeau ON mais BubbleStream (`reverseOrder=false`) ⇒ hors périmètre, rendu historique', async () => {
    mockFocalActive = true;
    await writeFromLentilleMenu('script');

    render(<ConversationMessages {...defaultProps} reverseOrder={false} />);

    expect(await screen.findByTestId('messages-display')).toBeInTheDocument();
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });
});
