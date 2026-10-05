import { describe, expect, test } from 'bun:test';

import type { GameGl, RenderUniforms } from './engine';
import { startEffect, type EffectEnv } from './effect-runner';
import { DRIFT_PERIOD_MS, SHEEN_PASS_MS, SHOCKWAVE_MS, type Tilt } from './timeline';
import type { GameEffect } from './shaders';

type Render = { readonly effect: GameEffect; readonly uniforms: RenderUniforms };

const harness = (o: { readonly reduced?: boolean; readonly gl?: boolean; readonly sensor?: boolean } = {}) => {
  const renders: Render[] = [];
  const events = { clears: 0, disposed: 0, rafRequests: 0, rafCancels: 0, createGl: 0, unobserveVisibility: 0, unobserveOrientation: 0 };
  let queued: { readonly id: number; readonly run: (t: number) => void }[] = [];
  let nextId = 1;
  let visibilityListener: (visible: boolean) => void = () => undefined;
  let tiltListener: (tilt: Tilt) => void = () => undefined;
  const gl: GameGl = {
    programCount: 3,
    render: (effect, uniforms = {}) => void renders.push({ effect, uniforms }),
    clear: () => void (events.clears += 1),
    resize: () => undefined,
    dispose: () => void (events.disposed += 1),
  };
  const env: EffectEnv = {
    reducedMotion: o.reduced ?? false,
    createGl: () => {
      events.createGl += 1;
      return o.gl === false ? null : gl;
    },
    raf: (run) => {
      events.rafRequests += 1;
      const id = nextId++;
      queued.push({ id, run });
      return id;
    },
    cancelRaf: (id) => {
      events.rafCancels += 1;
      queued = queued.filter((q) => q.id !== id);
    },
    observeVisibility: (onChange) => {
      visibilityListener = onChange;
      return () => void (events.unobserveVisibility += 1);
    },
    observeOrientation:
      o.sensor === true
        ? (onTilt) => {
            tiltListener = onTilt;
            return () => void (events.unobserveOrientation += 1);
          }
        : () => null,
  };
  /** Joue la file d'images à l'instant `t` (une image par appel, comme le navigateur). */
  const frame = (t: number): void => {
    const batch = queued;
    queued = [];
    for (const job of batch) job.run(t);
  };
  /** Joue des images toutes les `step` ms jusqu'à `until`, ou jusqu'à ce que la boucle s'arrête. */
  const runUntil = (until: number, step = 50, from = 0): number => {
    let t = from;
    while (queued.length > 0 && t <= until) {
      frame(t);
      t += step;
    }
    return t;
  };
  return { env, renders, events, frame, runUntil, queued: () => queued.length, visible: (v: boolean) => visibilityListener(v), tilt: (t: Tilt) => tiltListener(t) };
};

const progresses = (renders: readonly Render[]): readonly number[] => renders.map((r) => r.uniforms.progress ?? 0);

describe('le choix du moteur — WebGL2, repli CSS, ou rien', () => {
  test('animations réduites : aucun moteur, aucun contexte créé, aucune image demandée', () => {
    const h = harness({ reduced: true });
    const effect = startEffect({ effect: 'sheen' }, h.env);
    expect(effect.backend).toBe('none');
    expect(h.events.createGl).toBe(0);
    expect(h.events.rafRequests).toBe(0);
    expect(() => (effect.replay(), effect.dispose())).not.toThrow();
  });

  test('sans WebGL2 : le repli CSS, sans boucle', () => {
    const h = harness({ gl: false });
    const effect = startEffect({ effect: 'sheen' }, h.env);
    expect(effect.backend).toBe('css');
    expect(h.events.rafRequests).toBe(0);
  });

  test('avec WebGL2 : le moteur', () => {
    expect(startEffect({ effect: 'sheen' }, harness().env).backend).toBe('webgl2');
  });
});

describe('le reflet — trois passages, puis il s’arrête', () => {
  test('la première image est au repos, puis le trait balaie', () => {
    const h = harness();
    startEffect({ effect: 'sheen' }, h.env);
    h.runUntil(SHEEN_PASS_MS, 100);
    const p = progresses(h.renders);
    expect(p[0]).toBe(0);
    expect(Math.max(...p)).toBeGreaterThan(0.9);
  });

  test('après le troisième passage : le canvas est effacé et plus aucune image n’est demandée', () => {
    const h = harness();
    startEffect({ effect: 'sheen' }, h.env);
    h.runUntil(SHEEN_PASS_MS * 4, 100);
    expect(h.events.clears).toBe(1);
    expect(h.queued()).toBe(0);
    const requests = h.events.rafRequests;
    h.frame(99999);
    expect(h.events.rafRequests).toBe(requests);
  });

  test('un trou dans les images (onglet endormi) n’avale pas les passages : le temps avance de 100 ms au plus', () => {
    const h = harness();
    startEffect({ effect: 'sheen' }, h.env);
    h.frame(0);
    h.frame(60_000);
    expect(h.events.clears).toBe(0);
    expect(h.queued()).toBe(1);
  });

  test('le masque circulaire est transmis au moteur', () => {
    const h = harness();
    startEffect({ effect: 'sheen', circle: true }, h.env);
    h.frame(0);
    expect(h.renders[0]?.uniforms.circle).toBe(true);
  });

  test('le nombre de passages se règle', () => {
    const h = harness();
    startEffect({ effect: 'sheen', passes: 1 }, h.env);
    h.runUntil(SHEEN_PASS_MS * 2, 100);
    expect(h.events.clears).toBe(1);
  });
});

describe('hors écran : plus rien ne tourne', () => {
  test('masqué, la boucle s’arrête ; revenu, elle reprend sans avoir consommé de passage', () => {
    const h = harness();
    startEffect({ effect: 'sheen' }, h.env);
    h.frame(0);
    h.visible(false);
    expect(h.queued()).toBe(0);
    expect(h.events.rafCancels).toBeGreaterThan(0);
    const rendered = h.renders.length;
    h.visible(true);
    expect(h.queued()).toBe(1);
    h.frame(500_000);
    expect(h.renders.length).toBeGreaterThan(rendered);
    expect(h.events.clears).toBe(0);
  });

  test('un effet terminé ne redémarre pas parce qu’il redevient visible', () => {
    const h = harness();
    startEffect({ effect: 'shockwave' }, h.env);
    h.runUntil(SHOCKWAVE_MS * 3, 100);
    h.visible(false);
    h.visible(true);
    expect(h.queued()).toBe(0);
  });
});

describe('replay', () => {
  test('relance l’effet depuis le début, même terminé', () => {
    const h = harness();
    const effect = startEffect({ effect: 'sheen', passes: 1 }, h.env);
    h.runUntil(SHEEN_PASS_MS * 2, 100);
    expect(h.queued()).toBe(0);
    effect.replay();
    expect(h.queued()).toBe(1);
    const before = h.renders.length;
    h.frame(1_000_000);
    expect(h.renders[before]?.uniforms.progress).toBe(0);
  });

  test('rejoué pendant qu’il tourne : une seule boucle, jamais deux', () => {
    const h = harness();
    const effect = startEffect({ effect: 'sheen' }, h.env);
    effect.replay();
    effect.replay();
    expect(h.queued()).toBe(1);
  });
});

describe('l’onde de frappe — une fois, 0,9 s', () => {
  test('progresse puis s’efface', () => {
    const h = harness();
    startEffect({ effect: 'shockwave', circle: true }, h.env);
    h.runUntil(SHOCKWAVE_MS * 2, 50);
    const p = progresses(h.renders);
    expect(p).toEqual([...p].sort((a, b) => a - b));
    expect(p.at(-1)).toBeGreaterThan(0.9);
    expect(h.events.clears).toBe(1);
    expect(h.queued()).toBe(0);
  });
});

describe('l’irisation du prisme', () => {
  test('avec un capteur : AUCUNE boucle, une image par inclinaison reçue', () => {
    const h = harness({ sensor: true });
    startEffect({ effect: 'iridescence', circle: true }, h.env);
    expect(h.queued()).toBe(0);
    expect(h.renders).toHaveLength(1);
    h.tilt([0.4, -0.2]);
    h.tilt([0.5, -0.3]);
    expect(h.queued()).toBe(1);
    h.frame(0);
    expect(h.renders.at(-1)?.uniforms.tilt).toEqual([0.5, -0.3]);
    expect(h.queued()).toBe(0);
  });

  test('masquée, l’inclinaison ne peint pas ; revenue, elle peint la dernière', () => {
    const h = harness({ sensor: true });
    startEffect({ effect: 'iridescence' }, h.env);
    h.visible(false);
    h.tilt([0.9, 0.9]);
    expect(h.queued()).toBe(0);
    h.visible(true);
    h.frame(0);
    expect(h.renders.at(-1)?.uniforms.tilt).toEqual([0.9, 0.9]);
  });

  test('sans capteur : une dérive lente de trois périodes, puis elle se pose au centre — sans effacer', () => {
    const h = harness({ sensor: false });
    startEffect({ effect: 'iridescence' }, h.env);
    h.runUntil(DRIFT_PERIOD_MS * 4, 100);
    expect(h.renders.at(-1)?.uniforms.tilt).toEqual([0, 0]);
    expect(h.events.clears).toBe(0);
    expect(h.queued()).toBe(0);
  });
});

describe('dispose — nettoyé au démontage', () => {
  test('annule la boucle, se désabonne de tout et libère le contexte, une seule fois', () => {
    const h = harness({ sensor: true });
    const effect = startEffect({ effect: 'iridescence' }, h.env);
    h.tilt([0.1, 0.1]);
    effect.dispose();
    effect.dispose();
    expect(h.queued()).toBe(0);
    expect(h.events.unobserveVisibility).toBe(1);
    expect(h.events.unobserveOrientation).toBe(1);
    expect(h.events.disposed).toBe(1);
  });

  test('après dispose, ni replay, ni visibilité, ni inclinaison ne relancent quoi que ce soit', () => {
    const h = harness({ sensor: true });
    const effect = startEffect({ effect: 'iridescence' }, h.env);
    effect.dispose();
    const requests = h.events.rafRequests;
    effect.replay();
    h.visible(true);
    h.tilt([1, 1]);
    expect(h.events.rafRequests).toBe(requests);
  });
});
