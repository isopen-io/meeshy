import { describe, it, expect } from 'vitest';
import { resolveAnonymousSenderIdentity } from '../utils/participant-helpers.js';

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
