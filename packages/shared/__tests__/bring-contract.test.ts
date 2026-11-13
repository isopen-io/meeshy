/**
 * #13936 — le contrat du Bring que lisent les trois clients, et la nature de son
 * autorisation (#14407, écart E9 de l'analyse de conformité #13942).
 */
import { describe, expect, it } from 'vitest';
import {
  BRING_ERROR_CODES,
  BRING_PUSH_TYPES,
  BRING_STOP_REASONS,
  bringAvailabilitySchema,
  bringPushDataSchema,
  bringRingEventSchema,
  bringSentSchema,
  bringStoppedEventSchema,
  relationPersonSettingsUpdateSchema,
} from '../types/bring';
import { SERVER_EVENTS } from '../types/socketio-events';
import { NOTIFICATION_PREFERENCE_DEFAULTS, NotificationPreferenceSchema } from '../types/preferences/notification';
import {
  RELATION_CONSENT_FEATURES,
  RELATION_EMITTER_CONSENT_FEATURES,
  RELATION_RECEPTION_PREFERENCE_FEATURES,
  RELATION_THRESHOLDS,
} from '../utils/relation-levels';
import { resolveRelationAccess } from '../utils/relation-access';

const base = {
  viewerId: 'a'.repeat(24),
  targetId: 'b'.repeat(24),
  sharesCommunity: false,
  blockedEitherWay: false,
  viewerMinor: 'unknown',
  targetMinor: 'unknown',
} as const;

describe('le Bring et le talkie sont des PRÉFÉRENCES DE RÉCEPTION, l’écoute et la position des CONSENTEMENTS', () => {
  it('les deux natures sont disjointes, et leur union est exactement ce que la loi soumet à `consent`', () => {
    expect([...RELATION_RECEPTION_PREFERENCE_FEATURES].sort()).toEqual(['bring', 'talkie']);
    expect([...RELATION_RECEPTION_PREFERENCE_FEATURES].some((f) => RELATION_EMITTER_CONSENT_FEATURES.has(f))).toBe(false);
    expect([...RELATION_CONSENT_FEATURES].sort()).toEqual(
      [...RELATION_RECEPTION_PREFERENCE_FEATURES, ...RELATION_EMITTER_CONSENT_FEATURES].sort(),
    );
  });

  it('une préférence de réception non coupée se traduit en `granted` : le Bring s’ouvre dès Ami', () => {
    const verdict = resolveRelationAccess({ ...base, grantedByViewer: 'FRIEND', grantedByTarget: 'FRIEND', feature: 'bring', consent: 'granted' });
    expect(verdict).toMatchObject({ allowed: true, effectiveLevel: 'FRIEND' });
  });

  it('coupée, elle ferme, sous la raison `consent` (que la passerelle sert en BRING_BLOCKED)', () => {
    const verdict = resolveRelationAccess({ ...base, grantedByViewer: 'BLOOD', grantedByTarget: 'BLOOD', feature: 'bring', consent: 'refused' });
    expect(verdict).toMatchObject({ allowed: false, reason: 'consent' });
  });

  it('l’interrupteur global « Recevoir des Bring » existe, et un document antérieur se lit « reçu »', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.bringEnabled).toBe(true);
    expect(NotificationPreferenceSchema.parse({}).bringEnabled).toBe(true);
    expect(NotificationPreferenceSchema.parse({ bringEnabled: false }).bringEnabled).toBe(false);
  });
});

describe('le contrat du Bring', () => {
  it('les quotas de D-3 : Ami 1, Proche 3, Sang 30, Atome illimité', () => {
    expect(RELATION_THRESHOLDS.bring.perDay).toEqual({ FRIEND: 1, CLOSE: 3, BLOOD: 30, ATOM: null });
  });

  it('les événements suivent entity:action-word et sont déclarés', () => {
    expect(SERVER_EVENTS.BRING_RING).toBe('bring:ring');
    expect(SERVER_EVENTS.BRING_STOPPED).toBe('bring:stopped');
  });

  it('aucune raison d’arrêt ne dit « bloqué » : un blocage n’est annoncé à personne', () => {
    expect(BRING_STOP_REASONS).toEqual(['recipient', 'sender']);
  });

  it('les codes de refus sont ceux de D-3 et du quota', () => {
    expect(Object.values(BRING_ERROR_CODES).sort()).toEqual(
      ['BRING_BLOCKED', 'BRING_DISABLED', 'BRING_NOT_ALLOWED', 'BRING_NOT_FOUND', 'BRING_QUOTA_EXCEEDED', 'BRING_UNAVAILABLE'],
    );
    expect(BRING_PUSH_TYPES).toEqual({ RING: 'bring', STOPPED: 'bring_stopped' });
  });

  it('un client plus ancien lit une passerelle plus récente : les champs inconnus sont retirés', () => {
    const extra = { futur: 1 };
    const at = '2026-11-02T10:00:00.000Z';
    expect(bringAvailabilitySchema.parse({ userId: 'u', available: true, perDay: 3, remainingToday: 2, resetsAt: at, ...extra })).not.toHaveProperty('futur');
    expect(bringSentSchema.parse({ bringId: 'b', toUserId: 'u', sentAt: at, expiresAt: at, perDay: null, remainingToday: null, ...extra })).not.toHaveProperty('futur');
    expect(bringRingEventSchema.parse({ bringId: 'b', fromUserId: 'f', toUserId: 'u', sentAt: at, expiresAt: at, ...extra })).not.toHaveProperty('futur');
    expect(bringStoppedEventSchema.parse({ bringId: 'b', fromUserId: 'f', toUserId: 'u', reason: 'recipient', stoppedAt: at, ...extra })).not.toHaveProperty('futur');
  });

  it('la charge push porte des chaînes seulement — aucun audio, aucune position', () => {
    const keys = Object.keys(bringPushDataSchema.shape).sort();
    expect(keys).toEqual(['body', 'bringId', 'expiresAt', 'fromAvatar', 'fromName', 'fromUserId', 'sentAt', 'stopLabel', 'title', 'type']);
  });

  it('le réglage par personne refuse un réglage qu’il ne sait pas tenir', () => {
    expect(relationPersonSettingsUpdateSchema.safeParse({ bringBlocked: true }).success).toBe(true);
    expect(relationPersonSettingsUpdateSchema.safeParse({ bringBlocked: true, ghost: false }).success).toBe(false);
    expect(relationPersonSettingsUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('#14401 — un partage consenti au rituel se RETIRE par le réglage ; son accord hors rituel est jugé par la passerelle (#16642)', () => {
    expect(relationPersonSettingsUpdateSchema.safeParse({ locationShared: false }).success).toBe(true);
    expect(
      relationPersonSettingsUpdateSchema.safeParse({ listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false }).success,
    ).toBe(true);
    // Le CORPS accepte l'accord (#16642) : c'est la passerelle qui le réserve aux comptes de l'équipe, par la loi.
    expect(relationPersonSettingsUpdateSchema.safeParse({ locationShared: true }).success).toBe(true);
    // Mêmes refus sur la route, qui déclare `{ enum: [false] }` sans `type` pour qu'AJV ne coerce rien
    // (`relation-settings-withdraw.test.ts`, audit #14535 constat 4).
    [null, 0, 'false'].forEach((value) =>
      expect(relationPersonSettingsUpdateSchema.safeParse({ proximityShared: value }).success).toBe(false));
    expect(relationPersonSettingsUpdateSchema.safeParse({ bringBlocked: true, locationShared: false }).success).toBe(true);
  });
});
