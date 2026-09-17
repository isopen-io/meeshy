import { describe, expect, test } from 'bun:test';

import { prismeDuMembre } from './prisme-membre';

/**
 * **LE PRISME DU MEMBRE ADMINISTRÉ** (#6862, lot C).
 *
 * Ce que ces témoins gardent, et pourquoi chacun est là :
 *
 * 1. **L'ORDRE des trois rangs.** Un prisme est une DESCENTE : servir le rang 2
 *    avant le rang 1 change le texte qu'un lecteur voit, sans qu'aucune erreur
 *    ne se produise.
 * 2. **LE RANG 3 EST LÀ.** `customDestinationLanguage` était jeté par le
 *    décodeur de la fiche. Un prisme amputé de son dernier rang ne rate QUE les
 *    messages dont la seule traduction disponible est dans cette langue — donc
 *    il a l'air de marcher.
 * 3. **LE RANG 4 N'Y EST PAS.** C'est la locale de l'APPAREIL, et l'appareil
 *    qui lit est celui de l'administrateur. L'y injecter servirait une langue
 *    que le membre ne voit pas.
 * 4. **Le repli d'un membre SANS langue est posé ICI**, jamais emprunté à
 *    `resolveReaderLanguages` — dont le repli est `READER_LANGUAGES`,
 *    construit avec `navigator.language`, c'est-à-dire la langue de
 *    l'administrateur, par la porte de derrière. Posé ici, il est de plus
 *    OBSERVABLE : la descente nue rend `[]`, la garde rend `['fr']`.
 *
 * Rappel de la maison : `bun test` n'applique AUCUN typage — ces témoins verts
 * ne prouvent rien sur les types, et `bun run type-check` reste l'arbitre.
 */

const membre = (
  systemLanguage: string,
  regionalLanguage = '',
  customDestinationLanguage = '',
): { systemLanguage: string; regionalLanguage: string; customDestinationLanguage: string } => ({
  systemLanguage,
  regionalLanguage,
  customDestinationLanguage,
});

describe('prismeDuMembre — la descente des TROIS rangs applicatifs', () => {
  test('rend les rangs DANS L’ORDRE, jamais un ensemble', () => {
    const prisme = prismeDuMembre(membre('de', 'es', 'pt'));
    expect(prisme.languages).toEqual(['de', 'es', 'pt']);
  });

  test('le rang 3 CONCOURT — sans lui, une traduction disponible reste invisible', () => {
    // Le témoin se lit sur un membre dont les rangs 1 et 2 sont VIDES : si
    // `customDestinationLanguage` était jeté (l'état d'avant ce lot), le prisme
    // serait vide et retomberait sur le repli produit.
    const prisme = prismeDuMembre(membre('', '', 'it'));
    expect(prisme.languages).toEqual(['it']);
  });

  test('NORMALISE les codes — `EN` et `pt-BR` ne sont pas des langues à part', () => {
    const prisme = prismeDuMembre(membre('EN', 'pt-BR'));
    expect(prisme.languages).toEqual(['en', 'pt']);
  });

  test('DÉDUPLIQUE — un membre qui répète une langue n’a pas deux rangs identiques', () => {
    const prisme = prismeDuMembre(membre('fr', 'FR', 'es'));
    expect(prisme.languages).toEqual(['fr', 'es']);
  });

  test('la face CADRAGE est le rang 1, jamais la locale du navigateur', () => {
    expect(prismeDuMembre(membre('de', 'es')).locale).toBe('de');
  });
});

describe('LE RANG 4 EST OMIS — la locale de l’administrateur n’entre jamais', () => {
  /**
   * LE TÉMOIN SE LIT SUR L'ABSENCE, et c'est ce qui le rend possible : la
   * seule locale qu'un témoin puisse observer ici est celle de la machine qui
   * le joue. On ne peut donc pas prouver « ce n'est pas la bonne locale » ;
   * on prouve que le prisme rendu ne contient RIEN d'autre que ce que le
   * membre déclare.
   */
  test('un membre à UN rang rend UN rang — pas deux', () => {
    const prisme = prismeDuMembre(membre('de'));
    expect(prisme.languages).toEqual(['de']);
    expect(prisme.languages.length).toBe(1);
  });

  test('un membre à DEUX rangs rend DEUX rangs, quelle que soit la machine', () => {
    const prisme = prismeDuMembre(membre('de', 'es'));
    expect(prisme.languages).toEqual(['de', 'es']);
  });
});

describe('un membre SANS aucune langue déclarée', () => {
  test('retombe sur le défaut PRODUIT, jamais sur le prisme du lecteur courant', () => {
    const prisme = prismeDuMembre(membre('', '', ''));
    expect(prisme.languages).toEqual(['fr']);
    expect(prisme.locale).toBe('fr');
  });

  test('le repli est POSÉ ICI — retirer la garde rend un prisme VIDE, pas celui du lecteur', () => {
    // La descente de `@meeshy/shared` ne pose AUCUN repli (« si tout est vide,
    // le caller décide »). Un prisme vide ferait servir l'original à tout le
    // monde. Ce témoin est ce qui rend la garde OBSERVABLE : passer par
    // `resolveReaderLanguages`, dont le repli est `READER_LANGUAGES` (la locale
    // de l'ADMINISTRATEUR), rendrait la même chaîne sur une machine française
    // et une autre ailleurs — vert des deux côtés, donc sans valeur.
    const prisme = prismeDuMembre(membre('', '', ''));
    expect(prisme.languages).toEqual(['fr']);
    expect(prisme.languages.length).toBe(1);
  });

  test('des rangs faits d’espaces ne comptent pas pour des langues', () => {
    expect(prismeDuMembre(membre('  ', ' ', '')).languages).toEqual(['fr']);
  });
});
