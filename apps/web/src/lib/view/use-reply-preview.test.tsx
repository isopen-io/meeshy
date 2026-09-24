import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Message } from '@/lib/api/types';

import { useReplyToPreview, type ReplyToPreview } from './use-reply-preview';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: 'Bonjour, tu confirmes la maquette ?',
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
    translations: [],
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    ...partial,
  }) as Message;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/**
 * Le second `render()` REJOUE exactement ce qui défait un memo naïf dans
 * `thread.tsx` : un rendu déclenché par autre chose que `message` ou
 * `readerLanguages` — la scène du fil re-rend l'écran à CHAQUE image de
 * défilement, `replyToMessage` et `readerLanguages` restant, eux, inchangés
 * d'une frame à l'autre.
 */
function mount(props: { readonly message: Message | undefined; readonly readerLanguages: readonly string[] }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const captured: ReplyToPreview[] = [];

  function Harness(p: { readonly message: Message | undefined; readonly readerLanguages: readonly string[] }) {
    const preview = useReplyToPreview({ message: p.message, readerLanguages: p.readerLanguages });
    if (preview !== undefined) captured.push(preview);
    return null;
  }

  act(() => {
    root.render(<Harness message={props.message} readerLanguages={props.readerLanguages} />);
  });

  return {
    rerenderWithSameProps: (next: { readonly message: Message | undefined; readonly readerLanguages: readonly string[] }) => {
      act(() => {
        root.render(<Harness message={next.message} readerLanguages={next.readerLanguages} />);
      });
    },
    captured: () => captured,
  };
}

describe('useReplyToPreview — stabilité d’identité pendant le défilement (#6175, défaut majeur 2)', () => {
  test('deux rendus successifs avec le MÊME message et le MÊME prisme rendent le MÊME objet (Object.is)', () => {
    const m = message();
    const languages = ['fr'] as const;
    const { rerenderWithSameProps, captured } = mount({ message: m, readerLanguages: languages });
    rerenderWithSameProps({ message: m, readerLanguages: languages });

    expect(captured().length).toBe(2);
    // `served()` (`lib/api/prism.ts`) rend un littéral neuf à chaque appel —
    // c'est EXACTEMENT ce que ce test interdit de laisser fuir jusqu'à
    // l'identité de `replyTo` : sans le memo qui l'englobe (ou avec
    // `servedReply` posé en dépendance externe, la forme du défaut réel),
    // les deux entrées seraient DEUX objets distincts.
    expect(Object.is(captured()[0], captured()[1])).toBe(true);
  });

  test('un message DIFFÉRENT rend un objet NOUVEAU', () => {
    const languages = ['fr'] as const;
    const { rerenderWithSameProps, captured } = mount({ message: message({ id: 'm1' }), readerLanguages: languages });
    rerenderWithSameProps({ message: message({ id: 'm2', content: 'Autre chose' }), readerLanguages: languages });

    expect(captured().length).toBe(2);
    expect(Object.is(captured()[0], captured()[1])).toBe(false);
    expect(captured()[1]?.excerpt).toBe('Autre chose');
  });

  test('aucun message ciblé ⇒ undefined, jamais un objet vide', () => {
    const { captured } = mount({ message: undefined, readerLanguages: ['fr'] });
    expect(captured().length).toBe(0);
  });
});
