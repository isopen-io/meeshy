import { describe, it, expect } from 'vitest';
import {
  PROFILE_CAPABILITIES,
  PROFILE_CAPABILITY_FEATURE,
  PROFILE_FIELD_FEATURE,
  profileFieldOpen,
  resolveProfileCircleView,
  resolveProfileCircleViewAs,
  type ProfileCircleViewInput,
} from '../utils/profile-circle-view';
import { RELATION_FEATURE_MIN_LEVEL, RELATION_CONSENT_FEATURES } from '../utils/relation-levels';
import { RELATION_LEVELS, compareRelationLevel, type RelationLevel } from '../types/relation';

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

const stateOf = (view: ReturnType<typeof resolveProfileCircleView>, key: keyof typeof PROFILE_CAPABILITY_FEATURE) =>
  view.capabilities[key];

describe('resolveProfileCircleView — ce que le cercle du lecteur ouvre', () => {
  it('chaque capacité s ouvre exactement au plancher de la matrice, sur CHAQUE cercle', () => {
    for (const level of RELATION_LEVELS) {
      const view = resolveProfileCircleView(inputAt(level));
      for (const key of PROFILE_CAPABILITIES) {
        const floor = RELATION_FEATURE_MIN_LEVEL[PROFILE_CAPABILITY_FEATURE[key]];
        const expected = compareRelationLevel(level, floor) >= 0 ? 'open' : 'locked';
        expect(stateOf(view, key).state, `${key} @ ${level}`).toBe(expected);
        expect(stateOf(view, key).circle, `${key} circle`).toBe(floor);
      }
    }
  });

  it('un lecteur Ami voit la présence binaire ouverte et la présence détaillée fermée, par le cercle Proche', () => {
    const view = resolveProfileCircleView(inputAt('FRIEND'));
    expect(stateOf(view, 'presence').state).toBe('open');
    expect(stateOf(view, 'presenceDetailed')).toMatchObject({ state: 'locked', circle: 'CLOSE' });
    expect(stateOf(view, 'locationLive')).toMatchObject({ state: 'locked', circle: 'BLOOD' });
  });

  it('le niveau commun est le plus bas des deux accords (lui t accorde Proche, tu lui accordes Sang)', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { grantedByTarget: 'CLOSE' }));
    expect(view.level).toBe('CLOSE');
    expect(view.grantedByViewer).toBe('BLOOD');
    expect(view.grantedByTarget).toBe('CLOSE');
    expect(stateOf(view, 'locationHistory').state).toBe('locked');
  });

  it('dit ce qui manque pour monter : l accord de l autre côté, pas le sien', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { grantedByTarget: 'CLOSE' }));
    expect(view.missing).toEqual({ level: 'BLOOD', byViewer: false, byTarget: true });
  });

  it('dit ce qui manque des deux côtés quand aucun n a accordé le cran suivant', () => {
    const view = resolveProfileCircleView(inputAt('FRIEND'));
    expect(view.missing).toEqual({ level: 'CLOSE', byViewer: true, byTarget: true });
  });

  it('ne manque rien au sommet', () => {
    expect(resolveProfileCircleView(inputAt('BLOOD')).missing).toBeNull();
  });

  it('une communauté partagée relève un lien Public à Communauté, jamais plus', () => {
    const view = resolveProfileCircleView(inputAt('PUBLIC', { sharesCommunity: true }));
    expect(view.level).toBe('COMMUNITY');
    expect(view.sharesCommunity).toBe(true);
    expect(stateOf(view, 'presence').state).toBe('locked');
  });

  it('une feature à consentement ne dit jamais ce que la personne a CHOISI : elle porte consentRequired, statique', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD'));
    for (const key of PROFILE_CAPABILITIES) {
      const feature = PROFILE_CAPABILITY_FEATURE[key];
      expect(stateOf(view, key).consentRequired).toBe(RELATION_CONSENT_FEATURES.has(feature));
    }
    expect(stateOf(view, 'locationLive')).toMatchObject({ state: 'open', consentRequired: true });
  });

  it('un blocage ferme TOUT, y compris ce que le cercle ouvrirait', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { blockedEitherWay: true }));
    for (const key of PROFILE_CAPABILITIES) expect(stateOf(view, key).state, key).toBe('locked');
  });

  it('un lecteur sans identité ne reçoit rien d ouvert (fail-closed)', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { viewerId: '' }));
    for (const key of PROFILE_CAPABILITIES) expect(stateOf(view, key).state, key).toBe('locked');
  });

  it('soi-même : tout est ouvert, sauf les actions adressées à un autre, qui sont absentes', () => {
    const view = resolveProfileCircleView(inputAt('PUBLIC', { viewerId: 'target' }));
    expect(view.isSelf).toBe(true);
    expect(stateOf(view, 'presence').state).toBe('open');
    expect(stateOf(view, 'talkie')).toBeUndefined();
    expect(stateOf(view, 'bring')).toBeUndefined();
  });

  it('le privilège d équipe ouvre entre deux comptes de l équipe, mais un mineur déclaré l éteint', () => {
    const team = resolveProfileCircleView(inputAt('PUBLIC', { viewerRole: 'MODERATOR', targetRole: 'ANALYST' }));
    expect(team.level).toBe('BLOOD');
    expect(stateOf(team, 'locationLive').state).toBe('open');
    const minor = resolveProfileCircleView(
      inputAt('PUBLIC', { viewerRole: 'MODERATOR', targetRole: 'ANALYST', targetMinor: 'minor' }),
    );
    expect(minor.level).toBe('PUBLIC');
  });
});

describe('profileFieldOpen — fuseau et pays d inscription selon le cercle', () => {
  it('le pays s ouvre dès Ami, le fuseau dès Proche, sur un cercle AUTRE que le premier', () => {
    expect(PROFILE_FIELD_FEATURE).toEqual({ country: 'presence.online', timezone: 'presence.detailed' });
    const ami = resolveProfileCircleView(inputAt('FRIEND'));
    const proche = resolveProfileCircleView(inputAt('CLOSE'));
    const connaissance = resolveProfileCircleView(inputAt('ACQUAINTANCE'));
    expect(profileFieldOpen(connaissance, 'country')).toBe(false);
    expect(profileFieldOpen(ami, 'country')).toBe(true);
    expect(profileFieldOpen(ami, 'timezone')).toBe(false);
    expect(profileFieldOpen(proche, 'timezone')).toBe(true);
  });

  it('un blocage ferme aussi les champs', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { blockedEitherWay: true }));
    expect(profileFieldOpen(view, 'country')).toBe(false);
    expect(profileFieldOpen(view, 'timezone')).toBe(false);
  });
});

describe('resolveProfileCircleViewAs — « Voir comme » passe par la MÊME loi', () => {
  it('rend, pour chaque cercle, exactement le verdict d un lecteur réel de ce cercle', () => {
    for (const level of RELATION_LEVELS) {
      const as = resolveProfileCircleViewAs({ level, targetId: 'target' });
      const real = resolveProfileCircleView(inputAt(level));
      expect(as.capabilities).toEqual(real.capabilities);
      expect(as.level).toBe(level);
      expect(as.isSelf).toBe(false);
    }
  });
});
