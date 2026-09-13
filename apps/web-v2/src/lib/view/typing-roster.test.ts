import { describe, expect, test } from 'bun:test';

import { typingAnnouncement, typingLead } from './typing-roster';

describe('typingAnnouncement (#6171) — miroir TypingIndicatorBubble.label', () => {
  test('aucun frappeur -> chaîne vide', () => {
    expect(typingAnnouncement([])).toBe('');
  });

  test('un frappeur -> "<nom> écrit"', () => {
    expect(typingAnnouncement(['Kwame Mensah'])).toBe('Kwame Mensah écrit');
  });

  test('deux frappeurs -> "<A> et <B> écrivent"', () => {
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ'])).toBe('Kwame Mensah et Fatou Bâ écrivent');
  });

  test('trois frappeurs et plus -> "Plusieurs personnes écrivent", jamais une énumération', () => {
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ', 'Amina Diallo'])).toBe('Plusieurs personnes écrivent');
  });

  test('l’ORDRE d’entrée est conservé, jamais trié par nom', () => {
    expect(typingAnnouncement(['Fatou Bâ', 'Kwame Mensah'])).toBe('Fatou Bâ et Kwame Mensah écrivent');
  });

  /**
   * LE FORMATEUR EST INJECTABLE (revue-correction #6171, défaut 2) — sans
   * `formatter`, le défaut FRANÇAIS reste EXACTEMENT celui d'avant (les
   * témoins ci-dessus, inchangés, le prouvent) ; ce témoin prouve que la loi
   * elle-même ne recompose plus le français EN DUR dans son corps — un futur
   * socle i18n de web-v2 branche ICI sans toucher les trois appelants.
   */
  test('un formateur injecté remplace les trois formes SANS toucher la loi de comptage', () => {
    const english = {
      one: (name: string) => `${name} is typing`,
      two: (a: string, b: string) => `${a} and ${b} are typing`,
      several: 'Several people are typing',
    };
    expect(typingAnnouncement(['Kwame Mensah'], english)).toBe('Kwame Mensah is typing');
    expect(typingAnnouncement(['Kwame Mensah', 'Fatou Bâ'], english)).toBe('Kwame Mensah and Fatou Bâ are typing');
    expect(typingAnnouncement(['A', 'B', 'C'], english)).toBe('Several people are typing');
    expect(typingAnnouncement([], english)).toBe('');
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
