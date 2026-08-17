/**
 * WF-110/113 — comportement du mux Focal dans `ConversationMessages`, MÊME
 * patron que `ConversationList.lentille-mux.test.tsx` (WL-101) : trois
 * preuves —
 *   1. Drapeau OFF (défaut) ⇒ rendu historique SEUL, bit-à-bit identique
 *      (snapshot OFF, R8/R20).
 *   2. Drapeau ON, sans exception ⇒ `FocalThread` monté À LA PLACE du rendu
 *      historique.
 *   3. Drapeau ON, `FocalThread` LÈVE une exception ⇒ `FeatureErrorBoundary`
 *      retombe sur EXACTEMENT le rendu historique — jamais l'UI de repli
 *      générique.
 *   4. Le mux ne s'active QUE pour `reverseOrder=true` (le fil Conversations),
 *      jamais pour BubbleStream (`reverseOrder=false`) même drapeau ON.
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

let mockFocalShouldThrow = false;
jest.mock('@/components/conversations/focal/FocalThread', () => ({
  FocalThread: () => {
    if (mockFocalShouldThrow) {
      throw new Error('[test] échec injecté dans FocalThread');
    }
    return <div data-testid="focal-thread-mount" />;
  },
}));

// `next/dynamic` mocké pour résoudre l'import ASYNCHRONE réellement — un
// `useState`/`useEffect` déclenche un vrai re-render à la résolution
// (contrairement à une mutation de cache "hors React", invisible à
// `waitFor`/`findBy` : rien ne force alors React à re-rendre le wrapper).
jest.mock('next/dynamic', () => {
  return function dynamic(importFn: () => Promise<unknown>) {
    function DynamicWrapper(props: object) {
      const [Comp, setComp] = React.useState<React.ComponentType<unknown> | null>(null);
      React.useEffect(() => {
        let mounted = true;
        importFn().then((mod: unknown) => {
          if (!mounted) return;
          // `ConversationMessages.tsx` définit `dynamic(() => import(...).then(m =>
          // m.FocalThread))` — `importFn()` résout donc DÉJÀ directement le
          // composant (une fonction), pas un objet de module `{ default }`.
          const resolved =
            typeof mod === 'function'
              ? mod
              : (mod as Record<string, unknown>).default || Object.values(mod as Record<string, unknown>)[0];
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
  MessagesDisplay: () => <div data-testid="messages-display" />,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children as React.ReactNode}</button>,
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

import { ConversationMessages } from '@/components/conversations/ConversationMessages';
import { useReadingModePreferenceStore } from '@/stores/reading-mode-preference-store';

function createMockUser(): User {
  return { id: 'user-1', username: 'testuser', displayName: 'Test User' } as User;
}

function createMockMessage(id: string): Message {
  const now = new Date();
  return {
    id,
    conversationId: 'conv-1',
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
  conversationId: 'conv-1',
  addTranslatingState: jest.fn(),
  isTranslating: jest.fn(() => false),
  onEditMessage: jest.fn(),
  onDeleteMessage: jest.fn(),
  onLoadMore: jest.fn(),
  t: (key: string) => key,
  tCommon: (key: string) => key,
};

/**
 * DÉCISION PRODUIT PROVISOIRE — 2026-08-17 : sans choix explicite du lecteur,
 * le fil rend « Bulles » même drapeau ON. Les preuves 2 et 3 ci-dessous
 * portent sur ce qui se passe QUAND `FocalThread` est monté ; elles doivent
 * donc désormais poser un choix explicite, sinon elles observeraient le
 * défaut et deviendraient VIDES (la preuve 3 en particulier : sans
 * `FocalThread` monté, rien ne lève, et le repli n'est jamais exercé).
 * Le défaut lui-même a sa propre suite :
 * `__tests__/lentille/reading-mode-default-bubbles.test.tsx`.
 */
const chooseFocalExplicitly = async () => {
  await act(async () => {
    await useReadingModePreferenceStore.getState().setReadingMode('conv-1', 'focal');
  });
};

describe('ConversationMessages — mux Focal', () => {
  beforeEach(() => {
    mockFocalActive = false;
    mockFocalShouldThrow = false;
    window.localStorage.clear();
    useReadingModePreferenceStore.getState().reset();
  });

  it('drapeau OFF (défaut) ⇒ rendu historique SEUL — FocalThread jamais monté', async () => {
    render(<ConversationMessages {...defaultProps} reverseOrder />);
    expect(await screen.findByTestId('messages-display')).toBeInTheDocument();
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  // R20/R8 — « drapeau OFF ⇒ snapshot identique ». Fige le rendu de la zone
  // "px-2" (le point de greffe du mux) AVANT/APRÈS ce diff : toute divergence
  // future de ce `.snap` est le signal exact que le chemin OFF a bougé.
  it('rend un contenu bit-à-bit stable au point de greffe (snapshot de référence)', async () => {
    const { container } = render(<ConversationMessages {...defaultProps} reverseOrder />);
    await screen.findByTestId('messages-display');
    const graftPoint = container.querySelector('.px-2');
    expect(graftPoint).toMatchSnapshot();
  });

  // MIS À JOUR EXPRÈS (2026-08-17) : ce témoin exigeait `FocalThread` du seul
  // fait du drapeau. Depuis la décision produit provisoire « Bulles par
  // défaut », le drapeau ne suffit plus — il faut un CHOIX. Ce que le témoin
  // prouve reste le même (drapeau ON + choix plat ⇒ le fil plat REMPLACE le
  // rendu historique) ; sa précondition, elle, est devenue explicite.
  it('drapeau ON + reverseOrder=true + « Focal » CHOISI ⇒ FocalThread monté à la place du rendu historique', async () => {
    mockFocalActive = true;
    await chooseFocalExplicitly();
    render(<ConversationMessages {...defaultProps} reverseOrder />);
    expect(await screen.findByTestId('focal-thread-mount')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-display')).not.toBeInTheDocument();
  });

  it('drapeau ON MAIS reverseOrder=false (BubbleStream) ⇒ rendu historique, Focal jamais monté', async () => {
    mockFocalActive = true;
    render(<ConversationMessages {...defaultProps} reverseOrder={false} />);
    expect(await screen.findByTestId('messages-display')).toBeInTheDocument();
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();
  });

  // MIS À JOUR EXPRÈS (2026-08-17) : sans choix explicite, `FocalThread` n'est
  // plus monté du tout — l'exception injectée ne se produirait jamais et ce
  // témoin passerait pour de mauvaises raisons. Le choix rétablit exactement
  // la situation qu'il décrit.
  it('drapeau ON, « Focal » CHOISI, FocalThread lève ⇒ FeatureErrorBoundary retombe sur le rendu historique (jamais une page morte)', async () => {
    mockFocalActive = true;
    mockFocalShouldThrow = true;
    await chooseFocalExplicitly();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<ConversationMessages {...defaultProps} reverseOrder />);

    expect(await screen.findByTestId('messages-display')).toBeInTheDocument();
    expect(screen.queryByTestId('focal-thread-mount')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
