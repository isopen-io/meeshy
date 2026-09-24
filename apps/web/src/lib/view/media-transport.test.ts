import { describe, expect, test } from 'bun:test';

import {
  PLAYBACK_SPEEDS,
  SEEK_STEP_SECONDS,
  attachmentDurationLabel,
  formatMediaTime,
  keyboardSeekTarget,
  lateralSeek,
  lateralSeekWidth,
  lateralSeekZone,
  seekFraction,
  speedLabel,
} from './media-transport';

/**
 * LA LOI DE LA BARRE DE LECTURE (#6359) — miroir de `formatMediaDuration`
 * (`MediaTypes.swift:596`), `VideoTransportControls.speeds` et
 * `MediaStageSeek.step` (SDK). Pure : aucun élément média, aucun DOM.
 */
describe('formatMediaTime — m:ss, comme formatMediaDuration côté iOS', () => {
  const cases: readonly (readonly [number, string])[] = [
    [0, '0:00'],
    [7, '0:07'],
    [65.9, '1:05'],
    [600, '10:00'],
    [3725, '62:05'],
  ];
  for (const [seconds, label] of cases) {
    test(`${seconds} s ⇒ ${label}`, () => {
      expect(formatMediaTime(seconds)).toBe(label);
    });
  }

  test('une durée inconnue (NaN, Infinity, négative) ne ment pas : 0:00', () => {
    expect(formatMediaTime(Number.NaN)).toBe('0:00');
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatMediaTime(-3)).toBe('0:00');
  });
});

describe('attachmentDurationLabel — la durée de la PIÈCE, lisible avant la première image', () => {
  test('12 000 ms ⇒ « 0:12 »', () => {
    expect(attachmentDurationLabel(12_000)).toBe('0:12');
  });

  test('une durée absente ou nulle ⇒ aucun libellé (un « 0:00 » faux se croit)', () => {
    expect(attachmentDurationLabel(undefined)).toBeNull();
    expect(attachmentDurationLabel(0)).toBeNull();
  });
});

describe('speedLabel — la vitesse dans la langue de l’interface', () => {
  test('les paliers sont ceux d’iOS : 1×, 1,25×, 1,5×, 1,75×, 2×', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([1, 1.25, 1.5, 1.75, 2]);
  });

  test('le séparateur décimal suit la langue', () => {
    expect(speedLabel(1.25, 'fr')).toBe('1,25×');
    expect(speedLabel(1.25, 'en')).toBe('1.25×');
    expect(speedLabel(2, 'fr')).toBe('2×');
  });
});

describe('seekFraction — la position visée par le doigt sur la piste', () => {
  test('le milieu de la piste vise la moitié', () => {
    expect(seekFraction({ clientX: 150, left: 100, width: 100 })).toBe(0.5);
  });

  test('hors de la piste, la fraction reste bornée à [0, 1]', () => {
    expect(seekFraction({ clientX: 40, left: 100, width: 100 })).toBe(0);
    expect(seekFraction({ clientX: 260, left: 100, width: 100 })).toBe(1);
  });

  test('une piste sans largeur (pas encore mise en page) vise le début', () => {
    expect(seekFraction({ clientX: 150, left: 100, width: 0 })).toBe(0);
  });
});

describe('keyboardSeekTarget — le curseur au clavier, pas de 10 s comme MediaStageSeek', () => {
  test('le pas est celui du double tap latéral iOS', () => {
    expect(SEEK_STEP_SECONDS).toBe(10);
  });

  test('flèche droite ou haut avance de 10 s, gauche ou bas recule de 10 s', () => {
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 20, duration: 60 })).toBe(30);
    expect(keyboardSeekTarget({ key: 'ArrowUp', position: 20, duration: 60 })).toBe(30);
    expect(keyboardSeekTarget({ key: 'ArrowLeft', position: 20, duration: 60 })).toBe(10);
    expect(keyboardSeekTarget({ key: 'ArrowDown', position: 20, duration: 60 })).toBe(10);
  });

  test('Début et Fin vont aux bornes', () => {
    expect(keyboardSeekTarget({ key: 'Home', position: 20, duration: 60 })).toBe(0);
    expect(keyboardSeekTarget({ key: 'End', position: 20, duration: 60 })).toBe(60);
  });

  test('le saut est borné : à 3 s du début, reculer ramène à 0, jamais en dessous', () => {
    expect(keyboardSeekTarget({ key: 'ArrowLeft', position: 3, duration: 60 })).toBe(0);
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 55, duration: 60 })).toBe(60);
  });

  test('une autre touche, ou une durée inconnue, ne décide rien', () => {
    expect(keyboardSeekTarget({ key: 'Enter', position: 20, duration: 60 })).toBeNull();
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 20, duration: Number.NaN })).toBeNull();
  });
});

/**
 * `lateralSeek` — miroir de `MediaStageSeek.resolve` (SDK, #6163) : le double
 * tap latéral ±10 s d'iOS, porté au web (#6369). Mêmes témoins que
 * `MediaStageSeekTests.swift`, bornes comprises.
 */
describe('lateralSeekZone — les trois tiers, bornes latérales', () => {
  const width = 366;

  test('le tiers gauche recule, le tiers droit avance', () => {
    expect(lateralSeekZone(40, width)).toBe('backward');
    expect(lateralSeekZone(width - 40, width)).toBe('forward');
  });

  test('le centre ne réclame rien', () => {
    expect(lateralSeekZone(width / 2, width)).toBe('center');
    expect(lateralSeekZone(width / 3 + 1, width)).toBe('center');
    expect(lateralSeekZone(width * 2 / 3 - 1, width)).toBe('center');
  });

  test('les bornes des tiers appartiennent aux zones latérales : un doigt posé exactement sur la frontière a visé le bord', () => {
    expect(lateralSeekZone(0, width)).toBe('backward');
    expect(lateralSeekZone(width - 1, width)).toBe('forward');
    expect(lateralSeekZone((width * 2) / 3, width)).toBe('forward');
  });

  test('une scène de largeur nulle n’a pas de tiers', () => {
    expect(lateralSeekZone(0, 0)).toBe('center');
  });

  test('l’armement (lateralSeekZone) et la mise en page partagent la MÊME arithmétique du tiers, pour toute largeur', () => {
    for (const w of [366, 390, 200, 1024]) {
      const lateral = lateralSeekWidth(w);
      expect(lateralSeekZone(lateral - 0.5, w)).toBe('backward');
      expect(lateralSeekZone(lateral + 0.5, w)).toBe('center');
      expect(lateralSeekZone(w - lateral, w)).toBe('forward');
      expect(lateralSeekZone(w - lateral - 0.5, w)).toBe('center');
    }
  });
});

describe('lateralSeek — le saut latéral, borné aux extrémités', () => {
  const width = 366;
  const jump = (x: number, position = 60, duration = 180) => lateralSeek({ x, width, position, duration });

  test('le tiers gauche recule de 10 s', () => {
    const recul = jump(40);
    expect(recul?.zone).toBe('backward');
    expect(recul?.to).toBe(50);
    expect(recul?.seconds).toBe(-10);
  });

  test('le tiers droit avance de 10 s', () => {
    const avance = jump(width - 40);
    expect(avance?.zone).toBe('forward');
    expect(avance?.to).toBe(70);
    expect(avance?.seconds).toBe(10);
  });

  test('le centre ne rend rien — c’est ce qui laisse le tap simple immédiat', () => {
    expect(jump(width / 2)).toBeNull();
  });

  test('un média SANS durée ne réclame aucune zone — aucune collision avec le double tap de zoom d’une image', () => {
    for (const x of [0, width / 2, width - 1]) {
      expect(lateralSeek({ x, width, position: 0, duration: 0 })).toBeNull();
    }
  });

  test('une durée non finie n’arme rien', () => {
    expect(lateralSeek({ x: 10, width, position: 5, duration: Number.POSITIVE_INFINITY })).toBeNull();
  });

  test('reculer avant zéro donne zéro — le saut réellement parcouru, pas les dix demandés', () => {
    const recul = jump(10, 4);
    expect(recul?.to).toBe(0);
    expect(recul?.seconds).toBe(-4);
  });

  test('avancer après la fin s’arrête à la fin', () => {
    expect(jump(width - 10, 175, 180)?.to).toBe(180);
  });

  test('un saut borné à zéro reste un saut, pas un null : le geste s’est appliqué, il n’a nulle part où aller', () => {
    const butee = jump(10, 0);
    expect(butee).not.toBeNull();
    expect(butee?.seconds).toBe(0);
    expect(butee?.zone).toBe('backward');
  });

  test('une position hors piste est ramenée dedans avant le saut', () => {
    expect(jump(10, 500, 180)?.to).toBe(170);
    expect(jump(10, Number.NaN, 180)?.to).toBe(0);
  });

  test('le pas est configurable, par défaut celui du clavier (10 s)', () => {
    expect(lateralSeek({ x: 40, width, position: 60, duration: 180, step: 3 })?.to).toBe(57);
  });
});
