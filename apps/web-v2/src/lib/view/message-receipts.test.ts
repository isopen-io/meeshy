import { describe, expect, test } from 'bun:test';

import type { AttachmentStatusRow } from '@/lib/api/attachments';
import type { ReceiptPersonRow } from '@/lib/api/receipts';

import {
  attachmentAggregateOf,
  attachmentKindOf,
  playCountLabel,
  positionFraction,
  receiptCategoriesOf,
} from './message-receipts';

const person = (partial: Partial<ReceiptPersonRow>): ReceiptPersonRow => ({
  participantId: 'p1',
  displayName: 'Alice',
  avatar: null,
  deliveredAt: null,
  receivedAt: null,
  readAt: null,
  readDevice: null,
  ...partial,
});

describe('receiptCategoriesOf', () => {
  test('readAt non nul ⇒ Vu par (même si receivedAt est aussi posé)', () => {
    const alice = person({ participantId: 'alice', receivedAt: '2026-09-21T10:00:05.000Z', readAt: '2026-09-21T10:00:30.000Z' });
    const { readBy, receivedBy, notYet } = receiptCategoriesOf([alice]);
    expect(readBy).toEqual([alice]);
    expect(receivedBy).toEqual([]);
    expect(notYet).toEqual([]);
  });

  test('receivedAt seul (readAt nul) ⇒ Reçu par', () => {
    const bob = person({ participantId: 'bob', receivedAt: '2026-09-21T10:00:05.000Z' });
    const { readBy, receivedBy, notYet } = receiptCategoriesOf([bob]);
    expect(receivedBy).toEqual([bob]);
    expect(readBy).toEqual([]);
    expect(notYet).toEqual([]);
  });

  test('ni receivedAt ni readAt ⇒ Pas encore', () => {
    const carol = person({ participantId: 'carol' });
    const { notYet, readBy, receivedBy } = receiptCategoriesOf([carol]);
    expect(notYet).toEqual([carol]);
    expect(readBy).toEqual([]);
    expect(receivedBy).toEqual([]);
  });

  test('liste vide ⇒ trois compartiments vides (opt-out déjà filtré côté serveur)', () => {
    expect(receiptCategoriesOf([])).toEqual({ readBy: [], receivedBy: [], notYet: [] });
  });
});

const statusRow = (partial: Partial<AttachmentStatusRow>): AttachmentStatusRow => ({
  participantId: 'p1',
  username: 'Alice',
  avatar: null,
  viewedAt: null,
  downloadedAt: null,
  listenedAt: null,
  watchedAt: null,
  listenCount: 0,
  watchCount: 0,
  listenedComplete: false,
  watchedComplete: false,
  lastPlayPositionMs: null,
  lastWatchPositionMs: null,
  viewCount: 0,
  viewedLanguages: [],
  ...partial,
});

describe('attachmentAggregateOf', () => {
  test('opens = somme des viewCount, downloads = nombre de lignes downloadedAt non nul', () => {
    const rows = [
      statusRow({ participantId: 'a', viewCount: 3, downloadedAt: '2026-09-21T10:00:00.000Z' }),
      statusRow({ participantId: 'b', viewCount: 1, downloadedAt: null }),
    ];
    expect(attachmentAggregateOf(rows)).toEqual({ opens: 4, downloads: 1 });
  });

  test('aucune ligne ⇒ zéro partout', () => {
    expect(attachmentAggregateOf([])).toEqual({ opens: 0, downloads: 0 });
  });
});

describe('positionFraction — mirroir de MessageViewsDetailView.positionFraction', () => {
  test('complete ⇒ 1, même sans position ni durée', () => {
    expect(positionFraction({ positionMs: null, complete: true })).toBe(1);
  });

  test('sans durée connue ⇒ 0', () => {
    expect(positionFraction({ positionMs: 4000, complete: false })).toBe(0);
  });

  test('sans position connue ⇒ 0', () => {
    expect(positionFraction({ positionMs: null, complete: false, durationMs: 10_000 })).toBe(0);
  });

  test('fraction normale', () => {
    expect(positionFraction({ positionMs: 2_500, complete: false, durationMs: 10_000 })).toBe(0.25);
  });

  test('borne à 1 — une position mesurée au-delà de la durée déclarée ne dépasse pas la barre', () => {
    expect(positionFraction({ positionMs: 12_000, complete: false, durationMs: 10_000 })).toBe(1);
  });
});

describe('attachmentKindOf', () => {
  const cases: readonly (readonly [string, 'audio' | 'video' | 'image' | 'file'])[] = [
    ['audio/webm', 'audio'],
    ['video/mp4', 'video'],
    ['image/png', 'image'],
    ['application/pdf', 'file'],
  ];
  for (const [mimeType, kind] of cases) {
    test(`${mimeType} ⇒ ${kind}`, () => {
      expect(attachmentKindOf({ mimeType })).toBe(kind);
    });
  }
});

describe('playCountLabel', () => {
  test('0 ou 1 ⇒ pas de badge', () => {
    expect(playCountLabel(0)).toBeNull();
    expect(playCountLabel(1)).toBeNull();
  });

  test('2 et plus ⇒ « Nx »', () => {
    expect(playCountLabel(2)).toBe('2x');
    expect(playCountLabel(7)).toBe('7x');
  });
});
