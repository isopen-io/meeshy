/**
 * `Accept-Language` est une liste PONDÉRÉE, pas une liste ordonnée.
 *
 * Le témoin central est `en;q=0.5, fr` : la forme naïve du dépôt
 * (`split(',')[0]`, `routes/tracking-links/tracking.ts`) y rend `en` — la
 * langue que le navigateur vient explicitement de dépriorier. À l'inscription,
 * cette étiquette écrit le rang 1 du compte une fois pour toutes ; s'en
 * remettre à l'ordre d'écriture y grave la mauvaise langue à vie.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { preferredAcceptLanguage } from '../../../utils/accept-language';

describe('preferredAcceptLanguage — le poids gagne sur la position', () => {
  it("rend la langue la mieux notée, PAS la première écrite", () => {
    expect(preferredAcceptLanguage('en;q=0.5, fr')).toBe('fr');
  });

  it('rend la première à poids ÉGAL — la position ne départage qu\'alors', () => {
    expect(preferredAcceptLanguage('fr, en')).toBe('fr');
  });

  it('classe une liste complète de navigateur', () => {
    expect(preferredAcceptLanguage('fr-CA,fr;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('fr-CA');
  });

  it("garde l'étiquette BRUTE — la normalisation n'est pas son travail", () => {
    expect(preferredAcceptLanguage('zh-Hant;q=0.9, en;q=0.8')).toBe('zh-Hant');
  });
});

describe('preferredAcceptLanguage — ce qui ne compte pas', () => {
  it('ignore le joker, qui n’exprime aucune langue', () => {
    expect(preferredAcceptLanguage('*')).toBeUndefined();
  });

  it('choisit une vraie langue plutôt que le joker mieux noté', () => {
    expect(preferredAcceptLanguage('*;q=1, de;q=0.5')).toBe('de');
  });

  it('écarte une étiquette explicitement REFUSÉE (q=0)', () => {
    expect(preferredAcceptLanguage('en;q=0, fr;q=0.1')).toBe('fr');
  });

  it('rend undefined quand TOUT est refusé', () => {
    expect(preferredAcceptLanguage('en;q=0, fr;q=0')).toBeUndefined();
  });

  it.each(['q=abc', 'q=2', 'q=-1', 'q=1.0001'])(
    'écarte une étiquette dont le poids %s est illisible, au lieu de la promouvoir',
    (parametre) => {
      expect(preferredAcceptLanguage(`en;${parametre}, fr;q=0.1`)).toBe('fr');
    },
  );

  it.each(['', '   ', ',,,', 'fr_FR!!'])('rend undefined sur %j', (header) => {
    expect(preferredAcceptLanguage(header)).toBeUndefined();
  });

  it.each([undefined, null])('rend undefined sur %p', (header) => {
    expect(preferredAcceptLanguage(header)).toBeUndefined();
  });
});

describe('preferredAcceptLanguage — les formes que Node remet', () => {
  it('concatène un en-tête RÉPÉTÉ, comme le ferait un serveur conforme', () => {
    expect(preferredAcceptLanguage(['en;q=0.5', 'fr;q=0.9'])).toBe('fr');
  });

  it('tolère les espaces autour des entrées et des paramètres', () => {
    expect(preferredAcceptLanguage('  en ;  q=0.5 ,  fr ;  q=0.9 ')).toBe('fr');
  });

  it('accepte un Q majuscule — le paramètre est insensible à la casse', () => {
    expect(preferredAcceptLanguage('en;Q=0.5, fr;Q=0.9')).toBe('fr');
  });

  it('donne son poids par défaut à une étiquette sans q', () => {
    expect(preferredAcceptLanguage('en;q=0.9, fr')).toBe('fr');
  });
});
