/**
 * Ce que le serveur DÉRIVE quand le formulaire ne le demande pas (#5216).
 *
 * L'écran d'inscription a trois champs ; la ligne `User` en exige cinq. Ce que
 * mesurent ces témoins est l'écart : un mononyme doit passer, un nom non-latin
 * doit passer, un pseudo commun doit passer — sans que l'utilisateur ait eu
 * quoi que ce soit à comprendre (dimension 12).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  derivedNames,
  generateUsername,
  pseudoRacine,
  pseudoSlug,
  type UsernameLookup,
} from '../../../services/auth/registration-identity';
import { searchTokensFor } from '../../../utils/search-tokens';
import { capitalizeName } from '../../../utils/normalize';

/** Un annuaire où `pris` sont les seuls pseudos occupés. */
const annuaire = (pris: readonly string[] = []) => {
  const occupes = new Set(pris.map((p) => p.toLowerCase()));
  const findMany = jest.fn(
    async (args: { where: { username: { in: string[] } } }) =>
      args.where.username.in
        .filter((u) => occupes.has(u.toLowerCase()))
        .map((username) => ({ username })),
  );
  const findFirst = jest.fn(
    async (args: { where: { username: { equals: string } } }) =>
      occupes.has(args.where.username.equals.toLowerCase()) ? { id: 'deja-pris' } : null,
  );
  return { lookup: { findMany, findFirst } as unknown as UsernameLookup, findMany, findFirst };
};

describe('derivedNames — découper un nom affiché', () => {
  it('sépare le premier mot du reste', () => {
    expect(derivedNames('Lena Vogel')).toEqual({ firstName: 'Lena', lastName: 'Vogel' });
  });

  it('garde le reste ENTIER dans le nom, pas seulement le deuxième mot', () => {
    expect(derivedNames('Ana María de la Cruz')).toEqual({
      firstName: 'Ana',
      lastName: 'María De La Cruz',
    });
  });

  it('réduit les espaces multiples avant de découper', () => {
    expect(derivedNames('  Lena    Vogel  ')).toEqual({ firstName: 'Lena', lastName: 'Vogel' });
  });

  it('rend un nom VIDE pour un mononyme — la colonne est non nullable, on n\'invente pas', () => {
    expect(derivedNames('Prince')).toEqual({ firstName: 'Prince', lastName: '' });
  });

  it('capitalise comme le fait le reste du dépôt', () => {
    expect(derivedNames("jean-éric o'connor")).toEqual({
      firstName: 'Jean-Éric',
      lastName: "O'Connor",
    });
  });
});

describe('les deux consommateurs du nom VIDE le tolèrent — mesuré, pas supposé', () => {
  it('capitalizeName rend la chaîne vide sans lever', () => {
    expect(capitalizeName('')).toBe('');
  });

  it('searchTokensFor indexe un mononyme sans jeton fantôme', () => {
    const { firstName, lastName } = derivedNames('Prince');
    const jetons = searchTokensFor({ username: 'prince', displayName: 'Prince', firstName, lastName });

    expect(jetons).toContain('prince');
    expect(jetons.every((j) => 'prince'.startsWith(j))).toBe(true);
  });
});

describe('pseudoSlug — la forme ASCII d’un nom quelconque', () => {
  it.each([
    ['Lena Vogel', 'lena-vogel'],
    ['Jean-Éric', 'jean-eric'],
    ["O'Connor", 'oconnor'],
    ['  Ana   María  ', 'ana-maria'],
    ['A__B', 'a-b'],
    ['---bord---', 'bord'],
  ])('slugifie %j en %j', (entree, attendu) => {
    expect(pseudoSlug(entree)).toBe(attendu);
  });

  it('coupe à 16 caractères — la borne du schéma', () => {
    expect(pseudoSlug('abcdefghijklmnopqrstuvwxyz')).toHaveLength(16);
  });

  it('rend vide sur un nom sans aucun caractère ASCII', () => {
    expect(pseudoSlug('李雷')).toBe('');
  });
});

describe('pseudoRacine — trois sources, dans cet ordre', () => {
  it('prend le nom affiché quand il slugifie', () => {
    expect(pseudoRacine({ displayName: 'Lena Vogel', email: 'autre@example.com' })).toBe('lena-vogel');
  });

  it("retombe sur la partie locale de l'adresse quand le nom ne donne rien", () => {
    // Le point n'est pas un séparateur de pseudo : seul l'ESPACE devient `-`,
    // le reste hors `[a-z0-9_-]` est retiré. `li.lei` donne donc `lilei`.
    expect(pseudoRacine({ displayName: '李雷', email: 'li.lei@example.com' })).toBe('lilei');
  });

  it('retombe sur un secours quand ni le nom ni l’adresse ne donnent deux caractères', () => {
    expect(pseudoRacine({ displayName: '李', email: 'x@example.com' })).toBe('user');
  });
});

describe('generateUsername — un pseudo LIBRE, en une requête', () => {
  it('rend la racine quand elle est libre', async () => {
    const { lookup } = annuaire();

    await expect(generateUsername(lookup, { displayName: 'Lena Vogel' })).resolves.toBe('lena-vogel');
  });

  it('teste la racine ET ses candidats en UNE requête', async () => {
    const { lookup, findMany } = annuaire();

    await generateUsername(lookup, { displayName: 'Lena Vogel' });

    expect(findMany).toHaveBeenCalledTimes(1);
    const { where } = findMany.mock.calls[0][0] as { where: { username: { in: string[]; mode: string } } };
    expect(where.username.in[0]).toBe('lena-vogel');
    expect(where.username.in.length).toBeGreaterThan(1);
    expect(where.username.mode).toBe('insensitive');
  });

  it('prend le premier candidat libre quand la racine est prise', async () => {
    const { lookup } = annuaire(['lena-vogel']);

    await expect(generateUsername(lookup, { displayName: 'Lena Vogel' })).resolves.toBe('lena-vogel1');
  });

  it('compare SANS tenir compte de la casse — un pseudo pris en majuscules reste pris', async () => {
    const { lookup } = annuaire(['LENA-VOGEL']);

    await expect(generateUsername(lookup, { displayName: 'Lena Vogel' })).resolves.not.toBe('lena-vogel');
  });

  it('ne rend jamais un candidat plus long que la borne du schéma', async () => {
    const { lookup } = annuaire();

    const pseudo = await generateUsername(lookup, { displayName: 'Bartholomew Wilberforce' });

    expect(pseudo.length).toBeLessThanOrEqual(16);
  });

  it('ne rend jamais un candidat plus court que la borne basse du schéma', async () => {
    const { lookup } = annuaire();

    const pseudo = await generateUsername(lookup, { displayName: '李', email: 'x@example.com' });

    expect(pseudo.length).toBeGreaterThanOrEqual(2);
  });

  describe('tous les candidats pris — le dernier recours', () => {
    const tousPris = (racine: string) => [racine, `${racine}1`, `${racine}7`, `${racine}_`,
      `${racine}26`, `${racine}${racine.length}`, `the${racine}`].map((c) => c.slice(0, 16));

    it('tire quatre chiffres et rend un pseudo de la BONNE longueur', async () => {
      const { lookup } = annuaire(tousPris('lena-vogel'));

      const pseudo = await generateUsername(lookup, { displayName: 'Lena Vogel' });

      expect(pseudo).toMatch(/^lena-vogel\d{4}$/);
      expect(pseudo.length).toBeLessThanOrEqual(16);
    });

    it('tronque la racine AVANT le suffixe — les chiffres survivent', async () => {
      const long = 'bartholomewwilberforce';
      const { lookup } = annuaire(tousPris(pseudoSlug(long)));

      const pseudo = await generateUsername(lookup, { displayName: long });

      expect(pseudo).toMatch(/\d{4}$/);
      expect(pseudo).toHaveLength(16);
    });

    it('renonce après trois tirages plutôt que de boucler', async () => {
      const { lookup, findFirst } = annuaire(tousPris('lena-vogel'));
      // Chaque tirage collisionne : c'est la seule façon d'exercer la borne, et
      // sans borne cette boucle ne se terminerait jamais sur un annuaire saturé.
      (findFirst as unknown as jest.Mock).mockResolvedValue({ id: 'toujours-pris' });

      const pseudo = await generateUsername(lookup, { displayName: 'Lena Vogel' });

      expect(findFirst).toHaveBeenCalledTimes(3);
      expect(pseudo).toMatch(/^lena-vogel\d{4}$/);
    });
  });
});
