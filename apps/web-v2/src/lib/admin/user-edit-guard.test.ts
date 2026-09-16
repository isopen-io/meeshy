import { describe, expect, test } from 'bun:test';

import { sensitiveChangesOf, type SensitiveChange } from './user-edit-guard';

/**
 * CE QUI MÉRITE UNE CONFIRMATION (#6819) — et ce qui n'en mérite pas.
 *
 * Le port de l'administration porte cette règle depuis #6432 : « une écriture
 * d'administration sans sa confirmation serait pire que son absence ». Encore
 * faut-il savoir LESQUELLES, sans quoi on confirme tout — et confirmer tout,
 * c'est n'avertir de rien : l'administrateur apprend à valider sans lire.
 *
 * Deux changements seulement sortent du lot, et pour des raisons mesurées :
 *
 * - **le RÔLE** — il déplace quelqu'un dans la hiérarchie, et la passerelle
 *   contrôle le rang VISÉ en plus du rang de l'acteur : une promotion ratée ne
 *   se répare pas d'un second clic ;
 * - **la DÉSACTIVATION** — `isActive: false` emporte la **coupure des sessions
 *   ouvertes** de la cible (`updateStatus`, qui pose aussi `deactivatedAt`).
 *   L'effet dépasse la ligne éditée : la personne est déconnectée séance
 *   tenante, où qu'elle soit.
 *
 * **Réactiver n'est PAS sensible.** `isActive: true` ne coupe rien et rend un
 * droit ; demander confirmation pour rendre un accès apprendrait à cliquer
 * « oui » sur le geste qui le retire.
 */

describe('sensitiveChangesOf — ce qui exige une confirmation', () => {
  test('une édition de profil n’exige rien', () => {
    expect(sensitiveChangesOf({ displayName: 'Amina', bio: 'Traductrice', email: 'a@b.test' })).toEqual([]);
  });

  test('changer le RÔLE exige une confirmation', () => {
    expect(sensitiveChangesOf({ role: 'ADMIN' })).toEqual(['role']);
  });

  test('DÉSACTIVER exige une confirmation — le geste coupe les sessions de la cible', () => {
    expect(sensitiveChangesOf({ isActive: false })).toEqual(['deactivate']);
  });

  test('RÉACTIVER n’exige rien — rendre un accès ne se confirme pas', () => {
    expect(sensitiveChangesOf({ isActive: true })).toEqual([]);
  });

  test('les deux ensemble sont annoncés ENSEMBLE, dans un ordre stable', () => {
    expect(sensitiveChangesOf({ role: 'USER', isActive: false, bio: 'x' })).toEqual(['role', 'deactivate']);
  });

  /**
   * `undefined` ne présente aucun champ (`exactOptionalPropertyTypes` mis à
   * part, c'est ce que la passerelle voit) : un formulaire dont l'interrupteur
   * n'a pas été touché ne doit pas déclencher d'avertissement.
   */
  test('un champ à `undefined` n’est pas un changement', () => {
    expect(sensitiveChangesOf({ role: undefined, isActive: undefined })).toEqual([]);
  });

  test('une édition vide n’exige rien', () => {
    expect(sensitiveChangesOf({})).toEqual([]);
  });

  /**
   * Le vrai invariant n'est pas « le type a deux membres » — TypeScript le
   * garantit déjà — mais que la fonction ne rende JAMAIS autre chose. Un
   * troisième cas ajouté au type sans être produit ici passerait inaperçu ;
   * produit ici sans être annoncé à l'écran, il donnerait un avertissement
   * muet.
   */
  test('ne rend jamais qu’un changement CONNU, quelle que soit l’édition', () => {
    const connus: readonly SensitiveChange[] = ['role', 'deactivate'];
    const editions = [
      { role: 'ADMIN' },
      { isActive: false },
      { isActive: true },
      { role: 'USER', isActive: false, bio: 'x', email: 'a@b.test' },
      {},
    ];

    for (const edition of editions) {
      for (const rendu of sensitiveChangesOf(edition)) {
        expect(connus).toContain(rendu);
      }
    }
  });
});
