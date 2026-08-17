/**
 * REV-4/B1 — la passe de perspective et l'élection démarrent-elles EN PROD ?
 *
 * Verdict de la porte V2, mot pour mot : « **B1** la passe de perspective +
 * l'élection ne démarrent JAMAIS en prod (ordre des effets React : le hook lit
 * `scrollContainerRef` AVANT l'effet qui le peuple ; StrictMode de `next dev`
 * masquait le défaut, les tests peuplaient la ref à la main) ».
 *
 * Les suites existantes (`hooks/lentille/__tests__/use-lentille-perspective.
 * test.ts`) fabriquent le conteneur À LA MAIN — `containerRef.current = …`
 * avant `renderHook` : elles prouvent la LOI (courbe, hystérésis, une seule
 * frame en vol) et rien du CÂBLAGE. Ce fichier est le témoin manquant : il
 * monte le VRAI point de montage, laisse le VRAI rendu peupler la cible, et
 * n'accorde qu'UNE SEULE passe d'effets — exactement ce que fait un build de
 * production, où `StrictMode` ne rejoue pas les effets.
 *
 * Le témoin de discrimination est le dernier `describe` : le MÊME arbre monté
 * sous `StrictMode` doit rendre le MÊME service — une seule boucle vivante,
 * jamais deux. C'est lui qui distingue « réparé » de « réparé par accident
 * grâce à la double passe de `next dev` ».
 *
 * Même leçon, même patron que `useLoadMoreSentinel` (REV-4/B2) : une cible qui
 * apparaît APRÈS le premier effet doit quand même être observée.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { LentilleFocusElection } from '@/hooks/lentille/lentille-focus-election';

jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => new Map(),
}));

jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => new Map(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: (state: unknown) => unknown) => selector({ draftMessages: {} }),
}));

let mockReducedMotion = false;
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

/**
 * Rang minimal — mais qui rend, LUI, un vrai nœud DOM et le publie par le
 * ref-setter de la perspective. C'est précisément ce que le hook doit finir
 * par mesurer : le mock n'esquive aucune étape du câblage sous test.
 */
const capturedElections: LentilleFocusElection[] = [];
const capturedWrappers = new Map<string, HTMLElement>();
jest.mock('../LentilleRow', () => ({
  LentilleRow: ({ conversation, election, perspectiveRef }: {
    conversation: { id: string };
    election?: LentilleFocusElection;
    perspectiveRef?: (el: HTMLDivElement | null) => void;
  }) => {
    if (election) capturedElections.push(election);
    return (
      <div data-testid="row" data-id={conversation.id}>
        <div
          data-testid={`wrapper-${conversation.id}`}
          ref={(el) => {
            if (el) capturedWrappers.set(conversation.id, el);
            else capturedWrappers.delete(conversation.id);
            perspectiveRef?.(el);
          }}
        />
      </div>
    );
  },
}));

import { LentilleConversationListMount } from '../LentilleConversationListMount';

const makeUser = (): User =>
  ({ id: 'user-1', username: 'alice', displayName: 'Alice', email: 'a@a.com', role: 'USER' } as unknown as User);

const conv = (id: string): Conversation =>
  ({
    id,
    type: 'group',
    title: `Conv ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    lastMessageAt: new Date('2026-08-16T09:00:00.000Z'),
    unreadCount: 0,
  }) as unknown as Conversation;

const baseProps = {
  currentUser: makeUser(),
  currentUserId: 'user-1',
  selectedConversationId: null as string | null,
  onSelectConversation: jest.fn(),
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  t: (key: string) => key,
};

/**
 * rAF déterministe et HONNÊTE : `cancelAnimationFrame` retire réellement la
 * frame de la file. Sans cela, une boucle annulée resterait dans la file et
 * « une frame » en exécuterait deux — le témoin StrictMode ci-dessous ne
 * discriminerait plus rien.
 */
function installDeterministicRaf() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let scheduled = 0;

  const originalRaf = global.requestAnimationFrame;
  const originalCaf = global.cancelAnimationFrame;

  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    scheduled += 1;
    const id = nextId++;
    frames.set(id, cb);
    return id;
  }) as unknown as typeof requestAnimationFrame;

  global.cancelAnimationFrame = ((id: number) => {
    frames.delete(id);
  }) as unknown as typeof cancelAnimationFrame;

  return {
    /** Nombre de callbacks EN VOL — une boucle vivante en garde exactement une. */
    get inFlight() {
      return frames.size;
    },
    /** Nombre total de `requestAnimationFrame` observés depuis l'installation. */
    get scheduled() {
      return scheduled;
    },
    /** Exécute toutes les frames en vol ; rend combien il y en avait. */
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

/** Géométrie réelle simulée : jsdom ne mesure rien, la passe a besoin de rectangles. */
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

describe("LentilleConversationListMount — la passe de perspective démarre en PROD (B1, WL-104/WL-108)", () => {
  let raf: ReturnType<typeof installDeterministicRaf>;

  beforeEach(() => {
    mockReducedMotion = false;
    capturedElections.length = 0;
    capturedWrappers.clear();
    raf = installDeterministicRaf();
  });

  afterEach(() => {
    raf.restore();
  });

  it("démarre la boucle DÈS le montage, sans seconde passe d'effets (le défaut de prod)", () => {
    render(<LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b')]} />);

    // AVANT le correctif : 0 — le hook a lu `scrollContainerRef.current`
    // (encore `null`) avant l'effet qui le peuple, et n'a jamais été rejoué.
    expect(raf.inFlight).toBe(1);
  });

  it("élit un rang à la première frame — la cible a été peuplée par le RENDU, jamais à la main", () => {
    const { container } = render(
      <LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b')]} />
    );

    // Le conteneur de défilement est le PARENT du point de montage — le même
    // nœud que la peau observe en production (`ConversationList` le rend).
    stubRect(container.firstElementChild!.parentElement!, 0, 1000);
    stubRect(capturedWrappers.get('a')!, 860, 860);
    stubRect(capturedWrappers.get('b')!, 200, 200);

    raf.flush();

    expect(capturedElections.length).toBeGreaterThan(0);
    // focusY = 1000 − FOCUS_BAND_OFFSET(140) = 860 ⇒ `a` est l'élu.
    expect(capturedElections[0].getElectedId()).toBe('a');
  });

  it('écrit opacity/transform sur les wrappers dès la première frame', () => {
    const { container } = render(
      <LentilleConversationListMount {...baseProps} conversations={[conv('a')]} />
    );

    stubRect(container.firstElementChild!.parentElement!, 0, 1000);
    stubRect(capturedWrappers.get('a')!, 400, 400);

    raf.flush();

    expect(capturedWrappers.get('a')!.style.opacity).not.toBe('');
    expect(capturedWrappers.get('a')!.style.transform).not.toBe('');
  });

  it("UNE SEULE boucle par surface — une frame exécutée en reprogramme exactement une", () => {
    render(<LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b'), conv('c')]} />);

    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
  });

  it('démonté ⇒ plus aucune frame en vol (aucune passe orpheline)', () => {
    const { unmount } = render(
      <LentilleConversationListMount {...baseProps} conversations={[conv('a')]} />
    );
    expect(raf.inFlight).toBe(1);

    unmount();
    expect(raf.inFlight).toBe(0);
  });

  /**
   * Le témoin de discrimination du verdict : `next dev` monte sous StrictMode
   * (effets joués deux fois) et masquait le défaut. Réparé, l'arbre doit se
   * comporter IDENTIQUEMENT sous les deux régimes — une seule boucle vivante,
   * jamais deux passes concurrentes écrivant sur les mêmes wrappers.
   */
  it('StrictMode ⇒ le MÊME service, jamais un démarrage en double', () => {
    render(
      <React.StrictMode>
        <LentilleConversationListMount {...baseProps} conversations={[conv('a'), conv('b')]} />
      </React.StrictMode>
    );

    expect(raf.inFlight).toBe(1);
    expect(raf.flush()).toBe(1);
    expect(raf.inFlight).toBe(1);
  });

  /**
   * LWS-8 — « Reduce motion ⇒ toutes les opacités à 1, focus card = fond seul,
   * ÉLECTION CONSERVÉE ». La boucle survit donc ici aussi, et elle doit
   * DÉMARRER : un correctif qui n'aurait réparé que le chemin animé laisserait
   * la focus card morte pour les utilisateurs en mouvement réduit.
   */
  it('prefers-reduced-motion ⇒ la boucle démarre quand même (élection conservée)', () => {
    mockReducedMotion = true;

    const { container } = render(
      <LentilleConversationListMount {...baseProps} conversations={[conv('a')]} />
    );
    expect(raf.inFlight).toBe(1);

    stubRect(container.firstElementChild!.parentElement!, 0, 1000);
    stubRect(capturedWrappers.get('a')!, 860, 860);
    raf.flush();

    expect(capturedElections[0].getElectedId()).toBe('a');
    // …et AUCUNE écriture de perspective : l'identité est maintenue.
    expect(capturedWrappers.get('a')!.style.opacity).toBe('1');
    expect(capturedWrappers.get('a')!.style.transform).toBe('none');
  });
});
