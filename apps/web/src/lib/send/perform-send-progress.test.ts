import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';

import { pendingAttachmentOf } from './attachments';
import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, type ResumableUploader, type SendDeps } from './perform-send';
import { createSendProgressStore } from './send-progress';

const media = { source: 'gateway', base: '', credential: () => null } as const;
const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

const okFetch = (async (input: RequestInfo | URL) =>
  new Response(
    JSON.stringify({
      success: true,
      data: String(input).includes('/messages')
        ? { id: 'm1', clientMessageId: 'x', conversationId: 'c-a', senderId: 'u', createdAt: '2026-10-09T10:00:00.000Z' }
        : { attachments: [] },
    }),
    { status: 200 },
  )) as typeof fetch;

const depsOf = (outbox: ReturnType<typeof createOutboxStore>, transfer: NonNullable<SendDeps['transfer']>): SendDeps => ({
  source: 'gateway',
  transport: createHttpTransport({ base: '', fetchImpl: okFetch }),
  queryClient: new QueryClient(),
  outbox,
  online: true,
  transfer,
});

const draftOf = (name: string) => ({ content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(file(name, 10))] });

describe('performSend — la progression TUS alimente la bulle de CE message (#16134)', () => {
  test('deux envois en vol : chaque clientMessageId reçoit sa propre fraction, puis la retire', async () => {
    const progress = createSendProgressStore();
    const outbox = createOutboxStore();
    const during: Record<string, Record<string, number>> = {};
    const gates: Array<() => void> = [];
    const resumable: ResumableUploader = async (p) => {
      p.onProgress?.(p.file.name === 'a.pdf' ? 0.3 : 0.7);
      await new Promise<void>((release) => gates.push(release));
      return { ok: true, data: { attachmentId: `att-${p.file.name}` } };
    };
    const transfer = { progress, media, limits: { maxFiles: 30, maxBytes: 2 }, resumable };
    const first = performSend({ conversationId: 'c-a', draft: draftOf('a.pdf'), viewerId: 'u', deps: depsOf(outbox, transfer) });
    const second = performSend({ conversationId: 'c-a', draft: draftOf('b.pdf'), viewerId: 'u', deps: depsOf(outbox, transfer) });
    await new Promise((r) => setTimeout(r, 20));
    const [idA, idB] = entriesOf(outbox.getState(), 'c-a').map((e) => e.message.clientMessageId);
    during['all'] = { ...progress.getState().fractions };
    expect(during['all']).toEqual({ [idA!]: 0.3, [idB!]: 0.7 });
    gates.forEach((release) => release());
    await Promise.all([first, second]);
    expect(progress.getState().fractions).toEqual({});
  });

  test('un échec d’upload retire aussi la fraction', async () => {
    const progress = createSendProgressStore();
    const outbox = createOutboxStore();
    const resumable: ResumableUploader = async (p) => {
      p.onProgress?.(0.5);
      return { ok: false, status: 500, error: 'boom' };
    };
    await performSend({ conversationId: 'c-a', draft: draftOf('x.pdf'), viewerId: 'u', deps: depsOf(outbox, { progress, media, limits: { maxFiles: 30, maxBytes: 2 }, resumable }) });
    expect(progress.getState().fractions).toEqual({});
  });
});
