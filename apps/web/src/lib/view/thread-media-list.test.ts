import { describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';

import { threadMediaEntriesOf } from './thread-media-list';

/**
 * #6303 — DEPUIS LE FIL, LA PELLICULE PORTE TOUTE LA CONVERSATION, DANS L'ORDRE
 * DU FIL, ET LA PIÈCE TOUCHÉE Y EST TOUJOURS — index chargé ou non.
 */
const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1024,
    fileUrl: `/f/${id}.jpg`,
    uploadedBy: 'u',
    createdAt: '2026-09-26T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const message = (id: string, minute: number, attachments: readonly Attachment[], partial: Partial<Message> = {}): Message =>
  ({
    id,
    conversationId: 'c-a',
    senderId: 'p-a',
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
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
    attachments,
    createdAt: new Date(Date.UTC(2026, 8, 26, 9, minute)),
    ...partial,
  }) as unknown as Message;

const ids = (entries: ReturnType<typeof threadMediaEntriesOf>) => entries.map((entry) => entry.attachment.id);

describe('threadMediaEntriesOf', () => {
  const m1 = message('m1', 1, [piece('a1')]);
  const m2 = message('m2', 2, [piece('a2'), piece('a3')]);
  const m3 = message('m3', 3, [piece('a4'), piece('doc', { mimeType: 'application/pdf' })]);
  const served = [m3, m2, m1];

  test('index froid : la pellicule du message touché, telle que la bulle la montre', () => {
    expect(ids(threadMediaEntriesOf({ opened: m2, openedVisual: [piece('a2'), piece('a3')], indexMessages: [] }))).toEqual(['a2', 'a3']);
  });

  test('index chargé : toute la conversation, le plus ancien d’abord, sans document', () => {
    expect(ids(threadMediaEntriesOf({ opened: m2, openedVisual: [piece('a2'), piece('a3')], indexMessages: served }))).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
  });

  test('le message touché garde la version de la bulle, jamais celle de l’index', () => {
    const bubble = piece('a2', { reactionSummary: { '❤️': 1 } });
    const entries = threadMediaEntriesOf({ opened: m2, openedVisual: [bubble], indexMessages: served });
    expect(entries.find((entry) => entry.attachment.id === 'a2')?.attachment.reactionSummary).toEqual({ '❤️': 1 });
    expect(ids(entries)).toEqual(['a1', 'a2', 'a4']);
  });

  test('un message plus récent que l’index (envoi en cours) se range à sa date', () => {
    const local = message('cid_1', 9, [piece('cid_p')]);
    expect(ids(threadMediaEntriesOf({ opened: local, openedVisual: [piece('cid_p')], indexMessages: served }))).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
      'cid_p',
    ]);
  });

  test('la vue unique d’un AUTRE message ne rejoint jamais la pellicule', () => {
    const secret = message('m4', 4, [piece('a5')], { isViewOnce: true });
    expect(ids(threadMediaEntriesOf({ opened: m1, openedVisual: [piece('a1')], indexMessages: [secret, ...served] }))).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
  });

  test('chaque page porte son message — l’auteur et la date suivent la page', () => {
    const entries = threadMediaEntriesOf({ opened: m2, openedVisual: [piece('a2'), piece('a3')], indexMessages: served });
    expect(entries.map((entry) => entry.message.id)).toEqual(['m1', 'm2', 'm2', 'm3']);
  });
});
