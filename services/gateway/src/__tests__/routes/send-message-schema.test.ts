import { describe, it, expect } from '@jest/globals';
import { SendMessageBodySchema } from '../../routes/conversations/messages';
import { MESSAGE_LIMITS } from '../../config/message-limits';

const cid = 'cid_d6fc465d-03eb-4fb9-8ac0-3a5c4fdb5377';
const attachmentId = '6a0ad7f66e21a483b4443d0b';

describe('SendMessageBodySchema — content vs attachment validation', () => {
  it('accepts a media-only message: empty content with attachmentIds', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a media-only message with content omitted entirely', () => {
    const result = SendMessageBodySchema.safeParse({
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a forwarded message with empty content', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      forwardedFromId: attachmentId,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a plain text message', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'hello',
      clientMessageId: cid,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a text message with attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'légende',
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty message: no content and no attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content with no attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '   ',
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly the MAX_MESSAGE_LENGTH limit', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH),
      clientMessageId: cid,
    });
    expect(result.success).toBe(true);
  });

  it('rejects content exceeding MAX_MESSAGE_LENGTH (env-configured, not hardcoded)', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH + 1),
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });
});

// Un lieu partagé rend aussi le corps non-vide : une géolocalisation seule
// n'a ni texte ni attachmentIds — même famille d'exemption que
// forwardedFromId/copyAttachmentsFromMessageId ci-dessus. Sans elle, tout
// message de géolocalisation seule meurt ici en "Le message ne peut pas être
// vide", avant même d'atteindre MessageValidator (repro : envoi bloqué pour
// toujours dans le SyncPill, #4039).
describe('SendMessageBodySchema — lieu partagé seul', () => {
  it('accepts a location-only message: empty content, no attachments, a location', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      location: { latitude: 48.8566, longitude: 2.3522, name: 'Paris' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a location-only message with content omitted entirely', () => {
    const result = SendMessageBodySchema.safeParse({
      clientMessageId: cid,
      location: { latitude: 48.8566, longitude: 2.3522 },
    });
    expect(result.success).toBe(true);
  });

  it('still rejects an empty message with no content, no attachments and no location', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageBodySchema — clientMessageId is optional', () => {
  it('accepts a text message WITHOUT clientMessageId (non-sync clients, e.g. scripts)', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello' });
    expect(result.success).toBe(true);
  });

  it('accepts a media-only message WITHOUT clientMessageId', () => {
    const result = SendMessageBodySchema.safeParse({ attachmentIds: [attachmentId] });
    expect(result.success).toBe(true);
  });

  it('still accepts a valid clientMessageId when provided (sync clients)', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello', clientMessageId: cid });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed clientMessageId when one IS provided', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello', clientMessageId: 'not-a-cid' });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageBodySchema — le chiffrement', () => {
  it('accepte un corps qui n\'apporte QUE du chiffré', () => {
    const result = SendMessageBodySchema.safeParse({ encryptedContent: 'ct-b64' });
    expect(result.success).toBe(true);
  });

  it('normalise la casse du mode — "E2EE" est ce que le client iOS émet', () => {
    const result = SendMessageBodySchema.safeParse({ encryptedContent: 'ct-b64', encryptionMode: 'E2EE' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.encryptionMode).toBe('e2ee');
  });

  it('normalise aussi Server et Hybrid', () => {
    expect(SendMessageBodySchema.safeParse({ content: 'x', encryptedContent: 'c', encryptionMode: 'Server' }).success).toBe(true);
    expect(SendMessageBodySchema.safeParse({ content: 'x', encryptedContent: 'c', encryptionMode: 'HYBRID' }).success).toBe(true);
  });

  it('le jeu de valeurs reste FERMÉ — la normalisation n\'ouvre pas la porte', () => {
    const result = SendMessageBodySchema.safeParse({ encryptedContent: 'ct-b64', encryptionMode: 'e2e' });
    expect(result.success).toBe(false);
  });

  it('rejette la promesse sans porteur : isEncrypted sans encryptedContent', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'Y2lwaGVy', isEncrypted: true, encryptionMode: 'e2ee' });
    expect(result.success).toBe(false);
  });

  it('accepte la forme du contrat : drapeau ET chiffré', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      isEncrypted: true,
      encryptedContent: 'ct-b64',
      encryptionMode: 'e2ee',
    });
    expect(result.success).toBe(true);
  });

  it('isEncrypted: false n\'exige aucun chiffré', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'bonjour', isEncrypted: false });
    expect(result.success).toBe(true);
  });
});

// Sticker (#4823) — même famille d'exemption que `location` : la décoration
// EST le contenu du message. Et un `metadata` brut envoyé à côté reste hors
// contrat : `z.object` le strippe, le seul chemin vers `metadata.sticker` est
// le champ dédié.
describe('SendMessageBodySchema — sticker', () => {
  const sticker = { templateId: 'love.heart', slots: { caption: 'Toi' }, animation: 'heartbeat', emoji: '❤️' };

  it('accepte et TRANSMET `sticker` à côté de la pièce jointe image (le cas nominal)', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      attachmentIds: [attachmentId],
      sticker,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sticker).toEqual(sticker);
  });

  it('accepte un sticker SEUL — ni texte, ni pièce jointe, ni lieu', () => {
    const result = SendMessageBodySchema.safeParse({ clientMessageId: cid, sticker });
    expect(result.success).toBe(true);
  });

  it('ignore un `metadata` brut envoyé à côté — jamais un passthrough', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'x',
      clientMessageId: cid,
      metadata: { sticker, postReplyTo: { id: 'volé' } },
    });
    expect(result.success).toBe(true);
    expect(result.success && 'metadata' in result.data).toBe(false);
  });
});
