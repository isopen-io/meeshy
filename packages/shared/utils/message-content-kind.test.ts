import { describe, expect, it } from 'vitest';

import { messageContentKind, type MessageContentKind, type MessageContentSubject } from './message-content-kind';

const message = (overrides: Partial<MessageContentSubject> = {}): MessageContentSubject => ({
  id: '65f000000000000000000001',
  content: 'Bonjour',
  messageType: 'text',
  ...overrides,
});

const piece = (mimeType: string, originalName = 'piece') => ({ mimeType, originalName });

describe('messageContentKind — le TYPE de contenu, dérivé en un site (#11205)', () => {
  it.each<[string, Partial<MessageContentSubject>, MessageContentKind]>([
    ['un texte', {}, 'text'],
    ['un texte qui porte une adresse web', { content: 'Lis ça https://meeshy.me/a' }, 'link'],
    ['une photo', { content: '', attachments: [piece('image/jpeg')] }, 'image'],
    ['une vidéo légendée', { content: 'regarde', attachments: [piece('video/mp4')] }, 'video'],
    ['un vocal', { content: '', attachments: [piece('audio/m4a')] }, 'audio'],
    ['un document', { content: '', attachments: [piece('application/pdf', 'devis.pdf')] }, 'file'],
    ['une carte de visite', { content: '', attachments: [piece('text/vcard', 'zoe.vcf')] }, 'contact'],
    ['plusieurs pièces', { content: '', attachments: [piece('image/jpeg'), piece('application/pdf')] }, 'multi'],
    ['un lieu typé', { messageType: 'location' }, 'location'],
    ['un lieu écrit en texte par le serveur', { metadata: { location: { name: 'Gare' } } }, 'location'],
    ['un sticker', { metadata: { sticker: { templateId: 't' } } }, 'sticker'],
    ['un sondage', { metadata: { poll: { question: 'Où ?' } } }, 'poll'],
    ['un résumé d’appel', { messageType: 'system', metadata: { kind: 'call', callId: 'c' } }, 'call'],
    ['un appel en cours', { messageType: 'system', metadata: { kind: 'call-live', callId: 'c' } }, 'call'],
    ['un avis système', { messageType: 'system', content: 'Zoé a rejoint' }, 'system'],
    ['un message supprimé, quel que soit son type', { deletedAt: '2026-10-20T10:00:00Z', attachments: [piece('image/png')] }, 'deleted'],
  ])('%s ⇒ %s', (_label, overrides, kind) => {
    expect(messageContentKind(message(overrides)).kind).toBe(kind);
  });

  it('un message sans aucun drapeau n’en porte aucun', () => {
    expect(messageContentKind(message()).flags).toEqual({
      viewOnce: false,
      blurred: false,
      encrypted: false,
      ephemeral: false,
      optimistic: false,
      failed: false,
      captureNotice: false,
    });
  });

  it.each<[string, Partial<MessageContentSubject>, keyof ReturnType<typeof messageContentKind>['flags']]>([
    ['la vue unique d’une PIÈCE', { attachments: [{ mimeType: 'image/png', isViewOnce: true }] }, 'viewOnce'],
    ['le flou porté par les bits d’effet', { effectFlags: 2 }, 'blurred'],
    ['le chiffrement de bout en bout du message', { encryptionMode: 'e2ee' }, 'encrypted'],
    ['un message chiffré de régime inconnu', { isEncrypted: true }, 'encrypted'],
    ['une flamme à durée', { ephemeralDuration: 30 }, 'ephemeral'],
    ['une échéance servie', { expiresAt: '2026-10-21T10:00:00Z' }, 'ephemeral'],
    ['un envoi pas encore confirmé', { id: 'cid_2b7c1f3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f' }, 'optimistic'],
    ['un envoi en échec', { failed: true }, 'failed'],
    ['un avis de capture', { messageType: 'system', metadata: { kind: 'content-capture', capturedMessageId: 'm' } }, 'captureNotice'],
  ])('%s lève le drapeau %s', (_label, overrides, flag) => {
    expect(messageContentKind(message(overrides)).flags[flag]).toBe(true);
  });

  it.each(['E2EE', ' e2ee ', 'signal_v3'])('un régime de message %j est chiffré, même sans isEncrypted (fermé par défaut)', (encryptionMode) => {
    expect(messageContentKind(message({ encryptionMode })).flags.encrypted).toBe(true);
  });

  it('un chiffrement que le serveur lit (server, hybrid) n’est pas du bout en bout', () => {
    expect(messageContentKind(message({ isEncrypted: true, encryptionMode: 'server' })).flags.encrypted).toBe(false);
    expect(messageContentKind(message({ isEncrypted: true, encryptionMode: 'hybrid' })).flags.encrypted).toBe(false);
    expect(messageContentKind(message({ isEncrypted: true, encryptionMode: 'SERVER' })).flags.encrypted).toBe(false);
  });

  it('un avis de capture reste un message système', () => {
    expect(messageContentKind(message({ messageType: 'system', metadata: { kind: 'content-capture' } })).kind).toBe('system');
  });
});
