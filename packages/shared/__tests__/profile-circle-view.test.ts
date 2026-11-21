import { describe, it, expect } from 'vitest';
import {
  PROFILE_CAPABILITIES,
  profileFieldOpen,
  profileFieldServed,
  profileCirclesReachable,
  resolveProfileCircleView,
  resolveProfileCircleViewAs,
  resolveProfilePresenceAs,
  type ProfileCapabilityKey,
  type ProfileCircleViewInput,
} from '../utils/profile-circle-view';
import { resolvePresenceVisibility, type PresenceVisibilityInput } from '../utils/presence-visibility';
import { RELATION_FEATURE_MIN_LEVEL, RELATION_CONSENT_FEATURES, type RelationFeature } from '../utils/relation-levels';
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

/**
 * La table attendue, écrite ICI : le module ne l'exporte plus, pour qu'aucun fichier
 * n'interroge `presence.online` / `presence.detailed` sans s'inscrire à la garde.
 */
const FEATURE_OF: Readonly<Record<ProfileCapabilityKey, RelationFeature>> = {
  presence: 'presence.online',
  presenceDetailed: 'presence.detailed',
  game: 'game.basic',
  gameSparks: 'game.sparksGlory',
  directMessage: 'dm.direct',
  messageRequest: 'dm.request',
  ring: 'call.ring',
  talkie: 'talkie',
  together: 'together',
  bring: 'bring',
  listeningCategory: 'listening.category',
  listeningTitle: 'listening.title',
  locationTemporary: 'location.temporary',
  locationLive: 'location.live',
  locationHistory: 'location.history',
  locationProximity: 'location.proximity',
  battery: 'device.battery',
  batteryPull: 'device.battery.pull',
  unreachable: 'device.unreachable',
};

const stateOf = (view: ReturnType<typeof resolveProfileCircleView>, key: ProfileCapabilityKey) =>
  view.capabilities[key]!;

describe('resolveProfileCircleView — ce que le cercle du lecteur ouvre', () => {
  it('chaque capacité s ouvre exactement au plancher de la matrice, sur CHAQUE cercle', () => {
    for (const level of RELATION_LEVELS) {
      const view = resolveProfileCircleView(inputAt(level));
      for (const key of PROFILE_CAPABILITIES) {
        const floor = RELATION_FEATURE_MIN_LEVEL[FEATURE_OF[key]];
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
      const feature = FEATURE_OF[key];
      expect(stateOf(view, key).consentRequired).toBe(RELATION_CONSENT_FEATURES.has(feature));
    }
    expect(stateOf(view, 'locationLive')).toMatchObject({ state: 'open', consentRequired: true });
  });

  it('un blocage ferme TOUT, y compris ce que le cercle ouvrirait', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { blockedEitherWay: true }));
    for (const key of PROFILE_CAPABILITIES) expect(stateOf(view, key).state, key).toBe('locked');
  });

  it('un blocage ne sert AUCUN accord : ni ce que chacun accorde, ni ce qui manque (#18861, audit)', () => {
    const view = resolveProfileCircleView(inputAt('CLOSE', { blockedEitherWay: true }));
    expect('grantedByViewer' in view).toBe(false);
    expect('grantedByTarget' in view).toBe(false);
    expect('missing' in view).toBe(false);
    expect(view.level).toBe('PUBLIC');
  });

  it('une cible désactivée : aucun accord servi, toutes les capacités fermées (#18861, audit)', () => {
    const view = resolveProfileCircleView(inputAt('BLOOD', { targetDeactivated: true }));
    expect('grantedByViewer' in view).toBe(false);
    expect('grantedByTarget' in view).toBe(false);
    expect('missing' in view).toBe(false);
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

const presenceAt = (relationLevel: RelationLevel, overrides: Partial<PresenceVisibilityInput> = {}) =>
  resolvePresenceVisibility({
    isSelf: false,
    viewerRole: 'USER',
    relationLevel,
    targetShowOnlineStatus: true,
    targetShowLastSeen: true,
    targetIsDeactivated: false,
    isBlockedEitherWay: false,
    ...overrides,
  });

describe('profileFieldServed — pays et fuseau suivent la présence SERVIE, jamais un second verdict', () => {
  it('Proche, présence cachée par la cible : ni pays ni fuseau', () => {
    const visibility = presenceAt('CLOSE', { targetShowOnlineStatus: false, targetShowLastSeen: false });
    expect(profileFieldServed(visibility, 'country')).toBe(false);
    expect(profileFieldServed(visibility, 'timezone')).toBe(false);
  });

  it('Proche, compte désactivé : ni pays ni fuseau', () => {
    const visibility = presenceAt('CLOSE', { targetIsDeactivated: true });
    expect(profileFieldServed(visibility, 'country')).toBe(false);
    expect(profileFieldServed(visibility, 'timezone')).toBe(false);
  });

  it('Proche, dernière vue cachée seulement : le pays part, le fuseau (l heure locale) non', () => {
    const visibility = presenceAt('CLOSE', { targetShowLastSeen: false });
    expect(profileFieldServed(visibility, 'country')).toBe(true);
    expect(profileFieldServed(visibility, 'timezone')).toBe(false);
  });

  it('Ami (binaire) : le pays, pas le fuseau ; Connaissance : rien', () => {
    expect(profileFieldServed(presenceAt('FRIEND'), 'country')).toBe(true);
    expect(profileFieldServed(presenceAt('FRIEND'), 'timezone')).toBe(false);
    expect(profileFieldServed(presenceAt('ACQUAINTANCE'), 'country')).toBe(false);
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

describe('« Voir comme » rend ce que reçoit un VRAI lecteur du cercle — âge, rôle et préférences du propriétaire (#18861, audit)', () => {
  it('propriétaire mineur déclaré, vu comme Connaissance : les capacités se ferment comme pour un vrai lecteur adulte', () => {
    const as = resolveProfileCircleViewAs({ level: 'ACQUAINTANCE', targetId: 'target', targetMinor: 'minor', targetRole: 'USER' });
    const real = resolveProfileCircleView(inputAt('ACQUAINTANCE', { targetMinor: 'minor' }));
    expect(as.capabilities).toEqual(real.capabilities);
    expect(stateOf(as, 'ring').state).toBe('locked');
  });

  it('propriétaire de l équipe : un lecteur ordinaire du cercle n hérite d aucun privilège', () => {
    const as = resolveProfileCircleViewAs({ level: 'FRIEND', targetId: 'target', targetMinor: 'adult', targetRole: 'MODERATOR' });
    const real = resolveProfileCircleView(inputAt('FRIEND', { targetRole: 'MODERATOR', targetMinor: 'adult' }));
    expect(as.capabilities).toEqual(real.capabilities);
    expect(as.level).toBe('FRIEND');
  });

  const owner = { targetMinor: 'unknown' as const, targetRole: 'USER', targetShowOnlineStatus: true, targetShowLastSeen: true, targetIsDeactivated: false };

  it('la présence vue comme Proche suit les préférences RÉELLES : dernière vue cachée ⇒ ni heure locale ni dernière vue', () => {
    const visibility = resolveProfilePresenceAs({ level: 'CLOSE', ...owner, targetShowLastSeen: false });
    expect(visibility).toEqual(presenceAt('CLOSE', { targetShowLastSeen: false }));
    expect(visibility.showLastSeenTimestamp).toBe(false);
    expect(profileFieldServed(visibility, 'timezone')).toBe(false);
  });

  it('présence cachée ⇒ ni « en ligne » ni pays, même vu comme Sang', () => {
    const visibility = resolveProfilePresenceAs({ level: 'BLOOD', ...owner, targetShowOnlineStatus: false });
    expect(visibility).toEqual({ showOnline: false, showLastSeenTimestamp: false });
    expect(profileFieldServed(visibility, 'country')).toBe(false);
  });

  it('compte désactivé ⇒ rien', () => {
    expect(resolveProfilePresenceAs({ level: 'BLOOD', ...owner, targetIsDeactivated: true })).toEqual({ showOnline: false, showLastSeenTimestamp: false });
  });

  it('sans préférence : exactement la présence d un vrai lecteur de chaque cercle (non-régression)', () => {
    for (const level of RELATION_LEVELS) expect(resolveProfilePresenceAs({ level, ...owner }), level).toEqual(presenceAt(level));
  });
});

describe('profileCirclesReachable : le lecteur peut-il encore atteindre un cercle de la cible ? (#19274)', () => {
  it.each(RELATION_LEVELS)('lien %s, sans blocage : oui', (level) => {
    expect(profileCirclesReachable(resolveProfileCircleView(inputAt(level)))).toBe(true);
  });

  it('blocage dans un sens ou l’autre : non, même entre Sang', () => {
    expect(profileCirclesReachable(resolveProfileCircleView(inputAt('BLOOD', { blockedEitherWay: true })))).toBe(false);
  });

  it('cible désactivée : non', () => {
    expect(profileCirclesReachable(resolveProfileCircleView(inputAt('FRIEND', { targetDeactivated: true })))).toBe(false);
  });
});
