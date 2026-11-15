import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { interfaceTypingFormatter, typingAnnouncement, typingLead } from './typing-roster';

const french = () => interfaceTypingFormatter('fr');

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('de')]);
});

describe('typingAnnouncement (#6171) — miroir TypingIndicatorBubble.label', () => {
  test('aucun frappeur -> chaîne vide', () => {
    expect(typingAnnouncement([], french())).toBe('');
  });

  test('un frappeur -> "<nom> écrit"', () => {
    expect(typingAnnouncement(['Kwame Mensah'], french())).toBe('Kwame Mensah écrit');
  });

  test('deux frappeurs -> "<A> et <B> écrivent"', () => {
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ'], french())).toBe('Kwame Mensah et Fatou Bâ écrivent');
  });

  test('trois frappeurs et plus -> "Plusieurs personnes écrivent", jamais une énumération', () => {
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ', 'Amina Diallo'], french())).toBe(
      'Plusieurs personnes écrivent',
    );
  });

  test('l’ORDRE d’entrée est conservé, jamais trié par nom', () => {
    expect(typingAnnouncement(['Fatou Bâ', 'Kwame Mensah'], french())).toBe('Fatou Bâ et Kwame Mensah écrivent');
  });
});

/**
 * LE PREMIER CLIENT DU CATALOGUE (#6206) — le témoin s'écrit sur une langue
 * AUTRE que le français, et sur les formes à UN et DEUX noms : en français,
 * le défaut codé en dur et le catalogue rendent le même texte, donc le témoin
 * ne pourrait pas tomber.
 */
describe('interfaceTypingFormatter — les trois formes viennent du catalogue de la langue', () => {
  test('en', () => {
    const english = interfaceTypingFormatter('en');
    expect(typingAnnouncement(['Kwame Mensah'], english)).toBe('Kwame Mensah is typing');
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ'], english)).toBe('Kwame Mensah and Fatou Bâ are typing');
    expect(typingAnnouncement(['A', 'B', 'C'], english)).toBe('Several people are typing');
  });

  test('de', () => {
    const german = interfaceTypingFormatter('de');
    expect(typingAnnouncement(['Kwame Mensah'], german)).toBe('Kwame Mensah schreibt');
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ'], german)).toBe('Kwame Mensah und Fatou Bâ schreiben');
  });
});

describe('typingLead (#6171) — la PREMIÈRE entrée, jamais un tri', () => {
  test('roster vide -> undefined', () => {
    expect(typingLead([])).toBeUndefined();
  });

  test('rend la première entrée, quel que soit son nom', () => {
    expect(typingLead([{ userId: 'u-fatou' }, { userId: 'u-kwame' }])).toEqual({ userId: 'u-fatou' });
  });
});
