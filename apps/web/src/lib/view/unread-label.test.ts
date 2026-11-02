import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { unreadMessagesLabel } from './unread-label';

/**
 * LA PASTILLE DE NON-LUS SE LIT EN TOUTES LETTRES (#11575). Un lecteur d'écran
 * qui atteint `UnreadBadge` lisait « 5 », un chiffre sans nom. Il dit
 * désormais la phrase d'iOS (`accessibility.unread_count`, via
 * `UnreadCountLabel.messages`), accordée par `Intl.PluralRules` — jamais par
 * un `=== 1` — et « 99+ » se lit « plus de 99 messages non lus ».
 */
describe('unreadMessagesLabel — la phrase du compte', () => {
  test('1 / 5 / 120 en français : singulier, pluriel, plus de 99', () => {
    expect(unreadMessagesLabel(1, 'fr')).toBe('1 message non lu');
    expect(unreadMessagesLabel(5, 'fr')).toBe('5 messages non lus');
    expect(unreadMessagesLabel(120, 'fr')).toBe('plus de 99 messages non lus');
  });

  test('1 / 5 / 120 en anglais : singulier, pluriel, plus de 99', () => {
    expect(unreadMessagesLabel(1, 'en')).toBe('1 unread message');
    expect(unreadMessagesLabel(5, 'en')).toBe('5 unread messages');
    expect(unreadMessagesLabel(120, 'en')).toBe('more than 99 unread messages');
  });

  test('99 est encore un nombre exact ; 100 bascule sur « plus de 99 »', () => {
    expect(unreadMessagesLabel(99, 'fr')).toBe('99 messages non lus');
    expect(unreadMessagesLabel(100, 'fr')).toBe('plus de 99 messages non lus');
  });

  test('rien à dire à zéro, en négatif ou sur NaN — la pastille ne se rend pas', () => {
    expect(unreadMessagesLabel(0, 'fr')).toBe('');
    expect(unreadMessagesLabel(-2, 'fr')).toBe('');
    expect(unreadMessagesLabel(Number.NaN, 'fr')).toBe('');
  });

  test('les sept langues accordent le singulier et le pluriel, et portent le nombre', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const one = unreadMessagesLabel(1, language);
      const five = unreadMessagesLabel(5, language);
      expect(one.length).toBeGreaterThan(0);
      expect(five).toContain('5');
      expect(one).not.toBe(five);
      expect(unreadMessagesLabel(120, language)).toContain('99');
      expect(unreadMessagesLabel(120, language)).not.toContain('120');
    }
  });

  test('l’arabe distingue le singulier, le duel, la plage 3–10 et la plage 11–99', () => {
    const forms = [1, 2, 3, 11].map((count) => unreadMessagesLabel(count, 'ar'));
    expect(new Set(forms).size).toBe(4);
    expect(forms.every((form) => !/[A-Za-z]/.test(form))).toBe(true);
  });

  test('même vocabulaire qu’iOS (`accessibility.unread_count`) dans les six langues latines', () => {
    expect(unreadMessagesLabel(3, 'es')).toBe('3 mensajes sin leer');
    expect(unreadMessagesLabel(1, 'de')).toBe('1 ungelesene Nachricht');
    expect(unreadMessagesLabel(4, 'it')).toBe('4 messaggi non letti');
    expect(unreadMessagesLabel(3, 'pt')).toBe('3 mensagens não lidas');
    expect(unreadMessagesLabel(2, 'ar')).toBe('رسالتان غير مقروءتين');
  });
});
