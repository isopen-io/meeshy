import { describe, expect, test } from 'bun:test';

import { phonePromptVisible } from './use-phone-add-prompt';

/**
 * **QUAND PROPOSER « AJOUTEZ VOTRE NUMÉRO »** (#8843) — seulement quand le
 * profil n'en a PAS (mesuré, jamais supposé), et tant que le lecteur n'a pas
 * dit « Plus tard ».
 */
describe('phonePromptVisible (#8843)', () => {
  test('un profil sans numéro, jamais écarté ⇒ proposée', () => {
    expect(phonePromptVisible({ presence: 'absent', dismissed: false })).toBe(true);
  });

  test('un profil qui a un numéro ⇒ jamais', () => {
    expect(phonePromptVisible({ presence: 'present', dismissed: false })).toBe(false);
  });

  test('tant qu’on ne sait pas (chargement, échec) ⇒ rien : pas de proposition sur un doute', () => {
    expect(phonePromptVisible({ presence: 'unknown', dismissed: false })).toBe(false);
  });

  test('« Plus tard » ⇒ plus proposée', () => {
    expect(phonePromptVisible({ presence: 'absent', dismissed: true })).toBe(false);
  });
});
