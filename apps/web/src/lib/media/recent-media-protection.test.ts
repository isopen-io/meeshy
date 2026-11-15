import { describe, expect, test } from 'bun:test';

import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import type { AttachmentProtectionFlags } from '@meeshy/shared/utils/attachment-protection';

import { recentMediaProtectionOf } from './recent-media-protection';
import { messagesRecentMediaScope } from './recent-media-scope';

/**
 * #12052 — SEUL UN MESSAGE STANDARD, EN CLAIR, PEUT GARDER SON MÉDIA HORS
 * LIGNE. Le seau « récents » (#11326) garde trois jours le fichier entier d'un
 * média vu : un éphémère y survivrait à son échéance, une vue unique à son
 * ouverture, un flouté à son voile, un chiffré à son régime.
 */
const NOW = Date.parse('2026-10-23T10:00:00.000Z');

const clip = (partial: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'a-clip',
  messageId: 'm-1',
  fileName: 'clip.mp4',
  originalName: 'clip.mp4',
  mimeType: 'video/mp4',
  fileSize: 4096,
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/clip.mp4',
  uploadedBy: 'u-amina',
  createdAt: '2026-10-23T09:00:00.000Z',
  ...partial,
});

const sent = (partial: Partial<Message> = {}): Message =>
  message({
    ...partial,
    id: partial.id ?? 'm-1',
    senderId: 'u-amina',
    content: '',
    originalLanguage: 'fr',
    translations: partial.translations ?? [],
    createdAt: new Date('2026-10-23T09:00:00.000Z'),
  });

const verdict = (msg: Message | undefined, attachment: AttachmentProtectionFlags = clip(), conversationEncrypted = false) =>
  recentMediaProtectionOf({ message: msg, attachment, conversationEncrypted, now: NOW });

describe('recentMediaProtectionOf', () => {
  test('un message standard, en clair, sur une pièce sans masque : le média peut être gardé', () => {
    expect(verdict(sent())).toBe('none');
  });

  test('sans message connu, rien n’est gardé (fail-closed)', () => {
    expect(verdict(undefined)).toBe('protected');
  });

  test('un éphémère ENCORE LISIBLE est protégé — `protectionOf` le dit « standard » jusqu’à son échéance', () => {
    expect(verdict(sent({ ephemeralDuration: 30 }))).toBe('protected');
    expect(verdict(sent({ expiresAt: new Date(NOW + 60_000) }))).toBe('protected');
    expect(verdict(sent({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }))).toBe('protected');
  });

  test('vue unique, flouté, supprimé, expiré : protégés', () => {
    expect(verdict(sent({ isViewOnce: true }))).toBe('protected');
    expect(verdict(sent({ isBlurred: true }))).toBe('protected');
    expect(verdict(sent({ deletedAt: new Date(NOW - 1000) }))).toBe('protected');
    expect(verdict(sent({ expiresAt: new Date(NOW - 1000) }))).toBe('protected');
  });

  test('la PIÈCE porte sa propre protection, indépendante de celle du message', () => {
    expect(verdict(sent(), clip({ isViewOnce: true }))).toBe('protected');
    expect(verdict(sent(), clip({ isBlurred: true }))).toBe('protected');
    expect(verdict(sent(), { ...clip(), effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })).toBe('protected');
  });

  test('un message chiffré, ou une conversation sous un régime de chiffrement : protégés', () => {
    expect(verdict(sent({ isEncrypted: true }))).toBe('protected');
    expect(verdict(sent({ encryptionMode: 'e2ee' }))).toBe('protected');
    expect(verdict(sent(), clip(), true)).toBe('protected');
  });
});

describe('messagesRecentMediaScope — la visionneuse du fil juge chaque page sur SON message', () => {
  test('une pellicule mêlant un message standard et un éphémère ne garde que le premier ; une pièce inconnue n’est pas gardée', () => {
    const scope = messagesRecentMediaScope({
      outer: { protectionOf: () => 'protected' },
      entries: [
        { message: sent({ id: 'm-1' }), attachment: clip({ id: 'a-1' }) },
        { message: sent({ id: 'm-2', ephemeralDuration: 30 }), attachment: clip({ id: 'a-2' }) },
      ],
      conversationEncrypted: false,
      now: NOW,
    });
    expect(scope.protectionOf('a-1')).toBe('none');
    expect(scope.protectionOf('a-2')).toBe('protected');
    expect(scope.protectionOf('a-inconnue')).toBe('protected');
  });
});
