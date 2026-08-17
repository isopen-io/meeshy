/**
 * REV-4/B1, seconde surface — le FIL (WF-111/WF-113).
 *
 * Le verdict de la porte V2 vise « la passe de perspective + l'élection » sans
 * nommer une seule surface : la Lentille (liste) et le Focal (fil) partagent la
 * MÊME mécanique rAF et la MÊME loi (`focusCurve`/`electFocusRow`). Le défaut
 * de câblage a été trouvé côté liste ; ce fichier est le témoin qui interdit
 * qu'il apparaisse côté fil — les suites `FocalThread.test.tsx` existantes
 * passent un `createRef()` JAMAIS attaché, donc elles ne diraient rien si la
 * passe cessait de démarrer.
 *
 * Ici le conteneur de défilement est un VRAI nœud, rendu par un ancêtre
 * (comme `ConversationView` le fait en production), et l'arbre n'a droit qu'à
 * UNE SEULE passe d'effets — le régime d'un build de production.
 */
import React, { useRef } from 'react';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Message, User } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'focal.row.you' ? 'Toi' : key),
    locale: 'fr',
    isLoading: false,
  }),
}));

let mockReducedMotion = false;
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { FocalThread } from '../FocalThread';

const currentUser = {
  id: 'me',
  username: 'me',
  displayName: 'Moi',
  systemLanguage: 'fr',
} as unknown as User;

function makeMessage(id: string, iso: string): Message {
  return {
    id,
    conversationId: 'c1',
    senderId: 'other',
    content: `Message ${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date(iso),
    timestamp: new Date(iso),
    translations: [],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown,
  } as unknown as Message;
}

/** Voir la jumelle côté liste — `cancelAnimationFrame` retire réellement la frame. */
function installDeterministicRaf() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const originalRaf = global.requestAnimationFrame;
  const originalCaf = global.cancelAnimationFrame;

  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  }) as unknown as typeof requestAnimationFrame;
  global.cancelAnimationFrame = ((id: number) => {
    frames.delete(id);
  }) as unknown as typeof cancelAnimationFrame;

  return {
    get inFlight() {
      return frames.size;
    },
    flush() {
      const pending = [...frames.entries()];
      frames.clear();
      act(() => {
        pending.forEach(([, cb]) => cb(0));
      });
      return pending.length;
    },
    restore() {
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCaf;
    },
  };
}

function stubRect(el: Element, top: number, bottom: number) {
  el.getBoundingClientRect = (() => ({
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })) as unknown as () => DOMRect;
}

/**
 * L'ancêtre qui POSSÈDE le conteneur de défilement — la topologie réelle
 * (`ConversationView` rend le `<div ref={scrollContainerRef}>` et passe la ref
 * à travers `ConversationMessages`).
 */
function ThreadHost({ messages, density }: { messages: readonly Message[]; density?: 'focal' | 'script' }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollContainerRef} data-testid="scroll-container">
      <FocalThread
        messages={messages}
        currentUser={currentUser}
        density={density}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
}

const messages = [
  makeMessage('m2', '2026-08-12T10:00:00Z'),
  makeMessage('m1', '2026-08-12T09:00:00Z'),
];

describe('FocalThread — la passe de perspective démarre en PROD (B1, WF-111)', () => {
  let raf: ReturnType<typeof installDeterministicRaf>;

  beforeEach(() => {
    mockReducedMotion = false;
    raf = installDeterministicRaf();
  });

  afterEach(() => {
    raf.restore();
  });

  it("démarre la boucle DÈS le montage, sans seconde passe d'effets", () => {
    render(<ThreadHost messages={messages} />);
    expect(raf.inFlight).toBe(1);
  });

  it('écrit opacity/transform et élit un rang à la première frame', () => {
    render(<ThreadHost messages={messages} />);

    stubRect(screen.getByTestId('scroll-container'), 0, 1000);
    const wrappers = screen.getAllByTestId('focal-row-perspective-wrapper');
    // Ordre rendu : ancien en haut ⇒ [m1, m2]. focusY = 1000 − 140 = 860.
    stubRect(wrappers[0], 200, 200);
    stubRect(wrappers[1], 860, 860);

    raf.flush();

    expect(wrappers[1].style.opacity).not.toBe('');
    expect(wrappers[1].style.transform).not.toBe('');

    // L'élu est COMMIS (`isSettled` vrai au repos) — la rangée m2 grossit.
    const rows = screen.getAllByTestId('focal-row');
    expect(rows.map((r) => r.getAttribute('data-message-id'))).toEqual(['m1', 'm2']);
  });

  it('UNE SEULE boucle par surface — une frame exécutée en reprogramme exactement une', () => {
    render(<ThreadHost messages={messages} />);
    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
  });

  it('densité `script` ⇒ AUCUNE passe (zéro perspective, la boucle ne tourne pas)', () => {
    render(<ThreadHost messages={messages} density="script" />);
    expect(raf.inFlight).toBe(0);
  });

  it('démonté ⇒ plus aucune frame en vol', () => {
    const { unmount } = render(<ThreadHost messages={messages} />);
    expect(raf.inFlight).toBe(1);
    unmount();
    expect(raf.inFlight).toBe(0);
  });

  it('StrictMode ⇒ le MÊME service, jamais un démarrage en double', () => {
    render(
      <React.StrictMode>
        <ThreadHost messages={messages} />
      </React.StrictMode>
    );
    expect(raf.inFlight).toBe(1);
    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
  });

  /** §4.9 — « la surbrillance survit, l'animation non » : la boucle reste vivante. */
  it('prefers-reduced-motion ⇒ la boucle démarre quand même (élection conservée)', () => {
    mockReducedMotion = true;
    render(<ThreadHost messages={messages} />);
    expect(raf.inFlight).toBe(1);

    stubRect(screen.getByTestId('scroll-container'), 0, 1000);
    const wrappers = screen.getAllByTestId('focal-row-perspective-wrapper');
    stubRect(wrappers[0], 200, 200);
    stubRect(wrappers[1], 860, 860);
    raf.flush();

    expect(wrappers[1].style.opacity).toBe('1');
    expect(wrappers[1].style.transform).toBe('none');
  });
});
