import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { publishOffered, type SendPayload } from '@/lib/send/send-sheet-plan';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import { admitForward, forwardRefusalOf, forwardRequestOf, type ForwardCandidate } from './forward';

/**
 * LA LOI DU TRANSFERT, CÔTÉ CLIENT (#5866) — miroir de `admitMessageForward`
 * (`services/gateway/src/services/messaging/forwardAdmission.ts:172-229`).
 *
 * Le serveur REFUSE déjà la vue unique ; une garde qui ne vivrait que là-bas
 * laisserait l'utilisateur découvrir l'interdit APRÈS l'aller-retour — et,
 * pire, après avoir cru choisir un destinataire.
 */

const candidate = (overrides: Partial<ForwardCandidate> = {}): ForwardCandidate => ({
  id: 'm1',
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  ...overrides,
});

const NOW = 1_700_000_000_000;

describe('forwardRefusalOf — la règle serveur, rejouée avant l’aller-retour', () => {
  test('un message ordinaire ne rencontre aucun refus', () => {
    expect(forwardRefusalOf(candidate(), NOW)).toBeNull();
  });

  test('un message à VUE UNIQUE est refusé — `isViewOnce`', () => {
    expect(forwardRefusalOf(candidate({ isViewOnce: true }), NOW)).toBe('view-once');
  });

  test('la COLONNE ne suffit pas : le BIT du bitfield refuse aussi (forwardAdmission.ts:218)', () => {
    expect(forwardRefusalOf(candidate({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }), NOW)).toBe('view-once');
  });

  test('une FLAMME À DURÉE encore vivante se transfère — la copie sera bornée par sa durée', () => {
    const flame = candidate({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60, expiresAt: new Date(NOW + 60_000) });
    expect(forwardRefusalOf(flame, NOW)).toBeNull();
  });

  test('une FLAMME APRÈS LECTURE ne se transfère pas', () => {
    const flame = candidate({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ });
    expect(forwardRefusalOf(flame, NOW)).toBe('after-read');
  });

  test('un éphémère dont la durée ne se lit pas est refusé : `expiresAt` n’est pas une durée', () => {
    expect(forwardRefusalOf(candidate({ expiresAt: new Date(NOW + 60_000) }), NOW)).toBe('after-read');
  });

  test('une PIÈCE à vue unique refuse le message qui la porte', () => {
    expect(forwardRefusalOf(candidate({ attachments: [{ isViewOnce: true }] }), NOW)).toBe('view-once');
  });

  test('un éphémère ÉCHU n’a plus de source à copier', () => {
    expect(forwardRefusalOf(candidate({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(NOW - 1) }), NOW)).toBe('unavailable');
  });

  test('un message SUPPRIMÉ n’a plus de source à copier', () => {
    expect(forwardRefusalOf(candidate({ deletedAt: new Date(NOW - 1000) }), NOW)).toBe('unavailable');
  });

  test('un FLOU se transfère — le serveur ne le refuse pas, le client non plus', () => {
    expect(forwardRefusalOf(candidate({ isBlurred: true }), NOW)).toBeNull();
  });
});

describe('admitForward — le protégé est retiré avec son motif, le reste part (D6)', () => {
  test('trois messages ordinaires ⇒ trois ids, dans l’ordre reçu', () => {
    const admission = admitForward([candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })], NOW);
    expect(admission).toEqual({ admitted: true, ids: ['a', 'b', 'c'], withdrawn: [] });
  });

  test('UNE vue unique dans la sélection est RETIRÉE, avec son motif — le reste part', () => {
    const admission = admitForward([candidate({ id: 'a' }), candidate({ id: 'b', isViewOnce: true })], NOW);
    expect(admission).toEqual({ admitted: true, ids: ['a'], withdrawn: [{ id: 'b', reason: 'view-once' }] });
  });

  test('UNE flamme après lecture est retirée de même', () => {
    const flame = candidate({ id: 'b', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ });
    expect(admitForward([candidate({ id: 'a' }), flame], NOW)).toEqual({ admitted: true, ids: ['a'], withdrawn: [{ id: 'b', reason: 'after-read' }] });
  });

  test('RIEN ne sort : refusé, par le premier motif', () => {
    expect(admitForward([candidate({ id: 'b', isViewOnce: true })], NOW)).toEqual({ admitted: false, reason: 'view-once' });
  });

  test('une sélection vide est un refus, jamais un envoi de zéro message', () => {
    expect(admitForward([], NOW)).toEqual({ admitted: false, reason: 'unavailable' });
  });
});

/**
 * LA DEMANDE D'OUVERTURE DE LA FEUILLE D'ENVOI (#8884) — ce que la sélection
 * ADMISE remet à `openSendSheet` : les messages (pour que le transport sache
 * quoi désigner), un aperçu qui ne fait pas fuir un contenu voilé, et — pour
 * UN message portant UN média — ce qui rend le média publiable.
 */
const fileOf = (overrides: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'att-1',
  messageId: 'm1',
  fileName: 'photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: 'https://cdn.test/photo.jpg',
  thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
  uploadedBy: 'u-autre',
  createdAt: new Date('2026-09-30T09:00:00.000Z').toISOString(),
  ...overrides,
});

const sourceOf = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm1',
    senderId: 'u-autre',
    content: 'Regarde ça',
    originalLanguage: 'fr',
    createdAt: new Date('2026-09-30T09:00:00.000Z'),
    translations: [],
    ...overrides,
  });

const messagesPayload = (request: SendSheetRequest): Extract<SendPayload, { kind: 'messages' }> => {
  if (request.payload.kind !== 'messages') throw new Error('charge inattendue');
  return request.payload;
};

describe('forwardRequestOf — la sélection admise devient une demande d’envoi', () => {
  test('l’intention est « transférer » et la charge nomme la conversation source', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf()], now: NOW });
    expect(request.intent).toBe('forward');
    expect(messagesPayload(request).conversationId).toBe('c-src');
  });

  test('les messages partent avec ce que le transport lit : id, texte, langue d’origine', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf(), sourceOf({ id: 'm2', content: 'Et ça' })], now: NOW });
    expect(messagesPayload(request).messages).toEqual([
      { id: 'm1', content: 'Regarde ça', originalLanguage: 'fr' },
      { id: 'm2', content: 'Et ça', originalLanguage: 'fr' },
    ]);
  });

  test('un STICKER part avec son sticker : la copie reste un sticker, jamais une image nue (#10630)', () => {
    const sticker = sourceOf({ id: 'm3', content: '', metadata: { sticker: { stickerId: 's-1' } } });
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sticker], now: NOW });
    expect(messagesPayload(request).messages).toEqual([{ id: 'm3', content: '', originalLanguage: 'fr', sticker: { stickerId: 's-1' } }]);
  });

  test('l’aperçu d’un STICKER est un sticker (« Sticker »), avec une vignette résolue par la passerelle, jamais une photo à chemin relatif (#10747)', () => {
    const piece = fileOf({ id: 'att-s', mimeType: 'image/webp', fileUrl: '/c/2026/10/s/sticker_1.webp', thumbnailUrl: '/c/2026/10/s/sticker_1_thumb.webp' });
    const sticker = sourceOf({ id: 'm3', content: '', metadata: { sticker: { stickerId: 's-1' } }, attachments: [piece] });
    const preview = messagesPayload(forwardRequestOf({ conversationId: 'c-src', messages: [sticker], now: NOW })).preview;
    expect(preview.kind).toBe('sticker');
    expect(preview.thumbUrl).toMatch(/^https?:\/\/.+\/c\/2026\/10\/s\/sticker_1_thumb\.webp$/);
    expect(preview.thumbUrl).not.toContain('staging.meeshy.me/c/');
  });

  test('une photo ordinaire garde sa vignette et son genre', () => {
    const photo = sourceOf({ content: '', attachments: [fileOf()] });
    const preview = messagesPayload(forwardRequestOf({ conversationId: 'c-src', messages: [photo], now: NOW })).preview;
    expect(preview).toEqual({ kind: 'image', thumbUrl: 'https://cdn.test/photo-thumb.jpg' });
  });

  test('une flamme à durée part avec SA borne ; un message ordinaire n’en porte aucune', () => {
    const flame = sourceOf({ id: 'm2', effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 300 });
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf(), flame], now: NOW });
    expect(messagesPayload(request).messages).toEqual([
      { id: 'm1', content: 'Regarde ça', originalLanguage: 'fr' },
      { id: 'm2', content: 'Regarde ça', originalLanguage: 'fr', maxDurationSeconds: 300 },
    ]);
  });

  test('une flamme à durée ne montre PAS son texte dans l’aperçu, et son média ne se publie pas', () => {
    const flame = sourceOf({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 300, attachments: [fileOf()] });
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [flame], now: NOW });
    expect(messagesPayload(request).preview).toEqual({ kind: 'messages', count: 1 });
    expect(publishOffered(request.payload)).toEqual([]);
  });

  test('un seul message texte s’aperçoit par son texte', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf()], now: NOW });
    expect(messagesPayload(request).preview).toEqual({ kind: 'text', text: 'Regarde ça' });
  });

  test('plusieurs messages s’aperçoivent par leur nombre', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf(), sourceOf({ id: 'm2' }), sourceOf({ id: 'm3' })], now: NOW });
    expect(messagesPayload(request).preview).toEqual({ kind: 'messages', count: 3 });
  });

  test('un message floutÉ ne montre NI son texte NI sa vignette dans l’aperçu', () => {
    const request = forwardRequestOf({
      conversationId: 'c-src',
      messages: [sourceOf({ isBlurred: true, attachments: [fileOf()] })],
      now: NOW,
    });
    expect(JSON.stringify(messagesPayload(request).preview)).not.toContain('Regarde ça');
    expect(JSON.stringify(messagesPayload(request).preview)).not.toContain('cdn.test');
  });

  test('UN message portant UNE photo ouverte offre le média à la publication', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf({ attachments: [fileOf()] })], now: NOW });
    expect(publishOffered(request.payload)).toEqual(['STORY', 'POST']);
  });

  test('une photo sans légende s’aperçoit par sa vignette', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf({ content: '', attachments: [fileOf()] })], now: NOW });
    expect(messagesPayload(request).preview).toEqual({ kind: 'image', thumbUrl: 'https://cdn.test/photo-thumb.jpg' });
  });

  test('deux médias dans un message : rien n’est publiable (quel média ?)', () => {
    const request = forwardRequestOf({
      conversationId: 'c-src',
      messages: [sourceOf({ attachments: [fileOf(), fileOf({ id: 'att-2' })] })],
      now: NOW,
    });
    expect(publishOffered(request.payload)).toEqual([]);
  });

  test('deux messages : rien n’est publiable, même avec un média chacun', () => {
    const request = forwardRequestOf({
      conversationId: 'c-src',
      messages: [sourceOf({ attachments: [fileOf()] }), sourceOf({ id: 'm2', attachments: [fileOf({ id: 'att-2' })] })],
      now: NOW,
    });
    expect(publishOffered(request.payload)).toEqual([]);
  });

  const protectedCases: readonly (readonly [string, Message])[] = [
    ['une pièce à vue unique', sourceOf({ attachments: [fileOf({ isViewOnce: true })] })],
    ['une pièce floutée', sourceOf({ attachments: [fileOf({ isBlurred: true })] })],
    ['une pièce chiffrée', sourceOf({ attachments: [fileOf({ isEncrypted: true })] })],
    ['un message flouté', sourceOf({ isBlurred: true, attachments: [fileOf()] })],
    ['un message éphémère', sourceOf({ expiresAt: new Date(NOW + 60_000), attachments: [fileOf()] })],
    ['une flamme à durée', sourceOf({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60, attachments: [fileOf()] })],
    ['un message chiffré', sourceOf({ isEncrypted: true, attachments: [fileOf()] })],
    ['un message flouté par son SEUL bit d’effet', sourceOf({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, attachments: [fileOf()] })],
  ];
  protectedCases.forEach(([label, source]) => {
    test(`${label} : le média ne se publie pas`, () => {
      const request = forwardRequestOf({ conversationId: 'c-src', messages: [source], now: NOW });
      expect(publishOffered(request.payload)).toEqual([]);
    });
  });

  const veiledTexts: readonly (readonly [string, Message])[] = [
    ['chiffré', sourceOf({ isEncrypted: true, content: 'secret' })],
    ['flouté par son seul bit d’effet', sourceOf({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, content: 'secret' })],
  ];
  veiledTexts.forEach(([label, source]) => {
    test(`un message ${label} : l’aperçu de la feuille ne montre PAS son texte`, () => {
      const request = forwardRequestOf({ conversationId: 'c-src', messages: [source], now: NOW });
      expect(messagesPayload(request).preview).toEqual({ kind: 'messages', count: 1 });
    });
  });
});

describe('forwardRequestOf — ce que le web ne peut pas faire partir (D7)', () => {
  test('un message chiffré, ou une pièce d’une source chiffrée, est déclaré non envoyable', () => {
    const request = forwardRequestOf({
      conversationId: 'c-src',
      messages: [sourceOf({ id: 'a' }), sourceOf({ id: 'b', isEncrypted: true }), sourceOf({ id: 'c', attachments: [fileOf({ isEncrypted: true })] })],
      now: NOW,
    });
    expect(messagesPayload(request).unsendable).toEqual(['b', 'c']);
  });

  test('le texte d’une conversation chiffrée que le web lit en clair part ; ses pièces, non', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf({ id: 'a' }), sourceOf({ id: 'b', attachments: [fileOf()] })], now: NOW, sourceEncrypted: true });
    expect(messagesPayload(request).unsendable).toEqual(['b']);
    expect(messagesPayload(request).exit[0]?.encrypted).toBe(true);
  });

  test('un message supprimé n’a plus de source : non envoyable', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf({ deletedAt: new Date(NOW - 1000) })], now: NOW });
    expect(messagesPayload(request).unsendable).toEqual(['m1']);
  });

  test('la loi lit les pièces : identifiant, type, poids, durée, drapeaux', () => {
    const request = forwardRequestOf({ conversationId: 'c-src', messages: [sourceOf({ attachments: [fileOf({ duration: 1200 })] })], now: NOW });
    expect(messagesPayload(request).exit[0]?.pieces).toEqual([{ id: 'att-1', mimeType: 'image/jpeg', bytes: 10, durationMs: 1200, isViewOnce: false, isBlurred: false }]);
  });
});
