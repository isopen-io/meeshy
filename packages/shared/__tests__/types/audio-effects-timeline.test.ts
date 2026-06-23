import { describe, it, expect } from 'vitest';
import {
  AUDIO_EFFECTS_TIMELINE_VERSION,
  ZERO_EFFECT_PARAMS,
  isValidAudioEffectsTimeline,
  reconstructEffectsStateAt,
  calculateEffectsStats,
  createEmptyTimeline,
} from '../../types/audio-effects-timeline';
import type {
  AudioEffectsTimeline,
  AudioEffectEvent,
} from '../../types/audio-effects-timeline';

// ── factories ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AudioEffectEvent> = {}): AudioEffectEvent {
  return {
    timestamp: 0,
    effectType: 'voice-coder',
    action: 'activate',
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<AudioEffectsTimeline> = {}): AudioEffectsTimeline {
  return {
    version: AUDIO_EFFECTS_TIMELINE_VERSION,
    createdAt: '2024-01-01T00:00:00Z',
    duration: 10000,
    sampleRate: 48000,
    channels: 1,
    events: [],
    ...overrides,
  };
}

// ── constants ──────────────────────────────────────────────────────────────

describe('AUDIO_EFFECTS_TIMELINE_VERSION', () => {
  it('is defined as a string', () => {
    expect(typeof AUDIO_EFFECTS_TIMELINE_VERSION).toBe('string');
    expect(AUDIO_EFFECTS_TIMELINE_VERSION).toBeTruthy();
  });
});

describe('ZERO_EFFECT_PARAMS', () => {
  it('has entries for all four effect types', () => {
    expect(ZERO_EFFECT_PARAMS['voice-coder']).toBeDefined();
    expect(ZERO_EFFECT_PARAMS['baby-voice']).toBeDefined();
    expect(ZERO_EFFECT_PARAMS['demon-voice']).toBeDefined();
    expect(ZERO_EFFECT_PARAMS['back-sound']).toBeDefined();
  });
});

// ── isValidAudioEffectsTimeline ────────────────────────────────────────────

describe('isValidAudioEffectsTimeline', () => {
  it('returns false for null', () => {
    expect(isValidAudioEffectsTimeline(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isValidAudioEffectsTimeline(42)).toBe(false);
    expect(isValidAudioEffectsTimeline('string')).toBe(false);
    expect(isValidAudioEffectsTimeline(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isValidAudioEffectsTimeline({})).toBe(false);
  });

  it('returns false when version is missing', () => {
    expect(isValidAudioEffectsTimeline({ createdAt: 'x', duration: 0, sampleRate: 48000, channels: 1, events: [] })).toBe(false);
  });

  it('returns false when required numeric fields are wrong type', () => {
    expect(isValidAudioEffectsTimeline({ version: '1.0', createdAt: 'x', duration: 'bad', sampleRate: 48000, channels: 1, events: [] })).toBe(false);
  });

  it('returns false when events is not an array', () => {
    expect(isValidAudioEffectsTimeline({ version: '1.0', createdAt: 'x', duration: 0, sampleRate: 48000, channels: 1, events: 'bad' })).toBe(false);
  });

  it('returns false when an event is missing required fields', () => {
    const badEvent = { timestamp: 0, effectType: 'voice-coder' }; // missing action
    expect(isValidAudioEffectsTimeline({ version: '1.0', createdAt: 'x', duration: 0, sampleRate: 48000, channels: 1, events: [badEvent] })).toBe(false);
  });

  it('returns false when an event entry is not an object', () => {
    expect(isValidAudioEffectsTimeline({ version: '1.0', createdAt: 'x', duration: 0, sampleRate: 48000, channels: 1, events: [null] })).toBe(false);
  });

  it('returns true for a valid timeline with no events', () => {
    expect(isValidAudioEffectsTimeline(makeTimeline())).toBe(true);
  });

  it('returns true for a valid timeline with events', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ timestamp: 1000, effectType: 'baby-voice', action: 'activate' })],
    });
    expect(isValidAudioEffectsTimeline(timeline)).toBe(true);
  });
});

// ── createEmptyTimeline ────────────────────────────────────────────────────

describe('createEmptyTimeline', () => {
  it('returns a timeline with zero duration and empty events', () => {
    const t = createEmptyTimeline(48000, 2);
    expect(t.duration).toBe(0);
    expect(t.events).toHaveLength(0);
    expect(t.sampleRate).toBe(48000);
    expect(t.channels).toBe(2);
  });

  it('uses the current AUDIO_EFFECTS_TIMELINE_VERSION', () => {
    const t = createEmptyTimeline(44100, 1);
    expect(t.version).toBe(AUDIO_EFFECTS_TIMELINE_VERSION);
  });

  it('sets createdAt as an ISO timestamp', () => {
    const t = createEmptyTimeline(48000, 1);
    expect(() => new Date(t.createdAt)).not.toThrow();
    expect(new Date(t.createdAt).toISOString()).toBe(t.createdAt);
  });
});

// ── reconstructEffectsStateAt ─────────────────────────────────────────────

describe('reconstructEffectsStateAt', () => {
  it('returns all effects disabled for an empty timeline', () => {
    const snapshot = reconstructEffectsStateAt(makeTimeline(), 5000);
    expect(snapshot.timestamp).toBe(5000);
    expect(snapshot.effects).toHaveLength(4);
    snapshot.effects.forEach(effect => expect(effect.enabled).toBe(false));
  });

  it('activates an effect at its event timestamp', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ timestamp: 1000, effectType: 'baby-voice', action: 'activate' })],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 2000);
    const baby = snapshot.effects.find(e => e.effectType === 'baby-voice');
    expect(baby?.enabled).toBe(true);
  });

  it('does not activate an effect if the event is beyond targetTimestamp', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ timestamp: 5000, effectType: 'baby-voice', action: 'activate' })],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 4999);
    const baby = snapshot.effects.find(e => e.effectType === 'baby-voice');
    expect(baby?.enabled).toBe(false);
  });

  it('deactivates an effect after its deactivate event', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({ timestamp: 1000, effectType: 'voice-coder', action: 'activate' }),
        makeEvent({ timestamp: 3000, effectType: 'voice-coder', action: 'deactivate' }),
      ],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 4000);
    const coder = snapshot.effects.find(e => e.effectType === 'voice-coder');
    expect(coder?.enabled).toBe(false);
  });

  it('updates params on update action when effect is active', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({ timestamp: 0, effectType: 'demon-voice', action: 'activate' }),
        makeEvent({
          timestamp: 1000,
          effectType: 'demon-voice',
          action: 'update',
          params: { pitch: 5 },
        }),
      ],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 2000);
    const demon = snapshot.effects.find(e => e.effectType === 'demon-voice');
    expect(demon?.enabled).toBe(true);
    expect((demon?.params as { pitch: number }).pitch).toBe(5);
  });

  it('ignores update action when effect is disabled', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({
          timestamp: 1000,
          effectType: 'demon-voice',
          action: 'update',
          params: { pitch: 10 },
        }),
      ],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 2000);
    const demon = snapshot.effects.find(e => e.effectType === 'demon-voice');
    expect(demon?.enabled).toBe(false);
  });

  it('uses provided params on activate if present', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({
          timestamp: 0,
          effectType: 'baby-voice',
          action: 'activate',
          params: { pitch: 3, formant: 1.5, breathiness: 0.2 },
        }),
      ],
    });
    const snapshot = reconstructEffectsStateAt(timeline, 1000);
    const baby = snapshot.effects.find(e => e.effectType === 'baby-voice');
    expect((baby?.params as { pitch: number }).pitch).toBe(3);
  });
});

// ── calculateEffectsStats ──────────────────────────────────────────────────

describe('calculateEffectsStats', () => {
  it('returns zero totalActiveTime for empty events', () => {
    const stats = calculateEffectsStats(makeTimeline());
    expect(stats.totalActiveTime).toBe(0);
    expect(Object.keys(stats.byEffect)).toHaveLength(0);
  });

  it('calculates duration for a single activation + deactivation', () => {
    const timeline = makeTimeline({
      duration: 10000,
      events: [
        makeEvent({ timestamp: 1000, effectType: 'voice-coder', action: 'activate' }),
        makeEvent({ timestamp: 4000, effectType: 'voice-coder', action: 'deactivate' }),
      ],
    });
    const stats = calculateEffectsStats(timeline);
    expect(stats.byEffect['voice-coder']?.totalDuration).toBe(3000);
    expect(stats.totalActiveTime).toBe(3000);
  });

  it('extends duration to timeline end for open activation', () => {
    const timeline = makeTimeline({
      duration: 10000,
      events: [
        makeEvent({ timestamp: 7000, effectType: 'baby-voice', action: 'activate' }),
      ],
    });
    const stats = calculateEffectsStats(timeline);
    expect(stats.byEffect['baby-voice']?.totalDuration).toBe(3000);
    expect(stats.totalActiveTime).toBe(3000);
  });

  it('counts activation count correctly', () => {
    const timeline = makeTimeline({
      duration: 20000,
      events: [
        makeEvent({ timestamp: 0, effectType: 'demon-voice', action: 'activate' }),
        makeEvent({ timestamp: 2000, effectType: 'demon-voice', action: 'deactivate' }),
        makeEvent({ timestamp: 5000, effectType: 'demon-voice', action: 'activate' }),
        makeEvent({ timestamp: 8000, effectType: 'demon-voice', action: 'deactivate' }),
      ],
    });
    const stats = calculateEffectsStats(timeline);
    expect(stats.byEffect['demon-voice']?.activationCount).toBe(2);
    expect(stats.byEffect['demon-voice']?.totalDuration).toBe(5000);
  });

  it('counts parameter changes', () => {
    const timeline = makeTimeline({
      duration: 10000,
      events: [
        makeEvent({ timestamp: 0, effectType: 'voice-coder', action: 'activate' }),
        makeEvent({ timestamp: 1000, effectType: 'voice-coder', action: 'update', params: { pitch: 1 } }),
        makeEvent({ timestamp: 2000, effectType: 'voice-coder', action: 'update', params: { pitch: 2 } }),
      ],
    });
    const stats = calculateEffectsStats(timeline);
    expect(stats.byEffect['voice-coder']?.parameterChanges).toBe(2);
  });

  it('tracks totalActiveTime correctly when multiple effects overlap', () => {
    const timeline = makeTimeline({
      duration: 10000,
      events: [
        makeEvent({ timestamp: 0, effectType: 'voice-coder', action: 'activate' }),
        makeEvent({ timestamp: 2000, effectType: 'baby-voice', action: 'activate' }),
        makeEvent({ timestamp: 3000, effectType: 'voice-coder', action: 'deactivate' }),
        makeEvent({ timestamp: 5000, effectType: 'baby-voice', action: 'deactivate' }),
      ],
    });
    const stats = calculateEffectsStats(timeline);
    // totalActiveTime starts at 0 (voice-coder activates), extends until baby-voice deactivates at 5000
    expect(stats.totalActiveTime).toBe(5000);
  });
});
