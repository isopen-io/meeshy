import { describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';

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

const viewer = { id: 'u-moi', hasAccount: true } as const;

describe('deleteOfferOf — un message', () => {
  test('le mien ⇒ pour tous ET pour moi', () => {
    expect(deleteOfferOf([row()], viewer)).toEqual({ forEveryone: true, forMe: true });
  });

  test('le mien, vieux de trois jours ⇒ toujours pour tous : le serveur n’impose aucune fenêtre', () => {
    expect(deleteOfferOf([row({ createdAt: minutesAgo(3 * 24 * 60) })], viewer).forEveryone).toBe(true);
  });

  test('celui d’un autre ⇒ pour moi seulement', () => {
    expect(deleteOfferOf([row({ senderId: 'u-autre' })], viewer)).toEqual({ forEveryone: false, forMe: true });
  });

  test('déjà supprimé pour tous ⇒ il ne reste qu’à le masquer chez moi', () => {
    expect(deleteOfferOf([row({ deletedAt: new Date(), content: '' })], viewer)).toEqual({ forEveryone: false, forMe: true });
  });

  test('un message système que j’ai émis (l’avis de capture, #9641) ne se retire pas pour tous', () => {
    expect(deleteOfferOf([row({ messageType: 'system' })], viewer)).toEqual({ forEveryone: false, forMe: true });
  });

  test('un envoi encore optimiste n’existe pas côté serveur ⇒ rien', () => {
    expect(deleteOfferOf([row({ id: 'cid_1' })], viewer)).toEqual({ forEveryone: false, forMe: false });
  });

  test('un invité ⇒ rien : ni route « pour moi », ni auteur reconnu', () => {
    expect(deleteOfferOf([row()], { id: 'u-moi', hasAccount: false })).toEqual({ forEveryone: false, forMe: false });
  });
});

describe('deleteOfferOf — plusieurs messages', () => {
  test('tous les miens ⇒ pour tous', () => {
    expect(deleteOfferOf([row({ id: 'm-1' }), row({ id: 'm-2' })], viewer)).toEqual({ forEveryone: true, forMe: true });
  });

  test('UN seul message d’un autre retire « pour tous » à toute la sélection', () => {
    expect(deleteOfferOf([row({ id: 'm-1' }), row({ id: 'm-2', senderId: 'u-autre' }), row({ id: 'm-3' })], viewer)).toEqual({
      forEveryone: false,
      forMe: true,
    });
  });

  test('aucun message ⇒ rien', () => {
    expect(deleteOfferOf([], viewer)).toEqual({ forEveryone: false, forMe: false });
  });
});
