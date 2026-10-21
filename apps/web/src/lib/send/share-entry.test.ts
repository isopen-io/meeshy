import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import type { ShareMessage } from '@meeshy/shared/utils/share-plan';

import { publishFormatsOf, shareEntryOf, sharePlanOf } from './share-entry';
import type { SendPayload } from './send-sheet-plan';

/**
 * LE PONT ENTRE CE QUE LE WEB REMET À L'ÉCRAN DE PARTAGE ET LA LOI PARTAGÉE
 * (#10948) — `planShare` (`@meeshy/shared/utils/share-plan`) décide ; ce
 * module ne fait que traduire la demande du web en entrée de la loi, et le
 * verdict en formats que le web sait exécuter.
 */
const message = (over: Partial<ShareMessage> = {}): ShareMessage => ({ id: 'm1', text: 'Salut', ...over });

const messages = (exit: readonly ShareMessage[], over: Partial<Extract<SendPayload, { kind: 'messages' }>> = {}): SendPayload => ({
  kind: 'messages',
  conversationId: 'src',
  messages: exit.map((m) => ({ id: m.id, content: m.text ?? '', originalLanguage: 'fr' })),
  exit,
  preview: { kind: 'text', text: 'Salut' },
  ...over,
});

const piece = (exit: ShareMessage, attachmentId: string, mime = 'image/jpeg'): SendPayload => ({
  kind: 'attachment',
  conversationId: 'src',
  messageId: exit.id,
  attachmentId,
  mime,
  previewUrl: 'https://cdn/a.jpg',
  exit,
});

const file = (name: string, type: string, size = 2): File => new File([new Uint8Array(size)], name, { type });

describe('shareEntryOf — la demande du web devient l’entrée de la loi', () => {
  test('des fichiers : des médias, leur type et leur poids', () => {
    const entry = shareEntryOf({ kind: 'files', files: [file('a.jpg', 'image/jpeg', 3), file('b.pdf', '')] });
    expect(entry).toEqual({ kind: 'media', media: [{ mimeType: 'image/jpeg', bytes: 3 }, { mimeType: 'application/octet-stream', bytes: 2 }] });
  });

  test('un texte avec adresse : un lien ; sans adresse : un texte', () => {
    expect(shareEntryOf({ kind: 'text', text: 'Programme', url: 'https://x.org' })).toEqual({ kind: 'link', url: 'https://x.org', text: 'Programme' });
    expect(shareEntryOf({ kind: 'text', text: 'Bonjour' })).toEqual({ kind: 'text', text: 'Bonjour' });
  });

  test('une publication devient post, story ou réel selon son type', () => {
    const base = { kind: 'publication', postId: 'p', url: 'https://meeshy.me/p', preview: { kind: 'publication' } } as const;
    expect(shareEntryOf({ ...base, postType: 'POST' })).toEqual({ kind: 'post', url: 'https://meeshy.me/p' });
    expect(shareEntryOf({ ...base, postType: 'STORY' })).toEqual({ kind: 'story', url: 'https://meeshy.me/p' });
    expect(shareEntryOf({ ...base, postType: 'REEL' })).toEqual({ kind: 'reel', url: 'https://meeshy.me/p' });
  });

  test('une pièce d’un message : la pièce, jugée avec son message', () => {
    const exit = message({ pieces: [{ id: 'a1', mimeType: 'image/jpeg' }] });
    expect(shareEntryOf(piece(exit, 'a1'))).toEqual({ kind: 'piece', message: exit, attachmentId: 'a1' });
  });

  test('un profil et une invitation : des cartes', () => {
    expect(shareEntryOf({ kind: 'profile', userId: 'u', url: 'https://meeshy.me/u/lea', name: 'Léa' })).toEqual({ kind: 'profile', url: 'https://meeshy.me/u/lea' });
    expect(shareEntryOf({ kind: 'invitation', url: 'https://meeshy.me/join/x', title: 'Équipe' })).toEqual({ kind: 'invitation', url: 'https://meeshy.me/join/x' });
  });
});

describe('sharePlanOf — le verdict, plus ce que le web ne sait pas refaire', () => {
  test('une sélection mixte retire la vue unique et garde le reste (D6)', () => {
    const plan = sharePlanOf(messages([message({ id: 'a' }), message({ id: 'b', isViewOnce: true }), message({ id: 'c' })]));
    expect(plan.kept).toEqual(['a', 'c']);
    expect(plan.withdrawn).toEqual([{ id: 'b', reason: 'view-once' }]);
    expect(plan.blocked).toBeNull();
  });

  test('un message que le web ne peut pas recopier sur l’appareil est retiré, motif « indisponible » (D7)', () => {
    const plan = sharePlanOf(messages([message({ id: 'a' }), message({ id: 'b', encrypted: true })], { unsendable: ['b'] }));
    expect(plan.kept).toEqual(['a']);
    expect(plan.withdrawn).toEqual([{ id: 'b', reason: 'unavailable' }]);
  });

  test('rien ne part ⇒ bloqué, et l’on ne peut pas envoyer', () => {
    const plan = sharePlanOf(messages([message({ id: 'b', encrypted: true })], { unsendable: ['b'] }), [{ id: 'c1' }]);
    expect(plan.kept).toEqual([]);
    expect(plan.blocked).toBe('unavailable');
    expect(plan.canSend).toBe(false);
  });

  test('une pièce chiffrée que le web ne détient pas en clair ne part pas', () => {
    const exit = message({ encrypted: true, pieces: [{ id: 'a1', mimeType: 'image/jpeg' }] });
    expect(sharePlanOf(piece(exit, 'a1')).blocked).toBe('unavailable');
  });

  test('l’avertissement de sortie du chiffrement nomme les destinations non chiffrées', () => {
    const plan = sharePlanOf(messages([message({ id: 'a', encrypted: true })]), [{ id: 'chiffree', encrypted: true }, { id: 'claire' }]);
    expect(plan.encryption?.warnDestinationIds).toEqual(['claire']);
  });
});

describe('publishFormatsOf — la loi offre, le web n’affiche que ce qu’il sait faire', () => {
  test('une seule photo : post et story, jamais un réel', () => {
    expect(publishFormatsOf({ kind: 'files', files: [file('a.jpg', 'image/jpeg')] })).toEqual(['STORY', 'POST']);
  });

  test('le réel suit `qualifiesAsReel` : deux photos, ou une vidéo dont la durée se sait', () => {
    expect(publishFormatsOf({ kind: 'files', files: [file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')] })).toEqual(['STORY', 'POST', 'REEL']);
    expect(publishFormatsOf({ kind: 'files', files: [file('a.mp4', 'video/mp4')] })).toEqual(['STORY', 'POST']);
  });

  test('un fichier ou un son ne se publie pas d’ici (le studio les reçoit)', () => {
    expect(publishFormatsOf({ kind: 'files', files: [file('a.pdf', 'application/pdf')] })).toEqual([]);
    expect(publishFormatsOf({ kind: 'files', files: [file('a.m4a', 'audio/mp4')] })).toEqual([]);
  });

  test('une flamme ne se publie pas', () => {
    const exit = message({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 3600, pieces: [{ id: 'a1', mimeType: 'image/jpeg' }] });
    expect(publishFormatsOf(piece(exit, 'a1'))).toEqual([]);
  });

  test('un message flouté ne se publie pas (D8)', () => {
    const exit = message({ isBlurred: true, pieces: [{ id: 'a1', mimeType: 'video/mp4' }] });
    expect(publishFormatsOf(messages([exit]))).toEqual([]);
  });

  test('un seul message à une seule pièce se publie par sa pièce ; deux pièces, non', () => {
    expect(publishFormatsOf(messages([message({ pieces: [{ id: 'a1', mimeType: 'video/mp4', durationMs: 12_000 }] })]))).toEqual(['STORY', 'POST', 'REEL']);
    expect(publishFormatsOf(messages([message({ pieces: [{ id: 'a1', mimeType: 'image/jpeg' }, { id: 'a2', mimeType: 'image/jpeg' }] })]))).toEqual([]);
  });

  test('une publication se republie en post et en story ; une story, pas du tout (D14)', () => {
    const base = { kind: 'publication', postId: 'p', url: 'u', preview: { kind: 'publication' } } as const;
    expect(publishFormatsOf({ ...base, postType: 'POST' })).toEqual(['STORY', 'POST']);
    expect(publishFormatsOf({ ...base, postType: 'STORY' })).toEqual([]);
  });

  test('un texte : un post seulement ; un profil : rien', () => {
    expect(publishFormatsOf({ kind: 'text', text: 'Bonjour' })).toEqual(['POST']);
    expect(publishFormatsOf({ kind: 'profile', userId: 'u', url: 'u', name: 'Léa' })).toEqual([]);
  });
});
