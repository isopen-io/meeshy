import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import type { SocialEventV2Input, VisibleTarget } from '@/lib/api/social-events-v2-types';

import { captureSurfaceOf, startContentCaptureReports } from './content-capture';

/**
 * LA CAPTURE D'UN CONTENU (#10508, décision § 5) — dans la coque Android
 * seulement (Android 14+ : capture ; 15+ : enregistrement ou recopie). On
 * enregistre QU'il y a eu capture et ce qui était à l'écran — jamais l'image.
 * Le navigateur ne détecte rien et n'émet rien.
 */
type Listener = (data: unknown) => void;

function shell(state: unknown = { screenshotDetection: true, recordingDetection: true, recording: false }) {
  const listeners = new Map<string, Listener>();
  const coque: CoqueNative = {
    PluginHeaders: [{ name: 'MeeshyScreenGuard', methods: [{ name: 'getState' }] }],
    getPlatform: () => 'android',
    addListener: (plugin, event, run) => {
      expect(plugin).toBe('MeeshyScreenGuard');
      listeners.set(event, run);
      return { remove: async () => void listeners.delete(event) };
    },
    nativePromise: async () => state,
  };
  return { coque, fire: (event: string, data: unknown = {}) => listeners.get(event)?.({ ...(data as object) }), listeners };
}

const TARGETS: readonly VisibleTarget[] = [{ kind: 'post', id: 'a'.repeat(24), visibleFraction: 1 }];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startContentCaptureReports', () => {
  test('une capture d’écran émet screen_capture/screenshot avec ce qui était à l’écran, et rien d’autre', () => {
    const events: SocialEventV2Input[] = [];
    const s = shell();
    startContentCaptureReports({ coque: s.coque, record: (e) => events.push(e), collect: () => ({ surface: 'feed', visibleTargets: TARGETS }), now: () => 0, onDetection: () => undefined });
    s.fire('screenCaptured');
    expect(events).toEqual([{ type: 'screen_capture', action: 'screenshot', surface: 'feed', visibleTargets: TARGETS, captureKind: 'screenshot' }]);
  });

  test('un enregistrement : démarrage avec l’écran visible, arrêt avec sa durée', () => {
    const events: SocialEventV2Input[] = [];
    let clock = 1000;
    const s = shell();
    startContentCaptureReports({ coque: s.coque, record: (e) => events.push(e), collect: () => ({ surface: 'reels', visibleTargets: TARGETS }), now: () => clock, onDetection: () => undefined });
    s.fire('recordingChanged', { recording: true });
    clock = 13_500;
    s.fire('recordingChanged', { recording: false });
    expect(events).toEqual([
      { type: 'screen_capture', action: 'recording_started', surface: 'reels', visibleTargets: TARGETS, captureKind: 'recording_or_mirroring' },
      { type: 'screen_capture', action: 'recording_stopped', surface: 'reels', visibleTargets: TARGETS, captureKind: 'recording_or_mirroring', recordingMs: 12_500 },
    ]);
  });

  test('dans une conversation, rien : l’annonce des éphémères (#9617) y garde la main', () => {
    const events: SocialEventV2Input[] = [];
    const s = shell();
    startContentCaptureReports({ coque: s.coque, record: (e) => events.push(e), collect: () => ({ surface: null, visibleTargets: TARGETS }), now: () => 0, onDetection: () => undefined });
    s.fire('screenCaptured');
    expect(events).toEqual([]);
  });

  test('la coque dit ce qu’elle détecte : les capacités du contexte la suivent', async () => {
    const seen: unknown[] = [];
    const s = shell({ screenshotDetection: true, recordingDetection: false, recording: false });
    startContentCaptureReports({ coque: s.coque, record: () => undefined, collect: () => ({ surface: 'feed', visibleTargets: [] }), now: () => 0, onDetection: (d) => seen.push(d) });
    await settle();
    expect(seen).toEqual([{ screenshot: true, recording: false }]);
  });

  test('sans le greffon (navigateur, coque ancienne), aucun screen_capture et rien d’écouté', () => {
    const events: SocialEventV2Input[] = [];
    const stop = startContentCaptureReports({ coque: undefined, record: (e) => events.push(e), collect: () => ({ surface: 'feed', visibleTargets: TARGETS }), now: () => 0, onDetection: () => undefined });
    stop();
    expect(events).toEqual([]);
    const bare: CoqueNative = { getPlatform: () => 'android', addListener: () => { throw new Error('ne doit pas écouter'); } };
    expect(() => startContentCaptureReports({ coque: bare, record: (e) => events.push(e), collect: () => ({ surface: 'feed', visibleTargets: TARGETS }), now: () => 0, onDetection: () => undefined })).not.toThrow();
    expect(events).toEqual([]);
  });

  test('l’arrêt retire les écoutes', () => {
    const s = shell();
    const stop = startContentCaptureReports({ coque: s.coque, record: () => undefined, collect: () => ({ surface: 'feed', visibleTargets: [] }), now: () => 0, onDetection: () => undefined });
    stop();
    expect(s.listeners.size).toBe(0);
  });
});

describe('captureSurfaceOf — l’écran à l’instant de la capture', () => {
  test('les écrans de contenu ; jamais une conversation', () => {
    expect(captureSurfaceOf('/feed')).toBe('feed');
    expect(captureSurfaceOf('/post/abc')).toBe('detail');
    expect(captureSurfaceOf('/reels')).toBe('reels');
    expect(captureSurfaceOf('/reel/abc')).toBe('reels');
    expect(captureSurfaceOf('/story/abc')).toBe('story');
    expect(captureSurfaceOf('/u/alice')).toBe('profile');
    expect(captureSurfaceOf('/hashtag/paris')).toBe('hashtag');
    expect(captureSurfaceOf('/me/bookmarks')).toBe('bookmarks');
    expect(captureSurfaceOf('/c/123')).toBeNull();
    expect(captureSurfaceOf('/chats')).toBeNull();
    expect(captureSurfaceOf('/settings')).toBeNull();
  });
});
