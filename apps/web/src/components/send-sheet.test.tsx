import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { ApiResult } from '@/lib/api/http';
import type { SentMessageAck } from '@/lib/api/messages';
import type { Conversation } from '@/lib/api/types';
import { loadSendSheetCatalog } from '@/lib/i18n-send-sheet-catalog';
import type { SendPayload } from '@/lib/send/send-sheet-plan';
import type { SendSheetPorts } from '@/lib/send/send-sheet-run';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SEND_SHEET_SUCCESS_HOLD_MS, SendSheet, type SendSheetPlatform } from './send-sheet';
import type { SendSheetDirectory } from './send-sheet-directory';
import { SEND_SHEET_EXIT_MS } from './send-sheet-frame';

/**
 * LA FEUILLE D'ENVOI (#8884) — témoins de COMPORTEMENT : ce que l'utilisateur
 * voit, choisit, et ce qui PART par les ports. Le répertoire et les ports sont
 * factices ; le plan et le moteur sont les vrais.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSendSheetCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const VIEWER = 'u-moi';

const group = (id: string, title: string): Conversation => {
  const fields: Partial<Conversation> = {
    id,
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    title,
  };
  return fields as Conversation;
};

const person = (id: string, displayName: string): PersonSummary => ({ id, username: id, displayName, avatar: null });

const directoryOf = (over: Partial<SendSheetDirectory> = {}) => {
  const directory: SendSheetDirectory = {
    conversations: [group('c-lyon', 'Équipe Lyon'), group('c-paris', 'Équipe Paris')],
    friends: [person('u-noah', 'Noah')],
    searchResults: undefined,
    loading: false,
    ...over,
  };
  return () => directory;
};

type Call = { readonly port: string; readonly args: unknown };

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });

const portsOf = (script: { readonly refuse?: (conversationId: string) => boolean; readonly online?: () => boolean } = {}) => {
  const calls: Call[] = [];
  let seq = 0;
  const ack = (conversationId: string): SentMessageAck => ({ id: `m${(seq += 1)}`, conversationId, createdAt: '2026-09-30T10:00:00.000Z' });
  const ports: SendSheetPorts = {
    online: script.online ?? (() => true),
    openDirect: async (userId) => {
      calls.push({ port: 'openDirect', args: userId });
      return ok({ id: `c-direct-${userId}` });
    },
    forward: async (params) => {
      calls.push({ port: 'forward', args: params.targetConversationId });
      return { ok: true, count: params.messages.length };
    },
    sendMessage: async ({ conversationId, body }) => {
      calls.push({ port: 'sendMessage', args: { conversationId, content: body.content } });
      if (script.refuse?.(conversationId) === true) return { ok: false, status: 403, error: 'non' };
      return ok(ack(conversationId));
    },
    uploadFiles: async () => ok({ attachmentIds: ['a1'] }),
    fetchFile: async () => null,
    uploadMedia: async () => ok({ postMediaId: 'pm1', fileUrl: 'https://cdn.test/pm1', mimeType: 'image/png' }),
    publishMedia: async (params) => {
      calls.push({ port: 'publishMedia', args: params.format });
      return ok({ id: 'p1' });
    },
    publishFromAttachment: async (params) => {
      calls.push({ port: 'publishFromAttachment', args: { target: params.target, content: params.content } });
      return ok({ id: 'p2' });
    },
    repost: async () => ok({ id: 'p3' }),
    createTextPost: async () => ok({ id: 'p4' }),
    newClientMessageId: () => `cid-${(seq += 1)}`,
  };
  return { ports, calls };
};

const textPayload: SendPayload = { kind: 'text', text: 'Regarde ça', url: 'https://meeshy.me/p/1' };

const imageAttachment = (over: Partial<Extract<SendPayload, { kind: 'attachment' }>> = {}): SendPayload => ({
  kind: 'attachment',
  conversationId: 'c-src',
  messageId: 'm-src',
  attachmentId: 'a-src',
  mime: 'image/jpeg',
  previewUrl: 'https://cdn.test/a.jpg',
  mine: false,
  protected: false,
  ...over,
});

const mount = async (params: {
  readonly request?: SendSheetRequest;
  readonly directory?: () => SendSheetDirectory;
  readonly ports?: SendSheetPorts;
  readonly onClose?: () => void;
  readonly platform?: SendSheetPlatform;
}) =>
  mounter.mount(
    <SendSheet
      request={params.request ?? { payload: textPayload, intent: 'share' }}
      viewerId={VIEWER}
      language="fr"
      contentLanguage="fr"
      ports={params.ports ?? portsOf().ports}
      useDirectory={params.directory ?? directoryOf()}
      onClose={params.onClose ?? (() => {})}
      {...(params.platform === undefined ? {} : { platform: params.platform })}
    />,
  );

const row = (host: ParentNode, key: string): HTMLElement | null => host.querySelector(`[data-send-target="${key}"]`);
const sendButton = (host: ParentNode): HTMLButtonElement | null => host.querySelector('[data-send-sheet-send]');
const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('SendSheet — le titre dit le geste', () => {
  test('transfert : « Transférer » ; partage : « Partager »', async () => {
    const forward = await mount({
      request: {
        intent: 'forward',
        payload: { kind: 'messages', conversationId: 'c-src', messages: [{ id: 'm1', content: 'Salut', originalLanguage: 'fr' }], preview: { kind: 'text', text: 'Salut' } },
      },
    });
    expect(forward.querySelector('h2')?.textContent).toBe('Transférer');
    expect(forward.textContent).toContain('Salut');
    const share = await mount({});
    expect(share.querySelector('h2')?.textContent).toBe('Partager');
  });
});

describe('SendSheet — choisir à qui', () => {
  test('conversations ET personnes sans conversation ; une ligne se coche et le compte suit', async () => {
    const host = await mount({});
    expect(row(host, 'conversation:c-lyon')?.getAttribute('role')).toBe('checkbox');
    expect(row(host, 'contact:u-noah')).not.toBe(null);
    expect(sendButton(host)?.disabled).toBe(true);
    expect(sendButton(host)?.textContent).toBe('Envoyer');

    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(row(host, 'contact:u-noah'));
    expect(row(host, 'conversation:c-lyon')?.getAttribute('aria-checked')).toBe('true');
    expect(sendButton(host)?.disabled).toBe(false);
    expect(sendButton(host)?.textContent).toBe('Envoyer (2)');
  });

  test('une puce de sélectionné se retire', async () => {
    const host = await mount({});
    await mounter.click(row(host, 'conversation:c-lyon'));
    const chip = host.querySelector<HTMLElement>('[data-send-chip="conversation:c-lyon"]');
    expect(chip?.textContent).toContain('Équipe Lyon');
    await mounter.click(chip);
    expect(row(host, 'conversation:c-lyon')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[data-send-chip]')).toBe(null);
  });

  test('la recherche filtre les lignes', async () => {
    const host = await mount({});
    mounter.type(host, 'input[type="search"]', 'paris');
    await mounter.settle();
    expect(row(host, 'conversation:c-paris')).not.toBe(null);
    expect(row(host, 'conversation:c-lyon')).toBe(null);
    expect(row(host, 'contact:u-noah')).toBe(null);
  });

  test('au plafond de dix, les autres lignes deviennent INERTES et la feuille dit pourquoi', async () => {
    const many = Array.from({ length: 11 }, (_, i) => group(`c${i}`, `Groupe ${i}`));
    const host = await mount({ directory: directoryOf({ conversations: many, friends: [] }) });
    for (let i = 0; i < 10; i += 1) await mounter.click(row(host, `conversation:c${i}`));
    const eleventh = row(host, 'conversation:c10');
    expect(eleventh?.getAttribute('aria-disabled')).toBe('true');
    await mounter.click(eleventh);
    expect(eleventh?.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('10 destinataires au plus');
    expect(sendButton(host)?.textContent).toBe('Envoyer (10)');
  });

  test('le focus initial est sur la recherche', async () => {
    const host = await mount({});
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
  });
});

describe('SendSheet — publier', () => {
  test('une image publiable offre Ma story / Post / Réel, et une pastille compte comme une cible', async () => {
    const host = await mount({ request: { payload: imageAttachment(), intent: 'share' } });
    const chips = [...host.querySelectorAll('[data-send-publish]')].map((chip) => chip.textContent);
    expect(chips).toEqual(['Ma story', 'Post', 'Réel']);
    await mounter.click(host.querySelector('[data-send-publish="STORY"]'));
    expect(host.querySelector('[data-send-publish="STORY"]')?.getAttribute('aria-checked')).toBe('true');
    expect(sendButton(host)?.textContent).toBe('Envoyer (1)');
  });

  test('un contenu protégé n’offre rien, et le DIT', async () => {
    const host = await mount({ request: { payload: imageAttachment({ protected: true }), intent: 'share' } });
    expect(host.querySelector('[data-send-publish]')).toBe(null);
    expect(host.textContent).toContain('Contenu protégé');
  });

  test('un transfert de plusieurs messages n’offre aucune publication, sans explication', async () => {
    const host = await mount({
      request: {
        intent: 'forward',
        payload: {
          kind: 'messages',
          conversationId: 'c-src',
          messages: [
            { id: 'm1', content: 'a', originalLanguage: 'fr' },
            { id: 'm2', content: 'b', originalLanguage: 'fr' },
          ],
          preview: { kind: 'messages', count: 2 },
        },
      },
    });
    expect(host.querySelector('[data-send-publish]')).toBe(null);
    expect(host.textContent).not.toContain('Contenu protégé');
    expect(host.textContent).toContain('2 messages');
  });
});

describe('SendSheet — envoyer', () => {
  test('chaque cible reçoit SON envoi, la ligne dit Envoyé, puis la feuille annonce et se ferme', async () => {
    const { ports, calls } = portsOf();
    const closed: string[] = [];
    const host = await mount({ ports, onClose: () => closed.push('close') });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(row(host, 'contact:u-noah'));
    mounter.type(host, 'textarea', 'Pour toi');
    await mounter.click(sendButton(host));
    await mounter.settle();

    expect(calls).toEqual([
      { port: 'sendMessage', args: { conversationId: 'c-lyon', content: 'Pour toi\nRegarde ça\nhttps://meeshy.me/p/1' } },
      { port: 'openDirect', args: 'u-noah' },
      { port: 'sendMessage', args: { conversationId: 'c-direct-u-noah', content: 'Pour toi\nRegarde ça\nhttps://meeshy.me/p/1' } },
    ]);
    const statuses = [...host.querySelectorAll('[data-send-status]')].map((node) => node.getAttribute('data-send-status'));
    expect(statuses).toEqual(['sent', 'sent']);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Envoyé à 2');
    expect(closed).toEqual([]);

    await wait(SEND_SHEET_SUCCESS_HOLD_MS + SEND_SHEET_EXIT_MS + 40);
    expect(closed).toEqual(['close']);
  });

  test('un DOUBLE clic sur « Envoyer » ne part qu’UNE fois, même avant que la feuille ne se redessine', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports });
    await mounter.click(row(host, 'conversation:c-lyon'));
    const button = sendButton(host);
    await act(async () => {
      button?.click();
      button?.click();
    });
    await mounter.settle();
    expect(calls.filter((call) => call.port === 'sendMessage')).toHaveLength(1);
  });

  test('un échec garde la feuille ouverte et se rejoue PAR LIGNE', async () => {
    let refuse = true;
    const { ports, calls } = portsOf({ refuse: (id) => refuse && id === 'c-paris' });
    const closed: string[] = [];
    const host = await mount({ ports, onClose: () => closed.push('close') });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(row(host, 'conversation:c-paris'));
    await mounter.click(sendButton(host));
    await mounter.settle();

    const failed = host.querySelector('[data-send-status="failed"]');
    expect(failed?.textContent).toContain('L’envoi a été refusé');
    expect(host.querySelector('[data-send-status="sent"]')).not.toBe(null);

    refuse = false;
    await mounter.click(buttonNamed(failed ?? host, 'Réessayer'));
    await mounter.settle();
    expect(host.querySelector('[data-send-status="failed"]')).toBe(null);
    expect(calls.filter((call) => call.port === 'sendMessage')).toHaveLength(3);
    await wait(SEND_SHEET_SUCCESS_HOLD_MS + SEND_SHEET_EXIT_MS + 40);
    expect(closed).toEqual(['close']);
  });

  test('hors ligne : la ligne attend le réseau, et REPART seule à son retour', async () => {
    let online = false;
    const { ports, calls } = portsOf({ online: () => online });
    const host = await mount({ ports });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(host.querySelector('[data-send-status="failed"]')?.textContent).toContain('En attente de réseau');
    expect(calls).toEqual([]);

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await mounter.settle();
    expect(host.querySelector('[data-send-status="sent"]')).not.toBe(null);
    expect(calls.map((call) => call.port)).toEqual(['sendMessage']);
  });

  test('publier une image et l’envoyer à une conversation, avec la légende', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports, request: { payload: imageAttachment(), intent: 'share' } });
    await mounter.click(host.querySelector('[data-send-publish="POST"]'));
    await mounter.click(row(host, 'conversation:c-lyon'));
    mounter.type(host, 'textarea', 'Vu hier');
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls).toContainEqual({ port: 'publishFromAttachment', args: { target: 'POST', content: 'Vu hier' } });
    expect(calls.some((call) => call.port === 'sendMessage')).toBe(true);
  });
});

describe('SendSheet — plus d’options', () => {
  test('sans `moreOptions`, aucun bouton ; avec, la feuille système reçoit l’adresse', async () => {
    const without = await mount({});
    expect(buttonNamed(without, 'Plus d’options…')).toBe(null);

    const shared: unknown[] = [];
    const host = await mount({
      request: { payload: textPayload, intent: 'share', moreOptions: { url: 'https://meeshy.me/p/1' } },
      platform: { share: async (data) => void shared.push(data), copy: async () => {} },
    });
    await mounter.click(buttonNamed(host, 'Plus d’options…'));
    expect(shared).toEqual([{ url: 'https://meeshy.me/p/1' }]);
  });

  test('« Copier le lien » copie et le dit', async () => {
    const copied: string[] = [];
    const host = await mount({
      request: { payload: textPayload, intent: 'share', moreOptions: { url: 'https://meeshy.me/p/1' } },
      platform: { copy: async (text) => void copied.push(text) },
    });
    await mounter.click(buttonNamed(host, 'Copier le lien'));
    expect(copied).toEqual(['https://meeshy.me/p/1']);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Lien copié');
  });
});

describe('SendSheet — le partage est COMPTÉ quand il est parti (#8884)', () => {
  const sharedRequest = (onShared: () => void): SendSheetRequest => ({
    payload: textPayload,
    intent: 'share',
    moreOptions: { url: 'https://meeshy.me/p/1' },
    onShared,
  });

  test('un envoi réussi à une conversation compte UN partage', async () => {
    let counted = 0;
    const { ports } = portsOf();
    const host = await mount({ ports, request: sharedRequest(() => void (counted += 1)) });
    await mounter.click(row(host, 'conversation:c-lyon'));
    expect(counted).toBe(0);
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(counted).toBe(1);
  });

  test('un envoi REFUSÉ ne compte rien', async () => {
    let counted = 0;
    const { ports } = portsOf({ refuse: () => true });
    const host = await mount({ ports, request: sharedRequest(() => void (counted += 1)) });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(counted).toBe(0);
  });

  test('« Plus d’options… » compte quand la feuille du système a partagé, pas quand elle est refusée', async () => {
    let counted = 0;
    const accepted = await mount({ request: sharedRequest(() => void (counted += 1)), platform: { share: async () => {} } });
    await mounter.click(buttonNamed(accepted, 'Plus d’options…'));
    await mounter.settle();
    expect(counted).toBe(1);

    let refusedCount = 0;
    const refused = await mount({
      request: sharedRequest(() => void (refusedCount += 1)),
      platform: {
        share: async () => {
          throw new Error('AbortError');
        },
      },
    });
    await mounter.click(buttonNamed(refused, 'Plus d’options…'));
    await mounter.settle();
    expect(refusedCount).toBe(0);
  });

  test('« Copier le lien » compte aussi', async () => {
    let counted = 0;
    const host = await mount({ request: sharedRequest(() => void (counted += 1)), platform: { copy: async () => {} } });
    await mounter.click(buttonNamed(host, 'Copier le lien'));
    await mounter.settle();
    expect(counted).toBe(1);
  });
});
