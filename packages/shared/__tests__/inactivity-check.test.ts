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
import { INACTIVITY_CHECK_CONFIG, inactivityCheckSettingsUpdateSchema } from '../types/inactivity-check';
import { INITIAL_INACTIVITY_CHECK, inactivityCheckStep, type InactivityCheckRecord } from '../utils/inactivity-check';

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
  feature: 'safety.inactivity',
  ...over,
});

const HOUR = 60;
const at = (minutes: number): string => new Date(Date.UTC(2026, 10, 16, 8, 0) + minutes * 60_000).toISOString();
const activeAt = (minutes: number): InactivityCheckRecord => inactivityCheckStep(null, { kind: 'activity', at: at(minutes) }).state;
const tick = (state: InactivityCheckRecord, minutes: number, delayHours = 12) => inactivityCheckStep(state, { kind: 'tick', now: at(minutes), delayHours });

describe('la vérification d\'inactivité dans la matrice des cercles (#18738)', () => {
  it('ouvre safety.inactivity au seul Sang, consentement de l\'émetteur accordé par défaut entre Sangs', () => {
    expect(RELATION_FEATURES).toContain('safety.inactivity');
    expect(RELATION_FEATURE_MIN_LEVEL['safety.inactivity']).toBe('BLOOD');
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('safety.inactivity')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('safety.inactivity')).toBe(true);
    expect(RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['safety.inactivity']).toBe('BLOOD');
    expect(RELATION_DIRECTED_FEATURES.has('safety.inactivity')).toBe(false);
  });

  it('Sang sans réglage : prévenu ; Sang ayant retiré : rien ; Proche, même consenti : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: false }).allowed).toBe(false);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: true }).allowed).toBe(false);
  });

  it('entre deux comptes de l\'équipe sans lien (ANALYST et au-dessus), le niveau rendu est Sang (#16623) ; un administrateur face à un utilisateur ordinaire : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'ADMIN' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'USER' }), storedConsent: null }).allowed).toBe(false);
  });
});

describe('inactivityCheckStep — demander avant de prévenir', () => {
  it('ne demande rien avant le délai, puis demande « Tout va bien ? » une seule fois', () => {
    expect(tick(activeAt(0), 12 * HOUR - 1).ask).toBe(false);
    const asked = tick(activeAt(0), 12 * HOUR);
    expect(asked.ask).toBe(true);
    expect(asked.state.phase).toBe('asked');
    expect(tick(asked.state, 12 * HOUR + 10).ask).toBe(false);
  });

  it('le délai est celui que la personne a choisi', () => {
    expect(tick(activeAt(0), 6 * HOUR, 6).ask).toBe(true);
    expect(tick(activeAt(0), 12 * HOUR, 24).ask).toBe(false);
  });

  it('sans réponse en 30 min : les Sangs sont prévenus, une seule fois', () => {
    const asked = tick(activeAt(0), 12 * HOUR).state;
    expect(tick(asked, 12 * HOUR + INACTIVITY_CHECK_CONFIG.answerWindowMinutes - 1).announcement).toBeUndefined();
    const alerted = tick(asked, 12 * HOUR + INACTIVITY_CHECK_CONFIG.answerWindowMinutes);
    expect(alerted.announcement).toEqual({ kind: 'alert', inactiveSince: at(0), at: at(12 * HOUR + 30) });
    expect(tick(alerted.state, 20 * HOUR).announcement).toBeUndefined();
  });

  it('une activité pendant la question l\'annule, sans rien annoncer', () => {
    const asked = tick(activeAt(0), 12 * HOUR).state;
    const answered = inactivityCheckStep(asked, { kind: 'activity', at: at(12 * HOUR + 5) });
    expect(answered.announcement).toBeUndefined();
    expect(answered.state).toMatchObject({ phase: 'idle', lastActivityAt: at(12 * HOUR + 5) });
  });

  it('une activité après l\'alerte annonce le retour et clôt l\'épisode', () => {
    const asked = tick(activeAt(0), 12 * HOUR).state;
    const alerted = tick(asked, 12 * HOUR + 30).state;
    const back = inactivityCheckStep(alerted, { kind: 'activity', at: at(14 * HOUR) });
    expect(back.announcement).toEqual({ kind: 'responded', inactiveSince: at(0), at: at(14 * HOUR) });
    expect(back.state.phase).toBe('idle');
  });

  it('sans activité connue, ou vérification coupée, rien', () => {
    expect(inactivityCheckStep(INITIAL_INACTIVITY_CHECK, { kind: 'tick', now: at(100 * HOUR), delayHours: 12 })).toEqual({ state: INITIAL_INACTIVITY_CHECK, ask: false });
    expect(inactivityCheckStep(activeAt(0), { kind: 'tick', now: at(100 * HOUR), delayHours: null }).ask).toBe(false);
  });

  it('une activité plus ancienne que la dernière connue ne recule pas l\'horloge', () => {
    expect(inactivityCheckStep(activeAt(60), { kind: 'activity', at: at(5) }).state.lastActivityAt).toBe(at(60));
  });
});

describe('les réglages', () => {
  it('le délai se choisit parmi 6, 12 et 24 h, ou se coupe', () => {
    expect(inactivityCheckSettingsUpdateSchema.safeParse({ delayHours: 12 }).success).toBe(true);
    expect(inactivityCheckSettingsUpdateSchema.safeParse({ delayHours: null }).success).toBe(true);
    expect(inactivityCheckSettingsUpdateSchema.safeParse({ delayHours: 3 }).success).toBe(false);
    expect(INACTIVITY_CHECK_CONFIG.defaultDelayHours).toBe(12);
  });
});
