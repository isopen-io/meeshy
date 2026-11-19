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
  FALL_CONSENT_MINIMUM_AGE,
  FALL_CONSENT_VERSION,
  FALL_DETECTION_CONFIG,
  fallClearedEventDataSchema,
  fallConsentUpdateSchema,
  fallDetectedEventDataSchema,
  fallPersonSettingsUpdateSchema,
  fallReportSchema,
  fallSnapshotSchema,
  SAFETY_ALERT_CLEARED_PUSH_TYPE,
  SAFETY_ALERT_PUSH_TYPE,
} from '../types/fall-detection';
import { SERVER_EVENTS } from '../types/socketio-events';
import {
  fallAnnouncementOf,
  fallReportVerdict,
  fallStep,
  fallTombstoneCovers,
  fallTombstoneExpiresAt,
  fallUrgencyStep,
  isFallConsentCurrent,
  isFallLive,
  servedFall,
  type FallRecord,
} from '../utils/fall-detection';
import { notificationString } from '../utils/notification-strings';

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
  feature: 'health.fall',
  ...over,
});

const USER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const at = (minutes: number, seconds = 0): string => new Date(Date.UTC(2026, 10, 19, 16, 0) + minutes * 60_000 + seconds * 1000).toISOString();

describe('la chute dans la matrice des cercles (#18748)', () => {
  it('ouvre health.fall au seul Sang, consentement par personne accordé par défaut entre Sangs', () => {
    expect(RELATION_FEATURES).toContain('health.fall');
    expect(RELATION_FEATURE_MIN_LEVEL['health.fall']).toBe('BLOOD');
    expect(RELATION_EMITTER_CONSENT_FEATURES.has('health.fall')).toBe(true);
    expect(RELATION_CONSENT_FEATURES.has('health.fall')).toBe(true);
    expect(RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['health.fall']).toBe('BLOOD');
    expect(RELATION_DIRECTED_FEATURES.has('health.fall')).toBe(false);
  });

  it('Sang sans réglage : voit ; Sang retiré : rien ; Proche, même consenti : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD' }), storedConsent: false }).allowed).toBe(false);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ grantedByViewer: 'CLOSE', grantedByTarget: 'CLOSE' }), storedConsent: true }).allowed).toBe(false);
  });

  it('entre deux comptes de l\'équipe, le niveau rendu est Sang (#16623) ; un administrateur face à un utilisateur : rien', () => {
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ANALYST', targetRole: 'ADMIN' }), storedConsent: null }).allowed).toBe(true);
    expect(resolveRelationAccessWithStoredConsent({ ...pair({ viewerRole: 'ADMIN', targetRole: 'USER' }), storedConsent: null }).allowed).toBe(false);
  });
});

describe('le contrat de la chute', () => {
  it('les délais de l\'épisode sont ceux de la décision', () => {
    expect(FALL_DETECTION_CONFIG).toEqual({ episodeTtlMinutes: 360, maxReportAgeMinutes: 30, maxFutureSkewMinutes: 2, dedupeWindowMinutes: 10, maxUrgentEpisodesPerDay: 3 });
    expect(FALL_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(FALL_CONSENT_MINIMUM_AGE).toBe(15);
  });

  it('le rapport ne porte qu\'un instant : toute autre donnée de santé est refusée', () => {
    expect(fallReportSchema.safeParse({ detectedAt: at(0) }).success).toBe(true);
    expect(fallReportSchema.safeParse({ detectedAt: at(0), heartRate: 120 }).success).toBe(false);
    expect(fallReportSchema.safeParse({ detectedAt: 'hier' }).success).toBe(false);
    expect(fallReportSchema.safeParse({}).success).toBe(false);
  });

  it('l\'accord est explicite et daté par sa version ; son retrait ne porte rien d\'autre', () => {
    expect(fallConsentUpdateSchema.safeParse({ consented: true, version: FALL_CONSENT_VERSION }).success).toBe(true);
    expect(fallConsentUpdateSchema.safeParse({ consented: true }).success).toBe(false);
    expect(fallConsentUpdateSchema.safeParse({ consented: false }).success).toBe(true);
    expect(fallConsentUpdateSchema.safeParse({ consented: false, version: FALL_CONSENT_VERSION }).success).toBe(false);
    expect(fallPersonSettingsUpdateSchema.safeParse({ shared: false }).success).toBe(true);
    expect(fallPersonSettingsUpdateSchema.safeParse({ shared: false, extra: 1 }).success).toBe(false);
  });

  it('les événements descendent dans user:<lecteur>, et les schémas tolèrent une annonce ou une raison inconnue', () => {
    expect(SERVER_EVENTS.FALL_DETECTED).toBe('fall:detected');
    expect(SERVER_EVENTS.FALL_CLEARED).toBe('fall:cleared');
    const state = { userId: USER, detectedAt: at(42), expiresAt: at(402) };
    expect(fallDetectedEventDataSchema.parse({ userId: USER, state, announcement: { kind: 'autre', at: at(42) } })).toEqual({ userId: USER, state, announcement: undefined });
    expect(fallClearedEventDataSchema.parse({ userId: USER, reason: 'responded' })).toEqual({ userId: USER, reason: 'responded' });
    expect(fallClearedEventDataSchema.parse({ userId: USER, reason: 'inconnue' }).reason).toBe('withdrawn');
    expect(fallSnapshotSchema.parse({ items: [state] })).toEqual({ items: [state] });
  });
});

describe('le rapport d\'une chute : son âge, le futur, et l\'épisode', () => {
  it('trop vieille de plus de 30 min, ou plus de 2 min dans le futur : refusée', () => {
    const now = at(60);
    expect(fallReportVerdict(at(30), now)).toBe('accepted');
    expect(fallReportVerdict(at(29, 59), now)).toBe('too-old');
    expect(fallReportVerdict(at(62), now)).toBe('accepted');
    expect(fallReportVerdict(at(62, 1), now)).toBe('in-future');
  });

  it('la première chute ouvre l\'épisode ; une seconde à moins de 10 min ne repousse rien ; au-delà, un épisode neuf', () => {
    const first = fallStep(null, { detectedAt: at(42, 13), at: at(43) });
    expect(first).toEqual({ state: { detectedAt: at(42, 13), openedAt: at(43) }, opened: true });
    const again = fallStep(first.state, { detectedAt: at(51), at: at(51, 30) });
    expect(again).toEqual({ state: first.state, opened: false });
    const older = fallStep(first.state, { detectedAt: at(30), at: at(52) });
    expect(older).toEqual({ state: first.state, opened: false });
    const fresh = fallStep(first.state, { detectedAt: at(52, 14), at: at(53) });
    expect(fresh).toEqual({ state: { detectedAt: at(52, 14), openedAt: at(53) }, opened: true });
  });

  it('un épisode passé sa durée de vie ne compte plus : la chute suivante en ouvre un neuf', () => {
    const record: FallRecord = { detectedAt: at(0), openedAt: at(0) };
    expect(isFallLive(record, at(359))).toBe(true);
    expect(isFallLive(record, at(360))).toBe(false);
    expect(fallStep(record, { detectedAt: at(361), at: at(361) }).opened).toBe(true);
  });

  it('l\'état servi et l\'annonce sont tronqués à la minute : jamais l\'instant exact', () => {
    const record: FallRecord = { detectedAt: at(42, 13), openedAt: at(43) };
    expect(servedFall(USER, record)).toEqual({ userId: USER, detectedAt: at(42), expiresAt: at(402) });
    expect(fallAnnouncementOf(record)).toEqual({ kind: 'detected', at: at(42) });
  });
});

describe('le texte de l\'écran verrouillé ne dit rien de la santé', () => {
  it('titre et corps génériques dans les huit langues, sans « chute »', () => {
    const words = /chute|tomb|fall|caída|queda|sturz|caduta|سقوط|跌倒|santé|health/i;
    for (const lang of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar', 'zh-Hans']) {
      const texts = [
        notificationString(lang, 'fall.alertTitle'),
        notificationString(lang, 'fall.alertBody', { actor: 'Awa', value: '16:42' }),
        notificationString(lang, 'fall.respondedTitle'),
        notificationString(lang, 'fall.respondedBody', { actor: 'Awa' }),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(words);
      }
    }
    expect(notificationString('fr', 'fall.alertTitle')).toBe('⚠️ Alerte de sécurité');
    expect(notificationString('fr', 'fall.alertBody', { actor: 'Awa', value: '16:42' })).toBe('Awa · 16:42 — ouvrez Meeshy');
    expect(notificationString('fr', 'fall.respondedBody', { actor: 'Awa' })).toBe('Awa a répondu');
  });
});

describe('ce qui traverse Apple et Google ne dit rien de la santé (audit #18748, I3)', () => {
  it('les types de push sont neutres', () => {
    expect(SAFETY_ALERT_PUSH_TYPE).toBe('safety_alert');
    expect(SAFETY_ALERT_CLEARED_PUSH_TYPE).toBe('safety_alert_cleared');
    for (const type of [SAFETY_ALERT_PUSH_TYPE, SAFETY_ALERT_CLEARED_PUSH_TYPE]) expect(type).not.toMatch(/fall|chute|health/i);
  });
});

describe('l\'accord ne vaut que sur la version courante du texte (audit #18748, I1)', () => {
  it('daté et à la version courante : valide ; version ancienne, absente, ou sans date : non', () => {
    const consentedAt = new Date('2026-11-19T09:00:00.000Z');
    expect(isFallConsentCurrent({ consentedAt, version: FALL_CONSENT_VERSION })).toBe(true);
    expect(isFallConsentCurrent({ consentedAt, version: '2026-01-01' })).toBe(false);
    expect(isFallConsentCurrent({ consentedAt, version: null })).toBe(false);
    expect(isFallConsentCurrent({ consentedAt: null, version: FALL_CONSENT_VERSION })).toBe(false);
  });
});

describe('la pierre tombale d\'un épisode clos (audit #18748, B2)', () => {
  it('le même rapport, ou un rapport à moins de 10 min, est couvert ; au-delà, non', () => {
    const tomb = { detectedAt: at(42, 13) };
    expect(fallTombstoneCovers(tomb, at(42, 13))).toBe(true);
    expect(fallTombstoneCovers(tomb, at(51))).toBe(true);
    expect(fallTombstoneCovers(tomb, at(30))).toBe(true);
    expect(fallTombstoneCovers(tomb, at(52, 14))).toBe(false);
    expect(fallTombstoneCovers(null, at(42, 13))).toBe(false);
  });

  it('elle vit tant qu\'un rapport du même instant peut encore être accepté', () => {
    expect(fallTombstoneExpiresAt({ detectedAt: at(42, 13) })).toBe(at(72, 13));
  });
});

describe('le plafond des alertes qui percent (audit #18748, I6)', () => {
  it('trois épisodes sur 24 h glissantes percent ; le quatrième est servi sans percer ; passé 24 h, la fenêtre se vide', () => {
    const first = fallUrgencyStep([], at(0));
    expect(first).toEqual({ urgent: true, openings: [at(0)] });
    const third = fallUrgencyStep([at(0), at(10)], at(20));
    expect(third).toEqual({ urgent: true, openings: [at(0), at(10), at(20)] });
    const fourth = fallUrgencyStep(third.openings, at(30));
    expect(fourth.urgent).toBe(false);
    expect(fourth.openings).toEqual([at(0), at(10), at(20), at(30)]);
    expect(fallUrgencyStep(fourth.openings, at(24 * 60 + 11))).toEqual({ urgent: true, openings: [at(20), at(30), at(24 * 60 + 11)] });
  });
});
