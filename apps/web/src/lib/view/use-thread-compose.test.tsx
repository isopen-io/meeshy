import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createDraftStore, type StorageLike } from '@/lib/send/draft-store';
import { VIEWER_ID, message } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { menuScope } from '@/test-support/menu-viewer';

import { webRepliesToMessage } from './message-action-scope';
import { mentionSourceStore } from './mention-source';
import { useThreadCompose, type ThreadComposeState } from './use-thread-compose';

const { BLURRED, EPHEMERAL, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;

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

function fakeStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function messageOf(overrides: Partial<Message> & { readonly id: string }): Message {
  return message({
    senderId: 'u-2',
    content: 'salut',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    ...overrides,
  });
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(initial: {
  readonly messages: readonly Message[];
  readonly send: (
    text: string,
    attachments: readonly unknown[],
    replyTo: Message | null,
    language: string,
    protection: unknown,
    place: unknown,
  ) => void;
  readonly replyable?: (message: Message) => boolean;
  readonly storedDraft?: { readonly text: string; readonly language: string; readonly protection: object; readonly replyToId?: string };
}): {
  readonly state: () => ThreadComposeState;
  readonly rerender: () => void;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const backend = fakeStorage();
  if (initial.storedDraft !== undefined) backend.setItem('meeshy.draft.u_v1.c-1', JSON.stringify(initial.storedDraft));
  const store = createDraftStore(backend);
  let captured!: ThreadComposeState;

  function Harness() {
    captured = useThreadCompose({
      store,
      scope: 'u_v1',
      conversationId: 'c-1',
      messages: initial.messages,
      readerLanguages: ['fr'],
      send: initial.send,
      replyable: initial.replyable ?? (() => true),
    });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    state: () => captured,
    rerender: () => {
      act(() => {
        root.render(<Harness />);
      });
    },
  };
}

describe('useThreadCompose — brouillon, citation, envoi (#7429, extrait de routes/thread.tsx)', () => {
  test('sans citation, onSend remet null en 3e argument et les sept arguments dans l’ordre de useSend', () => {
    const calls: unknown[][] = [];
    const send = (...args: unknown[]) => calls.push(args);
    const { state } = mount({ messages: [], send });

    act(() => {
      state().onSend({ text: 'bonjour', attachments: [], language: 'fr', protection: {}, place: null });
    });

    expect(calls).toEqual([['bonjour', [], null, 'fr', {}, null, null]]);
  });

  test('un sticker de la bibliothèque arrive en 7e argument (#7938)', () => {
    const calls: unknown[][] = [];
    const send = (...args: unknown[]) => calls.push(args);
    const { state } = mount({ messages: [], send });

    act(() => {
      state().onSend({ text: '', attachments: [], language: 'fr', protection: {}, place: null, sticker: { stickerId: 's1' } });
    });

    expect(calls[0]?.[6]).toEqual({ stickerId: 's1' });
  });

  test('avec citation, onSend remet le MESSAGE ENTIER, puis efface la cible', () => {
    const m1 = messageOf({ id: 'm1', content: 'un message cité' });
    const calls: unknown[][] = [];
    const send = (...args: unknown[]) => calls.push(args);
    const { state } = mount({ messages: [m1], send });

    act(() => {
      state().setReplyTarget('m1');
    });
    expect(state().replyTo?.excerpt).toBe('un message cité');

    act(() => {
      state().onSend({ text: 'réponse', attachments: [], language: 'fr', protection: {}, place: null });
    });

    expect(calls).toEqual([['réponse', [], m1, 'fr', {}, null, null]]);
    expect(Object.is(calls[0]?.[2], m1)).toBe(true);
    expect(state().replyTo).toBeUndefined();
  });

  test('une cible qui a quitté le cache ne monte AUCUNE citation (fail-closed)', () => {
    const { state } = mount({ messages: [], send: () => {} });
    act(() => {
      state().setReplyTarget('ghost');
    });
    expect(state().replyTo).toBeUndefined();
  });

  test('onCancelReply efface la cible', () => {
    const m1 = messageOf({ id: 'm1' });
    const { state } = mount({ messages: [m1], send: () => {} });
    act(() => {
      state().setReplyTarget('m1');
    });
    expect(state().replyTo).toBeDefined();
    act(() => {
      state().onCancelReply();
    });
    expect(state().replyTo).toBeUndefined();
  });

  test('onSend garde son identité entre deux rendus sans changement — il est prop de Composer, re-rendu à chaque image', () => {
    const { state, rerender } = mount({ messages: [], send: () => {} });
    const first = state().onSend;
    rerender();
    const second = state().onSend;
    expect(Object.is(first, second)).toBe(true);
  });
});

describe('useThreadCompose — ce que la citation impose à la réponse (#8557)', () => {
  const noop = () => {};

  test('citer un message flou + flamme-œil impose le flou et la flamme-œil ; annuler lève tout', () => {
    const secret = messageOf({ id: 'm-secret', isBlurred: true, effectFlags: BLURRED | EPHEMERAL | EPHEMERAL_AFTER_READ });
    const { state } = mount({ messages: [secret], send: noop });
    expect(state().imposedProtection).toEqual({ blurred: false, ephemeral: null });

    act(() => {
      state().setReplyTarget('m-secret');
    });
    expect(state().imposedProtection).toEqual({ blurred: true, ephemeral: { kind: 'after-read' } });

    act(() => {
      state().onCancelReply();
    });
    expect(state().imposedProtection).toEqual({ blurred: false, ephemeral: null });
  });

  test('citer un message ordinaire n’impose rien', () => {
    const plain = messageOf({ id: 'm-plain' });
    const { state } = mount({ messages: [plain], send: noop });
    act(() => {
      state().setReplyTarget('m-plain');
    });
    expect(state().imposedProtection).toEqual({ blurred: false, ephemeral: null });
  });
});

describe('useThreadCompose — publie la source des mentions du fil (#7826)', () => {
  const sender = (userId: string, username: string): NonNullable<Message['sender']> =>
    ({
      id: `p-${userId}`,
      conversationId: 'c-1',
      type: 'user',
      userId,
      displayName: username,
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: false,
      joinedAt: new Date(0),
      user: { id: userId, username },
    }) as NonNullable<Message['sender']>;

  test('le fil ouvert publie ses expéditeurs, hors lecteur ; le démontage retire la source', () => {
    mount({
      messages: [
        messageOf({ id: 'm1', senderId: 'u-2', sender: sender('u-2', 'alice') }),
        messageOf({ id: 'm2', senderId: VIEWER_ID, sender: sender(VIEWER_ID, 'moi') }),
      ],
      send: () => {},
    });
    const published = mentionSourceStore.getState().source;
    expect(published?.selfId).toBe(VIEWER_ID);
    expect(published?.locals.map((c) => c.username)).toEqual(['alice']);

    act(() => {
      root.unmount();
    });
    expect(mentionSourceStore.getState().source).toBeNull();
    root = createRoot(container);
  });
});

describe('useThreadCompose — le mode édition (#10581)', () => {
  const MINE = messageOf({ id: 'm-mine', senderId: VIEWER_ID, content: 'mon texte' });
  const OTHER = messageOf({ id: 'm-other' });

  test('`beginEdit` arme le mode sur le texte d’origine, `edit.cancel` le referme', () => {
    const { state } = mount({ messages: [MINE, OTHER], send: () => {} });
    act(() => state().beginEdit('m-mine'));
    expect(state().edit.editing).toEqual({ messageId: 'm-mine', original: 'mon texte' });
    act(() => state().edit.cancel());
    expect(state().edit.editing).toBeNull();
  });

  test('armer une réponse sort du mode édition : le composeur revient avec sa citation', () => {
    const { state } = mount({ messages: [MINE, OTHER], send: () => {} });
    act(() => state().beginEdit('m-mine'));
    act(() => state().setReplyTarget('m-other'));
    expect(state().edit.editing).toBeNull();
    expect(state().replyTo).toBeDefined();
  });

  test('la citation déjà armée est mise de côté avec le brouillon, et revient à l’annulation', () => {
    const { state } = mount({ messages: [MINE, OTHER], send: () => {} });
    act(() => state().setReplyTarget('m-other'));
    act(() => state().beginEdit('m-mine'));
    expect(state().edit.editing).not.toBeNull();
    act(() => state().edit.cancel());
    expect(state().replyTo).toBeDefined();
  });
});

describe('useThreadCompose — une citation ne s’arme que là où le web sait répondre (#11372, contre-vérification)', () => {
  const QUOTED = messageOf({ id: 'm-quoted', content: 'à citer' });
  const lawIn = (encryptionMode: 'e2ee' | null) => (m: Message) =>
    webRepliesToMessage(m, menuScope({ id: VIEWER_ID }, { encryptionMode }), { now: Date.now() });
  const storedDraft = { text: 'reprise', language: 'fr', protection: {}, replyToId: 'm-quoted' };

  test('un brouillon restauré dans une conversation de bout en bout ne réarme AUCUNE citation, et l’envoi part sans', () => {
    const calls: unknown[][] = [];
    const { state } = mount({ messages: [QUOTED], send: (...args: unknown[]) => calls.push(args), replyable: lawIn('e2ee'), storedDraft });
    expect(state().replyTo).toBeUndefined();
    act(() => state().onSend({ text: 'x', attachments: [], language: 'fr', protection: {}, place: null }));
    expect(calls[0]?.[2]).toBeNull();
  });

  test('en bout en bout, armer une citation par une autre porte ne la monte pas non plus', () => {
    const { state } = mount({ messages: [QUOTED], send: () => {}, replyable: lawIn('e2ee') });
    act(() => state().setReplyTarget('m-quoted'));
    expect(state().replyTo).toBeUndefined();
    act(() => state().setReplyToMedia('m-quoted', 'a-1'));
    expect(state().replyTo).toBeUndefined();
  });

  test('en clair, le même brouillon réarme sa citation', () => {
    const { state } = mount({ messages: [QUOTED], send: () => {}, replyable: lawIn(null), storedDraft });
    expect(state().replyTo).toBeDefined();
  });
});
