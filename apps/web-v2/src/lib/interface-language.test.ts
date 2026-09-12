import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { INTERFACE_LANGUAGE_KEY } from './inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage, setInterfaceLanguage } from './interface-language';

/**
 * `currentInterfaceLanguage`/`setInterfaceLanguage` (#6206) — même patron que
 * `scheme.test.ts`, mais avec le DOM ENREGISTRÉ (happy-dom) plutôt qu'un mock
 * manuel : contrairement au schéma clair/sombre, ce module ne réaffecte
 * jamais `document` lui-même, seulement `document.documentElement.lang`, une
 * propriété ordinaire sous happy-dom.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
  try {
    localStorage.removeItem(INTERFACE_LANGUAGE_KEY);
  } catch {
    /* rien à nettoyer */
  }
});

describe('currentInterfaceLanguage — lit document.documentElement.lang, jamais ne le recalcule', () => {
  test('rend la langue posée par le script inline', () => {
    document.documentElement.lang = 'en';
    expect(currentInterfaceLanguage()).toBe('en');
  });

  test('retombe sur le défaut « fr » si la valeur posée est une langue non cataloguée', () => {
    document.documentElement.lang = 'de';
    expect(currentInterfaceLanguage()).toBe('fr');
  });

  test('retombe sur le défaut « fr » si l’attribut est vide', () => {
    document.documentElement.lang = '';
    expect(currentInterfaceLanguage()).toBe('fr');
  });
});

describe('setInterfaceLanguage — pose ET persiste, contrairement au suivi système du schéma', () => {
  test('pose document.documentElement.lang immédiatement', () => {
    setInterfaceLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  test('persiste le choix pour le prochain démarrage', () => {
    setInterfaceLanguage('en');
    expect(localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe('en');
  });
});
