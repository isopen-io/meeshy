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
import { takeStudioSeed } from '@/lib/stories/studio-seed';
import { href } from '@/routes/route-table';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createSendQueue, memorySendQueueStorage, type SendQueue } from '@/lib/send/send-queue';

import { SEND_SHEET_SUCCESS_HOLD_MS, SendSheet, sizeIn, type SendSheetPlatform } from './send-sheet';
import type { SendSheetDirectory } from './send-sheet-directory';
import { SEND_SHEET_EXIT_MS } from './send-sheet-frame';

/**
 * LA FEUILLE D'ENVOI (#8884) — témoins de COMPORTEMENT : ce que l'utilisateur
 * voit, choisit, et ce qui PART par les ports. Le répertoire et les ports sont
 * factices ; le plan et le moteur sont les vrais.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
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
    openGroup: async ({ userIds, title }) => {
      calls.push({ port: 'openGroup', args: { userIds, title } });
      return ok({ id: 'c-group-new' });
    },
    forward: async (params) => {
      calls.push({ port: 'forward', args: params.targetConversationId });
      return { ok: true, count: params.messages.length };
    },
    sendMessage: async ({ conversationId, body }) => {
      calls.push({ port: 'sendMessage', args: { conversationId, content: body.content, ...(body.forwardedAttachmentIds === undefined ? {} : { pieces: body.forwardedAttachmentIds }) } });
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
  exit: { id: 'm-src', pieces: [{ id: 'a-src', mimeType: over.mime ?? 'image/jpeg' }] },
  ...over,
});

const messagesPayload = (exit: Extract<SendPayload, { kind: 'messages' }>['exit']): SendPayload => ({
  kind: 'messages',
  conversationId: 'c-src',
  messages: exit.map((m) => ({ id: m.id, content: m.text ?? '', originalLanguage: 'fr' })),
  exit,
  preview: exit.length === 1 ? { kind: 'text', text: exit[0]?.text ?? '' } : { kind: 'messages', count: exit.length },
});

let queues: SendQueue[] = [];
const freshQueue = (ports: SendSheetPorts): SendQueue => {
  const queue = createSendQueue({ activeViewer: () => VIEWER, storage: memorySendQueueStorage(), portsFor: async () => ports });
  queues = [...queues, queue];
  return queue;
};

const mount = async (params: {
  readonly request?: SendSheetRequest;
  readonly directory?: () => SendSheetDirectory;
  readonly ports?: SendSheetPorts;
  readonly onClose?: () => void;
  readonly platform?: SendSheetPlatform;
  readonly queue?: SendQueue;
}) => {
  const ports = params.ports ?? portsOf().ports;
  return mounter.mount(
    <SendSheet
      request={params.request ?? { payload: textPayload, intent: 'share' }}
      viewerId={VIEWER}
      language="fr"
      contentLanguage="fr"
      ports={ports}
      queue={params.queue ?? freshQueue(ports)}
      useDirectory={params.directory ?? directoryOf()}
      onClose={params.onClose ?? (() => {})}
      {...(params.platform === undefined ? {} : { platform: params.platform })}
    />,
  );
};

const row = (host: ParentNode, key: string): HTMLElement | null => host.querySelector(`[data-send-target="${key}"]`);
const sendButton = (host: ParentNode): HTMLButtonElement | null => host.querySelector('[data-send-sheet-send]');
const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('SendSheet — le titre dit le geste (vocabulaire commun)', () => {
  test('un message : « Transférer » ; tout le reste : « Envoyer »', async () => {
    const forward = await mount({ request: { intent: 'forward', payload: messagesPayload([{ id: 'm1', text: 'Salut' }]) } });
    expect(forward.querySelector('h2')?.textContent).toBe('Transférer');
    expect(forward.textContent).toContain('Salut');
    const share = await mount({});
    expect(share.querySelector('h2')?.textContent).toBe('Envoyer');
  });

  test('les quatre zones, dans cet ordre : ce qui part, ce qu’on en fait, à qui, envoyer', async () => {
    const host = await mount({ request: { payload: imageAttachment(), intent: 'forward' } });
    const zones = [...host.querySelectorAll('[data-send-zone]')].map((zone) => zone.getAttribute('data-send-zone'));
    expect(zones).toEqual(['what-leaves', 'actions', 'recipients', 'send-bar']);
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
    expect(sendButton(host)?.textContent).toBe('Envoyer · 2');
    expect(sendButton(host)?.getAttribute('aria-label')).toBe('Envoyer à 2 destinataires');
  });

  test('une ligne s’annonce en UN élément : son nom et ce qu’elle est', async () => {
    const host = await mount({});
    expect(row(host, 'contact:u-noah')?.getAttribute('aria-label')).toBe('Noah, Ami · pas encore de conversation');
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

  test('au plafond de dix, les autres lignes deviennent INERTES et l’écran dit pourquoi', async () => {
    const many = Array.from({ length: 11 }, (_, i) => group(`c${i}`, `Groupe ${i}`));
    const host = await mount({ directory: directoryOf({ conversations: many, friends: [] }) });
    for (let i = 0; i < 10; i += 1) await mounter.click(row(host, `conversation:c${i}`));
    const eleventh = row(host, 'conversation:c10');
    expect(eleventh?.getAttribute('aria-disabled')).toBe('true');
    await mounter.click(eleventh);
    expect(eleventh?.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('10 destinataires au plus');
    expect(sendButton(host)?.textContent).toBe('Envoyer · 10');
  });

  test('le focus initial est sur la recherche', async () => {
    const host = await mount({});
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
  });

  test('cache vide au premier lancement : un squelette ; aucune conversation : jamais d’impasse', async () => {
    const cold = await mount({ directory: directoryOf({ conversations: [], friends: [], loading: true }) });
    expect(cold.querySelector('[data-send-skeleton]')).not.toBe(null);
    const empty = await mount({ directory: directoryOf({ conversations: [], friends: [] }) });
    expect(empty.querySelector('[data-send-empty]')?.textContent).toContain('Personne ici pour l’instant');
    expect(empty.querySelector('input[type="search"]')).not.toBe(null);
  });

  test('un cache, même ancien, se peint sans squelette', async () => {
    const host = await mount({ directory: directoryOf({ loading: true }) });
    expect(host.querySelector('[data-send-skeleton]')).toBe(null);
    expect(row(host, 'conversation:c-lyon')).not.toBe(null);
  });

  test('une communauté se déplie en ses canaux où l’on écrit (D11)', async () => {
    const channel = { ...group('k-general', '#général'), communityId: 'k1' };
    const host = await mount({ directory: directoryOf({ conversations: [channel], friends: [], communities: { k1: { name: 'Lyon Polyglotte' } } }) });
    const community = host.querySelector<HTMLElement>('[data-send-community="k1"] button');
    expect(community?.getAttribute('aria-expanded')).toBe('false');
    await mounter.click(community);
    expect(host.querySelector('[data-send-community="k1"] [data-send-target="conversation:k-general"]')).not.toBe(null);
  });
});

describe('SendSheet — publier (D2 : cochable comme un destinataire)', () => {
  test('une photo offre Ma story / Mon fil, pas de réel, et la ligne dit pourquoi', async () => {
    const image = await mount({ request: { payload: imageAttachment(), intent: 'forward' } });
    expect([...image.querySelectorAll('[data-send-publish]')].map((chip) => chip.textContent)).toEqual(['Ma story', 'Mon fil']);
    expect(image.textContent).toContain('Une photo seule ne fait pas un réel.');
    await mounter.click(image.querySelector('[data-send-publish="STORY"]'));
    expect(image.querySelector('[data-send-publish="STORY"]')?.getAttribute('aria-checked')).toBe('true');
    expect(sendButton(image)?.textContent).toBe('Transférer · 1');
  });

  test('une flamme n’offre rien, et la ligne dit pourquoi (V7)', async () => {
    const flame = imageAttachment({ exit: { id: 'm-src', effectFlags: 1, ephemeralDuration: 3600, pieces: [{ id: 'a-src', mimeType: 'image/jpeg' }] } });
    const host = await mount({ request: { payload: flame, intent: 'forward' } });
    expect(host.querySelector('[data-send-publish]')).toBe(null);
    expect(host.textContent).toContain('Une flamme ne se publie pas');
    expect(host.querySelector('[data-send-duration]')).not.toBe(null);
  });

  test('plusieurs messages n’offrent aucune publication ; « Copier le texte » si l’on a du texte', async () => {
    const host = await mount({ request: { intent: 'forward', payload: messagesPayload([{ id: 'm1', text: 'a' }, { id: 'm2', text: 'b' }]) } });
    expect(host.querySelector('[data-send-publish]')).toBe(null);
    expect(host.textContent).toContain('2 messages');
    expect(host.querySelector('[data-send-action="copy-text"]')).not.toBe(null);
  });
});

describe('SendSheet — ce qui part', () => {
  test('D6 : le message à vue unique est RETIRÉ avec son motif, les autres partent', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports, request: { intent: 'forward', payload: messagesPayload([{ id: 'm1', text: 'a' }, { id: 'm2', text: 'b', isViewOnce: true }, { id: 'm3', text: 'c' }]) } });
    expect(host.textContent).toContain('Le message à vue unique reste dans cette conversation.');
    expect(host.textContent).toContain('Messages qui partent : 2.');
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls.filter((call) => call.port === 'forward')).toEqual([{ port: 'forward', args: 'c-lyon' }]);
  });

  test('rien ne sort : la carte « ne sort pas de Meeshy », et « Compris » ferme', async () => {
    let closed = 0;
    const host = await mount({ request: { intent: 'forward', payload: messagesPayload([{ id: 'm1', text: 'x', isViewOnce: true }]) }, onClose: () => (closed += 1) });
    expect(host.querySelector('[data-send-blocked]')?.textContent).toContain('Ce message ne sort pas de Meeshy');
    expect(host.querySelector('[data-send-target]')).toBe(null);
    await mounter.click(buttonNamed(host, 'Compris'));
    await wait(SEND_SHEET_EXIT_MS + 20);
    expect(closed).toBe(1);
  });

  test('une pièce d’un message : seule elle part, par son identifiant (#9914)', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports, request: { payload: imageAttachment(), intent: 'forward' } });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls).toContainEqual({ port: 'sendMessage', args: { conversationId: 'c-lyon', pieces: ['a-src'] } });
  });

  test('des fichiers : la croix retire une pièce, « Ensemble » par défaut, « Séparément » envoie un message par pièce', async () => {
    const { ports, calls } = portsOf();
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.pdf', { type: 'application/pdf' }), new File(['c'], 'c.m4a', { type: 'audio/mp4' })];
    const host = await mount({ ports, request: { payload: { kind: 'files', files }, intent: 'share' } });
    expect(host.querySelectorAll('[data-send-piece]')).toHaveLength(3);
    await mounter.click(host.querySelector('[data-send-piece-remove="2"]'));
    expect(host.querySelectorAll('[data-send-piece]')).toHaveLength(2);
    expect(host.querySelector('[data-send-grouping]')?.getAttribute('data-send-grouping')).toBe('together');
    await act(async () => {
      host.querySelector<HTMLInputElement>('[data-send-grouping] input[value="separate"]')?.click();
    });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls.filter((call) => call.port === 'sendMessage')).toHaveLength(2);
  });

  test('V9 : au-delà de vingt fichiers, l’écran dit la limite, marque l’excédent et propose de le retirer', async () => {
    const files = Array.from({ length: 22 }, (_, i) => new File(['x'], `${i}.jpg`, { type: 'image/jpeg' }));
    const host = await mount({ request: { payload: { kind: 'files', files }, intent: 'share' } });
    await mounter.click(row(host, 'conversation:c-lyon'));
    expect(host.querySelector('[data-send-over-limit]')?.textContent).toContain('Un partage emporte au plus 20 fichiers');
    expect(host.querySelectorAll('[data-send-piece][data-over]')).toHaveLength(2);
    expect(sendButton(host)?.disabled).toBe(true);
    expect(sendButton(host)?.textContent).toBe('Retirez 2 fichiers pour envoyer');
    await mounter.click(buttonNamed(host, 'Retirer les 2 derniers'));
    expect(host.querySelectorAll('[data-send-piece]')).toHaveLength(20);
    expect(sendButton(host)?.disabled).toBe(false);
  });

  test('D9 : le texte joint par l’autre app est déjà la légende', async () => {
    const host = await mount({ request: { payload: { kind: 'files', files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })] }, intent: 'share', caption: 'Vue depuis Fourvière' } });
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Vue depuis Fourvière');
  });
});

describe('SendSheet — chiffrement (D7)', () => {
  test('vers une conversation non chiffrée, l’écran avertit AVANT l’envoi, icône et texte', async () => {
    const host = await mount({ request: { intent: 'forward', payload: messagesPayload([{ id: 'm1', text: 'Le devis', encrypted: true }]) } });
    await mounter.click(row(host, 'conversation:c-lyon'));
    const warning = host.querySelector('[data-send-reason="warning"]');
    expect(warning?.textContent).toContain('« Équipe Lyon » n’est pas chiffrée');
    expect(warning?.querySelector('svg')).not.toBe(null);
    expect(host.querySelector('[data-send-publish]')).toBe(null);
  });
});

describe('SendSheet — créer un groupe (D12)', () => {
  test('dès deux personnes, l’interrupteur paraît, éteint ; allumé, UN groupe reçoit UN envoi', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports, directory: directoryOf({ friends: [person('u-lea', 'Léa Martin'), person('u-leon', 'Léon Ndiaye')] }) });
    await mounter.click(row(host, 'contact:u-lea'));
    expect(host.querySelector('[data-send-create-group]')).toBe(null);
    await mounter.click(row(host, 'contact:u-leon'));
    const toggle = host.querySelector<HTMLInputElement>('[data-send-create-group] input');
    expect(toggle?.checked).toBe(false);
    expect(host.querySelector('[data-send-create-group]')?.textContent).toContain('Créer un groupe avec Léa, Léon');
    await act(async () => {
      toggle?.click();
    });
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls.filter((call) => call.port === 'openDirect')).toEqual([]);
    expect(calls).toContainEqual({ port: 'openGroup', args: { userIds: ['u-lea', 'u-leon'], title: 'Léa, Léon' } });
    expect(calls.filter((call) => call.port === 'sendMessage')).toHaveLength(1);
  });
});

describe('SendSheet — envoyer', () => {
  test('chaque cible reçoit SON envoi, la ligne dit Envoyé, puis l’écran annonce et se ferme (D5 : aucune navigation)', async () => {
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
    const path = window.location.pathname;
    await wait(SEND_SHEET_SUCCESS_HOLD_MS + SEND_SHEET_EXIT_MS + 40);
    expect(closed).toEqual(['close']);
    expect(window.location.pathname).toBe(path);
  });

  test('Entrée dans la légende envoie ; Maj+Entrée, non', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports });
    await mounter.click(row(host, 'conversation:c-lyon'));
    const caption = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      caption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });
    expect(calls).toEqual([]);
    await act(async () => {
      caption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await mounter.settle();
    expect(calls.filter((call) => call.port === 'sendMessage')).toHaveLength(1);
  });

  test('un DOUBLE clic sur « Envoyer » ne part qu’UNE fois', async () => {
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

  test('un échec garde l’écran ouvert et se rejoue PAR LIGNE', async () => {
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

  test('hors ligne : rien n’est refusé, la ligne est « En file », le bandeau le dit, et la FILE repart au retour du réseau', async () => {
    let online = false;
    const { ports, calls } = portsOf({ online: () => online });
    const queue = freshQueue(ports);
    const host = await mount({ ports, queue });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(host.querySelector('[data-send-status="queued"]')?.textContent).toContain('En file');
    expect(host.textContent).toContain('même si vous fermez Meeshy');
    expect(calls).toEqual([]);

    online = true;
    await act(async () => {
      await queue.flush();
    });
    await mounter.settle();
    expect(host.querySelector('[data-send-status="sent"]')).not.toBe(null);
    expect(calls.map((call) => call.port)).toEqual(['sendMessage']);
  });

  test('l’écran fermé pendant l’envoi : la file continue', async () => {
    let online = false;
    const { ports, calls } = portsOf({ online: () => online });
    const queue = freshQueue(ports);
    const host = await mount({ ports, queue });
    await mounter.click(row(host, 'conversation:c-lyon'));
    await mounter.click(sendButton(host));
    await mounter.settle();
    mounter.unmountAll();
    online = true;
    await queue.flush();
    expect(calls.map((call) => call.port)).toEqual(['sendMessage']);
    expect(host.isConnected).toBe(false);
  });

  test('publier une image et l’envoyer à une conversation, avec la légende', async () => {
    const { ports, calls } = portsOf();
    const host = await mount({ ports, request: { payload: imageAttachment(), intent: 'forward' } });
    await mounter.click(host.querySelector('[data-send-publish="POST"]'));
    await mounter.click(row(host, 'conversation:c-lyon'));
    mounter.type(host, 'textarea', 'Vu hier');
    await mounter.click(sendButton(host));
    await mounter.settle();
    expect(calls).toContainEqual({ port: 'publishFromAttachment', args: { target: 'POST', content: 'Vu hier' } });
    expect(calls.some((call) => call.port === 'sendMessage')).toBe(true);
  });
});

describe('SendSheet — copier, partager hors de Meeshy', () => {
  test('un texte sans adresse n’a rien à copier ni à partager dehors ; un lien, si', async () => {
    const without = await mount({ request: { payload: { kind: 'text', text: 'Bonjour' }, intent: 'share' } });
    expect(buttonNamed(without, 'Partager hors de Meeshy')).toBe(null);

    const shared: unknown[] = [];
    const host = await mount({ platform: { share: async (data) => void shared.push(data), copy: async () => {} } });
    await mounter.click(buttonNamed(host, 'Partager hors de Meeshy'));
    expect(shared).toEqual([{ url: 'https://meeshy.me/p/1' }]);
  });

  test('« Copier le lien » copie et le dit', async () => {
    const copied: string[] = [];
    const host = await mount({ platform: { copy: async (text) => void copied.push(text) } });
    await mounter.click(buttonNamed(host, 'Copier le lien'));
    expect(copied).toEqual(['https://meeshy.me/p/1']);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Lien copié');
  });
});

describe('SendSheet — « Modifier dans le studio » (#9286)', () => {
  test('un partage entrant ouvre le studio du post, semé de ses fichiers et de la légende', async () => {
    const photo = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    let closed = 0;
    const host = await mount({ request: { payload: { kind: 'files', files: [photo] }, intent: 'share' }, onClose: () => (closed += 1) });
    mounter.type(host, 'textarea', 'Vu ce matin');
    await mounter.click(buttonNamed(host, 'Modifier dans le studio'));
    expect(takeStudioSeed()).toEqual({ files: [photo], text: 'Vu ce matin' });
    expect(window.location.pathname).toBe(href('postCompose'));
    expect(closed).toBe(1);
  });

  test('ce qui vient de Meeshy ne se recompose pas : aucun bouton', async () => {
    const host = await mount({ request: { payload: imageAttachment(), intent: 'forward' } });
    expect(buttonNamed(host, 'Modifier dans le studio')).toBe(null);
  });
});

describe('SendSheet — le partage est COMPTÉ quand il est parti (#8884)', () => {
  const sharedRequest = (onShared: () => void): SendSheetRequest => ({ payload: textPayload, intent: 'share', moreOptions: { url: 'https://meeshy.me/p/1' }, onShared });

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

  test('« Partager hors de Meeshy » compte quand la feuille du système a partagé, pas quand elle est refusée', async () => {
    let counted = 0;
    const accepted = await mount({ request: sharedRequest(() => void (counted += 1)), platform: { share: async () => {} } });
    await mounter.click(buttonNamed(accepted, 'Partager hors de Meeshy'));
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
    await mounter.click(buttonNamed(refused, 'Partager hors de Meeshy'));
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

describe('sizeIn — le poids se dit dans la langue du lecteur', () => {
  test('français : Mo ; anglais : MB ; sous un mébioctet, des kilo-octets', () => {
    const plain = (text: string) => text.replace(/\s/gu, ' ');
    expect(plain(sizeIn('fr', 500 * 1024 * 1024))).toBe('500 Mo');
    expect(plain(sizeIn('en', 500 * 1024 * 1024))).toBe('500 MB');
    expect(plain(sizeIn('fr', 2048))).toBe('2 ko');
  });
});
