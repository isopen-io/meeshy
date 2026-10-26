import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MediaHubRow } from '@/components/conversation-media-hub-items';
import { itemsOfKind } from '@/lib/view/media-hub';

import type { Attachment, Message } from '@/lib/api/types';

const BLOB: Attachment = {
  id: 'blob-1',
  messageId: 'm-sealed',
  fileName: 'e2ee_8b1f0c1e-0000-4000-8000-000000000000.bin',
  originalName: '',
  mimeType: 'application/octet-stream',
  fileSize: 1240,
  fileUrl: '2026/10/u1/e2ee_8b1f0c1e-0000-4000-8000-000000000000.bin',
  uploadedBy: 'u-bruno',
  isAnonymous: false,
  createdAt: '2026-10-25T13:39:00.000Z',
  isForwarded: false,
  capturedInApp: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
  isEncrypted: true,
  encryptionMode: 'e2ee',
};

const SEALED: Message = {
  id: 'm-sealed',
  conversationId: 'c-e2ee',
  senderId: 'p-bruno',
  content: '[Encrypted]',
  originalLanguage: 'fr',
  messageType: 'file',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: true,
  encryptionMode: 'e2ee',
  attachments: [BLOB],
  createdAt: new Date('2026-10-25T13:39:00.000Z'),
  updatedAt: new Date('2026-10-25T13:39:00.000Z'),
  timestamp: new Date('2026-10-25T13:39:00.000Z'),
  translations: [],
};

const hosts = { language: 'fr', languages: ['fr'], viewerId: 'u-viewer', accent: '#6366F1' } as const;

describe('#13104 — l’index « Médias, liens et documents » ne présente pas un blob e2ee comme un document', () => {
  test('un message e2ee porteur d’un blob n’entre dans aucun genre de l’index', () => {
    expect(itemsOfKind([SEALED], 'document').length).toBe(0);
  });

  test('la rangée ne propose ni lien ni nom de blob', () => {
    const items = itemsOfKind([SEALED], 'document');
    const html = items.map((item) => renderToStaticMarkup(<MediaHubRow item={item} hosts={hosts} />)).join('');
    expect({ link: /<a [^>]*href/.test(html), bin: html.includes('.bin') }).toEqual({ link: false, bin: false });
  });
});
