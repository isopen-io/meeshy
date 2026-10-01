import { describe, expect, test } from 'bun:test';

import { amina, attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';

import { DISCUSSION_CARD_MAX_MESSAGES, discussionCardSubjectOf } from './discussion-card-subject';

/**
 * #9039 — « IMAGER LA DISCUSSION » : la carte d'Imager, étendue aux messages
 * du fil qui MÈNENT au message choisi, dans l'ordre où on les a lus. Mêmes
 * gardes que la carte d'un message : ce qui ne se copie pas ne se peint pas.
 */

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime();
const VIEWER = { id: 'u-jacques', displayName: 'Jacques', handle: 'jacques' };

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute));

const line = (id: string, minute: number, overrides: Partial<Message> = {}): Message =>
  message({
    id,
    ...(minute % 2 === 0 ? { senderId: VIEWER.id } : { senderId: amina.userId ?? 'u-amina', sender: amina }),
    content: `message ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: at(minute),
    ...overrides,
  });

const photo = (id: string): Attachment => ({
  ...attachmentDefaults,
  id,
  messageId: 'm',
  fileName: `${id}.jpg`,
  originalName: `${id}.jpg`,
  fileSize: 1000,
  fileUrl: `https://gate.meeshy.me/files/${id}.jpg`,
  mimeType: 'image/jpeg',
  uploadedBy: VIEWER.id,
  createdAt: '2026-10-01T10:00:00.000Z',
  width: 800,
  height: 600,
});

const subjectOf = (messages: readonly Message[], anchorId: string, served: Readonly<Record<string, string>> = {}) =>
  discussionCardSubjectOf({ messages, anchorId, servedOf: (id) => served[id], viewer: VIEWER, now: NOW });

describe('discussionCardSubjectOf — la discussion jusqu’au message choisi', () => {
  test('les messages qui précèdent le choisi, dans l’ordre du fil, et rien après lui', () => {
    const subject = subjectOf([line('m3', 3), line('m1', 1), line('m2', 2), line('m4', 4)], 'm3');
    expect(subject?.reply.text).toBe('message m1');
    expect(subject?.followUps?.map((part) => part.text)).toEqual(['message m2', 'message m3']);
    expect(subject?.sentAt).toEqual(at(3));
    expect(subject?.quoted).toBeNull();
  });

  test('chaque message porte son auteur et le texte SERVI au lecteur', () => {
    const subject = subjectOf([line('m1', 1), line('m2', 2)], 'm2', { m1: 'Hello, servi en français' });
    expect(subject?.reply).toEqual({ author: amina.displayName ?? '', text: 'Hello, servi en français', handle: null });
    expect(subject?.followUps).toEqual([{ author: 'Jacques', text: 'message m2', handle: 'jacques' }]);
  });

  test(`bornée aux ${DISCUSSION_CARD_MAX_MESSAGES} derniers messages, le choisi compris`, () => {
    const messages = Array.from({ length: 20 }, (_, i) => line(`m${i}`, i));
    const subject = subjectOf(messages, 'm19');
    const texts = [subject?.reply.text, ...(subject?.followUps ?? []).map((part) => part.text)];
    expect(texts).toHaveLength(DISCUSSION_CARD_MAX_MESSAGES);
    expect(texts.at(-1)).toBe('message m19');
    expect(texts[0]).toBe(`message m${20 - DISCUSSION_CARD_MAX_MESSAGES}`);
  });

  test('un message protégé (flouté, vue unique, supprimé) ne se peint pas et ne compte pas dans la borne', () => {
    const subject = subjectOf(
      [line('m1', 1), line('m2', 2, { isBlurred: true }), line('m3', 3, { isViewOnce: true }), line('m4', 4, { deletedAt: at(5) }), line('m5', 5)],
      'm5',
    );
    expect([subject?.reply.text, ...(subject?.followUps ?? []).map((part) => part.text)]).toEqual(['message m1', 'message m5']);
  });

  test('un choisi protégé ⇒ aucune carte', () => {
    expect(subjectOf([line('m1', 1), line('m2', 2, { isBlurred: true })], 'm2')).toBeNull();
  });

  test('un choisi absent du fil ⇒ aucune carte', () => {
    expect(subjectOf([line('m1', 1)], 'm-absent')).toBeNull();
  });

  test('les médias de la discussion, dans l’ordre, sans pièce masquée, bornés à quatre', () => {
    const subject = subjectOf(
      [
        line('m1', 1, { attachments: [photo('p1'), photo('p2')] }),
        line('m2', 2, { attachments: [{ ...photo('p-once'), isViewOnce: true }, photo('p3')] }),
        line('m3', 3, { content: '', attachments: [photo('p4'), photo('p5')] }),
      ],
      'm3',
    );
    expect(subject?.media.map((item) => item.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
