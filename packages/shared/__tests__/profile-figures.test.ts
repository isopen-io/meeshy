import { describe, it, expect } from 'vitest';
import { resolveProfileCircleView, resolveProfileCircleViewAs, type ProfileCircleViewInput } from '../utils/profile-circle-view';
import { PROFILE_FIGURES_DEFAULT, profileFiguresServed } from '../utils/profile-figures';
import { PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS } from '../types/preferences/privacy';
import type { RelationLevel } from '../types/relation';

const inputAt = (granted: RelationLevel, overrides: Partial<ProfileCircleViewInput> = {}): ProfileCircleViewInput => ({
  viewerId: 'viewer',
  targetId: 'target',
  grantedByViewer: granted,
  grantedByTarget: granted,
  sharesCommunity: false,
  viewerMinor: 'unknown',
  targetMinor: 'unknown',
  viewerRole: 'USER',
  targetRole: 'USER',
  ...overrides,
});

const servedAt = (granted: RelationLevel, stored?: unknown, overrides: Partial<ProfileCircleViewInput> = {}) =>
  profileFiguresServed({ view: resolveProfileCircleView(inputAt(granted, overrides)), showProfileFigures: stored });

describe('« En chiffres » d une autre personne (#19371)', () => {
  it('s ouvre au Proche et au-dessus, jamais sous le Proche', () => {
    expect(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE', 'FRIEND'].map((level) => servedAt(level as RelationLevel))).toEqual([false, false, false, false]);
    expect(['CLOSE', 'BLOOD'].map((level) => servedAt(level as RelationLevel))).toEqual([true, true]);
  });

  it('suit le niveau EFFECTIF : un Proche accordé d un seul côté reste un Ami', () => {
    expect(servedAt('CLOSE', undefined, { grantedByTarget: 'FRIEND' })).toBe(false);
  });

  it('la personne qui a coupé sa préférence ne montre rien, même au Sang', () => {
    expect(servedAt('BLOOD', false)).toBe(false);
    expect(servedAt('CLOSE', true)).toBe(true);
  });

  it('une valeur stockée qui n est pas un booléen vaut le défaut, jamais un oui forcé', () => {
    expect(servedAt('CLOSE', 'oui')).toBe(PROFILE_FIGURES_DEFAULT);
  });

  it('un blocage ou un compte désactivé ferme tout', () => {
    expect(servedAt('BLOOD', true, { blockedEitherWay: true })).toBe(false);
    expect(servedAt('BLOOD', true, { targetDeactivated: true })).toBe(false);
  });

  it('« Voir comme » suit la même loi pour le cercle demandé', () => {
    const asCircle = (level: RelationLevel) => profileFiguresServed({ view: resolveProfileCircleViewAs({ level, targetId: 'target' }), showProfileFigures: undefined });
    expect(asCircle('FRIEND')).toBe(false);
    expect(asCircle('CLOSE')).toBe(true);
  });

  it('la préférence est facultative et sans défaut stocké : le schéma l accepte, les défauts servis ne la portent pas', () => {
    expect(PrivacyPreferenceSchema.parse({ showProfileFigures: false }).showProfileFigures).toBe(false);
    expect(PrivacyPreferenceSchema.parse({}).showProfileFigures).toBeUndefined();
    expect('showProfileFigures' in PRIVACY_PREFERENCE_DEFAULTS).toBe(false);
  });
});
