/**
 * public-identifier unit tests
 *
 * La loi des identifiants PUBLICS opaques — courte, sans horodatage, tirée au
 * CSPRNG, et unique sous la définition d'unicité que fournit l'appelant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  generatePublicIdentifier,
  generateUniquePublicIdentifier,
  PUBLIC_ID_LENGTH,
  PUBLIC_ID_MAX_ATTEMPTS,
} from '../../../utils/public-identifier';

describe('generatePublicIdentifier', () => {
  it('rend le prefixe suivi de 8 caracteres base62', () => {
    expect(generatePublicIdentifier('mshy_')).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(generatePublicIdentifier('aff_')).toMatch(/^aff_[A-Za-z0-9]{8}$/);
  });

  it('respecte la longueur par defaut publiee', () => {
    expect(generatePublicIdentifier('x_')).toHaveLength(2 + PUBLIC_ID_LENGTH);
  });

  it('accepte une longueur explicite (escalade anti-collision)', () => {
    expect(generatePublicIdentifier('x_', 16)).toMatch(/^x_[A-Za-z0-9]{16}$/);
  });

  it('ne porte AUCUN horodatage — un identifiant public ne dit pas quand il est ne', () => {
    const id = generatePublicIdentifier('aff_');
    // L ancien format etait `aff_<Date.now()>_<base36>` : 13 chiffres consecutifs.
    expect(id).not.toMatch(/\d{13}/);
    expect(id).not.toContain(String(new Date().getUTCFullYear()));
  });

  it('tire une valeur differente a chaque appel', () => {
    const drawn = new Set(Array.from({ length: 300 }, () => generatePublicIdentifier('p_')));
    // 300 tirages dans 62^8 : une repetition serait un defaut du generateur,
    // pas de la malchance.
    expect(drawn.size).toBe(300);
  });

  it('n emploie que l alphabet URL-safe — jamais de caractere a echapper', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = generatePublicIdentifier('p_', 24);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });
});

describe('generateUniquePublicIdentifier', () => {
  it('rend le premier candidat libre, et ne demande qu une fois', async () => {
    const isTaken = jest.fn<any>().mockResolvedValue(false);
    const result = await generateUniquePublicIdentifier({ prefix: 'mshy_', isTaken, label: 'test' });
    expect(result).toMatch(/^mshy_[A-Za-z0-9]{8}$/);
    expect(isTaken).toHaveBeenCalledTimes(1);
  });

  it('soumet a `isTaken` EXACTEMENT le candidat qu il rendra', async () => {
    const seen: string[] = [];
    const isTaken = jest.fn<any>(async (candidate: string) => {
      seen.push(candidate);
      return false;
    });
    const result = await generateUniquePublicIdentifier({ prefix: 'mshy_', isTaken, label: 'test' });
    expect(seen).toEqual([result]);
  });

  it('retire tant que le candidat est pris', async () => {
    const isTaken = jest.fn<any>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = await generateUniquePublicIdentifier({ prefix: 'p_', isTaken, label: 'test' });
    expect(result).toMatch(/^p_[A-Za-z0-9]{8}$/);
    expect(isTaken).toHaveBeenCalledTimes(3);
  });

  it('ESCALADE la longueur plutot que d insister sur un espace sature', async () => {
    // Quatre refus sur la longueur nominale : on n insiste pas sur le meme
    // espace, on l agrandit.
    const isTaken = jest.fn<any>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = await generateUniquePublicIdentifier({ prefix: 'p_', isTaken, label: 'test' });
    expect(result).toMatch(/^p_[A-Za-z0-9]{12}$/);
  });

  it('escalade une SECONDE fois avant d abandonner', async () => {
    const isTaken = jest.fn<any>(async () => (isTaken as any).mock.calls.length <= 8) as any;
    const result = await generateUniquePublicIdentifier({ prefix: 'p_', isTaken, label: 'test' });
    expect(result).toMatch(/^p_[A-Za-z0-9]{16}$/);
  });

  it('LEVE plutot que de boucler quand tout collisionne, et NOMME ce qui a echoue', async () => {
    // L ancienne forme (`ensureUniqueShareLinkIdentifier`) incrementait un
    // compteur dans un `while (true)` : elle supposait que la base finirait par
    // ceder. Une boucle qui tourne ne se voit pas ; une erreur, si.
    const isTaken = jest.fn<any>().mockResolvedValue(true);
    await expect(
      generateUniquePublicIdentifier({ prefix: 'p_', isTaken, label: 'jeton de test' })
    ).rejects.toThrow(/jeton de test/);
    expect(isTaken).toHaveBeenCalledTimes(PUBLIC_ID_MAX_ATTEMPTS);
  });

  it('borne le nombre de tirages — la borne est PUBLIEE, pas implicite', () => {
    expect(PUBLIC_ID_MAX_ATTEMPTS).toBe(12);
  });
});
