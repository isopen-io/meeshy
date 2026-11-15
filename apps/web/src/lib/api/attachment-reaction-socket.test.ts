import { describe, expect, test } from 'bun:test';

import type { SocketClient } from '@/lib/net/socket';

import { sendAttachmentReaction } from './attachment-reaction-socket';

/** #6303 — la réaction d'une pièce part sur le socket, avec l'accusé qui décide de la pastille. */
const socket = (params: {
  readonly connected?: boolean;
  readonly ack?: (event: string, payload: unknown) => Promise<unknown>;
}): SocketClient & { readonly sent: { event: string; payload: unknown }[] } => {
  const sent: { event: string; payload: unknown }[] = [];
  return {
    sent,
    connected: params.connected ?? true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: () => undefined,
    off: () => undefined,
    emit: () => undefined,
    ...(params.ack === undefined
      ? {}
      : {
          emitWithAck: (event: string, payload: unknown) => {
            sent.push({ event, payload });
            return params.ack!(event, payload);
          },
        }),
  };
};

const REQUEST = { action: 'add', attachmentId: 'a-1', messageId: 'm-1', emoji: '❤️' } as const;

describe('sendAttachmentReaction', () => {
  test('ajouter émet attachment:reaction-add avec la pièce, le message et l’émoji', async () => {
    const client = socket({ ack: () => Promise.resolve({ success: true }) });
    expect(await sendAttachmentReaction(client, REQUEST)).toBe('ok');
    expect(client.sent).toEqual([{ event: 'attachment:reaction-add', payload: { attachmentId: 'a-1', messageId: 'm-1', emoji: '❤️' } }]);
  });

  test('retirer émet attachment:reaction-remove', async () => {
    const client = socket({ ack: () => Promise.resolve({ success: true }) });
    await sendAttachmentReaction(client, { ...REQUEST, action: 'remove' });
    expect(client.sent[0]?.event).toBe('attachment:reaction-remove');
  });

  test('un accusé en échec est un refus', async () => {
    expect(await sendAttachmentReaction(socket({ ack: () => Promise.resolve({ success: false, error: 'x' }) }), REQUEST)).toBe('refused');
  });

  test('pas de socket, socket coupé ou délai dépassé : hors ligne', async () => {
    expect(await sendAttachmentReaction(null, REQUEST)).toBe('offline');
    expect(await sendAttachmentReaction(socket({ connected: false, ack: () => Promise.resolve({ success: true }) }), REQUEST)).toBe('offline');
    expect(await sendAttachmentReaction(socket({ ack: () => Promise.reject(new Error('timeout')) }), REQUEST)).toBe('offline');
  });
});
