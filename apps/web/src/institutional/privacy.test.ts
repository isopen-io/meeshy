import { describe, expect, test } from 'bun:test';

import { PAGE_PRIVACY } from './privacy';
import type { Block, Section } from './type';

/**
 * LA POLITIQUE DIT CE QUE DEVIENT LE CARNET D'ADRESSES (#8130).
 *
 * Le serveur conserve le carnet (`UserContact`) pour rapprocher les amis déjà
 * inscrits et annoncer ceux qui arrivent (`contact_joined`). Une politique qui
 * le tait promet moins qu'elle ne fait : le témoin lit la section entière et
 * exige chacune des cinq réponses — quoi, pourquoi, combien de temps, comment
 * l'effacer, et ce que Meeshy ne fait PAS à la place de l'utilisateur.
 */
const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'paragraphes':
      return block.body.join(' ');
    case 'list':
      return block.items.join(' ');
    case 'accent':
      return block.body;
    case 'encadre':
      return block.rows.map((row) => row.text).join(' ');
    case 'cartes':
      return block.cards
        .map((card) => [card.title, card.body ?? '', ...(card.items ?? [])].join(' '))
        .join(' ');
  }
};

const sectionText = (section: Section): string =>
  [section.title, ...section.blocks.map(blockText)].join(' ');

const addressBook = PAGE_PRIVACY.sections.find((section) => /carnet d'adresses/i.test(section.title));

describe("Politique de confidentialité — le carnet d'adresses (#8130)", () => {
  test('une section dédiée existe', () => {
    expect(addressBook).toBeDefined();
  });

  const text = addressBook ? sectionText(addressBook) : '';

  test('elle dit ce qui est envoyé : numéros, e-mails et noms tels que enregistrés', () => {
    expect(text).toMatch(/numéros/i);
    expect(text).toMatch(/e-mails/i);
    expect(text).toMatch(/noms tels que vous les avez enregistrés/i);
  });

  test('elle dit pourquoi : retrouver ses amis et être prévenu de leur arrivée', () => {
    expect(text).toMatch(/retrouver/i);
    expect(text).toMatch(/rejoint Meeshy/i);
  });

  test('elle dit que personne n’est contacté à la place de l’utilisateur', () => {
    expect(text).toMatch(/personne n'est contacté à votre place/i);
  });

  test('elle dit la conservation et l’effacement à la suppression du compte', () => {
    expect(text).toMatch(/conserv/i);
    expect(text).toMatch(/effac/i);
    expect(text).toMatch(/suppression de votre compte/i);
  });

  test('elle nomme le réglage « Ne pas me proposer » tel que l’app l’affiche', () => {
    expect(text).toContain('Ne pas me proposer à ceux qui ont mon numéro ou mon e-mail');
  });

  /* #8284 — décision porteur : le carnet s'efface à la suppression du compte,
     jamais par un geste à part. La carte le dit, avec ce qui part avec lui,
     et ne promet plus aucun chemin manuel qui n'existe pas. */
  test('la carte « Effacement » dit que supprimer son compte efface le carnet synchronisé', () => {
    expect(text).toMatch(/supprimer votre compte efface aussi votre carnet synchronisé/i);
  });

  test('elle dit que les annonces d’arrivée et les notifications partent avec lui', () => {
    expect(text).toMatch(/annonc/i);
    expect(text).toMatch(/notifications/i);
  });

  test('elle ne promet plus d’effacement manuel', () => {
    expect(text).not.toContain("Effacer mon carnet d'adresses");
    expect(text).not.toMatch(/au bas du Répertoire/);
  });

  test('la date de mise à jour suit la modification', () => {
    expect(PAGE_PRIVACY.mention).toBe('Dernière mise à jour : 27 septembre 2026');
  });
});
