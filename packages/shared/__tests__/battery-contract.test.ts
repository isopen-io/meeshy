import { describe, expect, it } from 'vitest';
import {
  BATTERY_CONFIG,
  BATTERY_ERROR_CODES,
  batteryAnnouncementSchema,
  batteryChangedEventDataSchema,
  batteryClearedEventDataSchema,
  batteryPullPayloadSchema,
  batteryPullRequestedEventDataSchema,
  batteryReaderStateSchema,
  batteryReportSchema,
  batterySnapshotSchema,
  batteryEmitterSettingsUpdateSchema,
  batteryPersonSettingsUpdateSchema,
  BATTERY_RECEIVE_MODES,
  BATTERY_DEFAULT_RECEIVE_MODE,
} from '../types/battery';
import { BATTERY_CLIENT_EVENTS, BATTERY_SERVER_EVENTS } from '../types/socketio-events/battery-event-names';

const USER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AT = '2026-11-15T10:00:00.000Z';

const report = (over: Record<string, unknown> = {}) => ({ level: 28, charging: false, lowPower: true, measuredAt: AT, ...over });
const state = (over: Record<string, unknown> = {}) => ({
  userId: USER,
  phase: 'low',
  level: 28,
  charging: false,
  lowPower: true,
  measuredAt: AT,
  ...over,
});

describe('le relevé de l\'émetteur — battery:report', () => {
  it('accepte un relevé complet, avec ou sans nom d\'appareil', () => {
    expect(batteryReportSchema.parse(report())).toEqual(report());
    expect(batteryReportSchema.parse(report({ deviceLabel: ' iPhone de Léa ' })).deviceLabel).toBe('iPhone de Léa');
  });

  it.each([
    ['un niveau hors 0..100', report({ level: 101 })],
    ['un niveau négatif', report({ level: -1 })],
    ['un niveau fractionnaire', report({ level: 27.5 })],
    ['une date illisible', report({ measuredAt: 'hier' })],
    ['un champ en trop', report({ conversationId: 'x' })],
    ['un nom d\'appareil trop long', report({ deviceLabel: 'x'.repeat(61) })],
    ['un booléen manquant', { level: 28, lowPower: false, measuredAt: AT }],
  ])('refuse %s', (_label, payload) => {
    expect(batteryReportSchema.safeParse(payload).success).toBe(false);
  });
});

describe('le relevé à la demande — battery:pull', () => {
  it('nomme une personne par son identifiant, rien d\'autre', () => {
    expect(batteryPullPayloadSchema.parse({ userId: USER })).toEqual({ userId: USER });
    expect(batteryPullPayloadSchema.safeParse({ userId: 'moi' }).success).toBe(false);
    expect(batteryPullPayloadSchema.safeParse({ userId: USER, level: 3 }).success).toBe(false);
  });

  it('demande à l\'émetteur de relever, sans dire qui demande', () => {
    expect(batteryPullRequestedEventDataSchema.parse({ requestedAt: AT })).toEqual({ requestedAt: AT });
    expect(batteryPullRequestedEventDataSchema.safeParse({ requestedAt: AT, requestedBy: USER }).success).toBe(false);
  });
});

describe('ce que reçoit un lecteur', () => {
  it('un état servi porte le détail, l\'estimation et l\'appareil quand ils existent', () => {
    expect(batteryReaderStateSchema.parse(state({ estimatedMinutes: 42, deviceLabel: 'Pixel' }))).toMatchObject({ estimatedMinutes: 42 });
    expect(batteryReaderStateSchema.parse(state())).not.toHaveProperty('estimatedMinutes');
  });

  it('un état hors épisode n\'est jamais servi', () => {
    expect(batteryReaderStateSchema.safeParse(state({ phase: 'normal' })).success).toBe(false);
  });

  it('une annonce dit son palier ; l\'événement la porte seulement quand la SyncPill doit défiler', () => {
    const announcement = { kind: 'threshold', level: 18, threshold: 20, at: AT };
    expect(batteryAnnouncementSchema.parse(announcement)).toEqual(announcement);
    expect(batteryAnnouncementSchema.safeParse({ ...announcement, kind: 'message' }).success).toBe(false);
    expect(batteryChangedEventDataSchema.parse({ userId: USER, state: state(), announcement })).toMatchObject({ announcement });
    expect(batteryChangedEventDataSchema.parse({ userId: USER, state: state() })).not.toHaveProperty('announcement');
  });

  it('la clôture fait disparaître l\'icône, avec ou sans annonce', () => {
    expect(batteryClearedEventDataSchema.parse({ userId: USER })).toEqual({ userId: USER });
    expect(
      batteryClearedEventDataSchema.parse({ userId: USER, announcement: { kind: 'recharged', level: 100, at: AT } }).announcement?.kind,
    ).toBe('recharged');
  });

  it('une annonce d\'un genre que ce client ignore est lâchée, l\'état reste lu', () => {
    const parsed = batteryChangedEventDataSchema.parse({ userId: USER, state: state(), announcement: { kind: 'overheating', level: 28, at: AT } });
    expect(parsed.announcement).toBeUndefined();
    expect(parsed.state.level).toBe(28);
  });

  it('le rattrapage REST rend les états servis', () => {
    expect(batterySnapshotSchema.parse({ items: [state()] }).items).toHaveLength(1);
  });

  it('un client plus ancien que le serveur lit un état portant un champ qu\'il ne connaît pas', () => {
    expect(batteryReaderStateSchema.safeParse(state({ temperature: 31 })).success).toBe(true);
  });
});

describe('les noms et la configuration', () => {
  it('suivent la convention entity:action-word, avec des tirets', () => {
    expect(BATTERY_CLIENT_EVENTS).toEqual({ BATTERY_REPORT: 'battery:report', BATTERY_PULL: 'battery:pull' });
    expect(BATTERY_SERVER_EVENTS).toEqual({
      BATTERY_CHANGED: 'battery:changed',
      BATTERY_CLEARED: 'battery:cleared',
      BATTERY_PULL_REQUESTED: 'battery:pull-requested',
    });
  });

  it('porte les seuils décidés par le porteur', () => {
    expect(BATTERY_CONFIG).toEqual({
      lowThreshold: 30,
      steps: [25, 20, 15, 10],
      criticalThreshold: 5,
      closeAbove: 35,
      rechargedUnpluggedAbove: 80,
      fullLevel: 100,
      offAfterMinutes: 10,
      resumeWithinMinutes: 30,
      conversationWindowMinutes: 15,
      pullCooldownMinutes: 5,
      stateTtlSeconds: 86_400,
    });
  });

  it('nomme ses refus', () => {
    expect(Object.values(BATTERY_ERROR_CODES).every((code) => code.startsWith('BATTERY_'))).toBe(true);
  });
});

describe('les réglages de la batterie', () => {
  it('le réglage global ne porte que sharingEnabled, booléen strict', () => {
    expect(batteryEmitterSettingsUpdateSchema.safeParse({ sharingEnabled: false }).success).toBe(true);
    expect(batteryEmitterSettingsUpdateSchema.safeParse({ sharingEnabled: 'false' }).success).toBe(false);
    expect(batteryEmitterSettingsUpdateSchema.safeParse({ sharingEnabled: true, extra: 1 }).success).toBe(false);
  });

  it('le réglage par personne exige au moins un champ et refuse un mode inconnu', () => {
    expect(batteryPersonSettingsUpdateSchema.safeParse({ shared: true }).success).toBe(true);
    expect(batteryPersonSettingsUpdateSchema.safeParse({ receive: 'critical' }).success).toBe(true);
    expect(batteryPersonSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(batteryPersonSettingsUpdateSchema.safeParse({ receive: 'loud' }).success).toBe(false);
    expect(batteryPersonSettingsUpdateSchema.safeParse({ shared: null }).success).toBe(false);
  });

  it('les modes de réception sont tous, critique, SyncPill, rien — tous par défaut', () => {
    expect(BATTERY_RECEIVE_MODES).toEqual(['all', 'critical', 'pill', 'none']);
    expect(BATTERY_DEFAULT_RECEIVE_MODE).toBe('all');
  });
});
