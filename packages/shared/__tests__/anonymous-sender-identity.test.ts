import { describe, it, expect } from 'vitest';
import { resolveAnonymousSenderIdentity, servedMessageSender } from '../utils/participant-helpers.js';

/**
 * Identité d'un auteur SANS COMPTE dans le fil : le nom DONNÉ au formulaire
 * d'entrée prime en nom affiché, le pseudo `ano_…` descend en handle — chacun
 * à sa place, comme pour un inscrit (displayName + @username). Avant ce
 * résolveur, la bulle montrait le pseudo en nom et un handle vide.
 */
describe('resolveAnonymousSenderIdentity', () => {
  it('met le nom donné en nom affiché et le pseudo en handle', () => {
    expect(
      resolveAnonymousSenderIdentity({
        displayName: 'ano_Jc_n045',
        anonymousSession: { profile: { firstName: 'Jc', lastName: 'Nm' } },
      })
    ).toEqual({ displayName: 'Jc Nm', username: 'ano_Jc_n045' });
  });

  it('retombe sur le pseudo quand aucun nom n’a été donné', () => {
    expect(
      resolveAnonymousSenderIdentity({ displayName: 'ano_bob', anonymousSession: null })
    ).toEqual({ displayName: 'ano_bob', username: 'ano_bob' });
    expect(
      resolveAnonymousSenderIdentity({
        displayName: 'ano_bob',
        anonymousSession: { profile: { firstName: '', lastName: '  ' } },
      })
    ).toEqual({ displayName: 'ano_bob', username: 'ano_bob' });
  });

  it('compose avec un seul des deux noms', () => {
    expect(
      resolveAnonymousSenderIdentity({
        displayName: 'ano_lea',
        anonymousSession: { profile: { firstName: 'Léa', lastName: null } },
      })
    ).toEqual({ displayName: 'Léa', username: 'ano_lea' });
  });

  it('ne rend jamais de champs vides', () => {
    expect(resolveAnonymousSenderIdentity({ displayName: null, anonymousSession: null })).toEqual({
      displayName: '',
      username: '',
    });
  });
});

/**
 * L'AUTEUR D'UN MESSAGE NEUF, TEL QU'IL PART (#10120). La réponse de
 * `POST /conversations/:id/messages`, son accusé socket et `message:new`
 * servaient la ligne `Participant` brute : pour un invité, `displayName` y est
 * le pseudo `ano_…`, et ses initiales devenaient « AR » pour « Recette QA »
 * pendant que la liste des messages servait le nom donné. La forme servie est
 * celle de la liste : le nom donné en `displayName`, le pseudo en `username`,
 * et le profil de session ne sort jamais.
 */
describe('servedMessageSender', () => {
  it('sert le nom donné d’un invité, son pseudo en handle, sans le profil de session', () => {
    const served = servedMessageSender({
      id: 'p-invite',
      type: 'anonymous',
      displayName: 'ano_RecetteQA063842',
      userId: null,
      anonymousSession: { profile: { firstName: 'Recette QA 063842', lastName: '' } },
    });
    expect(served).toEqual({
      id: 'p-invite',
      type: 'anonymous',
      displayName: 'Recette QA 063842',
      username: 'ano_RecetteQA063842',
      userId: null,
    });
    expect('anonymousSession' in served).toBe(false);
  });

  it('est idempotente : un auteur déjà servi repart tel quel', () => {
    const once = servedMessageSender({
      type: 'anonymous',
      displayName: 'ano_lea',
      anonymousSession: { profile: { firstName: 'Léa', lastName: null } },
    });
    expect(servedMessageSender(once)).toEqual(once);
  });

  it('laisse un compte tel qu’il est', () => {
    const account = { id: 'p-amina', type: 'user', displayName: null, userId: 'u-amina' };
    expect(servedMessageSender(account)).toEqual(account);
  });
});
