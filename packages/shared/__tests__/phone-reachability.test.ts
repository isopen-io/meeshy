import { describe, expect, it } from 'vitest';
import {
  RELATION_CONSENT_FEATURES,
  RELATION_DIRECTED_FEATURES,
  RELATION_EMITTER_CONSENT_DEFAULT_LEVEL,
  RELATION_EMITTER_CONSENT_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_FEATURES,
} from '../utils/relation-levels';
import { resolveRelationAccessWithStoredConsent } from '../utils/relation-emitter-consent';
import type { RelationAccessInput } from '../utils/relation-access';
import {
  PHONE_REACHABILITY_CONFIG,
  phoneReachabilityChangedEventDataSchema,
  phoneReachabilityClearedEventDataSchema,
  phoneReachabilityPersonSettingsUpdateSchema,
  phoneReachabilitySnapshotSchema,
} from '../types/phone-reachability';
import {
  INITIAL_PHONE_REACHABILITY,
  phoneReachabilityReaderChannel,
  phoneReachabilityStep,
  type PhoneReachabilityRecord,
} from '../utils/phone-reachability';

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
  feature: 'device.unreachable',
  ...over,
});

const at = (minutes: number): string => new Date(Date.UTC(2026, 10, 15, 14, 0) + minutes * 60_000).toISOString();

const seenAt = (minutes: number): PhoneReachabilityRecord => phoneReachabilityStep(null, { kind: 'alive', at: at(minutes) }).state;

/** Un téléphone qui a déjà répondu à une sonde (il y a plus d'une heure) : sa version sait répondre. */
const provenAt = (minutes: number): PhoneReachabilityRecord => ({ ...seenAt(minutes), lastAnsweredAt: at(minutes - 120) });

describe('le téléphone injoignable dans la matrice des cercles (#18737)', () => {
  it('ouvre device.unreachable dès Proche', () => {
    expect(RELATION_FEATURES).toContain('device.unreachable');
    expect(RELATION_FEATURE_MIN_LEVEL['device.unreachable']).toBe('CLOSE');
  });

  it('passe par le consentement de l\'ÉMETTEUR, accordé par défaut entre Sangs seulement', () => {
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('device.unreachable')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('device.unreachable')).toBe(true);
    expect(RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['device.unreachable']).toBe('BLOOD');
    expect(RELATION_DIRECTED_FEATURES.has('device.unreachable')).toBe(false);
  });

  it('Sang sans réglage : l\'état part ; Proche sans accord : rien ; Proche ayant consenti : il part', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: null }).reason).toBe('consent');
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: true }).allowed).toBe(true);
  });

  it('un Ami ne reçoit rien, même avec un accord stocké ; la coupure globale ferme le Sang', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'FRIEND', grantedByTarget: 'FRIEND' }), storedConsent: true }).allowed).toBe(false);
    expect(
      resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null, globallyDisabled: true }).allowed,
    ).toBe(false);
  });

  it('entre deux comptes de l\'équipe sans lien (ANALYST et au-dessus), le niveau rendu est Sang (#16623)', () => {
    const access = resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'BIGBOSS' }), storedConsent: null });
    expect(access).toEqual({ allowed: true, effectiveLevel: 'BLOOD', reason: 'level', requiresConsent: true });
  });

  it('un administrateur face à un utilisateur ordinaire sans lien ne reçoit rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'USER' }), storedConsent: null }).allowed).toBe(false);
  });
});

describe('phoneReachabilityStep — deux sondes sans réponse font un téléphone injoignable', () => {
  const config = PHONE_REACHABILITY_CONFIG;

  it('ne sonde pas avant le délai de calme', () => {
    const step = phoneReachabilityStep(seenAt(0), { kind: 'tick', now: at(config.quietMinutes - 1), batteryLow: false });
    expect(step.probe).toBe(false);
    expect(step.announcement).toBeUndefined();
  });

  it('sonde une fois le calme écoulé, puis une seconde fois sans réponse', () => {
    const first = phoneReachabilityStep(seenAt(0), { kind: 'tick', now: at(config.quietMinutes), batteryLow: false });
    expect(first.probe).toBe(true);
    expect(first.state.probesSent).toBe(1);
    const early = phoneReachabilityStep(first.state, { kind: 'tick', now: at(config.quietMinutes + config.probeTimeoutMinutes - 1), batteryLow: false });
    expect(early.probe).toBe(false);
    const second = phoneReachabilityStep(first.state, { kind: 'tick', now: at(config.quietMinutes + config.probeTimeoutMinutes), batteryLow: false });
    expect(second.probe).toBe(true);
    expect(second.state.probesSent).toBe(2);
  });

  it('déclare injoignable DEPUIS le dernier signe de vie après la seconde sonde restée sans réponse', () => {
    const one = phoneReachabilityStep(provenAt(0), { kind: 'tick', now: at(10), batteryLow: false }).state;
    const two = phoneReachabilityStep(one, { kind: 'tick', now: at(20), batteryLow: false }).state;
    const gone = phoneReachabilityStep(two, { kind: 'tick', now: at(30), batteryLow: false });
    expect(gone.probe).toBe(false);
    expect(gone.state.unreachableSince).toBe(at(0));
    expect(gone.announcement).toEqual({ kind: 'unreachable', at: at(30) });
    expect(gone.state.cause).toBe('network');
  });

  it('la cause probable est la batterie quand elle était critique ou éteinte', () => {
    const one = phoneReachabilityStep(provenAt(0), { kind: 'tick', now: at(10), batteryLow: true }).state;
    const two = phoneReachabilityStep(one, { kind: 'tick', now: at(20), batteryLow: true }).state;
    expect(phoneReachabilityStep(two, { kind: 'tick', now: at(30), batteryLow: true }).state.cause).toBe('battery');
  });

  it('un téléphone injoignable ne se ré-annonce pas', () => {
    const one = phoneReachabilityStep(provenAt(0), { kind: 'tick', now: at(10), batteryLow: false }).state;
    const two = phoneReachabilityStep(one, { kind: 'tick', now: at(20), batteryLow: false }).state;
    const gone = phoneReachabilityStep(two, { kind: 'tick', now: at(30), batteryLow: false }).state;
    const again = phoneReachabilityStep(gone, { kind: 'tick', now: at(90), batteryLow: false });
    expect(again.announcement).toBeUndefined();
    expect(again.probe).toBe(false);
  });

  it('un signe de vie annonce le retour et efface la cause', () => {
    const one = phoneReachabilityStep(provenAt(0), { kind: 'tick', now: at(10), batteryLow: false }).state;
    const two = phoneReachabilityStep(one, { kind: 'tick', now: at(20), batteryLow: false }).state;
    const gone = phoneReachabilityStep(two, { kind: 'tick', now: at(30), batteryLow: false }).state;
    const back = phoneReachabilityStep(gone, { kind: 'alive', at: at(45) });
    expect(back.announcement).toEqual({ kind: 'reachable', at: at(45) });
    expect(back.state).toMatchObject({ unreachableSince: null, cause: null, probesSent: 0, lastSeenAt: at(45) });
  });

  it('une réponse à une sonde espace la sonde suivante d\'une heure (budget des pushs silencieux)', () => {
    const probed = phoneReachabilityStep(seenAt(0), { kind: 'tick', now: at(10), batteryLow: false }).state;
    const answered = phoneReachabilityStep(probed, { kind: 'alive', at: at(12), answer: true }).state;
    expect(answered.lastAnsweredAt).toBe(at(12));
    expect(phoneReachabilityStep(answered, { kind: 'tick', now: at(30), batteryLow: false }).probe).toBe(false);
    expect(phoneReachabilityStep(answered, { kind: 'tick', now: at(12 + config.reprobeAfterMinutes), batteryLow: false }).probe).toBe(true);
  });

  it('un signe de vie plus ancien que le dernier connu ne recule pas l\'horloge', () => {
    const state = seenAt(20);
    expect(phoneReachabilityStep(state, { kind: 'alive', at: at(5) }).state.lastSeenAt).toBe(at(20));
  });

  it('un téléphone qui n\'a jamais répondu à une sonde n\'est jamais déclaré : sa version ne sait peut-être pas répondre', () => {
    const one = phoneReachabilityStep(seenAt(0), { kind: 'tick', now: at(10), batteryLow: false }).state;
    const two = phoneReachabilityStep(one, { kind: 'tick', now: at(20), batteryLow: false }).state;
    const third = phoneReachabilityStep(two, { kind: 'tick', now: at(30), batteryLow: false });
    expect(third.announcement).toBeUndefined();
    expect(third.state.unreachableSince).toBeNull();
    expect(phoneReachabilityStep(third.state, { kind: 'tick', now: at(20 + config.reprobeAfterMinutes - 1), batteryLow: false }).probe).toBe(false);
    const retry = phoneReachabilityStep(third.state, { kind: 'tick', now: at(20 + config.reprobeAfterMinutes), batteryLow: false });
    expect(retry.probe).toBe(true);
    expect(retry.state.probesSent).toBe(1);
  });

  it('sans aucun signe de vie connu, un balayage ne fait rien', () => {
    const step = phoneReachabilityStep(INITIAL_PHONE_REACHABILITY, { kind: 'tick', now: at(500), batteryLow: false });
    expect(step).toEqual({ state: INITIAL_PHONE_REACHABILITY, probe: false });
  });
});

describe('phoneReachabilityReaderChannel — le contexte décide de ce qui part', () => {
  it('l\'injoignabilité part en SyncPill en conversation, en push hors conversation', () => {
    expect(phoneReachabilityReaderChannel({ kind: 'unreachable', inConversation: true, receivedUnreachablePush: false })).toBe('socket');
    expect(phoneReachabilityReaderChannel({ kind: 'unreachable', inConversation: false, receivedUnreachablePush: false })).toBe('push');
  });

  it('le retour est poussé à qui a reçu le push d\'injoignabilité, sinon SyncPill en conversation, sinon en silence', () => {
    expect(phoneReachabilityReaderChannel({ kind: 'reachable', inConversation: false, receivedUnreachablePush: true })).toBe('push');
    expect(phoneReachabilityReaderChannel({ kind: 'reachable', inConversation: true, receivedUnreachablePush: false })).toBe('socket');
    expect(phoneReachabilityReaderChannel({ kind: 'reachable', inConversation: false, receivedUnreachablePush: false })).toBe('none');
  });
});

describe('le contrat descendant tolère un client plus ancien que le serveur', () => {
  const state = { userId: USER_B, unreachableSince: at(0), cause: 'network' as const };

  it('accepte une cause ou une annonce inconnues sans perdre l\'état', () => {
    const parsed = phoneReachabilityChangedEventDataSchema.parse({ userId: USER_B, state, announcement: { kind: 'later-kind', at: at(1) }, extra: 1 });
    expect(parsed.state.unreachableSince).toBe(at(0));
    expect(parsed.announcement).toBeUndefined();
    expect(phoneReachabilityChangedEventDataSchema.parse({ userId: USER_B, state: { ...state, cause: 'airplane-later' } }).state.cause).toBe('unknown');
  });

  it('l\'effacement porte au plus une annonce de retour', () => {
    expect(phoneReachabilityClearedEventDataSchema.parse({ userId: USER_B, announcement: { kind: 'reachable', at: at(2) } }).announcement?.kind).toBe('reachable');
  });

  it('le rattrapage est une liste d\'états', () => {
    expect(phoneReachabilitySnapshotSchema.parse({ items: [state] }).items).toHaveLength(1);
  });

  it('le réglage par personne est strict et non vide', () => {
    expect(phoneReachabilityPersonSettingsUpdateSchema.safeParse({ shared: true }).success).toBe(true);
    expect(phoneReachabilityPersonSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(phoneReachabilityPersonSettingsUpdateSchema.safeParse({ shared: true, other: 1 }).success).toBe(false);
  });
});
