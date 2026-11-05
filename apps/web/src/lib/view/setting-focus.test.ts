import { describe, expect, test } from 'bun:test';

import { SETTING_FOCUS_PARAM, focusSettingWhenReady, settingFocusPath, settingRequestedIn, type SettingFocusTarget } from './setting-focus';

/**
 * #16339 — UNE INVITE DE RÉGLAGE MÈNE AU RÉGLAGE ET LE MET EN ÉVIDENCE : l'adresse
 * le nomme, l'écran l'attend, défile jusqu'à lui, le met en surbrillance puis
 * l'éteint.
 */
type Journal = string[];

const target = (journal: Journal): SettingFocusTarget => ({
  reveal: () => journal.push('reveal'),
  focus: () => journal.push('focus'),
  highlight: (on) => journal.push(on ? 'highlight:on' : 'highlight:off'),
});

function clock() {
  let now = 0;
  const queue: { at: number; run: () => void }[] = [];
  return {
    now: () => now,
    schedule: (run: () => void, delayMs: number) => void queue.push({ at: now + delayMs, run }),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const next = queue[0];
        if (next === undefined || next.at > end) break;
        queue.shift();
        now = next.at;
        next.run();
      }
      now = end;
    },
  };
}

describe('setting-focus (#16339)', () => {
  test('l’adresse d’une invite nomme le réglage à mettre en évidence', () => {
    expect(settingFocusPath('deviceTranslation')).toBe(`/settings?${SETTING_FOCUS_PARAM}=deviceTranslation`);
    expect(settingRequestedIn(`?${SETTING_FOCUS_PARAM}=deviceTranslation`)).toBe('deviceTranslation');
    expect(settingRequestedIn('?volet=packs')).toBeNull();
  });

  test('l’écran attend la rangée, y défile, lui donne le focus et l’allume, puis l’éteint', () => {
    const journal: Journal = [];
    const time = clock();
    let attempts = 0;
    focusSettingWhenReady({ find: () => (++attempts < 3 ? null : target(journal)), schedule: time.schedule, now: time.now });
    expect(journal).toEqual([]);
    time.advance(200);
    expect(journal).toEqual(['reveal', 'focus', 'highlight:on']);
    time.advance(5000);
    expect(journal).toEqual(['reveal', 'focus', 'highlight:on', 'highlight:off']);
  });

  test('une rangée qui ne vient jamais (réglage absent pour ce compte) : l’attente est bornée, rien ne s’allume', () => {
    const journal: Journal = [];
    const time = clock();
    let attempts = 0;
    focusSettingWhenReady({ find: () => (++attempts, null), schedule: time.schedule, now: time.now });
    time.advance(60_000);
    expect(journal).toEqual([]);
    expect(attempts).toBeLessThan(200);
  });
});
