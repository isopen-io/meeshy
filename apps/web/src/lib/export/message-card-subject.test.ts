import { beforeAll, describe, expect, test } from 'bun:test';

import { amina, message, translation } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { cardAuthorOf, messageCardFileName, messageCardSubjectOf } from './message-card-subject';

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const NOW = new Date('2026-09-28T12:00:00.000Z').getTime();
const VIEWER = { id: 'u-jacques', displayName: 'Jacques' };

const quoted = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-quoted',
    senderId: amina.userId ?? 'u-amina',
    sender: amina,
    content: 'Where do we meet tonight?',
    originalLanguage: 'en',
    translations: [translation('m-quoted', 'fr', 'On se retrouve où ce soir ?')],
    createdAt: new Date('2026-09-28T11:00:00.000Z'),
    ...overrides,
  });

const standalone = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-reply',
    senderId: VIEWER.id,
    content: 'Chez Lina, à 20 h !',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-28T11:01:00.000Z'),
    ...overrides,
  });

const reply = (overrides: Partial<Message> = {}): Message => standalone({ replyTo: quoted(), ...overrides });

const subjectOf = (target: Message, servedText?: string) =>
  messageCardSubjectOf({
    message: target,
    servedText,
    viewer: VIEWER,
    readerLanguages: ['fr'],
    interfaceLanguage: 'fr',
    now: NOW,
  });

describe('messageCardSubjectOf — ce que la carte a le droit de montrer', () => {
  test('une réponse porte sa citation, servie dans la langue du lecteur', () => {
    expect(subjectOf(reply())).toEqual({
      quoted: { author: amina.displayName ?? '', text: 'On se retrouve où ce soir ?' },
      reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !' },
      sentAt: new Date('2026-09-28T11:01:00.000Z'),
    });
  });

  test('le texte de la réponse est celui que le lecteur VOIT (traduction imposée comprise)', () => {
    expect(subjectOf(reply(), 'At Lina’s, 8 pm!')?.reply.text).toBe('At Lina’s, 8 pm!');
  });

  test('un message isolé n’a pas de citation', () => {
    expect(subjectOf(standalone())?.quoted).toBeNull();
  });

  test('un message PROTÉGÉ ne s’exporte pas — flouté, vue unique, supprimé', () => {
    expect(subjectOf(reply({ isBlurred: true }))).toBeNull();
    expect(subjectOf(reply({ isViewOnce: true }))).toBeNull();
    expect(subjectOf(reply({ deletedAt: new Date('2026-09-28T11:30:00.000Z') }))).toBeNull();
  });

  test('un éphémère échu ne s’exporte plus', () => {
    expect(subjectOf(reply({ expiresAt: new Date(NOW - 1000) }))).toBeNull();
  });

  test('une citation protégée ne montre que son placeholder, jamais son contenu', () => {
    const subject = subjectOf(reply({ replyTo: quoted({ isViewOnce: true, content: '👁️' }) }));
    expect(subject?.quoted?.text).toBe('👁️');
    expect(JSON.stringify(subject)).not.toContain('On se retrouve');
  });

  test('un message sans texte n’a rien à peindre', () => {
    expect(subjectOf(reply({ content: '   ' }))).toBeNull();
  });
});

describe('cardAuthorOf — qui signe chaque bloc', () => {
  test('le lecteur est nommé par SON nom, jamais « Vous »', () => {
    expect(cardAuthorOf({ senderId: VIEWER.id }, VIEWER)).toBe('Jacques');
  });

  test('un correspondant par son nom affiché, sinon son identifiant', () => {
    expect(cardAuthorOf({ senderId: 'u-awa', sender: { displayName: 'Awa' } }, VIEWER)).toBe('Awa');
    expect(cardAuthorOf({ senderId: 'u-awa', sender: { displayName: ' ', username: 'awa' } }, VIEWER)).toBe('awa');
  });
});

describe('messageCardFileName — un nom lisible, rien du contenu', () => {
  test('horodaté, en .png', () => {
    expect(messageCardFileName(new Date(2026, 8, 28, 9, 5, 7))).toBe('meeshy-20260928-090507.png');
  });
});
