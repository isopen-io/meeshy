import { describe, expect, it } from 'vitest';

import {
  AUTHOR_EDIT,
  MASKED_MODERATOR_EDITOR,
  editedByThirdParty,
  servedEditAttribution,
  withServedEditAttribution,
} from '../utils/message-edit-attribution';

/**
 * #11375 — un modérateur qui modifie le message d'un autre le fait à visage
 * découvert. Le serveur enregistre QUI a modifié quand ce n'est pas l'auteur ;
 * les clients disent « modifié par un modérateur » à partir de cette seule loi.
 * L'IDENTITÉ du modérateur, elle, ne part qu'à qui doit en rendre compte.
 */
describe('editedByThirdParty — la mention « modifié par un modérateur »', () => {
  it('un message modifié par un tiers le dit', () => {
    expect(editedByThirdParty({ isEdited: true, editedById: 'user-mod' })).toBe(true);
  });

  it('la marque sans identité le dit aussi', () => {
    expect(editedByThirdParty({ isEdited: true, editedById: MASKED_MODERATOR_EDITOR })).toBe(true);
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
    expect(AUTHOR_EDIT).toEqual({ thirdPartyEditorId: null, thirdPartyEditorRole: null });
  });
});

describe('servedEditAttribution — ce que la passerelle SERT de l’auteur de la modification', () => {
  const byModerator = { thirdPartyEditorId: 'user-mod', thirdPartyEditorRole: 'BIGBOSS' };

  it('à un lecteur ordinaire : la marque, ni identité ni rang', () => {
    expect(servedEditAttribution(byModerator, { userId: 'user-bob', globalRole: 'USER' })).toEqual({
      editedById: MASKED_MODERATOR_EDITOR,
      editedByRole: null,
    });
  });

  it('à une diffusion sans lecteur nommé (room, invité anonyme) : la marque', () => {
    expect(servedEditAttribution(byModerator)).toEqual({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST'])('à un %s qui n’est pas l’éditeur : la marque', (globalRole) => {
    expect(servedEditAttribution(byModerator, { userId: 'user-other', globalRole })).toEqual({
      editedById: MASKED_MODERATOR_EDITOR,
      editedByRole: null,
    });
  });

  it.each(['ADMIN', 'BIGBOSS'])('à un %s : l’identité et le rôle, pour rendre compte', (globalRole) => {
    expect(servedEditAttribution(byModerator, { userId: 'user-admin', globalRole })).toEqual({
      editedById: 'user-mod',
      editedByRole: 'BIGBOSS',
    });
  });

  it('au modérateur lui-même : son identité', () => {
    expect(servedEditAttribution(byModerator, { userId: 'user-mod', globalRole: 'MODERATOR' })).toEqual({
      editedById: 'user-mod',
      editedByRole: 'BIGBOSS',
    });
  });

  it('une modification de l’auteur se sert null, jamais une clé absente', () => {
    expect(servedEditAttribution({ thirdPartyEditorId: null, thirdPartyEditorRole: null })).toEqual({
      editedById: null,
      editedByRole: null,
    });
    expect(servedEditAttribution({}, { userId: 'user-admin', globalRole: 'ADMIN' })).toEqual({
      editedById: null,
      editedByRole: null,
    });
  });
});

describe('withServedEditAttribution — une ligne brute ne transporte jamais les colonnes', () => {
  it('retire les colonnes et pose les champs servis', () => {
    const served = withServedEditAttribution(
      { id: 'm1', content: 'x', thirdPartyEditorId: 'user-mod', thirdPartyEditorRole: 'ADMIN' },
      { userId: 'user-bob', globalRole: 'USER' },
    );

    expect(served).toEqual({ id: 'm1', content: 'x', editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
    expect(served).not.toHaveProperty('thirdPartyEditorId');
    expect(served).not.toHaveProperty('thirdPartyEditorRole');
  });
});
