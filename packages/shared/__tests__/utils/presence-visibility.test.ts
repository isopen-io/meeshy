import { describe, it, expect } from 'vitest';
import {
  resolvePresenceVisibility,
  applyPresenceVisibility,
  applyPresenceVisibilityAsOffline,
  type PresenceVisibilityInput,
} from '../../utils/presence-visibility.js';

const baseInput = (over: Partial<PresenceVisibilityInput> = {}): PresenceVisibilityInput => ({
  isSelf: false,
  viewerRole: 'USER',
  areConnected: false,
  targetShowOnlineStatus: true,
  targetShowLastSeen: true,
  targetIsDeactivated: false,
  isBlockedEitherWay: false,
  ...over,
});

// Directive produit (2026-08-25) : hors amitié acceptée (`areConnected`),
// la présence est supprimée pour tout le monde sauf ADMIN et supérieur
// (BIGBOSS). MODERATOR a perdu son bypass ; le partage d'une conversation
// n'est plus un critère d'autorisation.
describe('resolvePresenceVisibility', () => {
  it('shows everything to the user themselves, even with all preferences off', () => {
    const v = resolvePresenceVisibility(
      baseInput({ isSelf: true, targetShowOnlineStatus: false, targetShowLastSeen: false }),
    );
    expect(v).toEqual({ showOnline: true, showLastSeenTimestamp: true });
  });

  it('does NOT let a moderator bypass the preferences of a stranger (below ADMIN)', () => {
    const v = resolvePresenceVisibility(
      baseInput({ viewerRole: 'MODERATOR', targetShowOnlineStatus: false, targetShowLastSeen: false }),
    );
    expect(v).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('lets ADMIN and BIGBOSS bypass (directive: "Admin et supérieur")', () => {
    for (const role of ['ADMIN', 'BIGBOSS'] as const) {
      expect(resolvePresenceVisibility(baseInput({ viewerRole: role }))).toEqual({
        showOnline: true,
        showLastSeenTimestamp: true,
      });
    }
  });

  it('does NOT let MODERATOR, AUDIT, or ANALYST bypass (below ADMIN)', () => {
    for (const role of ['MODERATOR', 'AUDIT', 'ANALYST'] as const) {
      expect(resolvePresenceVisibility(baseInput({ viewerRole: role }))).toEqual({
        showOnline: false,
        showLastSeenTimestamp: false,
      });
    }
  });

  it('shows full presence to a connected contact when both preferences are on', () => {
    expect(resolvePresenceVisibility(baseInput({ areConnected: true }))).toEqual({
      showOnline: true,
      showLastSeenTimestamp: true,
    });
  });

  it('hides only the timestamp for a contact when showLastSeen is off', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetShowLastSeen: false })),
    ).toEqual({ showOnline: true, showLastSeenTimestamp: false });
  });

  it('hides all presence for a contact when showOnlineStatus is off (master switch)', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetShowOnlineStatus: false })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides presence from a conversation co-participant who is not a contact — sharing a conversation is not a relationship', () => {
    expect(resolvePresenceVisibility(baseInput({ areConnected: false }))).toEqual({
      showOnline: false,
      showLastSeenTimestamp: false,
    });
  });

  it('hides presence from a stranger (no relation, not privileged)', () => {
    expect(resolvePresenceVisibility(baseInput())).toEqual({
      showOnline: false,
      showLastSeenTimestamp: false,
    });
  });

  it('hides presence when either party blocked the other, even for a contact', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, isBlockedEitherWay: true })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('hides presence of a deactivated target, even from a contact', () => {
    expect(
      resolvePresenceVisibility(baseInput({ areConnected: true, targetIsDeactivated: true })),
    ).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });
});

describe('applyPresenceVisibility', () => {
  const profile = { id: 'u1', isOnline: true as boolean | null, lastActiveAt: new Date(1000) as Date | null };

  it('keeps both fields when both flags are on', () => {
    const out = applyPresenceVisibility(profile, { showOnline: true, showLastSeenTimestamp: true });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toEqual(new Date(1000));
  });

  it('nulls isOnline when showOnline is off, keeping the rest of the object', () => {
    const out = applyPresenceVisibility(profile, { showOnline: false, showLastSeenTimestamp: false });
    expect(out.isOnline).toBeNull();
    expect(out.lastActiveAt).toBeNull();
    expect(out.id).toBe('u1');
  });

  it('keeps isOnline but nulls the timestamp when only showLastSeenTimestamp is off', () => {
    const out = applyPresenceVisibility(profile, { showOnline: true, showLastSeenTimestamp: false });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toBeNull();
  });

  it('does not mutate the input object', () => {
    const input = { id: 'u2', isOnline: true as boolean | null, lastActiveAt: new Date(2000) as Date | null };
    applyPresenceVisibility(input, { showOnline: false, showLastSeenTimestamp: false });
    expect(input.isOnline).toBe(true);
    expect(input.lastActiveAt).toEqual(new Date(2000));
  });
});

// Variante non nullable : les schémas de sérialisation REST de la passerelle
// déclarent `isOnline` en `type: 'boolean'` (userMinimalSchema,
// contacts-schemas) et les clients le typent `boolean`. Masqué s'y présente
// donc comme HORS LIGNE, pas comme `null`.
describe('applyPresenceVisibilityAsOffline', () => {
  const profile = { id: 'u1', isOnline: true, lastActiveAt: new Date(1000) as Date | null };

  it('keeps both fields when both flags are on', () => {
    const out = applyPresenceVisibilityAsOffline(profile, { showOnline: true, showLastSeenTimestamp: true });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toEqual(new Date(1000));
  });

  it('collapses a hidden presence to offline rather than null', () => {
    const out = applyPresenceVisibilityAsOffline(profile, { showOnline: false, showLastSeenTimestamp: false });
    expect(out.isOnline).toBe(false);
    expect(out.lastActiveAt).toBeNull();
    expect(out.id).toBe('u1');
  });

  it('keeps isOnline but nulls the timestamp when only showLastSeenTimestamp is off', () => {
    const out = applyPresenceVisibilityAsOffline(profile, { showOnline: true, showLastSeenTimestamp: false });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toBeNull();
  });

  // Une visibilité ABSENTE de la carte résolue n'est pas une autorisation :
  // un id que le résolveur n'a pas rendu doit sortir masqué, jamais brut.
  it('treats an undefined visibility as hidden', () => {
    const out = applyPresenceVisibilityAsOffline(profile, undefined);
    expect(out.isOnline).toBe(false);
    expect(out.lastActiveAt).toBeNull();
  });

  it('normalises a null isOnline to false when visible', () => {
    const out = applyPresenceVisibilityAsOffline(
      { id: 'u3', isOnline: null, lastActiveAt: null },
      { showOnline: true, showLastSeenTimestamp: true },
    );
    expect(out.isOnline).toBe(false);
  });

  it('does not mutate the input object', () => {
    const input = { id: 'u2', isOnline: true, lastActiveAt: new Date(2000) as Date | null };
    applyPresenceVisibilityAsOffline(input, undefined);
    expect(input.isOnline).toBe(true);
    expect(input.lastActiveAt).toEqual(new Date(2000));
  });

  // Certaines portes ne chargent QUE `isOnline` (aperçu de membres d'une
  // communauté). Le gate ne doit pas leur fabriquer un `lastActiveAt` qu'elles
  // n'ont jamais servi — sinon la clé apparaît, à `null`, dans une réponse dont
  // le contrat ne la mentionne pas.
  it('n invente pas lastActiveAt sur un profil qui n en porte pas', () => {
    const out = applyPresenceVisibilityAsOffline({ id: 'u5', isOnline: true }, undefined);
    expect(out.isOnline).toBe(false);
    expect('lastActiveAt' in out).toBe(false);
  });

  it('masque lastActiveAt quand le profil en porte un, même absent de la visibilité', () => {
    const out = applyPresenceVisibilityAsOffline({ id: 'u6', isOnline: true, lastActiveAt: new Date(3000) }, undefined);
    expect('lastActiveAt' in out).toBe(true);
    expect(out.lastActiveAt).toBeNull();
  });

  // Le régime PREFS-ONLY inverse le défaut : une entrée absente y est la
  // situation normale (un anonyme n'a pas de préférences), pas une anomalie.
  // Les deux défauts cohabitent dans le même applicateur parce qu'une même
  // route peut servir les deux régimes selon le lecteur —
  // `GET /communities/:id/members` en est l'exemple.
  describe('onMissingEntry: reveal — régime prefs-only', () => {
    it('laisse la présence brute quand aucune entrée ne concerne le profil', () => {
      const out = applyPresenceVisibilityAsOffline(profile, undefined, { onMissingEntry: 'reveal' });
      expect(out.isOnline).toBe(true);
      expect(out.lastActiveAt).toEqual(profile.lastActiveAt);
    });

    it('masque malgré tout sur une visibilité explicitement négative', () => {
      const out = applyPresenceVisibilityAsOffline(
        profile,
        { showOnline: false, showLastSeenTimestamp: false },
        { onMissingEntry: 'reveal' },
      );
      expect(out.isOnline).toBe(false);
      expect(out.lastActiveAt).toBeNull();
    });

    it('normalise un isOnline null en false, sans fabriquer lastActiveAt', () => {
      const out = applyPresenceVisibilityAsOffline({ id: 'u7', isOnline: null }, undefined, {
        onMissingEntry: 'reveal',
      });
      expect(out.isOnline).toBe(false);
      expect('lastActiveAt' in out).toBe(false);
    });
  });

  // Le défaut reste `hide` : les six sites stricts existants passent deux
  // arguments et ne doivent rien changer de leur comportement.
  it('conserve le défaut masquant quand aucune option n est passée', () => {
    const out = applyPresenceVisibilityAsOffline(profile, undefined, {});
    expect(out.isOnline).toBe(false);
  });
});
