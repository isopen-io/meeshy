import { describe, expect, it } from 'vitest';

import { AUTHOR_EDIT, editedByThirdParty } from '../utils/message-edit-attribution';

/**
 * #11375 — un modérateur qui modifie le message d'un autre le fait à visage
 * découvert. Le serveur enregistre QUI a modifié quand ce n'est pas l'auteur ;
 * les clients disent « modifié par un modérateur » à partir de cette seule loi.
 */
describe('editedByThirdParty — la mention « modifié par un modérateur »', () => {
  it('un message modifié par un tiers le dit', () => {
    expect(editedByThirdParty({ isEdited: true, editedById: 'user-mod' })).toBe(true);
  });

  it('un message modifié par son auteur ne le dit pas', () => {
    expect(editedByThirdParty({ isEdited: true, editedById: null })).toBe(false);
    expect(editedByThirdParty({ isEdited: true })).toBe(false);
  });

  it('un message jamais modifié ne le dit pas, quoi que porte la colonne', () => {
    expect(editedByThirdParty({ isEdited: false, editedById: 'user-mod' })).toBe(false);
  });

  it('une chaîne vide n’est pas un éditeur', () => {
    expect(editedByThirdParty({ isEdited: true, editedById: '' })).toBe(false);
  });

  it('l’édition par l’auteur remet les deux colonnes à null', () => {
    expect(AUTHOR_EDIT).toEqual({ editedById: null, editedByRole: null });
  });
});
