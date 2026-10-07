/**
 * LA LANGUE QUE LE SERVEUR ÉTABLIT (#9635) — fail-closed : un texte trop court pour être lu, un traducteur muet
 * ou incertain ne donnent AUCUNE langue, donc aucun défi de langue ne s'y gagne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { translatorLanguageDetector } from '../serverLanguage';

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('translatorLanguageDetector', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un texte de moins de trois mots ne se détecte pas, et n’appelle même pas le traducteur', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    expect(await translatorLanguageDetector('Hola amigo')).toBeNull();
    expect(await translatorLanguageDetector('👋 ok !!')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rend la langue de base que le traducteur établit', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(answer({ language: 'es-ES' }));
    expect(await translatorLanguageDetector('Hola amigo, cómo estás hoy')).toBe('es');
  });

  it('un traducteur incertain, en erreur ou injoignable ne donne aucune langue', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer({ language: 'unknown' }));
    expect(await translatorLanguageDetector('Hola amigo, cómo estás hoy')).toBeNull();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer({}, 500));
    expect(await translatorLanguageDetector('Hola amigo, cómo estás hoy')).toBeNull();
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('down'));
    expect(await translatorLanguageDetector('Hola amigo, cómo estás hoy')).toBeNull();
  });
});
