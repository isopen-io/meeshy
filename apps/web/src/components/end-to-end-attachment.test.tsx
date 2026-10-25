import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import type { Attachment, Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * UNE PIÈCE JOINTE CHIFFRÉE DE BOUT EN BOUT, SUR LE WEB (#10789). Le web ne
 * détient aucune clé libsignal (#10788) : il ne lit ni le pointeur, ni la clé,
 * ni le nom. La passerelle sert un blob opaque (`application/octet-stream`),
 * que le web ne doit ni proposer au téléchargement ni montrer comme un fichier
 * ordinaire : la bulle dit qu'une pièce chiffrée se lit dans l'application.
 */

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

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const surfaces = (message: Message) => ({
  bubble: renderToStaticMarkup(
    <Bubble
      place={placeOf(message)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  ),
  row: renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf(message)}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  ),
});

describe('une pièce jointe chiffrée de bout en bout sur le web (#10789)', () => {
  test('la bulle et la rangée disent qu’une pièce chiffrée s’ouvre dans l’application', () => {
    for (const [surface, html] of Object.entries(surfaces(SEALED))) {
      expect({ surface, says: html.includes('Pièce jointe chiffrée') }).toEqual({ surface, says: true });
      expect({ surface, says: html.includes('application Meeshy') }).toEqual({ surface, says: true });
    }
  });

  test('aucun lien ni nom de blob : le web ne propose pas de télécharger un chiffré qu’il ne lit pas', () => {
    for (const [surface, html] of Object.entries(surfaces(SEALED))) {
      expect({ surface, leaks: html.includes('.bin') || html.includes(BLOB.fileUrl) }).toEqual({ surface, leaks: false });
      expect({ surface, link: /<a [^>]*href/.test(html) }).toEqual({ surface, link: false });
    }
  });

  test('un message chiffré sans pièce garde sa mention ordinaire', () => {
    const { bubble } = surfaces({ ...SEALED, messageType: 'text', attachments: [] });
    expect(bubble.includes('Pièce jointe chiffrée')).toBe(false);
    expect(bubble.includes('Chiffré de bout en bout')).toBe(true);
  });
});
