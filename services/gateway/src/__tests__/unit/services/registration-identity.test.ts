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
  displayNameDepuisEmail,
  generateUsername,
  partieLocale,
  pseudoRacine,
  pseudoSlug,
  slugDAdresse,
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
    // Le point EST un séparateur — dans une adresse (#6424). Ce témoin
    // épinglait `lilei` avec sa raison : « seul l'ESPACE devient `-` ». La
    // raison valait tant que l'adresse n'était qu'un dernier recours ; elle ne
    // vaut plus depuis qu'elle est la source NOMINALE de l'identité, où
    // `prenom.nom@` est la façon dont le monde écrit un nom.
    expect(pseudoRacine({ displayName: '李雷', email: 'li.lei@example.com' })).toBe('li-lei');
  });

  it('ignore le SOUS-ADRESSAGE — `jean+meeshy` nomme Jean, pas Meeshy', () => {
    expect(pseudoRacine({ displayName: '李雷', email: 'jean+meeshy@example.com' })).toBe('jean');
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


/**
 * L'IDENTITÉ TIRÉE D'UNE SEULE ADRESSE (#6424).
 *
 * Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte avec le
 * pseudo pris de la première partie de l'e-mail, le display name pareil ».
 *
 * L'écran d'inscription en avait trois champs (#5216) ; il n'en a plus qu'un.
 * Ce que ces témoins mesurent est le nouvel écart : entre une adresse et les
 * DEUX colonnes qu'elle doit maintenant remplir seule — un identifiant sous
 * contrat, et un nom qu'on lit.
 */
describe('partieLocale — ce qui, dans une adresse, nomme quelqu’un', () => {
  it.each([
    ['marie@example.com', 'marie'],
    ['jean+meeshy@example.com', 'jean'],
    ['jean+banque+autre@example.com', 'jean'],
    ['marie.dupont@example.com', 'marie.dupont'],
  ])('lit %j comme %j', (adresse, attendu) => {
    expect(partieLocale(adresse)).toBe(attendu);
  });

  it('rend la chaîne vide sur une adresse absente plutôt que de lever', () => {
    expect(partieLocale(undefined)).toBe('');
  });
});

describe('slugDAdresse — le point d’une adresse est une frontière de mot', () => {
  it.each([
    ['marie.dupont@example.com', 'marie-dupont'],
    ['marie..dupont.@example.com', 'marie-dupont'],
    ['jean+meeshy@example.com', 'jean'],
    ['Jérôme@example.com', 'jerome'],
    ['MARIE@EXAMPLE.COM', 'marie'],
  ])('slugifie %j en %j', (adresse, attendu) => {
    expect(slugDAdresse(adresse)).toBe(attendu);
  });

  it('déplie les diacritiques au lieu de les supprimer — `jérôme`, jamais `jrme`', () => {
    expect(slugDAdresse('jérôme@example.com')).toBe('jerome');
  });

  it('laisse le chemin du NOM AFFICHÉ intact — le point n’y est toujours pas un séparateur', () => {
    expect(pseudoSlug('Dr. House')).toBe('dr-house');
    expect(pseudoSlug('li.lei')).toBe('lilei');
  });
});

describe('displayNameDepuisEmail — « pareil » désigne la SOURCE, pas la forme', () => {
  it.each([
    ['marie.dupont@example.com', 'Marie Dupont'],
    ['jean_luc@example.com', 'Jean Luc'],
    ['marie@example.com', 'Marie'],
    ['jean+meeshy@example.com', 'Jean'],
  ])('lit %j comme %j', (adresse, attendu) => {
    expect(displayNameDepuisEmail(adresse)).toBe(attendu);
  });

  it('se capitalise comme le reste du dépôt — la MÊME fonction que derivedNames', () => {
    expect(displayNameDepuisEmail('marie.dupont@example.com')).toBe(
      [capitalizeName('marie'), capitalizeName('dupont')].join(' '),
    );
  });

  it('rend `\'\'` — jamais un nom inventé — quand rien ne se tire de l’adresse', () => {
    expect(displayNameDepuisEmail('李雷@example.com')).toBe('');
    expect(displayNameDepuisEmail('a@example.com')).toBe('');
    expect(displayNameDepuisEmail(undefined)).toBe('');
  });

  it('alimente `derivedNames` sans le faire mentir : deux mots donnent prénom + nom', () => {
    expect(derivedNames(displayNameDepuisEmail('marie.dupont@example.com'))).toEqual({
      firstName: 'Marie',
      lastName: 'Dupont',
    });
  });

  it('un mononyme reste un mononyme — la colonne `lastName` reste vide, on n’invente pas', () => {
    expect(derivedNames(displayNameDepuisEmail('marie@example.com'))).toEqual({
      firstName: 'Marie',
      lastName: '',
    });
  });
});

describe('l’identité dérivée d’une adresse satisfait le CONTRAT d’inscription', () => {
  const adresses = [
    'marie@example.com',
    'marie.dupont@example.com',
    'jean+meeshy@example.com',
    'jérôme@example.com',
    'MARIE.DUPONT@EXAMPLE.COM',
    'un.nom.vraiment.beaucoup.trop.long@example.com',
    "o'brien@example.com",
    'user_name-42@example.com',
    'ano_bob@example.com',
  ];

  it.each(adresses)('le pseudo dérivé de %j est recevable', async (adresse) => {
    const { lookup } = annuaire();
    const pseudo = await generateUsername(lookup, { email: adresse });

    expect(pseudo).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(pseudo.length).toBeGreaterThanOrEqual(2);
    expect(pseudo.length).toBeLessThanOrEqual(16);
  });

  it('aucune adresse de la liste ne repart avec le pseudo de SECOURS', async () => {
    for (const adresse of adresses) {
      const { lookup } = annuaire();
      expect(await generateUsername(lookup, { email: adresse })).not.toBe('user');
    }
  });
});
