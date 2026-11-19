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
  PHONE_CALL_CONFIG,
  phoneCallEndedEventDataSchema,
  phoneCallReportSchema,
  phoneCallStartedEventDataSchema,
  phoneCallEmitterSettingsUpdateSchema,
} from '../types/phone-call';
import { SERVER_EVENTS } from '../types/socketio-events';
import { phoneCallStep, servedPhoneCall, type PhoneCallRecord } from '../utils/phone-call';

const pair = (over: Partial<Omit<RelationAccessInput, 'consent'>> = {}): Omit<RelationAccessInput, 'consent'> => ({
  viewerId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  targetId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  grantedByViewer: 'PUBLIC',
  grantedByTarget: 'PUBLIC',
  sharesCommunity: false,
  blockedEitherWay: false,
  viewerMinor: 'adult',
  targetMinor: 'adult',
  viewerRole: 'USER',
  targetRole: 'USER',
  feature: 'device.call',
  ...over,
});

const USER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const at = (minutes: number, seconds = 0): string => new Date(Date.UTC(2026, 10, 19, 14, 0) + minutes * 60_000 + seconds * 1000).toISOString();
const report = (previous: PhoneCallRecord | null, active: boolean, minutes: number, seconds = 0) =>
  phoneCallStep(previous, { kind: 'report', active, at: at(minutes, seconds) });

describe('« en appel » dans la matrice des cercles (#18753)', () => {
  it('ouvre device.call au seul Sang, consentement de l\'émetteur accordé par défaut entre Sangs', () => {
    expect(RELATION_FEATURES).toContain('device.call');
    expect(RELATION_FEATURE_MIN_LEVEL['device.call']).toBe('BLOOD');
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('device.call')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('device.call')).toBe(true);
    expect(RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['device.call']).toBe('BLOOD');
    expect(RELATION_DIRECTED_FEATURES.has('device.call')).toBe(false);
  });

  it('Sang sans réglage : voit ; Sang retiré : rien ; Proche, même consenti : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: false }).allowed).toBe(false);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: true }).allowed).toBe(false);
  });

  it('entre deux comptes de l\'équipe (ANALYST et au-dessus), le niveau rendu est Sang (#16623) ; un administrateur face à un utilisateur : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'ADMIN' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'USER' }), storedConsent: null }).allowed).toBe(false);
  });
});

describe('phoneCallStep — le téléphone dit s\'il est en appel', () => {
  it('le premier « en appel » ouvre l\'état et s\'annonce', () => {
    const step = report(null, true, 2, 13);
    expect(step.state).toEqual({ since: at(2, 13), reportedAt: at(2, 13) });
    expect(step.announcement).toEqual({ kind: 'started', at: at(2, 13) });
  });

  it('un rappel pendant l\'appel garde le début et ne s\'annonce pas', () => {
    const step = report(report(null, true, 2).state, true, 20);
    expect(step.state).toEqual({ since: at(2), reportedAt: at(20) });
    expect(step.announcement).toBeUndefined();
  });

  it('la fin efface l\'état et s\'annonce ; une fin sans appel ne dit rien', () => {
    const ended = report(report(null, true, 2).state, false, 30);
    expect(ended.state).toBeNull();
    expect(ended.announcement).toEqual({ kind: 'ended', at: at(30) });
    expect(report(null, false, 30)).toEqual({ state: null });
  });

  it('un état resté sans rappel au-delà de sa durée de vie est un appel neuf', () => {
    const stale = report(null, true, 0).state;
    const fresh = report(stale, true, PHONE_CALL_CONFIG.reportTtlMinutes + 1);
    expect(fresh.state?.since).toBe(at(PHONE_CALL_CONFIG.reportTtlMinutes + 1));
    expect(fresh.announcement?.kind).toBe('started');
  });

  it('un rapport plus ancien que le dernier ne recule rien', () => {
    const held = report(null, true, 10).state;
    expect(report(held, false, 5)).toEqual({ state: held });
  });
});

describe('servedPhoneCall — ce qu\'un Sang lit', () => {
  it('le début arrondi à 5 minutes (deux personnes ne se trahissent pas à la seconde près), et quand il expire', () => {
    expect(servedPhoneCall(USER, { since: at(2, 13), reportedAt: at(20) })).toEqual({
      userId: USER,
      since: at(0),
      expiresAt: at(20 + PHONE_CALL_CONFIG.reportTtlMinutes),
    });
  });

  it('rien d\'autre : jamais d\'interlocuteur', () => {
    expect(Object.keys(servedPhoneCall(USER, { since: at(7), reportedAt: at(7) }) ?? {}).sort()).toEqual(['expiresAt', 'since', 'userId']);
    expect(servedPhoneCall(USER, null)).toBeNull();
  });
});

describe('le contrat', () => {
  it('nomme ses deux événements', () => {
    expect(SERVER_EVENTS.PHONE_CALL_STARTED).toBe('phone-call:started');
    expect(SERVER_EVENTS.PHONE_CALL_ENDED).toBe('phone-call:ended');
  });

  it('le rapport du téléphone est un booléen strict ; le réglage global aussi', () => {
    expect(phoneCallReportSchema.safeParse({ active: true }).success).toBe(true);
    expect(phoneCallReportSchema.safeParse({ active: true, with: '+33600000000' }).success).toBe(false);
    expect(phoneCallEmitterSettingsUpdateSchema.safeParse({ sharingEnabled: false }).success).toBe(true);
  });

  it('un client plus ancien tolère une annonce inconnue', () => {
    const state = { userId: USER, since: at(0), expiresAt: at(180) };
    expect(phoneCallStartedEventDataSchema.parse({ userId: USER, state, announcement: { kind: 'futur', at: at(1) } }).announcement).toBeUndefined();
    expect(phoneCallEndedEventDataSchema.parse({ userId: USER, announcement: { kind: 'ended', at: at(9) } }).announcement?.kind).toBe('ended');
  });
});
