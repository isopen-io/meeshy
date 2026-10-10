import { describe, expect, test } from 'bun:test';

import { choreographyPlan } from './choreography';
import type { HapticName } from './haptics';
import { playChoreography, type PlayableAnimation, type PlayableRoot, type PlayableTarget } from './play';

type Call = { readonly keyframes: readonly Keyframe[]; readonly options: KeyframeAnimationOptions; readonly cancelled: () => boolean };

type FakeTarget = PlayableTarget & { readonly calls: Call[]; readonly style: { willChange: string } };

const target = (animatable = true): FakeTarget => {
  const calls: Call[] = [];
  const base = { calls, style: { willChange: '' } };
  if (!animatable) return base;
  return {
    ...base,
    animate: (keyframes, options): PlayableAnimation => {
      let cancelled = false;
      calls.push({ keyframes, options, cancelled: () => cancelled });
      return { finished: Promise.resolve(), cancel: () => void (cancelled = true) };
    },
  };
};

const rootOf = (map: Readonly<Record<string, readonly PlayableTarget[]>>, self: PlayableTarget = target()): PlayableRoot => ({
  ...self,
  querySelectorAll: (selector) => map[selector] ?? [],
});

/** Un ordonnanceur manuel : le temps ne passe que quand le témoin le dit. */
const clock = () => {
  const jobs: { at: number; run: () => void; live: boolean }[] = [];
  let now = 0;
  return {
    schedule: (run: () => void, delayMs: number) => {
      const job = { at: now + delayMs, run, live: true };
      jobs.push(job);
      return () => void (job.live = false);
    },
    advance: (ms: number) => {
      now += ms;
      for (const job of jobs.filter((j) => j.live && j.at <= now).sort((a, b) => a.at - b.at)) {
        job.live = false;
        job.run();
      }
    },
  };
};

describe('playChoreography — le plan rejoué sur des éléments', () => {
  test('chaque cible reçoit ses images clés, avec le délai, la durée et le remplissage du plan', () => {
    const shield = target();
    const root = rootOf({ '[data-game-shield]': [shield] });
    playChoreography(root, 'rank', { reducedMotion: false, haptics: false, schedule: clock().schedule });
    const call = shield.calls[0];
    expect(call?.options).toMatchObject({ duration: 600, delay: 0, fill: 'both' });
    expect(call?.keyframes).toHaveLength(2);
  });

  test('plusieurs éléments sur un même sélecteur : décalés l’un après l’autre (stagger)', () => {
    const a = target();
    const b = target();
    playChoreography(rootOf({ '[data-game-pose]': [a, b] }), 'rank', { reducedMotion: false, haptics: false, schedule: clock().schedule });
    const plan = choreographyPlan('rank');
    const step = plan.steps.find((s) => s.target === '[data-game-pose]');
    expect(a.calls[0]?.options.delay).toBe(step?.delayMs);
    expect(b.calls[0]?.options.delay).toBe((step?.delayMs ?? 0) + (step?.staggerMs ?? 0));
  });

  test('une cible absente, ou sans Web Animations, est sautée sans erreur', () => {
    const mute = target(false);
    expect(() => playChoreography(rootOf({ '[data-game-shield]': [mute] }), 'rank', { reducedMotion: false, schedule: clock().schedule })).not.toThrow();
    expect(() => playChoreography(rootOf({}), 'mint', { reducedMotion: false, schedule: clock().schedule })).not.toThrow();
  });

  test('will-change n’existe que pendant le geste', async () => {
    const shield = target();
    const c = clock();
    const handle = playChoreography(rootOf({ '[data-game-shield]': [shield] }), 'rank', { reducedMotion: false, haptics: false, schedule: c.schedule });
    expect(shield.style.willChange).toBe('transform, opacity');
    c.advance(5000);
    await handle.finished;
    expect(shield.style.willChange).toBe('');
  });

  test('à la fin, les animations sont annulées : l’élément retrouve l’état du DOM', async () => {
    const shield = target();
    const c = clock();
    const handle = playChoreography(rootOf({ '[data-game-shield]': [shield] }), 'rank', { reducedMotion: false, haptics: false, schedule: c.schedule });
    expect(shield.calls[0]?.cancelled()).toBe(false);
    c.advance(5000);
    await handle.finished;
    expect(shield.calls[0]?.cancelled()).toBe(true);
  });

  test('cancel() arrête tout : animations annulées, repères et tapes jamais joués', async () => {
    const shield = target();
    const c = clock();
    const beats: string[] = [];
    const buzz: HapticName[] = [];
    const handle = playChoreography(rootOf({ '[data-game-shield]': [shield] }), 'mint', { reducedMotion: false, schedule: c.schedule, onBeat: (b) => beats.push(b.name), vibrate: (h) => buzz.push(h) });
    handle.cancel();
    c.advance(5000);
    await handle.finished;
    expect(beats).toEqual([]);
    expect(buzz).toEqual([]);
  });

  test('`finished` se résout une fois le plan achevé — jamais avant', async () => {
    const c = clock();
    let done = false;
    const handle = playChoreography(rootOf({}), 'mint', { reducedMotion: false, schedule: c.schedule });
    void handle.finished.then(() => void (done = true));
    c.advance(1000);
    await Promise.resolve();
    expect(done).toBe(false);
    c.advance(500);
    await handle.finished;
    expect(done).toBe(true);
  });
});

describe('l’annulation d’une animation REJETTE sa promesse `finished`', () => {
  test('le lecteur l’absorbe : annuler en plein geste ne laisse aucun rejet non géré', async () => {
    const unhandled: unknown[] = [];
    const watch = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', watch);
    const rejecting: PlayableTarget = {
      animate: () => {
        let reject: (reason: unknown) => void = () => undefined;
        const finished = new Promise<unknown>((_, r) => void (reject = r));
        return { finished, cancel: () => reject(new Error('AbortError')) };
      },
      style: { willChange: '' },
    };
    const handle = playChoreography(rootOf({ '[data-game-shield]': [rejecting] }), 'rank', { reducedMotion: false, haptics: false, schedule: clock().schedule });
    handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', watch);
    expect(unhandled).toEqual([]);
  });
});

describe('repères et haptique', () => {
  test('la frappe : le repère « strike » et le choc arrivent AU moment du plan', () => {
    const c = clock();
    const beats: string[] = [];
    const buzz: HapticName[] = [];
    playChoreography(rootOf({}), 'mint', { reducedMotion: false, schedule: c.schedule, onBeat: (b) => beats.push(b.name), vibrate: (h) => buzz.push(h) });
    c.advance(639);
    expect(beats).toEqual([]);
    expect(buzz).toEqual([]);
    c.advance(1);
    expect(beats).toEqual(['strike']);
    expect(buzz).toEqual(['shock']);
  });

  test('haptics: false coupe les vibrations, pas les repères', () => {
    const c = clock();
    const beats: string[] = [];
    const buzz: HapticName[] = [];
    playChoreography(rootOf({}), 'mint', { reducedMotion: false, haptics: false, schedule: c.schedule, onBeat: (b) => beats.push(b.name), vibrate: (h) => buzz.push(h) });
    c.advance(5000);
    expect(beats).toEqual(['strike']);
    expect(buzz).toEqual([]);
  });

  test('le rang vibre trois fois, une par trait', () => {
    const c = clock();
    const buzz: HapticName[] = [];
    playChoreography(rootOf({}), 'rank', { reducedMotion: false, schedule: c.schedule, vibrate: (h) => buzz.push(h) });
    c.advance(5000);
    expect(buzz).toEqual(['tap', 'tap', 'tap']);
  });
});

describe('un geste dont la cible n’existe pas encore (late)', () => {
  test('l’empreinte du badge éteint est cherchée AU moment du geste, pas au départ du plan', () => {
    const c = clock();
    const imprint = target();
    const live: Record<string, PlayableTarget[]> = {};
    playChoreography(rootOf(live), 'badgeExtinguish', { reducedMotion: false, schedule: c.schedule, onBeat: () => void (live['[data-game-imprint]'] = [imprint]) });
    c.advance(449);
    expect(imprint.calls).toHaveLength(0);
    c.advance(1);
    expect(imprint.calls).toHaveLength(1);
    expect(imprint.calls[0]?.options.delay).toBe(0);
  });
});

describe('prefers-reduced-motion', () => {
  test('un fondu de la racine, et RIEN sur les cibles', () => {
    const shield = target();
    const self = target();
    const c = clock();
    const beats: string[] = [];
    playChoreography(rootOf({ '[data-game-shield]': [shield] }, self), 'rank', { reducedMotion: true, schedule: c.schedule, onBeat: (b) => beats.push(b.name), vibrate: () => undefined });
    expect(shield.calls).toHaveLength(0);
    expect(self.calls).toHaveLength(1);
    expect(self.calls[0]?.keyframes.map((k) => Object.keys(k))).toEqual([['opacity'], ['opacity']]);
    c.advance(5000);
    expect(beats).toEqual([]);
  });

  test('la tape unique part tout de suite', () => {
    const buzz: HapticName[] = [];
    playChoreography(rootOf({}), 'rank', { reducedMotion: true, schedule: clock().schedule, vibrate: (h) => buzz.push(h) });
    expect(buzz).toEqual(['tap']);
  });
});
