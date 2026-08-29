/**
 * Les jetons de recherche — la règle qui rend l'index utile (#4159).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { searchTokensFor, replier, jetonRecherche } from '../../../utils/search-tokens';

describe('replier — les accents ne séparent plus deux écritures du même nom', () => {
  it('retire les diacritiques', () => {
    // Sans la décomposition NFD, chercher « eric » ne trouverait pas « Éric ».
    expect(replier('Éric')).toBe('eric');
    expect(replier('Ångström')).toBe('angstrom');
  });

  it('ramène la ponctuation à des séparations de mots', () => {
    expect(replier("Jean-Éric O'Connor")).toBe('jean eric o connor');
  });

  it('rend une chaîne vide sur une saisie sans lettre ni chiffre', () => {
    expect(replier('  ---  ')).toBe('');
  });
});

describe('searchTokensFor — un jeton par mot, plus les initiales', () => {
  it('indexe chaque mot de chaque champ', () => {
    const jetons = searchTokensFor({
      username: 'jdupont',
      displayName: 'Jean Dupont',
      firstName: 'Jean',
      lastName: 'Dupont',
    });

    expect(jetons).toContain('jdupont');
    expect(jetons).toContain('jean');
    expect(jetons).toContain('dupont');
  });

  it('ajoute les initiales — on retrouve quelqu’un dont on ne se rappelle que ça', () => {
    expect(searchTokensFor({ firstName: 'Jean', lastName: 'Dupont' })).toContain('jd');
  });

  it('ne fabrique pas d’initiales à partir d’un seul nom', () => {
    expect(searchTokensFor({ firstName: 'Jean' })).not.toContain('j');
  });

  it('ne rend aucun doublon, et un ordre stable', () => {
    const a = searchTokensFor({ username: 'jean', displayName: 'Jean', firstName: 'Jean' });
    const b = searchTokensFor({ username: 'jean', displayName: 'Jean', firstName: 'Jean' });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('borne le nombre de jetons — un nom absurde ne gonfle pas l’index', () => {
    // Le plafond est plus haut depuis qu'on stocke les PRÉFIXES (chaque mot en
    // produit jusqu'à onze), mais il existe : sans lui, un nom de deux cents
    // mots ferait de cette ligne l'entrée d'index la plus lourde de la base.
    const long = Array.from({ length: 200 }, (_, i) => `motnumero${i}`).join(' ');
    expect(searchTokensFor({ displayName: long }).length).toBeLessThanOrEqual(96);
  });

  it('rend un tableau VIDE plutôt que `null` — la colonne est `String[]`', () => {
    // Une liste scalaire ne s'annule pas, elle se vide : y écrire `null` ferait
    // échouer Prisma (leçon du désarmement 2FA, #4206).
    expect(searchTokensFor({})).toEqual([]);
  });
});

describe('jetonRecherche — la saisie se replie comme les jetons stockés', () => {
  it('replie la saisie exactement comme `searchTokensFor`', () => {
    // Sans le même repliement des deux côtés, chercher « Éric » ne trouverait
    // pas un compte indexé sous « eric ».
    expect(jetonRecherche('Éric')).toBe('eric');
    expect(jetonRecherche('  JEAN  ')).toBe('jean');
  });

  it('TRONQUE la saisie à la longueur des préfixes stockés', () => {
    // Le piège classique de ce genre d'index : au-delà de la longueur stockée,
    // aucun jeton n'existe — une recherche PLUS longue ne trouverait plus rien
    // alors qu'elle est PLUS précise. Tronquer la requête est ce qui l'évite.
    const long = jetonRecherche('jeanphilippedelacroix')!;
    expect(long).toBe('jeanphilippe');
    expect(searchTokensFor({ firstName: 'Jeanphilippedelacroix' })).toContain(long);
  });

  it('ne garde que le PREMIER mot — un jeton est un mot', () => {
    expect(jetonRecherche('jean dupont')).toBe('jean');
  });

  it('refuse une saisie trop courte pour discriminer', () => {
    expect(jetonRecherche('j')).toBeNull();
    expect(jetonRecherche('---')).toBeNull();
  });
});

describe('L’aller-retour : ce qui est indexé est ce qui est cherché', () => {
  it('retrouve un compte par un préfixe de n’importe lequel de ses mots', () => {
    const jetons = searchTokensFor({
      username: 'jdupont',
      displayName: 'Jean Dupont',
      firstName: 'Jean',
      lastName: 'Dupont',
    });

    for (const saisie of ['je', 'jea', 'jean', 'du', 'dupont', 'jd', 'jdu']) {
      expect(jetons).toContain(jetonRecherche(saisie));
    }
  });

  it('ne retrouve PAS par une sous-chaîne au milieu d’un mot — le compromis, assumé', () => {
    const jetons = searchTokensFor({ firstName: 'Jean' });
    // `ean` ne trouve plus `jean`. C'est le prix du parcours d'index, et il est
    // écrit : rétablir la sous-chaîne médiane demanderait Atlas Search, donc un
    // changement d'INFRASTRUCTURE.
    expect(jetons).not.toContain('ean');
  });
});
