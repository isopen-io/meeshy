import { describe, expect, test } from 'vitest';

import {
  PSEUDO_MAX,
  displayNameDepuisEmail,
  partieLocale,
  pseudoRacine,
  slugDAdresse,
} from '../utils/registration-identity';
import { personNamePatternSource } from '../types/api-schemas/auth';

/**
 * LE CONTRAT QUE L'ÉCRAN MONTRE (#6479).
 *
 * `services/gateway/.../registration-identity.test.ts` couvre la loi elle-même
 * — 75 témoins, et ils passent inchangés depuis que la passerelle RÉEXPORTE ce
 * module. Ce fichier-ci ne les redouble pas : il épingle ce dont les CLIENTS
 * dépendent pour AFFICHER, avant l'envoi, l'identité que la passerelle créera.
 *
 * Ce qu'un écran promet et ce qu'un serveur fait ne peuvent diverger que si
 * deux codes les calculent. Depuis #6479, il n'y en a qu'un.
 */
describe('ce que l’écran peut promettre', () => {
  test('le pseudo est la partie locale, bornée à 16', () => {
    expect(slugDAdresse('jean.dupont@example.com')).toBe('jean-dupont');
    expect(slugDAdresse('un-tres-long-prenom-compose@example.com').length).toBeLessThanOrEqual(PSEUDO_MAX);
  });

  test('le nom affiché se LIT — capitales initiales sur chaque mot', () => {
    expect(displayNameDepuisEmail('jean.dupont@example.com')).toBe('Jean Dupont');
  });

  test('le sous-adressage ne fuit pas dans l’identité', () => {
    expect(partieLocale('jean+meeshy@example.com')).toBe('jean');
    expect(slugDAdresse('jean+meeshy@example.com')).toBe('jean');
  });

  /**
   * LE cas que l'écran doit savoir rendre : une adresse dont rien n'est
   * slugifiable. `displayNameDepuisEmail` rend `''` — l'écran ne doit donc PAS
   * afficher une promesse vide, mais le repli que la passerelle emploiera.
   */
  /**
   * #7912 — l'écran ENVOIE ce nom quand rien n'est tapé, et la passerelle
   * refuse tout chiffre dans `displayName` (`personNamePatternSource`).
   * `rcoba2251253@…` rendait « Rcoba2251253 » : inscription refusée, sans
   * issue. Les chiffres SÉPARENT comme `.`, `-` et `_`.
   */
  test.each([
    ['rcoba2251253@example.com', 'Rcoba'],
    ['marie.dupont1990@example.com', 'Marie Dupont'],
    ['jean2luc@example.com', 'Jean Luc'],
    ['42jean@example.com', 'Jean'],
  ])('les chiffres de %j ne passent pas dans le nom affiché (%j)', (adresse, attendu) => {
    expect(displayNameDepuisEmail(adresse)).toBe(attendu);
  });

  test('une adresse sans aucune lettre ne donne AUCUN nom affiché', () => {
    expect(displayNameDepuisEmail('20251253@example.com')).toBe('');
  });

  test('tout nom dérivé satisfait le motif que la passerelle impose', () => {
    const motif = new RegExp(personNamePatternSource, 'u');
    const adresses = [
      'rcoba2251253@example.com', 'a1@example.com', 'jean.dupont@example.com',
      'x_9_y@example.com', 'jérôme.77@example.com', 'o-brien3@example.com',
    ];
    for (const adresse of adresses) {
      const nom = displayNameDepuisEmail(adresse);
      if (nom !== '') expect(nom).toMatch(motif);
    }
  });

  test('une adresse non slugifiable ne donne AUCUN nom affiché', () => {
    expect(displayNameDepuisEmail('@example.com')).toBe('');
  });

  test('et le pseudo retombe alors sur le recours du serveur', () => {
    expect(pseudoRacine({ email: '@example.com' })).toBe('user');
  });

  /** Un nom affiché FOURNI gagne sur l'adresse — l'utilisateur garde la main. */
  test('un nom affiché tapé prime sur la dérivation', () => {
    expect(pseudoRacine({ displayName: 'Awa N’Diaye', email: 'jean.dupont@example.com' })).toBe('awa-ndiaye');
  });
});
