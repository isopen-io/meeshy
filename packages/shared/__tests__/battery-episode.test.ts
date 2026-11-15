import { describe, expect, it } from 'vitest';
import casesFile from '../fixtures/battery-episode-cases.json';
import { BATTERY_CONFIG, BATTERY_ANNOUNCEMENT_KINDS, type BatteryAnnouncementKind } from '../types/battery-constants';
import {
  batteryEpisodeStep,
  batteryEstimatedMinutes,
  batteryReaderChannel,
  batteryReaderInConversation,
  batteryReaderState,
  type BatteryEpisodeState,
  type BatteryReading,
  type BatteryStepInput,
} from '../utils/battery-episode';
import { resolveEmitterConsent, type StoredEmitterConsent } from '../utils/relation-emitter-consent';
import type { RelationFeature } from '../utils/relation-levels';
import type { RelationLevel } from '../types/relation';

type Step = { readonly input: BatteryStepInput; readonly expect: { readonly phase: string; readonly announcements: readonly unknown[] } };
type CaseFile = {
  readonly config: unknown;
  readonly episodes: ReadonlyArray<{ readonly id: string; readonly steps: readonly Step[] }>;
  readonly channels: ReadonlyArray<{ readonly kind: BatteryAnnouncementKind; readonly inConversation: boolean; readonly receivedCritical: boolean; readonly expected: string }>;
  readonly consent: ReadonlyArray<{ readonly feature: RelationFeature; readonly stored: StoredEmitterConsent; readonly effectiveLevel: RelationLevel; readonly globallyDisabled?: boolean; readonly expected: string }>;
  readonly estimates: ReadonlyArray<{ readonly id: string; readonly anchor: BatteryReading | null; readonly current: BatteryReading; readonly expected: number | null }>;
  readonly conversation: ReadonlyArray<{ readonly id: string; readonly now: string; readonly roomOpen: boolean; readonly lastExchangeAt: string | null; readonly awaitingReply: boolean; readonly expected: boolean }>;
};

const file = casesFile as unknown as CaseFile;
const USER = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const replay = (steps: readonly Step[]) =>
  steps.reduce<{ readonly state: BatteryEpisodeState | null; readonly seen: ReadonlyArray<{ readonly phase: string; readonly announcements: readonly unknown[] }> }>(
    (acc, step) => {
      const next = batteryEpisodeStep(acc.state, step.input, BATTERY_CONFIG);
      return { state: next.state, seen: [...acc.seen, { phase: next.state.phase, announcements: next.announcements }] };
    },
    { state: null, seen: [] },
  );

describe('fixtures partagées — l\'oracle écrit à la main est rejoué contre les fonctions TS', () => {
  it('sont écrites avec la configuration en vigueur', () => {
    expect(file.config).toEqual(BATTERY_CONFIG);
  });

  it('couvrent chaque genre d\'annonce et chaque canal de chaque genre', () => {
    const announced = new Set(file.episodes.flatMap((c) => c.steps.flatMap((s) => s.expect.announcements.map((a) => (a as { kind: string }).kind))));
    expect([...announced].sort()).toEqual([...BATTERY_ANNOUNCEMENT_KINDS].sort());
    expect(file.channels).toHaveLength(BATTERY_ANNOUNCEMENT_KINDS.length * 4);
  });

  it.each(file.episodes.map((c) => [c.id, c] as const))('épisode %s', (_id, c) => {
    expect(replay(c.steps).seen).toEqual(c.steps.map((s) => s.expect));
  });

  it.each(file.channels.map((c) => [`${c.kind} conv=${c.inConversation} critique=${c.receivedCritical}`, c] as const))('canal %s', (_l, c) => {
    expect(batteryReaderChannel(c.kind, c.inConversation, c.receivedCritical)).toBe(c.expected);
  });

  it.each(file.consent.map((c) => [`${c.feature} ${String(c.stored)} ${c.effectiveLevel}`, c] as const))('consentement %s', (_l, c) => {
    expect(resolveEmitterConsent({ feature: c.feature, stored: c.stored, effectiveLevel: c.effectiveLevel, globallyDisabled: c.globallyDisabled })).toBe(c.expected);
  });

  it.each(file.estimates.map((c) => [c.id, c] as const))('estimation %s', (_id, c) => {
    expect(batteryEstimatedMinutes(c.anchor, c.current)).toBe(c.expected);
  });

  it.each(file.conversation.map((c) => [c.id, c] as const))('en conversation : %s', (_id, c) => {
    const { expected, id: _, ...input } = c;
    expect(batteryReaderInConversation(input, BATTERY_CONFIG)).toBe(expected);
  });
});

describe('batteryEpisodeStep — la configuration décide, jamais un seuil en dur', () => {
  it('un seuil relevé à 40 alerte dès 40', () => {
    const config = { ...BATTERY_CONFIG, lowThreshold: 40, closeAbove: 45 };
    const step = batteryEpisodeStep(null, { kind: 'reading', level: 38, charging: false, lowPower: false, measuredAt: '2026-11-15T10:00:00.000Z' }, config);
    expect(step.announcements.map((a) => a.kind)).toEqual(['low']);
  });

  it('est pure : l\'état précédent n\'est jamais modifié', () => {
    const first = batteryEpisodeStep(null, { kind: 'reading', level: 28, charging: false, lowPower: false, measuredAt: '2026-11-15T10:00:00.000Z' }, BATTERY_CONFIG);
    const frozen = JSON.parse(JSON.stringify(first.state));
    batteryEpisodeStep(first.state, { kind: 'reading', level: 3, charging: false, lowPower: false, measuredAt: '2026-11-15T10:01:00.000Z' }, BATTERY_CONFIG);
    expect(first.state).toEqual(frozen);
  });
});

describe('batteryReaderState — ce qu\'un lecteur voit', () => {
  const reading = { level: 12, charging: false, lowPower: true, measuredAt: '2026-11-15T10:00:00.000Z' };

  it('rien hors épisode', () => {
    const state = batteryEpisodeStep(null, { kind: 'reading', ...reading, level: 60 }, BATTERY_CONFIG).state;
    expect(batteryReaderState({ userId: USER, state })).toBeNull();
  });

  it('le détail pendant l\'épisode, avec l\'appareil et l\'estimation quand ils existent', () => {
    const state = batteryEpisodeStep(null, { kind: 'reading', ...reading }, BATTERY_CONFIG).state;
    expect(batteryReaderState({ userId: USER, state, deviceLabel: 'iPhone', estimatedMinutes: 40 })).toEqual({
      userId: USER,
      phase: 'low',
      ...reading,
      estimatedMinutes: 40,
      deviceLabel: 'iPhone',
    });
    expect(batteryReaderState({ userId: USER, state, estimatedMinutes: null })).not.toHaveProperty('estimatedMinutes');
  });
});
