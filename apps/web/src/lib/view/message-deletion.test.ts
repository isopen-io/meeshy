import { describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { menuScope } from '@/test-support/menu-viewer';

import { deleteOfferOf } from './message-deletion';

/**
 * #10582 — CE QUE LE DIALOGUE DE SUPPRESSION OFFRE. « Pour tous » suit
 * l'admission du SERVEUR (`admitMessageDelete`) : l'auteur, sans fenêtre de
 * temps — et seulement si elle vaut pour TOUS les messages visés. « Pour moi »
 * demande un compte (`routes/user-deletions.ts`, pas de session anonyme).
 */

const row = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    senderId: 'u-moi',
    content: 'bonjour',
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const viewer = menuScope({ id: 'u-moi' });

describe('deleteOfferOf — un message', () => {
  test('le mien ⇒ pour tous ET pour moi', () => {
    expect(deleteOfferOf([row()], viewer)).toEqual({ forEveryone: true, forMe: true, remove: false });
  });

  test('le mien, vieux de trois jours ⇒ toujours pour tous : le serveur n’impose aucune fenêtre', () => {
    expect(deleteOfferOf([row({ createdAt: minutesAgo(3 * 24 * 60) })], viewer).forEveryone).toBe(true);
  });

  test('celui d’un autre ⇒ pour moi seulement', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre' })], viewer)).toEqual({ forEveryone: false, forMe: true, remove: false });
  });

  test('déjà supprimé pour tous ⇒ il ne reste qu’à le masquer chez moi', () => {
    expect(deleteOfferOf([row({ deletedAt: new Date(), content: '' })], viewer)).toEqual({ forEveryone: false, forMe: true, remove: false });
  });

  test('un message système que j’ai émis (l’avis de capture, #9641) ne se retire pas pour tous', () => {
    expect(deleteOfferOf([row({ messageType: 'system' })], viewer)).toEqual({ forEveryone: false, forMe: true, remove: false });
  });

  test('un envoi encore optimiste n’existe pas côté serveur ⇒ rien', () => {
    expect(deleteOfferOf([row({ id: 'cid_1' })], viewer)).toEqual({ forEveryone: false, forMe: false, remove: false });
  });

  test('un invité ⇒ rien : ni route « pour moi », ni auteur reconnu', () => {
    expect(deleteOfferOf([row()], menuScope({ id: 'u-moi', hasAccount: false }))).toEqual({ forEveryone: false, forMe: false, remove: false });
  });
});

describe('deleteOfferOf — plusieurs messages', () => {
  test('tous les miens ⇒ pour tous', () => {
    expect(deleteOfferOf([row({ id: 'm-1' }), row({ id: 'm-2' })], viewer)).toEqual({ forEveryone: true, forMe: true, remove: false });
  });

  test('UN seul message d’un autre retire « pour tous » à toute la sélection', () => {
    expect(deleteOfferOf([row({ id: 'm-1' }), row({ id: 'm-2', senderId: 'u-autre' }), row({ id: 'm-3' })], viewer)).toEqual({
      forEveryone: false,
      forMe: true,
      remove: false,
    });
  });

  test('aucun message ⇒ rien', () => {
    expect(deleteOfferOf([], viewer)).toEqual({ forEveryone: false, forMe: false, remove: false });
  });
});

describe('deleteOfferOf — retirer le message d’un autre (#11150)', () => {
  const moderator = menuScope({ id: 'u-moi', conversationRole: 'moderator' });

  test('celui d’un autre, quand je modère la conversation ⇒ « Retirer », en plus de « pour moi »', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre' })], moderator)).toEqual({ forEveryone: false, forMe: true, remove: true });
  });

  test('le mien ⇒ « pour tous » suffit : rien à retirer, aucun motif à donner', () => {
    expect(deleteOfferOf([row()], moderator)).toEqual({ forEveryone: true, forMe: true, remove: false });
  });

  test('une sélection mêlée ⇒ « Retirer » couvre le lot entier', () => {
    expect(deleteOfferOf([row({ id: 'm-1' }), row({ id: 'm-2', senderId: 'u-autre' })], moderator).remove).toBe(true);
  });

  test('déjà supprimé, ou message système ⇒ rien à retirer', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre', deletedAt: new Date(), content: '' })], moderator).remove).toBe(false);
    expect(deleteOfferOf([row({ senderId: 'u-autre', messageType: 'system' })], moderator).remove).toBe(false);
  });

  test('sans modération de la conversation ⇒ jamais', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre' })], viewer).remove).toBe(false);
  });

  test('jamais dans une conversation directe, même pour un rôle de plateforme (#11210)', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre' })], menuScope({ id: 'u-moi', platformRole: 'BIGBOSS' }, { type: 'direct' })).remove).toBe(false);
  });
});
