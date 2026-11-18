import { describe, it, expect } from '@jest/globals';
import { callInvitationRoute } from '../callInvitationRoute';

describe('callInvitationRoute — où mène une invitation dans un appel (#19650)', () => {
  it('un appel de groupe ou public fait entrer l’invité dans la conversation', () => {
    expect(callInvitationRoute({ type: 'group', encryptionMode: 'server' })).toBe('admit-member');
    expect(callInvitationRoute({ type: 'public', encryptionMode: null })).toBe('admit-member');
  });

  it('un tête-à-tête lisible par le serveur bascule vers un groupe', () => {
    expect(callInvitationRoute({ type: 'direct', encryptionMode: 'server' })).toBe('rebranch');
    expect(callInvitationRoute({ type: 'direct', encryptionMode: 'hybrid' })).toBe('rebranch');
    expect(callInvitationRoute({ type: 'direct', encryptionMode: null })).toBe('rebranch');
  });

  it('un tête-à-tête chiffré de bout en bout garde l’invité de CET appel (D3)', () => {
    expect(callInvitationRoute({ type: 'direct', encryptionMode: 'e2ee' })).toBe('legacy-guest');
  });
});
