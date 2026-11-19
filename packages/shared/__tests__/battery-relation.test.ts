import { describe, expect, it } from 'vitest';
import {
  RELATION_CONSENT_FEATURES,
  RELATION_DIRECTED_FEATURES,
  RELATION_EMITTER_CONSENT_DEFAULT_LEVEL,
  RELATION_EMITTER_CONSENT_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_FEATURES,
} from '../utils/relation-levels';
import { resolveEmitterConsent, resolveRelationAccessWithStoredConsent } from '../utils/relation-emitter-consent';
import type { RelationAccessInput } from '../utils/relation-access';

const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const pair = (over: Partial<Omit<RelationAccessInput, 'consent'>> = {}): Omit<RelationAccessInput, 'consent'> => ({
  viewerId: USER_A,
  targetId: USER_B,
  grantedByViewer: 'PUBLIC',
  grantedByTarget: 'PUBLIC',
  sharesCommunity: false,
  blockedEitherWay: false,
  viewerMinor: 'adult',
  targetMinor: 'adult',
  viewerRole: 'USER',
  targetRole: 'USER',
  feature: 'device.battery',
  ...over,
});

describe('la batterie dans la matrice des cercles (#14147)', () => {
  it('ouvre device.battery dès Proche et le relevé à la demande dès Sang', () => {
    expect(RELATION_FEATURES).toContain('device.battery');
    expect(RELATION_FEATURES).toContain('device.battery.pull');
    expect(RELATION_FEATURE_MIN_LEVEL['device.battery']).toBe('CLOSE');
    expect(RELATION_FEATURE_MIN_LEVEL['device.battery.pull']).toBe('BLOOD');
  });

  it('passe par le consentement de l\'ÉMETTEUR, jamais par une préférence de réception', () => {
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('device.battery')).toBe(true);
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('device.battery.pull')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('device.battery')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('device.battery.pull')).toBe(true);
  });

  it('le relevé à la demande est adressé à un autre ; l\'état se lit aussi de soi', () => {
    expect(RELATION_DIRECTED_FEATURES.has('device.battery.pull')).toBe(true);
    expect(RELATION_DIRECTED_FEATURES.has('device.battery')).toBe(false);
  });

  it('le consentement est accordé par défaut entre Sangs, pour la batterie, le téléphone injoignable (#18737) et la vérification d\'inactivité (#18738)', () => {
    expect(RELATION_EMITTER_CONSENT_DEFAULT_LEVEL).toEqual({ 'device.battery': 'BLOOD', 'device.battery.pull': 'BLOOD', 'device.unreachable': 'BLOOD', 'safety.inactivity': 'BLOOD', 'device.call': 'BLOOD' });
  });
});

describe('resolveEmitterConsent — le tri-état par paire', () => {
  it('nul ou absent vaut le défaut du niveau : refusé entre Proches, accordé entre Sangs', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: null, effectiveLevel: 'CLOSE' })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: undefined, effectiveLevel: 'BLOOD' })).toBe('granted');
  });

  it('un accord stocké ouvre au Proche, un refus stocké ferme au Sang', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: true, effectiveLevel: 'CLOSE' })).toBe('granted');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'BLOOD' })).toBe('refused');
  });

  it('la coupure globale de l\'émetteur ferme tout, même un accord stocké', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: true, effectiveLevel: 'BLOOD', globallyDisabled: true })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: null, effectiveLevel: 'BLOOD', globallyDisabled: true })).toBe('refused');
  });

  it('une feature sans défaut garde le sens historique : seul true accorde, même au Sang', () => {
    expect(resolveEmitterConsent({ feature: 'listening.title', stored: null, effectiveLevel: 'BLOOD' })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'listening.title', stored: true, effectiveLevel: 'BLOOD' })).toBe('granted');
  });

  it('une valeur stockée illisible vaut le défaut, jamais un accord', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: 'yes' as unknown as boolean, effectiveLevel: 'CLOSE' })).toBe('refused');
  });
});

describe('resolveRelationAccessWithStoredConsent — la loi avec le consentement par défaut', () => {
  it('Sang sans réglage : la batterie part, sans confirmation', () => {
    const access = resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null });
    expect(access).toEqual({ allowed: true, effectiveLevel: 'BLOOD', reason: 'level', requiresConsent: true });
  });

  it('Proche sans consentement : rien ne part, l\'écran de consentement peut être proposé', () => {
    const access = resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: null });
    expect(access).toEqual({ allowed: false, effectiveLevel: 'CLOSE', reason: 'consent', requiresConsent: true });
  });

  it('Proche ayant consenti : la batterie part', () => {
    expect(
      resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: true }).allowed,
    ).toBe(true);
  });

  it('Ami : rien, même avec un accord stocké', () => {
    const access = resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'FRIEND', grantedByTarget: 'FRIEND' }), storedConsent: true });
    expect(access).toEqual({ allowed: false, effectiveLevel: 'FRIEND', reason: 'level', requiresConsent: false });
  });

  it('bloqué : rien, même entre Sangs', () => {
    const access = resolveRelationAccessWithStoredConsent({
      ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD', blockedEitherWay: true }),
      storedConsent: true,
    });
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe('blocked');
  });

  it('entre deux comptes de l\'équipe sans lien, la batterie s\'applique comme entre Sangs (#16623)', () => {
    const access = resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'MODERATOR' }), storedConsent: null });
    expect(access).toEqual({ allowed: true, effectiveLevel: 'BLOOD', reason: 'level', requiresConsent: true });
    expect(
      resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'MODERATOR', feature: 'device.battery.pull' }), storedConsent: null }).allowed,
    ).toBe(true);
  });

  it('un collègue qui a retiré la batterie à un autre ne la lui sert plus', () => {
    expect(
      resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'MODERATOR' }), storedConsent: false }).allowed,
    ).toBe(false);
  });

  it('un rôle d\'équipe face à un utilisateur ordinaire n\'ouvre rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'USER' }), storedConsent: null }).allowed).toBe(false);
  });

  it('le relevé à la demande : Sang oui, Proche consentant non, soi non', () => {
    const blood = pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD', feature: 'device.battery.pull' });
    expect(resolveRelationAccessWithStoredConsent({ ...blood, storedConsent: null }).allowed).toBe(true);
    expect(
      resolveRelationAccessWithStoredConsent({ ...blood, grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE', storedConsent: true }).allowed,
    ).toBe(false);
    expect(resolveRelationAccessWithStoredConsent({ ...blood, targetId: USER_A, storedConsent: true }).reason).toBe('self');
  });

  it('une feature sans consentement ignore le stocké', () => {
    const access = resolveRelationAccessWithStoredConsent({
      ...pair({ grantedByViewer: 'FRIEND', grantedByTarget: 'FRIEND', feature: 'presence.online' }),
      storedConsent: false,
    });
    expect(access.allowed).toBe(true);
  });
});
