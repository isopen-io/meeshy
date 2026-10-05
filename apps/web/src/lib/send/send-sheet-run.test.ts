import { describe, expect, test } from 'bun:test';

import type { ForwardSource } from '@/lib/api/forward';
import type { ApiResult } from '@/lib/api/http';
import type { SendMessageBody, SentMessageAck } from '@/lib/api/messages';

import { planSend, type SendPayload, type SendTarget } from './send-sheet-plan';
import {
  createSendRun,
  failedKeysOf,
  sentCountOf,
  type ReadyMedia,
  type SendSheetPorts,
} from './send-sheet-run';

/**
 * LE MOTEUR D'EXÉCUTION (#8884) — des ports FACTICES qui enregistrent ce qui
 * part. On éprouve l'ORDRE, le PARTAGE d'un téléversement entre destinataires,
 * et le REJEU par cible (qui ne renvoie jamais ce qui est déjà parti).
 */
type Call = { readonly port: string; readonly args: unknown };

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = (status: number, error = 'refus', code?: string): ApiResult<never> => ({ ok: false, status, error, ...(code === undefined ? {} : { code }) });

const ack = (id: string, conversationId: string): SentMessageAck => ({ id, conversationId, createdAt: '2026-09-30T10:00:00.000Z' });

type Script = Partial<{
  online: boolean;
  openDirect: (userId: string) => ApiResult<{ readonly id: string }>;
  sendMessage: (conversationId: string, body: SendMessageBody, nth: number) => ApiResult<SentMessageAck>;
  forward: (targetConversationId: string) => { readonly ok: true; readonly count: number } | { readonly ok: false; readonly error: string };
  uploadFiles: () => ApiResult<{ readonly attachmentIds: readonly string[] }>;
  fetchFile: () => File | null;
  uploadMedia: (file: File) => ApiResult<ReadyMedia>;
  publishMedia: () => ApiResult<{ readonly id: string }>;
  publishFromAttachment: () => ApiResult<{ readonly id: string }>;
  repost: () => ApiResult<{ readonly id: string }>;
  createTextPost: () => ApiResult<{ readonly id: string }>;
}>;

function harness(script: Script = {}) {
  const calls: Call[] = [];
  const state = { online: script.online ?? true, sends: 0, cid: 0 };
  const log = <T,>(port: string, args: unknown, value: T): T => {
    calls.push({ port, args });
    return value;
  };
  const ports: SendSheetPorts = {
    online: () => state.online,
    openDirect: async (userId) => log('openDirect', userId, script.openDirect?.(userId) ?? ok({ id: `dm-${userId}` })),
    forward: async (p) =>
      log('forward', { to: p.targetConversationId, ids: p.messages.map((m) => m.id), source: p.sourceConversationId, cids: p.messages.map(() => p.nextClientMessageId()) }, script.forward?.(p.targetConversationId) ?? { ok: true as const, count: p.messages.length }),
    sendMessage: async (p) => {
      state.sends += 1;
      return log('sendMessage', { to: p.conversationId, body: p.body }, script.sendMessage?.(p.conversationId, p.body, state.sends) ?? ok(ack(`msg-${state.sends}`, p.conversationId)));
    },
    uploadFiles: async (files) => log('uploadFiles', files.map((f) => f.name), script.uploadFiles?.() ?? ok({ attachmentIds: files.map((_, i) => `att-${i}`) })),
    fetchFile: async (media) => log('fetchFile', media.url, script.fetchFile ? script.fetchFile() : new File([new Uint8Array(1)], media.name, { type: media.mime })),
    uploadMedia: async (file) =>
      log('uploadMedia', file.name, script.uploadMedia?.(file) ?? ok({ postMediaId: `pm-${file.name}`, fileUrl: `cdn/${file.name}`, mimeType: file.type })),
    publishMedia: async (p) => log('publishMedia', { format: p.format, media: p.media.postMediaId, caption: p.caption }, script.publishMedia?.() ?? ok({ id: 'post-x' })),
    publishFromAttachment: async (p) => log('publishFromAttachment', p, script.publishFromAttachment?.() ?? ok({ id: 'post-y' })),
    repost: async (p) => log('repost', p, script.repost?.() ?? ok({ id: 'post-z' })),
    createTextPost: async (p) => log('createTextPost', p, script.createTextPost?.() ?? ok({ id: 'post-t' })),
    newClientMessageId: () => `cid-${(state.cid += 1)}`,
  };
  return { ports, calls, state, portsCalled: () => calls.map((c) => c.port), bodies: () => calls.filter((c) => c.port === 'sendMessage').map((c) => c.args as { to: string; body: SendMessageBody }) };
}

const conversation = (id: string): SendTarget => ({ kind: 'conversation', conversationId: id, label: id });
const contact = (id: string): SendTarget => ({ kind: 'contact', userId: id, label: id });
const publish = (as: 'POST' | 'STORY' | 'REEL'): SendTarget => ({ kind: 'publish', as });
const file = (name: string, type = 'image/png'): File => new File([new Uint8Array(2)], name, { type });

const runOf = (h: ReturnType<typeof harness>, payload: SendPayload, targets: readonly SendTarget[], caption = '') => {
  const planned = planSend({ payload, targets, caption, viewerId: 'me' });
  if (!planned.ok) throw new Error(`plan refusé : ${JSON.stringify(planned.error)}`);
  return createSendRun({ entries: planned.entries, payload, language: 'fr', ports: h.ports });
};

const message = (id: string): ForwardSource => ({ id, content: 'Salut', originalLanguage: 'fr' });
const messagesPayload: SendPayload = { kind: 'messages', conversationId: 'src', messages: [message('m1')], preview: { kind: 'text' } };
const attachmentPayload = (mine: boolean): SendPayload => ({ kind: 'attachment', conversationId: 'src', messageId: 'm7', attachmentId: 'a7', mime: 'image/png', previewUrl: 'u', mine, protected: false });

describe('état par cible', () => {
  test('chaque cible est idle avant le départ, puis sent', async () => {
    const h = harness();
    const run = runOf(h, messagesPayload, [conversation('c1'), conversation('c2')]);
    expect(run.getState().statuses).toEqual({ 'conversation:c1': { state: 'idle' }, 'conversation:c2': { state: 'idle' } });
    expect(run.getState().phase).toBe('idle');
    await run.start();
    expect(run.getState().statuses).toEqual({ 'conversation:c1': { state: 'sent' }, 'conversation:c2': { state: 'sent' } });
    expect(run.getState().phase).toBe('done');
    expect(sentCountOf(run.getState())).toBe(2);
  });

  test('une cible est “sending” pendant son envoi, et l’abonné est prévenu', async () => {
    const h = harness();
    const seen: string[] = [];
    const run = runOf(h, messagesPayload, [conversation('c1')]);
    run.subscribe(() => seen.push(run.getState().statuses['conversation:c1']?.state ?? '?'));
    await run.start();
    expect(seen).toContain('sending');
    expect(seen[seen.length - 1]).toBe('sent');
  });

  test('se désabonner arrête les appels', async () => {
    const h = harness();
    const run = runOf(h, messagesPayload, [conversation('c1')]);
    let count = 0;
    const stop = run.subscribe(() => (count += 1));
    stop();
    await run.start();
    expect(count).toBe(0);
  });
});

describe('transfert', () => {
  test('transfert puis légende, dans l’ordre, vers chaque conversation', async () => {
    const h = harness();
    await runOf(h, messagesPayload, [conversation('c1'), conversation('c2')], 'Regarde').start();
    expect(h.portsCalled()).toEqual(['forward', 'sendMessage', 'forward', 'sendMessage']);
    const forwards = h.calls.filter((c) => c.port === 'forward').map((c) => c.args as { to: string; source: string });
    expect(forwards.map((f) => f.to)).toEqual(['c1', 'c2']);
    expect(forwards[0]?.source).toBe('src');
    expect(h.bodies()[0]?.body).toMatchObject({ content: 'Regarde', originalLanguage: 'fr' });
    expect(h.bodies()[0]?.body.forwardedFromId).toBeUndefined();
  });

  test('une personne sans conversation : la conversation directe est créée, puis on y envoie', async () => {
    const h = harness();
    await runOf(h, messagesPayload, [contact('u1')]).start();
    expect(h.portsCalled()).toEqual(['openDirect', 'forward']);
    expect((h.calls[1]?.args as { to: string }).to).toBe('dm-u1');
  });

  test('impossible d’ouvrir la conversation : la cible échoue, les autres partent', async () => {
    const h = harness({ openDirect: () => fail(403, 'bloqué') });
    const run = runOf(h, messagesPayload, [contact('u1'), conversation('c1')]);
    await run.start();
    expect(run.getState().statuses['contact:u1']).toEqual({ state: 'failed', failure: { kind: 'refused', status: 403, message: 'bloqué' } });
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'sent' });
    expect(failedKeysOf(run.getState())).toEqual(['contact:u1']);
  });

  test('un refus du transfert porte le motif du serveur', async () => {
    const h = harness({ forward: () => ({ ok: false, error: 'Vue unique' }) });
    const run = runOf(h, messagesPayload, [conversation('c1')]);
    await run.start();
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'refused', status: 0, message: 'Vue unique' } });
  });
});

describe('une pièce de message', () => {
  test('la mienne : une copie serveur, jamais d’attachmentIds', async () => {
    const h = harness();
    await runOf(h, attachmentPayload(true), [conversation('c1')], 'Tiens').start();
    expect(h.portsCalled()).toEqual(['sendMessage']);
    const body = h.bodies()[0]?.body;
    expect(body).toMatchObject({ copyAttachmentsFromMessageId: 'm7', content: 'Tiens' });
    expect(body?.attachmentIds).toBeUndefined();
  });

  test('celle d’un autre : forwardedFromId (et la conversation source), la légende en second', async () => {
    const h = harness();
    await runOf(h, attachmentPayload(false), [conversation('c1')], 'Tiens').start();
    const [transfer, caption] = h.bodies();
    expect(transfer?.body).toMatchObject({ forwardedFromId: 'm7', forwardedFromConversationId: 'src' });
    expect(transfer?.body.content).toBeUndefined();
    expect(caption?.body.content).toBe('Tiens');
  });

  test('publier : from-attachment, une fois par format', async () => {
    const h = harness();
    await runOf(h, attachmentPayload(true), [publish('STORY'), publish('POST')], 'Beau').start();
    expect(h.calls.map((c) => c.args)).toEqual([
      { attachmentId: 'a7', target: 'STORY', content: 'Beau' },
      { attachmentId: 'a7', target: 'POST', content: 'Beau' },
    ]);
  });

  test('publier : le refus PROTECTED_MEDIA est rendu tel quel', async () => {
    const h = harness({ publishFromAttachment: () => fail(400, 'protégé', 'PROTECTED_MEDIA') });
    const run = runOf(h, attachmentPayload(true), [publish('POST')]);
    await run.start();
    expect(run.getState().statuses['publish:POST']).toEqual({ state: 'failed', failure: { kind: 'refused', status: 400, message: 'protégé', code: 'PROTECTED_MEDIA' } });
  });
});

describe('une publication', () => {
  const payload: SendPayload = { kind: 'publication', postId: 'p1', postType: 'POST', url: 'https://meeshy.me/p/p1', preview: { kind: 'publication' } };

  test('vers une conversation : un message texte', async () => {
    const h = harness();
    await runOf(h, payload, [conversation('c1')], 'À voir').start();
    expect(h.bodies()[0]?.body.content).toBe('À voir\nhttps://meeshy.me/p/p1');
  });

  test('republier : un repost avec format et citation', async () => {
    const h = harness();
    await runOf(h, payload, [publish('STORY')], 'Bravo').start();
    expect(h.calls[0]).toEqual({ port: 'repost', args: { postId: 'p1', targetType: 'STORY', content: 'Bravo', isQuote: true } });
  });
});

describe('des fichiers vers plusieurs destinataires', () => {
  const payload: SendPayload = { kind: 'files', files: [file('a.png'), file('b.png')] };

  test('UN téléversement, puis des copies serveur pour les suivants', async () => {
    const h = harness();
    await runOf(h, payload, [conversation('c1'), contact('u1'), conversation('c2')], 'Vacances').start();
    expect(h.calls.filter((c) => c.port === 'uploadFiles')).toHaveLength(1);
    const [first, second, third] = h.bodies();
    expect(first?.body).toMatchObject({ attachmentIds: ['att-0', 'att-1'], content: 'Vacances' });
    expect(second?.body).toMatchObject({ copyAttachmentsFromMessageId: 'msg-1', content: 'Vacances' });
    expect(second?.body.attachmentIds).toBeUndefined();
    expect(third?.body).toMatchObject({ copyAttachmentsFromMessageId: 'msg-1' });
    expect(second?.to).toBe('dm-u1');
  });

  test('si le premier envoi échoue, le suivant devient l’envoyeur SANS re-téléverser', async () => {
    const h = harness({ sendMessage: (_c, _b, nth) => (nth === 1 ? fail(500, 'panne') : ok(ack('msg-2', 'c2'))) });
    const run = runOf(h, payload, [conversation('c1'), conversation('c2'), conversation('c3')]);
    await run.start();
    expect(h.calls.filter((c) => c.port === 'uploadFiles')).toHaveLength(1);
    const [, second, third] = h.bodies();
    expect(second?.body.attachmentIds).toEqual(['att-0', 'att-1']);
    expect(third?.body.copyAttachmentsFromMessageId).toBe('msg-2');
    expect(failedKeysOf(run.getState())).toEqual(['conversation:c1']);
  });

  test('si le téléversement échoue, le suivant RÉESSAIE de téléverser', async () => {
    let attempt = 0;
    const h = harness({ uploadFiles: () => ((attempt += 1) === 1 ? fail(0, 'coupé') : ok({ attachmentIds: ['x', 'y'] })) });
    const run = runOf(h, payload, [conversation('c1'), conversation('c2')]);
    await run.start();
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'network' } });
    expect(run.getState().statuses['conversation:c2']).toEqual({ state: 'sent' });
  });

  test('rejouer la cible échouée : elle COPIE maintenant le message déjà parti', async () => {
    const h = harness({ sendMessage: (_c, _b, nth) => (nth === 1 ? fail(500, 'panne') : ok(ack(`msg-${nth}`, 'x'))) });
    const run = runOf(h, payload, [conversation('c1'), conversation('c2')]);
    await run.start();
    await run.retry('conversation:c1');
    const last = h.bodies()[h.bodies().length - 1];
    expect(last?.to).toBe('c1');
    expect(last?.body.copyAttachmentsFromMessageId).toBe('msg-2');
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'sent' });
  });
});

describe('un média venu d’ailleurs', () => {
  const payload: SendPayload = { kind: 'media', url: 'https://cdn/x.jpg', mime: 'image/jpeg', name: 'x.jpg', preview: { kind: 'image' } };

  test('téléchargé UNE fois, même pour plusieurs destinataires', async () => {
    const h = harness();
    await runOf(h, payload, [conversation('c1'), conversation('c2')]).start();
    expect(h.calls.filter((c) => c.port === 'fetchFile')).toHaveLength(1);
    expect(h.calls.filter((c) => c.port === 'uploadFiles')).toHaveLength(1);
  });

  test('un téléchargement raté est un échec “download”, rejouable', async () => {
    let downloads = 0;
    const h = harness({ fetchFile: () => ((downloads += 1) === 1 ? null : file('x.jpg', 'image/jpeg')) });
    const run = runOf(h, payload, [conversation('c1')]);
    await run.start();
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'download' } });
    await run.retry('conversation:c1');
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'sent' });
  });
});

describe('publier des fichiers', () => {
  test('chaque fichier est téléversé puis publié, une fois', async () => {
    const h = harness();
    await runOf(h, { kind: 'files', files: [file('a.png'), file('b.png')] }, [publish('STORY')], 'Regarde').start();
    expect(h.portsCalled()).toEqual(['uploadMedia', 'publishMedia', 'uploadMedia', 'publishMedia']);
    expect(h.calls[1]?.args).toEqual({ format: 'STORY', media: 'pm-a.png', caption: 'Regarde' });
  });

  test('un fichier téléversé n’est pas re-téléversé au rejeu, et le publié n’est pas republié', async () => {
    let publications = 0;
    const h = harness({ publishMedia: () => ((publications += 1) === 2 ? fail(500, 'panne') : ok({ id: `p${publications}` })) });
    const run = runOf(h, { kind: 'files', files: [file('a.png'), file('b.png')] }, [publish('POST')]);
    await run.start();
    expect(run.getState().statuses['publish:POST']?.state).toBe('failed');
    await run.retry('publish:POST');
    expect(h.calls.filter((c) => c.port === 'uploadMedia')).toHaveLength(2);
    expect(h.calls.filter((c) => c.port === 'publishMedia')).toHaveLength(3);
    expect(run.getState().statuses['publish:POST']).toEqual({ state: 'sent' });
  });
});

describe('un texte', () => {
  test('publier un post texte', async () => {
    const h = harness();
    await runOf(h, { kind: 'text', text: 'Un extrait' }, [publish('POST')]).start();
    expect(h.calls[0]).toEqual({ port: 'createTextPost', args: { type: 'POST', content: 'Un extrait' } });
  });
});

describe('hors ligne, échec et rejeu', () => {
  test('hors ligne : aucun appel, échec “offline” par cible, rejouable au retour du réseau', async () => {
    const h = harness({ online: false });
    const run = runOf(h, messagesPayload, [conversation('c1'), conversation('c2')]);
    await run.start();
    expect(h.calls).toHaveLength(0);
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'offline' } });
    h.state.online = true;
    await run.retryFailed();
    expect(sentCountOf(run.getState())).toBe(2);
  });

  test('un échec de transport (statut 0) se dit “network”', async () => {
    const h = harness({ sendMessage: () => fail(0, 'coupé', 'TIMEOUT') });
    const run = runOf(h, { kind: 'text', text: 'x' }, [conversation('c1')]);
    await run.start();
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'network' } });
  });

  test('rejouer une légende échouée ne renvoie PAS le transfert déjà parti', async () => {
    let sends = 0;
    const h = harness({ sendMessage: () => ((sends += 1) === 1 ? fail(500, 'panne') : ok(ack('m', 'c1'))) });
    const run = runOf(h, messagesPayload, [conversation('c1')], 'Regarde');
    await run.start();
    expect(h.calls.filter((c) => c.port === 'forward')).toHaveLength(1);
    await run.retry('conversation:c1');
    expect(h.calls.filter((c) => c.port === 'forward')).toHaveLength(1);
    expect(h.calls.filter((c) => c.port === 'sendMessage')).toHaveLength(2);
    expect(run.getState().statuses['conversation:c1']).toEqual({ state: 'sent' });
  });

  test('le rejeu réutilise le MÊME identifiant de message (le serveur dédoublonne)', async () => {
    let sends = 0;
    const h = harness({ sendMessage: () => ((sends += 1) === 1 ? fail(0, 'coupé', 'TIMEOUT') : ok(ack('m', 'c1'))) });
    const run = runOf(h, { kind: 'text', text: 'x' }, [conversation('c1')]);
    await run.start();
    await run.retry('conversation:c1');
    const [first, second] = h.bodies();
    expect(first?.body.clientMessageId).toBeDefined();
    expect(second?.body.clientMessageId).toBe(first?.body.clientMessageId);
  });

  test('rejouer une cible déjà envoyée ne fait rien', async () => {
    const h = harness();
    const run = runOf(h, { kind: 'text', text: 'x' }, [conversation('c1')]);
    await run.start();
    await run.retry('conversation:c1');
    expect(h.calls).toHaveLength(1);
  });

  test('un port qui LÈVE est un échec de la cible, jamais un rejet de start()', async () => {
    const h = harness();
    const boom = { ...h.ports, sendMessage: async () => Promise.reject(new Error('boom')) } satisfies SendSheetPorts;
    const planned = planSend({ payload: { kind: 'text', text: 'x' }, targets: [conversation('c1'), conversation('c2')], caption: '', viewerId: 'me' });
    if (!planned.ok) throw new Error('plan');
    const run = createSendRun({ entries: planned.entries, payload: { kind: 'text', text: 'x' }, language: 'fr', ports: boom });
    await run.start();
    expect(failedKeysOf(run.getState())).toEqual(['conversation:c1', 'conversation:c2']);
  });
});
